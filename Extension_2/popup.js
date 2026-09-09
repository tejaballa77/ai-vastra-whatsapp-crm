document.addEventListener('DOMContentLoaded', () => {
  const apiUrlInput = document.getElementById('apiUrl');
  const saveBtn = document.getElementById('saveBtn');
  const statusMsg = document.getElementById('statusMsg');

  chrome.runtime.sendMessage({ action: 'GET_CONFIG' }, (res) => {
    if (res && res.apiUrl && !res.apiUrl.includes('localhost')) {
      apiUrlInput.value = res.apiUrl;
    } else {
      apiUrlInput.value = 'https://crm.nicedigitalsgroup.com';
    }
  });

  saveBtn.addEventListener('click', () => {
    const url = apiUrlInput.value.trim().replace(/\/$/, '');
    if (!url) return;

    chrome.runtime.sendMessage({ action: 'SET_CONFIG', apiUrl: url }, (res) => {
      statusMsg.textContent = '✅ Saved configuration!';
      setTimeout(() => {
        statusMsg.textContent = '';
      }, 2500);
    });
  });

  const restoreBtn = document.getElementById('restoreBtn');
  if (restoreBtn) {
    restoreBtn.addEventListener('click', () => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs && tabs[0] && tabs[0].id) {
          chrome.tabs.sendMessage(tabs[0].id, { action: 'RESTORE_CRM_BUTTON' }, (res) => {
            statusMsg.textContent = '✅ AI CRM Button Restored!';
            setTimeout(() => {
              statusMsg.textContent = '';
            }, 2500);
          });
        }
      });
    });
  }
});

