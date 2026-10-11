// ============================================================================
// La Maisonnée — fonction « send-reminders » (Supabase Edge Function, gratuite)
// ============================================================================
// Envoie les rappels du calendrier en notification push, même app fermée. Appelée chaque minute par
// pg_cron (supabase/push.sql) avec l'en-tête x-cron-secret. N'accède à la base que par les fonctions
// SQL maisonnee_* de push.sql (aucun droit direct sur les tables).
//
// Mise en place, depuis le Dashboard (sans CLI) : Edge Functions → Deploy a new function → Via Editor,
// nom « send-reminders », coller tout ce fichier, déployer. Puis dans les réglages de la fonction,
// DÉSACTIVER « Verify JWT » : l'appel du cron est authentifié par son secret. Voir SYNC-GUIDE.md.
//
// Écrit en JavaScript (compatible TypeScript). Les fonctions entre les marqueurs « COPIE » sont des
// copies exactes de calendar.js (même calcul que les rappels affichés par l'app) : toute modification
// de ces fonctions dans calendar.js doit être reportée ici à l'identique, puis la fonction redéployée.

import * as webpush from 'jsr:@negrel/webpush@0.5';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = serviceKey();
const WINDOW_MS = 10 * 60 * 1000;  // rattrapage : rappels des 10 dernières minutes pas encore envoyés
const PUSH_TIMEOUT_MS = 8000;      // délai maximal d'un envoi push
const RUN_BUDGET_MS = 20000;       // au-delà, les rappels restants sont libérés pour la minute suivante
const CONTACT = 'https://nohzz.github.io/mes-recettes';

// Clé d'accès à la base : nouvelle clé secrète (sb_secret_…, projets récents) ou ancienne clé
// service_role (JWT), toutes deux injectées automatiquement par Supabase
function serviceKey() {
  try {
    const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}');
    const k = keys.default || Object.values(keys)[0];
    if (typeof k === 'string' && k) return k;
  } catch (e) {
    // variable absente (ancien projet) ou illisible
  }
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
}

// La bibliothèque push appelle fetch sans délai maximal : on en impose un, pour qu'un service push
// muet ne garde pas de connexion ouverte jusqu'à l'arrêt de la fonction
if (typeof Deno !== 'undefined' && Deno.version) {
  const nativeFetch = globalThis.fetch;
  globalThis.fetch = (input, init) => nativeFetch(input,
    init && init.signal ? init : { ...(init || {}), signal: AbortSignal.timeout(PUSH_TIMEOUT_MS) });
}

// >>> COPIE de calendar.js — dates et récurrence

function _pad2(n) {
  return String(n).padStart(2, '0');
}

// 'YYYY-MM-DD' → numéro de jour (jours depuis le 1/1/1970, calculé en UTC : pas d'effet heure d'été)
function _dayNum(dateStr) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
}

function _dayStr(n) {
  const d = new Date(n * 86400000);
  return `${d.getUTCFullYear()}-${_pad2(d.getUTCMonth() + 1)}-${_pad2(d.getUTCDate())}`;
}

// 1 = lundi … 7 = dimanche (le 1/1/1970 était un jeudi)
function _weekday(n) {
  return ((n % 7) + 7 + 3) % 7 + 1;
}

function _isLeap(y) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

