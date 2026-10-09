// ============================================
// LA MAISONNÉE — Budget familial
// ============================================
// Dépenses (montant en centimes, catégorie, membre, date), catégories avec plafond mensuel
// facultatif, budget mensuel global. Vues : Aperçu (reste du mois, par catégorie, par membre)
// et Dépenses (liste groupée par jour, filtrable). Synchronisé en famille (kinds 'expenses',
// 'budget_categories', 'budget_settings').
//
// Script classique chargé après app.js, sync.js et family.js.

const EXPENSES_STORAGE_KEY = 'mr_expenses';
const BUDGET_CATEGORIES_STORAGE_KEY = 'mr_budget_categories';
const BUDGET_SETTINGS_STORAGE_KEY = 'mr_budget_settings';
const BUDGET_SETTINGS_ID = 'settings';

// Catégories par défaut : ids fixes, pour que deux téléphones ne les créent pas en double
const BUDGET_DEFAULT_CATEGORIES = [
  { id: 'bc_courses', name: 'Courses', emoji: '🛒' },
  { id: 'bc_logement', name: 'Logement', emoji: '🏠' },
  { id: 'bc_transport', name: 'Transport', emoji: '🚗' },
  { id: 'bc_sante', name: 'Santé', emoji: '💊' },
  { id: 'bc_enfants', name: 'Enfants', emoji: '🧸' },
  { id: 'bc_loisirs', name: 'Loisirs', emoji: '🎉' },
  { id: 'bc_restaurants', name: 'Restaurants', emoji: '🍽️' },
  { id: 'bc_abonnements', name: 'Abonnements', emoji: '📱' },
  { id: 'bc_vetements', name: 'Vêtements', emoji: '👕' },
  { id: 'bc_divers', name: 'Divers', emoji: '📦' }
];

state.expenses = [];
state.budgetCategories = [];
state.budgetSettings = { id: BUDGET_SETTINGS_ID, monthlyBudgetCents: 0 };

// ============================================
// Montants
// ============================================

const _euroFmt = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const _euroFmtRound = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

function formatEuros(cents, round) {
  return (round ? _euroFmtRound : _euroFmt).format((Number(cents) || 0) / 100);
}

// « 12,50 », « 12.5 », « 1 234,56 € » → centimes (entier) ; null si illisible ou ≤ 0
function parseAmountToCents(input) {
  const s = String(input || '').replace(/[\s  €]/g, '').replace(',', '.');
  if (!/^\d+(\.\d{0,2})?$/.test(s)) return null;
  const cents = Math.round(parseFloat(s) * 100);
  return cents > 0 && cents < 100000000000 ? cents : null;
}

function _centsToInput(cents) {
  return cents ? (cents / 100).toFixed(2).replace('.', ',').replace(/,00$/, '') : '';
}

// ============================================
// Persistance + sync
// ============================================

function loadBudget() {
  try {
    const ex = JSON.parse(localStorage.getItem(EXPENSES_STORAGE_KEY) || '[]');
    state.expenses = Array.isArray(ex) ? ex.filter(e => e && e.id && Number.isFinite(e.amountCents)) : [];
  } catch (e) { state.expenses = []; }
  try {
    const cats = JSON.parse(localStorage.getItem(BUDGET_CATEGORIES_STORAGE_KEY) || '[]');
    state.budgetCategories = Array.isArray(cats) ? cats.filter(c => c && c.id && c.name) : [];
  } catch (e) { state.budgetCategories = []; }
  try {
    const s = JSON.parse(localStorage.getItem(BUDGET_SETTINGS_STORAGE_KEY) || 'null');
    if (s && typeof s === 'object') state.budgetSettings = { id: BUDGET_SETTINGS_ID, monthlyBudgetCents: Number(s.monthlyBudgetCents) || 0, updatedAt: s.updatedAt || 0 };
  } catch (e) { /* réglages par défaut */ }
}

function saveExpenses() { return safeSave(EXPENSES_STORAGE_KEY, state.expenses, 'dépenses'); }
function saveBudgetCategories() { return safeSave(BUDGET_CATEGORIES_STORAGE_KEY, state.budgetCategories, 'catégories de budget'); }
function saveBudgetSettings() { return safeSave(BUDGET_SETTINGS_STORAGE_KEY, state.budgetSettings, 'budget'); }

