// Background service worker
// Currently minimal, but enables proper extension lifecycle handling.

chrome.runtime.onInstalled.addListener(() => {
  console.log('Map Collaborator installed.');
});
