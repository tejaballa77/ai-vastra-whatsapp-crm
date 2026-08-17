// AI Vastra Chrome Extension Background Service Worker
const DEFAULT_API_URL = 'https://crm.nicedigitalsgroup.com';

// Listen for messages from content script injected on web.whatsapp.com
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'FETCH_CRM_METADATA') {
    getApiUrl().then((baseUrl) => {
      fetch(`${baseUrl}/api/chats`)
        .then((res) => res.json())
        .then((chats) => {
          const activeChat = chats.find(c => c.jid.includes(request.phoneClean) || request.phoneClean.includes(c.jid.split('@')[0]));
          sendResponse({ success: true, chat: activeChat || null });
        })
        .catch((err) => sendResponse({ success: false, error: err.message }));
    });
    return true; // Keep response channel open for async response
  }

  if (request.action === 'UPDATE_CRM_METADATA') {
    getApiUrl().then((baseUrl) => {
      fetch(`${baseUrl}/api/crm/contact/${encodeURIComponent(request.jid)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request.data)
      })
        .then((res) => res.json())
        .then((data) => sendResponse({ success: true, data }))
        .catch((err) => sendResponse({ success: false, error: err.message }));
    });
    return true;
  }
});

function getApiUrl() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(['apiUrl'], (result) => {
      resolve(result.apiUrl || DEFAULT_API_URL);
    });
  });
}
