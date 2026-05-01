// ============================================
// MES RECETTES — App JS
// ============================================

const STORAGE_KEYS = {
  recipes: 'mr_recipes',
  apiKey: 'mr_api_key',
  shopping: 'mr_shopping', // legacy single-list (auto-migrated to lists)
  shoppingLists: 'mr_shopping_lists',
  activeShoppingList: 'mr_active_shopping_list',
  pantry: 'mr_pantry',
  onboarded: 'mr_onboarded',
  syncUrl: 'mr_sync_url',
  syncKey: 'mr_sync_key',
  syncFoyer: 'mr_sync_foyer',
  syncEnabled: 'mr_sync_enabled',
  lastSync: 'mr_last_sync',
  lastBackup: 'mr_last_backup',
  // Préférences UI
  theme: 'mr_theme', // 'light' | 'dark' | 'auto'
  enableWebSearch: 'mr_enable_web_search',
  voiceMode: 'mr_voice_mode', // 'browser' | 'claude'
  sortMode: 'mr_sort_mode', // 'recent' | 'name' | 'cooked'
  categoryOrder: 'mr_category_order',
  servingsPresets: 'mr_servings_presets'
};

const state = {
  recipes: [],
  shopping: [], // legacy
  shoppingLists: [], // [{id, name, items: [{recipeId, servings}], createdAt}]
  activeShoppingListId: '',
  shoppingChecked: new Set(),
  pantry: [], // [{name, until: timestamp}]
  apiKey: '',
  currentView: 'library',
  currentRecipe: null,
  searchQuery: '',
  monthFilter: 'all',
  categoryFilter: 'all',
  ingredientsFilter: [], // recherche par ingrédients
  favoritesOnly: false,
  cookedFilter: '', // '' | 'never' | 'recent' | 'old'
  chatHistory: [],
  chatAttachments: [], // base64 images
  pendingRecipe: null,
  editingRecipeId: null,
  // Sync
  sync: {
    url: '', key: '', foyer: '', enabled: false,
    status: 'idle', lastSync: 0
  },
  // Préférences
  prefs: {
    theme: 'auto',
    enableWebSearch: false,
    voiceMode: 'claude',
    sortMode: 'recent',
    servingsPresets: [2, 4, 6, 8]
  },
  // Cooking mode
  cookingMode: { active: false, currentStep: 0, recipeId: null }
};

// ============================================
// STORAGE
// ============================================

function loadState() {
  try {
    const recipes = localStorage.getItem(STORAGE_KEYS.recipes);
    state.recipes = recipes ? JSON.parse(recipes) : [];
    state.apiKey = localStorage.getItem(STORAGE_KEYS.apiKey) || '';
    // Sync config
    state.sync.url = localStorage.getItem(STORAGE_KEYS.syncUrl) || '';
    state.sync.key = localStorage.getItem(STORAGE_KEYS.syncKey) || '';
    state.sync.foyer = localStorage.getItem(STORAGE_KEYS.syncFoyer) || '';
    state.sync.enabled = localStorage.getItem(STORAGE_KEYS.syncEnabled) === '1';
    state.sync.lastSync = Number(localStorage.getItem(STORAGE_KEYS.lastSync)) || 0;

    // Listes de courses (avec migration depuis l'ancienne liste unique)
    const lists = localStorage.getItem(STORAGE_KEYS.shoppingLists);
    if (lists) {
      state.shoppingLists = JSON.parse(lists);
    } else {
      // Migration depuis ancienne liste unique
      const oldShopping = localStorage.getItem(STORAGE_KEYS.shopping);
      const items = oldShopping ? JSON.parse(oldShopping) : [];
      state.shoppingLists = [{
        id: 'default',
        name: 'Ma liste',
        items: items,
        createdAt: Date.now()
      }];
      localStorage.setItem(STORAGE_KEYS.shoppingLists, JSON.stringify(state.shoppingLists));
    }
    state.activeShoppingListId = localStorage.getItem(STORAGE_KEYS.activeShoppingList) || (state.shoppingLists[0]?.id || 'default');
    if (!state.shoppingLists.find(l => l.id === state.activeShoppingListId)) {
      state.activeShoppingListId = state.shoppingLists[0]?.id || 'default';
    }
    // Pour rétrocompat, alias shopping = liste active
    state.shopping = getActiveShoppingList()?.items || [];

    // Garde-manger
    const pantry = localStorage.getItem(STORAGE_KEYS.pantry);
    state.pantry = pantry ? JSON.parse(pantry) : [];
    // Nettoyer les items expirés
    const now = Date.now();
    state.pantry = state.pantry.filter(p => !p.until || p.until > now);

    // Préférences
    state.prefs.theme = localStorage.getItem(STORAGE_KEYS.theme) || 'auto';
    state.prefs.enableWebSearch = localStorage.getItem(STORAGE_KEYS.enableWebSearch) === '1';
    state.prefs.voiceMode = localStorage.getItem(STORAGE_KEYS.voiceMode) || 'claude';
    state.prefs.sortMode = localStorage.getItem(STORAGE_KEYS.sortMode) || 'recent';
    const presetsStr = localStorage.getItem(STORAGE_KEYS.servingsPresets);
    if (presetsStr) {
      try { state.prefs.servingsPresets = JSON.parse(presetsStr); } catch {}
    }

    // S'assurer que chaque recette a tous les champs des nouvelles features (migration douce)
    state.recipes = state.recipes.map(r => ({
      favorite: false,
      personalNotes: '',
      photo: null, // base64 dataUrl ou null
      cookedHistory: [], // [timestamp, ...]
      tags: [],
      prepTime: null, // minutes
      cookTime: null, // minutes
      changeLog: [], // [{at, by, action}]
      ...r
    }));
  } catch (e) {
    console.error('Load state error:', e);
  }
}

function getActiveShoppingList() {
  return state.shoppingLists.find(l => l.id === state.activeShoppingListId);
}

function saveRecipes() {
  localStorage.setItem(STORAGE_KEYS.recipes, JSON.stringify(state.recipes));
}

function saveShopping() {
  // Sauve la liste active dans shoppingLists
  const active = getActiveShoppingList();
  if (active) {
    active.items = state.shopping;
    localStorage.setItem(STORAGE_KEYS.shoppingLists, JSON.stringify(state.shoppingLists));
  }
}

function saveShoppingLists() {
  localStorage.setItem(STORAGE_KEYS.shoppingLists, JSON.stringify(state.shoppingLists));
  localStorage.setItem(STORAGE_KEYS.activeShoppingList, state.activeShoppingListId);
}

function savePantry() {
  localStorage.setItem(STORAGE_KEYS.pantry, JSON.stringify(state.pantry));
}

function savePrefs() {
  localStorage.setItem(STORAGE_KEYS.theme, state.prefs.theme);
  localStorage.setItem(STORAGE_KEYS.enableWebSearch, state.prefs.enableWebSearch ? '1' : '0');
  localStorage.setItem(STORAGE_KEYS.voiceMode, state.prefs.voiceMode);
  localStorage.setItem(STORAGE_KEYS.sortMode, state.prefs.sortMode);
  localStorage.setItem(STORAGE_KEYS.servingsPresets, JSON.stringify(state.prefs.servingsPresets));
}

function saveApiKey(key) {
  state.apiKey = key;
  if (key) {
    localStorage.setItem(STORAGE_KEYS.apiKey, key);
  } else {
    localStorage.removeItem(STORAGE_KEYS.apiKey);
  }
}

function saveSyncConfig(config) {
  state.sync.url = config.url || '';
  state.sync.key = config.key || '';
  state.sync.foyer = config.foyer || '';
  state.sync.enabled = !!(config.url && config.key && config.foyer);

  if (state.sync.url) localStorage.setItem(STORAGE_KEYS.syncUrl, state.sync.url);
  else localStorage.removeItem(STORAGE_KEYS.syncUrl);
  if (state.sync.key) localStorage.setItem(STORAGE_KEYS.syncKey, state.sync.key);
  else localStorage.removeItem(STORAGE_KEYS.syncKey);
  if (state.sync.foyer) localStorage.setItem(STORAGE_KEYS.syncFoyer, state.sync.foyer);
  else localStorage.removeItem(STORAGE_KEYS.syncFoyer);
  localStorage.setItem(STORAGE_KEYS.syncEnabled, state.sync.enabled ? '1' : '0');
}

// ============================================
// SYNC SUPABASE
// ============================================
//
// Architecture:
// - Une table "recipes" avec colonnes: id, foyer, data (JSONB), updated_at, deleted_at
// - Chaque recette est un row, lié au foyer
// - Sync = pull tous les rows du foyer + merge local (last-write-wins par updated_at)
// - Push = upsert chaque recette modifiée en local
//
// La clé "anon" Supabase n'a accès qu'aux foyers via Row-Level Security (configurée dans Supabase)
//

const SYNC_TABLE = 'recipes';

function setSyncStatus(status) {
  state.sync.status = status;
  updateSyncIndicator();
}

function updateSyncIndicator() {
  const indicator = document.getElementById('sync-indicator');
  if (!indicator) return;

  if (!state.sync.enabled) {
    indicator.classList.add('hidden');
    return;
  }

  indicator.classList.remove('hidden');
  indicator.className = 'sync-indicator sync-' + state.sync.status;

  const messages = {
    idle: '',
    syncing: 'Synchronisation…',
    synced: 'Synchronisé ✓',
    error: 'Erreur de sync',
    offline: 'Hors ligne'
  };
  indicator.title = messages[state.sync.status] || '';
}

async function supabaseRequest(method, path, body, extraHeaders) {
  if (!state.sync.url || !state.sync.key) throw new Error('Sync non configurée');

  const url = state.sync.url.replace(/\/$/, '') + '/rest/v1/' + path;
  const headers = {
    'apikey': state.sync.key,
    'Authorization': 'Bearer ' + state.sync.key,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation',
    ...(extraHeaders || {})
  };

  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error('Supabase error:', response.status, errText);
    throw new Error('Sync error ' + response.status);
  }

  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function syncPull() {
  // Récupère toutes les recettes du foyer
  const path = `${SYNC_TABLE}?foyer=eq.${encodeURIComponent(state.sync.foyer)}&select=*`;
  const remote = await supabaseRequest('GET', path);
  return remote;
}

async function syncPush(recipe, isDelete) {
  // Upsert d'une recette
  const row = {
    id: recipe.id,
    foyer: state.sync.foyer,
    data: isDelete ? null : recipe,
    deleted_at: isDelete ? new Date().toISOString() : null,
    updated_at: new Date().toISOString()
  };

  await supabaseRequest('POST', SYNC_TABLE, [row], {
    'Prefer': 'resolution=merge-duplicates,return=minimal'
  });
}

async function performSync(silent) {
  if (!state.sync.enabled) return;
  if (!navigator.onLine) {
    setSyncStatus('offline');
    return;
  }

  setSyncStatus('syncing');

  try {
    // 1. Pull remote
    const remote = await syncPull();

    // 2. Merge: pour chaque recette remote, si plus récente que locale OU pas locale -> remplace
    //    Pour chaque recette locale qui n'est pas remote -> push
    const remoteById = {};
    for (const row of remote || []) {
      remoteById[row.id] = row;
    }

    const localById = {};
    for (const r of state.recipes) {
      localById[r.id] = r;
    }

    // Recettes remote -> local
    for (const id in remoteById) {
      const row = remoteById[id];
      const local = localById[id];
      const remoteUpdatedAt = new Date(row.updated_at).getTime();

      if (row.deleted_at) {
        // Recette supprimée distante : on la retire localement
        if (local) {
          state.recipes = state.recipes.filter(r => r.id !== id);
          state.shopping = state.shopping.filter(s => s.recipeId !== id);
        }
        continue;
      }

      const remoteRecipe = row.data;
      if (!local) {
        // Nouvelle recette distante
        state.recipes.push(remoteRecipe);
      } else {
        // Si remote plus récente que local
        const localUpdatedAt = local.updatedAt || local.createdAt || 0;
        if (remoteUpdatedAt > localUpdatedAt) {
          // Remplace
          state.recipes = state.recipes.map(r => r.id === id ? remoteRecipe : r);
        }
      }
    }

    // Recettes locales pas dans remote -> push
    const toPush = [];
    for (const r of state.recipes) {
      if (!remoteById[r.id]) {
        toPush.push(r);
      }
    }

    if (toPush.length > 0) {
      const rows = toPush.map(r => ({
        id: r.id,
        foyer: state.sync.foyer,
        data: r,
        deleted_at: null,
        updated_at: new Date(r.updatedAt || r.createdAt || Date.now()).toISOString()
      }));
      await supabaseRequest('POST', SYNC_TABLE, rows, {
        'Prefer': 'resolution=merge-duplicates,return=minimal'
      });
    }

    // Save local
    saveRecipes();
    saveShopping();
    state.sync.lastSync = Date.now();
    localStorage.setItem(STORAGE_KEYS.lastSync, String(state.sync.lastSync));

    setSyncStatus('synced');
    if (!silent) {
      const msg = toPush.length > 0
        ? `Synchronisé ✓ (${toPush.length} envoyée${toPush.length > 1 ? 's' : ''})`
        : 'Synchronisé ✓';
      showToast(msg, 'success');
    }

    // Re-render current view
    if (state.currentView === 'library') renderLibrary();
    if (state.currentView === 'shopping') renderShopping();
    updateShoppingBadge();

    // Auto-clear status after 3s
    setTimeout(() => {
      if (state.sync.status === 'synced') setSyncStatus('idle');
    }, 3000);
  } catch (e) {
    console.error('Sync error:', e);
    setSyncStatus('error');
    if (!silent) showToast('Erreur de synchronisation', 'error');
  }
}

async function syncRecipeAfterChange(recipe, isDelete) {
  if (!state.sync.enabled || !navigator.onLine) return;
  try {
    setSyncStatus('syncing');
    await syncPush(recipe, isDelete);
    state.sync.lastSync = Date.now();
    localStorage.setItem(STORAGE_KEYS.lastSync, String(state.sync.lastSync));
    setSyncStatus('synced');
    setTimeout(() => {
      if (state.sync.status === 'synced') setSyncStatus('idle');
    }, 2000);
  } catch (e) {
    console.error('Sync push error:', e);
    setSyncStatus('error');
  }
}

// Online/offline detection
window.addEventListener('online', () => {
  if (state.sync.enabled) performSync(true);
});
window.addEventListener('offline', () => {
  if (state.sync.enabled) setSyncStatus('offline');
});

// ============================================
// UTILITIES
// ============================================

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function showToast(message, type = '') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast ' + type;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('hiding');
    setTimeout(() => toast.remove(), 300);
  }, 2800);
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function formatAmount(amount, unit) {
  if (amount == null || amount === '') return unit || '';
  // Arrondi intelligent
  let n = Number(amount);
  if (isNaN(n)) return amount + (unit ? ' ' + unit : '');
  if (n < 1 && n > 0) {
    // Fractions communes
    if (Math.abs(n - 0.25) < 0.02) return '¼' + (unit ? ' ' + unit : '');
    if (Math.abs(n - 0.5) < 0.02) return '½' + (unit ? ' ' + unit : '');
    if (Math.abs(n - 0.75) < 0.02) return '¾' + (unit ? ' ' + unit : '');
    if (Math.abs(n - 0.33) < 0.05) return '⅓' + (unit ? ' ' + unit : '');
    if (Math.abs(n - 0.66) < 0.05) return '⅔' + (unit ? ' ' + unit : '');
    n = Math.round(n * 100) / 100;
  } else if (n < 10) {
    n = Math.round(n * 10) / 10;
  } else {
    n = Math.round(n);
  }
  return n + (unit ? ' ' + unit : '');
}

