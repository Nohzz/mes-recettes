-- ============================================================================
-- La Maisonnée — schéma de synchronisation familiale (Supabase)
-- ============================================================================
-- À coller dans Supabase → SQL Editor → New query → Run. Réexécutable sans risque.
-- Prérequis : Authentication → Sign In / Providers → « Allow anonymous sign-ins » ACTIVÉ.
--
-- Principe : chaque téléphone ouvre une session ANONYME (aucun email) et rejoint une famille avec
-- un code d'invitation. Toutes les données de la famille sont des documents JSON dans
-- household_data, que seuls les appareils membres de la famille peuvent lire ou écrire (RLS).
--
-- Les tables de l'ANCIENNE synchronisation « code foyer » (recipes, planning, shopping_lists)
-- ne sont pas modifiées : l'app les lit une fois pour importer les données (retour arrière possible).
-- ============================================================================


-- 1. Tables ------------------------------------------------------------------

create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Ma famille' check (char_length(name) between 1 and 60),
  invite_code text unique,
  invite_expires_at timestamptz,
  tz text not null default 'Europe/Paris',
  created_at timestamptz not null default now(),
  created_by uuid
);

-- Un appareil (utilisateur anonyme) membre d'une famille
create table if not exists public.household_users (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  member_id text,                    -- profil « C'est moi » (document kind='members')
  role text not null default 'member' check (role in ('admin', 'member')),
  device_label text,
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz,
  primary key (household_id, user_id)
);
create index if not exists household_users_user_idx on public.household_users (user_id);

-- Tous les documents synchronisés : kind = 'recipes' | 'shopping_lists' | 'events' | 'members' | …
create table if not exists public.household_data (
  household_id uuid not null references public.households(id) on delete cascade,
  kind text not null check (char_length(kind) between 1 and 40),
  id text not null check (char_length(id) between 1 and 200),
  data jsonb,                        -- null = document supprimé
  deleted_at timestamptz,
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid,
  primary key (household_id, kind, id)
);
-- Pull incrémental : household_id + updated_at, départage par (kind, id)
create index if not exists household_data_sync_idx on public.household_data (household_id, updated_at, kind, id);


-- 2. Horodatage serveur -------------------------------------------------------
-- updated_at vient de l'horloge du serveur (pas de celle des téléphones) : c'est le curseur du
-- pull incrémental. clock_timestamp() donne un instant distinct à chaque ligne d'un même upsert.

create or replace function public.household_data_touch() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at := clock_timestamp();
  new.updated_by := auth.uid();
  return new;
end $$;

drop trigger if exists household_data_touch on public.household_data;
create trigger household_data_touch
  before insert or update on public.household_data
  for each row execute function public.household_data_touch();


-- 3. Fonctions d'accès --------------------------------------------------------
-- security definer : lit household_users sans repasser par sa RLS (évite la récursion).

create or replace function public.my_household_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select household_id from public.household_users where user_id = auth.uid()
$$;

create or replace function public._maisonnee_is_member(p_household uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.household_users where household_id = p_household and user_id = auth.uid())
$$;

create or replace function public._maisonnee_is_admin(p_household uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.household_users
                 where household_id = p_household and user_id = auth.uid() and role = 'admin')
$$;

-- Code d'invitation : 10 caractères sans ambiguïté (pas de 0/O ni 1/I/L), ~8·10^14 combinaisons.
-- Aléa : octets entièrement aléatoires d'un uuid v4 (générateur sûr de Postgres, sans pgcrypto).
create or replace function public._maisonnee_invite_code() returns text
language plpgsql volatile set search_path = public as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  b bytea := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
  idx int[] := array[0, 1, 2, 3, 4, 5, 10, 11, 12, 13];
  code text := '';
  i int;
begin
  foreach i in array idx loop
    code := code || substr(alphabet, 1 + (get_byte(b, i) % length(alphabet)), 1);
  end loop;
  return code;
