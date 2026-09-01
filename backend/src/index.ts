import express from 'express';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { WhatsAppEngine } from './whatsappEngine';
import { db } from './store';
import { DbMigrator } from './dbMigrator';

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
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

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

  // Send initial chat list, cold calls & active users from local cache
  socket.emit('chats_updated', db.getAllChatsSorted());
  socket.emit('cold_calls_updated', db.getAllColdCalls());
  socket.emit('users_updated', db.getActiveUsers());

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

// 3b. Reset session for fresh QR re-sync (Preserves all CRM Lead Data & Extension Entries)
app.post('/api/session/reset', async (req, res) => {
  try {
    await waEngine.disconnect();
    waEngine.clearAuthAndStore();
    res.json({ success: true, message: 'WhatsApp session unlinked cleanly. All CRM Data preserved.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 3c. AI Auto-Reply status and toggle endpoints
app.get('/api/ai/status', (req, res) => {
  res.json({ enabled: waEngine.aiAutoReplyEnabled });
});

app.post('/api/ai/toggle', (req, res) => {
  const { enabled } = req.body;
  if (typeof enabled === 'boolean') {
    waEngine.aiAutoReplyEnabled = enabled;
  } else {
    waEngine.aiAutoReplyEnabled = !waEngine.aiAutoReplyEnabled;
  }
  console.log(`[AI Auto-Reply] Status changed to: ${waEngine.aiAutoReplyEnabled ? 'ENABLED' : 'DISABLED'}`);
  io.emit('ai_status', { enabled: waEngine.aiAutoReplyEnabled });
  res.json({ success: true, enabled: waEngine.aiAutoReplyEnabled });
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
const handleCrmUpdate = (req: express.Request, res: express.Response) => {
  const bodyJid = req.body.jid;
  const paramJid = req.params.jid;
  const { name, phone, leadStatus, callStatus, followUpDate, previousFollowUpDate, notes, notesList, tags, aiDisabled, isAutoWarm, manuallySaved } = req.body;
  const targetJid = paramJid || bodyJid || (phone ? `${phone}@s.whatsapp.net` : '');

  if (!targetJid) {
    return res.status(400).json({ success: false, error: 'Missing contact identifier or phone number' });
  }

  const updatedChat = db.updateCrmMetadata(targetJid, {
    name,
    phone,
    leadStatus,
    callStatus,
    followUpDate,
    previousFollowUpDate,
    notes,
    notesList,
    tags,
    aiDisabled,
    isAutoWarm,
    manuallySaved,
  });

  // Broadcast update to all connected clients
  io.emit('chats_updated', db.getAllChatsSorted());
  io.emit('cold_calls_updated', db.getAllColdCalls());

  res.json({ success: true, chat: updatedChat });
};

app.post('/api/crm/contact', handleCrmUpdate);
app.put('/api/crm/contact', handleCrmUpdate);
app.put('/api/crm/contact/:jid', handleCrmUpdate);

// Get archived cleared CRM leads
app.get('/api/crm/archived-cleared', (req, res) => {
  res.json({ success: true, archivedLeads: db.getArchivedClearedLeads() });
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

// 11. Delete a chat by JID or Phone
app.delete('/api/chats/:jid', (req, res) => {
  const { jid } = req.params;
  if (jid) {
    db.deleteChat(jid);
    io.emit('chats_updated', db.getAllChatsSorted());
    io.emit('cold_calls_updated', db.getAllColdCalls());
  }
  res.json({ success: true, message: 'Chat deleted successfully' });
});

app.post('/api/crm/contact/clear', (req, res) => {
  const { jid, phone, name } = req.body;
  const target = jid || phone || name;
  if (target) {
    db.deleteChat(target);
    if (phone) db.deleteChat(phone);
    io.emit('chats_updated', db.getAllChatsSorted());
    io.emit('cold_calls_updated', db.getAllColdCalls());
  }
  res.json({ success: true, message: 'Contact cleared successfully' });
});

// 11b. Clear All WhatsApp CRM Data (Fresh Start)
app.post('/api/crm/clear-all-whatsapp-data', (req, res) => {
  db.clearAllWhatsAppCrmData();
  io.emit('chats_updated', []);
  res.json({ success: true, message: 'All WhatsApp CRM database data cleared cleanly' });
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

// Clear all cold call leads completely (Cold calls block ONLY)
app.delete('/api/cold-calls/clear-all', (req, res) => {
  db.clearColdCalls();
  io.emit('cold_calls_updated', []);
  res.json({ success: true, message: 'All cold calls data cleared successfully' });
});

// Rename campaign across all cold call leads
app.put('/api/cold-calls/campaign/rename', (req, res) => {
  const { oldName, newName } = req.body;
  if (!oldName || !newName) {
    return res.status(400).json({ error: 'oldName and newName are required' });
  }
  const updatedCount = db.renameCampaign(oldName, newName);
  io.emit('cold_calls_updated', db.getAllColdCalls());
  res.json({ success: true, updatedCount });
});

// Get active CRM users
app.get('/api/users/active', (req, res) => {
  res.json({ success: true, activeUsers: db.getActiveUsers() });
});

// Register active CRM user login
app.post('/api/users/active', (req, res) => {
  const { username } = req.body;
  if (username) {
    db.registerActiveUser(username);
    io.emit('users_updated', db.getActiveUsers());
  }
  res.json({ success: true, activeUsers: db.getActiveUsers() });
});

// Update cold call lead (Notes, Follow-up Date, Call Status, etc.)
app.put('/api/cold-calls/:id', (req, res) => {
  const { id } = req.params;
  if (req.body.calledBy) {
    db.registerActiveUser(req.body.calledBy);
    io.emit('users_updated', db.getActiveUsers());
  }
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

app.post('/api/backup/google-drive', async (req, res) => {
  try {
    const { googleDriveBackupService } = require('./googleDriveBackup');
    const result = await googleDriveBackupService.performBackup();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/backup/status', (req, res) => {
  const credsPath = path.join(__dirname, '../data/google-service-account.json');
  const hasCreds = Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || fs.existsSync(credsPath));
  res.json({
    hasCredentials: hasCreds,
    scheduleInterval: 'Every 3 hours',
    folderId: process.env.GOOGLE_DRIVE_FOLDER_ID || 'Configured via .env',
  });
});

app.get('/api/settings/backup', (req, res) => {
  res.json({ success: true, settings: db.backupSettings });
});

app.post('/api/settings/backup', (req, res) => {
  const { enabled, backupTime, folderPath } = req.body;
  if (typeof enabled === 'boolean') db.backupSettings.enabled = enabled;
  if (typeof backupTime === 'string') db.backupSettings.backupTime = backupTime.trim();
  if (typeof folderPath === 'string') db.backupSettings.folderPath = folderPath.trim();

  db.saveData();
  res.json({ success: true, settings: db.backupSettings, message: 'Backup settings saved successfully.' });
});

app.post('/api/settings/backup/run', (req, res) => {
  const customFolder = req.body.folderPath || db.backupSettings.folderPath;
  const result = db.runAutomatedBackupNow(customFolder);
  res.json(result);
});

server.listen(PORT, async () => {
  console.log(`=======================================================`);
  console.log(`[AI Vastra CRM Backend] Server running on port ${PORT}`);
  console.log(`[AI Vastra CRM Backend] Initializing SQL Database & Auto-Migrating Data...`);

  try {
    await DbMigrator.runAutoMigration();
    await db.initSqlData();
  } catch (err: any) {
    console.error('[AI Vastra CRM Backend] Database init error:', err.message);
  }

  console.log(`[AI Vastra CRM Backend] CRM Database ONLINE. WhatsApp session starting in background...`);
  console.log(`=======================================================`);

  // Fire-and-forget: Start WhatsApp session in background WITHOUT blocking the server
  setTimeout(() => {
    waEngine.initialize().catch((err) => {
      console.error('[AI Vastra CRM Backend] Non-fatal WhatsApp Engine init error:', err?.message || err);
    });
  }, 2000);

  // Background Automated Daily IST Backup Scheduler (checks every 30 seconds)
  setInterval(() => {
    try {
      const settings = db.backupSettings;
      if (!settings || !settings.enabled || !settings.backupTime) return;

      const now = new Date();
      const istTimeStr = now.toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata', hour12: false });
      const currentHourMin = istTimeStr.slice(0, 5); // "21:00"
      const dateStr = `${String(now.getDate()).padStart(2, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${now.getFullYear()}`;

      if (currentHourMin === settings.backupTime && settings.lastBackupDate !== dateStr) {
        console.log(`[Automated Daily IST Backup] Scheduled time ${settings.backupTime} IST reached. Running daily backup...`);
        const res = db.runAutomatedBackupNow(settings.folderPath);
        console.log(`[Automated Daily IST Backup] ${res.message}`);
      }
    } catch (err: any) {
      console.error('[Automated Daily IST Backup] Interval error:', err.message);
    }
  }, 30000);
});
