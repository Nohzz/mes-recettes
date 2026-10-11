// ============================================
// LA MAISONNÉE — Occasions : liste de souhaits et dépenses partagées d'un événement
// ============================================
// Depuis la fiche d'un événement déjà enregistré (anniversaire, vacances, sortie…) :
// - Liste de souhaits : idées de cadeaux (nom, lien, prix), qu'un membre réserve pour éviter les doublons.
// - Dépenses partagées : qui a payé quoi, partagé entre qui ; soldes et « Qui doit quoi ? » (le moins
//   de remboursements possible). « Remboursé » enregistre le remboursement comme une dépense.
// Ces dépenses sont à part du budget familial. Synchronisé en famille (kinds 'wishes' et
// 'shared_expenses' : un document par idée et par dépense, pour que deux réservations simultanées ne
// s'écrasent pas).
//
// Rattachement : { eventId, occ } — occ = date de l'occurrence. Pour un événement récurrent (anniversaire
// chaque année), chaque occurrence a sa liste ; pour un événement simple, seul eventId compte (changer sa
// date ne perd rien). « Cette fois seulement » (calendar.js) déplace les éléments de l'occurrence vers le
// nouvel événement ; supprimer un événement supprime les siens.
//
// Script classique chargé après app.js, calendar.js, sync.js, family.js et budget.js (formatEuros…).

const WISHES_STORAGE_KEY = 'mr_wishes';
const SHARED_EXPENSES_STORAGE_KEY = 'mr_shared_expenses';

// Idée : { id: 'wish_…', eventId, occ, name, link, priceCents, note, reservedBy (membre) | '', createdAt, updatedAt }
state.wishes = [];
// Dépense : { id: 'sx_…', eventId, occ, label, amountCents, paidBy (membre), splitAmong: [membres], date,
//   refund?: true, createdAt, updatedAt }
state.sharedExpenses = [];

function _isValidWish(w) {
  return !!w && typeof w === 'object' && !!w.id && typeof w.eventId === 'string' && !!w.eventId &&
    typeof w.name === 'string' && w.name.trim() !== '';
}

function _isValidSharedExpense(x) {
  return !!x && typeof x === 'object' && !!x.id && typeof x.eventId === 'string' && !!x.eventId &&
    Number.isInteger(x.amountCents) && x.amountCents > 0 && typeof x.paidBy === 'string' && !!x.paidBy &&
    Array.isArray(x.splitAmong) && x.splitAmong.length > 0;
}

function loadOccasions() {
  try {
    const w = JSON.parse(localStorage.getItem(WISHES_STORAGE_KEY) || '[]');
    state.wishes = Array.isArray(w) ? w.filter(_isValidWish) : [];
  } catch (e) { state.wishes = []; }
  try {
    const x = JSON.parse(localStorage.getItem(SHARED_EXPENSES_STORAGE_KEY) || '[]');
    state.sharedExpenses = Array.isArray(x) ? x.filter(_isValidSharedExpense) : [];
  } catch (e) { state.sharedExpenses = []; }
}

function saveWishes() { return safeSave(WISHES_STORAGE_KEY, state.wishes, 'listes de souhaits'); }
function saveSharedExpenses() { return safeSave(SHARED_EXPENSES_STORAGE_KEY, state.sharedExpenses, 'dépenses partagées'); }

function _occCollection(key, saveFn, validate) {
  return {
    list: () => state[key],
    get: id => state[key].find(x => x.id === id),
    put: doc => (validate(doc) ? syncPutInPlace(state[key], doc) : false),
    remove: id => {
      const before = state[key].length;
      state[key] = state[key].filter(x => x.id !== id);
      return state[key].length !== before;
    },
    save: saveFn,
    time: doc => doc.updatedAt || doc.createdAt || 0
  };
}
SYNC_COLLECTIONS.wishes = _occCollection('wishes', () => saveWishes(), _isValidWish);
SYNC_COLLECTIONS.shared_expenses = _occCollection('sharedExpenses', () => saveSharedExpenses(), _isValidSharedExpense);

// Éléments (idées ou dépenses) de l'occurrence occ de l'événement ev
function _occOf(list, ev, occ) {
  const recurring = !!(ev && ev.recurrence && ev.recurrence.freq);
  return list.filter(x => x.eventId === ev.id && (!recurring || x.occ === occ));
}

