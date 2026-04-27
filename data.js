// ============================================
// DONNÉES DE RÉFÉRENCE
// ============================================

// Catégories de produits pour la liste de courses (basées sur la charte Greenweez)
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
