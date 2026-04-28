# Mes Recettes 🌿

Une PWA (Progressive Web App) installable pour gérer vos recettes : création assistée par IA Claude, bibliothèque avec filtres saisonniers, et liste de courses agrégée.

Respecte la charte graphique **Greenweez** (vert institutionnel `#20614D`, accent pop conifer `#CCFF6C`, typographie Poppins + Lato).

## ✨ Fonctionnalités

- 🤖 **Création par IA** — Envoyez à l'assistant un lien YouTube/Instagram/site, des photos, ou une description, il extrait une recette structurée que vous validez avant sauvegarde.
- 📚 **Bibliothèque** — Recherche par nom de recette ou ingrédient, filtres par mois (saisonnalité auto-détectée), tag "ce mois-ci".
- 🛒 **Liste de courses** — Sélectionnez des recettes (avec portions ajustables), génère une liste agrégée par catégorie de produit (Fruits & Légumes, Frais & Crèmerie, etc.), copiable en un clic.
- ⚙️ **Réglage des portions** — Sur chaque recette, ajustez les portions et les quantités s'adaptent automatiquement.
- 🔄 **Synchronisation multi-appareils** — Partagez vos recettes entre Android et iOS via Supabase (gratuit). Voir [SYNC-GUIDE.md](./SYNC-GUIDE.md).
- 📱 **Installable** — Sur Android (Chrome/Edge) ou iOS (Safari), s'installe comme une vraie app.
- 🔒 **Données privées** — Recettes stockées localement par défaut. Si sync activée, hébergées sur votre compte Supabase personnel.
- 📤 **Export/Import** — Sauvegardez vos recettes en JSON, restaurez-les sur un autre appareil.

## 📁 Structure du projet

```
recettes-app/
├── index.html          # Structure HTML
├── styles.css          # Design system Greenweez
├── data.js             # Catégories produits + saisonnalité
├── app.js              # Logique applicative
├── manifest.json       # Configuration PWA
├── sw.js               # Service Worker (offline)
└── icons/              # Icônes app (192, 512, maskable, etc.)
```

## 🚀 Déploiement

L'app est 100% statique (HTML/CSS/JS). Vous pouvez la déployer sur n'importe quel hébergeur statique gratuit en quelques minutes.

### Option 1 — Netlify (recommandé)

1. Créez un compte sur [netlify.com](https://www.netlify.com)
2. Cliquez "Add new site" → "Deploy manually"
3. Glissez-déposez le dossier `recettes-app/` complet
4. Netlify vous donne une URL HTTPS du type `https://random-name.netlify.app`
5. Ouvrez cette URL sur votre téléphone

### Option 2 — Vercel

1. Créez un compte sur [vercel.com](https://vercel.com)
2. `npm i -g vercel` (si vous avez Node.js) puis dans le dossier : `vercel`
3. Suivez les instructions, vous obtenez une URL HTTPS

### Option 3 — GitHub Pages

1. Créez un repo GitHub, poussez les fichiers
2. Settings → Pages → Deploy from branch → main → root → Save
3. URL : `https://<user>.github.io/<repo>/`

### Option 4 — Test en local

```bash
cd recettes-app
python3 -m http.server 8000
# Ouvrez http://localhost:8000 dans votre navigateur
```

⚠️ **Important** : pour que l'app soit installable en PWA et que le Service Worker fonctionne, il **faut HTTPS** (sauf en localhost). Donc préférez Netlify/Vercel à un simple serveur HTTP.

## 📲 Installer sur Android

1. Ouvrez l'URL de l'app dans **Chrome** (ou Edge/Brave)
2. Une bannière "Ajouter à l'écran d'accueil" apparaît automatiquement après quelques secondes — tapez dessus
3. Sinon : menu ⋮ → "Ajouter à l'écran d'accueil" / "Installer l'application"
4. Confirmez. L'icône apparaît dans votre tiroir d'applications, comme une vraie app native.

## 🍎 Installer sur iOS

1. Ouvrez l'URL dans **Safari** (Chrome iOS ne le permet pas)
2. Bouton Partager (carré avec flèche) → "Sur l'écran d'accueil"
3. Confirmez. L'icône apparaît sur votre écran d'accueil.

## 🔑 Obtenir une clé API Claude

L'app utilise l'API Claude (Anthropic) pour le parsing des recettes. Vous avez besoin d'une clé API personnelle :

1. Créez un compte sur [console.anthropic.com](https://console.anthropic.com)
2. Section **API Keys** → "Create Key"
3. Copiez la clé (commence par `sk-ant-api03-...`)
4. À l'ouverture de l'app, collez-la dans l'écran de bienvenue (ou plus tard via ⚙️ Paramètres)

**Coûts estimés** : avec le modèle `claude-sonnet-4-6`, une création de recette via texte ou image coûte typiquement **moins de 0,02 €**. Anthropic offre généralement quelques dollars de crédit gratuit à l'inscription.

> 🔒 La clé est stockée uniquement dans le `localStorage` de votre navigateur. Elle n'est jamais envoyée ailleurs qu'à l'API Anthropic.

## 🧪 Mode démo (sans IA)

Vous pouvez utiliser l'app **sans clé API** : cliquez "Continuer sans IA" à l'onboarding. Vous pouvez alors créer des recettes manuellement via la modal de validation, et toutes les autres fonctionnalités (bibliothèque, liste de courses, filtres) restent disponibles.

## 🎨 Charte graphique

Couleurs principales (issues de la charte Greenweez) :

| Token              | Hex        | Usage                          |
|--------------------|------------|--------------------------------|
| `--bg-green-800`   | `#20614D`  | Couleur institutionnelle, CTA  |
| `--bg-pop-conifer` | `#CCFF6C`  | Accent pop, badges, FAB        |
| `--bg-brown-100`   | `#FAEAD5`  | Touches chaleureuses           |
| `--bg-gray-50`     | `#FAF9F7`  | Fond app                       |
| `--bg-white`       | `#FFFFFF`  | Cartes                         |

Typographie : **Poppins** (titres, 600-900) + **Lato** (corps, 400-900).

## 🛠️ Développement

L'app n'a aucune dépendance NPM, aucun bundler. Modifiez les fichiers sources directement.

- **Ajouter un ingrédient à la base de saisonnalité** : éditez `data.js`, objet `SEASONALITY`
- **Ajouter une catégorie de produit** : éditez `data.js`, tableau `PRODUCT_CATEGORIES`
- **Modifier le prompt système** : `app.js`, constante `SYSTEM_PROMPT`
- **Changer le modèle Claude** : `app.js`, paramètre `model` dans `callClaudeAPI()` (par défaut `claude-sonnet-4-6`)

## 🐛 Limitations connues

- L'IA ne peut pas visiter directement les liens (limite navigateur). Quand vous collez un lien YouTube/web, elle vous demandera de copier la transcription ou le contenu textuel. Pour contourner ça, il faudrait un proxy backend (non inclus dans cette v1).
- Les modèles Claude évoluent — si vous voyez une erreur "model not found", vérifiez le model string sur [docs.claude.com](https://docs.claude.com/en/docs/about-claude/models/overview) et mettez-le à jour dans `app.js`.

## 📜 Licence

Code librement réutilisable. Charte graphique propriété de Greenweez.

---

**v1.0** — Bon appétit ! 🌿