// Catégories par défaut, complétées au premier usage du budget. Elles restent locales (pas de markDirty)
// et datées de 0 : identiques sur tous les téléphones (ids fixes), elles ne partent dans la famille
// qu'une fois modifiées, et une version personnalisée par la famille l'emporte toujours sur elles.
// Une à une : un téléphone qui a reçu de la famille une seule catégorie modifiée reçoit aussi les autres
// (une catégorie retirée est archivée et synchronisée, jamais supprimée : elle n'est pas recréée).
function _ensureDefaultCategories() {
  let added = false;
  BUDGET_DEFAULT_CATEGORIES.forEach((c, i) => {
    if (getBudgetCategory(c.id)) return;
    state.budgetCategories.push({ ...c, limitCents: 0, order: i, archived: false, updatedAt: 0 });
    added = true;
  });
  if (added) saveBudgetCategories();
}

function _arrayCollection(key, saveFn, validate) {
  const arr = () => state[key];
  return {
    list: () => arr(),
    get: id => arr().find(x => x.id === id),
    put: doc => {
      if (!doc || typeof doc !== 'object' || !doc.id || (validate && !validate(doc))) return false;
      return syncPutInPlace(arr(), doc);
    },
    remove: id => {
      const before = arr().length;
      state[key] = arr().filter(x => x.id !== id);
      return state[key].length !== before;
    },
    save: saveFn,
    time: doc => doc.updatedAt || doc.createdAt || 0
  };
}

SYNC_COLLECTIONS.expenses = _arrayCollection('expenses', () => saveExpenses(), d => Number.isFinite(d.amountCents) && !!d.date);
SYNC_COLLECTIONS.budget_categories = _arrayCollection('budgetCategories', () => saveBudgetCategories(), d => !!d.name);
SYNC_COLLECTIONS.budget_categories.isPristine = doc => !doc.updatedAt; // catégorie par défaut jamais modifiée
SYNC_COLLECTIONS.budget_settings = {
  list: () => [state.budgetSettings],
  get: id => (id === BUDGET_SETTINGS_ID ? state.budgetSettings : undefined),
  put: doc => {
    if (!doc || doc.id !== BUDGET_SETTINGS_ID) return false;
    Object.assign(state.budgetSettings, { id: BUDGET_SETTINGS_ID, monthlyBudgetCents: Number(doc.monthlyBudgetCents) || 0, updatedAt: doc.updatedAt || 0 });
    return true;
  },
  remove: () => false,
  save: () => saveBudgetSettings(),
  time: doc => doc.updatedAt || 0,
  isPristine: doc => !doc.updatedAt // budget jamais défini sur cet appareil
};

function getBudgetCategory(id) {
  return state.budgetCategories.find(c => c.id === id) || null;
}

function _activeCategories() {
  return state.budgetCategories.filter(c => !c.archived).sort((a, b) => (a.order || 0) - (b.order || 0));
}

function saveExpense(expense) {
  const now = Date.now();
  expense.updatedAt = now;
  if (!expense.createdAt) expense.createdAt = now;
  const i = state.expenses.findIndex(e => e.id === expense.id);
  if (i >= 0) state.expenses[i] = expense; else state.expenses.push(expense);
  saveExpenses();
  markDirty('expenses', expense.id);
}

function deleteExpense(id) {
  state.expenses = state.expenses.filter(e => e.id !== id);
  saveExpenses();
  markDirty('expenses', id);
}

// ============================================
// Calculs (fonctions pures sur state)
// ============================================

function expensesOfMonth(month) {
  return state.expenses.filter(e => e.date && e.date.slice(0, 7) === month);
}

// { total, byCategory: Map catId → cents, byMember: Map memberId|'' → cents, count }
function budgetSummary(month) {
  const list = expensesOfMonth(month);
  const byCategory = new Map(), byMember = new Map();
  let total = 0;
  for (const e of list) {
    total += e.amountCents;
    byCategory.set(e.categoryId || '', (byCategory.get(e.categoryId || '') || 0) + e.amountCents);
    byMember.set(e.memberId || '', (byMember.get(e.memberId || '') || 0) + e.amountCents);
  }
  return { total, byCategory, byMember, count: list.length };
}

