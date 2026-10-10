# CLAUDE.md — Briefing pour Claude Code

Ce fichier est lu automatiquement par Claude Code à l'ouverture du projet. Il contient tout ce qu'il faut savoir pour travailler efficacement sur ce repo.

## 🎯 Projet : La Maisonnée (PWA, ex-« Mes Recettes »)

App d'organisation familiale en français (inspirée de Famizen) déployée sur GitHub Pages : https://nohzz.github.io/mes-recettes (URL volontairement inchangée : la changer obligerait à réinstaller la PWA).

Structure **hub + sous-apps** : un écran d'accueil (hub) à tuiles, et des sous-apps avec chacune sa barre du bas. Sous-apps : **Recettes** (l'app historique), **Calendrier** familial (les repas du planning en font partie) et **Budget**. S'y ajoutent la vue **Famille** (membres, appareils, invitation) et les **rappels** (dans l'app, et en notification push même app fermée).

La sous-app Recettes est une PWA installable iOS/Android avec :
- Création de recettes assistée par l'IA Claude (API Anthropic)
- Planning des repas multi-semaines
- Liste de courses intelligente
- Garde-manger
- Mode cuisine avec minuteurs
- Sync optionnelle via Supabase (last-write-wins)

**L'utilisateur est francophone**. Toutes les réponses, commentaires de code, et messages d'erreur doivent être en **français**. **Tutoiement** dans les échanges.

## 🏗 Stack technique — contraintes strictes

- **Vanilla HTML/CSS/JS** : **aucune dépendance NPM, aucun bundler, aucun build step**
- Le cœur (état, navigation) et la sous-app Recettes sont dans `app.js` (~9300 lignes, monolithique assumé jusqu'à un futur refactor). **Chaque module va dans son propre fichier** (`calendar.js`, `sync.js`, `family.js`, `budget.js`, `reminders.js`, `hub.js`), chargé en **script classique** après `app.js` (pas de `type="module"`) : il partage les globales (`state`, `escapeHtml`, `navigateTo`…)
- Storage : `localStorage` (5-10 MB max selon navigateur)
- Service Worker : network-first pour auto-update
- PWA : `manifest.json` + icônes 192/512/maskable
- IA : appel direct à l'API Anthropic via `callClaudeAPI()` dans `app.js`, modèle `claude-sonnet-4-6`
- Sync famille : Supabase optionnel (`sync.js`). Chaque appareil a une session **anonyme** et rejoint une famille par lien d'invitation. Une seule table `household_data` (documents JSON par famille), protégée par RLS. **Un projet = une famille** (`create_household` refuse toute nouvelle famille dès qu'une famille du projet a au moins un appareil, `household_users`). Schéma : `supabase/schema.sql`. Guide : `SYNC-GUIDE.md`
- Rappels : dans l'app (`reminders.js`, sans serveur) + **Web Push gratuit** : l'Edge Function `send-reminders` (`supabase/functions/send-reminders/index.ts`, collée dans le Dashboard) est appelée chaque minute par `pg_cron` + `pg_net` (`supabase/push.sql`). Elle crée elle-même les clés VAPID à son premier passage et n'accède à la base que par les fonctions SQL `maisonnee_*` (aucun droit direct sur les tables ; clé `SUPABASE_SECRET_KEYS`, repli sur `SUPABASE_SERVICE_ROLE_KEY`)
- Hébergement : GitHub Pages (statique, HTTPS gratuit)
- Repo : `Nohzz/mes-recettes`

**Ne JAMAIS proposer** : npm/yarn install, webpack, vite, React, Vue, TypeScript, Tailwind compilé, SCSS, ou tout outil nécessitant un build. Le projet doit rester directement servable en static.

## 📁 Structure du projet

