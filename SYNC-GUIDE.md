# 👪 La Maisonnée — synchroniser les téléphones de la famille

Ce guide explique comment relier les téléphones de la famille pour partager recettes, listes de courses, calendrier (repas compris), budget et membres, puis comment recevoir les rappels du calendrier même app fermée. Comptez **10 minutes** la première fois, puis **30 secondes** par téléphone supplémentaire, et **10 minutes** de plus pour les rappels.

## Le principe

- Les données de la famille sont stockées dans **votre propre projet Supabase**, sur le plan gratuit. Personne d'autre n'y a accès.
- Il n'y a **ni email ni mot de passe** : chaque téléphone reçoit une identité anonyme et rejoint la famille avec un **lien d'invitation**.
- La base est protégée : seuls les téléphones membres de la famille peuvent lire ou modifier ses données (sécurité « RLS » de Supabase).
- **Un projet = une famille** : tant qu'au moins un téléphone est inscrit dans la famille, le projet refuse d'en créer une autre ; on ne peut que la rejoindre avec un lien d'invitation.
- Sans famille, l'app fonctionne normalement : tout reste sur le téléphone.

**Coût : 0 €.** Le plan gratuit de Supabase (500 Mo de base, 5 Go de transfert par mois) suffit largement à une famille.

---

## Étape 1 — Le projet Supabase

> **Vous utilisiez déjà la synchronisation par « code foyer » ?** Gardez le même projet et passez directement à l'étape 2.

