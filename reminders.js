// ============================================
// LA MAISONNÉE — Rappels et notifications
// ============================================
// 1. Rappels « dans l'app » (sans serveur) : tant que l'app est ouverte, les rappels des événements
//    du calendrier s'affichent à l'heure (notification système si autorisée, sinon toast).
// 2. Vraies push, même app fermée (0 € : plan gratuit Supabase + Web Push) : chaque appareil s'abonne
//    (PushManager) ; la fonction send-reminders (supabase/functions/) envoie les rappels chaque minute
//    et crée elle-même les clés de notification. Mise en place : supabase/push.sql + SYNC-GUIDE.md.
//
// Script classique chargé après calendar.js et sync.js. Le calcul des rappels (dueReminders,
// reminderMessage) est dans calendar.js, recopié à l'identique dans la fonction serveur.

const REMINDERS_FIRED_KEY = 'mr_reminders_fired';  // { tag du rappel: fireAt } (dédoublonnage)
const PUSH_ENABLED_KEY = 'mr_push_enabled';         // '1' : l'utilisateur a activé les push sur ce téléphone
const PUSH_ENABLED_AT_KEY = 'mr_push_enabled_at';   // date d'activation (diagnostic du serveur)
const PUSH_SAVED_KEY = 'mr_push_saved';             // 'appareil|famille|abonnement|jour' du dernier enregistrement
const PUSH_RETRY_KEY = 'mr_push_retry';             // '1' : réabonnement à retenter sans geste (panne passagère, notifications bloquées)
const REMINDER_CATCHUP_MS = 15 * 60 * 1000;        // rappels en retard de 15 min au plus (app rouverte)
const REMINDER_CHECK_MS = 30000;

function _deviceTz() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Paris'; } catch (e) { return 'Europe/Paris'; }
}

// Fuseau des rappels : celui de la famille (comme le serveur), sinon celui du téléphone
function _reminderTz() {
  const tz = state.sync.householdTz;
  if (tz) {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: tz });
      return tz;
    } catch (e) { /* fuseau inconnu de ce navigateur */ }
  }
  return _deviceTz();
}

// Notification système (via le service worker quand c'est possible : Android refuse new Notification).
// Pas d'option badge : sur Android, l'icône couleur de l'app y deviendrait un carré blanc.
async function showLocalNotification(title, opts) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return false;
  const options = { icon: 'icons/icon-192.png', ...(opts || {}) };
  try {
    const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
    if (reg) {
      await reg.showNotification(title, options);
      return true;
    }
  } catch (e) { /* repli ci-dessous */ }
  try {
    new Notification(title, options);
    return true;
  } catch (e) {
    return false;
  }
}

// ============================================
// Rappels dans l'app
// ============================================

const _firedThisSession = new Set(); // dédoublonnage même si la mémoire du téléphone est pleine

function _loadFired() {
  try { return JSON.parse(localStorage.getItem(REMINDERS_FIRED_KEY) || '{}') || {}; } catch (e) { return {}; }
}

function _saveFired(fired) {
  const limit = Date.now() - 2 * 86400000; // on oublie les rappels de plus de 2 jours
  for (const k of Object.keys(fired)) if (fired[k] < limit) delete fired[k];
  try { localStorage.setItem(REMINDERS_FIRED_KEY, JSON.stringify(fired)); } catch (e) { /* non bloquant */ }
}

// Rappel déjà affiché (par l'app, ou par une push du serveur : voir le message du service worker)
function _markReminderShown(tag, fireAt) {
  if (!tag) return;
  _firedThisSession.add(tag);
  const fired = _loadFired();
  if (!fired[tag]) {
    fired[tag] = fireAt || Date.now();
    _saveFired(fired);
  }
}

// Même règle que la fonction serveur send-reminders : un rappel concerne cet appareil s'il est pour
// toute la famille, pour son profil, si l'appareil n'a pas indiqué son profil, ou si aucun des
// participants n'a de téléphone dans la famille (ex. un enfant : toute la famille est prévenue)
function _reminderConcernsMe(ev) {
  const me = state.sync.memberId;
  const ids = Array.isArray(ev.memberIds) ? ev.memberIds : [];
  if (!ids.length || !me || ids.includes(me)) return true;
  const withDevice = state.sync.deviceMemberIds || [];
  return !ids.some(id => withDevice.includes(id));
}

