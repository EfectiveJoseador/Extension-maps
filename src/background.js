chrome.runtime.onInstalled.addListener(() => {
  console.log('Map Collaborator installed.');
});

// Fix for "The service worker navigation preload request was cancelled" warning
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      if (self.registration.navigationPreload) {
        await self.registration.navigationPreload.disable();
      }
    })()
  );
});
