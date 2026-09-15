# WhatsApp-only reset

This reset removes active WhatsApp contacts, chats, and messages from SQLite and the two known fallback JSON files. It does not modify extension browser storage, social records, cold calls, archives, users, or WhatsApp authentication. Unrecognized identifiers are preserved, not guessed.

Before resetting, export the current extension storage from its service-worker console (Chrome Extensions > X extension > service worker):

```js
chrome.storage.local.get(null, data => console.log(JSON.stringify(data)));
```

Copy the resulting JSON into a private backup file. Do not uninstall the extension or clear browser storage. Stop saving contacts, and close WhatsApp Web while resetting.

On the server, after pulling this commit and building:

```bash
pm2 stop crm-backend
node backend/reset-whatsapp-only.js --confirm-whatsapp-only
```

Inspect the printed report. It lists deleted and preserved counts and the backup directory. If the command fails, do not continue entering contacts; share the error. No unrelated PM2 process needs to be stopped.

After success:

```bash
pm2 restart crm-backend
```

Refresh CRM, reload the existing extension in place, and reopen WhatsApp Web. Do not uninstall/reinstall the extension: uninstalling can remove its local storage. Start with one verified contact; check the submitted phone/JID, database row, CRM fields, and the other contacts before restoring more.

Backups are under `backend/data/whatsapp-reset-backups/`. Restoring a backup is a separate deliberate operation; do not copy a backup over a live SQLite database.

Tests:

```bash
node backend/test-whatsapp-reset.js
node backend/test-whatsapp-isolation.js
```
