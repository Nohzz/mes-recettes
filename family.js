// ============================================
// LA MAISONNÉE — Famille : membres, création / jonction, invitation, appareils
// ============================================
// Membres = profils (prénom + couleur + emoji), y compris ceux qui n'ont pas de téléphone (enfants).
// Ils servent à assigner les événements et les dépenses. Synchronisés comme les autres documents
// (kind 'members'). Le lien appareil ↔ membre (« C'est moi ») est tenu côté serveur (set_my_member).
//
// Script classique chargé après app.js et sync.js.

const MEMBERS_STORAGE_KEY = 'mr_members';
const SYNC_GUIDE_URL = 'https://github.com/Nohzz/mes-recettes/blob/main/SYNC-GUIDE.md';

let _pendingInvite = null;   // invitation reçue par lien (#join=…), en attente de « Rejoindre »
let _familyBusy = '';        // action réseau en cours ('create' | 'join' | …) : boutons désactivés
let _familyDevices = null;   // dernière liste des appareils (vue Famille)
let _familyShowJoinProject = false; // afficher les champs projet dans « Rejoindre » (code nu)

// ============================================
// Membres
// ============================================

function loadMembers() {
  try {
    const raw = localStorage.getItem(MEMBERS_STORAGE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    state.members = Array.isArray(list) ? list.filter(m => m && m.id && m.name) : [];
  } catch (e) {
    state.members = [];
  }
}

function saveMembers() {
  return safeSave(MEMBERS_STORAGE_KEY, state.members, 'membres');
}

function getMember(id) {
  return state.members.find(m => m.id === id) || null;
}

function _nextMemberColor() {
  const used = new Set(state.members.map(m => m.color));
  const free = MEMBER_COLORS.find(c => !used.has(c.id));
  return (free || MEMBER_COLORS[state.members.length % MEMBER_COLORS.length]).id;
}

// Crée ou met à jour un membre. opts.skipDirty : ne pas programmer de push (création de famille)
function upsertMember(input, opts) {
  const existing = input && input.id ? getMember(input.id) : null;
  const name = String((input && input.name) || '').trim().slice(0, 30) || 'Membre';
  const color = MEMBER_COLORS.some(c => c.id === (input && input.color)) ? input.color : (existing ? existing.color : _nextMemberColor());
  const member = {
    ...(existing || {}),
    id: (existing && existing.id) || (input && input.id) || 'm_' + uid(),
    name,
    color,
    emoji: clipEmoji(input && 'emoji' in input ? input.emoji : existing && existing.emoji),
    updatedAt: Date.now()
  };
  const i = state.members.findIndex(m => m.id === member.id);
  if (i >= 0) state.members[i] = member; else state.members.push(member);
  saveMembers();
  if (!(opts && opts.skipDirty)) markDirty('members', member.id);
  return member;
}

async function deleteMember(id) {
  const m = getMember(id);
  if (!m) return false;
  if (!(await uiConfirm(`Retirer ${m.name} des membres de la famille ?`, { confirmLabel: 'Retirer', danger: true }))) return false;
  state.members = state.members.filter(x => x.id !== id);
  saveMembers();
  markDirty('members', id);
  if (state.sync.memberId === id) {
    try { await setMyMember(''); } catch (e) { console.warn('setMyMember', e); }
  }
  return true;
}

// Emoji saisi : au plus 2 caractères entiers (jamais coupé au milieu d'une paire UTF-16, que la base
// refuserait). Sert aussi aux catégories du budget.
function clipEmoji(value) {
  const s = String(value || '').trim();
  let out;
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    out = Array.from(new Intl.Segmenter('fr', { granularity: 'grapheme' }).segment(s), x => x.segment).slice(0, 2).join('');
  } else {
    out = Array.from(s).slice(0, 4).join('');
  }
  return typeof out.toWellFormed === 'function' ? out.toWellFormed() : out;
}

// Couleur d'un membre, validée (la valeur vient de données synchronisées et finit dans un style inline)
function memberColorId(member) {
  const c = member && member.color;
  return MEMBER_COLORS.some(x => x.id === c) ? c : 'm1';
}

