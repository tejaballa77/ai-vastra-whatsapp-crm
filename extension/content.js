// AI Vastra Chrome Extension - Injected Content Script on web.whatsapp.com
console.log('[AI Vastra Chrome Extension] Script active on WhatsApp Web!');

let activeContactKey = '';
let activeDisplayName = '';
let activePhoneClean = '';
let activeAvatarUrl = '';
let currentLeadStatus = 'UNASSIGNED';
let currentCallStatus = null;
let currentFollowUp = '';
let currentNotesList = [];
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
    const status = chatMeta?.leadStatus || (key === activeContactKey ? currentLeadStatus : null);

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

function detectActiveContact(force = false) {
  const mainHeader = document.querySelector('#main header');
  if (!mainHeader) return;

  ensureHeaderButton();

  // Find contact title in active chat
  const titleEl = mainHeader.querySelector('span[title]') || 
                  mainHeader.querySelector('span[dir="auto"]');
  if (!titleEl) return;

  const rawTitle = titleEl.getAttribute('title') || titleEl.textContent || '';
  if (!rawTitle) return;

  // Extract avatar image from header if available
  const imgEl = mainHeader.querySelector('img');
  let domAvatar = '';
  if (imgEl && imgEl.src && !imgEl.src.includes('data:image/svg')) {
    domAvatar = imgEl.src;
  }

  const cleanDigits = rawTitle.replace(/\D/g, '');
  const contactKey = cleanDigits.length >= 10 ? cleanDigits : rawTitle;

  if (activeContactKey !== contactKey || force) {
    activeContactKey = contactKey;
    activeDisplayName = rawTitle;
    activePhoneClean = cleanDigits;
    activeAvatarUrl = domAvatar;
    fetchCrmMetadata(contactKey, rawTitle, domAvatar);
  }
}

function fetchCrmMetadata(searchKey, displayName, domAvatar) {
  chrome.runtime.sendMessage({ action: 'FETCH_CRM_METADATA', phoneClean: searchKey }, (response) => {
    let resolvedPhone = activePhoneClean;
    let resolvedAvatar = domAvatar || activeAvatarUrl;

    if (response && response.success && response.chat) {
      const chat = response.chat;
      currentLeadStatus = chat.leadStatus || 'UNASSIGNED';
      currentCallStatus = chat.callStatus || null;
      currentFollowUp = chat.followUpDate || '';
      currentNotesList = chat.notesList || (chat.notes ? [chat.notes] : []);

      if (chat.phone) {
        resolvedPhone = chat.phone.replace(/\D/g, '');
      } else if (chat.jid) {
        const jidNum = chat.jid.split('@')[0].replace(/\D/g, '');
        if (jidNum.length >= 10) resolvedPhone = jidNum;
      }

      if (!resolvedAvatar && chat.avatarUrl) {
        resolvedAvatar = chat.avatarUrl;
      }

      // Cache metadata map for chat list badges
      chatsMetadataMap[searchKey] = chat;
      if (resolvedPhone) chatsMetadataMap[resolvedPhone] = chat;
      if (displayName) chatsMetadataMap[displayName] = chat;
    } else {
      currentLeadStatus = 'UNASSIGNED';
      currentCallStatus = null;
      currentFollowUp = '';
      currentNotesList = [];
    }

    activePhoneClean = resolvedPhone;
    activeAvatarUrl = resolvedAvatar;

    renderCrmPanel(displayName, resolvedPhone, resolvedAvatar);
    injectChatListBadges();
  });
}

function saveCrmMetadata() {
  const targetJid = activePhoneClean.length >= 10 
    ? `${activePhoneClean}@s.whatsapp.net` 
    : (activeContactKey.includes('@') ? activeContactKey : `${activeContactKey}@s.whatsapp.net`);

  // Update local metadata map immediately
  chatsMetadataMap[activeContactKey] = {
    leadStatus: currentLeadStatus,
    callStatus: currentCallStatus,
    followUpDate: currentFollowUp,
    notesList: currentNotesList
  };

  chrome.runtime.sendMessage({
    action: 'UPDATE_CRM_METADATA',
    jid: targetJid,
    data: {
      leadStatus: currentLeadStatus,
      callStatus: currentCallStatus,
      followUpDate: currentFollowUp || undefined,
      notes: currentNotesList.join('\n\n'),
      notesList: currentNotesList
    }
  });

  injectChatListBadges();
}

