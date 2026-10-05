document.addEventListener('DOMContentLoaded', () => {
  const apiUrlInput = document.getElementById('apiUrl');
  const crmUsernameInput = document.getElementById('crmUsername');
  const saveBtn = document.getElementById('saveBtn');
  const statusDiv = document.getElementById('status');

  // Load saved settings
  chrome.storage.sync.get(['apiUrl', 'crmUsername'], (result) => {
    if (result.apiUrl) {
      apiUrlInput.value = result.apiUrl;
    }
    if (result.crmUsername) {
      crmUsernameInput.value = result.crmUsername;
    }
  });

  // Save settings in sync storage for the popup/background and local storage
  // for the WhatsApp content script.
  saveBtn.addEventListener('click', () => {
    const url = apiUrlInput.value.trim().replace(/\/$/, '');
    const crmUsername = crmUsernameInput.value.trim();
    const settings = { apiUrl: url, crmUsername };

    chrome.storage.sync.set(settings, () => {
      chrome.storage.local.set(settings, () => {
        statusDiv.textContent = 'Settings saved successfully!';
        setTimeout(() => statusDiv.textContent = '', 2000);
      });
    });
  });
});
