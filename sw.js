const prefix = 'kalendar-rovnic:' + self.registration.scope + ':';
const cacheName = prefix + 'v14';
const assets = ['./', './index.html', './calendar.js?v=14', './ulohy.json', './manifest.webmanifest', './icon-192.png', './icon-512.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(cacheName).then(cache => cache.addAll(assets)));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(prefix) && key !== cacheName).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const path = new URL(request.url);
  if (request.mode === 'navigate') {
    if (![new URL('./', self.registration.scope).pathname, new URL('./index.html', self.registration.scope).pathname].includes(path.pathname)) return;
    event.respondWith(fetch(request).catch(() => caches.open(cacheName).then(cache => cache.match('./index.html'))));
  } else if (path.href === new URL('./ulohy.json', self.registration.scope).href) {
    event.respondWith((async () => {
      const cache = await caches.open(cacheName);
      try {
        const response = await fetch(request);
        if (response.ok) await cache.put(request, response.clone());
        return response;
      } catch {
        return (await cache.match(request)) || Response.error();
      }
    })());
  } else if (assets.some(asset => new URL(asset, self.registration.scope).href === request.url)) {
    event.respondWith(caches.open(cacheName).then(async cache => (await cache.match(request)) || fetch(request)));
  }
});