// ============================================
// Vues : Aperçu · Dépenses
// ============================================

const _bud = { month: '', categories: [], members: [] };

VIEWS['budget-overview'] = { app: 'budget', tab: true, section: 'budget', title: 'Budget', render: () => renderBudget('overview') };
VIEWS['budget-expenses'] = { app: 'budget', tab: true, section: 'budget', title: 'Dépenses', keepScroll: true, render: () => renderBudget('expenses') };
APPS.budget.soon = false;
APPS.budget.home = 'budget-overview';

let _budMode = 'overview';

function _budMonth() {
  if (!_bud.month) _bud.month = formatPlanningDate(new Date()).slice(0, 7);
  return _bud.month;
}

function _monthLabel(month) {
  const [y, m] = month.split('-').map(Number);
  const s = new Date(y, m - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function renderBudget(mode) {
  if (mode) _budMode = mode;
  _ensureDefaultCategories();
  const el = document.getElementById('budget-content');
  if (!el) return;
  const month = _budMonth();
  const toolbar = `<div class="cal-toolbar">
      <button class="icon-btn" onclick="budShiftMonth(-1)" aria-label="Mois précédent">${_CAL_ICON_PREV}</button>
      <div class="cal-period">${escapeHtml(_monthLabel(month))}</div>
      <button class="icon-btn" onclick="budShiftMonth(1)" aria-label="Mois suivant">${_CAL_ICON_NEXT}</button>
    </div>`;
  el.innerHTML = toolbar + (_budMode === 'overview' ? _budOverviewHtml(month) : _budExpensesHtml(month));
}
window.renderBudget = renderBudget;

function budShiftMonth(delta) {
  const [y, m] = _budMonth().split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  _bud.month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  renderBudget();
}
window.budShiftMonth = budShiftMonth;

function _budBar(pct, over) {
  return `<span class="bud-bar${over ? ' is-over' : ''}"><span class="bud-bar-fill" style="width:${Math.max(0, Math.min(100, Math.round(pct)))}%"></span></span>`;
}

function _budOverviewHtml(month) {
  const s = budgetSummary(month);
  const budget = state.budgetSettings.monthlyBudgetCents || 0;
  const left = budget - s.total;
  const head = budget
    ? `<p class="bud-left${left < 0 ? ' is-over' : ''}">${left >= 0 ? 'Reste' : 'Dépassement'} <strong>${escapeHtml(formatEuros(Math.abs(left)))}</strong></p>
       ${_budBar(budget ? (s.total / budget) * 100 : 0, left < 0)}
       <p class="bud-sub">${escapeHtml(formatEuros(s.total))} dépensés sur ${escapeHtml(formatEuros(budget, true))}</p>`
    : `<p class="bud-left"><strong>${escapeHtml(formatEuros(s.total))}</strong> dépensés</p>
       <button class="cal-add-link" onclick="openBudgetSettings()">Définir un budget mensuel →</button>`;

  const catRows = _activeCategories()
    .map(c => ({ c, spent: s.byCategory.get(c.id) || 0 }))
    .concat(s.byCategory.get('') ? [{ c: { id: '', name: 'Sans catégorie', emoji: '❔', limitCents: 0 }, spent: s.byCategory.get('') }] : [])
    .concat(state.budgetCategories.filter(c => c.archived && s.byCategory.get(c.id)).map(c => ({ c, spent: s.byCategory.get(c.id) })))
    .filter(r => r.spent > 0 || r.c.limitCents > 0)
    .sort((a, b) => b.spent - a.spent)
    .map(({ c, spent }) => {
      const limit = c.limitCents || 0;
      const pct = limit ? (spent / limit) * 100 : (s.total ? (spent / s.total) * 100 : 0);
      return `<button class="bud-row" onclick="budFilterCategory(${_jsArg(c.id)})">
        <span class="bud-row-emoji" aria-hidden="true">${escapeHtml(c.emoji || '📦')}</span>
        <span class="bud-row-main">
          <span class="bud-row-top"><span class="bud-row-name">${escapeHtml(c.name)}</span>
            <span class="bud-row-amount">${escapeHtml(formatEuros(spent))}${limit ? ` <small>/ ${escapeHtml(formatEuros(limit, true))}</small>` : ''}</span></span>
          ${_budBar(pct, limit && spent > limit)}
        </span>
      </button>`;
    }).join('');

  const memberRows = [...s.byMember.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id, spent]) => {
      const m = id ? getMember(id) : null;
      const pct = s.total ? (spent / s.total) * 100 : 0;
      return `<div class="bud-row bud-row-static">
        ${m ? memberAvatarHtml(m, 'sm') : '<span class="member-avatar member-avatar-sm member-avatar-empty">?</span>'}
        <span class="bud-row-main">
          <span class="bud-row-top"><span class="bud-row-name">${escapeHtml(m ? m.name : (id ? 'Ancien membre' : 'Non attribué'))}</span>
            <span class="bud-row-amount">${escapeHtml(formatEuros(spent))} <small>${Math.round(pct)} %</small></span></span>
          ${_budBar(pct, false)}
        </span>
      </div>`;
    }).join('');

  return `
    <section class="hub-card bud-summary">${head}</section>
    <section class="bud-section">
      <div class="bud-section-head"><h3 class="hub-section-title">Par catégorie</h3>
        <button class="bud-link" onclick="openBudgetSettings()">Catégories et budgets</button></div>
      ${catRows || '<p class="cal-empty">Aucune dépense ce mois-ci.</p>'}
    </section>
    ${memberRows ? `<section class="bud-section"><h3 class="hub-section-title">Par membre</h3>${memberRows}</section>` : ''}
    <button class="btn-primary btn-block" onclick="openExpenseEditor()">+ Ajouter une dépense</button>`;
}