// Pastille ronde : emoji ou initiale sur la couleur du membre
function memberAvatarHtml(member, size) {
  if (!member) return '';
  const label = member.emoji || (member.name || '?').trim().charAt(0).toUpperCase();
  return `<span class="member-avatar${size === 'sm' ? ' member-avatar-sm' : ''}" style="--member-color: var(--member-${memberColorId(member)})" title="${escapeHtml(member.name)}">${escapeHtml(label)}</span>`;
}

function _memberColorPickerHtml(selected) {
  return `<div class="member-color-picker" data-value="${escapeHtml(selected)}">
    ${MEMBER_COLORS.map(c => `<button type="button" class="member-color-chip${c.id === selected ? ' is-selected' : ''}"
      style="--member-color: var(--member-${c.id})" data-color="${c.id}" aria-label="${escapeHtml(c.label)}"
      onclick="pickMemberColor(this)"></button>`).join('')}
  </div>`;
}

function pickMemberColor(btn) {
  const picker = btn.closest('.member-color-picker');
  if (!picker) return;
  picker.querySelectorAll('.member-color-chip').forEach(b => b.classList.toggle('is-selected', b === btn));
  picker.dataset.value = btn.dataset.color;
  picker.dataset.touched = '1';
}
window.pickMemberColor = pickMemberColor;

function _pickerValue(container) {
  const picker = container && container.querySelector('.member-color-picker');
  return picker ? picker.dataset.value : '';
}

// --- Fiche d'un membre (bottom-sheet) ---

function openMemberEditor(id) {
  const m = id ? getMember(id) : null;
  openSheet('member-editor', `
    <div class="modal-header">
      <h2>${m ? 'Modifier le membre' : 'Nouveau membre'}</h2>
      <button class="icon-btn icon-btn-light" onclick="closeSheet('member-editor')" aria-label="Fermer">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 18L18 6M6 6l12 12" stroke-linecap="round"/></svg>
      </button>
    </div>
    <div class="sheet-body" id="member-editor-body">
      <label class="family-label" for="member-name">Prénom</label>
      <input id="member-name" class="family-input" value="${escapeHtml(m ? m.name : '')}" maxlength="30" autocomplete="off" placeholder="Ex. Léo">
      <span class="family-label">Couleur</span>
      ${_memberColorPickerHtml(m ? m.color : _nextMemberColor())}
      <label class="family-label" for="member-emoji">Emoji (facultatif)</label>
      <input id="member-emoji" class="family-input family-input-short" value="${escapeHtml((m && m.emoji) || '')}" maxlength="16" autocomplete="off" placeholder="🙂">
      <div class="sheet-actions">
        ${m ? `<button class="btn-danger" onclick="deleteMemberFromEditor(${_jsArg(m.id)})">Retirer</button>` : ''}
        <button class="btn-primary" onclick="saveMemberFromEditor(${m ? _jsArg(m.id) : 'null'})">Enregistrer</button>
      </div>
    </div>`);
  setTimeout(() => { const el = document.getElementById('member-name'); if (el && !m) el.focus(); }, 60);
}
window.openMemberEditor = openMemberEditor;

function saveMemberFromEditor(id) {
  const body = document.getElementById('member-editor-body');
  const name = (document.getElementById('member-name').value || '').trim();
  if (!name) {
    showToast('Indiquez un prénom', 'error');
    return;
  }
  upsertMember({ id: id || undefined, name, color: _pickerValue(body), emoji: document.getElementById('member-emoji').value });
  closeSheet('member-editor');
  if (state.currentView === 'family') renderFamilyView();
  if (state.currentView === 'hub') renderHub();
}
window.saveMemberFromEditor = saveMemberFromEditor;

async function deleteMemberFromEditor(id) {
  if (!(await deleteMember(id))) return;
  closeSheet('member-editor');
  if (state.currentView === 'family') renderFamilyView();
  if (state.currentView === 'hub') renderHub();
}
window.deleteMemberFromEditor = deleteMemberFromEditor;

// ============================================
// Vue Famille
// ============================================

VIEWS.family = { app: 'family', title: 'Famille', render: () => renderFamilyView() };

function openFamilyView(opts) {
  if (opts && opts.invite) _pendingInvite = opts.invite;
  if (state.currentView === 'family') renderFamilyView();
  else navigateTo('family');
}
window.openFamilyView = openFamilyView;

