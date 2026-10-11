// ============================================
// LA MAISONNÉE — Budget familial
// ============================================
// Dépenses (montant en centimes, catégorie, membre, date), catégories avec plafond mensuel
// facultatif, budget habituel (chaque mois) et budget propre à un mois, dépenses récurrentes
// mensuelles (loyer, charges…) et annuelles (assurance, taxe foncière…). Vues : Aperçu (reste du mois,
// comparaison au mois précédent, projection de fin de mois, par catégorie, par membre) et Dépenses
// (liste groupée par jour, filtrable, recherche texte). Synchronisé en famille (kinds 'expenses',
// 'budget_categories', 'budget_settings', 'budget_recurring', 'budget_yearly', 'budget_months').
//
// Script classique chargé après app.js, sync.js et family.js.

const EXPENSES_STORAGE_KEY = 'mr_expenses';
const BUDGET_CATEGORIES_STORAGE_KEY = 'mr_budget_categories';
const BUDGET_SETTINGS_STORAGE_KEY = 'mr_budget_settings';
const BUDGET_RECURRING_STORAGE_KEY = 'mr_budget_recurring';
const BUDGET_YEARLY_STORAGE_KEY = 'mr_budget_yearly';
const BUDGET_MONTHS_STORAGE_KEY = 'mr_budget_months';
const BUDGET_SETTINGS_ID = 'settings';
const BUDGET_PROJECTION_MIN_DAY = 5; // avant le 5, le rythme du mois ne dit encore rien
const BUDGET_QUICK_AMOUNTS = [5, 10, 20, 50]; // boutons « +5 € »… de la fiche dépense

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
state.budgetSettings = { id: BUDGET_SETTINGS_ID, monthlyBudgetCents: 0 }; // budget habituel
// Budget propre à un mois (remplace le budget habituel ce mois-là) : [{ id: 'bm_YYYY-MM', month, amountCents, updatedAt }]
state.budgetMonths = [];
// Dépenses récurrentes : [{ id, freq: 'monthly'|'yearly', label, amountCents, categoryId, memberId, note,
//   day (1-31), startMonth 'YYYY-MM', endMonth 'YYYY-MM' | '', createdAt, updatedAt }]. Une récurrence
// annuelle tombe chaque année le mois de startMonth. Les mensuelles sont dans budgetRecurring (kind
// 'budget_recurring'), les annuelles dans budgetYearly (kind 'budget_yearly') : une version de l'app qui
// ne connaît que les mensuelles ignore ce kind (elle créerait sinon une dépense chaque mois), puis le
// rattrape seule une fois à jour.
state.budgetRecurring = [];
state.budgetYearly = [];

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
  try {
    const rec = JSON.parse(localStorage.getItem(BUDGET_RECURRING_STORAGE_KEY) || '[]');
    state.budgetRecurring = Array.isArray(rec) ? rec.filter(_isValidRecurring) : [];
  } catch (e) { state.budgetRecurring = []; }
  try {
    const yearly = JSON.parse(localStorage.getItem(BUDGET_YEARLY_STORAGE_KEY) || '[]');
    state.budgetYearly = Array.isArray(yearly) ? yearly.filter(_isValidYearly) : [];
  } catch (e) { state.budgetYearly = []; }
  try {
    const months = JSON.parse(localStorage.getItem(BUDGET_MONTHS_STORAGE_KEY) || '[]');
    state.budgetMonths = Array.isArray(months) ? months.filter(_isValidMonthBudget) : [];
  } catch (e) { state.budgetMonths = []; }
  budgetGenerateRecurring(); // sans famille : dépenses récurrentes du mois créées dès le démarrage
}

function saveExpenses() { return safeSave(EXPENSES_STORAGE_KEY, state.expenses, 'dépenses'); }
function saveBudgetCategories() { return safeSave(BUDGET_CATEGORIES_STORAGE_KEY, state.budgetCategories, 'catégories de budget'); }
function saveBudgetSettings() { return safeSave(BUDGET_SETTINGS_STORAGE_KEY, state.budgetSettings, 'budget'); }
function saveBudgetRecurring() { return safeSave(BUDGET_RECURRING_STORAGE_KEY, state.budgetRecurring, 'dépenses récurrentes'); }
function saveBudgetYearly() { return safeSave(BUDGET_YEARLY_STORAGE_KEY, state.budgetYearly, 'dépenses annuelles'); }
function saveBudgetMonths() { return safeSave(BUDGET_MONTHS_STORAGE_KEY, state.budgetMonths, 'budgets du mois'); }

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

const _BUD_MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function _isValidRecurring(r) {
  return !!r && typeof r === 'object' && !!r.id && Number.isFinite(r.amountCents) && r.amountCents > 0 &&
    Number.isInteger(r.day) && r.day >= 1 && r.day <= 31 && _BUD_MONTH_RE.test(r.startMonth || '') &&
    (!r.endMonth || _BUD_MONTH_RE.test(r.endMonth));
}
function _isValidYearly(r) {
  return _isValidRecurring(r) && r.freq === 'yearly';
}
function _isValidMonthBudget(b) {
  return !!b && typeof b === 'object' && _BUD_MONTH_RE.test(b.month || '') && b.id === 'bm_' + b.month &&
    Number.isFinite(b.amountCents) && b.amountCents > 0;
}
SYNC_COLLECTIONS.budget_recurring = _arrayCollection('budgetRecurring', () => saveBudgetRecurring(), r => _isValidRecurring(r) && r.freq !== 'yearly');
SYNC_COLLECTIONS.budget_yearly = _arrayCollection('budgetYearly', () => saveBudgetYearly(), _isValidYearly);
SYNC_COLLECTIONS.budget_months = _arrayCollection('budgetMonths', () => saveBudgetMonths(), _isValidMonthBudget);

function getBudgetCategory(id) {
  return state.budgetCategories.find(c => c.id === id) || null;
}

// Toutes les récurrences, mensuelles puis annuelles
function _allRecurring() {
  return state.budgetRecurring.concat(state.budgetYearly);
}

function getBudgetRecurring(id) {
  return _allRecurring().find(r => r.id === id) || null;
}

// Budget d'un mois : son budget propre s'il en a un, sinon le budget habituel (0 : aucun)
function budgetMonthDoc(month) {
  return state.budgetMonths.find(b => b.month === month) || null;
}

function budgetOfMonth(month) {
  const doc = budgetMonthDoc(month);
  return doc ? doc.amountCents : (state.budgetSettings.monthlyBudgetCents || 0);
}

// ============================================
// Dépenses récurrentes
// ============================================
// Chaque mois, une dépense par récurrence, créée dès le 1er, datée de son jour (« prévue » jusque-là).
// Id déterministe (ex_rec_<récurrence>_<mois>) : deux téléphones qui la créent produisent le même
// document. Supprimer une de ces dépenses l'ANNULE (cancelled) sans effacer le document : elle n'est
// donc jamais recréée. Rattrapage limité aux 12 derniers mois. Relié à une famille, on attend une
// synchronisation réussie (depuis le dernier changement de famille ou « Tout supprimer ») : sinon une
// dépense annulée ou corrigée sur un autre téléphone, pas encore reçue ici, serait recréée ou réécrite
// (et renvoyée à toute la famille, puisque l'envoi passe avant la réception).
// Chaque dépense créée porte recAt, la version (updatedAt) de sa récurrence : tant qu'on ne la retouche
// pas à la main, la dépense du mois en cours suit les modifications de la récurrence.

