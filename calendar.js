// ============================================
// LA MAISONNÉE — Calendrier : modèle des événements
// ============================================
// state.events = { [id]: événement }. Les repas du planning SONT des événements (type 'meal') :
// un événement par (jour, créneau), d'id déterministe `meal-YYYY-MM-DD-<créneau>` — les mêmes clés
// que l'ancien planning, ce qui rend la migration idempotente (deux appareils produisent le même id).
//
// Forme d'un repas :
//   { id, type: 'meal', date: 'YYYY-MM-DD', slot: 'midi'|'soir'|'autre', allDay: true,
//     recipes: [{ id, servings }], memberIds: [], createdAt, updatedAt }
//
// Script classique chargé après app.js : utilise state, safeSave, formatPlanningDate, getSlotRecipes,
// STORAGE_KEYS (et markDirty de sync.js quand il existe).

const EVENTS_STORAGE_KEY = 'mr_events';
const EVENTS_MIGRATION_KEY = 'mr_events_version';
const EVENTS_MIGRATION_VERSION = 'meals-v1';
const MEAL_SLOT_KEY_RE = /^(\d{4}-\d{2}-\d{2})-(midi|soir|autre)$/;
const MEAL_RETENTION_DAYS = 30; // au-delà, les repas passés sont purgés localement (comme l'ancien planning)

// --- Persistance -------------------------------------------------------------

let _saveEventsTimer = null;

// Écriture différée : un menu IA ou « vider la semaine » touche plusieurs créneaux d'un coup
function saveEvents() {
  if (_saveEventsTimer) clearTimeout(_saveEventsTimer);
  _saveEventsTimer = setTimeout(saveEventsNow, 150);
}

function saveEventsNow() {
  if (_saveEventsTimer) {
    clearTimeout(_saveEventsTimer);
    _saveEventsTimer = null;
  }
  return safeSave(EVENTS_STORAGE_KEY, state.events, 'calendrier');
}

// Ne pas perdre une écriture différée si l'app passe en arrière-plan ou se ferme
window.addEventListener('pagehide', () => { if (_saveEventsTimer) saveEventsNow(); });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && _saveEventsTimer) saveEventsNow();
});

function loadEvents() {
  try {
    const raw = localStorage.getItem(EVENTS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    state.events = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (e) {
    console.error('[calendrier] lecture impossible, calendrier vide', e);
    state.events = {};
  }
  _migratePlanningToEvents();
  _purgeOldMeals();
}

// Migration douce, une seule fois : ancien planning ({ 'YYYY-MM-DD-slot': entrée }) → repas.
// L'ancienne clé mr_planning est conservée telle quelle (retour arrière possible).
function _migratePlanningToEvents() {
  if (localStorage.getItem(EVENTS_MIGRATION_KEY) === EVENTS_MIGRATION_VERSION) return;
  let planning = {};
  try {
    planning = JSON.parse(localStorage.getItem(STORAGE_KEYS.planning) || '{}') || {};
  } catch (e) {
    console.warn('[calendrier] ancien planning illisible, migration ignorée', e);
  }
  let migrated = 0;
  for (const [key, entry] of Object.entries(planning)) {
    if (_importLegacyPlanningEntry(key, entry)) migrated++;
  }
  saveEventsNow();
  try { localStorage.setItem(EVENTS_MIGRATION_KEY, EVENTS_MIGRATION_VERSION); } catch (e) { /* quota : on réessaiera au prochain démarrage */ }
  if (migrated > 0) console.info(`[calendrier] ${migrated} repas migrés depuis l'ancien planning`);
}

// Convertit une entrée de l'ancien planning (ancien ou nouveau format) en repas, sans écraser un
// repas déjà présent. Sert aussi à l'import de l'ancienne sync « foyer ». Renvoie true si ajouté.
function _importLegacyPlanningEntry(slotKey, entry, updatedAtOverride) {
  const m = MEAL_SLOT_KEY_RE.exec(slotKey);
  if (!m) return false;
  const recipes = getSlotRecipes(entry).map(r => ({ id: r.id, servings: r.servings || null }));
  if (recipes.length === 0) return false;
  const id = mealEventId(slotKey);
  if (state.events[id]) return false;
  const ts = updatedAtOverride || (entry && entry.updatedAt) || Date.now();
  state.events[id] = {
    id, type: 'meal', date: m[1], slot: m[2], allDay: true,
    recipes, memberIds: [], createdAt: ts, updatedAt: ts
  };
  return true;
}

// Purge locale des repas trop anciens (pas de tombstone : ils restent dans la famille côté serveur)
function _purgeOldMeals() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - MEAL_RETENTION_DAYS);
  const cutoffStr = formatPlanningDate(cutoff);
  let purged = 0;
  for (const [id, ev] of Object.entries(state.events)) {
    if (ev && ev.type === 'meal' && ev.date < cutoffStr) {
      delete state.events[id];
      purged++;
    }
  }
  if (purged > 0) saveEventsNow();
}

// --- Repas du planning -----------------------------------------------------------

// Clé de créneau 'YYYY-MM-DD-<créneau>' → id de l'événement repas
function mealEventId(slotKey) {
  return 'meal-' + slotKey;
}