```
recettes-app/
├── index.html         # Structure HTML (~750 lignes)
├── styles.css         # Design system terracotta (~8300 lignes)
├── data.js            # Catégories, FODMAP, saisonnalité, conversions, DIET_TAGS, MEMBER_COLORS, EVENT_CATEGORIES (~1800 lignes)
├── app.js             # Cœur (état, navigation) + sous-app Recettes (~9300 lignes)
├── calendar.js        # Calendrier : événements (dont les repas du planning), récurrence, vues Jour/Semaine/Mois/À venir, fiche d'édition, calcul des rappels
├── sync.js            # Sync famille Supabase : session anonyme, outbox, push/pull, import ancienne sync
├── family.js          # Membres, vue Famille (créer / rejoindre / inviter / appareils), lien #join=
├── budget.js          # Budget : dépenses (centimes), catégories, budget du mois, dépenses récurrentes, vues Aperçu/Dépenses (recherche)
├── reminders.js       # Rappels dans l'app, notifications (showLocalNotification), abonnement push, clés VAPID
├── hub.js             # Écran d'accueil La Maisonnée (carte « Aujourd'hui » + tuiles)
├── supabase/schema.sql # Schéma SQL de la sync famille (à coller dans le SQL Editor Supabase)
├── supabase/push.sql  # Rappels push : tables, RPC, tâche pg_cron (à coller après schema.sql)
├── supabase/functions/send-reminders/index.ts # Edge Function d'envoi des rappels (à coller dans le Dashboard)
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

- **`app.js` monolithique** (~9300 lignes). Refactor en modules ES6 prévu mais non commencé (feature #13)
- **State global** : objet `state` contenant `recipes`, `events` (calendrier et repas), `shopping`, `pantry`, `members`, `expenses`, `budgetCategories`, `budgetSettings`, `budgetRecurring`, `prefs`, `sync`, `_viewScrolls`, etc.
- **Paramètres** : un menu par espace (accueil) puis une page par espace (`SETTINGS_PAGES`, `<div data-settings-page>` d'`index.html`). `openSettingsPage(page)` empile l'overlay `settings-page` (le retour ramène au menu), `closeSettingsPage()` y revient ; le bouton ⚙️ d'une sous-app ouvre sa page (`SETTINGS_PAGE_OF_APP`). Nouvelle option = dans la page de son espace
- **Pattern window globals** : toutes les fonctions appelées depuis le HTML (`onclick="..."`) sont exposées via `window.funcName = funcName`. Quand tu ajoutes une fonction utilisée en `onclick`, **n'oublie pas le `window.X = X`**, sinon ça plante en runtime
- **17+ fonctions async** : à cause du système de dialogs custom (`uiAlert`, `uiConfirm`, `uiPrompt`) qui retournent des Promises. Toute fonction qui appelle l'un de ces dialogs doit être `async`
- **Dialogs custom** :
  - `_ensureDialogModal()`, `_showDialog()` — base
  - `_showIngredientEditDialog()`, `_showStepEditDialog()` — édition inline
  - `_showPhotoSourceDialog()`, `_showChatPhotoSourceDialog()` — Caméra/Galerie
- **Navigation hub + sous-apps** (`app.js`, section NAVIGATION) :
  - `APPS` (sous-apps du hub) et `VIEWS` (registre des vues : `app`, `title`, `tab`, `keepScroll`, `hideHeader`, `render`). **Nouvelle vue = une entrée dans `VIEWS` + une `<section id="view-<id>">`** ; nouvelle sous-app = une entrée dans `APPS` + une `<nav class="bottom-nav" data-app="<id>">`
  - Historique : hub = racine (profondeur 0). Changer d'onglet dans une sous-app **remplace** l'entrée ; ouvrir un détail ou un overlay **empile**. Chaque entrée porte `depth` : `goHome()` revient au hub via `history.go(-depth)`
  - `_applyAppChrome(view)` : barre du bas de la sous-app, bouton Accueil, bouton Planning (Recettes seulement), titres
  - Raccourcis `?app=` / `?view=` (manifest) gérés par `_handleLaunchParams()`
- **Sync famille** (`sync.js`) :
  - **Règle d'or : appeler `markDirty(kind, id)` après TOUTE modification ou suppression d'un document synchronisé.** L'appel se fait après la sauvegarde locale. Pour une suppression, on retire d'abord le document de `state`, puis on appelle `markDirty` : le push envoie alors une suppression.
  - Kinds synchronisés (`SYNC_COLLECTIONS`) : `recipes`, `shopping_lists`, `events`, `members`, et dans `budget.js` `expenses`, `budget_categories`, `budget_settings`, `budget_recurring`. Nouveau kind = nouvelle entrée dans `SYNC_COLLECTIONS` (list/get/put/remove/save/time, et `merge` / `isPristine` si utile). Les appareils mis à jour rattrapent seuls l'historique d'un nouveau kind (`mr_sync_kinds`). **Ne jamais renommer un kind existant.**
  - `put` met à jour l'objet local **en place** (`syncPutInPlace`) : une référence gardée à travers un `await` reste valide. `save()` doit **renvoyer le booléen de `safeSave`** : `false` (mémoire pleine) arrête la sync sans avancer le curseur.
  - L'horloge du serveur fait foi (`updated_at` posé par trigger). Une modification locale en attente (outbox) n'est jamais écrasée par le pull, et nos propres écritures relues ne sont pas ré-appliquées (`_syncKnown`).
  - Un document refusé par la base (400) est mis de côté (`syncRejectedCount()`, signalé dans la vue Famille) sans bloquer les autres ; il repart quand il est de nouveau modifié.
  - `performSync()` force un échange. Les déclencheurs automatiques sont le démarrage, le retour au premier plan, `online`, toutes les 60 s et 0,8 s après `markDirty`. Après une erreur « mémoire pleine », seules les syncs manuelles reprennent.
- **Rappels** (`reminders.js`, `calendar.js`, `supabase/`) :
  - Calcul commun : `dueReminders(événements, fuseau, de, à)` et `reminderMessage(r)` (heure murale du fuseau de la famille, 9 h pour un événement « toute la journée », repas ignorés). Ces fonctions et les fonctions de dates/récurrence de `calendar.js` sont **recopiées à l'identique** dans `supabase/functions/send-reminders/index.ts` (voir pièges)
  - Dédoublonnage par le tag du rappel (`rem-<id>-<YYYY-MM-DDTHH:MM>-<délai>` : l'heure visée en fait partie, un événement déplacé a donc un nouveau rappel). Dans l'app : fenêtre glissante de 15 min, `mr_reminders_fired` ; si les push sont actives sur le téléphone, l'app n'affiche qu'un toast (la notification vient du serveur, et sw.js signale chaque push reçue). Côté serveur : fenêtre de 10 min, table `reminder_log`
  - Événements validés un par un (`_reminderEventOk`) : un document inattendu est ignoré, il ne bloque jamais les rappels des autres. Délais entiers de 0 à 10 080 min (`REMINDER_MAX_OFFSET_MIN`)
  - Fuseau des rappels : celui de la famille (`households.tz`, `state.sync.householdTz`). Un administrateur qui active les notifications depuis un autre fuseau se voit proposer de l'adopter (jamais automatiquement)
  - Diagnostic (Paramètres → Calendrier, section Rappels) : `get_push_config` renvoie le dernier passage du serveur, le dernier problème (`last_problem` : une erreur est effacée par le passage suivant sans erreur, ou pour une erreur d'envoi par le suivant qui avait un rappel dû ; des envois refusés ou en échec restent en base, et l'app les masque dès qu'un envoi plus récent a réussi ou au bout de 7 jours) et le dernier envoi réussi. Elle renvoie `null` à un appareil qui ne fait plus partie de la famille (signalé dans les Réglages)
  - Abonnement push vérifié au démarrage, au retour au premier plan (au plus 1 fois/h) et dans les Réglages (`reconcilePushSubscription`) : réabonnement silencieux et réenregistrement quotidien. Un réabonnement impossible est signalé (toast). Après une panne passagère, ou des notifications bloquées puis réautorisées, il est retenté sans geste au démarrage et au retour au premier plan, au plus toutes les 5 min (`mr_push_retry`)
  - Ciblage (identique app/serveur) : événement sans participant → toute la famille ; sinon les téléphones des participants et ceux sans profil ; si aucun participant n'a de téléphone (`state.sync.deviceMemberIds`), toute la famille
  - Toute notification système passe par `showLocalNotification()` (via le service worker). Le clic sur une notification ouvre l'app ou lui envoie `open-url` (`sw.js`)
- **Dépenses récurrentes** (`budget.js`) : chaque mois, une dépense par récurrence, créée dès le 1er et datée de son jour (« prévue » jusque-là), d'id déterministe `ex_rec_<récurrence>_<mois>` (deux téléphones créent le même document). Supprimer une de ces dépenses l'**annule** (`cancelled: true`, document gardé) pour qu'elle ne soit jamais recréée : toute somme ou liste de dépenses doit ignorer `cancelled` (`expensesOfMonth`). `budgetGenerateRecurring()` ; relié à une famille, la création attend une synchronisation réussie depuis le dernier changement d'époque de sync (`_budMustWaitSync`, hooks `SYNC_CYCLE_HOOKS` de `sync.js`) : l'envoi passant avant la réception, une dépense créée trop tôt écraserait la version de la famille. Seule une récurrence toute neuve crée ses dépenses sans attendre. Chaque dépense générée porte `recAt` (version de sa récurrence) : tant qu'elle n'est pas retouchée à la main, la dépense du mois en cours, encore à venir, suit la récurrence, et est retirée si la récurrence ne couvre plus le mois (`_budRealignRecurring`)
- **Repas = événements** (`calendar.js`) : le planning lit et écrit les repas via `getMealRecipes(clé)` / `setMealRecipes(clé, recettes)`. La clé de créneau est `YYYY-MM-DD-midi|soir|autre` ; l'événement correspondant est `meal-<clé>` dans `state.events`. `state.planning` n'existe plus (l'ancien `mr_planning` est migré une fois via `mr_events_version`).
- **Feuilles modales des modules** : `openSheet(nom, html)` / `closeSheet(nom)`. Elles sont intégrées au bouton retour (pile `_sheetStack` consultée par `handleBack`). À préférer à un modal créé à la main.
- **Système de retour OS** : `pushOverlay()` + listener `popstate` pour intégration au bouton retour Android/iOS
  - Les fonctions `close…(skipHistory)` / `hideSettings(skipHistory)` ne sautent l'historique **que si on passe `true`** (elles servent aussi de handlers de clic, qui reçoivent un objet événement)
  - Nouvel overlay = `pushOverlay('nom')` + une entrée dans `_OVERLAY_ELEMENT_IDS` + une priorité dans `handleBack()`. `pushOverlay` réutilise l'entrée d'un overlay déjà fermé, et `popstate` saute les entrées d'overlay orphelines
- **Migrations versionnées** : flags localStorage (`mr_seasonality_version`, `mr_steps_enrich_version`, `mr_uses_version`, `mr_fodmap_version`, `mr_protein_version`, `mr_events_version`) pour re-traiter les données existantes une seule fois au boot
- **Sauvegarde scroll** : `state._viewScrolls` mémorise la position des vues marquées `keepScroll` dans `VIEWS` pour restaurer au retour
- **Version** : `APP_NAME` / `APP_VERSION` / `APP_BUILD_DATE` en tête d'`app.js` (affichées dans À propos). **À chaque déploiement, bumper aussi `CACHE_VERSION` dans `sw.js`**

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
- « Restaurer » (après un recalcul) ne rend que les associations des ingrédients inchangés depuis (sauvegarde `_stepsBackup.lastRecalc` avec la liste `ingredients` id → nom) ; un ingrédient ajouté depuis garde les siennes. Réserve : une sauvegarde d'avant la v4.0 n'a pas cette liste (seuls les ingrédients encore présents reprennent leurs associations) ; elle est complétée au premier changement d'ingrédient (`_freezeStepsBackupIngredients`). Un nouvel ingrédient ne reprend jamais un id encore cité (`_ingredientIdsInUse`)

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
9. **Oubli de `markDirty`** : une modification sans `markDirty(kind, id)` reste locale. Elle sera même écrasée par la version de la famille au prochain changement venu d'un autre appareil. Toute nouvelle fonction qui modifie une recette, une liste, un événement, un membre ou une donnée du budget doit l'appeler. L'ancienne sync « code foyer » (tables `recipes`/`planning`/`shopping_lists`) n'est plus utilisée que pour l'import unique (`importLegacyFoyer`)
10. **Modèle Claude** : utiliser `claude-sonnet-4-6` (string exacte) dans les appels API. Pas `claude-3-5-sonnet`, pas `claude-sonnet-4`. Le suffixe `-6` est critique
11. **Nouveau fichier JS/CSS** : l'ajouter aux `<script>` d'`index.html` **et** à `APP_FILES` dans `sw.js`. Sinon, hors ligne, le service worker renvoie `index.html` à la place du script et l'app plante
12. **Clé d'obfuscation** : `_OBF_KEY` (en tête d'`app.js`) dérive d'une chaîne contenant « mes-recettes ». **Ne jamais la renommer** malgré le changement de nom de l'app : les secrets déjà stockés (clé API, sync) deviendraient illisibles
13. **Calcul des rappels en double** : les fonctions `_pad2` … `eventOccurrences` et le bloc « Rappels : calcul des envois » de `calendar.js` (de `const _tzFormatters` jusqu'au marqueur `// <<< fin du bloc recopié`) sont copiés tels quels entre les marqueurs « COPIE » de `supabase/functions/send-reminders/index.ts`. **Toute modification doit y être reportée à l'identique**, puis la fonction redéployée dans le Dashboard Supabase : sinon l'app et le serveur ne calculent plus les mêmes rappels
14. **Notifications** : jamais `new Notification(...)` (refusé sur Android), toujours `showLocalNotification(titre, options)`. Sur iPhone, les notifications (et `Notification` lui-même) n'existent que dans l'app **installée** sur l'écran d'accueil (iOS 16.4+)
15. **SQL Supabase** : `schema.sql` et `push.sql` doivent rester ré-exécutables (`if not exists`, `create or replace`, `drop … if exists`). Changer le type de retour d'une fonction impose un `drop function` avant (et refaire ses `grant`)
16. **Plusieurs instances de l'app** (onglet du navigateur + app installée, même `localStorage`) : quand l'une enregistre des données, l'autre les relit aussitôt et les applique **en place** (écouteur `storage` de `sync.js`, `_syncSoftReload`), sauf les documents qu'elle a modifiés en dernier. Chaque instance n'envoie que les entrées d'outbox dont elle a écrit la dernière séquence (`_syncOwnSeq`), plus celles qu'elle adopte quand l'outbox n'a plus été écrite par une autre instance depuis 50 s (`SYNC_ADOPT_IDLE_MS`) : au démarrage, et celles d'une instance fermée ou gelée, restées inchangées 60 s. Les préférences et la clé API sont relues de la même façon (`loadPrefs`). Ne pas écrire dans le `localStorage` autrement que par les fonctions `save…()`, et ajouter toute nouvelle collection synchronisée à `_syncStorageKinds()`

