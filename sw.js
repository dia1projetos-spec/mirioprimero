// v2: estrategia "red primero, caché como respaldo" — evita que el usuario
// tenga que forzar recarga (Ctrl+Shift+R) para ver cambios nuevos.
const CACHE_NAME = "mi-rio-primero-v2";
const ASSETS = [
  "./",
  "./index.html",
  "./css/app.css",
  "./css/home.css",
  "./js/home.js",
  "./js/firebase-config.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./assets/logo-nav.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

// Solo cacheamos peticiones GET del mismo origen (nunca las de Firebase/Cloudinary,
// que ya manejan su propia frescura y no deben quedar "pisadas" por este caché).
function esCacheable(request) {
  return request.method === "GET" && new URL(request.url).origin === self.location.origin;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (!esCacheable(request)) return; // deja pasar tal cual (red directa)

  event.respondWith(
    fetch(request)
      .then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        if (request.mode === "navigate") return caches.match("./index.html");
        return Response.error();
      })
  );
});
