// ============================================
// LA MAISONNÉE — Synchronisation famille (Supabase)
// ============================================
// Chaque appareil ouvre une session ANONYME Supabase (aucun email) et rejoint une famille
// (table households) avec un code d'invitation. Les données de la famille sont des documents JSON
// rangés dans UNE table household_data (household_id, kind, id, data, deleted_at, updated_at),
// protégée par RLS : seuls les appareils membres de la famille peuvent la lire ou l'écrire.
// Schéma SQL : supabase/schema.sql — procédure : SYNC-GUIDE.md.
//
// Moteur :
// - Outbox persistée : toute modification locale appelle markDirty(kind, id). Une entrée ne sort
//   de l'outbox qu'une fois son push réussi (et si elle n'a pas été re-modifiée entre-temps).
// - Push : upsert groupé (le serveur date chaque ligne avec son horloge : updated_at).
// - Pull incrémental : lignes dont updated_at ≥ curseur − marge, paginées par (updated_at, kind, id).
//   Une modification locale en attente n'est jamais écrasée par le serveur : elle gagnera au push.
//   Une ligne déjà connue (notre propre écriture renvoyée par le serveur) n'est pas ré-appliquée, et
//   une ligne appliquée met à jour l'objet local EN PLACE (le code qui garde une référence au document
//   à travers un await continue d'écrire dans le document vivant).
// - Déclencheurs : démarrage, retour au premier plan, connexion retrouvée, toutes les 60 s quand
//   l'app est visible, et 0,8 s après chaque modification. Une seule sync à la fois.
//
// Script classique chargé après app.js et calendar.js.

const SYNC_KEYS = {
  session: 'mr_sync_session',          // obfusqué : { access_token, refresh_token, expires_at, user_id }
  household: 'mr_sync_household',      // { id, name, role, memberId, inviteCode, inviteExpiresAt }
  outbox: 'mr_sync_outbox',            // { 'kind:id': n° de séquence }
  cursor: 'mr_sync_cursor',            // dernier updated_at serveur vu (format serveur)
  joinMerge: 'mr_sync_join_merge',     // '1' tant que la fusion initiale (appareil qui rejoint) n'est pas faite
  legacyImported: 'mr_sync_legacy_imported', // code foyer déjà importé depuis l'ancienne sync
  legacyPending: 'mr_sync_legacy_pending',   // '1' : import de l'ancienne sync à (re)faire (création interrompue)
  memberPending: 'mr_sync_member_pending',   // '1' : « C'est moi » pas encore enregistré côté serveur
  kinds: 'mr_sync_kinds',              // types de documents connus au dernier pull (rattrapage après mise à jour)
  rejected: 'mr_sync_rejected',        // { 'kind:id': { at, message } } : documents refusés par le serveur
  outboxAt: 'mr_sync_outbox_at'        // date de la dernière écriture de l'outbox (activité d'une autre instance)
};

const SYNC_PULL_PAGE = 25;          // lignes par page (les recettes peuvent contenir une photo)
const SYNC_PULL_MARGIN_MS = 15000;  // marge de relecture : couvre les écritures validées en retard
const SYNC_PUSH_MAX_ROWS = 50;
const SYNC_PUSH_MAX_BYTES = 900000; // ~0,9 Mo par requête
const SYNC_TIMEOUT_MS = 45000;      // corps de la réponse compris (une page de photos sur un réseau lent)
const SYNC_REFRESH_TIMEOUT_MS = 6000; // court : un 2e essai doit rester dans la fenêtre de réutilisation (10 s)
const SYNC_PERIOD_MS = 60000;
// Adoption des entrées d'une autre instance : seulement après ce délai sans écriture de l'outbox
// (plus long qu'une requête d'envoi : une instance en plein envoi n'écrit l'outbox qu'à la fin)
const SYNC_ADOPT_IDLE_MS = SYNC_TIMEOUT_MS + 5000;

class SyncError extends Error {
  // kind : 'offline' | 'timeout' | 'auth' | 'forbidden' | 'server' | 'client' | 'config'
  //      | 'storage' (mémoire du téléphone pleine) | 'aborted' (famille changée pendant la sync)
  constructor(kind, message, status, code) {
    super(message);
    this.kind = kind;
    this.status = status || 0;
    this.code = code || '';
  }
}

// ============================================
// Collections synchronisées (une entrée par kind)
// ============================================
// get(id) → document local ou undefined (supprimé) ; put(doc) / remove(id) → true si changement ;
// save() → persistance locale (false si la mémoire est pleine) ; time(doc) → horodatage local (ms)
// pour la fusion initiale ; merge(local, remote) → document fusionné ou null (fusion initiale seulement).
// put met à jour l'objet existant sans en changer (syncPutInPlace) : une fiche ouverte ou une saisie
// en cours à travers un await garde une référence valide.

// Remplace le contenu d'un document local par celui reçu, en gardant le même objet
function _syncReplaceInPlace(target, doc) {
  for (const k of Object.keys(target)) if (!(k in doc)) delete target[k];
  return Object.assign(target, doc);
}

// Insère ou met à jour (en place) un document dans un tableau d'état
function syncPutInPlace(arr, doc) {
  const cur = arr.find(x => x.id === doc.id);
  if (cur) _syncReplaceInPlace(cur, doc); else arr.push(doc);
  return true;
}

const SYNC_COLLECTIONS = {
  recipes: {
    list: () => state.recipes,
    get: id => state.recipes.find(r => r.id === id),
    put: doc => {
      if (!doc || typeof doc !== 'object' || !doc.id || typeof doc.title !== 'string' || !doc.title.trim()) return false;
      if (!Array.isArray(doc.ingredients)) doc.ingredients = [];
      if (!Array.isArray(doc.steps)) doc.steps = [];
      return syncPutInPlace(state.recipes, doc);
    },
    remove: id => {
      const before = state.recipes.length;
      state.recipes = state.recipes.filter(r => r.id !== id);
      return state.recipes.length !== before;
    },
    save: () => saveRecipes(),
    time: doc => doc.updatedAt || doc.createdAt || 0
  },
  shopping_lists: {
    list: () => state.shoppingLists,
    get: id => state.shoppingLists.find(l => l.id === id),
    put: doc => {
      if (!doc || typeof doc !== 'object' || !doc.id) return false;
      const list = {
        ...doc,
        name: doc.name || 'Ma liste',
        items: Array.isArray(doc.items) ? doc.items : [],
        checked: Array.isArray(doc.checked) ? doc.checked : []
      };
      delete list.deletedAt;
      return syncPutInPlace(state.shoppingLists, list);
    },
    remove: id => {
      if (state.shoppingLists.length <= 1 && state.shoppingLists[0] && state.shoppingLists[0].id === id) {
        // Toujours garder une liste : on la vide plutôt que de la supprimer
        Object.assign(state.shoppingLists[0], { items: [], checked: [] });
        return true;
      }
      const before = state.shoppingLists.length;
      state.shoppingLists = state.shoppingLists.filter(l => l.id !== id);
      return state.shoppingLists.length !== before;
    },
    save: () => {
      _syncRealignActiveShoppingList();
      return saveShoppingLists();
    },
    time: doc => doc.updatedAt || doc.createdAt || 0,
    // Même liste sur deux appareils (ex. la liste 'default' historique) : on réunit tout
    merge: (local, remote) => {
      const items = [...(local.items || [])];
      for (const it of remote.items || []) {
        if (it && !items.some(x => x.recipeId === it.recipeId)) items.push(it);
      }
      const checked = [...new Set([...(local.checked || []), ...(remote.checked || [])])];
      return { ...remote, ...local, items, checked, updatedAt: Date.now() };
    }
  },
  events: {
    list: () => Object.values(state.events),
    get: id => state.events[id],
    put: doc => {
      if (!doc || typeof doc !== 'object' || !doc.id) return false;
      if (state.events[doc.id]) _syncReplaceInPlace(state.events[doc.id], doc);
      else state.events[doc.id] = doc;
      return true;
    },
    remove: id => {
      if (!state.events[id]) return false;
      delete state.events[id];
      return true;
    },
    save: () => saveEventsNow(),
    time: doc => doc.updatedAt || doc.createdAt || 0,
    // Même repas planifié sur deux appareils : on réunit les recettes du créneau
    merge: (local, remote) => {
      if (local.type !== 'meal' || remote.type !== 'meal') return null;
      const recipes = [...(local.recipes || [])];
      for (const r of remote.recipes || []) {
        if (r && r.id && !recipes.some(x => x.id === r.id)) recipes.push(r);
      }
      return { ...remote, ...local, recipes, updatedAt: Date.now() };
    }
  },
  members: {
    list: () => state.members,
    get: id => state.members.find(m => m.id === id),
    put: doc => {
      if (!doc || typeof doc !== 'object' || !doc.id || !doc.name) return false;
      return syncPutInPlace(state.members, doc);
    },
    remove: id => {
      const before = state.members.length;
      state.members = state.members.filter(m => m.id !== id);
      return state.members.length !== before;
    },
    save: () => saveMembers(),
    time: doc => doc.updatedAt || 0
  }
};

// La liste de courses active et ses cases cochées (state.shopping / state.shoppingChecked)
// doivent suivre les listes après une modification venue d'un autre appareil.
function _syncRealignActiveShoppingList() {
  if (!state.shoppingLists.length) {
    state.shoppingLists.push({ id: uid(), name: 'Ma liste', items: [], checked: [], createdAt: Date.now(), updatedAt: Date.now() });
  }
  if (!state.shoppingLists.find(l => l.id === state.activeShoppingListId)) {
    state.activeShoppingListId = state.shoppingLists[0].id;
  }
  const active = getActiveShoppingList();
  if (active) {
    state.shopping = active.items;
    state.shoppingChecked = new Set(active.checked || []);
  }
  // Un appareil pas encore à jour peut renvoyer des cases cochées à l'ancien format
  if (typeof migrateShoppingCheckedKeys === 'function') {
    try { migrateShoppingCheckedKeys(); } catch (e) { console.warn('Migration des cases cochées ignorée :', e); }
  }
}

