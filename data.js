// ============================================
// DONNÉES DE RÉFÉRENCE
// ============================================

// Catégories de produits pour la liste de courses
const PRODUCT_CATEGORIES = [
  { id: 'fruits-legumes', label: 'Fruits & Légumes', emoji: '🥬', keywords: ['tomate', 'pomme', 'poire', 'banane', 'salade', 'laitue', 'carotte', 'oignon', 'ail', 'échalote', 'pomme de terre', 'patate', 'courgette', 'aubergine', 'poivron', 'concombre', 'champignon', 'avocat', 'citron', 'orange', 'fraise', 'framboise', 'myrtille', 'mûre', 'cassis', 'cerise', 'abricot', 'pêche', 'nectarine', 'prune', 'raisin', 'kiwi', 'mangue', 'ananas', 'melon', 'pastèque', 'figue', 'grenade', 'poireau', 'épinard', 'roquette', 'mâche', 'cresson', 'endive', 'radis', 'betterave', 'navet', 'panais', 'céleri', 'fenouil', 'artichaut', 'asperge', 'brocoli', 'chou', 'choux', 'haricot', 'petit pois', 'fève', 'maïs', 'gingembre', 'persil', 'basilic', 'menthe', 'coriandre', 'thym', 'romarin', 'estragon', 'ciboulette', 'aneth', 'sauge', 'origan', 'laurier', 'clémentine', 'mandarine', 'pamplemousse', 'rhubarbe', 'topinambour', 'rutabaga', 'potimarron', 'potiron', 'butternut', 'courge', 'patidou'] },
  { id: 'epicerie-salee', label: 'Épicerie salée', emoji: '🧂', keywords: ['sel', 'poivre', 'épice', 'cumin', 'curry', 'curcuma', 'paprika', 'cannelle', 'muscade', 'gingembre moulu', 'piment', 'safran', 'pâte', 'pâtes', 'spaghetti', 'penne', 'tagliatelle', 'lasagne', 'macaroni', 'fusilli', 'farfalle', 'gnocchi', 'riz', 'quinoa', 'boulgour', 'semoule', 'couscous', 'lentille', 'pois chiche', 'haricot blanc', 'haricot rouge', 'haricot noir', 'flageolet', 'farine', 'fécule', 'maïzena', 'chapelure', 'levure', 'bicarbonate', 'huile', 'huile d\'olive', 'huile de tournesol', 'huile de colza', 'huile de sésame', 'huile de coco', 'vinaigre', 'moutarde', 'mayonnaise', 'ketchup', 'sauce soja', 'sauce', 'bouillon', 'cube', 'tomates pelées', 'concentré de tomate', 'olives', 'câpres', 'cornichons', 'thon', 'sardine', 'maquereau', 'anchois', 'tahini', 'miso', 'algues', 'nori'] },
  { id: 'epicerie-sucree', label: 'Épicerie sucrée', emoji: '🍯', keywords: ['sucre', 'sucre roux', 'sucre glace', 'cassonade', 'miel', 'sirop d\'érable', 'sirop d\'agave', 'mélasse', 'chocolat', 'cacao', 'pépite', 'vanille', 'gousse de vanille', 'extrait', 'pralin', 'praline', 'amande', 'noix', 'noisette', 'pistache', 'noix de cajou', 'noix de pécan', 'pignon', 'graine', 'sésame', 'pavot', 'tournesol', 'courge', 'lin', 'chia', 'avoine', 'flocon', 'müesli', 'granola', 'biscuit', 'spéculoos', 'sablé', 'confiture', 'compote', 'pâte à tartiner', 'fruits secs', 'raisin sec', 'datte', 'figue sèche', 'abricot sec', 'pruneau', 'noix de coco', 'amande effilée'] },
  { id: 'frais-cremerie', label: 'Frais & Crèmerie', emoji: '🥛', keywords: ['lait', 'crème', 'crème fraîche', 'crème liquide', 'crème épaisse', 'beurre', 'margarine', 'yaourt', 'fromage blanc', 'faisselle', 'petit-suisse', 'mascarpone', 'ricotta', 'mozzarella', 'parmesan', 'comté', 'gruyère', 'emmental', 'cheddar', 'feta', 'chèvre', 'roquefort', 'bleu', 'camembert', 'brie', 'reblochon', 'raclette', 'tomme', 'fromage', 'oeuf', 'oeufs', 'œuf', 'œufs', 'tofu', 'lait de coco', 'lait d\'amande', 'lait d\'avoine', 'lait de soja', 'crème végétale', 'yaourt végétal'] },
  { id: 'viandes-poissons', label: 'Viandes & Poissons', emoji: '🍗', keywords: ['boeuf', 'bœuf', 'steak', 'haché', 'bavette', 'entrecôte', 'rumsteak', 'filet', 'rôti', 'carbonnade', 'veau', 'escalope', 'porc', 'jambon', 'lardon', 'bacon', 'saucisse', 'saucisson', 'chorizo', 'merguez', 'boudin', 'agneau', 'gigot', 'côtelette', 'poulet', 'cuisse', 'aile', 'blanc', 'pilon', 'dinde', 'canard', 'magret', 'lapin', 'gibier', 'saumon', 'thon frais', 'cabillaud', 'morue', 'lieu', 'colin', 'merlu', 'truite', 'sole', 'bar', 'dorade', 'sardine fraîche', 'maquereau frais', 'crevette', 'gambas', 'langoustine', 'moule', 'huître', 'palourde', 'st jacques', 'noix de st jacques', 'calamar', 'poulpe', 'seiche'] },
  { id: 'pain-boulangerie', label: 'Pain & Boulangerie', emoji: '🍞', keywords: ['pain', 'baguette', 'brioche', 'viennoiserie', 'croissant', 'pain au chocolat', 'pain de mie', 'pain complet', 'pain au levain', 'pain pita', 'pain naan', 'tortilla', 'wrap', 'galette', 'crêpe', 'pâte à pizza', 'pâte feuilletée', 'pâte brisée', 'pâte sablée', 'biscotte'] },
  { id: 'boissons', label: 'Boissons', emoji: '🥤', keywords: ['eau', 'jus', 'soda', 'limonade', 'thé', 'café', 'infusion', 'tisane', 'vin', 'vin rouge', 'vin blanc', 'vin rosé', 'champagne', 'bière', 'cidre', 'rhum', 'vodka', 'gin', 'whisky', 'cognac', 'porto', 'martini', 'liqueur', 'sirop'] },
  { id: 'surgeles', label: 'Surgelés', emoji: '🧊', keywords: ['surgelé', 'glace', 'sorbet'] },
  { id: 'autres', label: 'Autres', emoji: '🛒', keywords: [] }
];

