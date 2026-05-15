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
  servingsPresets: 'mr_servings_presets',
  planning: 'mr_planning'
};

const state = {
  recipes: [],
  shopping: [], // legacy
  shoppingLists: [], // [{id, name, items: [{recipeId, servings}], createdAt}]
  activeShoppingListId: '',
  shoppingChecked: new Set(),
  pantry: [], // [{name, until: timestamp}]
  // Planning : { 'YYYY-MM-DD-midi': {recipeId, servings}, 'YYYY-MM-DD-soir': {...} }
  planning: {},
  pendingRecipesQueue: [], // file d'attente quand l'IA renvoie plusieurs recettes
  apiKey: '',
  currentView: 'library',
  currentRecipe: null,
  searchQuery: '',
  monthFilter: 'all',
  categoryFilter: 'all',
  ingredientsFilter: [], // recherche par ingrédients
  favoritesOnly: false,
  cookedFilter: '', // '' | 'never' | 'recent' | 'old'
  dietFilter: [], // tags régime à filtrer (intersection)
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

    // Planning
    const planning = localStorage.getItem(STORAGE_KEYS.planning);
    state.planning = planning ? JSON.parse(planning) : {};
    // Migration douce : ancienne version sans updatedAt → ajouter
    for (const key of Object.keys(state.planning)) {
      const entry = state.planning[key];
      if (entry && typeof entry === 'object' && entry.updatedAt === undefined) {
        entry.updatedAt = now;
        entry.deletedAt = entry.deletedAt || null;
      }
    }
    // Nettoyer les entrées trop anciennes (> 30 jours dans le passé)
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 30);
    const cutoffStr = formatPlanningDate(cutoffDate);
    for (const key of Object.keys(state.planning)) {
      const dateStr = key.split('-').slice(0, 3).join('-');
      if (dateStr < cutoffStr) delete state.planning[key];
    }

    // Préférence d'affichage du planning (week / 2weeks)
    const savedView = localStorage.getItem('mr_planning_view');
    if (savedView === 'week' || savedView === '2weeks') {
      _planningView = savedView;
    }

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
      dietTags: [], // tags régime prédéfinis
      prepTime: null, // minutes
      cookTime: null, // minutes
      changeLog: [], // [{at, by, action}]
      source: null, // { type: 'book'|'web'|'instagram', title?, page?, url?, account? }
      ...r
    }));

    // Migration FODMAP : si une recette avait l'ancien tag 'fodmap' OU n'a aucun tag FODMAP,
    // on recalcule automatiquement low-fodmap/high-fodmap depuis les ingrédients.
    if (typeof calculateFodmapTags === 'function') {
      state.recipes = state.recipes.map(r => {
        const dietTags = (r.dietTags || []).filter(t => t !== 'fodmap');
        const hasFodmap = dietTags.some(t => t === 'low-fodmap' || t === 'high-fodmap');
        if (!hasFodmap) {
          const autoTags = calculateFodmapTags(r.ingredients || []);
          return { ...r, dietTags: dietTags.concat(autoTags) };
        }
        return { ...r, dietTags };
      });
    }

    // Migration SAISONNALITÉ : recalcul depuis le calendrier officiel Greenpeace
    // Tag « seasonalityMigrated » pour ne le faire qu'une fois.
    if (typeof calculateSeasonality === 'function') {
      const SEASONALITY_VERSION = 'greenpeace-2026';
      const migrated = localStorage.getItem('mr_seasonality_version');
      if (migrated !== SEASONALITY_VERSION) {
        state.recipes = state.recipes.map(r => {
          const newMonths = calculateSeasonality(r.ingredients || []);
          return { ...r, months: newMonths };
        });
        localStorage.setItem('mr_seasonality_version', SEASONALITY_VERSION);
        // On sauve immédiatement les nouvelles valeurs
        try { localStorage.setItem(STORAGE_KEYS.recipes, JSON.stringify(state.recipes)); } catch {}
      }
    }

    // Migration INGREDIENT_IDS : refait le matching textuel pour combler les oublis de l'IA
    // (ex: étape "Monter les blancs en neige" qui ne référence pas l'ingrédient "Blancs d'œufs")
    if (typeof enrichStepIngredientIds === 'function') {
      const STEPS_VERSION = 'enrich-v2';
      const stepsMigrated = localStorage.getItem('mr_steps_enrich_version');
      if (stepsMigrated !== STEPS_VERSION) {
        state.recipes = state.recipes.map(r => {
          if (!r.steps || !r.ingredients) return r;
          return { ...r, steps: enrichStepIngredientIds(r.steps, r.ingredients) };
        });
        localStorage.setItem('mr_steps_enrich_version', STEPS_VERSION);
        try { localStorage.setItem(STORAGE_KEYS.recipes, JSON.stringify(state.recipes)); } catch {}
      }
    }
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

function savePlanning() {
  localStorage.setItem(STORAGE_KEYS.planning, JSON.stringify(state.planning));
  // Note : la sync Supabase du planning se fait via syncPlanningEntry() pour les
  // modifs immédiates, et via performSync() pour la fusion complète au démarrage.
}

// Format YYYY-MM-DD pour les clés du planning
function formatPlanningDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
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
const SYNC_PLANNING_TABLE = 'planning';

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

// ===== Sync du PLANNING =====

// Récupère toutes les entrées de planning du foyer
async function syncPlanningPull() {
  const path = `${SYNC_PLANNING_TABLE}?foyer=eq.${encodeURIComponent(state.sync.foyer)}&select=*`;
  return await supabaseRequest('GET', path);
}

// Push une entrée de planning (insert ou update via merge)
// debounced pour éviter de spammer en cas de modifs rapides
const _pendingPlanningSync = new Map();
let _planningSyncTimer = null;

function syncPlanningEntry(key) {
  if (!state.sync.enabled || !navigator.onLine) return;
  _pendingPlanningSync.set(key, state.planning[key]);

  // Debounce : on attend 800ms avant d'envoyer pour grouper les modifs rapides
  if (_planningSyncTimer) clearTimeout(_planningSyncTimer);
  _planningSyncTimer = setTimeout(flushPlanningSync, 800);
}

async function flushPlanningSync() {
  if (_pendingPlanningSync.size === 0) return;
  if (!state.sync.enabled || !navigator.onLine) {
    _pendingPlanningSync.clear();
    return;
  }

  const rows = [];
  for (const [key, entry] of _pendingPlanningSync.entries()) {
    if (!entry) continue;
    rows.push({
      slot_key: key,
      foyer: state.sync.foyer,
      recipe_id: entry.recipeId || null,
      servings: entry.servings || null,
      updated_at: new Date(entry.updatedAt || Date.now()).toISOString(),
      deleted_at: entry.deletedAt ? new Date(entry.deletedAt).toISOString() : null
    });
  }
  _pendingPlanningSync.clear();

  if (rows.length === 0) return;

  try {
    await supabaseRequest('POST', SYNC_PLANNING_TABLE, rows, {
      'Prefer': 'resolution=merge-duplicates,return=minimal'
    });
  } catch (e) {
    console.warn('Sync planning push échouée:', e);
    // En cas d'échec, on remet les entrées en pending pour réessayer plus tard
    for (const row of rows) {
      const entry = state.planning[row.slot_key];
      if (entry) _pendingPlanningSync.set(row.slot_key, entry);
    }
  }
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

    // ===== Sync du PLANNING (fusion par cellule, last-modified-wins) =====
    let planningChangedFromRemote = false;
    try {
      const remotePlanning = await syncPlanningPull() || [];

      // Map des entrées remote par clé
      const remoteByKey = {};
      for (const row of remotePlanning) {
        remoteByKey[row.slot_key] = row;
      }

      // 1) Pour chaque entrée remote, comparer à locale et garder la plus récente
      for (const key in remoteByKey) {
        const row = remoteByKey[key];
        const remoteUpdated = new Date(row.updated_at).getTime();
        const local = state.planning[key];
        const localUpdated = local && local.updatedAt ? local.updatedAt : 0;

        if (remoteUpdated > localUpdated) {
          // Remote plus récent : adopter
          state.planning[key] = {
            recipeId: row.recipe_id,
            servings: row.servings,
            updatedAt: remoteUpdated,
            deletedAt: row.deleted_at ? new Date(row.deleted_at).getTime() : null
          };
          planningChangedFromRemote = true;
        }
      }

      // 2) Entrées locales qui n'existent pas en remote → push
      const planningToPush = [];
      for (const key in state.planning) {
        if (!remoteByKey[key]) {
          const entry = state.planning[key];
          if (entry && entry.updatedAt) {
            planningToPush.push({
              slot_key: key,
              foyer: state.sync.foyer,
              recipe_id: entry.recipeId || null,
              servings: entry.servings || null,
              updated_at: new Date(entry.updatedAt).toISOString(),
              deleted_at: entry.deletedAt ? new Date(entry.deletedAt).toISOString() : null
            });
          }
        }
      }

      if (planningToPush.length > 0) {
        await supabaseRequest('POST', SYNC_PLANNING_TABLE, planningToPush, {
          'Prefer': 'resolution=merge-duplicates,return=minimal'
        });
      }

      savePlanning();
    } catch (planErr) {
      console.warn('Sync planning erreur (non bloquant):', planErr);
      // Si la table planning n'existe pas encore côté Supabase, on continue sans bloquer la sync des recettes
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
    if (state.currentView === 'planning' || planningChangedFromRemote) renderPlanning();
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

// ============================================
// DIALOGS personnalisés (remplacent alert/confirm/prompt natifs)
// ============================================
// Promesse résolue par "OK" ou null pour "Annuler" (prompt) / true/false (confirm) / undefined (alert)

function _ensureDialogModal() {
  let modal = document.getElementById('ui-dialog-modal');
  if (modal) return modal;
  modal = document.createElement('div');
  modal.id = 'ui-dialog-modal';
  modal.className = 'modal ui-dialog hidden';
  modal.innerHTML = `
    <div class="modal-backdrop ui-dialog-backdrop"></div>
    <div class="modal-content ui-dialog-content"></div>
  `;
  document.body.appendChild(modal);
  return modal;
}

function _showDialog({ type, message, title, defaultValue, confirmLabel, cancelLabel, danger }) {
  return new Promise(resolve => {
    const modal = _ensureDialogModal();
    const content = modal.querySelector('.ui-dialog-content');

    const titleHtml = title ? `<h2 class="ui-dialog-title">${escapeHtml(title)}</h2>` : '';
    const messageHtml = `<p class="ui-dialog-message">${escapeHtml(message).replace(/\n/g, '<br>')}</p>`;

    let inputHtml = '';
    if (type === 'prompt') {
      const safeDefault = escapeHtml(defaultValue || '');
      inputHtml = `<input type="text" id="ui-dialog-input" class="ui-dialog-input" value="${safeDefault}">`;
    }

    const cancelBtn = (type !== 'alert')
      ? `<button class="btn-secondary" id="ui-dialog-cancel">${escapeHtml(cancelLabel || 'Annuler')}</button>`
      : '';
    const confirmClass = danger ? 'btn-danger' : 'btn-primary';
    const confirmText = escapeHtml(confirmLabel || (type === 'alert' ? 'OK' : 'Valider'));

    content.innerHTML = `
      <div class="ui-dialog-body">
        ${titleHtml}
        ${messageHtml}
        ${inputHtml}
      </div>
      <div class="ui-dialog-actions">
        ${cancelBtn}
        <button class="${confirmClass}" id="ui-dialog-confirm">${confirmText}</button>
      </div>
    `;

    modal.classList.remove('hidden');

    const input = document.getElementById('ui-dialog-input');
    if (input) {
      setTimeout(() => { input.focus(); input.select(); }, 50);
    }

    const cleanup = () => {
      modal.classList.add('hidden');
      modal.removeEventListener('keydown', onKey);
      if (state._uiDialogOverlayPushed) {
        state._uiDialogOverlayPushed = false;
      }
    };

    const onKey = (e) => {
      if (e.key === 'Enter' && type === 'prompt') {
        e.preventDefault();
        confirm();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancel();
      }
    };

    const confirm = () => {
      let result;
      if (type === 'alert') result = undefined;
      else if (type === 'confirm') result = true;
      else if (type === 'prompt') {
        const inp = document.getElementById('ui-dialog-input');
        result = inp ? inp.value : '';
      }
      cleanup();
      resolve(result);
    };

    const cancel = () => {
      let result;
      if (type === 'alert') result = undefined;
      else if (type === 'confirm') result = false;
      else if (type === 'prompt') result = null;
      cleanup();
      resolve(result);
    };

    document.getElementById('ui-dialog-confirm').addEventListener('click', confirm);
    const cancelEl = document.getElementById('ui-dialog-cancel');
    if (cancelEl) cancelEl.addEventListener('click', cancel);
    modal.querySelector('.ui-dialog-backdrop').addEventListener('click', cancel, { once: true });
    document.addEventListener('keydown', onKey);
    // Cleanup listener clavier en plus du reste
    const oldCleanup = cleanup;
  });
}

// Wrappers compatibles avec l'API native (mais asynchrones)
function uiAlert(message, opts = {}) {
  return _showDialog({ type: 'alert', message, ...opts });
}
function uiConfirm(message, opts = {}) {
  return _showDialog({ type: 'confirm', message, ...opts });
}
function uiPrompt(message, defaultValue, opts = {}) {
  return _showDialog({ type: 'prompt', message, defaultValue, ...opts });
}
window.uiAlert = uiAlert;
window.uiConfirm = uiConfirm;
window.uiPrompt = uiPrompt;

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
    planning: 'Planning des repas',
    recipe: ''
  };
  const pageTitle = document.getElementById('page-title');
  pageTitle.textContent = titles[view] || '';
  const header = document.querySelector('.app-header');
  header.style.display = view === 'recipe' ? 'none' : '';

  document.getElementById('main-content').scrollTo({ top: 0, behavior: 'instant' });

  if (view === 'library') renderLibrary();
  if (view === 'shopping') renderShopping();
  if (view === 'planning') renderPlanning();
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
    closeValidationModal(true);
    return true;
  }
  // Priorité 3 : Modal Paramètres
  const settingsModal = document.getElementById('settings-modal');
  if (settingsModal && !settingsModal.classList.contains('hidden')) {
    hideSettings(true);
    return true;
  }
  // Priorité 4 : Modal historique cuisson
  const cookedModal = document.getElementById('cooked-history-modal');
  if (cookedModal && !cookedModal.classList.contains('hidden')) {
    closeCookedHistoryModal(true);
    return true;
  }
  // Priorité 5 : Modal Tags régime
  const dietModal = document.getElementById('diet-tags-modal');
  if (dietModal && !dietModal.classList.contains('hidden')) {
    closeDietTagsEditor(true);
    return true;
  }
  // Priorité 6 : Modal source
  const sourceModal = document.getElementById('source-modal');
  if (sourceModal && !sourceModal.classList.contains('hidden')) {
    closeSourceEditor(true);
    return true;
  }
  // Priorité 7 : Modal planning picker
  const planningPickerModal = document.getElementById('planning-picker-modal');
  if (planningPickerModal && !planningPickerModal.classList.contains('hidden')) {
    closePlanningSlotPicker(true);
    return true;
  }
  // Priorité 7b : Modal preview menu IA
  const menuPreviewModal = document.getElementById('planning-menu-preview-modal');
  if (menuPreviewModal && !menuPreviewModal.classList.contains('hidden')) {
    closePlanningMenuPreview(true);
    return true;
  }
  // Priorité 7c : Modal génération menu IA
  const menuGenModal = document.getElementById('planning-menu-gen-modal');
  if (menuGenModal && !menuGenModal.classList.contains('hidden')) {
    closePlanningMenuGenerator(true);
    return true;
  }
  // Priorité 7d : Modal changeLog
  const changelogModal = document.getElementById('changelog-modal');
  if (changelogModal && !changelogModal.classList.contains('hidden')) {
    closeChangeLog(true);
    return true;
  }
  // Priorité 8 : Drawer Filtres
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
    // Normalisation : minuscules + suppression d'accents pour une recherche tolérante
    const normalize = s => (s || '').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const q = normalize(state.searchQuery.trim());
    if (q) {
      recipes = recipes.filter(r => {
        if (normalize(r.title).includes(q)) return true;
        if (normalize(r.description || '').includes(q)) return true;
        if ((r.tags || []).some(t => normalize(t).includes(q))) return true;
        if (r.ingredients.some(ing => normalize(ing.name).includes(q))) return true;
        if (normalize(r.personalNotes || '').includes(q)) return true;
        // NOUVEAU : recherche dans le texte des étapes
        if ((r.steps || []).some(s => normalize(s.text || '').includes(q))) return true;
        return false;
      });
    }
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

  // Filtrage par régime alimentaire (intersection : la recette doit avoir tous les régimes cochés)
  if (state.dietFilter && state.dietFilter.length > 0) {
    recipes = recipes.filter(r => {
      const tags = r.dietTags || [];
      return state.dietFilter.every(d => tags.includes(d));
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
  const heroBg = ['linear-gradient(135deg, var(--color-primary-soft), var(--color-accent))',
                  'linear-gradient(135deg, var(--color-orange-200), var(--color-orange-100))',
                  'linear-gradient(135deg, var(--color-pink-200), var(--color-brown-100))',
                  'linear-gradient(135deg, var(--color-blue-50), var(--color-sky-200))',
                  'linear-gradient(135deg, var(--color-yellow-100), var(--color-accent))',
                  'linear-gradient(135deg, var(--color-primary-pale), var(--color-primary-cream))'][bgIdx - 1];

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

  // === Barre compacte de méta-infos (tags, régimes, source, cuisson, historique) ===
  // Toutes ces infos étaient autrefois sur 5 lignes distinctes : on les regroupe en chips sur une seule
  // barre wrappante. Chips remplis = info présente ; chips vides en pointillés = "ajouter".

  const metaChips = [];

  // Tags personnalisés
  if (r.tags && r.tags.length) {
    const tagsList = r.tags.map(t => escapeHtml(t)).join(', ');
    metaChips.push(`<button class="recipe-meta-chip is-filled" onclick="editRecipeTags('${r.id}')" title="${escapeHtml(tagsList)}">
      <span class="recipe-meta-chip-icon">🏷️</span>
      <span class="recipe-meta-chip-text">${escapeHtml(tagsList)}</span>
    </button>`);
  } else {
    metaChips.push(`<button class="recipe-meta-chip is-empty" onclick="editRecipeTags('${r.id}')">+ Tags</button>`);
  }

  // Régimes alimentaires (chips compactes : juste les emojis si remplis)
  const dietTags = r.dietTags || [];
  if (dietTags.length > 0) {
    const emojis = dietTags.map(id => {
      const t = DIET_TAGS.find(x => x.id === id);
      return t ? `<span class="recipe-meta-diet-emoji" style="color:${t.color}" title="${escapeHtml(t.label)}">${t.emoji}</span>` : '';
    }).join('');
    metaChips.push(`<button class="recipe-meta-chip is-filled" onclick="openDietTagsEditor('${r.id}')">
      ${emojis}
    </button>`);
  } else {
    metaChips.push(`<button class="recipe-meta-chip is-empty" onclick="openDietTagsEditor('${r.id}')">+ Régime</button>`);
  }

  // Source
  const src = r.source;
  if (src && src.type) {
    let icon = '🔗', text = '';
    if (src.type === 'book') { icon = '📖'; text = src.title || 'Livre'; }
    else if (src.type === 'web') { icon = '🌐'; text = src.siteName || (src.url ? new URL(src.url).hostname.replace(/^www\./, '') : 'Web'); }
    else if (src.type === 'instagram') { icon = '📷'; text = src.account ? '@' + src.account.replace(/^@/, '') : 'Instagram'; }
    metaChips.push(`<button class="recipe-meta-chip is-filled" onclick="openSourceEditor('${r.id}')" title="${escapeHtml(text)}">
      <span class="recipe-meta-chip-icon">${icon}</span>
      <span class="recipe-meta-chip-text">${escapeHtml(text)}</span>
    </button>`);
  } else {
    metaChips.push(`<button class="recipe-meta-chip is-empty" onclick="openSourceEditor('${r.id}')">+ Source</button>`);
  }

  // Historique cuisson (chip)
  const cookedHistory = r.cookedHistory || [];
  const lastCooked = cookedHistory.length ? cookedHistory[cookedHistory.length - 1] : 0;
  if (lastCooked) {
    const days = Math.floor((Date.now() - lastCooked) / (24 * 3600 * 1000));
    let when = '';
    if (days === 0) when = "aujourd'hui";
    else if (days === 1) when = "hier";
    else if (days < 7) when = `${days}j`;
    else if (days < 30) when = `${Math.floor(days/7)}sem`;
    else if (days < 365) when = `${Math.floor(days/30)}mo`;
    else when = `${Math.floor(days/365)}an${Math.floor(days/365) > 1 ? 's' : ''}`;
    metaChips.push(`<button class="recipe-meta-chip is-filled" onclick="manageCookedHistory('${r.id}')" title="Cuisinée ${cookedHistory.length} fois">
      <span class="recipe-meta-chip-icon">✓</span>
      <span class="recipe-meta-chip-text">${cookedHistory.length} · ${when}</span>
    </button>`);
  } else {
    metaChips.push(`<button class="recipe-meta-chip is-empty" onclick="manageCookedHistory('${r.id}')">📅 Cuisson</button>`);
  }

  // Historique modifications (changelog) : badge si nouvelles modifs
  const changeLog = r.changeLog || [];
  const lastViewedKey = `mr_log_viewed_${r.id}`;
  const lastViewed = Number(localStorage.getItem(lastViewedKey)) || 0;
  const newCount = changeLog.filter(e => (e.at || 0) > lastViewed).length;
  const showBadge = lastViewed > 0 && newCount > 0;
  if (changeLog.length > 0) {
    metaChips.push(`<button class="recipe-meta-chip is-filled ${showBadge ? 'has-new' : ''}" onclick="openChangeLog('${r.id}')">
      <span class="recipe-meta-chip-icon">📋</span>
      <span class="recipe-meta-chip-text">${changeLog.length}</span>
      ${showBadge ? `<span class="recipe-meta-chip-badge">${newCount > 9 ? '9+' : newCount}</span>` : ''}
    </button>`);
  }

  const metaBarHtml = `<div class="recipe-meta-bar">${metaChips.join('')}</div>`;

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
        <button class="recipe-photo-add ${r.photo ? 'has-photo' : ''}" onclick="attachRecipePhoto('${r.id}')" aria-label="${r.photo ? 'Modifier la photo' : 'Ajouter une photo'}">📷</button>
      </div>
      <div class="recipe-detail-body">
        <h1 class="recipe-detail-title" onclick="quickEditField('title', '${r.id}')" title="Toucher pour modifier">${escapeHtml(r.title)}</h1>
        ${r.description ? `<p class="recipe-detail-description" onclick="quickEditField('description', '${r.id}')" title="Toucher pour modifier">${escapeHtml(r.description)}</p>` : `<p class="recipe-detail-description recipe-detail-description-empty" onclick="quickEditField('description', '${r.id}')">+ Ajouter une description</p>`}

        ${timesHtml}

        <div class="recipe-detail-tags">
          ${months.length === 0 ? '<span class="month-tag">Toute saison</span>' :
            months.map(m => `<span class="month-tag ${m === currentMonth ? 'current' : ''}">${MONTH_NAMES[m]}</span>`).join('')}
        </div>

        ${metaBarHtml}

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
            ${renderIngredientsList(r.ingredients, ratio, r.id)}
          </div>
          <button class="recipe-inline-add" onclick="addIngredientInline('${r.id}')">+ Ajouter un ingrédient</button>
          ${(() => {
            const inPantryCount = r.ingredients.filter(i => isInPantry(i.name)).length;
            return inPantryCount > 0
              ? `<p class="ingredients-pantry-hint">📦 ${inPantryCount} ingrédient${inPantryCount > 1 ? 's' : ''} déjà chez vous</p>`
              : '';
          })()}
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
            ${renderStepsList(r.steps, r.ingredients, ratio, r.id)}
          </div>
          <button class="recipe-inline-add" onclick="addStepInline('${r.id}')">+ Ajouter une étape</button>
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

function renderDietFilter() {
  const wrap = document.getElementById('filter-diet-chips');
  if (!wrap) return;
  wrap.innerHTML = DIET_TAGS.map(tag => {
    const active = state.dietFilter.includes(tag.id);
    return `<button class="filter-chip ${active ? 'active' : ''}" data-diet-id="${tag.id}">${tag.emoji} ${tag.label}</button>`;
  }).join('');
  // Bindings (sur chaque appel car re-render)
  wrap.querySelectorAll('button[data-diet-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.dietId;
      if (state.dietFilter.includes(id)) {
        state.dietFilter = state.dietFilter.filter(d => d !== id);
      } else {
        state.dietFilter.push(id);
      }
      renderDietFilter();
      updateFiltersUI();
      renderLibrary();
    });
  });
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
  if (state.dietFilter && state.dietFilter.length > 0) n++;
  return n;
}

