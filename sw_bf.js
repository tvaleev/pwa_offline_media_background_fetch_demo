// Service Worker Version - change this to force update
const version = "pwaCacheTest_v2";
const offlineMoviesCache = "offlineMovies";
const offlineUrl = "offline.html";

// Core files to cache during installation
const coreAssets = [
  offlineUrl,
  // Add other essential static assets here
];

// ======================
// Install Event
// ======================
self.addEventListener('install', event => {
  console.log(`Service Worker installing (v${version})`);
  
  event.waitUntil(
    caches.open(version)
      .then(cache => {
        console.log('Caching core assets');
        return cache.addAll(coreAssets);
      })
      .then(() => {
        console.log('Install completed - skipping waiting');
        return self.skipWaiting(); // Force activate the new SW immediately
      })
      .catch(err => {
        console.error('Installation failed:', err);
        throw err;
      })
  );
});

// ======================
// Activate Event
// ======================
self.addEventListener('activate', event => {
  console.log('Service Worker activating');
  
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          // Delete old caches except current version and movies cache
          if (cacheName !== version && cacheName !== offlineMoviesCache) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
    .then(() => {
      console.log('Claiming clients');
      return self.clients.claim(); // Take control of all clients
    })
    .catch(err => {
      console.error('Activation failed:', err);
      throw err;
    })
  );
});

// ======================
// Fetch Event
// ======================
self.addEventListener('fetch', event => {
  const request = event.request;
  
  // Skip non-GET requests and browser sync URLs
  if (request.method !== 'GET' || 
      request.url.match(/\/browserLink/ig) || 
      request.url.match(/chrome-extension/ig)) {
    return;
  }

  // Handle movie files differently (cache in separate storage)
  if (request.url.includes('.mp4')) {
    event.respondWith(
      caches.match(request)
        .then(cachedResponse => cachedResponse || fetch(request))
    );
    return;
  }

  // For all other requests
  event.respondWith(
    caches.match(request)
      .then(response => {
        // Cache hit - return response
        if (response) return response;

        // Network fallback
        return fetch(request)
          .then(networkResponse => {
            // Cache successful responses (except movies)
            if (networkResponse.ok) {
              const responseClone = networkResponse.clone();
              caches.open(version)
                .then(cache => cache.put(request, responseClone))
                .catch(err => console.error('Cache put error:', err));
            }
            return networkResponse;
          })
          .catch(() => {
            // Offline fallback
            if (request.headers.get('accept').includes('text/html')) {
              return caches.match(offlineUrl);
            }
            return serveOfflineImage(request);
          });
      })
  );
});

// ======================
// Background Fetch Events
// ======================
self.addEventListener('backgroundfetchsuccess', event => {
  console.log('Background Fetch succeeded:', event.registration.id);
  
  event.waitUntil((async () => {
    const cache = await caches.open(offlineMoviesCache);
    const records = await event.registration.matchAll();
    
    await Promise.all(records.map(async record => {
      const response = await record.responseReady;
      await cache.put(record.request, response);
      console.log('Cached movie:', record.request.url);
    }));
    
    await sendMessageToUI({
      action: "background-fetch-completed",
      id: event.registration.id
    });
  })());
});

self.addEventListener('backgroundfetchfailure', event => {
  console.log('Background Fetch failed:', event.registration.id);
  event.waitUntil(
    sendMessageToUI({
      action: "background-fetch-failure",
      id: event.registration.id,
      reason: event.registration.failureReason
    })
  );
});

self.addEventListener('backgroundfetchabort', event => {
  console.log('Background Fetch aborted:', event.registration.id);
  event.waitUntil(
    sendMessageToUI({
      action: "background-fetch-abort",
      id: event.registration.id
    })
  );
});

self.addEventListener('backgroundfetchclick', event => {
  console.log('Background Fetch click:', event.registration.id);
  event.waitUntil(
    sendMessageToUI({
      action: "background-fetch-click",
      id: event.registration.id
    })
  );
});

// ======================
// Helper Functions
// ======================
async function sendMessageToUI(message) {
  const clients = await self.clients.matchAll();
  clients.forEach(client => client.postMessage(message));
}

function serveOfflineImage(request) {
  if (request.headers.get('accept').includes('image')) {
    return new Response(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">
        <rect width="400" height="300" fill="#f0f0f0"/>
        <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" 
              font-family="sans-serif" font-size="24" fill="#666">
          Offline Image
        </text>
      </svg>`,
      { headers: { 'Content-Type': 'image/svg+xml' } }
    );
  }
  return new Response('Offline', { status: 503 });
}
