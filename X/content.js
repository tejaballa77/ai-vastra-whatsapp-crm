// AI Vastra Chrome Extension - Injected Content Script on web.whatsapp.com
console.log('[AI Vastra Chrome Extension] Script active on WhatsApp Web!');
const DEFAULT_API_BASE = 'https://crm.nicedigitalsgroup.com';

// Safe chrome.storage wrapper — prevents crash when running in non-extension frames
function safeStorageGet(keys, callback) {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(keys, callback);
    } else {
      callback({});
    }
  } catch (e) {
    callback({});
  }
}

function safeStorageSet(obj) {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set(obj);
    }
  } catch (e) {}
}

function safeStorageRemove(keys) {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.remove(keys);
    }
  } catch (e) {}
}

function safeSendMessage(msg, callback) {
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage(msg, callback || (() => {}));
    } else {
      if (callback) callback(null);
    }
  } catch (e) {
    if (callback) callback(null);
  }
}

// Active chat identification
let activeContactKey = '';
let activeDisplayName = '';
let activePhoneClean = '';
let activeAvatarUrl = '';
let metadataRequestId = 0;

// Per-Contact Form Data Store (Strict Chat Isolation)
let activeFormData = {
  leadStatus: 'UNASSIGNED',
  callStatus: null,
  followUpDate: '',
  previousFollowUpDate: '',
  notesList: []
};

let isPanelVisible = true;
let chatsMetadataMap = {};
let indexedDbContactMap = new Map();
let contactBookRefreshPending = false;
let lastContactBookRefresh = 0;
let pendingPhoneSaveGeneration = null;

function normalizeNameIdentity(name) {
  return String(name || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
}

function isValidNameIdentity(name) {
  const normalized = normalizeNameIdentity(name);
  const badNames = ['.', 'contact', 'unsaved contact', 'unknown contact', 'whatsapp contact', ''];
  const numericLike = /^\+?[\d\s().-]+$/.test(normalized);
  const digits = normalized.replace(/\D/g, '');
  // Preserve legitimate short numeric saved names such as "123455". A
  // numeric-looking value of phone length must be handled as a phone instead.
  return normalized.length > 1 && !badNames.includes(normalized) && !(numericLike && digits.length >= 7);
}

// FNV-1a gives the extension and backend the same stable, non-phone key.
// The original exact display name remains in the record for the CRM UI.
function makeNameFallbackJid(name) {
  const normalized = normalizeNameIdentity(name);
  if (!isValidNameIdentity(normalized)) return '';
  let hash = 0x811c9dc5;
  for (let i = 0; i < normalized.length; i++) {
    hash ^= normalized.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `name_${hash.toString(16).padStart(8, '0')}@name.whatsapp`;
}

async function syncContactsFromIndexedDb() {
  if (contactBookRefreshPending || Date.now() - lastContactBookRefresh < 500) return;
  contactBookRefreshPending = true;
  lastContactBookRefresh = Date.now();
  const finish = () => { contactBookRefreshPending = false; };
  try {
    if (typeof indexedDB === 'undefined' || !indexedDB.databases) { finish(); return; }
    const dbs = await indexedDB.databases();
    const waDb = dbs.find((d) => d.name && (d.name.includes('model') || d.name.includes('wawc') || d.name.includes('whatsapp')));
    if (!waDb || !waDb.name) { finish(); return; }

    const req = indexedDB.open(waDb.name);
    req.onerror = finish;
    req.onblocked = finish;
    req.onsuccess = (evt) => {
      try {
        const db = evt.target.result;
        const storeName = Array.from(db.objectStoreNames).find((s) => s === 'contact' || s === 'contacts');
        if (!storeName) { db.close(); finish(); return; }

        const tx = db.transaction([storeName], 'readonly');
        const store = tx.objectStore(storeName);
        const getAllReq = store.getAll();
        tx.oncomplete = () => { db.close(); finish(); };
        tx.onabort = () => { db.close(); finish(); };
        getAllReq.onerror = finish;
        getAllReq.onsuccess = (ev) => {
          const list = ev.target.result || [];
          const refreshedContacts = new Map();
          for (const c of list) {
            if (!c) continue;
            const rawId = typeof c.id === 'object' ? String(c.id?._serialized || c.id?.user || '') : String(c.id || '');
            const cleanId = rawId.split('@')[0].replace(/\D/g, '');

            let phoneNum = '';
            if (c.phoneNumber) {
              phoneNum = String(c.phoneNumber).split('@')[0].replace(/\D/g, '');
            } else if (c.pnJid) {
              phoneNum = String(c.pnJid).split('@')[0].replace(/\D/g, '');
            } else if (c.user && String(c.user).replace(/\D/g, '').length >= 7 && String(c.user).replace(/\D/g, '').length <= 15) {
              phoneNum = String(c.user).replace(/\D/g, '');
            } else if (!rawId.endsWith('@lid') && cleanId.length >= 7 && cleanId.length <= 15) {
              phoneNum = cleanId;
            }

            const name = (c.name || c.formattedName || c.displayName || c.verifiedName || '').trim();
            if (name && phoneNum && phoneNum.length >= 7) {
              const key = name.toLowerCase();
              if (!refreshedContacts.has(key)) refreshedContacts.set(key, phoneNum);
              else if (refreshedContacts.get(key) !== phoneNum) refreshedContacts.set(key, '');
            }
          }
          indexedDbContactMap = refreshedContacts;
          // Resolve the current header immediately after address-book refresh,
          // instead of waiting for the next 20-second background cycle.
          if (!activePhoneClean && pendingPhoneSaveGeneration !== fetchRequestGeneration) detectActiveContact();
        };
      } catch (e) { finish(); }
    };
  } catch (e) { finish(); }
}

function findPhoneInCacheByName(name) {
  if (!name || typeof name !== 'string') return '';
  const searchName = name.trim().toLowerCase();
  const badNames = ['.', 'contact', 'unsaved contact', 'unknown contact', 'whatsapp contact', ''];
  if (!searchName || badNames.includes(searchName)) return '';

  // Only the actual WhatsApp address book can establish this mapping.
  // CRM display names are mutable and may already be wrong; never trust them
  // to select another contact's phone. Duplicate address-book names fail closed.
  return indexedDbContactMap.get(searchName) || '';
}

// Generation counter — incremented on every chat switch.
// Async callbacks compare their captured generation with this value
// and silently discard the result if the user has already moved on.
let fetchRequestGeneration = 0;

// Create or get the injected CRM sidepanel container
function ensureCrmPanel() {
  let panel = document.getElementById('aivastra-crm-panel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'aivastra-crm-panel';
    document.body.appendChild(panel);
  }
  panel.style.display = isPanelVisible ? 'flex' : 'none';
  return panel;
}

// Injected Header Button inside WhatsApp Web
function ensureHeaderButton() {
  const mainHeader = document.querySelector('#main header');
  if (!mainHeader) return;
  if (document.getElementById('aivastra-toggle-btn')) return;

  const btnContainer = document.createElement('div');
  btnContainer.id = 'aivastra-toggle-btn-wrapper';
  btnContainer.style.display = 'inline-flex';
  btnContainer.style.alignItems = 'center';
  btnContainer.style.marginLeft = '8px';

  btnContainer.innerHTML = `
    <button id="aivastra-toggle-btn" style="
      background-color: #00a884;
      color: #ffffff;
      border: none;
      border-radius: 20px;
      padding: 6px 14px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.15);
      transition: background 0.2s;
    " title="Toggle AI Vastra CRM Info">
      <span>⚡ AI CRM</span>
    </button>
  `;

  mainHeader.appendChild(btnContainer);

  document.getElementById('aivastra-toggle-btn').onclick = () => {
    isPanelVisible = !isPanelVisible;
    const panel = document.getElementById('aivastra-crm-panel');
    if (panel) panel.style.display = isPanelVisible ? 'flex' : 'none';
    if (isPanelVisible) {
      if (activeContactKey) {
        // Same contact — just re-render with current in-memory data (preserves unsaved form state!)
        renderCrmPanel(activeDisplayName, activePhoneClean, activeAvatarUrl);
      } else {
        // No contact detected yet — run full detection
        detectActiveContact(true);
      }
    }
  };
}

// Sync all saved CRM chats from backend into chatsMetadataMap
function syncAllCrmChats(callback) {
  syncContactsFromIndexedDb();

  // First load locally cached names instantly
  safeStorageGet(['crm_name_cache'], (res) => {
    const localCache = res?.crm_name_cache || {};
    for (const [phoneKey, cachedName] of Object.entries(localCache)) {
      if (cachedName && phoneKey) {
        const cleanK = phoneKey.replace(/\D/g, '');
        const tenK = cleanK;
        const entry = { ...(chatsMetadataMap[cleanK] || chatsMetadataMap[tenK] || { leadStatus: 'UNASSIGNED', callStatus: null, followUpDate: '', notesList: [] }), name: cachedName, phone: cleanK };
        if (cleanK) chatsMetadataMap[cleanK] = entry;
        if (tenK) chatsMetadataMap[tenK] = entry;
      }
    }

    safeSendMessage({ action: 'FETCH_ALL_CRM_CHATS' }, (response) => {
      if (response && response.success && Array.isArray(response.chats)) {
        for (const c of response.chats) {
          const isNameFallback = Boolean(c.jid && c.jid.endsWith('@name.whatsapp'));
          const rawNum = isNameFallback ? '' : (c.phone || c.jid || '').split('@')[0].replace(/\D/g, '');
          const tenDigit = rawNum;

          const badNames = ['.', 'contact', 'unsaved contact', 'unknown contact', 'whatsapp contact', ''];
          const hasValidName = Boolean(c.name && c.name.trim() && !badNames.includes(c.name.trim().toLowerCase()));

          const hasInfo = Boolean(
            hasValidName ||
            (c.leadStatus && c.leadStatus !== 'UNASSIGNED') ||
            c.callStatus === 'YES' ||
            Boolean(c.followUpDate && c.followUpDate.trim().length > 0) ||
            (c.notesList && c.notesList.length > 0) ||
            Boolean(c.notes && c.notes.trim().length > 0)
          );

          if (hasInfo || hasValidName) {
            const existingMeta = chatsMetadataMap[tenDigit] || chatsMetadataMap[rawNum] || {};
            const meta = {
              leadStatus: c.leadStatus || existingMeta.leadStatus || 'UNASSIGNED',
              callStatus: c.callStatus || existingMeta.callStatus || null,
              followUpDate: c.followUpDate || existingMeta.followUpDate || '',
              previousFollowUpDate: c.previousFollowUpDate || existingMeta.previousFollowUpDate || '',
              notesList: c.notesList || existingMeta.notesList || (c.notes ? [c.notes] : []),
              name: (hasValidName ? c.name : existingMeta.name),
              phone: c.phone || tenDigit
            };
            // Index ONLY by phone/JID — never by display name to prevent collision
            if (!isNameFallback && tenDigit) chatsMetadataMap[tenDigit] = meta;
            if (!isNameFallback && rawNum && rawNum !== tenDigit) chatsMetadataMap[rawNum] = meta;
            if (c.jid) chatsMetadataMap[c.jid] = meta;
          }
        }
      }
      if (callback) callback();
      injectChatListBadges();
    });
  });
}


// Inject Lead Status Emoji Badges into left chat list (clean, no DOM name overrides)
function injectChatListBadges() {
  const chatItems = document.querySelectorAll('#pane-side [role="listitem"]');
  if (!chatItems || chatItems.length === 0) return;

  chatItems.forEach((item) => {
    try {
      const titleEl = item.querySelector('span[title]') || item.querySelector('span[dir="auto"]');
      if (!titleEl) return;

      const rawText = (titleEl.getAttribute('title') || titleEl.textContent || '').trim();
      let cleanDigits = item.getAttribute('data-aivastra-phone') || '';

      if (!cleanDigits) {
        const parsed = rawText.replace(/\D/g, '');
        if (parsed.length >= 7) {
          cleanDigits = parsed;
          item.setAttribute('data-aivastra-phone', cleanDigits);
        }
      }

      const tenDigit = cleanDigits;
      const key = cleanDigits.length >= 7 ? cleanDigits : rawText;
      const chatMeta = chatsMetadataMap[key] || chatsMetadataMap[rawText] || chatsMetadataMap[cleanDigits] || chatsMetadataMap[tenDigit];

      const status = chatMeta?.leadStatus || (key === activeContactKey ? activeFormData.leadStatus : null);
      let existingBadge = item.querySelector('.aivastra-chat-badge');

      if (status && status !== 'UNASSIGNED') {
        let badgeHtml = '';
        if (status === 'INTERESTED') {
          badgeHtml = '<span class="aivastra-chat-badge badge-interested">👍 Interested</span>';
        } else if (status === 'WARM_INTERESTED' || status === 'WARM') {
          badgeHtml = '<span class="aivastra-chat-badge badge-warm">🔥 Warm</span>';
        } else if (status === 'NOT_INTERESTED') {
          badgeHtml = '<span class="aivastra-chat-badge badge-not-interested">👎 Not Interested</span>';
        }

        if (existingBadge) {
          existingBadge.outerHTML = badgeHtml;
        } else {
          const titleParent = titleEl ? titleEl.parentElement : null;
          if (titleParent) {
            const wrapper = document.createElement('span');
            wrapper.innerHTML = badgeHtml;
            if (wrapper.firstChild) titleParent.appendChild(wrapper.firstChild);
          }
        }
      } else if (existingBadge) {
        existingBadge.remove();
      }
    } catch (e) {}
  });
}

let observerDebounceTimer = null;
let isUpdatingDom = false;

// Observe WhatsApp Web chat header and DOM changes with throttling & mutation guards
function startChatObserver() {
  const observer = new MutationObserver(() => {
    if (isUpdatingDom) return;
    if (observerDebounceTimer) return;

    observerDebounceTimer = setTimeout(() => {
      observerDebounceTimer = null;
      try {
        isUpdatingDom = true;
        ensureHeaderButton();
        detectActiveContact();
        injectChatListBadges();
      } catch (e) {
      } finally {
        isUpdatingDom = false;
      }
    }, 300);
  });

  observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['title', 'aria-selected'] });
}