// Push actives sur ce téléphone : la notification système vient du serveur, l'app n'affiche qu'un toast
function _pushActiveHere() {
  return localStorage.getItem(PUSH_ENABLED_KEY) === '1' && 'Notification' in window &&
    Notification.permission === 'granted' && syncEnabled() && !(_pushConfig && _pushConfig.member === false);
}

// Fenêtre glissante des 15 dernières minutes, dédoublonnée (comme le serveur) : un rappel n'est jamais
// manqué parce que l'app était en arrière-plan ou l'événement créé juste avant
function checkLocalReminders() {
  try {
    return _checkLocalReminders();
  } catch (e) {
    console.warn('[rappels]', e); // un document inattendu ne doit pas arrêter l'app
    return [];
  }
}

function _checkLocalReminders() {
  const now = Date.now();
  const from = now - REMINDER_CATCHUP_MS;
  const events = Object.values(state.events || {}).filter(ev => ev && ev.type !== 'meal' && Array.isArray(ev.reminders) && ev.reminders.length);
  if (!events.length) return [];
  const due = dueReminders(events, _reminderTz(), from, now).filter(r => _reminderConcernsMe(r.event));
  if (!due.length) return [];
  const fired = _loadFired();
  const pushHere = _pushActiveHere();
  const shown = [];
  for (const r of due) {
    const msg = reminderMessage(r);
    if (fired[msg.tag] || _firedThisSession.has(msg.tag)) continue;
    fired[msg.tag] = r.fireAt;
    _firedThisSession.add(msg.tag);
    // Même tag que la push du serveur : si les deux s'affichent, la seconde remplace la première
    if (!pushHere) showLocalNotification(msg.title, { body: msg.body, tag: msg.tag, data: { url: msg.url } });
    if (document.visibilityState === 'visible') showToast(`${msg.title} — ${msg.body}`);
    shown.push(msg);
  }
  _saveFired(fired);
  return shown;
}

setInterval(() => { if (document.visibilityState === 'visible') checkLocalReminders(); }, REMINDER_CHECK_MS);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  checkLocalReminders();
  reconcilePushSubscription();
});

// ============================================
// Vraies notifications push (même app fermée)
// ============================================

function _isIOS() {
  const ua = navigator.userAgent || '';
  // iPad : Safari se présente comme un Mac (mais avec un écran tactile)
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

function _isStandalone() {
  return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
}

function _pushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

function _b64urlEncode(bytes) {
  let s = '';
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function _b64urlDecode(str) {
  let b64 = String(str).replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  const bin = atob(b64);
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}

// Inscription du service worker, sans attendre indéfiniment (si son installation a échoué)
// anyState : l'enregistrement tel quel, actif ou non (suffit pour lire ou retirer un abonnement), sans
// attendre l'activation du service worker (jusqu'à 10 s)
async function _swRegistration(anyState) {
  if (!('serviceWorker' in navigator)) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  if (anyState || (reg && reg.active)) return reg || null;
  return Promise.race([navigator.serviceWorker.ready, new Promise(resolve => setTimeout(() => resolve(null), 10000))]);
}

let _pushConfig = null; // { member, public_key, last_run_at, last_problem, last_sent_at, tz, fetchedAt }

async function _fetchPushConfig() {
  const raw = await _rpc('get_push_config', { p_household: state.sync.householdId || null });
  const cfg = raw || {};
  _pushConfig = {
    member: raw != null, // null : cet appareil ne fait plus partie de la famille
    public_key: cfg.public_key || '', last_run_at: cfg.last_run_at || '',
    last_problem: cfg.last_problem || null, last_sent_at: cfg.last_sent_at || '',
    tz: cfg.tz || '', fetchedAt: Date.now()
  };
  if (_pushConfig.tz && _pushConfig.tz !== state.sync.householdTz) {
    state.sync.householdTz = _pushConfig.tz;
    if (typeof _saveHousehold === 'function') _saveHousehold();
  }
  return _pushConfig;
}

function _subscriptionKey(sub) {
  const k = sub && sub.options && sub.options.applicationServerKey;
  return k ? _b64urlEncode(k) : '';
}

async function _saveSubscription(sub) {
  const j = sub.toJSON();
  // Nouvel abonnement pour le même appareil (navigateur réinstallé, mise à jour…) : l'ancien est retiré
  // côté serveur (sinon il compterait dans la limite d'abonnements et recevrait des envois en échec)
  const previous = (localStorage.getItem(PUSH_SAVED_KEY) || '').split('|');
  if (previous[0] === state.sync.userId && previous[2] && previous[2] !== j.endpoint) {
    try { await _rpc('delete_push_subscription', { p_endpoint: previous[2] }); } catch (e) { console.warn('[push]', e); }
  }
  await _rpc('save_push_subscription', {
    p_household: state.sync.householdId, p_endpoint: j.endpoint,
    p_p256dh: j.keys.p256dh, p_auth: j.keys.auth, p_user_agent: navigator.userAgent
  });
  localStorage.setItem(PUSH_SAVED_KEY, [state.sync.userId, state.sync.householdId, j.endpoint, new Date().toISOString().slice(0, 10)].join('|'));
}

// Abonnement de ce téléphone avec la clé du serveur (en recrée un si besoin : ancienne clé, abonnement
// supprimé par le navigateur…). Aucun geste requis une fois la permission accordée.
async function _subscribeHere(reg, key) {
  let sub = await reg.pushManager.getSubscription();
  if (sub && _subscriptionKey(sub) && _subscriptionKey(sub) !== key) {
    await sub.unsubscribe(); // abonnement lié à d'anciennes clés
    sub = null;
  }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: _b64urlDecode(key) });
  return sub;
}

