import { db, CRMMessage } from './store';

export interface ParsedExportResult {
  contactName: string;
  chatJid: string;
  messageCount: number;
}

export function parseWhatsAppChatExport(fileContent: string, fileName?: string): ParsedExportResult {
  // Extract contact name from fileName if available (e.g., "WhatsApp Chat - John Doe.txt")
  let contactName = 'Imported Chat';
  if (fileName) {
    const cleanName = fileName
      .replace(/^WhatsApp Chat - /i, '')
      .replace(/\.txt$/i, '')
      .replace(/\.zip$/i, '')
      .trim();
    if (cleanName) contactName = cleanName;
  }

  const lines = fileContent.split(/\r?\n/);
  const messages: { timestamp: number; senderName: string; fromMe: boolean; text: string }[] = [];

  let currentMsg: { timestamp: number; senderName: string; fromMe: boolean; text: string } | null = null;

  // Regex patterns for Android & iOS WhatsApp exports
  // Android 12-hr/24-hr: "31/07/26, 5:24 PM - Sender Name: Message" or "31/07/2026, 17:24 - Sender Name: Message"
  // iOS: "[31/07/26, 17:24:10] Sender Name: Message" or "[31/07/2026, 5:24:10 PM] Sender Name: Message"
  const androidRegex = /^(\d{1,2}\/\d{1,2}\/\d{2,4},\s+\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM|am|pm)?)\s*-\s*([^:]+):\s*(.*)$/;
  const iosRegex = /^\[(\d{1,2}\/\d{1,2}\/\d{2,4},\s+\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM|am|pm)?)\]\s*([^:]+):\s*(.*)$/;

  for (const line of lines) {
    if (!line.trim()) continue;

    // Skip encryption system messages
    if (line.includes('Messages and calls are end-to-end encrypted') || line.includes('created group') || line.includes('added you')) {
      continue;
    }

    const androidMatch = line.match(androidRegex);
    const iosMatch = line.match(iosRegex);
    const match = androidMatch || iosMatch;

    if (match) {
      if (currentMsg) {
        messages.push(currentMsg);
      }

      const dateStr = match[1];
      const sender = match[2].trim();
      const body = match[3].trim();

      const fromMe = sender.toLowerCase() === 'me' || sender.toLowerCase() === 'you';
      if (!fromMe && sender && (contactName === 'Imported Chat' || contactName === 'Imported')) {
        contactName = sender;
      }

      let parsedDate = Date.parse(dateStr);
      if (isNaN(parsedDate)) {
        parsedDate = Date.now();
      }

      currentMsg = {
        timestamp: parsedDate,
        senderName: sender,
        fromMe,
        text: body,
      };
    } else if (currentMsg) {
      currentMsg.text += '\n' + line;
    }
  }

  if (currentMsg) {
    messages.push(currentMsg);
  }

  // Create a unique deterministic JID for the imported chat
  const sanitizedJid = `${contactName.replace(/\W/g, '').toLowerCase()}_imported@s.whatsapp.net`;

  // Upsert contact & chat in CRM store
  db.upsertContact(sanitizedJid, {
    name: contactName,
    phone: contactName,
  });

  db.upsertChat(sanitizedJid, {
    name: contactName,
    lastMessageAt: messages.length > 0 ? messages[messages.length - 1].timestamp : Date.now(),
    lastMessagePreview: messages.length > 0 ? messages[messages.length - 1].text : '',
  });

  // Save all parsed messages into CRM message store
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    const msgId = `imported_${Date.now()}_${i}`;
    const crmMsg: CRMMessage = {
      id: msgId,
      chatJid: sanitizedJid,
      senderJid: m.fromMe ? 'me' : sanitizedJid,
      senderName: m.senderName,
      fromMe: m.fromMe,
      text: m.text,
      timestamp: m.timestamp,
      status: 'READ',
    };
    db.addMessage(crmMsg);
  }

  return {
    contactName,
    chatJid: sanitizedJid,
    messageCount: messages.length,
  };
}
