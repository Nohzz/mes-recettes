// ============================================
// LA MAISONNÉE — Hub (écran d'accueil)
// ============================================
// Vue racine de l'app : carte « Aujourd'hui » (événements + repas), « Qui s'en occupe ? » (événements à
// venir sans responsable), mémos de la famille, et tuiles des sous-apps.
// Script classique chargé en dernier : utilise state, escapeHtml, openApp, navigateTo,
// calendarItemsByDay / _calItemHtml / calendarOwnerAlerts (calendar.js), memberAvatarHtml (family.js),
// syncEnabled (sync.js), memosHubCardHtml (memos.js).

const HUB_OWNER_DAYS = 7;     // « Qui s'en occupe ? » : événements des 7 prochains jours
const HUB_OWNER_MAX_ROWS = 4;

// Tuiles du hub, dans l'ordre d'affichage. `action` = code exécuté au clic.
const HUB_TILES = [
  { id: 'calendar', emoji: '📅', name: 'Calendrier', className: 'hub-tile-calendar', action: "openApp('calendar')" },
  { id: 'budget', emoji: '💶', name: 'Budget', className: 'hub-tile-budget', action: "openApp('budget')" },
  { id: 'recipes', emoji: '🍲', name: 'Recettes', className: 'hub-tile-recipes', action: "openApp('recipes')" },
  { id: 'shopping', emoji: '🛒', name: 'Courses', className: 'hub-tile-shopping', action: "navigateTo('shopping')" }
];

function _hubGreeting(now) {
  const h = now.getHours();
  return (h >= 18 || h < 5) ? 'Bonsoir' : 'Bonjour';
}

// Nombre de repas planifiés du lundi au dimanche de la semaine courante
function _hubWeekMealCount(today) {
  const monday = _mondayOf(today), sunday = shiftDate(monday, 6);
  return Object.values(state.events).filter(ev => ev && ev.type === 'meal' && ev.date >= monday && ev.date <= sunday && (ev.recipes || []).length).length;
}

function _hubCalendarSub(today) {
  const items = calendarItemsByDay(today, shiftDate(today, 13), { meals: false });
  const todays = items.get(today) || [];
  if (todays.length) return `${todays.length} aujourd'hui`;
  for (let i = 1; i <= 13; i++) {
    const day = shiftDate(today, i);
    const list = items.get(day);
    if (list && list.length) {
      const when = i === 1 ? 'demain' : _fmtDate(day, { weekday: 'short', day: 'numeric' });
      return `Prochain : ${list[0].ev.title || 'événement'} · ${when}`;
    }
  }
  return 'Rien de prévu';
}

function _hubBudgetSub(today) {
  const s = budgetSummary(today.slice(0, 7));
  const budget = budgetOfMonth(today.slice(0, 7));
  if (budget) {
    const left = budget - s.total;
    return left >= 0 ? `Reste ${formatEuros(left, true)} ce mois` : `Dépassé de ${formatEuros(-left, true)}`;
  }
  if (!s.count) return 'Aucune dépense ce mois';
  // Dépenses à venir (récurrentes créées dès le 1er) : comptées, et signalées comme dans l'aperçu
  const planned = expensesOfMonth(today.slice(0, 7)).filter(e => e.date > today).reduce((t, e) => t + e.amountCents, 0);
  return planned ? `${formatEuros(s.total, true)} ce mois, dont ${formatEuros(planned, true)} prévus`
    : `${formatEuros(s.total, true)} dépensés ce mois`;
}

function _hubTileSub(tileId, today) {
  if (APPS[tileId] && APPS[tileId].soon) return 'Bientôt';
  if (tileId === 'calendar') return _hubCalendarSub(today);
  if (tileId === 'budget') return _hubBudgetSub(today);
  if (tileId === 'recipes') {
    const n = state.recipes.length;
    const recettes = `${n} recette${n > 1 ? 's' : ''}`;
    const meals = _hubWeekMealCount(today);
    return meals > 0 ? `${recettes} · ${meals} repas cette semaine` : recettes;
  }
  if (tileId === 'shopping') {
    const n = (state.shopping || []).length;
    return n > 0 ? `${n} recette${n > 1 ? 's' : ''} dans la liste` : 'Liste vide';
  }
  return '';
}

