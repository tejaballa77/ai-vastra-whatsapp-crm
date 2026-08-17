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
let isCrmFilterActive = false;
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
  safeSendMessage({ action: 'FETCH_ALL_CRM_CHATS' }, (response) => {
    if (response && response.success && Array.isArray(response.chats)) {
      for (const c of response.chats) {
        const hasInfo = Boolean(
          (c.leadStatus && c.leadStatus !== 'UNASSIGNED') ||
          c.callStatus === 'YES' ||
          Boolean(c.followUpDate && c.followUpDate.trim().length > 0) ||
          (c.notesList && c.notesList.length > 0) ||
          Boolean(c.notes && c.notes.trim().length > 0)
        );

        const rawNum = (c.phone || c.jid || '').split('@')[0].replace(/\D/g, '');
        const tenDigit = (rawNum.length === 12 && rawNum.startsWith('91')) ? rawNum.slice(2) : rawNum;

        if (hasInfo) {
          const meta = {
            leadStatus: c.leadStatus || 'UNASSIGNED',
            callStatus: c.callStatus || null,
            followUpDate: c.followUpDate || '',
            notesList: c.notesList || (c.notes ? [c.notes] : []),
            name: c.name,
            phone: c.phone || tenDigit
          };
          if (tenDigit) chatsMetadataMap[tenDigit] = meta;
          if (rawNum) chatsMetadataMap[rawNum] = meta;
          if (c.jid) chatsMetadataMap[c.jid] = meta;
          if (c.name) chatsMetadataMap[c.name.trim()] = meta;
        } else {
          // If cleared, remove from metadata map
          if (tenDigit) delete chatsMetadataMap[tenDigit];
          if (rawNum) delete chatsMetadataMap[rawNum];
          if (c.jid) delete chatsMetadataMap[c.jid];
          if (c.name) delete chatsMetadataMap[c.name.trim()];
        }
      }
    }
    if (callback) callback();
    injectChatListBadges();
    if (isCrmFilterActive) filterChatListByCrmInfo();
  });
}

// Inject "⚡ CRM Info" Filter Pill
function injectCrmFilterPill() {
  const filterBar = document.querySelector('div[role="tablist"]') ||
                    document.querySelector('#side button[role="tab"]')?.parentElement ||
                    document.querySelector('#pane-side')?.previousElementSibling;

  if (!filterBar) return;
  if (document.getElementById('aivastra-crm-filter-pill')) return;

  const pill = document.createElement('button');
  pill.id = 'aivastra-crm-filter-pill';
  pill.className = 'aivastra-filter-pill';
  pill.innerHTML = `⚡ CRM Info`;
  pill.title = 'Show only chats with saved CRM contact info';

  pill.onclick = (e) => {
    e.stopPropagation();
    isCrmFilterActive = !isCrmFilterActive;
    updateCrmFilterPillUI();
    if (isCrmFilterActive) {
      syncAllCrmChats(() => filterChatListByCrmInfo());
    } else {
      resetChatListVisibility();
    }
  };

  filterBar.appendChild(pill);

  // When standard WhatsApp filter tabs are clicked, reset our CRM filter
  filterBar.querySelectorAll('button:not(#aivastra-crm-filter-pill)').forEach(btn => {
    btn.addEventListener('click', () => {
      isCrmFilterActive = false;
      updateCrmFilterPillUI();
      resetChatListVisibility();
    });
  });
}

function updateCrmFilterPillUI() {
  const pill = document.getElementById('aivastra-crm-filter-pill');
  if (!pill) return;
  if (isCrmFilterActive) {
    pill.classList.add('active-crm-filter');
  } else {
    pill.classList.remove('active-crm-filter');
  }
}