function _budShiftMonth(month, delta) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Date de la dépense du mois : un jour au-delà de la fin du mois tombe le dernier jour
function _recurringDate(rec, month) {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return `${month}-${String(Math.min(rec.day, last)).padStart(2, '0')}`;
}

function _recurringExpenseId(recId, month) {
  return `ex_rec_${recId}_${month}`;
}

// La récurrence a-t-elle une dépense ce mois-ci ? (dans sa période ; une annuelle : le mois de son départ)
function _recCoversMonth(rec, month) {
  if (month < rec.startMonth || (rec.endMonth && rec.endMonth < month)) return false;
  return rec.freq !== 'yearly' || month.slice(5) === rec.startMonth.slice(5);
}

function _monthName(month) {
  return new Date(2000, Number(month.slice(5)) - 1, 1).toLocaleDateString('fr-FR', { month: 'long' });
}

// « le 5 de chaque mois », « le 12 mars de chaque année »
function _recWhenLabel(rec) {
  return rec.freq === 'yearly' ? `le ${rec.day} ${_monthName(rec.startMonth)} de chaque année` : `le ${rec.day} de chaque mois`;
}

// Époque de sync (_syncEpoch de sync.js) de la dernière synchronisation réussie, -1 : aucune. Créer,
// rejoindre ou quitter une famille et « Tout supprimer » changent d'époque : on attend alors la suivante.
let _budSyncedEpoch = -1;

// Relié à une famille sans avoir reçu sa version depuis le dernier changement d'époque (voir plus haut)
function _budMustWaitSync() {
  return typeof syncEnabled === 'function' && syncEnabled() && _budSyncedEpoch !== _syncEpoch;
}

// Crée les dépenses récurrentes manquantes. onlyId : une récurrence qu'on vient de CRÉER, sans attendre la
// synchronisation (aucun autre téléphone n'a de dépense pour elle). Renvoie le nombre de dépenses créées.
function budgetGenerateRecurring(onlyId) {
  if (!onlyId && _budMustWaitSync()) return 0;
  const current = formatPlanningDate(new Date()).slice(0, 7);
  const oldest = _budShiftMonth(current, -11);
  const now = Date.now();
  const created = [];
  for (const rec of _allRecurring()) {
    if (!_isValidRecurring(rec) || (onlyId && rec.id !== onlyId)) continue;
    const last = rec.endMonth && rec.endMonth < current ? rec.endMonth : current;
    for (let m = rec.startMonth > oldest ? rec.startMonth : oldest; m <= last; m = _budShiftMonth(m, 1)) {
      if (!_recCoversMonth(rec, m)) continue; // annuelle : seulement le mois anniversaire
      const id = _recurringExpenseId(rec.id, m);
      if (state.expenses.some(e => e.id === id)) continue; // déjà créée (ou annulée)
      state.expenses.push({
        id, recurringId: rec.id, date: _recurringDate(rec, m), amountCents: rec.amountCents,
        label: rec.label || '', categoryId: rec.categoryId || '', memberId: rec.memberId || '', note: rec.note || '',
        recAt: rec.updatedAt || 0, createdAt: now, updatedAt: now
      });
      created.push(id);
    }
  }
  if (created.length) {
    saveExpenses();
    created.forEach(id => markDirty('expenses', id));
  }
  return created.length;
}

// Récurrence modifiée (ici ou sur un autre téléphone) : la dépense du mois en cours la suit si elle est
// encore à venir et n'a pas été retouchée à la main (elle porte alors recAt, plus ancien que la
// récurrence). Les mois passés gardent leur montant. Si la récurrence ne couvre plus le mois (terminée
// avant, repoussée, ou devenue annuelle avec un autre mois), sa dépense est retirée pour de bon : elle
// reviendra si la période la couvre de nouveau. Une récurrence périmée ne réaligne jamais en arrière
// (son updatedAt ne dépasse pas recAt). Renvoie le nombre de dépenses changées.
function _budRealignRecurring(onlyId) {
  if (_budMustWaitSync()) return 0;
  const today = formatPlanningDate(new Date());
  const month = today.slice(0, 7);
  const changed = [];
  for (const rec of _allRecurring()) {
    if (!_isValidRecurring(rec) || (onlyId && rec.id !== onlyId)) continue;
    const e = state.expenses.find(x => x.id === _recurringExpenseId(rec.id, month));
    if (!e || e.cancelled || !e.date || e.date < today || !e.recAt || e.recAt >= (rec.updatedAt || 0)) continue;
    if (!_recCoversMonth(rec, month)) {
      state.expenses = state.expenses.filter(x => x !== e);
    } else {
      Object.assign(e, {
        amountCents: rec.amountCents, label: rec.label || '', categoryId: rec.categoryId || '',
        memberId: rec.memberId || '', note: rec.note || '', date: _recurringDate(rec, month),
        recAt: rec.updatedAt, updatedAt: Date.now()
      });
    }
    changed.push(e.id);
  }
  if (changed.length) {
    saveExpenses();
    changed.forEach(id => markDirty('expenses', id));
  }
  return changed.length;
}

// Type de document et tableau d'une récurrence, selon sa fréquence
function _recStore(yearly) {
  return yearly
    ? { key: 'budgetYearly', kind: 'budget_yearly', save: saveBudgetYearly }
    : { key: 'budgetRecurring', kind: 'budget_recurring', save: saveBudgetRecurring };
}

function _budUpsertRecurring(rec) {
  const yearly = rec.freq === 'yearly';
  const to = _recStore(yearly), from = _recStore(!yearly);
  // Fréquence changée : la récurrence change de type de document (l'ancien est supprimé, même id)
  if (state[from.key].some(r => r.id === rec.id)) {
    state[from.key] = state[from.key].filter(r => r.id !== rec.id);
    from.save();
    markDirty(from.kind, rec.id);
  }
  const arr = state[to.key];
  const i = arr.findIndex(r => r.id === rec.id);
  if (i >= 0) arr[i] = rec; else arr.push(rec);
  to.save();
  markDirty(to.kind, rec.id);
}

function _budRemoveRecurring(rec) {
  const store = _recStore(rec.freq === 'yearly');
  state[store.key] = state[store.key].filter(x => x.id !== rec.id);
  store.save();
  markDirty(store.kind, rec.id);
}

// Après chaque synchronisation réussie (epoch : celle du début du cycle) : la version de la famille est connue
if (typeof SYNC_CYCLE_HOOKS !== 'undefined') {
  SYNC_CYCLE_HOOKS.push(epoch => {
    _budSyncedEpoch = epoch;
    if (budgetGenerateRecurring() + _budRealignRecurring()) _budRefreshIfVisible();
  });
}
// Nouveau mois pendant que l'app reste ouverte : au retour au premier plan. Relié à une famille, c'est la
// synchronisation lancée au même moment (sync.js) qui s'en charge, une fois la version de la famille reçue
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || (typeof syncEnabled === 'function' && syncEnabled())) return;
  if (budgetGenerateRecurring()) _budRefreshIfVisible();
});