function getCurrentMonth() {
  return new Date().getMonth() + 1;
}

// ============================================
// NAVIGATION
// ============================================

// ============================================
// NAVIGATION & HISTORIQUE (back button Android + swipe iOS)
// ============================================
// Chaque "écran" (vue, modal, drawer) est poussé dans history.state
// Sur popstate (retour OS), on agit selon le type d'état

// Indique si la prochaine modif d'historique est une navigation interne (true)
// ou un retour utilisateur (false)
let _ignoreNextPop = false;

function _pushState(type, payload) {
  const entry = { type, payload, at: Date.now() };
  history.pushState(entry, '');
}

function _replaceState(type, payload) {
  const entry = { type, payload, at: Date.now() };
  history.replaceState(entry, '');
}

function navigateTo(view, data) {
  // Si on navigue vers la même vue, ne rien faire
  if (state.currentView === view && view !== 'recipe') return;
  // Pousse un nouvel état dans l'historique (sauf pour la première vue racine)
  if (state.currentView !== view || view === 'recipe') {
    _pushState('view', { view, recipeId: data?.id });
  }
  _renderView(view, data);
}

window.navigateTo = navigateTo;

// Rendu pur de la vue, sans toucher à l'historique
function _renderView(view, data) {
  state.currentView = view;
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-' + view).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => {
    n.classList.toggle('active', n.dataset.view === view);
  });

  const titles = {
    library: 'Bibliothèque',
    chat: 'Assistant IA',
    shopping: 'Liste de courses',
    recipe: ''
  };
  const pageTitle = document.getElementById('page-title');
  pageTitle.textContent = titles[view] || '';
  const header = document.querySelector('.app-header');
  header.style.display = view === 'recipe' ? 'none' : '';

  document.getElementById('main-content').scrollTo({ top: 0, behavior: 'instant' });

  if (view === 'library') renderLibrary();
  if (view === 'shopping') renderShopping();
  if (view === 'recipe' && data) renderRecipeDetail(data);
}

// Gestion du retour OS : ferme les overlays prioritaires, sinon revient à la vue précédente
function handleBack() {
  // Priorité 1 : Mode cuisine plein écran
  if (state.cookingMode && state.cookingMode.active) {
    _exitCookingModeNoHistory();
    return true;
  }
  // Priorité 2 : Modal de validation/édition de recette
  const valModal = document.getElementById('validation-modal');
  if (valModal && !valModal.classList.contains('hidden')) {
    closeValidationModal(true); // skipHistory
    return true;
  }
  // Priorité 3 : Modal Paramètres
  const settingsModal = document.getElementById('settings-modal');
  if (settingsModal && !settingsModal.classList.contains('hidden')) {
    hideSettings(true); // skipHistory
    return true;
  }
  // Priorité 4 : Drawer Filtres
  const drawer = document.getElementById('filters-drawer');
  if (drawer && !drawer.classList.contains('hidden')) {
    drawer.classList.remove('open');
    setTimeout(() => drawer.classList.add('hidden'), 280);
    return true;
  }
  return false;
}

// Listener global popstate
window.addEventListener('popstate', (event) => {
  // Si un overlay est ouvert, on le ferme et on consomme le retour
  if (handleBack()) {
    // On a fermé quelque chose, mais le browser a déjà déclenché popstate
    // On pousse un nouvel état pour pouvoir capter le prochain retour
    _pushState('overlay-closed', {});
    return;
  }

  // Sinon, on regarde l'état de la pile
  const st = event.state;
  if (st && st.type === 'view') {
    // Naviguer vers cette vue (sans pousser dans l'historique)
    if (st.payload.view === 'recipe' && st.payload.recipeId) {
      const r = state.recipes.find(x => x.id === st.payload.recipeId);
      if (r) {
        state.currentRecipe = { ...r, currentServings: r.baseServings };
        _renderView('recipe', r);
        return;
      }
    }
    _renderView(st.payload.view || 'library');
    return;
  }

  // État manquant : retour à la bibliothèque (état initial)
  _renderView('library');
});

// Initialiser l'historique avec l'état "library" au démarrage
function initHistory() {
  _replaceState('view', { view: 'library' });
}

// Helpers pour pousser des états "overlay" qui peuvent être fermés par retour
function pushOverlay(name) {
  _pushState('overlay', { name });
}

// ============================================
// LIBRARY
// ============================================

function getFilteredRecipes() {
  let recipes = [...state.recipes];

  // Tri
  if (state.prefs.sortMode === 'name') {
    recipes.sort((a, b) => a.title.localeCompare(b.title, 'fr'));
  } else if (state.prefs.sortMode === 'cooked') {
    // Plus récemment cuisinée d'abord, jamais cuisinées en bas
    recipes.sort((a, b) => {
      const aLast = (a.cookedHistory && a.cookedHistory.length) ? a.cookedHistory[a.cookedHistory.length - 1] : 0;
      const bLast = (b.cookedHistory && b.cookedHistory.length) ? b.cookedHistory[b.cookedHistory.length - 1] : 0;
      return bLast - aLast;
    });
  } else {
    // recent (par défaut)
    recipes.sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));
  }

  // Filtrage texte (recherche libre)
  if (state.searchQuery) {
    const q = state.searchQuery.toLowerCase().trim();
    recipes = recipes.filter(r => {
      if (r.title.toLowerCase().includes(q)) return true;
      if ((r.description || '').toLowerCase().includes(q)) return true;
      if ((r.tags || []).some(t => t.includes(q))) return true;
      if (r.ingredients.some(ing => ing.name.toLowerCase().includes(q))) return true;
      if ((r.personalNotes || '').toLowerCase().includes(q)) return true;
      return false;
    });
  }

  // Filtrage par ingrédients multiples (recherche inversée)
  if (state.ingredientsFilter.length > 0) {
    recipes = recipes.filter(r => {
      const ingredientNames = r.ingredients.map(i => normalizeIngredientName(i.name));
      return state.ingredientsFilter.every(needle => {
        const n = normalizeIngredientName(needle);
        return ingredientNames.some(name => name.includes(n) || n.includes(name));
      });
    });
  }

  // Filtrage par mois
  if (state.monthFilter !== 'all') {
    const month = state.monthFilter === 'current' ? getCurrentMonth() : Number(state.monthFilter);
    recipes = recipes.filter(r => {
      if (!r.months || r.months.length === 0) return true;
      return r.months.includes(month);
    });
  }

  // Filtrage par catégorie
  if (state.categoryFilter !== 'all') {
    recipes = recipes.filter(r => (r.category || 'plat') === state.categoryFilter);
  }

  // Favoris uniquement
  if (state.favoritesOnly) {
    recipes = recipes.filter(r => r.favorite);
  }

  // Filtrage par "déjà cuisiné"
  if (state.cookedFilter) {
    const now = Date.now();
    const THIRTY_DAYS = 30 * 24 * 3600 * 1000;
    const NINETY_DAYS = 90 * 24 * 3600 * 1000;
    recipes = recipes.filter(r => {
      const last = (r.cookedHistory && r.cookedHistory.length) ? r.cookedHistory[r.cookedHistory.length - 1] : 0;
      if (state.cookedFilter === 'never') return !last;
      if (state.cookedFilter === 'recent') return last && (now - last) < THIRTY_DAYS;
      if (state.cookedFilter === 'old') return last && (now - last) > NINETY_DAYS;
      return true;
    });
  }

  return recipes;
}

function renderLibrary() {
  const grid = document.getElementById('recipes-grid');
  const emptyLib = document.getElementById('empty-library');
  const emptySearch = document.getElementById('empty-search');

  if (state.recipes.length === 0) {
    grid.innerHTML = '';
    emptyLib.classList.remove('hidden');
    emptySearch.classList.add('hidden');
    return;
  }

  const filtered = getFilteredRecipes();

  if (filtered.length === 0) {
    grid.innerHTML = '';
    emptyLib.classList.add('hidden');
    emptySearch.classList.remove('hidden');
    return;
  }

  emptyLib.classList.add('hidden');
  emptySearch.classList.add('hidden');

  const currentMonth = getCurrentMonth();

  // Grouper les recettes par catégorie
  const byCategory = {};
  for (const cat of RECIPE_CATEGORIES) {
    byCategory[cat.id] = [];
  }
  for (const r of filtered) {
    const catId = r.category && byCategory[r.category] ? r.category : 'autre';
    byCategory[catId].push(r);
  }

  // Construire le HTML par sections
  let html = '';
  for (const cat of RECIPE_CATEGORIES) {
    const recipes = byCategory[cat.id];
    if (recipes.length === 0) continue;

    html += `
      <div class="recipe-section-group">
        <div class="recipe-section-header">
          <span class="recipe-section-emoji">${cat.emoji}</span>
          <h2 class="recipe-section-name">${cat.label}</h2>
          <span class="recipe-section-count">${recipes.length}</span>
        </div>
        <div class="recipe-section-cards">
    `;

    for (const r of recipes) {
      const bgClass = 'bg-' + ((Math.abs(hashCode(r.id)) % 6) + 1);
      const monthTags = (r.months || []).slice(0, 2).map(m => {
        const isCurrent = m === currentMonth;
        return `<span class="month-tag ${isCurrent ? 'current' : ''}">${MONTH_NAMES[m]}</span>`;
      }).join('');
      const moreCount = (r.months || []).length > 2 ? `<span class="month-tag">+${r.months.length - 2}</span>` : '';
      const allSeason = !r.months || r.months.length === 0 ? '<span class="month-tag">Toute saison</span>' : '';

      // Photo perso > emoji
      const visual = r.photo
        ? `<img src="${r.photo}" alt="" class="recipe-card-photo">`
        : `<span class="recipe-card-emoji">${r.emoji || '🍽️'}</span>`;

      // Étoile favori
      const favoriteBtn = `<button class="recipe-card-fav ${r.favorite ? 'active' : ''}" onclick="event.stopPropagation(); toggleFavorite('${r.id}')" aria-label="Favori">${r.favorite ? '★' : '☆'}</button>`;

      // Durée totale
      const totalTime = (r.prepTime || 0) + (r.cookTime || 0);
      const timeBadge = totalTime > 0 ? `<span class="recipe-card-time">⏱ ${totalTime} min</span>` : '';

      // Dernière fois cuisinée
      const lastCooked = (r.cookedHistory && r.cookedHistory.length) ? r.cookedHistory[r.cookedHistory.length - 1] : 0;
      let cookedBadge = '';
      if (lastCooked) {
        const days = Math.floor((Date.now() - lastCooked) / (24 * 3600 * 1000));
        if (days === 0) cookedBadge = `<span class="recipe-card-cooked">✓ aujourd'hui</span>`;
        else if (days < 7) cookedBadge = `<span class="recipe-card-cooked">✓ il y a ${days}j</span>`;
        else if (days < 30) cookedBadge = `<span class="recipe-card-cooked">✓ il y a ${Math.floor(days/7)}sem.</span>`;
      }

      html += `
        <div class="recipe-card" data-recipe-id="${r.id}" onclick="openRecipe('${r.id}')">
          <div class="recipe-card-visual ${bgClass} ${r.photo ? 'has-photo' : ''}">
            ${!r.photo ? '<div class="recipe-card-blob" style="background: rgba(255,255,255,0.5); top: -10px; left: -10px;"></div>' : ''}
            ${visual}
            ${favoriteBtn}
          </div>
          <div class="recipe-card-content">
            <div>
              <div class="recipe-card-title">${escapeHtml(r.title)}</div>
              <div class="recipe-card-meta">
                ${timeBadge ? timeBadge + ' · ' : ''}${r.ingredients.length} ingr.${cookedBadge ? ' · ' + cookedBadge : ''}
              </div>
            </div>
            <div class="recipe-card-tags">
              ${monthTags}${moreCount}${allSeason}
            </div>
          </div>
          <div class="recipe-card-action">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M9 5l7 7-7 7" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
        </div>
      `;
    }

    html += `</div></div>`;
  }

  grid.innerHTML = html;
}

function hashCode(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h) + s.charCodeAt(i) | 0;
  return h;
}

function openRecipe(id) {
  const recipe = state.recipes.find(r => r.id === id);
  if (!recipe) return;
  state.currentRecipe = { ...recipe, currentServings: recipe.baseServings };
  navigateTo('recipe', recipe);
}

window.openRecipe = openRecipe;

// ============================================
// RECIPE DETAIL
// ============================================