end $$;


-- 4. Sécurité au niveau des lignes (RLS) --------------------------------------

alter table public.households enable row level security;
alter table public.household_users enable row level security;
alter table public.household_data enable row level security;

drop policy if exists households_select on public.households;
create policy households_select on public.households
  for select to authenticated
  using (id in (select public.my_household_ids()));

drop policy if exists household_users_select on public.household_users;
create policy household_users_select on public.household_users
  for select to authenticated
  using (household_id in (select public.my_household_ids()));

drop policy if exists household_data_select on public.household_data;
create policy household_data_select on public.household_data
  for select to authenticated
  using (household_id in (select public.my_household_ids()));

drop policy if exists household_data_insert on public.household_data;
create policy household_data_insert on public.household_data
  for insert to authenticated
  with check (household_id in (select public.my_household_ids()));

drop policy if exists household_data_update on public.household_data;
create policy household_data_update on public.household_data
  for update to authenticated
  using (household_id in (select public.my_household_ids()))
  with check (household_id in (select public.my_household_ids()));

-- Pas de policy « delete » : les suppressions sont « douces » (data = null, deleted_at).
-- Familles et appareils ne se modifient que par les fonctions ci-dessous.

revoke all on public.households, public.household_users, public.household_data from anon;
grant select on public.households, public.household_users to authenticated;
grant select, insert, update on public.household_data to authenticated;


-- 5. Fonctions appelées par l'app (POST /rest/v1/rpc/<nom>) ------------------

-- Premier appareil : crée la famille, en devient administrateur, reçoit un code valable 7 jours
create or replace function public.create_household(p_name text, p_tz text default 'Europe/Paris')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_name text := left(coalesce(nullif(btrim(p_name), ''), 'Ma famille'), 60);
  v_code text := public._maisonnee_invite_code();
  v_exp timestamptz := now() + interval '7 days';
  v_mine record;
begin
  if v_uid is null then raise exception 'Connexion requise' using errcode = '28000'; end if;
  perform pg_advisory_xact_lock(hashtext('maisonnee_create_household')); -- deux créations simultanées
  -- Appel rejoué par son auteur (réponse perdue en route) : on lui renvoie SA famille au lieu d'un refus
  select h.id, h.name, h.invite_code, h.invite_expires_at, u.role into v_mine
    from public.household_users u join public.households h on h.id = u.household_id
   where u.user_id = v_uid and h.created_by = v_uid order by u.joined_at limit 1;
  if found then
    return jsonb_build_object('household_id', v_mine.id, 'name', v_mine.name, 'invite_code', v_mine.invite_code,
                              'invite_expires_at', v_mine.invite_expires_at, 'role', v_mine.role);
  end if;
  -- Un projet = une famille : le lien d'invitation contient l'adresse et la clé publique du projet,
  -- il ne doit pas permettre d'y installer d'autres familles (données, notifications…). Une famille
  -- sans aucun appareil ne compte pas. Pour héberger plusieurs familles, supprimez ce bloc.
  if exists (select 1 from public.household_users) then
    raise exception 'Ce projet Supabase héberge déjà une famille : rejoignez-la avec un lien d''invitation' using errcode = 'P0001';
  end if;
  if (select count(*) from public.households where created_by = v_uid) >= 5 then
    raise exception 'Trop de familles créées depuis cet appareil';
  end if;
  insert into public.households (name, invite_code, invite_expires_at, tz, created_by)
  -- Fuseau inconnu ou neutre (navigateur réglé sur UTC, anti-pistage) : celui par défaut, modifiable ensuite
  values (v_name, v_code, v_exp,
          case when p_tz in (select name from pg_timezone_names) and p_tz !~ '^(UTC|GMT|Etc/|Universal$|Zulu$)'
               then p_tz else 'Europe/Paris' end,
          v_uid)
  returning id into v_id;
  insert into public.household_users (household_id, user_id, role, last_seen_at)
  values (v_id, v_uid, 'admin', now());
  return jsonb_build_object('household_id', v_id, 'name', v_name, 'invite_code', v_code, 'invite_expires_at', v_exp, 'role', 'admin');