function filterChatListByCrmInfo() {
  const paneSide = document.getElementById('pane-side');
  if (!paneSide) return;
  const chatItems = paneSide.querySelectorAll('[role="listitem"], [data-testid="cell-frame-container"]');
  if (!chatItems || chatItems.length === 0) return;

  safeStorageGet(null, (allStored) => {
    chatItems.forEach((item) => {
      try {
        const titleEl = item.querySelector('span[title]') || item.querySelector('span[dir="auto"]');
        if (!titleEl) return;

        const rawTitle = (titleEl.getAttribute('title') || titleEl.textContent || '').trim();
        const rawDigits = rawTitle.replace(/\D/g, '');
        const tenDigit = (rawDigits.length === 12 && rawDigits.startsWith('91')) ? rawDigits.slice(2) : rawDigits;

        const chatMeta = chatsMetadataMap[tenDigit] || chatsMetadataMap[rawDigits] || chatsMetadataMap[rawTitle];
        const localMeta = (allStored || {})[`crm_meta_${tenDigit}`] || (allStored || {})[`crm_meta_${rawDigits}`] || (allStored || {})[`crm_meta_${rawTitle}`];

        const hasSavedInfo = Boolean(
          (chatMeta && (
            (chatMeta.leadStatus && chatMeta.leadStatus !== 'UNASSIGNED') ||
            chatMeta.callStatus === 'YES' ||
            Boolean(chatMeta.followUpDate && chatMeta.followUpDate.trim().length > 0) ||
            (chatMeta.notesList && chatMeta.notesList.length > 0) ||
            Boolean(chatMeta.notes && chatMeta.notes.trim().length > 0)
          )) ||
          (localMeta && (
            (localMeta.leadStatus && localMeta.leadStatus !== 'UNASSIGNED') ||
            localMeta.callStatus === 'YES' ||
            Boolean(localMeta.followUpDate && localMeta.followUpDate.trim().length > 0) ||
            (localMeta.notesList && localMeta.notesList.length > 0) ||
            Boolean(localMeta.notes && localMeta.notes.trim().length > 0)
          ))
        );

        // Find the outer row item to hide/show cleanly
        const targetRow = item.closest('div[style*="translateY"]') ||
                          item.closest('div[style*="height: 72px"]') ||
                          item.closest('div[style*="height:72px"]') ||
                          item.closest('[role="listitem"]') ||
                          item;

        if (isCrmFilterActive) {
          if (hasSavedInfo) {
            targetRow.style.removeProperty('display');
          } else {
            targetRow.style.setProperty('display', 'none', 'important');
          }
        } else {
          targetRow.style.removeProperty('display');
        }
      } catch (e) {}
    });
  });
}

function resetChatListVisibility() {
  const paneSide = document.getElementById('pane-side');
  if (!paneSide) return;
  const chatItems = paneSide.querySelectorAll('[role="listitem"], [data-testid="cell-frame-container"]');
  chatItems.forEach((item) => {
    try {
      const targetRow = item.closest('div[style*="translateY"]') ||
                        item.closest('div[style*="height: 72px"]') ||
                        item.closest('div[style*="height:72px"]') ||
                        item.closest('[role="listitem"]') ||
                        item;
      targetRow.style.removeProperty('display');
    } catch (e) {}
  });
}

