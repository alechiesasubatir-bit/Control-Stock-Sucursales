// Service worker: cachea solo los archivos de la app. Los datos van siempre a la red.
const VERSION = '2026.10.23-1158';
const CACHE = 'css-' + VERSION;
const ARCHIVOS = [
  './', 'index.html', 'css/app.css',
  'js/main.js', 'js/nav.js', 'js/estado.js', 'js/config.js', 'js/api.js', 'js/cola.js', 'js/catalogo.js',
  'js/escaner.js', 'js/logo.js',
  'js/ui/ingreso.js', 'js/ui/escanear.js', 'js/ui/visor.js', 'js/ui/ficha.js', 'js/ui/filas.js',
  'js/ui/cargas.js', 'js/ui/articulos.js', 'js/ui/encargado.js', 'js/ui/confeti.js',
  'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k.startsWith('css-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Librerías y tipografías externas: se guardan la primera vez para que el lector ande sin señal.
const EXTERNOS = ['cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (EXTERNOS.includes(url.host)) {
    e.respondWith(caches.open(CACHE).then(async c => {
      const guardado = await c.match(e.request);
      if (guardado) return guardado;
      const r = await fetch(e.request);
      if (r.ok || r.type === 'opaque') c.put(e.request, r.clone());
      return r;
    }));
    return;
  }
  if (url.origin !== location.origin || url.pathname.endsWith('manifest.json')) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(r => r || fetch(e.request)));
});