function _occSave(key, kind, saveFn, doc) {
  const now = Date.now();
  doc.updatedAt = now;
  if (!doc.createdAt) doc.createdAt = now;
  const i = state[key].findIndex(x => x.id === doc.id);
  if (i >= 0) state[key][i] = doc; else state[key].push(doc);
  saveFn();
  markDirty(kind, doc.id);
}

function _occRemove(key, kind, saveFn, id) {
  state[key] = state[key].filter(x => x.id !== id);
  saveFn();
  markDirty(kind, id);
}

// Événement supprimé (occ : une seule occurrence d'une série) : ses idées et ses dépenses partagées aussi
// (appelé par calendar.js)
function occasionsDeleteForEvent(eventId, occ) {
  const match = x => x.eventId === eventId && (!occ || x.occ === occ);
  for (const w of state.wishes.filter(match)) _occRemove('wishes', 'wishes', saveWishes, w.id);
  for (const x of state.sharedExpenses.filter(match)) _occRemove('sharedExpenses', 'shared_expenses', saveSharedExpenses, x.id);
}

// Nombre d'idées et de dépenses partagées d'un événement (toutes occurrences)
function occasionsCount(eventId) {
  return state.wishes.filter(x => x.eventId === eventId).length + state.sharedExpenses.filter(x => x.eventId === eventId).length;
}

// Redessine une feuille ouverte en gardant la saisie en cours du champ d'ajout rapide (et son clavier) :
// une synchronisation peut arriver pendant qu'on écrit
function _occRerender(sheet, html, inputId) {
  const input = document.getElementById(inputId);
  const value = input ? input.value : '';
  const focused = !!input && document.activeElement === input;
  openSheet(sheet, html);
  const again = document.getElementById(inputId);
  if (again && value) again.value = value;
  if (again && focused) again.focus();
}

// « Cette fois seulement » : l'occurrence devient un événement à part, ses éléments le suivent
function occasionsMoveOccurrence(eventId, occ, newEventId, newOcc) {
  for (const w of state.wishes.filter(x => x.eventId === eventId && x.occ === occ)) {
    _occSave('wishes', 'wishes', saveWishes, { ...w, eventId: newEventId, occ: newOcc });
  }
  for (const x of state.sharedExpenses.filter(s => s.eventId === eventId && s.occ === occ)) {
    _occSave('sharedExpenses', 'shared_expenses', saveSharedExpenses, { ...x, eventId: newEventId, occ: newOcc });
  }
}

// ============================================
// Calculs des dépenses partagées (fonctions pures)
// ============================================

// Parts d'un montant entre des membres, en centimes entiers : les centimes restants vont aux premiers
function sharedSplit(amountCents, ids) {
  const shares = new Map();
  const n = ids.length;
  if (!n) return shares;
  const base = Math.floor(amountCents / n);
  let rest = amountCents - base * n;
  for (const id of ids) {
    shares.set(id, (shares.get(id) || 0) + base + (rest > 0 ? 1 : 0));
    if (rest > 0) rest--;
  }
  return shares;
}

// Solde de chaque membre : ce qu'il a payé moins sa part (positif : on lui doit de l'argent)
function sharedBalances(list) {
  const bal = new Map();
  const add = (id, v) => bal.set(id, (bal.get(id) || 0) + v);
  for (const x of list) {
    add(x.paidBy, x.amountCents);
    for (const [id, share] of sharedSplit(x.amountCents, x.splitAmong)) add(id, -share);
  }
  return bal;
}

// « Qui doit quoi ? » : remboursements qui soldent tout, en apariant à chaque fois le plus gros débiteur
// et le plus gros créancier (n − 1 remboursements au plus). → [{ from, to, cents }]
function sharedSettlements(balances) {
  const debtors = [], creditors = [];
  for (const [id, v] of balances) {
    if (v < 0) debtors.push({ id, v: -v });
    else if (v > 0) creditors.push({ id, v });
  }
  const byAmount = (a, b) => b.v - a.v || String(a.id).localeCompare(String(b.id));
  const out = [];
  while (debtors.length && creditors.length) {
    debtors.sort(byAmount);
    creditors.sort(byAmount);
    const d = debtors[0], c = creditors[0];
    const cents = Math.min(d.v, c.v);
    out.push({ from: d.id, to: c.id, cents });
    d.v -= cents;
    c.v -= cents;
    if (!d.v) debtors.shift();
    if (!c.v) creditors.shift();
  }
  return out;
}

