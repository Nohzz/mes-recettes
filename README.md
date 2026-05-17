# Mes Recettes 🍅

Une PWA (Progressive Web App) installable pour gérer vos recettes au quotidien : création assistée par l'IA Claude, bibliothèque organisée par catégories et saison, planning des repas, liste de courses agrégée intelligente, garde-manger, mode cuisine plein écran avec minuteurs, et synchronisation multi-appareils.

Charte graphique terracotta (couleur principale `#B5532A`, accent pêche pop `#FFC994`), typographie Poppins + Lato.

## ✨ Fonctionnalités principales

### 📚 Bibliothèque
- **Catégories** : Apéro, Entrée, Plat, Dessert, Goûter, Petit déjeuner, Boisson, Autre
- **Recherche full-text** : titre, description, ingrédients, tags, notes personnelles **et texte des étapes**
- **Filtres avancés** : saison/mois, ingrédients (« j'ai dans mon frigo... »), fréquence de cuisson, régimes alimentaires, **vérification humaine** (Toutes / ✅ Vérifiées / ☐ À vérifier)
- **Favoris** et tri configurable (récentes, A-Z, dernière cuisson, jamais cuisinées)
- **Saisonnalité Greenpeace** : calendrier officiel français (~250 ingrédients), badges automatiques par mois

### 🤖 Création de recettes
- **Avec IA Claude** : envoyez à l'assistant un lien, des photos, ou une description, il extrait une recette structurée que vous validez
- **Multi-recettes en une requête** : Claude peut extraire plusieurs recettes d'un même message. Pour les photos multiples, **1 photo distincte = 1 recette** (le prompt est explicite)
- **Modal de validation enrichie** : tags, régimes, source, vérification humaine modifiables dès la création
- **Source obligatoire** : Web / Livre / Instagram / ✍️ Perso (pour les recettes maison)
- **Manuelle** : créez ou modifiez une recette de A à Z
- **Édition inline** : touchez un ingrédient ou une étape pour la modifier directement, sans repasser par le chat
- **Photo personnelle** du plat fini :
  - Choix **📸 Caméra** ou **🖼️ Galerie** au moment de l'ajout (Android + iOS)
  - Compression auto en 720px qualité 70% pour économiser le localStorage
  - Photo du chat automatiquement rattachée à la recette créée
- **Notes personnelles** (astuces, variantes, retours d'expérience)
- **Tags personnalisés**
- **Régimes alimentaires** : 5 régimes essentiels par défaut — Végétarien, Sans gluten, Sans lactose, Low FODMAP, High FODMAP (liste extensible via `DIET_TAGS` dans `data.js`)
- **Tags FODMAP automatiques** : Low/High FODMAP calculés depuis la liste d'ingrédients (~200 entrées), recalculés à chaque sauvegarde et au démarrage pour les recettes existantes. Logique binaire stricte : une recette est soit Low, soit High (plus de `unknown`)
- **Détection automatique de la protéine principale** : chaque recette se voit attribuer un `proteinType` (viande-rouge, viande-blanche, poisson, œuf, fromage, légumineuse, tofu, ou aucune). Utilisé par la génération de menu IA pour appliquer des règles nutritionnelles intelligentes
- **Tag « Vérifié humain »** : checkbox pour distinguer les recettes que vous avez relues/validées après extraction IA. Chip vert sur la fiche, filtrable depuis la bibliothèque
- **Drag-to-reorder mobile** : long-press 0.4s sur la poignée ⋮⋮ d'un ingrédient ou d'une étape pour le déplacer dans la modal de validation

### 👨‍🍳 Cuisine en action
- **Mode cuisine plein écran** étape par étape avec anti-veille (écran reste allumé)
- **Ingrédients par étape précis** : système `ingredientUses` qui distingue
  - **Utilisation active** (« Beurrer le moule » → affiche le beurre)
  - **Référence pure** (« Une fois le brocoli cuit » → n'affiche rien, déjà utilisé)
  - **Quantités partielles** : si un ingrédient est divisé (ex: 100g pour la pâte + 30g pour le moule), chaque étape affiche sa portion + note explicative
- **Bouton 🪄 « Recalculer ingrédients-étapes »** :
  - Accessible via le menu kebab ⋮ à côté du titre « Étapes »
  - Global dans Paramètres → Outils IA (toutes les recettes en une fois)
  - Sauvegarde automatique de l'ancien état + bouton « ↶ Restaurer l'ancien » dans le même menu
- **Minuteurs intégrés aux étapes** : détection automatique des durées dans le texte ("Cuire 30 min", "Reposer 1h30", "1/2 heure"...), tap sur ⏱️ pour lancer
  - Overlay flottant avec affichage `MM:SS`, pause/reprendre/arrêter
  - Alarme à zéro : bips sonores + notification système + vibration
  - Résiste à un refresh ou changement d'app
- **Historique « Faite le X »** : suivi de vos recettes les plus cuisinées, dates passées éditables. Toast contextuel encourageant à chaque cuisson (🎉 1ère fois, 🔥 5×, ⭐ 10×…)
- **Portions ajustables** avec quantités recalculées (presets 2/4/6/8) — bloc compact unifié
- **Indicateur garde-manger** : ingrédients déjà chez vous barrés et marqués 📦. Sous la liste : double pill `📦 X chez vous` + `🛒 Y à acheter`
- **Partage** de recette (lien natif iOS/Android ou copier-coller)
- **Historique des modifications** (changeLog) : qui a modifié quoi et quand, badge nouvelles modifs

### 🍽️ Fiche recette (UX/UI refondue v3.5)
- **Sticky action bar** en bas de la fiche : « Mode cuisine » + « Ajouter aux courses » toujours à portée de pouce, sans scroller
  - Mode planning : se transforme en « 🔄 Changer / ✓ Valider » ou « ✓ Confirmer le changement » selon le contexte
- **Hero compact** : 3 boutons visibles (★ Favori, 📤 Partager, ⋮ Plus) — kebab range « Modifier (formulaire complet) » et « 🗑️ Supprimer » pour éviter les appuis accidentels
- **Photo avec call-to-action** : pillule « 📷 Ajouter une photo » qui pulse doucement quand la fiche n'a pas encore d'image
- **Icônes ✏️ discrètes** sur le titre et la description pour signaler les zones éditables (plus visibles au tap)
- **Bloc Portions compact** : fusion `[−/X/+] + presets 2/4/6/8` en une seule carte (au lieu de 2 blocs séparés)
- **Numérotation des étapes** : ronds terracotta 30px avec ombre douce pour mieux jalonner la lecture
- **Compteurs dans les titres** : « Ingrédients (12) », « Étapes (8) » pour un aperçu visuel immédiat
- **Meta-bar en 2 groupes** : factuel (tags, régimes, source) puis validation (cuisson, vérifié, changelog), séparés par un trait pointillé subtil
  - La chip « ☐ À vérifier » n'apparaît plus que pour les recettes extraites par IA (jamais sur une recette saisie manuellement)
- **Chip cuisson avec code couleur de fraîcheur** : vert < 14 jours, neutre 14-60 j, gris > 60 j
- **Bouton retour intelligent** : `history.back()` qui préserve la provenance (library / planning / shopping / search) plutôt que de toujours retomber sur la bibliothèque
- **Libellé clair** : « ✓ J'ai cuisiné cette recette aujourd'hui » (au lieu du flou « J'ai fait cette recette »)

### 🗓 Planning des repas
- **Vue 1 ou 2 semaines** au choix (toggle segmenté avec navigation flèches adaptée)
- **3 slots par jour** : ☀️ Midi, 🌙 Soir, 🥐 Autre (petit-déj/goûter/apéro...)
- **Multi-recettes par slot** : plusieurs plats peuvent partager un repas
- **Titres complets visibles** sur jusqu'à 3 lignes dans la cellule (plus d'ellipsis frustrante)
- **Clic sur une recette = fiche détaillée** dans le contexte planning, avec 2 boutons :
  - 🔄 **Changer** : ouvre le picker pour remplacer cette recette précise
  - ✓ **Valider le choix** : revient au planning
- **Flux de remplacement à 2 étapes** : dans le picker, cliquer sur une candidate ouvre sa fiche complète. Un bouton **Confirmer le changement** finalise le swap en préservant les portions et la position dans le slot
- **Picker avec filtres ciblés** : tri alphabétique, recherche, régime, catégorie (replié), « De saison uniquement »
- **Génération de menu IA très avancée** : prompt structuré qui applique 6 règles configurables (toutes activables/désactivables) :
  - 🥩 **Protéine à chaque repas** (max 1 jour/semaine sans)
  - 🔄 **Pas 2× la même protéine sur 2 jours consécutifs**
  - ⚖️ **Quotas nutrition hebdo** : ≥2 poissons, ≤2 viandes rouges, ≥1 plat 100% végétal
  - ☯️ **Équilibre lourd ↔ léger** sur la journée
  - 🏖️ **Rapide en semaine, festif le weekend**
  - 🍱 **Batch cooking** : maximise les paires de slots consécutifs avec la même recette (badge automatique sur les slots concernés)
- **Préférences persistantes** : les 6 toggles sont accessibles **à la fois dans Paramètres → 📅 Génération de menu IA** et dans la modal de génération (collapse « ⚡ Préférences d'optimisation »), synchronisés en temps réel
- **Feedback de progression** : l'IA affiche des messages narratifs (« Analyse de vos recettes… », « Application des règles nutritionnelles… », « Optimisation des choix… ») pendant l'appel pour rendre l'attente moins anxiogène
- **Validation pas-à-pas** : aperçu des recettes proposées, possibilité de remplacer chaque repas avant validation

### 🛒 Liste de courses
- **Plusieurs listes** en parallèle (« Cette semaine », « Apéro samedi »...)
- **Fusion intelligente** : ingrédients identiques fusionnés (parenthèses ignorées)
- **Organisation par rayons** : Fruits & Légumes, Boucherie, Crèmerie, Épicerie, etc.
- **Garde-manger** : marquer « j'ai déjà » pour cacher l'ingrédient X jours
  - Durée par défaut configurable (3/7/14/30/60 jours)
  - Indicateur **urgent** orange quand expiration ≤ 1 jour
  - Chips cliquables pour prolonger ou retirer
- **Conversion d'unités** automatique (ml + cuillères → ml)
- **Anti-courses** : sel, poivre, eau exclus automatiquement
- **Du planning vers la liste** : un bouton ajoute tous les repas planifiés aux courses

### 🧰 Confort
- **Installable** sur Android (Chrome) ou iOS (Safari) comme une vraie app
- **Mode sombre** (clair / sombre / auto)
- **Dialogs à la charte** : plus de popups natives `nohzz.github.io indique...` du navigateur
- **Bouton retour OS** : navigation native Android/iOS respectée
- **Responsive** : optimisé mobile, tablette et desktop
- **Skeleton placeholders** : la bibliothèque affiche des cartes-fantômes animées (shimmer) pendant le tout premier chargement, plus jamais d'écran blanc/vide
- **Toasts différenciés** : ✓ pour succès (terracotta), ⚠️ pour erreur (rouge), ℹ️ pour info (gris). Apparition cohérente partout dans l'app
- **Backup automatique** mensuel + export/import JSON

### ⚙️ Paramètres repensés
- **Style mobile-first façon iOS** : sections regroupées en cartes blanches arrondies (🔒 Sécurité, 🎨 Apparence, 🪄 IA & génération, 🍽️ Génération de menu IA, ☁️ Synchronisation, 📦 Garde-manger, 💾 Données, ⚠️ Zone dangereuse)
- **Titres de sections sticky** : restent figés en haut pendant le scroll pour aider l'orientation, avec ombre dynamique au sticking
- **Champs sensibles masqués par défaut** : clé API et identifiants Supabase en `type="password"`, bouton 👁️ pour révéler temporairement
- **Badge ✓ Configurée** : confirmation visuelle persistante à côté du label « Clé API Claude » quand une clé est saisie
- **Compteur de caractères** sur le textarea de contraintes de la génération IA (max 500), passe en terracotta gras à 80%
- **Zone dangereuse séparée** : le bouton « Tout supprimer » est isolé visuellement avec bordure rouge

### 🔒 Sécurité locale
- **Obfuscation des secrets dans `localStorage`** : la clé API Anthropic et les identifiants Supabase (URL, clé anon, code foyer) sont stockés avec un XOR + base64 dérivé de `location.origin`. Préfixés par `enc1:`.
- **Objectif** : empêcher la lecture en clair via l'onglet Application → Local Storage des devtools ou un dump d'extension navigateur. **Ce n'est pas une protection cryptographique forte** : un attaquant qui peut exécuter du JS dans l'origine peut toujours déchiffrer.
- **Migration transparente** : au prochain démarrage, les valeurs précédemment en clair sont automatiquement ré-écrites en obfusqué. Aucune action utilisateur requise.

### ☁️ Sync entre appareils (optionnel)
- Via Supabase gratuit — voir [SYNC-GUIDE.md](./SYNC-GUIDE.md)
- **Sync recettes** (full document)
- **Sync planning** (cell-level, last-write-wins)
- Foyer partagé : recettes et planning communs entre conjoint·e·s
- **Données privées** : stockées localement par défaut, sur votre Supabase si sync activée. Les credentials Supabase eux-mêmes sont obfusqués localement (voir Sécurité locale ci-dessus)

## 📁 Structure du projet

```
recettes-app/
├── index.html          # Structure HTML
├── styles.css          # Design system terracotta (~6300 lignes)
├── data.js             # Catégories, FODMAP, saisonnalité, conversions, protéines
├── app.js              # Logique applicative (~8000 lignes)
├── manifest.json       # Configuration PWA
├── sw.js               # Service Worker (offline + auto-update)
└── icons/              # Icônes app (192, 512, maskable, etc.)
```

## 🚀 Déploiement

L'app est 100% statique (HTML/CSS/JS, aucune dépendance NPM, aucun bundler). Vous pouvez la déployer sur n'importe quel hébergeur statique gratuit.

### GitHub Pages (recommandé)

1. Créez un repo GitHub public (ex: `mes-recettes`)
2. Uploadez tous les fichiers du dossier `recettes-app/` à la racine du repo
3. Settings → Pages → Source : `main` branch + `/ (root)` → Save
4. Attendez 1-2 minutes
5. URL : `https://<votre-username>.github.io/mes-recettes/`

### Netlify / Vercel

- **Netlify** : créez un compte sur [netlify.com](https://www.netlify.com), glissez-déposez le dossier
- **Vercel** : `npm i -g vercel` puis `vercel` dans le dossier

### Test en local

```bash
cd recettes-app
python3 -m http.server 8000
# Ouvrez http://localhost:8000
```

⚠️ Pour que l'app soit installable et que le Service Worker fonctionne, il **faut HTTPS** (sauf en `localhost`). Préférez GitHub Pages / Netlify / Vercel à un simple serveur HTTP.

## 📲 Installer sur smartphone

### Android (Chrome)

1. Ouvrez l'URL de l'app dans **Chrome**
2. Bannière « Ajouter à l'écran d'accueil » → tapez
3. Sinon : menu ⋮ → « Installer l'application »

### iOS (Safari)

1. Ouvrez l'URL dans **Safari** (Chrome iOS ne supporte pas l'installation PWA)
2. Bouton **Partager** (carré avec flèche) → « Sur l'écran d'accueil »

### Permissions à autoriser

- **Notifications** (au premier minuteur déclenché) : autorise les alarmes de fin de cuisson en arrière-plan
- **Caméra/Photos** (premier ajout de photo) : pour prendre/choisir la photo du plat

## 🔑 Configurer l'IA Claude

L'IA est **optionnelle**. L'app fonctionne en mode démo (création manuelle) si vous ne configurez pas la clé.

1. Créez un compte sur [console.anthropic.com](https://console.anthropic.com)
2. **API Keys** → « Create Key »
3. Copiez la clé (`sk-ant-api03-...`)
4. Dans l'app : ⚙️ Paramètres → Clé API Claude → coller → Enregistrer

**Coûts indicatifs** :
- ~0,02€ par création de recette
- ~0,03€ avec Web Search activé
- ~0,01€ par génération de menu planning (selon taille bibliothèque)

Anthropic offre du crédit gratuit à l'inscription.

> 🔒 La clé est stockée uniquement dans le `localStorage` de votre navigateur. Elle n'est jamais envoyée ailleurs qu'à l'API Anthropic.

## ☁️ Synchronisation entre appareils

Pour partager vos recettes et votre planning entre plusieurs téléphones (ex: vous et votre conjoint·e), utilisez la sync Supabase gratuite.

Procédure complète : voir **[SYNC-GUIDE.md](./SYNC-GUIDE.md)** (~10 min de configuration).

La sync couvre :
- **Recettes** : full-document, last-write-wins par recette
- **Planning** : cell-level, last-write-wins par case (jour × créneau)

## 🎨 Charte graphique

| Token CSS | Hex | Usage |
|---|---|---|
| `--color-primary` | `#B5532A` | Terracotta profond (CTA, titres) |
| `--color-primary-dark` | `#8C3F1E` | Variante foncée |
| `--color-primary-soft` | `#F4B886` | Sable doré (cartes recettes) |
| `--color-primary-pale` | `#FFE0BF` | Pêche pâle (chips actifs) |
| `--color-primary-cream` | `#FBEFE2` | Crème (fonds doux) |
| `--color-accent` | `#FFC994` | Pêche pop (badges, FAB) |
| `--color-surface` | `#FFFFFF` | Cartes, modals |
| `--color-bg` | `#FAF6F0` | Fond app |
| `--color-brown-100` | `#FAEAD5` | Touches chaleureuses |

Typographie : **Poppins** (titres, 600-900) + **Lato** (corps, 400-900).

## 🛠️ Personnalisation

L'app n'a aucune dépendance NPM. Modifiez les fichiers sources directement.

- **Ajouter un ingrédient à la saisonnalité** → `data.js`, objet `SEASONALITY`
- **Ajouter à la base FODMAP** → `data.js`, sets `FODMAP_LOW` ou `FODMAP_HIGH`
- **Ajouter à la base protéines** → `data.js`, objet `PROTEIN_KEYWORDS` (utilisé par la génération de menu IA)
- **Ajouter une catégorie de produit** → `data.js`, tableau `PRODUCT_CATEGORIES`
- **Modifier le prompt système** → `app.js`, constante `SYSTEM_PROMPT`
- **Modifier le prompt de génération de menu** → `app.js`, fonction `runPlanningMenuGenerator()` (sections `ruleLines`)
- **Changer le modèle Claude** → `app.js`, paramètre `model` dans `callClaudeAPI()` (actuellement `claude-sonnet-4-6`)
- **Ingrédients exclus des courses** → `data.js`, tableau `SHOPPING_EXCLUDE`
- **Conversions d'unités** → `data.js`, objet `UNIT_CONVERSIONS`
- **Régimes alimentaires** → `data.js`, tableau `DIET_TAGS`

## 🆘 Mises à jour

L'app utilise un Service Worker en mode **network-first** : les fichiers se mettent à jour automatiquement à chaque ouverture si vous avez du réseau.

Si vous ne voyez pas la dernière version :
- ⚙️ Paramètres → 🔄 « Vérifier les mises à jour »
- Ou désinstallez/réinstallez l'app pour mettre à jour aussi l'icône (limitation PWA)

## 📜 Licence

Code librement réutilisable.

---

**v3.5** — Fiche recette refondue : sticky action bar (Mode cuisine + Courses) · Hero compact avec kebab Modifier/Supprimer · Photo pulse pour CTA · Crayon ✏️ d'édition inline · Bloc portions unifié · Meta-bar en 2 groupes (factuel/validation) · Chip cuisson par fraîcheur · Toasts cuisson contextuels (🎉 1ère fois, 🔥 5×, ⭐ 10×) · Pill « X à acheter » · Numérotation étapes en pop · Compteurs (N) dans les titres · Bouton retour intelligent — Bon appétit ! 🍅

**v3.4** — Génération de menu IA musclée (détection protéine + 6 règles configurables + batch cooking) · Clic recette planning → fiche détail avec changement guidé · Paramètres refondus mobile-first iOS · Obfuscation locale des secrets · Drag-to-reorder ingrédients/étapes · Feedback IA progressif · Skeleton placeholders · Toasts différenciés

**v3.2** — Source obligatoire + Vérification humaine + Ingrédients-étapes précis + FODMAP auto + Photo Caméra/Galerie + Recalcul IA