// Rafraîchir la vue quand le statut de sync change (appelé par sync.js) : en entrant dans l'état
// « à reconnecter » (ou en en sortant), les cartes changent (Rejoindre / Inviter)
let _familyRenderedAuth = null;
function onSyncStatusChange(status) {
  if (state.currentView !== 'family' || _familyBusy) return;
  if (syncEnabled() && (status === 'auth') !== _familyRenderedAuth) renderFamilyView();
  else _renderFamilyStatus();
}

function _familyErrorText(e) {
  const msg = (e && e.message) || '';
  if (e && e.kind === 'offline') return 'Pas de réseau : réessayez une fois connecté.';
  if (e && e.kind === 'timeout') return 'Le serveur Supabase ne répond pas. Réessayez.';
  if (/anonymous/i.test(msg) || (e && e.code === 'anonymous_provider_disabled')) {
    return 'Les connexions anonymes ne sont pas activées dans Supabase (Authentication → Sign In / Providers → Anonymous).';
  }
  if (e && (e.code === 'PGRST202' || e.code === '42883' || /function .* does not exist|Could not find the function/i.test(msg))) {
    return "Le schéma SQL de La Maisonnée n'est pas installé dans ce projet Supabase (voir le mode d'emploi).";
  }
  if (e && e.code === '42P01') return "Les tables de La Maisonnée sont absentes du projet Supabase (voir le mode d'emploi).";
  if (e && e.status === 401) return 'Clé publique Supabase refusée : vérifiez la clé (publishable / anon).';
  return msg || 'Erreur inattendue';
}

function _familyStatusText() {
  const s = state.sync;
  if (s.status === 'syncing') return '⟳ Synchronisation en cours…';
  if (s.status === 'offline') return '📡 Hors ligne : les modifications partiront au retour du réseau.';
  if (s.status === 'auth') return '⚠️ ' + (s.statusMessage || "Cet appareil doit rejoindre à nouveau la famille.");
  if (s.status === 'error') return '⚠️ ' + (s.statusMessage || 'Erreur de synchronisation.');
  const pending = syncPendingCount();
  const rejected = syncRejectedCount();
  const last = s.lastSync ? 'dernière synchro ' + formatRelativeDate(new Date(s.lastSync)) : 'pas encore synchronisé';
  return (pending ? `⏳ ${pending} modification${pending > 1 ? 's' : ''} à envoyer · ` : '✓ ') + last +
    (rejected ? ` · ⚠️ ${rejected} élément${rejected > 1 ? 's' : ''} refusé${rejected > 1 ? 's' : ''} par le serveur` +
      ` (${syncRejectedLabels(3).join(', ')}${rejected > 3 ? '…' : ''}) : à modifier pour réessayer` : '');
}

// Hôte d'une URL de projet (affiché avant de rejoindre : un lien d'invitation impose un serveur)
function _hostOf(url) {
  try { return new URL(url).host; } catch (e) { return String(url || ''); }
}

function _renderFamilyStatus() {
  const el = document.getElementById('family-status-text');
  if (el) {
    el.textContent = _familyStatusText();
    el.className = 'family-status family-status-' + (state.sync.status || 'idle');
  }
}

function _formatInviteCode(code) {
  return String(code || '').replace(/(.{4})(?=.)/g, '$1-');
}

function _membersCardHtml(configured) {
  const me = state.sync.memberId;
  const rows = state.members.length
    ? state.members.map(m => `
        <button class="family-member-row" onclick="openMemberEditor(${_jsArg(m.id)})">
          ${memberAvatarHtml(m)}
          <span class="family-member-name">${escapeHtml(m.name)}</span>
          ${configured && m.id === me ? '<span class="family-badge">cet appareil</span>' : ''}
          <span class="family-chevron" aria-hidden="true">›</span>
        </button>`).join('')
    : '<p class="family-hint">Aucun membre pour l\'instant. Ajoutez chaque personne de la famille, même sans téléphone : vous pourrez lui assigner des événements.</p>';
  const meSelect = configured ? `
      <label class="family-label" for="family-me-select">Cet appareil appartient à</label>
      <select id="family-me-select" class="settings-select" onchange="familySetMe(this.value)">
        <option value="">— Choisir —</option>
        ${state.members.map(m => `<option value="${escapeHtml(m.id)}"${m.id === me ? ' selected' : ''}>${escapeHtml(m.name)}</option>`).join('')}
      </select>` : '';
  return `
    <section class="family-card">
      <h3 class="family-card-title">Membres</h3>
      <div class="family-members">${rows}</div>
      <button class="btn-secondary btn-block" onclick="openMemberEditor()">+ Ajouter un membre</button>
      ${meSelect}
    </section>`;
}

