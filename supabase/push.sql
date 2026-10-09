-- ============================================================================
-- La Maisonnée — rappels en notification push, même app fermée (Supabase, gratuit)
-- ============================================================================
-- À exécuter UNE fois dans Supabase → SQL Editor, APRÈS schema.sql. Réexécutable sans risque.
--
-- ⚠️ AVANT D'EXÉCUTER : remplacez VOTRE-PROJET ci-dessous (étape 0) par l'identifiant du projet,
--    visible dans l'adresse du Dashboard ou dans Project Settings → API (https://xxxx.supabase.co).
--
-- Fonctionnement : chaque minute, pg_cron appelle la fonction send-reminders (code dans
-- supabase/functions/send-reminders/index.ts, à créer dans Edge Functions), qui calcule les rappels
-- du calendrier à envoyer et les pousse aux téléphones abonnés (Web Push, gratuit).
-- Les clés de notification (VAPID) sont créées par la fonction elle-même à son premier passage :
-- rien à copier à la main. La fonction n'accède aux données QUE par les fonctions SQL de l'étape 4
-- (aucun droit direct sur les tables). Mode d'emploi complet : SYNC-GUIDE.md.
-- ============================================================================


-- 0. Adresse du projet (⚠️ à remplacer) -----------------------------------------

create table if not exists public.app_config (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
-- Réglages internes (clés VAPID, secret du cron) : RLS active SANS policy → invisibles pour les appareils
alter table public.app_config enable row level security;
revoke all on public.app_config from anon, authenticated;

do $$
declare
  v_project_url text := 'https://VOTRE-PROJET.supabase.co';   -- ⚠️ À REMPLACER
begin
  if v_project_url like '%VOTRE-PROJET%' then
    raise exception 'Remplacez VOTRE-PROJET (étape 0 de push.sql) par l''identifiant de votre projet Supabase';
  end if;
  v_project_url := rtrim(btrim(v_project_url), '/');
  if v_project_url !~ '^https://[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$' then
    raise exception 'Adresse de projet invalide : % (attendu : https://identifiant.supabase.co)', v_project_url;
  end if;
  insert into public.app_config (key, value) values ('project_url', v_project_url)
  on conflict (key) do update set value = excluded.value, updated_at = now();
  -- Secret partagé avec le cron : seul lui peut déclencher l'envoi des rappels
  insert into public.app_config (key, value)
  values ('cron_secret', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
  on conflict (key) do nothing;
  -- Nouvelle installation ou correction : l'ancien problème signalé dans les Réglages est oublié
  delete from public.app_config where key = 'last_problem';
end $$;


-- 1. Extensions (incluses dans le plan gratuit) ----------------------------------

create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;
create extension if not exists pg_net with schema extensions;


-- 2. Tables ----------------------------------------------------------------------

-- Un abonnement push par téléphone (navigateur) ; aucun accès direct, tout passe par les fonctions
create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_household_idx on public.push_subscriptions (household_id);
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;

-- Rappels déjà envoyés : un rappel (événement, heure visée 'YYYY-MM-DDTHH:MM', délai) ne part qu'une
-- fois, même si le cron passe deux fois ou si deux exécutions se chevauchent
create table if not exists public.reminder_log (
  household_id uuid not null references public.households(id) on delete cascade,
  event_id text not null,
  occurrence text not null,
  offset_min integer not null,
  sent_at timestamptz not null default now(),
  primary key (household_id, event_id, occurrence, offset_min)
);
alter table public.reminder_log enable row level security;
revoke all on public.reminder_log from anon, authenticated;

-- Un appareil qui quitte la famille (ou en est retiré) ne reçoit plus ses rappels
create or replace function public._maisonnee_drop_push_subscriptions() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from public.push_subscriptions where household_id = old.household_id and user_id = old.user_id;
  return old;
end $$;

drop trigger if exists household_users_drop_push on public.household_users;
create trigger household_users_drop_push
  after delete on public.household_users
  for each row execute function public._maisonnee_drop_push_subscriptions();


-- 3. Fonctions appelées par l'app (POST /rest/v1/rpc/<nom>) ---------------------

-- Anciennes versions (ce script les remplace)
drop function if exists public.get_push_config();
drop function if exists public.set_vapid_keys(text, jsonb, jsonb);

-- Clé publique des notifications, dernier passage du serveur, dernier problème et dernier envoi réussi
-- (diagnostic des Réglages), fuseau de la famille
create or replace function public.get_push_config(p_household uuid default null)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'public_key', (select value from public.app_config where key = 'vapid_public_raw'),
    'last_run_at', (select value from public.app_config where key = 'last_run_at'),
    'last_problem', (select value::jsonb from public.app_config where key = 'last_problem'),
    'last_sent_at', (select value from public.app_config where key = 'last_sent_at'),
    'tz', (select h.tz from public.households h
            where h.id = p_household and public._maisonnee_is_member(p_household)))
  where exists (select 1 from public.household_users where user_id = auth.uid())
$$;

-- Abonnement push de ce téléphone. Seuls les services push des navigateurs sont acceptés (sinon le
-- serveur enverrait des requêtes vers n'importe quelle adresse), avec un nombre limité par famille.
create or replace function public.save_push_subscription(p_household uuid, p_endpoint text, p_p256dh text,
                                                         p_auth text, p_user_agent text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public._maisonnee_is_member(p_household) then raise exception 'Accès refusé' using errcode = '42501'; end if;
  -- Chrome / Android / Edge Android, Firefox, Safari / iOS, Edge Windows (liste à compléter si besoin)
  if coalesce(p_endpoint, '') !~ '^https://(fcm\.googleapis\.com|android\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)/'
     or length(p_endpoint) > 1000
     or coalesce(p_p256dh, '') !~ '^[A-Za-z0-9_-]{87}=?$'
     or coalesce(p_auth, '') !~ '^[A-Za-z0-9_-]{22}(==)?$' then
    raise exception 'Abonnement invalide' using errcode = '22023';
  end if;
  if not exists (select 1 from public.push_subscriptions where endpoint = p_endpoint) and (
       (select count(*) from public.push_subscriptions where household_id = p_household) >= 20
       or (select count(*) from public.push_subscriptions where user_id = auth.uid()) >= 5) then
    raise exception 'Trop d''abonnements aux notifications pour cette famille' using errcode = '22023';
  end if;
  insert into public.push_subscriptions (endpoint, user_id, household_id, p256dh, auth, user_agent)
  values (p_endpoint, auth.uid(), p_household, p_p256dh, p_auth, left(p_user_agent, 300))
  on conflict (endpoint) do update
    set user_id = excluded.user_id, household_id = excluded.household_id, p256dh = excluded.p256dh,
        auth = excluded.auth, user_agent = excluded.user_agent, created_at = now();
end $$;

-- Abonnements enregistrés par une version précédente vers un autre service : retirés
delete from public.push_subscriptions
 where endpoint !~ '^https://(fcm\.googleapis\.com|android\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)/';

create or replace function public.delete_push_subscription(p_endpoint text)
returns void language sql security definer set search_path = public as $$
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id = auth.uid()
$$;

-- Fuseau horaire des rappels de la famille (réglé par l'app d'un administrateur qui active les rappels)
create or replace function public.set_household_tz(p_household uuid, p_tz text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public._maisonnee_is_admin(p_household) then raise exception 'Réservé aux administrateurs' using errcode = '42501'; end if;
  if not exists (select 1 from pg_timezone_names where name = p_tz) then
    raise exception 'Fuseau horaire inconnu : %', p_tz using errcode = '22023';
  end if;
  update public.households set tz = p_tz where id = p_household;
end $$;


-- 4. Fonctions réservées à send-reminders (clé secrète / service_role) -----------

-- Début d'un passage : vérifie le secret du cron, note l'heure, renvoie les clés (null si mauvais secret)
create or replace function public.maisonnee_begin_run(p_secret text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_secret text;
begin
  select value into v_secret from public.app_config where key = 'cron_secret';
  if v_secret is null or p_secret is distinct from v_secret then
    return null;
  end if;
  insert into public.app_config (key, value)
  values ('last_run_at', to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
  on conflict (key) do update set value = excluded.value, updated_at = now();
  return jsonb_build_object(
    'public_jwk', (select value from public.app_config where key = 'vapid_public_jwk'),
    'private_jwk', (select value from public.app_config where key = 'vapid_private_jwk'),
    'subject', (select value from public.app_config where key = 'vapid_subject'));
end $$;

-- Bilan du passage, et dernier problème signalé dans les Réglages de l'app. Une erreur est effacée par
-- le passage suivant sans erreur si elle venait de la préparation, sinon par le suivant sans erreur qui
-- avait un rappel dû. Des envois refusés ou en échec restent enregistrés (l'app les masque après un envoi
-- réussi ou au bout de 7 jours).
create or replace function public.maisonnee_end_run(p_result jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v jsonb := case when jsonb_typeof(p_result) = 'object' and length(p_result::text) <= 4000
                  then p_result else jsonb_build_object('error', 'bilan illisible') end;
begin
  insert into public.app_config (key, value) values ('last_result', v::text)
  on conflict (key) do update set value = excluded.value, updated_at = now();
  -- Passage sans erreur : une erreur de préparation passée est réglée ; une erreur d'envoi ne l'est
  -- qu'à un passage qui avait des rappels à envoyer (les étapes d'envoi n'ont lieu qu'alors)
  if not (v ? 'error') then
    delete from public.app_config
     where key = 'last_problem' and value::jsonb ? 'error'
       and (value::jsonb->>'error_stage' = 'prepare' or coalesce((v->>'due')::numeric, 0) > 0);
  end if;
  if v ? 'error' or coalesce((v->>'refused')::numeric, 0) > 0 or coalesce((v->>'failed')::numeric, 0) > 0 then
    insert into public.app_config (key, value) values ('last_problem', v::text)
    on conflict (key) do update set value = excluded.value, updated_at = now();
  end if;
  if coalesce((v->>'sent')::numeric, 0) > 0 then
    insert into public.app_config (key, value) values ('last_sent_at', coalesce(v->>'at', now()::text))
    on conflict (key) do update set value = excluded.value, updated_at = now();
  end if;
end $$;

-- Clés de notification créées par la fonction à son premier passage ; jamais remplacées ensuite.
-- Renvoie la clé publique en place (celle d'un passage concurrent, le cas échéant).
create or replace function public.maisonnee_store_vapid_keys(p_public_raw text, p_public_jwk jsonb, p_private_jwk jsonb)
returns text language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.app_config where key = 'vapid_public_raw') then
    if coalesce(p_public_raw, '') !~ '^[A-Za-z0-9_-]{87}$'
       or p_public_jwk->>'kty' is distinct from 'EC' or p_public_jwk->>'crv' is distinct from 'P-256'
       or p_public_jwk->>'x' is null or p_public_jwk->>'y' is null or p_private_jwk->>'d' is null
       or p_private_jwk->>'x' is distinct from p_public_jwk->>'x'
       or p_private_jwk->>'y' is distinct from p_public_jwk->>'y' then
      raise exception 'Clés de notification invalides' using errcode = '22023';
    end if;
    insert into public.app_config (key, value) values
      ('vapid_public_raw', p_public_raw),
      ('vapid_public_jwk', p_public_jwk::text),
      ('vapid_private_jwk', p_private_jwk::text)
    on conflict (key) do nothing;
    delete from public.app_config where key = 'last_problem'; -- nouvelles clés : l'ancien refus ne vaut plus
  end if;
  return (select value from public.app_config where key = 'vapid_public_raw');
end $$;

-- Abonnements des appareils encore membres de leur famille, avec le profil « C'est moi »
create or replace function public.maisonnee_push_targets()
returns table (endpoint text, household_id uuid, member_id text, p256dh text, auth text)
language sql stable security definer set search_path = public as $$
  select s.endpoint, s.household_id, u.member_id, s.p256dh, s.auth
    from public.push_subscriptions s
    join public.household_users u on u.household_id = s.household_id and u.user_id = s.user_id
   order by s.household_id, s.endpoint
$$;

-- Profils qui ont un téléphone, dans les familles abonnées (règle de ciblage des rappels)
create or replace function public.maisonnee_device_members()
returns table (household_id uuid, member_id text)
language sql stable security definer set search_path = public as $$
  select distinct u.household_id, u.member_id
    from public.household_users u
   where u.member_id is not null
     and u.household_id in (select s.household_id from public.push_subscriptions s)
$$;

-- Événements d'UNE famille qui peuvent avoir un rappel entre p_from et p_to (dates 'YYYY-MM-DD') :
-- documents bien formés seulement, réduits aux champs utiles au calcul (moins de données lues
-- chaque minute), délais de rappel entiers de 0 à 10 080 minutes. Pré-filtre des répétitions : un
-- événement annuel n'est lu que si son jour et son mois tombent dans la fenêtre, un mensuel que si
-- son jour du mois y tombe (le calcul exact est fait par la fonction).
drop function if exists public.maisonnee_reminder_candidates(text, text);
create or replace function public.maisonnee_reminder_candidates(p_household uuid, p_from text, p_to text)
returns table (tz text, data jsonb)
language sql stable security definer set search_path = public as $$
  with win as (
    select to_char(g, 'MM-DD') as md, to_char(g, 'DD') as dd
      from generate_series(p_from::date, p_to::date, interval '1 day') g
  )
  select h.tz, jsonb_build_object(
      'id', d.id,
      'type', 'event',
      'title', left(coalesce(d.data->>'title', ''), 120),
      'location', left(coalesce(d.data->>'location', ''), 120),
      'date', d.data->>'date',
      'endDate', case when coalesce(d.data->>'endDate', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then d.data->'endDate' end,
      'start', case when jsonb_typeof(d.data->'start') = 'string' then d.data->'start' end,
      'allDay', case when jsonb_typeof(d.data->'allDay') = 'boolean' then d.data->'allDay' else 'false'::jsonb end,
      'recurrence', case when jsonb_typeof(d.data->'recurrence') = 'object' then d.data->'recurrence' end,
      'exdates', case when jsonb_typeof(d.data->'exdates') = 'array' then d.data->'exdates' else '[]'::jsonb end,
      'memberIds', case when jsonb_typeof(d.data->'memberIds') = 'array' then d.data->'memberIds' else '[]'::jsonb end,
      'reminders', (select coalesce(jsonb_agg(v.m), '[]'::jsonb)
                      from (select distinct (r #>> '{}')::int as m
                              from jsonb_array_elements(d.data->'reminders') r
                             where case when jsonb_typeof(r) = 'number' and (r #>> '{}') ~ '^[0-9]{1,5}$'
                                        then (r #>> '{}')::int <= 10080 else false end
                             limit 10) v))
    from public.household_data d
    join public.households h on h.id = d.household_id
   where d.household_id = p_household and d.kind = 'events' and d.deleted_at is null
     and jsonb_typeof(d.data) = 'object'
     and coalesce(d.data->>'type', 'event') <> 'meal'
     and case when jsonb_typeof(d.data->'reminders') = 'array' then jsonb_array_length(d.data->'reminders') > 0 else false end
     and jsonb_typeof(d.data->'date') = 'string' and (d.data->>'date') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
     and (d.data->>'date') <= p_to
     and case when jsonb_typeof(d.data->'recurrence') = 'object'
              then coalesce(d.data->'recurrence'->>'until', '9999-12-31') >= p_from
                   and case d.data->'recurrence'->>'freq'
                         when 'yearly' then substr(d.data->>'date', 6, 5) in (select md from win)
                                            or (substr(d.data->>'date', 6, 5) = '02-29' and '02-28' in (select md from win))
                         when 'monthly' then substr(d.data->>'date', 9, 2) in (select dd from win)
                         else true end
              else (d.data->>'date') >= p_from end
   order by d.id
   limit 500
$$;

-- Réserve les rappels à envoyer (dédoublonnage atomique) : ne renvoie que ceux pas encore envoyés.
-- Les lignes mal formées sont ignorées au lieu de faire échouer toute la réservation.
create or replace function public.maisonnee_claim_reminders(p_household uuid, p_rows jsonb)
returns table (event_id text, occurrence text, offset_min integer)
language sql volatile security definer set search_path = public as $$
  insert into public.reminder_log (household_id, event_id, occurrence, offset_min)
  select p_household, r->>'event_id', r->>'occurrence', (r->>'offset_min')::int
    from jsonb_array_elements(case when jsonb_typeof(p_rows) = 'array' then p_rows else '[]'::jsonb end) r
   where jsonb_typeof(r->'event_id') = 'string' and length(r->>'event_id') between 1 and 200
     and jsonb_typeof(r->'occurrence') = 'string' and length(r->>'occurrence') between 1 and 40
     and coalesce(r->>'offset_min', '') ~ '^[0-9]{1,5}$'
  on conflict do nothing
  returning reminder_log.event_id, reminder_log.occurrence, reminder_log.offset_min
$$;

-- Libère un rappel réservé mais pas envoyé (erreur passagère) : il sera retenté à la minute suivante
create or replace function public.maisonnee_release_reminder(p_household uuid, p_event_id text, p_occurrence text, p_offset_min integer)
returns void language sql security definer set search_path = public as $$
  delete from public.reminder_log
   where household_id = p_household and event_id = p_event_id and occurrence = p_occurrence and offset_min = p_offset_min
$$;

-- Abonnements refusés définitivement par le service push (404 / 410 : désinstallé, expiré, révoqué)
create or replace function public.maisonnee_drop_subscriptions(p_endpoints text[])
returns void language sql security definer set search_path = public as $$
  delete from public.push_subscriptions where endpoint = any(p_endpoints)
$$;


-- 5. Droits d'exécution ------------------------------------------------------------
-- (les tables n'ont aucun droit pour anon, authenticated ni service_role : tout passe par ces fonctions)

revoke execute on function public._maisonnee_drop_push_subscriptions() from public, anon, authenticated;
revoke execute on function public.get_push_config(uuid) from public, anon;
revoke execute on function public.save_push_subscription(uuid, text, text, text, text) from public, anon;
revoke execute on function public.delete_push_subscription(text) from public, anon;
revoke execute on function public.set_household_tz(uuid, text) from public, anon;
revoke execute on function public.maisonnee_begin_run(text) from public, anon, authenticated;
revoke execute on function public.maisonnee_end_run(jsonb) from public, anon, authenticated;
revoke execute on function public.maisonnee_store_vapid_keys(text, jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.maisonnee_push_targets() from public, anon, authenticated;
revoke execute on function public.maisonnee_device_members() from public, anon, authenticated;
revoke execute on function public.maisonnee_reminder_candidates(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.maisonnee_claim_reminders(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.maisonnee_release_reminder(uuid, text, text, integer) from public, anon, authenticated;
revoke execute on function public.maisonnee_drop_subscriptions(text[]) from public, anon, authenticated;

grant execute on function public.get_push_config(uuid) to authenticated;
grant execute on function public.save_push_subscription(uuid, text, text, text, text) to authenticated;
grant execute on function public.delete_push_subscription(text) to authenticated;
grant execute on function public.set_household_tz(uuid, text) to authenticated;
grant execute on function public.maisonnee_begin_run(text) to service_role;
grant execute on function public.maisonnee_end_run(jsonb) to service_role;
grant execute on function public.maisonnee_store_vapid_keys(text, jsonb, jsonb) to service_role;
grant execute on function public.maisonnee_push_targets() to service_role;
grant execute on function public.maisonnee_device_members() to service_role;
grant execute on function public.maisonnee_reminder_candidates(uuid, text, text) to service_role;
grant execute on function public.maisonnee_claim_reminders(uuid, jsonb) to service_role;
grant execute on function public.maisonnee_release_reminder(uuid, text, text, integer) to service_role;
grant execute on function public.maisonnee_drop_subscriptions(text[]) to service_role;


-- 6. Tâches planifiées ---------------------------------------------------------------
-- Chaque minute (≈ 43 000 appels par mois, quota gratuit : 500 000) : seulement si un téléphone est
-- abonné, ou tant que les clés de notification n'existent pas (la fonction les crée).
-- Chaque nuit : oubli des rappels envoyés il y a plus de 3 jours, et de l'historique du cron
-- (pg_cron ne le purge pas : sans ça, la base gratuite finirait par se remplir).

select cron.unschedule(jobid) from cron.job
 where jobname in ('maisonnee-rappels', 'maisonnee-purge-rappels', 'maisonnee-purge-historique');

select cron.schedule('maisonnee-rappels', '* * * * *', $cron$
  select net.http_post(
    url := (select value from public.app_config where key = 'project_url') || '/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select value from public.app_config where key = 'cron_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  )
  where exists (select 1 from public.push_subscriptions)
     or not exists (select 1 from public.app_config where key = 'vapid_public_raw')
$cron$);

select cron.schedule('maisonnee-purge-rappels', '17 3 * * *', $cron$
  delete from public.reminder_log where sent_at < now() - interval '3 days'
$cron$);

select cron.schedule('maisonnee-purge-historique', '27 3 * * *', $cron$
  delete from cron.job_run_details where coalesce(end_time, start_time) < now() - interval '2 days'
$cron$);


-- 7. Diagnostic (à lancer si les rappels n'arrivent pas) ------------------------------
--   select key, case when key like 'vapid_private%' or key = 'cron_secret' then '***' else value end
--     from public.app_config;               -- clés créées ? dernier passage ? dernier bilan (last_result) ?
--   select created, status_code, timed_out, error_msg, left(content, 300) as content
--     from net._http_response order by created desc limit 5;
--        -- réponses de la fonction : content (erreur 500, 401 « Invalid API key »…), error_msg (réseau)
--   select count(*) from public.push_subscriptions;                -- téléphones abonnés
--   select * from public.reminder_log order by sent_at desc limit 10;  -- rappels envoyés
--
-- Repartir de zéro pour les notifications (nouvelles clés ; chaque téléphone devra les réactiver) :
--   delete from public.app_config where key like 'vapid_%' or key in ('last_problem', 'last_sent_at');
--   delete from public.push_subscriptions;
