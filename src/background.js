chrome.action.onClicked.addListener((tab) => {
  if (tab.id) {
    chrome.tabs.sendMessage(tab.id, { type: "fill" }).catch(() => {
      // The content script is unavailable until the matching puzzle page loads.
    });
  }
});
