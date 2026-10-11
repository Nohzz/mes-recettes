// ============================================
// LA MAISONNÉE — Mémos de l'accueil
// ============================================
// Petites notes partagées par la famille (« Acheter du pain », « Rappeler la nounou »), avec un rappel
// facultatif à une date et une heure. Synchronisées (kind 'memos'). Un mémo terminé est supprimé
// (« Annuler » le recrée quelques secondes durant).
// Le rappel passe par le calcul commun des rappels (dueReminders, calendar.js) : memoReminderEvents()
// présente chaque mémo à rappeler comme un événement de type 'memo', de la même forme que les mémos lus
// par la fonction SQL maisonnee_reminder_candidates (supabase/push.sql) pour les notifications push.
//
// Script classique chargé après app.js, sync.js et family.js (avant reminders.js et hub.js).

const MEMOS_STORAGE_KEY = 'mr_memos';
const MEMO_MAX_LENGTH = 200;
const MEMO_UNDO_MS = 6000;

// Mémo : { id: 'memo_…', text, remindDate: 'YYYY-MM-DD' | '', remindTime: 'HH:MM' | '', memberIds: [],
//   authorId, createdAt, updatedAt }. memberIds : pour qui (aucun = toute la famille), ciblage du rappel.
state.memos = [];

function _isValidMemo(m) {
  return !!m && typeof m === 'object' && typeof m.id === 'string' && m.id !== '' &&
    typeof m.text === 'string' && m.text.trim() !== '';
}

function loadMemos() {
  try {
    const list = JSON.parse(localStorage.getItem(MEMOS_STORAGE_KEY) || '[]');
    state.memos = Array.isArray(list) ? list.filter(_isValidMemo) : [];
  } catch (e) {
    state.memos = [];
  }
}

function saveMemos() {
  return safeSave(MEMOS_STORAGE_KEY, state.memos, 'mémos');
}

SYNC_COLLECTIONS.memos = {
  list: () => state.memos,
  get: id => state.memos.find(m => m.id === id),
  put: doc => (_isValidMemo(doc) ? syncPutInPlace(state.memos, doc) : false),
  remove: id => {
    const before = state.memos.length;
    state.memos = state.memos.filter(m => m.id !== id);
    return state.memos.length !== before;
  },
  save: () => saveMemos(),
  time: doc => doc.updatedAt || doc.createdAt || 0
};

function memoHasReminder(m) {
  return /^\d{4}-\d{2}-\d{2}$/.test(m.remindDate || '') && /^\d{2}:\d{2}$/.test(m.remindTime || '');
}

// Mémos à rappeler, sous forme d'événements de type 'memo' (un rappel, à l'heure dite) pour dueReminders
function memoReminderEvents() {
  return state.memos.filter(m => _isValidMemo(m) && memoHasReminder(m)).map(m => ({
    id: m.id, type: 'memo', title: m.text.slice(0, 120), location: '',
    date: m.remindDate, start: m.remindTime, allDay: false, exdates: [],
    memberIds: Array.isArray(m.memberIds) ? m.memberIds : [], ownerIds: [], reminders: [0]
  }));
}

function _memoSave(memo) {
  const now = Date.now();
  memo.updatedAt = now;
  if (!memo.createdAt) memo.createdAt = now;
  const i = state.memos.findIndex(m => m.id === memo.id);
  if (i >= 0) state.memos[i] = memo; else state.memos.push(memo);
  saveMemos();
  markDirty('memos', memo.id);
}

function _memoRemove(id) {
  state.memos = state.memos.filter(m => m.id !== id);
  saveMemos();
  markDirty('memos', id);
}

function _memoRefresh() {
  if (state.currentView === 'hub' && typeof renderHub === 'function') renderHub();
}

// « Aujourd'hui 18:00 », « Demain 9:00 », « lun. 12 oct. 18:00 »
function _memoWhenLabel(m) {
  const today = calendarToday();
  const day = m.remindDate === today ? "Aujourd'hui"
    : m.remindDate === shiftDate(today, 1) ? 'Demain'
      : m.remindDate === shiftDate(today, -1) ? 'Hier'
        : _fmtDate(m.remindDate, { weekday: 'short', day: 'numeric', month: 'short' });
  return `${day} ${m.remindTime}`;
}

function _memoIsPast(m) {
  const now = new Date();
  const nowKey = calendarToday() + 'T' + String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
  return memoHasReminder(m) && `${m.remindDate}T${m.remindTime}` < nowKey;
}

// Rappels à venir d'abord (le plus proche en premier), puis les autres, du plus récent au plus ancien
function _memosSorted() {
  return state.memos.filter(_isValidMemo).slice().sort((a, b) => {
    const ra = memoHasReminder(a) && !_memoIsPast(a), rb = memoHasReminder(b) && !_memoIsPast(b);
    if (ra !== rb) return ra ? -1 : 1;
    if (ra) return `${a.remindDate}T${a.remindTime}`.localeCompare(`${b.remindDate}T${b.remindTime}`);
    return (b.createdAt || 0) - (a.createdAt || 0);
  });
}

