// AI Vastra Social CRM Extension Background Service Worker (Instagram, LinkedIn, Facebook)
const DEFAULT_API_URL = 'http://localhost:5000';

async function getApiUrl() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['apiUrl'], (result) => {
      resolve(result.apiUrl || DEFAULT_API_URL);
    });
  });
}

async function safeFetchJson(url, options = {}) {
  try {
    const res = await fetch(url, options);
    if (!res.ok) return null;
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch (e) {
      return null;
    }
  } catch (err) {
    return null;
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'GET_CONFIG') {
    getApiUrl().then((apiUrl) => {
      sendResponse({ apiUrl });
    });
    return true;
  }

  if (request.action === 'SET_CONFIG') {
    chrome.storage.local.set({ apiUrl: request.apiUrl }, () => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (request.action === 'UPDATE_CRM_METADATA') {
    getApiUrl().then(async (baseUrl) => {
      const endpoint = `${baseUrl}/api/crm/contact`;
      const data = await safeFetchJson(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request.payload)
      });
      sendResponse({ success: Boolean(data && data.success), data });
    });
    return true;
  }

  if (request.action === 'FETCH_CONTACT_DATA') {
    getApiUrl().then(async (baseUrl) => {
      const identifier = request.identifier;
      if (!identifier || typeof identifier !== 'string' || !identifier.trim()) {
        sendResponse({ success: false, contact: null });
        return;
      }
      const data = await safeFetchJson(`${baseUrl}/api/chats`);
      if (data && Array.isArray(data)) {
        const found = data.find(c => 
          (c.jid && c.jid === identifier) || 
          (c.phone && c.phone === identifier) || 
          (c.threadId && String(c.threadId) === String(identifier)) ||
          (c.name && c.name.toLowerCase() === identifier.toLowerCase())
        );
        sendResponse({ success: true, contact: found || null });
      } else {
        sendResponse({ success: false, contact: null });
      }
    });
    return true;
  }
});