1. Allez sur [supabase.com](https://supabase.com) et cliquez **Start your project**. Connectez-vous avec GitHub (le plus simple) ou par email.
2. Cliquez **New project**. Si on vous demande une « organisation », créez-la : votre prénom suffit.
3. Remplissez :
   - **Name** : `la-maisonnee`
   - **Database Password** : générez-le et gardez-le de côté. L'app n'en a pas besoin.
   - **Region** : une région proche, par exemple **West EU (Paris)**.
   - **Pricing Plan** : **Free**.
4. Cliquez **Create new project** et attendez 1 à 2 minutes.

## Étape 2 — Activer les connexions anonymes

1. Menu de gauche : **Authentication** → **Sign In / Providers**.
2. Activez **Allow anonymous sign-ins**, puis enregistrez.

C'est ce qui permet à chaque téléphone de se connecter sans email.

## Étape 3 — Installer le schéma de La Maisonnée

1. Menu de gauche : **SQL Editor** → **New query**.
2. Ouvrez le fichier [`supabase/schema.sql`](supabase/schema.sql) du dépôt, copiez **tout** son contenu et collez-le dans l'éditeur.
3. Cliquez **Run**. Le message attendu est « Success. No rows returned ».

Le script peut être relancé sans risque. Il ne touche pas aux anciennes tables (`recipes`, `planning`, `shopping_lists`) de la synchronisation « code foyer ».

## Étape 4 — Récupérer l'URL et la clé publique

1. **Settings** → **Data API** : copiez la **Project URL**, de la forme `https://xxxxxxxx.supabase.co`.
2. **Settings** → **API Keys** : copiez la **Publishable key** (`sb_publishable_…`) ou, sur les anciens projets, la clé **anon public** (`eyJ…`).

⚠️ Ne copiez **jamais** la clé *secret* / *service_role* dans l'app.

## Étape 5 — Créer la famille (premier téléphone)

Choisissez le téléphone qui a les données les plus à jour.

1. Dans La Maisonnée : **Accueil** → carte **« Relier les téléphones de la famille »**, ou **Paramètres** → **👪 Famille & synchronisation** → **Gérer la famille**.
2. Dans **Créer la famille**, indiquez :
   - l'URL et la clé de l'étape 4 ;
   - le nom de la famille ;
   - votre prénom et votre couleur.
3. Facultatif mais conseillé : **Télécharger d'abord une sauvegarde**.
4. Touchez **Créer la famille**. Toutes les données du téléphone sont envoyées dans la famille.

## Étape 6 — Inviter les autres téléphones

1. Sur le premier téléphone, dans **Inviter un proche** : **Partager le lien d'invitation**, par WhatsApp, SMS, etc.
2. Sur l'autre téléphone :
   - **iPhone** : installez d'abord l'app (Safari → Partager → **Sur l'écran d'accueil**), ouvrez-la, puis collez le lien dans **Famille → Rejoindre une famille**. Un lien ouvert dans Safari n'arrive pas dans l'app installée.
   - **Android** : ouvrez le lien. S'il s'ouvre dans le navigateur au lieu de l'app, installez l'app, ouvrez-la et collez le lien dans **Rejoindre une famille**.
3. Touchez **Rejoindre la famille**. Ce que le téléphone contenait déjà n'est pas perdu : c'est fusionné avec la famille.
4. Indiquez **« Cet appareil appartient à »** : choisissez votre prénom, ou ajoutez-vous comme membre.

Le code d'invitation est valable **7 jours**. Vous pouvez en **générer un nouveau** à tout moment, et l'ancien cesse alors de fonctionner.

---

## Vous utilisiez la synchronisation « code foyer » ?

Elle est remplacée par la famille, plus sûre. L'ancien système laissait lire toutes les données à quiconque avait l'URL et la clé.

1. Faites les étapes 2 et 3 sur votre projet actuel.
2. Sur le téléphone le plus à jour, faites l'étape 5. L'app récupère automatiquement les données de l'ancienne synchronisation (recettes, planning, listes), puis les partage dans la famille.
3. Sur les autres téléphones, faites l'étape 6.
4. Les anciennes tables ne sont **pas modifiées**, ce qui permet de revenir en arrière. Quand tous les téléphones sont passés à la famille, vous pouvez retirer leur accès public : les commandes sont à la fin de `supabase/schema.sql`, en commentaire.

---

## Ce qui est synchronisé

| Synchronisé avec la famille | Reste sur le téléphone |
|---|---|
| Recettes (photos comprises) | Clé API Claude |
| Listes de courses et cases cochées | Préférences d'affichage (thème, tri, vue du calendrier…) |
| Calendrier : événements, anniversaires, repas du planning | Garde-manger |
| Budget : dépenses, catégories, budget du mois, dépenses récurrentes | Historique du chat IA, minuteur |
| Membres de la famille | Notifications activées ou non sur ce téléphone |

La synchronisation se fait :
- à l'ouverture de l'app ;
- au retour dans l'app ;
- toutes les minutes tant qu'elle est affichée ;
- et quelques instants après chaque modification.

Hors ligne, les modifications attendent et partent au retour du réseau.

L'icône en haut de l'écran indique l'état : ⟳ en cours, ✓ synchronisé, ⚠️ erreur. Touchez-la pour synchroniser tout de suite.

**Modifications simultanées** : si deux personnes modifient la même recette au même moment, la dernière modification envoyée l'emporte. Lors de la première jonction d'un téléphone, les listes de courses et les repas présents des deux côtés sont réunis plutôt qu'écrasés.

## Rappels en notification, même app fermée (facultatif)

Quand l'app est ouverte, les rappels des événements du calendrier s'affichent tout seuls, sans rien configurer. Pour les recevoir **app fermée**, il faut un petit service dans votre projet Supabase, gratuit lui aussi : chaque minute, il regarde les rappels à envoyer et les pousse aux téléphones abonnés.

Prérequis : la famille est créée (étapes 1 à 6).

### Étape A — Installer les tables des rappels

1. Ouvrez le fichier [`supabase/push.sql`](supabase/push.sql) du dépôt et copiez **tout** son contenu.
2. Dans Supabase : **SQL Editor** → **New query**, puis collez.
3. Tout en haut (étape 0 du script), remplacez `VOTRE-PROJET` par l'identifiant du projet : c'est le `xxxxxxxx` de votre Project URL `https://xxxxxxxx.supabase.co` (étape 4).
4. Cliquez **Run**. Si vous avez oublié l'étape 3 (ou collé l'adresse complète au lieu de l'identifiant), le script s'arrête avec un message qui l'indique.

### Étape B — Créer la fonction d'envoi

1. Menu de gauche : **Edge Functions** → **Deploy a new function** → **Via Editor**.
2. Nommez-la exactement `send-reminders`.
3. Ouvrez le fichier [`supabase/functions/send-reminders/index.ts`](supabase/functions/send-reminders/index.ts) du dépôt, copiez **tout** son contenu et remplacez le code d'exemple par celui-ci.
4. Cliquez **Deploy function**.
5. Dans les réglages de la fonction, **désactivez « Verify JWT »** (« Enforce JWT verification » selon la version du tableau de bord), puis enregistrez. La fonction est protégée autrement : seul le planificateur de votre base connaît son secret.

Dans la minute qui suit, la fonction crée elle-même les clés de notification de la famille : il n'y a rien à copier.

### Étape C — Activer les notifications sur chaque téléphone

1. Sur chaque téléphone : **Paramètres** → **📅 Calendrier** → **Activer les notifications sur cet appareil**, puis acceptez.
   - **iPhone / iPad** : l'app doit être installée sur l'écran d'accueil (Safari → Partager → **Sur l'écran d'accueil**), avec iOS 16.4 ou plus récent. Ouvrez-la depuis l'icône, puis activez.
   - **Android** : fonctionne dans Chrome, et mieux encore depuis l'app installée.
2. Pour vérifier : **Tester une notification**, puis créez un événement dans 3 minutes avec le rappel « À l'heure » et fermez l'app.

L'app vérifie ensuite toute seule que le téléphone est toujours abonné (par exemple après avoir bloqué puis réautorisé les notifications) et le réabonne si besoin. Dans **Paramètres** → **📅 Calendrier** (section 🔔 Rappels et notifications), elle signale si le service d'envoi ne tourne pas ou si son dernier passage a échoué.

Les heures des rappels suivent le **fuseau horaire de la famille**, affiché dans **Paramètres** → **📅 Calendrier** (section 🔔 Rappels et notifications) : au départ celui du téléphone qui a créé la famille. Si un administrateur active les notifications depuis un téléphone réglé sur un autre fuseau, l'app lui demande s'il faut l'adopter.

**Mettre à jour les rappels** : quand une nouvelle version de l'app modifie `push.sql` ou `index.ts`, redéployez d'abord la fonction (étape B), puis réexécutez aussitôt `push.sql` en entier (étape A) : les deux vont ensemble. Dans cet ordre, l'erreur éventuelle de la minute intermédiaire est effacée par `push.sql` et ne reste pas affichée dans **Paramètres** → **📅 Calendrier** (section 🔔 Rappels et notifications).

### Qui reçoit quoi

- Un événement **sans participant** concerne toute la famille : tous les téléphones abonnés sont prévenus.
- Un événement **avec participants** prévient leurs téléphones (d'après « Cet appareil appartient à »), plus les téléphones qui n'ont pas indiqué à qui ils appartiennent.
- Si aucun participant n'a de téléphone (un enfant, par exemple), toute la famille est prévenue.
- Les repas du planning n'envoient pas de rappel.
- Un même rappel n'est envoyé qu'une fois (si l'événement est déplacé après coup, le rappel de la nouvelle heure part aussi), et un rappel en retard de plus de 10 minutes (serveur en panne) n'est plus envoyé.
- Quand l'app est ouverte, elle affiche un simple bandeau pour un rappel déjà reçu en notification, sans doubler l'alerte.

**Coût : 0 €.** Le service n'est appelé que si au moins un téléphone est abonné : environ 43 000 appels par mois, pour 500 000 inclus dans le plan gratuit. Il ne lit à chaque passage que les événements qui ont un rappel, réduits aux champs utiles, et l'historique du planificateur est purgé chaque nuit pour ne pas remplir la base.

## Membres et appareils

- Un **membre** est une personne de la famille : prénom, couleur, emoji. On peut en créer même pour quelqu'un qui n'a pas de téléphone, un enfant par exemple.
- Chaque **appareil** est relié à un membre (« Cet appareil appartient à »).
- L'administrateur (le premier téléphone) peut **retirer un appareil**, qui perd aussitôt l'accès aux données de la famille. Ses données locales restent sur le téléphone. Le code d'invitation change en même temps : l'appareil retiré ne peut pas revenir seul avec l'ancien.
- **Quitter la famille** sur un téléphone arrête la synchronisation, et les données restent sur ce téléphone.

## Sécurité

- La clé « publishable / anon » est faite pour être dans une app : à elle seule, elle ne donne accès à aucune donnée de la famille. Exception : si le projet servait à l'ancienne synchronisation « code foyer », ses anciennes tables restent lisibles et modifiables par quiconque a l'URL et la clé (présentes dans chaque lien d'invitation), tant que leur accès public n'est pas retiré (commandes en fin de `supabase/schema.sql`) : faites-le dès que tous les téléphones sont passés à la famille.
- Le **lien d'invitation** est la clé de la famille : partagez-le seulement avec vos proches. En cas de doute, générez un nouveau code.
- Avant de rejoindre, l'app montre le projet Supabase visé par le lien : sur la carte « Rejoindre une famille » pour un lien ouvert dans l'app, dans une confirmation pour un lien collé sur un téléphone qui n'a pas encore de projet configuré. Elle demande aussi une confirmation si ce projet diffère de celui déjà configuré ou s'il n'est pas hébergé par Supabase ; un lien vers le projet déjà configuré est rejoint sans confirmation.
- L'adresse de la fonction d'envoi des rappels est publique, comme celle du projet : un tiers peut l'appeler, mais sans le secret du planificateur il est refusé aussitôt. Chaque appel compte toutefois dans le quota gratuit d'appels.
- L'identité anonyme d'un téléphone ne se récupère pas. Si vous effacez les données du navigateur ou réinstallez l'app, il suffit de rejoindre la famille à nouveau avec un lien d'invitation. Si c'était le téléphone administrateur, voir « L'ancien téléphone administrateur a été remplacé » dans le dépannage.

## Dépannage

| Message ou symptôme | Solution |
|---|---|
| « Les connexions anonymes ne sont pas activées » | Étape 2 |
| « Le schéma SQL de La Maisonnée n'est pas installé » | Étape 3 (vérifiez qu'il s'agit du bon projet) |
| « Clé publique Supabase refusée » | Recopiez la *Publishable key* (étape 4) |
| « Code d'invitation invalide ou expiré » | Sur un téléphone de la famille : **Générer un nouveau code** |
| « Cet appareil doit rejoindre à nouveau la famille » / « ne fait plus partie de la famille » | Rejoignez avec un nouveau lien d'invitation : vos données locales sont conservées et fusionnées |
| Plus rien ne se synchronise après de longues vacances | Un projet gratuit se met **en pause après 7 jours sans activité**. Dans le tableau de bord Supabase, cliquez **Restore project** : c'est gratuit et les données sont conservées |
| Trop de tentatives de connexion | Supabase limite les nouvelles connexions anonymes (30 par heure et par adresse IP) : patientez un peu |
| « Mémoire du téléphone pleine » | **Paramètres** → **💾 Données & sauvegarde** → **Libérer de l'espace**, puis touchez l'icône de synchronisation |
| « N éléments refusés par le serveur » | Un document n'a pas pu être enregistré (contenu invalide). Modifiez-le pour le renvoyer ; le reste de la synchronisation continue |
| « Les rappels push ne sont pas installés » | Étape A (`push.sql`) |
| « Le serveur de rappels n'a pas encore créé ses clés » | Attendez une minute après l'étape B ; sinon, vérifiez l'étape B |
| « Le serveur de rappels n'a encore jamais tourné » / « ne tourne plus » | Vérifiez l'étape B : nom exact `send-reminders`, fonction déployée, « Verify JWT » désactivé, `VOTRE-PROJET` bien remplacé à l'étape A. Les requêtes de diagnostic en fin de `push.sql` montrent la réponse de la fonction (colonne `content`) ou l'erreur réseau (colonne `error_msg`). Une réponse « 401 / Invalid API key » ou « Legacy API keys are disabled » : redéployez la fonction avec la dernière version de `index.ts` |
| « Un passage du serveur de rappels a échoué : … » avec « permission denied / 42501 » ou « 404 / PGRST202 / Could not find the function » | Le SQL et la fonction ne sont pas de la même version : redéployez la fonction à jour (étape B), puis réexécutez `push.sql` en entier (étape A) |
| « Adresse de projet invalide » en exécutant `push.sql` | À l'étape 0, ne mettez que l'identifiant du projet à la place de `VOTRE-PROJET` (pas l'adresse complète) |
| « Ce projet Supabase héberge déjà une famille » | Rejoignez-la avec un lien d'invitation d'un téléphone de la famille. Si plus aucun téléphone n'y a accès, voir « Plus aucun téléphone n'a accès à la famille » ci-dessous |
| « Les services de notification refusent les envois » | Repartez de nouvelles clés : commandes en fin de `push.sql`, puis réactivez les notifications sur chaque téléphone |
| Aucune notification sur iPhone | App installée sur l'écran d'accueil et ouverte depuis l'icône, iOS 16.4 ou plus, notifications autorisées dans **Réglages iOS → Notifications → La Maisonnée** |
| « Notifications bloquées » | Autorisez-les dans les réglages du téléphone (ou du navigateur). Si elles étaient activées, les rappels reprennent tout seuls à la prochaine ouverture de l'app ; sinon, touchez **Activer les notifications sur cet appareil** |
| Les rappels arrivent avec une ou plusieurs heures de décalage | Regardez la ligne « Fuseau des rappels » dans **Paramètres** → **📅 Calendrier** (section 🔔 Rappels et notifications). Un administrateur peut adopter le fuseau de son téléphone en réactivant les notifications ; sinon, dans le **SQL Editor** : `update public.households set tz = 'Europe/Paris';` (ou votre fuseau). Les téléphones reprennent la valeur à la synchronisation suivante |
| L'ancien téléphone administrateur a été remplacé (plus de bouton « Retirer », fuseau non modifiable) | Le nouveau téléphone a rejoint en simple membre, et l'ancien reste administrateur. Dans le **SQL Editor**, listez les appareils : `select user_id, role, device_label, joined_at, last_seen_at from public.household_users order by joined_at;` puis retirez l'ancien : `delete from public.household_users where user_id = '<identifiant de l'ancien téléphone>';`. L'appareil restant le plus ancien devient administrateur (sur ce téléphone : **Synchroniser maintenant**) |

Pour repartir de zéro sur un téléphone : **Paramètres** → **💾 Données & sauvegarde** → **Actions avancées** → **Tout supprimer**. Seules les données de **ce** téléphone sont effacées : celles de la famille reviennent à la synchronisation suivante.

### Plus aucun téléphone n'a accès à la famille

Par exemple si tous les téléphones ont été réinitialisés, ou s'ils ont tous quitté la famille. Les données de la famille sont toujours dans le projet. N'utilisez pas « Créer la famille » : tant que d'anciens appareils restent inscrits, elle est refusée ; s'il n'en reste aucun, elle créerait une seconde famille, séparée de ces données (avec seulement le contenu de ce téléphone).

1. **SQL Editor** → exécutez la requête suivante, qui affiche un nouveau code d'invitation, valable 24 heures (pour la famille qui a encore des appareils enregistrés, sinon pour celle dont les données sont les plus récentes) :
   ```sql
   update public.households set invite_code = public._maisonnee_invite_code(), invite_expires_at = now() + interval '1 day'
    where id = coalesce(
      (select household_id from public.household_users order by joined_at limit 1),
      (select household_id from public.household_data group by household_id order by max(updated_at) desc limit 1))
   returning invite_code;
   ```
2. Sur **un seul** téléphone : **Famille** → **Rejoindre une famille**, avec ce code, l'URL et la clé du projet (étape 4). Les autres téléphones rejoindront ensuite avec un lien d'invitation normal.
3. Retirez les anciens appareils, désormais inaccessibles. Le téléphone qui vient de rejoindre (le plus récent) est gardé et devient administrateur :
   ```sql
   delete from public.household_users u
    using (select household_id, user_id from public.household_users order by joined_at desc limit 1) k
    where u.household_id = k.household_id and u.user_id <> k.user_id;
   ```
4. Sur ce téléphone : **Synchroniser maintenant**, puis **Générer un nouveau code** pour inviter les autres.
