# Mes Recettes 🍅

Une PWA (Progressive Web App) installable pour gérer vos recettes au quotidien : création assistée par IA Claude, bibliothèque organisée par catégories et saison, liste de courses agrégée intelligente, mode cuisine plein écran, sync entre appareils, et mode sombre.

Charte graphique terracotta (couleur principale `#B5532A`, accent pêche pop `#FFC994`), typographie Poppins + Lato.

## ✨ Fonctionnalités principales

### Bibliothèque
- 📚 **Recettes par catégories** : Apéro, Entrée, Plat, Dessert, Goûter, Petit déjeuner, Boisson, Autre
- 🔍 **Recherche** par nom, ingrédient, tag ou notes personnelles
- 🎚 **Filtres avancés** : saison/mois, ingrédients (« j'ai dans mon frigo... »), fréquence de cuisson
- ⭐ **Favoris** et tri configurable (récentes, A-Z, dernière cuisson)
- 🥕 **Recherche inversée** par ingrédients

### Création de recettes
- 🤖 **Avec IA** : envoyez à l'assistant un lien, des photos, ou une description, il extrait une recette structurée que vous validez
- ✏️ **Manuelle** : créez ou modifiez une recette de A à Z
- 📷 **Photo personnelle** du plat fini (caméra ou galerie)
- 📝 **Notes personnelles** (astuces, variantes, retours d'expérience)
- 🏷 **Tags personnalisés**
- ⏱ **Durées** prep/cuisson détectées automatiquement par l'IA

### Cuisine en action
- 👨‍🍳 **Mode cuisine plein écran** étape par étape avec anti-veille
- ✓ **Historique « Faite le X »** : suivi de vos recettes les plus cuisinées
- ⚙️ **Portions ajustables** avec quantités recalculées (presets 2/4/6/8)
- 🔗 **Partage** de recette (lien natif iOS/Android ou copier-coller)

### Liste de courses
- 🛒 **Plusieurs listes** en parallèle (« Cette semaine », « Apéro samedi »...)
- 🤝 **Fusion intelligente** : ingrédients identiques fusionnés (parenthèses ignorées)
- 📦 **Garde-manger** : marquer « j'ai déjà » pour cacher 7 jours
- 🔄 **Conversion d'unités** automatique (ml + cuillères → ml)
- 🚫 **Anti-courses** : sel, poivre, eau exclus automatiquement

### Pratique
- 📱 **Installable** sur Android (Chrome) ou iOS (Safari) comme une vraie app
- 🌙 **Mode sombre** (clair / sombre / auto)
- ☁️ **Sync entre appareils** via Supabase (gratuit, optionnel) — voir [SYNC-GUIDE.md](./SYNC-GUIDE.md)
- 🔒 **Données privées** : stockées localement par défaut, sur votre Supabase si sync activée
- 📤 **Export/Import** JSON, **backup automatique** mensuel
- ⬅️ **Bouton retour OS** : navigation native Android/iOS respectée
- 📐 **Responsive** : optimisé mobile, tablette et desktop

## 📁 Structure du projet

```
recettes-app/
├── index.html          # Structure HTML
├── styles.css          # Design system terracotta
├── data.js             # Catégories, saisonnalité, conversions d'unités
├── app.js              # Logique applicative
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

## 🔑 Configurer l'IA Claude

L'IA est **optionnelle**. L'app fonctionne en mode démo (création manuelle) si vous ne configurez pas la clé.

1. Créez un compte sur [console.anthropic.com](https://console.anthropic.com)
2. **API Keys** → « Create Key »
3. Copiez la clé (`sk-ant-api03-...`)
4. Dans l'app : ⚙️ Paramètres → Clé API Claude → coller → Enregistrer

**Coûts** : ~0,02€ par création de recette, ~0,03€ avec Web Search activé. Anthropic offre du crédit gratuit à l'inscription.

> 🔒 La clé est stockée uniquement dans le `localStorage` de votre navigateur. Elle n'est jamais envoyée ailleurs qu'à l'API Anthropic.

## ☁️ Synchronisation entre appareils

Pour partager vos recettes entre plusieurs téléphones (ex: vous et votre conjoint·e), utilisez la sync Supabase gratuite.

Procédure complète : voir **[SYNC-GUIDE.md](./SYNC-GUIDE.md)** (~10 min de configuration).

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
- **Ajouter une catégorie de produit** → `data.js`, tableau `PRODUCT_CATEGORIES`
- **Modifier le prompt système** → `app.js`, constante `SYSTEM_PROMPT`
- **Changer le modèle Claude** → `app.js`, paramètre `model` dans `callClaudeAPI()`
- **Ingrédients exclus des courses** → `data.js`, tableau `SHOPPING_EXCLUDE`
- **Conversions d'unités** → `data.js`, objet `UNIT_CONVERSIONS`

## 🆘 Mises à jour

L'app utilise un Service Worker en mode **network-first** : les fichiers se mettent à jour automatiquement à chaque ouverture si vous avez du réseau.

Si vous ne voyez pas la dernière version :
- ⚙️ Paramètres → 🔄 « Vérifier les mises à jour »
- Ou désinstallez/réinstallez l'app pour mettre à jour aussi l'icône (limitation PWA)

## 📜 Licence

Code librement réutilisable.

---

**v2.0** — Bon appétit ! 🍅