function _joinCardHtml() {
  const inv = _pendingInvite;
  const inviteText = inv ? (inv.url ? buildInviteLinkFrom(inv) : inv.code) : '';
  const needProject = _familyShowJoinProject || (inv && !inv.url && !state.sync.url);
  const busy = _familyBusy === 'join';
  return `
    <section class="family-card${inv ? ' is-highlighted' : ''}">
      <h3 class="family-card-title">Rejoindre une famille</h3>
      ${inv && inv.name ? `<p class="family-invite-from">Invitation : famille « ${escapeHtml(inv.name)} »</p>` : ''}
      ${inv && inv.url ? `<p class="family-hint">Projet : ${escapeHtml(_hostOf(inv.url))}</p>` : ''}
      <p class="family-hint">Quelqu'un de la famille vous a envoyé un lien d'invitation ? Collez-le ici (ou son code).</p>
      <textarea id="family-invite-input" class="family-input" rows="2" placeholder="Lien ou code d'invitation" autocapitalize="off" spellcheck="false">${escapeHtml(inviteText)}</textarea>
      <div class="family-project-fields${needProject ? '' : ' hidden'}">
        <label class="family-label" for="family-join-url">URL du projet Supabase de la famille</label>
        <input id="family-join-url" class="family-input" value="${escapeHtml(state.sync.url || '')}" placeholder="https://xxxx.supabase.co" autocapitalize="off" spellcheck="false">
        <label class="family-label" for="family-join-key">Clé publique (publishable / anon)</label>
        <input id="family-join-key" class="family-input" value="${escapeHtml(state.sync.key || '')}" placeholder="sb_publishable_…" autocapitalize="off" spellcheck="false">
      </div>
      <button class="btn-primary btn-block" onclick="familyJoin()"${busy ? ' disabled' : ''}>${busy ? 'Connexion…' : 'Rejoindre la famille'}</button>
    </section>`;
}

// Lien d'invitation à partir d'une invitation déjà décodée (pré-remplissage du champ)
function buildInviteLinkFrom(inv) {
  const payload = { u: inv.url, k: inv.key, c: inv.code, n: inv.name || '' };
  const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(payload)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return location.origin + location.pathname + '#join=' + b64;
}

function _createCardHtml() {
  const busy = _familyBusy === 'create';
  const legacy = state.sync.foyer && localStorage.getItem(SYNC_KEYS.legacyImported) !== state.sync.foyer;
  return `
    <section class="family-card">
      <h3 class="family-card-title">Créer la famille</h3>
      <p class="family-hint">Sur le premier téléphone. Il faut un projet Supabase gratuit, préparé une fois : <a href="${SYNC_GUIDE_URL}" target="_blank" rel="noopener">mode d'emploi</a>.</p>
      <label class="family-label" for="family-create-url">URL du projet Supabase</label>
      <input id="family-create-url" class="family-input" value="${escapeHtml(state.sync.url || '')}" placeholder="https://xxxx.supabase.co" autocapitalize="off" spellcheck="false">
      <label class="family-label" for="family-create-key">Clé publique (publishable / anon)</label>
      <input id="family-create-key" class="family-input" value="${escapeHtml(state.sync.key || '')}" placeholder="sb_publishable_…" autocapitalize="off" spellcheck="false">
      <label class="family-label" for="family-create-name">Nom de la famille</label>
      <input id="family-create-name" class="family-input" placeholder="Ex. Famille Martin" maxlength="40">
      <label class="family-label" for="family-create-me">Votre prénom</label>
      <input id="family-create-me" class="family-input" placeholder="Ex. Victor" maxlength="30">
      <span class="family-label">Votre couleur</span>
      ${_memberColorPickerHtml(_nextMemberColor())}
      ${legacy ? `<p class="family-note">📦 Une ancienne synchronisation (code foyer) est configurée sur cet appareil : ses données seront récupérées et partagées dans la nouvelle famille. L'ancienne base n'est pas modifiée.</p>` : ''}
      <button class="btn-secondary btn-block" onclick="exportAllData()">📥 Télécharger d'abord une sauvegarde</button>
      <button class="btn-primary btn-block" onclick="familyCreate()"${busy ? ' disabled' : ''}>${busy ? 'Création…' : 'Créer la famille'}</button>
    </section>`;
}

