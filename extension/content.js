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
  // First load locally cached names instantly
  safeStorageGet(['crm_name_cache'], (res) => {
    const localCache = res?.crm_name_cache || {};
    for (const [phoneKey, cachedName] of Object.entries(localCache)) {
      if (cachedName && phoneKey) {
        const cleanK = phoneKey.replace(/\D/g, '');
        const tenK = (cleanK.length === 12 && cleanK.startsWith('91')) ? cleanK.slice(2) : cleanK;
        const entry = { ...(chatsMetadataMap[cleanK] || chatsMetadataMap[tenK] || { leadStatus: 'UNASSIGNED', callStatus: null, followUpDate: '', notesList: [] }), name: cachedName, phone: cleanK };
        if (cleanK) chatsMetadataMap[cleanK] = entry;
        if (tenK) chatsMetadataMap[tenK] = entry;
      }
    }

    safeSendMessage({ action: 'FETCH_ALL_CRM_CHATS' }, (response) => {
      if (response && response.success && Array.isArray(response.chats)) {
        for (const c of response.chats) {
          const rawNum = (c.phone || c.jid || '').split('@')[0].replace(/\D/g, '');
          const tenDigit = (rawNum.length === 12 && rawNum.startsWith('91')) ? rawNum.slice(2) : rawNum;

          const badNames = ['.', 'contact', 'unsaved contact', 'unknown contact', 'whatsapp contact', ''];
          const hasValidName = Boolean(c.name && c.name.trim() && !badNames.includes(c.name.trim().toLowerCase()) && c.name.trim().replace(/\D/g, '').length < 10);


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
            if (tenDigit) chatsMetadataMap[tenDigit] = meta;
            if (rawNum) chatsMetadataMap[rawNum] = meta;
            if (c.jid) chatsMetadataMap[c.jid] = meta;
            if (c.name && hasValidName) {
              chatsMetadataMap[c.name.trim()] = meta;
              chatsMetadataMap[c.name.trim().toLowerCase()] = meta;
            }
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
        if (parsed.length >= 10) {
          cleanDigits = parsed;
          item.setAttribute('data-aivastra-phone', cleanDigits);
        }
      }

      const tenDigit = (cleanDigits.length === 12 && cleanDigits.startsWith('91')) ? cleanDigits.slice(2) : cleanDigits;
      const key = cleanDigits.length >= 10 ? cleanDigits : rawText;
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

  observer.observe(document.body, { childList: true, subtree: true });
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

function extractPhoneNumberFromDom() {
  function phoneFromDataId(dataId) {
    if (!dataId) return '';
    const match = dataId.match(/(\d{10,15})@s\.whatsapp\.net/);
    return match?.[1] || '';
  }

  function phoneFromElement(element) {
    let node = element;
    while (node && node.id !== 'pane-side') {
      const directPhone = phoneFromDataId(node.getAttribute?.('data-id') || '');
      if (directPhone) return directPhone;

      const childWithId = node.querySelector?.('[data-id]');
      const childPhone = phoneFromDataId(childWithId?.getAttribute('data-id') || '');
      if (childPhone) return childPhone;
      node = node.parentElement;
    }
    return '';
  }

  // 0. Resolve only the active chat. Never use the first arbitrary data-id in the list.
  try {
    const activeItem =
      document.querySelector('#pane-side [aria-selected="true"]') ||
      document.querySelector('#pane-side [data-selected="true"]') ||
      document.querySelector('#pane-side .active') ||
      document.querySelector('#pane-side li[class*="active"]');
    if (activeItem) {
      const cachedPhone = activeItem.getAttribute('data-aivastra-phone');
      if (cachedPhone && cachedPhone.length >= 10) return cachedPhone;

      const activePhone = phoneFromElement(activeItem);
      if (activePhone) return activePhone;

      const imgs = activeItem.querySelectorAll('img');
      for (const img of imgs) {
        if (img.src) {
          const match = img.src.match(/u=(\d{10,15})/);
          if (match && match[1]) return match[1];
        }
      }

      const itemSpans = activeItem.querySelectorAll('span');
      for (const s of itemSpans) {
        const t = (s.getAttribute('title') || s.textContent || '').trim();
        const digits = t.replace(/\D/g, '');
        if (digits.length >= 10 && digits.length <= 15 && /^[1-9]/.test(digits)) {
          return digits;
        }
      }
    }
  } catch (e) {}

  // 1. Try all chat list items matching by title/name then grab their data-id
  try {
    const allItems = document.querySelectorAll('#pane-side [data-id]');
    const mainTitle = (document.querySelector('#main header span[dir="auto"]')?.textContent || '').trim();
    if (mainTitle) {
      for (const item of allItems) {
        const spans = item.querySelectorAll('span');
        for (const sp of spans) {
          const t = (sp.getAttribute('title') || sp.textContent || '').trim();
          if (t === mainTitle) {
            const dataId = item.getAttribute('data-id') || '';
            const m = dataId.match(/(\d{10,15})@s\.whatsapp\.net/);
            if (m && m[1]) return m[1];
          }
        }
      }
    }
  } catch (e) {}

  // 2. Check main chat header & subtitle & avatar images
  try {
    const mainHeader = document.querySelector('#main header');
    if (mainHeader) {
      const headerImgs = mainHeader.querySelectorAll('img');
      for (const img of headerImgs) {
        if (img.src) {
          const match = img.src.match(/u=(\d{10,15})/);
          if (match && match[1]) return match[1];
        }
      }

      const headerSpans = mainHeader.querySelectorAll('span');
      for (const s of headerSpans) {
        const t = (s.getAttribute('title') || s.textContent || '').trim();
        const digits = t.replace(/\D/g, '');
        if (digits.length >= 10 && digits.length <= 15 && /^[1-9]/.test(digits)) {
          return digits;
        }
      }
    }
  } catch (e) {}

  // 3. Check Contact Info drawer if open
  try {
    const drawer = document.querySelector('[role="region"], [data-testid="contact-info-drawer"]');
    if (drawer) {
      const imgs = drawer.querySelectorAll('img');
      for (const img of imgs) {
        if (img.src) {
          const match = img.src.match(/u=(\d{10,15})/);
          if (match && match[1]) return match[1];
        }
      }

      const spans = drawer.querySelectorAll('span');
      for (const s of spans) {
        const t = (s.getAttribute('title') || s.textContent || '').trim();
        const digits = t.replace(/\D/g, '');
        if (digits.length >= 10 && digits.length <= 15 && /^[1-9]/.test(digits)) {
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

    let cleanDigits = targetTitle.replace(/\D/g, '');
    if (cleanDigits.length < 10) {
      const domPhone = extractPhoneNumberFromDom();
      if (domPhone && domPhone.length >= 10) {
        cleanDigits = domPhone;
      }
    }

    const tenDigit = (cleanDigits.length === 12 && cleanDigits.startsWith('91')) ? cleanDigits.slice(2) : cleanDigits;
    const contactKey = cleanDigits.length >= 10 ? cleanDigits : targetTitle;

    let displayTitle = targetTitle;
    const isNewContact = activeContactKey !== contactKey;
    const isNameChanged = Boolean(displayTitle && activeDisplayName !== displayTitle);

    if (isNewContact || isNameChanged || force) {
      activeContactKey = contactKey;
      activeDisplayName = displayTitle;
      activePhoneClean = cleanDigits.length >= 10 ? cleanDigits : '';
      activeAvatarUrl = domAvatar;

      // Reset active form data immediately to prevent cross-chat data bleeding
      activeFormData = {
        leadStatus: 'UNASSIGNED',
        callStatus: null,
        followUpDate: '',
        previousFollowUpDate: '',
        notesList: [],
        aiDisabled: false
      };

      fetchCrmMetadata(contactKey, displayTitle, domAvatar);
    }
  } catch (e) {}
}

function fetchCrmMetadata(searchKey, displayName, domAvatar) {
  const requestId = ++metadataRequestId;
  const badNames = ['.', 'contact', 'unsaved contact', 'unknown contact', 'whatsapp contact', ''];
  const isValidName = displayName && !badNames.includes(displayName.toLowerCase().trim()) && displayName.replace(/\D/g, '').length < 10;

  const rawClean = (activePhoneClean || searchKey || '').replace(/\D/g, '');
  const tenDigit = (rawClean.length === 12 && rawClean.startsWith('91')) ? rawClean.slice(2) : rawClean;
  const queryPhone = (activePhoneClean || tenDigit || '').replace(/\D/g, '');

  const storageKeys = [`crm_meta_${searchKey}`];
  if (activePhoneClean) storageKeys.push(`crm_meta_${activePhoneClean}`);
  if (tenDigit) storageKeys.push(`crm_meta_${tenDigit}`);
  safeStorageGet(storageKeys, (s) => {
    if (requestId !== metadataRequestId) return;
    s = s || {};
    const validSearchKey = (searchKey && searchKey.trim() !== '') ? searchKey : null;
    const validPhoneClean = (activePhoneClean && activePhoneClean.length >= 10) ? activePhoneClean : null;
    const validTenDigit = (tenDigit && tenDigit.length >= 10) ? tenDigit : null;

    let localData = (validSearchKey ? s[`crm_meta_${validSearchKey}`] : null) ||
      (validPhoneClean ? s[`crm_meta_${validPhoneClean}`] : null) ||
      (validTenDigit ? s[`crm_meta_${validTenDigit}`] : null) ||
      (isValidName ? s[`crm_meta_${displayName}`] : null) ||
      (isValidName ? s[`crm_meta_${displayName.toLowerCase().trim()}`] : null) ||
      (isValidName ? chatsMetadataMap[displayName] : null) ||
      (isValidName ? chatsMetadataMap[displayName?.toLowerCase()?.trim()] : null) ||
      (validSearchKey ? chatsMetadataMap[validSearchKey] : null) ||
      (validPhoneClean ? chatsMetadataMap[validPhoneClean] : null) ||
      (validTenDigit ? chatsMetadataMap[validTenDigit] : null);

    if (!localData && validPhoneClean && validTenDigit) {
      for (const [k, val] of Object.entries(s)) {
        if (k.startsWith('crm_meta_') && val && typeof val === 'object') {
          const valPhone = (val.phone || k).replace(/\D/g, '');
          if (valPhone && (valPhone.endsWith(validTenDigit) || validTenDigit.endsWith(valPhone))) {
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
      if (isValidName && (validPhoneClean || validTenDigit)) {
        const meta = { ...localData, name: displayName, phone: validPhoneClean || queryPhone };
        chatsMetadataMap[displayName] = meta;
        chatsMetadataMap[displayName.toLowerCase().trim()] = meta;
        safeStorageSet({
          [`crm_meta_${displayName}`]: meta,
          [`crm_meta_${displayName.toLowerCase().trim()}`]: meta
        });
      }
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

    safeSendMessage({ action: 'FETCH_CRM_METADATA', phoneClean: queryPhone, searchKey, displayName }, (response) => {
      if (requestId !== metadataRequestId) return;
      let resolvedAvatar = domAvatar || activeAvatarUrl;

      if (response && response.success && response.chat) {
        const chat = response.chat;
        const localNotes = parseNotesList(localData?.notes, localData?.notesList);
        const backendNotes = parseNotesList(chat.notes, chat.notesList);
        const mergedNotes = [...backendNotes];
        for (const n of localNotes) {
          if (!mergedNotes.includes(n)) mergedNotes.push(n);
        }

        const bLead = chat.leadStatus !== undefined && chat.leadStatus !== 'UNASSIGNED' ? chat.leadStatus : (localData?.leadStatus || 'UNASSIGNED');
        const bCall = chat.callStatus !== undefined && chat.callStatus !== null ? chat.callStatus : (localData?.callStatus || null);
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

        const backendNameIsPhoneOrBad = !chat.name || badNames.includes(chat.name.toLowerCase().trim()) || chat.name.replace(/\D/g, '').length >= 10;
        const currentNameIsValid = displayName && !badNames.includes(displayName.toLowerCase().trim()) && displayName.replace(/\D/g, '').length < 10;
        const effectiveDisplayName = (currentNameIsValid ? displayName : (backendNameIsPhoneOrBad ? displayName : chat.name));

        const meta = { ...activeFormData, name: effectiveDisplayName, phone: validPhoneClean || queryPhone };
        if (validSearchKey) chatsMetadataMap[validSearchKey] = meta;
        if (validPhoneClean) chatsMetadataMap[validPhoneClean] = meta;
        if (queryPhone && queryPhone.length >= 10) chatsMetadataMap[queryPhone] = meta;
        if (isValidName) chatsMetadataMap[displayName] = meta;

        // ✅ AUTO NAME REFLECTION: Whenever backend name doesn't match current display name
        // (e.g. name was "Monu" but user renamed to "Monu Kumar"), auto-push to backend.
        // This fires for phone→name AND name→new-name edits dynamically!
        if (currentNameIsValid && chat.name !== displayName) {
          // Extract phone from the JID returned by backend (most reliable source)
          const chatJidPhone = (chat.jid || '').split('@')[0].replace(/\D/g, '');
          const resolvedPhone = validPhoneClean || queryPhone || chatJidPhone;
          const resolvedJid = chat.jid || (resolvedPhone ? `${resolvedPhone}@s.whatsapp.net` : '');

          if (resolvedJid) {
            const autoPayload = {
              jid: resolvedJid,
              name: displayName,
              phone: resolvedPhone,
              leadStatus: activeFormData.leadStatus,
              callStatus: activeFormData.callStatus,
              followUpDate: activeFormData.followUpDate || undefined,
              notesList: activeFormData.notesList,
              notes: activeFormData.notesList.join('\n\n'),
              manuallySaved: false
            };
            fetch(`${DEFAULT_API_BASE}/api/crm/contact`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(autoPayload)
            }).then(r => r.json()).then(() => {
              if (requestId !== metadataRequestId) return;
              // Update local cache with phone → name mapping
              if (chatJidPhone) {
                chatsMetadataMap[chatJidPhone] = { ...activeFormData, name: displayName, phone: resolvedPhone };
                chatsMetadataMap[displayName] = chatsMetadataMap[chatJidPhone];
              }
            }).catch(() => {});
          }
        }
      }
      activeAvatarUrl = resolvedAvatar;
      renderCrmPanel(activeDisplayName || displayName, activePhoneClean, resolvedAvatar);
      injectChatListBadges();
    });
  });
}

function saveCrmMetadata(forcedAiDisabled) {
  // Normal CRM saves stop AI; the toggle passes an explicit state in either direction.
  activeFormData.aiDisabled = forcedAiDisabled !== undefined ? forcedAiDisabled : true;

  let domPhone = extractPhoneNumberFromDom();
  let titleDigits = activeDisplayName.replace(/\D/g, '');
  let cleanDigits = domPhone ? domPhone.replace(/\D/g, '') : (titleDigits.length >= 10 ? titleDigits : '');
  if (cleanDigits.length < 10 && chatsMetadataMap[activeDisplayName]?.phone) {
    const cachedP = chatsMetadataMap[activeDisplayName].phone.replace(/\D/g, '');
    if (cachedP.length >= 10) cleanDigits = cachedP;
  }
  const tenDigit = (cleanDigits.length === 12 && cleanDigits.startsWith('91')) ? cleanDigits.slice(2) : (cleanDigits.length === 10 ? cleanDigits : '');
  if (cleanDigits.length === 10) cleanDigits = '91' + cleanDigits;

  const targetJid = cleanDigits.length >= 10
    ? `${cleanDigits}@s.whatsapp.net`
    : `${activeContactKey}@s.whatsapp.net`;

  // Update activePhoneClean cache ONLY if valid 10+ digit phone belongs to this chat
  if (cleanDigits.length >= 10) activePhoneClean = cleanDigits;

  // Use phone number as display name fallback if name is invalid (".", "Contact", empty)
  const badNames = ['.', 'contact', 'unsaved contact', ''];
  const effectiveName = (!activeDisplayName || badNames.includes(activeDisplayName.toLowerCase().trim()))
    ? (cleanDigits || activeContactKey)
    : activeDisplayName;

  const metaObj = { ...activeFormData, name: effectiveName, phone: cleanDigits || activeContactKey };

  // Save under ALL possible keys so loading always finds it
  const saveKeys = {};
  if (cleanDigits.length >= 10) {
    saveKeys[`crm_meta_${cleanDigits}`] = metaObj;
    saveKeys[`crm_meta_${tenDigit}`] = metaObj;
    if (activePhoneClean) saveKeys[`crm_meta_${activePhoneClean}`] = metaObj;
  }
  if (activeDisplayName && !badNames.includes(activeDisplayName.toLowerCase().trim())) {
    saveKeys[`crm_meta_${activeDisplayName}`] = metaObj;
    saveKeys[`crm_meta_${activeDisplayName.toLowerCase().trim()}`] = metaObj;
  }
  if (activeContactKey && !saveKeys[`crm_meta_${activeContactKey}`]) {
    saveKeys[`crm_meta_${activeContactKey}`] = metaObj;
  }

  console.log('[AI Vastra] Saving metadata:', JSON.stringify(saveKeys));
  safeStorageSet(saveKeys);

  chatsMetadataMap[cleanDigits] = metaObj;
  chatsMetadataMap[tenDigit] = metaObj;
  if (activePhoneClean) chatsMetadataMap[activePhoneClean] = metaObj;
  if (effectiveName !== cleanDigits) chatsMetadataMap[effectiveName] = metaObj;

  const payload = {
    jid: targetJid,
    name: effectiveName,
    phone: cleanDigits,
    leadStatus: activeFormData.leadStatus,
    callStatus: activeFormData.callStatus,
    followUpDate: activeFormData.followUpDate || undefined,
    notes: activeFormData.notesList.join('\n\n'),
    notesList: activeFormData.notesList,
    aiDisabled: activeFormData.aiDisabled,
    isAutoWarm: false,
    manuallySaved: true,
    updatedAt: Date.now(),
  };

  // 1. Direct fetch to backend CRM API
  try {
    fetch(`${DEFAULT_API_BASE}/api/crm/contact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then((res) => res.json())
      .then((data) => {
        console.log('[AI Vastra Extension] Direct sync success:', data);
        fetchCrmMetadata(activeContactKey, effectiveName, activeAvatarUrl);
      })
      .catch((e) => console.warn('[AI Vastra Extension] Direct sync fallback:', e));
  } catch (e) {}

  // 2. Background message worker sync
  safeSendMessage({ action: 'UPDATE_CRM_METADATA', jid: targetJid, data: payload }, (response) => {
    console.log('[AI Vastra Extension] Background save response:', response);
  });

  injectChatListBadges();
}

function renderCrmPanel(displayName, cleanPhone, avatarUrl, showSaveToast = false) {
  const panel = ensureCrmPanel();
  panel.style.display = isPanelVisible ? 'flex' : 'none';

  const badNames = ['.', 'contact', 'unsaved contact', 'unknown contact', 'whatsapp contact', ''];
  const digitsInName = (displayName || '').replace(/\D/g, '');

  let formattedPhone = '';
  if (cleanPhone && cleanPhone.length >= 10) {
    if (cleanPhone.length === 12 && cleanPhone.startsWith('91')) {
      formattedPhone = `+91 ${cleanPhone.slice(2, 7)} ${cleanPhone.slice(7)}`;
    } else if (cleanPhone.length === 10) {
      formattedPhone = `+91 ${cleanPhone.slice(0, 5)} ${cleanPhone.slice(5)}`;
    } else {
      formattedPhone = `+${cleanPhone}`;
    }
  } else if (digitsInName.length >= 10) {
    if (digitsInName.length === 12 && digitsInName.startsWith('91')) {
      formattedPhone = `+91 ${digitsInName.slice(2, 7)} ${digitsInName.slice(7)}`;
    } else if (digitsInName.length === 10) {
      formattedPhone = `+91 ${digitsInName.slice(0, 5)} ${digitsInName.slice(5)}`;
    } else {
      formattedPhone = `+${digitsInName}`;
    }
  }

  const isSavedContact = Boolean(
    displayName && 
    !badNames.includes(displayName.toLowerCase().trim()) && 
    digitsInName.length < 10
  );

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
        <button id="aivastra-stop-auto-btn" class="aivastra-stop-auto-btn" title="Toggle AI Auto-Reply for this chat" style="
          background:${activeFormData.aiDisabled ? '#fef2f2' : '#fff7ed'};
          color:${activeFormData.aiDisabled ? '#dc2626' : '#c2410c'};
          border:1px solid ${activeFormData.aiDisabled ? '#fecaca' : '#ffedd5'};
          border-radius:6px;padding:3px 8px;font-size:11px;font-weight:700;
          cursor:pointer;display:flex;align-items:center;gap:3px;
        ">${activeFormData.aiDisabled ? '🛑 Auto Stopped !!' : '⚡ Stop Auto'}</button>
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

  document.getElementById('aivastra-stop-auto-btn').onclick = () => {
    const newAiDisabled = !activeFormData.aiDisabled;
    activeFormData.aiDisabled = newAiDisabled;
    saveCrmMetadata(newAiDisabled);
    renderCrmPanel(displayName, cleanPhone, avatarUrl);
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
    const tenDigit = (cleanDigits.length === 12 && cleanDigits.startsWith('91')) ? cleanDigits.slice(2) : cleanDigits;
    if (cleanDigits.length === 10) cleanDigits = '91' + cleanDigits;

    const targetJid = cleanDigits.length >= 10
      ? `${cleanDigits}@s.whatsapp.net`
      : `${activeContactKey}@s.whatsapp.net`;

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

    // 4. Send delete request to CRM backend
    try {
      fetch(`${DEFAULT_API_BASE}/api/chats/${encodeURIComponent(targetJid)}`, { method: 'DELETE' }).catch(() => {});
      fetch(`${DEFAULT_API_BASE}/api/crm/contact/clear`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jid: targetJid, phone: cleanDigits, name: activeDisplayName })
      }).catch(() => {});
    } catch (e) {}

    safeSendMessage({ action: 'CLEAR_CRM_METADATA', jid: targetJid, phone: cleanDigits }, (response) => {
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
    const txt = document.getElementById('aivastra-note-text').value.trim();
    if (txt) {
      const hasDateInText = /\b\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}\b/.test(txt) || (txt.includes('(') && txt.includes(')'));
      const formatted = hasDateInText ? txt : `${txt} (${getTodayFormattedDate()})`;
      activeFormData.notesList.unshift(formatted);
      document.getElementById('aivastra-note-text').value = '';
      saveCrmMetadata();
      renderCrmPanel(displayName, cleanPhone, avatarUrl);
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
