// ============================================
// LA MAISONNÉE — Hub (écran d'accueil)
// ============================================
// Vue racine de l'app : carte « Aujourd'hui » (événements + repas) et tuiles des sous-apps.
// Script classique chargé en dernier : utilise state, escapeHtml, openApp, navigateTo,
// calendarItemsByDay / _calItemHtml (calendar.js), memberAvatarHtml (family.js), syncEnabled (sync.js).

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
  const budget = state.budgetSettings.monthlyBudgetCents || 0;
  if (budget) {
    const left = budget - s.total;
    return left >= 0 ? `Reste ${formatEuros(left, true)} ce mois` : `Dépassé de ${formatEuros(-left, true)}`;
  }
  return s.count ? `${formatEuros(s.total, true)} dépensés ce mois` : 'Aucune dépense ce mois';
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

function renderHub() {
  const el = document.getElementById('hub-content');
  if (!el) return;
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
    ${familyCard}
    <h3 class="hub-section-title">Espaces</h3>
    <div class="hub-tiles">${tiles}</div>`;
}
window.renderHub = renderHub;

// La PWA reste souvent en mémoire d'un jour à l'autre : au retour au premier plan, on redessine
// le hub pour ne pas afficher la date, la salutation et les repas de la veille.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.currentView === 'hub') renderHub();
});
