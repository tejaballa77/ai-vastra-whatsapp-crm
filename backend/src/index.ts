import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { WhatsAppEngine } from './whatsappEngine';
import { db } from './store';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: '*' }));
app.use(express.json());

const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

// Initialize WhatsApp Engine
const waEngine = new WhatsAppEngine(io);

// Socket.IO Connections
io.on('connection', (socket) => {
  console.log(`[Socket.IO] Client connected: ${socket.id}`);

  // Send current status immediately upon connection
  socket.emit('connection_status', {
    status: waEngine.status,
    currentQrCode: waEngine.currentQrCode,
    meJid: waEngine.meJid,
  });

  // Send initial chat list from local cache
  socket.emit('chats_updated', db.getAllChatsSorted());

  socket.on('disconnect', () => {
    console.log(`[Socket.IO] Client disconnected: ${socket.id}`);
  });
});

// REST API Endpoints

// 1. Session status
app.get('/api/session/status', (req, res) => {
  res.json({
    status: waEngine.status,
    currentQrCode: waEngine.currentQrCode,
    meJid: waEngine.meJid,
  });
});

// 2. Initialize / Reconnect session
app.post('/api/session/connect', async (req, res) => {
  try {
    await waEngine.initialize();
    res.json({ success: true, status: waEngine.status });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Disconnect / Logout session
app.post('/api/session/disconnect', async (req, res) => {
  try {
    await waEngine.disconnect();
    res.json({ success: true, message: 'Session disconnected successfully' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 3b. Reset session and database cache for fresh QR re-sync
app.post('/api/session/reset', async (req, res) => {
  try {
    await waEngine.disconnect();
    waEngine.clearAuthAndStore();
    db.contacts.clear();
    db.chats.clear();
    db.messages.clear();
    db.lidToJidMap.clear();
    db.saveData();
    res.json({ success: true, message: 'Session and cache cleared cleanly' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Get all chats (sorted by recent message)
app.get('/api/chats', (req, res) => {
  res.json(db.getAllChatsSorted());
});

// 5. Get messages for specific chat
app.get('/api/messages/:chatJid', (req, res) => {
  const { chatJid } = req.params;
  const messages = db.getMessagesForChat(chatJid);
  res.json(messages);
});

// 6. Send message
app.post('/api/messages/send', async (req, res) => {
  const { chatJid, text } = req.body;
  if (!chatJid || !text) {
    return res.status(400).json({ error: 'chatJid and text are required' });
  }

  try {
    const msg = await waEngine.sendMessage(chatJid, text);
    res.json({ success: true, message: msg });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 7. Update CRM metadata (Lead Status, Call Status, Follow-up date, Notes, Tags)
app.put('/api/crm/contact/:jid', (req, res) => {
  const { jid } = req.params;
  const { leadStatus, callStatus, followUpDate, notes, notesList, tags } = req.body;

  const updatedChat = db.updateCrmMetadata(jid, {
    leadStatus,
    callStatus,
    followUpDate,
    notes,
    notesList,
    tags,
  });

  // Broadcast update to all connected clients
  io.emit('chats_updated', db.getAllChatsSorted());

  res.json({ success: true, chat: updatedChat });
});

// 8. Import address book contacts (VCF / CSV / JSON)
app.post('/api/contacts/import', (req, res) => {
  const { contacts, vcfContent, csvContent } = req.body;
  let parsedList: { name: string; phone: string }[] = contacts || [];

  if (vcfContent) {
    const { parseVcfContent } = require('./vcfParser');
    parsedList = parseVcfContent(vcfContent);
  } else if (csvContent) {
    const { parseCsvContent } = require('./vcfParser');
    parsedList = parseCsvContent(csvContent);
  }

  const matchCount = db.importContactsList(parsedList);

  io.emit('chats_updated', db.getAllChatsSorted());

  res.json({
    success: true,
    totalImported: parsedList.length,
    matchesUpdated: matchCount,
  });
});

// 9. Manually update a contact's display name
app.put('/api/contacts/name', (req, res) => {
  const { jid, name } = req.body;
  if (!jid || !name) {
    return res.status(400).json({ error: 'jid and name are required' });
  }

  const updated = db.updateContactName(jid, name);
  io.emit('chats_updated', db.getAllChatsSorted());

  res.json({ success: true, chat: updated });
});

// 10. Start a new chat by phone number
app.post('/api/chats/create', (req, res) => {
  const { phone, name } = req.body;
  if (!phone) {
    return res.status(400).json({ error: 'Phone number is required' });
  }

  const cleanDigits = phone.replace(/\D/g, '');
  if (!cleanDigits) {
    return res.status(400).json({ error: 'Invalid phone number' });
  }

  const fullNum = cleanDigits.length === 10 ? `91${cleanDigits}` : cleanDigits;
  const jid = `${fullNum}@s.whatsapp.net`;
  const contactName = name || db.formatPhoneFallback(fullNum);

  db.upsertContact(jid, { jid, name: contactName, phone: fullNum }, true);
  const chat = db.upsertChat(jid, { jid, name: contactName, lastMessageAt: Date.now() }, true);

  io.emit('chats_updated', db.getAllChatsSorted());

  res.json({ success: true, chat });
});

// 11. Delete a chat by JID
app.delete('/api/chats/:jid', (req, res) => {
  const { jid } = req.params;
  if (!jid) {
    return res.status(400).json({ error: 'JID is required' });
  }

  db.deleteChat(jid);
  io.emit('chats_updated', db.getAllChatsSorted());

  res.json({ success: true, message: 'Chat deleted successfully' });
});

// 12. Mark a chat as read
app.post('/api/chats/mark-read', (req, res) => {
  const { jid } = req.body;
  if (jid) {
    db.markChatAsRead(jid);
    io.emit('chats_updated', db.getAllChatsSorted());
  }
  res.json({ success: true });
});

// 12. Import WhatsApp Chat Backup Export File (.txt)
app.post('/api/chats/import-backup', (req, res) => {
  const { fileContent, fileName } = req.body;
  if (!fileContent) {
    return res.status(400).json({ error: 'fileContent is required' });
  }

  const { parseWhatsAppChatExport } = require('./whatsappExportParser');
  const result = parseWhatsAppChatExport(fileContent, fileName);

  io.emit('chats_updated', db.getAllChatsSorted());

  res.json({
    success: true,
    result,
  });
});

// Start Express HTTP & Socket.IO server
server.listen(PORT, async () => {
  console.log(`=======================================================`);
  console.log(`[AI Vastra CRM Backend] Server running on port ${PORT}`);
  console.log(`=======================================================`);

  // Automatically start WhatsApp session engine on server launch
  await waEngine.initialize();
});
