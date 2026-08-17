// AI Vastra Chrome Extension - Injected Content Script on web.whatsapp.com
console.log('[AI Vastra Chrome Extension] Script active on WhatsApp Web!');

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
const BACKEND_URL = 'https://crm.nicedigitalsgroup.com';

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

// Inject Lead Status Emoji Badges into WhatsApp Web Left Chat List (#pane-side)
function injectChatListBadges() {
  const chatItems = document.querySelectorAll('#pane-side [role="listitem"]');
  if (!chatItems || chatItems.length === 0) return;

  chatItems.forEach((item) => {
    const titleEl = item.querySelector('span[title]') || item.querySelector('span[dir="auto"]');
    if (!titleEl) return;

    const rawTitle = titleEl.getAttribute('title') || titleEl.textContent || '';
    const cleanDigits = rawTitle.replace(/\D/g, '');
    const key = cleanDigits.length >= 10 ? cleanDigits : rawTitle;

    const chatMeta = chatsMetadataMap[key] || chatsMetadataMap[rawTitle] || chatsMetadataMap[cleanDigits];
    const status = chatMeta?.leadStatus || (key === activeContactKey ? activeFormData.leadStatus : null);

    let existingBadge = item.querySelector('.aivastra-chat-badge');

    if (status && status !== 'UNASSIGNED') {
      let badgeHtml = '';
      if (status === 'INTERESTED') {
        badgeHtml = '<span class="aivastra-chat-badge badge-interested" title="Lead: Interested">👍 Interested</span>';
      } else if (status === 'WARM_INTERESTED') {
        badgeHtml = '<span class="aivastra-chat-badge badge-warm" title="Lead: Warm">🔥 Warm</span>';
      } else if (status === 'NOT_INTERESTED') {
        badgeHtml = '<span class="aivastra-chat-badge badge-not-interested" title="Lead: Not Interested">👎 Not Interested</span>';
      }

      if (existingBadge) {
        existingBadge.outerHTML = badgeHtml;
      } else {
        const titleParent = titleEl.parentElement;
        if (titleParent) {
          const wrapper = document.createElement('span');
          wrapper.innerHTML = badgeHtml;
          titleParent.appendChild(wrapper.firstChild);
        }
      }
    } else if (existingBadge) {
      existingBadge.remove();
    }
  });
}

