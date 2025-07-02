// Update 'version' if you need to refresh the cache
const version = "pwaCacheTest";
const offlineMoviesCache = "offlineMovies";
const offlineUrl = "offline.html";

// Store core files in a cache (including a page to display when offline)
function updateStaticCache() {
    return caches.open(version)
        .then(function (cache) {
            return cache.addAll([
                offlineUrl
            ]);
        });
}

async function sendMessageToUI(message) {
  const clients = await self.clients.matchAll();
  clients.forEach(client => client.postMessage(message));
}

async function addToCache(request, response) {
  if (!response.ok) {
      return;
  }

  var copy = response.clone();
  try {
    const cache = await caches.open(version);
    await cache.put(request, copy);
  } catch (error) {
    console.error("Unable to cache request", request.url, error);
  }
}

function serveOfflineImage(request) {
    if (request.headers.get('Accept').indexOf('image') !== -1) {
        return new Response('<svg role="img" aria-labelledby="offline-title" viewBox="0 0 400 300" xmlns="http://www.w3.org/2000/svg"><title id="offline-title">Offline</title><g fill="none" fill-rule="evenodd"><path fill="#D8D8D8" d="M0 0h400v300H0z"/><text fill="#9B9B9B" font-family="Helvetica Neue,Arial,Helvetica,sans-serif" font-size="72" font-weight="bold"><tspan x="93" y="172">offline</tspan></text></g></svg>', { headers: { 'Content-Type': 'image/svg+xml' } });
    }
}

addEventListener("backgroundfetchsuccess", (event) => {
  const bgFetch = event.registration;
  console.log("bg fetch success");
  event.waitUntil(async function() {
    // Create/open a cache.
    const cache = await caches.open(offlineMoviesCache);
    // Get all the records in the movieDownloads cache.
    const records = await bgFetch.matchAll();
    // Copy each request/response across.
    const promises = records.map(async (record) => {
      const response = await record.responseReady;
      await cache.put(record.request, response);
      console.log("putting movie contents into cache", record.request.url, offlineMoviesCache);
    });

    // Wait for the copying to complete.
    await Promise.all(promises);
    
    // Get the client.
    sendMessageToUI({ action: "background-fetch-completed" });
  }());
});


addEventListener("backgroundfetchfailure", event => {
  event.waitUntil(sendMessageToUI({ action: "background-fetch-failure", error: event.registration.failureReason }));
});

addEventListener("backgroundfetchabort", event => {
  event.waitUntil(sendMessageToUI({ action: "background-fetch-abort"}));
});

addEventListener("backgroundfetchclick", (event) => {
  event.waitUntil(sendMessageToUI({ action: "background-fetch-click"}));
});

self.addEventListener('fetch', function (event) {
    const request = event.request;

    // Always fetch non-GET requests from the network
    if (request.method !== 'GET' || request.url.match(/\/browserLink/ig) || request.url.match("chrome-extension")) {
        event.respondWith(
            fetch(request)
                .catch(function () {
                    return caches.match(offlineUrl);
                })
        );
        return;
    }

    event.respondWith(
        caches.match(request)
            .then(function (response) {
                return response || fetch(request)
                    .then(function (response) {
                        // For movies, we cache those separately.
                        if (!request.url.includes("mp4")) {
                          addToCache(request, response);
                        }
                        return response || serveOfflineImage(request);
                    })
                    .catch(function () {
                        return serveOfflineImage(request);
                    });
            })
    );

});

self.addEventListener('install', function (event) {
    event.waitUntil(updateStaticCache());
});