function renderRecipeDetail(recipe) {
  const r = state.currentRecipe;
  if (!r) return;

  const bgIdx = (Math.abs(hashCode(r.id)) % 6) + 1;
  const heroBg = ['linear-gradient(135deg, var(--bg-green-200), var(--bg-pop-conifer))',
                  'linear-gradient(135deg, var(--bg-secondary-200), var(--bg-secondary-100))',
                  'linear-gradient(135deg, var(--bg-pink-200), var(--bg-brown-100))',
                  'linear-gradient(135deg, var(--bg-blue-50), var(--bg-sky-200))',
                  'linear-gradient(135deg, var(--bg-yellow-100), var(--bg-pop-conifer))',
                  'linear-gradient(135deg, var(--bg-green-light), var(--bg-green-50))'][bgIdx - 1];

  const months = r.months && r.months.length ? r.months : [];
  const currentMonth = getCurrentMonth();

  const ratio = r.currentServings / r.baseServings;
  const isInShopping = state.shopping.some(s => s.recipeId === r.id);

  // Photo perso ou emoji
  const heroVisual = r.photo
    ? `<img src="${r.photo}" alt="" class="recipe-detail-hero-photo">`
    : `<span class="recipe-detail-hero-emoji">${r.emoji || '🍽️'}</span>`;

  // Durées
  const totalTime = (r.prepTime || 0) + (r.cookTime || 0);
  let timesHtml = '';
  if (r.prepTime || r.cookTime) {
    const items = [];
    if (r.prepTime) items.push(`<div class="recipe-time-item"><span class="recipe-time-label">Prép.</span><span class="recipe-time-value">${r.prepTime} min</span></div>`);
    if (r.cookTime) items.push(`<div class="recipe-time-item"><span class="recipe-time-label">Cuisson</span><span class="recipe-time-value">${r.cookTime} min</span></div>`);
    if (totalTime) items.push(`<div class="recipe-time-item recipe-time-total"><span class="recipe-time-label">Total</span><span class="recipe-time-value">${totalTime} min</span></div>`);
    timesHtml = `<div class="recipe-times">${items.join('')}</div>`;
  }

  // Tags
  const tagsHtml = (r.tags && r.tags.length)
    ? `<div class="recipe-detail-custom-tags">${r.tags.map(t => `<span class="recipe-tag">${escapeHtml(t)}</span>`).join('')}<button class="recipe-tag-edit" onclick="editRecipeTags('${r.id}')">✏️</button></div>`
    : `<button class="recipe-tag-empty" onclick="editRecipeTags('${r.id}')">+ Ajouter des tags</button>`;

  // Historique cuisson
  const cookedHistory = r.cookedHistory || [];
  const lastCooked = cookedHistory.length ? cookedHistory[cookedHistory.length - 1] : 0;
  let cookedSummary = '';
  if (lastCooked) {
    const days = Math.floor((Date.now() - lastCooked) / (24 * 3600 * 1000));
    let when = '';
    if (days === 0) when = "aujourd'hui";
    else if (days === 1) when = "hier";
    else if (days < 7) when = `il y a ${days} jours`;
    else if (days < 30) when = `il y a ${Math.floor(days/7)} semaine${Math.floor(days/7) > 1 ? 's' : ''}`;
    else if (days < 365) when = `il y a ${Math.floor(days/30)} mois`;
    else when = `il y a ${Math.floor(days/365)} an${Math.floor(days/365) > 1 ? 's' : ''}`;
    cookedSummary = `<div class="recipe-cooked-info">✓ Cuisinée ${cookedHistory.length} fois · dernière fois ${when}</div>`;
  }

  // Notes personnelles
  const notesHtml = r.personalNotes
    ? `<div class="recipe-section recipe-notes" onclick="editPersonalNotes('${r.id}')">
        <h3 class="recipe-section-title">
          <span class="recipe-section-icon">📝</span>
          Mes notes
          <span class="recipe-notes-edit-hint">Toucher pour modifier</span>
        </h3>
        <p class="recipe-notes-text">${escapeHtml(r.personalNotes).replace(/\n/g, '<br>')}</p>
      </div>`
    : `<button class="recipe-notes-empty" onclick="editPersonalNotes('${r.id}')">📝 + Ajouter mes notes (astuces, variantes...)</button>`;

  document.getElementById('recipe-detail-content').innerHTML = `
    <div class="recipe-detail">
      <div class="recipe-detail-hero ${r.photo ? 'has-photo' : ''}" style="background: ${heroBg}">
        ${!r.photo ? '<div class="recipe-detail-hero-blob" style="background: rgba(255,255,255,0.4); width: 140px; height: 140px; top: -20px; right: -20px;"></div>' : ''}
        ${!r.photo ? '<div class="recipe-detail-hero-blob" style="background: rgba(255,255,255,0.3); width: 100px; height: 100px; bottom: -20px; left: 20%;"></div>' : ''}
        <button class="recipe-detail-back" onclick="navigateTo('library')" aria-label="Retour">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M15 19l-7-7 7-7" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
        <div class="recipe-detail-actions">
          <button class="icon-btn" onclick="toggleFavorite('${r.id}')" aria-label="Favori">
            <span class="recipe-fav-icon ${r.favorite ? 'active' : ''}">${r.favorite ? '★' : '☆'}</span>
          </button>
          <button class="icon-btn" onclick="shareRecipe('${r.id}')" aria-label="Partager">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
          <button class="icon-btn" onclick="editRecipe('${r.id}')" aria-label="Modifier">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
          <button class="icon-btn" onclick="confirmDeleteRecipe('${r.id}')" aria-label="Supprimer">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </div>
        ${heroVisual}
        ${!r.photo ? `<button class="recipe-photo-add" onclick="attachRecipePhoto('${r.id}')" aria-label="Ajouter une photo">📷</button>` : `<button class="recipe-photo-remove" onclick="removeRecipePhoto('${r.id}')" aria-label="Retirer la photo">✕</button>`}
      </div>
      <div class="recipe-detail-body">
        <h1 class="recipe-detail-title" onclick="quickEditField('title', '${r.id}')" title="Toucher pour modifier">${escapeHtml(r.title)}</h1>
        ${r.description ? `<p class="recipe-detail-description" onclick="quickEditField('description', '${r.id}')" title="Toucher pour modifier">${escapeHtml(r.description)}</p>` : `<p class="recipe-detail-description recipe-detail-description-empty" onclick="quickEditField('description', '${r.id}')">+ Ajouter une description</p>`}

        ${timesHtml}

        <div class="recipe-detail-tags">
          ${months.length === 0 ? '<span class="month-tag">Toute saison</span>' :
            months.map(m => `<span class="month-tag ${m === currentMonth ? 'current' : ''}">${MONTH_NAMES[m]}</span>`).join('')}
        </div>

        ${tagsHtml}

        ${cookedSummary}

        <div class="recipe-quick-actions">
          <button class="btn-cook" onclick="markAsCooked('${r.id}')">
            <span>✓</span> J'ai fait cette recette
          </button>
          <button class="btn-cooking-mode" onclick="enterCookingMode('${r.id}')">
            <span>👨‍🍳</span> Mode cuisine
          </button>
        </div>

        <div class="servings-card">
          <div class="servings-info">
            <span class="servings-label">Portions</span>
            <span class="servings-hint">Ajuster les quantités</span>
          </div>
          <div class="servings-controls">
            <button class="servings-btn" id="servings-minus" ${r.currentServings <= 1 ? 'disabled' : ''}>−</button>
            <span class="servings-value" id="servings-value">${r.currentServings}</span>
            <button class="servings-btn" id="servings-plus">+</button>
          </div>
        </div>

        <div class="servings-presets">
          ${state.prefs.servingsPresets.map(p => `<button class="servings-preset ${r.currentServings === p ? 'active' : ''}" onclick="setServings('${r.id}', ${p})">${p}</button>`).join('')}
        </div>

        ${notesHtml}

        <div class="recipe-section">
          <h3 class="recipe-section-title">
            <span class="recipe-section-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                <path d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </span>
            Ingrédients
          </h3>
          <div class="ingredients-list" id="ingredients-list">
            ${renderIngredientsList(r.ingredients, ratio)}
          </div>
        </div>

        <div class="recipe-section">
          <h3 class="recipe-section-title">
            <span class="recipe-section-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                <path d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </span>
            Étapes
          </h3>
          <div class="steps-list" id="steps-list">
            ${renderStepsList(r.steps, r.ingredients, ratio)}
          </div>
        </div>

        <div class="recipe-add-shopping">
          ${isInShopping ?
            `<button class="btn-secondary" onclick="removeFromShopping('${r.id}')">✓ Ajoutée à la liste de courses</button>` :
            `<button class="btn-primary" onclick="addToShopping('${r.id}', ${r.currentServings})">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="btn-icon">
                <path d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              Ajouter à la liste de courses
            </button>`
          }
        </div>
      </div>
    </div>
  `;

  // Servings controls
  document.getElementById('servings-minus').addEventListener('click', () => {
    if (state.currentRecipe.currentServings > 1) {
      state.currentRecipe.currentServings--;
      updateServingsDisplay();
    }
  });
  document.getElementById('servings-plus').addEventListener('click', () => {
    if (state.currentRecipe.currentServings < 50) {
      state.currentRecipe.currentServings++;
      updateServingsDisplay();
    }
  });
}

function setServings(recipeId, value) {
  if (!state.currentRecipe || state.currentRecipe.id !== recipeId) return;
  state.currentRecipe.currentServings = value;
  updateServingsDisplay();
  // Refresh active class on presets
  document.querySelectorAll('.servings-preset').forEach(b => {
    b.classList.toggle('active', Number(b.textContent) === value);
  });
}
window.setServings = setServings;

function renderIngredientsFilter() {
  const wrap = document.getElementById('ingredients-filter-chips');
  if (!wrap) return;
  if (state.ingredientsFilter.length === 0) {
    wrap.innerHTML = '';
    return;
  }
  wrap.innerHTML = state.ingredientsFilter.map((name, i) => `
    <span class="ingredient-chip">
      ${escapeHtml(name)}
      <button onclick="removeIngredientFilter(${i})">×</button>
    </span>
  `).join('');
}

function removeIngredientFilter(i) {
  state.ingredientsFilter.splice(i, 1);
  renderIngredientsFilter();
  updateFiltersUI();
  renderLibrary();
}
window.removeIngredientFilter = removeIngredientFilter;

// Compte les filtres actifs (hors favoris/tri qui ont leur propre UI)
function countActiveFilters() {
  let n = 0;
  if (state.categoryFilter && state.categoryFilter !== 'all') n++;
  if (state.monthFilter && state.monthFilter !== 'all') n++;
  if (state.ingredientsFilter && state.ingredientsFilter.length > 0) n++;
  if (state.cookedFilter) n++;
  return n;
}

// Met à jour le badge "Filtres" + le résumé sous la barre
function updateFiltersUI() {
  // Badge sur le bouton Filtres
  const badge = document.getElementById('filters-active-badge');
  const btn = document.getElementById('open-filters-btn');
  if (!badge || !btn) return;
  const n = countActiveFilters();
  if (n > 0) {
    badge.textContent = n;
    badge.classList.remove('hidden');
    btn.classList.add('has-active');
  } else {
    badge.classList.add('hidden');
    btn.classList.remove('has-active');
  }

  // Résumé visuel des filtres actifs
  const summary = document.getElementById('active-filters-summary');
  if (!summary) return;
  const chips = [];
  if (state.categoryFilter && state.categoryFilter !== 'all') {
    const cat = getCategoryById(state.categoryFilter);
    chips.push(`<button class="active-filter-chip" onclick="clearOneFilter('category')">${cat.emoji} ${cat.label} ✕</button>`);
  }
  if (state.monthFilter && state.monthFilter !== 'all') {
    let label = 'Ce mois-ci';
    if (state.monthFilter !== 'current') {
      const m = Number(state.monthFilter);
      label = MONTH_NAMES[m] || label;
    }
    chips.push(`<button class="active-filter-chip" onclick="clearOneFilter('month')">📅 ${label} ✕</button>`);
  }
  for (let i = 0; i < state.ingredientsFilter.length; i++) {
    chips.push(`<button class="active-filter-chip" onclick="removeIngredientFilter(${i})">🥕 ${escapeHtml(state.ingredientsFilter[i])} ✕</button>`);
  }
  if (state.cookedFilter) {
    const labels = { never: 'Jamais cuisinées', recent: 'Récentes', old: 'Pas faites depuis 90j' };
    chips.push(`<button class="active-filter-chip" onclick="clearOneFilter('cooked')">🍳 ${labels[state.cookedFilter]} ✕</button>`);
  }
  if (chips.length > 0) {
    summary.innerHTML = chips.join('') + `<button class="active-filter-clear-all" onclick="clearAllFilters()">Tout effacer</button>`;
    summary.classList.remove('hidden');
  } else {
    summary.innerHTML = '';
    summary.classList.add('hidden');
  }
}

function clearOneFilter(type) {
  if (type === 'category') state.categoryFilter = 'all';
  else if (type === 'month') state.monthFilter = 'all';
  else if (type === 'cooked') {
    state.cookedFilter = '';
    const sel = document.getElementById('filter-cooked');
    if (sel) sel.value = '';
  }
  // Reset le chip actif correspondant
  if (type === 'category' || type === 'month') {
    document.querySelectorAll(`.filter-chip[data-filter-type="${type}"]`).forEach(c => {
      c.classList.toggle('active', c.dataset.filterValue === 'all');
    });
  }
  updateFiltersUI();
  renderLibrary();
}
window.clearOneFilter = clearOneFilter;

function clearAllFilters() {
  state.categoryFilter = 'all';
  state.monthFilter = 'all';
  state.ingredientsFilter = [];
  state.cookedFilter = '';
  document.querySelectorAll('.filter-chip').forEach(c => {
    c.classList.toggle('active', c.dataset.filterValue === 'all');
  });
  const sel = document.getElementById('filter-cooked');
  if (sel) sel.value = '';
  renderIngredientsFilter();
  updateFiltersUI();
  renderLibrary();
}
window.clearAllFilters = clearAllFilters;

function updateServingsDisplay() {
  const r = state.currentRecipe;
  if (!r) return;
  document.getElementById('servings-value').textContent = r.currentServings;
  document.getElementById('servings-minus').disabled = r.currentServings <= 1;
  const ratio = r.currentServings / r.baseServings;
  document.getElementById('ingredients-list').innerHTML = renderIngredientsList(r.ingredients, ratio);
  document.getElementById('steps-list').innerHTML = renderStepsList(r.steps, r.ingredients, ratio);

  // Update shopping CTA
  const isInShopping = state.shopping.some(s => s.recipeId === r.id);
  const ctaContainer = document.querySelector('.recipe-add-shopping');
  if (ctaContainer && !isInShopping) {
    ctaContainer.querySelector('.btn-primary').setAttribute('onclick', `addToShopping('${r.id}', ${r.currentServings})`);
  }
}

function renderIngredientsList(ingredients, ratio) {
  return ingredients.map(ing => {
    const amount = ing.amount != null && ing.amount !== '' ? Number(ing.amount) * ratio : '';
    return `
      <div class="ingredient-row">
        <span class="ingredient-name">${escapeHtml(ing.name)}</span>
        <span class="ingredient-amount">${amount === '' ? '' : formatAmount(amount, ing.unit)}</span>
      </div>
    `;
  }).join('');
}

