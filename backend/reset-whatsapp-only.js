// Offline, backed-up SQLite reset. Browser extension storage is never accessed.
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const crypto = require('node:crypto');
const sqlite3 = require('sqlite3');

function isWhatsApp(value) {
  return /^(?:\d{7,15}(?::\d+)?@(?:s\.whatsapp\.net|c\.us|lid)|[\d-]+@g\.us|\d{7,15})$/i.test(String(value || ''));
}
function query(db, sql, params = []) {
  return new Promise((resolve, reject) => db.all(sql, params, (error, rows) => error ? reject(error) : resolve(rows)));
}
function run(db, sql, params = []) {
  return new Promise((resolve, reject) => db.run(sql, params, function(error) { error ? reject(error) : resolve(this.changes); }));
}
function digest(rows) { return crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex'); }
function quote(value) { return '"' + value.replace(/"/g, '""') + '"'; }

async function resetWhatsApp(dataDir, allWhatsAppBlock = false) {
  // Explicit full-block mode matches the dashboard's non-social partition,
  // including legacy malformed identities the strict reset intentionally kept.
  const targetRow = (row, field) => allWhatsAppBlock
    ? !/instagram|linkedin|facebook/i.test(String(row[field] || '') + ' ' + String(row.phone || ''))
    : isWhatsApp(row[field]);
  const filename = path.join(dataDir, 'crm_database.sqlite3');
  if (!fs.existsSync(filename)) throw new Error('Existing SQLite database not found; refusing to create one.');
  const db = await new Promise((resolve, reject) => {
    const connection = new sqlite3.Database(filename, sqlite3.OPEN_READWRITE, (error) => error ? reject(error) : resolve(connection));
  });
  const backupDir = path.join(dataDir, 'whatsapp-reset-backups', new Date().toISOString().replace(/[:.]/g, '-') + '-' + crypto.randomBytes(3).toString('hex'));
  const jsonPlans = [];
  let transaction = false;
  let committed = false;
  try {
    await run(db, 'PRAGMA busy_timeout=5000');
    const tables = (await query(db, "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")).map((row) => row.name);
    for (const required of ['crm_contacts', 'crm_chats', 'crm_messages']) {
      if (!tables.includes(required)) throw new Error('Missing required table: ' + required);
    }
    // Triggers could modify unrelated rows/tables; do not proceed if any exist.
    if ((await query(db, "SELECT name FROM sqlite_master WHERE type='trigger'")).length) throw new Error('Database triggers found. Manual review required.');
    const before = {};
    const targets = {};
    for (const table of tables) {
      before[table] = await query(db, 'SELECT * FROM ' + quote(table) + ' ORDER BY rowid');
      const field = table === 'crm_messages' ? 'chat_jid' : 'jid';
      targets[table] = ['crm_contacts', 'crm_chats', 'crm_messages'].includes(table)
        ? before[table].filter((row) => targetRow(row, field)) : [];
    }
    for (const file of ['db.json', 'db.json.bak']) {
      const fullPath = path.join(dataDir, file);
      if (!fs.existsSync(fullPath)) continue;
      const original = fs.readFileSync(fullPath);
      const parsed = JSON.parse(original.toString('utf8'));
      for (const section of ['contacts', 'chats', 'messages']) {
        const entries = parsed[section];
        if (entries == null) continue;
        if (typeof entries !== 'object' || Array.isArray(entries)) throw new Error('Unsupported legacy JSON section: ' + section);
        for (const [key, value] of Object.entries(entries)) {
          if (allWhatsAppBlock ? targetRow({ jid: value?.jid || key, phone: value?.phone }, 'jid') : (isWhatsApp(key) || isWhatsApp(value?.jid) || (section === 'messages' && Array.isArray(value) && value.length && value.every((message) => isWhatsApp(message.chatJid))))) delete entries[key];
        }
      }
      jsonPlans.push({ fullPath, file, original, replacement: JSON.stringify(parsed, null, 2) });
    }
    fs.mkdirSync(backupDir, { recursive: true });
    await run(db, "VACUUM INTO '" + path.join(backupDir, 'crm_database.sqlite3').replace(/'/g, "''") + "'");
    for (const plan of jsonPlans) fs.writeFileSync(path.join(backupDir, plan.file), plan.original, { flag: 'wx' });
    await run(db, 'BEGIN IMMEDIATE');
    transaction = true;
    const deleted = {};
    for (const table of ['crm_messages', 'crm_chats', 'crm_contacts']) {
      const field = table === 'crm_messages' ? 'chat_jid' : 'jid';
      const identities = [...new Set(targets[table].map((row) => row[field]))];
      deleted[table] = 0;
      for (const identity of identities) deleted[table] += await run(db, `DELETE FROM ${quote(table)} WHERE ${quote(field)} = ?`, [identity]);
    }
    for (const table of tables) {
      const field = table === 'crm_messages' ? 'chat_jid' : 'jid';
      const expected = ['crm_contacts', 'crm_chats', 'crm_messages'].includes(table)
        ? before[table].filter((row) => !targetRow(row, field)) : before[table];
      const actual = await query(db, 'SELECT * FROM ' + quote(table) + ' ORDER BY rowid');
      if (digest(actual) !== digest(expected)) throw new Error('Preservation check failed: ' + table);
    }
    // Sanitize fallback JSON as well, preventing the next restart from restoring
    // deleted WhatsApp rows. Original files are in the backup directory.
    for (const plan of jsonPlans) fs.writeFileSync(plan.fullPath, plan.replacement);
    await run(db, 'COMMIT');
    transaction = false;
    committed = true;
    const report = { backupDir, deleted, preserved: Object.fromEntries(tables.map((table) => [table, before[table].length - targets[table].length])), extensionStorage: 'UNTOUCHED' };
    fs.writeFileSync(path.join(backupDir, 'report.json'), JSON.stringify(report, null, 2));
    return report;
  } catch (error) {
    if (!committed) {
      if (transaction) await run(db, 'ROLLBACK').catch(() => {});
      for (const plan of jsonPlans) fs.writeFileSync(plan.fullPath, plan.original);
    }
    throw error;
  } finally {
    await new Promise((resolve, reject) => db.close((error) => error ? reject(error) : resolve()));
  }
}

async function main() {
  if (!process.argv.includes('--confirm-whatsapp-only')) throw new Error('Explicit flag --confirm-whatsapp-only is required.');
  require('dotenv').config({ path: path.join(__dirname, '.env') });
  if (process.env.DATABASE_URL || process.env.PGHOST || process.env.POSTGRES_URL) throw new Error('PostgreSQL configuration found. This reset is SQLite-only.');
  const listening = await new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port: Number(process.env.PORT || 5000) });
    socket.setTimeout(1500);
    socket.on('connect', () => { socket.destroy(); resolve(true); });
    socket.on('error', () => resolve(false));
    socket.on('timeout', () => { socket.destroy(); resolve(true); });
  });
  if (listening) throw new Error('Stop crm-backend before resetting. Backend port is still active.');
  console.log(JSON.stringify(await resetWhatsApp(path.join(__dirname, 'data'), process.argv.includes('--all-whatsapp-block')), null, 2));
}
module.exports = { resetWhatsApp, isWhatsApp };
if (require.main === module) main().catch((error) => { console.error('RESET FAILED:', error.message); process.exitCode = 1; });
