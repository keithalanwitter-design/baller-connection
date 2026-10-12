/* Baller Connection service worker. Built by vite (vite.config.ts) with the version and shell list filled in.
   Rules: cache the app shell only. NEVER cache /api/ responses, clips, or anything authenticated. */
const VERSION = '__VERSION__';
const SHELL = __SHELL__;
const CACHE = 'bc-shell-' + VERSION;
const SCOPE = self.registration.scope;

const isNeverCache = (url) =>
  url.origin !== self.location.origin ||
  url.pathname.includes('/api/') ||
  url.pathname.includes('/clips/') ||
  url.pathname.includes('/demo/') ||
  /\.(mp4|mov|webm|m4v|3gp)$/i.test(url.pathname);
const isShellAsset = (url) => url.pathname.includes('/assets/') || url.pathname.includes('/icons/') || url.pathname.endsWith('/manifest.webmanifest');

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL.map((p) => new URL(p, SCOPE).href))));
  // No skipWaiting here: the page shows an "Update ready" prompt and the user chooses when to reload.
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('bc-shell-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('message', (e) => { if (e.data === 'SKIP_WAITING') self.skipWaiting(); });

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (isNeverCache(url)) return; // straight to network, never stored
  if (req.headers.get('authorization')) return;
  if (req.mode === 'navigate') {
    // Network first; offline falls back to the cached shell, then the offline page.
    e.respondWith(fetch(req).catch(async () => (await caches.match(new URL('./index.html', SCOPE).href)) || (await caches.match(new URL('./offline.html', SCOPE).href)) || Response.error()));
    return;
  }
  if (isShellAsset(url)) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok && res.type === 'basic') { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    })));
  }
});

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Baller Connection', {
    body: d.body || '', tag: d.tag || 'bc', icon: new URL('./icons/icon-192.png', SCOPE).href, badge: new URL('./icons/maskable-192.png', SCOPE).href,
    data: { url: d.url || '#/app' },
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = new URL(e.notification.data && e.notification.data.url || '#/app', SCOPE).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => {
    const c = cs.find((x) => x.url.startsWith(SCOPE));
    if (c) { c.navigate(target); return c.focus(); }
    return self.clients.openWindow(target);
  }));
});