// Recettes d'un créneau de repas : [{ id, servings }] (vide si aucun repas)
function getMealRecipes(slotKey) {
  const ev = state.events[mealEventId(slotKey)];
  if (!ev || !Array.isArray(ev.recipes)) return [];
  return ev.recipes.filter(r => r && r.id).map(r => ({ ...r }));
}

// Remplace les recettes d'un créneau. Liste vide = le repas est supprimé.
function setMealRecipes(slotKey, recipes) {
  const m = MEAL_SLOT_KEY_RE.exec(slotKey);
  if (!m) return;
  const id = mealEventId(slotKey);
  const clean = (recipes || [])
    .filter(r => r && r.id)
    .map(r => ({ id: r.id, servings: r.servings || null }));
  const now = Date.now();
  if (clean.length === 0) {
    if (!state.events[id]) return;
    delete state.events[id];
  } else {
    const prev = state.events[id];
    state.events[id] = {
      ...(prev || { id, type: 'meal', date: m[1], slot: m[2], allDay: true, memberIds: [], createdAt: now }),
      recipes: clean,
      updatedAt: now
    };
  }
  saveEvents();
  if (typeof markDirty === 'function') markDirty('events', id);
  _calendarRefreshIfVisible();
}

// Une modification de repas (depuis le planning, le picker, la sync…) rafraîchit le calendrier ou le hub affiché
function _calendarRefreshIfVisible() {
  const v = state.currentView;
  if (v && v.startsWith('calendar-')) renderCalendar();
  else if (v === 'hub' && typeof renderHub === 'function') renderHub();
}

// ============================================
// Dates (jours calendaires, insensibles aux changements d'heure)
// ============================================

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

function calendarToday() {
  return formatPlanningDate(new Date());
}

function shiftDate(dateStr, days) {
  return _dayStr(_dayNum(dateStr) + days);
}

function _mondayOf(dateStr) {
  const n = _dayNum(dateStr);
  return _dayStr(n - (_weekday(n) - 1));
}

function _fmtDate(dateStr, fmt) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('fr-FR', fmt);
}

function _capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

// ============================================
// Récurrence et requêtes
// ============================================
// Événement : { id, type: 'event', title, category, date, endDate?, allDay, start?, end?, memberIds: [],
//   location, notes, recurrence: null | { freq: 'daily'|'weekly'|'monthly'|'yearly', interval, byWeekday?, until? },
//   exdates: ['YYYY-MM-DD'…] (occurrences supprimées), reminders: [minutes…], createdAt, updatedAt }

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

const _MEAL_SLOT_ORDER = { midi: 1, soir: 2, autre: 3 };

// Toute la journée, puis repas (midi, soir, autre), puis horaires
function _compareCalendarItems(a, b) {
  const rank = it => it.isMeal ? 1 : (it.ev.allDay || !it.ev.start || (it.multiDay && !it.isFirstDay)) ? 0 : 2;
  const ra = rank(a), rb = rank(b);
  if (ra !== rb) return ra - rb;
  if (ra === 1) return (_MEAL_SLOT_ORDER[a.ev.slot] || 9) - (_MEAL_SLOT_ORDER[b.ev.slot] || 9);
  if (ra === 2) return (a.ev.start || '').localeCompare(b.ev.start || '');
  return (a.ev.title || '').localeCompare(b.ev.title || '', 'fr');
}

// Événements et repas qui touchent [fromStr, toStr], étalés jour par jour.
// opts.meals (défaut true), opts.members : ids filtrés (un événement « toute la famille » reste visible).
// Renvoie une Map 'YYYY-MM-DD' → [{ ev, date (début de l'occurrence), isMeal, multiDay, isFirstDay }].
function calendarItemsByDay(fromStr, toStr, opts) {
  const o = opts || {};
  const members = o.members || [];
  const from = _dayNum(fromStr), to = _dayNum(toStr);
  const map = new Map();
  for (const ev of Object.values(state.events)) {
    if (!ev || !ev.date) continue;
    const isMeal = ev.type === 'meal';
    if (isMeal && o.meals === false) continue;
    if (!isMeal && members.length && (ev.memberIds || []).length && !ev.memberIds.some(id => members.includes(id))) continue;
    if (isMeal && !(ev.recipes || []).length) continue;
    const span = isMeal ? 0 : _eventSpan(ev);
    const occs = isMeal ? (ev.date >= fromStr && ev.date <= toStr ? [ev.date] : []) : eventOccurrences(ev, fromStr, toStr);
    for (const occ of occs) {
      const s = _dayNum(occ);
      for (let n = Math.max(s, from); n <= Math.min(s + span, to); n++) {
        const day = _dayStr(n);
        if (!map.has(day)) map.set(day, []);
        map.get(day).push({ ev, date: occ, isMeal, multiDay: span > 0, isFirstDay: n === s });
      }
    }
  }
  for (const list of map.values()) list.sort(_compareCalendarItems);
  return map;
}

// ============================================
// Rappels : calcul des envois (fonctions pures)
// ============================================
// Ce bloc ET les fonctions de dates/récurrence ci-dessus (_pad2 … eventOccurrences) sont recopiés
// dans supabase/functions/send-reminders/index.ts : toute modification doit y être reportée.

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

