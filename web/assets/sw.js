// Minimal service worker: lets TableBill be installed as an app and keeps the shell fast.
const CACHE = 'tablebill-shell-v3';
const SHELL = ['/static/css/style.css', '/static/js/core.js', '/static/js/ui.js', '/static/js/boot.js'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => { })); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== CACHE).map(x => caches.delete(x))))); self.clients.claim(); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.pathname.startsWith('/api/')) return; // never cache data
  e.respondWith(fetch(e.request).then(r => { if (SHELL.includes(u.pathname)) { const c = r.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); } return r; }).catch(() => caches.match(e.request)));
});