// ============================================
// Fiche d'un événement : accès à la liste de souhaits et aux dépenses partagées
// ============================================

function _occEventCtx(eventId) {
  const ev = state.events[eventId];
  if (!ev) return null;
  const occ = (typeof _calEditing !== 'undefined' && _calEditing && _calEditing.ev.id === eventId && _calEditing.occDate) || ev.date;
  return { ev, occ };
}

function _occLinksInner(eventId) {
  const ctx = _occEventCtx(eventId);
  if (!ctx) return '';
  const wishes = _occOf(state.wishes, ctx.ev, ctx.occ);
  const reserved = wishes.filter(w => w.reservedBy).length;
  const shared = _occOf(state.sharedExpenses, ctx.ev, ctx.occ).filter(x => !x.refund);
  const total = shared.reduce((t, x) => t + x.amountCents, 0);
  return `
    <button type="button" class="occ-link" onclick="openWishlist(${_jsArg(eventId)})">
      <span class="occ-link-title">🎁 Liste de souhaits</span>
      <span class="occ-link-sub">${wishes.length ? `${wishes.length} idée${wishes.length > 1 ? 's' : ''} · ${reserved} réservée${reserved > 1 ? 's' : ''}` : 'Idées de cadeaux à réserver'}</span>
    </button>
    <button type="button" class="occ-link" onclick="openSharedExpenses(${_jsArg(eventId)})">
      <span class="occ-link-title">💸 Dépenses partagées</span>
      <span class="occ-link-sub">${shared.length ? `${shared.length} dépense${shared.length > 1 ? 's' : ''} · ${escapeHtml(formatEuros(total))}` : 'Qui a payé quoi, qui doit quoi'}</span>
    </button>`;
}

// Section « Organisation » de la fiche d'un événement (calendar.js)
function occasionsEditorHtml(eventId) {
  return `<span class="family-label">Organisation</span>
    <div class="occ-links" id="occ-links">${_occLinksInner(eventId)}</div>`;
}

function _occRefreshEditorLinks(eventId) {
  const el = document.getElementById('occ-links');
  if (el && typeof _calEditing !== 'undefined' && _calEditing && _calEditing.ev.id === eventId) el.innerHTML = _occLinksInner(eventId);
}

function _occTitle(ctx) {
  const when = _fmtDate(ctx.occ, { day: 'numeric', month: 'long', year: 'numeric' });
  return `${escapeHtml(ctx.ev.title || 'Événement')} · ${escapeHtml(when)}`;
}

function _occMemberName(id) {
  const m = getMember(id);
  return m ? m.name : 'Ancien membre';
}

function _occMe() {
  return state.sync.memberId && getMember(state.sync.memberId) ? state.sync.memberId : '';
}

// ============================================
// Liste de souhaits
// ============================================

let _wishCtx = null;     // { eventId, occ } de la liste ouverte
let _wishEditing = null; // { wish (copie de travail), isNew }

function openWishlist(eventId) {
  const ctx = _occEventCtx(eventId);
  if (!ctx) {
    showToast('Cet événement a été supprimé', 'error');
    return;
  }
  _wishCtx = { eventId, occ: ctx.occ };
  openSheet('event-wishes', _wishlistHtml());
}
window.openWishlist = openWishlist;

