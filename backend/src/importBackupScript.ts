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
            db.registerLidMapping(rawId, phoneJid);
            db.registerLidMapping(cleanId, phoneJid);
          }

          const rawPhoneNum = phoneJid ? phoneJid.split('@')[0] : cleanId;
          const formattedFallback = db.formatPhoneFallback(rawPhoneNum);
          const savedName = c.name || c.formattedName || c.shortName || c.pushname || c.verifiedName || formattedFallback;

          const targetJid = phoneJid || rawId;

          db.upsertContact(targetJid, {
            jid: targetJid,
            name: savedName,
            phone: rawPhoneNum,
          });

          if (phoneJid) {
            db.upsertContact(rawId, { name: savedName });
            db.upsertContact(cleanId, { name: savedName });
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

          const name = contact?.name || ch.name || ch.formattedTitle || db.formatPhoneFallback(rawNum);

          db.upsertChat(resolvedJid, {
            jid: resolvedJid,
            name: name,
            unreadCount: ch.unreadCount || 0,
            isGroup: resolvedJid.endsWith('@g.us'),
            lastMessageAt: ch.t ? ch.t * 1000 : 0,
          });
        }

        // 5. Process 'message' store with exact historical timestamps & media attachments
        const msgList = dump.message || dump.messages || [];
        for (const m of msgList) {
          if (!m) continue;

          let mediaType: 'image' | 'video' | 'audio' | 'document' | undefined = undefined;
          if (m.type === 'image') mediaType = 'image';
          else if (m.type === 'video') mediaType = 'video';
          else if (m.type === 'audio' || m.type === 'ptt') mediaType = 'audio';
          else if (m.type === 'document') mediaType = 'document';

          const bodyText = m.body || m.caption || m.text || (mediaType === 'image' ? '📷 Image' : mediaType === 'document' ? '📄 Document' : mediaType === 'audio' ? '🎵 Voice Note' : '');
          if (!bodyText && !mediaType) continue;

          const toJid = typeof m.to === 'object' ? m.to?._serialized : String(m.to || '');
          const fromJid = typeof m.from === 'object' ? m.from?._serialized : String(m.from || '');
          const rawChatJid = m.chatId || toJid || fromJid;
          if (!rawChatJid || rawChatJid === '0@c.us') continue;

          const chatJid = db.resolveJid(rawChatJid);
          const fromMe = Boolean(m.id?.startsWith('true_') || m.fromMe);
          const timestamp = m.t ? m.t * 1000 : (m.timestamp ? m.timestamp : Date.now());
          const mediaUrl = m.directPath || m.deprecatedMms3Url || m.staticUrl || m.clientUrl || undefined;

          db.addMessage({
            id: m.id || `dump_${Date.now()}_${Math.random()}`,
            chatJid: chatJid,
            senderJid: fromMe ? 'me' : fromJid,
            senderName: m.senderName || 'Contact',
            fromMe: fromMe,
            text: bodyText || (mediaType ? `[${mediaType.toUpperCase()}]` : ''),
            mediaUrl: mediaUrl,
            mediaType: mediaType,
            timestamp: timestamp,
            status: 'READ',
          });
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
