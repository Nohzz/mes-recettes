# Mes Recettes 🍅

Une PWA (Progressive Web App) installable pour gérer vos recettes au quotidien : création assistée par l'IA Claude, bibliothèque organisée par catégories et saison, planning des repas, liste de courses agrégée intelligente, garde-manger, mode cuisine plein écran avec minuteurs, et synchronisation multi-appareils.

Charte graphique terracotta (couleur principale `#B5532A`, accent pêche pop `#FFC994`), typographie Poppins + Lato.

## ✨ Fonctionnalités principales

### 📚 Bibliothèque
- **Catégories** : Apéro, Entrée, Plat, Dessert, Goûter, Petit déjeuner, Boisson, Autre
- **Recherche full-text** : titre, description, ingrédients, tags, notes personnelles **et texte des étapes**
- **Filtres avancés** : saison/mois, ingrédients (« j'ai dans mon frigo... »), fréquence de cuisson, régimes alimentaires
- **Favoris** et tri configurable (récentes, A-Z, dernière cuisson, jamais cuisinées)
- **Saisonnalité Greenpeace** : calendrier officiel français (~250 ingrédients), badges automatiques par mois

### 🤖 Création de recettes
- **Avec IA Claude** : envoyez à l'assistant un lien, des photos, ou une description, il extrait une recette structurée que vous validez
- **Multi-recettes en une requête** : Claude peut extraire plusieurs recettes d'un même message
- **Manuelle** : créez ou modifiez une recette de A à Z
- **Édition inline** : touchez un ingrédient ou une étape pour la modifier directement, sans repasser par le chat
- **Photo personnelle** du plat fini (choix caméra ou galerie)
- **Notes personnelles** (astuces, variantes, retours d'expérience)
- **Tags personnalisés**
- **Source** : livre (titre/auteur/page), site web (URL), Instagram (@compte)
- **Régimes alimentaires** : Vegan, Végétarien, Sans gluten, Sans lactose, Sans sucre, Keto, Halal, Casher
- **Tags FODMAP automatiques** : Low/High FODMAP calculés depuis la liste d'ingrédients (~200 entrées)

### 👨‍🍳 Cuisine en action
- **Mode cuisine plein écran** étape par étape avec anti-veille (écran reste allumé)
- **Minuteurs intégrés aux étapes** : détection automatique des durées dans le texte ("Cuire 30 min", "Reposer 1h30", "1/2 heure"...), tap sur ⏱️ pour lancer
  - Overlay flottant avec affichage `MM:SS`, pause/reprendre/arrêter
  - Alarme à zéro : bips sonores + notification système + vibration
  - Résiste à un refresh ou changement d'app
- **Historique « Faite le X »** : suivi de vos recettes les plus cuisinées, dates passées éditables
- **Portions ajustables** avec quantités recalculées (presets 2/4/6/8)
- **Indicateur garde-manger** : ingrédients déjà chez vous barrés et marqués 📦
- **Partage** de recette (lien natif iOS/Android ou copier-coller)
- **Historique des modifications** (changeLog) : qui a modifié quoi et quand, badge nouvelles modifs

### 🗓 Planning des repas
- **Vue 1 ou 2 semaines** au choix (toggle segmenté avec navigation flèches adaptée)
- **3 slots par jour** : ☀️ Midi, 🌙 Soir, 🥐 Autre (petit-déj/goûter/apéro...)
- **Multi-recettes par slot** : plusieurs plats peuvent partager un repas
- **Picker avec filtres** : tri alphabétique par défaut, recherche, filtre régime (FODMAP en priorité), filtre catégorie, "de saison uniquement"
- **Génération de menu IA** : l'IA propose un menu équilibré (durée 3/7/14j, midi/soir/midi+soir, contraintes texte libre + régimes)
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
- **Backup automatique** mensuel + export/import JSON

### ☁️ Sync entre appareils (optionnel)
- Via Supabase gratuit — voir [SYNC-GUIDE.md](./SYNC-GUIDE.md)
- **Sync recettes** (full document)
- **Sync planning** (cell-level, last-write-wins)
- Foyer partagé : recettes et planning communs entre conjoint·e·s
- **Données privées** : stockées localement par défaut, sur votre Supabase si sync activée

## 📁 Structure du projet

```
recettes-app/
├── index.html          # Structure HTML
├── styles.css          # Design system terracotta (~5000 lignes)
├── data.js             # Catégories, FODMAP, saisonnalité, conversions
├── app.js              # Logique applicative (~6500 lignes)
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
- **Ajouter une catégorie de produit** → `data.js`, tableau `PRODUCT_CATEGORIES`
- **Modifier le prompt système** → `app.js`, constante `SYSTEM_PROMPT`
- **Changer le modèle Claude** → `app.js`, paramètre `model` dans `callClaudeAPI()`
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

**v3.0** — Planning + Garde-manger + Timer + ChangeLog — Bon appétit ! 🍅
