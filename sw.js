// Funciona sin internet: sirve desde caché y actualiza en segundo plano
const CACHE = 'mi-dinero-v4';
const FILES = ['./', 'index.html', 'styles.css', 'app.js', 'db.js', 'data.js', 'xlsx.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'icons/icon-maskable-512.png', 'icons/favicon-32.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(e.request, { ignoreSearch: true });
    const net = fetch(e.request).then(r => { if (r.ok) c.put(e.request, r.clone()); return r; }).catch(() => hit);
    return hit || net;
  }));
});

// Recordatorio diario: el servidor envía un aviso vacío y aquí se muestra el mensaje
self.addEventListener('push', e => {
  e.waitUntil(self.registration.showNotification('Mi Dinero', {
    body: '💰 ¿Ya registraste tus ingresos y gastos de hoy?',
    icon: 'icons/icon-192.png',
    badge: 'icons/favicon-32.png',
    tag: 'recordatorio-diario',
    renotify: true,
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const win = list.find(c => c.url.includes('/mi-dinero/') || c.url.includes('localhost'));
    return win ? win.focus() : self.clients.openWindow('./');
  }));
});
