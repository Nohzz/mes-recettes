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
  'cubes de glace',
  'glace pilée',
  'fleur de sel',
  'gros sel',
  'sel fin',
  'poivre noir',
  'poivre blanc',
  'poivre moulu',
  'poivre du moulin',
  'eau froide',
  'eau chaude',
  'eau tiède',
  'eau bouillante',
  'eau du robinet',
  'eau gazeuse',
  'eau plate'
];

// Retire ligatures (œ, æ) puis accents et met en minuscules.
// Attention : `normalize('NFD')` ne décompose pas œ/æ, il faut les remplacer avant.
function _stripAccentsAndLigatures(s) {
  return String(s || '')
    .replace(/œ/g, 'oe').replace(/Œ/g, 'oe')
    .replace(/æ/g, 'ae').replace(/Æ/g, 'ae')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Mots-parasites retirés lors de la fusion des ingrédients dans la liste de courses.
// On garde délibérément :
//   - les couleurs (rouge, jaune, vert, noir) : discriminantes de variété
//   - les tailles (gros, petit) : « petits pois » ≠ « pois », « gros sel » ≠ « sel »
//   - les préparations d'achat (haché, râpé, entier) : différentes en rayon
//   - les prépositions (de, du, à, la) : « pomme de terre », « cœur de bœuf »
//   - « nouveau/nouvelle » : « pomme de terre nouvelle » est une variété distincte
// On retire :
//   - qualités génériques (bio, frais, mûr)
//   - états à la maison (cru, cuit, doux)
//   - préparations faites à la maison (coupé, tranché, épluché, pelé, émincé, écrasé, mixé…)
//   - formes de découpe (cubes, morceaux, rondelles, dés, lamelles, bâtonnets, julienne)
//   - « en » quand il précède ces découpes
// Toutes les formes flexionnelles sont listées sans accents (comparaison après _stripAccentsAndLigatures).
const INGREDIENT_STOPWORDS = new Set([
  // Qualité/origine
  'bio', 'frais', 'fraiche', 'fraiches',
  // Maturité
  'mur', 'mure', 'murs', 'mures',
  // État
  'cru', 'crue', 'crus', 'crues',
  'cuit', 'cuite', 'cuits', 'cuites',
  // Douceur
  'doux', 'douce', 'douces',
  // Préparations réalisées à la maison
  'epluche', 'epluchee', 'epluches', 'epluchees',
  'coupe', 'coupee', 'coupes', 'coupees',
  'tranche', 'tranchee', 'tranches', 'tranchees',
  'pele', 'pelee', 'peles', 'pelees',
  'emince', 'emincee', 'eminces', 'emincees',
  'ecrase', 'ecrasee', 'ecrases', 'ecrasees',
  'mixe', 'mixee', 'mixes', 'mixees',
  'ecale', 'ecalee', 'ecales', 'ecalees',
  'lave', 'lavee', 'laves', 'lavees',
  'egoutte', 'egouttee', 'egouttes', 'egouttees',
  'blanchie', 'blanchi', 'blanchis', 'blanchies',
  // Formes de découpe
  'cube', 'cubes', 'morceau', 'morceaux', 'rondelle', 'rondelles',
  'des', 'lamelle', 'lamelles', 'batonnet', 'batonnets', 'julienne',
  // Préposition qui les introduit
  'en',
]);

// Mots invariables au pluriel ou déjà singuliers en -s / -x : le stemming ne doit pas les tronquer.
const INGREDIENT_INVARIANT = new Set([
  // Noms invariants
  'riz', 'pois', 'gaz', 'nez', 'os', 'ananas', 'anis', 'jus', 'temps', 'corps',
  // Adjectifs français invariables (« gros sel », « sucre roux », « pain gras »…)
  'gros', 'gras', 'bas', 'epais', 'roux', 'faux', 'vieux', 'jaloux',
]);

// Singularise un mot français (heuristique simple).
function _singularizeToken(tok) {
  if (!tok || tok.length < 4) return tok;
  if (INGREDIENT_INVARIANT.has(tok)) return tok;
  // "eaux" → "eau" (chapeaux → chapeau)
  if (tok.endsWith('eaux')) return tok.slice(0, -1);
  // "aux" → "al" (journaux → journal, chevaux → cheval)
  if (tok.endsWith('aux') && tok.length > 4) return tok.slice(0, -3) + 'al';
  if (tok.endsWith('s') || tok.endsWith('x')) return tok.slice(0, -1);
  return tok;
}

// Normalise un nom d'ingrédient pour les comparaisons et la fusion dans la liste de courses.
// Le résultat est une clé stable : deux noms qui désignent le même produit produisent
// la même chaîne. Voir INGREDIENT_STOPWORDS pour la liste des attributs filtrés.
// Ex : "Tomates cerises bio" → "tomate cerise" ; "Œufs frais" → "oeuf" ;
//      "pommes de terre nouvelles" → "pomme de terre nouvelle".
function normalizeIngredientName(name) {
  if (!name) return '';
  let s = _stripAccentsAndLigatures(name);
  // Retire les parenthèses (« tomate (mûre) ») et tout ce qui suit une virgule (« tomate, épluchée »)
  s = s.replace(/\([^)]*\)/g, ' ').split(',')[0];
  // Neutralise apostrophes et ponctuation restante
  s = s.replace(/['’]/g, ' ').replace(/[^a-z0-9\s]/g, ' ');
  const tokens = s.split(/\s+/).filter(Boolean);
  const kept = tokens
    .filter(t => !INGREDIENT_STOPWORDS.has(t))
    .map(_singularizeToken)
    .filter(Boolean);
  return kept.join(' ').trim();
}

// Vérifie si un ingrédient doit être exclu de la liste de courses (sel, poivre, eau…)
function isShoppingExcluded(name) {
  const normalized = normalizeIngredientName(name);
  if (!normalized) return false;
  for (const excluded of SHOPPING_EXCLUDE) {
    const excludedNorm = normalizeIngredientName(excluded);
    if (!excludedNorm) continue;
    if (normalized === excludedNorm) return true;
    // Variantes du type « un peu de sel », « une pincée de sel »
    if (normalized.endsWith(' ' + excludedNorm) && normalized.split(' ').length <= 5) {
      const before = normalized.slice(0, normalized.length - excludedNorm.length).trim();
      if (/^(un peu d[e']?|une pincee d[e']?|du|de la|de l)$/i.test(before)) {
        return true;
      }
    }
  }
  return false;
}

// ============================================
// CONVERSION D'UNITÉS
// ============================================

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

// ============================================
// LISTE DE COURSES — QUANTITÉS, UNITÉS, PRODUITS
// ============================================
// But : UNE ligne par produit acheté, quelles que soient les unités des recettes
// (« 2 citrons jaunes » + « 25 ml de jus de citron » → « Citrons jaunes ≈ 3 »).
// Ce bloc est pur (aucun accès à state) : les alias appris via « Nettoyer avec l'IA »
// sont appliqués par-dessus dans app.js (getShoppingProduct).

// Table de correspondance sans prototype : une clé comme « constructor » n'y trouve rien
function _shoppingTable(obj) {
  return Object.assign(Object.create(null), obj);
}

function _shoppingOwn(obj, key) {
  return obj && Object.prototype.hasOwnProperty.call(obj, key) ? obj[key] : undefined;
}

// --- Quantités ---

const _SHOPPING_FRACTIONS = _shoppingTable({ '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125 });

// Convertit une quantité saisie (nombre, « 1,5 », « ½ », « 1/2 », « 1 1/2 », « 2-3 ») en nombre.
// Les fourchettes prennent la borne haute (mieux vaut en acheter un peu trop). null si illisible ou ≤ 0.
function parseShoppingAmount(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return isFinite(value) && value > 0 ? value : null;
  const s = String(value).trim().replace(/,/g, '.');
  let n = null;
  let m;
  if ((m = s.match(/^(\d+(?:\.\d+)?)?\s*([½¼¾⅓⅔⅛])$/))) {
    n = (m[1] ? Number(m[1]) : 0) + _SHOPPING_FRACTIONS[m[2]];
  } else if ((m = s.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/))) {
    n = Number(m[3]) ? Number(m[1]) + Number(m[2]) / Number(m[3]) : null;
  } else if ((m = s.match(/^(\d+)\s*\/\s*(\d+)$/))) {
    n = Number(m[2]) ? Number(m[1]) / Number(m[2]) : null;
  } else if ((m = s.match(/^(\d+(?:\.\d+)?)\s*(?:-|–|à)\s*(\d+(?:\.\d+)?)$/))) {
    n = Math.max(Number(m[1]), Number(m[2]));
  } else if (/^\d*\.?\d+$/.test(s)) {
    n = Number(s);
  }
  return n != null && isFinite(n) && n > 0 ? n : null;
}

// --- Unités ---

// Masses → g, volumes → ml (clés sans accent, « (s) » retiré)
const SHOPPING_MASS_UNITS = _shoppingTable({
  g: 1, gr: 1, grs: 1, gramme: 1, grammes: 1, mg: 0.001,
  kg: 1000, kgs: 1000, kilo: 1000, kilos: 1000, kilogramme: 1000, kilogrammes: 1000,
});
const SHOPPING_VOLUME_UNITS = _shoppingTable({
  ml: 1, millilitre: 1, millilitres: 1, cl: 10, centilitre: 10, centilitres: 10,
  dl: 100, decilitre: 100, decilitres: 100, l: 1000, litre: 1000, litres: 1000, lt: 1000,
});
// Unités « à la pièce » (y compris les adjectifs de taille parfois saisis comme unité : « 2 gros »)
const SHOPPING_COUNT_UNITS = new Set([
  '', 'piece', 'pieces', 'pc', 'pcs', 'unite', 'unites', 'u', 'entier', 'entiere', 'entiers', 'entieres',
  'moyen', 'moyens', 'moyenne', 'moyennes', 'gros', 'grosse', 'grosses', 'petit', 'petits', 'petite', 'petites',
  'grand', 'grands', 'grande', 'grandes',
]);
// Cuillères et mesures ménagères : des volumes (en ml) qu'on continue d'afficher comme dans la
// recette tant qu'aucun ml ne s'y ajoute (« c. à s. », « cuillerées à café », « pot de yaourt »…)
const _SHOPPING_SPOON_WORDS = new Set(['c', 'cuil', 'cuill', 'cuiller', 'cuillers', 'cuillere', 'cuilleres', 'cuilleree', 'cuillerees']);
const _SHOPPING_SPOON_KINDS = _shoppingTable({ s: 'cas', soupe: 'cas', c: 'cac', cafe: 'cac', the: 'cac', d: 'cad', dessert: 'cad' });
const SHOPPING_SPOONS = _shoppingTable({
  cas: { factor: 15, label: 'c. à soupe' },
  cac: { factor: 5, label: 'c. à café' },
  cad: { factor: 10, label: 'c. à dessert' },
  pdy: { factor: 125, label: 'pot de yaourt', plural: 'pots de yaourt' },
});
const _SHOPPING_SPOON_QUALIFIERS = /\b(rase|rases|bombee|bombees|pleine|pleines|genereuse|genereuses|bien|remplie|remplies)\b/g;
// Qualificatifs d'une unité en plusieurs mots (« tranches fines », « grosse gousse »)
const _SHOPPING_UNIT_QUALIFIERS = /\b(fine|fines|fin|fins|epaisse|epaisses|epais|grosse|grosses|gros|petite|petites|petit|petits|grande|grandes|grand|grands|belle|belles|beau|beaux|bonne|bonnes|bon|bons|moyenne|moyennes|moyen|moyens|bien)\b/g;

function _shoppingSpoonUnit(id) {
  const s = SHOPPING_SPOONS[id];
  return { kind: 'volume', id, factor: s.factor, label: s.label, plural: s.plural };
}

// Unités nommées connues : identifiant (singulier, sans accent) → libellé affiché
const SHOPPING_NAMED_UNITS = _shoppingTable({
  gousse: { label: 'gousse' }, tete: { label: 'tête' }, brin: { label: 'brin' }, branche: { label: 'branche' },
  feuille: { label: 'feuille' }, botte: { label: 'botte' }, bouquet: { label: 'bouquet' }, tige: { label: 'tige' },
  pincee: { label: 'pincée' }, tranche: { label: 'tranche' }, morceau: { label: 'morceau', plural: 'morceaux' },
  rondelle: { label: 'rondelle' }, lamelle: { label: 'lamelle' }, cube: { label: 'cube' },
  sachet: { label: 'sachet' }, boite: { label: 'boîte' }, pot: { label: 'pot' }, brique: { label: 'brique' },
  paquet: { label: 'paquet' }, barquette: { label: 'barquette' }, bocal: { label: 'bocal', plural: 'bocaux' },
  carre: { label: 'carré' }, poignee: { label: 'poignée' }, trait: { label: 'trait' }, pointe: { label: 'pointe' },
  boule: { label: 'boule' }, quartier: { label: 'quartier' }, zeste: { label: 'zeste' },
  jus: { label: 'jus', plural: 'jus' }, jaune: { label: 'jaune' }, blanc: { label: 'blanc' },
  noix: { label: 'noix', plural: 'noix' }, filet: { label: 'filet' }, cm: { label: 'cm', plural: 'cm' },
  goutte: { label: 'goutte' }, plaquette: { label: 'plaquette' }, tablette: { label: 'tablette' },
  verre: { label: 'verre' }, tasse: { label: 'tasse' }, bol: { label: 'bol' }, louche: { label: 'louche' },
  dose: { label: 'dose' }, bouteille: { label: 'bouteille' }, rouleau: { label: 'rouleau', plural: 'rouleaux' },
  cuillere: { label: 'cuillère' }, nuage: { label: 'nuage' }, soupcon: { label: 'soupçon' }, larme: { label: 'larme' },
});

// Unités qui s'achètent entières : un total fractionnaire s'arrondit à l'unité supérieure
const SHOPPING_WHOLE_UNITS = new Set([
  'piece', 'gousse', 'tete', 'botte', 'bouquet', 'sachet', 'boite', 'pot', 'brique', 'paquet', 'barquette', 'bocal',
  'rouleau', 'tablette', 'plaquette', 'boule', 'cube', 'tranche', 'feuille', 'branche', 'brin', 'morceau', 'carre',
  'bouteille',
]);

function _singularizeShoppingUnitWord(w) {
  if (!w || SHOPPING_NAMED_UNITS[w]) return w;
  if (w === 'morceaux') return 'morceau';
  if (w === 'bocaux') return 'bocal';
  if (w === 'rouleaux') return 'rouleau';
  if (w.length > 2 && /[sx]$/.test(w)) return w.slice(0, -1);
  return w;
}

// Analyse une unité libre. Renvoie { kind, id, factor, label } :
//   kind 'mass' (factor → g), 'volume' (factor → ml), 'count' (pièces) ou 'named' (gousse, botte…)
function parseShoppingUnit(unit) {
  // « boîte(s) (400 g) » → boîte
  const raw = String(unit == null ? '' : unit)
    .replace(/\((?:s|x|es)\)/gi, '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  let n = _stripAccentsAndLigatures(raw).replace(/['’.]/g, ' ').replace(/\s+/g, ' ').trim();
  if (/^pots? de yaourt$/.test(n)) return _shoppingSpoonUnit('pdy');
  // « gousse d'ail » → gousse ; « tranches fines », « grosse gousse » → tranche, gousse
  n = n.replace(/ (?:de|d|du|des) .*$/, '');
  if (n.includes(' ')) {
    const bare = n.replace(_SHOPPING_UNIT_QUALIFIERS, ' ').replace(/\s+/g, ' ').trim();
    if (bare) n = bare;
  }
  if (SHOPPING_COUNT_UNITS.has(n)) return { kind: 'count', id: 'piece', factor: 1, label: '' };
  if (SHOPPING_MASS_UNITS[n] != null) return { kind: 'mass', id: 'g', factor: SHOPPING_MASS_UNITS[n], label: 'g' };
  if (SHOPPING_VOLUME_UNITS[n] != null) return { kind: 'volume', id: 'ml', factor: SHOPPING_VOLUME_UNITS[n], label: 'ml' };
  // « <cuillère> [à] <soupe|café|dessert> », qualificatifs ignorés
  const words = n.replace(_SHOPPING_SPOON_QUALIFIERS, ' ').split(' ').filter(Boolean);
  if (words.length && _SHOPPING_SPOON_WORDS.has(words[0])) {
    const rest = words.slice(1).filter(w => w !== 'a');
    if (rest.length === 1 && _SHOPPING_SPOON_KINDS[rest[0]]) return _shoppingSpoonUnit(_SHOPPING_SPOON_KINDS[rest[0]]);
  }
  // Abréviations collées : « cas », « cs », « càc », « cc », « tbsp », « tsp »
  const squashed = words.join('');
  if (/^(ca?s|tbsp?)$/.test(squashed)) return _shoppingSpoonUnit('cas');
  if (/^(ca?c|tsp)$/.test(squashed)) return _shoppingSpoonUnit('cac');
  const id = n.split(' ').map(_singularizeShoppingUnitWord).join(' ');
  const known = SHOPPING_NAMED_UNITS[id];
  const label = known ? known.label : raw.toLowerCase().replace(/\s+(?:de|du|des|d['’])\s*.*$/, '');
  return { kind: 'named', id, factor: 1, label: label || raw.toLowerCase() };
}

// Accorde un libellé d'unité nommée (en français, pluriel à partir de 2)
function pluralizeShoppingUnit(label, amount) {
  if (!label || !(amount >= 2)) return label || '';
  const known = SHOPPING_NAMED_UNITS[_singularizeShoppingUnitWord(_stripAccentsAndLigatures(label))];
  if (known && known.label === label) return known.plural || known.label + 's';
  // Plusieurs mots : on accorde le premier (« verres à moutarde ») ; abréviations invariables
  const m = label.match(/^([^\s.]+)(\s.*)$/);
  if (m) return (/[sxz]$/i.test(m[1]) ? m[1] : m[1] + 's') + m[2];
  if (/[\s.]/.test(label) || /[sxz]$/i.test(label)) return label;
  return label + 's';
}

// Partie d'un produit restée en masse ou en volume : « 1 l de jus », « 100 g de blancs »
const SHOPPING_PART_LABELS = _shoppingTable({ jus: 'de jus', zeste: 'de zeste', jaune: 'de jaunes', blanc: 'de blancs' });

// --- Identité produit ---

// Mots de tête sans valeur pour identifier le produit (articles, quantificateurs vagues)
const SHOPPING_LEADING_WORDS = new Set(['de', 'd', 'du', 'des', 'la', 'le', 'les', 'l', 'un', 'une', 'quelques', 'peu', 'environ']);
// Prépositions qui relient un préfixe de mesure au produit (« gousses d'ail », « brins de thym »)
const _SHOPPING_PREFIX_PREPS = new Set(['de', 'd', 'du', 'des']);
// Adjectifs de taille ou d'intensité (« un petit bouquet de », « oignons moyens », « bien mûres »)
const SHOPPING_SIZE_WORDS = new Set([
  'gros', 'grosse', 'grosses', 'petit', 'petite', 'petits', 'petites', 'grand', 'grande', 'grands', 'grandes',
  'moyen', 'moyenne', 'moyens', 'moyennes', 'beau', 'belle', 'beaux', 'belles', 'bon', 'bonne', 'bons', 'bonnes',
  'bien', 'tres', 'joli', 'jolie', 'jolis', 'jolies',
]);

// Préfixes de mesure retirés du nom : « gousses d'ail » → produit « ail » + unité « gousse ».
// forms : formes sans accent (plusieurs mots possibles) ; unit : unité retenue si l'ingrédient n'en a pas ;
// part : le préfixe désigne une PARTIE du produit (jus, zeste, jaune, blanc) ;
// only : ne s'applique que devant ces produits (« jus de pomme » reste un produit à part) ;
// except : produits devant lesquels il ne s'applique pas (« feuilles de riz », « carré d'agneau »).
const SHOPPING_MEASURE_PREFIXES = [
  { forms: ['gousse', 'gousses'], unit: 'gousse' },
  { forms: ['tete', 'tetes'], unit: 'tête', except: /^veau\b/ },
  { forms: ['brin', 'brins'], unit: 'brin' },
  { forms: ['branche', 'branches'], unit: 'branche' },
  { forms: ['feuille', 'feuilles'], unit: 'feuille', except: /^(riz|brick|filo|phyllo)\b/ },
  { forms: ['botte', 'bottes'], unit: 'botte' },
  { forms: ['bouquet', 'bouquets'], unit: 'bouquet' },
  { forms: ['tige', 'tiges'], unit: 'tige' },
  { forms: ['pincee', 'pincees'], unit: 'pincée' },
  { forms: ['pointe de couteau', 'pointe', 'pointes'], unit: 'pointe' },
  { forms: ['tranche', 'tranches'], unit: 'tranche' },
  { forms: ['morceau', 'morceaux'], unit: 'morceau' },
  { forms: ['rondelle', 'rondelles'], unit: 'rondelle' },
  { forms: ['lamelle', 'lamelles'], unit: 'lamelle' },
  { forms: ['cube', 'cubes'], unit: 'cube' },
  { forms: ['sachet', 'sachets'], unit: 'sachet' },
  { forms: ['boite', 'boites'], unit: 'boîte' },
  { forms: ['pot', 'pots'], unit: 'pot' },
  { forms: ['brique', 'briques'], unit: 'brique' },
  { forms: ['paquet', 'paquets'], unit: 'paquet' },
  { forms: ['barquette', 'barquettes'], unit: 'barquette' },
  { forms: ['bocal', 'bocaux'], unit: 'bocal' },
  { forms: ['plaquette', 'plaquettes'], unit: 'plaquette' },
  { forms: ['tablette', 'tablettes'], unit: 'tablette' },
  { forms: ['rouleau', 'rouleaux'], unit: 'rouleau' },
  { forms: ['boule', 'boules'], unit: 'boule' },
  { forms: ['carre', 'carres'], unit: 'carré', except: /^(agneau|porc|veau)\b/ },
  { forms: ['poignee', 'poignees'], unit: 'poignée' },
  { forms: ['trait', 'traits'], unit: 'trait' },
  { forms: ['goutte', 'gouttes'], unit: 'goutte' },
  { forms: ['nuage'], unit: 'nuage' },
  { forms: ['soupcon'], unit: 'soupçon' },
  { forms: ['larme', 'larmes'], unit: 'larme' },
  { forms: ['quartier', 'quartiers'], unit: 'quartier' },
  { forms: ['verre', 'verres'], unit: 'verre' },
  { forms: ['tasse', 'tasses'], unit: 'tasse' },
  { forms: ['bol', 'bols'], unit: 'bol' },
  { forms: ['louche', 'louches'], unit: 'louche' },
  // Zeste ET jus d'un même fruit : un fruit
  { forms: ['zeste et jus', 'zeste et le jus', 'jus et zeste', 'jus et le zeste'], unit: 'jus', part: 'jus', only: 'citrus' },
  { forms: ['jus'], unit: 'jus', part: 'jus', only: 'citrus' },
  { forms: ['zeste', 'zestes'], unit: 'zeste', part: 'zeste', only: 'citrus' },
  { forms: ['jaune', 'jaunes'], unit: 'jaune', part: 'jaune', only: 'egg' },
  { forms: ['blanc', 'blancs'], unit: 'blanc', part: 'blanc', only: 'egg' },
  { forms: ['noix'], unit: 'noix', only: 'butter' },
  { forms: ['filet', 'filets'], unit: 'filet', only: 'liquid' },
];
const SHOPPING_PREFIX_CONDITIONS = {
  citrus: /^(citron|orange|pamplemousse|clementine|mandarine|lime|yuzu|bergamote|pomelo)s?\b/,
  egg: /^oeufs?\b/,
  butter: /^beurre\b/,
  liquid: /^(huile|vinaigre|citron|jus|creme|lait|sauce|miel|sirop|vin|rhum|cognac|whisky|calvados|armagnac|porto|kirsch|tabasco|nuoc|soja|worcestershire)s?\b/,
};
let _shoppingPrefixForms = null;

// Même produit en rayon sous un nom plus générique (clés normalisées, variétés et couleurs préservées)
const SHOPPING_VARIETY_ALIASES = {
  'citron jaune': 'citron',
  'oignon jaune': 'oignon',
  'ail blanc': 'ail',
  'sucre en poudre': 'sucre',
  'sucre semoule': 'sucre',
  'sucre blanc': 'sucre',
  'oeuf entier': 'oeuf',
  'oeuf moyen': 'oeuf',
  'gros oeuf': 'oeuf',
  'oeuf de poule': 'oeuf',
  'huile olive': 'huile d olive',
  'huile d olive vierge': 'huile d olive',
  'huile d olive vierge extra': 'huile d olive',
  'huile d olive extra vierge': 'huile d olive',
  'huile d olive extra': 'huile d olive',
  'farine de ble': 'farine',
  'creme fraiche epaisse': 'creme',
  'creme epaisse': 'creme',
  'creme fleurette': 'creme liquide',
  'creme liquide entiere': 'creme liquide',
  'creme fouettee': 'creme liquide',
  'celeri branche': 'celeri',
  'noix de muscade': 'muscade',
};
let _shoppingVarietyMap = null;

// États que normalizeIngredientName retire mais qui désignent un AUTRE produit en rayon pour
// certaines têtes : « tomates pelées » (conserve) ≠ tomates, « jambon cru » ≠ jambon (blanc)…
// tête → [mot du nom d'origine, mot remis dans la clé juste après la tête]
const SHOPPING_DISTINCT_STATES = _shoppingTable({
  tomate: [/^pelees?$/, 'pelee'],
  jambon: [/^crus?$/, 'cru'],
  betterave: [/^cuites?$/, 'cuite'],
  patate: [/^douces?$/, 'douce'],
  piment: [/^(doux|douces?)$/, 'doux'],
  thon: [/^frais$/, 'frais'],
  levure: [/^fraiches?$/, 'fraiche'],
  chevre: [/^frais$/, 'frais'],
  fromage: [/^frais$/, 'frais'],
  pate: [/^fraiches?$/, 'fraiche'],
  sucre: [/^morceaux?$/, 'morceau'],
  lentille: [/^cuites?$/, 'cuite'],
});

// Produits dont « haché », « fondu », « tiède », « dur »… décrivent une préparation faite à la maison
// (« persil haché » = persil, « beurre fondu » = beurre). Ailleurs ces mots restent discriminants
// (« bœuf haché », « fromage râpé », « fromage fondu »).
const SHOPPING_FRESH_HEADS = new Set([
  'persil', 'ciboulette', 'coriandre', 'basilic', 'menthe', 'aneth', 'cerfeuil', 'estragon', 'thym', 'romarin',
  'sauge', 'origan', 'oignon', 'echalote', 'ail', 'gingembre', 'carotte', 'courgette', 'citron', 'orange',
  'concombre', 'chou', 'betterave', 'celeri', 'radis', 'navet', 'poireau', 'champignon', 'avocat', 'piment',
  'poivron', 'pomme', 'poire', 'fenouil', 'panais', 'oeuf', 'beurre', 'lait', 'creme', 'chocolat',
]);
const SHOPPING_FRESH_PREP_WORDS = new Set([
  'hache', 'hachee', 'cisele', 'ciselee', 'rape', 'rapee', 'presse', 'pressee', 'concasse', 'concassee',
  'effeuille', 'effeuillee', 'equeute', 'equeutee', 'epepine', 'epepinee', 'zeste', 'zestee', 'detaille', 'detaillee',
  // Température, texture
  'fondu', 'fondue', 'mou', 'molle', 'pommade', 'ramolli', 'ramollie', 'froid', 'froide', 'tiede', 'chaud', 'chaude',
  'tempere', 'temperee', 'clarifie', 'tres', 'bien',
  // Œufs
  'battu', 'battue', 'monte', 'montee', 'neige', 'dur', 'mollet', 'poche', 'pochee', 'coque',
]);

// Découpe en mots en gardant leur position dans le texte d'origine (pour un libellé accentué)
function _shoppingTokens(s) {
  const toks = [];
  const re = /[^\s'’.]+/g;
  let m;
  while ((m = re.exec(s))) toks.push({ norm: _stripAccentsAndLigatures(m[0]), start: m.index });
  return toks;
}

// Avance au-delà des articles et d'une quantité écrite dans le nom (« jus de 2 citrons »,
// « 200 g de farine »). Garde toujours au moins un mot. Renvoie { i, amount, unit }.
function _skipShoppingLeading(toks, i) {
  let amount = null;
  let unit = null;
  while (i < toks.length - 1) {
    const t = toks[i].norm;
    if (amount == null && /^[\d½¼¾⅓⅔⅛]/.test(t)) {
      // « 4 épices », « 5 épices » : le nombre fait partie du nom
      if (i + 2 === toks.length && /^epices?$/.test(toks[i + 1].norm)) break;
      const n = parseShoppingAmount(t);
      if (n != null) {
        amount = n;
        i++;
        // Unité écrite après le nombre (« 200 g de », « 1 l de ») — avant de prendre « l » pour un article
        const u = toks[i] && toks[i + 1] && toks[i + 2] && _SHOPPING_PREFIX_PREPS.has(toks[i + 1].norm) ? toks[i].norm : null;
        if (u && (SHOPPING_MASS_UNITS[u] != null || SHOPPING_VOLUME_UNITS[u] != null)) {
          unit = u;
          i += 2;
        }
        continue;
      }
    }
    if (SHOPPING_LEADING_WORDS.has(t)) {
      i++;
      continue;
    }
    break;
  }
  return { i, amount, unit };
}

// Cherche un préfixe de mesure à la position i. Renvoie { unit, part, next } ou null.
function _matchShoppingPrefix(toks, i) {
  if (i >= toks.length) return null;
  // Adjectif de taille devant la mesure : « un petit bouquet de persil », « une grosse pincée de sel »
  if (SHOPPING_SIZE_WORDS.has(toks[i].norm)) {
    const m = _matchShoppingPrefix(toks, i + 1);
    if (m) return m;
  }
  const restFrom = j => toks.slice(_skipShoppingLeading(toks, j).i).map(t => t.norm).join(' ');
  // Cuillère écrite dans le nom : « cuillère à soupe de miel », « c. à c. de cannelle »
  if (_SHOPPING_SPOON_WORDS.has(toks[i].norm)) {
    let j = i + 1;
    if (toks[j] && toks[j].norm === 'a') j++;
    const spoon = toks[j] && _SHOPPING_SPOON_KINDS[toks[j].norm];
    if (spoon && toks[j + 1] && _SHOPPING_PREFIX_PREPS.has(toks[j + 1].norm) && toks[j + 2]) {
      return { unit: SHOPPING_SPOONS[spoon].label, part: null, next: j + 2 };
    }
  }
  if (!_shoppingPrefixForms) {
    // Formes multi-mots d'abord (« pointe de couteau » avant « pointe »)
    _shoppingPrefixForms = [];
    for (const p of SHOPPING_MEASURE_PREFIXES) {
      for (const f of p.forms) _shoppingPrefixForms.push({ words: f.split(' '), prefix: p });
    }
    _shoppingPrefixForms.sort((a, b) => b.words.length - a.words.length);
  }
  for (const { words, prefix } of _shoppingPrefixForms) {
    const prepAt = i + words.length;
    if (prepAt + 1 >= toks.length) continue;
    if (!words.every((w, k) => toks[i + k].norm === w)) continue;
    if (!_SHOPPING_PREFIX_PREPS.has(toks[prepAt].norm)) continue;
    const rest = restFrom(prepAt + 1);
    if (prefix.only && !SHOPPING_PREFIX_CONDITIONS[prefix.only].test(rest)) continue;
    if (prefix.except && prefix.except.test(rest)) continue;
    return { unit: prefix.unit, part: prefix.part || null, next: prepAt + 1 };
  }
  return null;
}

let _shoppingCountableHeadsSet = null;
// Premiers mots des produits vendus à l'unité (pièce, gousse, botte…) : là, la taille ne change pas le produit
function _shoppingCountableHeads() {
  if (!_shoppingCountableHeadsSet) {
    _shoppingCountableHeadsSet = new Set();
    for (const e of SHOPPING_PRODUCT_UNITS) {
      if (e.base === 'g' || e.base === 'ml') continue;
      const head = normalizeIngredientName(e.name).split(' ')[0];
      if (head) _shoppingCountableHeadsSet.add(head);
    }
  }
  return _shoppingCountableHeadsSet;
}

const _SHOPPING_EMPTY_NAME = { key: '', label: '', unitHint: null, amountHint: null, amountUnit: null, part: null, fromPrefix: false };

// Identité produit sans les alias de variété.
// Renvoie { key, label, unitHint, amountHint, amountUnit, part, fromPrefix }.
function _parseShoppingNameRaw(name) {
  const base = String(name == null ? '' : name)
    .replace(/\([^)]*\)/g, ' ')
    .split(',')[0]
    // « Beurre pour le moule », « Huile pour la friture » (mais « Sucre pour confiture » reste entier)
    .split(/\s+pour\s+(?:(?:le|la|les|un|une|du|des)\s|l['’])/i)[0]
    .replace(/\s+/g, ' ')
    .trim();
  const toks = _shoppingTokens(base);
  if (toks.length === 0) return { ..._SHOPPING_EMPTY_NAME };
  let { i, amount, unit: amountUnit } = _skipShoppingLeading(toks, 0);
  let unitHint = null;
  let part = null;
  let fromPrefix = false;
  // Jusqu'à deux préfixes imbriqués : « filet de jus de citron », « quelques gouttes de jus de citron »
  for (let depth = 0; depth < 2; depth++) {
    const pm = _matchShoppingPrefix(toks, i);
    if (!pm) break;
    if (!unitHint) unitHint = pm.unit;
    if (!part) part = pm.part;
    fromPrefix = true;
    // « le jus d'un citron » : un fruit
    if (pm.part && amount == null && toks[pm.next] && /^(un|une)$/.test(toks[pm.next].norm)) amount = 1;
    const after = _skipShoppingLeading(toks, pm.next);
    i = after.i;
    if (amount == null && after.amount != null) {
      amount = after.amount;
      amountUnit = after.unit;
    }
  }
  const rest = base.slice(toks[i].start).trim();
  let kt = normalizeIngredientName(rest).split(' ').filter(Boolean);
  // Nom entièrement fait de mots vides (« Mûres ») : on le garde tel quel plutôt que de le perdre
  if (kt.length === 0) {
    kt = _stripAccentsAndLigatures(rest).replace(/['’]/g, ' ').replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean).map(_singularizeToken);
  }
  // normalizeIngredientName peut laisser une préposition en tête (« tranches de jambon » → « de jambon »)
  while (kt.length > 1 && SHOPPING_LEADING_WORDS.has(kt[0])) kt.shift();
  // « non traité » qualifie l'achat comme « bio » : même produit (« citron non traité » = citron)
  kt = kt.filter((t, k) => !(t === 'non' && /^traitee?$/.test(kt[k + 1] || '')) && !(/^traitee?$/.test(t) && kt[k - 1] === 'non'));
  // États qui changent le produit en rayon (« tomates pelées », « jambon cru ») : remis après la tête
  const distinct = SHOPPING_DISTINCT_STATES[kt[0]];
  if (distinct && !kt.includes(distinct[1]) && _shoppingTokens(rest).some(t => distinct[0].test(t.norm))) {
    kt.splice(1, 0, distinct[1]);
  }
  // Préparations faites à la maison (« persil haché », « beurre fondu », « œufs durs »)
  if (kt.length > 1 && SHOPPING_FRESH_HEADS.has(kt[0])) {
    const kept = kt.filter((t, k) => k === 0 || !SHOPPING_FRESH_PREP_WORDS.has(t));
    if (kept.length) kt = kept;
  }
  // Taille de ce qui se compte (« gros oignon », « oignons moyens ») ; « petits pois », « gros sel » intacts
  let sizeDropped = false;
  if (kt.length > 1 && kt.some(t => SHOPPING_SIZE_WORDS.has(t))) {
    const kept = kt.filter(t => !SHOPPING_SIZE_WORDS.has(t));
    if (kept.length && _shoppingCountableHeads().has(kept[0])) {
      kt = kept;
      sizeDropped = true;
    }
  }
  // Libellé : le nom d'origine, sans la taille retirée de la clé (« Gros oignon » → « Oignon ») ;
  // après un préfixe, on retire aussi les mots accordés avec lui
  // (« gousses d'ail écrasées » → « Ail », « brins de ciboulette ciselés » → « Ciboulette »)
  let labelText = rest;
  if (sizeDropped) {
    const words = rest.split(/\s+/).filter(w => !SHOPPING_SIZE_WORDS.has(_stripAccentsAndLigatures(w)));
    if (words.length) labelText = words.join(' ');
  }
  if (fromPrefix) {
    const keyToks = new Set(kt);
    const lastToken = w => {
      const bits = _stripAccentsAndLigatures(w).split(/['’]/);
      return _singularizeToken(bits[bits.length - 1].replace(/[^a-z0-9]/g, ''));
    };
    const words = labelText.split(/\s+/);
    while (words.length > 1 && !keyToks.has(lastToken(words[words.length - 1]))) words.pop();
    labelText = words.join(' ');
  }
  return {
    key: kt.join(' '),
    label: labelText.charAt(0).toUpperCase() + labelText.slice(1),
    unitHint,
    amountHint: amount,
    amountUnit,
    part,
    fromPrefix,
  };
}

// Identité produit d'un nom d'ingrédient (alias de variété compris)
// « Jus de citron jaune » → { key: 'citron', label: 'Citron jaune', unitHint: 'jus', part: 'jus', … }
function parseShoppingName(name) {
  const p = _parseShoppingNameRaw(name);
  if (!_shoppingVarietyMap) {
    _shoppingVarietyMap = new Map();
    for (const [from, to] of Object.entries(SHOPPING_VARIETY_ALIASES)) {
      const f = _parseShoppingNameRaw(from).key;
      const t = _parseShoppingNameRaw(to).key;
      if (f && t && f !== t) _shoppingVarietyMap.set(f, t);
    }
  }
  const alias = _shoppingVarietyMap.get(p.key);
  if (alias) p.key = alias;
  return p;
}

let _shoppingExcludedKeys = null;
// Variante de isShoppingExcluded sur la clé produit (« une pincée de fleur de sel » → « fleur de sel »,
// « sel et poivre »). Les exclusions écrites avec un préfixe (« cubes de glace ») restent gérées par
// isShoppingExcluded : leur clé (« glace ») désignerait un autre produit.
function isShoppingExcludedProduct(key) {
  if (!_shoppingExcludedKeys) {
    _shoppingExcludedKeys = new Set();
    for (const e of SHOPPING_EXCLUDE) {
      const p = parseShoppingName(e);
      if (p.key && !p.fromPrefix) _shoppingExcludedKeys.add(p.key);
    }
  }
  if (_shoppingExcludedKeys.has(key)) return true;
  // « sel et poivre », « sel poivre » : chaque mot est lui-même exclu
  const words = String(key || '').split(' ').filter(w => w && w !== 'et');
  return words.length > 1 && words.every(w => _shoppingExcludedKeys.has(w));
}

// --- Équivalences d'unités par produit ---

// Unité d'achat (base) et équivalences moyennes, pour fusionner des quantités de natures différentes.
//   base    : 'piece', 'g', 'ml' ou une unité nommée ('gousse', 'sachet', 'botte'…)
//   g / ml  : poids (g) / volume (ml) d'UNE unité de base
//   density : g par ml (passage masse ↔ volume)
//   units   : autres unités → nombre d'unités de base (1 tête d'ail = 10 gousses ; base g : 1 pièce = 150 g)
//   parts   : parties d'UNE pièce (jaune/blanc d'œuf, zeste/jus d'agrume) avec leur poids et volume ;
//             une pièce fournit chaque partie une fois (3 jaunes + 3 blancs = 3 œufs)
//   volumePart : partie que désigne un volume sans précision (25 ml de citron = du jus)
//   compounds : s'applique aussi aux « X de … » (« huile de colza » → huile) ; sinon « lait de coco » ≠ lait
//   tolerance : part fractionnaire négligée à l'arrondi (défaut 0,15)
const SHOPPING_PRODUCT_UNITS = [
  // Agrumes
  { name: 'citron', base: 'piece', g: 120, volumePart: 'jus', parts: { jus: { g: 45, ml: 45 }, zeste: { g: 5, ml: 15 } }, units: { quartier: 0.25, rondelle: 0.125, filet: 0.25, goutte: 0.02 } },
  { name: 'citron vert', base: 'piece', g: 70, volumePart: 'jus', parts: { jus: { g: 30, ml: 30 }, zeste: { g: 3, ml: 10 } }, units: { quartier: 0.25, rondelle: 0.125, filet: 0.25, goutte: 0.02 } },
  { name: 'orange', base: 'piece', g: 200, volumePart: 'jus', parts: { jus: { g: 90, ml: 90 }, zeste: { g: 10, ml: 30 } }, units: { quartier: 0.125, rondelle: 0.1 } },
  { name: 'pamplemousse', base: 'piece', g: 400, volumePart: 'jus', parts: { jus: { g: 150, ml: 150 }, zeste: { g: 15, ml: 45 } } },
  { name: 'clémentine', base: 'piece', g: 70, volumePart: 'jus', parts: { jus: { g: 35, ml: 35 }, zeste: { g: 3, ml: 10 } } },
  { name: 'mandarine', base: 'piece', g: 80, volumePart: 'jus', parts: { jus: { g: 40, ml: 40 }, zeste: { g: 4, ml: 12 } } },
  // Alliacées
  { name: 'ail', base: 'gousse', g: 5, units: { piece: 1, tete: 10 } },
  { name: 'oignon', base: 'piece', g: 120 },
  { name: 'oignon nouveau', base: 'piece', g: 30 },
  { name: 'échalote', base: 'piece', g: 30 },
  { name: 'poireau', base: 'piece', g: 200 },
  // Œufs : 1 œuf ≈ 55 g (jaune 18 g, blanc 32 g)
  { name: 'œuf', base: 'piece', g: 55, ml: 50, parts: { jaune: { g: 18, ml: 17 }, blanc: { g: 32, ml: 30 } } },
  // Légumes
  { name: 'tomate', base: 'piece', g: 120 },
  { name: 'tomate cerise', base: 'g', units: { piece: 15 } },
  { name: 'tomate pelée', base: 'g', units: { boite: 400 } },
  { name: 'carotte', base: 'piece', g: 120 },
  { name: 'pomme de terre', base: 'g', units: { piece: 150 } },
  { name: 'patate douce', base: 'g', units: { piece: 300 } },
  { name: 'courgette', base: 'piece', g: 250 },
  { name: 'aubergine', base: 'piece', g: 300 },
  { name: 'poivron', base: 'piece', g: 160 },
  { name: 'concombre', base: 'piece', g: 300 },
  { name: 'avocat', base: 'piece', g: 200 },
  { name: 'champignon', base: 'g', compounds: true, units: { piece: 20 } },
  { name: 'fenouil', base: 'piece', g: 250 },
  { name: 'navet', base: 'piece', g: 100 },
  { name: 'betterave', base: 'piece', g: 150 },
  { name: 'panais', base: 'piece', g: 150 },
  { name: 'brocoli', base: 'piece', g: 400 },
  { name: 'chou-fleur', base: 'piece', g: 800 },
  { name: 'céleri', base: 'branche', g: 40, units: { piece: 1, pied: 8 } },
  { name: 'céleri-rave', base: 'piece', g: 800 },
  { name: 'gingembre', base: 'g', units: { cm: 5, morceau: 20 } },
  // Fruits
  { name: 'pomme', base: 'piece', g: 150 },
  { name: 'poire', base: 'piece', g: 150 },
  { name: 'banane', base: 'piece', g: 120 },
  { name: 'pêche', base: 'piece', g: 150 },
  { name: 'abricot', base: 'piece', g: 45 },
  { name: 'mangue', base: 'piece', g: 400 },
  { name: 'kiwi', base: 'piece', g: 80 },
  // Herbes : achetées en botte (≈ 25 brins de persil, 50 de ciboulette, 50 feuilles de basilic)
  { name: 'persil', base: 'botte', g: 50, density: 0.25, units: { bouquet: 1, piece: 1, brin: 0.04, branche: 0.04, feuille: 0.005 }, tolerance: 0.25 },
  { name: 'coriandre', base: 'botte', g: 50, density: 0.25, units: { bouquet: 1, piece: 1, brin: 0.04, branche: 0.04, feuille: 0.005 }, tolerance: 0.25 },
  { name: 'ciboulette', base: 'botte', g: 30, density: 0.25, units: { bouquet: 1, piece: 1, brin: 0.02 }, tolerance: 0.25 },
  { name: 'basilic', base: 'botte', g: 30, density: 0.2, units: { bouquet: 1, piece: 1, brin: 0.1, branche: 0.1, feuille: 0.02 }, tolerance: 0.25 },
  { name: 'menthe', base: 'botte', g: 30, density: 0.2, units: { bouquet: 1, piece: 1, brin: 0.1, branche: 0.1, feuille: 0.02 }, tolerance: 0.25 },
  { name: 'aneth', base: 'botte', g: 30, density: 0.2, units: { bouquet: 1, piece: 1, brin: 0.1, branche: 0.1 }, tolerance: 0.25 },
  { name: 'thym', base: 'branche', units: { piece: 1, brin: 1 } },
  { name: 'romarin', base: 'branche', units: { piece: 1, brin: 1 } },
  { name: 'laurier', base: 'feuille', units: { piece: 1 } },
  // Crèmerie
  { name: 'beurre', base: 'g', density: 0.95, units: { noix: 10, plaquette: 250 } },
  { name: 'lait', base: 'ml', density: 1.03, units: { verre: 200, tasse: 250, bol: 300, brique: 1000 } },
  { name: 'crème', base: 'ml', density: 1, units: { pot: 200, brique: 200 } },
  { name: 'crème liquide', base: 'ml', density: 1, units: { pot: 200, brique: 200 } },
  { name: 'yaourt', base: 'piece', g: 125, units: { pot: 1 } },
  { name: 'fromage blanc', base: 'g', density: 1.05 },
  { name: 'mozzarella', base: 'g', units: { boule: 125, piece: 125 } },
  { name: 'parmesan', base: 'g', density: 0.4 },
  // Épicerie
  { name: 'farine', base: 'g', density: 0.6, compounds: true, units: { verre: 120, tasse: 140 } },
  { name: 'sucre', base: 'g', density: 0.9, units: { morceau: 5, verre: 180, tasse: 200 } },
  { name: 'sucre glace', base: 'g', density: 0.55 },
  { name: 'sucre roux', base: 'g', density: 0.85 },
  { name: 'cassonade', base: 'g', density: 0.85 },
  { name: 'sucre vanillé', base: 'sachet', g: 7.5, density: 0.85 },
  { name: 'levure chimique', base: 'sachet', g: 11, density: 0.9 },
  { name: 'levure de boulanger', base: 'sachet', g: 5.5, density: 0.65 },
  { name: 'levure boulangère', base: 'sachet', g: 5.5, density: 0.65 },
  { name: 'levure sèche de boulanger', base: 'sachet', g: 5.5, density: 0.65 },
  { name: 'levure fraîche', base: 'g', compounds: true, units: { cube: 42 } },
  { name: 'gélatine', base: 'feuille', g: 2 },
  { name: 'maïzena', base: 'g', density: 0.6 },
  { name: 'fécule de maïs', base: 'g', density: 0.6 },
  { name: 'cacao', base: 'g', density: 0.45 },
  { name: 'chocolat', base: 'g', units: { carre: 5, tablette: 200, plaquette: 200 } },
  { name: 'poudre d\'amande', base: 'g', density: 0.4 },
  { name: 'miel', base: 'g', density: 1.4 },
  { name: 'moutarde', base: 'g', density: 1.05, compounds: true },
  { name: 'concentré de tomate', base: 'g', density: 1.1 },
  { name: 'riz', base: 'g', density: 0.85, units: { verre: 170, tasse: 200 } },
  { name: 'semoule', base: 'g', density: 0.75, units: { verre: 150 } },
  { name: 'flocon d\'avoine', base: 'g', density: 0.4 },
  { name: 'huile', base: 'ml', density: 0.92, compounds: true, units: { filet: 15, trait: 5 } },
  { name: 'vinaigre', base: 'ml', density: 1.01, compounds: true, units: { filet: 10, trait: 5 } },
  { name: 'sauce soja', base: 'ml', density: 1.15, units: { trait: 5 } },
  { name: 'sirop d\'érable', base: 'ml', density: 1.33 },
  { name: 'lait de coco', base: 'ml', density: 1, units: { boite: 400, brique: 200 } },
  { name: 'bouillon', base: 'cube', ml: 500, compounds: true },
  { name: 'vin', base: 'ml', density: 1, compounds: true, units: { verre: 150 } },
  // Charcuterie, traiteur
  { name: 'jambon', base: 'tranche', g: 45 },
  { name: 'jambon cru', base: 'tranche', g: 15, compounds: true },
  { name: 'bacon', base: 'tranche', g: 15 },
  { name: 'saumon fumé', base: 'tranche', g: 25 },
  { name: 'pain de mie', base: 'tranche', g: 25 },
];
let _shoppingUnitsMap = null;

// Équivalences d'un produit : correspondance exacte, sinon plus long préfixe de mots
// (« poivron rouge » → poivron). « X de … » n'hérite que des entrées « compounds »
// (« huile de colza » → huile, mais « lait de coco » ≠ lait, « pomme de terre » ≠ pomme).
function getShoppingProductUnits(key) {
  if (!key) return null;
  if (!_shoppingUnitsMap) {
    _shoppingUnitsMap = new Map();
    for (const e of SHOPPING_PRODUCT_UNITS) {
      const k = parseShoppingName(e.name).key;
      if (k && !_shoppingUnitsMap.has(k)) _shoppingUnitsMap.set(k, e);
    }
  }
  const toks = key.split(' ');
  for (let n = toks.length; n >= 1; n--) {
    const e = _shoppingUnitsMap.get(toks.slice(0, n).join(' '));
    if (!e) continue;
    if (n === toks.length || !_SHOPPING_PREFIX_PREPS.has(toks[n]) || e.compounds) return e;
  }
  return null;
}

function _shoppingBaseUnit(entry) {
  if (entry.base === 'g') return { kind: 'mass', id: 'g', factor: 1, label: 'g' };
  if (entry.base === 'ml') return { kind: 'volume', id: 'ml', factor: 1, label: 'ml' };
  if (entry.base === 'piece') return { kind: 'count', id: 'piece', factor: 1, label: '' };
  return parseShoppingUnit(entry.base);
}

// Nature d'une unité pour l'addition : 'mass', 'volume' (ml/cl/l), 'volume:cas' (cuillères),
// 'count' (pièces) ou 'named:<id>' (gousse, botte…)
function _shoppingUnitIdentity(unit) {
  if (unit.kind === 'named') return 'named:' + unit.id;
  if (unit.kind === 'volume' && unit.id !== 'ml') return 'volume:' + unit.id;
  return unit.kind;
}

// Idem, en séparant les parties d'un produit gardées en masse/volume (« 100 g » de blancs ≠ « 100 g » d'œufs)
function _shoppingQuantityIdentity(q) {
  const id = _shoppingUnitIdentity(q.unit);
  return q.part && (q.unit.kind === 'mass' || q.unit.kind === 'volume') ? id + '|' + q.part : id;
}

const _isShoppingPositive = v => v != null && isFinite(v) && v > 0;

// Ramène une quantité (g, ml, pièces ou unités nommées) d'un produit ENTIER à son unité d'achat.
// null si l'équivalence n'est pas connue.
function _convertToShoppingBase(amount, unit, entry) {
  const base = entry.base;
  const units = entry.units || null;
  switch (unit.kind) {
    case 'mass':
      if (base === 'g') return amount;
      if (base === 'ml') return entry.density ? amount / entry.density : null;
      return entry.g ? amount / entry.g : null;
    case 'volume':
      if (base === 'ml') return amount;
      if (base === 'g') return entry.density ? amount * entry.density : null;
      if (entry.ml) return amount / entry.ml;
      return entry.density && entry.g ? (amount * entry.density) / entry.g : null;
    case 'count': {
      if (base === 'piece') return amount;
      const f = _shoppingOwn(units, 'piece');
      return f != null ? amount * f : null;
    }
    case 'named': {
      if (unit.id === _shoppingBaseUnit(entry).id) return amount;
      const f = _shoppingOwn(units, unit.id);
      return f != null ? amount * f : null;
    }
  }
  return null;
}

// Équivalences exactes, sans « ≈ » : « 2 ail » = 2 gousses, 1 bouquet de persil = 1 botte,
// 1 pot de yaourt = 1 yaourt… (même nombre, autre nom d'unité, pour un produit vendu à l'unité)
function _isExactShoppingConversion(unit, entry) {
  if (!entry.units || entry.base === 'g' || entry.base === 'ml') return false;
  const id = unit.kind === 'count' ? 'piece' : unit.kind === 'named' ? unit.id : null;
  return id != null && _shoppingOwn(entry.units, id) === 1;
}

// Partie d'une pièce que représente une quantité (jaune, blanc, zeste, jus), ou null pour le produit entier
function _shoppingPartOf(g, entry) {
  if (!entry.parts) return null;
  if (g.part && _shoppingOwn(entry.parts, g.part)) return g.part;
  if (g.unit.kind === 'named' && _shoppingOwn(entry.parts, g.unit.id)) return g.unit.id;
  if (g.unit.kind === 'volume' && !g.part && entry.volumePart) return entry.volumePart;
  return null;
}

// Arrondi à l'unité supérieure de ce qui s'achète à l'unité, en négligeant une petite part
// (2,05 citrons → 2 ; 2,4 → 3). Jamais moins de 1.
function _roundUpShoppingCount(n, tolerance) {
  const floor = Math.floor(n + 1e-9);
  return Math.max(1, n - floor < tolerance ? floor : Math.ceil(n - 1e-9));
}

// Arrondi lisible (et par excès, pour ne pas en acheter trop peu) d'une masse ou d'un volume estimé :
// 114 g → 120 g ; 128,5 g → 130 g
function _roundShoppingEstimate(n) {
  const step = n < 20 ? 1 : n < 100 ? 5 : n < 1000 ? 10 : 50;
  return Math.max(step, Math.ceil(n / step - 1e-9) * step);
}

// Additionne des quantités par nature d'unité (et partie), dans l'ordre d'apparition.
// Volumes d'une même partie : cuillères + ml → ml ; cuillères de tailles différentes → la plus petite.
function _sumShoppingQuantities(quantities) {
  const groups = [];
  const byIdentity = new Map();
  for (const q of quantities || []) {
    if (!q || !q.unit || !(q.amount > 0)) continue;
    const id = _shoppingQuantityIdentity(q);
    const g = byIdentity.get(id);
    if (g) {
      g.amount += q.amount;
    } else {
      const ng = { amount: q.amount, unit: q.unit, part: q.part || null };
      byIdentity.set(id, ng);
      groups.push(ng);
    }
  }
  const buckets = new Map();
  for (const g of groups) {
    if (g.unit.kind !== 'volume') continue;
    const k = g.part || '';
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(g);
  }
  const merged = new Set();
  for (const list of buckets.values()) {
    if (list.length < 2) continue;
    const target = list.find(g => g.unit.id === 'ml') || list.reduce((a, b) => (b.unit.factor < a.unit.factor ? b : a));
    for (const g of list) {
      if (g === target) continue;
      target.amount += g.amount;
      merged.add(g);
    }
  }
  return merged.size ? groups.filter(g => !merged.has(g)) : groups;
}

// Fusionne les quantités d'UN produit.
// quantities : [{ amount, unit, part }], amount déjà exprimé dans l'unité de référence de son type
//   (g pour une masse, ml pour un volume — cuillères comprises —, nombre de pièces ou d'unités
//   nommées) ; null = non chiffré ; part = 'jaune' | 'blanc' | 'zeste' | 'jus' le cas échéant.
// key : clé produit pour les équivalences et l'arrondi — null pour seulement additionner (détail par recette).
// Renvoie { parts: [{ amount, unit, part }], approx } :
//   - quantités de même nature additionnées (g + kg, ml + cl + c. à soupe…)
//   - parties d'une pièce ramenées à des pièces, le maximum par partie (3 jaunes + 3 blancs = 3 œufs)
//   - équivalences exactes appliquées (« 2 ail » = 2 gousses)
//   - natures différentes ramenées à l'unité d'achat quand l'équivalence est connue (approx : estimée)
//   - ce qui s'achète à l'unité arrondi à l'unité supérieure (approx si arrondi)
//   - sinon plusieurs parts, affichées « 2 pièces + 30 g »
function mergeShoppingQuantities(quantities, key) {
  const groups = _sumShoppingQuantities(quantities);
  if (!key || groups.length === 0) return { parts: groups, approx: false };
  const entry = getShoppingProductUnits(key);
  const tolerance = entry && entry.tolerance != null ? entry.tolerance : 0.15;
  let approx = false;
  let out = groups;
  let base = null;

  if (entry) {
    const baseUnit = _shoppingBaseUnit(entry);
    const baseId = _shoppingUnitIdentity(baseUnit);
    // 1) Parties d'une pièce : besoin en pièces par partie, une pièce fournissant chaque partie une fois
    const need = Object.create(null);
    const whole = [];
    for (const g of groups) {
      const p = _shoppingPartOf(g, entry);
      const spec = p ? entry.parts[p] : null;
      let v = null;
      let estimated = false;
      if (spec) {
        if (g.unit.kind === 'count' || (g.unit.kind === 'named' && g.unit.id === p)) v = g.amount;
        else if (g.unit.kind === 'mass' && spec.g) v = g.amount / spec.g;
        else if (g.unit.kind === 'volume' && spec.ml) v = g.amount / spec.ml;
        // « filet de jus de citron » : unité du fruit entier (units.filet)
        else if (g.unit.kind === 'named') v = _convertToShoppingBase(g.amount, g.unit, entry);
        estimated = !(g.unit.kind === 'count' || (g.unit.kind === 'named' && g.unit.id === p));
      }
      // Un grand volume de jus (plus de 4 fruits) s'achète plutôt en bouteille : on le laisse en volume
      if (_isShoppingPositive(v) && !(p === entry.volumePart && g.unit.kind === 'volume' && v > 4)) {
        need[p] = (need[p] || 0) + v;
        if (estimated) approx = true;
      } else {
        if (p) g.part = p;
        whole.push(g);
      }
    }
    const partNeeds = Object.values(need);
    out = [];
    if (partNeeds.length) {
      base = { amount: Math.max(...partNeeds), unit: baseUnit, part: null };
      out.push(base);
    }
    // 2) Unité d'achat + équivalences exactes : une seule part
    for (const g of whole) {
      const isBase = !g.part && (_shoppingUnitIdentity(g.unit) === baseId || (baseUnit.kind === 'volume' && g.unit.kind === 'volume'));
      if (!isBase && !(!g.part && _isExactShoppingConversion(g.unit, entry))) {
        out.push(g);
        continue;
      }
      const v = isBase ? g.amount : _convertToShoppingBase(g.amount, g.unit, entry);
      if (base) {
        base.amount += v;
      } else {
        base = { amount: v, unit: baseUnit, part: null };
        out.push(base);
      }
    }
    // 3) Natures encore différentes : équivalences estimées, seulement si elles réunissent au moins 2 parts
    if (out.length > 1) {
      const conv = out.map(p => (p === base ? p.amount : p.part ? null : _convertToShoppingBase(p.amount, p.unit, entry)));
      if (conv.filter(_isShoppingPositive).length >= 2) {
        let total = 0;
        const left = [];
        out.forEach((p, k) => {
          if (_isShoppingPositive(conv[k])) total += conv[k];
          else left.push(p);
        });
        base = { amount: total, unit: baseUnit, part: null };
        out = [base, ...left];
        approx = true;
      }
    } else if (out.length === 1 && out[0] !== base && out[0].unit.kind === 'volume' && !out[0].part && entry.base === 'piece' && entry.ml) {
      // Un volume seul d'un produit vendu à la pièce (« 100 ml d'œufs battus ») : on ne l'achète pas en ml
      base = { amount: out[0].amount / entry.ml, unit: baseUnit, part: null };
      out = [base];
      approx = true;
    }
    if (approx && base && (base.unit.kind === 'mass' || base.unit.kind === 'volume')) {
      base.amount = _roundShoppingEstimate(base.amount);
    }
    // L'unité d'achat d'abord (« 2 pièces + 1 l de jus »)
    if (base && out[0] !== base) out = [base, ...out.filter(p => p !== base)];
  }

  // 4) Ce qui s'achète à l'unité : total entier, arrondi à l'unité supérieure (« Œufs 8,3 » → « ≈ 9 »)
  for (const p of out) {
    const whole = p.unit.kind === 'count' || (p.unit.kind === 'named' && SHOPPING_WHOLE_UNITS.has(p.unit.id));
    if (whole && Math.abs(p.amount - Math.round(p.amount)) > 1e-9) {
      p.amount = _roundUpShoppingCount(p.amount, tolerance);
      approx = true;
    }
  }
  return { parts: out, approx };
}


// Régimes alimentaires affichés dans l'interface (modal validation, filtres, chips...)
// Les tags FODMAP sont calculés AUTOMATIQUEMENT à partir des ingrédients via calculateFodmapTags(),
// les autres sont cochés manuellement par l'utilisateur.
// Si vous voulez rétablir d'autres régimes (vegan, keto, halal, casher, sans-sucre), il suffit de
// les rajouter dans ce tableau, ils réapparaîtront partout dans l'app.
const DIET_TAGS = [
  { id: 'vegetarien', label: 'Végétarien', emoji: '🥗', color: '#86efac' },
  { id: 'sans-gluten', label: 'Sans gluten', emoji: '🌾', color: '#fbbf24' },
  { id: 'sans-lactose', label: 'Sans lactose', emoji: '🥛', color: '#7dd3fc' },
  { id: 'low-fodmap', label: 'Low FODMAP', emoji: '💚', color: '#22c55e' },
  { id: 'high-fodmap', label: 'High FODMAP', emoji: '⚠️', color: '#f97316' },
];

// ============================================
// BASE FODMAP : classification des aliments
// ============================================
// LOGIQUE BINAIRE STRICTE :
// - Si AU MOINS UN ingrédient est dans FODMAP_HIGH → la recette est 'high-fodmap'
// - Dans TOUS les autres cas → 'low-fodmap'
//
// Liste basée sur les recommandations utilisateur, classée par catégorie de FODMAP :
// GOS (Galacto-oligosaccharides), Fructanes (FOS), Lactose, Fructose en excès, Polyols.
// Les noms sont normalisés (sans accent, minuscule, ligature œ→oe) pour le matching.

const FODMAP_HIGH = new Set([
  // ====== GOS — Galacto-oligosaccharides ======
  // Légumineuses
  'pois chiches', 'pois chiche', 'haricots rouges', 'haricot rouge', 'haricots pinto', 'haricot pinto',
  'haricots de lima', 'haricot de lima', 'pois casse', 'pois casses', 'pois cassé', 'pois cassés',
  'lentille', 'lentilles', 'flageolet', 'flageolets',
  'feve de soja', 'feves de soja', 'fève de soja', 'fèves de soja', 'soja',
  // Légumes (GOS)
  'asperge', 'asperges', 'betterave', 'betteraves',
  'pois mange-tout', 'pois mange tout', 'mange-tout',
  'chou de bruxelles', 'choux de bruxelles', 'bruxelles',
  'courge butternut', 'courges butternut', 'butternut',
  'mais', 'maïs', 'mais sucre', 'maïs sucré',
  'petit pois', 'petits pois',
  // Noix GOS
  'noix de cajou', 'noix de cajous', 'cajou', 'cajous',
  'pistache', 'pistaches', 'amande', 'amandes', 'noisette', 'noisettes',
  // Autres GOS
  'sauce du commerce', 'sauces du commerce', 'sauce industrielle',
  'the tres infuse', 'thé très infusé', 'thé fortement infusé',
  'houmous', 'hummus',

  // ====== Fructanes (FOS) ======
  // Légumes
  'artichaut', 'artichauts',
  'brocoli', 'brocolis',
  'chou', 'choux',
  'fenouil',
  'ail', 'gousse d\'ail', 'gousses d\'ail',
  'poireau', 'poireaux',
  'gombo', 'gombos',
  'oignon', 'oignons', 'oignon rouge', 'oignon jaune', 'oignon blanc', 'oignon nouveau',
  'echalote', 'échalote', 'echalotes', 'échalotes',
  'topinambour', 'topinambours',
  'champignon', 'champignons', 'champignon de paris', 'champignons de paris', 'cepe', 'cèpe', 'cepes', 'cèpes',
  // Céréales (blé, seigle et dérivés en grande quantité)
  'ble', 'blé',
  'seigle',
  'pain', 'pain blanc', 'pain complet', 'pain de mie', 'baguette', 'baguettes',
  'craquelin', 'craquelins',
  'biscuit', 'biscuits',
  'couscous', 'semoule', 'semoule fine', 'semoule de ble', 'semoule de blé',
  'pates', 'pâtes', 'pates alimentaires', 'pâtes alimentaires',
  'spaghetti', 'spaghettis', 'tagliatelle', 'tagliatelles',
  'penne', 'fusilli', 'macaroni', 'macaronis', 'farfalle',
  'lasagne', 'lasagnes', 'gnocchi', 'gnocchis',
  'boulghour', 'boulgour',
  'brioche', 'brioches', 'croissant', 'croissants', 'viennoiserie', 'viennoiseries',
  // Farines à base de blé/seigle
  'farine', 'farine de ble', 'farine de blé', 'farine de seigle',
  'farine t45', 'farine t55', 'farine t65', 'farine t80', 'farine t110', 'farine t150',
  'farine d\'epeautre', 'farine d\'épeautre', 'epeautre', 'épeautre',
  'orge',
  // Fruits (fructanes)
  'pomme', 'pommes',
  'melon d\'eau',
  'kaki', 'kakis',
  'nectarine', 'nectarines',
  'datte', 'dattes',
  'figue', 'figues',
  'pamplemousse', 'pamplemousses',
  'abricot', 'abricots',
  // Autres fructanes
  'chicoree', 'chicorée',
  'pissenlit',
  'inuline',

  // ====== Lactose ======
  'lait', 'lait de vache', 'lait de chevre', 'lait de chèvre', 'lait de brebis',
  'lait entier', 'lait demi-ecreme', 'lait demi-écrémé', 'lait ecreme', 'lait écrémé',
  'creme glacee', 'crème glacée', 'glace',
  'yaourt', 'yaourts',
  'dessert lacte', 'dessert lacté', 'desserts a base de lait', 'desserts à base de lait',
  'poudre de lait',
  // Fromages à pâte molle non affinés
  'cottage', 'cottage cheese', 'mascarpone', 'ricotta', 'faisselle',
  'fromage blanc', 'fromage frais', 'petit suisse', 'petits suisses', 'kefir', 'kéfir',
  'creme', 'crème', 'creme epaisse', 'crème épaisse', 'creme liquide', 'crème liquide',

  // ====== Fructose en excès ======
  // Fruits (Pomme/Poire déjà ci-dessus mais on les liste aussi explicitement)
  'cerise', 'cerises',
  'mangue', 'mangues',
  'pasteque', 'pastèque',
  'poire', 'poires',
  'fruits en conserve', 'fruit en conserve',
  'fruits seches', 'fruits séchés', 'fruit seche', 'fruit séché', 'fruit sec', 'fruits secs',
  'raisin sec', 'raisins secs',
  'jus de fruits', 'jus de fruit', 'jus de pomme', 'jus de poire',
  // Légumes (fructose)
  'fond d\'artichaut', 'fonds d\'artichaut', 'coeur d\'artichaut', 'coeurs d\'artichaut',
  'tomate sechee', 'tomate séchée', 'tomates sechees', 'tomates séchées',
  // Sucres et sirops
  'fructose',
  'sirop de mais', 'sirop de maïs', 'sirop de mais a haute teneur en fructose', 'sirop de glucose-fructose',
  'miel',
  'bonbon', 'bonbons',
  // Alcools sucrés
  'vin liquoreux', 'vins liquoreux', 'porto', 'rhum', 'muscat', 'pernod', 'sauternes',

  // ====== Polyols ======
  // Fruits (certains déjà ci-dessus comme pomme/poire)
  'avocat', 'avocats',
  'mure', 'mûre', 'mures', 'mûres',
  'litchi', 'litchis',
  'peche', 'pêche', 'peches', 'pêches',
  'prune', 'prunes', 'pruneau', 'pruneaux',
  'cassis',
  'noix', 'eau de coco',
  // Légumes polyols
  'chou-fleur', 'choux-fleurs', 'chou fleur', 'choux fleurs',
  'poivron', 'poivrons', 'poivron rouge', 'poivron vert', 'poivron jaune',
  // Édulcorants polyols
  'sorbitol', 'mannitol', 'isomalt', 'maltitol', 'xylitol',
  'e420', 'e421', 'e953', 'e965', 'e967',
  'chewing-gum', 'chewing gum', 'chewing-gums',
  'sucette', 'sucettes',
  'dessert leger a base de lait', 'dessert léger à base de lait',
  'edulcorant', 'édulcorant', 'edulcorants', 'édulcorants',
]);

// Stop words à ignorer dans le nom d'ingrédient
const FODMAP_STOP_WORDS = new Set([
  'de', 'la', 'le', 'les', 'du', 'des', 'un', 'une', 'à', 'au', 'aux',
  'et', 'ou', 'avec', 'sans', 'en', 'd\'', 'l\'', 'pour'
]);

// Exceptions : ingrédients qui ressemblent à un high mais qui sont en réalité LOW
// (matching prioritaire sur FODMAP_HIGH pour éviter les faux positifs)
const FODMAP_EXCEPTIONS_LOW = new Set([
  // Coco : la noix de coco N'EST PAS la "noix" polyol
  'noix de coco', 'noix de coco rapee', 'noix de coco râpée', 'lait de coco', 'creme de coco', 'crème de coco',
  'coco', 'huile de coco',
  // Pecan : pas la "noix" polyol classique
  'noix de pecan', 'noix de pécan', 'pecan', 'pécan',
  // Macadamia : low FODMAP
  'noix de macadamia', 'macadamia',
  // Cacahuète n'est pas une "noix" botanique
  'cacahuete', 'cacahuète', 'cacahuetes', 'cacahuètes',
  'beurre de cacahuete', 'beurre de cacahuète',
  // Pain au levain : low FODMAP malgré "pain"
  'pain au levain', 'levain',
  // Farines sans gluten
  'farine de sarrasin', 'farine de millet', 'farine de quinoa', 'farine de sorgho',
  'farine de tapioca', 'farine de mais', 'farine de maïs', 'farine de riz',
  'sarrasin', 'millet', 'quinoa', 'sorgho', 'tapioca',
  // Pâtes sans blé
  'pates sans gluten', 'pâtes sans gluten', 'pates de riz', 'pâtes de riz',
  'pates de mais', 'pâtes de maïs', 'pates de quinoa', 'pâtes de quinoa',
  // Lait non lactés
  'lait sans lactose', 'lait de riz', 'lait d\'amande', 'lait d\'avoine', 'lait de soja',
  // Yaourts spéciaux
  'yaourt sans lactose', 'yaourt vegetal', 'yaourt végétal',
  // Sucres communs ≠ fructose/miel
  'sucre', 'sucre blanc', 'sucre roux', 'sucre de canne', 'sucre vanille', 'sucre vanillé',
  'sucre glace', 'sucre en poudre', 'sucre semoule', 'cassonade',
  'sirop d\'erable', 'sirop d\'érable',
  // Tomate cerise et tomates classiques (≠ tomates séchées)
  'tomate', 'tomates', 'tomate cerise', 'tomates cerises',
]);

// Normalise un nom d'ingrédient pour le matching FODMAP
function normalizeFodmapName(name) {
  return (name || '').toLowerCase()
    .replace(/œ/g, 'oe').replace(/æ/g, 'ae') // ligatures explicites AVANT NFD
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // sans accents
    .replace(/\([^)]*\)/g, ' ') // sans parenthèses (ex: "Lait (vache)" → "lait")
    .replace(/[^a-z0-9'\s-]/g, ' ') // garde lettres, chiffres, espaces, ', -
    .replace(/\s+/g, ' ')
    .trim();
}

// Détermine si UN ingrédient unique est high FODMAP.
// Retourne true si l'ingrédient matche la liste FODMAP_HIGH, false sinon.
// Les exceptions FODMAP_EXCEPTIONS_LOW priment (ex: "noix de coco" est low malgré "noix").
function isIngredientHighFodmap(ingredientName) {
  const normalized = normalizeFodmapName(ingredientName);
  if (!normalized) return false;

  // 0. Vérifier d'abord les exceptions explicites LOW (priorité absolue)
  // Match exact OU bigramme contenu dans l'exception
  if (FODMAP_EXCEPTIONS_LOW.has(normalized)) return false;
  // Bigrammes pour exceptions composées (ex: "noix de coco rapée fine")
  const wordsAll = normalized.split(/\s+/);
  for (let i = 0; i < wordsAll.length; i++) {
    for (let j = i + 2; j <= Math.min(i + 4, wordsAll.length); j++) {
      const ngram = wordsAll.slice(i, j).join(' ');
      if (FODMAP_EXCEPTIONS_LOW.has(ngram)) return false;
    }
  }

  // 1. Match exact dans FODMAP_HIGH
  if (FODMAP_HIGH.has(normalized)) return true;

  // 2. Match par bigrammes (2 mots adjacents)
  const words = normalized.split(/\s+/).filter(w => w.length > 1 && !FODMAP_STOP_WORDS.has(w));
  for (let i = 0; i < words.length - 1; i++) {
    const bigram = words[i] + ' ' + words[i + 1];
    if (FODMAP_HIGH.has(bigram)) return true;
  }

  // 3. Match par mot individuel
  for (const w of words) {
    if (w.length < 3) continue;
    if (FODMAP_HIGH.has(w)) return true;
  }

  return false;
}

// Calcule les tags FODMAP d'une recette — LOGIQUE BINAIRE STRICTE
// - Si AU MOINS UN ingrédient est dans FODMAP_HIGH → ['high-fodmap']
// - Dans tous les autres cas → ['low-fodmap']
function calculateFodmapTags(ingredients) {
  if (!ingredients || ingredients.length === 0) return ['low-fodmap'];
  for (const ing of ingredients) {
    if (isIngredientHighFodmap(ing.name)) return ['high-fodmap'];
  }
  return ['low-fodmap'];
}

// Wrapper rétrocompatible pour le code existant qui utilisait classifyIngredientFodmap.
// Retourne 'high' si l'ingrédient est dans la liste, 'low' sinon.
function classifyIngredientFodmap(ingredientName) {
  return isIngredientHighFodmap(ingredientName) ? 'high' : 'low';
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
// DÉTECTION DE LA PROTÉINE PRINCIPALE D'UNE RECETTE
// ============================================
// Utilisée par la génération de menu IA pour appliquer les règles :
//   - protéine à chaque repas (sauf max 1 jour/semaine sans)
//   - max 2x viande rouge / semaine
//   - min 2x poisson / semaine
//   - pas 2x la même protéine sur 2 jours consécutifs
//   - min 1 plat 100% végétal / semaine
// On scanne les ingrédients et on retourne le type le plus "fort" trouvé (animal > végétal).

const PROTEIN_KEYWORDS = {
  // Viandes rouges
  'viande-rouge': [
    'boeuf', 'bœuf', 'steak', 'bavette', 'entrecote', 'entrecôte', 'rumsteck', 'faux-filet',
    'bourguignon', 'pot-au-feu', 'paleron', 'gite', 'gîte', 'macreuse', 'tende de tranche',
    'agneau', 'gigot', 'collier d\'agneau', 'epaule d\'agneau', 'épaule d\'agneau',
    'porc', 'echine', 'échine', 'rouelle', 'roti de porc', 'rôti de porc', 'travers de porc',
    'jambon cru', 'lardons', 'lardon', 'poitrine fumee', 'poitrine fumée', 'pancetta',
    'chorizo', 'saucisse', 'saucisson', 'merguez', 'andouillette', 'boudin',
    'sanglier', 'biche', 'chevreuil', 'cerf', 'gibier',
    'canard', 'magret', 'cuisse de canard', 'foie gras', 'gesier', 'gésier'
  ],
  // Viandes blanches
  'viande-blanche': [
    'poulet', 'blanc de poulet', 'cuisse de poulet', 'pilon', 'aile de poulet', 'escalope de poulet',
    'dinde', 'escalope de dinde', 'roti de dinde', 'rôti de dinde',
    'lapin', 'rable de lapin', 'râble de lapin',
    'veau', 'escalope de veau', 'osso bucco', 'blanquette',
    'pintade', 'caille', 'pigeon'
  ],
  // Poissons & fruits de mer
  'poisson': [
    'saumon', 'thon', 'cabillaud', 'morue', 'colin', 'lieu noir', 'lieu jaune',
    'dorade', 'daurade', 'bar', 'loup', 'rouget', 'sardine', 'maquereau', 'hareng',
    'truite', 'merlu', 'merlan', 'sole', 'limande', 'turbot', 'flétan', 'fletan',
    'espadon', 'lotte', 'raie', 'eglefin', 'églefin', 'haddock', 'anchois',
    'crevette', 'crevettes', 'gambas', 'langoustine', 'homard', 'crabe', 'tourteau',
    'moule', 'moules', 'huitre', 'huître', 'huitres', 'huîtres', 'palourde', 'coquille saint-jacques',
    'noix de saint-jacques', 'st-jacques', 'st jacques', 'calamar', 'encornet', 'seiche', 'poulpe',
    'surimi'
  ],
  // Œufs
  'oeuf': [
    'oeuf', 'œuf', 'oeufs', 'œufs', 'jaune d\'oeuf', 'jaune d\'œuf', 'blanc d\'oeuf', 'blanc d\'œuf'
  ],
  // Fromages (source de protéine animale significative quand c'est l'élément principal)
  'fromage': [
    'mozzarella', 'parmesan', 'pecorino', 'ricotta', 'feta', 'comte', 'comté', 'gruyere', 'gruyère',
    'emmental', 'cheddar', 'reblochon', 'raclette', 'chevre', 'chèvre', 'roquefort', 'bleu',
    'camembert', 'brie', 'munster', 'tomme', 'halloumi', 'burrata', 'mascarpone', 'cream cheese'
  ],
  // Légumineuses (protéine végétale)
  'legumineuse': [
    'lentille', 'lentilles', 'lentilles corail', 'lentilles vertes', 'lentilles beluga',
    'pois chiche', 'pois chiches', 'haricot rouge', 'haricots rouges', 'haricot noir', 'haricots noirs',
    'haricot blanc', 'haricots blancs', 'flageolet', 'flageolets', 'cocos', 'azuki',
    'feve', 'fève', 'feves', 'fèves', 'pois casse', 'pois cassé', 'pois cassés',
    'edamame'
  ],
  // Soja & dérivés (protéine végétale)
  'tofu': [
    'tofu', 'tempeh', 'seitan', 'proteines de soja', 'protéines de soja', 'soja texture', 'soja texturé'
  ]
};

// Ordre de priorité : si une recette contient plusieurs types, on retient le plus "principal"
// (l'animal prend le pas sur le végétal pour les règles nutritionnelles classiques)
const PROTEIN_PRIORITY = ['viande-rouge', 'viande-blanche', 'poisson', 'oeuf', 'legumineuse', 'tofu', 'fromage'];

function _normalizeProteinText(s) {
  if (!s) return '';
  return String(s)
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

// Retourne { hasProtein, type } pour une liste d'ingrédients d'une recette.
// type: 'viande-rouge' | 'viande-blanche' | 'poisson' | 'oeuf' | 'fromage' | 'legumineuse' | 'tofu' | null
function detectProteinType(ingredients) {
  if (!Array.isArray(ingredients) || ingredients.length === 0) {
    return { hasProtein: false, type: null };
  }
  const found = new Set();
  for (const ing of ingredients) {
    const name = _normalizeProteinText(ing && ing.name);
    if (!name) continue;
    for (const [type, keywords] of Object.entries(PROTEIN_KEYWORDS)) {
      for (const kw of keywords) {
        const nkw = _normalizeProteinText(kw);
        // Match avec mot délimité (évite "soja" qui matche dans "sauce soja" — qui n'apporte pas de protéine)
        const re = new RegExp(`(^|[^a-z])${nkw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`);
        if (re.test(name)) {
          // Cas particulier : "sauce soja" ne compte pas comme protéine
          if (type === 'tofu' && /sauce\s+soja/.test(name)) break;
          // Cas particulier : "huile" + protéine ne compte pas
          if (/^huile\s/.test(name)) break;
          found.add(type);
          break;
        }
      }
    }
  }
  if (found.size === 0) return { hasProtein: false, type: null };
  // Retenir le type le plus prioritaire trouvé
  for (const t of PROTEIN_PRIORITY) {
    if (found.has(t)) return { hasProtein: true, type: t };
  }
  return { hasProtein: false, type: null };
}

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