// Met à jour le badge "Filtres" + le résumé sous la barre
function updateFiltersUI() {
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
  for (const d of state.dietFilter) {
    const tag = DIET_TAGS.find(t => t.id === d);
    if (tag) chips.push(`<button class="active-filter-chip" onclick="clearOneDietFilter('${d}')">${tag.emoji} ${escapeHtml(tag.label)} ✕</button>`);
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
  if (type === 'category' || type === 'month') {
    document.querySelectorAll(`.filter-chip[data-filter-type="${type}"]`).forEach(c => {
      c.classList.toggle('active', c.dataset.filterValue === 'all');
    });
  }
  updateFiltersUI();
  renderLibrary();
}
window.clearOneFilter = clearOneFilter;

function clearOneDietFilter(id) {
  state.dietFilter = state.dietFilter.filter(d => d !== id);
  renderDietFilter();
  updateFiltersUI();
  renderLibrary();
}
window.clearOneDietFilter = clearOneDietFilter;

function clearAllFilters() {
  state.categoryFilter = 'all';
  state.monthFilter = 'all';
  state.ingredientsFilter = [];
  state.cookedFilter = '';
  state.dietFilter = [];
  document.querySelectorAll('.filter-chip[data-filter-type]').forEach(c => {
    c.classList.toggle('active', c.dataset.filterValue === 'all');
  });
  const sel = document.getElementById('filter-cooked');
  if (sel) sel.value = '';
  renderIngredientsFilter();
  renderDietFilter();
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
  document.getElementById('ingredients-list').innerHTML = renderIngredientsList(r.ingredients, ratio, r.id);
  document.getElementById('steps-list').innerHTML = renderStepsList(r.steps, r.ingredients, ratio, r.id);

  // Update shopping CTA
  const isInShopping = state.shopping.some(s => s.recipeId === r.id);
  const ctaContainer = document.querySelector('.recipe-add-shopping');
  if (ctaContainer && !isInShopping) {
    ctaContainer.querySelector('.btn-primary').setAttribute('onclick', `addToShopping('${r.id}', ${r.currentServings})`);
  }
}

function renderIngredientsList(ingredients, ratio, recipeId) {
  return ingredients.map((ing, idx) => {
    const amount = ing.amount != null && ing.amount !== '' ? Number(ing.amount) * ratio : '';
    const inPantry = isInPantry(ing.name);
    return `
      <div class="ingredient-row ${inPantry ? 'in-pantry' : ''}" onclick="editIngredientInline('${recipeId}', ${idx})" title="Toucher pour modifier">
        <span class="ingredient-name">${escapeHtml(ing.name)}${inPantry ? ' <span class="ingredient-pantry-mark" title="Déjà chez vous">📦</span>' : ''}</span>
        <span class="ingredient-amount">${amount === '' ? '' : formatAmount(amount, ing.unit)}</span>
      </div>
    `;
  }).join('');
}

function renderStepsList(steps, ingredients, ratio, recipeId) {
  return steps.map((step, i) => {
    const stepIngredients = (step.ingredientIds || []).map(id => {
      const ing = ingredients.find(x => x.id === id);
      if (!ing) return null;
      const amount = ing.amount != null && ing.amount !== '' ? Number(ing.amount) * ratio : '';
      return `<span class="step-ingredient-chip">${escapeHtml(ing.name)}${amount === '' ? '' : ' · ' + formatAmount(amount, ing.unit)}</span>`;
    }).filter(Boolean).join('');

    // NOUVEAU : détecter les durées dans le texte de l'étape
    const durations = extractDurations(step.text || '');
    const timerButtons = durations.map(d => {
      const seconds = d.minutes * 60;
      return `<button class="step-timer-btn" onclick="event.stopPropagation(); startStepTimer(${seconds}, '${escapeHtml(d.label)}', '${recipeId}', ${i})" title="Démarrer un minuteur de ${d.label}">
        <span class="step-timer-icon">⏱️</span>
        <span class="step-timer-label">${escapeHtml(d.label)}</span>
      </button>`;
    }).join('');

    return `
      <div class="step-item" onclick="editStepInline('${recipeId}', ${i})" title="Toucher pour modifier">
        <div class="step-number">${i + 1}</div>
        <div class="step-content">
          <div class="step-text">${escapeHtml(step.text)}</div>
          ${stepIngredients ? `<div class="step-ingredients" onclick="event.stopPropagation()">${stepIngredients}</div>` : ''}
          ${timerButtons ? `<div class="step-timers" onclick="event.stopPropagation()">${timerButtons}</div>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

// ============================================
// DÉTECTION DE DURÉES DANS LE TEXTE
// ============================================
// Repère les expressions "30 minutes", "2 h", "1 heure 30", "30s", etc.
// Retourne un tableau de {label, minutes}
function extractDurations(text) {
  if (!text) return [];
  const t = text.toLowerCase();
  const results = [];
  const seen = new Set();

  // Patterns reconnus. On commence par les fractions (1/2, 1/4...) pour qu'elles soient
  // matchées en priorité, puis on "consomme" la zone dans le texte pour éviter qu'elles
  // soient re-matchées par les patterns plus génériques.
  // Ex: "1/2 heure" doit donner 30 min, pas aussi "2 heures".

  let workText = t; // copie modifiable du texte

  const patterns = [
    // FRACTIONS d'heure d'abord (plus spécifique)
    { re: /\b1\s*\/\s*2\s*(?:d'?\s*)?heures?\b/g, fmt: () => ({ minutes: 30, label: '30 min' }) },
    { re: /\b1\s*\/\s*4\s*(?:d'?\s*)?heures?\b/g, fmt: () => ({ minutes: 15, label: '15 min' }) },
    { re: /\b3\s*\/\s*4\s*(?:d'?\s*)?heures?\b/g, fmt: () => ({ minutes: 45, label: '45 min' }) },
    // "1h30", "2h 30"
    { re: /\b(\d{1,2})\s*h(?:eures?)?\s*(\d{1,2})\s*(?:min(?:utes?)?)?\b/g, fmt: m => {
        const h = parseInt(m[1]), min = parseInt(m[2]);
        const total = h * 60 + min;
        if (total < 1 || total > 24 * 60) return null;
        return { minutes: total, label: `${h}h${String(min).padStart(2, '0')}` };
    }},
    // "2 heures", "3 h" — mais PAS si précédé d'un "/" (fraction)
    { re: /(?<![\/\d])\b(\d{1,2})\s*h(?:eures?)?\b(?!\d)/g, fmt: m => {
        const h = parseInt(m[1]);
        if (h < 1 || h > 24) return null;
        return { minutes: h * 60, label: h === 1 ? '1 heure' : `${h} heures` };
    }},
    // "30 minutes", "45 min", "5 mn"
    { re: /\b(\d{1,3})\s*(?:min(?:ute)?s?|mn)\b/g, fmt: m => {
        const min = parseInt(m[1]);
        if (min < 1 || min > 24 * 60) return null;
        return { minutes: min, label: `${min} min` };
    }},
  ];

  for (const pattern of patterns) {
    let m;
    pattern.re.lastIndex = 0;
    while ((m = pattern.re.exec(workText)) !== null) {
      const parsed = pattern.fmt(m);
      if (!parsed) continue;
      if (seen.has(parsed.minutes)) continue;
      seen.add(parsed.minutes);
      results.push(parsed);
      // Consommer la zone matchée pour éviter qu'un pattern suivant la re-traite
      // (ex: "1/2 heure" déjà matché ne doit pas redonner "2 heures")
      const start = m.index;
      const end = m.index + m[0].length;
      workText = workText.substring(0, start) + ' '.repeat(m[0].length) + workText.substring(end);
    }
  }

  // Trier par durée croissante, limiter à 3 max
  return results.sort((a, b) => a.minutes - b.minutes).slice(0, 3);
}
window.extractDurations = extractDurations;

// ============================================
// MINUTEUR (Timer)
// ============================================
// État du timer actif (un seul à la fois pour simplifier).
// Si vous avez besoin de timers multiples, on pourrait migrer vers une Map.
const _timers = {
  active: null,           // {id, startedAt, durationSec, label, recipeId, stepIdx, intervalId, audio}
  audioCtx: null,
  notificationPermission: null
};

async function _requestNotificationPermission() {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  try {
    const result = await Notification.requestPermission();
    return result === 'granted';
  } catch {
    return false;
  }
}

function startStepTimer(durationSec, label, recipeId, stepIdx) {
  // Si un timer tourne déjà, demander confirmation
  if (_timers.active) {
    uiConfirm(`Un minuteur "${_timers.active.label}" est déjà actif. Le remplacer ?`, {
      confirmLabel: 'Remplacer'
    }).then(ok => {
      if (ok) {
        stopStepTimer(true);
        _startTimerInternal(durationSec, label, recipeId, stepIdx);
      }
    });
    return;
  }
  _startTimerInternal(durationSec, label, recipeId, stepIdx);
}
window.startStepTimer = startStepTimer;

async function _startTimerInternal(durationSec, label, recipeId, stepIdx) {
  // Demander la permission notification (silencieusement)
  await _requestNotificationPermission();

  _timers.active = {
    id: 'tm_' + Date.now(),
    startedAt: Date.now(),
    durationSec,
    label,
    recipeId,
    stepIdx,
    remainingSec: durationSec,
    paused: false,
    pausedRemaining: null
  };

  // Sauver en localStorage pour résister à un refresh
  _saveTimerState();

  // Tick toutes les secondes
  _timers.active.intervalId = setInterval(_tickTimer, 1000);

  _showTimerOverlay();
  showToast(`Minuteur ${label} démarré ⏱️`, 'success');
}

function _saveTimerState() {
  if (_timers.active) {
    const { intervalId, ...persistable } = _timers.active;
    localStorage.setItem('mr_active_timer', JSON.stringify(persistable));
  } else {
    localStorage.removeItem('mr_active_timer');
  }
}

function _loadTimerState() {
  // Restaurer le timer à l'ouverture de l'app s'il y en a un actif
  const raw = localStorage.getItem('mr_active_timer');
  if (!raw) return;
  try {
    const saved = JSON.parse(raw);
    if (saved.paused) {
      // Restaurer pause : pas de tick
      _timers.active = saved;
      _showTimerOverlay();
      return;
    }
    const elapsedSec = Math.floor((Date.now() - saved.startedAt) / 1000);
    const remaining = saved.durationSec - elapsedSec;
    if (remaining <= 0) {
      // Timer expiré pendant que l'app était fermée
      localStorage.removeItem('mr_active_timer');
      // Note : on ne sonne pas car on n'a pas le focus, mais on prévient avec un toast
      setTimeout(() => showToast(`⏰ Minuteur "${saved.label}" terminé pendant votre absence`, 'success'), 1000);
      return;
    }
    _timers.active = { ...saved, remainingSec: remaining };
    _timers.active.intervalId = setInterval(_tickTimer, 1000);
    _showTimerOverlay();
  } catch (e) {
    localStorage.removeItem('mr_active_timer');
  }
}

function _tickTimer() {
  if (!_timers.active || _timers.active.paused) return;
  const elapsed = Math.floor((Date.now() - _timers.active.startedAt) / 1000);
  _timers.active.remainingSec = _timers.active.durationSec - elapsed;

  if (_timers.active.remainingSec <= 0) {
    _ringTimer();
    return;
  }

  _updateTimerDisplay();
}

function _ringTimer() {
  if (!_timers.active) return;
  const label = _timers.active.label;
  clearInterval(_timers.active.intervalId);
  _timers.active.remainingSec = 0;
  _timers.active.finished = true;
  _updateTimerDisplay();

  // Sonner avec WebAudio (cycles de bips)
  _playTimerSound();

  // Notification système si autorisée
  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      const n = new Notification('Mes Recettes — Minuteur terminé', {
        body: `Le minuteur "${label}" est arrivé à zéro.`,
        icon: '/icons/icon-192.png',
        tag: 'mr-timer',
        renotify: true,
        requireInteraction: true
      });
      n.onclick = () => { window.focus(); n.close(); };
    } catch (e) {
      console.warn('Notification failed', e);
    }
  }

  // Vibration sur mobile
  if (navigator.vibrate) {
    try {
      navigator.vibrate([400, 200, 400, 200, 400, 200, 800]);
    } catch {}
  }

  _saveTimerState(); // garder en mémoire qu'il est fini
}

function _playTimerSound() {
  // Synthèse audio simple : 3 bips
  try {
    if (!_timers.audioCtx) {
      _timers.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    const ctx = _timers.audioCtx;
    // 3 bips espacés
    for (let i = 0; i < 3; i++) {
      const startTime = ctx.currentTime + i * 0.4;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880; // La 5
      osc.type = 'sine';
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(0.3, startTime + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + 0.3);
    }
  } catch (e) {
    console.warn('Audio playback failed', e);
  }
}

function pauseStepTimer() {
  if (!_timers.active || _timers.active.paused) return;
  _timers.active.paused = true;
  _timers.active.pausedRemaining = _timers.active.remainingSec;
  clearInterval(_timers.active.intervalId);
  _saveTimerState();
  _updateTimerDisplay();
}
window.pauseStepTimer = pauseStepTimer;

function resumeStepTimer() {
  if (!_timers.active || !_timers.active.paused) return;
  // Recalculer startedAt pour que le tick reprenne correctement
  _timers.active.startedAt = Date.now() - (_timers.active.durationSec - _timers.active.pausedRemaining) * 1000;
  _timers.active.paused = false;
  _timers.active.pausedRemaining = null;
  _timers.active.intervalId = setInterval(_tickTimer, 1000);
  _saveTimerState();
  _updateTimerDisplay();
}
window.resumeStepTimer = resumeStepTimer;

function stopStepTimer(silent) {
  if (!_timers.active) return;
  if (_timers.active.intervalId) clearInterval(_timers.active.intervalId);
  const label = _timers.active.label;
  _timers.active = null;
  localStorage.removeItem('mr_active_timer');
  _hideTimerOverlay();
  if (!silent) showToast(`Minuteur arrêté`, '');
}
window.stopStepTimer = stopStepTimer;

function _showTimerOverlay() {
  let overlay = document.getElementById('timer-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'timer-overlay';
    overlay.className = 'timer-overlay';
    document.body.appendChild(overlay);
  }
  overlay.classList.remove('hidden');
  _updateTimerDisplay();
}

function _hideTimerOverlay() {
  const overlay = document.getElementById('timer-overlay');
  if (overlay) overlay.classList.add('hidden');
}

function _updateTimerDisplay() {
  const overlay = document.getElementById('timer-overlay');
  if (!overlay || !_timers.active) return;
  const t = _timers.active;
  const rem = Math.max(0, t.remainingSec);
  const mm = Math.floor(rem / 60);
  const ss = rem % 60;
  const display = `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  const progress = ((t.durationSec - rem) / t.durationSec) * 100;
  const finished = t.finished || rem === 0;

  overlay.innerHTML = `
    <div class="timer-overlay-content ${finished ? 'is-finished' : ''}">
      <div class="timer-overlay-progress" style="width: ${progress}%"></div>
      <div class="timer-overlay-body">
        <div class="timer-overlay-label">${escapeHtml(t.label)}${finished ? ' · Terminé !' : ''}</div>
        <div class="timer-overlay-display">${display}</div>
      </div>
      <div class="timer-overlay-actions">
        ${finished ? `
          <button class="timer-overlay-btn timer-overlay-btn-primary" onclick="stopStepTimer()">OK</button>
        ` : t.paused ? `
          <button class="timer-overlay-btn" onclick="resumeStepTimer()" aria-label="Reprendre">▶</button>
          <button class="timer-overlay-btn" onclick="stopStepTimer()" aria-label="Arrêter">✕</button>
        ` : `
          <button class="timer-overlay-btn" onclick="pauseStepTimer()" aria-label="Pause">⏸</button>
          <button class="timer-overlay-btn" onclick="stopStepTimer()" aria-label="Arrêter">✕</button>
        `}
      </div>
    </div>
  `;
}

async function confirmDeleteRecipe(id) {
  if (!(await uiConfirm('Supprimer cette recette ?', { confirmLabel: 'Supprimer', danger: true }))) return;
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

// Gérer l'historique complet : voir / ajouter / supprimer des dates de cuisson
function manageCookedHistory(id) {
  const recipe = state.recipes.find(r => r.id === id);
  if (!recipe) return;
  if (!recipe.cookedHistory) recipe.cookedHistory = [];

  // Tri décroissant (plus récent en haut)
  const history = [...recipe.cookedHistory].sort((a, b) => b - a);

  const formatDate = (ts) => {
    const d = new Date(ts);
    return d.toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
  };

  let html = `
    <div class="cooked-history-modal-content">
      <div class="modal-header">
        <h2>Historique de cuisson</h2>
        <button class="modal-close" onclick="closeCookedHistoryModal()" aria-label="Fermer">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 18L18 6M6 6l12 12" stroke-linecap="round"/></svg>
        </button>
      </div>
      <div class="cooked-history-modal-body">
        <p class="cooked-history-summary">Cuisinée <strong>${history.length}</strong> fois</p>
        <button class="btn-primary btn-block" onclick="addCookedDate('${id}')">+ Ajouter une date</button>
        ${history.length === 0
          ? '<p class="cooked-history-empty">Aucune date enregistrée pour le moment.</p>'
          : '<div class="cooked-history-list">' + history.map(ts => `
              <div class="cooked-history-item">
                <span class="cooked-history-date">${formatDate(ts)}</span>
                <button class="cooked-history-delete" onclick="removeCookedDate('${id}', ${ts})" aria-label="Supprimer">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z" stroke-linecap="round"/></svg>
                </button>
              </div>
            `).join('') + '</div>'
        }
      </div>
    </div>
  `;

  // Créer le modal s'il n'existe pas
  let modal = document.getElementById('cooked-history-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'cooked-history-modal';
    modal.className = 'modal hidden';
    modal.innerHTML = '<div class="modal-backdrop"></div><div class="modal-content"></div>';
    document.body.appendChild(modal);
    modal.querySelector('.modal-backdrop').addEventListener('click', closeCookedHistoryModal);
  }
  modal.querySelector('.modal-content').innerHTML = html;
  modal.classList.remove('hidden');
  pushOverlay('cooked-history');
}
window.manageCookedHistory = manageCookedHistory;

// ============================================
// CHANGELOG / HISTORIQUE DES MODIFICATIONS
// ============================================

function openChangeLog(id) {
  const recipe = state.recipes.find(r => r.id === id);
  if (!recipe) return;
  const entries = (recipe.changeLog || []).slice().reverse(); // plus récent en premier

  // Marquer comme vu (consomme le badge)
  localStorage.setItem(`mr_log_viewed_${id}`, String(Date.now()));

  let listHtml;
  if (entries.length === 0) {
    listHtml = `<p class="changelog-empty">Aucune modification enregistrée pour cette recette.</p>`;
  } else {
    listHtml = `<div class="changelog-list">${entries.map(e => {
      const date = new Date(e.at || 0);
      const dateStr = formatRelativeDate(date);
      const fullDate = date.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      const icon = changeLogIcon(e.action);
      return `<div class="changelog-item">
        <div class="changelog-icon">${icon}</div>
        <div class="changelog-text">
          <div class="changelog-action">${escapeHtml(e.action || '(modification)')}</div>
          <div class="changelog-date" title="${escapeHtml(fullDate)}">${escapeHtml(dateStr)}</div>
        </div>
      </div>`;
    }).join('')}</div>`;
  }

  const html = `
    <div class="modal-header">
      <h2>📋 Historique</h2>
      <button class="modal-close" onclick="closeChangeLog()" aria-label="Fermer">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 18L18 6M6 6l12 12" stroke-linecap="round"/></svg>
      </button>
    </div>
    <div class="changelog-body">
      <p class="changelog-summary">${escapeHtml(recipe.title)}</p>
      ${listHtml}
      ${entries.length >= 20 ? '<p class="changelog-note">L\'historique conserve les 20 dernières modifications.</p>' : ''}
    </div>
  `;

  let modal = document.getElementById('changelog-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'changelog-modal';
    modal.className = 'modal hidden';
    modal.innerHTML = '<div class="modal-backdrop"></div><div class="modal-content"></div>';
    document.body.appendChild(modal);
    modal.querySelector('.modal-backdrop').addEventListener('click', closeChangeLog);
  }
  modal.querySelector('.modal-content').innerHTML = html;
  modal.classList.remove('hidden');
  pushOverlay('changelog');
}
window.openChangeLog = openChangeLog;

function closeChangeLog(skipHistory) {
  const modal = document.getElementById('changelog-modal');
  if (!modal || modal.classList.contains('hidden')) return;
  if (!skipHistory) {
    history.back();
    return;
  }
  modal.classList.add('hidden');
  // Rafraîchir la fiche pour faire disparaître le badge
  if (state.currentView === 'recipe' && state.currentRecipe) {
    renderRecipeDetail(state.currentRecipe);
  }
}
window.closeChangeLog = closeChangeLog;

// Mappe une action vers un emoji
function changeLogIcon(action) {
  if (!action) return '📝';
  const a = action.toLowerCase();
  if (a.includes('créée') || a.includes('cree')) return '✨';
  if (a.includes('modifiée') || a.includes('modifie')) return '✏️';
  if (a.includes('cuisin')) return '🍳';
  if (a.includes('favoris')) return '⭐';
  if (a.includes('photo')) return '📸';
  if (a.includes('notes')) return '📝';
  if (a.includes('tags')) return '🏷️';
  if (a.includes('régime') || a.includes('regime')) return '🥗';
  if (a.includes('source')) return '🔗';
  if (a.includes('date cuisson')) return '📅';
  if (a.includes('supprim')) return '🗑️';
  return '📝';
}

// Date relative en français
function formatRelativeDate(date) {
  const now = new Date();
  const diff = now - date;
  if (diff < 60 * 1000) return 'à l\'instant';
  if (diff < 60 * 60 * 1000) {
    const m = Math.floor(diff / 60000);
    return `il y a ${m} min`;
  }
  if (diff < 24 * 3600 * 1000) {
    const h = Math.floor(diff / 3600000);
    return `il y a ${h} h`;
  }
  const d = Math.floor(diff / (24 * 3600 * 1000));
  if (d === 1) return 'hier';
  if (d < 7) return `il y a ${d} jours`;
  if (d < 30) return `il y a ${Math.floor(d / 7)} sem.`;
  if (d < 365) return `il y a ${Math.floor(d / 30)} mois`;
  return `il y a ${Math.floor(d / 365)} an${Math.floor(d / 365) > 1 ? 's' : ''}`;
}

function closeCookedHistoryModal(skipHistory) {
  const modal = document.getElementById('cooked-history-modal');
  if (!modal || modal.classList.contains('hidden')) return;
  if (!skipHistory) {
    history.back();
    return;
  }
  modal.classList.add('hidden');
}
window.closeCookedHistoryModal = closeCookedHistoryModal;

async function addCookedDate(id) {
  const recipe = state.recipes.find(r => r.id === id);
  if (!recipe) return;
  // Prompt pour la date (par défaut aujourd'hui)
  const today = new Date().toISOString().slice(0, 10);
  const dateStr = await uiPrompt('Date de cuisson (format AAAA-MM-JJ) :', today);
  if (!dateStr) return;
  const ts = new Date(dateStr).getTime();
  if (isNaN(ts)) {
    showToast('Date invalide', 'error');
    return;
  }
  if (!recipe.cookedHistory) recipe.cookedHistory = [];
  recipe.cookedHistory.push(ts);
  recipe.cookedHistory.sort((a, b) => a - b);
  updateRecipeAndSync(recipe, 'date cuisson ajoutée');
  if (state.currentView === 'recipe' && state.currentRecipe?.id === id) {
    state.currentRecipe.cookedHistory = recipe.cookedHistory;
    renderRecipeDetail(recipe);
  }
  manageCookedHistory(id); // rafraîchir le modal
  showToast('Date ajoutée ✓', 'success');
}
window.addCookedDate = addCookedDate;

async function removeCookedDate(id, ts) {
  const recipe = state.recipes.find(r => r.id === id);
  if (!recipe || !recipe.cookedHistory) return;
  if (!(await uiConfirm('Supprimer cette date ?', { confirmLabel: 'Supprimer', danger: true }))) return;
  recipe.cookedHistory = recipe.cookedHistory.filter(t => t !== ts);
  updateRecipeAndSync(recipe, 'date cuisson supprimée');
  if (state.currentView === 'recipe' && state.currentRecipe?.id === id) {
    state.currentRecipe.cookedHistory = recipe.cookedHistory;
    renderRecipeDetail(recipe);
  }
  manageCookedHistory(id); // rafraîchir le modal
  showToast('Date supprimée');
}
window.removeCookedDate = removeCookedDate;

async function editPersonalNotes(id) {
  const recipe = state.recipes.find(r => r.id === id);
  if (!recipe) return;
  const current = recipe.personalNotes || '';
  const newValue = await uiPrompt('Vos notes personnelles (astuces, variantes, retours d\'expérience) :', current);
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

  // Dialog pour choisir entre Caméra et Galerie
  // Sur mobile, le navigateur ouvrira la caméra OU la galerie selon le bouton choisi
  const choice = await _showPhotoSourceDialog(recipe.photo);
  if (!choice) return;

  if (choice === 'delete') {
    await removeRecipePhoto(id);
    return;
  }

  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  // capture="environment" force l'ouverture de la caméra arrière sur mobile
  // sans capture, l'utilisateur arrive sur la galerie/sélecteur de fichier
  if (choice === 'camera') {
    input.capture = 'environment';
  }

  input.addEventListener('change', async () => {
    const file = input.files[0];
    if (!file) return;
    try {
      showToast('Traitement de la photo...', '');
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

// Dialog pour choisir la source de la photo
// Retourne 'camera', 'gallery', 'delete' ou null (annulé)
function _showPhotoSourceDialog(hasExistingPhoto) {
  return new Promise(resolve => {
    const modal = _ensureDialogModal();
    const content = modal.querySelector('.ui-dialog-content');

    content.innerHTML = `
      <div class="ui-dialog-body">
        <h2 class="ui-dialog-title">Photo de la recette</h2>
        <p class="ui-dialog-message">Comment souhaitez-vous ${hasExistingPhoto ? 'remplacer' : 'ajouter'} la photo ?</p>
        <div class="photo-source-options">
          <button class="photo-source-btn" id="photo-src-camera">
            <span class="photo-source-icon">📸</span>
            <span class="photo-source-label">Prendre une photo</span>
            <span class="photo-source-desc">Utiliser l'appareil photo</span>
          </button>
          <button class="photo-source-btn" id="photo-src-gallery">
            <span class="photo-source-icon">🖼️</span>
            <span class="photo-source-label">Choisir dans la galerie</span>
            <span class="photo-source-desc">Sélectionner une image existante</span>
          </button>
          ${hasExistingPhoto ? `
            <button class="photo-source-btn photo-source-delete" id="photo-src-delete">
              <span class="photo-source-icon">🗑️</span>
              <span class="photo-source-label">Supprimer la photo</span>
            </button>
          ` : ''}
        </div>
      </div>
      <div class="ui-dialog-actions">
        <button class="btn-secondary" id="photo-src-cancel" style="flex:1">Annuler</button>
      </div>
    `;
    modal.classList.remove('hidden');

    const cleanup = () => modal.classList.add('hidden');

    document.getElementById('photo-src-camera').addEventListener('click', () => {
      cleanup();
      resolve('camera');
    });
    document.getElementById('photo-src-gallery').addEventListener('click', () => {
      cleanup();
      resolve('gallery');
    });
    if (hasExistingPhoto) {
      document.getElementById('photo-src-delete').addEventListener('click', () => {
        cleanup();
        resolve('delete');
      });
    }
    document.getElementById('photo-src-cancel').addEventListener('click', () => {
      cleanup();
      resolve(null);
    });
    modal.querySelector('.ui-dialog-backdrop').addEventListener('click', () => {
      cleanup();
      resolve(null);
    }, { once: true });
  });
}

async function removeRecipePhoto(id) {
  const recipe = state.recipes.find(r => r.id === id);
  if (!recipe || !recipe.photo) return;
  if (!(await uiConfirm('Supprimer la photo ?', { confirmLabel: 'Supprimer', danger: true }))) return;
  recipe.photo = null;
  updateRecipeAndSync(recipe, 'photo retirée');
  if (state.currentView === 'recipe' && state.currentRecipe?.id === id) {
    state.currentRecipe.photo = null;
    renderRecipeDetail(recipe);
  }
}
window.removeRecipePhoto = removeRecipePhoto;

async function editRecipeTags(id) {
  const recipe = state.recipes.find(r => r.id === id);
  if (!recipe) return;
  const current = (recipe.tags || []).join(', ');
  const newValue = await uiPrompt('Tags séparés par des virgules (ex: rapide, kids-friendly, comfort food) :', current);
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
// DIET TAGS (régimes alimentaires prédéfinis)
// ============================================

function renderDietTags(recipe) {
  const dietTags = recipe.dietTags || [];
  if (dietTags.length === 0) {
    return `<button class="recipe-diet-tags-empty" onclick="openDietTagsEditor('${recipe.id}')">🍽️ + Régime alimentaire</button>`;
  }
  const chips = dietTags.map(id => {
    const tag = DIET_TAGS.find(t => t.id === id);
    if (!tag) return '';
    return `<span class="recipe-diet-tag" style="background:${tag.color}25; color:${tag.color}; border-color:${tag.color}55;">${tag.emoji} ${escapeHtml(tag.label)}</span>`;
  }).join('');
  return `<div class="recipe-diet-tags" onclick="openDietTagsEditor('${recipe.id}')">${chips}<button class="recipe-tag-edit">✏️</button></div>`;
}

function openDietTagsEditor(id) {
  const recipe = state.recipes.find(r => r.id === id);
  if (!recipe) return;
  if (!recipe.dietTags) recipe.dietTags = [];

  const html = `
    <div class="modal-header">
      <h2>Régime alimentaire</h2>
      <button class="modal-close" onclick="closeDietTagsEditor()" aria-label="Fermer">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 18L18 6M6 6l12 12" stroke-linecap="round"/></svg>
      </button>
    </div>
    <div class="diet-tags-editor-body">
      <p class="diet-tags-editor-hint">Cochez les régimes auxquels cette recette correspond. <span class="diet-tags-fodmap-hint">Les tags Low/High FODMAP sont calculés automatiquement depuis les ingrédients.</span></p>
      <div class="diet-tags-grid">
        ${DIET_TAGS.map(tag => {
          const checked = recipe.dietTags.includes(tag.id);
          const isFodmap = tag.id === 'low-fodmap' || tag.id === 'high-fodmap';
          return `
            <label class="diet-tag-option ${checked ? 'checked' : ''} ${isFodmap ? 'is-auto' : ''}" style="--diet-color: ${tag.color}">
              <input type="checkbox" data-diet-id="${tag.id}" ${checked ? 'checked' : ''}>
              <span class="diet-tag-emoji">${tag.emoji}</span>
              <span class="diet-tag-label">${tag.label}${isFodmap ? ' <small>(auto)</small>' : ''}</span>
            </label>
          `;
        }).join('')}
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn-secondary" onclick="closeDietTagsEditor()">Annuler</button>
      <button class="btn-primary" onclick="saveDietTags('${id}')">Enregistrer</button>
    </div>
  `;

  let modal = document.getElementById('diet-tags-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'diet-tags-modal';
    modal.className = 'modal hidden';
    modal.innerHTML = '<div class="modal-backdrop"></div><div class="modal-content"></div>';
    document.body.appendChild(modal);
    modal.querySelector('.modal-backdrop').addEventListener('click', closeDietTagsEditor);
  }
  modal.querySelector('.modal-content').innerHTML = html;
  modal.classList.remove('hidden');
  // Toggle visuel des labels
  modal.querySelectorAll('.diet-tag-option input').forEach(input => {
    input.addEventListener('change', e => {
      e.target.closest('.diet-tag-option').classList.toggle('checked', e.target.checked);
    });
  });
  pushOverlay('diet-tags');
}
window.openDietTagsEditor = openDietTagsEditor;

function closeDietTagsEditor(skipHistory) {
  const modal = document.getElementById('diet-tags-modal');
  if (!modal || modal.classList.contains('hidden')) return;
  if (!skipHistory) {
    history.back();
    return;
  }
  modal.classList.add('hidden');
}
window.closeDietTagsEditor = closeDietTagsEditor;

function saveDietTags(id) {
  const recipe = state.recipes.find(r => r.id === id);
  if (!recipe) return;
  const modal = document.getElementById('diet-tags-modal');
  const selected = [];
  modal.querySelectorAll('.diet-tag-option input:checked').forEach(input => {
    selected.push(input.dataset.dietId);
  });
  recipe.dietTags = selected;
  updateRecipeAndSync(recipe, 'régimes modifiés');
  closeDietTagsEditor();
  if (state.currentView === 'recipe' && state.currentRecipe?.id === id) {
    state.currentRecipe.dietTags = recipe.dietTags;
    renderRecipeDetail(recipe);
  }
  showToast('Régimes enregistrés ✓', 'success');
}
window.saveDietTags = saveDietTags;

// ============================================
// SOURCE DE LA RECETTE
// ============================================

function renderRecipeSource(recipe) {
  const src = recipe.source;
  if (!src || !src.type) {
    return `<button class="recipe-source-empty" onclick="openSourceEditor('${recipe.id}')">🔗 + Source de la recette</button>`;
  }
  let icon = '🔗', mainText = '', sub = '';
  if (src.type === 'book') {
    icon = '📖';
    mainText = src.title || 'Livre';
    sub = src.page ? `page ${src.page}` : '';
  } else if (src.type === 'web') {
    icon = '🌐';
    mainText = src.siteName || extractDomain(src.url) || 'Lien web';
    sub = '';
  } else if (src.type === 'instagram') {
    icon = '📷';
    mainText = src.account ? '@' + src.account.replace(/^@/, '') : 'Instagram';
    sub = '';
  }
  const url = (src.type === 'web' || src.type === 'instagram') ? src.url : null;
  const linkPart = url
    ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener" class="recipe-source-link" onclick="event.stopPropagation()">Ouvrir →</a>`
    : '';
  return `<div class="recipe-source-card" onclick="openSourceEditor('${recipe.id}')">
    <span class="recipe-source-icon">${icon}</span>
    <div class="recipe-source-text">
      <div class="recipe-source-main">${escapeHtml(mainText)}</div>
      ${sub ? `<div class="recipe-source-sub">${escapeHtml(sub)}</div>` : ''}
    </div>
    ${linkPart}
    <button class="recipe-tag-edit">✏️</button>
  </div>`;
}

function extractDomain(url) {
  if (!url) return '';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function openSourceEditor(id) {
  const recipe = state.recipes.find(r => r.id === id);
  if (!recipe) return;
  const src = recipe.source || { type: null };

  const html = `
    <div class="modal-header">
      <h2>Source de la recette</h2>
      <button class="modal-close" onclick="closeSourceEditor()" aria-label="Fermer">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 18L18 6M6 6l12 12" stroke-linecap="round"/></svg>
      </button>
    </div>
    <div class="source-editor-body">
      <div class="source-type-tabs">
        <button class="source-type-tab ${!src.type || src.type === 'book' ? 'active' : ''}" data-source-type="book">📖 Livre</button>
        <button class="source-type-tab ${src.type === 'web' ? 'active' : ''}" data-source-type="web">🌐 Site web</button>
        <button class="source-type-tab ${src.type === 'instagram' ? 'active' : ''}" data-source-type="instagram">📷 Instagram</button>
      </div>

      <div class="source-fields" data-source-fields="book" ${src.type !== 'book' && src.type ? 'hidden' : ''}>
        <label class="source-field-label">Titre du livre</label>
        <input type="text" id="source-book-title" placeholder="Ex: Le grand livre de Pâques" value="${escapeHtml(src.title || '')}">
        <label class="source-field-label">Page</label>
        <input type="text" id="source-book-page" inputmode="numeric" placeholder="Ex: 42" value="${escapeHtml(src.page != null ? String(src.page) : '')}">
      </div>

      <div class="source-fields" data-source-fields="web" ${src.type !== 'web' ? 'hidden' : ''}>
        <label class="source-field-label">URL</label>
        <input type="url" id="source-web-url" placeholder="https://..." value="${escapeHtml(src.type === 'web' ? (src.url || '') : '')}" autocapitalize="off" spellcheck="false">
        <label class="source-field-label">Nom du site (optionnel)</label>
        <input type="text" id="source-web-name" placeholder="Ex: Marmiton" value="${escapeHtml(src.type === 'web' ? (src.siteName || '') : '')}">
      </div>

      <div class="source-fields" data-source-fields="instagram" ${src.type !== 'instagram' ? 'hidden' : ''}>
        <label class="source-field-label">URL du post</label>
        <input type="url" id="source-insta-url" placeholder="https://www.instagram.com/p/..." value="${escapeHtml(src.type === 'instagram' ? (src.url || '') : '')}" autocapitalize="off" spellcheck="false">
        <label class="source-field-label">Compte (sans @)</label>
        <input type="text" id="source-insta-account" placeholder="Ex: cyril_lignac" value="${escapeHtml(src.type === 'instagram' ? (src.account || '') : '')}" autocapitalize="off" spellcheck="false">
      </div>
    </div>
    <div class="modal-footer">
      ${src.type ? `<button class="btn-danger-link" onclick="clearSource('${id}')">Supprimer</button>` : ''}
      <button class="btn-secondary" onclick="closeSourceEditor()">Annuler</button>
      <button class="btn-primary" onclick="saveSource('${id}')">Enregistrer</button>
    </div>
  `;

  let modal = document.getElementById('source-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'source-modal';
    modal.className = 'modal hidden';
    modal.innerHTML = '<div class="modal-backdrop"></div><div class="modal-content"></div>';
    document.body.appendChild(modal);
    modal.querySelector('.modal-backdrop').addEventListener('click', closeSourceEditor);
  }
  modal.querySelector('.modal-content').innerHTML = html;
  modal.classList.remove('hidden');

  // Switch entre les onglets
  modal.querySelectorAll('.source-type-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      modal.querySelectorAll('.source-type-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const type = btn.dataset.sourceType;
      modal.querySelectorAll('.source-fields').forEach(fields => {
        fields.hidden = fields.dataset.sourceFields !== type;
      });
    });
  });
  pushOverlay('source');
}
window.openSourceEditor = openSourceEditor;

function closeSourceEditor(skipHistory) {
  const modal = document.getElementById('source-modal');
  if (!modal || modal.classList.contains('hidden')) return;
  if (!skipHistory) {
    history.back();
    return;
  }
  modal.classList.add('hidden');
}
window.closeSourceEditor = closeSourceEditor;

function saveSource(id) {
  const recipe = state.recipes.find(r => r.id === id);
  if (!recipe) return;
  const modal = document.getElementById('source-modal');
  const activeType = modal.querySelector('.source-type-tab.active')?.dataset.sourceType || 'book';

  let source = null;
  if (activeType === 'book') {
    const title = document.getElementById('source-book-title').value.trim();
    const pageStr = document.getElementById('source-book-page').value.trim();
    if (title) {
      source = { type: 'book', title };
      if (pageStr) source.page = Number(pageStr) || pageStr;
    }
  } else if (activeType === 'web') {
    const url = document.getElementById('source-web-url').value.trim();
    const siteName = document.getElementById('source-web-name').value.trim();
    if (url) {
      source = { type: 'web', url };
      if (siteName) source.siteName = siteName;
    }
  } else if (activeType === 'instagram') {
    const url = document.getElementById('source-insta-url').value.trim();
    const account = document.getElementById('source-insta-account').value.trim().replace(/^@/, '');
    if (url || account) {
      source = { type: 'instagram' };
      if (url) source.url = url;
      if (account) source.account = account;
    }
  }

  if (!source) {
    showToast('Remplissez au moins un champ', 'error');
    return;
  }

  recipe.source = source;
  updateRecipeAndSync(recipe, 'source modifiée');
  closeSourceEditor();
  if (state.currentView === 'recipe' && state.currentRecipe?.id === id) {
    state.currentRecipe.source = source;
    renderRecipeDetail(recipe);
  }
  showToast('Source enregistrée ✓', 'success');
}
window.saveSource = saveSource;

async function clearSource(id) {
  if (!(await uiConfirm('Supprimer la source de cette recette ?', { confirmLabel: 'Supprimer', danger: true }))) return;
  const recipe = state.recipes.find(r => r.id === id);
  if (!recipe) return;
  recipe.source = null;
  updateRecipeAndSync(recipe, 'source supprimée');
  closeSourceEditor();
  if (state.currentView === 'recipe' && state.currentRecipe?.id === id) {
    state.currentRecipe.source = null;
    renderRecipeDetail(recipe);
  }
  showToast('Source supprimée');
}
window.clearSource = clearSource;

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

async function deleteShoppingList(id) {
  if (state.shoppingLists.length <= 1) {
    showToast('Vous devez garder au moins une liste', 'error');
    return;
  }
  if (!(await uiConfirm('Supprimer cette liste ?', { confirmLabel: 'Supprimer', danger: true }))) return;
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

async function renameShoppingList(id) {
  const list = state.shoppingLists.find(l => l.id === id);
  if (!list) return;
  const newName = await uiPrompt('Nom de la liste :', list.name);
  if (!newName || !newName.trim()) return;
  list.name = newName.trim();
  saveShoppingLists();
  renderShopping();
}
window.renameShoppingList = renameShoppingList;

async function addNewShoppingList() {
  const name = await uiPrompt('Nom de la nouvelle liste :', 'Nouvelle liste');
  if (!name || !name.trim()) return;
  createShoppingList(name.trim());
  renderShopping();
  updateShoppingBadge();
}
window.addNewShoppingList = addNewShoppingList;

// ============================================
// GARDE-MANGER
// ============================================

// Durée par défaut (en jours) avant qu'un ingrédient soit retiré automatiquement
function getPantryDefaultDays() {
  const stored = localStorage.getItem('mr_pantry_default_days');
  const n = Number(stored);
  return (n && n > 0 && n <= 365) ? n : 7;
}

function setPantryDefaultDays(days) {
  localStorage.setItem('mr_pantry_default_days', String(days));
}

function addToPantry(name, customDays) {
  const normalized = normalizeIngredientName(name);
  if (!normalized) return;
  const days = (customDays && customDays > 0) ? customDays : getPantryDefaultDays();
  const until = Date.now() + days * 24 * 3600 * 1000;
  // Remplace si existe
  state.pantry = state.pantry.filter(p => normalizeIngredientName(p.name) !== normalized);
  state.pantry.push({ name, until });
  savePantry();
}

function extendPantryItem(name, daysToAdd) {
  const normalized = normalizeIngredientName(name);
  const item = state.pantry.find(p => normalizeIngredientName(p.name) === normalized);
  if (!item) return;
  // Si déjà expiré ou proche d'expirer, partir d'aujourd'hui
  const base = Math.max(item.until || 0, Date.now());
  item.until = base + (daysToAdd || 7) * 24 * 3600 * 1000;
  savePantry();
}
window.extendPantryItem = extendPantryItem;

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
    const days = getPantryDefaultDays();
    showToast(`"${name}" : caché ${days} jour${days > 1 ? 's' : ''} (déjà dans mon stock)`, 'success');
  }
  renderShopping();
}
window.togglePantryFromShopping = togglePantryFromShopping;

// Ajout manuel d'un ingrédient au garde-manger (depuis la vue dédiée)
async function addPantryItemFromInput() {
  const name = await uiPrompt('Nom de l\'ingrédient à ajouter au garde-manger :');
  if (!name || !name.trim()) return;
  addToPantry(name.trim());
  renderShopping();
  showToast(`"${name.trim()}" ajouté au garde-manger ✓`, 'success');
}
window.addPantryItemFromInput = addPantryItemFromInput;

// Modal de gestion d'un item du garde-manger (étendre, supprimer)
async function openPantryItemActions(name) {
  const item = state.pantry.find(p => normalizeIngredientName(p.name) === normalizeIngredientName(name));
  if (!item) return;
  const days = Math.max(0, Math.ceil((item.until - Date.now()) / (24 * 3600 * 1000)));
  const message = `"${item.name}" expire dans ${days} jour${days !== 1 ? 's' : ''}.\n\nQue voulez-vous faire ?`;
  const result = await _showDialog({
    type: 'confirm',
    message,
    title: '📦 Garde-manger',
    confirmLabel: 'Étendre +7j',
    cancelLabel: 'Supprimer',
    danger: false
  });
  if (result === true) {
    extendPantryItem(name, 7);
    renderShopping();
    showToast('Étendu de 7 jours', 'success');
  } else if (result === false) {
    removeFromPantry(name);
    renderShopping();
    showToast('Retiré du garde-manger');
  }
}
window.openPantryItemActions = openPantryItemActions;

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

async function quickEditField(field, recipeId) {
  const recipe = state.recipes.find(r => r.id === recipeId);
  if (!recipe) return;
  const labels = {
    title: 'Titre de la recette',
    description: 'Description'
  };
  const current = recipe[field] || '';
  const newValue = await uiPrompt(labels[field] + ' :', current);
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
// ÉDITION INLINE DES INGRÉDIENTS ET ÉTAPES
// ============================================
// Pas besoin d'ouvrir la modal de validation : un simple modal d'édition rapide.

async function editIngredientInline(recipeId, idx) {
  const recipe = state.recipes.find(r => r.id === recipeId);
  if (!recipe) return;
  const ing = recipe.ingredients[idx];
  if (!ing) return;

  const result = await _showIngredientEditDialog({
    title: 'Modifier l\'ingrédient',
    name: ing.name,
    amount: ing.amount,
    unit: ing.unit,
    showDelete: recipe.ingredients.length > 1
  });
  if (!result) return;

  if (result.action === 'delete') {
    if (!(await uiConfirm(`Supprimer "${ing.name}" ?`, { confirmLabel: 'Supprimer', danger: true }))) return;
    // Supprimer aussi des ingredientIds des étapes
    const removedId = ing.id;
    recipe.ingredients.splice(idx, 1);
    recipe.steps = (recipe.steps || []).map(s => ({
      ...s,
      ingredientIds: (s.ingredientIds || []).filter(id => id !== removedId)
    }));
    updateRecipeAndSync(recipe, `ingrédient "${ing.name}" supprimé`);
  } else {
    ing.name = result.name;
    ing.amount = result.amount;
    ing.unit = result.unit;
    // Refaire le matching textuel des étapes (en cas de rename)
    if (typeof enrichStepIngredientIds === 'function') {
      recipe.steps = enrichStepIngredientIds(recipe.steps, recipe.ingredients);
    }
    // Recalculer saisonnalité si on a touché un nom
    if (typeof calculateSeasonality === 'function') {
      recipe.months = calculateSeasonality(recipe.ingredients);
    }
    updateRecipeAndSync(recipe, `ingrédient "${ing.name}" modifié`);
  }

  // Re-render la vue
  state.currentRecipe = { ...recipe, currentServings: state.currentRecipe?.currentServings || recipe.baseServings };
  renderRecipeDetail(recipe);
  showToast('Modifié ✓', 'success');
}
window.editIngredientInline = editIngredientInline;

async function addIngredientInline(recipeId) {
  const recipe = state.recipes.find(r => r.id === recipeId);
  if (!recipe) return;
  const result = await _showIngredientEditDialog({
    title: 'Ajouter un ingrédient',
    name: '',
    amount: '',
    unit: '',
    showDelete: false
  });
  if (!result || result.action === 'delete') return;
  if (!result.name.trim()) {
    showToast('Le nom est requis', 'error');
    return;
  }
  // Générer un id unique
  const usedIds = new Set(recipe.ingredients.map(i => i.id));
  let i = 1;
  while (usedIds.has('ing' + i)) i++;
  recipe.ingredients.push({
    id: 'ing' + i,
    name: result.name.trim(),
    amount: result.amount,
    unit: result.unit
  });
  // Re-matching automatique
  if (typeof enrichStepIngredientIds === 'function') {
    recipe.steps = enrichStepIngredientIds(recipe.steps, recipe.ingredients);
  }
  if (typeof calculateSeasonality === 'function') {
    recipe.months = calculateSeasonality(recipe.ingredients);
  }
  updateRecipeAndSync(recipe, `ingrédient "${result.name}" ajouté`);
  state.currentRecipe = { ...recipe, currentServings: state.currentRecipe?.currentServings || recipe.baseServings };
  renderRecipeDetail(recipe);
  showToast('Ajouté ✓', 'success');
}
window.addIngredientInline = addIngredientInline;

// Dialog spécifique pour édition ingrédient (3 champs : nom, quantité, unité)
function _showIngredientEditDialog({ title, name, amount, unit, showDelete }) {
  return new Promise(resolve => {
    const modal = _ensureDialogModal();
    const content = modal.querySelector('.ui-dialog-content');

    const safeName = escapeHtml(name || '');
    const safeAmount = amount === null || amount === undefined ? '' : String(amount);
    const safeUnit = escapeHtml(unit || '');

    content.innerHTML = `
      <div class="ui-dialog-body">
        <h2 class="ui-dialog-title">${escapeHtml(title)}</h2>
        <div class="ui-dialog-form">
          <label class="ui-dialog-field-label">Nom</label>
          <input type="text" id="ui-ing-name" class="ui-dialog-input" value="${safeName}" placeholder="Ex: Farine T55">
          <div class="ui-dialog-row">
            <div class="ui-dialog-col">
              <label class="ui-dialog-field-label">Quantité</label>
              <input type="text" id="ui-ing-amount" class="ui-dialog-input" inputmode="decimal" value="${safeAmount}" placeholder="200">
            </div>
            <div class="ui-dialog-col">
              <label class="ui-dialog-field-label">Unité</label>
              <input type="text" id="ui-ing-unit" class="ui-dialog-input" value="${safeUnit}" placeholder="g, ml, cl…">
            </div>
          </div>
        </div>
      </div>
      <div class="ui-dialog-actions">
        ${showDelete ? '<button class="btn-danger-link" id="ui-ing-delete">Supprimer</button>' : ''}
        <button class="btn-secondary" id="ui-ing-cancel">Annuler</button>
        <button class="btn-primary" id="ui-ing-confirm">Enregistrer</button>
      </div>
    `;
    modal.classList.remove('hidden');

    setTimeout(() => {
      const nameInput = document.getElementById('ui-ing-name');
      if (nameInput) { nameInput.focus(); nameInput.select(); }
    }, 50);

    const cleanup = () => modal.classList.add('hidden');

    document.getElementById('ui-ing-confirm').addEventListener('click', () => {
      const n = document.getElementById('ui-ing-name').value;
      const aRaw = document.getElementById('ui-ing-amount').value.trim().replace(',', '.');
      const u = document.getElementById('ui-ing-unit').value.trim();
      const a = aRaw === '' ? null : (isNaN(Number(aRaw)) ? aRaw : Number(aRaw));
      cleanup();
      resolve({ action: 'save', name: n, amount: a, unit: u });
    });
    document.getElementById('ui-ing-cancel').addEventListener('click', () => {
      cleanup();
      resolve(null);
    });
    if (showDelete) {
      document.getElementById('ui-ing-delete').addEventListener('click', () => {
        cleanup();
        resolve({ action: 'delete' });
      });
    }
    modal.querySelector('.ui-dialog-backdrop').addEventListener('click', () => {
      cleanup();
      resolve(null);
    }, { once: true });
  });
}

async function editStepInline(recipeId, idx) {
  const recipe = state.recipes.find(r => r.id === recipeId);
  if (!recipe) return;
  const step = recipe.steps[idx];
  if (!step) return;

  const result = await _showStepEditDialog({
    title: `Étape ${idx + 1}`,
    text: step.text || '',
    canDelete: recipe.steps.length > 1,
    canMoveUp: idx > 0,
    canMoveDown: idx < recipe.steps.length - 1
  });
  if (!result) return;

  if (result.action === 'delete') {
    if (!(await uiConfirm(`Supprimer cette étape ?`, { confirmLabel: 'Supprimer', danger: true }))) return;
    recipe.steps.splice(idx, 1);
    updateRecipeAndSync(recipe, `étape ${idx + 1} supprimée`);
  } else if (result.action === 'moveUp') {
    [recipe.steps[idx - 1], recipe.steps[idx]] = [recipe.steps[idx], recipe.steps[idx - 1]];
    updateRecipeAndSync(recipe, `étape ${idx + 1} déplacée`);
  } else if (result.action === 'moveDown') {
    [recipe.steps[idx], recipe.steps[idx + 1]] = [recipe.steps[idx + 1], recipe.steps[idx]];
    updateRecipeAndSync(recipe, `étape ${idx + 1} déplacée`);
  } else {
    step.text = result.text;
    if (typeof enrichStepIngredientIds === 'function') {
      recipe.steps = enrichStepIngredientIds(recipe.steps, recipe.ingredients);
    }
    updateRecipeAndSync(recipe, `étape ${idx + 1} modifiée`);
  }
  state.currentRecipe = { ...recipe, currentServings: state.currentRecipe?.currentServings || recipe.baseServings };
  renderRecipeDetail(recipe);
}
window.editStepInline = editStepInline;

async function addStepInline(recipeId) {
  const recipe = state.recipes.find(r => r.id === recipeId);
  if (!recipe) return;
  const result = await _showStepEditDialog({
    title: 'Nouvelle étape',
    text: '',
    canDelete: false,
    canMoveUp: false,
    canMoveDown: false
  });
  if (!result || result.action !== 'save') return;
  if (!result.text.trim()) {
    showToast('Le texte est requis', 'error');
    return;
  }
  recipe.steps.push({ text: result.text.trim(), ingredientIds: [] });
  if (typeof enrichStepIngredientIds === 'function') {
    recipe.steps = enrichStepIngredientIds(recipe.steps, recipe.ingredients);
  }
  updateRecipeAndSync(recipe, 'étape ajoutée');
  state.currentRecipe = { ...recipe, currentServings: state.currentRecipe?.currentServings || recipe.baseServings };
  renderRecipeDetail(recipe);
  showToast('Étape ajoutée ✓', 'success');
}
window.addStepInline = addStepInline;

// Dialog spécifique pour édition d'étape (textarea + boutons up/down/delete)
function _showStepEditDialog({ title, text, canDelete, canMoveUp, canMoveDown }) {
  return new Promise(resolve => {
    const modal = _ensureDialogModal();
    const content = modal.querySelector('.ui-dialog-content');

    const safeText = escapeHtml(text || '');
    const moveBtns = (canMoveUp || canMoveDown) ? `
      <div class="ui-dialog-move-row">
        ${canMoveUp ? '<button class="btn-secondary ui-dialog-move-btn" id="ui-step-up">↑ Monter</button>' : ''}
        ${canMoveDown ? '<button class="btn-secondary ui-dialog-move-btn" id="ui-step-down">↓ Descendre</button>' : ''}
      </div>
    ` : '';

    content.innerHTML = `
      <div class="ui-dialog-body">
        <h2 class="ui-dialog-title">${escapeHtml(title)}</h2>
        <textarea id="ui-step-text" class="ui-dialog-textarea" rows="4" placeholder="Description de l'étape...">${safeText}</textarea>
        ${moveBtns}
      </div>
      <div class="ui-dialog-actions">
        ${canDelete ? '<button class="btn-danger-link" id="ui-step-delete">Supprimer</button>' : ''}
        <button class="btn-secondary" id="ui-step-cancel">Annuler</button>
        <button class="btn-primary" id="ui-step-confirm">Enregistrer</button>
      </div>
    `;
    modal.classList.remove('hidden');

    setTimeout(() => {
      const ta = document.getElementById('ui-step-text');
      if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
    }, 50);

    const cleanup = () => modal.classList.add('hidden');

    document.getElementById('ui-step-confirm').addEventListener('click', () => {
      const v = document.getElementById('ui-step-text').value;
      cleanup();
      resolve({ action: 'save', text: v });
    });
    document.getElementById('ui-step-cancel').addEventListener('click', () => {
      cleanup();
      resolve(null);
    });
    if (canDelete) {
      document.getElementById('ui-step-delete').addEventListener('click', () => {
        cleanup();
        resolve({ action: 'delete' });
      });
    }
    if (canMoveUp) {
      document.getElementById('ui-step-up').addEventListener('click', () => {
        cleanup();
        resolve({ action: 'moveUp' });
      });
    }
    if (canMoveDown) {
      document.getElementById('ui-step-down').addEventListener('click', () => {
        cleanup();
        resolve({ action: 'moveDown' });
      });
    }
    modal.querySelector('.ui-dialog-backdrop').addEventListener('click', () => {
      cleanup();
      resolve(null);
    }, { once: true });
  });
}

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

  // Section garde-manger en bas (toujours visible, même si vide)
  const days = getPantryDefaultDays();
  html += `<div class="shopping-pantry-info ${state.pantry.length === 0 ? 'is-empty' : ''}">
    <div class="shopping-pantry-header">
      <strong>📦 Garde-manger ${state.pantry.length > 0 ? `(${state.pantry.length})` : ''}</strong>
      <button class="shopping-pantry-add" onclick="addPantryItemFromInput()" title="Ajouter un ingrédient">+</button>
    </div>`;

  if (state.pantry.length === 0) {
    html += `<p class="shopping-pantry-hint">Tapez 📦 sur un ingrédient pour le cacher des courses pendant ${days} jour${days > 1 ? 's' : ''}.</p>`;
  } else {
    html += `<p class="shopping-pantry-hint">Ces ingrédients sont cachés des courses. Tapez sur un chip pour étendre la durée ou le retirer.</p>
      <div class="shopping-pantry-list">`;
    // Tri par durée restante croissante
    const sorted = [...state.pantry].sort((a, b) => (a.until || 0) - (b.until || 0));
    for (const p of sorted) {
      const remaining = Math.max(0, Math.ceil((p.until - Date.now()) / (24 * 3600 * 1000)));
      const safeName = escapeHtml(p.name).replace(/'/g, "\\'");
      const urgentClass = remaining <= 1 ? 'is-urgent' : '';
      html += `<button class="shopping-pantry-chip ${urgentClass}" onclick="openPantryItemActions('${safeName}')">
        ${escapeHtml(p.name)} <span>${remaining}j</span>
      </button>`;
    }
    html += `</div>`;
  }
  html += `</div>`;

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

async function clearShopping() {
  if (state.shopping.length === 0) return;
  if (!(await uiConfirm('Vider la liste de courses ?'))) return;
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

MULTI-RECETTES (économie de tokens) :
- Si l'utilisateur demande explicitement PLUSIEURS recettes en un seul message (ex: "Crée-moi 3 recettes : pizza, lasagnes, tiramisu" OU "Voici 5 recettes à enregistrer..."), tu peux les renvoyer toutes dans le même appel.
- Format : un bloc <recipe>...</recipe> par recette, séparés par un saut de ligne. L'app extraira chacun individuellement.
- Chaque recette doit être complète et autonome (avec son propre schéma JSON complet).
- Si l'utilisateur n'a pas explicitement demandé plusieurs recettes, n'en renvoie qu'UNE seule.

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
  "dietTags": ["sans-lactose"],
  "source": { "type": "web", "url": "https://...", "siteName": "Marmiton" },
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
- "tags" : 0 à 4 tags pertinents. Suggestions : "rapide" (<30min total), "facile", "festif", "réconfortant", "été", "hiver", "économique", "kids-friendly". N'invente pas de tags trop spécifiques.
- "dietTags" : tags RÉGIME parmi cette liste EXACTE uniquement : "vegan", "vegetarien", "sans-gluten", "sans-lactose", "low-fodmap", "high-fodmap", "halal", "casher", "sans-sucre", "keto". Ne mets QUE ceux qui s'appliquent objectivement.
  Concernant les FODMAP : ne renseigne PAS "low-fodmap" / "high-fodmap" toi-même, l'app les calcule automatiquement à partir des ingrédients. Tu peux les omettre.
- "source" : si tu trouves une source clairement identifiable (URL fournie par l'utilisateur, nom de livre + page, compte Instagram), remplis cet objet. Types possibles : "web" (siteName + url), "book" (title + page), "instagram" (account + url). null si non identifiable.
- "ingredientIds" lie chaque étape à ses ingrédients (avec leurs IDs).

Règles CRITIQUES pour LIER les étapes aux ingrédients (ingredientIds):
- Quand une étape mentionne un ingrédient, MÊME EN VERSION COURTE OU PARTIELLE, tu DOIS le lier à son ingredientId.
- Exemple : ingrédient "Farine T45 (500g)" → étape "Mélanger la farine avec l'eau" → DOIT inclure l'id de la farine.
- Exemple : ingrédient "Beurre demi-sel" → étape "Ajouter le beurre" → DOIT lier.
- Exemple : ingrédient "Tomates cerises" → étape "Disposer les tomates" → DOIT lier.
- Si une étape mentionne plusieurs ingrédients ("mélanger farine, sucre et œufs"), TOUS doivent être liés.
- Si un mot dans une étape correspond partiellement à un ingrédient (le nom complet contient ce mot), c'est UN MATCH.
- Cas particulier : "ail" dans une étape lie à "gousses d'ail" ou "ail rose". "Lait" lie à "lait demi-écrémé". "Huile" lie à "huile d'olive" sauf si plusieurs huiles sont listées.
- N'omets PAS un ingredientId même si tu juges l'étape "évidente". Tous les ingrédients utilisés dans une étape doivent y figurer.
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
  // Pour rétrocompat : extrait juste la première recette
  const results = extractAllRecipesFromResponse(text);
  return {
    text: results.text,
    recipe: results.recipes[0] || null
  };
}

// Parse 1 OU plusieurs blocs <recipe>...</recipe> dans la réponse
function extractAllRecipesFromResponse(text) {
  const matches = [...text.matchAll(/<recipe>([\s\S]*?)<\/recipe>/g)];
  if (matches.length === 0) return { text, recipes: [] };

  const recipes = [];
  for (const m of matches) {
    const parsed = parseRecipeJson(m[1]);
    if (parsed) recipes.push(parsed);
  }

  // Texte nettoyé : tout sans les blocs <recipe>
  const cleanText = text.replace(/<recipe>[\s\S]*?<\/recipe>/g, '').trim();
  return { text: cleanText, recipes };
}

function parseRecipeJson(rawJson) {
  let recipeJson = rawJson.trim().replace(/^```json\s*/i, '').replace(/```$/, '').trim();
  try {
    const recipe = JSON.parse(recipeJson);
    if (!recipe.title || !Array.isArray(recipe.ingredients) || !Array.isArray(recipe.steps)) {
      return null;
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
    recipe.prepTime = recipe.prepTime != null && !isNaN(Number(recipe.prepTime)) ? Number(recipe.prepTime) : null;
    recipe.cookTime = recipe.cookTime != null && !isNaN(Number(recipe.cookTime)) ? Number(recipe.cookTime) : null;
    recipe.tags = Array.isArray(recipe.tags) ? recipe.tags.slice(0, 6).map(t => String(t).toLowerCase()) : [];

    const VALID_DIETS = ['vegan', 'vegetarien', 'sans-gluten', 'sans-lactose', 'low-fodmap', 'high-fodmap', 'halal', 'casher', 'sans-sucre', 'keto'];
    let dietTags = Array.isArray(recipe.dietTags)
      ? recipe.dietTags.map(t => String(t).toLowerCase())
      : [];
    // Migration : ancien tag 'fodmap' (sans précision) → on l'ignore (sera recalculé)
    dietTags = dietTags.filter(t => t !== 'fodmap');
    // Valider contre la whitelist
    dietTags = dietTags.filter(t => VALID_DIETS.includes(t));

    // Calcul auto FODMAP si l'utilisateur n'a pas explicitement choisi un tag FODMAP
    const hasFodmapTag = dietTags.some(t => t === 'low-fodmap' || t === 'high-fodmap');
    if (!hasFodmapTag && typeof calculateFodmapTags === 'function') {
      const autoTags = calculateFodmapTags(recipe.ingredients);
      dietTags = dietTags.concat(autoTags);
    }
    recipe.dietTags = dietTags;

    if (recipe.source && typeof recipe.source === 'object') {
      const validTypes = ['web', 'book', 'instagram'];
      if (!validTypes.includes(recipe.source.type)) recipe.source = null;
    } else {
      recipe.source = null;
    }

    // Fallback : matching textuel pour combler les ingredientIds
    recipe.steps = enrichStepIngredientIds(recipe.steps, recipe.ingredients);

    return recipe;
  } catch (e) {
    console.error('Recipe parse error:', e);
    return null;
  }
}

// Améliore le matching ingrédient ↔ étape par recherche textuelle
// Capte les cas où Claude omettrait un id (ex: étape "Mélanger la farine" + ingrédient "Farine T45" → match)
function enrichStepIngredientIds(steps, ingredients) {
  if (!steps || !ingredients) return steps;

  // Stop words : articles + unités + petits mots
  const STOP_WORDS = new Set([
    'de', 'la', 'le', 'les', 'du', 'des', 'un', 'une', 'à', 'au', 'aux',
    'et', 'ou', 'avec', 'sans', 'pour', 'dans', 'sur', 'en',
    'cl', 'ml', 'dl', 'g', 'kg', 'mg', 'l',
    'cuil', 'cuillere', 'cuilleres', 'cs', 'cc', 'tsp', 'tbsp',
    'pcs', 'piece', 'pieces', 'tranche', 'tranches', 'gousse', 'gousses',
    'bouquet', 'bouquets', 'pincee', 'pincees',
    // Forme normalisée sans accent
    'ufs', 'uf', // (œufs après suppression accent → uf/ufs ; ignoré seul)
    'the', 'lit' // (mots trop courts ambigus)
  ]);

  // Mots qui SEULS sont trop génériques pour matcher (besoin d'un autre mot)
  const WEAK_WORDS = new Set([
    'sucre', 'sel', 'eau', 'huile', 'fruit', 'fruits', 'legume', 'legumes',
    'fromage', 'viande', 'sauce', 'creme'
  ]);

  // Singulariser/pluraliser un mot pour matcher les deux formes
  function variants(word) {
    const v = new Set([word]);
    if (word.endsWith('x')) v.add(word.slice(0, -1));
    if (word.endsWith('s')) v.add(word.slice(0, -1));
    v.add(word + 's');
    return [...v];
  }

  // Pré-calcul : mots-clés par ingrédient
  const ingredientKeywords = ingredients.map(ing => {
    const normalized = (ing.name || '').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\([^)]*\)/g, ' ')
      .replace(/[^a-z0-9\s'-]/g, ' ');
    const allWords = normalized.split(/\s+/).filter(w => w.length >= 3 && !STOP_WORDS.has(w));
    // Mot "fort" : pas dans WEAK_WORDS et de longueur ≥ 4
    const strongWords = allWords.filter(w => !WEAK_WORDS.has(w) && w.length >= 4);
    // Mots faibles (génériques) qu'on n'utilisera que si combinés
    const weakWords = allWords.filter(w => WEAK_WORDS.has(w) || w.length === 3);
    return { id: ing.id, strongWords, weakWords, allWords, fullName: normalized.trim() };
  });

  return steps.map(step => {
    const stepText = (step.text || '').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s'-]/g, ' ');
    const existingIds = new Set(step.ingredientIds || []);

    for (const ing of ingredientKeywords) {
      if (existingIds.has(ing.id)) continue;
      if (ing.allWords.length === 0) continue;

      // Test fonction pour matcher un mot avec ses variantes
      const wordMatches = (w) => {
        const escaped = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp(`\\b(${variants(escaped).join('|')})\\b`, 'i');
        return re.test(stepText);
      };

      // Stratégie 1 : au moins un mot FORT dans l'étape
      let matched = ing.strongWords.some(wordMatches);

      // Stratégie 2 : si pas de mot fort, accepter un mot FAIBLE seulement si
      // c'est le SEUL mot significatif de l'ingrédient (ex: "Sel", "Sucre" tout seul)
      if (!matched && ing.strongWords.length === 0 && ing.weakWords.length > 0) {
        matched = ing.weakWords.some(wordMatches);
      }

      if (matched) existingIds.add(ing.id);
    }

    return { ...step, ingredientIds: Array.from(existingIds) };
  });
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

    const { text: cleanText, recipes } = extractAllRecipesFromResponse(responseText);

    state.chatHistory.push({ role: 'assistant', content: responseText });

    if (cleanText) {
      addChatMessage('assistant', cleanText);
    }

    if (recipes.length > 1) {
      // Mode multi-recettes : on en stocke plusieurs en file et on les valide une par une
      state.pendingRecipesQueue = recipes.map(r => {
        r.months = calculateSeasonality(r.ingredients);
        r.id = uid();
        r.createdAt = Date.now();
        return r;
      });
      addChatMessage('assistant', `📋 J'ai extrait ${recipes.length} recettes. Je vais te les présenter une par une pour validation.`);
      setTimeout(() => {
        const next = state.pendingRecipesQueue.shift();
        state.pendingRecipe = next;
        openValidationModal(next);
      }, 800);
    } else if (recipes.length === 1) {
      const recipe = recipes[0];
      recipe.months = calculateSeasonality(recipe.ingredients);
      recipe.id = uid();
      recipe.createdAt = Date.now();
      state.pendingRecipe = recipe;
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
        <div class="servings-controls" style="background: var(--color-bg); padding: 4px; border-radius: var(--radius-full); display: inline-flex;">
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
      <p style="color: var(--color-gray-600); font-size: 12px; margin-bottom: 10px;">Calculé automatiquement selon les ingrédients. Modifiable.</p>
      <div class="validation-month-grid" id="val-months">
        ${[1,2,3,4,5,6,7,8,9,10,11,12].map(m => `
          <button class="validation-month ${recipe.months && recipe.months.includes(m) ? 'selected' : ''}" data-month="${m}">${MONTH_NAMES[m]}</button>
        `).join('')}
      </div>
      <p style="color: var(--color-gray-600); font-size: 11px; margin-top: 8px;">Aucun mois sélectionné = recette toute saison</p>
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

// Template HTML de l'écran d'accueil du chat (réutilisable pour le reset)
const CHAT_WELCOME_HTML = `
  <div class="chat-welcome">
    <div class="chat-welcome-blob"></div>
    <h2>Créez une recette</h2>
    <p>Avec l'aide de l'IA ou en saisie manuelle, votre choix.</p>
    <div class="chat-suggestions-label">Avec l'IA</div>
    <div class="chat-suggestions">
      <button class="chat-suggestion" data-suggest="📹 Coller un lien vidéo ou article">
        <span>📹</span><span>Coller un lien vidéo ou article</span>
      </button>
      <button class="chat-suggestion" data-suggest="📸 Joindre des photos d'une recette">
        <span>📸</span><span>Joindre des photos d'une recette</span>
      </button>
      <button class="chat-suggestion" data-suggest="✍️ Décrire une recette">
        <span>✍️</span><span>Décrire une recette en texte libre</span>
      </button>
      <button class="chat-suggestion" id="generate-menu-btn">
        <span>🍱</span><span>Suggérer un menu depuis ma bibliothèque</span>
      </button>
    </div>
    <div class="chat-suggestions-divider"><span>ou</span></div>
    <div class="chat-suggestions">
      <button class="chat-suggestion chat-suggestion-manual" id="manual-create-btn">
        <span>✏️</span><span>Saisir une recette à la main</span>
      </button>
    </div>
  </div>
`;

// Reset complet du chat : retour à l'écran initial vierge
function resetChatView() {
  state.chatHistory = [];
  state.chatAttachments = [];
  state.pendingRecipe = null;
  state.editingRecipeId = null;

  const msgs = document.getElementById('chat-messages');
  if (msgs) msgs.innerHTML = CHAT_WELCOME_HTML;

  const input = document.getElementById('chat-input');
  if (input) {
    input.value = '';
    input.style.height = 'auto';
  }

  const attachments = document.getElementById('chat-attachments');
  if (attachments) {
    attachments.innerHTML = '';
    attachments.classList.add('hidden');
  }

  rebindChatSuggestions();
}
window.resetChatView = resetChatView;

// ============================================
// CLAVIER VIRTUEL : repositionner la barre input
// ============================================
// Problème : avec position:fixed bottom, la barre chat se retrouve cachée sous
// le clavier virtuel (iOS Safari et Android Chrome). Solution : on écoute
// visualViewport et on ajuste dynamiquement la position avec une CSS variable.

function initKeyboardHandling() {
  if (!window.visualViewport) return;

  const root = document.documentElement;
  let lastOffset = 0;

  const update = () => {
    const vv = window.visualViewport;
    // Espace en bas masqué par le clavier (positif quand clavier ouvert)
    const kbHeight = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    
    if (kbHeight > 100) {
      // Clavier ouvert : on colle la barre input à `kbHeight` du bas pour qu'elle soit juste au-dessus du clavier
      root.style.setProperty('--input-bar-bottom', `${kbHeight}px`);
      document.body.classList.add('keyboard-open');
    } else {
      // Clavier fermé : barre juste au-dessus de la nav
      root.style.setProperty('--input-bar-bottom', 'var(--nav-h)');
      document.body.classList.remove('keyboard-open');
    }
    lastOffset = kbHeight;
  };

  window.visualViewport.addEventListener('resize', update);
  window.visualViewport.addEventListener('scroll', update);
  update();
}

async function rebindChatSuggestions() {
  document.querySelectorAll('.chat-suggestion[data-suggest]').forEach(btn => {
    btn.onclick = () => {
      const input = document.getElementById('chat-input');
      input.value = btn.dataset.suggest;
      input.focus();
    };
  });
  const manualBtn = document.getElementById('manual-create-btn');
  if (manualBtn) manualBtn.onclick = createManualRecipe;
  const menuBtn = document.getElementById('generate-menu-btn');
  if (menuBtn) {
    menuBtn.onclick = async (e) => {
      e.stopPropagation();
      const occasion = await uiPrompt("Pour quelle occasion ? (ex: \"menu végétarien rapide\", \"dîner d'été pour 6\", \"soirée raclette\")", 'Menu équilibré pour ce soir');
      if (occasion) generateMenu(occasion);
    };
  }
}

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

  // Toujours ré-enrichir les ingredientIds des étapes par matching textuel
  // (rattrape les oublis de l'IA et les ingrédients modifiés à la main)
  if (typeof enrichStepIngredientIds === 'function') {
    recipe.steps = enrichStepIngredientIds(recipe.steps, recipe.ingredients);
  }

  if (existing) {
    // Mode édition : remplacer + logger
    recipe.changeLog = existing.changeLog || [];
    recipe.changeLog.push({ at: Date.now(), action: 'recette modifiée' });
    if (recipe.changeLog.length > 20) recipe.changeLog = recipe.changeLog.slice(-20);
    state.recipes = state.recipes.map(r => r.id === editingId ? recipe : r);
  } else {
    // Nouvelle recette : logger la création
    recipe.changeLog = [{ at: Date.now(), action: 'recette créée' }];
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
  } else if (state.pendingRecipesQueue && state.pendingRecipesQueue.length > 0) {
    // File de recettes en attente (multi-recettes en un seul appel IA) : passer à la suivante
    closeValidationModal(true);
    const next = state.pendingRecipesQueue.shift();
    state.pendingRecipe = next;
    showToast(`Suivante : ${next.title}`, 'success');
    setTimeout(() => openValidationModal(next), 400);
  } else {
    // Nouvelle recette : reset complet du chat pour pouvoir en créer une autre
    resetChatView();
    navigateTo('library');
  }
}

async function closeValidationModal(skipHistory) {
  const modal = document.getElementById('validation-modal');
  if (modal.classList.contains('hidden')) return;
  if (!skipHistory) {
    // Si on est au milieu d'une file multi-recettes, prévenir l'utilisateur
    if (state.pendingRecipesQueue && state.pendingRecipesQueue.length > 0) {
      if (!(await uiConfirm(`Il reste ${state.pendingRecipesQueue.length} recette(s) à valider. Annuler tout ?`))) return;
      state.pendingRecipesQueue = [];
    }
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
  // Pantry days
  const pantrySelect = document.getElementById('settings-pantry-days');
  if (pantrySelect) pantrySelect.value = String(getPantryDefaultDays());
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

async function clearAllData() {
  if (!(await uiConfirm('Supprimer TOUTES vos recettes et données ? Cette action est irréversible.', { title: 'Suppression définitive', confirmLabel: 'Tout supprimer', danger: true }))) return;
  if (!(await uiConfirm('Vraiment ? Cette action ne peut pas être annulée.', { title: 'Confirmation finale', confirmLabel: 'Oui, tout supprimer', danger: true }))) return;
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
  if (!(await uiConfirm('Vider le cache et recharger l\'app ? Vos recettes ne seront PAS supprimées.'))) return;
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
// PLANNING DES REPAS (2 semaines)
// ============================================

// Décalage en jours par rapport à la semaine courante (0 = cette semaine, 1 = +1 semaine, etc.)
let _planningWeekOffset = 0;
// Vue : 'week' (7 jours par défaut) ou '2weeks' (14 jours)
let _planningView = 'week';

const MEAL_SLOTS = [
  { id: 'midi', label: 'Midi', emoji: '☀️' },
  { id: 'soir', label: 'Soir', emoji: '🌙' },
  { id: 'autre', label: 'Autre', emoji: '🥐' } // petit-déj, goûter, apéro...
];

const DAY_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const DAY_LABELS_LONG = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

// Retourne le lundi de la semaine de la date donnée
function getMonday(d) {
  const date = new Date(d);
  const day = date.getDay() || 7; // 0 (dim) → 7
  if (day !== 1) date.setDate(date.getDate() - (day - 1));
  date.setHours(0, 0, 0, 0);
  return date;
}

// Retourne 7 ou 14 jours selon _planningView
function getPlanningDays() {
  const monday = getMonday(new Date());
  monday.setDate(monday.getDate() + _planningWeekOffset * 7);
  const days = [];
  const total = _planningView === '2weeks' ? 14 : 7;
  for (let i = 0; i < total; i++) {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    days.push(d);
  }
  return days;
}

// Lit les recettes d'un slot, en gérant l'ancien et le nouveau format
// Ancien : { recipeId, servings, ... }
// Nouveau : { recipeIds: [{id, servings}, ...], ... }
// Retourne toujours un tableau [{id, servings}, ...] (vide si slot vide ou soft-deleted)
function getSlotRecipes(entry) {
  if (!entry || entry.deletedAt) return [];
  // Nouveau format
  if (Array.isArray(entry.recipeIds)) {
    return entry.recipeIds.filter(r => r && r.id);
  }
  // Ancien format : un recipeId simple
  if (entry.recipeId) {
    return [{ id: entry.recipeId, servings: entry.servings }];
  }
  return [];
}

function renderPlanning() {
  const grid = document.getElementById('planning-grid');
  if (!grid) return;
  const days = getPlanningDays();
  const today = formatPlanningDate(new Date());

  // Header : période + 2 boutons segmentés 1 semaine / 2 semaines
  const period = document.getElementById('planning-period');
  if (period) {
    const start = days[0];
    const end = days[days.length - 1];
    const sameMonth = start.getMonth() === end.getMonth();
    const startFmt = start.toLocaleDateString('fr-FR', { day: 'numeric', month: sameMonth ? undefined : 'short' });
    const endFmt = end.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    period.innerHTML = `
      <span class="planning-period-range">${startFmt} → ${endFmt}</span>
      <div class="planning-view-segmented">
        <button class="planning-view-seg ${_planningView === 'week' ? 'active' : ''}" onclick="setPlanningView('week')">1 semaine</button>
        <button class="planning-view-seg ${_planningView === '2weeks' ? 'active' : ''}" onclick="setPlanningView('2weeks')">2 semaines</button>
      </div>
    `;
  }

  let html = '';

  // Découper en semaines (1 ou 2)
  const numWeeks = _planningView === '2weeks' ? 2 : 1;
  for (let weekIdx = 0; weekIdx < numWeeks; weekIdx++) {
    const weekDays = days.slice(weekIdx * 7, weekIdx * 7 + 7);
    if (weekDays.length === 0) continue;
    const weekLabel = numWeeks === 2 ? (weekIdx === 0 ? 'Cette semaine' : 'Semaine suivante') : 'Cette semaine';
    html += `<div class="planning-week"><div class="planning-week-label">${weekLabel}</div>`;

    for (const d of weekDays) {
      const dateStr = formatPlanningDate(d);
      const isToday = dateStr === today;
      const isPast = dateStr < today;
      const dayLabel = DAY_LABELS_LONG[(d.getDay() + 6) % 7];
      const dayNum = d.getDate();
      const monthShort = d.toLocaleDateString('fr-FR', { month: 'short' });

      html += `<div class="planning-day ${isToday ? 'is-today' : ''} ${isPast ? 'is-past' : ''}">
        <div class="planning-day-header">
          <span class="planning-day-name">${dayLabel}</span>
          <span class="planning-day-date">${dayNum} ${monthShort}</span>
        </div>
        <div class="planning-day-slots">`;

      for (const slot of MEAL_SLOTS) {
        const key = `${dateStr}-${slot.id}`;
        const entry = state.planning[key];
        const recipes = getSlotRecipes(entry);

        if (recipes.length === 0) {
          html += `<div class="planning-slot is-empty" onclick="openPlanningSlot('${dateStr}', '${slot.id}')">
            <div class="planning-slot-label">${slot.emoji} ${slot.label}</div>
            <div class="planning-slot-add">+ Choisir une recette</div>
          </div>`;
        } else {
          // Slot rempli avec une ou plusieurs recettes
          const items = recipes.map((rr, idx) => {
            const recipe = state.recipes.find(rcp => rcp.id === rr.id);
            if (!recipe) {
              return `<div class="planning-slot-recipe is-missing">
                <span class="planning-slot-title">Recette introuvable</span>
                <button class="planning-slot-mini-remove" onclick="event.stopPropagation(); removeRecipeFromSlot('${dateStr}', '${slot.id}', '${rr.id}')" aria-label="Retirer">×</button>
              </div>`;
            }
            return `<div class="planning-slot-recipe">
              <span class="planning-slot-emoji">${recipe.photo ? `<img src="${recipe.photo}" alt="">` : (recipe.emoji || '🍽️')}</span>
              <span class="planning-slot-title">${escapeHtml(recipe.title)}</span>
              <span class="planning-slot-servings">${rr.servings || recipe.baseServings} pers.</span>
              <button class="planning-slot-mini-remove" onclick="event.stopPropagation(); removeRecipeFromSlot('${dateStr}', '${slot.id}', '${rr.id}')" aria-label="Retirer">×</button>
            </div>`;
          }).join('');

          html += `<div class="planning-slot is-filled" onclick="openPlanningSlot('${dateStr}', '${slot.id}')">
            <div class="planning-slot-label">${slot.emoji} ${slot.label}${recipes.length > 1 ? ` <span class="planning-slot-count">×${recipes.length}</span>` : ''}</div>
            <div class="planning-slot-recipes-list">${items}</div>
            <div class="planning-slot-add-more">+ Ajouter une recette</div>
          </div>`;
        }
      }

      html += `</div></div>`;
    }
    html += `</div>`;
  }

  grid.innerHTML = html;
}

function setPlanningView(view) {
  if (view !== 'week' && view !== '2weeks') return;
  if (_planningView === view) return;
  _planningView = view;
  localStorage.setItem('mr_planning_view', _planningView);
  renderPlanning();
}
window.setPlanningView = setPlanningView;

// Compat : ancien toggle (au cas où appelé ailleurs)
function togglePlanningView() {
  setPlanningView(_planningView === 'week' ? '2weeks' : 'week');
}
window.togglePlanningView = togglePlanningView;

// État des filtres du picker planning
const _planningPickerFilters = {
  category: 'all',
  dietTags: [],      // tableau d'ids
  seasonOnly: false, // true = uniquement de saison
  sort: 'alpha'      // 'alpha' | 'recent' | 'favorites'
};

function openPlanningSlot(dateStr, slotId) {
  // Construire la barre de filtres
  const catChips = `
    <button class="picker-filter-chip ${_planningPickerFilters.category === 'all' ? 'active' : ''}" data-filter-cat="all">Toutes</button>
    ${RECIPE_CATEGORIES.map(c =>
      `<button class="picker-filter-chip ${_planningPickerFilters.category === c.id ? 'active' : ''}" data-filter-cat="${c.id}">${c.emoji} ${escapeHtml(c.label)}</button>`
    ).join('')}
  `;

  // Régimes : FODMAP visibles par défaut, le reste dans un collapse
  const FODMAP_IDS = ['low-fodmap', 'high-fodmap'];
  const fodmapChips = DIET_TAGS
    .filter(t => FODMAP_IDS.includes(t.id))
    .map(t => {
      const active = _planningPickerFilters.dietTags.includes(t.id);
      return `<button class="picker-filter-chip diet ${active ? 'active' : ''}" data-filter-diet="${t.id}" style="--diet-color:${t.color}">${t.emoji} ${escapeHtml(t.label)}</button>`;
    }).join('');
  const otherDietChips = DIET_TAGS
    .filter(t => !FODMAP_IDS.includes(t.id))
    .map(t => {
      const active = _planningPickerFilters.dietTags.includes(t.id);
      return `<button class="picker-filter-chip diet ${active ? 'active' : ''}" data-filter-diet="${t.id}" style="--diet-color:${t.color}">${t.emoji} ${escapeHtml(t.label)}</button>`;
    }).join('');

  // Catégorie active ? Si oui, on ouvre par défaut
  const catActive = _planningPickerFilters.category && _planningPickerFilters.category !== 'all';
  // Régimes "autres" actifs ? Si oui, on ouvre le collapse
  const otherDietActive = _planningPickerFilters.dietTags.some(d => !FODMAP_IDS.includes(d));

  const html = `
    <div class="modal-header">
      <h2>Choisir une recette</h2>
      <button class="modal-close" onclick="closePlanningSlotPicker()" aria-label="Fermer">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 18L18 6M6 6l12 12" stroke-linecap="round"/></svg>
      </button>
    </div>
    <div class="planning-picker-body">
      <input type="search" id="planning-search" class="search-input" placeholder="Rechercher une recette...">

      <div class="picker-filters-row">
        <div class="picker-filter-section">
          <div class="picker-filter-label">FODMAP</div>
          <div class="picker-filter-chips">
            ${fodmapChips}
            <button class="picker-filter-chip picker-filter-more ${otherDietActive ? 'has-active' : ''}" id="picker-toggle-other-diets" type="button">
              <span class="picker-filter-more-label">Voir autres régimes</span>
              <span class="picker-filter-more-icon">▼</span>
            </button>
          </div>
          <div class="picker-filter-chips picker-other-diets ${otherDietActive ? '' : 'hidden'}" id="picker-other-diets-row">
            ${otherDietChips}
          </div>
        </div>

        <div class="picker-filter-section">
          <button class="picker-filter-collapse-toggle ${catActive ? 'has-active' : ''}" id="picker-toggle-category" type="button">
            <span>Catégorie${catActive ? ' (1)' : ''}</span>
            <span class="picker-filter-more-icon">▼</span>
          </button>
          <div class="picker-filter-chips picker-category-row ${catActive ? '' : 'hidden'}" id="picker-category-row">
            ${catChips}
          </div>
        </div>

        <div class="picker-filter-section picker-filter-controls">
          <label class="picker-filter-toggle">
            <input type="checkbox" id="picker-filter-season" ${_planningPickerFilters.seasonOnly ? 'checked' : ''}>
            <span>De saison uniquement</span>
          </label>
          <div class="picker-filter-sort">
            <span class="picker-filter-label-inline">Tri :</span>
            <select id="picker-filter-sort" class="picker-sort-select">
              <option value="alpha" ${_planningPickerFilters.sort === 'alpha' ? 'selected' : ''}>A → Z</option>
              <option value="recent" ${_planningPickerFilters.sort === 'recent' ? 'selected' : ''}>Récentes</option>
              <option value="favorites" ${_planningPickerFilters.sort === 'favorites' ? 'selected' : ''}>Favorites d'abord</option>
            </select>
          </div>
        </div>
      </div>

      <div id="planning-recipes-list" class="planning-recipes-list"></div>
    </div>
  `;

  let modal = document.getElementById('planning-picker-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'planning-picker-modal';
    modal.className = 'modal hidden';
    modal.innerHTML = '<div class="modal-backdrop"></div><div class="modal-content"></div>';
    document.body.appendChild(modal);
    modal.querySelector('.modal-backdrop').addEventListener('click', closePlanningSlotPicker);
  }
  modal.querySelector('.modal-content').innerHTML = html;
  modal.classList.remove('hidden');
  modal.dataset.dateStr = dateStr;
  modal.dataset.slotId = slotId;

  // Bindings filtres
  modal.querySelectorAll('[data-filter-cat]').forEach(btn => {
    btn.addEventListener('click', () => {
      _planningPickerFilters.category = btn.dataset.filterCat;
      modal.querySelectorAll('[data-filter-cat]').forEach(b => b.classList.toggle('active', b.dataset.filterCat === _planningPickerFilters.category));
      renderPlanningPickerList(document.getElementById('planning-search').value);
    });
  });
  modal.querySelectorAll('[data-filter-diet]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.filterDiet;
      const idx = _planningPickerFilters.dietTags.indexOf(id);
      if (idx >= 0) _planningPickerFilters.dietTags.splice(idx, 1);
      else _planningPickerFilters.dietTags.push(id);
      btn.classList.toggle('active');
      renderPlanningPickerList(document.getElementById('planning-search').value);
    });
  });
  document.getElementById('picker-filter-season').addEventListener('change', e => {
    _planningPickerFilters.seasonOnly = e.target.checked;
    renderPlanningPickerList(document.getElementById('planning-search').value);
  });
  document.getElementById('picker-filter-sort').addEventListener('change', e => {
    _planningPickerFilters.sort = e.target.value;
    renderPlanningPickerList(document.getElementById('planning-search').value);
  });

  // Toggle "Voir autres régimes"
  const toggleOtherBtn = document.getElementById('picker-toggle-other-diets');
  if (toggleOtherBtn) {
    toggleOtherBtn.addEventListener('click', () => {
      const row = document.getElementById('picker-other-diets-row');
      const isOpen = !row.classList.contains('hidden');
      row.classList.toggle('hidden');
      const labelEl = toggleOtherBtn.querySelector('.picker-filter-more-label');
      const iconEl = toggleOtherBtn.querySelector('.picker-filter-more-icon');
      if (labelEl) labelEl.textContent = isOpen ? 'Voir autres régimes' : 'Masquer';
      if (iconEl) iconEl.textContent = isOpen ? '▼' : '▲';
    });
  }

  // Toggle "Catégorie"
  const toggleCatBtn = document.getElementById('picker-toggle-category');
  if (toggleCatBtn) {
    toggleCatBtn.addEventListener('click', () => {
      const row = document.getElementById('picker-category-row');
      const isOpen = !row.classList.contains('hidden');
      row.classList.toggle('hidden');
      const iconEl = toggleCatBtn.querySelector('.picker-filter-more-icon');
      if (iconEl) iconEl.textContent = isOpen ? '▼' : '▲';
    });
  }

  renderPlanningPickerList('');
  document.getElementById('planning-search').addEventListener('input', e => {
    renderPlanningPickerList(e.target.value);
  });
  pushOverlay('planning-picker');
}
window.openPlanningSlot = openPlanningSlot;

function renderPlanningPickerList(query) {
  const wrap = document.getElementById('planning-recipes-list');
  if (!wrap) return;
  const q = (query || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  const currentMonth = new Date().getMonth() + 1;
  let recipes = [...state.recipes];

  // Filtre texte
  if (q) {
    recipes = recipes.filter(r => {
      const title = (r.title || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const tags = (r.tags || []).map(t => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
      return title.includes(q) || tags.some(t => t.includes(q));
    });
  }
  // Filtre catégorie
  if (_planningPickerFilters.category && _planningPickerFilters.category !== 'all') {
    recipes = recipes.filter(r => r.category === _planningPickerFilters.category);
  }
  // Filtre régime (intersection : la recette doit avoir TOUS les régimes cochés)
  if (_planningPickerFilters.dietTags.length > 0) {
    recipes = recipes.filter(r => {
      const tags = r.dietTags || [];
      return _planningPickerFilters.dietTags.every(d => tags.includes(d));
    });
  }
  // Filtre saison
  if (_planningPickerFilters.seasonOnly) {
    recipes = recipes.filter(r => {
      const months = r.months || [];
      return months.length === 0 || months.includes(currentMonth);
    });
  }

  // Tri
  const sort = _planningPickerFilters.sort;
  if (sort === 'alpha') {
    recipes.sort((a, b) => (a.title || '').localeCompare(b.title || '', 'fr'));
  } else if (sort === 'recent') {
    recipes.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  } else if (sort === 'favorites') {
    recipes.sort((a, b) => {
      if (a.favorite && !b.favorite) return -1;
      if (!a.favorite && b.favorite) return 1;
      return (a.title || '').localeCompare(b.title || '', 'fr');
    });
  }

  if (recipes.length === 0) {
    wrap.innerHTML = '<p class="planning-picker-empty">Aucune recette ne correspond aux filtres</p>';
    return;
  }

  wrap.innerHTML = `<p class="planning-picker-count">${recipes.length} recette${recipes.length > 1 ? 's' : ''}</p>` +
    recipes.map(r => {
      const cat = getCategoryById(r.category);
      const inSeason = !r.months || r.months.length === 0 || r.months.includes(currentMonth);
      return `<button class="planning-picker-item" onclick="pickRecipeForPlanning('${r.id}')">
        <span class="planning-picker-item-emoji">${r.photo ? `<img src="${r.photo}" alt="">` : (r.emoji || '🍽️')}</span>
        <div class="planning-picker-item-text">
          <div class="planning-picker-item-title">${r.favorite ? '⭐ ' : ''}${escapeHtml(r.title)}</div>
          <div class="planning-picker-item-meta">${cat.emoji} ${escapeHtml(cat.label)}${r.prepTime || r.cookTime ? ' · ' + ((r.prepTime || 0) + (r.cookTime || 0)) + ' min' : ''}${inSeason ? '' : ' · <span class="picker-item-not-season">hors saison</span>'}</div>
        </div>
      </button>`;
    }).join('');
}

function pickRecipeForPlanning(recipeId) {
  const modal = document.getElementById('planning-picker-modal');
  if (!modal) return;
  const dateStr = modal.dataset.dateStr;
  const slotId = modal.dataset.slotId;
  if (!dateStr || !slotId) return;

  const recipe = state.recipes.find(r => r.id === recipeId);
  if (!recipe) return;

  // Interception : si on est en édition d'une proposition de menu IA
  if (state._menuPreviewIntercept && state._menuPreviewEditingIdx != null) {
    const idx = state._menuPreviewEditingIdx;
    if (state._pendingMenuProposal && state._pendingMenuProposal[idx]) {
      state._pendingMenuProposal[idx].recipe = recipe;
      state._pendingMenuProposal[idx].reason = '(choix manuel)';
    }
    state._menuPreviewIntercept = false;
    state._menuPreviewEditingIdx = null;
    closePlanningSlotPicker(true);
    openPlanningMenuPreview(state._pendingMenuProposal);
    return;
  }

  const key = `${dateStr}-${slotId}`;
  const existing = state.planning[key];
  // Liste actuelle des recettes du slot
  let currentRecipes = getSlotRecipes(existing);

  // Si la recette y est déjà : pas de doublon
  if (currentRecipes.some(r => r.id === recipeId)) {
    showToast('Cette recette est déjà dans ce repas', 'info');
    return;
  }

  // Ajout
  currentRecipes.push({ id: recipeId, servings: recipe.baseServings });

  state.planning[key] = {
    ...(existing && !existing.deletedAt ? existing : {}),
    recipeIds: currentRecipes,
    recipeId: null, // on nettoie l'ancien format
    updatedAt: Date.now(),
    deletedAt: null
  };
  savePlanning();
  syncPlanningEntry(key);
  renderPlanning();

  // Notifier l'utilisateur sans forcément fermer le picker (pour ajouts multiples rapides)
  showToast(`${recipe.title} ajouté ✓`, 'success');
  // Fermeture après court délai (toast visible)
  closePlanningSlotPicker();
}
window.pickRecipeForPlanning = pickRecipeForPlanning;

function closePlanningSlotPicker(skipHistory) {
  const modal = document.getElementById('planning-picker-modal');
  if (!modal || modal.classList.contains('hidden')) return;
  if (!skipHistory) {
    history.back();
    return;
  }
  modal.classList.add('hidden');
}
window.closePlanningSlotPicker = closePlanningSlotPicker;

// Retire UNE recette d'un slot (laisse les autres)
function removeRecipeFromSlot(dateStr, slotId, recipeId) {
  const key = `${dateStr}-${slotId}`;
  const entry = state.planning[key];
  if (!entry) return;
  const current = getSlotRecipes(entry);
  const filtered = current.filter(r => r.id !== recipeId);

  if (filtered.length === 0) {
    // Plus aucune recette : soft delete
    state.planning[key] = {
      ...entry,
      recipeIds: [],
      recipeId: null,
      deletedAt: Date.now(),
      updatedAt: Date.now()
    };
  } else {
    state.planning[key] = {
      ...entry,
      recipeIds: filtered,
      recipeId: null,
      deletedAt: null,
      updatedAt: Date.now()
    };
  }
  savePlanning();
  syncPlanningEntry(key);
  renderPlanning();
}
window.removeRecipeFromSlot = removeRecipeFromSlot;

// Vide tout un slot (compat avec ancien removeFromPlanning)
function removeFromPlanning(dateStr, slotId) {
  const key = `${dateStr}-${slotId}`;
  if (!state.planning[key] || state.planning[key].deletedAt) return;
  state.planning[key] = {
    ...state.planning[key],
    recipeIds: [],
    recipeId: null,
    deletedAt: Date.now(),
    updatedAt: Date.now()
  };
  savePlanning();
  syncPlanningEntry(key);
  renderPlanning();
}
window.removeFromPlanning = removeFromPlanning;

async function clearPlanning() {
  const periodLabel = _planningView === '2weeks' ? '2 semaines' : 'semaine';
  if (!(await uiConfirm(`Vider tout le planning de la ${periodLabel} affichée ?`))) return;
  const days = getPlanningDays();
  const now = Date.now();
  const keysToSync = [];
  for (const d of days) {
    const dateStr = formatPlanningDate(d);
    for (const slot of MEAL_SLOTS) {
      const key = `${dateStr}-${slot.id}`;
      const entry = state.planning[key];
      if (entry && !entry.deletedAt && getSlotRecipes(entry).length > 0) {
        state.planning[key] = {
          ...entry,
          recipeIds: [],
          recipeId: null,
          deletedAt: now,
          updatedAt: now
        };
        keysToSync.push(key);
      }
    }
  }
  savePlanning();
  keysToSync.forEach(syncPlanningEntry);
  renderPlanning();
  showToast('Planning vidé');
}
window.clearPlanning = clearPlanning;

function planningToShopping() {
  const days = getPlanningDays();
  const today = formatPlanningDate(new Date());
  let count = 0;
  const list = getActiveShoppingList();
  if (!list) {
    showToast('Erreur : pas de liste de courses active', 'error');
    return;
  }
  for (const d of days) {
    const dateStr = formatPlanningDate(d);
    if (dateStr < today) continue;
    for (const slot of MEAL_SLOTS) {
      const entry = state.planning[`${dateStr}-${slot.id}`];
      const recipes = getSlotRecipes(entry);
      for (const rr of recipes) {
        const recipe = state.recipes.find(r => r.id === rr.id);
        if (!recipe) continue;
        if (list.items.some(it => it.recipeId === rr.id)) continue;
        list.items.push({ recipeId: rr.id, servings: rr.servings || recipe.baseServings });
        count++;
      }
    }
  }
  state.shopping = list.items;
  saveShoppingLists();
  updateShoppingBadge();
  if (count === 0) {
    showToast('Aucune nouvelle recette à ajouter');
  } else {
    showToast(`${count} recette${count > 1 ? 's' : ''} ajoutée${count > 1 ? 's' : ''} à la liste`, 'success');
    navigateTo('shopping');
  }
}
window.planningToShopping = planningToShopping;

function changePlanningWeek(delta) {
  // En vue 2 semaines, on saute 2 semaines à la fois ; en vue 1 semaine, 1 à la fois
  const step = _planningView === '2weeks' ? 2 : 1;
  _planningWeekOffset += delta * step;
  renderPlanning();
}
window.changePlanningWeek = changePlanningWeek;

// ============================================
// GÉNÉRATION DE MENU IA → PLANNING
// ============================================

function openPlanningMenuGenerator() {
  // Modal qui demande les paramètres puis appelle Claude
  const dietOptions = DIET_TAGS.filter(t => !['low-fodmap', 'high-fodmap'].includes(t.id)) // FODMAP auto-calculé
    .map(t => `<label class="diet-tag-option" style="--diet-color: ${t.color}">
      <input type="checkbox" data-diet-id="${t.id}">
      <span class="diet-tag-emoji">${t.emoji}</span>
      <span class="diet-tag-label">${escapeHtml(t.label)}</span>
    </label>`).join('');

  const html = `
    <div class="modal-header">
      <h2>🪄 Générer un menu avec l'IA</h2>
      <button class="modal-close" onclick="closePlanningMenuGenerator()" aria-label="Fermer">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 18L18 6M6 6l12 12" stroke-linecap="round"/></svg>
      </button>
    </div>
    <div class="planning-menu-gen-body">
      <p class="planning-menu-gen-hint">L'IA va proposer des recettes équilibrées depuis votre bibliothèque, en respectant la saison et vos critères.</p>

      <label class="planning-menu-gen-label">Durée</label>
      <div class="planning-menu-gen-segmented">
        <button class="seg-option active" data-duration="3">3 jours</button>
        <button class="seg-option" data-duration="7">1 semaine</button>
        <button class="seg-option" data-duration="14">2 semaines</button>
      </div>

      <label class="planning-menu-gen-label">Repas</label>
      <div class="planning-menu-gen-segmented">
        <button class="seg-option" data-meals="midi">Midi seul</button>
        <button class="seg-option" data-meals="soir">Soir seul</button>
        <button class="seg-option active" data-meals="midi+soir">Midi + Soir</button>
      </div>

      <label class="planning-menu-gen-label">Démarrer à partir de</label>
      <div class="planning-menu-gen-segmented">
        <button class="seg-option active" data-start="today">Aujourd'hui</button>
        <button class="seg-option" data-start="next-empty">Prochain repas vide</button>
      </div>

      <label class="planning-menu-gen-label">Contraintes (optionnel)</label>
      <textarea id="planning-menu-gen-prompt" placeholder="Ex: pas de gluten, des plats rapides en semaine, plus festif le weekend..." rows="3"></textarea>

      <div class="planning-menu-gen-collapse">
        <button class="planning-menu-gen-toggle" onclick="document.getElementById('planning-menu-gen-diets').classList.toggle('hidden')">
          Régimes alimentaires à respecter ▼
        </button>
        <div id="planning-menu-gen-diets" class="diet-tags-grid hidden" style="margin-top:8px">
          ${dietOptions}
        </div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn-secondary" onclick="closePlanningMenuGenerator()">Annuler</button>
      <button class="btn-primary" id="planning-menu-gen-submit" onclick="runPlanningMenuGenerator()">
        <span class="btn-label">Générer</span>
      </button>
    </div>
  `;

  let modal = document.getElementById('planning-menu-gen-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'planning-menu-gen-modal';
    modal.className = 'modal hidden';
    modal.innerHTML = '<div class="modal-backdrop"></div><div class="modal-content"></div>';
    document.body.appendChild(modal);
    modal.querySelector('.modal-backdrop').addEventListener('click', closePlanningMenuGenerator);
  }
  modal.querySelector('.modal-content').innerHTML = html;
  modal.classList.remove('hidden');

  // Behaviour : segmented buttons
  modal.querySelectorAll('.seg-option').forEach(btn => {
    btn.addEventListener('click', () => {
      // Sélection exclusive par groupe (data-duration, data-meals, data-start)
      const group = ['duration', 'meals', 'start'].find(g => btn.dataset[g] !== undefined);
      if (!group) return;
      modal.querySelectorAll(`.seg-option[data-${group}]`).forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // Toggle visuel des diet labels
  modal.querySelectorAll('.diet-tag-option input').forEach(input => {
    input.addEventListener('change', e => {
      e.target.closest('.diet-tag-option').classList.toggle('checked', e.target.checked);
    });
  });

  pushOverlay('planning-menu-gen');
}
window.openPlanningMenuGenerator = openPlanningMenuGenerator;

function closePlanningMenuGenerator(skipHistory) {
  const modal = document.getElementById('planning-menu-gen-modal');
  if (!modal || modal.classList.contains('hidden')) return;
  if (!skipHistory) {
    history.back();
    return;
  }
  modal.classList.add('hidden');
}
window.closePlanningMenuGenerator = closePlanningMenuGenerator;

async function runPlanningMenuGenerator() {
  if (!state.apiKey) {
    showToast('Clé API requise (Paramètres)', 'error');
    return;
  }
  if (state.recipes.length < 3) {
    showToast('Il faut au moins 3 recettes dans la bibliothèque', 'error');
    return;
  }

  const modal = document.getElementById('planning-menu-gen-modal');
  const duration = Number(modal.querySelector('.seg-option[data-duration].active')?.dataset.duration || 7);
  const mealsMode = modal.querySelector('.seg-option[data-meals].active')?.dataset.meals || 'midi+soir';
  const startMode = modal.querySelector('.seg-option[data-start].active')?.dataset.start || 'today';
  const userPrompt = (document.getElementById('planning-menu-gen-prompt').value || '').trim();
  const selectedDiets = Array.from(modal.querySelectorAll('.diet-tag-option input:checked')).map(i => i.dataset.dietId);

  // Quels slots remplir ?
  const slotIds = mealsMode === 'midi+soir' ? ['midi', 'soir'] : [mealsMode];

  // Construire la liste de dates concernées
  const dates = [];
  const startDate = new Date();
  startDate.setHours(0, 0, 0, 0);
  for (let i = 0; i < duration; i++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    dates.push(formatPlanningDate(d));
  }

  // Filtrer pour ne garder que les slots vides si "next-empty"
  let targetSlots = [];
  for (const dateStr of dates) {
    for (const slot of slotIds) {
      const key = `${dateStr}-${slot}`;
      const entry = state.planning[key];
      const isEmpty = !entry || !entry.recipeId || entry.deletedAt;
      if (startMode === 'next-empty' && !isEmpty) continue;
      targetSlots.push({ dateStr, slot, key });
    }
  }

  if (targetSlots.length === 0) {
    showToast('Aucun créneau disponible', 'error');
    return;
  }

  // Filtrer la bibliothèque selon les régimes choisis
  const currentMonth = new Date().getMonth() + 1;
  let candidates = state.recipes.slice();
  if (selectedDiets.length > 0) {
    candidates = candidates.filter(r => {
      const tags = r.dietTags || [];
      return selectedDiets.every(d => tags.includes(d));
    });
  }

  if (candidates.length < 3) {
    showToast('Trop peu de recettes correspondent aux critères', 'error');
    return;
  }

  // Construire un résumé des recettes disponibles pour l'IA
  const recipeBrief = candidates.map(r => {
    const cookCount = (r.cookedHistory || []).length;
    const inSeason = !r.months || r.months.length === 0 || r.months.includes(currentMonth);
    const totalTime = (r.prepTime || 0) + (r.cookTime || 0);
    return {
      id: r.id,
      title: r.title,
      category: r.category,
      tags: r.tags || [],
      dietTags: r.dietTags || [],
      totalTime: totalTime || null,
      inSeason,
      cookCount
    };
  });

  const submitBtn = document.getElementById('planning-menu-gen-submit');
  const originalLabel = submitBtn.innerHTML;
  submitBtn.innerHTML = '<span class="spinner-small"></span> Génération...';
  submitBtn.disabled = true;

  try {
    const prompt = `Tu es un chef qui aide à planifier des repas équilibrés.
J'ai besoin que tu sélectionnes ${targetSlots.length} recettes parmi ma bibliothèque pour remplir mon planning.

CRITÈRES À RESPECTER:
- Variété : ne pas répéter une recette plus de 2 fois sur la période
- Équilibre : alterner viandes/poissons/végétarien, plats lourds/légers
- Saisonnalité : privilégier les recettes "inSeason: true"
- Roulement : privilégier les recettes peu cuisinées récemment (cookCount bas)
- Contraintes utilisateur: ${userPrompt || '(aucune)'}

Repas demandés (dans l'ordre) :
${targetSlots.map((s, i) => `${i + 1}. ${s.dateStr} - ${s.slot}`).join('\n')}

Recettes disponibles dans la bibliothèque (id, title, category, tags, dietTags, totalTime, inSeason, cookCount):
${JSON.stringify(recipeBrief, null, 1)}

RÉPONSE ATTENDUE : un JSON STRICT entre balises <menu>...</menu>, format:
<menu>
[
  { "slot": 1, "recipeId": "abc", "reason": "Plat de saison, équilibré" },
  { "slot": 2, "recipeId": "def", "reason": "Léger pour le soir" }
]
</menu>

L'array doit avoir exactement ${targetSlots.length} éléments. Chaque "recipeId" doit exister dans les recettes disponibles. "reason" est une phrase TRÈS courte (max 8 mots).`;

    const response = await callClaudeAPI([{ role: 'user', content: prompt }], { maxTokens: 4000 });

    // Parser la réponse
    const match = response.match(/<menu>([\s\S]*?)<\/menu>/);
    if (!match) throw new Error("Réponse IA invalide");

    const cleanJson = match[1].trim().replace(/^```json\s*/i, '').replace(/```$/, '').trim();
    const menu = JSON.parse(cleanJson);
    if (!Array.isArray(menu)) throw new Error("Format JSON inattendu");

    // Construire l'aperçu pour validation utilisateur
    const proposal = [];
    for (let i = 0; i < targetSlots.length; i++) {
      const item = menu[i];
      if (!item || !item.recipeId) continue;
      const recipe = candidates.find(r => r.id === item.recipeId);
      if (!recipe) continue;
      proposal.push({
        ...targetSlots[i],
        recipe,
        reason: item.reason || ''
      });
    }

    if (proposal.length === 0) throw new Error("Aucune recette valide proposée");

    // Fermer la modal de génération, ouvrir la modal de validation
    closePlanningMenuGenerator(true);
    openPlanningMenuPreview(proposal);

  } catch (e) {
    console.error('Génération menu erreur:', e);
    showToast('Erreur: ' + e.message, 'error');
    submitBtn.innerHTML = originalLabel;
    submitBtn.disabled = false;
  }
}
window.runPlanningMenuGenerator = runPlanningMenuGenerator;

function openPlanningMenuPreview(proposal) {
  // Modal d'aperçu avec possibilité de regénérer ou valider chaque repas
  const html = `
    <div class="modal-header">
      <h2>Menu proposé</h2>
      <button class="modal-close" onclick="closePlanningMenuPreview()" aria-label="Fermer">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 18L18 6M6 6l12 12" stroke-linecap="round"/></svg>
      </button>
    </div>
    <div class="planning-menu-preview-body">
      <p class="planning-menu-preview-hint">Validez ou ajustez. Tapez un repas pour le changer.</p>
      <div class="planning-menu-preview-list">
        ${proposal.map((p, i) => `
          <div class="planning-menu-preview-item" data-idx="${i}">
            <div class="planning-menu-preview-date">${formatPreviewDate(p.dateStr)} · ${p.slot === 'midi' ? '☀️ Midi' : '🌙 Soir'}</div>
            <button class="planning-menu-preview-recipe" onclick="changePreviewRecipe(${i})">
              <span class="planning-menu-preview-emoji">${p.recipe.photo ? `<img src="${p.recipe.photo}" alt="">` : (p.recipe.emoji || '🍽️')}</span>
              <div class="planning-menu-preview-text">
                <div class="planning-menu-preview-title">${escapeHtml(p.recipe.title)}</div>
                ${p.reason ? `<div class="planning-menu-preview-reason">${escapeHtml(p.reason)}</div>` : ''}
              </div>
              <span class="planning-menu-preview-edit">✏️</span>
            </button>
          </div>
        `).join('')}
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn-secondary" onclick="closePlanningMenuPreview()">Annuler</button>
      <button class="btn-primary" onclick="confirmPlanningMenu()">Valider tout</button>
    </div>
  `;

  // On stocke la proposition dans le state pour pouvoir la modifier
  state._pendingMenuProposal = proposal;

  let modal = document.getElementById('planning-menu-preview-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'planning-menu-preview-modal';
    modal.className = 'modal hidden';
    modal.innerHTML = '<div class="modal-backdrop"></div><div class="modal-content"></div>';
    document.body.appendChild(modal);
    modal.querySelector('.modal-backdrop').addEventListener('click', closePlanningMenuPreview);
  }
  modal.querySelector('.modal-content').innerHTML = html;
  modal.classList.remove('hidden');
  pushOverlay('planning-menu-preview');
}

function formatPreviewDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
}

function closePlanningMenuPreview(skipHistory) {
  const modal = document.getElementById('planning-menu-preview-modal');
  if (!modal || modal.classList.contains('hidden')) return;
  if (!skipHistory) {
    history.back();
    return;
  }
  modal.classList.add('hidden');
  state._pendingMenuProposal = null;
}
window.closePlanningMenuPreview = closePlanningMenuPreview;

function changePreviewRecipe(idx) {
  // Ouvrir un picker simple
  const proposal = state._pendingMenuProposal;
  if (!proposal || !proposal[idx]) return;
  // Utiliser le picker existant en flag spécial
  state._menuPreviewEditingIdx = idx;
  openPlanningSlot(proposal[idx].dateStr, proposal[idx].slot);
  // Override : interception du pick pour rester en preview
  state._menuPreviewIntercept = true;
}
window.changePreviewRecipe = changePreviewRecipe;

function confirmPlanningMenu() {
  const proposal = state._pendingMenuProposal;
  if (!proposal) return;
  const now = Date.now();
  let count = 0;
  for (const p of proposal) {
    state.planning[p.key] = {
      recipeId: p.recipe.id,
      servings: p.recipe.baseServings,
      updatedAt: now + count, // léger décalage pour préserver l'ordre
      deletedAt: null
    };
    syncPlanningEntry(p.key);
    count++;
  }
  savePlanning();
  closePlanningMenuPreview(true);
  renderPlanning();
  showToast(`${count} repas planifié${count > 1 ? 's' : ''} ✓`, 'success');
}
window.confirmPlanningMenu = confirmPlanningMenu;

// ============================================
// EVENT BINDINGS
// ============================================

async function bindEvents() {
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
    addIngBtn.addEventListener('click', async () => {
      const name = await uiPrompt('Nom de l\'ingrédient à filtrer (ex: courgette) :');
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
    menuBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const occasion = await uiPrompt('Pour quelle occasion ? (ex: "menu végétarien rapide", "dîner d\'été pour 6", "soirée raclette")', 'Menu équilibré pour ce soir');
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

  // Planning button (header)
  const planningBtn = document.getElementById('planning-btn');
  if (planningBtn) {
    planningBtn.addEventListener('click', () => navigateTo('planning'));
  }

  // Planning navigation et actions
  const planningPrevBtn = document.getElementById('planning-prev-week');
  if (planningPrevBtn) planningPrevBtn.addEventListener('click', () => changePlanningWeek(-1));
  const planningNextBtn = document.getElementById('planning-next-week');
  if (planningNextBtn) planningNextBtn.addEventListener('click', () => changePlanningWeek(1));
  const planningToShoppingBtn = document.getElementById('planning-to-shopping');
  if (planningToShoppingBtn) planningToShoppingBtn.addEventListener('click', planningToShopping);
  const planningClearBtn = document.getElementById('planning-clear');
  if (planningClearBtn) planningClearBtn.addEventListener('click', clearPlanning);
  const planningGenAIBtn = document.getElementById('planning-generate-ai');
  if (planningGenAIBtn) planningGenAIBtn.addEventListener('click', openPlanningMenuGenerator);
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

  // Pantry default days
  const pantrySelect = document.getElementById('settings-pantry-days');
  if (pantrySelect) {
    pantrySelect.addEventListener('change', () => {
      setPantryDefaultDays(Number(pantrySelect.value));
      showToast(`Garde-manger : ${pantrySelect.value} jours par défaut`, 'success');
    });
  }

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

  document.getElementById('settings-sync-disable').addEventListener('click', async () => {
    if (!(await uiConfirm('Désactiver la synchronisation ? Vos recettes locales restent intactes.'))) return;
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
  initKeyboardHandling(); // ajuste la barre chat avec le clavier virtuel
  bindEvents();
  _loadTimerState(); // restaurer un éventuel minuteur actif

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
  renderDietFilter();
  updateFiltersUI();
  updateShoppingBadge();
}

document.addEventListener('DOMContentLoaded', init);
