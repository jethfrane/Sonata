// Sonata Service Worker - v1.5.4
const CACHE_NAME = 'sonata-cache-v1.5.4';
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          return caches.delete(cacheName);
        })
      );
    }).then(() => {
      self.registration.unregister();
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', (event) => {
  // Pass through all requests normally
});