// ============================================
// Carte « Mémos » de l'accueil
// ============================================

let _memoUndo = null; // { memo, timer } : mémo terminé à l'instant, qu'« Annuler » recrée

function memosHubCardHtml() {
  const rows = _memosSorted().map(m => {
    const author = m.authorId ? getMember(m.authorId) : null;
    const forWho = (m.memberIds || []).map(getMember).filter(Boolean);
    const sub = [
      memoHasReminder(m) ? `<span class="memo-when${_memoIsPast(m) ? ' is-past' : ''}">🔔 ${escapeHtml(_memoWhenLabel(m))}</span>` : '',
      forWho.length ? `<span>pour ${escapeHtml(forWho.map(x => x.name).join(', '))}</span>` : ''
    ].filter(Boolean).join(' · ');
    return `<div class="memo-row">
      <button class="memo-check" onclick="memoDone(${_jsArg(m.id)})" aria-label="Terminé : ${escapeHtml(m.text)}"></button>
      <button class="memo-main" onclick="openMemoEditor(${_jsArg(m.id)})">
        <span class="memo-text">${escapeHtml(m.text)}</span>
        ${sub ? `<span class="memo-sub">${sub}</span>` : ''}
      </button>
      ${author ? memberAvatarHtml(author, 'sm') : ''}
    </div>`;
  }).join('');
  const undo = _memoUndo
    ? `<div class="memo-undo"><span>« ${escapeHtml(_memoUndo.memo.text.slice(0, 40))} » terminé</span><button class="btn-link" onclick="memoUndo()">Annuler</button></div>`
    : '';
  return `<section class="hub-card memo-card">
      <div class="memo-card-head">
        <h3 class="hub-card-title">📝 Mémos</h3>
        <button class="hub-card-action memo-new" onclick="openMemoEditor()">🔔 Avec rappel</button>
      </div>
      ${rows ? `<div class="memo-list">${rows}</div>` : '<p class="hub-empty">Une chose à ne pas oublier ? Note-la ici, toute la famille la verra.</p>'}
      ${undo}
      <form class="memo-add" onsubmit="memoQuickAdd(event)">
        <input id="memo-quick" class="family-input" maxlength="${MEMO_MAX_LENGTH}" placeholder="Ajouter un mémo…" autocomplete="off" enterkeyhint="done" aria-label="Nouveau mémo">
        <button type="submit" class="memo-add-btn" aria-label="Ajouter le mémo">+</button>
      </form>
    </section>`;
}

function memoQuickAdd(e) {
  if (e) e.preventDefault();
  const input = document.getElementById('memo-quick');
  const text = input ? input.value.trim().slice(0, MEMO_MAX_LENGTH) : '';
  if (!text) return;
  _memoSave({ id: 'memo_' + uid(), text, remindDate: '', remindTime: '', memberIds: [], authorId: state.sync.memberId || '' });
  input.value = ''; // renderHub garde le champ actif : le clavier reste ouvert pour en ajouter d'autres
  _memoRefresh();
}
window.memoQuickAdd = memoQuickAdd;

function memoDone(id) {
  const memo = state.memos.find(m => m.id === id);
  if (!memo) return;
  _memoRemove(id);
  if (_memoUndo) clearTimeout(_memoUndo.timer);
  _memoUndo = { memo, timer: setTimeout(() => { _memoUndo = null; _memoRefresh(); }, MEMO_UNDO_MS) };
  _memoRefresh();
}
window.memoDone = memoDone;

function memoUndo() {
  if (!_memoUndo) return;
  clearTimeout(_memoUndo.timer);
  const memo = _memoUndo.memo;
  _memoUndo = null;
  if (!state.memos.some(m => m.id === memo.id)) _memoSave({ ...memo });
  _memoRefresh();
}
window.memoUndo = memoUndo;

// ============================================
// Fiche d'un mémo (texte, rappel, pour qui)
// ============================================

let _memoEditing = null; // { memo (copie de travail), isNew }