function _daysInMonth(y, m) { // m : 1..12
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function _eventSpan(ev) {
  return ev.endDate && ev.endDate > ev.date ? _dayNum(ev.endDate) - _dayNum(ev.date) : 0;
}

// Débuts des occurrences de ev qui touchent [fromStr, toStr] (dates incluses), dans l'ordre.
// Mensuel un 31 : les mois sans 31 sont sautés. Annuel un 29 février : le 28 les autres années.
function eventOccurrences(ev, fromStr, toStr) {
  if (!ev || !ev.date) return [];
  const start = _dayNum(ev.date);
  const span = _eventSpan(ev);
  const from = _dayNum(fromStr), to = _dayNum(toStr);
  const rec = ev.recurrence && ev.recurrence.freq ? ev.recurrence : null;
  const until = rec && rec.until ? _dayNum(rec.until) : Infinity;
  const ex = new Set(ev.exdates || []);
  const out = [];
  const add = n => {
    if (n < start || n > until || n + span < from || n > to) return;
    const s = _dayStr(n);
    if (!ex.has(s)) out.push(s);
  };
  if (!rec) {
    add(start);
    return out;
  }
  const interval = Math.max(1, Math.floor(Number(rec.interval) || 1));
  const lo = Math.max(start, from - span);
  const hi = Math.min(to, until);
  if (lo > hi) return out;
  if (rec.freq === 'daily') {
    for (let n = start + Math.ceil((lo - start) / interval) * interval; n <= hi; n += interval) add(n);
  } else if (rec.freq === 'weekly') {
    const days = Array.isArray(rec.byWeekday) && rec.byWeekday.length ? rec.byWeekday.map(Number) : [_weekday(start)];
    const week0 = start - (_weekday(start) - 1);
    for (let n = lo; n <= hi; n++) {
      if (!days.includes(_weekday(n))) continue;
      const weeks = Math.round((n - (_weekday(n) - 1) - week0) / 7);
      if (weeks % interval === 0) add(n);
    }
  } else if (rec.freq === 'monthly' || rec.freq === 'yearly') {
    const [sy, sm, sd] = ev.date.split('-').map(Number);
    const [ly, lm] = _dayStr(lo).split('-').map(Number);
    const [hy, hm] = _dayStr(hi).split('-').map(Number);
    if (rec.freq === 'monthly') {
      let y = ly, m = lm;
      while (y < hy || (y === hy && m <= hm)) {
        const diff = (y - sy) * 12 + (m - sm);
        if (diff >= 0 && diff % interval === 0 && sd <= _daysInMonth(y, m)) add(_dayNum(`${y}-${_pad2(m)}-${_pad2(sd)}`));
        if (m === 12) { y++; m = 1; } else { m++; }
      }
    } else {
      for (let y = ly; y <= hy; y++) {
        const diff = y - sy;
        if (diff < 0 || diff % interval !== 0) continue;
        const d = sm === 2 && sd === 29 && !_isLeap(y) ? 28 : sd;
        add(_dayNum(`${y}-${_pad2(sm)}-${_pad2(d)}`));
      }
    }
  }
  return out;
}

// <<< fin de la COPIE — dates et récurrence

// >>> COPIE de calendar.js — calcul des rappels

const _tzFormatters = {};
function _tzFormatter(tz) {
  return _tzFormatters[tz] || (_tzFormatters[tz] = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  }));
}

function _tzParts(instantMs, tz) {
  const p = {};
  for (const part of _tzFormatter(tz).formatToParts(new Date(instantMs))) p[part.type] = part.value;
  return p;
}

// Décalage (ms) du fuseau tz à un instant donné : heure murale − UTC
function tzOffsetMs(instantMs, tz) {
  const p = _tzParts(instantMs, tz);
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return asUtc - Math.floor(instantMs / 1000) * 1000;
}

// 'YYYY-MM-DD' + 'HH:MM' en heure murale de tz → instant UTC (ms)
function zonedToUtc(dateStr, timeStr, tz) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = String(timeStr || '00:00').split(':').map(Number);
  const wall = Date.UTC(y, m - 1, d, hh || 0, mm || 0);
  const first = wall - tzOffsetMs(wall, tz);
  return wall - tzOffsetMs(first, tz); // 2e passe : juste autour des changements d'heure
}

// Date locale 'YYYY-MM-DD' d'un instant dans tz
function localDateInTz(instantMs, tz) {
  const p = _tzParts(instantMs, tz);
  return `${p.year}-${p.month}-${p.day}`;
}

const REMINDER_MAX_OFFSET_MIN = 10080; // 1 semaine : le plus long délai proposé (EVENT_REMINDER_OPTIONS)

// Heure murale de référence d'un rappel : l'heure de début, ou 9 h pour un événement « toute la journée »
function _reminderTime(ev) {
  return ev.allDay || !ev.start ? '09:00' : ev.start;
}

function reminderBaseMs(ev, occ, tz) {
  return zonedToUtc(occ, _reminderTime(ev), tz);
}

// Les événements viennent d'autres appareils : un document inattendu est ignoré au lieu de bloquer
// les rappels de toute la famille. Bornes de calcul : un événement RÉCURRENT d'au plus 366 jours (la
// fiche l'impose), 10 délais. (La fiche enregistre endDate: '' et start: '' quand ils sont vides.)
function _reminderEventOk(ev) {
  const day = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
  return !!ev && typeof ev === 'object' && ev.type !== 'meal' && typeof ev.id === 'string' && ev.id !== '' &&
    Array.isArray(ev.reminders) && day(ev.date) &&
    (!ev.endDate || (day(ev.endDate) &&
      (!(ev.recurrence && ev.recurrence.freq) || _dayNum(ev.endDate) - _dayNum(ev.date) <= 366))) &&
    (!ev.start || (typeof ev.start === 'string' && /^\d{2}:\d{2}$/.test(ev.start))) &&
    (ev.exdates == null || Array.isArray(ev.exdates)) &&
    (ev.recurrence == null || typeof ev.recurrence === 'object');
}