// Texte d'une notification de rappel (le tag sert aussi de clé de dédoublonnage dans l'app)
function reminderMessage(r) {
  const ev = r.event;
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

// <<< fin du bloc recopié

function saveCalendarEvent(ev) {
  const now = Date.now();
  ev.updatedAt = now;
  if (!ev.createdAt) ev.createdAt = now;
  state.events[ev.id] = ev;
  saveEvents();
  markDirty('events', ev.id);
}

function deleteCalendarEvent(id) {
  if (!state.events[id]) return;
  delete state.events[id];
  saveEvents();
  markDirty('events', id);
}

// ============================================
// Vues du calendrier : Jour · Semaine · Mois · À venir
// ============================================

const CALENDAR_PREFS_KEY = 'mr_calendar_prefs';
const CALENDAR_MODES = ['day', 'week', 'month', 'agenda'];
const _cal = { mode: 'month', anchor: '', members: [], meals: true };

(function _loadCalendarPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem(CALENDAR_PREFS_KEY) || '{}') || {};
    if (CALENDAR_MODES.includes(p.mode)) _cal.mode = p.mode;
    if (Array.isArray(p.members)) _cal.members = p.members.filter(x => typeof x === 'string');
    if (typeof p.meals === 'boolean') _cal.meals = p.meals;
  } catch (e) { /* préférences par défaut */ }
})();

function _saveCalendarPrefs() {
  try {
    localStorage.setItem(CALENDAR_PREFS_KEY, JSON.stringify({ mode: _cal.mode, members: _cal.members, meals: _cal.meals }));
  } catch (e) { /* non bloquant */ }
}

for (const mode of CALENDAR_MODES) {
  VIEWS['calendar-' + mode] = { app: 'calendar', tab: true, section: 'calendar', title: 'Calendrier', render: () => renderCalendar(mode) };
}
APPS.calendar.soon = false;
APPS.calendar.home = 'calendar-' + _cal.mode;

const _CAL_ICON_PREV = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 19l-7-7 7-7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const _CAL_ICON_NEXT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 5l7 7-7 7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const _CAL_ICON_CLOSE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 18L18 6M6 6l12 12" stroke-linecap="round"/></svg>';

function renderCalendar(mode) {
  if (mode && CALENDAR_MODES.includes(mode)) _cal.mode = mode;
  if (!_cal.anchor) _cal.anchor = calendarToday();
  _cal.members = _cal.members.filter(id => getMember(id));
  APPS.calendar.home = 'calendar-' + _cal.mode;
  _saveCalendarPrefs();
  const el = document.getElementById('calendar-content');
  if (!el) return;
  const body = _cal.mode === 'month' ? _calMonthHtml()
    : _cal.mode === 'week' ? _calWeekHtml()
      : _cal.mode === 'day' ? _calDayHtml()
        : _calAgendaHtml();
  el.innerHTML = _calToolbarHtml() + _calFiltersHtml() + body;
}
window.renderCalendar = renderCalendar;

function _calOpts() {
  return { meals: _cal.meals, members: _cal.members };
}

function _calPeriodLabel() {
  const a = _cal.anchor;
  if (_cal.mode === 'month') return _capitalize(_fmtDate(a, { month: 'long', year: 'numeric' }));
  if (_cal.mode === 'week') {
    const mon = _mondayOf(a);
    return `${_fmtDate(mon, { day: 'numeric', month: 'short' })} → ${_fmtDate(shiftDate(mon, 6), { day: 'numeric', month: 'short' })}`;
  }
  if (_cal.mode === 'day') return _capitalize(_fmtDate(a, { weekday: 'long', day: 'numeric', month: 'long' }));
  return 'Les 30 prochains jours';
}

function _calToolbarHtml() {
  const nav = _cal.mode !== 'agenda';
  return `<div class="cal-toolbar">
    ${nav ? `<button class="icon-btn" onclick="calShift(-1)" aria-label="Période précédente">${_CAL_ICON_PREV}</button>` : ''}
    <div class="cal-period">${escapeHtml(_calPeriodLabel())}</div>
    ${nav ? `<button class="icon-btn" onclick="calShift(1)" aria-label="Période suivante">${_CAL_ICON_NEXT}</button>` : ''}
    <button class="cal-today-btn" onclick="calGoToday()">Aujourd'hui</button>
  </div>`;
}

function _calFiltersHtml() {
  const chips = state.members.map(m => `
    <button class="cal-chip${_cal.members.includes(m.id) ? ' is-active' : ''}" onclick="calToggleMember(${_jsArg(m.id)})">
      ${memberAvatarHtml(m, 'sm')}<span>${escapeHtml(m.name)}</span>
    </button>`).join('');
  return `<div class="cal-filters">
    <button class="cal-chip${_cal.members.length ? '' : ' is-active'}" onclick="calToggleMember('')">Tous</button>
    ${chips}
    <button class="cal-chip${_cal.meals ? ' is-active' : ''}" onclick="calToggleMeals()">🍽️ Repas</button>
  </div>`;
}

function _calItemColor(it) {
  if (it.isMeal) return 'var(--color-primary-soft)';
  const m = (it.ev.memberIds || []).map(getMember).find(Boolean);
  return m ? `var(--member-${memberColorId(m)})` : 'var(--color-primary)';
}

