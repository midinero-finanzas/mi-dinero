// MI DINERO se mudó: este service worker borra la app vieja guardada para que se vea el aviso de mudanza
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil((async () => {
  for (const k of await caches.keys()) await caches.delete(k);
  await self.clients.claim();
  for (const c of await self.clients.matchAll({ type: 'window' })) c.navigate(c.url);
})()));