// Carte « Qui s'en occupe ? » : événements des prochains jours que personne n'a pris en charge
function _hubOwnerCardHtml(today) {
  const alerts = calendarOwnerAlerts(today, HUB_OWNER_DAYS);
  if (!alerts.length) return '';
  const me = state.sync.memberId && getMember(state.sync.memberId) ? state.sync.memberId : '';
  const rows = alerts.slice(0, HUB_OWNER_MAX_ROWS).map(({ ev, date }) => {
    const cat = EVENT_CATEGORIES.find(c => c.id === ev.category) || EVENT_CATEGORIES[EVENT_CATEGORIES.length - 1];
    const day = date === today ? "Aujourd'hui" : date === shiftDate(today, 1) ? 'Demain' : _capitalize(_fmtDate(date, { weekday: 'long', day: 'numeric' }));
    const forWho = (ev.memberIds || []).map(getMember).filter(Boolean).map(m => m.name);
    const sub = [day + (ev.allDay || !ev.start ? '' : ' · ' + ev.start), forWho.length ? 'pour ' + forWho.join(', ') : 'toute la famille'].join(' · ');
    return `<div class="owner-row">
      <button class="owner-row-main" onclick="openEventEditor(${_jsArg(ev.id)}, ${_jsArg(date)})">
        <span class="owner-row-title">${cat.emoji} ${escapeHtml(ev.title || cat.label)}</span>
        <span class="owner-row-sub">${escapeHtml(sub)}</span>
      </button>
      <div class="owner-row-actions">
        ${me ? `<button class="cal-pick" onclick="calSetOwner(${_jsArg(ev.id)}, 'me')">🙋 Moi</button>` : ''}
        <button class="cal-pick" onclick="openEventEditor(${_jsArg(ev.id)}, ${_jsArg(date)})">Choisir…</button>
        <button class="btn-link owner-row-none" onclick="calSetOwner(${_jsArg(ev.id)}, 'none')">Personne</button>
      </div>
    </div>`;
  }).join('');
  const more = alerts.length - HUB_OWNER_MAX_ROWS;
  return `<section class="hub-card owner-card">
      <h3 class="hub-card-title">🙋 Qui s'en occupe ?</h3>
      <p class="hub-empty owner-card-hint">Personne n'est encore désigné pour :</p>
      <div class="owner-list">${rows}</div>
      ${more > 0 ? `<button class="hub-card-action" onclick="openApp('calendar')">Et ${more} autre${more > 1 ? 's' : ''} dans le calendrier →</button>` : ''}
    </section>`;
}

function renderHub() {
  const el = document.getElementById('hub-content');
  if (!el) return;
  // Mémo en cours de saisie : un nouvel affichage (sync, retour au premier plan) le garde, clavier compris
  const memoInput = document.getElementById('memo-quick');
  const memoDraft = memoInput ? memoInput.value : '';
  const memoFocused = !!memoInput && document.activeElement === memoInput;
  const now = new Date();
  const today = formatPlanningDate(now);
  const dateLabel = now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  const todayItems = calendarItemsByDay(today, today, { meals: true }).get(today) || [];
  const todayRows = todayItems.length
    ? `<div class="cal-list">${todayItems.map(_calItemHtml).join('')}</div>`
    : `<p class="hub-empty">Rien de prévu aujourd'hui.</p>`;

  const tiles = HUB_TILES.map(t => {
    const soon = APPS[t.id] && APPS[t.id].soon;
    return `
      <button class="hub-tile ${t.className}${soon ? ' is-soon' : ''}" onclick="${t.action}">
        <span class="hub-tile-emoji" aria-hidden="true">${t.emoji}</span>
        <span class="hub-tile-name">${escapeHtml(t.name)}</span>
        <span class="hub-tile-sub">${escapeHtml(_hubTileSub(t.id, today))}</span>
      </button>`;
  }).join('');

  // Famille : pastilles des membres si elle est configurée, sinon une invitation à la créer / rejoindre
  const family = syncEnabled();
  const membersRow = family && state.members.length
    ? `<button class="hub-members" onclick="openFamilyView()" aria-label="Famille ${escapeHtml(state.sync.householdName)}">
        ${state.members.slice(0, 6).map(m => memberAvatarHtml(m, 'sm')).join('')}
        <span class="hub-members-name">${escapeHtml(state.sync.householdName || 'Ma famille')}</span>
      </button>`
    : '';
  const familyCard = family ? '' : `
    <button class="hub-family-card" onclick="openFamilyView()">
      <span class="hub-family-card-emoji" aria-hidden="true">👪</span>
      <span class="hub-family-card-text">
        <span class="hub-family-card-title">Relier les téléphones de la famille</span>
        <span class="hub-family-card-sub">Partager recettes, courses, planning et calendrier</span>
      </span>
    </button>`;

  el.innerHTML = `
    <div class="hub-hello">
      <p class="hub-date">${escapeHtml(dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1))}</p>
      <h2 class="hub-greeting">${_hubGreeting(now)} 👋</h2>
      ${membersRow}
    </div>
    <section class="hub-card">
      <h3 class="hub-card-title">Aujourd'hui</h3>
      ${todayRows}
      <div class="hub-card-actions">
        <button class="hub-card-action" onclick="openApp('calendar')">Calendrier →</button>
        <button class="hub-card-action" onclick="navigateTo('planning')">Planning des repas →</button>
      </div>
    </section>
    ${_hubOwnerCardHtml(today)}
    ${typeof memosHubCardHtml === 'function' ? memosHubCardHtml() : ''}
    ${familyCard}
    <h3 class="hub-section-title">Espaces</h3>
    <div class="hub-tiles">${tiles}</div>`;
  const again = document.getElementById('memo-quick');
  if (again && memoDraft) again.value = memoDraft;
  if (again && memoFocused) again.focus();
}
window.renderHub = renderHub;

// La PWA reste souvent en mémoire d'un jour à l'autre : au retour au premier plan, on redessine
// le hub pour ne pas afficher la date, la salutation et les repas de la veille.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.currentView === 'hub') renderHub();
});