function _calItemHtml(it) {
  const ev = it.ev;
  if (it.isMeal) {
    const slot = MEAL_SLOTS.find(s => s.id === ev.slot);
    const titles = (ev.recipes || []).map(r => (state.recipes.find(x => x.id === r.id) || {}).title).filter(Boolean);
    return `<button class="cal-item cal-item-meal" style="--event-color: ${_calItemColor(it)}" onclick="openMealSheet(${_jsArg(ev.date + '-' + ev.slot)})">
      <span class="cal-item-time">${slot ? slot.emoji : '🍽️'} ${escapeHtml(slot ? slot.label : 'Repas')}</span>
      <span class="cal-item-main"><span class="cal-item-title">${escapeHtml(titles.join(', ') || 'Recette introuvable')}</span></span>
    </button>`;
  }
  const cat = EVENT_CATEGORIES.find(c => c.id === ev.category) || EVENT_CATEGORIES[EVENT_CATEGORIES.length - 1];
  const members = (ev.memberIds || []).map(getMember).filter(Boolean);
  const time = (ev.allDay || !ev.start)
    ? (it.multiDay ? 'Plusieurs jours' : 'Journée')
    : (it.multiDay && !it.isFirstDay ? 'Suite' : ev.start + (ev.end ? '–' + ev.end : ''));
  return `<button class="cal-item" style="--event-color: ${_calItemColor(it)}" onclick="openEventEditor(${_jsArg(ev.id)}, ${_jsArg(it.date)})">
    <span class="cal-item-time">${escapeHtml(time)}</span>
    <span class="cal-item-main">
      <span class="cal-item-title">${cat.emoji} ${escapeHtml(ev.title || cat.label)}${ev.recurrence ? ' <span class="cal-item-repeat" title="Événement récurrent">↻</span>' : ''}</span>
      ${ev.location ? `<span class="cal-item-sub">📍 ${escapeHtml(ev.location)}</span>` : ''}
    </span>
    <span class="cal-item-members">${members.slice(0, 3).map(m => memberAvatarHtml(m, 'sm')).join('')}</span>
  </button>`;
}

function _calListHtml(list, day) {
  const add = `<button class="cal-add-link" onclick="openEventEditor(null, null, ${_jsArg(day)})">+ Ajouter un événement</button>`;
  if (!list.length) return `<p class="cal-empty">Rien de prévu.</p>${add}`;
  return `<div class="cal-list">${list.map(_calItemHtml).join('')}</div>${add}`;
}

function _calMonthHtml() {
  const [y, m] = _cal.anchor.split('-').map(Number);
  const first = `${y}-${_pad2(m)}-01`;
  const last = `${y}-${_pad2(m)}-${_pad2(_daysInMonth(y, m))}`;
  const gridStart = _mondayOf(first);
  const weeks = Math.ceil((_dayNum(last) - _dayNum(gridStart) + 1) / 7);
  const gridEnd = shiftDate(gridStart, weeks * 7 - 1);
  const items = calendarItemsByDay(gridStart, gridEnd, _calOpts());
  const today = calendarToday();
  const month = first.slice(0, 7);
  let cells = '';
  for (let i = 0; i < weeks * 7; i++) {
    const day = shiftDate(gridStart, i);
    const list = items.get(day) || [];
    const dots = list.slice(0, 4).map(it => `<span class="cal-dot" style="--event-color: ${_calItemColor(it)}"></span>`).join('');
    const cls = (day.slice(0, 7) !== month ? ' is-other' : '') + (day === today ? ' is-today' : '') + (day === _cal.anchor ? ' is-selected' : '');
    cells += `<button class="cal-cell${cls}" onclick="calSelectDay(${_jsArg(day)})" aria-label="${escapeHtml(_fmtDate(day, { weekday: 'long', day: 'numeric', month: 'long' }))}${list.length ? ', ' + list.length + ' élément' + (list.length > 1 ? 's' : '') : ''}">
      <span class="cal-cell-num">${Number(day.slice(8))}</span>
      <span class="cal-cell-dots">${dots}${list.length > 4 ? `<span class="cal-more">+${list.length - 4}</span>` : ''}</span>
    </button>`;
  }
  const head = ['L', 'M', 'M', 'J', 'V', 'S', 'D'].map(d => `<span class="cal-head">${d}</span>`).join('');
  return `<div class="cal-month">${head}${cells}</div>
    <section class="cal-day-panel">
      <h3 class="cal-day-title">${escapeHtml(_capitalize(_fmtDate(_cal.anchor, { weekday: 'long', day: 'numeric', month: 'long' })))}</h3>
      ${_calListHtml(items.get(_cal.anchor) || [], _cal.anchor)}
    </section>`;
}

