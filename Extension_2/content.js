// AI Vastra Unified Social CRM Extension Content Script (Instagram, LinkedIn, Facebook)
console.log('[AI Vastra Social CRM Extension] Active on social media!');

(function () {
  'use strict';

  const DEFAULT_API_BASE = 'https://crm.nicedigitalsgroup.com';

  // ─── Safe chrome.storage & messaging wrappers ───────────────────────────────

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

  // ─── State Variables ─────────────────────────────────────────────────────────

  let currentPlatform = 'instagram';
  let activeThreadId = '';
  let activeContactHandle = '';
  let activeDisplayName = '';
  let isPanelVisible = true;
  let fetchGeneration = 0;
  let isEditingProfile = false;
  let savedBtnPos = null;

  // Read session-level button hide state (survives tab reloads but not extension reloads)
  let isButtonHiddenTemp = false;
  try {
    isButtonHiddenTemp = sessionStorage.getItem('aivastra_btn_hidden') === 'true';
  } catch (e) {}

  let activeFormData = {
    leadStatus: 'UNASSIGNED',
    callStatus: null,
    followUpDate: '',
    assignedUser: '',
    clientLanguage: '',
    notesList: []
  };

  // ─── Platform Utilities ───────────────────────────────────────────────────────

  function detectPlatform() {
    const host = window.location.hostname.toLowerCase();
    if (host.includes('instagram.com')) return 'instagram';
    if (host.includes('linkedin.com')) return 'linkedin';
    if (host.includes('facebook.com') || host.includes('messenger.com')) return 'facebook';
    return 'instagram';
  }

  function getPlatformInfo(platform) {
    if (platform === 'instagram') return { title: 'Instagram CRM', icon: '📸', jidSuffix: 'instagram' };
    if (platform === 'linkedin') return { title: 'LinkedIn CRM', icon: '💼', jidSuffix: 'linkedin' };
    if (platform === 'facebook') return { title: 'Facebook CRM', icon: '📘', jidSuffix: 'facebook' };
    return { title: 'Social CRM', icon: '⚡', jidSuffix: 'social' };
  }

  // Extract Thread ID or Active Chat Identifier across Instagram, LinkedIn, and Facebook
  function extractSocialThreadId(platform) {
    const pathname = window.location.pathname;

    if (platform === 'instagram') {
      const pathParts = pathname.split('/').filter(Boolean);
      for (let i = 0; i < pathParts.length; i++) {
        if (pathParts[i] === 't' && pathParts[i + 1]) {
          return pathParts[i + 1];
        }
      }
    }

    if (platform === 'facebook') {
      const match = pathname.match(/\/(messages|t)\/t\/([^/]+)/) || pathname.match(/\/t\/([^/]+)/) || pathname.match(/\/messages\/t\/([^/]+)/);
      if (match) return match[2] || match[1];
    }

    if (platform === 'linkedin') {
      // 1. URL check: /messaging/thread/2-XYZ/ or /messaging/thread/123/
      const match = pathname.match(/\/messaging\/thread\/([^/]+)/);
      if (match) return match[1];

      // 2. Active conversation in LinkedIn thread list
      const activeListCard = document.querySelector('.msg-conversation-listitem--active, [aria-selected="true"].msg-conversation-card, .msg-conversation-card--active');
      if (activeListCard) {
        const titleEl = activeListCard.querySelector('.msg-conversation-card__participant-names, .msg-entity-lockup__title, h3, .artdeco-entity-lockup__title');
        if (titleEl && titleEl.textContent.trim()) {
          return 'li_' + titleEl.textContent.trim().toLowerCase().replace(/\s+/g, '_');
        }
      }

      // 3. Header title in main messaging pane
      const mainHeader = document.querySelector('.msg-title_title, .msg-entity-lockup__title, .msg-thread__name, .msg-overlay-bubble-header__title, .artdeco-entity-lockup__title');
      if (mainHeader && mainHeader.textContent.trim()) {
        return 'li_' + mainHeader.textContent.trim().toLowerCase().replace(/\s+/g, '_');
      }
    }

    return '';
  }

  function formatDateToIso(dateStr) {
    if (!dateStr) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
    const parts = dateStr.split('/');
    if (parts.length === 3) {
      return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
    return dateStr;
  }

  // ─── Drag-and-Drop Profile Parser ────────────────────────────────────────────

  function parseDraggedProfileData(dragText) {
    let extractedHandle = '';
    let extractedName = '';

    if (!dragText) return { handle: '', name: '' };

    let rawText = dragText.replace(/<[^>]+>/g, '\n').trim();

    const urlMatch = rawText.match(/https?:\/\/(www\.)?instagram\.com\/([a-zA-Z0-9._]{2,30})\/?/i);
    if (urlMatch && urlMatch[2]) {
      const candidate = urlMatch[2].toLowerCase();
      if (!['direct', 'inbox', 't', 'explore', 'reels', 'stories', 'p'].includes(candidate)) {
        extractedHandle = urlMatch[2];
      }
    }

    let cleanText = rawText.replace(/https?:\/\/[^\s]+/g, '').trim();
    const parts = cleanText.split(/[\n\r\t]+/).map(p => p.trim()).filter(Boolean);

    if (parts.length >= 2) {
      extractedName = parts[0];
      if (!extractedHandle) {
        const handleCand = parts.find(p => !p.includes(' ') && /^[a-zA-Z0-9._]{2,30}$/.test(p.replace(/^@/, '')));
        if (handleCand) extractedHandle = handleCand.replace(/^@/, '');
      }
      if (extractedName && extractedName.toLowerCase() === (extractedHandle || '').toLowerCase() && parts[1]) {
        extractedName = parts[1];
      }
    } else if (parts.length === 1) {
      const single = parts[0];
      const words = single.split(/\s+/);
      if (words.length >= 2) {
        const hCand = words.find(w => /^[a-zA-Z0-9._]{2,30}$/.test(w.replace(/^@/, '')) && !/^\d+$/.test(w));
        if (hCand) extractedHandle = hCand.replace(/^@/, '');
        extractedName = single.replace(hCand || '', '').trim() || single;
      } else {
        const cleanedSingle = single.replace(/^@/, '');
        if (!extractedHandle && /^[a-zA-Z0-9._]{2,30}$/.test(cleanedSingle)) {
          extractedHandle = cleanedSingle;
          extractedName = cleanedSingle;
        } else {
          extractedName = single;
        }
      }
    }

    if (extractedHandle && !extractedName) extractedName = extractedHandle;
    if (!extractedHandle && extractedName) {
      extractedHandle = extractedName.toLowerCase().replace(/[^a-z0-9._]/g, '_').replace(/^[._]+|[._]+$/g, '');
    }

    return { handle: extractedHandle.replace(/^@/, ''), name: extractedName };
  }

  // ─── Automatic Social Header Scraper ──────────────────────────────────────────

  function scrapePlatformHeader(platform) {
    let handle = '';
    let name = '';

    if (platform === 'instagram') {
      const links = document.querySelectorAll('header a[href*="/"], div[role="main"] header a[href*="/"], section header a[href*="/"]');
      for (const link of links) {
        const href = link.getAttribute('href') || '';
        const match = href.match(/^\/([a-zA-Z0-9._]{2,30})\/?$/);
        if (match && match[1]) {
          const cand = match[1].toLowerCase();
          if (!['direct', 'inbox', 'explore', 'reels', 'stories', 'p'].includes(cand)) {
            handle = match[1];
            if (link.textContent && link.textContent.trim()) {
              name = link.textContent.trim();
            }
            break;
          }
        }
      }
      if (!name) {
        const headerTitle = document.querySelector('header span[dir="auto"], div[role="main"] header span, header h1, header h2');
        if (headerTitle && headerTitle.textContent.trim()) {
          const text = headerTitle.textContent.trim();
          if (!text.includes('Direct') && !text.includes('Inbox') && text.length <= 40) {
            name = text;
          }
        }
      }
    } else if (platform === 'linkedin') {
      const activeCard = document.querySelector('.msg-conversation-listitem--active, [aria-selected="true"].msg-conversation-card, .msg-conversation-card--active');
      if (activeCard) {
        const titleEl = activeCard.querySelector('.msg-conversation-card__participant-names, .msg-entity-lockup__title, h3, .artdeco-entity-lockup__title');
        if (titleEl && titleEl.textContent.trim()) {
          name = titleEl.textContent.trim();
        }
      }
      if (!name) {
        const mainHeader = document.querySelector('.msg-title_title, .msg-entity-lockup__title, .msg-thread__name, .msg-overlay-bubble-header__title, .artdeco-entity-lockup__title');
        if (mainHeader && mainHeader.textContent.trim()) {
          name = mainHeader.textContent.trim();
        }
      }
    } else if (platform === 'facebook') {
      const headerTitle = document.querySelector('div[role="main"] h2, div[role="main"] header span, div[role="navigation"] [aria-selected="true"] span');
      if (headerTitle && headerTitle.textContent.trim()) {
        name = headerTitle.textContent.trim();
      }
    }

    if (handle && !name) name = handle;
    if (!handle && name) handle = name.toLowerCase().replace(/[^a-z0-9._]/g, '_').replace(/^[._]+|[._]+$/g, '');

    return { handle, name };
  }

  // ─── Context Menu for Header Button ──────────────────────────────────────────

  function removeBtnContextMenu() {
    const existing = document.getElementById('aivastra-header-btn-contextmenu');
    if (existing) existing.remove();
  }

  function showBtnContextMenu(x, y) {
    removeBtnContextMenu();

    const menu = document.createElement('div');
    menu.id = 'aivastra-header-btn-contextmenu';

    const menuWidth = 230;
    const menuHeight = 110;
    const left = Math.min(x, window.innerWidth - menuWidth - 10);
    const top = Math.min(y, window.innerHeight - menuHeight - 10);

    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    menu.style.position = 'fixed';
    menu.style.zIndex = '9999999';
    menu.style.background = '#fff';
    menu.style.borderRadius = '8px';
    menu.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
    menu.style.padding = '8px';

    menu.innerHTML = `
      <div style="padding:4px 8px 6px;font-size:10px;font-weight:800;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #f3f4f6;margin-bottom:4px;">
        ⚡ AI CRM Settings
      </div>
      <button class="aivastra-ctx-item danger" id="aivastra-ctx-remove-btn" style="display:block;width:100%;text-align:left;padding:8px;border:none;background:none;cursor:pointer;color:#dc2626;font-size:12px;">
        ❌ Remove Button (Temporarily)
      </button>
      <button class="aivastra-ctx-item" id="aivastra-ctx-reset-btn" style="display:block;width:100%;text-align:left;padding:8px;border:none;background:none;cursor:pointer;font-size:12px;">
        📍 Reset Button Position
      </button>
    `;

    document.body.appendChild(menu);

    const removeBtn = menu.querySelector('#aivastra-ctx-remove-btn');
    if (removeBtn) {
      removeBtn.onclick = (e) => {
        e.stopPropagation();
        isButtonHiddenTemp = true;
        try { sessionStorage.setItem('aivastra_btn_hidden', 'true'); } catch (err) {}

        const b = document.getElementById('aivastra-header-toggle-btn');
        if (b) b.style.display = 'none';

        const p = document.getElementById('aivastra-social-panel');
        if (p) p.style.display = 'none';

        removeBtnContextMenu();
      };
    }

    const resetBtn = menu.querySelector('#aivastra-ctx-reset-btn');
    if (resetBtn) {
      resetBtn.onclick = (e) => {
        e.stopPropagation();
        savedBtnPos = null;
        safeStorageSet({ crm_btn_position: null });

        const b = document.getElementById('aivastra-header-toggle-btn');
        if (b) {
          b.style.top = '14px';
          b.style.left = '240px';
          b.style.right = 'auto';
        }
        removeBtnContextMenu();
      };
    }

    const closeHandler = (evt) => {
      if (!menu.contains(evt.target)) {
        removeBtnContextMenu();
        document.removeEventListener('click', closeHandler);
      }
    };
    setTimeout(() => { document.addEventListener('click', closeHandler); }, 10);
  }

  // ─── Header AI CRM Button ──────────────────────────────────────────────────

  function ensureHeaderButton() {
    if (isButtonHiddenTemp) return;

    let btn = document.getElementById('aivastra-header-toggle-btn');
    if (!btn) {
      btn = document.createElement('button');
      btn.id = 'aivastra-header-toggle-btn';
      btn.style.position = 'fixed';
      btn.style.zIndex = '9999998';
      btn.style.top = '14px';
      btn.style.left = '240px';
      btn.innerHTML = `<span style="font-size:11px;opacity:0.8;margin-right:2px;cursor:grab;">⋮⋮</span><span>⚡</span> <span>AI CRM</span>`;
      btn.style.cursor = 'grab';

      safeStorageGet(['crm_btn_position'], (res) => {
        if (res && res.crm_btn_position) {
          savedBtnPos = res.crm_btn_position;
          btn.style.top = `${savedBtnPos.top}px`;
          btn.style.left = `${savedBtnPos.left}px`;
        }
      });

      let isDragging = false;
      let startX = 0, startY = 0, initialLeft = 0, initialTop = 0, hasDraggedMoved = false;

      btn.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        isDragging = true;
        hasDraggedMoved = false;
        startX = e.clientX;
        startY = e.clientY;
        const rect = btn.getBoundingClientRect();
        initialLeft = rect.left;
        initialTop = rect.top;
        btn.style.cursor = 'grabbing';
      });

      window.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) hasDraggedMoved = true;
        btn.style.left = `${initialLeft + dx}px`;
        btn.style.top = `${initialTop + dy}px`;
        btn.style.right = 'auto';
      });

      window.addEventListener('mouseup', () => {
        if (isDragging) {
          isDragging = false;
          btn.style.cursor = 'grab';
          if (hasDraggedMoved) {
            const rect = btn.getBoundingClientRect();
            savedBtnPos = { top: Math.round(rect.top), left: Math.round(rect.left) };
            safeStorageSet({ crm_btn_position: savedBtnPos });
          }
        }
      });

      btn.addEventListener('click', (e) => {
        if (hasDraggedMoved) { e.preventDefault(); e.stopPropagation(); return; }
        isPanelVisible = !isPanelVisible;
        const panel = document.getElementById('aivastra-social-panel');
        if (panel) panel.style.display = isPanelVisible ? 'flex' : 'none';
        if (isPanelVisible) detectActiveContact(true);
      });

      btn.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showBtnContextMenu(e.clientX, e.clientY);
      });

      document.body.appendChild(btn);
    }
  }

  // ─── Panel Container ──────────────────────────────────────────────────────────

  function ensurePanel() {
    let panel = document.getElementById('aivastra-social-panel');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'aivastra-social-panel';
      panel.style.position = 'fixed';
      panel.style.zIndex = '9999999';
      panel.style.top = '60px';
      panel.style.right = '20px';
      panel.style.width = '300px';
      panel.style.background = '#fff';
      document.body.appendChild(panel);
    }
    panel.style.display = isPanelVisible ? 'flex' : 'none';
    return panel;
  }

  // ─── Contact Detection & Data Fetching ───────────────────────────────────────

  function detectActiveContact(force) {
    ensureHeaderButton();
    const platform = detectPlatform();
    const threadId = extractSocialThreadId(platform);
    const isNewThread = Boolean(threadId && activeThreadId !== threadId);

    if (isNewThread || force) {
      if (threadId) activeThreadId = threadId;
      currentPlatform = platform;
      isEditingProfile = false;

      if (isNewThread || !activeContactHandle) {
        const scraped = scrapePlatformHeader(platform);
        if (scraped.handle) activeContactHandle = scraped.handle;
        if (scraped.name && (!activeDisplayName || activeDisplayName === activeContactHandle)) {
          activeDisplayName = scraped.name;
        }
        if (isNewThread) {
          activeFormData = {
            leadStatus: 'UNASSIGNED',
            callStatus: null,
            followUpDate: '',
            assignedUser: '',
            clientLanguage: '',
            notesList: []
          };
        }
      }

      renderPanel(activeDisplayName, null);
      fetchGeneration++;
      fetchCrmDataForThread(threadId, platform, fetchGeneration);
    }
  }

  function fetchCrmDataForThread(threadId, platform, generation) {
    if (!threadId && !activeContactHandle) {
      renderPanel('', null);
      return;
    }

    const threadStorageKey = threadId ? `crm_social_thread_${threadId}` : '';
    const lookupKeys = threadStorageKey ? [threadStorageKey] : [];

    safeStorageGet(lookupKeys, (localRes) => {
      if (generation !== fetchGeneration) return;

      const cached = threadStorageKey ? (localRes && localRes[threadStorageKey]) : null;
      if (cached) {
        activeFormData = {
          leadStatus: cached.leadStatus || 'UNASSIGNED',
          callStatus: cached.callStatus || null,
          followUpDate: cached.followUpDate || '',
          assignedUser: cached.assignedUser || cached.calledBy || '',
          clientLanguage: cached.clientLanguage || cached.language || '',
          notesList: cached.notesList || (cached.notes ? [cached.notes] : [])
        };
        if (cached.name) activeDisplayName = cached.name;
        if (cached.phone) activeContactHandle = cached.phone;
        renderPanel(activeDisplayName, null);
      }

      safeSendMessage({ action: 'FETCH_CONTACT_DATA', identifier: threadId || activeContactHandle }, (backendRes) => {
        if (generation !== fetchGeneration) return;

        if (backendRes && backendRes.success && backendRes.contact) {
          const c = backendRes.contact;
          activeFormData = {
            leadStatus: c.leadStatus || activeFormData.leadStatus || 'UNASSIGNED',
            callStatus: c.callStatus !== undefined ? c.callStatus : activeFormData.callStatus,
            followUpDate: c.followUpDate || activeFormData.followUpDate || '',
            assignedUser: c.assignedUser || c.calledBy || activeFormData.assignedUser || '',
            clientLanguage: c.clientLanguage || c.language || activeFormData.clientLanguage || '',
            notesList: c.notesList || (c.notes ? [c.notes] : activeFormData.notesList)
          };
          if (c.name) activeDisplayName = c.name;
          if (c.phone) activeContactHandle = c.phone;
        }
        renderPanel(activeDisplayName, null);
      });
    });
  }

  // ─── Save CRM Data ────────────────────────────────────────────────────────────

  function saveCrmData(fromDrop) {
    const panel = document.getElementById('aivastra-social-panel');

    if (!fromDrop) {
      const nameInput = panel ? panel.querySelector('#aivastra-contact-name-edit') : null;
      const handleInput = panel ? panel.querySelector('#aivastra-contact-handle-edit') : null;
      if (nameInput && nameInput.value.trim()) activeDisplayName = nameInput.value.trim();
      if (handleInput && handleInput.value.trim()) activeContactHandle = handleInput.value.trim().replace(/^@/, '');
    }

    if (!activeContactHandle && activeDisplayName) {
      activeContactHandle = activeDisplayName.toLowerCase().replace(/[^a-z0-9._]/g, '_');
    }
    if (!activeDisplayName && activeContactHandle) {
      activeDisplayName = activeContactHandle;
    }

    if (!activeContactHandle && !activeDisplayName) {
      const scraped = scrapePlatformHeader(currentPlatform);
      if (scraped.handle) activeContactHandle = scraped.handle;
      if (scraped.name) activeDisplayName = scraped.name;
    }

    const canonicalJid = `${activeContactHandle || activeThreadId}@${currentPlatform}`;
    const dateEl = panel ? panel.querySelector('#aivastra-followup-date') : null;
    const bdmEl = panel ? panel.querySelector('#aivastra-bdm-user') : null;
    const langEl = panel ? panel.querySelector('#aivastra-language') : null;

    activeFormData.followUpDate = dateEl ? dateEl.value : activeFormData.followUpDate;
    activeFormData.assignedUser = bdmEl ? bdmEl.value : activeFormData.assignedUser;
    activeFormData.clientLanguage = langEl ? langEl.value : activeFormData.clientLanguage;

    const payload = {
      jid: canonicalJid,
      threadId: activeThreadId,
      name: activeDisplayName,
      phone: activeContactHandle,
      leadStatus: activeFormData.leadStatus,
      callStatus: activeFormData.callStatus,
      followUpDate: activeFormData.followUpDate,
      assignedUser: activeFormData.assignedUser,
      calledBy: activeFormData.assignedUser,
      clientLanguage: activeFormData.clientLanguage,
      notes: (activeFormData.notesList || []).join('\n\n'),
      notesList: activeFormData.notesList || [],
      manuallySaved: true,
      updatedAt: Date.now()
    };

    const saveObj = {};
    if (activeThreadId) saveObj[`crm_social_thread_${activeThreadId}`] = payload;
    if (activeContactHandle) saveObj[`crm_social_${activeContactHandle}@${currentPlatform}`] = payload;
    safeStorageSet(saveObj);

    try {
      fetch(`${DEFAULT_API_BASE}/api/crm/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).catch(() => {});
    } catch (e) {}

    safeSendMessage({ action: 'UPDATE_CRM_METADATA', payload }, () => {});

    isEditingProfile = false;
    renderPanel(activeDisplayName, 'SAVED');
  }

  // ─── Confirm Modal ────────────────────────────────────────────────────────────

  function showConfirmModal(title, message, onConfirm) {
    const existing = document.getElementById('aivastra-custom-confirm-modal');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'aivastra-custom-confirm-modal';
    overlay.style.cssText = `
      position: fixed; inset: 0; z-index: 9999999;
      background: rgba(0,0,0,0.6); backdrop-filter: blur(2px);
      display: flex; align-items: center; justify-content: center; padding: 16px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    `;

    overlay.innerHTML = `
      <div style="background:#ffffff;width:100%;max-width:340px;border-radius:18px;
        padding:22px;box-shadow:0 20px 25px -5px rgba(0,0,0,0.15);
        text-align:center;border:1px solid #e5e7eb;">
        <div style="width:44px;height:44px;border-radius:50%;background:#ffeef0;
          color:#e53935;display:flex;align-items:center;justify-content:center;
          margin:0 auto 12px;font-size:20px;font-weight:bold;">🧹</div>
        <h3 style="font-size:16px;font-weight:800;color:#111b21;margin:0 0 6px;">${title}</h3>
        <p style="font-size:12px;color:#667781;line-height:1.5;margin:0 0 18px;">${message}</p>
        <div style="display:flex;gap:10px;justify-content:center;">
          <button id="aivastra-modal-cancel-btn" style="flex:1;padding:9px 12px;background:#f0f2f5;
            color:#111b21;border:1px solid #e9edef;border-radius:10px;font-size:12px;
            font-weight:700;cursor:pointer;">Cancel</button>
          <button id="aivastra-modal-confirm-btn" style="flex:1;padding:9px 12px;background:#dc2626;
            color:#ffffff;border:none;border-radius:10px;font-size:12px;
            font-weight:700;cursor:pointer;">Yes, Clear</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const cancelBtn = overlay.querySelector('#aivastra-modal-cancel-btn');
    if (cancelBtn) cancelBtn.onclick = () => overlay.remove();

    const confirmBtn = overlay.querySelector('#aivastra-modal-confirm-btn');
    if (confirmBtn) {
      confirmBtn.onclick = () => {
        overlay.remove();
        onConfirm();
      };
    }
  }

  // ─── Render Panel ─────────────────────────────────────────────────────────────

  function renderPanel(displayName, toastType) {
    const panel = ensurePanel();
    const info = getPlatformInfo(currentPlatform);
    const hasProfile = Boolean(activeContactHandle || activeDisplayName);
    const initial = (activeDisplayName || activeContactHandle || '?').replace(/^[^a-zA-Z0-9]/, '').charAt(0).toUpperCase() || '?';

    let cardContentHtml = '';

    if (!hasProfile || isEditingProfile) {
      cardContentHtml = `
        <div id="aivastra-small-drop-zone" class="aivastra-small-drop-zone">
          <div style="font-size:16px;font-weight:bold;color:#00a884;line-height:1;">+</div>
          <div style="font-size:11px;font-weight:700;color:#374151;margin-top:2px;">Add Account name and Username</div>
        </div>
        <div style="width:100%;display:flex;flex-direction:column;gap:6px;margin-top:4px;">
          <input type="text" id="aivastra-contact-name-edit" class="aivastra-text-input"
            style="font-size:12px;font-weight:600;text-align:center;background:#ffffff;color:#6b7280;"
            placeholder="Account Name"
            value="${activeDisplayName || ''}" />
          <input type="text" id="aivastra-contact-handle-edit" class="aivastra-text-input"
            style="font-size:11px;font-weight:600;text-align:center;background:#ffffff;color:#6b7280;"
            placeholder="Username (e.g. @username)"
            value="${activeContactHandle ? '@' + activeContactHandle.replace(/^@/, '') : ''}" />
        </div>
      `;
    } else {
      cardContentHtml = `
        <div class="aivastra-avatar-circle">${initial}</div>
        <div class="aivastra-contact-name">${activeDisplayName}</div>
        <div class="aivastra-contact-handle">@${activeContactHandle}</div>
        <button id="aivastra-reedit-btn" style="background:none;border:none;color:#00a884;font-size:11px;
          font-weight:700;cursor:pointer;margin-top:4px;text-decoration:underline;">✏️ Re-drop / Edit Profile</button>
      `;
    }

    panel.innerHTML = `
      <div class="aivastra-header">
        <div style="display:flex;align-items:center;gap:6px;">
          <span style="color:#00a884;font-size:16px;">⚡</span>
          <span>${info.title}</span>
        </div>
        <div style="display:flex;align-items:center;gap:6px;">
          <button id="aivastra-clear-btn" class="aivastra-clear-btn" title="Clear all CRM data">🧹 Clear</button>
          <button id="aivastra-close-btn" class="aivastra-close-btn">✕</button>
        </div>
      </div>

      <div id="aivastra-save-toast" class="aivastra-toast"
        style="display:${toastType ? 'block' : 'none'};background:${toastType === 'CLEARED' ? '#ef4444' : '#00a884'};">
        ${toastType === 'CLEARED' ? '🗑️ Contact CRM data cleared!' : '✓ Contact info saved successfully!'}
      </div>

      <div class="aivastra-body">
        <div class="aivastra-card">
          ${cardContentHtml}
        </div>

        <div>
          <div class="aivastra-section-title">LEAD STATUS</div>
          <div class="aivastra-btn-group">
            <button id="btn-interested" class="aivastra-btn ${activeFormData.leadStatus === 'INTERESTED' ? 'active-interested' : ''}">👍 Interested</button>
            <button id="btn-warm" class="aivastra-btn ${activeFormData.leadStatus === 'WARM' ? 'active-warm' : ''}">🔥 Warm</button>
            <button id="btn-not-interested" class="aivastra-btn ${activeFormData.leadStatus === 'NOT_INTERESTED' ? 'active-not-interested' : ''}">👎 Not Interested</button>
          </div>
        </div>

        <div>
          <div class="aivastra-section-title">FOLLOW-UP SCHEDULE</div>
          <input type="date" id="aivastra-followup-date" class="aivastra-date-input" value="${formatDateToIso(activeFormData.followUpDate)}" />
          <div class="aivastra-date-chips">
            <div class="aivastra-chip" data-days="0">Today</div>
            <div class="aivastra-chip" data-days="1">Tomorrow</div>
            <div class="aivastra-chip" data-days="3">+3 Days</div>
            <div class="aivastra-chip" data-days="7">+1 Week</div>
          </div>
        </div>

        <div>
          <div class="aivastra-section-title">BDM &amp; LANGUAGE</div>
          <div style="display:flex;gap:8px;">
            <input type="text" id="aivastra-bdm-user" class="aivastra-text-input"
              style="flex:1;color:#6b7280;font-weight:600;" placeholder="BDM Name"
              value="${activeFormData.assignedUser || ''}" />
            <select id="aivastra-language" class="aivastra-select-input" style="flex:1;color:#6b7280;font-weight:600;">
              <option value="">-- Language --</option>
              <option value="Telugu" ${activeFormData.clientLanguage === 'Telugu' ? 'selected' : ''}>Telugu</option>
              <option value="Hindi" ${activeFormData.clientLanguage === 'Hindi' ? 'selected' : ''}>Hindi</option>
              <option value="English" ${activeFormData.clientLanguage === 'English' ? 'selected' : ''}>English</option>
            </select>
          </div>
        </div>

        <div style="display:flex;flex-direction:column;flex:1;">
          <div class="aivastra-section-title">CRM NOTES</div>
          <textarea id="aivastra-note-text" class="aivastra-notes-area" placeholder="Add key note about customer requirements..."></textarea>
          <button id="aivastra-add-note-btn" class="aivastra-add-note-btn">+ Add Note</button>
          <div id="aivastra-notes-list" style="margin-top:8px;max-height:140px;overflow-y:auto;">
            ${(activeFormData.notesList || []).map((n, i) => `
              <div class="aivastra-note-item">
                <span style="flex:1;word-break:break-word;font-size:12px;line-height:1.4;color:#111;">${i + 1}. ${n}</span>
                <button data-note-index="${i}" class="aivastra-note-delete" title="Delete note">🗑️</button>
              </div>
            `).join('')}
          </div>
        </div>

        <div style="margin-top:auto;padding-top:8px;">
          <button id="aivastra-save-main-btn" class="aivastra-save-btn">💾 Save Contact Info</button>
        </div>
      </div>
    `;

    // Auto-hide toast
    if (toastType) {
      setTimeout(() => {
        const toast = panel.querySelector('#aivastra-save-toast');
        if (toast) toast.style.display = 'none';
      }, 2200);
    }

    // ── Attach all event handlers (scoped to panel) ──

    // Re-edit button
    const reeditBtn = panel.querySelector('#aivastra-reedit-btn');
    if (reeditBtn) {
      reeditBtn.onclick = () => {
        isEditingProfile = true;
        renderPanel(activeDisplayName);
      };
    }

    // Close button
    const closeBtn = panel.querySelector('#aivastra-close-btn');
    if (closeBtn) {
      closeBtn.onclick = () => {
        isPanelVisible = false;
        panel.style.display = 'none';
      };
    }

    // Clear button
    const clearBtn = panel.querySelector('#aivastra-clear-btn');
    if (clearBtn) {
      clearBtn.onclick = () => {
        showConfirmModal('Clear CRM Data', `Are you sure you want to clear CRM info for ${displayName || 'this contact'}?`, () => {
          activeFormData = {
            leadStatus: 'UNASSIGNED',
            callStatus: null,
            followUpDate: '',
            assignedUser: '',
            clientLanguage: '',
            notesList: []
          };
          activeContactHandle = '';
          activeDisplayName = '';
          isEditingProfile = false;

          const saveObj = {};
          if (activeThreadId) saveObj[`crm_social_thread_${activeThreadId}`] = null;
          safeStorageSet(saveObj);

          renderPanel('', 'CLEARED');
        });
      };
    }

    // ── Helper to sync current DOM input values into in-memory state before any re-render ──
    const syncCurrentInputsToState = () => {
      const bdmEl = panel.querySelector('#aivastra-bdm-user');
      const langEl = panel.querySelector('#aivastra-language');
      const dateEl = panel.querySelector('#aivastra-followup-date');
      const nameInput = panel.querySelector('#aivastra-contact-name-edit');
      const handleInput = panel.querySelector('#aivastra-contact-handle-edit');

      if (bdmEl) activeFormData.assignedUser = bdmEl.value;
      if (langEl) activeFormData.clientLanguage = langEl.value;
      if (dateEl && dateEl.value) activeFormData.followUpDate = dateEl.value;
      if (nameInput && nameInput.value.trim()) activeDisplayName = nameInput.value.trim();
      if (handleInput && handleInput.value.trim()) activeContactHandle = handleInput.value.trim().replace(/^@/, '');
    };

    // Live input listeners so inputs are instantly remembered
    const bdmInput = panel.querySelector('#aivastra-bdm-user');
    if (bdmInput) {
      bdmInput.oninput = () => { activeFormData.assignedUser = bdmInput.value; };
    }
    const langSelect = panel.querySelector('#aivastra-language');
    if (langSelect) {
      langSelect.onchange = () => { activeFormData.clientLanguage = langSelect.value; };
    }
    const dateInput = panel.querySelector('#aivastra-followup-date');
    if (dateInput) {
      dateInput.onchange = () => { activeFormData.followUpDate = dateInput.value; };
    }

    // Lead Status buttons
    const btnInterested = panel.querySelector('#btn-interested');
    if (btnInterested) {
      btnInterested.onclick = () => {
        syncCurrentInputsToState();
        activeFormData.leadStatus = activeFormData.leadStatus === 'INTERESTED' ? 'UNASSIGNED' : 'INTERESTED';
        renderPanel(displayName);
      };
    }

    const btnWarm = panel.querySelector('#btn-warm');
    if (btnWarm) {
      btnWarm.onclick = () => {
        syncCurrentInputsToState();
        activeFormData.leadStatus = activeFormData.leadStatus === 'WARM' ? 'UNASSIGNED' : 'WARM';
        renderPanel(displayName);
      };
    }

    const btnNotInterested = panel.querySelector('#btn-not-interested');
    if (btnNotInterested) {
      btnNotInterested.onclick = () => {
        syncCurrentInputsToState();
        activeFormData.leadStatus = activeFormData.leadStatus === 'NOT_INTERESTED' ? 'UNASSIGNED' : 'NOT_INTERESTED';
        renderPanel(displayName);
      };
    }

    // Date chips
    panel.querySelectorAll('.aivastra-chip').forEach((chip) => {
      chip.onclick = () => {
        syncCurrentInputsToState();
        const days = parseInt(chip.getAttribute('data-days') || '0', 10);
        const d = new Date();
        d.setDate(d.getDate() + days);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        activeFormData.followUpDate = `${yyyy}-${mm}-${dd}`;
        const input = panel.querySelector('#aivastra-followup-date');
        if (input) input.value = activeFormData.followUpDate;
      };
    });

    // Add Note button — auto-appends (DD-MM-YYYY) and PRESERVES BDM & Language inputs without re-rendering HTML!
    const addNoteBtn = panel.querySelector('#aivastra-add-note-btn');
    if (addNoteBtn) {
      addNoteBtn.onclick = () => {
        syncCurrentInputsToState();
        const area = panel.querySelector('#aivastra-note-text');
        const val = area ? area.value.trim() : '';
        if (val) {
          const now = new Date();
          const dd = String(now.getDate()).padStart(2, '0');
          const mm = String(now.getMonth() + 1).padStart(2, '0');
          const yyyy = now.getFullYear();
          const dateStr = `(${dd}-${mm}-${yyyy})`;

          const noteWithDate = /\(\d{2}-\d{2}-\d{4}\)$/.test(val) ? val : `${val} ${dateStr}`;

          if (!activeFormData.notesList) activeFormData.notesList = [];
          activeFormData.notesList.push(noteWithDate);
          area.value = '';

          // Directly append new note to notes list DOM element so BDM and Language inputs are NEVER replaced or wiped
          const listEl = panel.querySelector('#aivastra-notes-list');
          if (listEl) {
            const idx = activeFormData.notesList.length - 1;
            const item = document.createElement('div');
            item.className = 'aivastra-note-item';
            item.style.cssText = 'display:flex;align-items:flex-start;gap:6px;padding:6px 8px;background:#f7f7f7;border-radius:6px;margin-bottom:4px;border:1px solid #e5e5e5;';
            item.innerHTML = `
              <span style="flex:1;word-break:break-word;font-size:12px;line-height:1.4;color:#111;">${idx + 1}. ${noteWithDate}</span>
              <button data-note-index="${idx}" class="aivastra-note-delete" title="Delete note" style="background:none;border:none;cursor:pointer;color:#cc0000;font-size:13px;">🗑️</button>
            `;
            const delBtn = item.querySelector('.aivastra-note-delete');
            if (delBtn) {
              delBtn.onclick = () => {
                syncCurrentInputsToState();
                activeFormData.notesList.splice(idx, 1);
                item.remove();
              };
            }
            listEl.appendChild(item);
          }
        }
      };
    }

    // Delete note buttons
    panel.querySelectorAll('.aivastra-note-delete').forEach((btn) => {
      btn.onclick = () => {
        syncCurrentInputsToState();
        const idx = parseInt(btn.getAttribute('data-note-index'), 10);
        if (!isNaN(idx) && activeFormData.notesList) {
          activeFormData.notesList.splice(idx, 1);
          renderPanel(displayName);
        }
      };
    });

    // Save button
    const saveMainBtn = panel.querySelector('#aivastra-save-main-btn');
    if (saveMainBtn) {
      saveMainBtn.onclick = () => saveCrmData(false);
    }

    // ── Drag-and-drop onto card / drop zone ──
    const dropTargets = [
      panel.querySelector('#aivastra-small-drop-zone'),
      panel.querySelector('.aivastra-card'),
      panel.querySelector('#aivastra-contact-name-edit'),
      panel.querySelector('#aivastra-contact-handle-edit')
    ].filter(Boolean);

    const handleDrop = (e) => {
      e.preventDefault();
      e.stopPropagation();

      const dz = panel.querySelector('#aivastra-small-drop-zone');
      if (dz) dz.classList.remove('dragover');

      const dragUri = e.dataTransfer ? (e.dataTransfer.getData('text/uri-list') || '') : '';
      const dragPlain = e.dataTransfer ? (e.dataTransfer.getData('text/plain') || '') : '';
      const dragHtml = e.dataTransfer ? (e.dataTransfer.getData('text/html') || '') : '';

      const combinedText = [dragUri, dragPlain, dragHtml].filter(Boolean).join('\n');
      const parsed = parseDraggedProfileData(combinedText || dragPlain || dragUri);

      if (parsed.handle || parsed.name) {
        activeDisplayName = parsed.name || parsed.handle;
        activeContactHandle = parsed.handle || parsed.name.toLowerCase().replace(/[^a-z0-9._]/g, '_');
        isEditingProfile = false;
        saveCrmData(true);
      }
    };

    dropTargets.forEach((target) => {
      target.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const dz = panel.querySelector('#aivastra-small-drop-zone');
        if (dz) dz.classList.add('dragover');
      });

      target.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const dz = panel.querySelector('#aivastra-small-drop-zone');
        if (dz) dz.classList.remove('dragover');
      });

      target.addEventListener('drop', handleDrop);
    });
  }

  // ─── Initialize ───────────────────────────────────────────────────────────────

  ensureHeaderButton();
  ensurePanel();
  detectActiveContact();

  // URL & Chat Change Observer (for Instagram, LinkedIn, and Facebook SPA navigation)
  let lastUrl = location.href;
  let lastObservedThread = '';
  let debounceTimer = null;

  const checkChatSwitch = () => {
    ensureHeaderButton();
    const currentUrl = location.href;
    const currentPlatform = detectPlatform();
    const currentThread = extractSocialThreadId(currentPlatform);

    if (currentUrl !== lastUrl || (currentThread && currentThread !== lastObservedThread)) {
      lastUrl = currentUrl;
      lastObservedThread = currentThread;
      detectActiveContact(true);
    }
  };

  const observer = new MutationObserver(() => {
    if (debounceTimer) return;
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      checkChatSwitch();
    }, 300);
  });

  observer.observe(document.body, { childList: true, subtree: true });
  setInterval(checkChatSwitch, 700);

  // Listen for popup "Restore Button" command
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
      if (req && req.action === 'RESTORE_CRM_BUTTON') {
        isButtonHiddenTemp = false;
        try { sessionStorage.removeItem('aivastra_btn_hidden'); } catch (e) {}
        ensureHeaderButton();
        if (sendResponse) sendResponse({ success: true });
      }
    });
  }

})();