function _activeCategories() {
  return state.budgetCategories.filter(c => !c.archived).sort((a, b) => (a.order || 0) - (b.order || 0));
}

// expense : un nouvel objet (comparé à la version enregistrée)
function saveExpense(expense) {
  const now = Date.now();
  const old = state.expenses.find(e => e.id === expense.id);
  // Dépense d'une récurrence retouchée à la main : elle ne suit plus les modifications de la récurrence
  if (expense.recAt && old && ['amountCents', 'label', 'categoryId', 'memberId', 'date', 'note']
    .some(k => (expense[k] || '') !== (old[k] || ''))) delete expense.recAt;
  expense.updatedAt = now;
  if (!expense.createdAt) expense.createdAt = now;
  const i = state.expenses.findIndex(e => e.id === expense.id);
  if (i >= 0) state.expenses[i] = expense; else state.expenses.push(expense);
  saveExpenses();
  markDirty('expenses', expense.id);
}

function deleteExpense(id) {
  const e = state.expenses.find(x => x.id === id);
  if (e && e.recurringId) {
    // Dépense d'une récurrence : annulée et gardée (sinon elle serait recréée), comptée nulle part
    Object.assign(e, { cancelled: true, updatedAt: Date.now() });
  } else {
    state.expenses = state.expenses.filter(x => x.id !== id);
  }
  saveExpenses();
  markDirty('expenses', id);
}

// ============================================
// Calculs (fonctions pures sur state)
// ============================================

