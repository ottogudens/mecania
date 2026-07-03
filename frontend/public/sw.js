const CACHE_NAME = 'mecania-portal-v1';
const ASSETS = [
  '/client',
  '/favicon.svg',
  '/manifest.json'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  // Solo interceptar peticiones de navegación y assets estáticos locales
  if (e.request.mode === 'navigate' || e.request.url.includes(self.location.origin)) {
    e.respondWith(
      caches.match(e.request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(e.request).catch(() => {
          // Fallback offline si falla la red
          if (e.request.mode === 'navigate') {
            return caches.match('/client');
          }
        });
      })
    );
  }
});