// Observe WhatsApp Web chat header and DOM changes
function startChatObserver() {
  const observer = new MutationObserver(() => {
    ensureHeaderButton();
    detectActiveContact();
    injectChatListBadges();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

// Extract real contact name/number specifically excluding status lines ("last seen", "online", etc.)
function detectActiveContact(force = false) {
  const mainHeader = document.querySelector('#main header');
  if (!mainHeader) return;

  ensureHeaderButton();

  // Find all text elements in header
  const spans = Array.from(mainHeader.querySelectorAll('span[title], span[dir="auto"]'));
  let targetTitle = '';

  for (const span of spans) {
    const txt = (span.getAttribute('title') || span.textContent || '').trim();
    if (!txt) continue;

    const lower = txt.toLowerCase();
    if (
      lower.includes('last seen') ||
      lower.includes('online') ||
      lower.includes('typing') ||
      lower.includes('click here') ||
      lower.includes('group') ||
      lower.includes('members') ||
      txt === '⚡ AI CRM'
    ) {
      continue;
    }

    targetTitle = txt;
    break;
  }

  if (!targetTitle) return;

  // Extract avatar image from header if available
  const imgEl = mainHeader.querySelector('img');
  let domAvatar = '';
  if (imgEl && imgEl.src && !imgEl.src.includes('data:image/svg')) {
    domAvatar = imgEl.src;
  }

  const cleanDigits = targetTitle.replace(/\D/g, '');
  const contactKey = cleanDigits.length >= 10 ? cleanDigits : targetTitle;

  // STRICT CHAT SWITCHING: When changing active chat, reset form data immediately before loading new chat data
  if (activeContactKey !== contactKey || force) {
    activeContactKey = contactKey;
    activeDisplayName = targetTitle;
    activePhoneClean = cleanDigits;
    activeAvatarUrl = domAvatar;

    // Reset current form data for clean chat isolation
    activeFormData = {
      leadStatus: 'UNASSIGNED',
      callStatus: null,
      followUpDate: '',
      notesList: []
    };

    fetchCrmMetadata(contactKey, targetTitle, domAvatar);
  }
}

function fetchCrmMetadata(searchKey, displayName, domAvatar) {
  const storageKeys = [`crm_meta_${searchKey}`, `crm_meta_${activePhoneClean}`, `crm_meta_${displayName}`];

  // 1. Load from Chrome Storage Local FIRST for instant chat isolation
  chrome.storage.local.get(storageKeys, (stored) => {
    const localData = stored[`crm_meta_${searchKey}`] || stored[`crm_meta_${activePhoneClean}`] || stored[`crm_meta_${displayName}`];
    
    if (localData) {
      activeFormData = {
        leadStatus: localData.leadStatus || 'UNASSIGNED',
        callStatus: localData.callStatus || null,
        followUpDate: localData.followUpDate || '',
        notesList: localData.notesList || []
      };
    } else {
      activeFormData = {
        leadStatus: 'UNASSIGNED',
        callStatus: null,
        followUpDate: '',
        notesList: []
      };
    }

    renderCrmPanel(displayName, activePhoneClean, domAvatar || activeAvatarUrl);

    // 2. Direct HTTPS fetch to CRM backend
    fetch(`${BACKEND_URL}/api/chats`)
      .then((res) => res.json())
      .then((chats) => {
        if (Array.isArray(chats)) {
          const cleanSearchDigits = (searchKey || '').replace(/\D/g, '');
          const searchName = (displayName || '').toLowerCase().trim();

          const activeChat = chats.find((c) => {
            const cleanJidNum = c.jid.split('@')[0].replace(/\D/g, '');
            const cleanPhone = (c.phone || '').replace(/\D/g, '');
            const name = (c.name || '').toLowerCase().trim();

            if (cleanSearchDigits.length >= 10) {
              if (cleanJidNum.includes(cleanSearchDigits) || cleanSearchDigits.includes(cleanJidNum)) return true;
              if (cleanPhone && (cleanPhone.includes(cleanSearchDigits) || cleanSearchDigits.includes(cleanPhone))) return true;
            }

            if (name && searchName.length > 1) {
              if (name === searchName || name.includes(searchName) || searchName.includes(name)) return true;
            }

            return false;
          });

          if (activeChat) {
            if (!localData) {
              activeFormData = {
                leadStatus: activeChat.leadStatus || 'UNASSIGNED',
                callStatus: activeChat.callStatus || null,
                followUpDate: activeChat.followUpDate || '',
                notesList: activeChat.notesList || (activeChat.notes ? [activeChat.notes] : [])
              };
            }

            const meta = {
              ...activeFormData,
              name: displayName,
              phone: activeChat.phone || activePhoneClean
            };

            chatsMetadataMap[searchKey] = meta;
            if (activePhoneClean) chatsMetadataMap[activePhoneClean] = meta;
            if (displayName) chatsMetadataMap[displayName] = meta;
          }
        }

        renderCrmPanel(displayName, activePhoneClean, domAvatar || activeAvatarUrl);
        injectChatListBadges();
      })
      .catch((err) => console.error('Error syncing CRM metadata:', err));
  });
}

function saveCrmMetadata() {
  const targetJid = activePhoneClean.length >= 10 
    ? `${activePhoneClean}@s.whatsapp.net` 
    : (activeContactKey.includes('@') ? activeContactKey : `${activeContactKey}@s.whatsapp.net`);

  const metaObj = {
    ...activeFormData,
    name: activeDisplayName,
    phone: activePhoneClean
  };

  // 1. Save to Chrome Storage Local permanently for this exact contact
  const saveKeys = {};
  saveKeys[`crm_meta_${activeContactKey}`] = metaObj;
  if (activePhoneClean) saveKeys[`crm_meta_${activePhoneClean}`] = metaObj;
  if (activeDisplayName) saveKeys[`crm_meta_${activeDisplayName}`] = metaObj;

  chrome.storage.local.set(saveKeys);

  // 2. Save in memory map
  chatsMetadataMap[activeContactKey] = metaObj;
  if (activePhoneClean) chatsMetadataMap[activePhoneClean] = metaObj;
  if (activeDisplayName) chatsMetadataMap[activeDisplayName] = metaObj;

  const payload = {
    name: activeDisplayName,
    phone: activePhoneClean,
    leadStatus: activeFormData.leadStatus,
    callStatus: activeFormData.callStatus,
    followUpDate: activeFormData.followUpDate || undefined,
    notes: activeFormData.notesList.join('\n\n'),
    notesList: activeFormData.notesList
  };

  // 3. Direct HTTPS PUT Request from Content Script to Backend API
  fetch(`${BACKEND_URL}/api/crm/contact/${encodeURIComponent(targetJid)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
    .then((res) => res.json())
    .then((resData) => {
      console.log('[AI Vastra Extension] Saved CRM metadata successfully:', resData);
    })
    .catch((err) => console.error('[AI Vastra Extension] Error saving to CRM:', err));

  // 4. Also notify background service worker
  chrome.runtime.sendMessage({
    action: 'UPDATE_CRM_METADATA',
    jid: targetJid,
    data: payload
  });

  injectChatListBadges();
}

// Render Contact Info Panel with CALL on top, LEAD STATUS below, extended CRM NOTES, and explicit SAVE button
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
    : `<div class="aivastra-avatar-circle">${displayName.charAt(0).toUpperCase()}</div>`;

  panel.innerHTML = `
    <div class="aivastra-header">
      <div style="display: flex; align-items: center; gap: 6px;">
        <span style="color: #00a884; font-size: 16px;">⚡</span>
        <span>Contact Info</span>
      </div>
      <div style="display: flex; align-items: center;">
        <button id="aivastra-clear-btn" class="aivastra-clear-btn">Clear</button>
        <button id="aivastra-close-btn" class="aivastra-close-btn">✕</button>
      </div>
    </div>

    <!-- PROMINENT 2-SECOND GREEN TOAST NOTIFICATION -->
    <div id="aivastra-save-toast" class="aivastra-toast" style="display:${showSaveToast ? 'block' : 'none'};">
      ✓ Contact info saved successfully!
    </div>

    <div class="aivastra-body">
      <div class="aivastra-card">
        ${avatarHtml}
        <div class="aivastra-contact-name">${displayName}</div>
        <div class="aivastra-contact-phone">📞 ${formattedPhone}</div>
      </div>

      <!-- 1. CALL ON TOP -->
      <div>
        <div class="aivastra-section-title">CALL</div>
        <div class="aivastra-btn-group-2">
          <button id="btn-call-yes" class="aivastra-btn ${activeFormData.callStatus === 'YES' ? 'active-call-yes' : ''}">Yes</button>
          <button id="btn-call-no" class="aivastra-btn ${activeFormData.callStatus === 'NO' ? 'active-call-no' : ''}">No</button>
        </div>
      </div>

      <!-- 2. LEAD STATUS BELOW CALL -->
      <div>
        <div class="aivastra-section-title">LEAD STATUS</div>
        <div class="aivastra-btn-group">
          <button id="btn-interested" class="aivastra-btn ${activeFormData.leadStatus === 'INTERESTED' ? 'active-interested' : ''}">👍 Interested</button>
          <button id="btn-warm" class="aivastra-btn ${activeFormData.leadStatus === 'WARM_INTERESTED' ? 'active-warm' : ''}">🔥 Warm</button>
          <button id="btn-not-interested" class="aivastra-btn ${activeFormData.leadStatus === 'NOT_INTERESTED' ? 'active-not-interested' : ''}">👎 Not Interested</button>
        </div>
      </div>

      <!-- 3. FOLLOW-UP SCHEDULE -->
      <div>
        <div class="aivastra-section-title">FOLLOW-UP SCHEDULE</div>
        <input type="date" id="aivastra-followup-date" class="aivastra-date-input" value="${activeFormData.followUpDate}" />
      </div>

      <!-- 4. EXTENDED CRM NOTES DOWNWARDS -->
      <div style="display: flex; flex-direction: column; flex: 1;">
        <div class="aivastra-section-title">CRM NOTES</div>
        <textarea id="aivastra-note-text" class="aivastra-notes-area" rows="3" style="min-height: 80px;" placeholder="Add key note about customer requirements..."></textarea>
        <button id="aivastra-add-note-btn" class="aivastra-add-note-btn">+ Add Note</button>

        <div id="aivastra-notes-list" style="margin-top: 10px; max-height: 140px; overflow-y: auto;">
          ${activeFormData.notesList.map((n, i) => `
            <div class="aivastra-note-item">
              <span style="flex:1; word-break: break-word;">${n}</span>
              <span class="aivastra-note-delete" data-index="${i}" title="Delete Note">🗑</span>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- 5. EXPLICIT SAVE BUTTON -->
      <div style="margin-top: auto; padding-top: 8px;">
        <button id="aivastra-save-main-btn" class="aivastra-save-btn">
          💾 Save Contact Info
        </button>
      </div>
    </div>
  `;

  if (showSaveToast) {
    setTimeout(() => {
      const toast = document.getElementById('aivastra-save-toast');
      if (toast) toast.style.display = 'none';
    }, 2000);
  }

  // Attach event listeners with instant visual state toggling
  document.getElementById('aivastra-close-btn').onclick = () => {
    isPanelVisible = false;
    panel.style.display = 'none';
  };

  document.getElementById('aivastra-clear-btn').onclick = () => {
    activeFormData = {
      leadStatus: 'UNASSIGNED',
      callStatus: null,
      followUpDate: '',
      notesList: []
    };
    saveCrmMetadata();
    renderCrmPanel(displayName, cleanPhone, avatarUrl);
  };

  document.getElementById('btn-call-yes').onclick = () => { 
    activeFormData.callStatus = 'YES';
    renderCrmPanel(displayName, cleanPhone, avatarUrl);
  };
  document.getElementById('btn-call-no').onclick = () => { 
    activeFormData.callStatus = 'NO';
    renderCrmPanel(displayName, cleanPhone, avatarUrl);
  };

  document.getElementById('btn-interested').onclick = () => { 
    activeFormData.leadStatus = 'INTERESTED';
    renderCrmPanel(displayName, cleanPhone, avatarUrl);
  };
  document.getElementById('btn-warm').onclick = () => { 
    activeFormData.leadStatus = 'WARM_INTERESTED';
    renderCrmPanel(displayName, cleanPhone, avatarUrl);
  };
  document.getElementById('btn-not-interested').onclick = () => { 
    activeFormData.leadStatus = 'NOT_INTERESTED';
    renderCrmPanel(displayName, cleanPhone, avatarUrl);
  };

  document.getElementById('aivastra-followup-date').onchange = (e) => { 
    activeFormData.followUpDate = e.target.value; 
  };

  document.getElementById('aivastra-add-note-btn').onclick = () => {
    const txt = document.getElementById('aivastra-note-text').value.trim();
    if (txt) {
      activeFormData.notesList.unshift(txt);
      document.getElementById('aivastra-note-text').value = '';
      renderCrmPanel(displayName, cleanPhone, avatarUrl);
    }
  };

  // Main Save Button Click Handler (PASS showSaveToast = true to renderCrmPanel!)
  document.getElementById('aivastra-save-main-btn').onclick = () => {
    const txt = document.getElementById('aivastra-note-text').value.trim();
    if (txt) {
      activeFormData.notesList.unshift(txt);
      document.getElementById('aivastra-note-text').value = '';
    }
    saveCrmMetadata();
    renderCrmPanel(displayName, cleanPhone, avatarUrl, true);
  };

  panel.querySelectorAll('.aivastra-note-delete').forEach(el => {
    el.onclick = (e) => {
      const idx = parseInt(e.target.getAttribute('data-index'));
      activeFormData.notesList.splice(idx, 1);
      renderCrmPanel(displayName, cleanPhone, avatarUrl);
    };
  });
}

// Start observing active chat changes
setTimeout(() => {
  ensureHeaderButton();
  detectActiveContact();
  injectChatListBadges();
  startChatObserver();
}, 1000);
