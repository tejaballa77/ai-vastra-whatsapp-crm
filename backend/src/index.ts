import express from 'express';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { WhatsAppEngine } from './whatsappEngine';
import { db } from './store';

dotenv.config();

// ============================================================
// CRASH GUARDS: Prevent ANY unhandled error from killing the
// CRM API server. Baileys WhatsApp session errors must NEVER
// take down the Express server or the CRM Dashboard.
// ============================================================
process.on('uncaughtException', (err) => {
  console.error('[AI Vastra CRM] Uncaught Exception (server kept alive):', err?.message || err);
});

process.on('unhandledRejection', (reason) => {
  console.error('[AI Vastra CRM] Unhandled Promise Rejection (server kept alive):', reason);
});

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

  // Send initial chat list & cold calls from local cache
  socket.emit('chats_updated', db.getAllChatsSorted());
  socket.emit('cold_calls_updated', db.getAllColdCalls());

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
  const { name, phone, leadStatus, callStatus, followUpDate, notes, notesList, tags } = req.body;

  const updatedChat = db.updateCrmMetadata(jid, {
    name,
    phone,
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

// ==================== COLD CALLS API ENDPOINTS ====================
// Get all cold call leads
app.get('/api/cold-calls', (req, res) => {
  res.json(db.getAllColdCalls());
});

// Import cold call leads from Excel / CSV
app.post('/api/cold-calls/import', (req, res) => {
  const { leads } = req.body;
  if (!Array.isArray(leads)) {
    return res.status(400).json({ error: 'leads array is required' });
  }

  const imported = db.importColdCalls(leads);
  io.emit('cold_calls_updated', db.getAllColdCalls());
  res.json({ success: true, count: imported.length, leads: imported });
});

// Update cold call lead (Notes, Follow-up Date, Call Status, etc.)
app.put('/api/cold-calls/:id', (req, res) => {
  const { id } = req.params;
  const updated = db.updateColdCall(id, req.body);
  if (!updated) {
    return res.status(404).json({ error: 'Cold call lead not found' });
  }
  io.emit('cold_calls_updated', db.getAllColdCalls());
  res.json({ success: true, lead: updated });
});

// Delete specific cold call lead
app.delete('/api/cold-calls/:id', (req, res) => {
  const { id } = req.params;
  const deleted = db.deleteColdCall(id);
  if (deleted) {
    io.emit('cold_calls_updated', db.getAllColdCalls());
  }
  res.json({ success: deleted });
});

// Clear all cold call leads
app.delete('/api/cold-calls', (req, res) => {
  db.clearColdCalls();
  io.emit('cold_calls_updated', db.getAllColdCalls());
  res.json({ success: true, message: 'All cold calls cleared' });
});

// Start Express HTTP & Socket.IO server
// 14. AI Agent Knowledge Base Endpoints
app.get('/api/ai/knowledge-base', (req, res) => {
  try {
    const { aiAgent } = require('./aiAgent');
    res.json({ success: true, kb: { ...aiAgent.kb, aiAutoReplyCount: aiAgent.aiAutoReplyCount } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/ai/knowledge-base', (req, res) => {
  try {
    const { aiAgent } = require('./aiAgent');
    aiAgent.saveKb(req.body);
    res.json({ success: true, kb: { ...aiAgent.kb, aiAutoReplyCount: aiAgent.aiAutoReplyCount } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/ai/test-reply', async (req, res) => {
  try {
    const { aiAgent } = require('./aiAgent');
    const { message } = req.body;
    const response = await aiAgent.generateResponse('test_chat@s.whatsapp.net', message || 'Hi', true);
    res.json({ success: true, response });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 15. RAG Document Upload & Management Endpoints
const multer = require('multer');
const storage = multer.diskStorage({
  destination: (req: any, file: any, cb: any) => {
    const dir = path.join(__dirname, '../uploads/documents');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req: any, file: any, cb: any) => {
    cb(null, `${Date.now()}_${file.originalname}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 25 * 1024 * 1024 } });

app.get('/api/ai/documents', (req, res) => {
  try {
    const { ragEngine } = require('./ragEngine');
    res.json({ success: true, documents: ragEngine.getDocuments() });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/ai/documents/upload', upload.single('file'), async (req: any, res: any) => {
  try {
    const { ragEngine } = require('./ragEngine');
    if (!req.file && !req.body.text) {
      return res.status(400).json({ success: false, error: 'No file or text provided' });
    }

    let originalName = req.file ? req.file.originalname : (req.body.title || 'Text Document.txt');
    let filename = req.file ? req.file.filename : `text_${Date.now()}.txt`;
    let mimeType = req.file ? req.file.mimetype : 'text/plain';
    let size = req.file ? req.file.size : (req.body.text || '').length;
    let content = '';

    if (req.file) {
      const ext = path.extname(req.file.originalname).toLowerCase();
      if (ext === '.docx' || req.file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        try {
          const mammoth = require('mammoth');
          const result = await mammoth.convertToMarkdown({ path: req.file.path });
          content = result.value || '';
          console.log(`[RAG Upload] Successfully extracted ${content.length} characters from DOCX Word document (with Markdown tables): ${originalName}`);
        } catch (docxErr: any) {
          console.warn(`[RAG Upload] DOCX mammoth parsing error for ${originalName}:`, docxErr.message);
          content = fs.readFileSync(req.file.path, 'utf-8');
        }
      } else if (ext === '.pdf' || req.file.mimetype === 'application/pdf') {
        try {
          const pdfParseModule = require('pdf-parse');
          const parseFn = typeof pdfParseModule === 'function' ? pdfParseModule : (pdfParseModule.default || pdfParseModule);
          const dataBuffer = fs.readFileSync(req.file.path);
          const pdfData = await parseFn(dataBuffer);
          content = pdfData.text || '';
          console.log(`[RAG Upload] Successfully extracted ${content.length} characters from PDF: ${originalName}`);
        } catch (pdfErr: any) {
          console.warn(`[RAG Upload] pdf-parse fallback error for ${originalName}:`, pdfErr.message);
          try {
            const rawBuf = fs.readFileSync(req.file.path);
            const rawStr = rawBuf.toString('binary');
            const matches = rawStr.match(/[\x20-\x7E\s]{4,}/g) || [];
            content = matches.filter((s: string) => !s.startsWith('%PDF') && !s.startsWith('/Font')).join('\n');
            console.log(`[RAG Upload] Extracted ${content.length} text chars via binary stream fallback for ${originalName}`);
          } catch (e) {
            content = '';
          }
        }
      } else {
        content = fs.readFileSync(req.file.path, 'utf-8');
      }
    } else {
      content = req.body.text || '';
    }

    const doc = ragEngine.addDocument(filename, originalName, mimeType, size, content);
    res.json({ success: true, doc });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/ai/documents/:id', (req, res) => {
  try {
    const { ragEngine } = require('./ragEngine');
    const success = ragEngine.deleteDocument(req.params.id);
    res.json({ success });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`[AI Vastra CRM Backend] Server running on port ${PORT}`);
  console.log(`[AI Vastra CRM Backend] CRM API is ONLINE. WhatsApp session starting in background...`);
  console.log(`=======================================================`);

  // Fire-and-forget: Start WhatsApp session in background WITHOUT blocking the server
  // Any crash in Baileys will be caught by process.on('uncaughtException') above
  setTimeout(() => {
    waEngine.initialize().catch((err) => {
      console.error('[AI Vastra CRM Backend] Non-fatal WhatsApp Engine init error:', err?.message || err);
    });
  }, 2000);
});
