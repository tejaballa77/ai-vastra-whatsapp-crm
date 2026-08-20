// AI Vastra Chrome Extension - Injected Content Script on web.whatsapp.com
console.log('[AI Vastra Chrome Extension] Script active on WhatsApp Web!');

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

// Per-Contact Form Data Store (Strict Chat Isolation)
let activeFormData = {
  leadStatus: 'UNASSIGNED',
  callStatus: null,
  followUpDate: '',
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
    if (isPanelVisible) detectActiveContact(true);
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
              notesList: c.notesList || existingMeta.notesList || (c.notes ? [c.notes] : []),
              name: (hasValidName ? c.name : existingMeta.name),
              phone: c.phone || tenDigit
            };
            if (tenDigit) chatsMetadataMap[tenDigit] = meta;
            if (rawNum) chatsMetadataMap[rawNum] = meta;
            if (c.jid) chatsMetadataMap[c.jid] = meta;
            if (c.name && hasValidName) chatsMetadataMap[c.name.trim()] = meta;
          }
        }
      }
      if (callback) callback();
      injectChatListBadges();
    });
  });
}


// Inject Lead Status Emoji Badges & Display Name into left chat list
function injectChatListBadges() {
  const chatItems = document.querySelectorAll('#pane-side [role="listitem"]');
  if (!chatItems || chatItems.length === 0) return;

  chatItems.forEach((item) => {
    try {
      const titleEl = item.querySelector('span[title]') || item.querySelector('span[dir="auto"]');
      if (!titleEl) return;

      // Preserve clean phone number in custom attribute data-aivastra-phone
      let cleanDigits = item.getAttribute('data-aivastra-phone') || '';
      const rawText = (titleEl.getAttribute('title') || titleEl.textContent || '').trim();

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

      // Replace raw phone number in left sidebar with detected profile name if available
      const badNames = ['.', 'contact', 'unsaved contact', 'unknown contact', 'whatsapp contact', ''];
      const rawMetaName = chatMeta?.name ? chatMeta.name.trim() : null;
      const isValidMetaName = rawMetaName && !badNames.includes(rawMetaName.toLowerCase()) && rawMetaName.replace(/\D/g, '').length < 10;

      const targetName = isValidMetaName ? rawMetaName : ((key === activeContactKey || cleanDigits === activePhoneClean) && activeDisplayName && activeDisplayName !== activePhoneClean ? activeDisplayName : null);

      if (targetName && cleanDigits.length >= 10) {
        const parentSpan = titleEl.parentElement;
        if (parentSpan) {
          let override = parentSpan.querySelector('.aivastra-name-override');
          if (!override) {
            override = document.createElement('span');
            override.className = 'aivastra-name-override';
            override.style.fontWeight = '600';
            override.style.fontSize = '16px';
            override.style.color = '#111b21';
            override.style.display = 'inline-block';
            override.style.overflow = 'hidden';
            override.style.textOverflow = 'ellipsis';
            override.style.whiteSpace = 'nowrap';
            parentSpan.appendChild(override);
          }
          override.textContent = targetName;
          override.setAttribute('title', targetName);
          titleEl.style.display = 'none'; // Hide raw phone number node cleanly
        }
      } else {
        const parentSpan = titleEl.parentElement;
        if (parentSpan) {
          const override = parentSpan.querySelector('.aivastra-name-override');
          if (override) override.remove();
          titleEl.style.display = '';
        }
      }

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

    const imgEl = mainHeader.querySelector('img');
    let domAvatar = '';
    if (imgEl && imgEl.src && !imgEl.src.includes('data:image/svg')) {
      domAvatar = imgEl.src;
    }

    const cleanDigits = targetTitle.replace(/\D/g, '');
    const tenDigit = (cleanDigits.length === 12 && cleanDigits.startsWith('91')) ? cleanDigits.slice(2) : cleanDigits;
    const contactKey = cleanDigits.length >= 10 ? cleanDigits : targetTitle;

    // Retrieve locked cached profile name so closing WhatsApp contact info drawer does not lose the name
    const existingMeta = chatsMetadataMap[cleanDigits] || chatsMetadataMap[contactKey] || chatsMetadataMap[tenDigit];
    const badNames = ['.', 'contact', 'unsaved contact', 'unknown contact', 'whatsapp contact', ''];
    const cachedName = existingMeta?.name && !badNames.includes(existingMeta.name.toLowerCase().trim()) && existingMeta.name.replace(/\D/g, '').length < 10 ? existingMeta.name : null;

    // Detect WhatsApp profile name (~Parth) from DOM or fallback to locked cache
    const profileName = extractProfileNameFromDom() || cachedName;
    let displayTitle = targetTitle;
    if (cleanDigits.length >= 10 && profileName) {
      displayTitle = profileName;
      // Replace main chat header raw phone number with detected name via overlay span
      if (targetSpan && targetSpan.parentElement) {
        let headerOverride = targetSpan.parentElement.querySelector('.aivastra-header-name-override');
        if (!headerOverride) {
          headerOverride = document.createElement('span');
          headerOverride.className = 'aivastra-header-name-override';
          headerOverride.style.fontWeight = '700';
          headerOverride.style.fontSize = '16px';
          headerOverride.style.color = '#111b21';
          headerOverride.style.display = 'inline-block';
          targetSpan.parentElement.appendChild(headerOverride);
        }
        headerOverride.textContent = profileName;
        targetSpan.style.display = 'none';
      }
    }

    if (activeContactKey !== contactKey || force) {
      activeContactKey = contactKey;
      activeDisplayName = displayTitle;
      activePhoneClean = cleanDigits;
      activeAvatarUrl = domAvatar;

      activeFormData = { leadStatus: 'UNASSIGNED', callStatus: null, followUpDate: '', notesList: [] };
      fetchCrmMetadata(contactKey, displayTitle, domAvatar);

      // Auto-persist detected profile name to local name cache so page reloads load it instantly!
      if (profileName) {
        const cleanP = cleanDigits;
        const tenP = (cleanP.length === 12 && cleanP.startsWith('91')) ? cleanP.slice(2) : cleanP;
        safeStorageGet(['crm_name_cache'], (res) => {
          const cache = res?.crm_name_cache || {};
          cache[cleanP] = profileName;
          cache[tenP] = profileName;
          safeStorageSet({ crm_name_cache: cache });
        });
      }
    }
  } catch (e) {}
}

function fetchCrmMetadata(searchKey, displayName, domAvatar) {
  const badNames = ['.', 'contact', 'unsaved contact', 'unknown contact', 'whatsapp contact', ''];
  const isValidName = displayName && !badNames.includes(displayName.toLowerCase().trim()) && displayName.replace(/\D/g, '').length < 10;

  const rawClean = (activePhoneClean || searchKey || '').replace(/\D/g, '');
  const tenDigit = (rawClean.length === 12 && rawClean.startsWith('91')) ? rawClean.slice(2) : rawClean;

  const storageKeys = [`crm_meta_${searchKey}`];
  if (activePhoneClean) storageKeys.push(`crm_meta_${activePhoneClean}`);
  if (tenDigit) storageKeys.push(`crm_meta_${tenDigit}`);
  if (isValidName) storageKeys.push(`crm_meta_${displayName}`);

  // Reset activeFormData to blank defaults initially
  activeFormData = { leadStatus: 'UNASSIGNED', callStatus: null, followUpDate: '', notesList: [] };

  safeStorageGet(storageKeys, (stored) => {
    const s = stored || {};
    const localData = s[`crm_meta_${searchKey}`] || s[`crm_meta_${activePhoneClean}`] || (tenDigit ? s[`crm_meta_${tenDigit}`] : null) || (isValidName ? s[`crm_meta_${displayName}`] : null);

    if (localData) {
      activeFormData = {
        leadStatus: localData.leadStatus || 'UNASSIGNED',
        callStatus: localData.callStatus || null,
        followUpDate: localData.followUpDate || '',
        notesList: Array.isArray(localData.notesList) ? localData.notesList : (localData.notes ? [localData.notes] : [])
      };
    }

    renderCrmPanel(displayName, activePhoneClean, domAvatar || activeAvatarUrl);

    safeSendMessage({ action: 'FETCH_CRM_METADATA', phoneClean: searchKey }, (response) => {
      let resolvedPhone = activePhoneClean;
      let resolvedAvatar = domAvatar || activeAvatarUrl;

      if (response && response.success && response.chat) {
        const chat = response.chat;
        
        const bLead = (chat.leadStatus && chat.leadStatus !== 'UNASSIGNED') ? chat.leadStatus : null;
        const lLead = (activeFormData.leadStatus && activeFormData.leadStatus !== 'UNASSIGNED') ? activeFormData.leadStatus : null;

        const bCall = chat.callStatus || null;
        const lCall = activeFormData.callStatus || null;

        const bFollow = (chat.followUpDate && chat.followUpDate.trim() !== '' && chat.followUpDate !== '—') ? chat.followUpDate : null;
        const lFollow = (activeFormData.followUpDate && activeFormData.followUpDate.trim() !== '' && activeFormData.followUpDate !== '—') ? activeFormData.followUpDate : null;

        const bNotes = (chat.notesList && chat.notesList.length > 0) ? chat.notesList : (chat.notes ? [chat.notes] : []);
        const lNotes = activeFormData.notesList || [];
        const mergedNotes = Array.from(new Set([...bNotes, ...lNotes]));

        activeFormData = {
          leadStatus: bLead || lLead || 'UNASSIGNED',
          callStatus: bCall || lCall || null,
          followUpDate: bFollow || lFollow || '',
          notesList: mergedNotes
        };

        if (chat.phone) resolvedPhone = chat.phone.replace(/\D/g, '');
        else if (chat.jid) {
          const jidNum = chat.jid.split('@')[0].replace(/\D/g, '');
          if (jidNum.length >= 10) resolvedPhone = jidNum;
        }
        if (!resolvedAvatar && chat.avatarUrl) resolvedAvatar = chat.avatarUrl;

        const meta = { ...activeFormData, name: displayName, phone: resolvedPhone };
        if (searchKey) chatsMetadataMap[searchKey] = meta;
        if (resolvedPhone) chatsMetadataMap[resolvedPhone] = meta;
        if (isValidName) chatsMetadataMap[displayName] = meta;
      }

      activePhoneClean = resolvedPhone;
      activeAvatarUrl = resolvedAvatar;
      renderCrmPanel(displayName, resolvedPhone, resolvedAvatar);
      injectChatListBadges();
    });
  });
}

function saveCrmMetadata() {
  // Normalize phone number with 91 prefix for canonical WhatsApp JID
  let cleanDigits = (activePhoneClean || activeContactKey).replace(/\D/g, '');
  if (!cleanDigits || cleanDigits.length < 10) return; // Prevent saving phantom JIDs
  const tenDigit = (cleanDigits.length === 12 && cleanDigits.startsWith('91')) ? cleanDigits.slice(2) : cleanDigits;
  if (cleanDigits.length === 10) cleanDigits = '91' + cleanDigits;
  const targetJid = `${cleanDigits}@s.whatsapp.net`;

  // Use phone number as display name fallback if name is invalid (".", "Contact", empty)
  const badNames = ['.', 'contact', 'unsaved contact', ''];
  const effectiveName = (!activeDisplayName || badNames.includes(activeDisplayName.toLowerCase().trim()))
    ? (activePhoneClean || activeContactKey)
    : activeDisplayName;

  const metaObj = { ...activeFormData, name: effectiveName, phone: cleanDigits };

  // Save under ALL digit formats (10-digit, 12-digit) so loading always finds it!
  const saveKeys = {};
  saveKeys[`crm_meta_${cleanDigits}`] = metaObj;
  saveKeys[`crm_meta_${tenDigit}`] = metaObj;
  if (activePhoneClean) saveKeys[`crm_meta_${activePhoneClean}`] = metaObj;
  if (activeDisplayName && !badNames.includes(activeDisplayName.toLowerCase().trim())) {
    saveKeys[`crm_meta_${activeDisplayName}`] = metaObj;
  }

  safeStorageSet(saveKeys);

  chatsMetadataMap[cleanDigits] = metaObj;
  chatsMetadataMap[tenDigit] = metaObj;
  if (activePhoneClean) chatsMetadataMap[activePhoneClean] = metaObj;
  if (effectiveName !== cleanDigits) chatsMetadataMap[effectiveName] = metaObj;

  const payload = {
    name: effectiveName,
    phone: cleanDigits,
    leadStatus: activeFormData.leadStatus,
    callStatus: activeFormData.callStatus,
    followUpDate: activeFormData.followUpDate || undefined,
    notes: activeFormData.notesList.join('\n\n'),
    notesList: activeFormData.notesList
  };

  safeSendMessage({ action: 'UPDATE_CRM_METADATA', jid: targetJid, data: payload }, (response) => {
    console.log('[AI Vastra Extension] Save response:', response);
  });

  injectChatListBadges();
}

function renderCrmPanel(displayName, cleanPhone, avatarUrl, showSaveToast = false) {
  const panel = ensureCrmPanel();
  panel.style.display = isPanelVisible ? 'flex' : 'none';

  let formattedPhone = 'WhatsApp Contact';
  if (cleanPhone && cleanPhone.length >= 10) {
    if (cleanPhone.length === 12 && cleanPhone.startsWith('91')) {
      formattedPhone = `+91 ${cleanPhone.slice(2, 7)} ${cleanPhone.slice(7)}`;
    } else if (cleanPhone.length === 10) {
      formattedPhone = `+91 ${cleanPhone.slice(0, 5)} ${cleanPhone.slice(5)}`;
    } else {
      formattedPhone = `+${cleanPhone}`;
    }
  }

  const avatarHtml = avatarUrl
    ? `<img src="${avatarUrl}" alt="${displayName}" class="aivastra-avatar-img" />`
    : `<div class="aivastra-avatar-circle">${(displayName || '?').charAt(0).toUpperCase()}</div>`;

  panel.innerHTML = `
    <div class="aivastra-header">
      <div style="display:flex;align-items:center;gap:6px;">
        <span style="color:#00a884;font-size:16px;">⚡</span>
        <span>Contact Info</span>
      </div>
      <div style="display:flex;align-items:center;">
        <button id="aivastra-close-btn" class="aivastra-close-btn">✕</button>
      </div>
    </div>

    <div id="aivastra-save-toast" class="aivastra-toast" style="display:${showSaveToast ? 'block' : 'none'};">
      ✓ Contact info saved successfully!
    </div>

    <div class="aivastra-body">
      <div class="aivastra-card">
        ${avatarHtml}
        <div class="aivastra-contact-name">${displayName}</div>
        <div class="aivastra-contact-phone">📞 ${formattedPhone}</div>
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
        <div class="aivastra-btn-group">
          <button id="btn-interested" class="aivastra-btn ${activeFormData.leadStatus === 'INTERESTED' ? 'active-interested' : ''}">👍 Interested</button>
          <button id="btn-warm" class="aivastra-btn ${activeFormData.leadStatus === 'WARM_INTERESTED' || activeFormData.leadStatus === 'WARM' ? 'active-warm' : ''}">🔥 Warm</button>
          <button id="btn-not-interested" class="aivastra-btn ${activeFormData.leadStatus === 'NOT_INTERESTED' ? 'active-not-interested' : ''}">👎 Not Interested</button>
        </div>
      </div>

      <div>
        <div class="aivastra-section-title">FOLLOW-UP SCHEDULE</div>
        <input type="date" id="aivastra-followup-date" class="aivastra-date-input" value="${activeFormData.followUpDate}" />
      </div>

      <div style="display:flex;flex-direction:column;flex:1;">
        <div class="aivastra-section-title">CRM NOTES</div>
        <textarea id="aivastra-note-text" class="aivastra-notes-area" rows="3" style="min-height:80px;" placeholder="Add key note about customer requirements..."></textarea>
        <button id="aivastra-add-note-btn" class="aivastra-add-note-btn">+ Add Note</button>
        <div id="aivastra-notes-list" style="margin-top:10px;max-height:140px;overflow-y:auto;">
          ${activeFormData.notesList.map((n, i) => `
            <div class="aivastra-note-item">
              <span style="flex:1;word-break:break-word;">${n}</span>
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

function getTodayFormattedDate() {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

  document.getElementById('aivastra-close-btn').onclick = () => {
    isPanelVisible = false;
    panel.style.display = 'none';
  };
  document.getElementById('btn-call-yes').onclick = () => { activeFormData.callStatus = 'YES'; renderCrmPanel(displayName, cleanPhone, avatarUrl); };
  document.getElementById('btn-call-no').onclick = () => { activeFormData.callStatus = 'NO'; renderCrmPanel(displayName, cleanPhone, avatarUrl); };
  document.getElementById('btn-interested').onclick = () => { activeFormData.leadStatus = 'INTERESTED'; renderCrmPanel(displayName, cleanPhone, avatarUrl); };
  document.getElementById('btn-warm').onclick = () => { activeFormData.leadStatus = 'WARM_INTERESTED'; renderCrmPanel(displayName, cleanPhone, avatarUrl); };
  document.getElementById('btn-not-interested').onclick = () => { activeFormData.leadStatus = 'NOT_INTERESTED'; renderCrmPanel(displayName, cleanPhone, avatarUrl); };
  document.getElementById('aivastra-followup-date').onchange = (e) => { activeFormData.followUpDate = e.target.value; };
  document.getElementById('aivastra-add-note-btn').onclick = () => {
    const txt = document.getElementById('aivastra-note-text').value.trim();
    if (txt) {
      const dateTag = `(${getTodayFormattedDate()})`;
      const formatted = txt.includes('(') && txt.includes(')') ? txt : `${txt} ${dateTag}`;
      activeFormData.notesList.unshift(formatted);
      document.getElementById('aivastra-note-text').value = '';
      saveCrmMetadata();
      renderCrmPanel(displayName, cleanPhone, avatarUrl);
    }
  };
  document.getElementById('aivastra-save-main-btn').onclick = () => {
    const txt = document.getElementById('aivastra-note-text').value.trim();
    if (txt) {
      const dateTag = `(${getTodayFormattedDate()})`;
      const formatted = txt.includes('(') && txt.includes(')') ? txt : `${txt} ${dateTag}`;
      activeFormData.notesList.unshift(formatted);
      document.getElementById('aivastra-note-text').value = '';
    }
    saveCrmMetadata();
    renderCrmPanel(displayName, cleanPhone, avatarUrl, true);
  };
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