function _inviteCardHtml() {
  const s = state.sync;
  const expired = s.inviteExpiresAt && Date.parse(s.inviteExpiresAt) < Date.now();
  const until = s.inviteExpiresAt ? new Date(s.inviteExpiresAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }) : '';
  const busy = _familyBusy === 'invite';
  return `
    <section class="family-card">
      <h3 class="family-card-title">Inviter un proche</h3>
      ${s.inviteCode && !expired ? `
        <p class="family-invite-code">${escapeHtml(_formatInviteCode(s.inviteCode))}</p>
        <p class="family-hint">Valable jusqu'au ${escapeHtml(until)}. Sur iPhone : installer d'abord l'app (Partager → « Sur l'écran d'accueil »), l'ouvrir, puis coller le lien dans « Rejoindre une famille ».</p>
        <button class="btn-primary btn-block" onclick="familyShareInvite()">Partager le lien d'invitation</button>`
      : `<p class="family-hint">${expired ? 'Le code d\'invitation a expiré.' : 'Pas de code d\'invitation actif.'}</p>`}
      <button class="btn-secondary btn-block" onclick="familyRegenerateInvite()"${busy ? ' disabled' : ''}>${busy ? 'Génération…' : 'Générer un nouveau code'}</button>
    </section>`;
}

function _devicesCardHtml() {
  const list = _familyDevices;
  const isAdmin = state.sync.role === 'admin';
  const rows = !list
    ? '<p class="family-hint">Chargement des appareils…</p>'
    : list.map(d => {
      const member = getMember(d.member_id);
      const isMe = d.user_id === state.sync.userId;
      const since = d.joined_at ? new Date(d.joined_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
      return `<div class="family-device-row">
        ${member ? memberAvatarHtml(member, 'sm') : '<span class="member-avatar member-avatar-sm member-avatar-empty">?</span>'}
        <div class="family-device-text">
          <span class="family-device-name">${escapeHtml(d.device_label || 'Appareil')}${member ? ' · ' + escapeHtml(member.name) : ''}${isMe ? ' <span class="family-badge">cet appareil</span>' : ''}</span>
          <span class="family-device-meta">${d.role === 'admin' ? 'Administrateur · ' : ''}depuis le ${escapeHtml(since)}</span>
        </div>
        ${isAdmin && !isMe ? `<button class="btn-link" onclick="familyRemoveDevice(${_jsArg(d.user_id)})">Retirer</button>` : ''}
      </div>`;
    }).join('');
  return `
    <section class="family-card">
      <h3 class="family-card-title">Appareils de la famille</h3>
      <div class="family-devices">${rows}</div>
    </section>`;
}

function renderFamilyView() {
  const el = document.getElementById('family-content');
  if (!el) return;
  const configured = syncEnabled();
  if (!configured) {
    el.innerHTML = `
      <div class="family-intro">
        <p class="family-intro-emoji" aria-hidden="true">👪</p>
        <p class="family-intro-text">Partagez recettes, courses, calendrier et budget entre les téléphones de la famille.</p>
      </div>
      ${_joinCardHtml()}
      ${_createCardHtml()}
      ${_membersCardHtml(false)}
      <p class="family-footnote">Sans famille, tout reste sur cet appareil.</p>`;
    return;
  }
  const s = state.sync;
  _familyRenderedAuth = s.status === 'auth';
  el.innerHTML = `
    <section class="family-card family-head">
      <div class="family-name-row">
        <h2 class="family-name">${escapeHtml(s.householdName || 'Ma famille')}</h2>
        <button class="icon-btn icon-btn-light" onclick="familyRename()" aria-label="Renommer la famille">✏️</button>
      </div>
      <p id="family-status-text" class="family-status"></p>
      <button class="btn-secondary btn-block" onclick="performSync(false)">Synchroniser maintenant</button>
    </section>
    ${s.status === 'auth' ? _joinCardHtml() : ''}
    ${_membersCardHtml(true)}
    ${s.status === 'auth' ? '' : _inviteCardHtml()}
    ${_devicesCardHtml()}
    <details class="family-danger">
      <summary>Quitter la famille sur cet appareil</summary>
      <p class="family-hint">Les données restent sur ce téléphone, mais il ne se synchronise plus avec la famille.</p>
      <button class="btn-danger btn-block" onclick="familyLeave()">Quitter la famille</button>
    </details>`;
  _renderFamilyStatus();
  if (!_familyDevices) _loadFamilyDevices();
}

async function _loadFamilyDevices() {
  try {
    _familyDevices = await listFamilyDevices();
  } catch (e) {
    _familyDevices = [];
    console.warn('Appareils de la famille', e);
  }
  if (state.currentView === 'family') renderFamilyView();
}

// --- Actions ---

function _val(id) {
  const el = document.getElementById(id);
  return el ? el.value.trim() : '';
}

async function familyJoin() {
  if (_familyBusy) return;
  const inv = parseInvite(_val('family-invite-input'));
  if (!inv) {
    showToast("Lien ou code d'invitation invalide", 'error');
    return;
  }
  const url = inv.url || _val('family-join-url') || state.sync.url;
  const key = inv.key || _val('family-join-key') || state.sync.key;
  if (!url || !key) {
    _pendingInvite = inv;
    _familyShowJoinProject = true;
    renderFamilyView();
    showToast('Indiquez le projet Supabase de la famille (ou utilisez le lien complet)', 'error');
    return;
  }
  const host = _hostOf(url);
  const configuredUrl = state.sync.url;
  if (configuredUrl && normalizeSupabaseUrl(url) !== configuredUrl) {
    if (!(await uiConfirm(`Ce lien relie le téléphone à un autre projet Supabase (${host}) que celui configuré (${_hostOf(configuredUrl)}). Les données de ce téléphone y seront envoyées. Continuer ?`,
      { title: 'Autre projet', confirmLabel: 'Rejoindre quand même', danger: true }))) return;
  } else if (!/\.supabase\.co$/i.test(host) && !/^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host)) {
    if (!(await uiConfirm(`Ce lien mène à un serveur qui n'est pas hébergé par Supabase (${host}). Les données de ce téléphone y seront envoyées : ne continuez que si vous connaissez ce serveur.`,
      { title: 'Serveur inhabituel', confirmLabel: 'Rejoindre quand même', danger: true }))) return;
  } else if (!configuredUrl && inv.url && !(_pendingInvite && _pendingInvite.url === inv.url)) {
    // Lien collé sur un téléphone sans projet : le projet visé n'a pas été affiché sur la carte
    if (!(await uiConfirm(`Rejoindre${inv.name ? ' la famille « ' + inv.name + ' »' : ''} sur le projet ${host} ? Les données de ce téléphone y seront envoyées.`,
      { title: 'Rejoindre une famille', confirmLabel: 'Rejoindre' }))) return;
  }
  _familyBusy = 'join';
  // Bouton désactivé sur place, sans redessiner : en cas d'échec, le lien collé reste dans le champ
  const joinInput = document.getElementById('family-invite-input');
  const btn = joinInput && joinInput.closest('.family-card') && joinInput.closest('.family-card').querySelector('.btn-primary');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Connexion…';
  }
  let joined = false;
  try {
    const res = await joinFamily({ url, key, code: inv.code });
    joined = true;
    _pendingInvite = null;
    _familyShowJoinProject = false;
    _familyDevices = null;
    if (typeof reconcilePushSubscription === 'function') reconcilePushSubscription(true); // nouvelle identité
    showToast(`Bienvenue dans « ${res.name} » 👋 Indiquez qui vous êtes.`, 'success');
  } catch (e) {
    showToast(_familyErrorText(e), 'error');
  } finally {
    _familyBusy = '';
    if (joined || !btn || !btn.isConnected) {
      if (state.currentView === 'family') renderFamilyView();
    } else {
      btn.disabled = false;
      btn.textContent = 'Rejoindre la famille';
    }
  }
  const select = document.getElementById('family-me-select');
  if (select && syncEnabled() && !state.sync.memberId) select.focus();
}
window.familyJoin = familyJoin;