function _calWeekHtml() {
  const mon = _mondayOf(_cal.anchor);
  const items = calendarItemsByDay(mon, shiftDate(mon, 6), _calOpts());
  const today = calendarToday();
  let html = '<div class="cal-week">';
  for (let i = 0; i < 7; i++) {
    const day = shiftDate(mon, i);
    const list = items.get(day) || [];
    html += `<section class="cal-week-day${day === today ? ' is-today' : ''}">
      <button class="cal-week-head" onclick="calOpenDay(${_jsArg(day)})">
        <span class="cal-week-name">${escapeHtml(_capitalize(_fmtDate(day, { weekday: 'long' })))}</span>
        <span class="cal-week-date">${escapeHtml(_fmtDate(day, { day: 'numeric', month: 'short' }))}</span>
      </button>
      ${list.length ? `<div class="cal-list">${list.map(_calItemHtml).join('')}</div>` : '<p class="cal-empty">—</p>'}
    </section>`;
  }
  return html + '</div>';
}

function _calDayHtml() {
  const day = _cal.anchor;
  const items = calendarItemsByDay(day, day, _calOpts());
  return `<section class="cal-day-panel">${_calListHtml(items.get(day) || [], day)}</section>`;
}

function _calAgendaHtml() {
  const today = calendarToday();
  const items = calendarItemsByDay(today, shiftDate(today, 29), _calOpts());
  let html = '';
  for (let i = 0; i < 30; i++) {
    const day = shiftDate(today, i);
    const list = items.get(day);
    if (!list || !list.length) continue;
    const label = i === 0 ? "Aujourd'hui" : i === 1 ? 'Demain' : _capitalize(_fmtDate(day, { weekday: 'long', day: 'numeric', month: 'long' }));
    html += `<section class="cal-agenda-day">
      <h3 class="cal-agenda-title">${escapeHtml(label)}</h3>
      <div class="cal-list">${list.map(_calItemHtml).join('')}</div>
    </section>`;
  }
  return html || `<div class="cal-empty-state">
    <p>Rien de prévu dans les 30 prochains jours.</p>
    <button class="btn-primary" onclick="openEventEditor()">+ Ajouter un événement</button>
  </div>`;
}

function calShift(delta) {
  if (_cal.mode === 'month') {
    const [y, m] = _cal.anchor.split('-').map(Number);
    const target = new Date(y, m - 1 + delta, 1);
    const today = calendarToday();
    const tm = formatPlanningDate(target).slice(0, 7);
    _cal.anchor = today.slice(0, 7) === tm ? today : formatPlanningDate(target);
  } else {
    _cal.anchor = shiftDate(_cal.anchor, _cal.mode === 'week' ? 7 * delta : delta);
  }
  renderCalendar();
}
window.calShift = calShift;

function calGoToday() {
  _cal.anchor = calendarToday();
  renderCalendar();
}
window.calGoToday = calGoToday;

function calSelectDay(day) {
  _cal.anchor = day;
  renderCalendar();
}
window.calSelectDay = calSelectDay;

function calOpenDay(day) {
  _cal.anchor = day;
  if (state.currentView === 'calendar-day') renderCalendar(); // déjà sur la vue Jour : navigateTo ne redessine pas
  else navigateTo('calendar-day');
}
window.calOpenDay = calOpenDay;

function calToggleMember(id) {
  if (!id) _cal.members = [];
  else if (_cal.members.includes(id)) _cal.members = _cal.members.filter(x => x !== id);
  else _cal.members = [..._cal.members, id];
  renderCalendar();
}
window.calToggleMember = calToggleMember;

function calToggleMeals() {
  _cal.meals = !_cal.meals;
  renderCalendar();
}
window.calToggleMeals = calToggleMeals;

// ============================================
// Fiche d'un événement (création / modification)
// ============================================

let _calEditing = null; // { ev (copie de travail), isNew, occDate, seriesStart }

function openEventEditor(id, occDate, presetDate) {
  const existing = id ? state.events[id] : null;
  if (existing && existing.type === 'meal') {
    openMealSheet(existing.date + '-' + existing.slot);
    return;
  }
  const now = new Date();
  const ev = existing ? JSON.parse(JSON.stringify(existing)) : {
    id: 'ev_' + uid(), type: 'event', title: '', category: 'rdv',
    date: presetDate || (state.currentView && state.currentView.startsWith('calendar-') ? _cal.anchor : '') || calendarToday(),
    endDate: '', allDay: false,
    start: _pad2((now.getHours() + 1) % 24) + ':00', end: _pad2((now.getHours() + 2) % 24) + ':00',
    memberIds: state.sync.memberId && getMember(state.sync.memberId) ? [state.sync.memberId] : [],
    location: '', notes: '', recurrence: null, exdates: [], reminders: [60]
  };
  const seriesStart = ev.date;
  // Une occurrence d'un événement récurrent s'affiche à SA date (le début de la série est gardé à part)
  if (existing && existing.recurrence && occDate && occDate !== ev.date) {
    const span = _eventSpan(ev);
    ev.date = occDate;
    ev.endDate = span ? shiftDate(occDate, span) : '';
  }
  _calEditing = { ev, isNew: !existing, occDate: occDate || ev.date, seriesStart };
  openSheet('event-editor', _eventEditorHtml(ev, !existing));
}
window.openEventEditor = openEventEditor;

function _repeatValue(rec) {
  if (!rec || !rec.freq) return 'none';
  if (rec.freq === 'weekly' && Number(rec.interval) === 2) return 'biweekly';
  return rec.freq;
}

