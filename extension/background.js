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
          const searchName = (request.displayName || request.searchKey || '').toLowerCase().trim();
          const badNames = ['.', 'contact', 'unsaved contact', 'unknown contact', 'whatsapp contact', ''];

          // 1. Try matching by display name first if it's a named lead
          if (searchName && !badNames.includes(searchName) && searchName.replace(/\D/g, '').length < 10) {
            const activeChatByName = (Array.isArray(chats) ? chats : []).find((c) => {
              if (!c.name) return false;
              const cName = c.name.toLowerCase().trim();
              return cName === searchName || cName.includes(searchName) || searchName.includes(cName);
            });

            if (activeChatByName) {
              return sendResponse({ success: true, chat: activeChatByName });
            }
          }

          // 2. Otherwise match by 10/12-digit phone number
          const search = (request.phoneClean || '').toLowerCase().trim();
          const cleanSearchDigits = search.replace(/\D/g, '');

          if (cleanSearchDigits.length >= 10) {
            const tenDigit = (cleanSearchDigits.length === 12 && cleanSearchDigits.startsWith('91'))
              ? cleanSearchDigits.slice(2)
              : cleanSearchDigits;
            const full12 = cleanSearchDigits.length === 10 ? '91' + cleanSearchDigits : cleanSearchDigits;

            const activeChat = (Array.isArray(chats) ? chats : []).find((c) => {
              const cleanJidNum = (c.jid || '').split('@')[0].replace(/\D/g, '');
              const cleanPhone = (c.phone || '').replace(/\D/g, '');
              return (
                cleanJidNum === full12 ||
                cleanJidNum === tenDigit ||
                cleanPhone === full12 ||
                cleanPhone === tenDigit
              );
            });

            if (activeChat) return sendResponse({ success: true, chat: activeChat });
          }

          // 3. Fallback: Check if searchName contains a number that matches a stored phone/jid
          if (searchName && searchName.replace(/\D/g, '').length >= 10) {
            const cleanSearchDigits = searchName.replace(/\D/g, '');
            const tenDigit = (cleanSearchDigits.length === 12 && cleanSearchDigits.startsWith('91'))
              ? cleanSearchDigits.slice(2)
              : cleanSearchDigits;
            const full12 = cleanSearchDigits.length === 10 ? '91' + cleanSearchDigits : cleanSearchDigits;

            const activeChat = (Array.isArray(chats) ? chats : []).find((c) => {
              const cleanJidNum = (c.jid || '').split('@')[0].replace(/\D/g, '');
              const cleanPhone = (c.phone || '').replace(/\D/g, '');
              return (
                cleanJidNum === full12 ||
                cleanJidNum === tenDigit ||
                cleanPhone === full12 ||
                cleanPhone === tenDigit
              );
            });
            if (activeChat) return sendResponse({ success: true, chat: activeChat });
          }

          // 4. SAFE FALLBACK: Only when phoneClean is provided (extracted from data-id/DOM)
          // but the phone doesn't match anything stored yet — match by jid digits directly
          if (cleanSearchDigits.length >= 7) {
            const tenD = cleanSearchDigits.length >= 10
              ? (cleanSearchDigits.length === 12 && cleanSearchDigits.startsWith('91') ? cleanSearchDigits.slice(2) : cleanSearchDigits)
              : cleanSearchDigits;
            const phoneMatch = (Array.isArray(chats) ? chats : []).find((c) => {
              const jidNum = (c.jid || '').split('@')[0].replace(/\D/g, '');
              const pNum = (c.phone || '').replace(/\D/g, '');
              return jidNum.endsWith(tenD) || pNum.endsWith(tenD) || tenD.endsWith(jidNum.slice(-10));
            });
            if (phoneMatch) return sendResponse({ success: true, chat: phoneMatch });
          }

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
