// ============================================
// MES RECETTES — App JS
// ============================================

// ============================================
// OBFUSCATION DES SECRETS DANS LOCALSTORAGE
// ============================================
// Objectif : empêcher la lecture en clair des clés API et credentials Supabase via
// l'onglet "Application → localStorage" des devtools ou un dump d'extension.
// Ce n'est PAS une protection cryptographique forte (un attaquant qui peut exécuter
// du JS dans l'origine peut déchiffrer). Mode "obfuscation visuelle" assumé.
//
// Schéma : valeurs préfixées par "enc1:" + base64( XOR(valeur, clé dérivée d'origin) )
// Les valeurs sans préfixe sont considérées comme en clair (migration au boot).

const _OBF_KEY = (() => {
  const base = 'mr-x9-v1-2026-mes-recettes';
  const seed = (typeof location !== 'undefined' ? location.origin : '') + '/' + base;
  // Dériver 32 caractères pseudo-aléatoires depuis seed (LCG simple)
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h = ((h ^ seed.charCodeAt(i)) * 16777619) >>> 0;
  }
  let mix = '';
  for (let i = 0; i < 32; i++) {
    h = (h * 1103515245 + 12345) >>> 0;
    mix += String.fromCharCode(33 + (h % 94));
  }
  return mix;
})();

const _OBF_PREFIX = 'enc1:';

function _obfuscate(value) {
  if (!value) return '';
  const str = String(value);
  const out = [];
  for (let i = 0; i < str.length; i++) {
    out.push(String.fromCharCode(str.charCodeAt(i) ^ _OBF_KEY.charCodeAt(i % _OBF_KEY.length)));
  }
  try {
    return _OBF_PREFIX + btoa(unescape(encodeURIComponent(out.join(''))));
  } catch (e) {
    return _OBF_PREFIX + btoa(out.join(''));
  }
}

function _deobfuscate(stored) {
  if (!stored) return '';
  if (!stored.startsWith(_OBF_PREFIX)) return stored; // valeur en clair (legacy)
  try {
    let decoded;
    try {
      decoded = decodeURIComponent(escape(atob(stored.slice(_OBF_PREFIX.length))));
    } catch (e) {
      decoded = atob(stored.slice(_OBF_PREFIX.length));
    }
    const out = [];
    for (let i = 0; i < decoded.length; i++) {
      out.push(String.fromCharCode(decoded.charCodeAt(i) ^ _OBF_KEY.charCodeAt(i % _OBF_KEY.length)));
    }
    return out.join('');
  } catch (e) {
    console.warn('Déchiffrement échoué pour une valeur obfusquée, valeur ignorée');
    return '';
  }
}

// Wrappers pour les valeurs sensibles : lire/écrire en transparence avec obfuscation
function getSecret(storageKey) {
  const raw = localStorage.getItem(storageKey);
  return raw ? _deobfuscate(raw) : '';
}

function setSecret(storageKey, value) {
  if (value === null || value === undefined || value === '') {
    localStorage.removeItem(storageKey);
    return;
  }
  localStorage.setItem(storageKey, _obfuscate(value));
}

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
  planning: 'mr_planning',
  planningPrefs: 'mr_planning_prefs',
  ingredientSynonyms: 'mr_ingredient_synonyms'
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
  verifiedFilter: 'all', // 'all' | 'verified' | 'unverified'
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
    servingsPresets: [2, 4, 6, 8],
    // Alias appris via « Nettoyer la liste avec l'IA » : { "alias": "nom canonique" }
    ingredientSynonyms: {},
    // Préférences de génération de menu IA (toutes activées par défaut)
    planning: {
      proteinDaily: true,        // Protéine à chaque repas (max 1 jour/semaine sans)
      proteinSequencing: true,   // Pas 2x même type de protéine sur 2 jours consécutifs
      nutritionQuotas: true,     // ≥2 poissons, ≤2 viandes rouges, ≥1 plat végétal par semaine
      lightHeavyBalance: true,   // Équilibre lourd ↔ léger sur la journée
      weekendVsWeek: true,       // Rapide en semaine, plus festif le weekend
      batchCooking: false        // Maximiser les paires de slots consécutifs avec la même recette
    }
  },
  // Cooking mode
  cookingMode: { active: false, currentStep: 0, recipeId: null }
};

// ============================================
// STORAGE
// ============================================

// Filtre les recettes corrompues (sans id ou sans title) au chargement.
// Évite que l'app crashe ou affiche des cards vides à cause de données invalides.
function _validateRecipesSchema(rawList) {
  if (!Array.isArray(rawList)) return { valid: [], dropped: 0 };
  const valid = [];
  let dropped = 0;
  for (const r of rawList) {
    if (!r || typeof r !== 'object') { dropped++; continue; }
    if (!r.id || typeof r.id !== 'string') { dropped++; continue; }
    if (!r.title || typeof r.title !== 'string' || !r.title.trim()) { dropped++; continue; }
    // S'assurer que les arrays critiques sont des arrays (pas undefined)
    if (!Array.isArray(r.ingredients)) r.ingredients = [];
    if (!Array.isArray(r.steps)) r.steps = [];
    valid.push(r);
  }
  return { valid, dropped };
}

