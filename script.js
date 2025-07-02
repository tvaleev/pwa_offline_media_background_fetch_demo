const movieFetchId = "elephantsdream";
const movieUrl = "elephantsdream_teaser.mp4"
const movieSizeInBytes = 30639218;
const makeOfflineBtn = document.querySelector("#makeOfflineBtn");
const makeOnlineOnlyBtn = document.querySelector("#makeOnlineOnlyBtn");
const cacheName = "offlineMovies";
let manualProgressPollHandle = -1;

makeOfflineBtn.addEventListener("click", makeOfflineClicked);
makeOnlineOnlyBtn.addEventListener("click", makeOnlineOnlyClicked);

// Check browser support and register service worker
(async () => await checkBrowserSupport())();
(async () => await registerServiceWorker())();

// Set the video source
document.querySelector("video").src = movieUrl;

// See if we're already in the cache.
queryForMovieCacheStatus();

listenForServiceWorkerBgFetchEvents();

async function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    try {
      const swReg = await navigator.serviceWorker.register('sw_bf.js');
      console.log('ServiceWorker registration successful');
      
      // Wait for the service worker to be fully ready
      if (swReg.installing) {
        await new Promise(resolve => {
          swReg.installing.onstatechange = function() {
            if (this.state === 'activated') {
              resolve();
            }
          };
        });
      }
      
      return swReg; // Return the registration
    } catch (error) {
      console.error("ServiceWorker registration failed:", error);
      throw error;
    }
  }
  throw new Error("Service workers not supported");
}

async function queryForMovieCacheStatus() {
  try {
    // See if we already have a movie being downloaded.
    // If so, we'll just wire up progress report on that.
    const existingDownload = await getExistingMovieDownload();
    if (existingDownload) {
      fetchProgressed(existingDownload);
    } else {
      // No existing download. See if we have it in the cache.
      const isCached = await checkMovieCacheStatus();
      showSuccess(isCached);
    }
  } catch (error) {
    showError(error);
  }
}

async function makeOfflineClicked() {
  console.log("makeOfflineClicked");
  showSuccess(false);
  showError(null);
  setLoadingPercentage(0);
  try {
    console.log("makeOfflineClicked try to fetch");
    const bgFetch = await getOrCreateMovieDownload();
    await bgFetch.responseReady;
  } catch (err) {
    showError(err);
  }
}

async function makeOnlineOnlyClicked() {
  console.log("makeOnlineOnlyClicked");
  try {
    const result = await deleteMovieFromCache();
  } catch (error) {
    showError(error);
  }
  finally {
    queryForMovieCacheStatus();
  }
}

async function getExistingMovieDownload() {
  const swReg = await navigator.serviceWorker.ready;
  const existing = await swReg.backgroundFetch.get(movieFetchId);
  if (existing) {
    initializeBgFetch(existing);
  }
  
  return existing;
}

async function getOrCreateMovieDownload() {
  console.log("getOrCreateMovieDownload");
  const existingFetch = await getExistingMovieDownload();
  if (existingFetch) {
    // See if we already have a download going. If so, use that.
    console.log("returning existing in progress", existingFetch);
    return existingFetch;
  } 
  
  const swReg = await navigator.serviceWorker.ready;
  console.log("creating new fetch");
  const newFetch = await swReg.backgroundFetch.fetch(movieFetchId, [movieUrl], {
    title: 'Elephant',
    icons: [{
      sizes: '640x360',
      src: 'Elephants_Dream_Emo_Proog_s6.jpeg',
      type: 'image/jpeg',
    }],
    downloadTotal: movieSizeInBytes,
  });
  
  initializeBgFetch(newFetch);
  return newFetch;
}

function initializeBgFetch(bgFetch) {
  bgFetch.addEventListener("progress", (ev) => fetchProgressed(bgFetch));
  
  // At the time of this writing (June 2020), some versions of Chromium aren't firing progress event.
  // To account for this, we'll manually poll the background fetch for progress.
  manualProgressPollHandle = setInterval(() => {
    fetchProgressed(bgFetch);
  }, 1000);
}

function fetchProgressed(bgFetch) {
  if (bgFetch.result === "failure") {
    showError("Background download failed: " + bgFetch.failureReason);
  } else if (bgFetch.downloadTotal > 0) {
    const percentage = Math.floor(100 * (bgFetch.downloaded / bgFetch.downloadTotal)); 
    console.log("setting to percentage", percentage, bgFetch.downloaded, bgFetch.downloadTotal);
    setLoadingPercentage(percentage);
  }
}

async function checkBrowserSupport() {
  if (!('serviceWorker' in navigator)) {  
    showError("Your browser doesn't support service worker. Please try using a modern browser like Edge, Chrome, or Firefox");
    return;
  } 
  const swReg = await navigator.serviceWorker.ready;
  if (!swReg.backgroundFetch) {
    showError("Your browser doesn't support Background Fetch");
  }
  
  let fetch = await swReg.backgroundFetch.get(movieFetchId);
}

function listenForServiceWorkerBgFetchEvents() {  
  navigator.serviceWorker.addEventListener('message', event => {
    if (event.data.action === "background-fetch-completed") {
      showSuccess(true);
    } else if (event.data.action === "background-fetch-failure") {
      showError("Error making movie offline: " + event.data.error);
    } else if (event.data.action === "background-fetch-abort") {
      showError("Movie download was aborted");
    } else if (event.data.action === "background-fetch-click") {
      movieDownloadClicked();
    }
  });
}

function movieDownloadClicked() {
  // Play the movie if it's not already.
    const video = document.querySelector("video");
    if (video) {
      video.scrollIntoViewIfNeeded();
      if (video.paused) {
        video.play();
      }
    }
}

function clearLoadingProgress() {
  setLoadingPercentage(-1);
}

function setLoadingPercentage(percentage) {
  const state = percentage !== -1;
  makeOfflineBtn.querySelector(".spinner-border").style.display = state ? "inline-block" : "none";
  makeOfflineBtn.disabled = state ? true : false;
  makeOfflineBtn.querySelector(".label").textContent = state ? "Making video available offline..." + percentage + "%" : "Make video available offline";
  document.querySelector("#offline-in-progress").style.display = state ? "block" : "none";
  
  if (!state) {
    clearInterval(manualProgressPollHandle);
  }
}

function showError(err) {
  if (err) {
    clearLoadingProgress();
  }
  
  const errorDiv = document.querySelector("#err");
  if (errorDiv) {
    errorDiv.textContent = err ? err.toString() : "";
    errorDiv.style.display = err ? "block" : "none";
  }
}

function showSuccess(success) {
  if (success) {
    clearLoadingProgress();
  }
  
  const successDiv = document.querySelector("#success");  
  makeOfflineBtn.style.display = success ? "none" : "inline-block";
  successDiv.style.display = success ? "block" : "none";  
  document.querySelector("#offline-in-progress").style.display = "none";
}

async function getMovieInCache() {
  const cache = await caches.open(cacheName);
  const everythingInCache = await cache.matchAll();
  return everythingInCache.find(r => r.url.includes(".mp4"));
}

async function checkMovieCacheStatus() {
  const movieInCache = await getMovieInCache();
  return !!movieInCache;
}

async function deleteMovieFromCache() {
  const movieInCache = await getMovieInCache();
  if (movieInCache) {
    console.log("deleting from cache", movieInCache.url, cacheName);
    const cache = await caches.open(cacheName);
    const deleted = await cache.delete(movieInCache.url);
    return true;
  } 

  return false;
}
