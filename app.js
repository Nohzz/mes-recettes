// ============================================
// MES RECETTES — App JS
// ============================================

const STORAGE_KEYS = {
  recipes: 'mr_recipes',
  apiKey: 'mr_api_key',
  shopping: 'mr_shopping',
  onboarded: 'mr_onboarded',
  syncUrl: 'mr_sync_url',
  syncKey: 'mr_sync_key',
  syncFoyer: 'mr_sync_foyer',
  syncEnabled: 'mr_sync_enabled',
  lastSync: 'mr_last_sync'
};

const state = {
  recipes: [],
  shopping: [], // [{recipeId, servings}]
  shoppingChecked: new Set(),
  apiKey: '',
  currentView: 'library',
  currentRecipe: null,
  searchQuery: '',
  monthFilter: 'all',
  chatHistory: [],
  chatAttachments: [], // base64 images
  pendingRecipe: null,
  // Sync
  sync: {
    url: '',
    key: '',
    foyer: '',
    enabled: false,
    status: 'idle', // idle | syncing | synced | error | offline
    lastSync: 0
  }
};

// ============================================
// STORAGE
// ============================================

function loadState() {
  try {
    const recipes = localStorage.getItem(STORAGE_KEYS.recipes);
    state.recipes = recipes ? JSON.parse(recipes) : [];
    const shopping = localStorage.getItem(STORAGE_KEYS.shopping);
    state.shopping = shopping ? JSON.parse(shopping) : [];
    state.apiKey = localStorage.getItem(STORAGE_KEYS.apiKey) || '';
    // Sync config
    state.sync.url = localStorage.getItem(STORAGE_KEYS.syncUrl) || '';
    state.sync.key = localStorage.getItem(STORAGE_KEYS.syncKey) || '';
    state.sync.foyer = localStorage.getItem(STORAGE_KEYS.syncFoyer) || '';
    state.sync.enabled = localStorage.getItem(STORAGE_KEYS.syncEnabled) === '1';
    state.sync.lastSync = Number(localStorage.getItem(STORAGE_KEYS.lastSync)) || 0;
  } catch (e) {
    console.error('Load state error:', e);
  }
}

function saveRecipes() {
  localStorage.setItem(STORAGE_KEYS.recipes, JSON.stringify(state.recipes));
}

function saveShopping() {
  localStorage.setItem(STORAGE_KEYS.shopping, JSON.stringify(state.shopping));
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

function navigateTo(view, data) {
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
    recipe: '' // Pas de titre dans header, il est déjà dans le hero
  };
  const pageTitle = document.getElementById('page-title');
  pageTitle.textContent = titles[view] || '';
  // Masquer le header pour la vue recette (le hero fait office de header)
  const header = document.querySelector('.app-header');
  header.style.display = view === 'recipe' ? 'none' : '';

  // Scroll to top
  document.getElementById('main-content').scrollTo({ top: 0, behavior: 'instant' });

  if (view === 'library') renderLibrary();
  if (view === 'shopping') renderShopping();
  if (view === 'recipe' && data) renderRecipeDetail(data);
}

window.navigateTo = navigateTo;

// ============================================
// LIBRARY
// ============================================