// Detect WhatsApp profile display name (e.g., "~Parth" -> "Parth") from Contact Info panel or DOM (targeted)
function extractProfileNameFromDom() {
  try {
    const targets = document.querySelectorAll('#main header span, [role="region"] span, header + div span, #app header span');
    for (const el of targets) {
      const txt = (el.textContent || '').trim();
      if (txt.startsWith('~') && txt.length >= 2 && txt.length <= 40 && !txt.includes('\n')) {
        const cleanName = txt.substring(1).trim();
        if (cleanName && !cleanName.toLowerCase().includes('last seen') && !cleanName.toLowerCase().includes('online')) {
          return cleanName;
        }
      }
    }
  } catch (e) {}
  return null;
}

function findActiveContactInfoDrawer() {
  const explicit = document.querySelector('[data-testid="contact-info-drawer"], [data-testid*="contact-info"]');
  if (explicit) return explicit;
  // WhatsApp versions without the old test ID expose a labelled info panel.
  // Never search arbitrary regions (including our own CRM panel) for digits.
  const candidates = document.querySelectorAll('[role="dialog"], [role="region"], [aria-label="Contact info"], [aria-label="Contact Info"], [data-testid="drawer-right"]');
  const header = document.querySelector('#main header span[title]');
  const title = (header?.getAttribute('title') || header?.textContent || '').trim();
  for (const panel of candidates) {
    if (panel.id?.startsWith('aivastra') || panel.closest?.('[id^="aivastra"]')) continue;
    const label = panel.getAttribute?.('aria-label') || '';
    const heading = Array.from(panel.querySelectorAll('h1, h2, [role="heading"]')).some(node => /^contact info$/i.test((node.textContent || '').trim()));
    if (!/^contact info$/i.test(label) && !heading) continue;
    const matchesTitle = title && Array.from(panel.querySelectorAll('span[title], span[dir="auto"]')).some(node => (node.getAttribute('title') || node.textContent || '').trim() === title);
    if (matchesTitle) return panel;
  }

  // Current WhatsApp builds sometimes render the right drawer as unlabelled
  // nested divs. Find the visible "Contact info" heading and walk up only
  // within the right-hand side, never through the chat or our CRM panel.
  const headingNodes = Array.from(document.querySelectorAll('h1, h2, [role="heading"], span, div'))
    .filter(node => /^contact info$/i.test((node.textContent || '').trim()));
  for (const headingNode of headingNodes) {
    if (headingNode.closest?.('[id^="aivastra"]')) continue;
    let panel = headingNode.parentElement;
    for (let depth = 0; panel && depth < 8; depth++, panel = panel.parentElement) {
      if (panel.id?.startsWith('aivastra') || panel.closest?.('[id^="aivastra"]')) break;
      const rect = panel.getBoundingClientRect?.();
      const isRightDrawer = !rect || rect.left >= Math.max(0, window.innerWidth * 0.35);
      const hasActiveName = !title || Array.from(panel.querySelectorAll?.('span[title], span[dir="auto"], h1, h2') || [])
        .some(node => (node.getAttribute?.('title') || node.textContent || '').trim() === title);
      if (isRightDrawer && hasActiveName && panel.querySelectorAll?.('span, div, p, a').length > 3) return panel;
    }
  }
  return null;
}

