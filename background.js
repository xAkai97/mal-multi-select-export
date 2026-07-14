chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['extensionDisabled'], (result) => {
    chrome.contextMenus.create({
      id: "toggle-overlay",
      title: "Disable MAL Export Overlay",
      contexts: ["action"],
      type: "checkbox",
      checked: !!result.extensionDisabled
    });
  });
});

chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && changes.extensionDisabled) {
    chrome.contextMenus.update("toggle-overlay", {
      checked: changes.extensionDisabled.newValue
    }).catch(() => {
      // Ignore errors if context menu item doesn't exist yet
    });
  }
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "toggle-overlay") {
    chrome.storage.local.set({ extensionDisabled: info.checked });
  }
});
