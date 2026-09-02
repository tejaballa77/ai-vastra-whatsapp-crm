// AI Vastra Chrome Extension Background Service Worker
const DEFAULT_API_URL = 'https://crm.nicedigitalsgroup.com';

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

// Listen for messages from content script injected on web.whatsapp.com
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'FETCH_ALL_CRM_CHATS') {
    getApiUrl().then(async (baseUrl) => {
      const chats = await safeFetchJson(`${baseUrl}/api/chats`);
      sendResponse({ success: true, chats: Array.isArray(chats) ? chats : [] });
    });
    return true;
  }

  if (request.action === 'FETCH_CRM_METADATA') {
    getApiUrl().then(async (baseUrl) => {
      const chats = await safeFetchJson(`${baseUrl}/api/chats`);
      const allChats = Array.isArray(chats) ? chats : [];
      const badNames = ['.', 'contact', 'unsaved contact', 'unknown contact', 'whatsapp contact', ''];

      // STEP 1: Phone / JID lookup (exact match)
      const rawSearch = (request.phoneClean || request.searchKey || '').replace(/\D/g, '');
      if (rawSearch.length >= 10) {
        const tenDigit = (rawSearch.length === 12 && rawSearch.startsWith('91'))
          ? rawSearch.slice(2)
          : rawSearch;
        const full12 = tenDigit.length === 10 ? '91' + tenDigit : rawSearch;

        const byPhone = allChats.find((c) => {
          const jidNum = (c.jid || '').split('@')[0].replace(/\D/g, '');
          const pNum   = (c.phone || '').replace(/\D/g, '');
          return (
            jidNum === full12 || jidNum === tenDigit ||
            pNum   === full12 || pNum   === tenDigit
          );
        });

        if (byPhone) return sendResponse({ success: true, chat: byPhone });
      }

      // STEP 2: Exact display-name lookup
      const searchName = (request.displayName || request.searchKey || '').toLowerCase().trim();
      const nameIsValid = searchName &&
        !badNames.includes(searchName) &&
        searchName.replace(/\D/g, '').length < 10;

      if (nameIsValid) {
        const byName = allChats.find((c) => {
          const cName = (c.name || '').toLowerCase().trim();
          return cName === searchName;
        });
        if (byName) return sendResponse({ success: true, chat: byName });
      }

      sendResponse({ success: true, chat: null });
    });
    return true;
  }

  if (request.action === 'CLEAR_CRM_METADATA') {
    getApiUrl().then(async (baseUrl) => {
      safeFetchJson(`${baseUrl}/api/chats/${encodeURIComponent(request.jid || request.phone)}`, {
        method: 'DELETE'
      });

      const data = await safeFetchJson(`${baseUrl}/api/crm/contact/clear`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jid: request.jid, phone: request.phone })
      });
      sendResponse({ success: true, data });
    });
    return true;
  }

  if (request.action === 'UPDATE_CRM_METADATA') {
    getApiUrl().then(async (baseUrl) => {
      const payload = {
        jid: request.jid,
        ...(request.data || {})
      };

      let data = await safeFetchJson(`${baseUrl}/api/crm/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!data && request.jid) {
        data = await safeFetchJson(`${baseUrl}/api/crm/contact/${encodeURIComponent(request.jid)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(request.data || {})
        });
      }

      sendResponse({ success: Boolean(data), data });
    });
    return true;
  }
});

function getApiUrl() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(['apiUrl'], (result) => {
      const customUrl = (result?.apiUrl || '').trim().replace(/\/$/, '');
      resolve(customUrl || DEFAULT_API_URL);
    });
  });
}
