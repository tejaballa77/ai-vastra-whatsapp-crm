document.addEventListener('DOMContentLoaded', () => {
  const apiUrlInput = document.getElementById('apiUrl');
  const saveBtn = document.getElementById('saveBtn');
  const statusDiv = document.getElementById('status');

  // Load saved API URL
  chrome.storage.sync.get(['apiUrl'], (result) => {
    if (result.apiUrl) {
      apiUrlInput.value = result.apiUrl;
    }
  });

  // Save API URL
  saveBtn.addEventListener('click', () => {
    const url = apiUrlInput.value.trim().replace(/\/$/, '');
    chrome.storage.sync.set({ apiUrl: url }, () => {
      statusDiv.textContent = 'Settings saved successfully!';
      setTimeout(() => statusDiv.textContent = '', 2000);
    });
  });
});
