// Versão do cache
const CACHE_NAME = 'dac-pwa-v4';

// Recursos mínimos a serem cacheados offline
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/iconeapp.png'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  // Ignora tudo que não for GET (POST, PUT, DELETE não podem ser cacheados)
  if (event.request.method !== 'GET') {
    return;
  }

  // Ignora chamadas de API e autenticação — apenas intercepta arquivos estáticos
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) {
    return;
  }

  // Ignora protocolos que não sejam http/https (ex: chrome-extension://)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return;
  }
  
  // Network First: sempre busca da rede primeiro, se não tiver rede, usa cache
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Atualiza o cache de forma assíncrona para requisições válidas (mesma origem)
        if (response && response.status === 200 && response.type === 'basic') {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseToCache);
          });
        }
        return response;
      })
      .catch(() => {
        // Fallback pro cache quando offline
        return caches.match(event.request);
      })
  );
});