function renderStepsList(steps, ingredients, ratio) {
  return steps.map((step, i) => {
    const stepIngredients = (step.ingredientIds || []).map(id => {
      const ing = ingredients.find(x => x.id === id);
      if (!ing) return null;
      const amount = ing.amount != null && ing.amount !== '' ? Number(ing.amount) * ratio : '';
      return `<span class="step-ingredient-chip">${escapeHtml(ing.name)}${amount === '' ? '' : ' · ' + formatAmount(amount, ing.unit)}</span>`;
    }).filter(Boolean).join('');

    return `
      <div class="step-item">
        <div class="step-number">${i + 1}</div>
        <div class="step-content">
          <div class="step-text">${escapeHtml(step.text)}</div>
          ${stepIngredients ? `<div class="step-ingredients">${stepIngredients}</div>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

function confirmDeleteRecipe(id) {
  if (!confirm('Supprimer cette recette ?')) return;
  const deletedRecipe = state.recipes.find(r => r.id === id);
  state.recipes = state.recipes.filter(r => r.id !== id);
  state.shopping = state.shopping.filter(s => s.recipeId !== id);
  saveRecipes();
  saveShopping();
  // Sync delete
  if (state.sync.enabled && deletedRecipe) {
    syncRecipeAfterChange(deletedRecipe, true);
  }
  showToast('Recette supprimée');
  navigateTo('library');
  updateShoppingBadge();
}

window.confirmDeleteRecipe = confirmDeleteRecipe;

function editRecipe(id) {
  const recipe = state.recipes.find(r => r.id === id);
  if (!recipe) return;
  // Cloner pour éviter de muter avant validation
  const clone = JSON.parse(JSON.stringify(recipe));
  // Marquer cette recette comme étant en mode édition (préservera l'id et createdAt)
  state.editingRecipeId = id;
  openValidationModal(clone);
}

window.editRecipe = editRecipe;

function createManualRecipe() {
  const blankRecipe = {
    title: '',
    description: '',
    emoji: '🍽️',
    category: 'plat',
    baseServings: 4,
    prepTime: null,
    cookTime: null,
    tags: [],
    ingredients: [
      { id: 'ing1', name: '', amount: null, unit: '' }
    ],
    steps: [
      { text: '', ingredientIds: [] }
    ],
    months: []
  };
  state.editingRecipeId = null;
  state.pendingRecipe = null;
  openValidationModal(blankRecipe);
}

window.createManualRecipe = createManualRecipe;

// ============================================
// FEATURES RECETTE : favoris, cooked, notes, photo, tags
// ============================================

function updateRecipeAndSync(recipe, action) {
  recipe.updatedAt = Date.now();
  if (!recipe.changeLog) recipe.changeLog = [];
  if (action) {
    recipe.changeLog.push({ at: Date.now(), action });
    // Garde les 20 derniers
    if (recipe.changeLog.length > 20) recipe.changeLog = recipe.changeLog.slice(-20);
  }
  saveRecipes();
  if (state.sync.enabled) syncRecipeAfterChange(recipe, false);
}

function toggleFavorite(id) {
  const recipe = state.recipes.find(r => r.id === id);
  if (!recipe) return;
  recipe.favorite = !recipe.favorite;
  updateRecipeAndSync(recipe, recipe.favorite ? 'favoris ajouté' : 'favoris retiré');
  if (state.currentView === 'library') renderLibrary();
  if (state.currentView === 'recipe' && state.currentRecipe?.id === id) {
    state.currentRecipe.favorite = recipe.favorite;
    renderRecipeDetail(recipe);
  }
}
window.toggleFavorite = toggleFavorite;

function markAsCooked(id) {
  const recipe = state.recipes.find(r => r.id === id);
  if (!recipe) return;
  if (!recipe.cookedHistory) recipe.cookedHistory = [];
  recipe.cookedHistory.push(Date.now());
  // Garde les 50 derniers
  if (recipe.cookedHistory.length > 50) recipe.cookedHistory = recipe.cookedHistory.slice(-50);
  updateRecipeAndSync(recipe, 'cuisiné');
  showToast('Bravo ! Recette marquée comme faite ✓', 'success');
  if (state.currentView === 'recipe' && state.currentRecipe?.id === id) {
    state.currentRecipe.cookedHistory = recipe.cookedHistory;
    renderRecipeDetail(recipe);
  }
}
window.markAsCooked = markAsCooked;

function undoCooked(id) {
  const recipe = state.recipes.find(r => r.id === id);
  if (!recipe || !recipe.cookedHistory || !recipe.cookedHistory.length) return;
  recipe.cookedHistory.pop();
  updateRecipeAndSync(recipe, 'annulation cuisson');
  showToast('Annulé');
  if (state.currentView === 'recipe' && state.currentRecipe?.id === id) {
    state.currentRecipe.cookedHistory = recipe.cookedHistory;
    renderRecipeDetail(recipe);
  }
}
window.undoCooked = undoCooked;

function editPersonalNotes(id) {
  const recipe = state.recipes.find(r => r.id === id);
  if (!recipe) return;
  const current = recipe.personalNotes || '';
  const newValue = prompt('Vos notes personnelles (astuces, variantes, retours d\'expérience) :', current);
  if (newValue === null) return;
  recipe.personalNotes = newValue.trim();
  updateRecipeAndSync(recipe, 'notes modifiées');
  if (state.currentView === 'recipe' && state.currentRecipe?.id === id) {
    state.currentRecipe.personalNotes = recipe.personalNotes;
    renderRecipeDetail(recipe);
  }
  showToast('Notes enregistrées ✓', 'success');
}
window.editPersonalNotes = editPersonalNotes;

async function attachRecipePhoto(id) {
  const recipe = state.recipes.find(r => r.id === id);
  if (!recipe) return;
  // Créer un input file
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.capture = 'environment'; // suggère caméra arrière sur mobile
  input.addEventListener('change', async () => {
    const file = input.files[0];
    if (!file) return;
    try {
      const dataUrl = await processImageToDataUrl(file, 1024, 0.8);
      recipe.photo = dataUrl;
      updateRecipeAndSync(recipe, 'photo ajoutée');
      if (state.currentView === 'recipe' && state.currentRecipe?.id === id) {
        state.currentRecipe.photo = dataUrl;
        renderRecipeDetail(recipe);
      }
      showToast('Photo ajoutée ✓', 'success');
    } catch (e) {
      console.error(e);
      showToast('Erreur lors de l\'ajout de la photo', 'error');
    }
  });
  input.click();
}
window.attachRecipePhoto = attachRecipePhoto;

function removeRecipePhoto(id) {
  const recipe = state.recipes.find(r => r.id === id);
  if (!recipe || !recipe.photo) return;
  if (!confirm('Supprimer la photo ?')) return;
  recipe.photo = null;
  updateRecipeAndSync(recipe, 'photo retirée');
  if (state.currentView === 'recipe' && state.currentRecipe?.id === id) {
    state.currentRecipe.photo = null;
    renderRecipeDetail(recipe);
  }
}
window.removeRecipePhoto = removeRecipePhoto;

function editRecipeTags(id) {
  const recipe = state.recipes.find(r => r.id === id);
  if (!recipe) return;
  const current = (recipe.tags || []).join(', ');
  const newValue = prompt('Tags séparés par des virgules (ex: rapide, kids-friendly, comfort food) :', current);
  if (newValue === null) return;
  recipe.tags = newValue.split(',').map(t => t.trim().toLowerCase()).filter(Boolean).slice(0, 8);
  updateRecipeAndSync(recipe, 'tags modifiés');
  if (state.currentView === 'recipe' && state.currentRecipe?.id === id) {
    state.currentRecipe.tags = recipe.tags;
    renderRecipeDetail(recipe);
  }
  showToast('Tags enregistrés ✓', 'success');
}
window.editRecipeTags = editRecipeTags;

// Convertit un fichier image en data URL (avec resize)
async function processImageToDataUrl(file, maxSize, quality) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxSize || height > maxSize) {
          if (width > height) {
            height = Math.round(height * maxSize / width);
            width = maxSize;
          } else {
            width = Math.round(width * maxSize / height);
            height = maxSize;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality || 0.85));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ============================================
// MODE CUISINE (pas-à-pas plein écran, anti-veille)
// ============================================

let _wakeLock = null;

async function enterCookingMode(id) {
  const recipe = state.recipes.find(r => r.id === id);
  if (!recipe) return;
  state.cookingMode = { active: true, currentStep: 0, recipeId: id };
  pushOverlay('cooking');
  // Anti-veille
  try {
    if ('wakeLock' in navigator) {
      _wakeLock = await navigator.wakeLock.request('screen');
    }
  } catch (e) { console.log('Wake lock denied:', e); }
  renderCookingMode();
}
window.enterCookingMode = enterCookingMode;

async function exitCookingMode() {
  if (state.cookingMode && state.cookingMode.active) {
    // Appelé depuis l'UI : on fait un history.back qui passera par handleBack
    history.back();
  }
}
window.exitCookingMode = exitCookingMode;

async function _exitCookingModeNoHistory() {
  state.cookingMode.active = false;
  document.getElementById('cooking-mode').classList.add('hidden');
  if (_wakeLock) {
    try { await _wakeLock.release(); } catch {}
    _wakeLock = null;
  }
}

function cookingNextStep() {
  const recipe = state.recipes.find(r => r.id === state.cookingMode.recipeId);
  if (!recipe) return;
  if (state.cookingMode.currentStep < recipe.steps.length - 1) {
    state.cookingMode.currentStep++;
    renderCookingMode();
  } else {
    // Dernière étape : marquer comme cuisinée et sortir
    markAsCooked(recipe.id);
    exitCookingMode();
  }
}
window.cookingNextStep = cookingNextStep;

function cookingPrevStep() {
  if (state.cookingMode.currentStep > 0) {
    state.cookingMode.currentStep--;
    renderCookingMode();
  }
}
window.cookingPrevStep = cookingPrevStep;

function renderCookingMode() {
  const cm = state.cookingMode;
  if (!cm.active) return;
  const recipe = state.recipes.find(r => r.id === cm.recipeId);
  if (!recipe) return;
  const r = state.currentRecipe || recipe;
  const ratio = (r.currentServings || recipe.baseServings) / recipe.baseServings;
  const step = recipe.steps[cm.currentStep];
  const stepIngs = (step.ingredientIds || [])
    .map(id => recipe.ingredients.find(x => x.id === id))
    .filter(Boolean);

  const container = document.getElementById('cooking-mode');
  container.classList.remove('hidden');
  const total = recipe.steps.length;
  container.innerHTML = `
    <div class="cooking-header">
      <button class="cooking-close" onclick="exitCookingMode()" aria-label="Fermer">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 18L18 6M6 6l12 12" stroke-linecap="round"/></svg>
      </button>
      <div class="cooking-title">${escapeHtml(recipe.title)}</div>
      <div class="cooking-progress">${cm.currentStep + 1} / ${total}</div>
    </div>
    <div class="cooking-progress-bar">
      <div class="cooking-progress-fill" style="width: ${((cm.currentStep + 1) / total) * 100}%"></div>
    </div>
    <div class="cooking-content">
      <div class="cooking-step-number">Étape ${cm.currentStep + 1}</div>
      <div class="cooking-step-text">${escapeHtml(step.text)}</div>
      ${stepIngs.length ? `
        <div class="cooking-ingredients">
          <div class="cooking-ingredients-label">Pour cette étape :</div>
          ${stepIngs.map(ing => {
            const amt = ing.amount != null ? formatAmount(Number(ing.amount) * ratio, ing.unit) : '';
            return `<div class="cooking-ingredient">
              <span>${escapeHtml(ing.name)}</span>
              ${amt ? `<span class="cooking-ingredient-amount">${amt}</span>` : ''}
            </div>`;
          }).join('')}
        </div>
      ` : ''}
    </div>
    <div class="cooking-controls">
      <button class="cooking-btn cooking-btn-prev" onclick="cookingPrevStep()" ${cm.currentStep === 0 ? 'disabled' : ''}>
        ← Précédent
      </button>
      <button class="cooking-btn cooking-btn-next" onclick="cookingNextStep()">
        ${cm.currentStep === total - 1 ? '✓ Terminé !' : 'Suivant →'}
      </button>
    </div>
  `;
}

// ============================================
// PARTAGE DE RECETTE
// ============================================

async function shareRecipe(id) {
  const recipe = state.recipes.find(r => r.id === id);
  if (!recipe) return;
  const ratio = 1;
  let text = `🍴 ${recipe.title}\n`;
  if (recipe.description) text += `${recipe.description}\n`;
  text += `\nPour ${recipe.baseServings} personne${recipe.baseServings > 1 ? 's' : ''}`;
  if (recipe.prepTime) text += ` · Prép. ${recipe.prepTime} min`;
  if (recipe.cookTime) text += ` · Cuisson ${recipe.cookTime} min`;
  text += `\n\n📝 INGRÉDIENTS\n`;
  for (const ing of recipe.ingredients) {
    const amt = ing.amount != null ? formatAmount(Number(ing.amount), ing.unit) : '';
    text += `• ${ing.name}${amt ? ' — ' + amt : ''}\n`;
  }
  text += `\n👨‍🍳 ÉTAPES\n`;
  recipe.steps.forEach((s, i) => {
    text += `${i + 1}. ${s.text}\n`;
  });
  text += `\n— Partagée depuis Mes Recettes`;

  if (navigator.share) {
    try {
      await navigator.share({ title: recipe.title, text });
      return;
    } catch (e) { /* annulé ou non supporté */ }
  }
  // Fallback : copier
  try {
    await navigator.clipboard.writeText(text);
    showToast('Recette copiée ✓', 'success');
  } catch {
    showToast('Impossible de partager', 'error');
  }
}
window.shareRecipe = shareRecipe;

// ============================================
// RECONNAISSANCE VOCALE (via Claude)
// ============================================

let _mediaRecorder = null;
let _audioChunks = [];

async function startVoiceRecording(targetInputId) {
  if (!state.apiKey) {
    showToast('Clé API Claude requise pour le vocal', 'error');
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    _audioChunks = [];
    _mediaRecorder = new MediaRecorder(stream);
    _mediaRecorder.ondataavailable = e => {
      if (e.data.size > 0) _audioChunks.push(e.data);
    };
    _mediaRecorder.onstop = async () => {
      stream.getTracks().forEach(t => t.stop());
      const blob = new Blob(_audioChunks, { type: 'audio/webm' });
      // Pour transcription, on convertit en base64 et on envoie une description à Claude
      // Note : Claude API ne supporte pas directement l'audio pour le moment
      // On va donc utiliser l'API Web Speech native côté navigateur en complément
      showToast('Transcription en cours…');
      try {
        // Fallback : utiliser Web Speech qui est plus simple
        showToast("L'enregistrement vocal direct nécessite Claude Audio (à venir). Utilisation de la dictée navigateur en attendant.", 'error');
      } catch (e) {
        console.error(e);
      }
    };
    _mediaRecorder.start();
    document.getElementById('voice-recording-indicator').classList.remove('hidden');
  } catch (e) {
    console.error(e);
    showToast('Impossible d\'accéder au micro', 'error');
  }
}

function stopVoiceRecording() {
  if (_mediaRecorder && _mediaRecorder.state !== 'inactive') {
    _mediaRecorder.stop();
    document.getElementById('voice-recording-indicator').classList.add('hidden');
  }
}

// Reconnaissance vocale via Web Speech API (gratuite, fonctionne offline sur Android)
function startWebSpeech(targetInputId) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    showToast('Reconnaissance vocale non supportée par ce navigateur', 'error');
    return;
  }
  const recognition = new SpeechRecognition();
  recognition.lang = 'fr-FR';
  recognition.continuous = false;
  recognition.interimResults = false;

  document.getElementById('voice-recording-indicator').classList.remove('hidden');

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    const input = document.getElementById(targetInputId);
    if (input) {
      input.value = (input.value ? input.value + ' ' : '') + transcript;
      input.dispatchEvent(new Event('input'));
    }
  };
  recognition.onerror = (e) => {
    console.error('Speech error:', e);
    showToast('Erreur de reconnaissance vocale', 'error');
  };
  recognition.onend = () => {
    document.getElementById('voice-recording-indicator').classList.add('hidden');
  };
  recognition.start();
}

function startVoiceInput(targetInputId) {
  // Utilise Web Speech par défaut (gratuit)
  // Claude est plus précis mais nécessite plus d'infrastructure
  startWebSpeech(targetInputId);
}
window.startVoiceInput = startVoiceInput;

// ============================================
// GÉNÉRATION DE MENUS (IA)
// ============================================

async function generateMenu(occasion) {
  if (!state.apiKey) {
    showToast('Clé API Claude requise', 'error');
    return;
  }
  if (state.recipes.length < 3) {
    showToast('Il faut au moins 3 recettes dans votre bibliothèque', 'error');
    return;
  }

  showLoadingMessage();
  try {
    // On résume la bibliothèque pour l'envoyer à Claude (token efficient)
    const library = state.recipes.map(r => ({
      id: r.id,
      title: r.title,
      category: r.category,
      tags: r.tags || [],
      months: r.months || [],
      prepTime: r.prepTime,
      cookTime: r.cookTime
    }));

    const userMsg = `Voici ma bibliothèque de recettes :
${JSON.stringify(library, null, 2)}

Demande : ${occasion || 'Propose-moi un menu équilibré (entrée + plat + dessert) pour ce soir.'}

Réponds avec le format JSON entouré de <menu></menu>.`;

    const response = await callClaudeAPI([{ role: 'user', content: userMsg }], {
      system: MENU_PROMPT,
      maxTokens: 1500
    });
    hideLoadingMessage();
    
    const match = response.match(/<menu>([\s\S]*?)<\/menu>/);
    if (!match) {
      addChatMessage('assistant', response);
      return;
    }
    const intro = response.substring(0, response.indexOf('<menu>')).trim();
    const menuData = JSON.parse(match[1].trim().replace(/^```json\s*/i, '').replace(/```$/, ''));
    
    if (intro) addChatMessage('assistant', intro);
    
    // Affiche le menu sous forme structurée
    let menuHtml = `<div class="menu-result">
      <h3>${escapeHtml(menuData.title || 'Menu')}</h3>
      ${menuData.description ? `<p>${escapeHtml(menuData.description)}</p>` : ''}
      <div class="menu-items">`;
    for (const item of menuData.items || []) {
      const recipe = state.recipes.find(r => r.id === item.recipeId);
      if (!recipe) continue;
      const cat = getCategoryById(recipe.category);
      menuHtml += `
        <div class="menu-item" onclick="openRecipe('${recipe.id}')">
          <span class="menu-item-cat">${cat.emoji} ${cat.label}</span>
          <span class="menu-item-title">${escapeHtml(recipe.title)}</span>
          ${item.note ? `<span class="menu-item-note">${escapeHtml(item.note)}</span>` : ''}
        </div>`;
    }
    menuHtml += `</div>
      <button class="btn-primary btn-block" onclick="addMenuToShopping(${JSON.stringify(menuData.items || []).replace(/"/g, '&quot;')})">+ Tout ajouter à la liste de courses</button>
    </div>`;
    
    const msgs = document.getElementById('chat-messages');
    const div = document.createElement('div');
    div.className = 'chat-message chat-message-assistant';
    div.innerHTML = menuHtml;
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
  } catch (e) {
    hideLoadingMessage();
    console.error(e);
    addChatMessage('assistant', '⚠️ ' + e.message);
  }
}
window.generateMenu = generateMenu;