function _pushErrorText(e) {
  if (e && (e.code === 'PGRST202' || e.code === '42883' || e.code === '42P01')) {
    return "Les rappels push ne sont pas installés dans le projet Supabase (supabase/push.sql, voir le mode d'emploi).";
  }
  if (e && e.name === 'NotAllowedError') return 'Notifications refusées : autorisez-les dans les réglages du téléphone';
  if (e && e.name === 'AbortError') {
    return "Le service de notifications du navigateur est indisponible (Brave : activer « Utiliser les services Google pour la messagerie push » dans les réglages de confidentialité).";
  }
  if (e && typeof DOMException !== 'undefined' && e instanceof DOMException) return "Ce navigateur n'a pas pu s'abonner aux notifications.";
  return typeof _familyErrorText === 'function' ? _familyErrorText(e) : 'Activation impossible';
}

// Une seule activation à la fois (le bouton reste inactif pendant les quelques secondes d'attente)
let _pushEnabling = false;
async function enablePushOnThisDevice() {
  if (_pushEnabling) return false;
  _pushEnabling = true;
  const btn = document.getElementById('settings-push-enable');
  if (btn) btn.disabled = true;
  try {
    return await _enablePushOnThisDevice();
  } finally {
    _pushEnabling = false;
    if (btn) btn.disabled = false;
  }
}
window.enablePushOnThisDevice = enablePushOnThisDevice;

