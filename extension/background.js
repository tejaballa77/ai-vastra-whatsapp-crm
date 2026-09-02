// AI Vastra Chrome Extension Background Service Worker
const DEFAULT_API_URL = 'https://crm.nicedigitalsgroup.com';

// Listen for messages from content script injected on web.whatsapp.com
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'FETCH_ALL_CRM_CHATS') {
    getApiUrl().then((baseUrl) => {
      fetch(`${baseUrl}/api/chats`)
        .then((res) => res.json())
        .then((chats) => sendResponse({ success: true, chats: Array.isArray(chats) ? chats : [] }))
        .catch((err) => sendResponse({ success: false, error: err.message, chats: [] }));
    });
    return true;
  }

  if (request.action === 'FETCH_CRM_METADATA') {
    getApiUrl().then((baseUrl) => {
      fetch(`${baseUrl}/api/chats`)
        .then((res) => res.json())
        .then((chats) => {
          const allChats = Array.isArray(chats) ? chats : [];
          const badNames = ['.', 'contact', 'unsaved contact', 'unknown contact', 'whatsapp contact', ''];

          // ------------------------------------------------------------------
          // STEP 1: Phone / JID lookup — most reliable, always tried first.
          // We check both the request.phoneClean field AND any digits inside
          // request.searchKey (in case the contact title IS the phone number).
          // ------------------------------------------------------------------
          const rawSearch = (request.phoneClean || request.searchKey || '').replace(/\D/g, '');
          if (rawSearch.length >= 10) {
            const tenDigit = (rawSearch.length === 12 && rawSearch.startsWith('91'))
              ? rawSearch.slice(2)
              : rawSearch;
            const full12 = tenDigit.length === 10 ? '91' + tenDigit : rawSearch;

            const byPhone = allChats.find((c) => {
              const jidNum = (c.jid || '').split('@')[0].replace(/\D/g, '');
              const pNum   = (c.phone || '').replace(/\D/g, '');
              // Exact match only — no suffix/partial matching
              return (
                jidNum === full12 || jidNum === tenDigit ||
                pNum   === full12 || pNum   === tenDigit
              );
            });

            if (byPhone) return sendResponse({ success: true, chat: byPhone });
          }

          // ------------------------------------------------------------------
          // STEP 2: Exact display-name lookup — only when the contact has a
          // proper saved name (not a phone number or generic placeholder).
          // Uses EXACT equality, not partial/includes, to prevent collisions.
          // ------------------------------------------------------------------
          const searchName = (request.displayName || request.searchKey || '').toLowerCase().trim();
          const nameIsValid = searchName &&
            !badNames.includes(searchName) &&
            searchName.replace(/\D/g, '').length < 10;   // not a phone-number title

          if (nameIsValid) {
            const byName = allChats.find((c) => {
              const cName = (c.name || '').toLowerCase().trim();
              return cName === searchName;  // EXACT match only
            });
            if (byName) return sendResponse({ success: true, chat: byName });
          }

          // No match found — return null so the extension shows a clean panel
          sendResponse({ success: true, chat: null });
        })
        .catch((err) => sendResponse({ success: false, error: err.message }));
    });
    return true; // Keep response channel open for async response
  }

  if (request.action === 'CLEAR_CRM_METADATA') {
    getApiUrl().then((baseUrl) => {
      fetch(`${baseUrl}/api/chats/${encodeURIComponent(request.jid || request.phone)}`, {
        method: 'DELETE'
      }).catch(() => {});

      fetch(`${baseUrl}/api/crm/contact/clear`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jid: request.jid, phone: request.phone })
      })
        .then((res) => res.json())
        .then((data) => sendResponse({ success: true, data }))
        .catch((err) => sendResponse({ success: false, error: err.message }));
    });
    return true;
  }

  if (request.action === 'UPDATE_CRM_METADATA') {
    getApiUrl().then((baseUrl) => {
      const payload = {
        jid: request.jid,
        ...(request.data || {})
      };
      console.log('[AI Vastra Extension BG] Sending CRM update:', payload);

      fetch(`${baseUrl}/api/crm/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
        .then((res) => res.json())
        .then((data) => {
          console.log('[AI Vastra Extension BG] Update response:', data);
          sendResponse({ success: true, data });
        })
        .catch((err) => {
          console.warn('[AI Vastra Extension BG] POST failed, trying PUT fallback:', err.message);
          fetch(`${baseUrl}/api/crm/contact/${encodeURIComponent(request.jid)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(request.data)
          })
            .then((res) => res.json())
            .then((data) => sendResponse({ success: true, data }))
            .catch((fallbackErr) => {
              console.error('[AI Vastra Extension BG] All update attempts failed:', fallbackErr.message);
              sendResponse({ success: false, error: fallbackErr.message });
            });
        });
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