function expensesOfMonth(month) {
  return state.expenses.filter(e => e.date && e.date.slice(0, 7) === month && !e.cancelled);
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

function _daysInMonthOf(month) {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

// Dépensé dans le mois jusqu'au jour donné inclus (un jour au-delà de la fin du mois : le dernier jour)
function _budSpentThrough(month, day) {
  const limit = `${month}-${String(Math.min(day, _daysInMonthOf(month))).padStart(2, '0')}`;
  return expensesOfMonth(month).filter(e => e.date <= limit).reduce((t, e) => t + e.amountCents, 0);
}

// Comparaison au mois précédent. Mois en cours : dépensé jusqu'à aujourd'hui, face au mois précédent à la
// même date (les dépenses « prévues » ne comptent pas encore). Mois passé : mois entiers. Mois à venir, ou
// mois précédent sans dépense : null. → { prev, now, before, pct, sameDate }
function budgetComparison(month, today) {
  const current = today.slice(0, 7);
  if (month > current) return null;
  const prev = _budShiftMonth(month, -1);
  const sameDate = month === current;
  const day = sameDate ? Number(today.slice(8, 10)) : 31;
  const now = _budSpentThrough(month, day);
  const before = _budSpentThrough(prev, day);
  if (!before) return null;
  return { prev, now, before, pct: Math.round(((now - before) / before) * 100), sameDate };
}

// Projection de fin de mois (mois en cours, à partir du BUDGET_PROJECTION_MIN_DAY) : tout ce qui est déjà
// saisi pour le mois (récurrentes prévues comprises), plus le rythme quotidien des dépenses PONCTUELLES
// déjà faites prolongé jusqu'à la fin du mois. Les récurrentes (loyer…) ne sont donc pas extrapolées.
// → { cents, total, variable } ou null
function budgetProjection(month, today) {
  if (month !== today.slice(0, 7)) return null;
  const day = Number(today.slice(8, 10));
  if (day < BUDGET_PROJECTION_MIN_DAY) return null;
  const list = expensesOfMonth(month);
  const total = list.reduce((t, e) => t + e.amountCents, 0);
  const variable = list.filter(e => !e.recurringId && e.date <= today).reduce((t, e) => t + e.amountCents, 0);
  return { cents: Math.round(total + (variable / day) * (_daysInMonthOf(month) - day)), total, variable };
}

// ============================================
// Vues : Aperçu · Dépenses
// ============================================

const _bud = { month: '', categories: [], members: [], query: '' };

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
  // Champ de recherche en cours de saisie : seuls les résultats sont redessinés (le clavier reste ouvert)
  const input = document.getElementById('bud-search');
  const box = document.getElementById('bud-expenses-results');
  if (_budMode === 'expenses' && input && box && document.activeElement === input) {
    const period = el.querySelector('.cal-period');
    if (period) period.textContent = _monthLabel(month);
    const tb = el.querySelector('.cal-toolbar');
    if (tb) tb.classList.toggle('hidden', !!_bud.query.trim());
    box.innerHTML = _budExpensesResultsHtml(month);
    return;
  }
  // Recherche en cours (Dépenses) : elle porte sur tous les mois, le choix du mois est masqué
  const searching = _budMode === 'expenses' && !!_bud.query.trim();
  const toolbar = `<div class="cal-toolbar${searching ? ' hidden' : ''}">
      <button class="icon-btn" onclick="budShiftMonth(-1)" aria-label="Mois précédent">${_CAL_ICON_PREV}</button>
      <div class="cal-period">${escapeHtml(_monthLabel(month))}</div>
      <button class="icon-btn" onclick="budShiftMonth(1)" aria-label="Mois suivant">${_CAL_ICON_NEXT}</button>
    </div>`;
  el.innerHTML = toolbar + (_budMode === 'overview' ? _budOverviewHtml(month) : _budExpensesHtml(month));
}
window.renderBudget = renderBudget;

function budShiftMonth(delta) {
  _bud.month = _budShiftMonth(_budMonth(), delta);
  renderBudget();
}
window.budShiftMonth = budShiftMonth;

function _budBar(pct, over) {
  return `<span class="bud-bar${over ? ' is-over' : ''}"><span class="bud-bar-fill" style="width:${Math.max(0, Math.min(100, Math.round(pct)))}%"></span></span>`;
}

// « de mars », « d'octobre »
function _deMonth(name) {
  return (/^[aeiouyàâéèêîïôûù]/i.test(name) ? "d'" : 'de ') + name;
}

// Comparaison au mois précédent (voir budgetComparison) : une ligne, ou ''
function _budCompareHtml(month, today) {
  const c = budgetComparison(month, today);
  if (!c) return '';
  const when = `qu'en ${_monthName(c.prev)}${c.sameDate ? ' à la même date' : ''}`;
  const text = c.pct > 0 ? `▲ ${c.pct} % de plus ${when}`
    : c.pct < 0 ? `▼ ${-c.pct} % de moins ${when}`
      : `= Autant ${when}`;
  return `<p class="bud-compare${c.pct > 0 ? ' is-up' : ''}">${escapeHtml(text)} <small>(${escapeHtml(formatEuros(c.before, true))})</small></p>`;
}

// Projection de fin de mois (voir budgetProjection) : un encart, ou ''
function _budProjectionHtml(month, today, budget) {
  const p = budgetProjection(month, today);
  if (!p) return '';
  const over = budget && p.cents > budget;
  const verdict = !budget ? ''
    : over ? `dépassement estimé de ${formatEuros(p.cents - budget, true)}`
      : `dans le budget (≈ ${formatEuros(budget - p.cents, true)} de marge)`;
  return `<div class="bud-projection${over ? ' is-over' : ''}">
      <p class="bud-projection-main">📈 Fin de mois estimée : <strong>${escapeHtml(formatEuros(p.cents, true))}</strong></p>
      ${verdict ? `<p class="bud-projection-verdict">${escapeHtml(verdict)}</p>` : ''}
      <p class="bud-projection-hint">D'après le rythme des dépenses ponctuelles depuis le 1er. Les dépenses récurrentes du mois sont comptées telles quelles.</p>
    </div>`;
}

function _budOverviewHtml(month) {
  const s = budgetSummary(month);
  const budget = budgetOfMonth(month);
  const ownBudget = !!budgetMonthDoc(month);
  const left = budget - s.total;
  // Dépenses à venir ce mois-ci (récurrentes créées dès le 1er) : comptées, et signalées
  const today = formatPlanningDate(new Date());
  const planned = expensesOfMonth(month).filter(e => e.date > today).reduce((t, e) => t + e.amountCents, 0);
  const plannedText = planned ? `dont ${formatEuros(planned)} prévus` : '';
  const monthName = _deMonth(_monthName(month));
  const head = budget
    ? `<p class="bud-left${left < 0 ? ' is-over' : ''}">${left >= 0 ? 'Reste' : 'Dépassement'} <strong>${escapeHtml(formatEuros(Math.abs(left)))}</strong></p>
       ${_budBar(budget ? (s.total / budget) * 100 : 0, left < 0)}
       <p class="bud-sub">${escapeHtml(formatEuros(s.total))} dépensés sur ${escapeHtml(formatEuros(budget, true))}${plannedText ? ' · ' + escapeHtml(plannedText) : ''}</p>
       <button class="bud-link bud-month-link" onclick="openMonthBudgetSheet()">✏️ Budget ${escapeHtml(monthName)}${ownBudget ? ' (propre à ce mois)' : ''}</button>`
    : `<p class="bud-left"><strong>${escapeHtml(formatEuros(s.total))}</strong> dépensés</p>
       ${plannedText ? `<p class="bud-sub">${escapeHtml(_capitalize(plannedText))}</p>` : ''}
       <button class="cal-add-link" onclick="openMonthBudgetSheet()">Définir un budget →</button>`;
  const nRec = _allRecurring().length;
  const recLink = `<button class="cal-add-link" onclick="openRecurringList()">🔁 Dépenses récurrentes${nRec ? ` (${nRec})` : ''} →</button>`;

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
    <section class="hub-card bud-summary">${head}${_budCompareHtml(month, today)}${_budProjectionHtml(month, today, budget)}${recLink}</section>
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
  _bud.query = '';
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

// Texte comparable : minuscules, sans accents (œ/æ remplacés avant la décomposition)
function _budNorm(s) {
  return String(s || '').toLowerCase().replace(/œ/g, 'oe').replace(/æ/g, 'ae')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// Une dépense correspond si chaque mot cherché apparaît dans son libellé, sa note, sa catégorie, son
// membre ou son montant (« 12,5 » comme « 12.5 », avec ou sans « € » collé)
function _budMatches(e, words) {
  const c = getBudgetCategory(e.categoryId);
  const m = e.memberId ? getMember(e.memberId) : null;
  const hay = _budNorm([e.label, e.note, c && c.name, m && m.name, formatEuros(e.amountCents),
    (e.amountCents / 100).toFixed(2).replace('.', ',')].filter(Boolean).join(' '));
  return words.every(w => {
    const v = w.replace(/€/g, '');
    return !v || hay.includes(v) || hay.includes(v.replace(/\./g, ','));
  });
}

function _budExpensesHtml(month) {
  return `<div class="bud-search">
      <input type="search" id="bud-search" class="family-input" placeholder="🔎 Rechercher : libellé, note, catégorie, montant…"
        value="${escapeHtml(_bud.query)}" oninput="budSearch(this.value)" autocomplete="off" enterkeyhint="search" aria-label="Rechercher une dépense">
    </div>
    <div id="bud-expenses-results">${_budExpensesResultsHtml(month)}</div>`;
}

// Saisie dans la recherche : seuls les résultats sont redessinés (le champ garde le clavier)
function budSearch(value) {
  _bud.query = String(value || '').slice(0, 80);
  const toolbar = document.querySelector('#budget-content .cal-toolbar');
  if (toolbar) toolbar.classList.toggle('hidden', !!_bud.query.trim());
  const box = document.getElementById('bud-expenses-results');
  if (box) box.innerHTML = _budExpensesResultsHtml(_budMonth());
}
window.budSearch = budSearch;

function _budExpensesResultsHtml(month) {
  const words = _budNorm(_bud.query).split(/\s+/).filter(Boolean);
  const searching = words.length > 0;
  let list = searching ? state.expenses.filter(e => e.date && !e.cancelled && _budMatches(e, words)) : expensesOfMonth(month);
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
      const otherYear = e.date.slice(0, 4) !== today.slice(0, 4);
      const label = e.date === today ? "Aujourd'hui" : e.date === yesterday ? 'Hier'
        : _capitalize(_fmtDate(e.date, otherYear ? { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' } : { weekday: 'long', day: 'numeric', month: 'long' }));
      const dayTotal = list.filter(x => x.date === e.date).reduce((t, x) => t + x.amountCents, 0);
      html += `<section class="cal-agenda-day"><h3 class="cal-agenda-title bud-day-title"><span>${escapeHtml(label)}</span><span>${escapeHtml(formatEuros(dayTotal))}</span></h3><div class="cal-list">`;
    }
    const c = getBudgetCategory(e.categoryId);
    const m = e.memberId ? getMember(e.memberId) : null;
    html += `<button class="bud-expense" onclick="openExpenseEditor(${_jsArg(e.id)})">
      <span class="bud-row-emoji" aria-hidden="true">${escapeHtml((c && c.emoji) || '📦')}</span>
      <span class="bud-row-main">
        <span class="bud-expense-label">${escapeHtml(e.label || (c ? c.name : 'Dépense'))}${e.recurringId ? ' <span class="bud-tag" title="Dépense récurrente">🔁</span>' : ''}${e.date > today ? ' <span class="bud-tag bud-tag-planned">prévue</span>' : ''}</span>
        <span class="bud-expense-sub">${escapeHtml(c ? c.name : 'Sans catégorie')}${e.note ? ' · ' + escapeHtml(e.note) : ''}</span>
      </span>
      ${m ? memberAvatarHtml(m, 'sm') : ''}
      <span class="bud-expense-amount">${escapeHtml(formatEuros(e.amountCents))}</span>
    </button>`;
  }
  if (currentDay) html += '</div></section>';

  const count = `${list.length} ${searching ? `résultat${list.length > 1 ? 's' : ''} dans tous les mois` : `dépense${list.length > 1 ? 's' : ''}`}`;
  const empty = searching
    ? `<div class="cal-empty-state"><p>Aucune dépense ne correspond à « ${escapeHtml(_bud.query.trim())} »${_bud.categories.length || _bud.members.length ? ' avec ces filtres' : ''}.</p></div>`
    : `<div class="cal-empty-state"><p>Aucune dépense${_bud.categories.length || _bud.members.length ? ' pour ces filtres' : ' ce mois-ci'}.</p>
      <button class="btn-primary" onclick="openExpenseEditor()">+ Ajouter une dépense</button></div>`;
  return `${filters}
    <p class="bud-total">${count} · <strong>${escapeHtml(formatEuros(total))}</strong></p>
    ${html || empty}`;
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
  // Dépense issue d'une récurrence : la modifier ne change que ce mois
  const rec = existing && existing.recurringId ? getBudgetRecurring(existing.recurringId) : null;
  const recInfo = !existing || !existing.recurringId ? ''
    : rec ? `<p class="family-hint bud-rec-info">🔁 Dépense récurrente « ${escapeHtml(rec.label)} », ${escapeHtml(_recWhenLabel(rec))}${rec.endMonth ? ` jusqu'en ${escapeHtml(_monthLabel(rec.endMonth).toLowerCase())}` : ''} : les modifications ici ne concernent que ${rec.freq === 'yearly' ? 'cette année' : 'ce mois'}.
        <button type="button" class="cal-add-link" onclick="budOpenRecurringFromExpense(${_jsArg(rec.id)})">Modifier la récurrence →</button></p>`
      : `<p class="family-hint bud-rec-info">🔁 Issue d'une dépense récurrente supprimée depuis.</p>`;
  const recToggle = existing ? '' : `<label class="settings-toggle cal-toggle bud-rec-toggle"><input type="checkbox" id="exp-recurring" onchange="budToggleRecurring(this.checked)">
      <span>🔁 Se répète <small>(loyer, charges, abonnement, assurance…)</small></span></label>
      <div class="cal-picks bud-rec-freq hidden" id="exp-rec-freq" data-value="monthly">
        <button type="button" class="cal-pick is-selected" data-value="monthly" onclick="budPickSingle(this)">Chaque mois</button>
        <button type="button" class="cal-pick" data-value="yearly" onclick="budPickSingle(this)">Chaque année</button>
      </div>`;
  const quick = BUDGET_QUICK_AMOUNTS.map(n => `<button type="button" class="cal-pick" onclick="budAddAmount('exp-amount', ${n})">+${n} €</button>`).join('');
  openSheet('expense-editor', `
    <div class="modal-header">
      <h2>${existing ? 'Dépense' : 'Nouvelle dépense'}</h2>
      <button class="icon-btn icon-btn-light" onclick="closeSheet('expense-editor')" aria-label="Fermer">${_CAL_ICON_CLOSE}</button>
    </div>
    <div class="sheet-body">
      ${recInfo}
      <label class="family-label" for="exp-amount">Montant</label>
      <div class="bud-amount-wrap">
        <input id="exp-amount" class="family-input bud-amount-input" inputmode="decimal" autocomplete="off" placeholder="0,00" value="${escapeHtml(_centsToInput(exp.amountCents))}">
        <span class="bud-amount-cur">€</span>
      </div>
      <div class="cal-picks bud-quick">${quick}</div>
      <label class="family-label" for="exp-label">Libellé</label>
      <input id="exp-label" class="family-input" maxlength="80" autocomplete="off" placeholder="Ex. Supermarché" value="${escapeHtml(exp.label || '')}">
      <span class="family-label">Catégorie</span>
      <div class="cal-picks" id="exp-category" data-value="${escapeHtml(exp.categoryId || '')}">${cats}</div>
      ${members ? `<span class="family-label">Qui ? <small>(facultatif)</small></span><div class="cal-picks" id="exp-member" data-value="${escapeHtml(exp.memberId || '')}">${members}</div>` : ''}
      <label class="family-label" for="exp-date">Date</label>
      <input type="date" id="exp-date" class="family-input" value="${escapeHtml(exp.date)}">
      <label class="family-label" for="exp-note">Note</label>
      <input id="exp-note" class="family-input" maxlength="200" autocomplete="off" value="${escapeHtml(exp.note || '')}">
      ${recToggle}
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

// Boutons « +5 € »… : ajoutent au montant saisi (un montant illisible repart de 0)
function budAddAmount(inputId, euros) {
  const input = document.getElementById(inputId);
  if (!input) return;
  input.value = _centsToInput((parseAmountToCents(input.value) || 0) + euros * 100);
}
window.budAddAmount = budAddAmount;

function budToggleRecurring(checked) {
  const box = document.getElementById('exp-rec-freq');
  if (box) box.classList.toggle('hidden', !checked);
}
window.budToggleRecurring = budToggleRecurring;

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
  const recBox = document.getElementById('exp-recurring');
  if (e.isNew && recBox && recBox.checked) {
    // « Se répète » : la récurrence crée elle-même la dépense de ce mois (et celles des suivants). Les
    // mois rattrapés s'arrêtent à 12 : une date plus ancienne ne serait jamais créée
    if (date.slice(0, 7) < _budShiftMonth(formatPlanningDate(new Date()).slice(0, 7), -11)) {
      showToast('Dépense qui se répète : choisis une date dans les 12 derniers mois', 'error');
      return;
    }
    const cat = getBudgetCategory(expense.categoryId);
    const now = Date.now();
    const freqBox = document.getElementById('exp-rec-freq');
    const rec = {
      id: 'rec_' + uid(), freq: freqBox && freqBox.dataset.value === 'yearly' ? 'yearly' : 'monthly',
      label: expense.label || (cat ? cat.name : 'Dépense récurrente'), amountCents: cents,
      categoryId: expense.categoryId, memberId: expense.memberId, note: expense.note,
      day: Number(date.slice(8, 10)), startMonth: date.slice(0, 7), endMonth: '', createdAt: now, updatedAt: now
    };
    _budUpsertRecurring(rec);
    const created = budgetGenerateRecurring(rec.id);
    _budEditing = null;
    closeSheet('expense-editor');
    if (date.slice(0, 7) !== _budMonth() && state.currentView && state.currentView.startsWith('budget-')) _bud.month = date.slice(0, 7);
    _budRefreshIfVisible();
    showToast(created ? `Dépense récurrente créée ✓ ${formatEuros(cents)} ${_recWhenLabel(rec)}`
      : `Dépense récurrente créée ✓ première dépense en ${_monthLabel(rec.startMonth).toLowerCase()}`, 'success');
    return;
  }
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
  const fromRecurring = !!e.expense.recurringId;
  if (!(await uiConfirm(`Supprimer cette dépense de ${formatEuros(e.expense.amountCents)} ?${fromRecurring ? '\nLes dépenses des autres mois ne sont pas touchées.' : ''}`, { confirmLabel: 'Supprimer', danger: true }))) return;
  if (_budEditing !== e) return; // fiche fermée ou remplacée pendant la confirmation
  deleteExpense(e.expense.id);
  _budEditing = null;
  closeSheet('expense-editor');
  _budRefreshIfVisible();
  showToast('Dépense supprimée', 'success');
}
window.deleteExpenseFromEditor = deleteExpenseFromEditor;

// Depuis la fiche d'une dépense récurrente : on la ferme et on ouvre la récurrence à sa place
function budOpenRecurringFromExpense(recId) {
  _budEditing = null;
  closeSheet('expense-editor', true);
  openRecurringEditor(recId);
}
window.budOpenRecurringFromExpense = budOpenRecurringFromExpense;

// ============================================
// Liste et fiche des dépenses récurrentes
// ============================================

function openRecurringList() {
  _ensureDefaultCategories();
  const current = formatPlanningDate(new Date()).slice(0, 7);
  // Mensuelles par jour, puis annuelles par date dans l'année
  const sortKey = r => (r.freq === 'yearly' ? 'b' + r.startMonth.slice(5) : 'a00') + String(r.day).padStart(2, '0');
  const recs = _allRecurring().slice().sort((a, b) => sortKey(a).localeCompare(sortKey(b)) || String(a.label || '').localeCompare(String(b.label || ''), 'fr'));
  const active = r => r.startMonth <= current && !(r.endMonth && r.endMonth < current);
  const rows = recs.map(r => {
    const c = getBudgetCategory(r.categoryId);
    const m = r.memberId ? getMember(r.memberId) : null;
    const yearly = r.freq === 'yearly';
    const when = r.endMonth && r.endMonth < current ? `terminée en ${_monthLabel(r.endMonth).toLowerCase()}`
      : r.startMonth > current ? `à partir de ${_monthLabel(r.startMonth).toLowerCase()}`
        : r.endMonth ? `jusqu'en ${_monthLabel(r.endMonth).toLowerCase()}` : yearly ? 'chaque année' : 'chaque mois';
    return `<button class="bud-expense${active(r) ? '' : ' is-inactive'}" onclick="openRecurringEditor(${_jsArg(r.id)})">
      <span class="bud-row-emoji" aria-hidden="true">${escapeHtml((c && c.emoji) || '🔁')}</span>
      <span class="bud-row-main">
        <span class="bud-expense-label">${escapeHtml(r.label || (c ? c.name : 'Dépense'))}</span>
        <span class="bud-expense-sub">Le ${r.day}${yearly ? ' ' + escapeHtml(_monthName(r.startMonth)) : ''} · ${escapeHtml(when)}${c ? ' · ' + escapeHtml(c.name) : ''}</span>
      </span>
      ${m ? memberAvatarHtml(m, 'sm') : ''}
      <span class="bud-expense-amount">${escapeHtml(formatEuros(r.amountCents))}${yearly ? '<small> /an</small>' : ''}</span>
    </button>`;
  }).join('');
  const running = recs.filter(active);
  const monthly = running.filter(r => r.freq !== 'yearly').reduce((t, r) => t + r.amountCents, 0);
  const yearly = running.filter(r => r.freq === 'yearly').reduce((t, r) => t + r.amountCents, 0);
  const totals = [monthly ? `<strong>${escapeHtml(formatEuros(monthly))}</strong> par mois` : '', yearly ? `<strong>${escapeHtml(formatEuros(yearly))}</strong> par an` : '']
    .filter(Boolean).join(' + ');
  openSheet('budget-recurring', `
    <div class="modal-header">
      <h2>Dépenses récurrentes</h2>
      <button class="icon-btn icon-btn-light" onclick="closeSheet('budget-recurring')" aria-label="Fermer">${_CAL_ICON_CLOSE}</button>
    </div>
    <div class="sheet-body">
      <p class="family-hint">Ajoutées automatiquement dès le 1er du mois (chaque mois, ou chaque année le même mois), et marquées « prévue » jusqu'à leur jour. Supprimer la dépense d'un mois ne touche pas aux autres.</p>
      ${recs.length
        ? `<p class="bud-total">${running.length} en cours${totals ? ' · ' + totals : ''}</p><div class="cal-list">${rows}</div>`
        : `<p class="cal-empty">Aucune dépense récurrente pour l'instant : loyer, charges, abonnements, assurances…</p>`}
      <div class="sheet-actions"><button class="btn-primary" onclick="openRecurringEditor()">+ Nouvelle dépense récurrente</button></div>
    </div>`);
}
window.openRecurringList = openRecurringList;

function _budRefreshRecurringList() {
  const el = document.getElementById('sheet-budget-recurring');
  if (el && !el.classList.contains('hidden')) openRecurringList();
}

let _budRecEditing = null; // { rec (copie de travail), isNew }

const _REC_HINT_MONTHLY = "Le 29, le 30 ou le 31 tombent le dernier jour des mois plus courts. Une modification s'applique aux mois suivants, et au mois en cours si sa dépense est encore à venir et n'a pas été retouchée.";
const _REC_HINT_YEARLY = "Ajoutée chaque année le mois choisi (assurance, taxe foncière, cotisation…). Une modification s'applique aux années suivantes, et à cette année si sa dépense est encore à venir et n'a pas été retouchée.";

// Fiche d'une récurrence : « Chaque mois » / « Chaque année » change les libellés des champs
function budPickRecFreq(btn) {
  budPickSingle(btn);
  const yearly = btn.dataset.value === 'yearly';
  const set = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
  set('rec-amount-label', yearly ? 'Montant chaque année' : 'Montant chaque mois');
  set('rec-day-label', yearly ? 'Jour' : 'Jour du mois');
  set('rec-start-label', yearly ? 'Première fois en' : 'À partir de');
  set('rec-hint', yearly ? _REC_HINT_YEARLY : _REC_HINT_MONTHLY);
}
window.budPickRecFreq = budPickRecFreq;

function openRecurringEditor(id) {
  _ensureDefaultCategories();
  const existing = id ? getBudgetRecurring(id) : null;
  if (id && !existing) {
    showToast('Cette dépense récurrente a été supprimée', 'error');
    return;
  }
  const today = formatPlanningDate(new Date());
  const logement = getBudgetCategory('bc_logement');
  const rec = existing ? { ...existing } : {
    id: 'rec_' + uid(), freq: 'monthly', label: '', amountCents: 0,
    categoryId: logement && !logement.archived ? 'bc_logement' : ((_activeCategories()[0] || {}).id || ''),
    memberId: '', note: '', day: Number(today.slice(8, 10)), startMonth: today.slice(0, 7), endMonth: ''
  };
  const yearly = rec.freq === 'yearly';
  _budRecEditing = { rec, isNew: !existing };
  const archived = existing && getBudgetCategory(existing.categoryId) && getBudgetCategory(existing.categoryId).archived ? [getBudgetCategory(existing.categoryId)] : [];
  const unknownCat = !!rec.categoryId && !getBudgetCategory(rec.categoryId);
  const cats = _activeCategories().concat(archived)
    .map(c => `<button type="button" class="cal-pick${c.id === rec.categoryId ? ' is-selected' : ''}" data-value="${escapeHtml(c.id)}" onclick="budPickSingle(this)">${escapeHtml(c.emoji || '')} ${escapeHtml(c.name)}</button>`).join('') +
    (unknownCat ? `<button type="button" class="cal-pick is-selected" data-value="${escapeHtml(rec.categoryId)}" onclick="budPickSingle(this)">❔ Catégorie inconnue</button>` : '');
  const members = state.members.map(m => `<button type="button" class="cal-pick cal-pick-member${m.id === rec.memberId ? ' is-selected' : ''}" data-value="${escapeHtml(m.id)}" onclick="budPickSingle(this, true)">${memberAvatarHtml(m, 'sm')} ${escapeHtml(m.name)}</button>`).join('');
  openSheet('budget-recurring-editor', `
    <div class="modal-header">
      <h2>${existing ? 'Dépense récurrente' : 'Nouvelle dépense récurrente'}</h2>
      <button class="icon-btn icon-btn-light" onclick="closeSheet('budget-recurring-editor')" aria-label="Fermer">${_CAL_ICON_CLOSE}</button>
    </div>
    <div class="sheet-body">
      <div class="cal-picks" id="rec-freq" data-value="${yearly ? 'yearly' : 'monthly'}">
        <button type="button" class="cal-pick${yearly ? '' : ' is-selected'}" data-value="monthly" onclick="budPickRecFreq(this)">Chaque mois</button>
        <button type="button" class="cal-pick${yearly ? ' is-selected' : ''}" data-value="yearly" onclick="budPickRecFreq(this)">Chaque année</button>
      </div>
      <label class="family-label" for="rec-amount" id="rec-amount-label">${yearly ? 'Montant chaque année' : 'Montant chaque mois'}</label>
      <div class="bud-amount-wrap">
        <input id="rec-amount" class="family-input bud-amount-input" inputmode="decimal" autocomplete="off" placeholder="0,00" value="${escapeHtml(_centsToInput(rec.amountCents))}">
        <span class="bud-amount-cur">€</span>
      </div>
      <label class="family-label" for="rec-label">Libellé</label>
      <input id="rec-label" class="family-input" maxlength="80" autocomplete="off" placeholder="Ex. Loyer, assurance habitation" value="${escapeHtml(rec.label || '')}">
      <span class="family-label">Catégorie</span>
      <div class="cal-picks" id="rec-category" data-value="${escapeHtml(rec.categoryId || '')}">${cats}</div>
      ${members ? `<span class="family-label">Qui ? <small>(facultatif)</small></span><div class="cal-picks" id="rec-member" data-value="${escapeHtml(rec.memberId || '')}">${members}</div>` : ''}
      <div class="cal-row">
        <div class="cal-field"><label class="family-label" for="rec-day" id="rec-day-label">${yearly ? 'Jour' : 'Jour du mois'}</label><input type="number" id="rec-day" class="family-input" min="1" max="31" step="1" inputmode="numeric" value="${rec.day}"></div>
        <div class="cal-field"><label class="family-label" for="rec-start" id="rec-start-label">${yearly ? 'Première fois en' : 'À partir de'}</label><input type="month" id="rec-start" class="family-input" placeholder="AAAA-MM" value="${escapeHtml(rec.startMonth)}"></div>
      </div>
      <label class="family-label" for="rec-end">Jusqu'à <small>(facultatif)</small></label>
      <input type="month" id="rec-end" class="family-input" placeholder="AAAA-MM" value="${escapeHtml(rec.endMonth || '')}">
      <p class="family-hint" id="rec-hint">${yearly ? _REC_HINT_YEARLY : _REC_HINT_MONTHLY}</p>
      <label class="family-label" for="rec-note">Note</label>
      <input id="rec-note" class="family-input" maxlength="200" autocomplete="off" value="${escapeHtml(rec.note || '')}">
      <div class="sheet-actions">
        ${existing ? '<button class="btn-danger" onclick="deleteRecurringFromEditor()">Supprimer</button>' : ''}
        <button class="btn-primary" onclick="saveRecurringFromEditor()">Enregistrer</button>
      </div>
    </div>`);
  setTimeout(() => { const el = document.getElementById('rec-amount'); if (el && !existing) el.focus(); }, 60);
}
window.openRecurringEditor = openRecurringEditor;

function saveRecurringFromEditor() {
  const r = _budRecEditing;
  if (!r) return;
  const cents = parseAmountToCents(document.getElementById('rec-amount').value);
  if (!cents) {
    showToast('Montant invalide', 'error');
    return;
  }
  const day = Number(document.getElementById('rec-day').value);
  if (!Number.isInteger(day) || day < 1 || day > 31) {
    showToast('Jour du mois invalide (de 1 à 31)', 'error');
    return;
  }
  // Sans sélecteur de mois (Firefox, Safari sur ordinateur), le champ est un texte libre
  const startMonth = document.getElementById('rec-start').value.trim();
  if (!startMonth) {
    showToast('Indiquez le mois de départ', 'error');
    return;
  }
  if (!_BUD_MONTH_RE.test(startMonth)) {
    showToast('Mois de départ invalide (AAAA-MM, ex. 2026-01)', 'error');
    return;
  }
  const endMonth = (document.getElementById('rec-end').value || '').trim();
  if (endMonth && !_BUD_MONTH_RE.test(endMonth)) {
    showToast('Mois de fin invalide (AAAA-MM, ex. 2026-12)', 'error');
    return;
  }
  if (endMonth && endMonth < startMonth) {
    showToast('Le mois de fin doit suivre le mois de départ', 'error');
    return;
  }
  const categoryId = document.getElementById('rec-category').dataset.value || '';
  const cat = getBudgetCategory(categoryId);
  const memberBox = document.getElementById('rec-member');
  const freqBox = document.getElementById('rec-freq');
  const now = Date.now();
  const rec = {
    ...r.rec,
    freq: freqBox && freqBox.dataset.value === 'yearly' ? 'yearly' : 'monthly',
    label: document.getElementById('rec-label').value.trim().slice(0, 80) || (cat ? cat.name : 'Dépense récurrente'),
    amountCents: cents, categoryId, memberId: memberBox ? (memberBox.dataset.value || '') : '',
    note: document.getElementById('rec-note').value.trim().slice(0, 200),
    day, startMonth, endMonth, createdAt: r.rec.createdAt || now, updatedAt: Math.max(now, (r.rec.updatedAt || 0) + 1)
  };
  _budUpsertRecurring(rec);
  // Nouvelle récurrence : ses dépenses sont créées tout de suite. Récurrence modifiée : relié à une
  // famille, on attend d'avoir reçu la version de la famille (le hook de synchronisation s'en charge)
  const created = budgetGenerateRecurring(r.isNew ? rec.id : undefined);
  if (!r.isNew) _budRealignRecurring(rec.id);
  _budRecEditing = null;
  closeSheet('budget-recurring-editor');
  _budRefreshRecurringList();
  _budRefreshIfVisible();
  showToast(!r.isNew ? 'Dépense récurrente modifiée ✓'
    : created ? `Dépense récurrente créée ✓ ${formatEuros(cents)} ${_recWhenLabel(rec)}`
      : startMonth > formatPlanningDate(new Date()).slice(0, 7) ? `Dépense récurrente créée ✓ première dépense en ${_monthLabel(startMonth).toLowerCase()}`
        : rec.freq === 'yearly' ? `Dépense annuelle créée ✓ prochaine dépense en ${_monthName(startMonth)}`
          : 'Dépense récurrente créée ✓ aucune dépense ajoutée : période antérieure aux 12 derniers mois', 'success');
}
window.saveRecurringFromEditor = saveRecurringFromEditor;

async function deleteRecurringFromEditor() {
  const r = _budRecEditing;
  if (!r || r.isNew) return;
  if (!(await uiConfirm(`Supprimer la dépense récurrente « ${r.rec.label} » ? Les dépenses déjà ajoutées sont gardées ; il n'y en aura plus de nouvelles.`,
    { confirmLabel: 'Supprimer', danger: true }))) return;
  if (_budRecEditing !== r) return; // fiche fermée ou remplacée pendant la confirmation
  _budRemoveRecurring(getBudgetRecurring(r.rec.id) || r.rec);
  _budRecEditing = null;
  closeSheet('budget-recurring-editor');
  _budRefreshRecurringList();
  _budRefreshIfVisible();
  showToast('Dépense récurrente supprimée', 'success');
}
window.deleteRecurringFromEditor = deleteRecurringFromEditor;

// Paramètres → Budget : résumé (app.js, showSettings)
function renderSettingsBudgetSection() {
  const el = document.getElementById('settings-budget-status');
  if (!el) return;
  const budget = budgetOfMonth(formatPlanningDate(new Date()).slice(0, 7));
  const n = _allRecurring().length;
  el.textContent = `${budget ? 'Budget du mois : ' + formatEuros(budget, true) : 'Aucun budget mensuel défini'} · ${n} dépense${n > 1 ? 's' : ''} récurrente${n > 1 ? 's' : ''}`;
}

function _budRefreshIfVisible() {
  renderSettingsBudgetSection();
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
      <label class="family-label" for="bud-monthly">Budget habituel de la famille <small>(chaque mois)</small></label>
      <div class="bud-amount-wrap">
        <input id="bud-monthly" class="family-input bud-amount-input" inputmode="decimal" placeholder="Ex. 2 000" value="${escapeHtml(_centsToInput(state.budgetSettings.monthlyBudgetCents))}" data-initial="${Number(state.budgetSettings.monthlyBudgetCents) || 0}">
        <span class="bud-amount-cur">€</span>
      </div>
      <p class="family-hint">Un mois peut avoir son propre budget (rentrée, fêtes…) : « ✏️ Budget du mois » dans l'aperçu.</p>
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
  const used = state.expenses.some(e => e.categoryId === id && !e.cancelled);
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

// ============================================
// Budget propre à un mois
// ============================================
// Feuille « Budget d'octobre » : un montant, pour tous les mois (budget habituel) ou pour ce mois seulement.
// « Tous les mois » retire aussi le budget propre du mois affiché, qui suit alors le budget habituel.

function openMonthBudgetSheet() {
  const month = _budMonth();
  const own = budgetMonthDoc(month);
  const usual = state.budgetSettings.monthlyBudgetCents || 0;
  const scope = own ? 'month' : 'all';
  const name = _monthName(month);
  openSheet('budget-month', `
    <div class="modal-header">
      <h2>Budget ${escapeHtml(_deMonth(name))} ${escapeHtml(month.slice(0, 4))}</h2>
      <button class="icon-btn icon-btn-light" onclick="closeSheet('budget-month')" aria-label="Fermer">${_CAL_ICON_CLOSE}</button>
    </div>
    <div class="sheet-body">
      <label class="family-label" for="bud-month-amount">Montant</label>
      <div class="bud-amount-wrap">
        <input id="bud-month-amount" class="family-input bud-amount-input" inputmode="decimal" autocomplete="off" placeholder="Ex. 2 000" value="${escapeHtml(_centsToInput(budgetOfMonth(month)))}">
        <span class="bud-amount-cur">€</span>
      </div>
      <span class="family-label">Pour</span>
      <div class="cal-picks" id="bud-month-scope" data-value="${scope}">
        <button type="button" class="cal-pick${scope === 'all' ? ' is-selected' : ''}" data-value="all" onclick="budPickSingle(this)">Tous les mois</button>
        <button type="button" class="cal-pick${scope === 'month' ? ' is-selected' : ''}" data-value="month" onclick="budPickSingle(this)">${escapeHtml(_capitalize(name))} seulement</button>
      </div>
      <p class="family-hint">${usual ? `Budget habituel : ${escapeHtml(formatEuros(usual, true))} par mois.` : 'Aucun budget habituel pour l\'instant.'} Un budget propre à un mois le remplace ce mois-là (rentrée, vacances, fêtes…).</p>
      <div class="sheet-actions">
        ${own ? '<button class="btn-secondary" onclick="resetMonthBudget()">Revenir au budget habituel</button>' : ''}
        <button class="btn-primary" onclick="saveMonthBudget()">Enregistrer</button>
      </div>
    </div>`);
  setTimeout(() => { const el = document.getElementById('bud-month-amount'); if (el) el.focus(); }, 60);
}
window.openMonthBudgetSheet = openMonthBudgetSheet;

function _budRemoveMonthBudget(month) {
  const doc = budgetMonthDoc(month);
  if (!doc) return false;
  state.budgetMonths = state.budgetMonths.filter(b => b !== doc);
  saveBudgetMonths();
  markDirty('budget_months', doc.id);
  return true;
}

function saveMonthBudget() {
  const month = _budMonth();
  const raw = document.getElementById('bud-month-amount').value.trim();
  const cents = raw ? parseAmountToCents(raw) : 0;
  if (raw && !cents) {
    showToast('Montant invalide', 'error');
    return;
  }
  const scope = document.getElementById('bud-month-scope').dataset.value;
  const now = Date.now();
  if (scope === 'month') {
    if (!cents) {
      _budRemoveMonthBudget(month); // vide : le mois reprend le budget habituel
    } else {
      const id = 'bm_' + month;
      const doc = budgetMonthDoc(month);
      if (doc) Object.assign(doc, { amountCents: cents, updatedAt: now });
      else state.budgetMonths.push({ id, month, amountCents: cents, updatedAt: now });
      saveBudgetMonths();
      markDirty('budget_months', id);
    }
  } else {
    if (cents !== (state.budgetSettings.monthlyBudgetCents || 0)) {
      Object.assign(state.budgetSettings, { id: BUDGET_SETTINGS_ID, monthlyBudgetCents: cents, updatedAt: now });
      saveBudgetSettings();
      markDirty('budget_settings', BUDGET_SETTINGS_ID);
    }
    _budRemoveMonthBudget(month);
  }
  closeSheet('budget-month');
  _budRefreshIfVisible();
  showToast(scope === 'month' && cents ? `Budget ${_deMonth(_monthName(month))} : ${formatEuros(cents, true)} ✓`
    : cents ? `Budget habituel : ${formatEuros(cents, true)} par mois ✓` : 'Budget retiré', 'success');
}
window.saveMonthBudget = saveMonthBudget;

function resetMonthBudget() {
  const month = _budMonth();
  _budRemoveMonthBudget(month);
  closeSheet('budget-month');
  _budRefreshIfVisible();
  const usual = state.budgetSettings.monthlyBudgetCents || 0;
  showToast(usual ? `Budget habituel rétabli : ${formatEuros(usual, true)} ✓` : 'Budget du mois retiré', 'success');
}
window.resetMonthBudget = resetMonthBudget;