function budFilterCategory(catId) {
  _bud.categories = [catId || '']; // '' : dépenses sans catégorie
  _bud.members = [];
  navigateTo('budget-expenses');
}
window.budFilterCategory = budFilterCategory;

function budToggleFilter(kind, id) {
  const key = kind === 'member' ? 'members' : 'categories';
  if (!id) _bud[key] = [];
  else if (_bud[key].includes(id)) _bud[key] = _bud[key].filter(x => x !== id);
  else _bud[key] = [..._bud[key], id];
  renderBudget();
}
window.budToggleFilter = budToggleFilter;

// Retire un seul filtre de catégorie (pour '' : « Sans catégorie », et non « Toutes »)
function budRemoveCategoryFilter(id) {
  _bud.categories = _bud.categories.filter(x => x !== id);
  renderBudget();
}
window.budRemoveCategoryFilter = budRemoveCategoryFilter;

function _budExpensesHtml(month) {
  let list = expensesOfMonth(month);
  if (_bud.categories.length) list = list.filter(e => _bud.categories.includes(e.categoryId || ''));
  if (_bud.members.length) list = list.filter(e => _bud.members.includes(e.memberId || ''));
  list.sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || 0) - (a.createdAt || 0));
  const total = list.reduce((t, e) => t + e.amountCents, 0);

  const catChips = _activeCategories().map(c => `<button class="cal-chip${_bud.categories.includes(c.id) ? ' is-active' : ''}" onclick="budToggleFilter('category', ${_jsArg(c.id)})">${escapeHtml(c.emoji || '')} ${escapeHtml(c.name)}</button>`).join('');
  const memberChips = state.members.map(m => `<button class="cal-chip${_bud.members.includes(m.id) ? ' is-active' : ''}" onclick="budToggleFilter('member', ${_jsArg(m.id)})">${memberAvatarHtml(m, 'sm')}<span>${escapeHtml(m.name)}</span></button>`).join('');
  const filters = `<div class="cal-filters">
      <button class="cal-chip${_bud.categories.length ? '' : ' is-active'}" onclick="budToggleFilter('category', '')">Toutes</button>${catChips}
      ${_bud.categories.includes('') ? `<button class="cal-chip is-active" onclick="budRemoveCategoryFilter('')">❔ Sans catégorie</button>` : ''}
    </div>
    ${memberChips ? `<div class="cal-filters"><button class="cal-chip${_bud.members.length ? '' : ' is-active'}" onclick="budToggleFilter('member', '')">Tout le monde</button>${memberChips}</div>` : ''}`;

  const today = formatPlanningDate(new Date());
  const yesterday = shiftDate(today, -1);
  let html = '', currentDay = '';
  for (const e of list) {
    if (e.date !== currentDay) {
      if (currentDay) html += '</div></section>';
      currentDay = e.date;
      const label = e.date === today ? "Aujourd'hui" : e.date === yesterday ? 'Hier' : _capitalize(_fmtDate(e.date, { weekday: 'long', day: 'numeric', month: 'long' }));
      const dayTotal = list.filter(x => x.date === e.date).reduce((t, x) => t + x.amountCents, 0);
      html += `<section class="cal-agenda-day"><h3 class="cal-agenda-title bud-day-title"><span>${escapeHtml(label)}</span><span>${escapeHtml(formatEuros(dayTotal))}</span></h3><div class="cal-list">`;
    }
    const c = getBudgetCategory(e.categoryId);
    const m = e.memberId ? getMember(e.memberId) : null;
    html += `<button class="bud-expense" onclick="openExpenseEditor(${_jsArg(e.id)})">
      <span class="bud-row-emoji" aria-hidden="true">${escapeHtml((c && c.emoji) || '📦')}</span>
      <span class="bud-row-main">
        <span class="bud-expense-label">${escapeHtml(e.label || (c ? c.name : 'Dépense'))}</span>
        <span class="bud-expense-sub">${escapeHtml(c ? c.name : 'Sans catégorie')}${e.note ? ' · ' + escapeHtml(e.note) : ''}</span>
      </span>
      ${m ? memberAvatarHtml(m, 'sm') : ''}
      <span class="bud-expense-amount">${escapeHtml(formatEuros(e.amountCents))}</span>
    </button>`;
  }
  if (currentDay) html += '</div></section>';

  return `${filters}
    <p class="bud-total">${list.length} dépense${list.length > 1 ? 's' : ''} · <strong>${escapeHtml(formatEuros(total))}</strong></p>
    ${html || `<div class="cal-empty-state"><p>Aucune dépense${_bud.categories.length || _bud.members.length ? ' pour ces filtres' : ' ce mois-ci'}.</p>
      <button class="btn-primary" onclick="openExpenseEditor()">+ Ajouter une dépense</button></div>`}`;
}