function loadState() {
  try {
    const recipes = localStorage.getItem(STORAGE_KEYS.recipes);
    const rawRecipes = recipes ? JSON.parse(recipes) : [];
    const { valid, dropped } = _validateRecipesSchema(rawRecipes);
    state.recipes = valid;
    if (dropped > 0) {
      console.warn(`[loadState] ${dropped} recette(s) ignorée(s) car structure invalide (id ou titre manquant)`);
      // Toast différé pour ne pas être affiché avant que showToast soit prêt
      setTimeout(() => {
        if (typeof showToast === 'function') {
          showToast(`${dropped} recette${dropped > 1 ? 's' : ''} corrompue${dropped > 1 ? 's' : ''} ignorée${dropped > 1 ? 's' : ''}`, 'error');
        }
      }, 2000);
    }
    // Secrets : lus via wrappers qui gèrent l'obfuscation (et migrent automatiquement les valeurs en clair)
    state.apiKey = getSecret(STORAGE_KEYS.apiKey);
    state.sync.url = getSecret(STORAGE_KEYS.syncUrl);
    state.sync.key = getSecret(STORAGE_KEYS.syncKey);
    state.sync.foyer = getSecret(STORAGE_KEYS.syncFoyer);
    // Migration : si les valeurs étaient stockées en clair, les ré-écrire en obfusqué
    [
      [STORAGE_KEYS.apiKey, state.apiKey],
      [STORAGE_KEYS.syncUrl, state.sync.url],
      [STORAGE_KEYS.syncKey, state.sync.key],
      [STORAGE_KEYS.syncFoyer, state.sync.foyer]
    ].forEach(([k, v]) => {
      if (v) {
        const raw = localStorage.getItem(k);
        if (raw && !raw.startsWith(_OBF_PREFIX)) setSecret(k, v);
      }
    });
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
    // Migration : chaque liste doit avoir checked (array) et updatedAt (pour la sync)
    for (const list of state.shoppingLists) {
      if (!Array.isArray(list.checked)) list.checked = [];
      if (typeof list.updatedAt !== 'number') list.updatedAt = list.createdAt || Date.now();
    }
    // Pour rétrocompat, alias shopping = liste active
    const _activeList = getActiveShoppingList();
    state.shopping = _activeList?.items || [];
    // Hydrate le Set de cases cochées depuis la liste active (avant : perdu au refresh)
    state.shoppingChecked = new Set(_activeList?.checked || []);

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
    // Préférences de génération de menu (merge avec les défauts pour gérer l'ajout futur de toggles)
    const planningPrefsStr = localStorage.getItem(STORAGE_KEYS.planningPrefs);
    if (planningPrefsStr) {
      try {
        const saved = JSON.parse(planningPrefsStr);
        state.prefs.planning = { ...state.prefs.planning, ...saved };
      } catch {}
    }
    const synonymsStr = localStorage.getItem(STORAGE_KEYS.ingredientSynonyms);
    if (synonymsStr) {
      try {
        const saved = JSON.parse(synonymsStr);
        if (saved && typeof saved === 'object') state.prefs.ingredientSynonyms = saved;
      } catch {}
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

    // Migration ingredientIds → ingredientUses (nouveau format avec quantités partielles possibles)
    // Conversion silencieuse, conserve aussi ingredientIds en double pour rétro-compat sync
    const USES_VERSION = 'uses-v1';
    const usesMigrated = localStorage.getItem('mr_uses_version');
    if (usesMigrated !== USES_VERSION) {
      state.recipes = state.recipes.map(r => {
        if (!r.steps) return r;
        const newSteps = r.steps.map(s => {
          // Si déjà au nouveau format, ne pas écraser
          if (Array.isArray(s.ingredientUses) && s.ingredientUses.length > 0) {
            return s;
          }
          // Sinon convertir ingredientIds → ingredientUses
          if (Array.isArray(s.ingredientIds) && s.ingredientIds.length > 0) {
            return {
              ...s,
              ingredientUses: s.ingredientIds.map(id => ({ id: String(id) }))
            };
          }
          return { ...s, ingredientUses: [] };
        });
        return { ...r, steps: newSteps };
      });
      localStorage.setItem('mr_uses_version', USES_VERSION);
      try { localStorage.setItem(STORAGE_KEYS.recipes, JSON.stringify(state.recipes)); } catch {}
    }

    // Migration FODMAP : recalcul auto pour toutes les recettes existantes
    // Ajoute low-fodmap / high-fodmap selon les ingrédients, en complétant les tags existants
    if (typeof calculateFodmapTags === 'function') {
      const FODMAP_VERSION = 'fodmap-auto-v4';
      const fodmapMigrated = localStorage.getItem('mr_fodmap_version');
      if (fodmapMigrated !== FODMAP_VERSION) {
        state.recipes = state.recipes.map(r => {
          if (!r.ingredients) return r;
          const currentDiets = Array.isArray(r.dietTags) ? r.dietTags.slice() : [];
          // Retirer les anciens fodmap pour permettre le recalcul
          const cleanedDiets = currentDiets.filter(t => t !== 'low-fodmap' && t !== 'high-fodmap' && t !== 'fodmap');
          // Ajouter les nouveaux fodmap calculés
          const autoFodmap = calculateFodmapTags(r.ingredients);
          const merged = [...cleanedDiets, ...autoFodmap];
          return { ...r, dietTags: merged };
        });
        localStorage.setItem('mr_fodmap_version', FODMAP_VERSION);
        try { localStorage.setItem(STORAGE_KEYS.recipes, JSON.stringify(state.recipes)); } catch {}
      }
    }

    // Migration PROTÉINE : calcul auto pour toutes les recettes existantes (cache _proteinType)
    // Sert à la génération de menu IA pour appliquer les règles nutritionnelles
    if (typeof detectProteinType === 'function') {
      const PROTEIN_VERSION = 'protein-v1';
      const proteinMigrated = localStorage.getItem('mr_protein_version');
      if (proteinMigrated !== PROTEIN_VERSION) {
        state.recipes = state.recipes.map(r => {
          if (!r.ingredients) return r;
          const detection = detectProteinType(r.ingredients);
          return { ...r, _proteinType: detection.type, _hasProtein: detection.hasProtein };
        });
        localStorage.setItem('mr_protein_version', PROTEIN_VERSION);
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

// ============================================
// SAFE SAVE — Gestion du quota localStorage
// ============================================
// Wrapper unique pour toutes les écritures lourdes : capture QuotaExceededError,
// affiche un toast clair et empêche les pertes de données silencieuses.
// Garde aussi une trace anti-spam pour ne pas répéter le toast à chaque tentative.
let _quotaErrorShownAt = 0;
function safeSave(storageKey, value, label) {
  try {
    localStorage.setItem(storageKey, typeof value === 'string' ? value : JSON.stringify(value));
    return true;
  } catch (e) {
    // QuotaExceededError dans tous les navigateurs (code 22 ou DOM_EXCEPTION_QUOTA_EXCEEDED_ERR)
    const isQuota = e && (e.code === 22 || e.code === 1014 || /quota/i.test(e.name || '') || /quota/i.test(e.message || ''));
    if (isQuota) {
      console.error(`[safeSave] Quota localStorage saturé en écrivant "${label || storageKey}"`, e);
      // Anti-spam : un toast max toutes les 30 secondes
      if (Date.now() - _quotaErrorShownAt > 30000) {
        _quotaErrorShownAt = Date.now();
        if (typeof showToast === 'function') {
          showToast('⚠️ Stockage plein. Paramètres → 💾 Données → Libérer l\'espace', 'error');
        }
      }
    } else {
      console.error(`[safeSave] Échec écriture "${label || storageKey}"`, e);
    }
    return false;
  }
}

function saveRecipes() {
  safeSave(STORAGE_KEYS.recipes, state.recipes, 'recettes');
}

function saveShopping() {
  // Sauve la liste active (items + cases cochées) dans shoppingLists et pousse la sync
  const active = getActiveShoppingList();
  if (active) {
    active.items = state.shopping;
    active.checked = [...state.shoppingChecked];
    active.updatedAt = Date.now();
    safeSave(STORAGE_KEYS.shoppingLists, state.shoppingLists, 'listes de courses');
    syncShoppingList(active.id);
  }
}

function saveShoppingLists() {
  safeSave(STORAGE_KEYS.shoppingLists, state.shoppingLists, 'listes de courses');
  localStorage.setItem(STORAGE_KEYS.activeShoppingList, state.activeShoppingListId);
}

function savePantry() {
  safeSave(STORAGE_KEYS.pantry, state.pantry, 'garde-manger');
}

// savePlanning() debounced : si on drag plusieurs slots rapidement, on n'écrit qu'une fois.
let _savePlanningTimer = null;
function savePlanning() {
  // Note : la sync Supabase du planning se fait via syncPlanningEntry() pour les
  // modifs immédiates, et via performSync() pour la fusion complète au démarrage.
  if (_savePlanningTimer) clearTimeout(_savePlanningTimer);
  _savePlanningTimer = setTimeout(() => {
    _savePlanningTimer = null;
    safeSave(STORAGE_KEYS.planning, state.planning, 'planning');
  }, 200);
}

// Variante immédiate (utilisée par les actions critiques avant fermeture/navigation)
function savePlanningImmediate() {
  if (_savePlanningTimer) {
    clearTimeout(_savePlanningTimer);
    _savePlanningTimer = null;
  }
  safeSave(STORAGE_KEYS.planning, state.planning, 'planning');
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
  localStorage.setItem(STORAGE_KEYS.planningPrefs, JSON.stringify(state.prefs.planning || {}));
  localStorage.setItem(STORAGE_KEYS.ingredientSynonyms, JSON.stringify(state.prefs.ingredientSynonyms || {}));
}

function saveApiKey(key) {
  state.apiKey = key;
  setSecret(STORAGE_KEYS.apiKey, key);
}

function saveSyncConfig(config) {
  state.sync.url = config.url || '';
  state.sync.key = config.key || '';
  state.sync.foyer = config.foyer || '';
  state.sync.enabled = !!(config.url && config.key && config.foyer);

  setSecret(STORAGE_KEYS.syncUrl, state.sync.url);
  setSecret(STORAGE_KEYS.syncKey, state.sync.key);
  setSecret(STORAGE_KEYS.syncFoyer, state.sync.foyer);
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
const SYNC_SHOPPING_TABLE = 'shopping_lists';

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

// ===== Sync des LISTES DE COURSES =====

async function syncShoppingPull() {
  const path = `${SYNC_SHOPPING_TABLE}?foyer=eq.${encodeURIComponent(state.sync.foyer)}&select=*`;
  return await supabaseRequest('GET', path);
}

// Debounce : plusieurs modifs rapides (checked, ajout recette…) → 1 push
const _pendingShoppingSync = new Map();
let _shoppingSyncTimer = null;

function syncShoppingList(listId) {
  if (!state.sync.enabled || !navigator.onLine) return;
  const list = state.shoppingLists.find(l => l.id === listId);
  if (!list) return;
  _pendingShoppingSync.set(listId, list);
  if (_shoppingSyncTimer) clearTimeout(_shoppingSyncTimer);
  _shoppingSyncTimer = setTimeout(flushShoppingSync, 800);
}

async function flushShoppingSync() {
  if (_pendingShoppingSync.size === 0) return;
  if (!state.sync.enabled || !navigator.onLine) {
    _pendingShoppingSync.clear();
    return;
  }
  const rows = [];
  for (const [id, list] of _pendingShoppingSync.entries()) {
    if (!list) continue;
    rows.push({
      id: list.id,
      foyer: state.sync.foyer,
      name: list.name || '',
      items: list.items || [],
      checked: list.checked || [],
      updated_at: new Date(list.updatedAt || Date.now()).toISOString(),
      deleted_at: list.deletedAt ? new Date(list.deletedAt).toISOString() : null
    });
  }
  _pendingShoppingSync.clear();
  if (rows.length === 0) return;
  try {
    await supabaseRequest('POST', SYNC_SHOPPING_TABLE, rows, {
      'Prefer': 'resolution=merge-duplicates,return=minimal'
    });
  } catch (e) {
    console.warn('Sync shopping push échouée:', e);
    for (const row of rows) {
      const list = state.shoppingLists.find(l => l.id === row.id);
      if (list) _pendingShoppingSync.set(list.id, list);
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

    // ===== Sync des LISTES DE COURSES (last-modified-wins par liste) =====
    let shoppingChangedFromRemote = false;
    try {
      const remoteShopping = await syncShoppingPull() || [];
      const remoteShoppingById = {};
      for (const row of remoteShopping) remoteShoppingById[row.id] = row;

      // Remote → local
      for (const id in remoteShoppingById) {
        const row = remoteShoppingById[id];
        const remoteUpdated = new Date(row.updated_at).getTime();
        const local = state.shoppingLists.find(l => l.id === id);

        if (row.deleted_at) {
          if (local) {
            state.shoppingLists = state.shoppingLists.filter(l => l.id !== id);
            shoppingChangedFromRemote = true;
          }
          continue;
        }

        if (!local) {
          state.shoppingLists.push({
            id: row.id,
            name: row.name || 'Ma liste',
            items: Array.isArray(row.items) ? row.items : [],
            checked: Array.isArray(row.checked) ? row.checked : [],
            createdAt: remoteUpdated,
            updatedAt: remoteUpdated
          });
          shoppingChangedFromRemote = true;
        } else {
          const localUpdated = local.updatedAt || 0;
          if (remoteUpdated > localUpdated) {
            local.name = row.name || local.name;
            local.items = Array.isArray(row.items) ? row.items : [];
            local.checked = Array.isArray(row.checked) ? row.checked : [];
            local.updatedAt = remoteUpdated;
            local.deletedAt = null;
            shoppingChangedFromRemote = true;
          }
        }
      }

      // Local → remote (listes inconnues du serveur ou plus récentes localement)
      const shoppingToPush = [];
      for (const l of state.shoppingLists) {
        const remote = remoteShoppingById[l.id];
        const localUpdated = l.updatedAt || l.createdAt || 0;
        if (!remote || new Date(remote.updated_at).getTime() < localUpdated) {
          shoppingToPush.push({
            id: l.id,
            foyer: state.sync.foyer,
            name: l.name || '',
            items: l.items || [],
            checked: l.checked || [],
            updated_at: new Date(localUpdated || Date.now()).toISOString(),
            deleted_at: null
          });
        }
      }
      if (shoppingToPush.length > 0) {
        await supabaseRequest('POST', SYNC_SHOPPING_TABLE, shoppingToPush, {
          'Prefer': 'resolution=merge-duplicates,return=minimal'
        });
      }

      // Ré-align liste active + Set de checked si la liste courante a été modifiée à distance
      if (!state.shoppingLists.find(l => l.id === state.activeShoppingListId)) {
        state.activeShoppingListId = state.shoppingLists[0]?.id || 'default';
      }
      const active = getActiveShoppingList();
      if (active) {
        state.shopping = active.items;
        state.shoppingChecked = new Set(active.checked || []);
      }
      saveShoppingLists();
    } catch (shopErr) {
      console.warn('Sync shopping erreur (non bloquant):', shopErr);
    }

    // Save local (le bloc shopping ci-dessus a déjà appelé saveShoppingLists)
    saveRecipes();
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
    if (state.currentView === 'shopping' || shoppingChangedFromRemote) renderShopping();
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

// Helper : fait défiler une série de labels pendant une attente longue.
// Évite l'angoisse de l'attente fixe ("Génération...") sur un appel IA de 5-20 sec.
// Usage :
//   const stop = startProgressiveLabel(label => btn.innerHTML = '<span class="spinner-small"></span> ' + label,
//                                       ['Étape 1…', 'Étape 2…', 'Étape 3…']);
//   try { await longCall(); } finally { stop(); }
function startProgressiveLabel(setter, labels, intervalMs = 3500) {
  if (!labels || labels.length === 0) return () => {};
  let idx = 0;
  setter(labels[0]);
  const timer = setInterval(() => {
    idx = Math.min(idx + 1, labels.length - 1);
    setter(labels[idx]);
    if (idx === labels.length - 1) clearInterval(timer);
  }, intervalMs);
  return () => clearInterval(timer);
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
  // Mémoriser la position de scroll de la vue qu'on quitte (pour la restaurer au retour)
  // On ne mémorise QUE pour les vues "liste" qui ont du scroll utile (library, planning, shopping)
  const mainContent = document.getElementById('main-content');
  const previousView = state.currentView;
  if (mainContent && previousView && previousView !== view) {
    if (!state._viewScrolls) state._viewScrolls = {};
    if (['library', 'planning', 'shopping'].includes(previousView)) {
      state._viewScrolls[previousView] = mainContent.scrollTop;
    }
  }

  // Réinitialiser le contexte planning si l'utilisateur quitte le flow (vers library/shopping/chat ou retour planning)
  // Le contexte reste actif tant qu'on est sur une fiche recette (mode current → candidate)
  if (view !== 'recipe' && state._planningContext) {
    state._planningContext = null;
  }

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

  // Restaurer le scroll si on revient sur une vue déjà visitée, sinon remonter en haut
  const savedScroll = state._viewScrolls && state._viewScrolls[view];
  if (savedScroll && savedScroll > 0 && view !== 'recipe') {
    // requestAnimationFrame pour s'assurer que le contenu est rendu avant le scrollTo
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (mainContent) mainContent.scrollTo({ top: savedScroll, behavior: 'instant' });
      });
    });
  } else if (mainContent) {
    mainContent.scrollTo({ top: 0, behavior: 'instant' });
  }

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

  // Filtrage par vérification humaine
  if (state.verifiedFilter === 'verified') {
    recipes = recipes.filter(r => r.verifiedByHuman === true);
  } else if (state.verifiedFilter === 'unverified') {
    recipes = recipes.filter(r => !r.verifiedByHuman);
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
        ? `<img src="${r.photo}" alt="" class="recipe-card-photo" loading="lazy">`
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

// Bouton retour de la fiche recette : utilise l'historique navigateur si dispo
// (preserve la provenance — library, planning, shopping, search…) plutôt que de toujours retomber sur library.
function recipeDetailBack() {
  if (window.history.length > 1) {
    history.back();
  } else {
    navigateTo('library');
  }
}
window.recipeDetailBack = recipeDetailBack;

// ============================================
// RECIPE DETAIL
// ============================================

function renderRecipeDetail(recipe) {
  const r = state.currentRecipe;
  if (!r) return;

  // Préserver le scroll position pour ne pas remonter en haut après une édition
  const mainContent = document.getElementById('main-content');
  const scrollTop = mainContent ? mainContent.scrollTop : 0;

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
  // Séparé en 2 groupes : factuel (tags, régimes, source) en haut, validation (cuisson, vérifié, log) en bas
  // pour réduire la perception de "champs vides" sur les recettes neuves.

  const factualChips = [];   // tags, régimes, source : descriptifs de la recette
  const statusChips = [];    // cuisson, vérifié, changelog : état d'utilisation

  // --- Groupe FACTUEL : tags + régimes + source ---

  // Tags personnalisés
  if (r.tags && r.tags.length) {
    const tagsList = r.tags.map(t => escapeHtml(t)).join(', ');
    factualChips.push(`<button class="recipe-meta-chip is-filled" onclick="editRecipeTags('${r.id}')" title="${escapeHtml(tagsList)}">
      <span class="recipe-meta-chip-icon">🏷️</span>
      <span class="recipe-meta-chip-text">${escapeHtml(tagsList)}</span>
    </button>`);
  } else {
    factualChips.push(`<button class="recipe-meta-chip is-empty" onclick="editRecipeTags('${r.id}')">+ Tags</button>`);
  }

  // Régimes alimentaires : une chip par régime avec emoji + label complet
  // (au lieu de regrouper tous les emojis sous une seule chip qui était cryptique)
  const dietTags = r.dietTags || [];
  if (dietTags.length > 0) {
    for (const id of dietTags) {
      const t = DIET_TAGS.find(x => x.id === id);
      if (!t) continue;
      factualChips.push(`<button class="recipe-meta-chip is-filled recipe-meta-chip-diet" style="--diet-color:${t.color}" onclick="openDietTagsEditor('${r.id}')" title="Toucher pour modifier les régimes">
        <span class="recipe-meta-chip-icon">${t.emoji}</span>
        <span class="recipe-meta-chip-text">${escapeHtml(t.label)}</span>
      </button>`);
    }
  } else {
    factualChips.push(`<button class="recipe-meta-chip is-empty" onclick="openDietTagsEditor('${r.id}')">+ Régime</button>`);
  }

  // Source
  const src = r.source;
  if (src && src.type) {
    let icon = '🔗', text = '';
    if (src.type === 'book') { icon = '📖'; text = src.title || 'Livre'; }
    else if (src.type === 'web') { icon = '🌐'; text = src.siteName || (src.url ? new URL(src.url).hostname.replace(/^www\./, '') : 'Web'); }
    else if (src.type === 'instagram') { icon = '📷'; text = src.account ? '@' + src.account.replace(/^@/, '') : 'Instagram'; }
    factualChips.push(`<button class="recipe-meta-chip is-filled" onclick="openSourceEditor('${r.id}')" title="${escapeHtml(text)}">
      <span class="recipe-meta-chip-icon">${icon}</span>
      <span class="recipe-meta-chip-text">${escapeHtml(text)}</span>
    </button>`);
  } else {
    factualChips.push(`<button class="recipe-meta-chip is-empty" onclick="openSourceEditor('${r.id}')">+ Source</button>`);
  }

  // --- Groupe VALIDATION : cuisson + vérifié + changelog ---

  // Historique cuisson (chip) — code couleur selon fraîcheur
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
    // Code couleur : vert < 14j (récent), neutre 14-60j (moyen), gris ≥ 60j (ancien)
    let freshClass = 'is-cooked-old';
    if (days < 14) freshClass = 'is-cooked-recent';
    else if (days < 60) freshClass = 'is-cooked-medium';
    statusChips.push(`<button class="recipe-meta-chip is-filled ${freshClass}" onclick="manageCookedHistory('${r.id}')" title="Cuisinée ${cookedHistory.length} fois, dernière fois il y a ${days} jour${days > 1 ? 's' : ''}">
      <span class="recipe-meta-chip-icon">✓</span>
      <span class="recipe-meta-chip-text">${cookedHistory.length} · ${when}</span>
    </button>`);
  } else {
    statusChips.push(`<button class="recipe-meta-chip is-empty" onclick="manageCookedHistory('${r.id}')">📅 Cuisson</button>`);
  }

  // Vérifié par l'humain — pertinent surtout pour les recettes issues de l'IA
  // (les recettes "perso" sont saisies à la main donc déjà vérifiées par essence)
  const isAiExtracted = src && src.type && src.type !== 'perso';
  if (r.verifiedByHuman) {
    statusChips.push(`<button class="recipe-meta-chip is-filled is-verified" onclick="toggleVerifiedByHuman('${r.id}')" title="Recette vérifiée et validée par l'humain. Cliquer pour retirer.">
      <span class="recipe-meta-chip-icon">✅</span>
      <span class="recipe-meta-chip-text">Vérifiée</span>
    </button>`);
  } else if (isAiExtracted) {
    statusChips.push(`<button class="recipe-meta-chip is-empty" onclick="toggleVerifiedByHuman('${r.id}')" title="Marquer comme vérifiée par l'humain">
      ☐ À vérifier
    </button>`);
  }
  // Si recette perso non vérifiée : on n'affiche rien (pas de bruit visuel)

  // Historique modifications (changelog) : badge si nouvelles modifs
  const changeLog = r.changeLog || [];
  const lastViewedKey = `mr_log_viewed_${r.id}`;
  const lastViewed = Number(localStorage.getItem(lastViewedKey)) || 0;
  const newCount = changeLog.filter(e => (e.at || 0) > lastViewed).length;
  const showBadge = lastViewed > 0 && newCount > 0;
  if (changeLog.length > 0) {
    statusChips.push(`<button class="recipe-meta-chip is-filled ${showBadge ? 'has-new' : ''}" onclick="openChangeLog('${r.id}')">
      <span class="recipe-meta-chip-icon">📋</span>
      <span class="recipe-meta-chip-text">${changeLog.length}</span>
      ${showBadge ? `<span class="recipe-meta-chip-badge">${newCount > 9 ? '9+' : newCount}</span>` : ''}
    </button>`);
  }

  // Assemblage : 2 groupes visuellement distincts dans la meta-bar
  // (séparateur subtil entre factuel et validation)
  const metaBarHtml = `<div class="recipe-meta-bar">
    <div class="recipe-meta-group recipe-meta-group-factual">${factualChips.join('')}</div>
    ${statusChips.length > 0 ? `<div class="recipe-meta-group recipe-meta-group-status">${statusChips.join('')}</div>` : ''}
  </div>`;

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
        <button class="recipe-detail-back" onclick="recipeDetailBack()" aria-label="Retour">
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
          <button class="icon-btn recipe-hero-kebab" onclick="openRecipeKebabMenu('${r.id}')" aria-label="Plus d'options">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="5" r="1.5" fill="currentColor"/>
              <circle cx="12" cy="12" r="1.5" fill="currentColor"/>
              <circle cx="12" cy="19" r="1.5" fill="currentColor"/>
            </svg>
          </button>
        </div>
        ${heroVisual}
        <button class="recipe-photo-add ${r.photo ? 'has-photo' : ''}" onclick="attachRecipePhoto('${r.id}')" aria-label="${r.photo ? 'Modifier la photo' : 'Ajouter une photo'}">
          <span class="recipe-photo-add-icon">📷</span>
          ${!r.photo ? '<span class="recipe-photo-add-label">Ajouter une photo</span>' : ''}
        </button>
      </div>
      <div class="recipe-detail-body">
        <h1 class="recipe-detail-title is-editable" onclick="quickEditField('title', '${r.id}')" title="Toucher pour modifier le titre">
          ${escapeHtml(r.title)}
          <span class="recipe-edit-pencil" aria-hidden="true">✏️</span>
        </h1>
        ${r.description
          ? `<p class="recipe-detail-description is-editable" onclick="quickEditField('description', '${r.id}')" title="Toucher pour modifier la description">${escapeHtml(r.description)}<span class="recipe-edit-pencil" aria-hidden="true">✏️</span></p>`
          : `<p class="recipe-detail-description recipe-detail-description-empty" onclick="quickEditField('description', '${r.id}')">+ Ajouter une description</p>`}

        ${timesHtml}

        <div class="recipe-detail-tags">
          ${(() => {
            // Affichage compact : juste l'état saisonnier ce mois-ci. Tap → détail des 12 mois.
            if (months.length === 0) {
              return `<button class="month-badge month-badge-allseason" onclick="openSeasonalityDetail('${r.id}')" title="Toucher pour voir le détail">🌍 Toute saison</button>`;
            }
            const inSeason = months.includes(currentMonth);
            if (inSeason) {
              return `<button class="month-badge month-badge-in-season" onclick="openSeasonalityDetail('${r.id}')" title="Toucher pour voir tous les mois de saison">✅ De saison ce mois</button>`;
            }
            return `<button class="month-badge month-badge-off-season" onclick="openSeasonalityDetail('${r.id}')" title="Toucher pour voir les mois de saison">🍂 Hors saison ce mois</button>`;
          })()}
        </div>

        ${metaBarHtml}

        <div class="recipe-quick-actions">
          <button class="btn-cook btn-cook-full" onclick="markAsCooked('${r.id}')" title="Enregistrer dans l'historique de cuisson">
            <span>✓</span> J'ai cuisiné cette recette aujourd'hui
          </button>
        </div>

        <div class="servings-block">
          <div class="servings-block-main">
            <span class="servings-block-label">Portions</span>
            <div class="servings-controls">
              <button class="servings-btn" id="servings-minus" ${r.currentServings <= 1 ? 'disabled' : ''}>−</button>
              <span class="servings-value" id="servings-value">${r.currentServings}</span>
              <button class="servings-btn" id="servings-plus">+</button>
            </div>
          </div>
          <div class="servings-block-presets">
            ${state.prefs.servingsPresets.map(p => `<button class="servings-preset ${r.currentServings === p ? 'active' : ''}" onclick="setServings('${r.id}', ${p})">${p}</button>`).join('')}
          </div>
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
            <span class="recipe-section-count">${r.ingredients.length}</span>
          </h3>
          <div class="ingredients-list" id="ingredients-list">
            ${renderIngredientsList(r.ingredients, ratio, r.id)}
          </div>
          <button class="recipe-inline-add" onclick="addIngredientInline('${r.id}')">+ Ajouter un ingrédient</button>
          ${(() => {
            const inPantryCount = r.ingredients.filter(i => isInPantry(i.name)).length;
            const toBuyCount = r.ingredients.filter(i => !isInPantry(i.name) && !isShoppingExcluded(i.name)).length;
            const parts = [];
            if (inPantryCount > 0) parts.push(`<span class="ingredients-hint-pill ingredients-hint-pantry">📦 ${inPantryCount} chez vous</span>`);
            if (toBuyCount > 0) parts.push(`<span class="ingredients-hint-pill ingredients-hint-buy">🛒 ${toBuyCount} à acheter</span>`);
            return parts.length > 0 ? `<div class="ingredients-pantry-hint">${parts.join('')}</div>` : '';
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
            <span class="recipe-section-count">${r.steps.length}</span>
            <button class="recipe-section-kebab" onclick="openStepsKebabMenu('${r.id}')" aria-label="Outils IA pour les étapes">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="5" r="1.5" fill="currentColor"/>
                <circle cx="12" cy="12" r="1.5" fill="currentColor"/>
                <circle cx="12" cy="19" r="1.5" fill="currentColor"/>
              </svg>
            </button>
          </h3>
          <div class="steps-list" id="steps-list">
            ${renderStepsList(r.steps, r.ingredients, ratio, r.id)}
          </div>
          <button class="recipe-inline-add" onclick="addStepInline('${r.id}')">+ Ajouter une étape</button>
        </div>

      </div>
      ${(() => {
        // === Sticky action bar en bas ===
        // 3 modes :
        //   - planning-current : Changer / Valider (priorité)
        //   - planning-candidate : Confirmer (priorité)
        //   - normal : Mode cuisine + Ajouter aux courses
        const ctx = state._planningContext;
        if (ctx && ctx.mode === 'current' && ctx.originalRecipeId === r.id) {
          const slotLbl = (MEAL_SLOTS.find(s => s.id === ctx.slotId) || {}).label || ctx.slotId;
          let dLbl = ctx.dateStr;
          try {
            const [y, m, day] = ctx.dateStr.split('-').map(Number);
            const dObj = new Date(y, m - 1, day);
            dLbl = dObj.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
          } catch (e) {}
          return `
            <div class="recipe-detail-sticky is-planning-current">
              <p class="recipe-detail-sticky-info">📅 Planifiée pour <strong>${escapeHtml(dLbl)}</strong> · <strong>${escapeHtml(slotLbl)}</strong></p>
              <div class="recipe-detail-sticky-actions">
                <button class="btn-secondary" onclick="changePlanningRecipe()">🔄 Changer</button>
                <button class="btn-primary" onclick="confirmPlanningCurrent()">✓ Valider le choix</button>
              </div>
            </div>
          `;
        }
        if (ctx && ctx.mode === 'candidate' && ctx.candidateRecipeId === r.id) {
          return `
            <div class="recipe-detail-sticky is-planning-candidate">
              <p class="recipe-detail-sticky-info">🔄 Remplacer la recette planifiée par celle-ci ?</p>
              <div class="recipe-detail-sticky-actions">
                <button class="btn-primary btn-block" onclick="confirmPlanningCandidate()">✓ Confirmer le changement</button>
              </div>
            </div>
          `;
        }
        // Mode normal : actions principales toujours à portée de pouce
        const shoppingBtn = isInShopping
          ? `<button class="btn-secondary recipe-detail-sticky-shopping" onclick="removeFromShopping('${r.id}')" title="Retirer de la liste de courses">
              <span>✓</span> Dans les courses
            </button>`
          : `<button class="btn-primary recipe-detail-sticky-shopping" onclick="addToShopping('${r.id}', ${r.currentServings})" title="Ajouter à la liste de courses">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="btn-icon">
                <path d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              <span>Courses</span>
            </button>`;
        return `
          <div class="recipe-detail-sticky">
            <div class="recipe-detail-sticky-actions">
              ${shoppingBtn}
              <button class="btn-primary recipe-detail-sticky-cook" onclick="enterCookingMode('${r.id}')" title="Lancer le mode cuisine pas-à-pas">
                <span>👨‍🍳</span> Mode cuisine
              </button>
            </div>
          </div>
        `;
      })()}
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

  // Restaurer la position de scroll (sauf si on vient juste d'ouvrir la recette)
  // requestAnimationFrame pour s'assurer que le layout est calculé
  if (scrollTop > 0 && mainContent) {
    requestAnimationFrame(() => {
      mainContent.scrollTop = scrollTop;
    });
  }
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
  if (state.verifiedFilter && state.verifiedFilter !== 'all') {
    const verifLabel = state.verifiedFilter === 'verified' ? '✅ Vérifiées' : '☐ À vérifier';
    chips.push(`<button class="active-filter-chip" onclick="clearOneFilter('verified')">${verifLabel} ✕</button>`);
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
  else if (type === 'verified') state.verifiedFilter = 'all';
  if (type === 'category' || type === 'month' || type === 'verified') {
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
  state.verifiedFilter = 'all';
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
    // Helper unifié : gère ancien (ingredientIds) et nouveau (ingredientUses) format
    const uses = getStepIngredientUses(step, ingredients);
    const stepIngredients = uses.map(use => {
      const amount = use.amount != null && use.amount !== '' ? Number(use.amount) * ratio : '';
      const isPartialClass = use.isPartial ? ' is-partial' : '';
      const noteHtml = use.note ? ` <span class="step-ingredient-note">${escapeHtml(use.note)}</span>` : '';
      return `<span class="step-ingredient-chip${isPartialClass}">${escapeHtml(use.name)}${amount === '' ? '' : ' · ' + formatAmount(amount, use.unit)}${noteHtml}</span>`;
    }).join('');
    // Affichage tap-hint : si étape avec ingrédients liés, ajouter une icône ✏️ discrète pour signaler éditabilité
    const stepIngredientsBlock = stepIngredients
      ? `<div class="step-ingredients is-editable" onclick="event.stopPropagation(); openStepIngredientUsesDialog('${recipeId}', ${i})" title="Toucher pour modifier les ingrédients de cette étape">${stepIngredients}<span class="step-ingredients-edit-hint" aria-hidden="true">✏️</span></div>`
      : `<button class="step-ingredients-empty" onclick="event.stopPropagation(); openStepIngredientUsesDialog('${recipeId}', ${i})">+ Lier des ingrédients à cette étape</button>`;

    // NOUVEAU : détecter les durées dans le texte de l'étape + appliquer les overrides utilisateur
    const rawDurations = extractDurations(step.text || '');
    const overrides = Array.isArray(step.timerOverrides) ? step.timerOverrides : [];
    const durations = rawDurations.map(d => {
      const ov = overrides.find(o => o.originalLabel === d.label);
      if (ov) return { label: ov.label || d.label, minutes: ov.minutes, originalLabel: d.label, isOverridden: true };
      return { ...d, originalLabel: d.label, isOverridden: false };
    });
    const timerButtons = durations.map((d, dIdx) => {
      const seconds = Math.round(d.minutes * 60);
      const overrideClass = d.isOverridden ? ' is-overridden' : '';
      return `<span class="step-timer-group${overrideClass}">
        <button class="step-timer-btn" onclick="event.stopPropagation(); startStepTimer(${seconds}, '${escapeHtml(d.label)}', '${recipeId}', ${i})" title="Démarrer un minuteur de ${d.label}">
          <span class="step-timer-icon">⏱️</span>
          <span class="step-timer-label">${escapeHtml(d.label)}</span>
        </button>
        <button class="step-timer-edit" onclick="event.stopPropagation(); openStepTimerEdit('${recipeId}', ${i}, '${escapeHtml(d.originalLabel)}')" aria-label="Modifier la durée" title="Modifier la durée">✏️</button>
      </span>`;
    }).join('');

    return `
      <div class="step-item" onclick="editStepInline('${recipeId}', ${i})" title="Toucher pour modifier le texte">
        <div class="step-number">${i + 1}</div>
        <div class="step-content">
          <div class="step-text">${escapeHtml(step.text)}</div>
          ${stepIngredientsBlock}
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

// Menu kebab ⋮ à côté du titre "Étapes" : outils IA techniques (recalcul, restauration)
// rangés hors du flux principal de la fiche.
function openStepsKebabMenu(id) {
  const recipe = state.recipes.find(r => r.id === id);
  if (!recipe) return;
  const hasBackup = recipe._stepsBackup?.lastRecalc;
  let menu = document.getElementById('recipe-kebab-menu');
  if (menu) menu.remove();
  menu = document.createElement('div');
  menu.id = 'recipe-kebab-menu';
  menu.className = 'recipe-kebab-menu';
  menu.innerHTML = `
    <div class="recipe-kebab-backdrop"></div>
    <div class="recipe-kebab-panel">
      <div class="recipe-kebab-header">Outils IA — Étapes</div>
      <button class="recipe-kebab-item" data-action="recalc">
        <span class="recipe-kebab-icon">🪄</span>
        <div class="recipe-kebab-item-text">
          <span>Recalculer ingrédients-étapes</span>
          <small>L'IA réanalyse quel ingrédient est utilisé à chaque étape (~1 centime)</small>
        </div>
      </button>
      ${hasBackup ? `
        <button class="recipe-kebab-item" data-action="restore">
          <span class="recipe-kebab-icon">↶</span>
          <div class="recipe-kebab-item-text">
            <span>Restaurer l'ancien état</span>
            <small>Annule le dernier recalcul IA</small>
          </div>
        </button>
      ` : ''}
    </div>
  `;
  document.body.appendChild(menu);
  const close = () => menu.remove();
  menu.querySelector('.recipe-kebab-backdrop').addEventListener('click', close);
  menu.querySelectorAll('.recipe-kebab-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      close();
      if (action === 'recalc') recalcSingleRecipe(id);
      else if (action === 'restore') restoreRecipeSteps(id);
    });
  });
}
window.openStepsKebabMenu = openStepsKebabMenu;

// Menu kebab ⋮ sur le hero de la fiche recette : range les actions secondaires
// (Modifier, Supprimer) pour éviter les appuis accidentels destructifs depuis le hero.
function openRecipeKebabMenu(id) {
  let menu = document.getElementById('recipe-kebab-menu');
  if (menu) menu.remove();
  menu = document.createElement('div');
  menu.id = 'recipe-kebab-menu';
  menu.className = 'recipe-kebab-menu';
  menu.innerHTML = `
    <div class="recipe-kebab-backdrop"></div>
    <div class="recipe-kebab-panel">
      <button class="recipe-kebab-item" data-action="edit">
        <span class="recipe-kebab-icon">✏️</span>
        <span>Modifier (formulaire complet)</span>
      </button>
      <button class="recipe-kebab-item is-danger" data-action="delete">
        <span class="recipe-kebab-icon">🗑️</span>
        <span>Supprimer la recette</span>
      </button>
    </div>
  `;
  document.body.appendChild(menu);
  const close = () => menu.remove();
  menu.querySelector('.recipe-kebab-backdrop').addEventListener('click', close);
  menu.querySelectorAll('.recipe-kebab-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      close();
      if (action === 'edit') editRecipe(id);
      else if (action === 'delete') confirmDeleteRecipe(id);
    });
  });
}
window.openRecipeKebabMenu = openRecipeKebabMenu;

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
      { text: '', ingredientUses: [] }
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
  // Toast contextuel qui change selon le nombre de fois cuisinée
  const count = recipe.cookedHistory.length;
  let msg;
  if (count === 1) msg = '🎉 Première fois ! Recette ajoutée à l\'historique';
  else if (count === 2) msg = '👏 Bravo, deuxième fois !';
  else if (count === 5) msg = '🔥 5 fois déjà — c\'est un classique !';
  else if (count === 10) msg = '⭐ 10 fois ! Cette recette mérite une étoile';
  else if (count % 10 === 0) msg = `✨ ${count}ᵉ fois — une vraie référence !`;
  else if (count <= 3) msg = `Bravo, ${count}ᵉ fois ✓`;
  else msg = `✓ Recette faite (${count}ᵉ fois)`;
  showToast(msg, 'success');
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

// Détail de saisonnalité : modal compacte qui montre les 12 mois,
// avec ceux où la recette est de saison surlignés. Permet aussi d'ajuster les mois.
async function openSeasonalityDetail(id) {
  const recipe = state.recipes.find(r => r.id === id);
  if (!recipe) return;
  const currentMonth = getCurrentMonth();
  const selected = new Set(recipe.months || []);

  let menu = document.getElementById('recipe-kebab-menu');
  if (menu) menu.remove();
  menu = document.createElement('div');
  menu.id = 'recipe-kebab-menu';
  menu.className = 'recipe-kebab-menu';
  const monthsHtml = [1,2,3,4,5,6,7,8,9,10,11,12].map(m => {
    const isSel = selected.has(m);
    const isCur = m === currentMonth;
    return `<button class="seasonality-month-chip ${isSel ? 'is-selected' : ''} ${isCur ? 'is-current' : ''}" data-month="${m}">
      ${MONTH_NAMES[m]}${isCur ? ' ·' : ''}
    </button>`;
  }).join('');
  const summary = selected.size === 0
    ? '🌍 Toute saison (aucun mois spécifique)'
    : (selected.has(currentMonth) ? `✅ De saison en ${MONTH_NAMES[currentMonth]}` : `🍂 Hors saison en ${MONTH_NAMES[currentMonth]}`);
  menu.innerHTML = `
    <div class="recipe-kebab-backdrop"></div>
    <div class="recipe-kebab-panel">
      <div class="recipe-kebab-header">Mois de saisonnalité</div>
      <p class="seasonality-summary">${summary}</p>
      <div class="seasonality-grid">${monthsHtml}</div>
      <p class="seasonality-hint">Touche un mois pour l'activer/désactiver. Aucun mois = toute saison.</p>
    </div>
  `;
  document.body.appendChild(menu);
  const close = () => menu.remove();
  menu.querySelector('.recipe-kebab-backdrop').addEventListener('click', close);
  let changed = false;
  menu.querySelectorAll('.seasonality-month-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const m = Number(btn.dataset.month);
      if (selected.has(m)) selected.delete(m); else selected.add(m);
      btn.classList.toggle('is-selected', selected.has(m));
      changed = true;
    });
  });
  // Sauvegarde différée à la fermeture (UX moins intrusive)
  menu.addEventListener('click', e => {
    if (e.target === menu.querySelector('.recipe-kebab-backdrop') && changed) {
      const sorted = [...selected].sort((a, b) => a - b);
      recipe.months = sorted;
      updateRecipeAndSync(recipe, 'mois modifiés');
      if (state.currentView === 'recipe' && state.currentRecipe?.id === id) {
        state.currentRecipe.months = sorted;
        renderRecipeDetail(recipe);
      }
    }
  }, true);
}
window.openSeasonalityDetail = openSeasonalityDetail;

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

// ============================================
// RECALCUL DES INGRÉDIENTS-ÉTAPES (via IA)
// ============================================

// Prompt système spécifique : on demande à Claude de REMAPPER les étapes
// d'une recette EXISTANTE selon les règles précises de ingredientUses.
const RECALC_PROMPT = `Tu reçois une recette EXISTANTE avec ses ingrédients et étapes.

Ta seule mission : pour chaque étape, déterminer le tableau "ingredientUses" — les ingrédients PHYSIQUEMENT MANIPULÉS à cette étape (pas ceux mentionnés en référence à un état antérieur).

RÈGLES IMPÉRATIVES :

✅ INCLUS un ingrédient si l'étape contient un verbe d'action TRANSITIF sur l'ingrédient brut/réel :
  - "ajouter X", "verser X", "mélanger X", "incorporer X", "couper X"
  - "éplucher X", "battre X", "fouetter X", "saler", "poivrer", "sucrer", "beurrer (le moule)"
  - "cuire X", "faire fondre X", "faire revenir X", "monter X (en neige)"

❌ N'INCLUS PAS un ingrédient si l'étape contient SEULEMENT :
  - Une référence à un ÉTAT précédent : "une fois le X cuit/fondu/refroidi/prêt", "quand le X est..."
  - Une référence à une PRÉPARATION INTERMÉDIAIRE : "le mélange de X", "la préparation", "la sauce", "l'appareil", "la pâte", "la masse"
  - Une mention anticipée : "qu'on ajoutera plus tard"
  - Une mention dans la description du résultat : "obtenir la consistance du X"

QUANTITÉS PARTIELLES :
- Si un ingrédient est utilisé en UNE SEULE FOIS dans toute la recette : omets "amount" et "unit"
- Si un ingrédient est divisé en plusieurs portions (ex: "150g pour la pâte" puis "50g pour saupoudrer") :
  - Indique "amount" et "unit" pour CHAQUE étape concernée
  - Ajoute "note" (très courte, max 5 mots) pour expliquer le rôle de la portion
  - La somme des "amount" doit correspondre à la quantité totale de l'ingrédient

FORMAT DE SORTIE (JSON STRICT entre balises) :
<steps>
[
  {
    "ingredientUses": [
      { "id": "ing1" },
      { "id": "ing2", "amount": 100, "unit": "g", "note": "pour la pâte" }
    ]
  }
]
</steps>

L'array DOIT contenir exactement le même nombre d'éléments que la recette d'origine. L'ordre doit correspondre à l'ordre des étapes.

Ne renvoie RIEN d'autre que le bloc <steps>...</steps>.`;

async function recalculateRecipeSteps(recipeId, options = {}) {
  const recipe = state.recipes.find(r => r.id === recipeId);
  if (!recipe) return { ok: false, error: 'Recette introuvable' };
  if (!state.apiKey) return { ok: false, error: 'Clé API Claude requise' };
  if (!recipe.steps || recipe.steps.length === 0) return { ok: false, error: 'Pas d\'étapes' };

  // Sauvegarder l'état actuel des steps pour permettre un éventuel rollback
  const originalSteps = JSON.parse(JSON.stringify(recipe.steps));

  // Construire le prompt utilisateur
  const userPrompt = `Voici la recette à recalculer :

TITRE : ${recipe.title}

INGRÉDIENTS :
${recipe.ingredients.map(i => `- { "id": "${i.id}", "name": "${i.name}", "amount": ${i.amount}, "unit": "${i.unit || ''}" }`).join('\n')}

ÉTAPES (numérotées, dans l'ordre) :
${recipe.steps.map((s, i) => `${i + 1}. ${s.text}`).join('\n')}

Renvoie le bloc <steps>...</steps> avec les ingredientUses pour chaque étape.`;

  try {
    const response = await callClaudeAPI([{ role: 'user', content: userPrompt }], {
      system: RECALC_PROMPT,
      maxTokens: 3000
    });

    // Parser la réponse
    const match = response.match(/<steps>([\s\S]*?)<\/steps>/);
    if (!match) {
      return { ok: false, error: 'Réponse IA invalide' };
    }
    const cleanJson = match[1].trim().replace(/^```json\s*/i, '').replace(/```$/, '').trim();
    const stepsArr = JSON.parse(cleanJson);
    if (!Array.isArray(stepsArr) || stepsArr.length !== recipe.steps.length) {
      return { ok: false, error: `L'IA a renvoyé ${stepsArr?.length} étapes au lieu de ${recipe.steps.length}` };
    }

    // Appliquer : on garde le texte, on remplace ingredientUses
    const ingredientIdSet = new Set(recipe.ingredients.map(i => i.id));
    recipe.steps = recipe.steps.map((step, i) => {
      const newUses = (stepsArr[i].ingredientUses || []).filter(u => u && u.id && ingredientIdSet.has(u.id));
      return {
        text: step.text,
        ingredientUses: newUses.map(u => {
          const cleaned = { id: u.id };
          if (u.amount != null && !isNaN(Number(u.amount))) cleaned.amount = Number(u.amount);
          if (u.unit) cleaned.unit = String(u.unit);
          if (u.note) cleaned.note = String(u.note);
          return cleaned;
        })
      };
    });

    // Fallback : algo client par-dessus pour combler les oublis de l'IA
    if (typeof enrichStepIngredientIds === 'function') {
      recipe.steps = enrichStepIngredientIds(recipe.steps, recipe.ingredients);
    }

    // Sauver l'ancien état dans le changeLog pour permettre la restauration
    if (!recipe._stepsBackup) recipe._stepsBackup = {};
    recipe._stepsBackup.lastRecalc = {
      at: Date.now(),
      steps: originalSteps
    };

    updateRecipeAndSync(recipe, 'ingrédients-étapes recalculés par IA');
    return { ok: true };
  } catch (e) {
    // Restaurer si erreur
    recipe.steps = originalSteps;
    return { ok: false, error: e.message };
  }
}
window.recalculateRecipeSteps = recalculateRecipeSteps;

// Restaure les ingredientUses précédant le dernier recalcul
function restoreRecipeSteps(recipeId) {
  const recipe = state.recipes.find(r => r.id === recipeId);
  if (!recipe || !recipe._stepsBackup?.lastRecalc) {
    showToast('Aucune sauvegarde à restaurer', 'error');
    return false;
  }
  recipe.steps = JSON.parse(JSON.stringify(recipe._stepsBackup.lastRecalc.steps));
  delete recipe._stepsBackup;
  updateRecipeAndSync(recipe, 'ingrédients-étapes restaurés');
  if (state.currentView === 'recipe' && state.currentRecipe?.id === recipeId) {
    state.currentRecipe = { ...recipe, currentServings: state.currentRecipe?.currentServings || recipe.baseServings };
    renderRecipeDetail(recipe);
  }
  showToast('Restauré ✓', 'success');
  return true;
}
window.restoreRecipeSteps = restoreRecipeSteps;

// Toggle "Vérifié par l'humain" : checkbox pour marquer une recette comme validée
function toggleVerifiedByHuman(recipeId) {
  const recipe = state.recipes.find(r => r.id === recipeId);
  if (!recipe) return;
  recipe.verifiedByHuman = !recipe.verifiedByHuman;
  updateRecipeAndSync(recipe, recipe.verifiedByHuman ? 'marquée vérifiée par humain' : 'vérification humain retirée');
  if (state.currentView === 'recipe' && state.currentRecipe?.id === recipeId) {
    state.currentRecipe = { ...recipe, currentServings: state.currentRecipe?.currentServings || recipe.baseServings };
    renderRecipeDetail(recipe);
  }
  showToast(recipe.verifiedByHuman ? '✅ Marquée vérifiée' : '☐ Vérification retirée', '');
}
window.toggleVerifiedByHuman = toggleVerifiedByHuman;

// Bouton individuel sur la fiche recette : "Recalculer les associations ingrédients-étapes"
async function recalcSingleRecipe(recipeId) {
  const recipe = state.recipes.find(r => r.id === recipeId);
  if (!recipe) return;

  const hasBackup = recipe._stepsBackup?.lastRecalc;
  const confirmMsg = hasBackup
    ? `Recalculer les ingrédients utilisés à chaque étape ?\n\n• Coût estimé : ~1 centime\n• Sauvegarde de l'ancien remplacée\n• Bouton "Restaurer" disponible après`
    : `Recalculer les ingrédients utilisés à chaque étape ?\n\n• L'IA va analyser le texte de chaque étape\n• Coût estimé : ~1 centime\n• Sauvegarde automatique de l'ancien, restauration possible`;

  if (!(await uiConfirm(confirmMsg, { confirmLabel: 'Recalculer' }))) return;

  showToast('Recalcul en cours...', '');
  const result = await recalculateRecipeSteps(recipeId);
  if (result.ok) {
    if (state.currentView === 'recipe' && state.currentRecipe?.id === recipeId) {
      state.currentRecipe = { ...recipe, currentServings: state.currentRecipe?.currentServings || recipe.baseServings };
      renderRecipeDetail(recipe);
    }
    showToast('Recalcul terminé ✓', 'success');
  } else {
    showToast('Erreur : ' + result.error, 'error');
  }
}
window.recalcSingleRecipe = recalcSingleRecipe;

// Bouton global dans paramètres : recalculer TOUTES les recettes
async function recalcAllRecipes() {
  const count = state.recipes.length;
  if (count === 0) {
    await uiAlert('Aucune recette à recalculer.');
    return;
  }
  const costEstimate = Math.ceil(count * 1) / 100; // ~1 centime par recette
  if (!(await uiConfirm(
    `Recalculer les ingrédients-étapes de TOUTES vos ${count} recettes ?\n\n• Coût estimé : environ ${costEstimate.toFixed(2)} €\n• Durée : ~${Math.ceil(count * 3 / 60)} min\n• Sauvegarde de chaque ancien état, restauration possible recette par recette`,
    { confirmLabel: 'Lancer le recalcul' }
  ))) return;

  // Modal de progression
  const modal = _ensureDialogModal();
  modal.querySelector('.ui-dialog-content').innerHTML = `
    <div class="ui-dialog-body">
      <h2 class="ui-dialog-title">Recalcul en cours</h2>
      <p class="ui-dialog-message" id="recalc-progress-text">Préparation...</p>
      <div class="recalc-progress-bar"><div class="recalc-progress-fill" id="recalc-progress-fill" style="width: 0%"></div></div>
      <p class="ui-dialog-message" id="recalc-progress-detail" style="font-size:11px;color:var(--color-gray-500);margin-top:8px"></p>
    </div>
    <div class="ui-dialog-actions">
      <button class="btn-secondary" id="recalc-cancel-btn">Arrêter</button>
    </div>
  `;
  modal.classList.remove('hidden');

  let cancelled = false;
  document.getElementById('recalc-cancel-btn').addEventListener('click', () => {
    cancelled = true;
  });

  let ok = 0, ko = 0;
  for (let i = 0; i < state.recipes.length; i++) {
    if (cancelled) break;
    const recipe = state.recipes[i];
    document.getElementById('recalc-progress-text').textContent = `${i + 1} / ${count} — ${recipe.title}`;
    document.getElementById('recalc-progress-fill').style.width = `${((i) / count) * 100}%`;
    document.getElementById('recalc-progress-detail').textContent = `Réussies : ${ok} · Échecs : ${ko}`;

    try {
      const result = await recalculateRecipeSteps(recipe.id);
      if (result.ok) ok++; else ko++;
    } catch (e) {
      ko++;
    }
  }

  modal.querySelector('.ui-dialog-content').innerHTML = `
    <div class="ui-dialog-body">
      <h2 class="ui-dialog-title">${cancelled ? 'Recalcul arrêté' : 'Recalcul terminé'}</h2>
      <p class="ui-dialog-message">${ok} recette${ok > 1 ? 's' : ''} recalculée${ok > 1 ? 's' : ''} avec succès${ko > 0 ? `, ${ko} échec${ko > 1 ? 's' : ''}` : ''}.</p>
    </div>
    <div class="ui-dialog-actions">
      <button class="btn-primary" id="recalc-done-btn" style="flex:1">OK</button>
    </div>
  `;
  document.getElementById('recalc-done-btn').addEventListener('click', () => modal.classList.add('hidden'));
}
window.recalcAllRecipes = recalcAllRecipes;

// Recalcul local des tags FODMAP et des mois de saisonnalité (pas d'appel IA)
async function recalcAllFodmapAndSeasonality() {
  const count = state.recipes.length;
  if (!count) { await uiAlert('Aucune recette à recalculer.'); return; }
  const canFodmap = typeof calculateFodmapTags === 'function';
  const canSeason = typeof calculateSeasonality === 'function';
  if (!canFodmap && !canSeason) {
    await uiAlert('Fonctions de calcul indisponibles (data.js non chargé ?).');
    return;
  }
  if (!(await uiConfirm(
    `Recalculer FODMAP & saisonnalité pour les ${count} recettes ?\n\n• Local, instantané, gratuit (pas d'IA)\n• Tags low/high FODMAP recalculés depuis les ingrédients\n• Mois de saisonnalité recalculés depuis le calendrier Greenpeace`,
    { confirmLabel: 'Recalculer' }
  ))) return;

  let high = 0, low = 0, monthsChanged = 0;
  state.recipes = state.recipes.map(r => {
    if (!r.ingredients) return r;
    let next = { ...r };

    if (canFodmap) {
      const currentDiets = Array.isArray(r.dietTags) ? r.dietTags.slice() : [];
      const cleanedDiets = currentDiets.filter(t => t !== 'low-fodmap' && t !== 'high-fodmap' && t !== 'fodmap');
      const autoFodmap = calculateFodmapTags(r.ingredients);
      if (autoFodmap.includes('high-fodmap')) high++;
      else if (autoFodmap.includes('low-fodmap')) low++;
      next.dietTags = [...cleanedDiets, ...autoFodmap];
    }

    if (canSeason) {
      const newMonths = calculateSeasonality(r.ingredients);
      const oldMonths = Array.isArray(r.months) ? r.months : [];
      if (JSON.stringify(oldMonths) !== JSON.stringify(newMonths)) monthsChanged++;
      next.months = newMonths;
    }

    return next;
  });
  saveRecipes();
  try {
    if (canFodmap) localStorage.setItem('mr_fodmap_version', 'fodmap-auto-v4');
    if (canSeason) localStorage.setItem('mr_seasonality_version', 'greenpeace-2026');
  } catch {}
  hideSettings();
  renderLibrary();
  const parts = [];
  if (canFodmap) parts.push(`FODMAP ${high} high / ${low} low`);
  if (canSeason) parts.push(`saisonnalité ${monthsChanged} mise${monthsChanged > 1 ? 's' : ''} à jour`);
  showToast(parts.join(' · '), 'success');
}
window.recalcAllFodmapAndSeasonality = recalcAllFodmapAndSeasonality;

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
      // Compression : 720px qualité 70% — ~2× plus léger que 1024×80% pour une qualité
      // visuelle équivalente sur smartphone. Important : localStorage limité ~5-10 MB.
      const dataUrl = await processImageToDataUrl(file, PHOTO_MAX_WIDTH, PHOTO_QUALITY);
      recipe.photo = dataUrl;
      updateRecipeAndSync(recipe, 'photo ajoutée');
      if (state.currentView === 'recipe' && state.currentRecipe?.id === id) {
        state.currentRecipe.photo = dataUrl;
        renderRecipeDetail(recipe);
      }
      showToast('Photo ajoutée ✓', 'success');
    } catch (e) {
      console.error(e);
      // Si l'erreur vient de _validatePhotoFileSize, on a un message clair à afficher
      const msg = e && e.message && (e.message.includes('Mo') || e.message.includes('image'))
        ? e.message
        : 'Erreur lors de l\'ajout de la photo';
      showToast(msg, 'error');
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

// Dialog identique à _showPhotoSourceDialog mais sans "Supprimer" (utilisé pour le chat)
// Retourne 'camera', 'gallery' ou null (annulé)
function _showChatPhotoSourceDialog() {
  return new Promise(resolve => {
    const modal = _ensureDialogModal();
    const content = modal.querySelector('.ui-dialog-content');
    content.innerHTML = `
      <div class="ui-dialog-body">
        <h2 class="ui-dialog-title">Ajouter une photo</h2>
        <p class="ui-dialog-message">Comment souhaitez-vous ajouter la photo ?</p>
        <div class="photo-source-options">
          <button class="photo-source-btn" id="chat-photo-src-camera">
            <span class="photo-source-icon">📸</span>
            <span class="photo-source-label">Prendre une photo</span>
            <span class="photo-source-desc">Utiliser l'appareil photo</span>
          </button>
          <button class="photo-source-btn" id="chat-photo-src-gallery">
            <span class="photo-source-icon">🖼️</span>
            <span class="photo-source-label">Choisir dans la galerie</span>
            <span class="photo-source-desc">Sélectionner une image existante</span>
          </button>
        </div>
      </div>
      <div class="ui-dialog-actions">
        <button class="btn-secondary" id="chat-photo-src-cancel" style="flex:1">Annuler</button>
      </div>
    `;
    modal.classList.remove('hidden');
    const cleanup = () => modal.classList.add('hidden');
    document.getElementById('chat-photo-src-camera').addEventListener('click', () => {
      cleanup(); resolve('camera');
    });
    document.getElementById('chat-photo-src-gallery').addEventListener('click', () => {
      cleanup(); resolve('gallery');
    });
    document.getElementById('chat-photo-src-cancel').addEventListener('click', () => {
      cleanup(); resolve(null);
    });
    modal.querySelector('.ui-dialog-backdrop').addEventListener('click', () => {
      cleanup(); resolve(null);
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
// ============================================
// CONSTANTES DE LIMITES (anti-magic-numbers)
// ============================================
// Photo : la compression cible 720px / qualité 70%, mais avant compression on rejette
// les fichiers > 15 Mo (vidéo confondue avec photo, RAW non compressé, etc.)
const PHOTO_MAX_FILE_SIZE_MB = 15;
const PHOTO_MAX_WIDTH = 720;          // dimension max après compression (px)
const PHOTO_QUALITY = 0.7;            // qualité JPEG après compression (0-1)
const PHOTO_QUALITY_AGGRESSIVE = 0.55; // qualité utilisée par "Libérer l'espace" (re-compression masse)
const PHOTO_MAX_WIDTH_AGGRESSIVE = 480; // dim. cible pour re-compression masse

// Chat IA : on garde au max les N derniers messages pour borner mémoire et coût API
const CHAT_HISTORY_MAX = 50;

// File d'attente des recettes en validation après extraction IA multi-recettes
const PENDING_RECIPES_QUEUE_MAX = 10;

// LocalStorage quota approximatif des navigateurs mobiles (informatif, pas un hard cap)
const LOCAL_STORAGE_QUOTA_MB = 5;

function _validatePhotoFileSize(file) {
  if (!file) throw new Error('Aucun fichier fourni');
  if (!file.type || !file.type.startsWith('image/')) {
    throw new Error(`Fichier non reconnu comme image (type: ${file.type || 'inconnu'})`);
  }
  const sizeMB = file.size / (1024 * 1024);
  if (sizeMB > PHOTO_MAX_FILE_SIZE_MB) {
    throw new Error(`Photo trop lourde (${sizeMB.toFixed(1)} Mo). Maximum : ${PHOTO_MAX_FILE_SIZE_MB} Mo.`);
  }
}

async function processImageToDataUrl(file, maxSize, quality) {
  _validatePhotoFileSize(file);
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
// ANTI-VEILLE (Wake Lock global, actif toute l'app)
// ============================================

let _wakeLock = null;

async function acquireWakeLock() {
  if (!('wakeLock' in navigator)) return;
  if (_wakeLock) return;
  try {
    _wakeLock = await navigator.wakeLock.request('screen');
    _wakeLock.addEventListener('release', () => { _wakeLock = null; });
  } catch (e) {
    // Peut échouer si l'onglet n'est pas visible, permission refusée, etc.
    console.warn('Wake lock indisponible:', e && e.message);
  }
}

async function releaseWakeLock() {
  if (!_wakeLock) return;
  try { await _wakeLock.release(); } catch {}
  _wakeLock = null;
}

// L'OS relâche le lock quand la page perd le focus : on le ré-acquiert au retour
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') acquireWakeLock();
});

// ============================================
// MODE CUISINE (pas-à-pas plein écran)
// ============================================

async function enterCookingMode(id) {
  const recipe = state.recipes.find(r => r.id === id);
  if (!recipe) return;
  state.cookingMode = { active: true, currentStep: 0, recipeId: id };
  pushOverlay('cooking');
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
  // Helper unifié : gère ancien (ingredientIds) et nouveau (ingredientUses) format
  const stepIngs = getStepIngredientUses(step, recipe.ingredients);

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
          ${stepIngs.map(use => {
            const amt = use.amount != null ? formatAmount(Number(use.amount) * ratio, use.unit) : '';
            const noteHtml = use.note ? `<span class="cooking-ingredient-note">${escapeHtml(use.note)}</span>` : '';
            return `<div class="cooking-ingredient${use.isPartial ? ' is-partial' : ''}">
              <span>${escapeHtml(use.name)}${noteHtml}</span>
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
    checked: [],
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  state.shoppingLists.push(list);
  state.activeShoppingListId = list.id;
  state.shopping = list.items;
  state.shoppingChecked = new Set();
  saveShoppingLists();
  syncShoppingList(list.id);
  return list;
}

function switchShoppingList(id) {
  const list = state.shoppingLists.find(l => l.id === id);
  if (!list) return;
  // Sauve la liste courante (items + checked) avant de switch
  saveShopping();
  state.activeShoppingListId = id;
  state.shopping = list.items;
  state.shoppingChecked = new Set(list.checked || []);
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
  const list = state.shoppingLists.find(l => l.id === id);
  if (list) {
    // Tombstone : marque comme supprimée pour propager la suppression via sync
    list.deletedAt = Date.now();
    list.updatedAt = Date.now();
    syncShoppingList(id);
  }
  state.shoppingLists = state.shoppingLists.filter(l => l.id !== id);
  if (state.activeShoppingListId === id) {
    state.activeShoppingListId = state.shoppingLists[0].id;
    state.shopping = state.shoppingLists[0].items;
    state.shoppingChecked = new Set(state.shoppingLists[0].checked || []);
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
  list.updatedAt = Date.now();
  saveShoppingLists();
  syncShoppingList(id);
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
    // Supprimer aussi des références dans les étapes (ancien et nouveau format)
    const removedId = ing.id;
    recipe.ingredients.splice(idx, 1);
    recipe.steps = (recipe.steps || []).map(s => ({
      ...s,
      ingredientIds: (s.ingredientIds || []).filter(id => id !== removedId),
      ingredientUses: (s.ingredientUses || []).filter(u => u.id !== removedId)
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

// Édition de la durée associée à un timer dans une étape.
// La durée est détectée automatiquement dans le texte ; cet override permet de la
// modifier sans toucher au texte. Toast incitatif au save : il faut quand même
// penser à corriger le texte si on veut que la lecture soit cohérente.
async function openStepTimerEdit(recipeId, stepIdx, originalLabel) {
  const recipe = state.recipes.find(r => r.id === recipeId);
  if (!recipe) return;
  const step = recipe.steps[stepIdx];
  if (!step) return;
  if (!Array.isArray(step.timerOverrides)) step.timerOverrides = [];
  const existing = step.timerOverrides.find(o => o.originalLabel === originalLabel);
  const currentMinutes = existing ? existing.minutes : (extractDurations(step.text || '').find(d => d.label === originalLabel)?.minutes || 0);

  const result = await uiPrompt(
    `Durée du minuteur "${originalLabel}" (en minutes) :`,
    String(currentMinutes),
    { confirmLabel: 'Enregistrer', cancelLabel: 'Annuler' }
  );
  if (result === null || result === undefined || result === '') return;
  const minutes = Number(String(result).replace(',', '.'));
  if (!isFinite(minutes) || minutes <= 0) {
    showToast('Durée invalide', 'error');
    return;
  }
  // Format label lisible (ex: 25 → "25 min", 90 → "1h30")
  const formatMinutes = (m) => {
    if (m >= 60) {
      const h = Math.floor(m / 60);
      const rest = Math.round(m - h * 60);
      return rest > 0 ? `${h}h${String(rest).padStart(2, '0')}` : `${h}h`;
    }
    return `${m} min`;
  };
  const newLabel = formatMinutes(minutes);
  // Remplacer ou ajouter l'override
  step.timerOverrides = step.timerOverrides.filter(o => o.originalLabel !== originalLabel);
  step.timerOverrides.push({ originalLabel, minutes, label: newLabel });
  updateRecipeAndSync(recipe, `durée étape ${stepIdx + 1} modifiée`);
  if (state.currentView === 'recipe' && state.currentRecipe?.id === recipeId) {
    state.currentRecipe.steps = recipe.steps;
    renderRecipeDetail(recipe);
  }
  // Toast incitatif : on garde le texte de l'étape inchangé, mais on rappelle qu'il faudrait le mettre à jour
  showToast(`Durée → ${newLabel} · 💡 Pense à mettre à jour le texte de l'étape`, 'success');
}
window.openStepTimerEdit = openStepTimerEdit;

// Dialog de gestion des ingredientUses pour une étape :
// permet d'éditer qté/unité/note de chaque ingrédient référencé,
// d'en retirer, et d'en ajouter parmi ceux de la recette qui ne sont pas encore liés.
function openStepIngredientUsesDialog(recipeId, idx) {
  const recipe = state.recipes.find(r => r.id === recipeId);
  if (!recipe) return;
  const step = recipe.steps[idx];
  if (!step) return;
  // Normaliser en ingredientUses (gère ancien format ingredientIds)
  if (!Array.isArray(step.ingredientUses)) {
    if (Array.isArray(step.ingredientIds)) {
      step.ingredientUses = step.ingredientIds.map(id => ({ id: String(id) }));
    } else {
      step.ingredientUses = [];
    }
  }

  // Construire la liste des ingrédients NON encore référencés (pour le sélecteur d'ajout)
  const renderRows = () => {
    const usedIds = new Set(step.ingredientUses.map(u => u.id));
    const rowsHtml = step.ingredientUses.map((use, useIdx) => {
      const ing = recipe.ingredients.find(i => i.id === use.id);
      if (!ing) return '';
      const placeholderQty = ing.amount != null ? `Total recette : ${ing.amount} ${ing.unit || ''}`.trim() : 'ex: 50';
      return `
        <div class="step-uses-row" data-use-idx="${useIdx}">
          <div class="step-uses-row-name">${escapeHtml(ing.name)}</div>
          <div class="step-uses-row-fields">
            <input type="number" step="any" class="step-uses-input step-uses-qty" placeholder="${escapeHtml(placeholderQty)}" value="${use.amount == null ? '' : use.amount}" data-field="amount">
            <input type="text" class="step-uses-input step-uses-unit" placeholder="${escapeHtml(ing.unit || 'unité')}" value="${escapeHtml(use.unit || '')}" data-field="unit">
            <input type="text" class="step-uses-input step-uses-note" placeholder="note (ex: à part)" value="${escapeHtml(use.note || '')}" data-field="note">
            <button class="step-uses-remove" data-action="remove" aria-label="Retirer cet ingrédient de l'étape">🗑️</button>
          </div>
        </div>
      `;
    }).join('');
    const availableHtml = recipe.ingredients
      .filter(i => !usedIds.has(i.id))
      .map(i => `<button class="step-uses-add-chip" data-add-id="${i.id}">+ ${escapeHtml(i.name)}</button>`)
      .join('');
    return `
      <div class="recipe-kebab-header">Ingrédients de l'étape ${idx + 1}</div>
      <div class="step-uses-list">${rowsHtml || '<p class="step-uses-empty">Aucun ingrédient lié à cette étape. Ajoute-en ci-dessous.</p>'}</div>
      ${availableHtml ? `
        <div class="step-uses-add-header">+ Ajouter un ingrédient à cette étape</div>
        <div class="step-uses-add-list">${availableHtml}</div>
      ` : '<p class="step-uses-empty">Tous les ingrédients de la recette sont déjà liés à cette étape.</p>'}
      <div class="step-uses-actions">
        <button class="btn-secondary step-uses-cancel">Annuler</button>
        <button class="btn-primary step-uses-save">Enregistrer</button>
      </div>
    `;
  };

  let menu = document.getElementById('recipe-kebab-menu');
  if (menu) menu.remove();
  menu = document.createElement('div');
  menu.id = 'recipe-kebab-menu';
  menu.className = 'recipe-kebab-menu';
  menu.innerHTML = `
    <div class="recipe-kebab-backdrop"></div>
    <div class="recipe-kebab-panel step-uses-panel">${renderRows()}</div>
  `;
  document.body.appendChild(menu);
  const close = () => menu.remove();

  // Sauve le state local depuis les inputs courants (sans persister tant qu'on n'a pas cliqué Enregistrer)
  const syncFromInputs = () => {
    menu.querySelectorAll('.step-uses-row').forEach(row => {
      const useIdx = Number(row.dataset.useIdx);
      const use = step.ingredientUses[useIdx];
      if (!use) return;
      row.querySelectorAll('.step-uses-input').forEach(inp => {
        const field = inp.dataset.field;
        const v = inp.value.trim();
        if (field === 'amount') use.amount = v === '' ? null : Number(v);
        else use[field] = v;
      });
    });
  };

  const rebind = () => {
    // Suppressions
    menu.querySelectorAll('[data-action="remove"]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.preventDefault();
        syncFromInputs();
        const row = btn.closest('.step-uses-row');
        const useIdx = Number(row.dataset.useIdx);
        step.ingredientUses.splice(useIdx, 1);
        menu.querySelector('.step-uses-panel').innerHTML = renderRows();
        rebind();
      });
    });
    // Ajouts
    menu.querySelectorAll('[data-add-id]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.preventDefault();
        syncFromInputs();
        step.ingredientUses.push({ id: btn.dataset.addId });
        menu.querySelector('.step-uses-panel').innerHTML = renderRows();
        rebind();
      });
    });
    // Cancel / Save
    menu.querySelector('.step-uses-cancel').addEventListener('click', close);
    menu.querySelector('.step-uses-save').addEventListener('click', () => {
      syncFromInputs();
      // Nettoyer les use vides (id manquant)
      step.ingredientUses = step.ingredientUses.filter(u => u && u.id);
      // Compat : on retire ingredientIds (ancien format) pour éviter incohérence
      delete step.ingredientIds;
      updateRecipeAndSync(recipe, `ingrédients étape ${idx + 1} modifiés`);
      if (state.currentView === 'recipe' && state.currentRecipe?.id === recipeId) {
        state.currentRecipe.steps = recipe.steps;
        renderRecipeDetail(recipe);
      }
      showToast('Ingrédients de l\'étape mis à jour ✓', 'success');
      close();
    });
  };
  rebind();
  menu.querySelector('.recipe-kebab-backdrop').addEventListener('click', close);
}
window.openStepIngredientUsesDialog = openStepIngredientUsesDialog;

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
  recipe.steps.push({ text: result.text.trim(), ingredientUses: [] });
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

      // Alias appris via IA (« concentré tomate » → « concentré de tomate ») avant normalisation
      const syns = (state.prefs && state.prefs.ingredientSynonyms) || {};
      const canonName = syns[ing.name.toLowerCase().trim()] || ing.name;
      const normalizedName = normalizeIngredientName(canonName);
      if (!normalizedName) continue;

      // Conversion d'unités : on essaie de convertir vers la base (ml ou g)
      const norm = normalizeAmount(ing.amount, ing.unit);

      // Clé : si convertible, on groupe juste par nom (pour fusionner ml + cl + l)
      // Sinon on garde l'unité dans la clé
      const key = norm
        ? normalizedName + '|' + norm.type
        : normalizedName + '|' + (ing.unit || '').toLowerCase().trim();

      if (!aggregated[key]) {
        const displayName = canonName.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
        aggregated[key] = {
          name: displayName || canonName,
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

// Nettoie la liste avec l'IA : envoie les noms uniques à Claude, récupère un mapping
// de synonymes et le persiste dans state.prefs.ingredientSynonyms pour toutes les listes à venir.
async function cleanShoppingWithAI() {
  if (!state.apiKey) {
    await uiAlert("Configure d'abord ta clé API Claude dans les paramètres.");
    return;
  }
  const items = aggregateShoppingItems();
  if (items.length < 2) {
    showToast('Liste trop courte pour être nettoyée');
    return;
  }
  const confirmed = await uiConfirm(
    `Analyser ${items.length} articles avec l'IA pour repérer les doublons ?\n\n` +
    `Les variétés (« tomate cerise » ≠ « tomate ») et les couleurs (« poivron rouge » ≠ « poivron vert ») restent séparées.\n\n` +
    `Cet appel utilise ta clé API Claude.`,
    { confirmLabel: 'Nettoyer', cancelLabel: 'Annuler' }
  );
  if (!confirmed) return;

  const names = [...new Set(items.map(it => it.name))];
  const userMsg = `Voici les articles d'une liste de courses en français. Regroupe UNIQUEMENT ceux qui désignent le même produit à acheter (variantes de pluriel, orthographe, synonymes évidents comme "concentré tomate" et "concentré de tomate").

GARDE STRICTEMENT distincts :
- les variétés d'un même produit (tomate cerise ≠ tomate ; pomme de terre nouvelle ≠ pomme de terre)
- les couleurs (poivron rouge ≠ poivron vert ; oignon jaune ≠ oignon rouge)
- les préparations d'achat (fromage râpé ≠ fromage bloc ; bœuf haché ≠ bœuf)

Articles à analyser :
${names.map((n, i) => `${i+1}. ${n}`).join('\n')}

Réponds UNIQUEMENT avec un JSON entre <groupes></groupes>, au format :
[
  { "canonical": "nom canonique préféré", "aliases": ["autre nom 1", "autre nom 2"] }
]

N'inclus QUE les groupes de 2 articles ou plus. N'invente pas d'articles absents de la liste.`;

  const btn = document.getElementById('shopping-cleanup-btn');
  if (btn) { btn.disabled = true; btn.classList.add('is-loading'); }
  showToast('Analyse en cours…');
  try {
    const response = await callClaudeAPI([{ role: 'user', content: userMsg }], { maxTokens: 2000 });
    const match = response.match(/<groupes>([\s\S]*?)<\/groupes>/);
    if (!match) {
      await uiAlert("L'IA n'a pas renvoyé de résultat exploitable. Rien n'a été modifié.");
      return;
    }
    const groups = JSON.parse(match[1].trim().replace(/^```json\s*/i, '').replace(/```$/, ''));
    if (!Array.isArray(groups) || groups.length === 0) {
      showToast('Aucun doublon détecté', 'success');
      return;
    }
    state.prefs.ingredientSynonyms = state.prefs.ingredientSynonyms || {};
    const known = new Set(names.map(n => n.toLowerCase().trim()));
    let count = 0;
    for (const g of groups) {
      if (!g || typeof g.canonical !== 'string' || !Array.isArray(g.aliases)) continue;
      const canonical = g.canonical.trim();
      if (!canonical) continue;
      for (const alias of g.aliases) {
        if (typeof alias !== 'string') continue;
        const aKey = alias.toLowerCase().trim();
        if (!aKey || aKey === canonical.toLowerCase()) continue;
        // Ne stocke que des alias qui viennent bien de la liste (évite les hallucinations)
        if (!known.has(aKey)) continue;
        state.prefs.ingredientSynonyms[aKey] = canonical;
        count++;
      }
    }
    savePrefs();
    renderShopping();
    if (count === 0) {
      showToast('Aucun doublon détecté', 'success');
    } else {
      showToast(`${count} alias enregistré${count > 1 ? 's' : ''}`, 'success');
    }
  } catch (e) {
    console.error(e);
    await uiAlert('Erreur : ' + (e && e.message ? e.message : e));
  } finally {
    if (btn) { btn.disabled = false; btn.classList.remove('is-loading'); }
  }
}
window.cleanShoppingWithAI = cleanShoppingWithAI;

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
        <div class="shopping-recipe-emoji is-clickable" onclick="openRecipe('${r.id}')" role="button" tabindex="0" aria-label="Ouvrir la recette">${r.photo ? `<img src="${r.photo}" alt="" loading="lazy">` : (r.emoji || '🍽️')}</div>
        <div class="shopping-recipe-info">
          <div class="shopping-recipe-name is-clickable" onclick="openRecipe('${r.id}')" role="button" tabindex="0">${escapeHtml(r.title)}</div>
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
  // Persiste et synchronise les cases cochées (avant : perdues au refresh)
  saveShopping();
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
  const messages = document.getElementById('chat-messages');
  if (state.chatAttachments.length === 0) {
    wrap.classList.add('hidden');
    wrap.innerHTML = '';
    if (messages) messages.classList.remove('has-attachments');
    return;
  }
  wrap.classList.remove('hidden');
  if (messages) messages.classList.add('has-attachments');
  wrap.innerHTML = state.chatAttachments.map((att, i) => `
    <div class="chat-attachment-thumb">
      <img src="data:${att.media_type};base64,${att.data}">
      <button class="chat-attachment-remove" onclick="removeAttachment(${i})">×</button>
    </div>
  `).join('');
  // Scroller le chat en bas pour que les attachments soient visibles
  if (messages) {
    setTimeout(() => { messages.scrollTop = messages.scrollHeight; }, 50);
  }
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
- **CAS DES PHOTOS MULTIPLES** : si l'utilisateur envoie N photos qui montrent N recettes différentes (ex: 3 photos de plats différents, ou 3 captures d'écran de pages de livre), tu DOIS extraire UNE recette PAR PHOTO. Si tu n'es pas sûr qu'une photo représente une recette différente (ex: 2 photos du même plat sous 2 angles), demande à l'utilisateur. Par défaut, 1 photo distincte = 1 recette.
- Format : un bloc <recipe>...</recipe> par recette, séparés par un saut de ligne. L'app extraira chacun individuellement.
- Chaque recette doit être complète et autonome (avec son propre schéma JSON complet).
- Si l'utilisateur n'a pas explicitement demandé plusieurs recettes ET n'a envoyé qu'une seule photo OU plusieurs photos du même plat, n'en renvoie qu'UNE seule.

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
    {
      "text": "Description de l'étape",
      "ingredientUses": [
        { "id": "ing1", "amount": 200, "unit": "g", "note": "pour la pâte" }
      ]
    }
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

============================================================
RÈGLES CRITIQUES pour "ingredientUses" : QUAND inclure un ingrédient dans une étape
============================================================

Le champ "ingredientUses" de chaque étape doit contenir UNIQUEMENT les ingrédients qui sont PHYSIQUEMENT MANIPULÉS à cette étape, pas ceux qui sont juste mentionnés en référence à un état précédent.

✅ INCLUS UN INGRÉDIENT si l'étape contient :
- Un verbe d'action TRANSITIF qui s'applique à l'ingrédient brut/réel :
  "ajouter X", "verser X", "mélanger X", "incorporer X", "couper X",
  "éplucher X", "saler", "poivrer", "sucrer", "beurrer (le moule avec X)",
  "battre X", "cuire X", "faire fondre X", "faire revenir X"
- L'ingrédient est physiquement introduit dans la préparation à cette étape
- L'ingrédient est physiquement utilisé pour une action (graisser, étaler dessus, etc.)

❌ N'INCLUS PAS UN INGRÉDIENT si l'étape contient SEULEMENT :
- Une référence à un ÉTAT précédent : "une fois le X cuit/fondu/refroidi", "quand le X est prêt"
- Une référence à une PRÉPARATION INTERMÉDIAIRE : "la pâte", "le mélange", "la préparation", "la sauce", "l'appareil", "la masse"
- Une mention par anticipation : "qu'on ajoutera plus tard", "qui servira pour..."
- Une mention dans une description du résultat attendu : "obtenir une consistance comme le beurre"

============================================================
RÈGLES CRITIQUES pour les QUANTITÉS PARTIELLES (champs amount/unit/note de ingredientUses)
============================================================

Si un ingrédient est utilisé EN UNE SEULE FOIS dans la recette :
→ Tu peux omettre "amount" et "unit" dans ingredientUses (l'app prendra la quantité totale)
→ Exemple : "Beurre 130g" → toutes les utilisations sont dans une seule étape → { "id": "ing_beurre" }

Si un ingrédient est utilisé EN PLUSIEURS FOIS :
→ TU DOIS spécifier "amount" et "unit" dans CHAQUE ingredientUses pour indiquer la portion utilisée à cette étape
→ Optionnellement, ajoute "note" pour expliquer (ex: "pour le moule", "pour la pâte", "pour saupoudrer")
→ La SOMME des amount partiels doit correspondre à la quantité totale de l'ingrédient

Exemple concret : recette financiers
- Ingrédient: { "id": "ing_beurre", "name": "Beurre", "amount": 130, "unit": "g" }
- Étape "Faire fondre le beurre" : { "id": "ing_beurre", "amount": 100, "unit": "g", "note": "pour la pâte" }
- Étape "Beurrer le moule" : { "id": "ing_beurre", "amount": 30, "unit": "g", "note": "pour le moule" }
- Étape "Ajouter le mélange de beurre fondu" : RIEN (le beurre fondu est déjà préparé, c'est une référence)

============================================================
EXEMPLES COMPLETS
============================================================

Recette "Soupe au brocoli" avec ingrédient { "id": "i1", "name": "Brocoli", "amount": 300, "unit": "g" } :
- Étape "Couper le brocoli en bouquets" → ingredientUses: [{ "id": "i1" }] (action sur l'ingrédient)
- Étape "Cuire 15 minutes" → ingredientUses: [] (référence implicite, pas d'action sur l'ingrédient brut)
- Étape "Une fois le brocoli cuit, mixer la soupe" → ingredientUses: [] (référence à l'état cuit)

Recette "Tarte aux pommes" avec ingrédient { "id": "i2", "name": "Pommes", "amount": 800, "unit": "g" } :
- Étape "Éplucher et couper les pommes" → ingredientUses: [{ "id": "i2" }]
- Étape "Disposer les pommes sur la pâte" → ingredientUses: [{ "id": "i2" }] (utilisation active)
- Étape "Servir tiède" → ingredientUses: [] (pas d'action)

Recette avec ingrédient { "id": "i3", "name": "Sucre", "amount": 200, "unit": "g" } divisé :
- Étape "Mélanger 150g de sucre avec les jaunes" → ingredientUses: [{ "id": "i3", "amount": 150, "unit": "g", "note": "pour la crème" }]
- Étape "Saupoudrer le reste du sucre par-dessus" → ingredientUses: [{ "id": "i3", "amount": 50, "unit": "g", "note": "pour saupoudrer" }]

============================================================

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
    recipe.steps = recipe.steps.map(s => {
      const out = { text: s.text || '' };
      // NOUVEAU format : ingredientUses (avec amount/unit/note partiels possibles)
      if (Array.isArray(s.ingredientUses)) {
        out.ingredientUses = s.ingredientUses.map(use => {
          if (!use || !use.id) return null;
          const cleaned = { id: String(use.id) };
          if (use.amount != null && use.amount !== '' && !isNaN(Number(use.amount))) {
            cleaned.amount = Number(use.amount);
          }
          if (use.unit) cleaned.unit = String(use.unit);
          if (use.note) cleaned.note = String(use.note);
          return cleaned;
        }).filter(Boolean);
      }
      // ANCIEN format : ingredientIds → on convertit en ingredientUses simple
      else if (Array.isArray(s.ingredientIds)) {
        out.ingredientUses = s.ingredientIds.map(id => ({ id: String(id) }));
      }
      else {
        out.ingredientUses = [];
      }
      return out;
    });
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

// ============================================
// HELPER : lecture unifiée des ingrédients d'une étape
// ============================================
// Gère 3 formats :
// - NOUVEAU : step.ingredientUses = [{ id, amount?, unit?, note? }, ...]
//   amount/unit/note optionnels. Si absent → utilise la quantité totale de l'ingrédient
// - ANCIEN : step.ingredientIds = ["id1", "id2", ...] → afficher la quantité totale
// - VIDE : retourne []
//
// Retourne toujours un tableau normalisé : [{ id, amount, unit, note }, ...]
// où amount/unit sont soit les valeurs partielles (si usedAmount), soit ceux de l'ingrédient
function getStepIngredientUses(step, ingredients) {
  if (!step || !ingredients) return [];

  // Format nouveau
  if (Array.isArray(step.ingredientUses) && step.ingredientUses.length > 0) {
    return step.ingredientUses.map(use => {
      const ing = ingredients.find(i => i.id === use.id);
      if (!ing) return null;
      return {
        id: use.id,
        name: ing.name,
        amount: use.amount != null && use.amount !== '' ? use.amount : ing.amount,
        unit: use.unit || ing.unit,
        note: use.note || null,
        isPartial: use.amount != null && use.amount !== '' && Number(use.amount) !== Number(ing.amount)
      };
    }).filter(Boolean);
  }

  // Format ancien (rétro-compat)
  if (Array.isArray(step.ingredientIds) && step.ingredientIds.length > 0) {
    return step.ingredientIds.map(id => {
      const ing = ingredients.find(i => i.id === id);
      if (!ing) return null;
      return {
        id,
        name: ing.name,
        amount: ing.amount,
        unit: ing.unit,
        note: null,
        isPartial: false
      };
    }).filter(Boolean);
  }

  return [];
}

// Améliore le matching ingrédient ↔ étape avec heuristiques sémantiques.
// Objectif : ajouter les ingrédients que l'IA aurait oubliés, MAIS uniquement quand
// l'étape contient une vraie action (et pas une simple référence à un état passé).
// Travaille avec le nouveau format step.ingredientUses = [{id, amount?, unit?, note?}, ...]
function enrichStepIngredientIds(steps, ingredients) {
  if (!steps || !ingredients) return steps;

  // Stop words
  const STOP_WORDS = new Set([
    'de', 'la', 'le', 'les', 'du', 'des', 'un', 'une', 'à', 'au', 'aux',
    'et', 'ou', 'avec', 'sans', 'pour', 'dans', 'sur', 'en',
    'cl', 'ml', 'dl', 'g', 'kg', 'mg', 'l',
    'cuil', 'cuillere', 'cuilleres', 'cs', 'cc', 'tsp', 'tbsp',
    'pcs', 'piece', 'pieces', 'tranche', 'tranches', 'gousse', 'gousses',
    'bouquet', 'bouquets', 'pincee', 'pincees',
    'ufs', 'uf',
    'the', 'lit'
  ]);

  const WEAK_WORDS = new Set([
    'sucre', 'sel', 'eau', 'huile', 'fruit', 'fruits', 'legume', 'legumes',
    'fromage', 'viande', 'sauce', 'creme'
  ]);

  // Marqueurs de RÉFÉRENCE PURE : si l'étape ne contient QUE ces structures, l'ingrédient
  // n'est pas physiquement manipulé.
  // On regarde si le nom de l'ingrédient est précédé/suivi de ces patterns.
  const REFERENCE_PATTERNS = [
    // "une fois X cuit/préparé/refroidi/fondu/prêt..."
    /\b(une|le|la|les)?\s*fois\s+(que\s+)?(le|la|les|l')?\s*$/i,
    // "quand le X est..."
    /\bquand\s+(le|la|les|l')\s*$/i,
    // "lorsque le X est..."
    /\blorsque\s+(le|la|les|l')\s*$/i,
    // "ajouter au X" (X est le récepteur, déjà préparé)
    /\bajout(?:er|ez|é)\s+au[x]?\s+$/i,
    /\bversez?\s+(?:la|le|les)?\s*(?:préparation|mélange)?\s*sur\s+(?:le|la|les)?\s*$/i,
  ];

  // Phrases qui ne contiennent PAS de vraie utilisation (à eux seuls) :
  // - "Servir avec le X" (utilisation finale, mais OK on peut inclure)
  // - "Décorer avec X" (utilisation OK)
  // → Ces verbes restent valides comme actions

  // États passés explicites qui marquent une référence si suivis du nom
  // Ex: "le brocoli cuit", "la pâte fondue"
  const STATE_QUALIFIERS = [
    'cuit', 'cuite', 'cuits', 'cuites',
    'fondu', 'fondue', 'fondus', 'fondues',
    'refroidi', 'refroidie', 'refroidis', 'refroidies',
    'prepare', 'preparee', 'prepares', 'preparees',
    'pret', 'prete', 'prets', 'pretes',
    'mixé', 'mixee', 'mixes', 'mixees',
    'reservé', 'reservee', 'reserves', 'reservees',
    'tiede', 'tiedi', 'chaud', 'chaude',
    'monte', 'montee', 'montes', 'montees', // (blancs montés en neige)
    'battu', 'battue', 'battus', 'battues',
    'égoutté', 'egoutte', 'egouttee'
  ];

  function variants(word) {
    const v = new Set([word]);
    if (word.endsWith('x')) v.add(word.slice(0, -1));
    if (word.endsWith('s')) v.add(word.slice(0, -1));
    v.add(word + 's');
    return [...v];
  }

  function normalize(s) {
    return (s || '').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s'-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Pré-calcul : mots-clés par ingrédient
  const ingredientKeywords = ingredients.map(ing => {
    const normalized = normalize((ing.name || '').replace(/\([^)]*\)/g, ' '));
    const allWords = normalized.split(/\s+/).filter(w => w.length >= 3 && !STOP_WORDS.has(w));
    const strongWords = allWords.filter(w => !WEAK_WORDS.has(w) && w.length >= 4);
    const weakWords = allWords.filter(w => WEAK_WORDS.has(w) || w.length === 3);
    return { id: ing.id, strongWords, weakWords, allWords };
  });

  // Premier passage : tracker la 1ère étape qui mentionne CONCRÈTEMENT chaque ingrédient
  // (pour détecter les références à un état passé)
  const firstAppearance = new Map(); // id → stepIdx

  // Verbes dérivés du nom de l'ingrédient (saler, beurrer, sucrer, poivrer, huiler...)
  // Map : { regexs de noms d'ingrédients qui matchent → regex du verbe dans l'étape }
  // Ex: ingrédient "Sel" → verbe "saler/salez/salé"
  const DERIVED_VERB_RULES = [
    { ingName: /\bsel\b/i,       verb: /\bsal(?:er|ez|é|ée|és|ées)\b/i },
    { ingName: /\bbeurr/i,        verb: /\bbeurre[rz]\b|\bbeurr(?:é|ée|és|ées)\b/i },
    { ingName: /\bsucre?\b/i,    verb: /\bsucr(?:er|ez|é|ée|és|ées)\b/i },
    { ingName: /\bpoivre?\b/i,   verb: /\bpoivr(?:er|ez|é|ée|és|ées)\b/i },
    { ingName: /\bhuile\b/i,     verb: /\bhuil(?:er|ez|é|ée|és|ées)\b/i },
    { ingName: /\bfarine\b/i,    verb: /\bfarin(?:er|ez|é|ée|és|ées)\b\s+(?:le|la|les|un|une)\s+(?:moule|plat|fond)/i }, // "fariner le moule" mais pas "farine" seul
    { ingName: /\bgratin/i,      verb: /\bgratin(?:er|ez|é|ée)\b/i },
    { ingName: /\bglace\b/i,     verb: /\bglac(?:er|ez|é|ée)\b/i }
  ];

  return steps.map((step, stepIdx) => {
    const stepText = normalize(step.text || '');

    const existing = (step.ingredientUses || []).slice();
    const existingIds = new Set(existing.map(u => u.id));

    // PASSE 1 : verbes dérivés du nom (saler, beurrer, etc.)
    for (const ing of ingredientKeywords) {
      if (existingIds.has(ing.id)) continue;
      const ingFullName = (ingredients.find(i => i.id === ing.id)?.name || '');
      const ingNameNorm = normalize(ingFullName);
      for (const rule of DERIVED_VERB_RULES) {
        if (rule.ingName.test(ingNameNorm) && rule.verb.test(stepText)) {
          existing.push({ id: ing.id });
          existingIds.add(ing.id);
          break;
        }
      }
    }

    // PASSE 2 : matching textuel classique avec détection de référence
    for (const ing of ingredientKeywords) {
      if (existingIds.has(ing.id)) continue;
      if (ing.allWords.length === 0) continue;

      const wordMatches = (w) => {
        const escaped = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp(`\\b(${variants(escaped).join('|')})\\b`, 'i');
        return re.test(stepText);
      };

      let matched = ing.strongWords.some(wordMatches);
      if (!matched && ing.strongWords.length === 0 && ing.weakWords.length > 0) {
        matched = ing.weakWords.some(wordMatches);
      }
      if (!matched) continue;

      // Détecter si c'est une RÉFÉRENCE PURE (pas une vraie utilisation)
      let isReference = false;
      const matchedWord = [...ing.strongWords, ...ing.weakWords].find(wordMatches);
      if (matchedWord) {
        const escaped = matchedWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp(`\\b(${variants(escaped).join('|')})\\b`, 'i');
        const m = re.exec(stepText);
        if (m) {
          const before = stepText.substring(0, m.index);
          const afterStart = m.index + m[0].length;
          const after = stepText.substring(afterStart, afterStart + 30);

          if (/\b(une\s+)?fois\s+(que\s+)?(le|la|les|l['e])?\s*$/i.test(before)) {
            isReference = true;
          }
          else if (/\b(quand|lorsque)\s+(le|la|les|l['e])\s*$/i.test(before)) {
            isReference = true;
          }
          // Pattern : "mélange de X" / "préparation au X" / "X cuit/fondu" → référence
          else if (/\bmelange\s+de\b/i.test(before)) {
            isReference = true;
          }
          else if (STATE_QUALIFIERS.some(q => new RegExp(`^\\s*${q}\\b`).test(after))) {
            const ACTION_VERBS_BEFORE = /\b(cuire|faire\s+cuire|faire\s+fondre|fondre|preparer|reserver|monter|battre|laisser|chauffer|tiedir|reservez)\b/i;
            if (!ACTION_VERBS_BEFORE.test(before)) {
              isReference = true;
            }
          }
          else if (/\b(?:la\s+)?preparation\b|\bappareil\b/i.test(before) &&
                   firstAppearance.has(ing.id)) {
            isReference = true;
          }
        }
      }

      if (isReference) continue;
      existing.push({ id: ing.id });
      existingIds.add(ing.id);
    }

    for (const use of existing) {
      if (!firstAppearance.has(use.id)) {
        firstAppearance.set(use.id, stepIdx);
      }
    }

    return { ...step, ingredientUses: existing };
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

  // Mémoriser les photos uploadées pour pouvoir les rattacher aux recettes créées
  const uploadedPhotos = state.chatAttachments.slice();

  // Si plusieurs photos sans texte explicite, ajouter un hint automatique
  // pour que l'IA traite chaque photo comme une recette distincte
  let effectiveText = text;
  if (uploadedPhotos.length >= 2 && !text) {
    effectiveText = `J'ai envoyé ${uploadedPhotos.length} photos qui montrent chacune une recette différente. Extrais-en ${uploadedPhotos.length} recettes (une par photo).`;
    // Mettre à jour le dernier message user dans userContent
    const lastIdx = userContent.findIndex(c => c.type === 'text');
    if (lastIdx === -1) {
      userContent.push({ type: 'text', text: effectiveText });
    }
  }

  // Add to history
  state.chatHistory.push({
    role: 'user',
    content: userContent.length === 1 && userContent[0].type === 'text' ? effectiveText : userContent
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
    // Tronque l'historique à CHAT_HISTORY_MAX messages pour éviter une croissance illimitée
    // (impact mémoire et coûts API qui dépendent de la taille du contexte envoyé).
    if (state.chatHistory.length > CHAT_HISTORY_MAX) {
      state.chatHistory = state.chatHistory.slice(-CHAT_HISTORY_MAX);
    }

    if (cleanText) {
      addChatMessage('assistant', cleanText);
    }

    if (recipes.length > 1) {
      // Mode multi-recettes : on en stocke plusieurs en file et on les valide une par une.
      // Cap à PENDING_RECIPES_QUEUE_MAX pour éviter un déluge ingérable et borner la mémoire.
      const wasCapped = recipes.length > PENDING_RECIPES_QUEUE_MAX;
      const recipesToProcess = wasCapped ? recipes.slice(0, PENDING_RECIPES_QUEUE_MAX) : recipes;
      state.pendingRecipesQueue = recipesToProcess.map((r, idx) => {
        r.months = calculateSeasonality(r.ingredients);
        r.id = uid();
        r.createdAt = Date.now();
        // Rattacher la photo correspondante si même nombre de photos et de recettes
        if (uploadedPhotos.length === recipesToProcess.length && uploadedPhotos[idx]) {
          const att = uploadedPhotos[idx];
          r.photo = `data:${att.media_type};base64,${att.data}`;
        }
        return r;
      });
      const introMsg = wasCapped
        ? `📋 J'ai extrait ${recipes.length} recettes. Pour ne pas te submerger, je vais te présenter les ${PENDING_RECIPES_QUEUE_MAX} premières — relance-moi pour le reste après.`
        : `📋 J'ai extrait ${recipes.length} recettes. Je vais te les présenter une par une pour validation.`;
      addChatMessage('assistant', introMsg);
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
      // Rattacher la première photo uploadée si dispo
      if (uploadedPhotos.length >= 1) {
        const att = uploadedPhotos[0];
        recipe.photo = `data:${att.media_type};base64,${att.data}`;
      }
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

  // Adapter le titre selon le contexte
  const queueLen = state.pendingRecipesQueue ? state.pendingRecipesQueue.length : 0;
  // On stocke en state.pendingRecipesTotal le total initial pour afficher "X sur N"
  if (queueLen > 0 && !state.pendingRecipesTotal) {
    state.pendingRecipesTotal = queueLen + 1; // +1 car la 1ère est déjà sortie de la queue
  } else if (queueLen === 0 && !state.editingRecipeId) {
    state.pendingRecipesTotal = null; // reset quand on finit
  }
  const total = state.pendingRecipesTotal;
  const current = total ? total - queueLen : null;

  if (title) {
    if (state.editingRecipeId) {
      title.textContent = 'Modifier la recette';
    } else if (total && total > 1) {
      title.textContent = `Recette ${current} sur ${total}`;
    } else {
      title.textContent = 'Valider la recette';
    }
  }

  // Adapter le bouton principal selon le contexte
  const saveBtn = document.getElementById('validation-save');
  if (saveBtn) {
    if (queueLen > 0) {
      saveBtn.textContent = 'Valider et suivante →';
    } else if (total && total > 1) {
      saveBtn.textContent = '✓ Valider et terminer';
    } else {
      saveBtn.textContent = state.editingRecipeId ? 'Enregistrer' : 'Sauvegarder';
    }
  }

  pushOverlay('validation');

  // Pré-remplir les tags / dietTags / source
  const existingTags = (recipe.tags || []).join(', ');
  const recipeDietTags = recipe.dietTags || [];
  const recipeSource = recipe.source || null;
  const sourceType = recipeSource?.type || '';
  const sourceUrl = recipeSource?.url || '';
  const sourceSiteName = recipeSource?.siteName || '';
  const sourceTitle = recipeSource?.title || '';
  const sourcePage = recipeSource?.page || '';
  const sourceAccount = recipeSource?.account || '';
  const verified = recipe.verifiedByHuman === true;

  // Régimes affichables dans la modal (tous sauf low/high-fodmap qui sont auto)
  const SELECTABLE_DIETS = DIET_TAGS.filter(t => t.id !== 'low-fodmap' && t.id !== 'high-fodmap');

  body.innerHTML = `
    ${total && total > 1 ? `
      <div class="validation-multi-banner">
        <span class="validation-multi-icon">📋</span>
        <span class="validation-multi-text"><strong>Recette ${current} sur ${total}</strong> · ${queueLen > 0 ? `il en reste ${queueLen} après celle-ci` : 'dernière'}</span>
      </div>
    ` : ''}

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
      <h3 class="validation-section-title">🏷️ Tags & Régimes</h3>
      <div class="validation-field">
        <label class="validation-label">Tags (séparés par virgule)</label>
        <input type="text" class="validation-input" id="val-tags" value="${escapeHtml(existingTags)}" placeholder="rapide, italien, kids-friendly...">
      </div>
      <div class="validation-field">
        <label class="validation-label">Régimes alimentaires</label>
        <p class="validation-hint">Les tags FODMAP sont calculés automatiquement à partir des ingrédients.</p>
        <div class="validation-diet-tags" id="val-diet-tags">
          ${SELECTABLE_DIETS.map(t => `
            <label class="validation-diet-chip ${recipeDietTags.includes(t.id) ? 'selected' : ''}" data-diet="${t.id}" style="--diet-color:${t.color}">
              <input type="checkbox" data-diet-input="${t.id}" ${recipeDietTags.includes(t.id) ? 'checked' : ''}>
              <span>${t.emoji} ${escapeHtml(t.label)}</span>
            </label>
          `).join('')}
        </div>
      </div>
      <div class="validation-field">
        <label class="validation-check-row">
          <input type="checkbox" id="val-verified" ${verified ? 'checked' : ''}>
          <span class="validation-check-label">✅ Vérifiée par l'humain</span>
        </label>
        <p class="validation-hint">À cocher après avoir relu et validé la recette (utile pour distinguer ce qui vient de l'IA).</p>
      </div>
    </div>

    <div class="validation-section">
      <h3 class="validation-section-title">🔗 Source <span class="validation-required">*</span></h3>
      <p class="validation-hint">D'où provient cette recette ? (obligatoire)</p>
      <div class="validation-field">
        <label class="validation-label">Type de source</label>
        <div class="validation-source-picker" id="val-source-picker">
          <button type="button" class="validation-source-option ${sourceType === 'web' ? 'selected' : ''}" data-source-type="web">🌐 Web</button>
          <button type="button" class="validation-source-option ${sourceType === 'book' ? 'selected' : ''}" data-source-type="book">📖 Livre</button>
          <button type="button" class="validation-source-option ${sourceType === 'instagram' ? 'selected' : ''}" data-source-type="instagram">📷 Instagram</button>
          <button type="button" class="validation-source-option ${sourceType === 'perso' ? 'selected' : ''}" data-source-type="perso">✍️ Perso</button>
        </div>
      </div>
      <div class="validation-source-fields" id="val-source-fields-web" style="display: ${sourceType === 'web' ? 'block' : 'none'}">
        <input type="text" class="validation-input" id="val-source-url" value="${escapeHtml(sourceUrl)}" placeholder="https://...">
        <input type="text" class="validation-input" id="val-source-sitename" value="${escapeHtml(sourceSiteName)}" placeholder="Nom du site (optionnel)" style="margin-top: 6px">
      </div>
      <div class="validation-source-fields" id="val-source-fields-book" style="display: ${sourceType === 'book' ? 'block' : 'none'}">
        <input type="text" class="validation-input" id="val-source-title" value="${escapeHtml(sourceTitle)}" placeholder="Titre du livre">
        <input type="text" class="validation-input" id="val-source-page" value="${escapeHtml(sourcePage)}" placeholder="Page (optionnel)" style="margin-top: 6px">
      </div>
      <div class="validation-source-fields" id="val-source-fields-instagram" style="display: ${sourceType === 'instagram' ? 'block' : 'none'}">
        <input type="text" class="validation-input" id="val-source-account" value="${escapeHtml(sourceAccount)}" placeholder="@compte">
      </div>
      <div class="validation-source-fields" id="val-source-fields-perso" style="display: ${sourceType === 'perso' ? 'block' : 'none'}">
        <p class="validation-hint" style="margin: 4px 0">Recette personnelle, pas de lien externe.</p>
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

    ${queueLen > 0 ? `
      <div class="validation-section validation-queue-actions">
        <button class="btn-danger-link" onclick="abortPendingRecipesQueue()">
          ✕ Annuler les ${queueLen} recette${queueLen > 1 ? 's' : ''} restante${queueLen > 1 ? 's' : ''}
        </button>
      </div>
    ` : ''}
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

  // Drag-to-reorder pour ingrédients et étapes (long-press 400ms sur la poignée ⋮⋮)
  const ingWrap = document.getElementById('val-ingredients');
  if (ingWrap) {
    setupDragReorder(ingWrap, '.validation-ingredient', '.validation-drag-handle');
  }
  const stepsWrap = document.getElementById('val-steps');
  if (stepsWrap) {
    setupDragReorder(stepsWrap, '.validation-step', '.validation-drag-handle', () => {
      // Re-numéroter les étapes après chaque swap
      stepsWrap.querySelectorAll('.validation-step .step-number').forEach((el, idx) => {
        el.textContent = idx + 1;
      });
    });
  }

  // Diet chips
  body.querySelectorAll('#val-diet-tags .validation-diet-chip').forEach(label => {
    label.addEventListener('click', (e) => {
      // Si on clique sur la checkbox elle-même, la chip change automatiquement (label)
      // On synchronise visuellement après
      setTimeout(() => {
        const cb = label.querySelector('input[type=checkbox]');
        label.classList.toggle('selected', cb.checked);
      }, 0);
    });
  });

  // Source picker (Web / Livre / Instagram / Perso)
  body.querySelectorAll('#val-source-picker .validation-source-option').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.sourceType;
      // Toggle off si déjà sélectionné
      const wasSelected = btn.classList.contains('selected');
      body.querySelectorAll('#val-source-picker .validation-source-option').forEach(b => b.classList.remove('selected'));
      body.querySelectorAll('.validation-source-fields').forEach(f => f.style.display = 'none');
      if (!wasSelected) {
        btn.classList.add('selected');
        const fields = document.getElementById('val-source-fields-' + type);
        if (fields) fields.style.display = 'block';
      }
    });
  });

  modal.classList.remove('hidden');
}

// Abandon de toute la file de recettes en attente
async function abortPendingRecipesQueue() {
  const queueLen = state.pendingRecipesQueue ? state.pendingRecipesQueue.length : 0;
  if (queueLen === 0) return;
  if (!(await uiConfirm(
    `Annuler les ${queueLen} recette${queueLen > 1 ? 's' : ''} en attente ?\n\nLa recette actuelle restera ouverte, tu pourras encore la valider ou l'annuler.`,
    { confirmLabel: 'Annuler les suivantes', danger: true }
  ))) return;
  state.pendingRecipesQueue = [];
  showToast(`${queueLen} recette${queueLen > 1 ? 's annulées' : ' annulée'}`, '');
  // Re-rendu de la modal pour cacher la bannière
  if (state.pendingRecipe) openValidationModal(state.pendingRecipe);
}
window.abortPendingRecipesQueue = abortPendingRecipesQueue;

function renderValidationIngredient(ing, i) {
  return `
    <div class="validation-ingredient" data-index="${i}">
      <button class="validation-drag-handle" aria-label="Réorganiser (maintenir pour déplacer)" tabindex="-1">⋮⋮</button>
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
      <button class="validation-drag-handle" aria-label="Réorganiser (maintenir pour déplacer)" tabindex="-1">⋮⋮</button>
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

// ============================================
// DRAG-TO-REORDER (long-press + pointer events)
// ============================================
// Usage : setupDragReorder(container, '.item-selector', '.handle-selector', onReorder?)
// - Long-press 400ms sur la poignée → l'item devient draggable
// - Le drag est annulé si on bouge >8px avant la fin du long-press (= c'est un scroll)
// - Vibration tactile à l'activation (si supportée)
// - Détection en temps réel de la position cible via getBoundingClientRect
// - Callback onReorder() appelé après chaque swap (utile pour re-numéroter les étapes)
function setupDragReorder(container, itemSelector, handleSelector, onReorder) {
  if (!container || container._dragSetupDone) return;
  container._dragSetupDone = true;

  let pressTimer = null;
  let dragState = null;

  container.addEventListener('pointerdown', e => {
    const handle = e.target.closest(handleSelector);
    if (!handle || !container.contains(handle)) return;
    const item = handle.closest(itemSelector);
    if (!item) return;
    // N'intercepte que le bouton principal (pointer touch ou click gauche)
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    const startX = e.clientX;
    const startY = e.clientY;

    pressTimer = setTimeout(() => {
      pressTimer = null;
      startDrag(item, handle, e);
    }, 400);

    const cancel = (e2) => {
      if (e2 && (Math.abs(e2.clientX - startX) > 8 || Math.abs(e2.clientY - startY) > 8)) {
        clearTimeout(pressTimer);
        pressTimer = null;
        cleanup();
      }
    };
    const cleanup = () => {
      window.removeEventListener('pointermove', cancel);
      window.removeEventListener('pointerup', cleanup);
      window.removeEventListener('pointercancel', cleanup);
      if (pressTimer) {
        clearTimeout(pressTimer);
        pressTimer = null;
      }
    };
    window.addEventListener('pointermove', cancel);
    window.addEventListener('pointerup', cleanup, { once: true });
    window.addEventListener('pointercancel', cleanup, { once: true });
  });

  function startDrag(item, handle, e) {
    // Vibration tactile (mobile uniquement, ignoré ailleurs)
    if (navigator.vibrate) {
      try { navigator.vibrate(15); } catch (_) {}
    }
    dragState = {
      item,
      pointerId: e.pointerId,
      lastY: e.clientY
    };
    item.classList.add('is-dragging');
    document.body.classList.add('is-drag-reordering');

    // Capture du pointer pour ne pas perdre l'événement si on sort de l'élément
    try { handle.setPointerCapture(e.pointerId); } catch (_) {}

    handle.addEventListener('pointermove', onDragMove);
    handle.addEventListener('pointerup', endDrag);
    handle.addEventListener('pointercancel', endDrag);
  }

  function onDragMove(e) {
    if (!dragState || e.pointerId !== dragState.pointerId) return;
    e.preventDefault();
    const item = dragState.item;
    const pointerY = e.clientY;

    // Détecter l'item voisin survolé en parcourant les siblings de même type
    const siblings = Array.from(container.querySelectorAll(itemSelector))
      .filter(s => s !== item);

    for (const sibling of siblings) {
      const rect = sibling.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      if (pointerY < midY) {
        // Pointer au-dessus de la moitié de ce sibling → insérer notre item avant
        const isBefore = item.compareDocumentPosition(sibling) & Node.DOCUMENT_POSITION_PRECEDING;
        // Si on est déjà juste avant ce sibling, rien à faire
        if (item.nextElementSibling !== sibling || isBefore) {
          sibling.parentNode.insertBefore(item, sibling);
          if (onReorder) onReorder();
        }
        return;
      }
    }
    // Pointer en-dessous de tous → mettre à la fin
    const last = siblings[siblings.length - 1];
    if (last && item.nextElementSibling !== null) {
      last.parentNode.appendChild(item);
      if (onReorder) onReorder();
    }
  }

  function endDrag(e) {
    if (!dragState) return;
    const item = dragState.item;
    item.classList.remove('is-dragging');
    document.body.classList.remove('is-drag-reordering');
    const handle = item.querySelector(handleSelector);
    if (handle) {
      handle.removeEventListener('pointermove', onDragMove);
      handle.removeEventListener('pointerup', endDrag);
      handle.removeEventListener('pointercancel', endDrag);
      try { handle.releasePointerCapture(dragState.pointerId); } catch (_) {}
    }
    dragState = null;
  }
}

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

  // Tags (séparés par virgule)
  const tagsInput = document.getElementById('val-tags').value.trim();
  const tags = tagsInput
    ? tagsInput.split(/[,;]/).map(t => t.trim().toLowerCase()).filter(Boolean).slice(0, 6)
    : [];

  // Diet tags (depuis les checkboxes)
  const dietTagsManual = [];
  document.querySelectorAll('#val-diet-tags input[data-diet-input]').forEach(cb => {
    if (cb.checked) dietTagsManual.push(cb.dataset.dietInput);
  });

  // Vérifié par humain
  const verifiedByHuman = document.getElementById('val-verified')?.checked === true;

  // Source (obligatoire)
  const selectedSource = document.querySelector('#val-source-picker .validation-source-option.selected');
  if (!selectedSource) {
    showToast('La source de la recette est obligatoire', 'error');
    // Scroller jusqu'au picker source
    document.getElementById('val-source-picker')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  const sourceType = selectedSource.dataset.sourceType;
  let source = { type: sourceType };
  if (sourceType === 'web') {
    const url = document.getElementById('val-source-url')?.value.trim();
    const siteName = document.getElementById('val-source-sitename')?.value.trim();
    if (!url) {
      showToast('L\'URL de la source est requise', 'error');
      document.getElementById('val-source-url')?.focus();
      return;
    }
    source.url = url;
    if (siteName) source.siteName = siteName;
  } else if (sourceType === 'book') {
    const bookTitle = document.getElementById('val-source-title')?.value.trim();
    const page = document.getElementById('val-source-page')?.value.trim();
    if (!bookTitle) {
      showToast('Le titre du livre est requis', 'error');
      document.getElementById('val-source-title')?.focus();
      return;
    }
    source.title = bookTitle;
    if (page) source.page = page;
  } else if (sourceType === 'instagram') {
    const account = document.getElementById('val-source-account')?.value.trim();
    if (!account) {
      showToast('Le compte Instagram est requis', 'error');
      document.getElementById('val-source-account')?.focus();
      return;
    }
    source.account = account.replace(/^@/, '');
  }
  // type='perso' : pas de champs supplémentaires

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
    const ingredientUses = [];
    for (const ing of ingredients) {
      const lower = ing.name.toLowerCase();
      if (lower.length > 2 && text.toLowerCase().includes(lower)) {
        ingredientUses.push({ id: ing.id });
      }
    }
    steps.push({ text, ingredientUses });
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

  // Catégorie
  const selectedCat = document.querySelector('#val-category-picker .validation-category-option.selected');
  const category = selectedCat ? selectedCat.dataset.category : 'plat';

  // Recalcul FODMAP automatique (depuis data.js)
  let dietTags = [...dietTagsManual];
  if (typeof calculateFodmapTags === 'function') {
    const autoFodmap = calculateFodmapTags(ingredients);
    // Ajouter low-fodmap / high-fodmap calculés (sans doublon)
    for (const tag of autoFodmap) {
      if (!dietTags.includes(tag)) dietTags.push(tag);
    }
  }

  // Recalcul du type de protéine (cache utilisé par la génération de menu IA)
  let proteinCache = { type: null, hasProtein: false };
  if (typeof detectProteinType === 'function') {
    proteinCache = detectProteinType(ingredients);
  }

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
    tags,
    dietTags,
    source,
    verifiedByHuman,
    _proteinType: proteinCache.type,
    _hasProtein: proteinCache.hasProtein,
    createdAt: existing?.createdAt || state.pendingRecipe?.createdAt || Date.now(),
    updatedAt: Date.now()
  };

  // Préserver les champs qui n'apparaissent pas dans la modal (photo, cookedHistory, etc.)
  if (existing) {
    if (existing.photo) recipe.photo = existing.photo;
    if (existing.cookedHistory) recipe.cookedHistory = existing.cookedHistory;
    if (existing.personalNotes) recipe.personalNotes = existing.personalNotes;
    if (existing.favorite) recipe.favorite = existing.favorite;
  } else if (state.pendingRecipe) {
    // Pour une nouvelle recette : préserver la photo si elle a été ajoutée pendant le chat
    if (state.pendingRecipe.photo) recipe.photo = state.pendingRecipe.photo;
  }

  // Toujours ré-enrichir les ingredientIds des étapes par matching textuel
  if (typeof enrichStepIngredientIds === 'function') {
    recipe.steps = enrichStepIngredientIds(recipe.steps, recipe.ingredients);
  }

  if (existing) {
    recipe.changeLog = existing.changeLog || [];
    recipe.changeLog.push({ at: Date.now(), action: 'recette modifiée' });
    if (recipe.changeLog.length > 20) recipe.changeLog = recipe.changeLog.slice(-20);
    state.recipes = state.recipes.map(r => r.id === editingId ? recipe : r);
  } else {
    recipe.changeLog = [{ at: Date.now(), action: 'recette créée' }];
    state.recipes.push(recipe);
  }
  saveRecipes();
  showToast(existing ? 'Recette modifiée ✓' : 'Recette sauvegardée ✓', 'success');

  // Sync push
  if (state.sync.enabled) {
    syncRecipeAfterChange(recipe, false);
  }

  if (existing) {
    state.editingRecipeId = null;
    state.pendingRecipe = null;
    closeValidationModal();
    state.currentRecipe = { ...recipe, currentServings: recipe.baseServings };
    navigateTo('recipe', recipe);
  } else if (state.pendingRecipesQueue && state.pendingRecipesQueue.length > 0) {
    // Passer à la recette suivante sans fermer la modal
    const next = state.pendingRecipesQueue.shift();
    state.pendingRecipe = next;
    setTimeout(() => openValidationModal(next), 200);
  } else {
    // Dernière recette : reset complet
    state.pendingRecipesTotal = null;
    state.pendingRecipe = null;
    closeValidationModal();
    resetChatView();
    navigateTo('library');
  }
}
window.saveValidatedRecipe = saveValidatedRecipe;

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
  state.pendingRecipesTotal = null;
}

// ============================================
// SETTINGS
// ============================================

// ============================================
// STORAGE STATS + LIBÉRATION D'ESPACE
// ============================================
// Calcule la taille approximative de toutes les clés localStorage de l'app
// et identifie les photos lourdes pour proposer une re-compression.
function _computeStorageStats() {
  let totalBytes = 0;
  let photoBytes = 0;
  let photoCount = 0;
  let largePhotoCount = 0;
  const LARGE_THRESHOLD = 100 * 1024; // 100 KB en data URL
  for (const key of Object.keys(localStorage)) {
    if (!key.startsWith('mr_')) continue;
    const val = localStorage.getItem(key) || '';
    totalBytes += val.length;
  }
  for (const r of state.recipes) {
    if (r.photo && typeof r.photo === 'string') {
      photoBytes += r.photo.length;
      photoCount++;
      if (r.photo.length > LARGE_THRESHOLD) largePhotoCount++;
    }
  }
  return {
    totalKB: Math.round(totalBytes / 1024),
    photoKB: Math.round(photoBytes / 1024),
    photoCount,
    largePhotoCount,
    recipeCount: state.recipes.length
  };
}

function _updateStorageStatsDisplay() {
  const el = document.getElementById('settings-storage-stats');
  if (!el) return;
  const s = _computeStorageStats();
  const totalMB = (s.totalKB / 1024).toFixed(2);
  const photoPct = s.totalKB > 0 ? Math.round((s.photoKB / s.totalKB) * 100) : 0;
  el.innerHTML = `
    <div class="storage-stat-line"><strong>${totalMB} Mo</strong> utilisés (sur ~${LOCAL_STORAGE_QUOTA_MB} Mo disponibles)</div>
    <div class="storage-stat-line storage-stat-sub">${s.recipeCount} recette${s.recipeCount > 1 ? 's' : ''} · ${s.photoCount} photo${s.photoCount > 1 ? 's' : ''} (${photoPct}% du stockage)</div>
    ${s.largePhotoCount > 0 ? `<div class="storage-stat-line storage-stat-warn">⚠️ ${s.largePhotoCount} photo${s.largePhotoCount > 1 ? 's' : ''} > 100 Ko — re-compression recommandée</div>` : ''}
  `;
}

async function freeStorageSpace() {
  const stats = _computeStorageStats();
  if (stats.largePhotoCount === 0) {
    await uiAlert('Aucune photo lourde détectée. Rien à compresser.');
    return;
  }
  const confirmed = await uiConfirm(
    `Re-compresser ${stats.largePhotoCount} photo${stats.largePhotoCount > 1 ? 's' : ''} > 100 Ko en ${PHOTO_MAX_WIDTH_AGGRESSIVE}px / qualité ${Math.round(PHOTO_QUALITY_AGGRESSIVE * 100)}% ?\n\nCela peut prendre quelques secondes. Aucune recette n'est supprimée.`,
    { confirmLabel: 'Compresser', danger: false }
  );
  if (!confirmed) return;

  const btn = document.getElementById('settings-free-space');
  const originalLabel = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner-small"></span> Compression…'; }

  const LARGE_THRESHOLD = 100 * 1024;
  let processed = 0;
  let bytesSaved = 0;
  for (const r of state.recipes) {
    if (!r.photo || typeof r.photo !== 'string') continue;
    if (r.photo.length <= LARGE_THRESHOLD) continue;
    const oldSize = r.photo.length;
    try {
      const newDataUrl = await _recompressDataUrl(r.photo, PHOTO_MAX_WIDTH_AGGRESSIVE, PHOTO_QUALITY_AGGRESSIVE);
      if (newDataUrl && newDataUrl.length < oldSize) {
        r.photo = newDataUrl;
        bytesSaved += (oldSize - newDataUrl.length);
        processed++;
      }
    } catch (e) {
      console.warn('Recompression échouée pour', r.title, e);
    }
  }
  saveRecipes();
  if (btn) { btn.disabled = false; btn.innerHTML = originalLabel; }
  _updateStorageStatsDisplay();
  const savedKB = Math.round(bytesSaved / 1024);
  showToast(`${processed} photo${processed > 1 ? 's' : ''} recompressée${processed > 1 ? 's' : ''} · ${savedKB} Ko libérés ✓`, 'success');
}
window.freeStorageSpace = freeStorageSpace;

// Recompresse une data URL existante en passant par un canvas
async function _recompressDataUrl(dataUrl, maxSize, quality) {
  return new Promise((resolve, reject) => {
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
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => reject(new Error('Image non décodable'));
    img.src = dataUrl;
  });
}

function showSettings() {
  document.getElementById('settings-api-key').value = state.apiKey || '';
  document.getElementById('settings-sync-url').value = state.sync.url || '';
  document.getElementById('settings-sync-key').value = state.sync.key || '';
  document.getElementById('settings-sync-foyer').value = state.sync.foyer || '';
  // Badge ✓ Configurée si la clé API est déjà saisie
  const apiBadge = document.getElementById('settings-api-key-badge');
  if (apiBadge) apiBadge.hidden = !state.apiKey;
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
  // Préférences planning : refléter les toggles persistants
  const p = state.prefs.planning || {};
  const planningInputs = [
    ['settings-planning-protein-daily', 'proteinDaily', true],
    ['settings-planning-protein-sequencing', 'proteinSequencing', true],
    ['settings-planning-nutrition-quotas', 'nutritionQuotas', true],
    ['settings-planning-light-heavy', 'lightHeavyBalance', true],
    ['settings-planning-weekend', 'weekendVsWeek', true],
    ['settings-planning-batch', 'batchCooking', false]
  ];
  planningInputs.forEach(([id, key, defaultVal]) => {
    const el = document.getElementById(id);
    if (el) el.checked = p[key] === undefined ? defaultVal : !!p[key];
  });
  // Stats de stockage (taille totale + photos lourdes)
  _updateStorageStatsDisplay();

  document.getElementById('settings-modal').classList.remove('hidden');
  pushOverlay('settings');
}

// Mise à jour d'un toggle des préférences planning (depuis settings ou modal de génération)
function setPlanningPref(key, value) {
  if (!state.prefs.planning) state.prefs.planning = {};
  state.prefs.planning[key] = !!value;
  savePrefs();
}
window.setPlanningPref = setPlanningPref;

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
  // 1ère confirmation : intention
  if (!(await uiConfirm(
    `Supprimer TOUTES vos données ? Cela inclut :\n• ${state.recipes.length} recette${state.recipes.length > 1 ? 's' : ''}\n• Vos listes de courses, planning, garde-manger\n• Vos préférences (thème, génération IA…)\n\nCette action est IRRÉVERSIBLE.`,
    { title: 'Suppression définitive', confirmLabel: 'Continuer', danger: true }
  ))) return;
  // 2ème confirmation : saisie d'un mot-clé (anti-doigt qui glisse)
  const typed = await uiPrompt(
    'Pour confirmer, tape exactement le mot SUPPRIMER en majuscules :',
    '',
    { title: 'Confirmation requise', confirmLabel: 'Vérifier', cancelLabel: 'Annuler' }
  );
  if (typed === null || typed === undefined) return;
  if (String(typed).trim() !== 'SUPPRIMER') {
    showToast('Mot-clé incorrect — suppression annulée', 'error');
    return;
  }
  // 3ème étape : action
  state.recipes = [];
  state.shopping = [];
  state.shoppingChecked.clear();
  saveRecipes();
  saveShopping();
  hideSettings();
  updateShoppingBadge();
  navigateTo('library');
  showToast('Toutes les données ont été supprimées', 'success');
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

// Détecte les batches dans le planning affiché.
// Un batch = une même recette présente sur 2 slots ADJACENTS dans l'ordre chronologique
// (ex: lundi soir + mardi midi). On ne considère que les slots midi/soir (le "autre" est ignoré).
// Retourne un Map<slotKey, Set<recipeId>> indiquant quelles recettes de quel slot sont en batch.
function detectPlanningBatches(days) {
  const batched = new Map();
  // Construire la séquence ordonnée des slots midi/soir sur la période visible
  const sequence = [];
  for (const d of days) {
    const dateStr = formatPlanningDate(d);
    for (const slotId of ['midi', 'soir']) {
      const key = `${dateStr}-${slotId}`;
      const entry = state.planning[key];
      const ids = new Set(getSlotRecipes(entry).map(r => r.id));
      sequence.push({ key, ids });
    }
  }
  // Pour chaque paire consécutive (i, i+1), si une recette est présente dans les deux → batch
  for (let i = 0; i < sequence.length - 1; i++) {
    const a = sequence[i];
    const b = sequence[i + 1];
    for (const id of a.ids) {
      if (b.ids.has(id)) {
        if (!batched.has(a.key)) batched.set(a.key, new Set());
        if (!batched.has(b.key)) batched.set(b.key, new Set());
        batched.get(a.key).add(id);
        batched.get(b.key).add(id);
      }
    }
  }
  return batched;
}

function renderPlanning() {
  const grid = document.getElementById('planning-grid');
  if (!grid) return;
  const days = getPlanningDays();
  const today = formatPlanningDate(new Date());
  const batches = detectPlanningBatches(days);

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
          const batchedHere = batches.get(key) || new Set();
          const items = recipes.map((rr, idx) => {
            const recipe = state.recipes.find(rcp => rcp.id === rr.id);
            if (!recipe) {
              return `<div class="planning-slot-recipe is-missing">
                <span class="planning-slot-title">Recette introuvable</span>
                <button class="planning-slot-mini-remove" onclick="event.stopPropagation(); removeRecipeFromSlot('${dateStr}', '${slot.id}', '${rr.id}')" aria-label="Retirer">×</button>
              </div>`;
            }
            const isBatch = batchedHere.has(rr.id);
            // Clic sur la recette → ouvre la fiche détaillée en contexte planning (boutons Changer / Valider)
            return `<div class="planning-slot-recipe ${isBatch ? 'is-batch' : ''}" onclick="openPlanningRecipeDetail('${dateStr}', '${slot.id}', '${rr.id}')">
              <span class="planning-slot-emoji">${recipe.photo ? `<img src="${recipe.photo}" alt="" loading="lazy">` : (recipe.emoji || '🍽️')}</span>
              <span class="planning-slot-title">${escapeHtml(recipe.title)}</span>
              ${isBatch ? '<span class="planning-slot-batch-badge" title="Batch cooking : à préparer en une seule fois avec l\'autre slot identique">🍱</span>' : ''}
              <span class="planning-slot-servings">${rr.servings || recipe.baseServings} pers.</span>
              <button class="planning-slot-mini-remove" onclick="event.stopPropagation(); removeRecipeFromSlot('${dateStr}', '${slot.id}', '${rr.id}')" aria-label="Retirer">×</button>
            </div>`;
          }).join('');

          html += `<div class="planning-slot is-filled">
            <div class="planning-slot-label">${slot.emoji} ${slot.label}${recipes.length > 1 ? ` <span class="planning-slot-count">×${recipes.length}</span>` : ''}</div>
            <div class="planning-slot-recipes-list">${items}</div>
            <div class="planning-slot-add-more" onclick="openPlanningSlot('${dateStr}', '${slot.id}')">+ Ajouter une recette</div>
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
  verifiedOnly: false, // true = uniquement les recettes vérifiées par l'humain
  sort: 'alpha'      // 'alpha' | 'recent' | 'favorites'
};

function openPlanningSlot(dateStr, slotId, opts) {
  const replaceRecipeId = (opts && opts.replaceRecipeId) || null;
  // Construire la barre de filtres
  const catChips = `
    <button class="picker-filter-chip ${_planningPickerFilters.category === 'all' ? 'active' : ''}" data-filter-cat="all">Toutes</button>
    ${RECIPE_CATEGORIES.map(c =>
      `<button class="picker-filter-chip ${_planningPickerFilters.category === c.id ? 'active' : ''}" data-filter-cat="${c.id}">${c.emoji} ${escapeHtml(c.label)}</button>`
    ).join('')}
  `;

  // Régimes : tous ceux de DIET_TAGS (configuré dans data.js — 5 régimes par défaut)
  const dietChips = DIET_TAGS
    .map(t => {
      const active = _planningPickerFilters.dietTags.includes(t.id);
      return `<button class="picker-filter-chip diet ${active ? 'active' : ''}" data-filter-diet="${t.id}" style="--diet-color:${t.color}">${t.emoji} ${escapeHtml(t.label)}</button>`;
    }).join('');

  // Catégorie active ? Si oui, on ouvre par défaut
  const catActive = _planningPickerFilters.category && _planningPickerFilters.category !== 'all';
  // Régime actif ? Si oui, on ouvre par défaut
  const dietActive = _planningPickerFilters.dietTags && _planningPickerFilters.dietTags.length > 0;

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
        <div class="picker-filters-toggles-row">
          <div class="picker-filter-section picker-filter-section-half">
            <button class="picker-filter-collapse-toggle ${dietActive ? 'has-active' : ''}" id="picker-toggle-diet" type="button">
              <span>Régime${dietActive ? ` (${_planningPickerFilters.dietTags.length})` : ''}</span>
              <span class="picker-filter-more-icon">▼</span>
            </button>
          </div>
          <div class="picker-filter-section picker-filter-section-half">
            <button class="picker-filter-collapse-toggle ${catActive ? 'has-active' : ''}" id="picker-toggle-category" type="button">
              <span>Catégorie${catActive ? ' (1)' : ''}</span>
              <span class="picker-filter-more-icon">▼</span>
            </button>
          </div>
        </div>
        <div class="picker-filter-chips picker-diet-row ${dietActive ? '' : 'hidden'}" id="picker-diet-row">
          ${dietChips}
        </div>
        <div class="picker-filter-chips picker-category-row ${catActive ? '' : 'hidden'}" id="picker-category-row">
          ${catChips}
        </div>

        <div class="picker-filter-section picker-filter-controls">
          <label class="picker-filter-toggle">
            <input type="checkbox" id="picker-filter-season" ${_planningPickerFilters.seasonOnly ? 'checked' : ''}>
            <span>De saison</span>
          </label>
          <label class="picker-filter-toggle">
            <input type="checkbox" id="picker-filter-verified" ${_planningPickerFilters.verifiedOnly ? 'checked' : ''}>
            <span>✅ Vérifiée</span>
          </label>
          <div class="picker-filter-sort">
            <select id="picker-filter-sort" class="picker-sort-select" aria-label="Tri">
              <option value="alpha" ${_planningPickerFilters.sort === 'alpha' ? 'selected' : ''}>A → Z</option>
              <option value="recent" ${_planningPickerFilters.sort === 'recent' ? 'selected' : ''}>Récentes</option>
              <option value="favorites" ${_planningPickerFilters.sort === 'favorites' ? 'selected' : ''}>Favorites</option>
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
  if (replaceRecipeId) {
    modal.dataset.replaceRecipeId = replaceRecipeId;
    // Indication visuelle dans l'en-tête
    const h2 = modal.querySelector('.modal-header h2');
    if (h2) h2.textContent = 'Choisir la recette de remplacement';
  } else {
    delete modal.dataset.replaceRecipeId;
  }

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
  document.getElementById('picker-filter-verified').addEventListener('change', e => {
    _planningPickerFilters.verifiedOnly = e.target.checked;
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

  // Toggle "Régime" (rendu cohérent avec Catégorie : pliable par défaut)
  const toggleDietBtn = document.getElementById('picker-toggle-diet');
  if (toggleDietBtn) {
    toggleDietBtn.addEventListener('click', () => {
      const row = document.getElementById('picker-diet-row');
      const isOpen = !row.classList.contains('hidden');
      row.classList.toggle('hidden');
      const iconEl = toggleDietBtn.querySelector('.picker-filter-more-icon');
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
  // Filtre "Vérifiée par l'humain"
  if (_planningPickerFilters.verifiedOnly) {
    recipes = recipes.filter(r => r.verifiedByHuman === true);
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
        <span class="planning-picker-item-emoji">${r.photo ? `<img src="${r.photo}" alt="" loading="lazy">` : (r.emoji || '🍽️')}</span>
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

  // Mode remplacement : on ne touche pas encore au planning, on passe par la fiche candidate
  // pour que l'utilisateur confirme depuis le détail de la recette choisie.
  if (modal.dataset.replaceRecipeId) {
    openPlanningCandidateDetail(recipeId);
    return;
  }

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

// Remplace une recette précise d'un slot par une autre (préserve les portions et la position dans la liste)
function replaceRecipeInSlot(dateStr, slotId, oldRecipeId, newRecipeId) {
  const key = `${dateStr}-${slotId}`;
  const entry = state.planning[key];
  if (!entry) return;
  const current = getSlotRecipes(entry);
  const idx = current.findIndex(r => r.id === oldRecipeId);
  if (idx < 0) return;
  // Évite les doublons si la nouvelle recette est déjà dans le slot ailleurs
  const dupIdx = current.findIndex((r, i) => i !== idx && r.id === newRecipeId);
  if (dupIdx >= 0) {
    showToast('Cette recette est déjà dans ce repas', 'info');
    return false;
  }
  current[idx] = { ...current[idx], id: newRecipeId };
  state.planning[key] = {
    ...entry,
    recipeIds: current,
    recipeId: null,
    deletedAt: null,
    updatedAt: Date.now()
  };
  savePlanning();
  syncPlanningEntry(key);
  renderPlanning();
  return true;
}
window.replaceRecipeInSlot = replaceRecipeInSlot;

// === Flow "voir/changer une recette du planning" ===

// Clic sur une recette d'un slot du planning → ouvre la fiche en mode "current"
function openPlanningRecipeDetail(dateStr, slotId, recipeId) {
  state._planningContext = {
    mode: 'current',
    dateStr,
    slotId,
    originalRecipeId: recipeId
  };
  openRecipe(recipeId);
}
window.openPlanningRecipeDetail = openPlanningRecipeDetail;

// Bouton "Changer de recette" sur la fiche du slot → ouvre le picker en mode remplacement
function changePlanningRecipe() {
  const ctx = state._planningContext;
  if (!ctx || ctx.mode !== 'current') return;
  openPlanningSlot(ctx.dateStr, ctx.slotId, { replaceRecipeId: ctx.originalRecipeId });
}
window.changePlanningRecipe = changePlanningRecipe;

// Bouton "Valider le choix" sur la fiche du slot (équivaut à un retour planning)
function confirmPlanningCurrent() {
  state._planningContext = null;
  navigateTo('planning');
}
window.confirmPlanningCurrent = confirmPlanningCurrent;

// Clic sur une recette candidate dans le picker (mode remplacement) → ouvre sa fiche en mode "candidate"
function openPlanningCandidateDetail(recipeId) {
  const ctx = state._planningContext;
  if (!ctx) return;
  // Fermer le picker sans repasser par l'historique : on va naviguer vers une fiche
  closePlanningSlotPicker(true);
  state._planningContext = {
    ...ctx,
    mode: 'candidate',
    candidateRecipeId: recipeId
  };
  openRecipe(recipeId);
}
window.openPlanningCandidateDetail = openPlanningCandidateDetail;

// Bouton "Confirmer" sur la fiche candidate → remplace la recette dans le slot
function confirmPlanningCandidate() {
  const ctx = state._planningContext;
  if (!ctx || ctx.mode !== 'candidate') return;
  const ok = replaceRecipeInSlot(ctx.dateStr, ctx.slotId, ctx.originalRecipeId, ctx.candidateRecipeId);
  if (ok === false) return; // doublon : on reste sur la fiche pour laisser l'user reculer
  const recipe = state.recipes.find(r => r.id === ctx.candidateRecipeId);
  if (recipe) showToast(`${recipe.title} remplace l'ancienne ✓`, 'success');
  state._planningContext = null;
  navigateTo('planning');
}
window.confirmPlanningCandidate = confirmPlanningCandidate;

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
  const dietOptions = DIET_TAGS
    .map(t => {
      const isFodmap = t.id === 'low-fodmap' || t.id === 'high-fodmap';
      return `<label class="diet-tag-option ${isFodmap ? 'is-auto' : ''}" style="--diet-color: ${t.color}">
        <input type="checkbox" data-diet-id="${t.id}">
        <span class="diet-tag-emoji">${t.emoji}</span>
        <span class="diet-tag-label">${escapeHtml(t.label)}${isFodmap ? ' <small>(auto)</small>' : ''}</span>
      </label>`;
    }).join('');

  // Préférences d'optimisation (lecture depuis state.prefs.planning, partagées avec la section Paramètres)
  const p = state.prefs.planning || {};
  const optimOptions = [
    { key: 'proteinDaily',       label: '🥩 Protéine à chaque repas',                    hint: '(max 1 jour/semaine sans)', defaultVal: true },
    { key: 'proteinSequencing',  label: '🔄 Pas 2× même protéine 2 jours d\'affilée',     hint: '',                          defaultVal: true },
    { key: 'nutritionQuotas',    label: '⚖️ Quotas nutrition hebdo',                      hint: '(≥2 poissons, ≤2 viandes rouges, ≥1 plat végétal)', defaultVal: true },
    { key: 'lightHeavyBalance',  label: '☯️ Équilibre lourd ↔ léger sur la journée',     hint: '',                          defaultVal: true },
    { key: 'weekendVsWeek',      label: '🏖️ Rapide en semaine, festif le weekend',       hint: '',                          defaultVal: true },
    { key: 'batchCooking',       label: '🍱 Batch cooking',                                hint: '(même recette sur 2 slots consécutifs pour cuisiner une seule fois)', defaultVal: false }
  ].map(o => {
    const isChecked = p[o.key] === undefined ? o.defaultVal : !!p[o.key];
    return `
      <label class="settings-toggle planning-menu-gen-optim-toggle">
        <input type="checkbox" data-planning-pref="${o.key}" ${isChecked ? 'checked' : ''}>
        <span>${o.label}${o.hint ? ` <small>${o.hint}</small>` : ''}</span>
      </label>
    `;
  }).join('');

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
        <button class="seg-option" data-duration="3">3 jours</button>
        <button class="seg-option active" data-duration="7">1 semaine</button>
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
      <textarea id="planning-menu-gen-prompt" placeholder="Ex: pas de gluten, plus festif le weekend, éviter les plats lourds..." rows="3" maxlength="500"></textarea>
      <div class="planning-menu-gen-counter" id="planning-menu-gen-counter">0 / 500</div>

      <div class="planning-menu-gen-collapse">
        <button class="planning-menu-gen-toggle" onclick="document.getElementById('planning-menu-gen-optim').classList.toggle('hidden')">
          ⚡ Préférences d'optimisation ▼
        </button>
        <div id="planning-menu-gen-optim" class="planning-menu-gen-optim hidden" style="margin-top:8px">
          ${optimOptions}
          <p class="settings-hint" style="margin-top:6px">Ces préférences sont aussi modifiables dans <strong>Paramètres → Génération de menu IA</strong>.</p>
        </div>
      </div>

      <div class="planning-menu-gen-collapse">
        <button class="planning-menu-gen-toggle" onclick="document.getElementById('planning-menu-gen-diets').classList.toggle('hidden')">
          🥗 Régimes alimentaires à respecter ▼
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

  // Préférences d'optimisation : persistance immédiate à chaque changement
  modal.querySelectorAll('[data-planning-pref]').forEach(input => {
    input.addEventListener('change', e => {
      const key = e.target.dataset.planningPref;
      if (key) setPlanningPref(key, e.target.checked);
    });
  });

  // Compteur de caractères en temps réel sur le textarea de contraintes
  const promptTextarea = document.getElementById('planning-menu-gen-prompt');
  const counter = document.getElementById('planning-menu-gen-counter');
  if (promptTextarea && counter) {
    const updateCounter = () => {
      const len = promptTextarea.value.length;
      counter.textContent = `${len} / 500`;
      counter.classList.toggle('is-near-limit', len > 400);
    };
    promptTextarea.addEventListener('input', updateCounter);
    updateCounter();
  }

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
  // On ajoute proteinType (cache _proteinType) et timeBucket pour permettre les règles nutritionnelles
  const recipeBrief = candidates.map(r => {
    const cookCount = (r.cookedHistory || []).length;
    const inSeason = !r.months || r.months.length === 0 || r.months.includes(currentMonth);
    const totalTime = (r.prepTime || 0) + (r.cookTime || 0);
    // Calcul du proteinType à la volée si manquant (recette sauvegardée avant la migration)
    let proteinType = r._proteinType;
    if (proteinType === undefined && typeof detectProteinType === 'function') {
      const d = detectProteinType(r.ingredients || []);
      proteinType = d.type;
    }
    // Bucket de temps : rapide ≤30, moyen 30-60, long >60
    const timeBucket = !totalTime ? 'unknown' : (totalTime <= 30 ? 'rapide' : (totalTime <= 60 ? 'moyen' : 'long'));
    return {
      id: r.id,
      title: r.title,
      category: r.category,
      tags: r.tags || [],
      dietTags: r.dietTags || [],
      totalTime: totalTime || null,
      timeBucket,
      inSeason,
      cookCount,
      proteinType: proteinType || 'aucune'
    };
  });

  // Construction du prompt : sections conditionnelles selon les préférences utilisateur
  const pp = state.prefs.planning || {};
  const batchActive = pp.batchCooking === true;
  const ruleLines = [];
  // En mode batch, on assouplit la règle de variété (1 batch = 1 recette comptée 2x consécutivement)
  if (batchActive) {
    ruleLines.push('• Variété : la même recette peut être répétée UNIQUEMENT dans le cadre d\'un batch (2 slots consécutifs). Sinon, ne jamais répéter sur la période.');
  } else {
    ruleLines.push('• Variété : ne pas répéter une recette plus de 2 fois sur la période (1 fois si durée ≤ 7 jours).');
  }
  ruleLines.push('• Saisonnalité : privilégier fortement les recettes avec inSeason=true.');
  ruleLines.push('• Roulement : favoriser les recettes avec cookCount bas (peu cuisinées récemment).');
  if (pp.proteinDaily !== false) {
    ruleLines.push('• PROTÉINE : chaque repas doit avoir proteinType ≠ "aucune". Tolérance MAX : 1 JOUR ENTIER (midi + soir) sans protéine sur 7 jours.');
  }
  if (pp.proteinSequencing !== false) {
    const batchNote = batchActive ? ' (sauf à l\'intérieur d\'un batch qui répète volontairement la recette)' : '';
    ruleLines.push(`• SÉQUENCEMENT PROTÉINE : ne pas placer 2× le même proteinType sur 2 repas consécutifs ni 2 jours consécutifs${batchNote}. Alterner les types (rouge → blanche → poisson → végétal…).`);
  }
  if (pp.nutritionQuotas !== false) {
    ruleLines.push('• QUOTAS HEBDO (pour 7 jours, ajuste au prorata) :');
    ruleLines.push('   - Minimum 2 repas avec proteinType="poisson"');
    ruleLines.push('   - Maximum 2 repas avec proteinType="viande-rouge"');
    ruleLines.push('   - Minimum 1 repas avec proteinType="legumineuse" ou "tofu" (plat 100% végétal)');
  }
  if (pp.lightHeavyBalance !== false) {
    ruleLines.push('• ÉQUILIBRE JOURNÉE : si midi est "long" (timeBucket=long) ou viande-rouge, alors soir = "rapide" et plus léger (poisson, légumineuse, ou œuf). Vice-versa.');
  }
  if (pp.weekendVsWeek !== false) {
    ruleLines.push('• RYTHME SEMAINE/WEEKEND : du lundi au vendredi midi, privilégier timeBucket="rapide" (≤30min). Le samedi et dimanche, autoriser/privilégier les plats plus longs ou festifs.');
  }
  if (batchActive) {
    ruleLines.push('• 🍱 BATCH COOKING (PRIORITÉ HAUTE) : maximiser le nombre de batches. Un batch = la MÊME recipeId placée sur 2 slots CONSÉCUTIFS dans la liste numérotée des repas (slot N et N+1).');
    ruleLines.push('   - Objectif : viser 2 à 4 batches sur 7 jours (soit 4 à 8 slots concernés sur 14).');
    ruleLines.push('   - Préférer batcher les recettes avec timeBucket="long" ou "moyen" (amortir le temps de cuisine).');
    ruleLines.push('   - Privilégier les enchaînements "soir → midi du lendemain" (restes faciles à conserver une nuit).');
    ruleLines.push('   - Un batch compte comme UNE seule recette pour la règle de variété : tu peux la placer 2 fois consécutivement.');
    ruleLines.push('   - Indique dans "reason" lorsque c\'est un batch (ex: "Batch avec slot précédent").');
  }
  if (userPrompt) {
    ruleLines.push(`• CONTRAINTES UTILISATEUR (priorité absolue) : ${userPrompt}`);
  }

  const submitBtn = document.getElementById('planning-menu-gen-submit');
  const originalLabel = submitBtn.innerHTML;
  submitBtn.disabled = true;
  // Messages progressifs pour rendre l'attente moins anxiogène (l'appel peut prendre 10-20 sec)
  const stopProgress = startProgressiveLabel(
    label => { submitBtn.innerHTML = `<span class="spinner-small"></span> ${label}`; },
    [
      'Analyse de vos recettes…',
      'Application des règles nutritionnelles…',
      'Construction du planning…',
      'Optimisation des choix…',
      'Finalisation…'
    ]
  );

  try {
    const prompt = `Tu es un chef nutritionniste qui aide à planifier des repas équilibrés et variés.
Mission : sélectionner ${targetSlots.length} recettes parmi ma bibliothèque pour remplir mon planning.

RÈGLES À RESPECTER (par ordre d'importance) :
${ruleLines.join('\n')}

PROCÉDURE :
1. Étudie d'abord toutes les contraintes ci-dessus avant de proposer quoi que ce soit.
2. Construis une distribution équilibrée AVANT de choisir les recettes (combien de poisson, de viande rouge, de plats végétaux, etc.).
3. Choisis les recettes en respectant les contraintes ET la distribution prévue.
4. Vérifie en relisant ta proposition que TOUTES les règles sont respectées. Si une règle est violée, ajuste.

Repas demandés (dans l'ordre, slot 1 = premier élément du tableau de réponse) :
${targetSlots.map((s, i) => {
  const [y, m, day] = s.dateStr.split('-').map(Number);
  const dObj = new Date(y, m - 1, day);
  const dow = dObj.toLocaleDateString('fr-FR', { weekday: 'long' });
  return `${i + 1}. ${s.dateStr} (${dow}) - ${s.slot}`;
}).join('\n')}

Recettes disponibles (champs : id, title, category, tags, dietTags, totalTime, timeBucket, inSeason, cookCount, proteinType) :
${JSON.stringify(recipeBrief, null, 1)}

RÉPONSE ATTENDUE : un JSON STRICT entre balises <menu>...</menu>, format :
<menu>
[
  { "slot": 1, "recipeId": "abc", "reason": "Poisson de saison, léger pour le soir" },
  { "slot": 2, "recipeId": "def", "reason": "Plat végétal pour équilibrer" }
]
</menu>

L'array doit avoir exactement ${targetSlots.length} éléments. Chaque "recipeId" doit exister dans les recettes disponibles. "reason" est une phrase TRÈS courte (max 10 mots) qui justifie le choix par rapport aux règles.`;

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
    stopProgress();
    closePlanningMenuGenerator(true);
    openPlanningMenuPreview(proposal);

  } catch (e) {
    console.error('Génération menu erreur:', e);
    showToast('Erreur: ' + e.message, 'error');
    stopProgress();
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
              <span class="planning-menu-preview-emoji">${p.recipe.photo ? `<img src="${p.recipe.photo}" alt="" loading="lazy">` : (p.recipe.emoji || '🍽️')}</span>
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

  // Filter chips (category + month + verified, dans le drawer ou en haut)
  document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const type = chip.dataset.filterType;
      document.querySelectorAll(`.filter-chip[data-filter-type="${type}"]`).forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      if (type === 'month') state.monthFilter = chip.dataset.filterValue;
      else if (type === 'category') state.categoryFilter = chip.dataset.filterValue;
      else if (type === 'verified') state.verifiedFilter = chip.dataset.filterValue;
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
  document.getElementById('chat-attach-btn').addEventListener('click', async () => {
    // Dialog Camera / Galerie pour Android iOS
    const choice = await _showChatPhotoSourceDialog();
    if (!choice) return;
    const input = document.getElementById('chat-file-input');
    // Reset puis appliquer le bon mode
    if (choice === 'camera') {
      input.setAttribute('capture', 'environment');
    } else {
      input.removeAttribute('capture');
    }
    input.click();
  });
  document.getElementById('chat-file-input').addEventListener('change', async e => {
    const files = Array.from(e.target.files || []);
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue;
      if (state.chatAttachments.length >= 5) {
        showToast('Maximum 5 images par message', 'error');
        break;
      }
      try {
        const att = await processImage(file);
        state.chatAttachments.push(att);
      } catch (err) {
        console.error(err);
        showToast('Erreur sur ' + file.name, 'error');
      }
    }
    e.target.value = '';
    // Nettoyer capture pour le prochain usage
    e.target.removeAttribute('capture');
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
    // Confirmation visuelle inline : badge ✓ apparaît immédiatement à côté du label
    const apiBadge = document.getElementById('settings-api-key-badge');
    if (apiBadge) apiBadge.hidden = !k;
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

  const freeSpaceBtn = document.getElementById('settings-free-space');
  if (freeSpaceBtn) {
    freeSpaceBtn.addEventListener('click', freeStorageSpace);
  }

  const recalcAllBtn = document.getElementById('settings-recalc-all');
  if (recalcAllBtn) {
    recalcAllBtn.addEventListener('click', recalcAllRecipes);
  }

  const recalcFodmapBtn = document.getElementById('settings-recalc-fodmap');
  if (recalcFodmapBtn) {
    recalcFodmapBtn.addEventListener('click', recalcAllFodmapAndSeasonality);
  }

  // Préférences génération de menu : un listener par toggle, persistance automatique
  [
    ['settings-planning-protein-daily', 'proteinDaily'],
    ['settings-planning-protein-sequencing', 'proteinSequencing'],
    ['settings-planning-nutrition-quotas', 'nutritionQuotas'],
    ['settings-planning-light-heavy', 'lightHeavyBalance'],
    ['settings-planning-weekend', 'weekendVsWeek'],
    ['settings-planning-batch', 'batchCooking']
  ].forEach(([id, key]) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', () => setPlanningPref(key, el.checked));
  });

  // Boutons 👁️ pour afficher/masquer temporairement les champs sensibles
  document.querySelectorAll('.settings-reveal-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.revealTarget;
      const input = document.getElementById(targetId);
      if (!input) return;
      const isRevealed = input.type === 'text';
      input.type = isRevealed ? 'password' : 'text';
      btn.textContent = isRevealed ? '👁️' : '🙈';
      btn.classList.toggle('is-revealed', !isRevealed);
      btn.setAttribute('aria-label', isRevealed ? 'Afficher' : 'Masquer');
    });
  });

  // Animation des group titles stické : intensifier l'ombre quand le titre est figé en haut du scroll
  const settingsBody = document.querySelector('#settings-modal .modal-body');
  if (settingsBody) {
    const titles = settingsBody.querySelectorAll('.settings-group-title');
    let raf = null;
    const updateStuckState = () => {
      const rootTop = settingsBody.getBoundingClientRect().top;
      titles.forEach(title => {
        const top = title.getBoundingClientRect().top;
        title.classList.toggle('is-stuck', Math.abs(top - rootTop) < 2);
      });
      raf = null;
    };
    settingsBody.addEventListener('scroll', () => {
      if (raf) return;
      raf = requestAnimationFrame(updateStuckState);
    }, { passive: true });
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
  _validatePhotoFileSize(file);
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

// ============================================
// PULL-TO-REFRESH (vue Bibliothèque)
// ============================================
// L'UI #pull-refresh-indicator existe déjà dans le HTML. On la branche aux pointer events
// sur la vue Bibliothèque : si l'utilisateur tire vers le bas depuis scrollTop=0,
// l'indicateur apparaît progressivement. Au-delà d'un seuil (80px), le relâchement
// déclenche un refresh (performSync si actif, sinon re-render).
function _initPullToRefresh() {
  const main = document.getElementById('main-content');
  const indicator = document.getElementById('pull-refresh-indicator');
  if (!main || !indicator) return;

  const TRIGGER_PX = 80;
  const MAX_PX = 120;
  let startY = 0;
  let pulling = false;
  let pullDistance = 0;
  let refreshing = false;

  main.addEventListener('touchstart', (e) => {
    if (refreshing) return;
    // Pull-to-refresh actif uniquement sur la vue Bibliothèque et tout en haut du scroll
    if (state.currentView !== 'library') return;
    if (main.scrollTop > 0) return;
    startY = e.touches[0].clientY;
    pulling = true;
    pullDistance = 0;
  }, { passive: true });

  main.addEventListener('touchmove', (e) => {
    if (!pulling || refreshing) return;
    const dy = e.touches[0].clientY - startY;
    if (dy <= 0) { pulling = false; indicator.style.transform = ''; indicator.classList.add('hidden'); return; }
    pullDistance = Math.min(dy * 0.5, MAX_PX); // amortissement
    indicator.classList.remove('hidden');
    indicator.style.transform = `translateY(${pullDistance}px)`;
    indicator.classList.toggle('is-ready', pullDistance >= TRIGGER_PX);
  }, { passive: true });

  const endHandler = async () => {
    if (!pulling || refreshing) return;
    pulling = false;
    if (pullDistance >= TRIGGER_PX) {
      refreshing = true;
      indicator.classList.add('is-refreshing');
      try {
        if (state.sync.enabled) {
          await performSync(false);
        } else {
          renderLibrary();
          showToast('Bibliothèque actualisée ✓', 'success');
        }
      } catch (e) {
        console.error('Pull-to-refresh erreur', e);
      } finally {
        refreshing = false;
        indicator.classList.remove('is-refreshing', 'is-ready');
        indicator.style.transform = '';
        indicator.classList.add('hidden');
      }
    } else {
      indicator.style.transform = '';
      indicator.classList.remove('is-ready');
      indicator.classList.add('hidden');
    }
  };
  main.addEventListener('touchend', endHandler);
  main.addEventListener('touchcancel', endHandler);
}

// Badge "Hors ligne" : visible quand navigator.onLine === false
function _initOfflineIndicator() {
  const badge = document.getElementById('offline-badge');
  if (!badge) return;
  const update = () => {
    const isOffline = !navigator.onLine;
    badge.classList.toggle('hidden', !isOffline);
  };
  window.addEventListener('online', update);
  window.addEventListener('offline', update);
  update();
}

function init() {
  loadState();
  // Compteur stockage console (utile pour debug : repérer un quota qui grimpe)
  try {
    const stats = _computeStorageStats();
    console.info(
      `[Mes Recettes] %c${stats.recipeCount} recettes %c· %c${stats.totalKB} Ko stockés %c(${stats.photoCount} photos, ${stats.photoKB} Ko)`,
      'font-weight:700;color:#B5532A', 'color:inherit',
      'font-weight:700;color:#B5532A', 'color:inherit'
    );
  } catch (e) { /* silent */ }
  applyTheme(); // doit être appelé tôt pour éviter le flash
  initHistory(); // initialise l'historique pour le bouton retour
  _initOfflineIndicator();
  _initPullToRefresh();
  initKeyboardHandling(); // ajuste la barre chat avec le clavier virtuel
  bindEvents();
  _loadTimerState(); // restaurer un éventuel minuteur actif
  acquireWakeLock(); // anti-veille global (l'écran reste allumé tant que l'app est ouverte)

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
