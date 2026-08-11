import fs from 'fs';
import path from 'path';
import { db } from './store';
import { parseVcfContent, parseCsvContent } from './vcfParser';
import { parseWhatsAppChatExport } from './whatsappExportParser';

async function runBackupImport() {
  const importDir = path.join(__dirname, '../backup_import');
  if (!fs.existsSync(importDir)) {
    fs.mkdirSync(importDir, { recursive: true });
    console.log(`[Backup Script] Created import folder at: ${importDir}`);
    return;
  }

  const files = fs.readdirSync(importDir);
  if (files.length === 0) {
    console.log(`[Backup Script] No backup files found in ${importDir}`);
    return;
  }

  console.log(`=======================================================`);
  console.log(`[Backup Script] Processing ${files.length} backup file(s)...`);
  console.log(`=======================================================`);

  let contactsImported = 0;
  let chatsImported = 0;

  for (const file of files) {
    const filePath = path.join(importDir, file);
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) continue;

    console.log(`[Backup Script] Ingesting file: ${file}`);
    const content = fs.readFileSync(filePath, 'utf-8');

    if (file.endsWith('.vcf')) {
      const parsed = parseVcfContent(content);
      const updated = db.importContactsList(parsed);
      contactsImported += updated;
      console.log(`[Backup Script] Imported ${parsed.length} contacts from ${file} (${updated} matches updated).`);
    } else if (file.endsWith('.csv')) {
      const parsed = parseCsvContent(content);
      const updated = db.importContactsList(parsed);
      contactsImported += updated;
      console.log(`[Backup Script] Imported ${parsed.length} contacts from ${file} (${updated} matches updated).`);
    } else if (file.endsWith('.txt')) {
      const res = parseWhatsAppChatExport(content, file);
      chatsImported++;
      console.log(`[Backup Script] Imported chat thread '${res.contactName}' with ${res.messageCount} messages.`);
    } else if (file.endsWith('.json')) {
      try {
        const dump = JSON.parse(content);

        // 1. Process WhatsApp Web 'contact' store and build full LID->Phone map
        const contactsList = dump.contact || dump.contacts || [];
        for (const c of contactsList) {
          if (!c || !c.id) continue;

          const rawId = String(c.id);
          const cleanId = rawId.split('@')[0];
          let phoneJid = '';
          if (c.phoneNumber) {
            phoneJid = String(c.phoneNumber).replace('@c.us', '@s.whatsapp.net');
          }

          if (rawId.includes('@lid') && phoneJid) {
            db.registerLidMapping(rawId, phoneJid, true);
            db.registerLidMapping(cleanId, phoneJid, true);
          }

          const rawPhoneNum = phoneJid ? phoneJid.split('@')[0] : cleanId;
          const formattedPhone = db.formatPhoneFallback(rawPhoneNum);

          // Rule: Use c.name ONLY if it's a saved address book name. If unsaved, ALWAYS use clean formatted phone number (+91 XXXXX XXXXX). NEVER use pushname or raw LID.
          const isSavedInAddressBook = Boolean(c.name && !c.name.includes('@') && !c.name.startsWith('+') && c.name !== rawPhoneNum && c.name !== cleanId);
          const contactName = isSavedInAddressBook ? c.name : formattedPhone;

          const targetJid = phoneJid || rawId;

          db.upsertContact(targetJid, {
            jid: targetJid,
            name: contactName,
            phone: rawPhoneNum,
          });

          if (phoneJid) {
            db.upsertContact(rawId, { name: contactName });
            db.upsertContact(cleanId, { name: contactName });
          }

          contactsImported++;
        }

        // 2. Process 'verified-business-name' store
        const bizList = dump['verified-business-name'] || [];
        for (const b of bizList) {
          if (!b || !b.id || !b.name) continue;
          const rawId = String(b.id);
          const phoneJid = db.resolveJid(rawId);
          db.updateContactName(rawId, b.name);
          db.updateContactName(phoneJid, b.name);
        }

        // 3. Process 'profile-pic-thumb' store
        const picList = dump['profile-pic-thumb'] || [];
        for (const p of picList) {
          if (!p || !p.id) continue;
          const avatarUrl = p.eurl || p.imgUrl;
          if (!avatarUrl) continue;
          const rawId = String(p.id);
          const phoneJid = db.resolveJid(rawId);
          db.upsertContact(rawId, { avatarUrl });
          db.upsertContact(phoneJid, { avatarUrl });
          db.upsertChat(rawId, { avatarUrl });
          db.upsertChat(phoneJid, { avatarUrl });
        }

        // 4. Process 'chat' store & merge LID chats into real phone JID chats
        const chatList = dump.chat || dump.chats || [];
        for (const ch of chatList) {
          if (!ch || !ch.id) continue;
          const rawId = String(ch.id);
          if (rawId === '0@c.us') continue;

          const resolvedJid = db.resolveJid(rawId);
          const contact = db.contacts.get(resolvedJid) || db.contacts.get(rawId);
          const rawNum = resolvedJid.split('@')[0];

          const isSavedName = Boolean(contact?.name && !contact.name.includes('@') && !contact.name.startsWith('+3') && !contact.name.startsWith('+8') && !contact.name.startsWith('+1') && !contact.name.startsWith('+2') && contact.name !== 'Unsaved Contact');
          const name = isSavedName ? contact!.name : db.formatPhoneFallback(rawNum);

          db.upsertChat(resolvedJid, {
            jid: resolvedJid,
            name: name,
            unreadCount: ch.unreadCount || 0,
            isGroup: resolvedJid.endsWith('@g.us'),
            lastMessageAt: ch.t ? ch.t * 1000 : 0,
          });
        }

        // 5. Process 'message' store with exact historical timestamps
        const msgList = dump.message || dump.messages || dump['message-history'] || [];
        let messagesImported = 0;

        for (const m of msgList) {
          if (!m) continue;
          const bodyText = m.body || m.caption || m.text || (m.type ? `[${m.type.toUpperCase()}]` : 'Message');

          const toJid = typeof m.to === 'object' ? m.to?._serialized : String(m.to || '');
          const fromJid = typeof m.from === 'object' ? m.from?._serialized : String(m.from || '');
          const fromMe = Boolean(m.id?.startsWith('true_') || m.fromMe);
          const rawChatJid = m.chatId || (fromMe ? toJid : fromJid) || toJid || fromJid;
          if (!rawChatJid || rawChatJid === '0@c.us') continue;

          const chatJid = db.resolveJid(rawChatJid);
          const timestamp = m.t ? m.t * 1000 : (m.timestamp ? m.timestamp : Date.now());

          let mediaUrl: string | undefined = undefined;
          let mediaType: 'image' | 'video' | 'audio' | 'document' | undefined = undefined;

          if (m.type === 'image' || m.type === 'sticker' || (m.mimetype && m.mimetype.startsWith('image/'))) {
            mediaType = 'image';
            mediaUrl = m.clientUrl || m.directPath || m.deprecatedMms3Url || (typeof m.body === 'string' && m.body.startsWith('data:image') ? m.body : undefined);
          } else if (m.type === 'video' || (m.mimetype && m.mimetype.startsWith('video/'))) {
            mediaType = 'video';
            mediaUrl = m.clientUrl || m.directPath || m.deprecatedMms3Url;
          } else if (m.type === 'audio' || m.type === 'ptt' || (m.mimetype && m.mimetype.startsWith('audio/'))) {
            mediaType = 'audio';
            mediaUrl = m.clientUrl || m.directPath;
          } else if (m.type === 'document' || m.mimetype) {
            mediaType = 'document';
            mediaUrl = m.clientUrl || m.directPath;
          }

          db.addMessage({
            id: m.id || `dump_${Date.now()}_${Math.random()}`,
            chatJid: chatJid,
            senderJid: fromMe ? 'me' : fromJid,
            senderName: m.senderName || 'Contact',
            fromMe: fromMe,
            text: bodyText,
            mediaUrl: mediaUrl,
            mediaType: mediaType,
            timestamp: timestamp,
            status: 'READ',
          }, true);
          messagesImported++;
        }

        // 6. Cleanup raw LID entries in db.chats if resolved phone JID exists
        for (const [jid, chat] of db.chats.entries()) {
          if (jid.endsWith('@lid') || (jid.length > 13 && !jid.includes('@') && !jid.startsWith('91'))) {
            const mapped = db.resolveJid(jid);
            if (mapped !== jid && db.chats.has(mapped)) {
              // Delete duplicate raw LID chat entry so only the real phone contact chat displays!
              db.chats.delete(jid);
            } else if (mapped !== jid) {
              // Re-key chat to real phone JID
              db.chats.delete(jid);
              chat.jid = mapped;
              db.chats.set(mapped, chat);
            }
          }
        }

        console.log(`[Backup Script] WhatsApp Web JSON Dump imported! Processed ${contactsList.length} contacts, ${bizList.length} business names, and ${picList.length} profile pictures.`);

      } catch (err) {
        console.warn(`[Backup Script] Could not parse JSON file ${file}:`, err);
      }
    }
  }

  db.saveData();

  console.log(`=======================================================`);
  console.log(`[Backup Script] COMPLETED SUCCESSFULLY!`);
  console.log(`[Backup Script] Total active chats now in database: ${db.chats.size}`);
  console.log(`=======================================================`);
}

runBackupImport().catch((err) => {
  console.error('[Backup Script] Error during backup import:', err);
});