function extractPhoneFromContactInfoDrawer() {
  try {
    const drawer = findActiveContactInfoDrawer();
    if (!drawer) return '';

    const candidates = [];
    for (const node of drawer.querySelectorAll('a[href^="tel:"], [title], [aria-label], span, div, p')) {
      if (node.closest?.('[id^="aivastra"]')) continue;
      const values = [node.getAttribute?.('href'), node.getAttribute?.('title'), node.getAttribute?.('aria-label')];
      if (!node.children || node.children.length === 0) values.push(node.textContent);
      for (const raw of values) {
        const value = String(raw || '').replace(/^tel:/i, '').trim();
        // Require an explicit international + prefix in visible Contact info.
        // This excludes business hours, dates, descriptions and other digits.
        const matches = /^\+[1-9](?:[\s().-]*\d){6,14}$/.test(value) ? [value] : [];
        for (const match of matches) {
          const digits = match.replace(/\D/g, '');
          if (/^[1-9]\d{6,14}$/.test(digits)) candidates.push(digits);
        }
      }
    }
    const unique = [...new Set(candidates)];
    return unique.length === 1 ? unique[0] : '';
  } catch (e) {
    return '';
  }
}

function extractPhoneNumberFromDom() {
  function phoneFromDataId(dataId) {
    if (!dataId || typeof dataId !== 'string') return '';
    // Skip outgoing messages (true_) — they contain the logged-in user's own phone number!
    if (/^true_/i.test(dataId) || /_true_/i.test(dataId)) return '';

    // JID match with optional multi-device index: e.g. 919876543210:0@c.us, 919876543210@s.whatsapp.net
    const jidMatch = dataId.match(/(\d{7,15})(?::\d+)?@(s\.whatsapp\.net|c\.us)/);
    if (jidMatch && jidMatch[1]) return jidMatch[1];

    // Message ID prefix match: false_919876543210_... or in_919876543210
    const prefixMatch = dataId.match(/(?:false|in)_(\d{7,15})/i);
    if (prefixMatch && prefixMatch[1]) return prefixMatch[1];

    return '';
  }

  function phoneFromElement(element) {
    const row = element.closest?.('[role="row"], [role="listitem"]') || element;
    let node = element;
    while (node && node.id !== 'pane-side' && node !== document.body) {
      const directPhone = phoneFromDataId(node.getAttribute?.('data-id') || node.getAttribute?.('data-item-id') || node.getAttribute?.('id') || '');
      if (directPhone) return directPhone;
      const childWithId = node.querySelector?.('[data-id], [data-item-id], [id^="msg-"]');
      if (childWithId) {
        const childPhone = phoneFromDataId(childWithId.getAttribute?.('data-id') || childWithId.getAttribute?.('data-item-id') || childWithId.getAttribute?.('id') || '');
        if (childPhone) return childPhone;
      }
      if (node === row) break;
      node = node.parentElement;
    }
    return '';
  }

  // Step 0: A visible number in the active Contact info drawer is the most
  // direct verified source (top profile number or About and phone number).
  const contactInfoPhone = extractPhoneFromContactInfoDrawer();
  if (contactInfoPhone) return contactInfoPhone;

  // Step 1: Active sidebar chat item — data-id, cached attribute, and img src
  try {
    const activeItem =
      document.querySelector('#pane-side [aria-selected="true"]') ||
      document.querySelector('#pane-side [data-selected="true"]') ||
      document.querySelector('#pane-side .active') ||
      document.querySelector('#pane-side li[class*="active"]');

    const headerTitle = document.querySelector('#main header span[title]')?.getAttribute('title');
    const selectedTitle = activeItem?.querySelector('span[title]')?.getAttribute('title');
    if (activeItem && headerTitle && selectedTitle === headerTitle) {
      const activePhone = phoneFromElement(activeItem);
      if (activePhone) {
        activeItem.setAttribute('data-aivastra-phone', activePhone);
        return activePhone;
      }

      const imgs = activeItem.querySelectorAll('img');
      for (const img of imgs) {
        if (img.src) {
          const match = img.src.match(/[?&;]u(?:ser)?(?:%3D|=)(\d{7,15})/i) || img.src.match(/u=(\d{7,15})/);
          if (match && match[1]) {
            activeItem.setAttribute('data-aivastra-phone', match[1]);
            return match[1];
          }
        }
      }

      // span[title] ONLY — and only if the title is purely a phone number (no letters)
      const titleSpans = activeItem.querySelectorAll('span[title]');
      for (const s of titleSpans) {
        const t = (s.getAttribute('title') || '').trim();
        const stripped = t.replace(/[+\s\-()]/g, '');
        if (stripped.length >= 7 && stripped.length <= 15 && /^\d+$/.test(stripped)) {
          return stripped;
        }
      }
    }
  } catch (e) {}

  // Step 1: Match sidebar item by header title
  try {
    const mainTitleEl = document.querySelector('#main header span[title], #main header span[dir="auto"][title], #main header span[dir="auto"]');
    const mainTitle = (mainTitleEl?.getAttribute('title') || mainTitleEl?.textContent || '').trim();
    if (mainTitle) {
      const allRows = document.querySelectorAll('#pane-side [role="listitem"], #pane-side [role="row"], #pane-side div[tabindex]');
      for (const row of allRows) {
        const titleSpan = row.querySelector('span[title], span[dir="auto"]');
        const rTitle = (titleSpan?.getAttribute('title') || titleSpan?.textContent || '').trim();
        if (rTitle && rTitle === mainTitle) {
          const phone = phoneFromElement(row);
          if (phone) {
            row.setAttribute('data-aivastra-phone', phone);
            return phone;
          }

          const imgs = row.querySelectorAll('img');
          for (const img of imgs) {
            if (img.src) {
              const match = img.src.match(/[?&;]u(?:ser)?(?:%3D|=)(\d{7,15})/i) || img.src.match(/u=(\d{7,15})/);
              if (match && match[1]) {
                row.setAttribute('data-aivastra-phone', match[1]);
                return match[1];
              }
            }
          }
        }
      }
    }
  } catch (e) {}

  // Step 2: Header avatar images
  try {
    const mainHeader = document.querySelector('#main header');
    if (mainHeader) {
      const headerImgs = mainHeader.querySelectorAll('img');
      for (const img of headerImgs) {
        if (img.src) {
          const match = img.src.match(/[?&;]u(?:ser)?(?:%3D|=)(\d{7,15})/i) || img.src.match(/u=(\d{7,15})/);
          if (match && match[1]) return match[1];
        }
      }
      // Header span[title] — only if purely numeric (unsaved contact shown as number)
      const headerTitleSpans = mainHeader.querySelectorAll('span[title]');
      for (const s of headerTitleSpans) {
        const t = (s.getAttribute('title') || '').trim();
        const stripped = t.replace(/[+\s\-()]/g, '');
        if (stripped.length >= 7 && stripped.length <= 15 && /^\d+$/.test(stripped)) {
          return stripped;
        }
      }
    }
  } catch (e) {}

  // Step 3: Contact Info drawer (if open)
  try {
    const drawer = findActiveContactInfoDrawer();
    if (drawer) {
      const imgs = drawer.querySelectorAll('img');
      for (const img of imgs) {
        if (img.src) {
          const match = img.src.match(/[?&;]u(?:ser)?(?:%3D|=)(\d{7,15})/i) || img.src.match(/u=(\d{7,15})/);
          if (match && match[1]) return match[1];
        }
      }
      const textNodes = drawer.querySelectorAll('span, div, p, a');
      for (const node of textNodes) {
        if (node.children.length > 0) continue;
        const txt = (node.textContent || '').trim();
        if (/^\+?\d[\d\s\-().]{5,}\d$/.test(txt)) {
          const digits = txt.replace(/\D/g, '');
          if (digits.length >= 7 && digits.length <= 15) {
            return digits;
          }
        }
      }
    }
  } catch (e) {}

  // Step 4: Active chat panel message data-id in #main (INCOMING messages only)
  try {
    const messageElements = document.querySelectorAll(
      '#main div.message-in[data-id], #main div.message-in [data-id], #main [data-id*="false_"]'
    );
    for (const msgEl of messageElements) {
      const dataId = msgEl.getAttribute('data-id') || msgEl.getAttribute('data-item-id') || msgEl.getAttribute('data-msg-id') || msgEl.getAttribute('id') || '';
      if (/^true_/i.test(dataId) || /_true_/i.test(dataId)) continue;
      const phone = phoneFromDataId(dataId);
      if (phone && phone.length >= 7) {
        return phone;
      }
    }
  } catch (e) {}

  // Step 5: Check header subtitle or info text for formatted phone numbers (e.g. +91 98765 43210)
  try {
    const textNodes = document.querySelectorAll('#main header span');
    for (const node of textNodes) {
      const txt = (node.textContent || '').trim();
      if (/^\+?\d[\d\s\-().]{5,}\d$/.test(txt)) {
        const digits = txt.replace(/\D/g, '');
        if (digits.length >= 7 && digits.length <= 15) {
          return digits;
        }
      }
    }
  } catch (e) {}

  return '';
}