function _wishlistHtml() {
  const ev = state.events[_wishCtx.eventId];
  const ctx = { ev, occ: _wishCtx.occ };
  const me = _occMe();
  const wishes = _occOf(state.wishes, ev, ctx.occ).sort((a, b) => (!!a.reservedBy - !!b.reservedBy) || (a.createdAt || 0) - (b.createdAt || 0));
  const reserved = wishes.filter(w => w.reservedBy).length;
  const rows = wishes.map(w => {
    const by = w.reservedBy ? getMember(w.reservedBy) : null;
    const meta = [w.priceCents ? escapeHtml(formatEuros(w.priceCents)) : '', w.note ? escapeHtml(w.note) : ''].filter(Boolean).join(' · ');
    const status = w.reservedBy
      ? `<span class="occ-reserved">${by ? memberAvatarHtml(by, 'sm') : ''} Réservé par ${escapeHtml(_occMemberName(w.reservedBy))}</span>`
      : me ? `<button class="cal-pick occ-reserve" onclick="wishReserve(${_jsArg(w.id)})">🎁 Je l'offre</button>` : '';
    return `<div class="occ-row${w.reservedBy ? ' is-reserved' : ''}">
      <button class="occ-row-main" onclick="openWishEditor(${_jsArg(w.id)})">
        <span class="occ-row-title">${escapeHtml(w.name)}${w.link ? ' 🔗' : ''}</span>
        ${meta ? `<span class="occ-row-sub">${meta}</span>` : ''}
      </button>
      ${status}
    </div>`;
  }).join('');
  return `
    <div class="modal-header">
      <h2>🎁 Liste de souhaits</h2>
      <button class="icon-btn icon-btn-light" onclick="closeSheet('event-wishes')" aria-label="Fermer">${_CAL_ICON_CLOSE}</button>
    </div>
    <div class="sheet-body">
      <p class="occ-event">${_occTitle(ctx)}</p>
      <form class="memo-add" onsubmit="wishQuickAdd(event)">
        <input id="wish-quick" class="family-input" maxlength="80" placeholder="Ajouter une idée de cadeau…" autocomplete="off" enterkeyhint="done" aria-label="Nouvelle idée">
        <button type="submit" class="memo-add-btn" aria-label="Ajouter l'idée">+</button>
      </form>
      ${wishes.length
        ? `<p class="bud-total">${wishes.length} idée${wishes.length > 1 ? 's' : ''} · ${reserved} réservée${reserved > 1 ? 's' : ''}</p><div class="occ-list">${rows}</div>`
        : '<p class="cal-empty">Aucune idée pour l\'instant. Ajoute des idées, puis chacun réserve celle qu\'il offre : pas de doublon.</p>'}
      ${!me && wishes.length ? '<p class="family-hint">Pour réserver d\'un geste, indique qui tu es dans la vue Famille (« C\'est moi »). Sinon, ouvre une idée et choisis qui l\'offre.</p>' : ''}
    </div>`;
}

function _wishRefresh() {
  if (!_wishCtx) return;
  const el = document.getElementById('sheet-event-wishes');
  if (el && !el.classList.contains('hidden') && state.events[_wishCtx.eventId]) _occRerender('event-wishes', _wishlistHtml(), 'wish-quick');
  _occRefreshEditorLinks(_wishCtx.eventId);
}

function _wishSave(w) {
  _occSave('wishes', 'wishes', saveWishes, w);
}

function wishQuickAdd(e) {
  if (e) e.preventDefault();
  const input = document.getElementById('wish-quick');
  const name = input ? input.value.trim().slice(0, 80) : '';
  if (!name || !_wishCtx) return;
  _wishSave({ id: 'wish_' + uid(), eventId: _wishCtx.eventId, occ: _wishCtx.occ, name, link: '', priceCents: 0, note: '', reservedBy: '' });
  input.value = ''; // le clavier reste ouvert pour en ajouter d'autres
  _wishRefresh();
}
window.wishQuickAdd = wishQuickAdd;

function wishReserve(id) {
  const w = state.wishes.find(x => x.id === id);
  const me = _occMe();
  if (!w || !me) return;
  if (w.reservedBy) {
    showToast(`Déjà réservé par ${_occMemberName(w.reservedBy)}`, 'error');
    _wishRefresh();
    return;
  }
  _wishSave({ ...w, reservedBy: me });
  _wishRefresh();
  showToast(`🎁 « ${w.name} » réservé`, 'success');
}
window.wishReserve = wishReserve;