function addMenuToShopping(items) {
  let added = 0;
  for (const item of items) {
    const recipe = state.recipes.find(r => r.id === item.recipeId);
    if (recipe && !state.shopping.some(s => s.recipeId === recipe.id)) {
      state.shopping.push({ recipeId: recipe.id, servings: recipe.baseServings });
      added++;
    }
  }
  saveShopping();
  updateShoppingBadge();
  showToast(`${added} recette${added > 1 ? 's' : ''} ajoutée${added > 1 ? 's' : ''} à la liste`, 'success');
}
window.addMenuToShopping = addMenuToShopping;

// ============================================
// MULTI-LISTES DE COURSES
// ============================================

function createShoppingList(name) {
  const list = {
    id: uid(),
    name: name || 'Nouvelle liste',
    items: [],
    createdAt: Date.now()
  };
  state.shoppingLists.push(list);
  state.activeShoppingListId = list.id;
  state.shopping = list.items;
  state.shoppingChecked.clear();
  saveShoppingLists();
  return list;
}

function switchShoppingList(id) {
  const list = state.shoppingLists.find(l => l.id === id);
  if (!list) return;
  // Sauve la liste courante avant de switch
  saveShopping();
  state.activeShoppingListId = id;
  state.shopping = list.items;
  state.shoppingChecked.clear();
  saveShoppingLists();
  renderShopping();
  updateShoppingBadge();
}
window.switchShoppingList = switchShoppingList;

function deleteShoppingList(id) {
  if (state.shoppingLists.length <= 1) {
    showToast('Vous devez garder au moins une liste', 'error');
    return;
  }
  if (!confirm('Supprimer cette liste ?')) return;
  state.shoppingLists = state.shoppingLists.filter(l => l.id !== id);
  if (state.activeShoppingListId === id) {
    state.activeShoppingListId = state.shoppingLists[0].id;
    state.shopping = state.shoppingLists[0].items;
  }
  saveShoppingLists();
  renderShopping();
  updateShoppingBadge();
}
window.deleteShoppingList = deleteShoppingList;

function renameShoppingList(id) {
  const list = state.shoppingLists.find(l => l.id === id);
  if (!list) return;
  const newName = prompt('Nom de la liste :', list.name);
  if (!newName || !newName.trim()) return;
  list.name = newName.trim();
  saveShoppingLists();
  renderShopping();
}
window.renameShoppingList = renameShoppingList;

function addNewShoppingList() {
  const name = prompt('Nom de la nouvelle liste :', 'Nouvelle liste');
  if (!name || !name.trim()) return;
  createShoppingList(name.trim());
  renderShopping();
  updateShoppingBadge();
}
window.addNewShoppingList = addNewShoppingList;

// ============================================
// GARDE-MANGER
// ============================================

function addToPantry(name) {
  const normalized = normalizeIngredientName(name);
  if (!normalized) return;
  // 7 jours par défaut
  const until = Date.now() + 7 * 24 * 3600 * 1000;
  // Remplace si existe
  state.pantry = state.pantry.filter(p => normalizeIngredientName(p.name) !== normalized);
  state.pantry.push({ name, until });
  savePantry();
}

function removeFromPantry(name) {
  const normalized = normalizeIngredientName(name);
  state.pantry = state.pantry.filter(p => normalizeIngredientName(p.name) !== normalized);
  savePantry();
}

function isInPantry(name) {
  const normalized = normalizeIngredientName(name);
  const now = Date.now();
  return state.pantry.some(p => normalizeIngredientName(p.name) === normalized && (!p.until || p.until > now));
}

function togglePantryFromShopping(name) {
  if (isInPantry(name)) {
    removeFromPantry(name);
    showToast('Retiré du garde-manger');
  } else {
    addToPantry(name);
    showToast(`"${name}" : caché 7 jours (déjà dans mon stock)`, 'success');
  }
  renderShopping();
}
window.togglePantryFromShopping = togglePantryFromShopping;

// ============================================
// BACKUP AUTOMATIQUE MENSUEL
// ============================================

function checkAndDoBackup() {
  if (state.recipes.length === 0) return;
  const last = Number(localStorage.getItem(STORAGE_KEYS.lastBackup)) || 0;
  const ONE_MONTH = 30 * 24 * 3600 * 1000;
  if (Date.now() - last < ONE_MONTH) return;
  // Faire le backup en silence
  try {
    const data = {
      recipes: state.recipes,
      shoppingLists: state.shoppingLists,
      exportedAt: new Date().toISOString(),
      version: 2,
      auto: true
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mes-recettes-backup-auto-' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    URL.revokeObjectURL(url);
    localStorage.setItem(STORAGE_KEYS.lastBackup, String(Date.now()));
    showToast('💾 Backup automatique téléchargé', 'success');
  } catch (e) {
    console.error('Backup error:', e);
  }
}

// ============================================
// THÈME
// ============================================

function applyTheme() {
  const theme = state.prefs.theme;
  const root = document.documentElement;
  if (theme === 'dark') {
    root.setAttribute('data-theme', 'dark');
  } else if (theme === 'light') {
    root.setAttribute('data-theme', 'light');
  } else {
    // auto
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
  }
}

function setTheme(theme) {
  state.prefs.theme = theme;
  savePrefs();
  applyTheme();
}
window.setTheme = setTheme;

// Écouter le changement de préférence système
if (window.matchMedia) {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (state.prefs.theme === 'auto') applyTheme();
  });
}

function quickEditField(field, recipeId) {
  const recipe = state.recipes.find(r => r.id === recipeId);
  if (!recipe) return;
  const labels = {
    title: 'Titre de la recette',
    description: 'Description'
  };
  const current = recipe[field] || '';
  const newValue = prompt(labels[field] + ' :', current);
  if (newValue === null) return; // annulé
  const trimmed = newValue.trim();
  if (field === 'title' && !trimmed) {
    showToast('Le titre ne peut pas être vide', 'error');
    return;
  }
  recipe[field] = trimmed;
  recipe.updatedAt = Date.now();
  saveRecipes();
  if (state.sync.enabled) {
    syncRecipeAfterChange(recipe, false);
  }
  // Mettre à jour la vue active
  state.currentRecipe = { ...recipe, currentServings: state.currentRecipe?.currentServings || recipe.baseServings };
  renderRecipeDetail(recipe);
  showToast('Modifié ✓', 'success');
}

window.quickEditField = quickEditField;

// ============================================
// SHOPPING LIST
// ============================================

function addToShopping(recipeId, servings) {
  if (state.shopping.some(s => s.recipeId === recipeId)) {
    showToast('Déjà dans la liste');
    return;
  }
  state.shopping.push({ recipeId, servings });
  saveShopping();
  showToast('Ajoutée à la liste de courses', 'success');
  updateShoppingBadge();
  // Re-render current recipe page to update CTA
  if (state.currentView === 'recipe') {
    renderRecipeDetail(state.currentRecipe);
  }
}

window.addToShopping = addToShopping;

function removeFromShopping(recipeId) {
  state.shopping = state.shopping.filter(s => s.recipeId !== recipeId);
  saveShopping();
  updateShoppingBadge();
  if (state.currentView === 'recipe') {
    renderRecipeDetail(state.currentRecipe);
  }
  if (state.currentView === 'shopping') {
    renderShopping();
  }
}

window.removeFromShopping = removeFromShopping;

function updateShoppingServings(recipeId, delta) {
  const item = state.shopping.find(s => s.recipeId === recipeId);
  if (!item) return;
  item.servings = Math.max(1, Math.min(50, item.servings + delta));
  saveShopping();
  renderShopping();
}

window.updateShoppingServings = updateShoppingServings;

