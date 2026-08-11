// AI Vastra — WhatsApp Web CRM Overlay Content Script

(function () {
  console.log('🚀 [AI Vastra CRM] Chrome Extension Content Script Loaded on WhatsApp Web');

  let activeContactJid = null;
  let activeContactName = 'Unknown Contact';
  let activeContactPhone = '';
  let crmDataStore = {};

  // Load stored CRM data from Chrome extension storage
  chrome.storage.local.get(['aiv_crm_data'], (res) => {
    if (res.aiv_crm_data) {
      crmDataStore = res.aiv_crm_data;
    }
  });

  // Save CRM data to Chrome extension storage
  function saveStorage() {
    chrome.storage.local.set({ aiv_crm_data: crmDataStore }, () => {
      const indicator = document.getElementById('aiv-save-status');
      if (indicator) {
        indicator.textContent = 'Saved ✓';
        setTimeout(() => { indicator.textContent = ''; }, 1500);
      }
    });
  }

  // Inject UI Components
  function injectUI() {
    if (document.getElementById('aiv-crm-trigger-btn')) return;

    // 1. Create Floating Trigger Button
    const triggerBtn = document.createElement('button');
    triggerBtn.id = 'aiv-crm-trigger-btn';
    triggerBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
      <span>AI Vastra CRM</span>
    `;
    document.body.appendChild(triggerBtn);

    // 2. Create Side Panel
    const panel = document.createElement('div');
    panel.id = 'aiv-crm-panel';
    panel.innerHTML = `
      <div class="aiv-header">
        <div class="aiv-header-title">
          <span>AI Vastra CRM</span>
          <span class="aiv-logo-badge">PRO</span>
        </div>
        <button class="aiv-close-btn" id="aiv-close-panel">✕</button>
      </div>

      <div class="aiv-body">
        <!-- Contact Card -->
        <div class="aiv-contact-card">
          <div class="aiv-avatar" id="aiv-contact-avatar">U</div>
          <div>
            <div class="aiv-contact-name" id="aiv-contact-name">Select a Chat</div>
            <div class="aiv-contact-phone" id="aiv-contact-phone">No Active Conversation</div>
          </div>
        </div>

        <!-- Lead Status -->
        <div class="aiv-section">
          <div class="aiv-section-title">
            <span>Lead Status</span>
          </div>
          <div class="aiv-status-grid">
            <button class="aiv-status-btn" data-status="INTERESTED">🟢 Interested</button>
            <button class="aiv-status-btn" data-status="WARM">🟡 Warm</button>
            <button class="aiv-status-btn" data-status="NOT_INTERESTED">🔴 Not Interested</button>
          </div>
        </div>

        <!-- Follow-up Scheduler -->
        <div class="aiv-section">
          <div class="aiv-section-title">
            <span>Follow-up Date</span>
          </div>
          <input type="date" class="aiv-date-input" id="aiv-followup-date" />
          <div class="aiv-quick-dates">
            <button class="aiv-quick-date-chip" data-days="1">+1 Day</button>
            <button class="aiv-quick-date-chip" data-days="3">+3 Days</button>
            <button class="aiv-quick-date-chip" data-days="7">+7 Days</button>
          </div>
        </div>

        <!-- Notes -->
        <div class="aiv-section">
          <div class="aiv-section-title">
            <span>Customer Requirements & Notes</span>
            <span class="aiv-save-indicator" id="aiv-save-status"></span>
          </div>
          <textarea class="aiv-textarea" id="aiv-notes" placeholder="Add customer preferences, size requirements, catalog notes..."></textarea>
        </div>

        <!-- Quick Templates -->
        <div class="aiv-section">
          <div class="aiv-section-title">
            <span>Quick Templates & AI Replies</span>
          </div>
          <div class="aiv-template-list">
            <div class="aiv-template-item" data-template="Hello! Thank you for connecting with AI Vastra. How can we help create AI fashion catalogues for your brand today?">
              <span class="aiv-template-text">👋 Welcome & AI Catalog Proposal</span>
              <button class="aiv-insert-btn">Insert</button>
            </div>
            <div class="aiv-template-item" data-template="Here is our official pricing proposal: 10 RS per image photoshoot with virtual AI models. Would you like a demo?">
              <span class="aiv-template-text">💰 AI Photoshoot Pricing & Demo</span>
              <button class="aiv-insert-btn">Insert</button>
            </div>
            <div class="aiv-template-item" data-template="Hi! Just checking in regarding your AI catalog photoshoot request. Are you available for a quick call?">
              <span class="aiv-template-text">📞 Follow-up & Call Scheduling</span>
              <button class="aiv-insert-btn">Insert</button>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(panel);

    // Event Listeners
    triggerBtn.onclick = () => panel.classList.toggle('aiv-open');
    document.getElementById('aiv-close-panel').onclick = () => panel.classList.remove('aiv-open');

    // Status Buttons
    document.querySelectorAll('.aiv-status-btn').forEach(btn => {
      btn.onclick = () => {
        if (!activeContactJid) return;
        const status = btn.getAttribute('data-status');
        if (!crmDataStore[activeContactJid]) crmDataStore[activeContactJid] = {};
        crmDataStore[activeContactJid].status = status;
        saveStorage();
        updateUI();
      };
    });

    // Date Picker
    const dateInput = document.getElementById('aiv-followup-date');
    dateInput.onchange = () => {
      if (!activeContactJid) return;
      if (!crmDataStore[activeContactJid]) crmDataStore[activeContactJid] = {};
      crmDataStore[activeContactJid].followUpDate = dateInput.value;
      saveStorage();
    };

    // Quick Date Chips
    document.querySelectorAll('.aiv-quick-date-chip').forEach(btn => {
      btn.onclick = () => {
        if (!activeContactJid) return;
        const days = parseInt(btn.getAttribute('data-days') || '1');
        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() + days);
        const dateStr = targetDate.toISOString().split('T')[0];
        dateInput.value = dateStr;
        if (!crmDataStore[activeContactJid]) crmDataStore[activeContactJid] = {};
        crmDataStore[activeContactJid].followUpDate = dateStr;
        saveStorage();
      };
    });

    // Notes Auto-Save
    const notesInput = document.getElementById('aiv-notes');
    notesInput.oninput = () => {
      if (!activeContactJid) return;
      if (!crmDataStore[activeContactJid]) crmDataStore[activeContactJid] = {};
      crmDataStore[activeContactJid].notes = notesInput.value;
      saveStorage();
    };

    // Template Insert Buttons
    document.querySelectorAll('.aiv-template-item').forEach(item => {
      item.onclick = () => {
        const text = item.getAttribute('data-template');
        insertMessageIntoWhatsApp(text);
      };
    });
  }

  // Insert text into WhatsApp Web active input field
  function insertMessageIntoWhatsApp(text) {
    const inputField = document.querySelector('#main footer div[contenteditable="true"]');
    if (!inputField) {
      alert('Please open a WhatsApp Web chat conversation first!');
      return;
    }
    inputField.focus();
    document.execCommand('insertText', false, text);
  }

  // Detect active chat from WhatsApp Web DOM
  function detectActiveChat() {
    const headerTitleEl = document.querySelector('#main header span[title]');
    if (!headerTitleEl) return;

    const name = headerTitleEl.getAttribute('title') || headerTitleEl.textContent || '';
    if (!name) return;

    // Use name or phone as key
    const jidKey = name.replace(/\s+/g, '_').toLowerCase();

    if (activeContactJid !== jidKey) {
      activeContactJid = jidKey;
      activeContactName = name;
      activeContactPhone = name.startsWith('+') ? name : 'Saved Contact';

      updateUI();
    }
  }

  // Update UI values for active contact
  function updateUI() {
    const nameEl = document.getElementById('aiv-contact-name');
    const phoneEl = document.getElementById('aiv-contact-phone');
    const avatarEl = document.getElementById('aiv-contact-avatar');
    const notesInput = document.getElementById('aiv-notes');
    const dateInput = document.getElementById('aiv-followup-date');

    if (nameEl) nameEl.textContent = activeContactName;
    if (phoneEl) phoneEl.textContent = activeContactPhone;
    if (avatarEl) avatarEl.textContent = activeContactName.charAt(0).toUpperCase();

    const data = crmDataStore[activeContactJid] || {};
    if (notesInput) notesInput.value = data.notes || '';
    if (dateInput) dateInput.value = data.followUpDate || '';

    // Highlight status buttons
    document.querySelectorAll('.aiv-status-btn').forEach(btn => {
      const status = btn.getAttribute('data-status');
      btn.className = 'aiv-status-btn';
      if (data.status === status) {
        if (status === 'INTERESTED') btn.classList.add('aiv-active-interested');
        if (status === 'WARM') btn.classList.add('aiv-active-warm');
        if (status === 'NOT_INTERESTED') btn.classList.add('aiv-active-not-interested');
      }
    });
  }

  // Init Observer to watch DOM changes on web.whatsapp.com
  setInterval(() => {
    injectUI();
    detectActiveChat();
  }, 1000);

})();