end $$;

-- Appareil suivant : rejoint la famille avec le code d'invitation
create or replace function public.join_household(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_h public.households%rowtype;
  v_role text;
begin
  if v_uid is null then raise exception 'Connexion requise' using errcode = '28000'; end if;
  -- Verrou sur la famille : une jonction ne se croise pas avec le départ du dernier appareil
  select * into v_h from public.households
   where invite_code = upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'))
     and (invite_expires_at is null or invite_expires_at > now())
   for update;
  if not found then
    raise exception 'Code d''invitation invalide ou expiré' using errcode = 'P0001';
  end if;
  -- Famille sans administrateur (appareils perdus retirés, par exemple) : le nouvel appareil le devient
  insert into public.household_users (household_id, user_id, role, last_seen_at)
  values (v_h.id, v_uid,
          case when exists (select 1 from public.household_users where household_id = v_h.id and role = 'admin')
               then 'member' else 'admin' end,
          now())
  on conflict (household_id, user_id) do update set last_seen_at = now();
  select role into v_role from public.household_users where household_id = v_h.id and user_id = v_uid;
  return jsonb_build_object('household_id', v_h.id, 'name', v_h.name, 'role', v_role);
end $$;

-- Nouveau code d'invitation (l'ancien cesse de fonctionner)
create or replace function public.regenerate_invite(p_household uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_code text := public._maisonnee_invite_code();
  v_exp timestamptz := now() + interval '7 days';
begin
  if not public._maisonnee_is_member(p_household) then raise exception 'Accès refusé' using errcode = '42501'; end if;
  update public.households set invite_code = v_code, invite_expires_at = v_exp where id = p_household;
  return jsonb_build_object('invite_code', v_code, 'invite_expires_at', v_exp);
end $$;

create or replace function public.rename_household(p_household uuid, p_name text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public._maisonnee_is_member(p_household) then raise exception 'Accès refusé' using errcode = '42501'; end if;
  update public.households set name = left(coalesce(nullif(btrim(p_name), ''), 'Ma famille'), 60) where id = p_household;
end $$;

-- « C'est moi » : relie cet appareil à un profil de membre (sert à cibler les rappels)
create or replace function public.set_my_member(p_household uuid, p_member_id text, p_device_label text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.household_users
     set member_id = nullif(p_member_id, ''),
         device_label = coalesce(nullif(left(p_device_label, 40), ''), device_label),
         last_seen_at = now()
   where household_id = p_household and user_id = auth.uid();
  if not found then raise exception 'Accès refusé' using errcode = '42501'; end if;
end $$;

-- Un administrateur retire un autre appareil : il perd immédiatement l'accès aux données, et le code
-- d'invitation change (celui que connaît l'appareil retiré ne lui permet pas de revenir seul)
drop function if exists public.remove_device(uuid, uuid); -- l'ancienne version ne renvoyait rien
create or replace function public.remove_device(p_household uuid, p_user uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_code text := public._maisonnee_invite_code();
  v_exp timestamptz := now() + interval '7 days';
begin
  if not public._maisonnee_is_admin(p_household) then raise exception 'Réservé aux administrateurs' using errcode = '42501'; end if;
  if p_user = auth.uid() then raise exception 'Utilisez « Quitter la famille » pour cet appareil'; end if;
  -- Verrou sur la famille AVANT de toucher aux appareils (toujours dans cet ordre : pas d'interblocage)
  perform 1 from public.households where id = p_household for update;
  delete from public.household_users where household_id = p_household and user_id = p_user;
  update public.households set invite_code = v_code, invite_expires_at = v_exp where id = p_household;
  return jsonb_build_object('invite_code', v_code, 'invite_expires_at', v_exp);
end $$;

-- Cet appareil quitte la famille (la promotion d'un administrateur est faite par le trigger ci-dessous)
create or replace function public.leave_household(p_household uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  -- Verrou sur la famille AVANT de toucher aux appareils (toujours dans cet ordre : pas d'interblocage)
  perform 1 from public.households where id = p_household for update;
  delete from public.household_users where household_id = p_household and user_id = auth.uid();
end $$;

-- Après tout départ d'appareil (quitter, retrait par l'admin, suppression de l'utilisateur anonyme) :
-- la famille garde un administrateur (le plus ancien membre), et une famille vide n'est plus joignable
create or replace function public._maisonnee_after_device_removed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Verrou sur la famille : deux départs simultanés (ou une jonction) sont traités l'un après l'autre,
  -- et chacun voit ce que l'autre a validé
  perform 1 from public.households where id = old.household_id for update;
  if not exists (select 1 from public.household_users where household_id = old.household_id) then
    update public.households set invite_code = null, invite_expires_at = null where id = old.household_id;
  elsif not exists (select 1 from public.household_users where household_id = old.household_id and role = 'admin') then
    -- De préférence un appareil libre (skip locked : un appareil en cours de suppression ailleurs n'est
    -- pas attendu) ; à défaut, le plus ancien, quitte à attendre une courte modification en cours
    update public.household_users set role = 'admin'
     where household_id = old.household_id
       and user_id = coalesce(
         (select user_id from public.household_users
           where household_id = old.household_id order by joined_at limit 1 for update skip locked),
         (select user_id from public.household_users
           where household_id = old.household_id order by joined_at limit 1));
  end if;
  return old;
end $$;

drop trigger if exists household_users_after_delete on public.household_users;
create trigger household_users_after_delete
  after delete on public.household_users
  for each row execute function public._maisonnee_after_device_removed();


-- 6. Droits d'exécution --------------------------------------------------------

revoke execute on function public.my_household_ids() from public, anon;
revoke execute on function public._maisonnee_is_member(uuid) from public, anon, authenticated;
revoke execute on function public._maisonnee_is_admin(uuid) from public, anon, authenticated;
revoke execute on function public._maisonnee_invite_code() from public, anon, authenticated;
revoke execute on function public._maisonnee_after_device_removed() from public, anon, authenticated;
revoke execute on function public.create_household(text, text) from public, anon;
revoke execute on function public.join_household(text) from public, anon;
revoke execute on function public.regenerate_invite(uuid) from public, anon;
revoke execute on function public.rename_household(uuid, text) from public, anon;
revoke execute on function public.set_my_member(uuid, text, text) from public, anon;
revoke execute on function public.remove_device(uuid, uuid) from public, anon;
revoke execute on function public.leave_household(uuid) from public, anon;

grant execute on function public.my_household_ids() to authenticated;
grant execute on function public.create_household(text, text) to authenticated;
grant execute on function public.join_household(text) to authenticated;
grant execute on function public.regenerate_invite(uuid) to authenticated;
grant execute on function public.rename_household(uuid, text) to authenticated;
grant execute on function public.set_my_member(uuid, text, text) to authenticated;
grant execute on function public.remove_device(uuid, uuid) to authenticated;
grant execute on function public.leave_household(uuid) to authenticated;


-- 7. (Optionnel, plus tard) Verrouiller l'ANCIENNE sync « code foyer » ------------
-- Une fois TOUS les téléphones passés à La Maisonnée (la famille créée a importé les données),
-- on peut retirer l'accès public aux anciennes tables, ou les supprimer :
--
--   drop policy if exists "Public access" on public.recipes;
--   drop policy if exists "Public access" on public.planning;
--   drop policy if exists "Public access" on public.shopping_lists;
--   -- ou, après avoir vérifié la famille :  drop table public.recipes, public.planning, public.shopping_lists;
