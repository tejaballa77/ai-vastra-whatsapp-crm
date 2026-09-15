# 🧩 AI Vastra WhatsApp Web Chrome Extension (Direct Integration)

This Chrome Extension injects your **AI Vastra CRM Workspace** directly into **official WhatsApp Web (`https://web.whatsapp.com`)**.

---

## 🚀 Key Features

1. **Direct WhatsApp Web Injection**: Injects your AI Vastra CRM panel directly into `web.whatsapp.com` on the right side.
2. **Auto Contact Detection**: As you click any chat in WhatsApp Web, the extension detects the contact's phone number and loads its Lead Status, Call status, Follow-up date, and CRM Notes instantly!
3. **Live Sync with CRM Server**: All selections (Interested, Warm, Call Yes/No, Notes) automatically sync with your backend server (`https://crm.nicedigitalsgroup.com`).
4. **Clear Button**: Includes a 1-click `Clear` button to reset lead status, call options, follow-up date, and notes.

---

## 📥 How to Install & Load in Google Chrome

1. Open Google Chrome and navigate to:
   `chrome://extensions/`
2. Enable **Developer mode** (toggle switch on the top-right corner).
3. Click the **Load unpacked** button in the top-left.
4. Select the folder:
   `C:\Users\mobee\Downloads\AI-whatsapp-CRM\ai-vastra-whatsapp-crm-main\X`
5. Open `https://web.whatsapp.com` in your browser!
6. Click any chat on WhatsApp Web — the **AI Vastra CRM Panel** will appear on the right side!

## Phone resolution and Save (version 1.2.6)

Saved names are not record IDs. The extension must verify an international phone JID from the current chat, WhatsApp's local contact database, or the matching Contact info pane. A numeric LID is not a phone number. Two computers linked to the same account can have different local database contents and WhatsApp layouts.

Business Contact info panes with plain text headings, nested formatted numbers and telephone links are supported. If there are conflicting numbers, saving remains blocked rather than guessing. Success is displayed only after the CRM server confirms the request. Local contacts and server data are not cleared by an extension update.

Reload this existing extension in Chrome, then refresh WhatsApp Web. Do not uninstall or clear browser storage. If phone resolution still fails, inspect the extension service worker console and run:

```js
chrome.storage.local.get('crm_last_phone_resolution_failure', console.log);
```

Share that diagnostic object and the Contact info phone section privately. It contains version/time and extraction availability counts, not messages or phone numbers. A screenshot alone cannot establish which WhatsApp internal identifier was exposed. Separate WhatsApp-account tenancy is not implemented; the CRM remains a shared phone-keyed workspace.