async function _enablePushOnThisDevice() {
  if (!_pushSupported()) {
    showToast(_isIOS() && !_isStandalone()
      ? "Sur iPhone et iPad, installez d'abord l'app sur l'écran d'accueil (Partager → Sur l'écran d'accueil), puis ouvrez-la"
      : 'Ce navigateur ne permet pas les notifications push', 'error');
    return false;
  }
  if (!syncEnabled()) {
    showToast("Créez ou rejoignez d'abord une famille (les rappels passent par votre projet Supabase)", 'error');
    return false;
  }
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    showToast('Notifications refusées : autorisez-les dans les réglages du téléphone', 'error');
    return false;
  }
  try {
    const cfg = await _fetchPushConfig();
    if (!cfg.member) {
      showToast("Cet appareil ne fait plus partie de la famille : rejoignez-la avec un nouveau lien d'invitation", 'error');
      return false;
    }
    if (!cfg.public_key) {
      showToast("Le serveur de rappels n'a pas encore créé ses clés : réessayez dans une minute (et vérifiez la fonction send-reminders).", 'error');
      return false;
    }
    const reg = await _swRegistration();
    if (!reg) {
      showToast("L'app n'est pas complètement installée : rechargez-la, puis réessayez", 'error');
      return false;
    }
    const sub = await _subscribeHere(reg, cfg.public_key);
    await _saveSubscription(sub);
    localStorage.setItem(PUSH_ENABLED_KEY, '1');
    localStorage.setItem(PUSH_ENABLED_AT_KEY, String(Date.now()));
    localStorage.removeItem(PUSH_RETRY_KEY);
    // Administrateur : les rappels suivent le fuseau horaire de la famille ; on propose celui du téléphone
    // s'il diffère (jamais automatiquement : un téléphone en voyage ou réglé sur UTC décalerait tout)
    const tz = _deviceTz();
    if (state.sync.role === 'admin' && cfg.tz !== tz && !_isNeutralTz(tz) &&
        !document.querySelector('#ui-dialog-modal:not(.hidden)') &&
        (!cfg.tz || await uiConfirm(`Les rappels de la famille suivent le fuseau horaire « ${cfg.tz} ». Utiliser celui de ce téléphone (« ${tz} ») ?`,
          { title: 'Fuseau horaire des rappels', confirmLabel: 'Utiliser ce fuseau', cancelLabel: 'Garder ' + cfg.tz }))) {
      try {
        await _rpc('set_household_tz', { p_household: state.sync.householdId, p_tz: tz });
        state.sync.householdTz = tz;
        _saveHousehold();
      } catch (e) {
        console.warn('[push] fuseau de la famille', e);
        showToast('Fuseau des rappels non modifié : ' + _pushErrorText(e), 'error');
      }
    }
    _pushConfig = null; // relu après le premier passage du serveur
    setTimeout(_refreshPushServerStatus, 200000);
    showToast('Notifications activées sur cet appareil ✓', 'success');
    return true;
  } catch (e) {
    console.warn('[push]', e);
    showToast(_pushErrorText(e), 'error');
    return false;
  } finally {
    renderSettingsPushSection();
  }
}

// Désabonne ce téléphone (navigateur ET serveur). Le désabonnement du navigateur suffit à arrêter
// les notifications même si le serveur est injoignable (il oubliera l'abonnement au premier refus).
// opts.localOnly : départ local, le serveur ne répond plus : on ne l'appelle pas (pas d'attente inutile).
async function dropPushSubscription(opts) {
  try {
    const reg = await _swRegistration(true);
    const sub = reg && await reg.pushManager.getSubscription();
    if (sub) {
      if (syncEnabled() && !(opts && opts.localOnly)) {
        try { await _rpc('delete_push_subscription', { p_endpoint: sub.endpoint }); } catch (e) { console.warn('[push]', e); }
      }
      await sub.unsubscribe();
    }
  } catch (e) {
    console.warn('[push]', e);
  }
  [PUSH_ENABLED_KEY, PUSH_ENABLED_AT_KEY, PUSH_SAVED_KEY, PUSH_RETRY_KEY].forEach(k => localStorage.removeItem(k));
}

async function disablePushOnThisDevice() {
  await dropPushSubscription();
  renderSettingsPushSection();
  showToast('Notifications désactivées sur cet appareil');
}
window.disablePushOnThisDevice = disablePushOnThisDevice;