async function familyCreate() {
  if (_familyBusy) return;
  const card = document.getElementById('family-create-me') && document.getElementById('family-create-me').closest('.family-card');
  const meName = _val('family-create-me');
  if (!meName) {
    showToast('Indiquez votre prénom', 'error');
    return;
  }
  const existing = state.members.find(m => m.name.toLowerCase() === meName.toLowerCase());
  // Prénom déjà présent dans les membres : il garde sa couleur (sauf choix explicite) et son emoji
  const picker = card && card.querySelector('.member-color-picker');
  const color = existing && !(picker && picker.dataset.touched) ? existing.color : (_pickerValue(card) || _nextMemberColor());
  const member = { id: existing ? existing.id : undefined, name: meName, color };
  _familyBusy = 'create';
  const url = _val('family-create-url'), key = _val('family-create-key'), familyName = _val('family-create-name');
  // Bouton désactivé sur place, sans redessiner : en cas d'échec, la saisie reste
  const btn = card && card.querySelector('.btn-primary');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Création…';
  }
  try {
    const res = await createFamily({ url, key, familyName: familyName || 'Ma famille', member });
    _familyDevices = null;
    if (typeof reconcilePushSubscription === 'function') reconcilePushSubscription(true);
    const imported = res.imported ? ` · ancienne sync : ${res.imported.recipes} recette(s), ${res.imported.meals} repas, ${res.imported.lists} liste(s) récupérés` : '';
    if (res.synced) {
      showToast(`Famille créée ✓ ${res.pushed} élément${res.pushed > 1 ? 's' : ''} partagé${res.pushed > 1 ? 's' : ''}${imported}`, 'success');
    } else {
      showToast("Famille créée ✓ L'envoi de vos données reprendra automatiquement dès que possible.", 'success');
    }
  } catch (e) {
    showToast(_familyErrorText(e), 'error');
  } finally {
    _familyBusy = '';
    if (syncEnabled() || !btn || !btn.isConnected) { // famille configurée (même si la suite a échoué)
      if (state.currentView === 'family') renderFamilyView();
    } else {
      btn.disabled = false;
      btn.textContent = 'Créer la famille';
    }
  }
}
window.familyCreate = familyCreate;