// Rappels dont l'heure d'envoi tombe dans [fromMs, toMs], dans l'ordre :
// [{ event, occ, offset, fireAt, when }] — when = 'YYYY-MM-DDTHH:MM', l'heure murale visée : si
// l'événement est déplacé après un rappel, le rappel de la nouvelle heure n'est pas pris pour un doublon
function dueReminders(events, tz, fromMs, toMs) {
  const out = [];
  for (const ev of events) {
    if (!_reminderEventOk(ev)) continue;
    try {
      const offsets = [...new Set(ev.reminders.map(Number)
        .filter(n => Number.isInteger(n) && n >= 0 && n <= REMINDER_MAX_OFFSET_MIN))].slice(0, 10);
      for (const offset of offsets) {
        const lo = localDateInTz(fromMs + offset * 60000 - 86400000, tz);
        const hi = localDateInTz(toMs + offset * 60000 + 86400000, tz);
        for (const occ of eventOccurrences(ev, lo, hi)) {
          const fireAt = reminderBaseMs(ev, occ, tz) - offset * 60000;
          if (fireAt >= fromMs && fireAt <= toMs) out.push({ event: ev, occ, offset, fireAt, when: occ + 'T' + _reminderTime(ev) });
        }
      }
    } catch (e) {
      // document inattendu malgré les contrôles : on passe au suivant
    }
  }
  return out.sort((a, b) => a.fireAt - b.fireAt);
}

// Texte d'une notification de rappel (le tag sert aussi de clé de dédoublonnage dans l'app).
// Un mémo (type 'memo', voir memos.js) a son propre texte et ouvre l'accueil.
function reminderMessage(r) {
  const ev = r.event;
  if (ev.type === 'memo') {
    return {
      title: '📝 ' + (ev.title || 'Mémo'),
      body: 'Mémo · ' + _reminderTime(ev),
      tag: `rem-${ev.id}-${r.when}-${r.offset}`,
      url: './index.html'
    };
  }
  const [y, m, d] = r.occ.split('-').map(Number);
  const day = new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  let when;
  if (ev.allDay || !ev.start) {
    when = r.offset >= 2880 ? `Le ${day}` : r.offset >= 1440 ? 'Demain' : "Aujourd'hui";
  } else {
    when = r.offset === 0 ? `Maintenant (${ev.start})`
      : r.offset < 1440 ? `À ${ev.start}`
        : r.offset < 2880 ? `Demain à ${ev.start}` : `Le ${day} à ${ev.start}`;
  }
  return {
    title: '🔔 ' + (ev.title || 'Rappel'),
    body: when + (ev.location ? ' · 📍 ' + ev.location : ''),
    tag: `rem-${ev.id}-${r.when}-${r.offset}`,
    url: './index.html?view=calendar-agenda'
  };
}
// <<< fin de la COPIE — calcul des rappels

// ============================================================================
// Accès à la base : uniquement les fonctions SQL maisonnee_* de push.sql
// ============================================================================

async function rpc(name, args) {
  const headers = { apikey: SERVICE_KEY, 'Content-Type': 'application/json' };
  // Ancienne clé service_role (JWT) : aussi en Authorization ; clé secrète sb_secret_… : apikey seul
  if (SERVICE_KEY.split('.').length === 3) headers.Authorization = 'Bearer ' + SERVICE_KEY;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST', headers, body: JSON.stringify(args || {}), signal: AbortSignal.timeout(10000)
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${name} → ${res.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

function jsonResponse(body, status) {
  return new Response(JSON.stringify(body), { status: status || 200, headers: { 'Content-Type': 'application/json' } });
}

function validTz(tz) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return tz;
  } catch (e) {
    return 'Europe/Paris';
  }
}