// Inject Lead Status Emoji Badges into left chat list
function injectChatListBadges() {
  const chatItems = document.querySelectorAll('#pane-side [role="listitem"]');
  if (!chatItems || chatItems.length === 0) return;

  chatItems.forEach((item) => {
    try {
      const titleEl = item.querySelector('span[title]') || item.querySelector('span[dir="auto"]');
      if (!titleEl) return;

      const rawTitle = (titleEl.getAttribute('title') || titleEl.textContent || '').trim();
      const cleanDigits = rawTitle.replace(/\D/g, '');
      const key = cleanDigits.length >= 10 ? cleanDigits : rawTitle;

      const chatMeta = chatsMetadataMap[key] || chatsMetadataMap[rawTitle] || chatsMetadataMap[cleanDigits];
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

  if (isCrmFilterActive) filterChatListByCrmInfo();
}

// Observe WhatsApp Web chat header and DOM changes
function startChatObserver() {
  const observer = new MutationObserver(() => {
    try {
      ensureHeaderButton();
      injectCrmFilterPill();
      detectActiveContact();
      injectChatListBadges();
    } catch (e) {}
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

function detectActiveContact(force = false) {
  try {
    const mainHeader = document.querySelector('#main header');
    if (!mainHeader) return;

    ensureHeaderButton();
    injectCrmFilterPill();

    const spans = Array.from(mainHeader.querySelectorAll('span[title], span[dir="auto"]'));
    let targetTitle = '';

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
      break;
    }

    if (!targetTitle) return;

    const imgEl = mainHeader.querySelector('img');
    let domAvatar = '';
    if (imgEl && imgEl.src && !imgEl.src.includes('data:image/svg')) {
      domAvatar = imgEl.src;
    }

    const cleanDigits = targetTitle.replace(/\D/g, '');
    const contactKey = cleanDigits.length >= 10 ? cleanDigits : targetTitle;

    if (activeContactKey !== contactKey || force) {
      activeContactKey = contactKey;
      activeDisplayName = targetTitle;
      activePhoneClean = cleanDigits;
      activeAvatarUrl = domAvatar;

      activeFormData = { leadStatus: 'UNASSIGNED', callStatus: null, followUpDate: '', notesList: [] };
      fetchCrmMetadata(contactKey, targetTitle, domAvatar);
    }
  } catch (e) {}
}

function fetchCrmMetadata(searchKey, displayName, domAvatar) {
  const storageKeys = [`crm_meta_${searchKey}`, `crm_meta_${activePhoneClean}`, `crm_meta_${displayName}`];

  safeStorageGet(storageKeys, (stored) => {
    const localData = (stored || {})[`crm_meta_${searchKey}`] || (stored || {})[`crm_meta_${activePhoneClean}`] || (stored || {})[`crm_meta_${displayName}`];

    if (localData) {
      activeFormData = {
        leadStatus: localData.leadStatus || 'UNASSIGNED',
        callStatus: localData.callStatus || null,
        followUpDate: localData.followUpDate || '',
        notesList: localData.notesList || []
      };
    } else {
      activeFormData = { leadStatus: 'UNASSIGNED', callStatus: null, followUpDate: '', notesList: [] };
    }

    renderCrmPanel(displayName, activePhoneClean, domAvatar || activeAvatarUrl);

    safeSendMessage({ action: 'FETCH_CRM_METADATA', phoneClean: searchKey }, (response) => {
      let resolvedPhone = activePhoneClean;
      let resolvedAvatar = domAvatar || activeAvatarUrl;

      if (response && response.success && response.chat) {
        const chat = response.chat;
        if (!localData) {
          activeFormData = {
            leadStatus: chat.leadStatus || 'UNASSIGNED',
            callStatus: chat.callStatus || null,
            followUpDate: chat.followUpDate || '',
            notesList: chat.notesList || (chat.notes ? [chat.notes] : [])
          };
        }
        if (chat.phone) resolvedPhone = chat.phone.replace(/\D/g, '');
        else if (chat.jid) {
          const jidNum = chat.jid.split('@')[0].replace(/\D/g, '');
          if (jidNum.length >= 10) resolvedPhone = jidNum;
        }
        if (!resolvedAvatar && chat.avatarUrl) resolvedAvatar = chat.avatarUrl;

        const meta = { ...activeFormData, name: displayName, phone: resolvedPhone };
        chatsMetadataMap[searchKey] = meta;
        if (resolvedPhone) chatsMetadataMap[resolvedPhone] = meta;
        if (displayName) chatsMetadataMap[displayName] = meta;
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
  if (cleanDigits.length === 10) cleanDigits = '91' + cleanDigits;
  const targetJid = cleanDigits.length >= 10
    ? `${cleanDigits}@s.whatsapp.net`
    : (activeContactKey.includes('@') ? activeContactKey : `${activeContactKey}@s.whatsapp.net`);

  // Use phone number as display name fallback if name is invalid (".", "Contact", empty)
  const badNames = ['.', 'contact', 'unsaved contact', ''];
  const effectiveName = (!activeDisplayName || badNames.includes(activeDisplayName.toLowerCase().trim()))
    ? (activePhoneClean || activeContactKey)
    : activeDisplayName;

  const metaObj = { ...activeFormData, name: effectiveName, phone: activePhoneClean };

  // Save under ONE primary key only (phone number) to prevent duplicates
  const primaryKey = activePhoneClean.length >= 10 ? activePhoneClean : activeContactKey;
  const saveKeys = {};
  saveKeys[`crm_meta_${primaryKey}`] = metaObj;
  if (activeDisplayName && !badNames.includes(activeDisplayName.toLowerCase().trim())) {
    saveKeys[`crm_meta_${activeDisplayName}`] = metaObj;
  }

  safeStorageSet(saveKeys);

  chatsMetadataMap[primaryKey] = metaObj;
  if (activePhoneClean) chatsMetadataMap[activePhoneClean] = metaObj;
  if (effectiveName !== primaryKey) chatsMetadataMap[effectiveName] = metaObj;

  const payload = {
    name: effectiveName,
    phone: activePhoneClean,
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
        <button id="aivastra-clear-btn" class="aivastra-clear-btn">Clear</button>
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
              <span class="aivastra-note-delete" data-index="${i}" title="Delete Note">🗑</span>
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
  document.getElementById('aivastra-clear-btn').onclick = () => {
    activeFormData = { leadStatus: 'UNASSIGNED', callStatus: null, followUpDate: '', notesList: [] };
    saveCrmMetadata();
    renderCrmPanel(displayName, cleanPhone, avatarUrl);
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
  panel.querySelectorAll('.aivastra-note-delete').forEach(el => {
    el.onclick = (e) => {
      const idx = parseInt(e.target.getAttribute('data-index'));
      activeFormData.notesList.splice(idx, 1);
      saveCrmMetadata();
      renderCrmPanel(displayName, cleanPhone, avatarUrl);
    };
  });
}

// Start
setTimeout(() => {
  try {
    ensureHeaderButton();
    injectCrmFilterPill();
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