function updateShoppingBadge() {
  const badge = document.getElementById('shopping-badge');
  if (state.shopping.length > 0) {
    badge.textContent = state.shopping.length;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

function aggregateShoppingItems() {
  const aggregated = {};

  for (const item of state.shopping) {
    const recipe = state.recipes.find(r => r.id === item.recipeId);
    if (!recipe) continue;
    const ratio = item.servings / recipe.baseServings;

    for (const ing of recipe.ingredients) {
      // Exclusion : sel, poivre, eau (sauf variantes précises)
      if (isShoppingExcluded(ing.name)) continue;
      // Garde-manger
      if (isInPantry(ing.name)) continue;

      const normalizedName = normalizeIngredientName(ing.name);
      if (!normalizedName) continue;

      // Conversion d'unités : on essaie de convertir vers la base (ml ou g)
      const norm = normalizeAmount(ing.amount, ing.unit);

      // Clé : si convertible, on groupe juste par nom (pour fusionner ml + cl + l)
      // Sinon on garde l'unité dans la clé
      const key = norm
        ? normalizedName + '|' + norm.type
        : normalizedName + '|' + (ing.unit || '').toLowerCase().trim();

      if (!aggregated[key]) {
        const displayName = ing.name.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
        aggregated[key] = {
          name: displayName || ing.name,
          unit: ing.unit || '',
          amount: 0,
          baseAmount: 0, // pour items convertibles
          baseType: norm ? norm.type : null,
          hasAmount: ing.amount != null && ing.amount !== '',
          category: categorizeIngredient(displayName || ing.name)
        };
      }
      if (ing.amount != null && ing.amount !== '' && !isNaN(Number(ing.amount))) {
        if (norm) {
          aggregated[key].baseAmount += norm.amount * ratio;
        } else {
          aggregated[key].amount += Number(ing.amount) * ratio;
        }
      } else {
        aggregated[key].hasAmount = aggregated[key].hasAmount || false;
      }
    }
  }

  // Post-process : pour les items convertibles, choisir la meilleure unité d'affichage
  return Object.values(aggregated).map(item => {
    if (item.baseType && item.baseAmount > 0) {
      const best = getBestDisplayUnit(item.baseAmount, item.baseType);
      if (best) {
        item.unit = best.unit;
        item.amount = item.baseAmount / best.factor;
        item.hasAmount = true;
      }
    }
    return item;
  });
}

function renderShopping() {
  const empty = document.getElementById('shopping-empty');
  const content = document.getElementById('shopping-content');

  // Toujours rendre la barre de switch listes
  renderShoppingListSwitcher();

  if (state.shopping.length === 0) {
    empty.classList.remove('hidden');
    content.classList.add('hidden');
    return;
  }

  empty.classList.add('hidden');
  content.classList.remove('hidden');

  const recipesEl = document.getElementById('shopping-recipes');
  recipesEl.innerHTML = state.shopping.map(item => {
    const r = state.recipes.find(x => x.id === item.recipeId);
    if (!r) return '';
    return `
      <div class="shopping-recipe-row">
        <div class="shopping-recipe-emoji">${r.photo ? `<img src="${r.photo}" alt="">` : (r.emoji || '🍽️')}</div>
        <div class="shopping-recipe-info">
          <div class="shopping-recipe-name">${escapeHtml(r.title)}</div>
          <div class="shopping-recipe-servings">
            <button class="shopping-recipe-servings-btn" onclick="updateShoppingServings('${r.id}', -1)" ${item.servings <= 1 ? 'disabled' : ''}>−</button>
            <span class="shopping-recipe-servings-value">${item.servings} pers.</span>
            <button class="shopping-recipe-servings-btn" onclick="updateShoppingServings('${r.id}', 1)">+</button>
          </div>
        </div>
        <button class="shopping-recipe-remove" onclick="removeFromShopping('${r.id}')" aria-label="Retirer">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M6 18L18 6M6 6l12 12" stroke-linecap="round"/>
          </svg>
        </button>
      </div>
    `;
  }).join('');

  // Aggregated
  const items = aggregateShoppingItems();
  const grouped = {};
  for (const cat of PRODUCT_CATEGORIES) grouped[cat.id] = [];
  for (const item of items) grouped[item.category].push(item);

  let html = '';
  let totalCount = 0;
  for (const cat of PRODUCT_CATEGORIES) {
    const catItems = grouped[cat.id];
    if (catItems.length === 0) continue;
    catItems.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    html += `
      <div class="shopping-category">
        <div class="shopping-category-title">
          <span class="shopping-category-emoji">${cat.emoji}</span>
          ${cat.label}
        </div>
    `;
    for (const item of catItems) {
      totalCount++;
      const itemKey = item.name + '|' + item.unit;
      const isChecked = state.shoppingChecked.has(itemKey);
      const amountStr = item.hasAmount && item.amount > 0 ? formatAmount(item.amount, item.unit) : '';
      const safeKey = escapeHtml(itemKey).replace(/'/g, "\\'");
      const safeName = escapeHtml(item.name).replace(/'/g, "\\'");
      html += `
        <div class="shopping-item ${isChecked ? 'done' : ''}">
          <div class="shopping-item-check ${isChecked ? 'checked' : ''}" onclick="toggleShoppingItem('${safeKey}')"></div>
          <div class="shopping-item-name" onclick="toggleShoppingItem('${safeKey}')">${escapeHtml(item.name)}</div>
          ${amountStr ? `<div class="shopping-item-amount">${amountStr}</div>` : ''}
          <button class="shopping-item-pantry" onclick="event.stopPropagation(); togglePantryFromShopping('${safeName}')" title="J'en ai déjà" aria-label="Garde-manger">📦</button>
        </div>
      `;
    }
    html += '</div>';
  }

  // Si garde-manger non vide, ajouter une section info en bas
  if (state.pantry.length > 0) {
    html += `<div class="shopping-pantry-info">
      <strong>📦 Garde-manger (${state.pantry.length})</strong>
      <p>Ces ingrédients sont cachés des courses pour 7 jours :</p>
      <div class="shopping-pantry-list">`;
    for (const p of state.pantry) {
      const days = Math.max(0, Math.ceil((p.until - Date.now()) / (24 * 3600 * 1000)));
      const safeName = escapeHtml(p.name).replace(/'/g, "\\'");
      html += `<button class="shopping-pantry-chip" onclick="togglePantryFromShopping('${safeName}')">${escapeHtml(p.name)} <span>${days}j</span> ✕</button>`;
    }
    html += `</div></div>`;
  }

  document.getElementById('shopping-list').innerHTML = html;
  document.getElementById('shopping-count').textContent = totalCount + ' article' + (totalCount > 1 ? 's' : '');
}

function renderShoppingListSwitcher() {
  let switcher = document.getElementById('shopping-list-switcher');
  if (!switcher) {
    // Créer le switcher si absent
    switcher = document.createElement('div');
    switcher.id = 'shopping-list-switcher';
    switcher.className = 'shopping-list-switcher';
    const view = document.getElementById('view-shopping');
    view.insertBefore(switcher, view.firstChild);
  }
  if (state.shoppingLists.length <= 1 && state.shoppingLists[0]?.id === 'default' && state.shopping.length === 0) {
    switcher.innerHTML = '';
    return;
  }
  let html = `<div class="shopping-lists-tabs">`;
  for (const list of state.shoppingLists) {
    const active = list.id === state.activeShoppingListId;
    const count = list.items.length;
    html += `<button class="shopping-list-tab ${active ? 'active' : ''}" onclick="switchShoppingList('${list.id}')" ondblclick="renameShoppingList('${list.id}')">
      ${escapeHtml(list.name)}${count ? ` <span class="tab-count">${count}</span>` : ''}
    </button>`;
  }
  html += `<button class="shopping-list-tab shopping-list-add" onclick="addNewShoppingList()" aria-label="Nouvelle liste">+</button>`;
  html += `</div>`;
  if (state.shoppingLists.length > 1) {
    html += `<button class="shopping-list-delete" onclick="deleteShoppingList('${state.activeShoppingListId}')">🗑 Supprimer cette liste</button>`;
  }
  switcher.innerHTML = html;
}

function toggleShoppingItem(key) {
  if (state.shoppingChecked.has(key)) {
    state.shoppingChecked.delete(key);
  } else {
    state.shoppingChecked.add(key);
  }
  renderShopping();
}

window.toggleShoppingItem = toggleShoppingItem;

async function copyShoppingList() {
  const items = aggregateShoppingItems();
  if (items.length === 0) return;

  const grouped = {};
  for (const cat of PRODUCT_CATEGORIES) grouped[cat.id] = [];
  for (const item of items) grouped[item.category].push(item);

  let text = '🛒 Liste de courses\n';
  text += '════════════════\n\n';

  for (const cat of PRODUCT_CATEGORIES) {
    const catItems = grouped[cat.id];
    if (catItems.length === 0) continue;
    catItems.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    text += `${cat.emoji} ${cat.label.toUpperCase()}\n`;
    for (const item of catItems) {
      const amountStr = item.hasAmount && item.amount > 0 ? ' — ' + formatAmount(item.amount, item.unit) : '';
      text += `• ${item.name}${amountStr}\n`;
    }
    text += '\n';
  }

  text += '────────────────\n';
  text += `Pour ${state.shopping.length} recette${state.shopping.length > 1 ? 's' : ''}`;

  try {
    await navigator.clipboard.writeText(text);
    showToast('Liste copiée dans le presse-papier ✓', 'success');
  } catch (e) {
    // Fallback
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      showToast('Liste copiée ✓', 'success');
    } catch (err) {
      showToast('Impossible de copier', 'error');
    }
    document.body.removeChild(ta);
  }
}

function clearShopping() {
  if (state.shopping.length === 0) return;
  if (!confirm('Vider la liste de courses ?')) return;
  state.shopping = [];
  state.shoppingChecked.clear();
  saveShopping();
  updateShoppingBadge();
  renderShopping();
  showToast('Liste vidée');
}

// ============================================
// CHAT / AI RECIPE CREATION
// ============================================

function addChatMessage(role, content, images) {
  const msgs = document.getElementById('chat-messages');

  // Hide welcome
  const welcome = msgs.querySelector('.chat-welcome');
  if (welcome) welcome.remove();

  const msgEl = document.createElement('div');
  msgEl.className = 'chat-message chat-message-' + role;

  let html = '';
  if (typeof content === 'string') {
    html = escapeHtml(content).replace(/\n/g, '<br>');
  }
  msgEl.innerHTML = html;

  if (images && images.length) {
    const imgsEl = document.createElement('div');
    imgsEl.className = 'chat-message-images';
    for (const img of images) {
      const imgEl = document.createElement('img');
      imgEl.src = 'data:' + img.media_type + ';base64,' + img.data;
      imgsEl.appendChild(imgEl);
    }
    msgEl.appendChild(imgsEl);
  }

  msgs.appendChild(msgEl);
  msgs.scrollTop = msgs.scrollHeight;
  return msgEl;
}

function showLoadingMessage() {
  const msgs = document.getElementById('chat-messages');
  const welcome = msgs.querySelector('.chat-welcome');
  if (welcome) welcome.remove();

  const el = document.createElement('div');
  el.className = 'chat-message-loading';
  el.id = 'loading-msg';
  el.innerHTML = '<div class="dot"></div><div class="dot"></div><div class="dot"></div>';
  msgs.appendChild(el);
  msgs.scrollTop = msgs.scrollHeight;
}

function hideLoadingMessage() {
  const el = document.getElementById('loading-msg');
  if (el) el.remove();
}

async function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      const base64 = result.split(',')[1];
      resolve({ media_type: file.type, data: base64 });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function renderAttachments() {
  const wrap = document.getElementById('chat-attachments');
  if (state.chatAttachments.length === 0) {
    wrap.classList.add('hidden');
    wrap.innerHTML = '';
    return;
  }
  wrap.classList.remove('hidden');
  wrap.innerHTML = state.chatAttachments.map((att, i) => `
    <div class="chat-attachment-thumb">
      <img src="data:${att.media_type};base64,${att.data}">
      <button class="chat-attachment-remove" onclick="removeAttachment(${i})">×</button>
    </div>
  `).join('');
}

function removeAttachment(i) {
  state.chatAttachments.splice(i, 1);
  renderAttachments();
}

window.removeAttachment = removeAttachment;

const SYSTEM_PROMPT = `Tu es un assistant culinaire expert qui transforme du contenu en recettes structurées.

L'utilisateur va t'envoyer:
- Un lien (YouTube, Instagram, site web, blog)
- Des images d'une recette (livre, écran, photo de plat)
- Une description en texte libre

Ton job: extraire ou créer une recette structurée et la renvoyer en JSON STRICT.

IMPORTANT: 
- Si on te donne un lien sans contenu textuel collé, tu ne peux pas le visiter directement (sauf si l'outil web_search est activé). Demande à l'utilisateur de copier le contenu (description, transcription, ingrédients listés). NE JAMAIS INVENTER une recette à partir d'un lien sans contenu.
- Si tu as des images, analyse-les pour identifier les ingrédients, étapes, et le titre.
- Si la description est claire, génère la recette directement.

Format de sortie: ENTOURE TON JSON DE BALISES <recipe>...</recipe>

Schéma JSON:
{
  "title": "Titre court et descriptif",
  "description": "Une phrase qui décrit la recette (optionnel)",
  "emoji": "🍝",
  "category": "plat",
  "baseServings": 4,
  "prepTime": 15,
  "cookTime": 30,
  "tags": ["rapide", "végétarien"],
  "ingredients": [
    { "id": "ing1", "name": "Nom de l'ingrédient", "amount": 200, "unit": "g" }
  ],
  "steps": [
    { "text": "Description de l'étape", "ingredientIds": ["ing1"] }
  ]
}

Règles GÉNÉRALES:
- "amount" est un nombre (ou null si non spécifié, ex: "sel"). Pas de chaînes.
- "unit" est "g", "kg", "ml", "cl", "l", "cuillère à soupe", "cuillère à café", "pièce(s)", "gousse(s)", "pincée", etc. Vide ou absent si juste une mention.
- "baseServings" est le nombre de portions. Par défaut 4 si non précisé.
- "prepTime" en MINUTES (préparation, hors cuisson). null si non précisé.
- "cookTime" en MINUTES (cuisson). null si non précisé.
- "tags" : 0 à 4 tags pertinents. Suggestions : "rapide" (<30min total), "facile", "festif", "réconfortant", "végétarien", "végan", "sans gluten", "sans lactose", "été", "hiver", "économique", "kids-friendly". N'invente pas de tags trop spécifiques.
- "ingredientIds" lie chaque étape à ses ingrédients (avec leurs IDs). Lier autant que possible.
- "emoji" un seul emoji représentatif.
- Avant le JSON, écris UNE phrase courte (max 20 mots) pour confirmer ce que tu as trouvé.
- Ne mets RIEN après le JSON.

Règles pour "category":
- Choisis EXACTEMENT une de ces valeurs: "apero", "entree", "plat", "dessert", "gouter", "petitdej", "boisson", "autre"
- "apero" = tapas, dips, finger food, amuse-bouches
- "entree" = soupes, salades servies en entrée, terrines, antipasti
- "plat" = plat principal (viande, poisson, pâtes, riz, plats végétariens consistants)
- "dessert" = gâteaux, tartes, mousses, fruits servis en fin de repas
- "gouter" = cookies, viennoiseries, brioches, en-cas sucrés ou salés
- "petitdej" = recettes du matin (granola, pancakes, porridge, œufs brouillés, smoothie bowl, viennoiseries du matin)
- "boisson" = jus, smoothies, cocktails, infusions
- "autre" = sauces, condiments, conserves, bases (pâte à pizza nature, bouillon...)
- Si ambigu, choisis ce qui te paraît le plus probable selon le contexte.

Règles CRITIQUES pour les ingrédients (FUSION INTELLIGENTE):
- AVANT de finaliser ta liste, FUSIONNE les ingrédients qui sont en réalité le même produit utilisé à plusieurs endroits.
- Exemple: "Farine de force (empâtement) 500g" + "Farine de force (pour la biga) 100g" → UN SEUL ingrédient "Farine de force" avec 600g.
- Exemple: "Beurre 50g (pour le moule)" + "Beurre 200g (pour la pâte)" → "Beurre" avec 250g.
- Exemple: "Sucre 100g" + "Sucre vanillé 1 sachet" → laisser séparés (produits différents).
- Si tu fusionnes, mentionne dans l'étape concernée à quoi sert chaque portion (ex: "Réservez 50g de beurre pour le moule").
- Pour les étapes qui réfèrent à plusieurs portions du même ingrédient, utilise quand même le même ingredientId.

Règles pour les noms d'ingrédients:
- Utilise le nom le plus simple et générique possible
- "Tomates cerises" et non "Tomates cerises bio"
- Pas de marques (sauf si essentiel à la recette)
- Le nom doit être directement utilisable en liste de courses
- N'écris JAMAIS de précisions entre parenthèses dans le nom (utilise les étapes pour ça)

Si l'utilisateur veut modifier une recette précédente, propose une version mise à jour avec un nouveau bloc <recipe>.

Si tu ne peux pas extraire de recette (lien sans contenu, message ambigu), demande des précisions SANS générer de JSON.`;

const MENU_PROMPT = `Tu es un assistant culinaire qui propose des menus complets à partir d'une bibliothèque de recettes existantes.

L'utilisateur te fournira sa bibliothèque de recettes (titre, catégorie, durée, tags, mois) et te demandera un menu pour une occasion donnée.

Tu dois proposer un menu cohérent en sélectionnant des recettes UNIQUEMENT depuis cette bibliothèque (pas d'invention).

Format de sortie: ENTOURE TON JSON DE BALISES <menu>...</menu>

Schéma:
{
  "title": "Menu d'été pour 4 personnes",
  "description": "Pourquoi ce menu fonctionne (1-2 phrases)",
  "items": [
    { "recipeId": "ID_de_la_recette", "category": "entree", "note": "Pourquoi je l'ai choisie" }
  ]
}

Règles:
- Utilise UNIQUEMENT les IDs des recettes fournies dans la bibliothèque
- Si aucune recette ne correspond à un type souhaité, dis-le clairement et n'invente pas
- Propose 1 entrée + 1 plat + 1 dessert par défaut, sauf demande contraire
- Avant le JSON, écris UNE phrase courte d'introduction
- Ne mets RIEN après le JSON.`;

async function callClaudeAPI(messages, options) {
  if (!state.apiKey) {
    throw new Error('NO_API_KEY');
  }
  options = options || {};

  const apiMessages = messages.map(m => {
    if (typeof m.content === 'string') {
      return { role: m.role, content: m.content };
    }
    return m;
  });

  const body = {
    model: 'claude-sonnet-4-6',
    max_tokens: options.maxTokens || 4000,
    system: options.system || SYSTEM_PROMPT,
    messages: apiMessages
  };

  // Tool web_search activé si demandé
  if (options.enableWebSearch) {
    body.tools = [
      {
        type: 'web_search_20250305',
        name: 'web_search',
        max_uses: 3
      }
    ];
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': state.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const err = await response.text();
    console.error('API error:', err);
    if (response.status === 401) throw new Error('Clé API invalide');
    if (response.status === 429) throw new Error('Limite API atteinte, réessayez plus tard');
    throw new Error('Erreur API : ' + response.status);
  }

  const data = await response.json();
  const text = data.content
    .filter(c => c.type === 'text')
    .map(c => c.text)
    .join('\n');
  return text;
}

function extractRecipeFromResponse(text) {
  const match = text.match(/<recipe>([\s\S]*?)<\/recipe>/);
  if (!match) return { text: text, recipe: null };

  let recipeJson = match[1].trim();
  // Remove markdown code fences if any
  recipeJson = recipeJson.replace(/^```json\s*/i, '').replace(/```$/, '').trim();

  try {
    const recipe = JSON.parse(recipeJson);
    if (!recipe.title || !Array.isArray(recipe.ingredients) || !Array.isArray(recipe.steps)) {
      return { text: text.replace(/<recipe>[\s\S]*?<\/recipe>/, '').trim(), recipe: null };
    }
    recipe.ingredients = recipe.ingredients.map((ing, i) => ({
      id: ing.id || 'ing' + (i + 1),
      name: ing.name || '',
      amount: ing.amount === undefined || ing.amount === null || ing.amount === '' ? null : Number(ing.amount),
      unit: ing.unit || ''
    }));
    recipe.baseServings = Number(recipe.baseServings) || 4;
    recipe.steps = recipe.steps.map(s => ({
      text: s.text || '',
      ingredientIds: Array.isArray(s.ingredientIds) ? s.ingredientIds : []
    }));
    const validCats = RECIPE_CATEGORIES.map(c => c.id);
    recipe.category = validCats.includes(recipe.category) ? recipe.category : 'plat';
    // Nouveaux champs
    recipe.prepTime = recipe.prepTime != null && !isNaN(Number(recipe.prepTime)) ? Number(recipe.prepTime) : null;
    recipe.cookTime = recipe.cookTime != null && !isNaN(Number(recipe.cookTime)) ? Number(recipe.cookTime) : null;
    recipe.tags = Array.isArray(recipe.tags) ? recipe.tags.slice(0, 6).map(t => String(t).toLowerCase()) : [];
    const cleanText = text.replace(/<recipe>[\s\S]*?<\/recipe>/, '').trim();
    return { text: cleanText, recipe };
  } catch (e) {
    console.error('Recipe parse error:', e);
    return { text: text.replace(/<recipe>[\s\S]*?<\/recipe>/, '').trim(), recipe: null };
  }
}

async function sendChat() {
  const input = document.getElementById('chat-input');
  const text = input.value.trim();

  if (!text && state.chatAttachments.length === 0) return;

  if (!state.apiKey) {
    addChatMessage('assistant', "Je n'ai pas de clé API configurée. Allez dans Paramètres pour la définir, ou utilisez le mode démo.");
    showSettings();
    return;
  }

  // Build user message
  const userContent = [];
  if (state.chatAttachments.length > 0) {
    for (const att of state.chatAttachments) {
      userContent.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: att.media_type,
          data: att.data
        }
      });
    }
  }
  if (text) {
    userContent.push({ type: 'text', text });
  }

  // Display user message
  addChatMessage('user', text, state.chatAttachments);

  // Add to history
  state.chatHistory.push({
    role: 'user',
    content: userContent.length === 1 && userContent[0].type === 'text' ? text : userContent
  });

  // Reset input
  input.value = '';
  input.style.height = 'auto';
  state.chatAttachments = [];
  renderAttachments();
  document.getElementById('chat-send-btn').disabled = true;

  // Show loading
  showLoadingMessage();

  try {
    const lastMsg = (typeof state.chatHistory[state.chatHistory.length - 1].content === 'string'
      ? state.chatHistory[state.chatHistory.length - 1].content
      : (state.chatHistory[state.chatHistory.length - 1].content.find(c => c.type === 'text')?.text || ''));
    const hasUrl = /(https?:\/\/[^\s]+)/i.test(lastMsg);
    const useWebSearch = state.prefs.enableWebSearch && hasUrl;
    const responseText = await callClaudeAPI(state.chatHistory, { enableWebSearch: useWebSearch });
    hideLoadingMessage();

    const { text: cleanText, recipe } = extractRecipeFromResponse(responseText);

    state.chatHistory.push({ role: 'assistant', content: responseText });

    if (cleanText) {
      addChatMessage('assistant', cleanText);
    }

    if (recipe) {
      // Auto-calculate seasonality
      recipe.months = calculateSeasonality(recipe.ingredients);
      recipe.id = uid();
      recipe.createdAt = Date.now();
      state.pendingRecipe = recipe;

      // Open validation modal after a brief delay so user sees the message
      setTimeout(() => openValidationModal(recipe), 600);
    }
  } catch (e) {
    hideLoadingMessage();
    console.error(e);
    if (e.message === 'NO_API_KEY') {
      addChatMessage('assistant', "Pas de clé API configurée. Définissez-la dans Paramètres.");
    } else {
      addChatMessage('assistant', '⚠️ ' + e.message);
    }
  }
}

// ============================================
// VALIDATION MODAL
// ============================================

const COMMON_EMOJIS = ['🍝', '🥗', '🍲', '🥘', '🍛', '🍜', '🍱', '🥙', '🌮', '🍕', '🥧', '🧁', '🍰', '🥐', '🍞', '🥞', '🍳', '🥚', '🥪', '🍔', '🌭', '🥟', '🍣', '🍤', '🍙', '🍚', '🥩', '🍗', '🍖', '🐟', '🥒', '🥕', '🌽', '🍆', '🍅', '🥑', '🍓', '🍑', '🍍', '🥭', '🍎', '🍌', '🍇', '🥦', '🥗', '🍯', '🍫', '🍪', '🍩'];

function openValidationModal(recipe) {
  state.pendingRecipe = recipe;
  const modal = document.getElementById('validation-modal');
  const body = document.getElementById('validation-body');
  const title = document.getElementById('validation-modal-title');
  if (title) {
    title.textContent = state.editingRecipeId ? 'Modifier la recette' : 'Valider la recette';
  }
  pushOverlay('validation');

  body.innerHTML = `
    <div class="validation-section">
      <div class="validation-field">
        <label class="validation-label">Titre de la recette</label>
        <input type="text" class="validation-input" id="val-title" value="${escapeHtml(recipe.title)}">
      </div>
      <div class="validation-field">
        <label class="validation-label">Description (optionnel)</label>
        <textarea class="validation-textarea" id="val-description">${escapeHtml(recipe.description || '')}</textarea>
      </div>
      <div class="validation-field">
        <label class="validation-label">Catégorie</label>
        <div class="validation-category-picker" id="val-category-picker">
          ${RECIPE_CATEGORIES.map(c => `
            <button class="validation-category-option ${c.id === (recipe.category || 'plat') ? 'selected' : ''}" data-category="${c.id}">
              <span class="validation-category-emoji">${c.emoji}</span>
              <span class="validation-category-label">${c.label}</span>
            </button>
          `).join('')}
        </div>
      </div>
      <div class="validation-field">
        <label class="validation-label">Emoji</label>
        <div class="validation-emoji-picker" id="val-emoji-picker">
          ${COMMON_EMOJIS.map(e => `
            <button class="validation-emoji-option ${e === recipe.emoji ? 'selected' : ''}" data-emoji="${e}">${e}</button>
          `).join('')}
        </div>
      </div>
      <div class="validation-field">
        <label class="validation-label">Portions de base</label>
        <div class="servings-controls" style="background: var(--bg-gray-50); padding: 4px; border-radius: var(--radius-full); display: inline-flex;">
          <button class="servings-btn" id="val-servings-minus">−</button>
          <span class="servings-value" id="val-servings-value">${recipe.baseServings}</span>
          <button class="servings-btn" id="val-servings-plus">+</button>
        </div>
      </div>
    </div>

    <div class="validation-section">
      <h3 class="validation-section-title">
        <span class="recipe-section-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
            <path d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </span>
        Ingrédients
      </h3>
      <div id="val-ingredients">
        ${recipe.ingredients.map((ing, i) => renderValidationIngredient(ing, i)).join('')}
      </div>
      <button class="validation-add" onclick="addValidationIngredient()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 4.5v15m7.5-7.5h-15" stroke-linecap="round"/></svg>
        Ajouter un ingrédient
      </button>
    </div>

    <div class="validation-section">
      <h3 class="validation-section-title">
        <span class="recipe-section-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
            <path d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </span>
        Étapes
      </h3>
      <div id="val-steps">
        ${recipe.steps.map((s, i) => renderValidationStep(s, i)).join('')}
      </div>
      <button class="validation-add" onclick="addValidationStep()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 4.5v15m7.5-7.5h-15" stroke-linecap="round"/></svg>
        Ajouter une étape
      </button>
    </div>

    <div class="validation-section">
      <h3 class="validation-section-title">Mois de saisonnalité</h3>
      <p style="color: var(--bg-gray-600); font-size: 12px; margin-bottom: 10px;">Calculé automatiquement selon les ingrédients. Modifiable.</p>
      <div class="validation-month-grid" id="val-months">
        ${[1,2,3,4,5,6,7,8,9,10,11,12].map(m => `
          <button class="validation-month ${recipe.months && recipe.months.includes(m) ? 'selected' : ''}" data-month="${m}">${MONTH_NAMES[m]}</button>
        `).join('')}
      </div>
      <p style="color: var(--bg-gray-600); font-size: 11px; margin-top: 8px;">Aucun mois sélectionné = recette toute saison</p>
    </div>
  `;

  // Wire emoji picker
  body.querySelectorAll('#val-emoji-picker .validation-emoji-option').forEach(btn => {
    btn.addEventListener('click', () => {
      body.querySelectorAll('#val-emoji-picker .validation-emoji-option').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
    });
  });

  // Wire category picker
  body.querySelectorAll('#val-category-picker .validation-category-option').forEach(btn => {
    btn.addEventListener('click', () => {
      body.querySelectorAll('#val-category-picker .validation-category-option').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
    });
  });

  // Servings
  document.getElementById('val-servings-minus').addEventListener('click', () => {
    const v = document.getElementById('val-servings-value');
    const n = Math.max(1, Number(v.textContent) - 1);
    v.textContent = n;
  });
  document.getElementById('val-servings-plus').addEventListener('click', () => {
    const v = document.getElementById('val-servings-value');
    const n = Math.min(50, Number(v.textContent) + 1);
    v.textContent = n;
  });

  // Months
  body.querySelectorAll('#val-months .validation-month').forEach(btn => {
    btn.addEventListener('click', () => {
      btn.classList.toggle('selected');
    });
  });

  modal.classList.remove('hidden');
}

function renderValidationIngredient(ing, i) {
  return `
    <div class="validation-ingredient" data-index="${i}">
      <input type="text" class="validation-input" placeholder="Nom" value="${escapeHtml(ing.name)}" data-field="name">
      <input type="number" step="any" class="validation-input validation-amount" placeholder="Qté" value="${ing.amount == null ? '' : ing.amount}" data-field="amount">
      <input type="text" class="validation-input validation-unit" placeholder="Unité" value="${escapeHtml(ing.unit || '')}" data-field="unit">
      <button class="validation-remove" onclick="removeValidationIngredient(${i})" aria-label="Supprimer">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M14.74 9l-.346 9m-4.788 0L9.26 9M5.79 5.79l1.05 13.882a2.25 2.25 0 002.244 2.077h7.832a2.25 2.25 0 002.244-2.077l1.05-13.882M3.75 5.79h16.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
    </div>
  `;
}

function renderValidationStep(step, i) {
  return `
    <div class="validation-step" data-index="${i}">
      <div class="step-number">${i + 1}</div>
      <textarea class="validation-textarea" placeholder="Description de l'étape" data-field="text">${escapeHtml(step.text)}</textarea>
      <button class="validation-remove" onclick="removeValidationStep(${i})" aria-label="Supprimer">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M14.74 9l-.346 9m-4.788 0L9.26 9M5.79 5.79l1.05 13.882a2.25 2.25 0 002.244 2.077h7.832a2.25 2.25 0 002.244-2.077l1.05-13.882M3.75 5.79h16.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
    </div>
  `;
}

function addValidationIngredient() {
  const wrap = document.getElementById('val-ingredients');
  const i = wrap.children.length;
  const div = document.createElement('div');
  div.innerHTML = renderValidationIngredient({ name: '', amount: '', unit: '' }, i);
  wrap.appendChild(div.firstElementChild);
}

function removeValidationIngredient(i) {
  const wrap = document.getElementById('val-ingredients');
  const el = wrap.querySelector(`.validation-ingredient[data-index="${i}"]`);
  if (el) el.remove();
}

function addValidationStep() {
  const wrap = document.getElementById('val-steps');
  const i = wrap.children.length;
  const div = document.createElement('div');
  div.innerHTML = renderValidationStep({ text: '' }, i);
  wrap.appendChild(div.firstElementChild);
  // Re-number steps
  wrap.querySelectorAll('.validation-step').forEach((el, idx) => {
    el.querySelector('.step-number').textContent = idx + 1;
  });
}

function removeValidationStep(i) {
  const wrap = document.getElementById('val-steps');
  const el = wrap.querySelector(`.validation-step[data-index="${i}"]`);
  if (el) el.remove();
  wrap.querySelectorAll('.validation-step').forEach((el, idx) => {
    el.querySelector('.step-number').textContent = idx + 1;
  });
}

window.addValidationIngredient = addValidationIngredient;
window.removeValidationIngredient = removeValidationIngredient;
window.addValidationStep = addValidationStep;
window.removeValidationStep = removeValidationStep;

function saveValidatedRecipe() {
  const title = document.getElementById('val-title').value.trim();
  if (!title) {
    showToast('Le titre est requis', 'error');
    return;
  }

  const description = document.getElementById('val-description').value.trim();
  const baseServings = Number(document.getElementById('val-servings-value').textContent);
  const selectedEmoji = document.querySelector('#val-emoji-picker .validation-emoji-option.selected');
  const emoji = selectedEmoji ? selectedEmoji.dataset.emoji : '🍽️';

  // Collect ingredients
  const ingredients = [];
  document.querySelectorAll('#val-ingredients .validation-ingredient').forEach((el, i) => {
    const name = el.querySelector('[data-field="name"]').value.trim();
    if (!name) return;
    const amountStr = el.querySelector('[data-field="amount"]').value.trim();
    const unit = el.querySelector('[data-field="unit"]').value.trim();
    ingredients.push({
      id: 'ing' + (i + 1),
      name,
      amount: amountStr === '' ? null : Number(amountStr),
      unit
    });
  });

  if (ingredients.length === 0) {
    showToast('Au moins un ingrédient est requis', 'error');
    return;
  }

  // Steps
  const steps = [];
  document.querySelectorAll('#val-steps .validation-step').forEach(el => {
    const text = el.querySelector('[data-field="text"]').value.trim();
    if (!text) return;
    // Auto-detect ingredient mentions (basic)
    const ingredientIds = [];
    for (const ing of ingredients) {
      const lower = ing.name.toLowerCase();
      if (lower.length > 2 && text.toLowerCase().includes(lower)) {
        ingredientIds.push(ing.id);
      }
    }
    steps.push({ text, ingredientIds });
  });

  if (steps.length === 0) {
    showToast('Au moins une étape est requise', 'error');
    return;
  }

  // Months
  const months = [];
  document.querySelectorAll('#val-months .validation-month.selected').forEach(btn => {
    months.push(Number(btn.dataset.month));
  });
  months.sort((a, b) => a - b);

  // Récupérer la catégorie sélectionnée
  const selectedCat = document.querySelector('#val-category-picker .validation-category-option.selected');
  const category = selectedCat ? selectedCat.dataset.category : 'plat';

  const editingId = state.editingRecipeId;
  const existing = editingId ? state.recipes.find(r => r.id === editingId) : null;

  const recipe = {
    id: editingId || state.pendingRecipe?.id || uid(),
    title,
    description,
    emoji,
    category,
    baseServings,
    ingredients,
    steps,
    months,
    createdAt: existing?.createdAt || state.pendingRecipe?.createdAt || Date.now(),
    updatedAt: Date.now()
  };

  if (existing) {
    // Mode édition : remplacer
    state.recipes = state.recipes.map(r => r.id === editingId ? recipe : r);
  } else {
    // Nouvelle recette
    state.recipes.push(recipe);
  }
  saveRecipes();
  closeValidationModal();
  showToast(existing ? 'Recette modifiée ✓' : 'Recette sauvegardée ✓', 'success');

  // Sync push
  if (state.sync.enabled) {
    syncRecipeAfterChange(recipe, false);
  }

  if (existing) {
    // Mode édition : retour direct sur la fiche recette mise à jour
    state.editingRecipeId = null;
    state.currentRecipe = { ...recipe, currentServings: recipe.baseServings };
    navigateTo('recipe', recipe);
  } else {
    // Nouvelle recette : reset chat + retour bibliothèque
    state.chatHistory = [];
    document.getElementById('chat-messages').innerHTML = `
      <div class="chat-welcome">
        <div class="chat-welcome-blob"></div>
        <h2>Recette créée !</h2>
        <p>Vous pouvez la retrouver dans votre bibliothèque, ou créer une nouvelle recette.</p>
        <div class="chat-suggestions">
          <button class="chat-suggestion" onclick="navigateTo('library')">
            <span>📚</span><span>Voir ma bibliothèque</span>
          </button>
        </div>
      </div>
    `;
    navigateTo('library');
  }
}

function closeValidationModal(skipHistory) {
  const modal = document.getElementById('validation-modal');
  if (modal.classList.contains('hidden')) return;
  if (!skipHistory) {
    // Appelé depuis un clic UI : on fait un history.back() qui déclenchera popstate → handleBack → fermeture
    history.back();
    return;
  }
  modal.classList.add('hidden');
  state.pendingRecipe = null;
  state.editingRecipeId = null;
}

// ============================================
// SETTINGS
// ============================================

function showSettings() {
  document.getElementById('settings-api-key').value = state.apiKey || '';
  document.getElementById('settings-sync-url').value = state.sync.url || '';
  document.getElementById('settings-sync-key').value = state.sync.key || '';
  document.getElementById('settings-sync-foyer').value = state.sync.foyer || '';
  // Web search toggle
  const wsCheckbox = document.getElementById('settings-web-search');
  if (wsCheckbox) wsCheckbox.checked = !!state.prefs.enableWebSearch;
  // Theme buttons : marquer celui actif
  document.querySelectorAll('.theme-option').forEach(b => {
    b.classList.toggle('active', b.dataset.theme === state.prefs.theme);
  });
  document.getElementById('settings-modal').classList.remove('hidden');
  pushOverlay('settings');
}

function hideSettings(skipHistory) {
  const modal = document.getElementById('settings-modal');
  if (modal.classList.contains('hidden')) return;
  if (!skipHistory) {
    history.back();
    return;
  }
  modal.classList.add('hidden');
}

function exportData() {
  const data = {
    recipes: state.recipes,
    exportedAt: new Date().toISOString(),
    version: 1
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'mes-recettes-' + new Date().toISOString().slice(0, 10) + '.json';
  a.click();
  URL.revokeObjectURL(url);
  showToast('Export téléchargé', 'success');
}

function importData(file) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      if (!data.recipes || !Array.isArray(data.recipes)) throw new Error('Format invalide');
      // Merge (avoid duplicates by id)
      const existing = new Set(state.recipes.map(r => r.id));
      const toAdd = data.recipes.filter(r => !existing.has(r.id));
      state.recipes = [...state.recipes, ...toAdd];
      saveRecipes();
      showToast(`${toAdd.length} recette${toAdd.length > 1 ? 's' : ''} importée${toAdd.length > 1 ? 's' : ''}`, 'success');
      hideSettings();
      renderLibrary();
    } catch (err) {
      showToast('Fichier invalide', 'error');
    }
  };
  reader.readAsText(file);
}