// Vérification silencieuse (démarrage, retour au premier plan, Réglages) : l'abonnement peut avoir été
// supprimé par le navigateur (permission retirée puis rendue, service worker réinstallé, expiration) ou
// par le serveur (refus du service push), ou l'appareil a rejoint la famille avec une nouvelle identité.
// On se réabonne si besoin et on réenregistre l'abonnement (au plus une fois par jour s'il n'a pas changé).
let _pushReconcileAt = 0;
async function reconcilePushSubscription(force) {
  const retry = localStorage.getItem(PUSH_RETRY_KEY) === '1';
  if ((localStorage.getItem(PUSH_ENABLED_KEY) !== '1' && !retry) || !_pushSupported()) return;
  if (Notification.permission !== 'granted') {
    // Bloquées ou autorisation réinitialisée : le bouton « Activer » réapparaît, et le réabonnement se fera
    // tout seul quand l'autorisation reviendra (le navigateur a souvent supprimé l'abonnement). Le dernier
    // enregistrement (PUSH_SAVED_KEY) est gardé pour retirer alors l'ancien abonnement du serveur.
    localStorage.removeItem(PUSH_ENABLED_KEY);
    try { localStorage.setItem(PUSH_RETRY_KEY, '1'); } catch (e) { /* mémoire pleine : réactivation manuelle */ }
    renderSettingsPushSection();
    return;
  }
  if (!syncEnabled() || !navigator.onLine) return;
  // Au plus une vérification par heure ; toutes les 5 minutes quand un réabonnement est à retenter
  if (!force && Date.now() - _pushReconcileAt < (retry ? 300000 : 3600000)) return;
  _pushReconcileAt = Date.now();
  try {
    const reg = await _swRegistration();
    if (!reg) return;
    const cfg = await _fetchPushConfig();
    if (!cfg.member || !cfg.public_key) return; // hors de la famille : reprend après une nouvelle jonction
    let sub;
    try {
      sub = await _subscribeHere(reg, cfg.public_key);
    } catch (e) {
      console.warn('[push] réabonnement impossible', e);
      localStorage.removeItem(PUSH_ENABLED_KEY); // l'app reprend les notifications locales
      // Panne passagère du service push : retenté au retour au premier plan (au plus toutes les 5 min).
      // Refus (ex. Safari, qui exige un geste) : l'utilisateur doit réactiver.
      if (e && e.name !== 'NotAllowedError') localStorage.setItem(PUSH_RETRY_KEY, '1');
      else localStorage.removeItem(PUSH_RETRY_KEY);
      renderSettingsPushSection();
      if (!retry) showToast('Les notifications de cet appareil se sont arrêtées : réactivez-les dans Paramètres → 📅 Calendrier', 'error');
      return;
    }
    if (retry) {
      localStorage.setItem(PUSH_ENABLED_KEY, '1');
      localStorage.removeItem(PUSH_RETRY_KEY);
      renderSettingsPushSection();
    }
    const stamp = [state.sync.userId, state.sync.householdId, sub.endpoint, new Date().toISOString().slice(0, 10)].join('|');
    if (localStorage.getItem(PUSH_SAVED_KEY) !== stamp) await _saveSubscription(sub);
  } catch (e) {
    console.warn('[push] vérification de l\'abonnement', e);
  }
}

async function testNotification() {
  if (!('Notification' in window)) {
    showToast('Notifications non disponibles sur ce navigateur', 'error');
    return;
  }
  if (Notification.permission !== 'granted') await Notification.requestPermission();
  const ok = await showLocalNotification('🔔 La Maisonnée', { body: 'Les notifications fonctionnent sur cet appareil.', tag: 'mr-test' });
  if (!ok) showToast('Notifications non autorisées sur cet appareil', 'error');
}
window.testNotification = testNotification;

// ============================================
// Réglages : section « Rappels »
// ============================================

function _pushStatusText() {
  if (_pushConfig && _pushConfig.member === false) {
    return "⚠️ Cet appareil ne fait plus partie de la famille : les rappels n'arrivent plus app fermée. Rejoignez-la avec un nouveau lien d'invitation, les notifications reprendront toutes seules.";
  }
  const tz = state.sync.householdTz;
  return '✓ Notifications actives sur cet appareil, même app fermée.' + (tz ? ` Fuseau des rappels : ${tz}.` : '') + _pushServerNote();
}

function renderSettingsPushSection() {
  const status = document.getElementById('settings-push-status');
  const enable = document.getElementById('settings-push-enable');
  const disable = document.getElementById('settings-push-disable');
  if (!status) return;
  const enabled = localStorage.getItem(PUSH_ENABLED_KEY) === '1';
  const perm = 'Notification' in window ? Notification.permission : 'unsupported';
  if (enabled && perm === 'granted') {
    status.textContent = _pushStatusText();
    _refreshPushServerStatus();
    reconcilePushSubscription(Date.now() - _pushReconcileAt > 60000);
  } else if (perm === 'denied') {
    status.textContent = localStorage.getItem(PUSH_RETRY_KEY) === '1'
      ? '⚠️ Notifications bloquées : autorisez-les dans les réglages du téléphone, les rappels reprendront tout seuls.'
      : '⚠️ Notifications bloquées : autorisez-les dans les réglages du téléphone.';
  } else if (!syncEnabled()) {
    status.textContent = "Rappels affichés quand l'app est ouverte. Pour les recevoir app fermée, reliez d'abord ce téléphone à une famille.";
  } else {
    status.textContent = "Rappels affichés quand l'app est ouverte. Activez les notifications pour les recevoir aussi app fermée.";
  }
  if (enable) enable.classList.toggle('hidden', enabled && perm === 'granted');
  if (disable) disable.classList.toggle('hidden', !(enabled && perm === 'granted'));
}