function _eventEditorHtml(ev, isNew) {
  const cats = EVENT_CATEGORIES.map(c => `<button type="button" class="cal-pick${c.id === ev.category ? ' is-selected' : ''}" data-value="${c.id}" onclick="calPickCategory(this)">${c.emoji} ${escapeHtml(c.label)}</button>`).join('');
  const members = state.members.length
    ? state.members.map(m => `<button type="button" class="cal-pick cal-pick-member${(ev.memberIds || []).includes(m.id) ? ' is-selected' : ''}" data-value="${escapeHtml(m.id)}" onclick="this.classList.toggle('is-selected')">${memberAvatarHtml(m, 'sm')} ${escapeHtml(m.name)}</button>`).join('')
    : `<p class="family-hint">Ajoutez les membres de la famille pour leur assigner des événements : <button type="button" class="btn-link" onclick="calEditorOpenFamily()">Gérer la famille</button></p>`;
  const reminders = EVENT_REMINDER_OPTIONS.map(r => `<button type="button" class="cal-pick${(ev.reminders || []).includes(r.minutes) ? ' is-selected' : ''}" data-value="${r.minutes}" onclick="this.classList.toggle('is-selected')">${escapeHtml(r.label)}</button>`).join('');
  const repeat = _repeatValue(ev.recurrence);
  const repeatOptions = [['none', 'Jamais'], ['daily', 'Chaque jour'], ['weekly', 'Chaque semaine'], ['biweekly', 'Toutes les 2 semaines'], ['monthly', 'Chaque mois'], ['yearly', 'Chaque année']]
    .map(([v, l]) => `<option value="${v}"${v === repeat ? ' selected' : ''}>${l}</option>`).join('');
  return `
    <div class="modal-header">
      <h2>${isNew ? 'Nouvel événement' : 'Événement'}</h2>
      <button class="icon-btn icon-btn-light" onclick="closeSheet('event-editor')" aria-label="Fermer">${_CAL_ICON_CLOSE}</button>
    </div>
    <div class="sheet-body cal-editor" id="event-editor-body">
      <input id="ev-title" class="family-input cal-title-input" value="${escapeHtml(ev.title || '')}" maxlength="80" placeholder="Titre (ex. Dentiste de Léo)" autocomplete="off">
      <span class="family-label">Catégorie</span>
      <div class="cal-picks" id="ev-category" data-value="${escapeHtml(ev.category || 'rdv')}">${cats}</div>
      <div class="cal-row">
        <div class="cal-field"><label class="family-label" for="ev-date">Date</label><input type="date" id="ev-date" class="family-input" value="${escapeHtml(ev.date)}"></div>
        <div class="cal-field"><label class="family-label" for="ev-end-date">Fin (facultatif)</label><input type="date" id="ev-end-date" class="family-input" value="${escapeHtml(ev.endDate || '')}"></div>
      </div>
      <label class="settings-toggle cal-toggle"><input type="checkbox" id="ev-all-day"${ev.allDay ? ' checked' : ''} onchange="calToggleAllDay(this.checked)"><span>Toute la journée</span></label>
      <div class="cal-row${ev.allDay ? ' hidden' : ''}" id="ev-times">
        <div class="cal-field"><label class="family-label" for="ev-start">Début</label><input type="time" id="ev-start" class="family-input" value="${escapeHtml(ev.start || '')}"></div>
        <div class="cal-field"><label class="family-label" for="ev-end">Fin</label><input type="time" id="ev-end" class="family-input" value="${escapeHtml(ev.end || '')}"></div>
      </div>
      <span class="family-label">Pour qui ? <small>(aucun = toute la famille)</small></span>
      <div class="cal-picks" id="ev-members">${members}</div>
      <div class="cal-row">
        <div class="cal-field"><label class="family-label" for="ev-repeat">Répétition</label><select id="ev-repeat" class="settings-select" onchange="calRepeatChanged(this.value)">${repeatOptions}</select></div>
        <div class="cal-field${repeat === 'none' ? ' hidden' : ''}" id="ev-until-field"><label class="family-label" for="ev-until">Jusqu'au (facultatif)</label><input type="date" id="ev-until" class="family-input" value="${escapeHtml((ev.recurrence && ev.recurrence.until) || '')}"></div>
      </div>
      <span class="family-label">Rappels</span>
      <div class="cal-picks" id="ev-reminders">${reminders}</div>
      <label class="family-label" for="ev-location">Lieu</label>
      <input id="ev-location" class="family-input" value="${escapeHtml(ev.location || '')}" maxlength="120" autocomplete="off" placeholder="Adresse, salle…">
      <label class="family-label" for="ev-notes">Notes</label>
      <textarea id="ev-notes" class="family-input" rows="2" maxlength="1000">${escapeHtml(ev.notes || '')}</textarea>
      <div class="sheet-actions">
        ${isNew ? '' : '<button class="btn-danger" onclick="deleteEventFromEditor()">Supprimer</button>'}
        <button class="btn-primary" onclick="saveEventFromEditor()">Enregistrer</button>
      </div>
    </div>`;
}

