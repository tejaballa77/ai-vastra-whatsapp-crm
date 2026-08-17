// AI Vastra Chrome Extension - Injected Content Script on web.whatsapp.com
console.log('[AI Vastra Chrome Extension] Injected on WhatsApp Web!');

let activeJid = '';
let activePhoneClean = '';
let currentLeadStatus = 'UNASSIGNED';
let currentCallStatus = null;
let currentFollowUp = '';
let currentNotesList = [];

// Create or get the injected CRM sidepanel container
function ensureCrmPanel() {
  let panel = document.getElementById('aivastra-crm-panel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'aivastra-crm-panel';
    document.body.appendChild(panel);
  }
  return panel;
}

// Observe WhatsApp Web chat header changes to detect active contact
function startChatObserver() {
  const observer = new MutationObserver(() => {
    detectActiveContact();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

function detectActiveContact() {
  // Extract active chat header title and phone number from WhatsApp Web DOM
  const headerEl = document.querySelector('header');
  if (!headerEl) return;

  const titleEl = headerEl.querySelector('span[title]') || headerEl.querySelector('span[dir="auto"]');
  if (!titleEl) return;

  const rawTitle = titleEl.getAttribute('title') || titleEl.textContent || '';
  const cleanDigits = rawTitle.replace(/\D/g, '');

  if (cleanDigits.length >= 10 && cleanDigits.length <= 15) {
    if (activePhoneClean !== cleanDigits) {
      activePhoneClean = cleanDigits;
      activeJid = `${cleanDigits}@s.whatsapp.net`;
      fetchCrmMetadata(cleanDigits, rawTitle);
    }
  }
}

function fetchCrmMetadata(cleanPhone, displayName) {
  chrome.runtime.sendMessage({ action: 'FETCH_CRM_METADATA', phoneClean: cleanPhone }, (response) => {
    if (response && response.success && response.chat) {
      const chat = response.chat;
      currentLeadStatus = chat.leadStatus || 'UNASSIGNED';
      currentCallStatus = chat.callStatus || null;
      currentFollowUp = chat.followUpDate || '';
      currentNotesList = chat.notesList || (chat.notes ? [chat.notes] : []);
    } else {
      currentLeadStatus = 'UNASSIGNED';
      currentCallStatus = null;
      currentFollowUp = '';
      currentNotesList = [];
    }
    renderCrmPanel(displayName, cleanPhone);
  });
}

function saveCrmMetadata() {
  if (!activeJid) return;
  chrome.runtime.sendMessage({
    action: 'UPDATE_CRM_METADATA',
    jid: activeJid,
    data: {
      leadStatus: currentLeadStatus,
      callStatus: currentCallStatus,
      followUpDate: currentFollowUp || undefined,
      notes: currentNotesList.join('\n\n'),
      notesList: currentNotesList
    }
  });
}

function renderCrmPanel(displayName, cleanPhone) {
  const panel = ensureCrmPanel();
  const formattedPhone = cleanPhone.length === 12 && cleanPhone.startsWith('91')
    ? `+91 ${cleanPhone.slice(2, 7)} ${cleanPhone.slice(7)}`
    : `+${cleanPhone}`;

  panel.innerHTML = `
    <div className="aivastra-header" style="height: 60px; background: #f0f2f5; border-bottom: 1px solid #e9edef; display: flex; align-items: center; justify-content: space-between; padding: 0 16px; font-weight: 600;">
      <span>Contact Info</span>
      <div>
        <button id="aivastra-clear-btn" class="aivastra-clear-btn">Clear</button>
        <button id="aivastra-close-btn" class="aivastra-close-btn">✕</button>
      </div>
    </div>

    <div class="aivastra-body" style="padding: 16px; overflow-y: auto; display: flex; flex-direction: column; gap: 16px;">
      <div class="aivastra-card">
        <div class="aivastra-contact-name">${displayName}</div>
        <div class="aivastra-contact-phone">📞 ${formattedPhone}</div>
      </div>

      <div>
        <div class="aivastra-section-title">Lead Status</div>
        <div class="aivastra-btn-group">
          <button id="btn-interested" class="aivastra-btn ${currentLeadStatus === 'INTERESTED' ? 'active-interested' : ''}">👍 Interested</button>
          <button id="btn-warm" class="aivastra-btn ${currentLeadStatus === 'WARM_INTERESTED' ? 'active-warm' : ''}">🔥 Warm</button>
          <button id="btn-not-interested" class="aivastra-btn ${currentLeadStatus === 'NOT_INTERESTED' ? 'active-not-interested' : ''}">👎 Not Interested</button>
        </div>
      </div>

      <div>
        <div class="aivastra-section-title">Call</div>
        <div class="aivastra-btn-group-2">
          <button id="btn-call-yes" class="aivastra-btn ${currentCallStatus === 'YES' ? 'active-call-yes' : ''}">Yes</button>
          <button id="btn-call-no" class="aivastra-btn ${currentCallStatus === 'NO' ? 'active-call-no' : ''}">No</button>
        </div>
      </div>

      <div>
        <div class="aivastra-section-title">Follow-up Schedule</div>
        <input type="date" id="aivastra-followup-date" class="aivastra-date-input" value="${currentFollowUp}" />
      </div>

      <div>
        <div class="aivastra-section-title">CRM Notes</div>
        <textarea id="aivastra-note-text" class="aivastra-notes-area" rows="2" placeholder="Add key note about customer requirements..."></textarea>
        <button id="aivastra-add-note-btn" class="aivastra-add-note-btn">+ Add Note</button>

        <div id="aivastra-notes-list" style="margin-top: 10px;">
          ${currentNotesList.map((n, i) => `
            <div class="aivastra-note-item">
              <span style="flex:1;">${n}</span>
              <span class="aivastra-note-delete" data-index="${i}">🗑</span>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;

  // Attach event listeners
  document.getElementById('aivastra-close-btn').onclick = () => panel.style.display = 'none';
  document.getElementById('aivastra-clear-btn').onclick = () => {
    currentLeadStatus = 'UNASSIGNED';
    currentCallStatus = null;
    currentFollowUp = '';
    currentNotesList = [];
    saveCrmMetadata();
    renderCrmPanel(displayName, cleanPhone);
  };

  document.getElementById('btn-interested').onclick = () => { currentLeadStatus = 'INTERESTED'; saveCrmMetadata(); renderCrmPanel(displayName, cleanPhone); };
  document.getElementById('btn-warm').onclick = () => { currentLeadStatus = 'WARM_INTERESTED'; saveCrmMetadata(); renderCrmPanel(displayName, cleanPhone); };
  document.getElementById('btn-not-interested').onclick = () => { currentLeadStatus = 'NOT_INTERESTED'; saveCrmMetadata(); renderCrmPanel(displayName, cleanPhone); };

  document.getElementById('btn-call-yes').onclick = () => { currentCallStatus = 'YES'; saveCrmMetadata(); renderCrmPanel(displayName, cleanPhone); };
  document.getElementById('btn-call-no').onclick = () => { currentCallStatus = 'NO'; saveCrmMetadata(); renderCrmPanel(displayName, cleanPhone); };

  document.getElementById('aivastra-followup-date').onchange = (e) => { currentFollowUp = e.target.value; saveCrmMetadata(); };

  document.getElementById('aivastra-add-note-btn').onclick = () => {
    const txt = document.getElementById('aivastra-note-text').value.trim();
    if (txt) {
      currentNotesList.unshift(txt);
      saveCrmMetadata();
      renderCrmPanel(displayName, cleanPhone);
    }
  };

  panel.querySelectorAll('.aivastra-note-delete').forEach(el => {
    el.onclick = (e) => {
      const idx = parseInt(e.target.getAttribute('data-index'));
      currentNotesList.splice(idx, 1);
      saveCrmMetadata();
      renderCrmPanel(displayName, cleanPhone);
    };
  });
}

// Start observing active chat changes on page load
setTimeout(startChatObserver, 2000);