// Diagnostic du serveur : il passe chaque minute ; sans passage récent, ou si son dernier passage a
// échoué ou vu ses envois refusés, les rappels app fermée ne partent pas
function _pushServerNote() {
  if (!_pushConfig) return '';
  const enabledAt = Number(localStorage.getItem(PUSH_ENABLED_AT_KEY)) || 0;
  if (Date.now() - enabledAt < 3 * 60000) return ''; // premier passage du serveur dans la minute
  const last = Date.parse(_pushConfig.last_run_at || '');
  if (!last) return " ⚠️ Le serveur de rappels n'a encore jamais tourné : vérifiez la fonction send-reminders et le cron (mode d'emploi).";
  if (Date.now() - last > 10 * 60000) return ` ⚠️ Le serveur de rappels ne tourne plus (dernier passage : ${formatRelativeDate(new Date(last))}) : vérifiez la fonction send-reminders.`;
  // Dernier problème du serveur, s'il est plus récent que le dernier envoi réussi (et date de moins de 7 jours)
  const pb = _pushConfig.last_problem;
  const pbAt = pb && Date.parse(pb.at || '');
  const sentAt = Date.parse(_pushConfig.last_sent_at || '') || 0;
  if (!pbAt || pbAt <= sentAt || Date.now() - pbAt > 7 * 86400000) return '';
  if (pb.error) return ` ⚠️ Un passage du serveur de rappels a échoué (${formatRelativeDate(new Date(pbAt))}) : ${String(pb.error).slice(0, 120)}`;
  if (pb.refused > 0) return " ⚠️ Les services de notification refusent les envois du serveur (clés de notification à recréer, voir le mode d'emploi).";
  return ` ⚠️ Des rappels n'ont pas pu être envoyés (${formatRelativeDate(new Date(pbAt))}) : ils sont retentés automatiquement.`;
}

async function _refreshPushServerStatus() {
  if (!syncEnabled() || (_pushConfig && Date.now() - _pushConfig.fetchedAt < 60000)) return;
  try {
    await _fetchPushConfig();
  } catch (e) {
    return; // hors ligne : pas de diagnostic
  }
  const status = document.getElementById('settings-push-status');
  if (status && localStorage.getItem(PUSH_ENABLED_KEY) === '1' && Notification.permission === 'granted') {
    status.textContent = _pushStatusText();
  }
}

// ============================================
// Messages du service worker (sw.js)
// ============================================
// - 'reminder-shown' : une push du serveur vient d'être affichée → le moteur local ne la répète pas
// - 'open-url' : clic sur une notification alors que l'app est ouverte → on affiche la vue du rappel,
//   sauf si une fenêtre est ouverte (saisie en cours) : l'app est alors seulement remise au premier plan
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (event) => {
    const d = event.data || {};
    if (d.tag && typeof d.tag === 'string') _markReminderShown(d.tag);
    if (d.type !== 'open-url' || !d.url) return;
    let view = '';
    try { view = new URL(d.url).searchParams.get('view') || ''; } catch (e) { return; }
    if (!view || !VIEWS[view] || view === 'recipe' || view === state.currentView) return;
    if (_isOverlayOpen('cooking') || Object.keys(_OVERLAY_ELEMENT_IDS).some(_isOverlayOpen)) return;
    navigateTo(view);
  });
}

// App ouverte en touchant une notification (sw.js ajoute ?rem=<tag>) : ce rappel est déjà affiché
try {
  const remTag = new URLSearchParams(location.search).get('rem');
  if (remTag) _markReminderShown(remTag);
} catch (e) { /* adresse sans paramètre */ }

// Au démarrage : vérification de l'abonnement push une fois l'app chargée et synchronisée
window.addEventListener('load', () => setTimeout(() => reconcilePushSubscription(true), 8000));