// Catégorise un ingrédient
function categorizeIngredient(name) {
  const lower = name.toLowerCase().trim();
  for (const cat of PRODUCT_CATEGORIES) {
    for (const kw of cat.keywords) {
      // Match exact ou en tant que mot
      if (lower === kw || lower.includes(kw + ' ') || lower.includes(' ' + kw) ||
          lower.startsWith(kw + 's') || lower === kw + 's' ||
          new RegExp('\\b' + kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i').test(lower)) {
        return cat.id;
      }
    }
  }
  return 'autres';
}

// Saisonnalité des ingrédients en France (mois de récolte/disponibilité optimale)
const SEASONALITY = {
  // Légumes
  'asperge': [4, 5, 6],
  'asperges': [4, 5, 6],
  'artichaut': [5, 6, 7, 8, 9, 10],
  'artichauts': [5, 6, 7, 8, 9, 10],
  'aubergine': [7, 8, 9, 10],
  'aubergines': [7, 8, 9, 10],
  'betterave': [6, 7, 8, 9, 10, 11, 12, 1, 2],
  'brocoli': [6, 7, 8, 9, 10, 11],
  'carotte': [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  'céleri': [9, 10, 11, 12, 1, 2, 3],
  'chou': [9, 10, 11, 12, 1, 2, 3, 4],
  'choux': [9, 10, 11, 12, 1, 2, 3, 4],
  'chou-fleur': [9, 10, 11, 12, 1, 2, 3, 4],
  'concombre': [5, 6, 7, 8, 9],
  'courgette': [5, 6, 7, 8, 9, 10],
  'courgettes': [5, 6, 7, 8, 9, 10],
  'endive': [10, 11, 12, 1, 2, 3, 4],
  'épinard': [3, 4, 5, 6, 9, 10, 11],
  'épinards': [3, 4, 5, 6, 9, 10, 11],
  'fenouil': [5, 6, 7, 8, 9, 10],
  'haricot vert': [6, 7, 8, 9, 10],
  'haricots verts': [6, 7, 8, 9, 10],
  'maïs': [8, 9, 10],
  'navet': [9, 10, 11, 12, 1, 2, 3, 4, 5],
  'oignon': [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  'panais': [10, 11, 12, 1, 2, 3],
  'patate douce': [9, 10, 11, 12, 1],
  'petit pois': [5, 6, 7],
  'petits pois': [5, 6, 7],
  'poireau': [9, 10, 11, 12, 1, 2, 3, 4, 5],
  'poivron': [7, 8, 9, 10],
  'pomme de terre': [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  'potiron': [9, 10, 11, 12, 1],
  'potimarron': [9, 10, 11, 12, 1],
  'butternut': [9, 10, 11, 12, 1],
  'radis': [3, 4, 5, 6, 7, 8, 9, 10],
  'rhubarbe': [4, 5, 6, 7],
  'salade': [4, 5, 6, 7, 8, 9, 10],
  'tomate': [6, 7, 8, 9, 10],
  'tomates': [6, 7, 8, 9, 10],
  'topinambour': [10, 11, 12, 1, 2, 3],
  'cresson': [3, 4, 5, 9, 10, 11],
  'roquette': [5, 6, 7, 8, 9],
  'mâche': [10, 11, 12, 1, 2, 3, 4],

  // Fruits
  'abricot': [6, 7, 8],
  'abricots': [6, 7, 8],
  'cerise': [5, 6, 7],
  'cerises': [5, 6, 7],
  'fraise': [4, 5, 6, 7],
  'fraises': [4, 5, 6, 7],
  'framboise': [6, 7, 8, 9],
  'framboises': [6, 7, 8, 9],
  'mûre': [7, 8, 9],
  'myrtille': [6, 7, 8, 9],
  'cassis': [7, 8],
  'figue': [8, 9, 10],
  'figues': [8, 9, 10],
  'melon': [6, 7, 8, 9],
  'pastèque': [6, 7, 8, 9],
  'nectarine': [6, 7, 8, 9],
  'pêche': [6, 7, 8, 9],
  'pêches': [6, 7, 8, 9],
  'prune': [7, 8, 9, 10],
  'prunes': [7, 8, 9, 10],
  'raisin': [8, 9, 10, 11],
  'pomme': [9, 10, 11, 12, 1, 2, 3, 4],
  'pommes': [9, 10, 11, 12, 1, 2, 3, 4],
  'poire': [9, 10, 11, 12, 1, 2, 3, 4],
  'poires': [9, 10, 11, 12, 1, 2, 3, 4],
  'kiwi': [11, 12, 1, 2, 3, 4],
  'orange': [11, 12, 1, 2, 3, 4],
  'oranges': [11, 12, 1, 2, 3, 4],
  'clémentine': [11, 12, 1],
  'mandarine': [11, 12, 1, 2],
  'pamplemousse': [11, 12, 1, 2, 3, 4],
  'citron': [1, 2, 3, 4, 5, 11, 12],
  'grenade': [10, 11, 12]
};

// Calcule les mois de saisonnalité d'une recette à partir de ses ingrédients
function calculateSeasonality(ingredients) {
  const monthCounts = {};
  let seasonalIngredientCount = 0;

  for (const ing of ingredients) {
    const lower = ing.name.toLowerCase().trim();
    let matched = null;

    // Recherche directe
    if (SEASONALITY[lower]) {
      matched = SEASONALITY[lower];
    } else {
      // Recherche par inclusion (ex: "tomates cerises" -> "tomate")
      for (const [key, months] of Object.entries(SEASONALITY)) {
        if (lower.includes(key) || lower.includes(key.replace(/s$/, ''))) {
          matched = months;
          break;
        }
      }
    }

    if (matched && matched.length < 12) { // Ignorer les ingrédients dispo toute l'année
      seasonalIngredientCount++;
      for (const m of matched) {
        monthCounts[m] = (monthCounts[m] || 0) + 1;
      }
    }
  }

  if (seasonalIngredientCount === 0) {
    // Recette toute saison
    return [];
  }

  // Garder les mois où au moins 1 ingrédient saisonnier est dispo
  // (on pourrait être plus strict mais c'est plus utile comme ça pour l'utilisateur)
  return Object.keys(monthCounts).map(Number).sort((a, b) => a - b);
}

const MONTH_NAMES = {
  1: 'Janv', 2: 'Févr', 3: 'Mars', 4: 'Avril', 5: 'Mai', 6: 'Juin',
  7: 'Juil', 8: 'Août', 9: 'Sept', 10: 'Oct', 11: 'Nov', 12: 'Déc'
};

const MONTH_NAMES_FULL = {
  1: 'Janvier', 2: 'Février', 3: 'Mars', 4: 'Avril', 5: 'Mai', 6: 'Juin',
  7: 'Juillet', 8: 'Août', 9: 'Septembre', 10: 'Octobre', 11: 'Novembre', 12: 'Décembre'
};

// Emojis par type de plat (fallback)
const RECIPE_EMOJIS = ['🍝', '🥗', '🍲', '🥘', '🍛', '🍜', '🍱', '🥙', '🌮', '🍕', '🥧', '🧁', '🍰', '🥖', '🍞', '🥐', '🥯', '🧇', '🥞', '🍳', '🥚', '🍔', '🌭', '🥪', '🍟', '🍿', '🍩', '🍪', '🍫', '🥑', '🥒', '🥕', '🌽', '🍆', '🥔', '🍅', '🍑', '🍓', '🍒', '🥭', '🍍', '🥥', '🥝', '🍇', '🍉', '🍊', '🍋', '🍌', '🍐', '🍎', '🥦', '🧄', '🧅', '🍄', '🥜', '🍯', '🥛'];

// Catégories de recettes
const RECIPE_CATEGORIES = [
  { id: 'apero', label: 'Apéro', emoji: '🍸', order: 1 },
  { id: 'entree', label: 'Entrée', emoji: '🥗', order: 2 },
  { id: 'plat', label: 'Plat', emoji: '🍽️', order: 3 },
  { id: 'dessert', label: 'Dessert', emoji: '🍰', order: 4 },
  { id: 'gouter', label: 'Goûter', emoji: '🍪', order: 5 },
  { id: 'petitdej', label: 'Petit déjeuner', emoji: '🥐', order: 6 },
  { id: 'boisson', label: 'Boisson', emoji: '🥤', order: 7 },
  { id: 'autre', label: 'Autre', emoji: '🍴', order: 8 }
];

function getCategoryById(id) {
  return RECIPE_CATEGORIES.find(c => c.id === id) || RECIPE_CATEGORIES[RECIPE_CATEGORIES.length - 1];
}

// Ingrédients exclus de la liste de courses (toujours dans le placard)
// Les variantes précises restent incluses : "fleur de sel" exclue (c'est encore du sel),
// mais "sel de Guérande" inclus si on précise vraiment, etc.
// On normalise en retirant les parenthèses, on compare au mot brut.
const SHOPPING_EXCLUDE = [
  'sel',
  'poivre',
  'eau',
  'glaçons',
  'glacons',
  'fleur de sel',
  'gros sel',
  'sel fin',
  'poivre noir',
  'poivre blanc',
  'poivre moulu',
  'eau froide',
  'eau chaude',
  'eau tiède',
  'eau bouillante',
  'eau du robinet',
  'eau gazeuse',
  'eau plate'
];

// Normalise un nom d'ingrédient pour les comparaisons :
// - lowercase
// - retire le contenu entre parenthèses
// - retire les espaces multiples
// - trim
function normalizeIngredientName(name) {
  if (!name) return '';
  return String(name)
    .toLowerCase()
    .replace(/\([^)]*\)/g, '') // retire (...)
    .replace(/\s+/g, ' ')
    .trim();
}

// Vérifie si un ingrédient doit être exclu de la liste de courses
function isShoppingExcluded(name) {
  const normalized = normalizeIngredientName(name);
  if (!normalized) return false;
  // Match exact ou avec préfixe "de l'" / "du" / "de la"
  for (const excluded of SHOPPING_EXCLUDE) {
    if (normalized === excluded) return true;
    // Variantes simples : "un peu de sel", "1 pincée de sel", etc.
    // si l'ingrédient se termine par un de ces mots et qu'il n'y a rien de plus précis
    if (normalized.endsWith(' ' + excluded) && normalized.split(' ').length <= 4) {
      // Pour éviter de matcher "sel rose de l'Himalaya" comme "sel"
      // on regarde si c'est juste un qualifieur de quantité
      const before = normalized.slice(0, normalized.length - excluded.length).trim();
      if (/^(un peu de|une pinc[eé]e de|une pinc[eé]e d'|du|de la|de l')$/i.test(before)) {
        return true;
      }
    }
  }
  return false;
}

// ============================================
// CONVERSION D'UNITÉS
// ============================================

// Conversions standardisées (vers une unité de base)
// volume → ml, poids → g, le reste reste tel quel
const UNIT_CONVERSIONS = {
  // Volume vers ml
  'ml': { base: 'ml', factor: 1, type: 'volume' },
  'cl': { base: 'ml', factor: 10, type: 'volume' },
  'dl': { base: 'ml', factor: 100, type: 'volume' },
  'l': { base: 'ml', factor: 1000, type: 'volume' },
  'litre': { base: 'ml', factor: 1000, type: 'volume' },
  'litres': { base: 'ml', factor: 1000, type: 'volume' },
  'cuillère à soupe': { base: 'ml', factor: 15, type: 'volume' },
  'cuillere à soupe': { base: 'ml', factor: 15, type: 'volume' },
  'cuillère a soupe': { base: 'ml', factor: 15, type: 'volume' },
  'c. à soupe': { base: 'ml', factor: 15, type: 'volume' },
  'c.à.s': { base: 'ml', factor: 15, type: 'volume' },
  'c.a.s': { base: 'ml', factor: 15, type: 'volume' },
  'cas': { base: 'ml', factor: 15, type: 'volume' },
  'càs': { base: 'ml', factor: 15, type: 'volume' },
  'cuillère à café': { base: 'ml', factor: 5, type: 'volume' },
  'cuillere à café': { base: 'ml', factor: 5, type: 'volume' },
  'c. à café': { base: 'ml', factor: 5, type: 'volume' },
  'c.à.c': { base: 'ml', factor: 5, type: 'volume' },
  'c.a.c': { base: 'ml', factor: 5, type: 'volume' },
  'cac': { base: 'ml', factor: 5, type: 'volume' },
  'càc': { base: 'ml', factor: 5, type: 'volume' },
  // Poids vers g
  'g': { base: 'g', factor: 1, type: 'mass' },
  'gr': { base: 'g', factor: 1, type: 'mass' },
  'gramme': { base: 'g', factor: 1, type: 'mass' },
  'grammes': { base: 'g', factor: 1, type: 'mass' },
  'kg': { base: 'g', factor: 1000, type: 'mass' },
  'kilo': { base: 'g', factor: 1000, type: 'mass' },
  'kilos': { base: 'g', factor: 1000, type: 'mass' }
};

// Choisit la meilleure unité d'affichage pour une valeur donnée
function getBestDisplayUnit(amountInBase, type) {
  if (type === 'mass') {
    if (amountInBase >= 1000) return { unit: 'kg', factor: 1000 };
    return { unit: 'g', factor: 1 };
  }
  if (type === 'volume') {
    if (amountInBase >= 1000) return { unit: 'l', factor: 1000 };
    if (amountInBase >= 100) return { unit: 'cl', factor: 10 };
    return { unit: 'ml', factor: 1 };
  }
  return null;
}

// Normalise un (amount, unit) vers (amountInBase, baseUnit, type)
// Retourne null si l'unité n'est pas convertible
function normalizeAmount(amount, unit) {
  if (amount == null || unit == null) return null;
  const cleanUnit = String(unit).toLowerCase().trim();
  const conv = UNIT_CONVERSIONS[cleanUnit];
  if (!conv) return null;
  return {
    amount: Number(amount) * conv.factor,
    baseUnit: conv.base,
    type: conv.type
  };
}

// ============================================
// INGRÉDIENTS COURANTS (autocomplete pour création manuelle)
// ============================================
const COMMON_INGREDIENTS = [
  // Légumes
  'Tomate', 'Tomates cerises', 'Carotte', 'Pomme de terre', 'Oignon', 'Échalote', 'Ail',
  'Courgette', 'Aubergine', 'Poivron', 'Concombre', 'Champignon', 'Champignons de Paris',
  'Salade', 'Roquette', 'Mâche', 'Épinard', 'Poireau', 'Brocoli', 'Chou-fleur', 'Avocat',
  'Céleri', 'Fenouil', 'Asperge', 'Artichaut', 'Petit pois', 'Haricot vert', 'Maïs',
  'Potimarron', 'Butternut', 'Patate douce',
  // Fruits
  'Citron', 'Orange', 'Pomme', 'Poire', 'Banane', 'Fraise', 'Framboise', 'Cerise',
  'Pêche', 'Abricot', 'Prune', 'Raisin', 'Kiwi', 'Mangue', 'Ananas', 'Melon',
  // Herbes & Épices
  'Persil', 'Basilic', 'Coriandre', 'Menthe', 'Thym', 'Romarin', 'Estragon', 'Ciboulette',
  'Aneth', 'Laurier', 'Sauge', 'Origan', 'Cumin', 'Curry', 'Curcuma', 'Paprika',
  'Cannelle', 'Muscade', 'Gingembre', 'Piment',
  // Crémerie
  'Beurre', 'Crème fraîche', 'Crème liquide', 'Lait', 'Mozzarella', 'Parmesan',
  'Comté', 'Gruyère', 'Emmental', 'Cheddar', 'Feta', 'Chèvre', 'Mascarpone', 'Ricotta',
  'Yaourt', 'Œufs', 'Œuf',
  // Viandes & Poissons
  'Poulet', 'Bœuf haché', 'Steak', 'Veau', 'Porc', 'Agneau', 'Jambon', 'Lardons',
  'Saucisse', 'Chorizo', 'Saumon', 'Cabillaud', 'Thon', 'Crevettes', 'Moules',
  // Épicerie salée
  'Pâtes', 'Spaghetti', 'Penne', 'Tagliatelle', 'Lasagne', 'Riz', 'Quinoa', 'Boulgour',
  'Semoule', 'Couscous', 'Lentilles', 'Pois chiches', 'Haricots blancs', 'Haricots rouges',
  'Farine', 'Levure', 'Bicarbonate', 'Huile d\'olive', 'Huile de tournesol', 'Vinaigre',
  'Moutarde', 'Sauce soja', 'Bouillon', 'Concentré de tomate', 'Tomates pelées',
  'Olives', 'Câpres', 'Cornichons',
  // Épicerie sucrée
  'Sucre', 'Sucre roux', 'Cassonade', 'Sucre glace', 'Miel', 'Sirop d\'érable',
  'Chocolat', 'Cacao', 'Pépites de chocolat', 'Vanille', 'Amandes', 'Noix', 'Noisettes',
  'Pistaches', 'Raisins secs', 'Confiture', 'Pâte à tartiner',
  // Pain
  'Pain', 'Baguette', 'Brioche', 'Pain de mie', 'Pâte feuilletée', 'Pâte brisée', 'Pâte à pizza',
  // Boissons
  'Vin blanc', 'Vin rouge', 'Bière', 'Cidre', 'Café', 'Thé'
];

// ============================================
// UNITÉS COURANTES (pour autocomplete)
// ============================================
const COMMON_UNITS = [
  'g', 'kg', 'ml', 'cl', 'l',
  'cuillère à soupe', 'cuillère à café',
  'pièce', 'pièces', 'gousse', 'gousses', 'pincée', 'pincées',
  'sachet', 'sachets', 'bouquet', 'tranche', 'tranches', 'feuille', 'feuilles',
  'verre', 'bol', 'tasse', 'pot'
];
