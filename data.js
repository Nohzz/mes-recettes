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
  'abricot': [6, 7, 8],
  'abricots': [6, 7, 8],
  'ail': [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  'aneth': [5, 6, 7, 8, 9],
  'artichaut': [4, 5, 6, 7, 8, 9],
  'artichauts': [4, 5, 6, 7, 8, 9],
  'asperge': [3, 4, 5, 6, 7],
  'asperges': [3, 4, 5, 6, 7],
  'aubergine': [5, 6, 7, 8, 9, 10],
  'aubergines': [5, 6, 7, 8, 9, 10],
  'basilic': [5, 6, 7, 8, 9, 10],
  'betterave': [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  'betteraves': [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  'blette': [3, 4, 5, 6, 7, 8, 9, 10],
  'blettes': [3, 4, 5, 6, 7, 8, 9, 10],
  'brocoli': [6, 7, 8, 9, 10, 11],
  'brocolis': [6, 7, 8, 9, 10, 11],
  'brugnon': [6, 7, 8],
  'brugnons': [6, 7, 8],
  'cardon': [11],
  'carotte': [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  'carottes': [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  'cassis': [6, 7, 8],
  'celeri-branche': [1, 7, 8, 9, 10, 11, 12],
  'celeri-rave': [1, 2, 3, 10, 11, 12],
  'cerise': [5, 6, 7],
  'cerises': [5, 6, 7],
  'chataigne': [10, 11, 12],
  'chataignes': [10, 11, 12],
  'chou': [1, 3, 9, 10, 11, 12],
  'chou blanc': [1, 2, 8, 9, 10, 11, 12],
  'chou de bruxelles': [1, 2, 3, 9, 10, 11, 12],
  'chou fleur': [3, 4, 5, 9, 10, 11],
  'chou frise': [1, 2, 9, 10, 11, 12],
  'chou frisé': [1, 2, 9, 10, 11, 12],
  'chou romanesco': [6, 7, 8, 9],
  'chou rouge': [1, 2, 8, 9, 10, 11, 12],
  'chou-fleur': [3, 4, 5, 9, 10, 11],
  'choux de bruxelles': [1, 2, 3, 9, 10, 11, 12],
  'choux-fleurs': [3, 4, 5, 9, 10, 11],
  'châtaigne': [10, 11, 12],
  'châtaignes': [10, 11, 12],
  'ciboulette': [3, 4, 5, 6, 7, 8, 9, 10],
  'citron': [1, 2, 3, 4, 6, 10, 11, 12],
  'citrons': [1, 2, 3, 4, 6, 10, 11, 12],
  'citrouille': [9, 10, 11, 12],
  'citrouilles': [9, 10, 11, 12],
  'clementine': [1, 2, 11, 12],
  'clementines': [1, 2, 11, 12],
  'clémentine': [1, 2, 11, 12],
  'clémentines': [1, 2, 11, 12],
  'coing': [9, 10, 11],
  'coings': [9, 10, 11],
  'concombre': [4, 5, 6, 7, 8, 9, 10],
  'concombres': [4, 5, 6, 7, 8, 9, 10],
  'coriandre': [5, 6, 7, 8, 9, 10],
  'courge': [1, 8, 9, 10, 11, 12],
  'courges': [1, 8, 9, 10, 11, 12],
  'courgette': [5, 6, 7, 8, 9, 10],
  'courgettes': [5, 6, 7, 8, 9, 10],
  'cresson': [3, 4, 5, 9, 10, 11],
  'crosne': [1, 2, 3, 11, 12],
  'crosnes': [1, 2, 3, 11, 12],
  'céleri-branche': [1, 7, 8, 9, 10, 11, 12],
  'céleri-rave': [1, 2, 3, 10, 11, 12],
  'echalote': [10, 11, 12],
  'echalotes': [10, 11, 12],
  'endive': [1, 2, 3, 4, 10, 11, 12],
  'endives': [1, 2, 3, 4, 10, 11, 12],
  'epinard': [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  'epinards': [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  'estragon': [5, 6, 7, 8, 9, 10],
  'fenouil': [6, 7, 8, 9, 10, 11],
  'fenouils': [6, 7, 8, 9, 10, 11],
  'figue': [7, 8, 9, 10],
  'figues': [7, 8, 9, 10],
  'fraise': [5, 6, 7, 8],
  'fraises': [5, 6, 7, 8],
  'framboise': [6, 7, 8, 10],
  'framboises': [6, 7, 8, 10],
  'frisee': [1, 2, 3, 4, 8, 9, 10, 11, 12],
  'frisée': [1, 2, 3, 4, 8, 9, 10, 11, 12],
  'groseille': [6, 7, 8],
  'groseilles': [6, 7, 8],
  'haricot vert': [6, 7, 8, 9, 10],
  'haricots verts': [6, 7, 8, 9, 10],
  'kaki': [1, 10, 11, 12],
  'kakis': [1, 10, 11, 12],
  'kale': [1, 2, 9, 10, 11, 12],
  'kiwi': [1, 2, 3, 11, 12],
  'kiwis': [1, 2, 3, 11, 12],
  'laitue': [4, 5, 6, 7, 8, 9, 10],
  'laitues': [4, 5, 6, 7, 8, 9, 10],
  'laurier': [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  'mache': [1, 2, 11, 12],
  'mandarine': [1, 2, 11, 12],
  'mandarines': [1, 2, 11, 12],
  'melon': [6, 7, 8, 9],
  'melons': [6, 7, 8, 9],
  'menthe': [5, 6, 7, 8, 9, 10],
  'mirabelle': [8, 9],
  'mirabelles': [8, 9],
  'mure': [8, 9],
  'mures': [8, 9],
  'myrtille': [7, 8, 9, 10],
  'myrtilles': [7, 8, 9, 10],
  'mâche': [1, 2, 11, 12],
  'mûre': [8, 9],
  'mûres': [8, 9],
  'navet': [1, 2, 3, 4, 5, 6, 10, 11, 12],
  'navets': [1, 2, 3, 4, 5, 6, 10, 11, 12],
  'nectarine': [7, 8],
  'nectarines': [7, 8],
  'noisette': [8, 9, 10],
  'noisettes': [8, 9, 10],
  'noix': [9, 10],
  'oignon': [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  'oignons': [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  'orange': [1, 2, 3, 11, 12],
  'oranges': [1, 2, 3, 11, 12],
  'oseille': [3, 4, 5, 6, 7, 8, 9],
  'pamplemousse': [1, 2, 3, 4, 5, 6],
  'pamplemousses': [1, 2, 3, 4, 5, 6],
  'panais': [1, 2, 3, 9, 10, 11, 12],
  'pasteque': [6, 7, 8, 9],
  'pasteques': [6, 7, 8, 9],
  'pastèque': [6, 7, 8, 9],
  'pastèques': [6, 7, 8, 9],
  'patate douce': [9, 10],
  'patates douces': [9, 10],
  'peche': [6, 7, 8, 9],
  'peches': [6, 7, 8, 9],
  'persil': [3, 4, 5, 6, 7, 8, 9, 10, 11],
  'persil plat': [3, 4, 5, 6, 7, 8, 9, 10, 11],
  'petit pois': [4, 5, 6, 7],
  'petits pois': [4, 5, 6, 7],
  'physalis': [1, 2, 10, 11, 12],
  'poire': [1, 2, 3, 4, 7, 8, 9, 10, 11, 12],
  'poireau': [1, 2, 3, 4, 9, 10, 11, 12],
  'poireaux': [1, 2, 3, 4, 9, 10, 11, 12],
  'poires': [1, 2, 3, 4, 7, 8, 9, 10, 11, 12],
  'pois': [4, 5, 6, 7],
  'poivron': [6, 7, 8, 9],
  'poivrons': [6, 7, 8, 9],
  'pomelo': [1, 2, 3, 4, 5, 6],
  'pomelos': [1, 2, 3, 4, 5, 6],
  'pomme': [1, 2, 3, 4, 6, 8, 9, 10, 11, 12],
  'pomme de terre': [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  'pomme de terre de conservation': [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  'pomme de terre primeur': [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  'pommes': [1, 2, 3, 4, 6, 8, 9, 10, 11, 12],
  'pommes de terre': [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  'potiron': [9, 10, 11, 12],
  'potirons': [9, 10, 11, 12],
  'prune': [6, 7, 8, 9],
  'pruneau': [8, 9],
  'pruneaux': [8, 9],
  'prunes': [6, 7, 8, 9],
  'pêche': [6, 7, 8, 9],
  'pêches': [6, 7, 8, 9],
  'radis': [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  'raisin': [8, 9, 10],
  'raisins': [8, 9, 10],
  'rhubarbe': [5, 6, 7],
  'romarin': [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  'roquette': [5, 6, 7, 8, 9],
  'rutabaga': [10, 11, 12],
  'rutabagas': [10, 11, 12],
  'salade': [4, 5, 6, 7, 8, 9, 10],
  'salade frisee': [1, 2, 3, 4, 8, 9, 10, 11, 12],
  'salade frisée': [1, 2, 3, 4, 8, 9, 10, 11, 12],
  'salade verte': [4, 5, 6, 7, 8, 9, 10],
  'salsifi': [1, 2, 3, 10, 11, 12],
  'salsifis': [1, 2, 3, 10, 11, 12],
  'sauge': [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  'thym': [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  'tomate': [5, 6, 7, 8, 9, 10],
  'tomate cerise': [5, 6, 7, 8, 9, 10],
  'tomates': [5, 6, 7, 8, 9, 10],
  'tomates cerises': [5, 6, 7, 8, 9, 10],
  'topinambour': [1, 2, 3, 10, 11, 12],
  'topinambours': [1, 2, 3, 10, 11, 12],
  'échalote': [10, 11, 12],
  'échalotes': [10, 11, 12],
  'épinard': [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  'épinards': [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
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


const DIET_TAGS = [
  { id: 'vegan', label: 'Vegan', emoji: '🌱', color: '#4ade80' },
  { id: 'vegetarien', label: 'Végétarien', emoji: '🥗', color: '#86efac' },
  { id: 'sans-gluten', label: 'Sans gluten', emoji: '🌾', color: '#fbbf24' },
  { id: 'sans-lactose', label: 'Sans lactose', emoji: '🥛', color: '#7dd3fc' },
  { id: 'low-fodmap', label: 'Low FODMAP', emoji: '💚', color: '#22c55e' },
  { id: 'high-fodmap', label: 'High FODMAP', emoji: '⚠️', color: '#f97316' },
  { id: 'sans-sucre', label: 'Sans sucre', emoji: '🚫', color: '#f87171' },
  { id: 'keto', label: 'Keto', emoji: '🥑', color: '#65a30d' },
  { id: 'halal', label: 'Halal', emoji: '🕌', color: '#10b981' },
  { id: 'casher', label: 'Casher', emoji: '✡️', color: '#3b82f6' },
];

// ============================================
// BASE FODMAP : classification des aliments
// ============================================
// Source : régime FODMAP, recommandations utilisateur.
// Les noms sont normalisés (sans accents, minuscule) pour matcher facilement les ingrédients.
// Quand un aliment apparaît à la fois en HIGH et LOW selon la quantité, on liste les deux
// (le matching utilise toujours HIGH en priorité pour rester sécuritaire).

const FODMAP_HIGH = new Set([
  // Légumineuses
  'pois chiches', 'pois chiche', 'haricots rouges', 'haricot rouge', 'haricots pinto', 'haricot pinto',
  'haricots de lima', 'haricot de lima', 'pois cassés', 'pois casses', 'lentille', 'lentilles',
  'flageolet', 'flageolets', 'feve de soja', 'fèves de soja', 'soja',
  // Légumes high FODMAP
  'asperge', 'asperges', 'betterave', 'betteraves', 'pois mange-tout', 'chou de bruxelles', 'choux de bruxelles',
  'courge butternut', 'courges butternut', 'butternut', 'mais', 'maïs', 'petit pois', 'petits pois',
  'artichaut', 'artichauts', 'brocoli', 'brocolis', 'chou', 'choux', 'fenouil',
  'ail', 'poireau', 'poireaux', 'gombo', 'oignon', 'oignons', 'echalote', 'échalote', 'echalotes', 'échalotes',
  'topinambour', 'topinambours', 'champignon', 'champignons', 'chou-fleur', 'choux-fleurs',
  'fond d\'artichaut', 'coeur d\'artichaut', 'tomates sechees', 'tomates séchées', 'tomate sechee', 'tomate séchée',
  // Fruits high FODMAP
  'pomme', 'pommes', 'melon d\'eau', 'pasteque', 'pastèque', 'kaki', 'kakis', 'nectarine', 'nectarines',
  'datte', 'dattes', 'figue', 'figues', 'pamplemousse', 'pamplemousses', 'abricot', 'abricots',
  'cerise', 'cerises', 'poire', 'poires', 'mangue', 'mangues', 'mure', 'mûre', 'mures', 'mûres',
  'litchi', 'litchis', 'peche', 'pêche', 'peches', 'pêches', 'prune', 'prunes', 'pruneau', 'pruneaux',
  'cassis', 'avocat', 'avocats', 'raisin sec', 'raisins secs', 'fruits secs', 'fruit sec',
  // Céréales
  'ble', 'blé', 'seigle', 'pain', 'couscous', 'boulghour', 'boulgour', 'semoule de ble', 'semoule de blé',
  'biscuit', 'biscuits', 'craquelin', 'craquelins',
  // Produits laitiers (lactose)
  'lait', 'lait de vache', 'lait de chevre', 'lait de chèvre', 'lait de brebis',
  'creme glacee', 'crème glacée', 'glace', 'yaourt', 'yaourts', 'poudre de lait',
  'cottage', 'mascarpone', 'ricotta', 'faisselle',
  // Sucres et édulcorants
  'miel', 'sirop de mais', 'sirop de maïs', 'fructose', 'sorbitol', 'mannitol', 'xylitol',
  'maltitol', 'isomalt', 'edulcorant', 'édulcorant',
  // Boissons
  'jus de fruits', 'jus de pomme', 'jus de poire', 'vin liquoreux', 'porto', 'muscat',
  // Noix
  'noix de cajou', 'cajou', 'pistache', 'pistaches', 'amande', 'amandes', 'noisette', 'noisettes',
  'houmous',
  // Autres
  'chicoree', 'chicorée', 'pissenlit', 'inuline'
]);

const FODMAP_LOW = new Set([
  // Fruits low FODMAP
  'banane', 'bananes', 'canneberge', 'canneberges', 'durian', 'melon', 'kiwi', 'kiwis',
  'citron', 'citrons', 'lime', 'limes', 'citron vert', 'mandarine', 'mandarines',
  'orange', 'oranges', 'fraise', 'fraises', 'framboise', 'framboises', 'myrtille', 'myrtilles',
  'kumquat', 'kumquats', 'fruit de la passion', 'papaye', 'papayes', 'ananas', 'rhubarbe',
  'clementine', 'clémentine', 'clementines', 'clémentines',
  // Légumes low FODMAP
  'pousses de bambou', 'bambou', 'coeur de palmier', 'coeurs de palmier', 'palmier',
  'pousse de haricot', 'pousses de haricot', 'carotte', 'carottes', 'celeri rave', 'céleri rave',
  'celeri-rave', 'céleri-rave', 'endive', 'endives', 'chou kale', 'kale', 'chou-rave', 'chou rave',
  'chou chinois', 'gingembre', 'haricot vert', 'haricots verts', 'salade', 'salade verte', 'laitue',
  'cresson', 'olive', 'olives', 'panais', 'potiron', 'patisson', 'pâtisson',
  'courge spaghetti', 'epinard', 'epinards', 'épinard', 'épinards', 'radis', 'blette', 'blettes',
  'navet', 'navets', 'tomate', 'tomates', 'tomate cerise', 'tomates cerises',
  'courgette', 'courgettes', 'aubergine', 'aubergines', 'concombre', 'concombres', 'roquette',
  // Herbes low FODMAP
  'basilic', 'chili', 'coriandre', 'thym', 'menthe', 'origan', 'persil', 'romarin', 'sauge', 'laurier',
  'ciboulette', 'estragon', 'aneth',
  // Céréales / Féculents low FODMAP
  'pain au levain', 'levain', 'flocon d\'avoine', 'flocons d\'avoine', 'avoine',
  'farine de sarrasin', 'farine de millet', 'farine de quinoa', 'farine de sorgho', 'farine de tapioca',
  'sarrasin', 'millet', 'quinoa', 'sorgho', 'tapioca', 'pates sans gluten', 'pâtes sans gluten',
  'pates de riz', 'pâtes de riz', 'pates de mais', 'pâtes de maïs', 'pates de quinoa', 'pâtes de quinoa',
  'pomme de terre', 'pommes de terre', 'patate douce', 'patates douces', 'riz', 'riz basmati', 'riz complet',
  'polenta',
  // Produits laitiers low FODMAP
  'lait sans lactose', 'lait de riz', 'lait d\'amande', 'lait d\'avoine', 'lait de coco',
  'creme de coco', 'crème de coco', 'beurre', 'creme fraiche', 'crème fraîche',
  'cheddar', 'gouda', 'parmesan', 'feta', 'fromage de chevre', 'fromage de chèvre', 'chevre', 'chèvre',
  'mozzarella', 'brie', 'camembert', 'yaourt sans lactose', 'sorbet',
  // Protéines (toujours low FODMAP)
  'viande', 'viandes', 'boeuf', 'porc', 'agneau', 'veau', 'poulet', 'dinde', 'canard',
  'poisson', 'saumon', 'thon', 'cabillaud', 'sardine', 'sardines', 'oeuf', 'oeufs', 'œuf', 'œufs',
  'tofu', 'tofu nature',
  // Condiments / Huiles
  'moutarde', 'huile', 'huile d\'olive', 'huile de tournesol', 'huile de colza',
  'vinaigre', 'vinaigre de vin', 'vinaigre balsamique', 'vinaigre de riz',
  'capres', 'câpres', 'cornichon', 'cornichons',
  // Sucres low FODMAP (modéré)
  'sucre', 'sucre blanc', 'sucre roux', 'sucre de canne', 'sirop d\'erable', 'sirop d\'érable',
  'chocolat noir', 'cacao',
  // Noix low FODMAP
  'cacahuete', 'cacahuète', 'cacahuetes', 'cacahuètes', 'beurre de cacahuete', 'beurre de cacahuète',
  'noix de pecan', 'noix de pécan', 'pecan', 'pécan',
]);

// Stop words à ignorer dans le nom d'ingrédient
const FODMAP_STOP_WORDS = new Set([
  'de', 'la', 'le', 'les', 'du', 'des', 'un', 'une', 'à', 'au', 'aux',
  'et', 'ou', 'avec', 'sans', 'en', 'd\'', 'l\'', 'pour'
]);

// Normalise un nom d'ingrédient pour le matching FODMAP
function normalizeFodmapName(name) {
  return (name || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // sans accents
    .replace(/\([^)]*\)/g, ' ') // sans parenthèses
    .replace(/[^a-z'\s-]/g, ' ') // garde lettres, espaces, ', -
    .replace(/\s+/g, ' ')
    .trim();
}

// Détermine le statut FODMAP d'un ingrédient unique
// Retourne 'high', 'low', ou 'unknown'
function classifyIngredientFodmap(ingredientName) {
  const normalized = normalizeFodmapName(ingredientName);
  if (!normalized) return 'unknown';

  // Match exact d'abord (plus précis : "tomate sechee" plutôt que "tomate")
  if (FODMAP_HIGH.has(normalized)) return 'high';
  if (FODMAP_LOW.has(normalized)) return 'low';

  // Match par mots : on prend le statut le plus "sécuritaire" (high prime sur low)
  // Ex: "farine de blé" → "blé" → high
  // Ex: "huile d'olive" → "huile" → low
  const words = normalized.split(/\s+/).filter(w => w.length > 2 && !FODMAP_STOP_WORDS.has(w));

  let foundLow = false;
  // Essayer des combinaisons de 2 mots adjacents d'abord (plus précis)
  for (let i = 0; i < words.length - 1; i++) {
    const bigram = words[i] + ' ' + words[i + 1];
    if (FODMAP_HIGH.has(bigram)) return 'high';
    if (FODMAP_LOW.has(bigram)) foundLow = true;
  }

  // Puis mots individuels
  for (const w of words) {
    if (FODMAP_HIGH.has(w)) return 'high';
    if (FODMAP_LOW.has(w)) foundLow = true;
  }

  return foundLow ? 'low' : 'unknown';
}

// Calcule les tags FODMAP suggérés pour une recette
// Règles :
// - Si AU MOINS UN ingrédient est 'high' → high-fodmap
// - Sinon si TOUS les ingrédients connus sont 'low' (au moins 50% connus) → low-fodmap
// - Sinon : rien (incertain)
function calculateFodmapTags(ingredients) {
  if (!ingredients || ingredients.length === 0) return [];
  let highCount = 0;
  let lowCount = 0;
  let unknownCount = 0;
  const highIngredients = [];

  for (const ing of ingredients) {
    const status = classifyIngredientFodmap(ing.name);
    if (status === 'high') {
      highCount++;
      highIngredients.push(ing.name);
    } else if (status === 'low') lowCount++;
    else unknownCount++;
  }

  if (highCount > 0) return ['high-fodmap'];
  // Pour low : il faut qu'au moins la moitié des ingrédients soient identifiés en low
  // (pour éviter de tagger une recette de 10 ingrédients dont 8 inconnus)
  const knownRatio = (highCount + lowCount) / ingredients.length;
  if (lowCount > 0 && knownRatio >= 0.5) return ['low-fodmap'];
  return [];
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
