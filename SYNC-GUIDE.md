# 🔄 Guide de configuration Supabase

Ce guide vous accompagne pour activer la synchronisation entre vos appareils. Comptez **10 minutes** la première fois, puis 30 secondes pour ajouter chaque nouveau téléphone.

## Pourquoi Supabase ?

Supabase est un service cloud qui héberge gratuitement une base de données PostgreSQL accessible via une API REST simple. Quotas gratuits :
- 500 Mo de base de données (≈ 50 000 recettes — vous serez tranquilles à vie)
- 5 Go de bande passante par mois
- Pas de carte bancaire requise

## Étape 1 — Créer un compte Supabase

1. Allez sur [supabase.com](https://supabase.com)
2. Cliquez **Start your project** (en haut à droite)
3. Connectez-vous avec **GitHub** (le plus simple, vous avez déjà un compte) ou par email
4. Validez votre email si nécessaire

## Étape 2 — Créer un projet

1. Une fois connecté, cliquez **New project**
2. Si on vous demande de créer une "organisation", faites-le (nom : votre prénom suffit)
3. Remplissez :
   - **Name** : `mes-recettes`
   - **Database Password** : générez un mot de passe fort et **conservez-le quelque part** (vous n'en aurez pas besoin pour l'app, mais il pourrait servir si vous voulez accéder à la base)
   - **Region** : choisissez une région proche, par exemple **West EU (Paris)** ou **West EU (Ireland)**
   - **Pricing Plan** : **Free** (par défaut)
4. Cliquez **Create new project**
5. Attendez 1 à 2 minutes que le projet soit prêt

## Étape 3 — Créer la table des recettes

1. Dans le menu de gauche, cliquez sur l'icône **SQL Editor** (un éclair sur fond carré, généralement la 4e icône)
2. Cliquez **New query** (en haut à droite)
3. Copiez-collez **exactement** ce code SQL :

```sql
-- Table des recettes synchronisées
CREATE TABLE recipes (
  id TEXT PRIMARY KEY,
  foyer TEXT NOT NULL,
  data JSONB,
  deleted_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index pour accélérer les requêtes par foyer
CREATE INDEX recipes_foyer_idx ON recipes(foyer);

-- Active Row-Level Security (sécurité)
ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;

-- Politique : tout le monde avec la clé anon peut lire/écrire 
-- (le filtrage se fait via le code "foyer", qui agit comme un mot de passe partagé)
CREATE POLICY "Public access" ON recipes
  FOR ALL 
  USING (true)
  WITH CHECK (true);
```

4. Cliquez **Run** (ou `Ctrl+Enter`)
5. Vous devez voir "Success. No rows returned." en bas

## Étape 4 — Récupérer les identifiants

Supabase a 2 endroits où récupérer les informations dont vous avez besoin :

### a) Project URL (menu "Data API")

1. Dans le menu de gauche, cliquez sur **Settings** (la roue dentée tout en bas)
2. Sous-menu : **Data API** (ou parfois "API")
3. Repérez la section **Project URL** ou **API URL**

Vous voyez quelque chose du type :
```
https://bnymqzlhwyxrabevieus.supabase.co/rest/v1/
```

⚠️ **Important** : pour l'app, copiez uniquement la partie `https://xxxxx.supabase.co` (sans le `/rest/v1/` à la fin). Mais ne vous inquiétez pas, l'app nettoiera automatiquement si vous laissez le suffixe.

### b) Publishable key (menu "API Keys")

1. Toujours dans **Settings**, sous-menu **API Keys**
2. Vous voyez 2 clés :

| Clé | Usage | À utiliser ? |
|-----|-------|--------------|
| **Publishable key** | Clé publique pour les apps client | ✅ **OUI** |
| **Secret key** | Clé admin avec tous les pouvoirs | ❌ **JAMAIS** |

Cliquez sur **Copy** à côté de **Publishable key**. Elle commence par `sb_publishable_...` (nouveau format) ou `eyJ...` (ancien format JWT) — les deux fonctionnent.

> ⚠️ **NE PAS confondre** avec la **Secret key** : elle donne tous les pouvoirs sur votre base et ne doit JAMAIS être mise dans une app client ni partagée.

## Étape 5 — Choisir un code "foyer"

Le code foyer agit comme un **mot de passe partagé** pour ne voir que vos recettes. Choisissez quelque chose :
- Unique (pour que d'autres utilisateurs ne tombent pas dessus par hasard)
- Mémorable (pour le saisir sur les autres appareils)
- Sans espaces ni accents

**Exemples** :
- `dupont-family-2026`
- `recettes-marie-paul-x7k2`
- `ma-cuisine-secrete-42`

## Étape 6 — Configurer l'app sur votre téléphone

1. Ouvrez l'app **Mes Recettes** sur votre téléphone
2. Tapez l'icône **⚙️ Paramètres**
3. Section **Synchronisation entre appareils** :
   - **URL Supabase** : collez l'URL de l'étape 4a
   - **Clé publique anon** : collez la clé de l'étape 4b
   - **Code foyer** : tapez le code que vous avez choisi à l'étape 5
4. Cliquez **Activer la sync**
5. Une notification "Sync activée" apparaît, et l'icône de sync (en haut à droite) montre une coche verte ✓

## Étape 7 — Configurer le téléphone de votre femme

C'est ici que la magie opère :

1. Sur l'iPhone de votre femme, ouvrez l'app **Mes Recettes**
2. ⚙️ Paramètres → Synchronisation entre appareils
3. Saisissez **exactement les mêmes 3 valeurs** que sur votre téléphone :
   - Même URL Supabase
   - Même clé anon
   - **Même code foyer**
4. Activer la sync
5. Toutes vos recettes apparaissent automatiquement sur l'iPhone

## ✅ Comment ça fonctionne au quotidien

- **À chaque ouverture de l'app**, elle récupère les dernières modifications du cloud (sync silencieuse)
- **Quand vous créez/modifiez/supprimez une recette**, elle est envoyée au cloud immédiatement
- **L'icône de sync** dans le header indique l'état :
  - ⟳ tournante = en cours de synchronisation
  - ✓ verte = synchronisé
  - ⚠️ rouge = erreur (touchez "Synchroniser maintenant" dans Paramètres)
  - vide = pas de réseau (l'app fonctionne quand même, sync à la prochaine connexion)

## 🔒 Sécurité

- La clé "anon" Supabase est publique par design (elle est dans le code de l'app)
- Le code foyer agit comme un identifiant + mot de passe partagé. Choisissez quelque chose de pas devinable (ajoutez des caractères aléatoires si vous voulez être sûr)
- Toutes les communications passent en HTTPS chiffré
- Vos recettes ne contiennent généralement rien de sensible — si quelqu'un devine votre code foyer, il pourra lire/modifier vos recettes mais c'est tout
- La clé API Claude **n'est PAS synchronisée** : chaque appareil garde la sienne (vous pouvez utiliser la même ou des clés différentes)

## 🛠️ Si quelque chose ne marche pas

### "Erreur de sync" rouge en permanence
1. Vérifiez que vous avez bien collé l'URL **complète** avec `https://`
2. Vérifiez que la clé anon est bien complète (commence par `eyJ...`)
3. Vérifiez sur l'écran Supabase **SQL Editor** que la commande SQL a bien été exécutée
4. Re-tentez "Synchroniser maintenant" depuis Paramètres

### "Mes recettes ont disparu après l'activation de la sync"
Pas de panique. Si l'app a poussé une base vide vers le cloud sur l'autre appareil avant que vous ne configuriez celui-ci, le merge a remplacé. Vérifiez :
1. Sur l'autre appareil, désactivez temporairement la sync
2. Re-importez les recettes via le fichier d'export JSON (Paramètres → Importer)
3. Réactivez la sync

> 💡 **Bonne pratique** : avant d'activer la sync sur un appareil qui n'a pas de recettes, attendez d'avoir d'abord activé l'appareil principal.

### "Je vois les recettes de quelqu'un d'autre"
Vous avez choisi un code foyer trop générique (ex: `famille`, `recettes`). Changez-le pour quelque chose d'unique (ajoutez votre nom + un nombre aléatoire).

### "Je veux remettre à zéro la base cloud"
Dans Supabase → SQL Editor → New query :
```sql
DELETE FROM recipes WHERE foyer = 'votre-code-foyer-ici';
```

## 📊 Suivre l'usage

Sur Supabase → **Table Editor** → `recipes`, vous voyez toutes vos recettes synchronisées en temps réel. Pratique pour vérifier que ça marche.

Sur **Settings** → **Usage**, vous voyez votre consommation de ressources (largement sous les quotas gratuits pour cet usage).

---

**Une fois configuré, vous n'avez plus rien à faire.** Toutes vos recettes restent synchronisées en arrière-plan entre vos deux appareils. Bon appétit ! 🌿