// ============================================
// État persistant de la sync
// ============================================

let _syncSession = null;   // { access_token, refresh_token, expires_at (s), user_id }
let _syncOutbox = {};
let _syncOutboxSeq = 0;
let _syncKnown = {};       // { 'kind:id': updated_at } : versions serveur déjà reflétées localement
let _syncEpoch = 0;        // change à chaque remise à zéro / changement de famille : une sync en cours s'arrête
let _syncRejected = {};    // documents refusés par le serveur (voir _parkRejected)
let _syncSuspended = '';   // 'storage' : syncs automatiques suspendues jusqu'à une sync manuelle
let _syncFreshHousehold = false; // famille tout juste créée sur cet appareil (voir _runSyncCycle)
let _syncLastImport = null;      // résultat du dernier import de l'ancienne sync « code foyer »
let _syncLastPushed = 0;         // nombre de documents envoyés par le dernier cycle
// Entrées de l'outbox écrites par CETTE instance de l'app (ou présentes à son démarrage), avec la
// séquence écrite : clé → séquence. Une entrée réécrite ensuite par une autre instance (onglet + app
// installée) porte une autre séquence : c'est l'autre instance qui l'envoie, avec SES données (sinon une
// version ancienne gagnerait, ou un document absent d'ici partirait comme une suppression).
const _syncOwnSeq = new Map();
let _syncOwnInit = false;