// ============================================
// Fiche d'une dépense
// ============================================

let _budEditing = null; // { expense (copie de travail), isNew }

function openExpenseEditor(id) {
  _ensureDefaultCategories();
  const existing = id ? state.expenses.find(e => e.id === id) : null;
  const today = formatPlanningDate(new Date());
  const month = _budMonth();
  const exp = existing ? { ...existing } : {
    id: 'ex_' + uid(),
    date: month === today.slice(0, 7) ? today : month + '-01',
    amountCents: 0, label: '',
    categoryId: _bud.categories.length === 1 ? _bud.categories[0] : 'bc_courses',
    memberId: state.sync.memberId && getMember(state.sync.memberId) ? state.sync.memberId : '',
    note: ''
  };
  const defaultCat = getBudgetCategory(exp.categoryId);
  if (!existing && (!defaultCat || defaultCat.archived)) exp.categoryId = (_activeCategories()[0] || {}).id || '';
  // Dépense existante dont la catégorie est inconnue ici (pas encore reçue, ou refusée) : elle la garde
  const unknownCat = !!existing && !!exp.categoryId && !getBudgetCategory(exp.categoryId);
  _budEditing = { expense: exp, isNew: !existing };
  const cats = _activeCategories().concat(existing && getBudgetCategory(existing.categoryId) && getBudgetCategory(existing.categoryId).archived ? [getBudgetCategory(existing.categoryId)] : [])
    .map(c => `<button type="button" class="cal-pick${c.id === exp.categoryId ? ' is-selected' : ''}" data-value="${escapeHtml(c.id)}" onclick="budPickSingle(this)">${escapeHtml(c.emoji || '')} ${escapeHtml(c.name)}</button>`).join('') +
    (unknownCat ? `<button type="button" class="cal-pick is-selected" data-value="${escapeHtml(exp.categoryId)}" onclick="budPickSingle(this)">❔ Catégorie inconnue</button>` : '');
  const members = state.members.map(m => `<button type="button" class="cal-pick cal-pick-member${m.id === exp.memberId ? ' is-selected' : ''}" data-value="${escapeHtml(m.id)}" onclick="budPickSingle(this, true)">${memberAvatarHtml(m, 'sm')} ${escapeHtml(m.name)}</button>`).join('');
  openSheet('expense-editor', `
    <div class="modal-header">
      <h2>${existing ? 'Dépense' : 'Nouvelle dépense'}</h2>
      <button class="icon-btn icon-btn-light" onclick="closeSheet('expense-editor')" aria-label="Fermer">${_CAL_ICON_CLOSE}</button>
    </div>
    <div class="sheet-body">
      <label class="family-label" for="exp-amount">Montant</label>
      <div class="bud-amount-wrap">
        <input id="exp-amount" class="family-input bud-amount-input" inputmode="decimal" autocomplete="off" placeholder="0,00" value="${escapeHtml(_centsToInput(exp.amountCents))}">
        <span class="bud-amount-cur">€</span>
      </div>
      <label class="family-label" for="exp-label">Libellé</label>
      <input id="exp-label" class="family-input" maxlength="80" autocomplete="off" placeholder="Ex. Supermarché" value="${escapeHtml(exp.label || '')}">
      <span class="family-label">Catégorie</span>
      <div class="cal-picks" id="exp-category" data-value="${escapeHtml(exp.categoryId || '')}">${cats}</div>
      ${members ? `<span class="family-label">Qui ? <small>(facultatif)</small></span><div class="cal-picks" id="exp-member" data-value="${escapeHtml(exp.memberId || '')}">${members}</div>` : ''}
      <label class="family-label" for="exp-date">Date</label>
      <input type="date" id="exp-date" class="family-input" value="${escapeHtml(exp.date)}">
      <label class="family-label" for="exp-note">Note</label>
      <input id="exp-note" class="family-input" maxlength="200" autocomplete="off" value="${escapeHtml(exp.note || '')}">
      <div class="sheet-actions">
        ${existing ? '<button class="btn-danger" onclick="deleteExpenseFromEditor()">Supprimer</button>' : ''}
        <button class="btn-primary" onclick="saveExpenseFromEditor()">Enregistrer</button>
      </div>
    </div>`);
  setTimeout(() => { const el = document.getElementById('exp-amount'); if (el && !existing) el.focus(); }, 60);
}
window.openExpenseEditor = openExpenseEditor;