function detectActiveContact(force = false) {
  try {
    const mainHeader = document.querySelector('#main header');
    if (!mainHeader) return;

    ensureHeaderButton();

    const spans = Array.from(mainHeader.querySelectorAll('span[title], span[dir="auto"]'));
    let targetTitle = '';
    let targetSpan = null;

    for (const span of spans) {
      const txt = (span.getAttribute('title') || span.textContent || '').trim();
      if (!txt) continue;
      const lower = txt.toLowerCase();
      if (
        lower.includes('last seen') || lower.includes('online') ||
        lower.includes('typing') || lower.includes('click here') ||
        lower.includes('group') || lower.includes('members') ||
        txt === '⚡ AI CRM'
      ) continue;
      targetTitle = txt;
      targetSpan = span;
      break;
    }

    if (!targetTitle) return;

    let domAvatar = '';
    const headerImgs = Array.from(mainHeader.querySelectorAll('div[role="button"] img, header img'));
    for (const img of headerImgs) {
      if (img.src && !img.src.includes('data:image/svg') && !img.src.includes('blob:')) {
        domAvatar = img.src;
        break;
      }
    }

    let cleanDigits = '';
    const isUnsavedTitle = targetTitle.trim().startsWith('+');
    if (isUnsavedTitle) {
      cleanDigits = targetTitle.replace(/\D/g, '');
    }

    if (cleanDigits.length < 7) {
      const domPhone = extractPhoneNumberFromDom();
      if (domPhone && domPhone.length >= 7) {
        cleanDigits = domPhone;
      } else {
        const cachedPhone = findPhoneInCacheByName(targetTitle);
        if (cachedPhone && cachedPhone.length >= 7) {
          cleanDigits = cachedPhone;
        }
      }
    }

    // WhatsApp frequently mounts/unmounts Contact info text while animating or
    // virtualizing the drawer. Never downgrade the same visible chat from its
    // already verified phone identity back to a name identity for one frame.
    if (cleanDigits.length < 7 && activeDisplayName === targetTitle && activePhoneClean.length >= 7) {
      cleanDigits = activePhoneClean;
    }

    const tenDigit = cleanDigits;
    const contactKey = cleanDigits.length >= 7 ? cleanDigits : targetTitle;

    let displayTitle = targetTitle;
    const isNewContact = activeContactKey !== contactKey;
    const isNameChanged = Boolean(displayTitle && activeDisplayName && activeDisplayName !== displayTitle);

    if (isNewContact || force) {
      // Genuinely different contact OR forced retry (phone finally found) — full reload
      activeContactKey = contactKey;
      activeDisplayName = displayTitle;
      activePhoneClean = cleanDigits.length >= 7 ? cleanDigits : '';
      activeAvatarUrl = domAvatar;

      activeFormData = {
        leadStatus: 'UNASSIGNED',
        callStatus: null,
        followUpDate: '',
        previousFollowUpDate: '',
        notesList: [],
        aiDisabled: false
      };

      renderCrmPanel(displayTitle, cleanDigits.length >= 7 ? cleanDigits : '', domAvatar);

      fetchRequestGeneration++;
      fetchCrmMetadata(contactKey, displayTitle, domAvatar, fetchRequestGeneration);

      // Schedule phone-extraction retries AFTER generation is bumped,
      // so they use the CORRECT generation to check against.
      if (cleanDigits.length < 7) {
        syncContactsFromIndexedDb();
        const snapGen = fetchRequestGeneration;
        [200, 600, 1200, 2000, 3000, 5000, 8000, 12000].forEach((delay) => {
          setTimeout(() => {
            if (snapGen !== fetchRequestGeneration) return;
            if (!activePhoneClean) syncContactsFromIndexedDb();
            const retryPhone = extractPhoneNumberFromDom() || findPhoneInCacheByName(targetTitle);
            if (retryPhone && retryPhone.length >= 7 && activePhoneClean !== retryPhone) {
              detectActiveContact(true);
            }
          }, delay);
        });
      }

    } else if (isNameChanged) {
      // SAME contact, name edited — update display only, keep all data intact
      activeDisplayName = displayTitle;
      activePhoneClean = cleanDigits.length >= 7 ? cleanDigits : '';

      renderCrmPanel(displayTitle, activePhoneClean, activeAvatarUrl);

      fetchRequestGeneration++;
      fetchCrmMetadata(contactKey, displayTitle, activeAvatarUrl, fetchRequestGeneration);
    }
  } catch (e) {}
}

function getContactTitleToSync(displayName, verifiedPhone) {
  const title = String(displayName || '').trim();
  const phone = String(verifiedPhone || '').split('@')[0].split(':')[0].replace(/\D/g, '');
  if (!title || !phone || ['.', 'contact', 'unsaved contact', 'unknown contact', 'whatsapp contact'].includes(title.toLowerCase())) return '';
  // A phone-only header may replace a saved name only when it matches the
  // verified active contact. Numeric saved names must otherwise stay exact.
  if (/^\+?[\d\s().-]+$/.test(title)) {
    const digits = title.replace(/\D/g, '');
    const canonical = (p) => p;
    if (digits.length >= 7 && canonical(digits) === canonical(phone)) {
      const full = canonical(phone);
      return full.length === 12 && full.startsWith('91')
        ? `+91 ${full.slice(2, 7)} ${full.slice(7)}` : `+${full}`;
    }
    if (title.startsWith('+')) return '';
  }
  return title;
}