function clearAllData() {
  if (!confirm('Supprimer TOUTES vos recettes et données ? Cette action est irréversible.')) return;
  if (!confirm('Vraiment ? Cette action ne peut pas être annulée.')) return;
  state.recipes = [];
  state.shopping = [];
  state.shoppingChecked.clear();
  saveRecipes();
  saveShopping();
  hideSettings();
  updateShoppingBadge();
  navigateTo('library');
  showToast('Toutes les données ont été supprimées');
}

async function forceUpdate() {
  if (!confirm('Vider le cache et recharger l\'app ? Vos recettes ne seront PAS supprimées.')) return;
  showToast('Vérification des mises à jour…');
  try {
    // 1. Vider tous les caches
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }
    // 2. Demander au SW de skip waiting + désinscrire
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const r of regs) {
        if (r.waiting) r.waiting.postMessage({ type: 'SKIP_WAITING' });
        await r.unregister();
      }
    }
    showToast('Cache vidé, rechargement…', 'success');
    // 3. Recharger
    setTimeout(() => {
      window.location.reload(true);
    }, 800);
  } catch (e) {
    console.error('Force update error:', e);
    showToast('Erreur, essayez de désinstaller/réinstaller l\'app', 'error');
  }
}
window.forceUpdate = forceUpdate;