## 📋 Backlog connu

- **#13** Refactor architectural en modules ES6 (gros chantier, sans bénéfice utilisateur visible)
- **#14** Tests automatisés GitHub Actions (Playwright en CI)
- **#15** Export PDF d'une recette (window.print + @media print, ou jsPDF)
- ~~**#16** Sync planning multi-recettes par slot~~ : fait par la sync famille (les repas sont des événements à plusieurs recettes)

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

- **v4.0** (en cours) : « La Maisonnée » — hub d'accueil + sous-apps (navigation par registre `VIEWS`/`APPS`, retour OS fiabilisé), famille et sync v2 sécurisée (sessions anonymes, RLS, invitation), calendrier familial (repas du planning inclus), budget familial, rappels dans l'app et en notification push (0 €)
- **v3.3** : FODMAP binaire stricte + 5 régimes essentiels + Retour avec contexte préservé
- **v3.2** : Source obligatoire + Vérification humaine + Ingrédients-étapes précis + FODMAP auto + Photo Caméra/Galerie + Recalcul IA
- **v3.0** : Planning + Garde-manger + Timer + ChangeLog + Édition inline + Photo caméra/galerie + Recherche dans étapes
- app.js : ~395 KB / ~9300 lignes
- styles.css : ~186 KB / ~8300 lignes
- data.js : ~90 KB / ~1800 lignes
- calendar.js ~45 KB, sync.js ~71 KB, family.js ~33 KB, budget.js ~30 KB, reminders.js ~25 KB, hub.js ~6 KB

