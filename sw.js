// Funciona sin internet: sirve desde caché y actualiza en segundo plano
const CACHE = 'mi-dinero-v6';
const FILES = ['./', 'index.html', 'styles.css', 'app.js', 'db.js', 'data.js', 'xlsx.js', 'i18n.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'icons/icon-maskable-512.png', 'icons/favicon-32.png'];
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
const PUSH_TEXT = {
  es: '💰 ¿Ya registraste tus ingresos y gastos de hoy?',
  en: '💰 Have you logged today’s income and expenses?',
  pt: '💰 Já registrou suas receitas e despesas de hoje?',
};
// El idioma elegido en la app está guardado en IndexedDB (kv → settings.lang)
const savedLang = () => new Promise(resolve => {
  try {
    const req = indexedDB.open('mi-dinero');
    req.onerror = () => resolve('es');
    req.onsuccess = () => {
      try {
        const g = req.result.transaction('kv').objectStore('kv').get('settings');
        g.onsuccess = () => resolve(g.result?.lang || 'es');
        g.onerror = () => resolve('es');
      } catch { resolve('es'); }
    };
  } catch { resolve('es'); }
});
self.addEventListener('push', e => {
  e.waitUntil(savedLang().then(l => self.registration.showNotification('Mi Dinero', {
    body: PUSH_TEXT[l] || PUSH_TEXT.es,
    icon: 'icons/icon-192.png',
    badge: 'icons/favicon-32.png',
    tag: 'recordatorio-diario',
    renotify: true,
  })));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const win = list.find(c => c.url.includes('/mi-dinero/') || c.url.includes('localhost'));
    return win ? win.focus() : self.clients.openWindow('./');
  }));
});
