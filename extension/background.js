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
          const search = (request.phoneClean || '').toLowerCase().trim();
          const cleanSearchDigits = search.replace(/\D/g, '');

          const activeChat = chats.find(c => {
            const cleanJidNum = c.jid.split('@')[0].replace(/\D/g, '');
            const cleanPhone = (c.phone || '').replace(/\D/g, '');
            const name = (c.name || '').toLowerCase().trim();

            if (cleanSearchDigits.length >= 10) {
              if (cleanJidNum.includes(cleanSearchDigits) || cleanSearchDigits.includes(cleanJidNum)) return true;
              if (cleanPhone && (cleanPhone.includes(cleanSearchDigits) || cleanSearchDigits.includes(cleanPhone))) return true;
            }

            if (name && search.length > 1) {
              if (name === search || name.includes(search) || search.includes(name)) return true;
            }

            return false;
          });

          sendResponse({ success: true, chat: activeChat || null });
        })
        .catch((err) => sendResponse({ success: false, error: err.message }));
    });
    return true; // Keep response channel open for async response
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
