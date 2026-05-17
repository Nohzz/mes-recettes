// Service Worker — Mes Recettes PWA
// v2.0 : stratégie network-first pour garantir les mises à jour
//
// ⚠️ BUMP À CHAQUE DÉPLOIEMENT : changer la string CACHE_VERSION ci-dessous force
// l'invalidation du cache et garantit que les nouveaux fichiers (app.js, styles.css…)
// sont récupérés. Format suggéré : mes-recettes-vX.Y-YYYY-MM-DD
const CACHE_VERSION = 'mes-recettes-v3.5-2026-05-17';
const APP_FILES = [
  './',
  './index.html',
  './styles.css',
  './data.js',
  './app.js',
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