function getFilteredRecipes() {
  let recipes = [...state.recipes].sort((a, b) => b.createdAt - a.createdAt);

  if (state.searchQuery) {
    const q = state.searchQuery.toLowerCase().trim();
    recipes = recipes.filter(r => {
      if (r.title.toLowerCase().includes(q)) return true;
      if (r.ingredients.some(ing => ing.name.toLowerCase().includes(q))) return true;
      return false;
    });
  }

  if (state.monthFilter !== 'all') {
    const month = state.monthFilter === 'current' ? getCurrentMonth() : Number(state.monthFilter);
    recipes = recipes.filter(r => {
      if (!r.months || r.months.length === 0) return true; // toute saison
      return r.months.includes(month);
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

  grid.innerHTML = filtered.map((r, i) => {
    const bgClass = 'bg-' + ((Math.abs(hashCode(r.id)) % 6) + 1);
    const monthTags = (r.months || []).slice(0, 3).map(m => {
      const isCurrent = m === currentMonth;
      return `<span class="month-tag ${isCurrent ? 'current' : ''}">${MONTH_NAMES[m]}</span>`;
    }).join('');
    const moreCount = (r.months || []).length > 3 ? `<span class="month-tag">+${r.months.length - 3}</span>` : '';
    const allSeason = !r.months || r.months.length === 0 ? '<span class="month-tag">Toute saison</span>' : '';

    return `
      <div class="recipe-card" data-recipe-id="${r.id}" onclick="openRecipe('${r.id}')">
        <div class="recipe-card-visual ${bgClass}">
          <div class="recipe-card-blob" style="background: rgba(255,255,255,0.5); top: -10px; left: -10px;"></div>
          <span class="recipe-card-emoji">${r.emoji || '🍽️'}</span>
        </div>
        <div class="recipe-card-content">
          <div>
            <div class="recipe-card-title">${escapeHtml(r.title)}</div>
            <div class="recipe-card-meta">${r.ingredients.length} ingrédient${r.ingredients.length > 1 ? 's' : ''} · ${r.steps.length} étape${r.steps.length > 1 ? 's' : ''}</div>
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
  }).join('');
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

  document.getElementById('recipe-detail-content').innerHTML = `
    <div class="recipe-detail">
      <div class="recipe-detail-hero" style="background: ${heroBg}">
        <div class="recipe-detail-hero-blob" style="background: rgba(255,255,255,0.4); width: 140px; height: 140px; top: -20px; right: -20px;"></div>
        <div class="recipe-detail-hero-blob" style="background: rgba(255,255,255,0.3); width: 100px; height: 100px; bottom: -20px; left: 20%;"></div>
        <button class="recipe-detail-back" onclick="navigateTo('library')" aria-label="Retour">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M15 19l-7-7 7-7" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
        <div class="recipe-detail-actions">
          <button class="icon-btn" onclick="confirmDeleteRecipe('${r.id}')" aria-label="Supprimer">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </div>
        <span class="recipe-detail-hero-emoji">${r.emoji || '🍽️'}</span>
      </div>
      <div class="recipe-detail-body">
        <h1 class="recipe-detail-title">${escapeHtml(r.title)}</h1>
        ${r.description ? `<p style="color: var(--bg-gray-600); font-size: 14px; margin-bottom: 12px;">${escapeHtml(r.description)}</p>` : ''}
        <div class="recipe-detail-tags">
          ${months.length === 0 ? '<span class="month-tag">Toute saison</span>' :
            months.map(m => `<span class="month-tag ${m === currentMonth ? 'current' : ''}">${MONTH_NAMES[m]}</span>`).join('')}
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
  const aggregated = {}; // key = name+unit, value = {name, unit, amount, recipes: []}

  for (const item of state.shopping) {
    const recipe = state.recipes.find(r => r.id === item.recipeId);
    if (!recipe) continue;
    const ratio = item.servings / recipe.baseServings;

    for (const ing of recipe.ingredients) {
      const key = (ing.name.toLowerCase().trim() + '|' + (ing.unit || '').toLowerCase().trim());
      if (!aggregated[key]) {
        aggregated[key] = {
          name: ing.name,
          unit: ing.unit || '',
          amount: 0,
          hasAmount: ing.amount != null && ing.amount !== '',
          category: categorizeIngredient(ing.name)
        };
      }
      if (ing.amount != null && ing.amount !== '' && !isNaN(Number(ing.amount))) {
        aggregated[key].amount += Number(ing.amount) * ratio;
      } else {
        aggregated[key].hasAmount = aggregated[key].hasAmount || false;
      }
    }
  }

  return Object.values(aggregated);
}

function renderShopping() {
  const empty = document.getElementById('shopping-empty');
  const content = document.getElementById('shopping-content');

  if (state.shopping.length === 0) {
    empty.classList.remove('hidden');
    content.classList.add('hidden');
    return;
  }

  empty.classList.add('hidden');
  content.classList.remove('hidden');

  // Recipes
  const recipesEl = document.getElementById('shopping-recipes');
  recipesEl.innerHTML = state.shopping.map(item => {
    const r = state.recipes.find(x => x.id === item.recipeId);
    if (!r) return '';
    return `
      <div class="shopping-recipe-row">
        <div class="shopping-recipe-emoji">${r.emoji || '🍽️'}</div>
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

  // Aggregated list grouped by category
  const items = aggregateShoppingItems();
  const grouped = {};
  for (const cat of PRODUCT_CATEGORIES) {
    grouped[cat.id] = [];
  }
  for (const item of items) {
    grouped[item.category].push(item);
  }

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
      html += `
        <div class="shopping-item ${isChecked ? 'done' : ''}" onclick="toggleShoppingItem('${escapeHtml(itemKey).replace(/'/g, "\\'")}')">
          <div class="shopping-item-check ${isChecked ? 'checked' : ''}"></div>
          <div class="shopping-item-name">${escapeHtml(item.name)}</div>
          ${amountStr ? `<div class="shopping-item-amount">${amountStr}</div>` : ''}
        </div>
      `;
    }
    html += '</div>';
  }

  document.getElementById('shopping-list').innerHTML = html;
  document.getElementById('shopping-count').textContent = totalCount + ' article' + (totalCount > 1 ? 's' : '');
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
- Si on te donne un lien, tu ne peux pas le visiter directement. Demande à l'utilisateur de copier le contenu (description, transcription, ingrédients listés). NE JAMAIS INVENTER une recette à partir d'un lien sans contenu.
- Si tu as des images, analyse-les pour identifier les ingrédients, étapes, et le titre.
- Si la description est claire, génère la recette directement.

Format de sortie: ENTOURE TON JSON DE BALISES <recipe>...</recipe>

Schéma JSON:
{
  "title": "Titre court et descriptif",
  "description": "Une phrase qui décrit la recette (optionnel)",
  "emoji": "🍝",
  "baseServings": 4,
  "ingredients": [
    { "id": "ing1", "name": "Nom de l'ingrédient", "amount": 200, "unit": "g" }
  ],
  "steps": [
    { "text": "Description de l'étape", "ingredientIds": ["ing1"] }
  ]
}

Règles:
- "amount" est un nombre (ou null si non spécifié, ex: "sel"). Pas de chaînes.
- "unit" est "g", "kg", "ml", "cl", "l", "cuillère à soupe", "cuillère à café", "pièce(s)", "gousse(s)", "pincée", etc. Vide ou absent si juste une mention.
- "baseServings" est le nombre de portions. Par défaut 4 si non précisé.
- "ingredientIds" lie chaque étape à ses ingrédients (avec leurs IDs). Lier autant que possible.
- "emoji" un seul emoji représentatif.
- Avant le JSON, écris UNE phrase courte (max 20 mots) pour confirmer ce que tu as trouvé.
- Ne mets RIEN après le JSON.

Si l'utilisateur veut modifier une recette précédente, propose une version mise à jour avec un nouveau bloc <recipe>.

Si tu ne peux pas extraire de recette (lien sans contenu, message ambigu), demande des précisions SANS générer de JSON.`;

async function callClaudeAPI(messages) {
  if (!state.apiKey) {
    throw new Error('NO_API_KEY');
  }

  // Build the conversation
  const apiMessages = messages.map(m => {
    if (typeof m.content === 'string') {
      return { role: m.role, content: m.content };
    }
    return m;
  });

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': state.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      messages: apiMessages
    })
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
    // Validate minimum
    if (!recipe.title || !Array.isArray(recipe.ingredients) || !Array.isArray(recipe.steps)) {
      return { text: text.replace(/<recipe>[\s\S]*?<\/recipe>/, '').trim(), recipe: null };
    }
    // Ensure IDs
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
    const responseText = await callClaudeAPI(state.chatHistory);
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

  const recipe = {
    id: state.pendingRecipe?.id || uid(),
    title,
    description,
    emoji,
    baseServings,
    ingredients,
    steps,
    months,
    createdAt: state.pendingRecipe?.createdAt || Date.now(),
    updatedAt: Date.now()
  };

  state.recipes.push(recipe);
  saveRecipes();
  closeValidationModal();
  showToast('Recette sauvegardée ✓', 'success');

  // Sync push
  if (state.sync.enabled) {
    syncRecipeAfterChange(recipe, false);
  }

  // Reset chat
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

function closeValidationModal() {
  document.getElementById('validation-modal').classList.add('hidden');
  state.pendingRecipe = null;
}

// ============================================
// SETTINGS
// ============================================

function showSettings() {
  document.getElementById('settings-api-key').value = state.apiKey || '';
  document.getElementById('settings-sync-url').value = state.sync.url || '';
  document.getElementById('settings-sync-key').value = state.sync.key || '';
  document.getElementById('settings-sync-foyer').value = state.sync.foyer || '';
  document.getElementById('settings-modal').classList.remove('hidden');
}

function hideSettings() {
  document.getElementById('settings-modal').classList.add('hidden');
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

  // Filter chips
  document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      state.monthFilter = chip.dataset.filterValue;
      renderLibrary();
    });
  });

  // Header scroll detection
  const mainContent = document.getElementById('main-content');
  mainContent.addEventListener('scroll', () => {
    document.querySelector('.app-header').classList.toggle('scrolled', mainContent.scrollTop > 8);
  });

  // Chat suggestions
  document.querySelectorAll('.chat-suggestion').forEach(btn => {
    btn.addEventListener('click', () => {
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
          // Petit délai pour laisser l'UI s'afficher
          setTimeout(() => performSync(true), 600);
        }
      }
    }, 400);
  }, 1200);

  // First render
  renderLibrary();
  updateShoppingBadge();
}

document.addEventListener('DOMContentLoaded', init);