function openMemoEditor(id) {
  const existing = id ? state.memos.find(m => m.id === id) : null;
  if (id && !existing) {
    showToast('Ce mémo a été supprimé', 'error');
    return;
  }
  const now = new Date();
  const me = state.sync.memberId && getMember(state.sync.memberId) ? state.sync.memberId : '';
  // Rappel proposé : l'heure pile suivante (demain 9 h s'il est tard)
  const late = now.getHours() >= 22;
  const defDate = late ? shiftDate(calendarToday(), 1) : calendarToday();
  const defTime = late ? '09:00' : String(now.getHours() + 1).padStart(2, '0') + ':00';
  const memo = existing ? { ...existing } : {
    id: 'memo_' + uid(), text: '', remindDate: defDate, remindTime: defTime,
    memberIds: me ? [me] : [], authorId: me
  };
  const withReminder = existing ? memoHasReminder(existing) : true;
  _memoEditing = { memo, isNew: !existing };
  const members = state.members.map(m => `<button type="button" class="cal-pick cal-pick-member${(memo.memberIds || []).includes(m.id) ? ' is-selected' : ''}" data-value="${escapeHtml(m.id)}" onclick="this.classList.toggle('is-selected')">${memberAvatarHtml(m, 'sm')} ${escapeHtml(m.name)}</button>`).join('');
  openSheet('memo-editor', `
    <div class="modal-header">
      <h2>${existing ? 'Mémo' : 'Nouveau mémo'}</h2>
      <button class="icon-btn icon-btn-light" onclick="closeSheet('memo-editor')" aria-label="Fermer">${_CAL_ICON_CLOSE}</button>
    </div>
    <div class="sheet-body">
      <textarea id="memo-text" class="family-input" rows="2" maxlength="${MEMO_MAX_LENGTH}" placeholder="Ex. Rappeler la nounou">${escapeHtml(memo.text || '')}</textarea>
      <label class="settings-toggle cal-toggle"><input type="checkbox" id="memo-remind"${withReminder ? ' checked' : ''} onchange="memoToggleReminder(this.checked)"><span>🔔 Me le rappeler</span></label>
      <div class="cal-row${withReminder ? '' : ' hidden'}" id="memo-remind-fields">
        <div class="cal-field"><label class="family-label" for="memo-date">Le</label><input type="date" id="memo-date" class="family-input" value="${escapeHtml(memo.remindDate || defDate)}"></div>
        <div class="cal-field"><label class="family-label" for="memo-time">À</label><input type="time" id="memo-time" class="family-input" value="${escapeHtml(memo.remindTime || defTime)}"></div>
      </div>
      ${members ? `<span class="family-label">Pour qui ? <small>(reçoit le rappel ; aucun = toute la famille)</small></span><div class="cal-picks" id="memo-members">${members}</div>` : ''}
      <p class="family-hint">Le rappel arrive en notification sur les téléphones concernés (notifications activées dans Paramètres → Calendrier), sinon à l'ouverture de l'app.</p>
      <div class="sheet-actions">
        ${existing ? '<button class="btn-danger" onclick="deleteMemoFromEditor()">Supprimer</button>' : ''}
        <button class="btn-primary" onclick="saveMemoFromEditor()">Enregistrer</button>
      </div>
    </div>`);
  setTimeout(() => { const el = document.getElementById('memo-text'); if (el && !existing) el.focus(); }, 60);
}
window.openMemoEditor = openMemoEditor;

function memoToggleReminder(checked) {
  const f = document.getElementById('memo-remind-fields');
  if (f) f.classList.toggle('hidden', !checked);
}
window.memoToggleReminder = memoToggleReminder;

function saveMemoFromEditor() {
  const e = _memoEditing;
  if (!e) return;
  const text = document.getElementById('memo-text').value.trim().slice(0, MEMO_MAX_LENGTH);
  if (!text) {
    showToast('Écris le mémo', 'error');
    return;
  }
  const remind = document.getElementById('memo-remind').checked;
  const remindDate = remind ? document.getElementById('memo-date').value : '';
  const remindTime = remind ? document.getElementById('memo-time').value : '';
  if (remind && (!/^\d{4}-\d{2}-\d{2}$/.test(remindDate) || !/^\d{2}:\d{2}$/.test(remindTime))) {
    showToast('Indique le jour et l\'heure du rappel', 'error');
    return;
  }
  // Un rappel déjà passé n'arriverait jamais (sauf s'il n'a pas changé : mémo ancien qu'on retouche)
  const changed = remindDate !== (e.memo.remindDate || '') || remindTime !== (e.memo.remindTime || '');
  if (remind && changed && _memoIsPast({ remindDate, remindTime })) {
    showToast("L'heure du rappel est déjà passée", 'error');
    return;
  }
  const box = document.getElementById('memo-members');
  const memo = {
    ...e.memo, text, remindDate, remindTime,
    memberIds: box ? [...box.querySelectorAll('.cal-pick.is-selected')].map(b => b.dataset.value).filter(id => getMember(id)) : (e.memo.memberIds || [])
  };
  _memoSave(memo);
  _memoEditing = null;
  closeSheet('memo-editor');
  _memoRefresh();
  showToast(remind ? `Mémo enregistré ✓ rappel ${_memoWhenLabel(memo).toLowerCase()}` : 'Mémo enregistré ✓', 'success');
}
window.saveMemoFromEditor = saveMemoFromEditor;

async function deleteMemoFromEditor() {
  const e = _memoEditing;
  if (!e) return;
  if (!(await uiConfirm('Supprimer ce mémo ?', { confirmLabel: 'Supprimer', danger: true }))) return;
  if (_memoEditing !== e) return; // fiche fermée ou remplacée pendant la confirmation
  _memoRemove(e.memo.id);
  _memoEditing = null;
  closeSheet('memo-editor');
  _memoRefresh();
  showToast('Mémo supprimé', 'success');
}
window.deleteMemoFromEditor = deleteMemoFromEditor;
