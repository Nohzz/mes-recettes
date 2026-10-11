// Service Worker — La Maisonnée PWA
// Stratégie network-first pour garantir les mises à jour
//
// ⚠️ BUMP À CHAQUE DÉPLOIEMENT : changer la string CACHE_VERSION ci-dessous force
// l'invalidation du cache et garantit que les nouveaux fichiers (app.js, styles.css…)
// sont récupérés. Format suggéré : maisonnee-vX.Y-YYYY-MM-DD (aligné sur APP_VERSION dans app.js)
// ⚠️ Tout nouveau fichier JS/CSS doit être ajouté à APP_FILES (sinon, hors ligne,
// il est remplacé par index.html et l'app plante).
const CACHE_VERSION = 'maisonnee-v4.0-2026-10-11';
const APP_FILES = [
  './',
  './index.html',
  './styles.css',
  './data.js',
  './app.js',
  './calendar.js',
  './sync.js',
  './family.js',
  './budget.js',
  './memos.js',
  './occasions.js',
  './reminders.js',
  './hub.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => Promise.allSettled(APP_FILES.map(url => cache.add(url).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Permet à l'app de demander un skipWaiting depuis le client
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Never intercept API calls
  if (url.hostname === 'api.anthropic.com' || url.hostname.includes('supabase')) {
    return;
  }

  // Pour les fichiers de notre propre app : NETWORK FIRST
  // Garantit que les mises à jour sont prises en compte immédiatement.
  // Si le réseau échoue (offline), on retombe sur le cache.
  const isAppFile = url.origin === self.location.origin && (
    url.pathname.endsWith('.html') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.json') ||
    url.pathname === '/' ||
    url.pathname.endsWith('/')
  );

  if (isAppFile) {
    event.respondWith(
      fetch(event.request, { cache: 'no-cache' })
        .then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_VERSION).then(cache => cache.put(event.request, clone)).catch(() => {});
          }
          return response;
        })
        .catch(() => caches.match(event.request).then(r => r || caches.match('./index.html')))
    );
    return;
  }

  // Pour les autres ressources (icônes, fonts, images) : cache first
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_VERSION).then(cache => cache.put(event.request, clone)).catch(() => {});
        }
        return response;
      }).catch(() => cached);
    })
  );
});

// ============================================
// Notifications push : rappels du calendrier envoyés par la fonction Supabase send-reminders
// (charge utile JSON { title, body, tag, url }, construite par reminderMessage dans calendar.js)
// ============================================
self.addEventListener('push', event => {
  let msg = {};
  try {
    msg = event.data ? event.data.json() : {};
  } catch (e) {
    msg = { body: event.data ? event.data.text() : '' };
  }
  const options = {
    body: msg.body || '',
    icon: 'icons/icon-192.png', // pas de badge : sur Android, l'icône couleur deviendrait un carré blanc
    data: { url: msg.url || './', tag: msg.tag || '' }
  };
  // Même tag que le rappel affiché par l'app ouverte : pas de doublon
  if (msg.tag) options.tag = msg.tag;
  event.waitUntil((async () => {
    await self.registration.showNotification(msg.title || 'La Maisonnée', options);
    // App ouverte (même en arrière-plan) : elle ne répétera pas ce rappel
    if (msg.tag) {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      windows.forEach(c => c.postMessage({ type: 'reminder-shown', tag: msg.tag }));
    }
  })());
});

// Clic sur une notification : on remet l'app au premier plan sur la bonne vue (ou on l'ouvre)
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const data = event.notification.data || {};
  const scope = self.registration.scope;
  // Seulement une adresse de l'app : une charge utile ne doit pas pouvoir ouvrir un site externe
  let target = scope;
  try {
    const u = new URL(data.url || './', scope).href;
    if (u.startsWith(scope)) target = u;
  } catch (e) { /* adresse invalide : accueil de l'app */ }
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const client = windows.find(c => c.url.startsWith(scope));
    if (client) {
      try { await client.focus(); } catch (e) { /* focus refusé : l'app reçoit quand même le message */ }
      client.postMessage({ type: 'open-url', url: target, tag: data.tag || '' });
      return;
    }
    // App fermée : le tag voyage dans l'adresse, l'app ne répétera pas ce rappel à l'ouverture
    await self.clients.openWindow(data.tag ? target + (target.includes('?') ? '&' : '?') + 'rem=' + encodeURIComponent(data.tag) : target);
  })());
});