## 💬 Référence rapide — fonctions principales

| Fonction | Rôle |
|---|---|
| `renderLibrary()` | Affiche la bibliothèque avec filtres + tri |
| `renderRecipeDetail(recipe)` | Affiche la fiche recette (préserve le scroll) |
| `openRecipe(id)` | Navigation vers une recette |
| `navigateTo(view, data)` | Changement de vue avec historique (remplace l'entrée si simple changement d'onglet) |
| `openApp(appId)` / `goHome()` | Ouvre une sous-app depuis le hub / revient au hub en dépilant l'historique |
| `renderHub()` | Écran d'accueil (`hub.js`) : repas du jour + tuiles des sous-apps |
| `getMealRecipes(clé)` / `setMealRecipes(clé, recettes)` | Lecture / écriture d'un créneau repas (événement `meal-<clé>`, `calendar.js`) |
| `markDirty(kind, id)` / `performSync(silent)` | Sync famille : signaler une modification / forcer un échange (`sync.js`) |
| `createFamily(…)` / `joinFamily(…)` / `leaveFamily()` | Créer, rejoindre, quitter la famille (`sync.js`) |
| `openFamilyView()` / `upsertMember(m)` / `memberAvatarHtml(m)` | Vue Famille, membres, pastille de membre (`family.js`) |
| `openEventEditor(id, occDate, presetDate)` / `saveCalendarEvent(ev)` | Fiche d'édition d'un événement / enregistrement + sync (`calendar.js`) |
| `eventOccurrences(ev, de, à)` / `calendarItemsByDay(de, à, opts)` | Occurrences d'un événement récurrent / événements et repas jour par jour (`calendar.js`) |
| `dueReminders(evs, tz, de, à)` / `reminderMessage(r)` | Rappels à envoyer dans une fenêtre / texte de la notification (`calendar.js`, copiés côté serveur) |
| `checkLocalReminders()` / `showLocalNotification(titre, opts)` | Rappels de l'app ouverte / notification système via le service worker (`reminders.js`) |
| `enablePushOnThisDevice()` / `disablePushOnThisDevice()` | Abonnement push de ce téléphone (clés VAPID créées par la fonction send-reminders à son premier passage) (`reminders.js`) |
| `openExpenseEditor(id)` / `budgetSummary(mois)` / `formatEuros(centimes)` | Fiche dépense / agrégats du mois / affichage des montants (`budget.js`) |
| `openRecurringList()` / `openRecurringEditor(id)` / `budgetGenerateRecurring()` | Dépenses récurrentes : liste, fiche, création des dépenses du mois (`budget.js`) |
| `showSettings(page)` / `openSettingsPage(page)` / `closeSettingsPage()` | Paramètres : ouverture (page de la sous-app par défaut), page d'un espace, retour au menu (`app.js`) |
| `openSheet(nom, html)` / `closeSheet(nom)` | Feuille modale de module, intégrée au bouton retour (`app.js`) |
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
| `_jsArg(str)` | Argument texte d'un `onclick="fn(...)"` (JSON + échappement HTML ; gère les apostrophes) |
| `aggregateShoppingItems()` | Liste de courses : UNE ligne par produit, unités fusionnées, détail par recette numérotée |
| `getShoppingProductKey(name)` | Clé produit (alias IA compris) partagée par la liste, le garde-manger et les cases cochées |
| `parseShoppingName(name)` / `parseShoppingUnit(unit)` | Identité produit (« gousses d'ail » → ail + gousse) / unité normalisée (`data.js`) |
| `mergeShoppingQuantities(quantities, key)` | Fusion des quantités d'un produit (équivalences de `SHOPPING_PRODUCT_UNITS`, ≈ si estimé) |
| `uiAlert(msg)` / `uiConfirm(msg, opts)` / `uiPrompt(msg, opts)` | Dialogs async customs |