function fetchCrmMetadata(searchKey, displayName, domAvatar, generation) {
  const badNames = ['.', 'contact', 'unsaved contact', 'unknown contact', 'whatsapp contact', ''];
  const isPhoneHeader = displayName && (displayName.trim().startsWith('+') || (activePhoneClean && displayName.replace(/\D/g, '') === activePhoneClean));
  const isValidName = displayName && !badNames.includes(displayName.toLowerCase().trim()) && !isPhoneHeader;

  const searchKeyText = String(searchKey || '').trim();
  const searchKeyDigits = searchKeyText.replace(/\D/g, '');
  const searchKeyLooksLikePhone = /^\+?[\d\s().-]+$/.test(searchKeyText) && searchKeyDigits.length >= 7 && searchKeyDigits.length <= 15;
  // Never interpret digits inside a name-fallback hash (or a contact name) as
  // a phone number.
  const rawClean = activePhoneClean || (searchKeyLooksLikePhone ? searchKeyDigits : '');
  const tenDigit = rawClean;
  // queryPhone MUST be at least 10 digits — short digit strings extracted from
  // contact names (e.g. "1" from "Prashanth 1") must NEVER be used as phone/JID.
  const queryPhone = (activePhoneClean && activePhoneClean.length >= 7) ? activePhoneClean
    : (tenDigit && tenDigit.length >= 7) ? tenDigit : '';
  const fallbackJid = makeNameFallbackJid(displayName);
  const fallbackStorageKey = fallbackJid ? `crm_meta_name_${fallbackJid.split('@')[0]}` : '';

  // Phone keys remain primary. A deterministic, explicitly namespaced fallback
  // is used only when WhatsApp exposes no phone/JID for a valid saved name.
  const storageKeys = [];
  if (activePhoneClean && activePhoneClean.length >= 7) storageKeys.push(`crm_meta_${activePhoneClean}`);
  if (tenDigit && tenDigit.length >= 7 && tenDigit !== activePhoneClean) storageKeys.push(`crm_meta_${tenDigit}`);
  if (searchKeyLooksLikePhone && !storageKeys.includes(`crm_meta_${searchKeyDigits}`)) storageKeys.push(`crm_meta_${searchKeyDigits}`);
  if (fallbackStorageKey) storageKeys.push(fallbackStorageKey);

  safeStorageGet(storageKeys.length > 0 ? storageKeys : ['__noop__'], (s) => {
    // STALE GUARD: discard if user has already switched to a different chat
    if (generation !== fetchRequestGeneration) return;

    s = s || {};
    const validPhoneClean = (activePhoneClean && activePhoneClean.length >= 7) ? activePhoneClean : null;
    const validTenDigit = (tenDigit && tenDigit.length >= 7) ? tenDigit : null;
    const validSearchKey = (searchKey && searchKey.trim() !== '') ? searchKey : null;

    // Prefer phone/JID. Use the isolated name fallback only if no phone exists.
    let localData = (validPhoneClean ? s[`crm_meta_${validPhoneClean}`] : null) ||
      (validTenDigit ? s[`crm_meta_${validTenDigit}`] : null) ||
      (validPhoneClean ? chatsMetadataMap[validPhoneClean] : null) ||
      (validTenDigit ? chatsMetadataMap[validTenDigit] : null) ||
      (validSearchKey && searchKeyLooksLikePhone ? chatsMetadataMap[searchKeyDigits] : null) ||
      (fallbackStorageKey ? s[fallbackStorageKey] : null) ||
      (fallbackJid ? chatsMetadataMap[fallbackJid] : null);

    // Exact phone match only — no suffix/prefix matching to prevent wrong-contact hits
    if (!localData && (validPhoneClean || validTenDigit)) {
      for (const [k, val] of Object.entries(s)) {
        if (k.startsWith('crm_meta_') && val && typeof val === 'object') {
          const valPhone = (val.phone || '').replace(/\D/g, '');
          if (valPhone && (valPhone === validTenDigit || valPhone === validPhoneClean)) {
            localData = val;
            break;
          }
        }
      }
    }

    if (localData) {
      activeFormData = {
        leadStatus: localData.leadStatus || 'UNASSIGNED',
        callStatus: localData.callStatus || null,
        followUpDate: localData.followUpDate || '',
        previousFollowUpDate: localData.previousFollowUpDate || '',
        notesList: parseNotesList(localData.notes, localData.notesList),
        aiDisabled: Boolean(localData.aiDisabled || localData.leadStatus === 'WARM' || localData.leadStatus === 'WARM_INTERESTED')
      };
      // Render verified phone-keyed data immediately; do not leave the panel
      // blank while the server request is pending. The generation guard above
      // prevents another chat's cache from being rendered here.
      renderCrmPanel(activeDisplayName || displayName, activePhoneClean, domAvatar);
    } else {
      activeFormData = {
        leadStatus: 'UNASSIGNED',
        callStatus: null,
        followUpDate: '',
        previousFollowUpDate: '',
        notesList: [],
        aiDisabled: false
      };
    }

    safeSendMessage({ action: 'FETCH_CRM_METADATA', phoneClean: queryPhone, searchKey, displayName, fallbackJid }, (response) => {
      // STALE GUARD: discard if user has already switched to a different chat
      if (generation !== fetchRequestGeneration) return;

      let resolvedAvatar = domAvatar || activeAvatarUrl;

      if (response && response.success && response.chat) {
        const chat = response.chat;
        const canonical = (value) => {
          const p = String(value || '').split('@')[0].split(':')[0].replace(/\D/g, '');
          return p;
        };
        const isExactFallback = Boolean(fallbackJid && chat.jid === fallbackJid);
        if (!isExactFallback && (!queryPhone || canonical(chat.phone || chat.jid) !== canonical(queryPhone))) {
          console.warn('[AI Vastra] Rejected metadata for a different/unverified contact.');
          return;
        }
        const backendHasCrmData = Boolean(chat.manuallySaved ||
          (chat.leadStatus && chat.leadStatus !== 'UNASSIGNED') || chat.callStatus ||
          chat.followUpDate || chat.notes || chat.notesList?.length);
        // After a deliberate server reset, WhatsApp may resynchronize a bare
        // address-book entry. That is not a saved CRM record and must not erase
        // the existing phone-keyed extension data the owner wants to restore.
        if (!backendHasCrmData && localData) {
          activeFormData = {
            ...localData,
            notesList: parseNotesList(localData.notes, localData.notesList),
          };
          renderCrmPanel(activeDisplayName || displayName, activePhoneClean, domAvatar);
          return;
        }
        // Backend is the authoritative source — use backend data directly,
        // fall back to local cache only if backend field is empty/unassigned.
        const backendNotes = parseNotesList(chat.notes, chat.notesList);
        // An existing backend record is authoritative, including deleted notes.
        // Local cache is used only if no backend record exists.
        const mergedNotes = [...backendNotes];

        const bLead = (chat.leadStatus && chat.leadStatus !== 'UNASSIGNED') ? chat.leadStatus : (localData?.leadStatus || 'UNASSIGNED');
        const bCall = (chat.callStatus !== undefined && chat.callStatus !== null) ? chat.callStatus : (localData?.callStatus || null);
        const bFollow = (chat.followUpDate && chat.followUpDate.trim() !== '' && chat.followUpDate !== '—') ? chat.followUpDate : (localData?.followUpDate || '');
        const bPrevFollow = chat.previousFollowUpDate || localData?.previousFollowUpDate || '';

        activeFormData = {
          leadStatus: bLead,
          callStatus: bCall,
          followUpDate: bFollow,
          previousFollowUpDate: bPrevFollow,
          notesList: mergedNotes,
          aiDisabled: Boolean(chat.aiDisabled || chat.leadStatus === 'WARM' || chat.leadStatus === 'WARM_INTERESTED')
        };

        if (!resolvedAvatar && chat.avatarUrl) resolvedAvatar = chat.avatarUrl;

        const currentNameIsValid = displayName && !badNames.includes(displayName.toLowerCase().trim()) && !isPhoneHeader;
        const titleToSync = getContactTitleToSync(displayName, queryPhone);
        const isNameDifferent = Boolean(titleToSync && titleToSync !== (chat.name || '').trim());
        const effectiveDisplayName = titleToSync || chat.name;

        // Auto-sync contact name to backend whenever WhatsApp Web display name changes or is saved
        const chatPhoneDigits = (chat.phone || (chat.jid || '').split('@')[0]).replace(/\D/g, '');
        const reliablePhone = (validPhoneClean && validPhoneClean.length >= 7) ? validPhoneClean
          : (queryPhone && queryPhone.length >= 7) ? queryPhone
          : (chatPhoneDigits.length >= 7 ? chatPhoneDigits : '');

        const reliableJid = reliablePhone
          ? (reliablePhone.endsWith('@s.whatsapp.net') ? reliablePhone : `${reliablePhone}@s.whatsapp.net`)
          : (chat.jid && !chat.jid.startsWith('1@') && (chat.jid.split('@')[0].replace(/\D/g, '').length >= 7) ? chat.jid : '');

        if (isNameDifferent && reliableJid) {
          const updatePayload = {
            jid: reliableJid,
            phone: reliablePhone,
            name: displayName,
            leadStatus: activeFormData.leadStatus,
            callStatus: activeFormData.callStatus,
            followUpDate: activeFormData.followUpDate,
            previousFollowUpDate: activeFormData.previousFollowUpDate,
            notesList: activeFormData.notesList,
            manuallySaved: true,
            updatedAt: chat.updatedAt || 0
          };

          safeSendMessage({ action: 'SYNC_CONTACT_NAME', jid: reliableJid, name: titleToSync }, () => {});
        }

        // If the backend has a verified phone for this chat, bind it to activePhoneClean
        // so any subsequent click on 'Save Contact Info' uses this verified phone!
        if (reliablePhone && reliablePhone.length >= 7) {
          activePhoneClean = reliablePhone;
          if (!activeContactKey || activeContactKey.length < 7 || activeContactKey === displayName) {
            activeContactKey = reliablePhone;
          }
        }

        // Cache ONLY under phone/JID keys — never under display name
        const meta = { ...activeFormData, name: effectiveDisplayName, phone: reliablePhone || validPhoneClean || queryPhone };
        if (reliablePhone) chatsMetadataMap[reliablePhone] = meta;
        if (validPhoneClean) chatsMetadataMap[validPhoneClean] = meta;
        if (validTenDigit && validTenDigit !== validPhoneClean) chatsMetadataMap[validTenDigit] = meta;
        if (queryPhone && queryPhone.length >= 7 && queryPhone !== validPhoneClean) chatsMetadataMap[queryPhone] = meta;
        if (isExactFallback) chatsMetadataMap[fallbackJid] = meta;
      } else if (localData) {
        // No backend record found but we have a valid local cache hit — use it
        activeFormData = {
          leadStatus: localData.leadStatus || 'UNASSIGNED',
          callStatus: localData.callStatus || null,
          followUpDate: localData.followUpDate || '',
          previousFollowUpDate: localData.previousFollowUpDate || '',
          notesList: parseNotesList(localData.notes, localData.notesList),
          aiDisabled: Boolean(localData.aiDisabled)
        };
      } else {
        // No data found anywhere — likely we couldn't extract phone from a saved contact.
        // The DOM might not be fully rendered yet. Schedule a delayed retry so that
        // detectActiveContact can re-extract the phone from data-id attributes.
        if (!validPhoneClean && !validTenDigit) {
          setTimeout(() => {
            if (generation !== fetchRequestGeneration) return;
            const retryPhone = extractPhoneNumberFromDom() || findPhoneInCacheByName(displayName);
            if (retryPhone && retryPhone.length >= 7) {
              // Phone is now available! Re-run the full detection which will
              // use the phone as contactKey and load data correctly.
              detectActiveContact(true);
            }
          }, 1500);
        }
      }

      activeAvatarUrl = resolvedAvatar;
      renderCrmPanel(activeDisplayName || displayName, activePhoneClean, resolvedAvatar);
      injectChatListBadges();
    });
  });
}