async function familySetMe(memberId) {
  try {
    await setMyMember(memberId);
    _familyDevices = null;
    renderFamilyView();
  } catch (e) {
    showToast(_familyErrorText(e), 'error');
  }
}
window.familySetMe = familySetMe;

async function familyRename() {
  const name = await uiPrompt('Nom de la famille :', state.sync.householdName || '');
  if (!name || !name.trim()) return;
  try {
    await renameFamily(Array.from(name.trim()).slice(0, 40).join(''));
    renderFamilyView();
  } catch (e) {
    showToast(_familyErrorText(e), 'error');
  }
}
window.familyRename = familyRename;

async function familyShareInvite() {
  const link = buildInviteLink();
  const text = `Rejoins la famille « ${state.sync.householdName} » sur La Maisonnée :`;
  if (navigator.share) {
    try {
      await navigator.share({ title: 'La Maisonnée', text, url: link });
      return;
    } catch (e) {
      if (e && e.name === 'AbortError') return; // partage annulé
    }
  }
  try {
    await navigator.clipboard.writeText(link);
    showToast("Lien d'invitation copié ✓", 'success');
  } catch (e) {
    await uiPrompt("Copiez le lien d'invitation :", link);
  }
}
window.familyShareInvite = familyShareInvite;

async function familyRegenerateInvite() {
  if (_familyBusy) return;
  _familyBusy = 'invite';
  renderFamilyView();
  try {
    await regenerateInvite();
    showToast("Nouveau code d'invitation ✓", 'success');
  } catch (e) {
    showToast(_familyErrorText(e), 'error');
  } finally {
    _familyBusy = '';
    renderFamilyView();
  }
}
window.familyRegenerateInvite = familyRegenerateInvite;

async function familyRemoveDevice(userId) {
  if (!(await uiConfirm('Retirer cet appareil de la famille ? Il ne pourra plus synchroniser (ses données locales restent sur le téléphone).', { confirmLabel: 'Retirer', danger: true }))) return;
  try {
    await removeFamilyDevice(userId);
    _familyDevices = null;
    renderFamilyView();
    showToast('Appareil retiré', 'success');
  } catch (e) {
    showToast(_familyErrorText(e), 'error');
  }
}
window.familyRemoveDevice = familyRemoveDevice;