// ============================================
// EVENT BINDINGS
// ============================================

function bindEvents() {
  // Bottom nav
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => navigateTo(btn.dataset.view));
  });

  // Library search
  const searchInput = document.getElementById('library-search-input');
  const searchClear = document.getElementById('library-search-clear');
  searchInput.addEventListener('input', e => {
    state.searchQuery = e.target.value;
    searchClear.classList.toggle('hidden', !state.searchQuery);
    renderLibrary();
  });
  searchClear.addEventListener('click', () => {
    searchInput.value = '';
    state.searchQuery = '';
    searchClear.classList.add('hidden');
    renderLibrary();
  });

  // Filter chips (category + month, dans le drawer ou en haut)
  document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const type = chip.dataset.filterType;
      document.querySelectorAll(`.filter-chip[data-filter-type="${type}"]`).forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      if (type === 'month') state.monthFilter = chip.dataset.filterValue;
      else if (type === 'category') state.categoryFilter = chip.dataset.filterValue;
      updateFiltersUI();
      renderLibrary();
    });
  });

  // Toolbar : Favoris (toujours visible)
  document.getElementById('filter-fav').addEventListener('click', () => {
    state.favoritesOnly = !state.favoritesOnly;
    document.getElementById('filter-fav').classList.toggle('active', state.favoritesOnly);
    updateFiltersUI();
    renderLibrary();
  });

  // Tri (toujours visible)
  document.getElementById('filter-sort').addEventListener('change', e => {
    state.prefs.sortMode = e.target.value;
    savePrefs();
    renderLibrary();
  });

  // Cuisson (dans le drawer maintenant)
  const cookedSelect = document.getElementById('filter-cooked');
  if (cookedSelect) {
    cookedSelect.addEventListener('change', e => {
      state.cookedFilter = e.target.value;
      updateFiltersUI();
      renderLibrary();
    });
  }

  // Filtre par ingrédients (dans le drawer)
  const addIngBtn = document.getElementById('add-ingredient-filter');
  if (addIngBtn) {
    addIngBtn.addEventListener('click', () => {
      const name = prompt('Nom de l\'ingrédient à filtrer (ex: courgette) :');
      if (!name || !name.trim()) return;
      state.ingredientsFilter.push(name.trim());
      renderIngredientsFilter();
      updateFiltersUI();
      renderLibrary();
    });
  }

  // Drawer : ouverture / fermeture (avec gestion de l'historique pour le retour OS)
  const drawer = document.getElementById('filters-drawer');
  document.getElementById('open-filters-btn').addEventListener('click', () => {
    drawer.classList.remove('hidden');
    requestAnimationFrame(() => drawer.classList.add('open'));
    pushOverlay('filters-drawer');
  });
  // Fermer = utiliser history.back() pour synchroniser l'historique avec le bouton retour
  const closeDrawer = () => {
    if (!drawer.classList.contains('hidden')) {
      history.back();
    }
  };
  document.getElementById('filters-drawer-close').addEventListener('click', closeDrawer);
  document.querySelector('.filters-drawer-backdrop').addEventListener('click', closeDrawer);
  document.getElementById('filters-apply').addEventListener('click', closeDrawer);
  document.getElementById('filters-reset').addEventListener('click', () => {
    state.categoryFilter = 'all';
    state.monthFilter = 'all';
    state.ingredientsFilter = [];
    state.cookedFilter = '';
    // Reset chips
    document.querySelectorAll('.filter-chip').forEach(c => {
      const type = c.dataset.filterType;
      const isAllChip = c.dataset.filterValue === 'all';
      c.classList.toggle('active', isAllChip);
    });
    if (cookedSelect) cookedSelect.value = '';
    renderIngredientsFilter();
    updateFiltersUI();
    renderLibrary();
  });

  // Header scroll detection
  const mainContent = document.getElementById('main-content');
  mainContent.addEventListener('scroll', () => {
    document.querySelector('.app-header').classList.toggle('scrolled', mainContent.scrollTop > 8);
  });

  // Chat suggestions (IA)
  document.querySelectorAll('.chat-suggestion').forEach(btn => {
    btn.addEventListener('click', () => {
      // Bouton manuel : on ouvre la modal directement, pas de focus chat
      if (btn.id === 'manual-create-btn') {
        createManualRecipe();
        return;
      }
      const suggest = btn.dataset.suggest;
      if (suggest && suggest.includes('photos')) {
        document.getElementById('chat-file-input').click();
      } else {
        document.getElementById('chat-input').focus();
      }
    });
  });

  // Chat input
  const chatInput = document.getElementById('chat-input');
  const chatSend = document.getElementById('chat-send-btn');
  chatInput.addEventListener('input', () => {
    chatInput.style.height = 'auto';
    chatInput.style.height = Math.min(120, chatInput.scrollHeight) + 'px';
    chatSend.disabled = !chatInput.value.trim() && state.chatAttachments.length === 0;
  });
  chatInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey && window.innerWidth > 600) {
      e.preventDefault();
      sendChat();
    }
  });
  chatSend.addEventListener('click', sendChat);

  // Mic button
  const micBtn = document.getElementById('chat-mic-btn');
  if (micBtn) {
    micBtn.addEventListener('click', () => startVoiceInput('chat-input'));
  }

  // Menu IA button
  const menuBtn = document.getElementById('generate-menu-btn');
  if (menuBtn) {
    menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const occasion = prompt('Pour quelle occasion ? (ex: "menu végétarien rapide", "dîner d\'été pour 6", "soirée raclette")', 'Menu équilibré pour ce soir');
      if (occasion) generateMenu(occasion);
    });
  }

  // Chat attach
  document.getElementById('chat-attach-btn').addEventListener('click', () => {
    document.getElementById('chat-file-input').click();
  });
  document.getElementById('chat-file-input').addEventListener('change', async e => {
    const files = Array.from(e.target.files || []);
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue;
      if (state.chatAttachments.length >= 5) {
        showToast('Maximum 5 images par message', 'error');
        break;
      }
      // Resize image if huge to keep payload reasonable
      try {
        const att = await processImage(file);
        state.chatAttachments.push(att);
      } catch (err) {
        console.error(err);
        showToast('Erreur sur ' + file.name, 'error');
      }
    }
    e.target.value = '';
    renderAttachments();
    chatSend.disabled = !chatInput.value.trim() && state.chatAttachments.length === 0;
  });

  // Settings
  document.getElementById('settings-btn').addEventListener('click', showSettings);
  document.getElementById('settings-close').addEventListener('click', hideSettings);
  document.querySelector('#settings-modal .modal-backdrop').addEventListener('click', hideSettings);
  document.getElementById('settings-save-key').addEventListener('click', () => {
    const k = document.getElementById('settings-api-key').value.trim();
    saveApiKey(k);
    showToast(k ? 'Clé API enregistrée' : 'Clé API supprimée', 'success');
    hideSettings();
  });

  // Theme buttons
  document.querySelectorAll('.theme-option').forEach(btn => {
    btn.addEventListener('click', () => {
      setTheme(btn.dataset.theme);
      document.querySelectorAll('.theme-option').forEach(b => b.classList.toggle('active', b.dataset.theme === btn.dataset.theme));
      showToast('Thème : ' + (btn.dataset.theme === 'auto' ? 'auto' : btn.dataset.theme === 'dark' ? 'sombre' : 'clair'));
    });
  });

  // Web Search toggle
  const wsCheckbox = document.getElementById('settings-web-search');
  if (wsCheckbox) {
    wsCheckbox.addEventListener('change', () => {
      state.prefs.enableWebSearch = wsCheckbox.checked;
      savePrefs();
    });
  }

  // Sync
  document.getElementById('settings-save-sync').addEventListener('click', async () => {
    let url = document.getElementById('settings-sync-url').value.trim();
    const key = document.getElementById('settings-sync-key').value.trim();
    const foyer = document.getElementById('settings-sync-foyer').value.trim();

    if (!url || !key || !foyer) {
      showToast('Tous les champs sync sont requis', 'error');
      return;
    }
    // Nettoyer l'URL : retirer trailing slashes, /rest/v1, /rest, etc.
    url = url.replace(/\/+$/, ''); // trailing slash
    url = url.replace(/\/rest\/v1$/, ''); // /rest/v1
    url = url.replace(/\/rest$/, ''); // /rest
    url = url.replace(/\/+$/, ''); // au cas où il en reste

    if (!/^https:\/\/[a-z0-9-]+\.supabase\.(co|com)$/i.test(url)) {
      showToast('URL Supabase invalide (attendu: https://xxxxx.supabase.co)', 'error');
      return;
    }
    if (foyer.length < 4) {
      showToast('Code foyer trop court (min 4 caractères)', 'error');
      return;
    }

    saveSyncConfig({ url, key, foyer });
    hideSettings();
    showToast('Sync activée — synchronisation en cours…', 'success');
    updateSyncIndicator();
    await performSync(false);
  });

  document.getElementById('settings-sync-now').addEventListener('click', async () => {
    if (!state.sync.enabled) {
      showToast('Configurez d\'abord la sync', 'error');
      return;
    }
    hideSettings();
    await performSync(false);
  });

  document.getElementById('settings-sync-disable').addEventListener('click', () => {
    if (!confirm('Désactiver la synchronisation ? Vos recettes locales restent intactes.')) return;
    saveSyncConfig({ url: '', key: '', foyer: '' });
    state.sync.status = 'idle';
    updateSyncIndicator();
    hideSettings();
    showToast('Synchronisation désactivée');
  });
  document.getElementById('settings-export').addEventListener('click', exportData);
  document.getElementById('settings-import').addEventListener('click', () => {
    document.getElementById('settings-import-input').click();
  });
  document.getElementById('settings-import-input').addEventListener('change', e => {
    const file = e.target.files[0];
    if (file) importData(file);
    e.target.value = '';
  });
  document.getElementById('settings-clear').addEventListener('click', clearAllData);

  const forceUpdateBtn = document.getElementById('settings-force-update');
  if (forceUpdateBtn) {
    forceUpdateBtn.addEventListener('click', forceUpdate);
  }

  // Validation modal
  document.getElementById('validation-close').addEventListener('click', closeValidationModal);
  document.getElementById('validation-save').addEventListener('click', saveValidatedRecipe);

  // Shopping
  document.getElementById('shopping-copy-btn').addEventListener('click', copyShoppingList);
  document.getElementById('shopping-clear-btn').addEventListener('click', clearShopping);

  // Initial API setup
  document.getElementById('api-key-save').addEventListener('click', () => {
    const k = document.getElementById('api-key-input').value.trim();
    if (!k) {
      showToast('Saisissez votre clé API', 'error');
      return;
    }
    saveApiKey(k);
    localStorage.setItem(STORAGE_KEYS.onboarded, '1');
    document.getElementById('api-setup').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
  });
  document.getElementById('api-key-skip').addEventListener('click', () => {
    localStorage.setItem(STORAGE_KEYS.onboarded, '1');
    document.getElementById('api-setup').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
  });
}

// Resize image to keep API payloads reasonable
async function processImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const MAX = 1280;
        let { width, height } = img;
        if (width > MAX || height > MAX) {
          if (width > height) {
            height = Math.round(height * MAX / width);
            width = MAX;
          } else {
            width = Math.round(width * MAX / height);
            height = MAX;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        const base64 = dataUrl.split(',')[1];
        resolve({ media_type: 'image/jpeg', data: base64 });
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ============================================
// INIT
// ============================================

function init() {
  loadState();
  applyTheme(); // doit être appelé tôt pour éviter le flash
  initHistory(); // initialise l'historique pour le bouton retour
  bindEvents();

  // Splash
  setTimeout(() => {
    document.getElementById('splash').style.opacity = '0';
    setTimeout(() => {
      document.getElementById('splash').classList.add('hidden');

      const onboarded = localStorage.getItem(STORAGE_KEYS.onboarded);
      if (!onboarded) {
        document.getElementById('api-setup').classList.remove('hidden');
      } else {
        document.getElementById('app').classList.remove('hidden');
        // Lancer la sync automatique au démarrage si configurée
        if (state.sync.enabled) {
          updateSyncIndicator();
          setTimeout(() => performSync(true), 600);
        }
        // Backup mensuel automatique (avec un délai pour ne pas spammer)
        setTimeout(() => checkAndDoBackup(), 3000);
      }
    }, 400);
  }, 1200);

  // First render
  renderLibrary();
  renderIngredientsFilter();
  updateFiltersUI();
  updateShoppingBadge();
}

document.addEventListener('DOMContentLoaded', init);
