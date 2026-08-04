# AI Vastra CRM — Complete Development, Architecture & Deployment Guide

## Overview & Vision
Build a custom **AI Vastra CRM** that functions as a real-time mirror clone of WhatsApp Web and Instagram Direct Messages, with CRM metadata capabilities (Lead Status, Follow-up Dates, Notes, Tags, AI Suggestions) layered on top.

---

## Core Philosophy & Phases
- **Phase 1**: Real-Time Messaging Engine (WhatsApp Web & Instagram DM mirror)
- **Phase 2**: CRM Metadata & Lead Pipeline (Interested, Warm Interested, Not Interested, Follow-ups)
- **Phase 3**: AI Assistance & Suggested Replies

---

## Chronological Work Accomplished & User Requests Log

### 1. Initial WhatsApp Web Engine & Mirror Architecture
- Integrated `@whiskeysockets/baileys` Multi-Device library (`backend/src/whatsappEngine.ts`).
- Created persistent authentication state stored in `backend/auth_info_baileys`.
- Synchronized chat list (`chats.upsert`), full history (`messaging-history.set`), and real-time messaging (`messages.upsert`).
- Implemented real-time Socket.IO gateway linking Express backend (`port 5000`) and Next.js 14 App Router frontend (`port 3000`).

### 2. Authentic WhatsApp Web Dark UI Clone
- Designed Next.js layout matching official WhatsApp Web dark mode `#0b141a`.
- `Sidebar.tsx`: Platform switcher (WhatsApp / Instagram), unread filters, and live chat list.
- `ChatWindow.tsx`: Real-time date-grouped message bubbles, status ticks, and instant bottom scroll.
- `CrmDrawer.tsx`: Right drawer for toggling Lead Status (*Interested*, *Warm Interested*, *Not Interested*), follow-up date picker, notes, tags, and inline contact name editor.
- `SyncLoadingScreen.tsx` & `QrCodeModal.tsx`: Link a device pairing modal displaying live Base64 QR code.

### 3. Contact Resolution & WhatsApp LID Mapping Engine
- **LID Resolution Engine**: Resolved internal WhatsApp Multi-Device LIDs (e.g., `16093276065966@lid`) to real phone JIDs (`917506209443@s.whatsapp.net`).
- **Clean Phone Formatting**: Formatted unsaved Indian numbers cleanly as `+91 XXXXX XXXXX`.
- **Address Book & Backup Importer (`importBackupScript.ts`)**:
  - Parsed `.vcf` (vCard) and `.csv` address book contacts.
  - Parsed WhatsApp Chat Export `.txt` files (`WhatsApp Chat - Name.txt`).
  - Parsed 1-Click WhatsApp Web IndexedDB JSON Dumps (`whatsapp_full_dump.json`) containing 768 contacts, 54 business names, 39 profile pictures, and 1,410 historical messages.

### 4. Timestamp & Chat List Decreasing Order Sorting
- Unified message arrays across LID and Phone JIDs so no messages are lost.
- Enforced strict decreasing order of latest message timestamp (`b.lastMessageAt - a.lastMessageAt`).
- Reset empty chats to timestamp `0` so active conversations remain at the top.

---

## 1-Click WhatsApp Web Browser Dumper Script

Run this script in Chrome Console (**F12 → Console**) on `web.whatsapp.com` to export all chats, saved contact names, and historical messages:

```javascript
(async function exportWAData() {
  const dbs = await indexedDB.databases();
  const waDb = dbs.find(d => d.name.includes('wawc') || d.name.includes('model') || d.name.includes('whatsapp')) || { name: 'wawc' };
  const req = indexedDB.open(waDb.name);
  req.onsuccess = function(evt) {
    const db = evt.target.result;
    const stores = Array.from(db.objectStoreNames);
    const tx = db.transaction(stores, 'readonly');
    const dump = {};
    let done = 0;
    stores.forEach(function(s) {
      tx.objectStore(s).getAll().onsuccess = function(ev) {
        dump[s] = ev.target.result;
        done++;
        if (done === stores.length) {
          const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = 'whatsapp_full_dump.json';
          a.click();
          console.log('EXPORT COMPLETE! File downloaded: whatsapp_full_dump.json');
        }
      };
    });
  };
})();
```

### Ingestion Command:
Place `whatsapp_full_dump.json` in `backend/backup_import/` and run:
```bash
cd backend
npm run import-backup
```

---

## Deployment Guide: Hostinger CloudPanel VPS

### Step 1: Push Code to GitHub Repository
```powershell
cd c:\Users\mobee\Downloads\Ai_Vastra_CRM_2
git init
git add .
git commit -m "Deploy AI Vastra CRM"
git branch -M main
git remote add origin https://github.com/srinivasgunnam-nicedigitals/wahaCRM.git
git push -u origin main --force
```

### Step 2: Deploy on Hostinger VPS via SSH
```bash
cd /home/aivastra-crm/htdocs/crm.aivastra.com
git fetch origin
git reset --hard origin/main

# Build backend and frontend
cd backend && npm install && npm run build
cd ../frontend && npm install && npm run build

# Start 24/7 background process with PM2
cd ..
pm2 restart all || pm2 start start.js --name "ai-vastra-crm"
pm2 save
```

### Step 3: CloudPanel Nginx Vhost Reverse Proxy Configuration
In CloudPanel Dashboard → **Sites → `crm.aivastra.com` → Vhost**:
Ensure `proxy_pass` points to Next.js on port `3000`:
```nginx
location /socket.io/ {
    proxy_pass http://127.0.0.1:5000/socket.io/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
}

location /api/ {
    proxy_pass http://127.0.0.1:5000/api/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
}

location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
}
```

---

## File Structure Reference

```
Ai_Vastra_CRM_2/
├── .gitignore
├── package.json
├── start.js
├── backend/
│   ├── backup_import/
│   │   └── whatsapp_full_dump.json
│   ├── data/
│   │   └── db.json
│   ├── src/
│   │   ├── index.ts
│   │   ├── store.ts
│   │   ├── whatsappEngine.ts
│   │   ├── vcfParser.ts
│   │   ├── whatsappExportParser.ts
│   │   └── importBackupScript.ts
│   └── tsconfig.json
└── frontend/
    ├── src/
    │   ├── app/
    │   │   ├── page.tsx
    │   │   └── layout.tsx
    │   ├── components/
    │   │   ├── Sidebar.tsx
    │   │   ├── ChatWindow.tsx
    │   │   ├── CrmDrawer.tsx
    │   │   ├── QrCodeModal.tsx
    │   │   └── SyncLoadingScreen.tsx
    │   ├── context/
    │   │   └── SocketContext.tsx
    │   └── types/
    │       └── chat.ts
    └── tailwind.config.js
```