function calPickCategory(btn) {
  const box = btn.closest('.cal-picks');
  box.querySelectorAll('.cal-pick').forEach(b => b.classList.toggle('is-selected', b === btn));
  box.dataset.value = btn.dataset.value;
  // Un anniversaire : toute la journée et chaque année, par défaut
  if (btn.dataset.value === 'birthday') {
    const allDay = document.getElementById('ev-all-day');
    if (allDay && !allDay.checked) { allDay.checked = true; calToggleAllDay(true); }
    const repeat = document.getElementById('ev-repeat');
    if (repeat && repeat.value === 'none') { repeat.value = 'yearly'; calRepeatChanged('yearly'); }
  }
}
window.calPickCategory = calPickCategory;

function calToggleAllDay(checked) {
  const times = document.getElementById('ev-times');
  if (times) times.classList.toggle('hidden', !!checked);
}
window.calToggleAllDay = calToggleAllDay;

function calRepeatChanged(value) {
  const f = document.getElementById('ev-until-field');
  if (f) f.classList.toggle('hidden', value === 'none');
}
window.calRepeatChanged = calRepeatChanged;

function calEditorOpenFamily() {
  _closeOverlayThen('event-editor', () => closeSheet('event-editor'), () => openFamilyView());
}
window.calEditorOpenFamily = calEditorOpenFamily;

function _selectedValues(containerId) {
  const box = document.getElementById(containerId);
  return box ? [...box.querySelectorAll('.cal-pick.is-selected')].map(b => b.dataset.value) : [];
}

// Lit le formulaire → champs de l'événement (sans id ni horodatage)
function _readEventForm() {
  const val = id => (document.getElementById(id) || {}).value || '';
  const category = document.getElementById('ev-category').dataset.value || 'rdv';
  const cat = EVENT_CATEGORIES.find(c => c.id === category);
  const date = val('ev-date');
  let endDate = val('ev-end-date');
  if (!endDate || endDate <= date) endDate = '';
  const allDay = document.getElementById('ev-all-day').checked;
  let start = allDay ? '' : val('ev-start');
  let end = allDay ? '' : val('ev-end');
  if (start && end && !endDate && end < start) end = ''; // fin avant le début le même jour : ignorée
  const repeat = val('ev-repeat');
  const until = val('ev-until');
  const recurrence = repeat === 'none' ? null : {
    freq: repeat === 'biweekly' ? 'weekly' : repeat,
    interval: repeat === 'biweekly' ? 2 : 1,
    until: until && until >= date ? until : null
  };
  return {
    title: val('ev-title').trim().slice(0, 80) || (cat ? cat.label : 'Événement'),
    category, date, endDate, allDay, start, end,
    memberIds: _selectedValues('ev-members').filter(id => getMember(id)),
    recurrence,
    reminders: _selectedValues('ev-reminders').map(Number).filter(Number.isFinite).sort((a, b) => a - b),
    location: val('ev-location').trim().slice(0, 120),
    notes: val('ev-notes').trim().slice(0, 1000)
  };
}

function _refreshAfterCalendarChange() {
  _calendarRefreshIfVisible();
}

async function saveEventFromEditor() {
  const e = _calEditing;
  if (!e) return;
  const form = _readEventForm();
  if (!form.date) {
    showToast('Indiquez une date', 'error');
    return;
  }
  if (form.recurrence && form.endDate && _dayNum(form.endDate) - _dayNum(form.date) > 366) {
    showToast("Un événement qui se répète ne peut pas durer plus d'un an : pour arrêter la série, utilisez « Jusqu'au »", 'error');
    return;
  }
  const original = state.events[e.ev.id];
  if (!e.isNew && original && original.recurrence) {
    const scope = await _askRecurrenceScope('Modifier');
    if (!scope) return;
    if (scope === 'occurrence') {
      // Cette fois seulement : on retire l'occurrence de la série et on crée un événement isolé
      original.exdates = [...new Set([...(original.exdates || []), e.occDate])];
      saveCalendarEvent(original);
      saveCalendarEvent({ ...original, ...form, id: 'ev_' + uid(), recurrence: null, exdates: [], createdAt: 0 });
    } else {
      // Toute la série : la date saisie déplace la série d'autant de jours que l'occurrence
      const delta = _dayNum(form.date) - _dayNum(e.occDate);
      const span = form.endDate ? _dayNum(form.endDate) - _dayNum(form.date) : 0;
      const date = shiftDate(e.seriesStart, delta);
      saveCalendarEvent({ ...original, ...form, date, endDate: span > 0 ? shiftDate(date, span) : '' });
    }
  } else {
    saveCalendarEvent({ ...(original || {}), ...e.ev, ...form });
  }
  _calEditing = null;
  closeSheet('event-editor');
  _refreshAfterCalendarChange();
  showToast(e.isNew ? 'Événement ajouté ✓' : 'Événement modifié ✓', 'success');
}
window.saveEventFromEditor = saveEventFromEditor;

async function deleteEventFromEditor() {
  const e = _calEditing;
  if (!e) return;
  const original = state.events[e.ev.id];
  if (!original) {
    closeSheet('event-editor');
    return;
  }
  if (original.recurrence) {
    const scope = await _askRecurrenceScope('Supprimer');
    if (!scope) return;
    if (scope === 'occurrence') {
      original.exdates = [...new Set([...(original.exdates || []), e.occDate])];
      saveCalendarEvent(original);
    } else {
      deleteCalendarEvent(original.id);
    }
  } else {
    if (!(await uiConfirm(`Supprimer « ${original.title} » ?`, { confirmLabel: 'Supprimer', danger: true }))) return;
    deleteCalendarEvent(original.id);
  }
  _calEditing = null;
  closeSheet('event-editor');
  _refreshAfterCalendarChange();
  showToast('Événement supprimé', 'success');
}
window.deleteEventFromEditor = deleteEventFromEditor;