// Choix unique dans une liste de pastilles ; allowNone : un second appui désélectionne
function budPickSingle(btn, allowNone) {
  const box = btn.closest('.cal-picks');
  const wasSelected = btn.classList.contains('is-selected');
  box.querySelectorAll('.cal-pick').forEach(b => b.classList.remove('is-selected'));
  if (allowNone && wasSelected) {
    box.dataset.value = '';
    return;
  }
  btn.classList.add('is-selected');
  box.dataset.value = btn.dataset.value;
}
window.budPickSingle = budPickSingle;

function saveExpenseFromEditor() {
  const e = _budEditing;
  if (!e) return;
  const cents = parseAmountToCents(document.getElementById('exp-amount').value);
  if (!cents) {
    showToast('Montant invalide', 'error');
    return;
  }
  const date = document.getElementById('exp-date').value;
  if (!date) {
    showToast('Indiquez une date', 'error');
    return;
  }
  const memberBox = document.getElementById('exp-member');
  const expense = {
    ...e.expense,
    amountCents: cents,
    label: document.getElementById('exp-label').value.trim().slice(0, 80),
    categoryId: document.getElementById('exp-category').dataset.value || '',
    memberId: memberBox ? (memberBox.dataset.value || '') : '',
    date,
    note: document.getElementById('exp-note').value.trim().slice(0, 200)
  };
  saveExpense(expense);
  _budEditing = null;
  closeSheet('expense-editor');
  if (date.slice(0, 7) !== _budMonth() && state.currentView && state.currentView.startsWith('budget-')) _bud.month = date.slice(0, 7);
  _budRefreshIfVisible();
  showToast(`${formatEuros(cents)} ${e.isNew ? 'ajoutés' : 'enregistrés'} ✓`, 'success');
}
window.saveExpenseFromEditor = saveExpenseFromEditor;

