// Offline cache for the home-screen app. Cache-first for everything the
// page ships with; bump CACHE whenever any listed file changes so phones
// pick up the new version on their next online launch.

const CACHE = 'pass-predictor-v12';
const FILES = [
  './',
  './index.html',
  './css/app.css',
  './js/main.js',
  './js/dom.js',
  './js/units.js',
  './js/storage.js',
  './js/tle.js',
  './js/library.js',
  './js/format.js',
  './js/propagation.js',
  './js/polar.js',
  './js/pass-card.js',
  './js/timeline.js',
  './js/hero-view.js',
  './js/passes-view.js',
  './js/setup-view.js',
  './js/overlay.js',
  './vendor/satellite.min.js',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(FILES))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

const isSameOrigin = (request) => new URL(request.url).origin === location.origin;

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return;
  }
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((cached) => {
      if (cached) {
        return cached;
      }
      return fetch(event.request)
        .then((response) => {
          if (response.ok && isSameOrigin(event.request)) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => cached);
    }),
  );
});