function saveCrmMetadata(forcedAiDisabled, retryCount = 0, expectedGeneration = fetchRequestGeneration) {
  if (expectedGeneration !== fetchRequestGeneration) return;
  const saveGeneration = fetchRequestGeneration;
  const header = document.querySelector('#main header');
  const title = Array.from(header?.querySelectorAll('span[title], span[dir="auto"]') || [])
    .map((span) => (span.getAttribute('title') || span.textContent || '').trim())
    .find((value) => value && !/last seen|online|typing|click here|group|members/i.test(value) && value !== '⚡ AI CRM');
  if (!title || title !== activeDisplayName) {
    detectActiveContact(true);
    alert('The chat changed. Wait for this contact\'s data to load before saving.');
    return;
  }
  // Normal CRM saves stop AI; the toggle passes an explicit state in either direction.
  activeFormData.aiDisabled = forcedAiDisabled !== undefined ? forcedAiDisabled : true;

  let domPhone = extractPhoneNumberFromDom();
  if (!domPhone || domPhone.length < 7) {
    domPhone = findPhoneInCacheByName(activeDisplayName) || findPhoneInCacheByName(activeContactKey);
  }
  const canonical = (p) => {
    const value = String(p || '').replace(/\D/g, '');
    return value;
  };
  if (domPhone && activePhoneClean && canonical(domPhone) !== canonical(activePhoneClean)) {
    alert('The detected phone differs from the loaded contact. Save blocked to protect both records.');
    return;
  }

  let cleanDigits = domPhone ? domPhone.replace(/\D/g, '') : '';
  if (cleanDigits.length < 7 && activePhoneClean && activePhoneClean.length >= 7) {
    cleanDigits = activePhoneClean;
  }
  if (cleanDigits.length < 7 && activeDisplayName && activeDisplayName.trim().startsWith('+')) {
    const pDigits = activeDisplayName.replace(/\D/g, '');
    if (pDigits.length >= 7) cleanDigits = pDigits;
  }

  const tenDigit = cleanDigits;

  const validPhone = (cleanDigits && cleanDigits.length >= 7) ? cleanDigits : (activePhoneClean && activePhoneClean.length >= 7 ? activePhoneClean : '');

  // Use phone number as display name fallback if name is invalid.
  const badNames = ['.', 'contact', 'unsaved contact', 'unknown contact', 'whatsapp contact', ''];
  const effectiveName = (!activeDisplayName || badNames.includes(activeDisplayName.toLowerCase().trim()))
    ? (cleanDigits || activeContactKey)
    : activeDisplayName.trim();

  // Guard: if phone is still missing, attempt emergency extraction from Contact Info drawer
  if (!validPhone && retryCount < 6) {
    pendingPhoneSaveGeneration = saveGeneration;
    syncContactsFromIndexedDb();
    const titleEl = document.querySelector('#main header span[title]');
    const headerEl = titleEl?.closest('[role="button"]') || titleEl;
    if (headerEl || findActiveContactInfoDrawer()) {
      // Open once, then wait for WhatsApp to render. Repeated clicks used to
      // close/toggle the drawer before its phone number became available.
      if (retryCount === 0 && !findActiveContactInfoDrawer()) headerEl?.click();
      setTimeout(() => {
        saveCrmMetadata(forcedAiDisabled, retryCount + 1, saveGeneration);
      }, 500);
      return;
    }
  }

  const contactKeyDigits = (activeContactKey || '').replace(/\D/g, '');
  let targetJid = '';
  let fallbackJid = '';
  if (validPhone) {
    pendingPhoneSaveGeneration = null;
    targetJid = `${validPhone}@s.whatsapp.net`;
  } else {
    pendingPhoneSaveGeneration = null;
    fallbackJid = makeNameFallbackJid(effectiveName);
    if (!fallbackJid) {
      console.warn('[AI Vastra] Cannot determine a valid phone or saved-name identity for this contact.');
      alert('Not saved to CRM: this contact has neither a verified phone number nor a valid saved contact name. Your form data has not been cleared.');
      return;
    }
    targetJid = fallbackJid;
  }

  // Update activePhoneClean cache ONLY if valid 10+ digit phone belongs to this chat
  if (validPhone) activePhoneClean = validPhone;

  const metaObj = { ...activeFormData, name: effectiveName, phone: validPhone || '' };

  // Save ONLY under phone-number keys — never under display name to prevent cross-contact collisions
  const saveKeys = {};
  if (cleanDigits.length >= 7) {
    saveKeys[`crm_meta_${cleanDigits}`] = metaObj;
    if (tenDigit && tenDigit !== cleanDigits) saveKeys[`crm_meta_${tenDigit}`] = metaObj;
    if (activePhoneClean && activePhoneClean !== cleanDigits) saveKeys[`crm_meta_${activePhoneClean}`] = metaObj;
  } else if (activeContactKey) {
    // Fallback: only store if key looks like a phone number
    const ckDigits = activeContactKey.replace(/\D/g, '');
    if (ckDigits.length >= 7) saveKeys[`crm_meta_${ckDigits}`] = metaObj;
  }
  if (fallbackJid) saveKeys[`crm_meta_name_${fallbackJid.split('@')[0]}`] = metaObj;

  console.log('[AI Vastra] Saving metadata for phone:', cleanDigits || activeContactKey);
  safeStorageSet(saveKeys);

  // In-memory map: phone/JID keys only
  if (cleanDigits.length >= 7) chatsMetadataMap[cleanDigits] = metaObj;
  if (tenDigit && tenDigit !== cleanDigits) chatsMetadataMap[tenDigit] = metaObj;
  if (activePhoneClean && activePhoneClean !== cleanDigits) chatsMetadataMap[activePhoneClean] = metaObj;
  if (fallbackJid) chatsMetadataMap[fallbackJid] = metaObj;

  const payload = {
    jid: targetJid,
    name: effectiveName,
    phone: validPhone || '',
    identityType: fallbackJid ? 'NAME_FALLBACK' : 'PHONE',
    leadStatus: activeFormData.leadStatus,
    callStatus: activeFormData.callStatus,
    followUpDate: activeFormData.followUpDate || undefined,
    assignedUser: activeFormData.assignedUser,
    calledBy: activeFormData.assignedUser,
    clientLanguage: activeFormData.clientLanguage,
    language: activeFormData.clientLanguage,
    notes: activeFormData.notesList.join('\n\n'),
    notesList: activeFormData.notesList,
    aiDisabled: activeFormData.aiDisabled,
    isAutoWarm: false,
    manuallySaved: true,
    updatedAt: Date.now(),
  };

  // One transport, one immutable payload; a late save must not reload another chat.
  safeSendMessage({ action: 'UPDATE_CRM_METADATA', jid: targetJid, data: payload }, (response) => {
    if (saveGeneration !== fetchRequestGeneration) return;
    console.log('[AI Vastra Extension] Background save response:', response);
    if (response?.success) {
      fetchRequestGeneration++;
      fetchCrmMetadata(targetJid, effectiveName, activeAvatarUrl, fetchRequestGeneration);
    } else {
      alert('CRM save failed. Your local data is preserved; please do not save other contacts yet.');
    }
  });

  injectChatListBadges();
}