async function deleteExpenseFromEditor() {
  const e = _budEditing;
  if (!e) return;
  if (!(await uiConfirm(`Supprimer cette dépense de ${formatEuros(e.expense.amountCents)} ?`, { confirmLabel: 'Supprimer', danger: true }))) return;
  deleteExpense(e.expense.id);
  _budEditing = null;
  closeSheet('expense-editor');
  _budRefreshIfVisible();
  showToast('Dépense supprimée', 'success');
}
window.deleteExpenseFromEditor = deleteExpenseFromEditor;

function _budRefreshIfVisible() {
  const v = state.currentView;
  if (v && v.startsWith('budget-')) renderBudget();
  else if (v === 'hub' && typeof renderHub === 'function') renderHub();
}

// ============================================
// Catégories et budgets
// ============================================

function openBudgetSettings() {
  _ensureDefaultCategories();
  // Valeurs affichées à l'ouverture (data-initial-*) : seules les valeurs réellement modifiées par
  // l'utilisateur sont enregistrées (une valeur changée entre-temps par un autre téléphone est gardée)
  const rows = _activeCategories().map((c, i) => `
    <div class="bud-cat-row" data-id="${escapeHtml(c.id)}" data-initial-name="${escapeHtml(c.name)}"
      data-initial-emoji="${escapeHtml(c.emoji || '')}" data-initial-limit="${Number(c.limitCents) || 0}" data-initial-order="${i}">
      <input class="family-input bud-cat-emoji" maxlength="16" value="${escapeHtml(c.emoji || '')}" aria-label="Emoji">
      <input class="family-input bud-cat-name" maxlength="30" value="${escapeHtml(c.name)}" aria-label="Nom">
      <input class="family-input bud-cat-limit" inputmode="decimal" placeholder="Plafond" value="${escapeHtml(_centsToInput(c.limitCents))}" aria-label="Plafond mensuel (€)">
      <button type="button" class="icon-btn icon-btn-light" onclick="budArchiveCategory(${_jsArg(c.id)})" aria-label="Retirer la catégorie">${_CAL_ICON_CLOSE}</button>
    </div>`).join('');
  openSheet('budget-settings', `
    <div class="modal-header">
      <h2>Catégories et budgets</h2>
      <button class="icon-btn icon-btn-light" onclick="closeSheet('budget-settings')" aria-label="Fermer">${_CAL_ICON_CLOSE}</button>
    </div>
    <div class="sheet-body">
      <label class="family-label" for="bud-monthly">Budget mensuel de la famille</label>
      <div class="bud-amount-wrap">
        <input id="bud-monthly" class="family-input bud-amount-input" inputmode="decimal" placeholder="Ex. 2 000" value="${escapeHtml(_centsToInput(state.budgetSettings.monthlyBudgetCents))}" data-initial="${Number(state.budgetSettings.monthlyBudgetCents) || 0}">
        <span class="bud-amount-cur">€</span>
      </div>
      <span class="family-label">Catégories <small>(plafond mensuel facultatif)</small></span>
      <div id="bud-cat-rows" class="bud-cat-rows">${rows}</div>
      <button class="btn-secondary btn-block" onclick="budAddCategoryRow()">+ Ajouter une catégorie</button>
      <div class="sheet-actions"><button class="btn-primary" onclick="saveBudgetSettingsFromSheet()">Enregistrer</button></div>
    </div>`);
}
window.openBudgetSettings = openBudgetSettings;

function budAddCategoryRow() {
  const box = document.getElementById('bud-cat-rows');
  if (!box) return;
  const row = document.createElement('div');
  row.className = 'bud-cat-row';
  row.dataset.id = 'bc_' + uid();
  row.dataset.isNew = '1';
  row.innerHTML = `
    <input class="family-input bud-cat-emoji" maxlength="16" value="🏷️" aria-label="Emoji">
    <input class="family-input bud-cat-name" maxlength="30" placeholder="Nom" aria-label="Nom">
    <input class="family-input bud-cat-limit" inputmode="decimal" placeholder="Plafond" aria-label="Plafond mensuel (€)">
    <span></span>`;
  box.appendChild(row);
  row.querySelector('.bud-cat-name').focus();
}
window.budAddCategoryRow = budAddCategoryRow;