// Render Contact Info Panel with CALL on top, LEAD STATUS below, and extended CRM NOTES
function renderCrmPanel(displayName, cleanPhone, avatarUrl) {
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
          <button id="btn-call-yes" class="aivastra-btn ${currentCallStatus === 'YES' ? 'active-call-yes' : ''}">Yes</button>
          <button id="btn-call-no" class="aivastra-btn ${currentCallStatus === 'NO' ? 'active-call-no' : ''}">No</button>
        </div>
      </div>

      <!-- 2. LEAD STATUS BELOW CALL -->
      <div>
        <div class="aivastra-section-title">LEAD STATUS</div>
        <div class="aivastra-btn-group">
          <button id="btn-interested" class="aivastra-btn ${currentLeadStatus === 'INTERESTED' ? 'active-interested' : ''}">👍 Interested</button>
          <button id="btn-warm" class="aivastra-btn ${currentLeadStatus === 'WARM_INTERESTED' ? 'active-warm' : ''}">🔥 Warm</button>
          <button id="btn-not-interested" class="aivastra-btn ${currentLeadStatus === 'NOT_INTERESTED' ? 'active-not-interested' : ''}">👎 Not Interested</button>
        </div>
      </div>

      <!-- 3. FOLLOW-UP SCHEDULE -->
      <div>
        <div class="aivastra-section-title">FOLLOW-UP SCHEDULE</div>
        <input type="date" id="aivastra-followup-date" class="aivastra-date-input" value="${currentFollowUp}" />
      </div>

      <!-- 4. EXTENDED CRM NOTES DOWNWARDS -->
      <div style="display: flex; flex-direction: column; flex: 1;">
        <div class="aivastra-section-title">CRM NOTES</div>
        <textarea id="aivastra-note-text" class="aivastra-notes-area" rows="4" style="min-height: 100px;" placeholder="Add key note about customer requirements..."></textarea>
        <button id="aivastra-add-note-btn" class="aivastra-add-note-btn">+ Add Note</button>

        <div id="aivastra-notes-list" style="margin-top: 10px; max-height: 180px; overflow-y: auto;">
          ${currentNotesList.map((n, i) => `
            <div class="aivastra-note-item">
              <span style="flex:1; word-break: break-word;">${n}</span>
              <span class="aivastra-note-delete" data-index="${i}" title="Delete Note">🗑</span>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;

  // Attach event listeners
  document.getElementById('aivastra-close-btn').onclick = () => {
    isPanelVisible = false;
    panel.style.display = 'none';
  };

  document.getElementById('aivastra-clear-btn').onclick = () => {
    currentLeadStatus = 'UNASSIGNED';
    currentCallStatus = null;
    currentFollowUp = '';
    currentNotesList = [];
    saveCrmMetadata();
    renderCrmPanel(displayName, cleanPhone, avatarUrl);
  };

  document.getElementById('btn-call-yes').onclick = () => { currentCallStatus = 'YES'; saveCrmMetadata(); renderCrmPanel(displayName, cleanPhone, avatarUrl); };
  document.getElementById('btn-call-no').onclick = () => { currentCallStatus = 'NO'; saveCrmMetadata(); renderCrmPanel(displayName, cleanPhone, avatarUrl); };

  document.getElementById('btn-interested').onclick = () => { currentLeadStatus = 'INTERESTED'; saveCrmMetadata(); renderCrmPanel(displayName, cleanPhone, avatarUrl); };
  document.getElementById('btn-warm').onclick = () => { currentLeadStatus = 'WARM_INTERESTED'; saveCrmMetadata(); renderCrmPanel(displayName, cleanPhone, avatarUrl); };
  document.getElementById('btn-not-interested').onclick = () => { currentLeadStatus = 'NOT_INTERESTED'; saveCrmMetadata(); renderCrmPanel(displayName, cleanPhone, avatarUrl); };

  document.getElementById('aivastra-followup-date').onchange = (e) => { currentFollowUp = e.target.value; saveCrmMetadata(); };

  document.getElementById('aivastra-add-note-btn').onclick = () => {
    const txt = document.getElementById('aivastra-note-text').value.trim();
    if (txt) {
      currentNotesList.unshift(txt);
      document.getElementById('aivastra-note-text').value = '';
      saveCrmMetadata();
      renderCrmPanel(displayName, cleanPhone, avatarUrl);
    }
  };

  panel.querySelectorAll('.aivastra-note-delete').forEach(el => {
    el.onclick = (e) => {
      const idx = parseInt(e.target.getAttribute('data-index'));
      currentNotesList.splice(idx, 1);
      saveCrmMetadata();
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