function renderCrmPanel(displayName, cleanPhone, avatarUrl, showSaveToast = false) {
  const panel = ensureCrmPanel();
  panel.style.display = isPanelVisible ? 'flex' : 'none';

  const badNames = ['.', 'contact', 'unsaved contact', 'unknown contact', 'whatsapp contact', ''];
  const digitsInName = (displayName || '').replace(/\D/g, '');

  let formattedPhone = '';
  if (cleanPhone && cleanPhone.length >= 7) {
    if (cleanPhone.length === 12 && cleanPhone.startsWith('91')) {
      formattedPhone = `+91 ${cleanPhone.slice(2, 7)} ${cleanPhone.slice(7)}`;

    } else {
      formattedPhone = `+${cleanPhone}`;
    }
  } else if (digitsInName.length >= 7) {
    if (digitsInName.length === 12 && digitsInName.startsWith('91')) {
      formattedPhone = `+91 ${digitsInName.slice(2, 7)} ${digitsInName.slice(7)}`;

    } else {
      formattedPhone = `+${digitsInName}`;
    }
  }

  const cleanDigitsOfName = (displayName || '').replace(/\D/g, '');
  const cleanDigitsOfPhone = (cleanPhone || '').replace(/\D/g, '');
  const isPhoneNumberTitle = (displayName && displayName.trim().startsWith('+')) || (cleanDigitsOfName && cleanDigitsOfPhone && cleanDigitsOfName === cleanDigitsOfPhone);
  const isSavedContact = Boolean(displayName && !badNames.includes(displayName.toLowerCase().trim()) && !isPhoneNumberTitle);

  const displayTitle = isSavedContact
    ? displayName
    : (formattedPhone || displayName || cleanPhone || 'WhatsApp Contact');

  const avatarInitial = (displayTitle || '?').replace(/^[^a-zA-Z0-9]/, '').charAt(0).toUpperCase() || '?';

  // Use a stable contact initial only. WhatsApp avatar URLs can be stale and
  // previously caused one chat's profile image to appear on another contact.
  const avatarHtml = `<div class="aivastra-avatar-circle">${avatarInitial}</div>`;

  panel.innerHTML = `
    <div class="aivastra-header">
      <div style="display:flex;align-items:center;gap:6px;">
        <span style="color:#00a884;font-size:16px;">⚡</span>
        <span>Contact Info</span>
      </div>
      <div style="display:flex;align-items:center;gap:6px;">
        <button id="aivastra-clear-btn" class="aivastra-clear-btn" title="Clear all CRM data for this contact" style="
          background:#fee2e2;color:#dc2626;border:1px solid #fecaca;
          border-radius:6px;padding:3px 8px;font-size:11px;font-weight:700;
          cursor:pointer;display:flex;align-items:center;gap:3px;
        ">🧹 Clear</button>
        <button id="aivastra-close-btn" class="aivastra-close-btn">✕</button>
      </div>
    </div>

    <div id="aivastra-save-toast" class="aivastra-toast" style="display:${showSaveToast ? 'block' : 'none'};background:${showSaveToast === 'CLEARED' ? '#ef4444' : '#00a884'};">
      ${showSaveToast === 'CLEARED' ? '🗑️ Contact CRM data cleared!' : '✓ Contact info saved successfully!'}
    </div>

    <div class="aivastra-body">
      <div class="aivastra-card" style="justify-content:center;padding:12px 14px;">
        <div class="aivastra-contact-name" style="font-size:15px;font-weight:800;color:#111b21;text-align:center;">${displayTitle}</div>
      </div>

      <div>
        <div class="aivastra-section-title">CALL</div>
        <div class="aivastra-btn-group-2">
          <button id="btn-call-yes" class="aivastra-btn ${activeFormData.callStatus === 'YES' ? 'active-call-yes' : ''}">Yes</button>
          <button id="btn-call-no" class="aivastra-btn ${activeFormData.callStatus === 'NO' ? 'active-call-no' : ''}">No</button>
        </div>
      </div>

      <div>
        <div class="aivastra-section-title">LEAD STATUS</div>
        <div class="aivastra-btn-group" style="display:flex;gap:4px;">
          <button id="btn-interested" class="aivastra-btn ${activeFormData.leadStatus === 'INTERESTED' ? 'active-interested' : ''}" style="flex:1;">👍 Interested</button>
          <button id="btn-warm" class="aivastra-btn ${(activeFormData.leadStatus === 'WARM' || activeFormData.leadStatus === 'WARM_INTERESTED') ? 'active-warm' : ''}" style="flex:1;">🔥 Warm</button>
          <button id="btn-not-interested" class="aivastra-btn ${activeFormData.leadStatus === 'NOT_INTERESTED' ? 'active-not-interested' : ''}" style="flex:1;">👎 Not Interested</button>
        </div>
      </div>

      <div>
        <div class="aivastra-section-title">FOLLOW-UP SCHEDULE</div>
        <input type="date" id="aivastra-followup-date" class="aivastra-date-input" value="${formatDateToIso(activeFormData.followUpDate)}" />
        ${activeFormData.previousFollowUpDate && activeFormData.previousFollowUpDate !== activeFormData.followUpDate ? `
          <div style="margin-top: 4px; font-size: 11px; font-weight: 600; color: #71717a;">
            Forwarded from: <span style="color: #18181b;">📅 ${activeFormData.previousFollowUpDate}</span>
          </div>
        ` : ''}
      </div>

      <div style="display:flex;flex-direction:column;flex:1;">
        <div class="aivastra-section-title">CRM NOTES</div>
        <textarea id="aivastra-note-text" class="aivastra-notes-area" rows="3" style="min-height:80px;" placeholder="Add key note about customer requirements..."></textarea>
        <button id="aivastra-add-note-btn" class="aivastra-add-note-btn">+ Add Note</button>
        <div id="aivastra-notes-list" style="margin-top:10px;max-height:140px;overflow-y:auto;">
          ${activeFormData.notesList.map((n, i) => `
            <div class="aivastra-note-item" style="display:flex;align-items:flex-start;gap:6px;padding:7px 10px;background:#f7f7f7;border-radius:8px;margin-bottom:6px;border:1px solid #e5e5e5;">
              <span style="flex:1;word-break:break-word;font-size:12px;line-height:1.5;color:#111;">${i + 1}. ${n}</span>
              <button data-note-index="${i}" class="aivastra-delete-note-btn" title="Delete this note" style="
                background:none;border:none;cursor:pointer;padding:2px 4px;
                color:#cc0000;font-size:15px;flex-shrink:0;line-height:1;
                border-radius:4px;transition:background 0.15s;
              ">🗑️</button>
            </div>
          `).join('')}
        </div>
      </div>

      <div style="margin-top:auto;padding-top:8px;">
        <button id="aivastra-save-main-btn" class="aivastra-save-btn">💾 Save Contact Info</button>
      </div>
    </div>
  `;

  if (showSaveToast) {
    setTimeout(() => {
      const toast = document.getElementById('aivastra-save-toast');
      if (toast) toast.style.display = 'none';
    }, 2000);
  }

  document.getElementById('aivastra-close-btn').onclick = () => {
    isPanelVisible = false;
    panel.style.display = 'none';
  };


function showExtensionConfirmModal(title, message, onConfirm) {
  const existingModal = document.getElementById('aivastra-custom-confirm-modal');
  if (existingModal) existingModal.remove();

  const modalOverlay = document.createElement('div');
  modalOverlay.id = 'aivastra-custom-confirm-modal';
  modalOverlay.style.cssText = `
    position: fixed; inset: 0; z-index: 999999;
    background: rgba(0, 0, 0, 0.6); backdrop-filter: blur(2px);
    display: flex; align-items: center; justify-content: center; padding: 16px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  `;

  modalOverlay.innerHTML = `
    <div style="
      background: #ffffff; width: 100%; max-width: 340px; border-radius: 18px;
      padding: 22px; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.15), 0 10px 10px -5px rgba(0, 0, 0, 0.05);
      text-align: center; border: 1px solid #e5e7eb;
    ">
      <div style="
        width: 44px; height: 44px; border-radius: 50%; background: #ffeef0;
        color: #e53935; display: flex; align-items: center; justify-content: center;
        margin: 0 auto 12px; font-size: 20px; font-weight: bold;
      ">🧹</div>
      <h3 style="font-size: 16px; font-weight: 800; color: #111b21; margin: 0 0 6px;">${title}</h3>
      <p style="font-size: 12px; color: #667781; line-height: 1.5; margin: 0 0 18px;">${message}</p>
      <div style="display: flex; gap: 10px; justify-content: center;">
        <button id="aivastra-modal-cancel-btn" style="
          flex: 1; padding: 9px 12px; background: #f0f2f5; color: #111b21;
          border: 1px solid #e9edef; border-radius: 10px; font-size: 12px;
          font-weight: 700; cursor: pointer;
        ">Cancel</button>
        <button id="aivastra-modal-confirm-btn" style="
          flex: 1; padding: 9px 12px; background: #dc2626; color: #ffffff;
          border: none; border-radius: 10px; font-size: 12px;
          font-weight: 700; cursor: pointer;
        ">Yes, Clear</button>
      </div>
    </div>
  `;

  document.body.appendChild(modalOverlay);

  document.getElementById('aivastra-modal-cancel-btn').onclick = () => {
    modalOverlay.remove();
  };

  document.getElementById('aivastra-modal-confirm-btn').onclick = () => {
    modalOverlay.remove();
    onConfirm();
  };
}

  document.getElementById('aivastra-clear-btn').onclick = () => {
    showExtensionConfirmModal(
      'Clear Contact Data?',
      'Are you sure you want to clear all CRM data for this contact? This will remove the row from the CRM dashboard and archive the data.',
      () => {
        executeClearData();
      }
    );
  };

  function executeClearData() {
    let cleanDigits = (activePhoneClean || activeContactKey).replace(/\D/g, '');
    if (!activePhoneClean || activePhoneClean.length < 7) cleanDigits = '';
    const tenDigit = cleanDigits;
    const fallbackJid = makeNameFallbackJid(activeDisplayName);

    const targetJid = cleanDigits.length >= 7
      ? `${cleanDigits}@s.whatsapp.net`
      : fallbackJid;

    // 1. Reset in-memory form data
    activeFormData = {
      leadStatus: 'UNASSIGNED',
      callStatus: null,
      followUpDate: '',
      notesList: []
    };

    // 2. Remove from local storage cache
    const keysToRemove = [`crm_meta_${cleanDigits}`, `crm_meta_${tenDigit}`, `crm_meta_${activeContactKey}`];
    if (activePhoneClean) keysToRemove.push(`crm_meta_${activePhoneClean}`);
    if (activeDisplayName) keysToRemove.push(`crm_meta_${activeDisplayName}`);
    if (fallbackJid) keysToRemove.push(`crm_meta_name_${fallbackJid.split('@')[0]}`);
    safeStorageRemove(keysToRemove);

    safeStorageGet(null, (stored) => {
      const s = stored || {};
      const extraKeys = [];
      for (const [k, val] of Object.entries(s)) {
        if (k.startsWith('crm_meta_')) {
          if (
            (cleanDigits && k.includes(cleanDigits)) ||
            (tenDigit && k.includes(tenDigit)) ||
            (activeDisplayName && k.toLowerCase().includes(activeDisplayName.toLowerCase())) ||
            (val && val.name && activeDisplayName && val.name.toLowerCase().trim() === activeDisplayName.toLowerCase().trim()) ||
            (val && val.phone && cleanDigits && val.phone.includes(cleanDigits))
          ) {
            extraKeys.push(k);
          }
        }
      }
      if (extraKeys.length > 0) safeStorageRemove(extraKeys);
    });

    // 3. Remove from memory metadata map
    delete chatsMetadataMap[cleanDigits];
    delete chatsMetadataMap[tenDigit];
    delete chatsMetadataMap[activePhoneClean];
    delete chatsMetadataMap[activeDisplayName];
    delete chatsMetadataMap[activeContactKey];
    if (fallbackJid) delete chatsMetadataMap[fallbackJid];

    // 4. Send delete request to CRM backend
    try {
      if (targetJid) fetch(`${DEFAULT_API_BASE}/api/chats/${encodeURIComponent(targetJid)}`, { method: 'DELETE' }).catch(() => {});
      fetch(`${DEFAULT_API_BASE}/api/crm/contact/clear`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jid: targetJid, phone: cleanDigits, name: activeDisplayName, threadId: fallbackJid && fallbackJid !== targetJid ? fallbackJid : '' })
      }).catch(() => {});
    } catch (e) {}

    safeSendMessage({ action: 'CLEAR_CRM_METADATA', jid: targetJid, phone: cleanDigits, fallbackJid }, (response) => {
      console.log('[AI Vastra Extension] Clear response:', response);
    });

    const displayTitle = activeDisplayName || activeContactKey;
    renderCrmPanel(displayTitle, activePhoneClean, activeAvatarUrl, 'CLEARED');
    injectChatListBadges();
  }

  document.getElementById('btn-call-yes').onclick = () => { activeFormData.callStatus = 'YES'; renderCrmPanel(displayName, cleanPhone, avatarUrl); };
  document.getElementById('btn-call-no').onclick = () => { activeFormData.callStatus = 'NO'; renderCrmPanel(displayName, cleanPhone, avatarUrl); };
  document.getElementById('btn-interested').onclick = () => { activeFormData.leadStatus = 'INTERESTED'; renderCrmPanel(displayName, cleanPhone, avatarUrl); };
  document.getElementById('btn-warm').onclick = () => { activeFormData.leadStatus = 'WARM'; activeFormData.aiDisabled = true; renderCrmPanel(displayName, cleanPhone, avatarUrl); };
  document.getElementById('btn-not-interested').onclick = () => { activeFormData.leadStatus = 'NOT_INTERESTED'; renderCrmPanel(displayName, cleanPhone, avatarUrl); };
  document.getElementById('aivastra-followup-date').onchange = (e) => { activeFormData.followUpDate = e.target.value; };
  document.getElementById('aivastra-add-note-btn').onclick = () => {
    const bdmEl = document.getElementById('aivastra-bdm-user');
    const langEl = document.getElementById('aivastra-language');
    if (bdmEl) activeFormData.assignedUser = bdmEl.value;
    if (langEl) activeFormData.clientLanguage = langEl.value;

    const txt = document.getElementById('aivastra-note-text').value.trim();
    if (txt) {
      const hasDateInText = /\b\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}\b/.test(txt) || (txt.includes('(') && txt.includes(')'));
      const formatted = hasDateInText ? txt : `${txt} (${getTodayFormattedDate()})`;
      activeFormData.notesList.unshift(formatted);
      document.getElementById('aivastra-note-text').value = '';

      // Append directly to DOM notes container without re-rendering panel HTML
      const listEl = document.getElementById('aivastra-notes-list');
      if (listEl) {
        const item = document.createElement('div');
        item.className = 'aivastra-note-item';
        item.style.cssText = 'display:flex;align-items:flex-start;gap:6px;padding:7px 10px;background:#f7f7f7;border-radius:8px;margin-bottom:6px;border:1px solid #e5e5e5;';
        item.innerHTML = `
          <span style="flex:1;word-break:break-word;font-size:12px;line-height:1.5;color:#111;">1. ${formatted}</span>
          <button class="aivastra-delete-note-btn" title="Delete this note" style="background:none;border:none;cursor:pointer;padding:2px 4px;color:#cc0000;font-size:15px;flex-shrink:0;line-height:1;border-radius:4px;">🗑️</button>
        `;
        const delBtn = item.querySelector('.aivastra-delete-note-btn');
        if (delBtn) {
          delBtn.onclick = (e) => {
            e.stopPropagation();
            const idx = activeFormData.notesList.indexOf(formatted);
            if (idx !== -1) activeFormData.notesList.splice(idx, 1);
            item.remove();
          };
        }
        listEl.prepend(item);
      }
    }
  };
  document.getElementById('aivastra-save-main-btn').onclick = () => {
    const txt = document.getElementById('aivastra-note-text').value.trim();
    if (txt) {
      const hasDateInText = /\b\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}\b/.test(txt) || (txt.includes('(') && txt.includes(')'));
      const formatted = hasDateInText ? txt : `${txt} (${getTodayFormattedDate()})`;
      activeFormData.notesList.unshift(formatted);
      document.getElementById('aivastra-note-text').value = '';
    }
    saveCrmMetadata();
    renderCrmPanel(displayName, cleanPhone, avatarUrl, true);
  };

  // Dustbin delete buttons — one per saved note
  document.querySelectorAll('.aivastra-delete-note-btn').forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.getAttribute('data-note-index'), 10);
      if (!isNaN(idx) && idx >= 0 && idx < activeFormData.notesList.length) {
        activeFormData.notesList.splice(idx, 1);
        saveCrmMetadata();
        renderCrmPanel(displayName, cleanPhone, avatarUrl);
      }
    };
  });
}

