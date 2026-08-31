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
          if (!c) continue;

          const rawId = typeof c.id === 'object' ? String(c.id?._serialized || c.id?.user || '') : String(c.id || '');
          const cleanId = rawId.split('@')[0].replace(/\D/g, '');

          let phoneNum = '';
          if (c.phoneNumber) {
            phoneNum = String(c.phoneNumber).split('@')[0].replace(/\D/g, '');
          } else if (c.pnJid) {
            phoneNum = String(c.pnJid).split('@')[0].replace(/\D/g, '');
          } else if (c.user && String(c.user).length <= 12) {
            phoneNum = String(c.user).replace(/\D/g, '');
          } else if (cleanId.length <= 12) {
            phoneNum = cleanId;
          }

          const phoneJid = phoneNum ? `${phoneNum}@s.whatsapp.net` : '';
          const lidJid = c.lid || (rawId.includes('@lid') ? rawId : (cleanId.length > 12 ? `${cleanId}@lid` : ''));

          if (lidJid && phoneJid) {
            db.registerLidMapping(lidJid, phoneJid);
            db.registerLidMapping(lidJid.split('@')[0], phoneJid);
            db.registerLidMapping(cleanId, phoneJid);
          }

          const isRealAddressBook = Boolean(c.isAddressBookContact || c.isMyContact);
          const savedName = isRealAddressBook ? (c.name || c.formattedName || c.displayName) : c.verifiedName;
          if (!savedName || savedName.includes('@') || savedName === cleanId) continue;

          // Save contact name under phone JID
          if (phoneJid) {
            db.upsertContact(phoneJid, { jid: phoneJid, name: savedName, phone: phoneNum });
            db.updateContactName(phoneJid, savedName);
          }

          // Save contact name under LID keys
          if (lidJid) {
            db.upsertContact(lidJid, { name: savedName });
            db.updateContactName(lidJid, savedName);
          }
          if (cleanId) {
            db.upsertContact(cleanId, { name: savedName });
            db.updateContactName(cleanId, savedName);
          }
          if (rawId) {
            db.upsertContact(rawId, { name: savedName });
            db.updateContactName(rawId, savedName);
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

        console.log(`[Backup Script] Ingesting ${contactsList.length} contacts, ${bizList.length} business names, and ${picList.length} profile pictures...`);

        // 4. Process 'chat' store & merge LID chats into real phone JID chats
        const chatList = dump.chat || dump.chats || [];
        console.log(`[Backup Script] Ingesting ${chatList.length} chat threads...`);
        for (const ch of chatList) {
          if (!ch || !ch.id) continue;
          const rawId = String(ch.id);
          if (rawId === '0@c.us') continue;

          const resolvedJid = db.resolveJid(rawId);
          const contact = db.contacts.get(resolvedJid) || db.contacts.get(rawId);
          const rawNum = resolvedJid.split('@')[0];

          const isGroup = resolvedJid.endsWith('@g.us') || (ch.id && String(ch.id).endsWith('@g.us'));
          const groupTitle = isGroup ? (ch.name || ch.formattedTitle) : undefined;
          const name = contact?.name || groupTitle || db.formatPhoneFallback(rawNum);

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
        console.log(`[Backup Script] Ingesting ${msgList.length} message records...`);
        let msgCount = 0;
        for (const m of msgList) {
          if (!m) continue;

          let mediaType: 'image' | 'video' | 'audio' | 'document' | undefined = undefined;
          let fileName: string | undefined = m.filename || m.title || m.clientFilename || m.caption || undefined;

          const rawText = String(m.body || m.caption || m.text || '');

          if (m.type === 'image' || (fileName && /\.(jpg|jpeg|png|webp)$/i.test(fileName)) || rawText.endsWith('.jpg') || rawText.endsWith('.jpeg')) {
            mediaType = 'image';
          } else if (m.type === 'video' || (fileName && /\.(mp4|mkv)$/i.test(fileName))) {
            mediaType = 'video';
          } else if (m.type === 'audio' || m.type === 'ptt') {
            mediaType = 'audio';
          } else if (m.type === 'document' || (fileName && /\.pdf$/i.test(fileName)) || rawText.endsWith('.pdf')) {
            mediaType = 'document';
          }

          if (mediaType === 'document' && !fileName && rawText.endsWith('.pdf')) {
            fileName = rawText;
          }

          // Clean up raw artifact text labels
          let bodyText = rawText;
          if (bodyText === '[DOCUMENT]' || bodyText === '[IMAGE]' || bodyText === '[AUDIO]' || bodyText === 'Photo' || bodyText === 'Document') {
            bodyText = '';
          }

          if (!bodyText && !mediaType && !fileName) continue;

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
            text: bodyText,
            mediaUrl: mediaUrl,
            mediaType: mediaType,
            fileName: fileName,
            timestamp: timestamp,
            status: 'READ',
          });
          msgCount++;
        }

        // 6. Transfer messages from LID chats to Phone JID chats & Cleanup raw LID chats
        for (const [jid, chat] of Array.from(db.chats.entries())) {
          const clean = jid.split('@')[0];
          if (jid.endsWith('@lid') || (clean.length > 12 && !jid.endsWith('@g.us'))) {
            const mapped = db.resolveJid(jid);
            if (mapped && mapped !== jid && !mapped.includes('@lid') && mapped.split('@')[0].length <= 12) {
              const lidMsgs = db.messages.get(jid) || [];
              for (const m of lidMsgs) {
                m.chatJid = mapped;
                db.addMessage(m, false);
              }
              db.messages.delete(jid);
              db.chats.delete(jid);
            } else {
              db.chats.delete(jid);
            }
          }
        }

        // 7. Recalculate lastMessageAt, lastMessagePreview & unreadCount for ALL chats from message history
        for (const [jid, chat] of db.chats.entries()) {
          const msgs = db.messages.get(jid) || [];
          if (msgs.length > 0) {
            const lastMsg = msgs[msgs.length - 1];
            if (lastMsg.timestamp) {
              const normalizedTs = lastMsg.timestamp < 10000000000 ? lastMsg.timestamp * 1000 : lastMsg.timestamp;
              chat.lastMessageAt = Math.max(chat.lastMessageAt || 0, normalizedTs);
            }

            // Calculate unread count from consecutive incoming messages from client
            let unread = 0;
            for (let i = msgs.length - 1; i >= 0; i--) {
              if (msgs[i].fromMe) break;
              unread++;
            }
            chat.unreadCount = unread;

            const text = lastMsg.text || '';
            const isNotice = text === '[E2E_NOTIFICATION]' || text === '[CALL_LOG]' || text.includes('end-to-end encrypted');
            if (!isNotice) {
              if (text === '[REVOKED]' || text === 'This message was deleted') {
                chat.lastMessagePreview = '🚫 This message was deleted';
              } else if (lastMsg.mediaType === 'image' || text === '[IMAGE]' || text === 'Photo') {
                chat.lastMessagePreview = '📷 Photo';
              } else if (lastMsg.mediaType === 'document' || text === '[DOCUMENT]' || text === 'Document' || (lastMsg.fileName && lastMsg.fileName.endsWith('.pdf'))) {
                chat.lastMessagePreview = `📄 ${lastMsg.fileName || 'Document'}`;
              } else if (lastMsg.mediaType === 'audio' || text === '[AUDIO]') {
                chat.lastMessagePreview = '🎵 Voice Note';
              } else if (text && text !== '[CHAT]' && text !== 'Contact') {
                chat.lastMessagePreview = text;
              }
            }
            db.chats.set(jid, chat);
          }
        }
        // 8. Purge pushnames for non-group chats that are not in address book
        for (const [jid, chat] of db.chats.entries()) {
          if (!jid.endsWith('@g.us') && !chat.isGroup) {
            const contact = db.contacts.get(jid);
            if (!contact || !contact.name || contact.name.includes('@') || contact.name === 'Unsaved Contact') {
              const cleanNum = jid.split('@')[0];
              chat.name = db.formatPhoneFallback(cleanNum);
              db.chats.set(jid, chat);
            }
          }
        }

        console.log(`[Backup Script] WhatsApp Web JSON Dump imported! ${contactsList.length} contacts, ${msgCount} messages processed.`);

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