function _readStoredSession() {
  try {
    const raw = getSecret(SYNC_KEYS.session);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

function _readStoredOutbox() {
  try { return JSON.parse(localStorage.getItem(SYNC_KEYS.outbox) || '{}') || {}; } catch (e) { return {}; }
}

// Outbox relue depuis le stockage : une autre instance de l'app (onglet Chrome + app installée)
// peut l'avoir modifiée. Les numéros de séquence restent croissants d'une instance à l'autre.
function _syncReloadOutbox() {
  _syncOutbox = _readStoredOutbox();
  _syncOutboxSeq = Math.max(_syncOutboxSeq, 0, ...Object.values(_syncOutbox).map(Number).filter(Number.isFinite));
}

function _bumpSyncEpoch() {
  _syncEpoch++;
  _syncKnown = {};
  _syncSuspended = ''; // données effacées ou autre famille : la mémoire pleine n'est plus d'actualité
}

function _syncAbortIfStale(epoch) {
  if (epoch !== _syncEpoch) throw new SyncError('aborted', 'Synchronisation interrompue (famille modifiée)');
}

function loadSyncState() {
  _syncSession = _readStoredSession();
  let hh = null;
  try { hh = JSON.parse(localStorage.getItem(SYNC_KEYS.household) || 'null'); } catch (e) { hh = null; }
  Object.assign(state.sync, {
    householdId: (hh && hh.id) || '',
    householdName: (hh && hh.name) || '',
    role: (hh && hh.role) || '',
    memberId: (hh && hh.memberId) || '',
    inviteCode: (hh && hh.inviteCode) || '',
    inviteExpiresAt: (hh && hh.inviteExpiresAt) || '',
    householdTz: (hh && hh.tz) || '',
    deviceMemberIds: (hh && Array.isArray(hh.deviceMemberIds)) ? hh.deviceMemberIds : [],
    userId: (_syncSession && _syncSession.user_id) || '',
    cursor: localStorage.getItem(SYNC_KEYS.cursor) || ''
  });
  _syncReloadOutbox();
  if (!_syncOwnInit) { // démarrage : les entrées en attente seront adoptées (voir _syncAdoptOutbox)
    _syncOwnInit = true;
    _syncLastOutboxEventAt = Number(localStorage.getItem(SYNC_KEYS.outboxAt)) || 0;
    setTimeout(_syncAdoptOutbox, 2000);
  }
  try { _syncRejected = JSON.parse(localStorage.getItem(SYNC_KEYS.rejected) || '{}') || {}; } catch (e) { _syncRejected = {}; }
  state.sync.enabled = syncEnabled();
}

function _saveHousehold() {
  const s = state.sync;
  if (!s.householdId) {
    localStorage.removeItem(SYNC_KEYS.household);
  } else {
    localStorage.setItem(SYNC_KEYS.household, JSON.stringify({
      id: s.householdId, name: s.householdName, role: s.role, memberId: s.memberId,
      inviteCode: s.inviteCode, inviteExpiresAt: s.inviteExpiresAt, tz: s.householdTz || '',
      deviceMemberIds: s.deviceMemberIds || []
    }));
  }
  state.sync.enabled = syncEnabled();
}

function _saveOutbox() {
  try {
    localStorage.setItem(SYNC_KEYS.outbox, JSON.stringify(_syncOutbox));
    localStorage.setItem(SYNC_KEYS.outboxAt, String(Date.now()));
  } catch (e) { console.warn('Outbox non sauvegardée', e); }
}

function _saveRejected() {
  try { localStorage.setItem(SYNC_KEYS.rejected, JSON.stringify(_syncRejected)); } catch (e) { /* non bloquant */ }
}

function _setCursor(value) {
  state.sync.cursor = value || '';
  try {
    if (value) localStorage.setItem(SYNC_KEYS.cursor, value);
    else localStorage.removeItem(SYNC_KEYS.cursor);
  } catch (e) {
    throw new SyncError('storage', 'Mémoire du téléphone pleine');
  }
}

// Famille configurée sur cet appareil (projet Supabase + foyer rejoint)
function syncEnabled() {
  return !!(state.sync.url && state.sync.key && state.sync.householdId);
}

function syncPendingCount() {
  return Object.keys(_syncOutbox).length;
}

function syncRejectedCount() {
  return Object.keys(_syncRejected).length;
}

// À appeler après TOUTE modification locale d'un document synchronisé (y compris une suppression)
function markDirty(kind, id) {
  if (!id || !SYNC_COLLECTIONS[kind] || !state.sync.householdId) return;
  _syncReloadOutbox();
  _syncTakeEntry(kind + ':' + id);
  _saveOutbox();
  _scheduleSync(800);
}

// Nouvelle entrée de l'outbox, écrite par cette instance (l'appelant enregistre l'outbox)
function _syncTakeEntry(key) {
  _syncOutbox[key] = ++_syncOutboxSeq;
  _syncOwnSeq.set(key, _syncOutboxSeq);
}

// Démarrage : les entrées en attente (laissées par une vie précédente de l'app, ou par une autre instance
// fermée depuis) sont adoptées, puis envoyées. On attend que l'outbox n'ait plus été écrite depuis
// SYNC_ADOPT_IDLE_MS : l'autre instance éventuelle a alors enregistré ses données, relues ici, et notre
// copie de chaque document en attente est la sienne (deux instances ne « possèdent » jamais la même
// séquence avec des contenus différents).
let _syncLastOutboxEventAt = 0; // dernière écriture de l'outbox par une autre instance (ou avant le démarrage)
function _syncAdoptOutbox() {
  if (Date.now() - _syncLastOutboxEventAt < SYNC_ADOPT_IDLE_MS) {
    setTimeout(_syncAdoptOutbox, 5000);
    return;
  }
  _syncReloadOutbox();
  let adopted = false;
  for (const [k, seq] of Object.entries(_syncOutbox)) {
    if (_syncOwnSeq.get(k) !== seq) {
      _syncOwnSeq.set(k, seq);
      adopted = true;
    }
  }
  if (adopted) _scheduleSync(300);
}

// Entrées d'une autre instance restées inchangées 60 s alors qu'elle n'écrit plus (instance fermée ou
// gelée) : adoptées et envoyées d'ici. Notre copie de ces documents est d'abord relue : c'est celle que
// l'autre instance a enregistrée. Si elle vit encore, les deux instances possèdent la même séquence
// avec le même contenu, et le premier envoi réussi retire l'entrée.
const _syncForeignSeen = new Map(); // clé → { seq, at } (première fois vue avec cette séquence)
function _syncAdoptAbandoned() {
  if (Date.now() - _syncLastOutboxEventAt < SYNC_ADOPT_IDLE_MS) return; // l'autre instance est active
  const now = Date.now(), ripe = [];
  for (const [k, seq] of Object.entries(_syncOutbox)) {
    if (_syncOwnSeq.get(k) === seq) {
      _syncForeignSeen.delete(k);
      continue;
    }
    const seen = _syncForeignSeen.get(k);
    if (!seen || seen.seq !== seq) _syncForeignSeen.set(k, { seq, at: now });
    else if (now - Math.max(seen.at, _syncLastOutboxEventAt) >= 60000) ripe.push([k, seq]);
  }
  for (const k of [..._syncForeignSeen.keys()]) if (!(k in _syncOutbox)) _syncForeignSeen.delete(k);
  if (!ripe.length) return;
  _syncSoftReload(null, new Set(ripe.map(([k]) => k.slice(0, k.indexOf(':')))));
  for (const [k, seq] of ripe) {
    if (_syncOutbox[k] === seq) _syncOwnSeq.set(k, seq);
    _syncForeignSeen.delete(k);
  }
}

// Libellés lisibles des documents refusés par le serveur (vue Famille)
function syncRejectedLabels(max) {
  return Object.keys(_syncRejected).slice(0, max || 3).map(key => {
    const sep = key.indexOf(':');
    const kind = key.slice(0, sep), id = key.slice(sep + 1);
    const coll = SYNC_COLLECTIONS[kind];
    const doc = coll && coll.get(id);
    return (doc && (doc.title || doc.name || doc.label)) || kind;
  });
}

// « Tout supprimer » sur cet appareil : on oublie les envois en attente et le prochain pull
// re-télécharge toutes les données de la famille (rien n'est supprimé côté famille).
// Une sync en cours s'arrête à sa prochaine étape, sans rien envoyer ni avancer le curseur.
function resetSyncData() {
  _bumpSyncEpoch();
  _syncOutbox = {};
  _syncOwnSeq.clear();
  _syncForeignSeen.clear();
  _saveOutbox();
  _syncRejected = {};
  _saveRejected();
  _setCursor('');
  if (_syncRunning) _syncQueued = true;
}

// Document jamais modifié (ex. catégorie de budget par défaut) : inutile de le pousser
function _isPristine(coll, doc) {
  return !!(coll.isPristine && coll.isPristine(doc));
}

// Tous les documents locaux à (re)pousser : création de la famille, fusion initiale, import
function _markAllDirty() {
  _syncReloadOutbox();
  for (const [kind, coll] of Object.entries(SYNC_COLLECTIONS)) {
    for (const doc of coll.list()) {
      if (doc && doc.id && !_isPristine(coll, doc)) _syncTakeEntry(kind + ':' + doc.id);
    }
  }
  _saveOutbox();
}

// ============================================
// Statut affiché (icône du header)
// ============================================

function setSyncStatus(status, message) {
  state.sync.status = status;
  state.sync.statusMessage = message || '';
  updateSyncIndicator();
  if (typeof onSyncStatusChange === 'function') onSyncStatusChange(status);
}

function updateSyncIndicator() {
  const indicator = document.getElementById('sync-indicator');
  if (!indicator) return;
  if (!syncEnabled()) {
    indicator.classList.add('hidden');
    return;
  }
  indicator.classList.remove('hidden');
  const status = state.sync.status || 'idle';
  // 'auth' (appareil à reconnecter) partage l'icône d'erreur
  indicator.className = 'sync-indicator sync-' + (status === 'auth' ? 'error' : status);
  const messages = {
    idle: 'Synchronisé avec la famille — toucher pour synchroniser',
    syncing: 'Synchronisation…',
    synced: 'Synchronisé ✓',
    error: 'Erreur de synchronisation — toucher pour réessayer',
    offline: 'Hors ligne — les modifications partiront au retour du réseau',
    auth: 'Cet appareil doit rejoindre à nouveau la famille'
  };
  indicator.title = state.sync.statusMessage || messages[status] || '';
  indicator.setAttribute('aria-label', indicator.title);
}

// ============================================
// HTTP : auth anonyme + PostgREST
// ============================================

// Requête avec délai maximal, lecture du corps comprise : un flux bloqué ne doit pas figer la sync.
// → { ok, status, json } (json : objet, texte brut ou null)
async function _syncFetch(url, options, timeoutMs) {
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs || SYNC_TIMEOUT_MS) : null;
  try {
    const res = await fetch(url, { ...options, signal: ctrl ? ctrl.signal : undefined });
    const text = await res.text();
    let json = null;
    if (text) {
      try { json = JSON.parse(text); } catch (e) { json = text; }
    }
    return { ok: res.ok, status: res.status, json };
  } catch (e) {
    if (e && e.name === 'AbortError') throw new SyncError('timeout', 'Le serveur ne répond pas');
    throw new SyncError('offline', 'Réseau indisponible');
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function _errorMessage(json, status) {
  if (json && typeof json === 'object') {
    return json.message || json.msg || json.error_description || json.error || ('HTTP ' + status);
  }
  return typeof json === 'string' && json ? json.slice(0, 200) : 'HTTP ' + status;
}

async function _authPost(path, body, timeoutMs) {
  if (!state.sync.url || !state.sync.key) throw new SyncError('config', 'Projet Supabase non configuré');
  const res = await _syncFetch(state.sync.url + '/auth/v1/' + path, {
    method: 'POST',
    headers: { apikey: state.sync.key, 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {})
  }, timeoutMs);
  const json = res.json;
  if (!res.ok) {
    const message = _errorMessage(json, res.status);
    const code = json && typeof json === 'object' ? (json.error_code || json.error || '') : '';
    const kind = res.status >= 500 || res.status === 429 ? 'server'
      // Clé publique refusée : c'est la configuration qui est en cause, pas la session de l'appareil
      : /api ?key/i.test(message) ? 'config'
        : 'auth';
    throw new SyncError(kind, message, res.status, code);
  }
  return json;
}

function _storeSession(s) {
  // Réponse inattendue (proxy, page d'erreur…) : passagère, la session actuelle est gardée
  if (!s || !s.access_token || !s.refresh_token) throw new SyncError('server', 'Réponse de connexion inattendue du serveur');
  _syncSession = {
    access_token: s.access_token,
    refresh_token: s.refresh_token,
    expires_at: Number(s.expires_at) || Math.floor(Date.now() / 1000) + (Number(s.expires_in) || 3600),
    user_id: (s.user && s.user.id) || (_syncSession && _syncSession.user_id) || ''
  };
  setSecret(SYNC_KEYS.session, JSON.stringify(_syncSession));
  state.sync.userId = _syncSession.user_id;
}

function _clearSession() {
  _syncSession = null;
  setSecret(SYNC_KEYS.session, '');
  state.sync.userId = '';
}

// Nouvelle identité anonyme pour cet appareil (création ou jonction d'une famille uniquement)
async function _signInAnonymously() {
  const s = await _authPost('signup', { data: {}, gotrue_meta_security: {} });
  _storeSession(s);
}

// Refus définitif du jeton de rafraîchissement : l'identité anonyme de l'appareil est perdue
const SYNC_DEAD_SESSION_CODES = ['refresh_token_not_found', 'refresh_token_already_used', 'session_not_found',
  'session_expired', 'user_not_found', 'invalid_grant'];

function _isDeadSessionError(e) {
  return !!e && e.kind === 'auth' && e.status >= 400 &&
    (SYNC_DEAD_SESSION_CODES.includes(e.code) || /refresh token/i.test(e.message || ''));
}

// Une autre instance de l'app sur ce téléphone (onglet du navigateur + app installée) a pu rafraîchir
// la session : on reprend la sienne, plus récente, au lieu de réutiliser un jeton déjà consommé
function _adoptStoredSession() {
  const stored = _readStoredSession();
  if (!stored || !stored.refresh_token) return;
  if (!_syncSession || (stored.refresh_token !== _syncSession.refresh_token &&
      Number(stored.expires_at) >= Number(_syncSession.expires_at))) {
    _syncSession = stored;
    if (stored.user_id) state.sync.userId = stored.user_id;
  }
}

let _syncRefreshPromise = null;
async function _refreshSession(force) {
  if (_syncRefreshPromise) return _syncRefreshPromise;
  const refresh = async () => {
    const before = _syncSession && _syncSession.refresh_token;
    _adoptStoredSession();
    if (!_syncSession || !_syncSession.refresh_token) throw new SyncError('auth', 'Session absente');
    if (_syncSession.refresh_token !== before) return; // déjà rafraîchie par une autre instance
    if (!force && Number(_syncSession.expires_at) - 60 > Date.now() / 1000) return;
    const body = { refresh_token: _syncSession.refresh_token };
    try {
      let s;
      try {
        s = await _authPost('token?grant_type=refresh_token', body, SYNC_REFRESH_TIMEOUT_MS);
      } catch (e) {
        if (e.kind !== 'timeout' && e.kind !== 'offline') throw e;
        // Réponse perdue : le serveur a peut-être déjà remplacé le jeton. Un 2e essai rapide reste dans
        // sa fenêtre de réutilisation (10 s) ; plus tard, il provoquerait la révocation de la session.
        await new Promise(r => setTimeout(r, 1000));
        s = await _authPost('token?grant_type=refresh_token', body, SYNC_REFRESH_TIMEOUT_MS);
      }
      _storeSession(s);
    } catch (e) {
      if (_isDeadSessionError(e)) {
        _clearSession();
        throw e;
      }
      // Autre refus (service perturbé…) : la session est conservée, on réessaiera plus tard
      if (e.kind === 'auth') throw new SyncError('server', e.message, e.status, e.code);
      throw e;
    }
  };
  // Un seul rafraîchissement à la fois, toutes instances de l'app confondues
  _syncRefreshPromise = navigator.locks && navigator.locks.request
    ? navigator.locks.request('maisonnee-auth', refresh)
    : refresh();
  try { return await _syncRefreshPromise; } finally { _syncRefreshPromise = null; }
}

async function _ensureSession(allowSignup) {
  _adoptStoredSession();
  if (!_syncSession) {
    if (!allowSignup) throw new SyncError('auth', 'Cet appareil doit rejoindre à nouveau la famille');
    await _signInAnonymously();
    return;
  }
  if (Number(_syncSession.expires_at) - 60 <= Date.now() / 1000) await _refreshSession(false);
}

// Requête PostgREST avec le jeton de l'appareil (rafraîchi et rejoué une fois en cas de 401)
async function supabaseRequest(method, path, body, extraHeaders, _isRetry) {
  if (!state.sync.url || !state.sync.key) throw new SyncError('config', 'Projet Supabase non configuré');
  await _ensureSession(false);
  const res = await _syncFetch(state.sync.url + '/rest/v1/' + path, {
    method,
    headers: {
      apikey: state.sync.key,
      Authorization: 'Bearer ' + _syncSession.access_token,
      'Content-Type': 'application/json',
      ...(extraHeaders || {})
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  if (res.status === 401 && !_isRetry) {
    await _refreshSession(true);
    return supabaseRequest(method, path, body, extraHeaders, true);
  }
  const json = res.json;
  if (!res.ok) {
    const code = json && typeof json === 'object' ? json.code : '';
    const message = _errorMessage(json, res.status);
    const kind = res.status === 401 ? (/api ?key/i.test(message) ? 'config' : 'auth')
      : (res.status === 403 || code === '42501') ? 'forbidden'
        : res.status >= 500 || res.status === 429 ? 'server' : 'client';
    throw new SyncError(kind, message, res.status, code);
  }
  return json;
}

// Paramètres texte nettoyés comme les documents (un nom coupé au milieu d'un emoji serait refusé)
function _rpc(fn, params) {
  const clean = {};
  for (const [k, v] of Object.entries(params || {})) clean[k] = typeof v === 'string' ? _wellFormedText(v) : v;
  return supabaseRequest('POST', 'rpc/' + fn, clean);
}

// ============================================
// Push / pull
// ============================================

let _syncLastPushMax = '';

// Ligne à envoyer pour une entrée de l'outbox. La séquence est lue en même temps que le document :
// si l'utilisateur le modifie pendant l'envoi, elle change et l'entrée reste dans l'outbox.
function _buildPushItem(hid, key) {
  if (!(key in _syncOutbox)) return null; // envoyé ou abandonné entre-temps
  if (_syncOwnSeq.get(key) !== _syncOutbox[key]) return null; // écrite (ou réécrite) par une autre instance : elle l'envoie
  const sep = key.indexOf(':');
  const kind = key.slice(0, sep), id = key.slice(sep + 1);
  const coll = SYNC_COLLECTIONS[kind];
  if (!coll || !id) return null; // type inconnu de cette version : une version plus récente l'enverra
  const doc = coll.get(id);
  const text = doc ? JSON.stringify(doc, (k, v) => (typeof v === 'string' ? _wellFormedText(v) : v)) : null;
  const row = { household_id: hid, kind, id, data: text ? JSON.parse(text) : null, deleted_at: doc ? null : new Date().toISOString() };
  return { key, seq: _syncOutbox[key], row, size: (text ? text.length : 0) + 200 };
}

// Texte acceptable par la base (jsonb) : demi-paires UTF-16 remplacées par U+FFFD (un texte coupé au
// milieu d'un emoji), caractère nul retiré
function _wellFormedText(s) {
  if (/[\uD800-\uDFFF]/.test(s)) {
    if (typeof s.toWellFormed === 'function') {
      s = s.toWellFormed();
    } else {
      let out = '';
      for (let i = 0; i < s.length; i++) {
        const c = s.charCodeAt(i);
        if (c >= 0xD800 && c <= 0xDBFF && i + 1 < s.length && s.charCodeAt(i + 1) >= 0xDC00 && s.charCodeAt(i + 1) <= 0xDFFF) {
          out += s[i] + s[i + 1];
          i++;
        } else {
          out += c >= 0xD800 && c <= 0xDFFF ? '\uFFFD' : s[i];
        }
      }
      s = out;
    }
  }
  return s.indexOf('\u0000') >= 0 ? s.replace(/\u0000/g, '') : s;
}

// Document refusé : on reprend la version de la famille, s'il en a une (sa ligne a pu être ignorée
// pendant que notre version attendait d'être envoyée). Si la relecture échoue (réseau), elle est
// retentée au cycle suivant (drapeau refetch).
async function _refetchRejected(hid, epoch, keys) {
  const restored = new Set();
  try {
    for (const key of keys) {
      if (key in _syncOutbox || !_syncRejected[key]) continue; // de nouveau modifié : il repartira
      const sep = key.indexOf(':');
      const kind = key.slice(0, sep), id = key.slice(sep + 1);
      const coll = SYNC_COLLECTIONS[kind];
      if (!coll) continue;
      _syncRejected[key].refetch = true;
      _saveRejected();
      delete _syncKnown[key];
      const rows = await supabaseRequest('GET', `household_data?select=kind,id,data,deleted_at,updated_at` +
        `&household_id=eq.${encodeURIComponent(hid)}&kind=eq.${encodeURIComponent(kind)}&id=eq.${encodeURIComponent(id)}`) || [];
      _syncAbortIfStale(epoch);
      if (rows[0] && _applyRemoteRow(rows[0], false)) { // la version de la famille remplace la version refusée
        if (coll.save() === false) throw new SyncError('storage', 'Mémoire du téléphone pleine');
        restored.add(kind);
        const doc = coll.get(id);
        const label = (doc && (doc.title || doc.name || doc.label)) || 'un élément';
        showToast(`Modification refusée par le serveur (« ${label} ») : la version de la famille est rétablie`, 'error');
      } else if (_syncRejected[key]) {
        delete _syncRejected[key].refetch; // pas de version dans la famille : le refus reste signalé
        _saveRejected();
      }
    }
  } finally {
    if (restored.size) _syncAfterRemoteChange(restored); // l'écran montrait encore la version refusée
  }
}

// Refus propre à une ligne (donnée rejetée par la base), et non à la requête ou au schéma (PGRST…, 42…)
function _isRowRejection(e) {
  return !!e && e.kind === 'client' && [400, 413, 422].includes(e.status) && !/^(PGRST|42)/.test(e.code || '');
}

// Document refusé par le serveur : mis de côté pour ne pas bloquer tous les autres.
// Il repartira s'il est de nouveau modifié.
function _parkRejected(item, e) {
  _syncRejected[item.key] = { at: Date.now(), message: String((e && e.message) || '').slice(0, 200) };
  _saveRejected();
  console.warn('[sync] document refusé par le serveur', item.key, e);
}

function _pushRows(rows) {
  return supabaseRequest('POST', 'household_data?on_conflict=household_id,kind,id&select=kind,id,updated_at', rows, {
    Prefer: 'resolution=merge-duplicates,return=representation'
  });
}

async function _pushOutbox() {
  const hid = state.sync.householdId;
  const epoch = _syncEpoch;
  _syncReloadOutbox();
  _syncAdoptAbandoned();
  _syncAbortIfStale(epoch);
  let pushed = 0;
  let batch = [], bytes = 2;

  const flush = async () => {
    if (!batch.length) return;
    _syncAbortIfStale(epoch);
    const items = batch;
    batch = [];
    bytes = 2;
    let results = [];
    const parked = new Set();
    try {
      results = (await _pushRows(items.map(it => it.row))) || [];
    } catch (e) {
      if (!_isRowRejection(e)) throw e;
      // Une ligne refusée fait échouer tout le lot : renvoi un par un pour isoler la fautive
      for (const it of items) {
        try {
          results.push(...((await _pushRows([it.row])) || []));
        } catch (e2) {
          if (!_isRowRejection(e2)) throw e2;
          _syncAbortIfStale(epoch);
          _parkRejected(it, e2);
          parked.add(it.key);
        }
      }
    }
    // « Tout supprimer » ou changement de famille pendant l'envoi : on n'écrit plus rien
    _syncAbortIfStale(epoch);
    _syncReloadOutbox();
    let rejectedChanged = false;
    for (const it of items) {
      if (_syncOutbox[it.key] === it.seq) { // pas re-modifié pendant l'envoi
        delete _syncOutbox[it.key];
        _syncOwnSeq.delete(it.key);
      }
      if (parked.has(it.key)) continue;
      pushed++;
      if (_syncRejected[it.key]) {
        delete _syncRejected[it.key];
        rejectedChanged = true;
      }
    }
    _saveOutbox();
    if (rejectedChanged) _saveRejected();
    for (const r of Array.isArray(results) ? results : []) {
      if (!r || !r.updated_at) continue;
      _syncKnown[r.kind + ':' + r.id] = r.updated_at; // notre propre écriture : inutile de la ré-appliquer
      if (!_syncLastPushMax || r.updated_at > _syncLastPushMax) _syncLastPushMax = r.updated_at;
    }
    await _refetchRejected(hid, epoch, items.filter(it => parked.has(it.key)).map(it => it.key));
  };

  for (const key of Object.keys(_syncOutbox)) {
    let item = _buildPushItem(hid, key);
    if (!item) continue;
    if (batch.length && (batch.length >= SYNC_PUSH_MAX_ROWS || bytes + item.size > SYNC_PUSH_MAX_BYTES)) {
      await flush();
      item = _buildPushItem(hid, key); // le document a pu changer pendant l'envoi
      if (!item) continue;
    }
    batch.push(item);
    bytes += item.size + 1;
  }
  await flush();
  _saveOutbox();
  return pushed;
}

// Applique une ligne du serveur. joinMerge : fusion initiale d'un appareil qui rejoint la famille.
function _applyRemoteRow(row, joinMerge) {
  const coll = SYNC_COLLECTIONS[row.kind];
  if (!coll) return false; // kind inconnu (version plus récente de l'app) : rattrapé après sa mise à jour
  const key = row.kind + ':' + row.id;
  if (_syncOutbox[key]) return false; // modification locale en attente : elle gagnera au push
  // Version déjà reflétée ici (typiquement notre propre écriture, relue à cause de la marge du curseur)
  if (_syncKnown[key] === row.updated_at) return false;
  _syncKnown[key] = row.updated_at;
  const deleted = !!row.deleted_at || row.data == null;
  if (joinMerge) {
    const local = coll.get(row.id);
    if (local) {
      if (deleted) {
        // Supprimé dans la famille, mais modifié ici après la suppression : on garde la version locale
        if ((coll.time(local) || 0) > Date.parse(row.deleted_at || 0)) {
          _syncTakeEntry(key);
          return false;
        }
      } else {
        const merged = coll.merge ? coll.merge(local, row.data) : null;
        if (merged) {
          coll.put(merged);
          _syncTakeEntry(key);
          return true;
        }
        if ((coll.time(local) || 0) > (coll.time(row.data) || 0)) {
          _syncTakeEntry(key); // la version locale est plus récente : on la pousse
          return false;
        }
      }
    }
  }
  if (_syncRejected[key]) { // la version de la famille remplace la version refusée
    delete _syncRejected[key];
    _saveRejected();
  }
  return deleted ? coll.remove(row.id) : coll.put(row.data);
}

// Tronque les microsecondes renvoyées par Postgres (Date.parse n'accepte que les millisecondes)
function _syncParseTs(ts) {
  return Date.parse(String(ts).replace(/(\.\d{3})\d+/, '$1'));
}

// joinMerge : fusion initiale d'un appareil qui rejoint la famille.
// kinds : rattrapage, depuis le début, de types de documents apparus avec une mise à jour de l'app
// (l'ancienne version les ignorait tout en avançant son curseur).
async function _pullChanges(joinMerge, kinds) {
  const hid = state.sync.householdId;
  const epoch = _syncEpoch;
  const startCursor = joinMerge || kinds ? '' : state.sync.cursor;
  let since = startCursor
    ? new Date(_syncParseTs(startCursor) - SYNC_PULL_MARGIN_MS).toISOString()
    : '1970-01-01T00:00:00.000Z';
  let seenAtSince = new Set();
  let offset = 0;
  let maxCursor = state.sync.cursor || '';
  const changedKinds = new Set();
  const seen = new Set();
  const kindFilter = kinds ? `&kind=in.(${kinds.map(encodeURIComponent).join(',')})` : '';

  // Enregistre les types modifiés ; le curseur n'avance qu'une fois les données écrites sur le téléphone
  const commit = (kindsToSave, cursor) => {
    _syncAbortIfStale(epoch);
    for (const kind of kindsToSave) {
      if (SYNC_COLLECTIONS[kind].save() === false) {
        _syncKnown = {}; // rien n'est enregistré : ces lignes devront être ré-appliquées au prochain essai
        throw new SyncError('storage', "Mémoire du téléphone pleine : les données de la famille n'ont pas pu être enregistrées");
      }
    }
    if (cursor && !kinds && cursor !== state.sync.cursor) _setCursor(cursor);
  };

  for (let page = 0; page < 2000; page++) {
    const rows = await supabaseRequest('GET',
      `household_data?select=kind,id,data,deleted_at,updated_at&household_id=eq.${encodeURIComponent(hid)}${kindFilter}` +
      `&updated_at=gte.${encodeURIComponent(since)}&order=updated_at.asc,kind.asc,id.asc` +
      `&limit=${SYNC_PULL_PAGE}${offset ? '&offset=' + offset : ''}`) || [];
    _syncAbortIfStale(epoch); // « Tout supprimer » ou changement de famille pendant le téléchargement
    const pageKinds = new Set();
    for (const row of rows) {
      const key = row.kind + ':' + row.id;
      seen.add(key);
      if (row.updated_at === since && seenAtSince.has(key)) continue;
      if (_applyRemoteRow(row, joinMerge)) {
        changedKinds.add(row.kind);
        pageKinds.add(row.kind);
      }
      if (!maxCursor || row.updated_at > maxCursor) maxCursor = row.updated_at;
    }
    // Page par page : une coupure ne fait pas tout retélécharger. En fusion initiale, les documents
    // fusionnés sont enregistrés AVANT l'outbox qui les désigne (une reprise ne pousse jamais une
    // version non fusionnée), et sans avancer le curseur (la fusion reprend du début)
    if (joinMerge) {
      commit(pageKinds, null);
      _saveOutbox();
    } else {
      commit(pageKinds, maxCursor);
    }
    if (rows.length < SYNC_PULL_PAGE) break;
    const last = rows[rows.length - 1].updated_at;
    if (last === since) {
      // Page entière au même instant (quasi impossible : le serveur date chaque ligne) : on avance par offset
      offset += rows.length;
      rows.forEach(r => seenAtSince.add(r.kind + ':' + r.id));
    } else {
      since = last;
      offset = 0;
      seenAtSince = new Set(rows.filter(r => r.updated_at === last).map(r => r.kind + ':' + r.id));
    }
  }

  if (joinMerge) {
    // Documents locaux absents de la famille : on les envoie (sauf ceux jamais modifiés)
    for (const [kind, coll] of Object.entries(SYNC_COLLECTIONS)) {
      for (const doc of coll.list()) {
        if (doc && doc.id && !seen.has(kind + ':' + doc.id) && !_isPristine(coll, doc)) _syncTakeEntry(kind + ':' + doc.id);
      }
    }
    _saveOutbox();
    commit(changedKinds, maxCursor);
  }
  return changedKinds;
}

// Types de documents synchronisés apparus depuis le dernier pull (mise à jour de l'app)
function _syncNewKinds() {
  const known = localStorage.getItem(SYNC_KEYS.kinds);
  if (known === null) return []; // premier pull : tout a été téléchargé
  const set = new Set(known.split(',').filter(Boolean));
  return Object.keys(SYNC_COLLECTIONS).filter(k => !set.has(k));
}

function _syncRememberKinds() {
  try { localStorage.setItem(SYNC_KEYS.kinds, Object.keys(SYNC_COLLECTIONS).sort().join(',')); } catch (e) { /* réessayé au prochain cycle */ }
}

// Rôle, profil et appartenance de cet appareil (un appareil retiré par la famille perd l'accès).
// Vérifié au plus toutes les 5 minutes pendant les syncs de fond.
let _syncMembershipCheckedAt = 0;
async function _refreshMembership(force) {
  const s = state.sync;
  const epoch = _syncEpoch;
  // « C'est moi » choisi pendant une coupure : on l'envoie d'abord (sinon le serveur l'écraserait)
  if (localStorage.getItem(SYNC_KEYS.memberPending) === '1') {
    await _rpc('set_my_member', { p_household: s.householdId, p_member_id: s.memberId || '', p_device_label: _deviceLabel() });
    _syncAbortIfStale(epoch);
    localStorage.removeItem(SYNC_KEYS.memberPending);
  }
  if (!force && Date.now() - _syncMembershipCheckedAt < 300000) return;
  _syncMembershipCheckedAt = Date.now();
  const memberBefore = s.memberId;
  const rows = await supabaseRequest('GET',
    `household_users?select=user_id,role,member_id&household_id=eq.${encodeURIComponent(s.householdId)}`) || [];
  _syncAbortIfStale(epoch);
  const me = rows.find(r => r.user_id === s.userId);
  if (!me) throw new SyncError('forbidden', "Cet appareil ne fait plus partie de la famille");
  let changed = false;
  if (me.role && me.role !== s.role) { s.role = me.role; changed = true; }
  // « C'est moi » choisi pendant la requête : le choix local gagne (il part au serveur à la sync suivante)
  const memberId = me.member_id || '';
  if (memberId !== s.memberId && s.memberId === memberBefore && localStorage.getItem(SYNC_KEYS.memberPending) !== '1') {
    s.memberId = memberId;
    changed = true;
  }
  // Membres qui ont un téléphone dans la famille (ciblage des rappels, voir reminders.js)
  const withDevice = [...new Set(rows.map(r => r.member_id).filter(Boolean))].sort();
  if (withDevice.join(',') !== (s.deviceMemberIds || []).join(',')) { s.deviceMemberIds = withDevice; changed = true; }
  const hh = await supabaseRequest('GET',
    `households?select=name,invite_code,invite_expires_at,tz&id=eq.${encodeURIComponent(s.householdId)}`) || [];
  _syncAbortIfStale(epoch);
  if (hh[0]) {
    if (hh[0].name !== s.householdName) { s.householdName = hh[0].name; changed = true; }
    if (hh[0].invite_code !== s.inviteCode) { s.inviteCode = hh[0].invite_code || ''; changed = true; }
    if (hh[0].invite_expires_at !== s.inviteExpiresAt) { s.inviteExpiresAt = hh[0].invite_expires_at || ''; changed = true; }
    if (hh[0].tz && hh[0].tz !== s.householdTz) { s.householdTz = hh[0].tz; changed = true; }
  }
  if (changed) _saveHousehold();
}

// ============================================
// Cycle de synchronisation
// ============================================

let _syncRunning = null;
let _syncQueued = false;
// Fonctions appelées après chaque cycle de synchronisation réussi (ex. budget.js : dépenses récurrentes)
const SYNC_CYCLE_HOOKS = []; // appelés avec l'époque (_syncEpoch) du début du cycle
let _syncTimer = null;
let _syncRetryDelay = 0;
let _syncIdleTimer = null;

function _scheduleSync(delay) {
  if (!syncEnabled()) return;
  if (_syncTimer) clearTimeout(_syncTimer);
  _syncTimer = setTimeout(() => { _syncTimer = null; performSync(true); }, delay);
}

async function performSync(silent) {
  if (!syncEnabled()) return false;
  if (_syncSuspended) {
    if (silent) return false;
    _syncSuspended = ''; // demandée par l'utilisateur : on réessaie
  }
  if (_syncRunning) {
    _syncQueued = true;
    return _syncRunning;
  }
  _syncRunning = _runSyncCycle(silent);
  try {
    return await _syncRunning;
  } finally {
    _syncRunning = null;
    if (_syncQueued) {
      _syncQueued = false;
      _scheduleSync(300);
    }
  }
}

async function _runSyncCycle(silent) {
  if (!navigator.onLine) {
    setSyncStatus('offline');
    return false;
  }
  setSyncStatus('syncing');
  const fresh = _syncFreshHousehold;
  const cycleEpoch = _syncEpoch;
  try {
    await _ensureSession(false);
    await _refreshMembership(!silent);
    // Création de la famille : import de l'ancienne sync « code foyer » (rejoué s'il a été interrompu)
    if (localStorage.getItem(SYNC_KEYS.legacyPending) === '1') {
      const epoch = _syncEpoch;
      const imported = await importLegacyFoyer();
      _syncAbortIfStale(epoch);
      _syncLastImport = imported;
      localStorage.removeItem(SYNC_KEYS.legacyPending);
      _markAllDirty();
    }
    _syncLastPushMax = '';
    _syncLastPushed = 0;
    const joinMerge = localStorage.getItem(SYNC_KEYS.joinMerge) === '1';
    let changed;
    if (joinMerge) {
      changed = await _pullChanges(true);
      localStorage.removeItem(SYNC_KEYS.joinMerge);
    } else {
      // Relectures de la version de la famille restées en suspens après un refus (coupure réseau)
      await _refetchRejected(state.sync.householdId, _syncEpoch,
        Object.keys(_syncRejected).filter(k => _syncRejected[k] && _syncRejected[k].refetch));
      _syncLastPushed += await _pushOutbox(); // nos modifications d'abord
      // Famille tout juste créée ici : le serveur ne contient que nos envois, inutile de les retélécharger
      if (fresh && !state.sync.cursor && _syncLastPushMax) _setCursor(_syncLastPushMax);
      changed = await _pullChanges(false);
      const newKinds = _syncNewKinds();
      if (newKinds.length) for (const k of await _pullChanges(false, newKinds)) changed.add(k);
    }
    _syncRememberKinds();
    _syncLastPushed += await _pushOutbox(); // modifications faites pendant le pull, ou issues de la fusion
    state.sync.lastSync = Date.now();
    localStorage.setItem(STORAGE_KEYS.lastSync, String(state.sync.lastSync));
    _syncRetryDelay = 0;
    setSyncStatus('synced');
    for (const hook of SYNC_CYCLE_HOOKS) {
      try { hook(cycleEpoch); } catch (err) { console.warn('[sync] après la synchronisation :', err); }
    }
    if (_syncIdleTimer) clearTimeout(_syncIdleTimer);
    _syncIdleTimer = setTimeout(() => { if (state.sync.status === 'synced') setSyncStatus('idle'); }, 3000);
    if (changed && changed.size) _syncAfterRemoteChange(changed);
    if (!silent) showToast('Synchronisé ✓', 'success');
    return true;
  } catch (e) {
    _handleSyncError(e, silent);
    return false;
  }
}

function _handleSyncError(e, silent) {
  console.warn('[sync]', e && e.kind, e && e.message, e);
  const kind = e && e.kind;
  if (kind === 'aborted') {
    // Données effacées ou famille changée pendant la sync : on repart proprement
    setSyncStatus('idle');
    _scheduleSync(300);
    return;
  }
  if (kind === 'storage') {
    // Pas de nouvelle tentative automatique : chaque essai retéléchargerait les mêmes données
    _syncSuspended = 'storage';
    setSyncStatus('error', "Mémoire du téléphone pleine : libérez de l'espace (Paramètres → 💾 Données & sauvegarde), puis touchez l'icône de synchronisation");
    if (!silent) showToast('Mémoire du téléphone pleine', 'error');
    return;
  }
  if (kind === 'offline') {
    setSyncStatus('offline');
  } else if (kind === 'auth' || kind === 'forbidden') {
    if (kind === 'forbidden' && (state.sync.inviteCode || state.sync.inviteExpiresAt)) {
      // Appareil retiré de la famille : le code mémorisé ne doit pas lui permettre de revenir seul
      state.sync.inviteCode = '';
      state.sync.inviteExpiresAt = '';
      _saveHousehold();
    }
    setSyncStatus('auth', kind === 'forbidden'
      ? "Cet appareil ne fait plus partie de la famille — rejoins-la avec un lien d'invitation"
      : "Session perdue — rejoins la famille avec un lien d'invitation");
    if (!silent) showToast('Reconnexion à la famille nécessaire', 'error');
    return; // pas de nouvelle tentative automatique : action de l'utilisateur requise
  } else {
    setSyncStatus('error', e && e.message ? 'Erreur de synchronisation : ' + e.message : '');
    if (!silent) showToast('Erreur de synchronisation', 'error');
  }
  // Nouvelle tentative avec un délai croissant (5 s → 5 min) s'il reste des modifications à envoyer
  if (syncPendingCount() > 0) {
    _syncRetryDelay = Math.min(_syncRetryDelay ? _syncRetryDelay * 3 : 5000, 300000);
    _scheduleSync(_syncRetryDelay);
  }
}

// Rafraîchit l'écran après des modifications venues d'un autre appareil
function _syncAfterRemoteChange(changedKinds) {
  if (changedKinds.has('shopping_lists') || changedKinds.has('recipes')) updateShoppingBadge();
  if (typeof _rerenderCurrentView === 'function') _rerenderCurrentView();
  if (state.currentView === 'recipe' && state.currentRecipe && changedKinds.has('recipes')) {
    const fresh = state.recipes.find(r => r.id === state.currentRecipe.id);
    if (fresh) {
      state.currentRecipe = { ...fresh, currentServings: state.currentRecipe.currentServings || fresh.baseServings };
      renderRecipeDetail(fresh);
    }
  }
}

// Démarrage : lancé par init() une fois l'interface affichée
function initSync() {
  updateSyncIndicator();
  if (syncEnabled()) performSync(true);
}

window.addEventListener('online', () => { if (syncEnabled()) performSync(true); });
window.addEventListener('offline', () => { if (syncEnabled()) setSyncStatus('offline'); });
document.addEventListener('visibilitychange', () => {
  // Au retour au premier plan : récupérer les changements ; en arrière-plan : envoyer les nôtres
  if (syncEnabled()) performSync(true);
});
setInterval(() => {
  if (syncEnabled() && document.visibilityState === 'visible') performSync(true);
}, SYNC_PERIOD_MS);

// ============================================
// Plusieurs instances de l'app sur le même appareil
// ============================================
// L'app installée et un onglet du navigateur partagent le même stockage. Quand l'une enregistre des
// données, l'autre les relit aussitôt (événement 'storage', reçu même en arrière-plan) et les applique EN
// PLACE : une fiche ouverte garde une référence valide, et la sauvegarde d'une collection entière ne
// réécrit pas une copie périmée. Un document que CETTE instance a modifié en dernier (sa séquence est la
// dernière de l'outbox) garde sa version : c'est la plus récente, et son écriture peut être différée.
// Le curseur, lui, reste propre à chaque instance : chacune applique les lignes reçues à sa mémoire.

// Clés de stockage des documents synchronisés → type de document
function _syncStorageKinds() {
  return [
    [STORAGE_KEYS.recipes, 'recipes'],
    [STORAGE_KEYS.shoppingLists, 'shopping_lists'],
    [typeof EVENTS_STORAGE_KEY !== 'undefined' ? EVENTS_STORAGE_KEY : 'mr_events', 'events'],
    [typeof MEMBERS_STORAGE_KEY !== 'undefined' ? MEMBERS_STORAGE_KEY : 'mr_members', 'members'],
    [typeof EXPENSES_STORAGE_KEY !== 'undefined' ? EXPENSES_STORAGE_KEY : 'mr_expenses', 'expenses'],
    [typeof BUDGET_CATEGORIES_STORAGE_KEY !== 'undefined' ? BUDGET_CATEGORIES_STORAGE_KEY : 'mr_budget_categories', 'budget_categories'],
    [typeof BUDGET_SETTINGS_STORAGE_KEY !== 'undefined' ? BUDGET_SETTINGS_STORAGE_KEY : 'mr_budget_settings', 'budget_settings'],
    [typeof BUDGET_RECURRING_STORAGE_KEY !== 'undefined' ? BUDGET_RECURRING_STORAGE_KEY : 'mr_budget_recurring', 'budget_recurring'],
    [typeof BUDGET_YEARLY_STORAGE_KEY !== 'undefined' ? BUDGET_YEARLY_STORAGE_KEY : 'mr_budget_yearly', 'budget_yearly'],
    [typeof BUDGET_MONTHS_STORAGE_KEY !== 'undefined' ? BUDGET_MONTHS_STORAGE_KEY : 'mr_budget_months', 'budget_months'],
    [typeof MEMOS_STORAGE_KEY !== 'undefined' ? MEMOS_STORAGE_KEY : 'mr_memos', 'memos'],
    [typeof WISHES_STORAGE_KEY !== 'undefined' ? WISHES_STORAGE_KEY : 'mr_wishes', 'wishes'],
    [typeof SHARED_EXPENSES_STORAGE_KEY !== 'undefined' ? SHARED_EXPENSES_STORAGE_KEY : 'mr_shared_expenses', 'shared_expenses']
  ];
}

// Documents d'une collection tels qu'enregistrés (tableau, objet { id: événement }, ou réglages du
// budget) ; null si illisible (on garde alors la mémoire)
function _syncStoredDocs(kind, raw) {
  let v;
  try { v = JSON.parse(raw || 'null'); } catch (e) { return null; }
  if (kind === 'events') return v && typeof v === 'object' && !Array.isArray(v) ? Object.values(v) : [];
  if (kind === 'budget_settings') return v && typeof v === 'object' ? [{ ...v, id: 'settings' }] : [];
  return Array.isArray(v) ? v : [];
}

// Même contenu, quel que soit l'ordre des champs
function _syncSameDoc(a, b) {
  const norm = v => Array.isArray(v) ? v.map(norm)
    : v && typeof v === 'object' ? Object.keys(v).sort().reduce((o, k) => { o[k] = norm(v[k]); return o; }, {}) : v;
  return JSON.stringify(a) === JSON.stringify(b) || JSON.stringify(norm(a)) === JSON.stringify(norm(b));
}

// Applique à la mémoire une collection enregistrée par une autre instance. Renvoie true si changement.
// Un document dont CETTE instance a écrit la dernière séquence de l'outbox garde sa version :
// - présent des deux côtés : sauf si la version enregistrée est plus récente (les deux instances ont la
//   même horloge) ; s'il est strictement plus récent ici, la collection est réenregistrée ;
// - présent ici seulement (créé ici, absent d'une copie plus ancienne) : gardé, collection réenregistrée ;
// - absent ici (supprimé ici) : reste supprimé, et la collection est réenregistrée si la copie enregistrée
//   le contient encore (sinon une relance ou une adoption renverrait le document au lieu de sa suppression).
// L'autre instance ne répond à un réenregistrement que tant qu'elle se croit encore propriétaire du
// document (avant d'avoir lu notre nouvelle séquence) : les allers-retours sont bornés. Deux instances ne
// possèdent la même séquence qu'après une adoption, qui n'a lieu que lorsque la mémoire reflète le
// stockage. Garde-fou en plus : au plus 3 réenregistrements par collection et par 5 s (_syncMayResave).
function _syncReloadCollection(kind, docs) {
  const coll = SYNC_COLLECTIONS[kind];
  if (!coll || !docs) return false;
  const mine = id => {
    const k = kind + ':' + id;
    return _syncOwnSeq.has(k) && _syncOwnSeq.get(k) === _syncOutbox[k];
  };
  const time = d => Number(coll.time(d)) || 0;
  let changed = false, resave = false;
  const ids = new Set();
  const applied = id => {
    changed = true;
    delete _syncKnown[kind + ':' + id]; // la prochaine version reçue de la famille sera appliquée
  };
  for (const doc of docs) {
    if (!doc || typeof doc !== 'object' || !doc.id) continue;
    ids.add(doc.id);
    const cur = coll.get(doc.id);
    if (cur && _syncSameDoc(cur, doc)) continue;
    if (mine(doc.id) && (!cur || time(cur) >= time(doc))) {
      if (!cur || time(cur) > time(doc)) resave = true;
      continue;
    }
    if (coll.put(doc)) applied(doc.id);
  }
  for (const doc of coll.list().slice()) {
    if (!doc || !doc.id || ids.has(doc.id)) continue;
    if (mine(doc.id)) {
      resave = true;
      continue;
    }
    if (coll.remove(doc.id)) applied(doc.id);
  }
  if (resave && _syncMayResave(kind)) coll.save();
  return changed;
}

// Garde-fou : réenregistrements dus aux relectures, par collection, sur les 5 dernières secondes
const _syncResaves = {};
function _syncMayResave(kind) {
  const now = Date.now();
  const recent = (_syncResaves[kind] || []).filter(t => now - t < 5000);
  _syncResaves[kind] = recent;
  if (recent.length >= 3) {
    console.warn('[sync] réenregistrements répétés entre instances de l\'app interrompus :', kind);
    return false;
  }
  recent.push(now);
  return true;
}

// Relit les données enregistrées par une autre instance : la collection de storageKey (null : toutes),
// ou les types de documents donnés
function _syncSoftReload(storageKey, kinds) {
  _syncReloadOutbox(); // séquences à jour : à qui appartient la dernière modification de chaque document
  const changed = new Set();
  for (const [key, kind] of _syncStorageKinds()) {
    if (kinds ? !kinds.has(kind) : (storageKey !== null && storageKey !== key)) continue;
    if (_syncReloadCollection(kind, _syncStoredDocs(kind, localStorage.getItem(key)))) changed.add(kind);
  }
  if (changed.has('shopping_lists')) _syncRealignActiveShoppingList();
  if (!kinds && (storageKey === null || storageKey === STORAGE_KEYS.pantry)) {
    try {
      const pantry = JSON.parse(localStorage.getItem(STORAGE_KEYS.pantry) || '[]');
      if (Array.isArray(pantry) && JSON.stringify(pantry) !== JSON.stringify(state.pantry)) {
        state.pantry.splice(0, state.pantry.length, ...pantry);
        changed.add('pantry');
      }
    } catch (err) { /* illisible : on garde la mémoire */ }
  }
  if (changed.size) _syncAfterRemoteChange(changed);
}

window.addEventListener('storage', (e) => {
  if (e.storageArea !== localStorage) return;
  const all = e.key === null; // localStorage.clear()
  if (all || e.key === STORAGE_KEYS.syncUrl || e.key === STORAGE_KEYS.syncKey) {
    state.sync.url = getSecret(STORAGE_KEYS.syncUrl);
    state.sync.key = getSecret(STORAGE_KEYS.syncKey);
    state.sync.enabled = syncEnabled();
  }
  if (all || e.key === SYNC_KEYS.session || e.key === SYNC_KEYS.household) {
    const hadHousehold = state.sync.householdId;
    const cursor = state.sync.cursor;
    loadSyncState();
    if (hadHousehold === state.sync.householdId) state.sync.cursor = cursor; // même famille : notre curseur
    else _bumpSyncEpoch();
    updateSyncIndicator();
  }
  // « Tout supprimer », changement de projet ou de famille dans l'autre instance : notre curseur repart
  // aussi de zéro (sinon nous le réenregistrerions par-dessus, et un retéléchargement interrompu ne
  // reprendrait jamais). Une sync en cours s'arrête sans l'écrire.
  if (e.key === SYNC_KEYS.cursor && e.newValue === null && state.sync.cursor) {
    state.sync.cursor = '';
    _bumpSyncEpoch();
  }
  if (e.key === SYNC_KEYS.outboxAt) _syncLastOutboxEventAt = Date.now(); // l'autre instance est active
  if (e.key === SYNC_KEYS.outbox) {
    _syncLastOutboxEventAt = Date.now();
    _syncReloadOutbox();
    // Documents que nous avions modifiés en dernier, réécrits depuis par l'autre instance (ou envoi
    // abandonné par « Tout supprimer ») : la version enregistrée fait foi
    const kinds = new Set();
    for (const [k, seq] of [..._syncOwnSeq]) {
      if (_syncOutbox[k] !== seq) {
        _syncOwnSeq.delete(k);
        kinds.add(k.slice(0, k.indexOf(':')));
      }
    }
    if (kinds.size) _syncSoftReload(null, kinds);
  } else if (all || e.key === STORAGE_KEYS.pantry || _syncStorageKinds().some(([key]) => key === e.key)) {
    _syncSoftReload(e.key);
  }
});

// ============================================
// Famille : configuration, création, jonction, appareils
// ============================================

// URL du projet : https://<ref>.supabase.co (ou un serveur local de dev : http://localhost:54321)
function normalizeSupabaseUrl(input) {
  let u = String(input || '').trim().replace(/\/+$/, '').replace(/\/rest\/v1$/, '').replace(/\/+$/, '');
  if (!/^https:\/\/[^\s/]+$/i.test(u) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(u)) return '';
  return u;
}

function configureSupabase(url, key) {
  const u = normalizeSupabaseUrl(url);
  const k = String(key || '').trim();
  if (!u) throw new SyncError('config', "URL du projet invalide (attendu : https://xxxx.supabase.co)");
  if (!k || /\s/.test(k)) throw new SyncError('config', 'Clé publique (publishable / anon) invalide');
  if (u !== state.sync.url || k !== state.sync.key) {
    // Changement de projet : l'ancienne session et l'ancien curseur ne valent plus rien
    if (state.sync.url && u !== state.sync.url) { _clearSession(); _setCursor(''); }
    state.sync.url = u;
    state.sync.key = k;
    setSecret(STORAGE_KEYS.syncUrl, u);
    setSecret(STORAGE_KEYS.syncKey, k);
  }
}

function _deviceLabel() {
  const ua = navigator.userAgent || '';
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  if (/Android/.test(ua)) return 'Android';
  if (/Macintosh/.test(ua)) return 'Mac';
  if (/Windows/.test(ua)) return 'PC Windows';
  return 'Navigateur';
}

// Fuseau « neutre » (navigateur réglé sur UTC, protection anti-pistage) : il ne dit rien de l'heure locale
function _isNeutralTz(tz) {
  return /^(UTC|GMT|Etc\/|Universal$|Zulu$)/.test(tz || '');
}

// Fuseau des rappels proposé à la création de la famille (celui du défaut du schéma s'il est neutre)
function _familyTz() {
  let tz = '';
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { /* défaut */ }
  return tz && !_isNeutralTz(tz) ? tz : 'Europe/Paris';
}

function _setHousehold(fields) {
  Object.assign(state.sync, fields);
  _saveHousehold();
  _syncMembershipCheckedAt = 0; // nouvelle famille : vérifier tout de suite l'appartenance
  updateSyncIndicator();
}

// Premier appareil : crée la famille, importe l'ancienne sync « foyer » éventuelle, envoie tout
async function createFamily({ url, key, familyName, member }) {
  configureSupabase(url, key);
  if (state.sync.householdId) throw new SyncError('config', 'Cet appareil fait déjà partie d\'une famille');
  await _ensureSession(true);
  const res = await _rpc('create_household', { p_name: familyName || 'Ma famille', p_tz: _familyTz() });
  // Tout est mémorisé avant le premier envoi : si la suite est interrompue (réseau, app fermée),
  // les syncs suivantes reprennent (profil, import de l'ancienne sync, envoi de tout)
  _bumpSyncEpoch();
  _setHousehold({
    householdId: res.household_id, householdName: res.name || familyName || 'Ma famille', role: res.role || 'admin',
    memberId: '', inviteCode: res.invite_code || '', inviteExpiresAt: res.invite_expires_at || '',
    householdTz: _familyTz(), deviceMemberIds: []
  });
  _setCursor('');
  localStorage.removeItem(SYNC_KEYS.joinMerge);
  localStorage.removeItem(SYNC_KEYS.kinds);
  const me = upsertMember(member, { skipDirty: true });
  state.sync.memberId = me.id;
  _saveHousehold();
  localStorage.setItem(SYNC_KEYS.memberPending, '1');
  _syncLastImport = null;
  if (state.sync.foyer) localStorage.setItem(SYNC_KEYS.legacyPending, '1');
  _markAllDirty();
  _syncFreshHousehold = true;
  let synced = false;
  try {
    synced = await performSync(true);
  } finally {
    _syncFreshHousehold = false;
  }
  return { pushed: synced ? _syncLastPushed : 0, imported: _syncLastImport, synced: !!synced };
}

// Appareil suivant : rejoint avec le code, puis fusion initiale (rien de local n'est perdu)
async function joinFamily({ url, key, code }) {
  configureSupabase(url, key);
  const cleanCode = String(code || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (cleanCode.length < 6) throw new SyncError('config', "Code d'invitation invalide");
  // Une identité perdue ou appartenant à une autre famille : on repart d'une identité neuve
  if (state.sync.householdId) _clearSession();
  await _ensureSession(true);
  const res = await _rpc('join_household', { p_code: cleanCode });
  _bumpSyncEpoch();
  _setHousehold({
    householdId: res.household_id, householdName: res.name || 'Ma famille', role: res.role || 'member',
    memberId: '', inviteCode: '', inviteExpiresAt: '', householdTz: '', deviceMemberIds: []
  });
  _setCursor('');
  localStorage.removeItem(SYNC_KEYS.kinds);
  localStorage.removeItem(SYNC_KEYS.memberPending);
  localStorage.setItem(SYNC_KEYS.joinMerge, '1');
  await performSync(true);
  return { householdId: res.household_id, name: state.sync.householdName };
}

async function setMyMember(memberId) {
  state.sync.memberId = memberId || '';
  _saveHousehold();
  if (!syncEnabled()) return;
  // Mémorisé tant que le serveur ne l'a pas enregistré (_refreshMembership le renverra)
  localStorage.setItem(SYNC_KEYS.memberPending, '1');
  try {
    await _rpc('set_my_member', { p_household: state.sync.householdId, p_member_id: memberId || '', p_device_label: _deviceLabel() });
    localStorage.removeItem(SYNC_KEYS.memberPending);
  } catch (e) {
    if (e.kind !== 'offline' && e.kind !== 'timeout' && e.kind !== 'server') throw e;
    _scheduleSync(5000); // coupure passagère : renvoyé à la prochaine sync
  }
}

async function regenerateInvite() {
  const res = await _rpc('regenerate_invite', { p_household: state.sync.householdId });
  _setHousehold({ inviteCode: (res && res.invite_code) || '', inviteExpiresAt: (res && res.invite_expires_at) || '' });
  return res;
}

async function renameFamily(name) {
  await _rpc('rename_household', { p_household: state.sync.householdId, p_name: name });
  _setHousehold({ householdName: name });
}

async function listFamilyDevices() {
  return await supabaseRequest('GET',
    `household_users?select=user_id,member_id,role,device_label,joined_at,last_seen_at&household_id=eq.${encodeURIComponent(state.sync.householdId)}&order=joined_at.asc`) || [];
}

// Le serveur change aussi le code d'invitation : celui que connaît l'appareil retiré ne sert plus
async function removeFamilyDevice(userId) {
  const res = await _rpc('remove_device', { p_household: state.sync.householdId, p_user: userId });
  if (res && res.invite_code) _setHousehold({ inviteCode: res.invite_code, inviteExpiresAt: res.invite_expires_at || '' });
}

// Quitter la famille sur cet appareil : les données locales restent, la sync s'arrête.
// Sans réseau, on ne part pas à moitié (l'appareil resterait membre côté serveur et continuerait de
// recevoir les rappels) : l'erreur est renvoyée et rien n'est effacé.
// opts.localOnly : le serveur de la famille ne répond plus (projet supprimé…) et l'utilisateur a confirmé :
// départ sur cet appareil seulement, qui reste inscrit côté serveur jusqu'à ce qu'un administrateur le retire
// (s'il est le seul administrateur, seul le SQL du mode d'emploi peut le retirer).
async function leaveFamily(opts) {
  if (!(opts && opts.localOnly) && syncEnabled() && _syncSession) {
    // Dernières modifications envoyées avant de partir
    if (syncPendingCount() > 0) await performSync(true);
    try {
      await _rpc('leave_household', { p_household: state.sync.householdId });
    } catch (e) {
      if (e.kind !== 'forbidden' && e.kind !== 'auth') throw e; // déjà hors de la famille : on continue
    }
  }
  // Plus de notifications sur ce téléphone (navigateur ; côté serveur, le départ les a retirées, et en
  // départ local la fonction d'envoi purge l'abonnement au premier refus du service push)
  if (typeof dropPushSubscription === 'function') await dropPushSubscription({ localOnly: !!(opts && opts.localOnly) });
  _bumpSyncEpoch();
  _clearSession();
  _syncOutbox = {};
  _syncOwnSeq.clear();
  _syncForeignSeen.clear();
  _saveOutbox();
  _syncRejected = {};
  _saveRejected();
  _setCursor('');
  [SYNC_KEYS.joinMerge, SYNC_KEYS.kinds, SYNC_KEYS.memberPending, SYNC_KEYS.legacyPending].forEach(k => localStorage.removeItem(k));
  _setHousehold({ householdId: '', householdName: '', role: '', memberId: '', inviteCode: '', inviteExpiresAt: '', householdTz: '', deviceMemberIds: [] });
  setSyncStatus('idle');
}

// Lien d'invitation : contient le projet, la clé publique et le code (fragment #join=, jamais envoyé à GitHub)
function buildInviteLink() {
  const payload = { u: state.sync.url, k: state.sync.key, c: state.sync.inviteCode, n: state.sync.householdName };
  const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(payload))))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return location.origin + location.pathname + '#join=' + b64;
}

// Accepte un lien complet, le fragment #join=…, la charge utile seule, ou un code nu
function parseInvite(input) {
  const raw = String(input || '').trim();
  if (!raw) return null;
  const m = raw.match(/#join=([A-Za-z0-9_-]+)/) || raw.match(/^([A-Za-z0-9_-]{24,})$/);
  if (m) {
    try {
      let b64 = m[1].replace(/-/g, '+').replace(/_/g, '/');
      while (b64.length % 4) b64 += '=';
      const p = JSON.parse(decodeURIComponent(escape(atob(b64))));
      if (p && p.c) return { url: p.u || '', key: p.k || '', code: String(p.c), name: p.n || '' };
    } catch (e) { /* pas une charge utile : on tente le code nu */ }
  }
  const code = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return code.length >= 6 && code.length <= 16 ? { url: '', key: '', code, name: '' } : null;
}

// ============================================
// Import de l'ancienne synchronisation « code foyer » (lecture seule, une fois)
// ============================================
// Les anciennes tables (recipes / planning / shopping_lists filtrées par foyer) ne sont jamais
// modifiées : elles restent intactes pour un retour arrière. Fusion « le plus récent gagne ».
async function importLegacyFoyer() {
  const foyer = state.sync.foyer;
  if (!foyer) return null;
  const f = encodeURIComponent(foyer);
  const get = async path => {
    try {
      return (await supabaseRequest('GET', path)) || [];
    } catch (e) {
      if (e.status === 404 || e.code === '42P01' || e.code === 'PGRST205') return []; // table absente
      throw e;
    }
  };
  const [recipes, planning, lists] = await Promise.all([
    get(`recipes?foyer=eq.${f}&select=*`),
    get(`planning?foyer=eq.${f}&select=*`),
    get(`shopping_lists?foyer=eq.${f}&select=*`)
  ]);
  const counts = { recipes: 0, meals: 0, lists: 0 };

  for (const row of recipes) {
    const local = state.recipes.find(r => r.id === row.id);
    const remoteTs = _syncParseTs(row.updated_at) || 0;
    if (row.deleted_at) {
      if (local && (local.updatedAt || local.createdAt || 0) < _syncParseTs(row.deleted_at)) {
        SYNC_COLLECTIONS.recipes.remove(row.id);
      }
      continue;
    }
    if (!row.data) continue;
    if (!local || remoteTs > (local.updatedAt || local.createdAt || 0)) {
      if (SYNC_COLLECTIONS.recipes.put(row.data)) counts.recipes++;
    }
  }

  for (const row of planning) {
    if (row.deleted_at || !row.recipe_id) continue;
    if (_importLegacyPlanningEntry(row.slot_key, { recipeId: row.recipe_id, servings: row.servings }, _syncParseTs(row.updated_at))) counts.meals++;
  }

  for (const row of lists) {
    const local = state.shoppingLists.find(l => l.id === row.id);
    const remoteTs = _syncParseTs(row.updated_at) || 0;
    if (row.deleted_at) {
      if (local && (local.updatedAt || 0) < remoteTs) SYNC_COLLECTIONS.shopping_lists.remove(row.id);
      continue;
    }
    if (!local || remoteTs > (local.updatedAt || 0)) {
      if (SYNC_COLLECTIONS.shopping_lists.put({ id: row.id, name: row.name, items: row.items, checked: row.checked, createdAt: remoteTs, updatedAt: remoteTs })) counts.lists++;
    }
  }

  saveRecipes();
  saveEventsNow();
  SYNC_COLLECTIONS.shopping_lists.save();
  localStorage.setItem(SYNC_KEYS.legacyImported, foyer);
  return counts;
}