function b64url(bytes) {
  let bin = '';
  for (const b of new Uint8Array(bytes)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Paire de clés VAPID (ECDSA P-256) créée au premier passage ; la clé publique brute (65 octets,
// base64url) sert aux téléphones pour s'abonner, la paire JWK à signer les envois
async function createVapidKeys() {
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  return {
    publicRaw: b64url(await crypto.subtle.exportKey('raw', kp.publicKey)),
    publicJwk: await crypto.subtle.exportKey('jwk', kp.publicKey),
    privateJwk: await crypto.subtle.exportKey('jwk', kp.privateKey)
  };
}

// Téléphones à prévenir. Même règle que l'app (reminders.js) : les membres concernés sont ceux pour qui
// est l'événement et ceux qui s'en occupent (ownerIds). Aucun : toute la famille ; sinon les téléphones
// de ces membres et ceux qui n'ont pas indiqué leur profil. Si aucun n'a de téléphone (ex. un enfant
// seul), toute la famille est prévenue.
function recipientsFor(ev, targets, deviceMembers) {
  const ids = [...(Array.isArray(ev.memberIds) ? ev.memberIds : []), ...(Array.isArray(ev.ownerIds) ? ev.ownerIds : [])];
  if (!ids.length || !ids.some(id => deviceMembers.has(id))) return targets;
  return targets.filter(t => !t.member_id || ids.includes(t.member_id));
}

function withTimeout(promise, ms) {
  let timer;
  const limit = new Promise((resolve, reject) => { timer = setTimeout(() => reject(new Error('délai dépassé')), ms); });
  return Promise.race([promise, limit]).finally(() => clearTimeout(timer));
}

// Réponse du service push : 'gone' (404/410 : abonnement à supprimer), 'refused' (refus définitif,
// ex. clés VAPID rejetées), 'transient' (réseau, délai, 429, 5xx : à retenter)
function pushOutcome(e) {
  const status = e instanceof webpush.PushMessageError && e.response ? e.response.status : 0;
  if (status === 404 || status === 410) return { kind: 'gone', status };
  if (status && status !== 429 && status < 500) return { kind: 'refused', status };
  return { kind: 'transient', status };
}

// ============================================================================
// Exécution (chaque minute)
// ============================================================================

Deno.serve(async (req) => {
  const started = Date.now();
  let cfg;
  try {
    cfg = await rpc('maisonnee_begin_run', { p_secret: req.headers.get('x-cron-secret') || '' });
  } catch (e) {
    console.error('send-reminders', e);
    return jsonResponse({ ok: false, error: String((e && e.message) || e) }, 500);
  }
  if (!cfg) return jsonResponse({ error: 'forbidden' }, 403);

  const result = { at: new Date(started).toISOString(), due: 0, sent: 0, failed: 0, refused: 0, gone: 0 };
  const pending = []; // rappels réservés, pas encore traités : libérés si le passage s'arrête avant
  const gone = new Set();
  const release = item => rpc('maisonnee_release_reminder', {
    p_household: item.hid, p_event_id: item.r.event.id, p_occurrence: item.r.when, p_offset_min: item.r.offset
  });
  try {
    // Premier passage : la fonction crée elle-même les clés de notification
    if (!cfg.public_jwk || !cfg.private_jwk) {
      const k = await createVapidKeys();
      await rpc('maisonnee_store_vapid_keys', { p_public_raw: k.publicRaw, p_public_jwk: k.publicJwk, p_private_jwk: k.privateJwk });
      result.keys = 'créées';
      return jsonResponse({ ok: true, ...result });
    }

    const targets = (await rpc('maisonnee_push_targets')) || [];
    if (!targets.length) return jsonResponse({ ok: true, ...result });

    // Rappels dus, famille par famille : un document inattendu dans une famille ne bloque pas les autres
    const fromMs = started - WINDOW_MS;
    const pFrom = _dayStr(Math.floor(fromMs / 86400000) - 1); // marge d'un jour : fuseaux horaires
    const pTo = _dayStr(Math.floor(started / 86400000) + 9);  // + 7 jours de délai de rappel maximum
    const dueByHousehold = new Map();
    for (const hid of new Set(targets.map(t => t.household_id))) {
      if (Date.now() - started > RUN_BUDGET_MS / 2) {
        result.failed++;
        console.error('send-reminders : budget de temps dépassé, familles suivantes reportées');
        break;
      }
      try {
        const rows = (await rpc('maisonnee_reminder_candidates', { p_household: hid, p_from: pFrom, p_to: pTo })) || [];
        if (!rows.length) continue;
        const due = dueReminders(rows.map(r => r.data), validTz(rows[0].tz), fromMs, started);
        if (due.length) dueByHousehold.set(hid, due);
      } catch (e) {
        result.failed++;
        if (!result.error) {
          result.error = ('famille ignorée : ' + String((e && e.message) || e)).slice(0, 300);
          result.error_stage = 'prepare';
        }
        console.error('send-reminders : famille ignorée', hid, e && e.message);
      }
    }
    for (const due of dueByHousehold.values()) result.due += due.length;
    if (!result.due) return jsonResponse({ ok: true, ...result });

    // Tout ce qui peut échouer sans rien envoyer est fait AVANT de réserver les rappels
    const deviceMembers = new Map(); // famille → profils qui ont un téléphone
    for (const u of (await rpc('maisonnee_device_members')) || []) {
      if (!deviceMembers.has(u.household_id)) deviceMembers.set(u.household_id, new Set());
      deviceMembers.get(u.household_id).add(u.member_id);
    }
    const vapidKeys = await webpush.importVapidKeys({
      publicKey: JSON.parse(cfg.public_jwk),
      privateKey: JSON.parse(cfg.private_jwk)
    }, { extractable: false });
    const appServer = await webpush.ApplicationServer.new({ contactInformation: cfg.subject || CONTACT, vapidKeys });
    const urgency = (webpush.Urgency && webpush.Urgency.High) || 'high';

    // Réservation (dédoublonnage atomique) : seuls les rappels pas encore envoyés reviennent
    for (const [hid, due] of dueByHousehold) {
      const claimed = (await rpc('maisonnee_claim_reminders', {
        p_household: hid, p_rows: due.map(r => ({ event_id: r.event.id, occurrence: r.when, offset_min: r.offset }))
      })) || [];
      const fresh = new Set(claimed.map(c => `${c.event_id}|${c.occurrence}|${c.offset_min}`));
      for (const r of due) if (fresh.has(`${r.event.id}|${r.when}|${r.offset}`)) pending.push({ hid, r });
    }

    while (pending.length && Date.now() - started < RUN_BUDGET_MS) {
      const item = pending[0];
      const recipients = recipientsFor(item.r.event,
        targets.filter(t => t.household_id === item.hid && !gone.has(t.endpoint)),
        deviceMembers.get(item.hid) || new Set());
      const payload = JSON.stringify(reminderMessage(item.r));
      // Envois en parallèle, chacun avec un délai maximal : un service push muet ne bloque pas les autres
      const outcomes = await Promise.all(recipients.map(t =>
        withTimeout(appServer.subscribe({ endpoint: t.endpoint, keys: { p256dh: t.p256dh, auth: t.auth } })
          .pushTextMessage(payload, { ttl: 3600, urgency }), PUSH_TIMEOUT_MS)
          .then(() => ({ kind: 'ok' }), e => {
            const o = pushOutcome(e);
            if (o.kind === 'gone') gone.add(t.endpoint);
            else console.error('push', o.kind, o.status || (e && e.message), t.endpoint.slice(0, 60));
            return o;
          })));
      const count = kind => outcomes.filter(o => o.kind === kind).length;
      result.sent += count('ok');
      result.failed += count('transient');
      result.refused += count('refused');
      result.gone += count('gone');
      // Aucun envoi réussi à cause d'erreurs passagères : retenté à la minute suivante (dans la fenêtre).
      // Retiré de la liste seulement ensuite : si la libération échoue, le finally la retente.
      if (!count('ok') && count('transient')) await release(item);
      pending.shift();
    }
    if (pending.length) result.deferred = pending.length;
    return jsonResponse({ ok: true, ...result });
  } catch (e) {
    result.error = String((e && e.message) || e).slice(0, 300);
    result.error_stage = result.due ? 'send' : 'prepare';
    console.error('send-reminders', e);
    return jsonResponse({ ok: false, ...result }, 500);
  } finally {
    // Rappels réservés mais pas traités (erreur, budget de temps) : libérés pour la minute suivante
    for (const item of pending) {
      try { await release(item); } catch (e) { console.error('libération impossible', e && e.message); }
    }
    if (gone.size) {
      try { await rpc('maisonnee_drop_subscriptions', { p_endpoints: [...gone] }); } catch (e) { console.error('purge', e && e.message); }
    }
    try { await rpc('maisonnee_end_run', { p_result: result }); } catch (e) { console.error('bilan', e && e.message); }
  }
});