async function budArchiveCategory(id) {
  const c = getBudgetCategory(id);
  if (!c) return;
  const used = state.expenses.some(e => e.categoryId === id);
  if (!(await uiConfirm(`Retirer la catégorie « ${c.name} » ?${used ? '\nLes dépenses existantes la gardent.' : ''}`, { confirmLabel: 'Retirer', danger: true }))) return;
  c.archived = true;
  c.updatedAt = Date.now();
  saveBudgetCategories();
  markDirty('budget_categories', id);
  // Ligne retirée de la feuille ouverte sans la redessiner (les saisies en cours restent) ; les lignes
  // suivantes remontent d'un rang, comme après un nouvel affichage (aucun ordre réécrit pour rien)
  const rows = [...document.querySelectorAll('#bud-cat-rows .bud-cat-row')];
  const i = rows.findIndex(r => r.dataset.id === id);
  if (i >= 0) {
    rows.slice(i + 1).forEach(r => {
      if (r.dataset.initialOrder != null) r.dataset.initialOrder = String(Number(r.dataset.initialOrder) - 1);
    });
    rows[i].remove();
  }
  _budRefreshIfVisible();
}
window.budArchiveCategory = budArchiveCategory;

function saveBudgetSettingsFromSheet() {
  const monthlyInput = document.getElementById('bud-monthly');
  const monthlyRaw = monthlyInput.value.trim();
  const monthly = monthlyRaw ? parseAmountToCents(monthlyRaw) : 0;
  if (monthlyRaw && !monthly) {
    showToast('Budget mensuel invalide', 'error');
    return;
  }
  const now = Date.now();
  let order = 0;
  let nextOrder = Math.max(-1, ...state.budgetCategories.map(c => Number(c.order) || 0)) + 1;
  for (const row of document.querySelectorAll('#bud-cat-rows .bud-cat-row')) {
    const id = row.dataset.id;
    const name = row.querySelector('.bud-cat-name').value.trim().slice(0, 30);
    const emoji = clipEmoji(row.querySelector('.bud-cat-emoji').value);
    const limitRaw = row.querySelector('.bud-cat-limit').value.trim();
    const limit = limitRaw ? parseAmountToCents(limitRaw) : 0;
    if (limitRaw && !limit) {
      showToast(`Plafond invalide pour « ${name || 'catégorie'} »`, 'error');
      return;
    }
    if (!name) {
      if (row.dataset.isNew) continue; // nouvelle ligne laissée vide : ignorée
      showToast('Une catégorie doit avoir un nom', 'error');
      return;
    }
    const existing = getBudgetCategory(id);
    const position = order++;
    if (!existing) {
      state.budgetCategories.push({ id, archived: false, name, emoji, limitCents: limit || 0, order: nextOrder++, updatedAt: now });
      markDirty('budget_categories', id);
      continue;
    }
    const init = row.dataset;
    const changes = {};
    if (name !== init.initialName) changes.name = name;
    if (emoji !== init.initialEmoji) changes.emoji = emoji;
    if ((limit || 0) !== (Number(init.initialLimit) || 0)) changes.limitCents = limit || 0;
    if (String(position) !== init.initialOrder) changes.order = position;
    if (Object.keys(changes).length) {
      Object.assign(existing, changes, { updatedAt: now });
      markDirty('budget_categories', id);
    }
  }
  saveBudgetCategories();
  if ((monthly || 0) !== (Number(monthlyInput.dataset.initial) || 0)) {
    Object.assign(state.budgetSettings, { id: BUDGET_SETTINGS_ID, monthlyBudgetCents: monthly || 0, updatedAt: now });
    saveBudgetSettings();
    markDirty('budget_settings', BUDGET_SETTINGS_ID);
  }
  closeSheet('budget-settings');
  _budRefreshIfVisible();
  showToast('Budgets enregistrés ✓', 'success');
}
window.saveBudgetSettingsFromSheet = saveBudgetSettingsFromSheet;