function getTodayFormattedDate() {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

function getTodayYyyyMmDd() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function formatDateToIso(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return '';
  const clean = dateStr.trim();
  const dmY = clean.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmY) {
    const dd = dmY[1].padStart(2, '0');
    const mm = dmY[2].padStart(2, '0');
    const yyyy = dmY[3];
    return `${yyyy}-${mm}-${dd}`;
  }
  const yMd = clean.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (yMd) {
    const yyyy = yMd[1];
    const mm = yMd[2].padStart(2, '0');
    const dd = yMd[3].padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
  return '';
}

function parseNotesList(rawNotes, rawList) {
  let list = [];
  if (Array.isArray(rawList)) {
    list = [...rawList];
  } else if (typeof rawList === 'string' && rawList.trim().startsWith('[')) {
    try {
      const parsed = JSON.parse(rawList);
      if (Array.isArray(parsed)) list = parsed;
    } catch (e) {}
  }
  if (list.length === 0 && rawNotes && typeof rawNotes === 'string' && rawNotes.trim() !== '') {
    list = [rawNotes.trim()];
  }
  return list.map(n => (typeof n === 'string' ? n : (n?.text || ''))).filter(Boolean);
}

// Start
setTimeout(() => {
  try {
    const existingPill = document.getElementById('aivastra-crm-filter-pill');
    if (existingPill) existingPill.remove();
    ensureHeaderButton();
    syncAllCrmChats();
    detectActiveContact();
    injectChatListBadges();
    startChatObserver();

    // Periodically refresh metadata in background every 20s
    setInterval(() => {
      syncAllCrmChats();
    }, 20000);
  } catch (e) {}
}, 1000);