async function familyLeave() {
  if (!(await uiConfirm('Quitter la famille sur cet appareil ? Les données restent sur ce téléphone, mais ne sont plus synchronisées.', { confirmLabel: 'Quitter', danger: true }))) return;
  // Modifications pas encore envoyées : dernier essai, puis confirmation avant de les abandonner
  if (syncPendingCount() > 0) await performSync(false);
  if (_syncSession && !navigator.onLine) {
    showToast('Impossible de quitter la famille sans réseau : réessayez une fois connecté.', 'error');
    return;
  }
  const pending = syncPendingCount();
  if (pending > 0 && !(await uiConfirm(`${pending} modification${pending > 1 ? 's n\'ont' : ' n\'a'} pas pu être envoyée${pending > 1 ? 's' : ''} à la famille et ser${pending > 1 ? 'ont' : 'a'} perdue${pending > 1 ? 's' : ''} pour elle. Quitter quand même ?`,
    { confirmLabel: 'Quitter quand même', danger: true }))) return;
  try {
    await leaveFamily();
  } catch (e) {
    if (!navigator.onLine) {
      showToast('Impossible de quitter la famille sans réseau : réessayez une fois connecté.', 'error');
      return;
    }
    // Le serveur de la famille ne répond pas ou refuse (projet supprimé…) : sinon, le téléphone resterait
    // bloqué dans la famille. Départ sur cet appareil seulement, s'il est confirmé.
    const unreachable = e && (e.kind === 'offline' || e.kind === 'timeout');
    const cause = unreachable
      ? "Le serveur de la famille est injoignable (réseau sans accès Internet, serveur en panne ou projet supprimé). Si c'est passager, annulez et réessayez plus tard."
      : `Le serveur de la famille a répondu par une erreur (${_familyErrorText(e)}).`;
    const after = state.sync.role === 'admin'
      ? " Cet appareil est administrateur : s'il est le seul, personne ne pourra le retirer depuis l'app (voir le dépannage du mode d'emploi)."
      : " Il restera inscrit côté serveur jusqu'à ce qu'un administrateur le retire.";
    if (!(await uiConfirm(`${cause} Quitter quand même sur cet appareil seulement ?${after}`,
      { title: 'Serveur injoignable', confirmLabel: 'Quitter sur cet appareil', danger: true }))) return;
    try {
      await leaveFamily({ localOnly: true });
    } catch (e2) {
      showToast(_familyErrorText(e2), 'error');
      return;
    }
  }
  _familyDevices = null;
  renderFamilyView();
  showToast('Cet appareil a quitté la famille');
}
window.familyLeave = familyLeave;

// ============================================
// Réglages : section « Famille »
// ============================================

function renderSettingsFamilySection() {
  const status = document.getElementById('settings-family-status');
  const syncBtn = document.getElementById('settings-sync-now');
  const configured = syncEnabled();
  if (status) {
    if (configured) {
      const me = getMember(state.sync.memberId);
      status.textContent = `Famille « ${state.sync.householdName || 'Ma famille'} »${me ? ' · cet appareil : ' + me.name : ''}`;
    } else if (state.sync.foyer) {
      status.textContent = "L'ancienne synchronisation par code foyer est remplacée par la famille : créez-la pour continuer à partager vos données.";
    } else {
      status.textContent = "Cet appareil n'est relié à aucune famille.";
    }
  }
  if (syncBtn) syncBtn.classList.toggle('hidden', !configured);
}

// ============================================
// Lien d'invitation à l'ouverture de l'app (#join=…)
// ============================================
// Appelé par init() : ouvre directement « Rejoindre une famille » pré-rempli (même sur un appareil
// neuf : l'écran de clé API est alors passé, elle reste ajoutable plus tard dans les Paramètres).
function handleInviteLinkAtBoot() {
  if (!/#join=/.test(location.hash)) return false;
  const inv = parseInvite(location.hash);
  history.replaceState(history.state, '', location.pathname + location.search);
  if (!inv) return false;
  _pendingInvite = inv;
  if (!localStorage.getItem(STORAGE_KEYS.onboarded)) localStorage.setItem(STORAGE_KEYS.onboarded, '1');
  _showLaunchView('family');
  return true;
}