function openWishEditor(id) {
  const existing = state.wishes.find(x => x.id === id);
  if (!existing) {
    showToast('Cette idée a été supprimée', 'error');
    _wishRefresh();
    return;
  }
  const w = { ...existing };
  _wishEditing = { wish: w };
  const members = state.members.map(m => `<button type="button" class="cal-pick cal-pick-member${m.id === w.reservedBy ? ' is-selected' : ''}" data-value="${escapeHtml(m.id)}" onclick="budPickSingle(this, true)">${memberAvatarHtml(m, 'sm')} ${escapeHtml(m.name)}</button>`).join('');
  const safeLink = /^https?:\/\//i.test(w.link || '') ? w.link : '';
  openSheet('wish-editor', `
    <div class="modal-header">
      <h2>Idée de cadeau</h2>
      <button class="icon-btn icon-btn-light" onclick="closeSheet('wish-editor')" aria-label="Fermer">${_CAL_ICON_CLOSE}</button>
    </div>
    <div class="sheet-body">
      <label class="family-label" for="wish-name">Nom</label>
      <input id="wish-name" class="family-input" maxlength="80" autocomplete="off" value="${escapeHtml(w.name)}">
      <label class="family-label" for="wish-link">Lien <small>(facultatif)</small></label>
      <input id="wish-link" class="family-input" type="url" maxlength="500" autocomplete="off" placeholder="https://…" value="${escapeHtml(w.link || '')}">
      ${safeLink ? `<a class="btn-link occ-open-link" href="${escapeHtml(safeLink)}" target="_blank" rel="noopener noreferrer">Ouvrir le lien ↗</a>` : ''}
      <label class="family-label" for="wish-price">Prix <small>(facultatif)</small></label>
      <div class="bud-amount-wrap">
        <input id="wish-price" class="family-input" inputmode="decimal" autocomplete="off" placeholder="0,00" value="${escapeHtml(_centsToInput(w.priceCents))}">
        <span class="bud-amount-cur occ-cur">€</span>
      </div>
      <label class="family-label" for="wish-note">Note <small>(taille, couleur…)</small></label>
      <input id="wish-note" class="family-input" maxlength="200" autocomplete="off" value="${escapeHtml(w.note || '')}">
      ${members ? `<span class="family-label">Qui l'offre ? <small>(aucun = pas encore réservé)</small></span><div class="cal-picks" id="wish-by" data-value="${escapeHtml(w.reservedBy || '')}">${members}</div>` : ''}
      <div class="sheet-actions">
        <button class="btn-danger" onclick="deleteWishFromEditor()">Supprimer</button>
        <button class="btn-primary" onclick="saveWishFromEditor()">Enregistrer</button>
      </div>
    </div>`);
}
window.openWishEditor = openWishEditor;

function saveWishFromEditor() {
  const e = _wishEditing;
  if (!e) return;
  const name = document.getElementById('wish-name').value.trim().slice(0, 80);
  if (!name) {
    showToast('Donne un nom à cette idée', 'error');
    return;
  }
  const link = document.getElementById('wish-link').value.trim().slice(0, 500);
  if (link && !/^https?:\/\//i.test(link)) {
    showToast('Le lien doit commencer par https://', 'error');
    return;
  }
  const priceRaw = document.getElementById('wish-price').value.trim();
  const price = priceRaw ? parseAmountToCents(priceRaw) : 0;
  if (priceRaw && !price) {
    showToast('Prix invalide', 'error');
    return;
  }
  const byBox = document.getElementById('wish-by');
  _wishSave({
    ...e.wish, name, link, priceCents: price || 0,
    note: document.getElementById('wish-note').value.trim().slice(0, 200),
    reservedBy: byBox ? (byBox.dataset.value || '') : (e.wish.reservedBy || '')
  });
  _wishEditing = null;
  closeSheet('wish-editor');
  _wishRefresh();
  showToast('Idée enregistrée ✓', 'success');
}
window.saveWishFromEditor = saveWishFromEditor;

async function deleteWishFromEditor() {
  const e = _wishEditing;
  if (!e) return;
  if (!(await uiConfirm(`Supprimer « ${e.wish.name} » ?`, { confirmLabel: 'Supprimer', danger: true }))) return;
  if (_wishEditing !== e) return;
  _occRemove('wishes', 'wishes', saveWishes, e.wish.id);
  _wishEditing = null;
  closeSheet('wish-editor');
  _wishRefresh();
  showToast('Idée supprimée', 'success');
}
window.deleteWishFromEditor = deleteWishFromEditor;

// ============================================
// Dépenses partagées
// ============================================

let _sharedCtx = null;     // { eventId, occ } des dépenses ouvertes
let _sharedEditing = null; // { expense (copie de travail), isNew }

function openSharedExpenses(eventId) {
  const ctx = _occEventCtx(eventId);
  if (!ctx) {
    showToast('Cet événement a été supprimé', 'error');
    return;
  }
  _sharedCtx = { eventId, occ: ctx.occ };
  openSheet('event-shared', _sharedHtml());
}
window.openSharedExpenses = openSharedExpenses;

function _sharedHtml() {
  const ev = state.events[_sharedCtx.eventId];
  const ctx = { ev, occ: _sharedCtx.occ };
  const list = _occOf(state.sharedExpenses, ev, ctx.occ).sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || 0) - (a.createdAt || 0));
  const spent = list.filter(x => !x.refund);
  const total = spent.reduce((t, x) => t + x.amountCents, 0);
  const balances = sharedBalances(list);
  const settlements = sharedSettlements(balances);
  if (!state.members.length) {
    return `
      <div class="modal-header">
        <h2>💸 Dépenses partagées</h2>
        <button class="icon-btn icon-btn-light" onclick="closeSheet('event-shared')" aria-label="Fermer">${_CAL_ICON_CLOSE}</button>
      </div>
      <div class="sheet-body">
        <p class="occ-event">${_occTitle(ctx)}</p>
        <p class="family-hint">Ajoute d'abord les membres de la famille (vue Famille) : chaque dépense est payée par l'un et partagée entre plusieurs.</p>
      </div>`;
  }
  const balanceRows = [...balances.entries()].filter(([, v]) => v !== 0).sort((a, b) => b[1] - a[1]).map(([id, v]) => {
    const m = getMember(id);
    return `<div class="bud-row bud-row-static">
      ${m ? memberAvatarHtml(m, 'sm') : '<span class="member-avatar member-avatar-sm member-avatar-empty">?</span>'}
      <span class="bud-row-main"><span class="bud-row-top"><span class="bud-row-name">${escapeHtml(_occMemberName(id))}</span>
        <span class="bud-row-amount occ-balance${v > 0 ? ' is-plus' : ' is-minus'}">${v > 0 ? '+' : '−'}${escapeHtml(formatEuros(Math.abs(v)))}</span></span></span>
    </div>`;
  }).join('');
  const settleRows = settlements.map(s => `<div class="occ-settle">
      <span class="occ-settle-text"><strong>${escapeHtml(_occMemberName(s.from))}</strong> doit <strong>${escapeHtml(formatEuros(s.cents))}</strong> à <strong>${escapeHtml(_occMemberName(s.to))}</strong></span>
      <button class="btn-link" onclick="sharedSettle(${_jsArg(s.from)}, ${_jsArg(s.to)}, ${s.cents})">Remboursé</button>
    </div>`).join('');
  const rows = list.map(x => {
    const payer = getMember(x.paidBy);
    const sub = x.refund ? `Remboursement à ${escapeHtml(x.splitAmong.map(_occMemberName).join(', '))}`
      : `Payé par ${escapeHtml(_occMemberName(x.paidBy))} · ${x.splitAmong.length === 1 ? 'pour ' + escapeHtml(_occMemberName(x.splitAmong[0])) : `entre ${x.splitAmong.length}`}`;
    return `<button class="bud-expense${x.refund ? ' is-inactive' : ''}" onclick="openSharedEditor(${_jsArg(x.id)})">
      ${payer ? memberAvatarHtml(payer, 'sm') : ''}
      <span class="bud-row-main">
        <span class="bud-expense-label">${escapeHtml(x.label || (x.refund ? 'Remboursement' : 'Dépense'))}</span>
        <span class="bud-expense-sub">${sub}</span>
      </span>
      <span class="bud-expense-amount">${escapeHtml(formatEuros(x.amountCents))}</span>
    </button>`;
  }).join('');
  return `
    <div class="modal-header">
      <h2>💸 Dépenses partagées</h2>
      <button class="icon-btn icon-btn-light" onclick="closeSheet('event-shared')" aria-label="Fermer">${_CAL_ICON_CLOSE}</button>
    </div>
    <div class="sheet-body">
      <p class="occ-event">${_occTitle(ctx)}</p>
      ${list.length ? `
        <p class="bud-total">${spent.length} dépense${spent.length > 1 ? 's' : ''} · <strong>${escapeHtml(formatEuros(total))}</strong> au total</p>
        <h3 class="hub-section-title">Qui doit quoi ?</h3>
        ${settleRows || '<p class="occ-settled">✓ Tous les comptes sont équilibrés</p>'}
        ${balanceRows ? `<h3 class="hub-section-title occ-subtitle">Soldes</h3>${balanceRows}` : ''}
        <h3 class="hub-section-title occ-subtitle">Dépenses</h3>
        <div class="cal-list">${rows}</div>`
        : '<p class="cal-empty">Aucune dépense pour l\'instant. Note qui a payé quoi : l\'app calcule qui doit combien à qui.</p>'}
      <div class="sheet-actions"><button class="btn-primary" onclick="openSharedEditor()">+ Ajouter une dépense</button></div>
    </div>`;
}

function _sharedRefresh() {
  if (!_sharedCtx) return;
  const el = document.getElementById('sheet-event-shared');
  if (el && !el.classList.contains('hidden') && state.events[_sharedCtx.eventId]) openSheet('event-shared', _sharedHtml());
  _occRefreshEditorLinks(_sharedCtx.eventId);
}

function _sharedSave(x) {
  _occSave('sharedExpenses', 'shared_expenses', saveSharedExpenses, x);
}

// Remboursement fait : enregistré comme une dépense payée par le débiteur pour le créancier (solde à 0)
async function sharedSettle(from, to, cents) {
  if (!_sharedCtx) return;
  if (!(await uiConfirm(`${_occMemberName(from)} a remboursé ${formatEuros(cents)} à ${_occMemberName(to)} ?`, { confirmLabel: 'Oui, remboursé' }))) return;
  if (!_sharedCtx) return;
  _sharedSave({
    id: 'sx_' + uid(), eventId: _sharedCtx.eventId, occ: _sharedCtx.occ, label: 'Remboursement', amountCents: cents,
    paidBy: from, splitAmong: [to], date: calendarToday(), refund: true
  });
  _sharedRefresh();
  showToast('Remboursement enregistré ✓', 'success');
}
window.sharedSettle = sharedSettle;

function openSharedEditor(id) {
  if (!_sharedCtx) return;
  const existing = id ? state.sharedExpenses.find(x => x.id === id) : null;
  if (id && !existing) {
    showToast('Cette dépense a été supprimée', 'error');
    _sharedRefresh();
    return;
  }
  const ev = state.events[_sharedCtx.eventId];
  // Partagée par défaut entre les membres concernés par l'événement (sinon toute la famille)
  const people = ev ? eventPeopleIds(ev).filter(mid => getMember(mid)) : [];
  const defaultSplit = people.length > 1 ? people : state.members.map(m => m.id);
  const me = _occMe();
  const x = existing ? { ...existing, splitAmong: [...existing.splitAmong] } : {
    id: 'sx_' + uid(), eventId: _sharedCtx.eventId, occ: _sharedCtx.occ, label: '', amountCents: 0,
    paidBy: me || (state.members[0] || {}).id || '', splitAmong: defaultSplit, date: calendarToday()
  };
  _sharedEditing = { expense: x, isNew: !existing };
  const payers = state.members.map(m => `<button type="button" class="cal-pick cal-pick-member${m.id === x.paidBy ? ' is-selected' : ''}" data-value="${escapeHtml(m.id)}" onclick="budPickSingle(this)">${memberAvatarHtml(m, 'sm')} ${escapeHtml(m.name)}</button>`).join('');
  const split = state.members.map(m => `<button type="button" class="cal-pick cal-pick-member${x.splitAmong.includes(m.id) ? ' is-selected' : ''}" data-value="${escapeHtml(m.id)}" onclick="this.classList.toggle('is-selected')">${memberAvatarHtml(m, 'sm')} ${escapeHtml(m.name)}</button>`).join('');
  const quick = BUDGET_QUICK_AMOUNTS.map(n => `<button type="button" class="cal-pick" onclick="budAddAmount('sx-amount', ${n})">+${n} €</button>`).join('');
  openSheet('shared-editor', `
    <div class="modal-header">
      <h2>${existing ? (x.refund ? 'Remboursement' : 'Dépense partagée') : 'Nouvelle dépense partagée'}</h2>
      <button class="icon-btn icon-btn-light" onclick="closeSheet('shared-editor')" aria-label="Fermer">${_CAL_ICON_CLOSE}</button>
    </div>
    <div class="sheet-body">
      <label class="family-label" for="sx-amount">Montant</label>
      <div class="bud-amount-wrap">
        <input id="sx-amount" class="family-input bud-amount-input" inputmode="decimal" autocomplete="off" placeholder="0,00" value="${escapeHtml(_centsToInput(x.amountCents))}">
        <span class="bud-amount-cur">€</span>
      </div>
      <div class="cal-picks bud-quick">${quick}</div>
      <label class="family-label" for="sx-label">Libellé</label>
      <input id="sx-label" class="family-input" maxlength="80" autocomplete="off" placeholder="Ex. Gâteau, essence, location" value="${escapeHtml(x.label || '')}">
      <span class="family-label">Payé par</span>
      <div class="cal-picks" id="sx-payer" data-value="${escapeHtml(x.paidBy)}">${payers}</div>
      <span class="family-label">${x.refund ? 'Remboursé à' : 'Partagé entre'}</span>
      <div class="cal-picks" id="sx-split">${split}</div>
      <label class="family-label" for="sx-date">Date</label>
      <input type="date" id="sx-date" class="family-input" value="${escapeHtml(x.date || calendarToday())}">
      <div class="sheet-actions">
        ${existing ? '<button class="btn-danger" onclick="deleteSharedFromEditor()">Supprimer</button>' : ''}
        <button class="btn-primary" onclick="saveSharedFromEditor()">Enregistrer</button>
      </div>
    </div>`);
  setTimeout(() => { const el = document.getElementById('sx-amount'); if (el && !existing) el.focus(); }, 60);
}
window.openSharedEditor = openSharedEditor;

function saveSharedFromEditor() {
  const e = _sharedEditing;
  if (!e) return;
  const cents = parseAmountToCents(document.getElementById('sx-amount').value);
  if (!cents) {
    showToast('Montant invalide', 'error');
    return;
  }
  const paidBy = document.getElementById('sx-payer').dataset.value || '';
  if (!paidBy) {
    showToast('Qui a payé ?', 'error');
    return;
  }
  const splitAmong = [...document.querySelectorAll('#sx-split .cal-pick.is-selected')].map(b => b.dataset.value).filter(Boolean);
  if (!splitAmong.length) {
    showToast('Choisis entre qui partager la dépense', 'error');
    return;
  }
  _sharedSave({
    ...e.expense, amountCents: cents, paidBy, splitAmong,
    label: document.getElementById('sx-label').value.trim().slice(0, 80),
    date: document.getElementById('sx-date').value || calendarToday()
  });
  _sharedEditing = null;
  closeSheet('shared-editor');
  _sharedRefresh();
  showToast(`${formatEuros(cents)} ${e.isNew ? 'ajoutés' : 'enregistrés'} ✓`, 'success');
}
window.saveSharedFromEditor = saveSharedFromEditor;

async function deleteSharedFromEditor() {
  const e = _sharedEditing;
  if (!e) return;
  if (!(await uiConfirm(`Supprimer cette dépense de ${formatEuros(e.expense.amountCents)} ?`, { confirmLabel: 'Supprimer', danger: true }))) return;
  if (_sharedEditing !== e) return;
  _occRemove('sharedExpenses', 'shared_expenses', saveSharedExpenses, e.expense.id);
  _sharedEditing = null;
  closeSheet('shared-editor');
  _sharedRefresh();
  showToast('Dépense supprimée', 'success');
}
window.deleteSharedFromEditor = deleteSharedFromEditor;

// Après chaque synchronisation : une liste ouverte suit les réservations et dépenses des autres téléphones
if (typeof SYNC_CYCLE_HOOKS !== 'undefined') {
  SYNC_CYCLE_HOOKS.push(() => {
    _wishRefresh();
    _sharedRefresh();
  });
}