// « Cette fois seulement » ou « Toute la série » pour un événement récurrent. Résout null si annulé.
function _askRecurrenceScope(verb) {
  return new Promise(resolve => {
    let done = false;
    const finish = v => {
      if (done) return;
      done = true;
      resolve(v);
    };
    window._calScopeChoose = v => {
      finish(v);
      // Fermeture sans repasser par l'historique : l'entrée restante est sautée au prochain retour
      closeSheet('cal-scope', true);
    };
    openSheet('cal-scope', `
      <div class="sheet-body cal-scope">
        <h2 class="cal-scope-title">${escapeHtml(verb)} l'événement récurrent</h2>
        <button class="btn-primary btn-block" onclick="_calScopeChoose('occurrence')">Cette fois seulement</button>
        <button class="btn-secondary btn-block" onclick="_calScopeChoose('series')">Toute la série</button>
        <button class="btn-link" onclick="_calScopeChoose(null)">Annuler</button>
      </div>`, { onClose: () => finish(null) });
  });
}

// ============================================
// Fiche d'un repas (depuis le calendrier ou le hub)
// ============================================

function openMealSheet(slotKey) {
  const m = MEAL_SLOT_KEY_RE.exec(slotKey);
  if (!m) return;
  const slot = MEAL_SLOTS.find(s => s.id === m[2]);
  const recipes = getMealRecipes(slotKey);
  const rows = recipes.map(rr => {
    const r = state.recipes.find(x => x.id === rr.id);
    if (!r) {
      return `<div class="meal-row"><span class="meal-row-title is-missing">Recette introuvable</span>
        <button class="btn-link" onclick="mealRemoveRecipe(${_jsArg(slotKey)}, ${_jsArg(rr.id)})">Retirer</button></div>`;
    }
    return `<div class="meal-row">
      <button class="meal-row-open" onclick="mealOpenRecipe(${_jsArg(r.id)})">
        <span class="meal-row-emoji">${r.photo ? `<img src="${escapeHtml(r.photo)}" alt="" loading="lazy">` : escapeHtml(r.emoji || '🍽️')}</span>
        <span class="meal-row-title">${escapeHtml(r.title)}</span>
        <span class="meal-row-servings">${escapeHtml(String(rr.servings || r.baseServings || ''))} pers.</span>
      </button>
      <button class="btn-link" onclick="mealRemoveRecipe(${_jsArg(slotKey)}, ${_jsArg(r.id)})">Retirer</button>
    </div>`;
  }).join('');
  openSheet('meal', `
    <div class="modal-header">
      <h2>${slot ? slot.emoji + ' ' + escapeHtml(slot.label) : 'Repas'} · ${escapeHtml(_fmtDate(m[1], { weekday: 'short', day: 'numeric', month: 'short' }))}</h2>
      <button class="icon-btn icon-btn-light" onclick="closeSheet('meal')" aria-label="Fermer">${_CAL_ICON_CLOSE}</button>
    </div>
    <div class="sheet-body">
      ${rows || '<p class="family-hint">Aucune recette pour ce repas.</p>'}
      <button class="btn-secondary btn-block" onclick="mealAddRecipe(${_jsArg(slotKey)})">+ Ajouter une recette</button>
      <button class="btn-link" onclick="mealOpenPlanning(${_jsArg(slotKey)})">Voir dans le planning des repas</button>
    </div>`);
}
window.openMealSheet = openMealSheet;

function mealOpenRecipe(recipeId) {
  _closeOverlayThen('meal', () => closeSheet('meal'), () => openRecipe(recipeId));
}
window.mealOpenRecipe = mealOpenRecipe;

function mealRemoveRecipe(slotKey, recipeId) {
  const m = MEAL_SLOT_KEY_RE.exec(slotKey);
  if (!m) return;
  removeRecipeFromSlot(m[1], m[2], recipeId);
  if (getMealRecipes(slotKey).length) openMealSheet(slotKey); // met à jour la fiche ouverte
  else closeSheet('meal');
}
window.mealRemoveRecipe = mealRemoveRecipe;

function mealAddRecipe(slotKey) {
  const m = MEAL_SLOT_KEY_RE.exec(slotKey);
  if (!m) return;
  _closeOverlayThen('meal', () => closeSheet('meal'), () => openPlanningSlot(m[1], m[2]));
}
window.mealAddRecipe = mealAddRecipe;

function mealOpenPlanning(slotKey) {
  const m = MEAL_SLOT_KEY_RE.exec(slotKey);
  if (!m) return;
  // Afficher la semaine du repas dans le planning
  _planningWeekOffset = Math.round((_dayNum(_mondayOf(m[1])) - _dayNum(_mondayOf(calendarToday()))) / 7);
  _closeOverlayThen('meal', () => closeSheet('meal'), () => navigateTo('planning'));
}
window.mealOpenPlanning = mealOpenPlanning;
