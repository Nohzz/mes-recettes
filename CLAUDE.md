# CLAUDE.md — Briefing pour Claude Code

Ce fichier est lu automatiquement par Claude Code à l'ouverture du projet. Il contient tout ce qu'il faut savoir pour travailler efficacement sur ce repo.

## 🎯 Projet : Mes Recettes (PWA)

App de gestion de recettes en français déployée sur GitHub Pages : https://nohzz.github.io/mes-recettes.

PWA installable iOS/Android avec :
- Création de recettes assistée par l'IA Claude (API Anthropic)
- Planning des repas multi-semaines
- Liste de courses intelligente
- Garde-manger
- Mode cuisine avec minuteurs
- Sync optionnelle via Supabase (last-write-wins)

**L'utilisateur est francophone**. Toutes les réponses, commentaires de code, et messages d'erreur doivent être en **français**. **Tutoiement** dans les échanges.

## 🏗 Stack technique — contraintes strictes

- **Vanilla HTML/CSS/JS** : **aucune dépendance NPM, aucun bundler, aucun build step**
- Toute la logique est dans `app.js` (~7500 lignes, monolithique assumé jusqu'à un futur refactor)
- Storage : `localStorage` (5-10 MB max selon navigateur)
- Service Worker : network-first pour auto-update
- PWA : `manifest.json` + icônes 192/512/maskable
- IA : appel direct à l'API Anthropic via `callClaudeAPI()` dans `app.js`, modèle `claude-sonnet-4-6`
- Sync : Supabase optionnel (tables `recipes` et `planning`)
- Hébergement : GitHub Pages (statique, HTTPS gratuit)
- Repo : `Nohzz/mes-recettes`

**Ne JAMAIS proposer** : npm/yarn install, webpack, vite, React, Vue, TypeScript, Tailwind compilé, SCSS, ou tout outil nécessitant un build. Le projet doit rester directement servable en static.

## 📁 Structure du projet

```
recettes-app/
├── index.html         # Structure HTML (~500 lignes)
├── styles.css         # Design system terracotta (~5800 lignes)
├── data.js            # Catégories, FODMAP, saisonnalité, conversions, DIET_TAGS (~720 lignes)
├── app.js             # Logique applicative (~7500 lignes)
├── manifest.json      # Configuration PWA
├── sw.js              # Service Worker (offline + auto-update)
├── icons/             # Icônes app (192, 512, maskable)
├── README.md          # Documentation utilisateur/déploiement
├── SYNC-GUIDE.md      # Procédure de configuration Supabase
└── CLAUDE.md          # Ce fichier
```

## 🎨 Charte graphique

Tokens CSS (dans `styles.css`) :

| Variable | Hex | Usage |
|---|---|---|
| `--color-primary` | `#B5532A` | Terracotta profond (CTA, titres) |
| `--color-primary-dark` | `#8C3F1E` | Variante foncée |
| `--color-primary-soft` | `#F4B886` | Sable doré (cartes recettes) |
| `--color-primary-pale` | `#FFE0BF` | Pêche pâle (chips actifs) |
| `--color-primary-cream` | `#FBEFE2` | Crème (fonds doux) |
| `--color-accent` | `#FFC994` | Pêche pop (badges, FAB) |
| `--color-surface` | `#FFFFFF` | Cartes, modals |
| `--color-bg` | `#FAF6F0` | Fond app |

**Typographie** : Poppins (titres, 600-900) + Lato (corps, 400-900). Chargées via Google Fonts.

**Toujours utiliser les variables CSS**, jamais de couleurs en dur dans `styles.css`. Pour un nouveau composant, réutiliser les tokens existants en priorité.

## 🔑 Architecture du code

- **`app.js` monolithique** (~7500 lignes). Refactor en modules ES6 prévu mais non commencé (feature #13)
- **State global** : objet `state` contenant `recipes`, `planning`, `shopping`, `pantry`, `prefs`, `sync`, `_viewScrolls`, etc.
- **Pattern window globals** : toutes les fonctions appelées depuis le HTML (`onclick="..."`) sont exposées via `window.funcName = funcName`. Quand tu ajoutes une fonction utilisée en `onclick`, **n'oublie pas le `window.X = X`**, sinon ça plante en runtime
- **17+ fonctions async** : à cause du système de dialogs custom (`uiAlert`, `uiConfirm`, `uiPrompt`) qui retournent des Promises. Toute fonction qui appelle l'un de ces dialogs doit être `async`
- **Dialogs custom** :
  - `_ensureDialogModal()`, `_showDialog()` — base
  - `_showIngredientEditDialog()`, `_showStepEditDialog()` — édition inline
  - `_showPhotoSourceDialog()`, `_showChatPhotoSourceDialog()` — Caméra/Galerie
- **Système de retour OS** : `pushOverlay()` + listener `popstate` pour intégration au bouton retour Android/iOS
- **Migrations versionnées** : flags localStorage (`mr_seasonality_version`, `mr_steps_enrich_version`, `mr_uses_version`, `mr_fodmap_version`) pour re-traiter les données existantes une seule fois au boot
- **Sauvegarde scroll** : `state._viewScrolls = { library, planning, shopping }` mémorise la position de chaque vue pour restaurer au retour

## 🧠 Comportement IA Claude dans l'app

L'API Anthropic est appelée à 3 endroits :

1. **Extraction de recettes** (URL/photo/texte → JSON structuré) — prompt système ~`SYSTEM_PROMPT`
2. **Génération de menu planning** (depuis la bibliothèque)
3. **Recalcul ingrédients-étapes** (analyse sémantique des étapes) — prompt `RECALC_PROMPT`

Le **matching texte des étapes ↔ ingrédients** est doublé d'un fallback `enrichStepIngredientIds()` côté client :
- Matching textuel tolérant (stop-words, variantes singulier/pluriel)
- Détection des verbes dérivés (saler, beurrer, sucrer, fariner...) via `DERIVED_VERB_RULES`
- Détection des références pures (« une fois X cuit », « mélange de X ») pour ne PAS rajouter l'ingrédient
- L'IA oublie parfois, on rattrape ; l'IA met parfois en trop, on n'enlève pas

## 🍽️ Régimes alimentaires et FODMAP

`DIET_TAGS` dans `data.js` : actuellement **5 régimes** affichés partout (Végétarien, Sans gluten, Sans lactose, Low FODMAP, High FODMAP). Pour rétablir d'autres régimes (vegan, keto, halal, casher, sans-sucre), il suffit de les rajouter dans ce tableau, ils réapparaissent automatiquement partout.

**FODMAP — logique binaire stricte** :
- Si AU MOINS UN ingrédient matche `FODMAP_HIGH` → `['high-fodmap']`
- Sinon → `['low-fodmap']`
- Plus de `unknown`. Une recette est forcément l'une ou l'autre
- `FODMAP_EXCEPTIONS_LOW` prend la priorité (ex: "noix de coco" est low malgré le mot "noix" qui est dans HIGH)
- Calcul dans `calculateFodmapTags()` dans `data.js`
- Migration auto au boot via `mr_fodmap_version`

## 🔧 Conventions de travail

### Process de livraison (CRITIQUE — déjà mordu plusieurs fois)

1. **Workspace dev** : `./` (root du repo) — modifications directes
2. **Copier explicitement chaque fichier** vers le destination ZIP avant package :
   ```bash
   cp app.js /destination/app.js
   cp styles.css /destination/styles.css
   # ... un par un
   ```
3. ❌ **NE PAS utiliser** `cp *.{js,css,html}` — la brace expansion **échoue silencieusement** dans certains shells (bash dans containers, sh)
4. **Vérifier les tailles workspace ↔ output IDENTIQUES** avant de zipper :
   ```bash
   wc -c app.js /destination/app.js
   # Doivent être strictement égales
   ```
5. Recréer le ZIP propre : `rm -f recettes-app.zip && zip -r recettes-app.zip recettes-app/`

### Validation syntaxe

Après chaque modification de `app.js` ou `data.js` :
```bash
node -c app.js && node -c data.js && echo "✓ Syntaxe OK"
```

Pour `styles.css` et `index.html`, vérification visuelle nécessaire (pas de linter strict).

### Tests

- **Privilégier les greps** quand possible : compter les occurrences, vérifier la présence de symboles, c'est rapide
- **Tests unitaires JS** dans `/tmp/test_*.js` avec `eval()` du fichier `data.js` ou extraction de fonctions de `app.js`
- **Playwright** : 1-2 captures par feature **max**. Économiser le quota d'images sur Claude.ai
- **Timeouts Playwright** : l'env sature après plusieurs tests. Si timeout, ne pas paniquer, vérifier avec test minimal via `file://`

### Qualité du code

- **Toujours échapper avec `escapeHtml()`** quand on construit du HTML depuis des données utilisateur (XSS)
- **Préserver le scroll** dans `renderRecipeDetail()` : la fonction sauvegarde déjà `mainContent.scrollTop` au début et la restaure avec `requestAnimationFrame`
- **Photo compression** : 720px qualité 70%. Surtout pas plus haut (localStorage limité)
- **`loading="lazy"`** sur toutes les `<img>` qui ne sont pas dans le viewport initial
- **Pas de feature creep** : implémenter exactement ce qui est demandé, proposer le reste séparément
- **Migrations douces** : ajouter un flag `mr_*_version`, faire la migration une fois, sauvegarder le flag

### Style des réponses

- Tutoiement, ton direct et pragmatique
- Pas de flagornerie (« excellente idée ! », « parfait ! »)
- Aller à l'essentiel
- Audit honnête avant de coder quand l'utilisateur demande une optimisation
- Si une feature est déjà faite, le signaler avant de la recoder
- Si un test échoue à cause de l'environnement Playwright (timeout, EPIPE), ne pas paniquer et packager quand même si le code est sain

## ⚠️ Pièges connus

1. **Brace expansion `{}` dans cp/ls** : ne marche pas dans plusieurs shells (sh, dash, bash containers). **Toujours expansion explicite**, fichier par fichier
2. **Playwright timeouts** : l'env sature après plusieurs tests. Ne pas conclure que le code est cassé — relancer avec un test minimal
3. **innerHTML + données utilisateur** : XSS garanti si oubli d'`escapeHtml()`
4. **localStorage limité** : ~5-10 MB. Les photos s'accumulent vite — compression 720px qualité 70% obligatoire
5. **iOS Safari** : seul navigateur permettant l'installation PWA sur iOS (Chrome iOS ne le permet pas)
6. **PWA et icône** : changer l'icône nécessite une réinstallation manuelle (limitation iOS/Android, pas un bug)
7. **Ligature `œ`** : `normalize('NFD')` ne la décompose pas. **Toujours remplacer `œ → oe` AVANT la normalisation**, sinon "œufs" devient " ufs" (avec espace). Idem pour `æ`
8. **`window.X = X` après chaque nouvelle fonction onclick** : sinon `Uncaught ReferenceError: X is not defined` en runtime, et la fonction n'est pas trouvable dans le HTML
9. **Sync limitation** : la sync planning ne supporte qu'**une recette par créneau** (le schéma SQL utilise `recipe_id` simple, pas un tableau). L'app permet plusieurs recettes par slot mais seule la première est synchronisée
10. **Modèle Claude** : utiliser `claude-sonnet-4-6` (string exacte) dans les appels API. Pas `claude-3-5-sonnet`, pas `claude-sonnet-4`. Le suffixe `-6` est critique

## 📋 Backlog connu

- **#13** Refactor architectural en modules ES6 (gros chantier, sans bénéfice utilisateur visible)
- **#14** Tests automatisés GitHub Actions (Playwright en CI)
- **#15** Export PDF d'une recette (window.print + @media print, ou jsPDF)
- **#16** Sync planning multi-recettes par slot (nécessite modification du schéma SQL Supabase)

## 🚀 Démarrer une session

Quand on reprend le projet, voici les commandes utiles pour se mettre en jambes :

```bash
# Vérifier la syntaxe
node -c app.js && node -c data.js && echo "✓"

# Voir l'arbre
ls -la

# Compter les lignes
wc -l app.js styles.css data.js index.html

# Servir localement pour tester (Python ou Node)
python3 -m http.server 8080
# puis ouvrir http://localhost:8080

# Tester la syntaxe avant chaque commit
node -c app.js && node -c data.js
```

## 📝 Versions actuelles

- **v3.3** (en cours) : FODMAP binaire stricte + 5 régimes essentiels + Retour avec contexte préservé
- **v3.2** : Source obligatoire + Vérification humaine + Ingrédients-étapes précis + FODMAP auto + Photo Caméra/Galerie + Recalcul IA
- **v3.0** : Planning + Garde-manger + Timer + ChangeLog + Édition inline + Photo caméra/galerie + Recherche dans étapes
- app.js : ~298 KB / ~7500 lignes
- styles.css : ~123 KB / ~5800 lignes
- data.js : ~33 KB / ~720 lignes
- ZIP livrable : ~582 KB

## 💬 Référence rapide — fonctions principales

| Fonction | Rôle |
|---|---|
| `renderLibrary()` | Affiche la bibliothèque avec filtres + tri |
| `renderRecipeDetail(recipe)` | Affiche la fiche recette (préserve le scroll) |
| `openRecipe(id)` | Navigation vers une recette |
| `navigateTo(view, data)` | Changement de vue avec historique |
| `_renderView(view, data)` | Rendu pur sans toucher à l'historique |
| `saveRecipes()` | Persistance localStorage |
| `saveValidatedRecipe()` | Sauve une recette créée/modifiée (recalcule FODMAP) |
| `calculateFodmapTags(ingredients)` | Logique binaire : retourne `['high-fodmap']` ou `['low-fodmap']` |
| `enrichStepIngredientIds(steps, ingredients)` | Matching textuel des ingrédients dans les étapes |
| `getStepIngredientUses(step, ingredients)` | Helper unifié : lit `ingredientUses` (nouveau) ou `ingredientIds` (ancien) |
| `recalcSingleRecipe(id)` | Demande à l'IA de recalculer les ingrédients-étapes |
| `recalcAllRecipes()` | Recalcul global de toutes les recettes |
| `toggleVerifiedByHuman(id)` | Toggle du tag "Vérifié humain" |
| `processImage(file)` | Compression image 720px qualité 70% |
| `callClaudeAPI(messages, options)` | Wrapper autour de l'API Anthropic |
| `escapeHtml(str)` | Échappement XSS pour innerHTML |
| `uiAlert(msg)` / `uiConfirm(msg, opts)` / `uiPrompt(msg, opts)` | Dialogs async customs |
