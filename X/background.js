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
  if (request.action === 'SYNC_CONTACT_NAME') {
    getApiUrl().then(async (baseUrl) => {
      const data = await safeFetchJson(`${baseUrl}/api/contacts/name`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jid: request.jid, name: request.name })
      });
      sendResponse({ success: Boolean(data?.success), data });
    });
    return true;
  }
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
      if (/^[1-9]\d{6,14}$/.test(rawSearch)) {
        const tenDigit = (rawSearch.length === 12 && rawSearch.startsWith('91'))
          ? rawSearch.slice(2)
          : rawSearch;
        const full12 = rawSearch;

        const byPhone = allChats.find((c) => {
          if (!/^[1-9]\d{6,14}(?::\d+)?@(?:s\.whatsapp\.net|c\.us)$/.test(c.jid || '')) return false;
          const jidNum = (c.jid || '').split('@')[0].split(':')[0];
          const pNum   = (c.phone || '').replace(/\D/g, '');
          return (
            jidNum === full12
          );
        });

        if (byPhone) return sendResponse({ success: true, chat: byPhone });
      }

      // Controlled fallback: the content script generates this deterministic,
      // namespaced identity from the exact saved WhatsApp contact name.
      if (/^name_[0-9a-f]{8}@name\.whatsapp$/.test(request.fallbackJid || '')) {
        const byFallback = allChats.find((c) => c.jid === request.fallbackJid);
        if (byFallback) return sendResponse({ success: true, chat: byFallback });
      }

      // Never perform fuzzy or partial name matching.
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
