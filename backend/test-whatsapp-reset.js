const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3');
const { resetWhatsApp, isWhatsApp } = require('./reset-whatsapp-only');
const run = (db, sql) => new Promise((resolve, reject) => db.exec(sql, (error) => error ? reject(error) : resolve()));
const all = (db, sql) => new Promise((resolve, reject) => db.all(sql, (error, rows) => error ? reject(error) : resolve(rows)));
const close = (db) => new Promise((resolve, reject) => db.close((error) => error ? reject(error) : resolve()));

async function main() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'whatsapp-reset-test-'));
  const filename = path.join(directory, 'crm_database.sqlite3');
  const db = new sqlite3.Database(filename);
  await run(db, `
    CREATE TABLE crm_contacts(jid TEXT PRIMARY KEY, name TEXT);
    CREATE TABLE crm_chats(jid TEXT PRIMARY KEY, notes TEXT);
    CREATE TABLE crm_messages(id TEXT PRIMARY KEY, chat_jid TEXT, text TEXT);
    CREATE TABLE cold_calls(id TEXT PRIMARY KEY, notes TEXT);
    CREATE TABLE archived_cleared_leads(id TEXT PRIMARY KEY, notes TEXT);
    INSERT INTO crm_contacts VALUES ('918471058274@s.whatsapp.net','Unsaved'),('global@instagram','Social');
    INSERT INTO crm_chats VALUES ('918471058274@s.whatsapp.net','wa note'),('global@instagram','ig note'),('user@linkedin','li note'),('user@facebook','fb note');
    INSERT INTO crm_messages VALUES ('wa','918471058274@s.whatsapp.net','private'),('ig','global@instagram','preserved');
    INSERT INTO cold_calls VALUES ('one','must stay');
    INSERT INTO archived_cleared_leads VALUES ('one','must stay');
  `);
  await close(db);
  const legacy = { contacts: { '918471058274@s.whatsapp.net': { jid: '918471058274@s.whatsapp.net' }, 'global@instagram': { jid: 'global@instagram' } }, chats: { '918471058274@s.whatsapp.net': { notes: 'old' }, 'global@instagram': { notes: 'keep' } }, messages: {}, coldCalls: { one: { notes: 'keep' } } };
  for (const name of ['db.json', 'db.json.bak']) fs.writeFileSync(path.join(directory, name), JSON.stringify(legacy));
  const report = await resetWhatsApp(directory);
  assert.equal(report.deleted.crm_chats, 1);
  assert.equal(report.deleted.crm_contacts, 1);
  assert.equal(report.deleted.crm_messages, 1);
  const current = new sqlite3.Database(filename);
  assert.deepEqual(await all(current, 'SELECT jid FROM crm_chats ORDER BY jid'), [{ jid: 'global@instagram' }, { jid: 'user@facebook' }, { jid: 'user@linkedin' }]);
  assert.deepEqual(await all(current, 'SELECT * FROM cold_calls'), [{ id: 'one', notes: 'must stay' }]);
  assert.equal((await all(current, 'SELECT * FROM archived_cleared_leads')).length, 1);
  await close(current);
  const backup = new sqlite3.Database(path.join(report.backupDir, 'crm_database.sqlite3'), sqlite3.OPEN_READONLY);
  assert.equal((await all(backup, 'SELECT * FROM crm_chats')).length, 4);
  await close(backup);
  for (const name of ['db.json', 'db.json.bak']) {
    const cleaned = JSON.parse(fs.readFileSync(path.join(directory, name)));
    assert.equal(cleaned.chats['918471058274@s.whatsapp.net'], undefined);
    assert.deepEqual(cleaned.chats['global@instagram'], { notes: 'keep' });
    assert.deepEqual(cleaned.coldCalls, legacy.coldCalls);
  }
  assert.equal(isWhatsApp('global@instagram'), false);
  assert.equal(isWhatsApp('1234567890@linkedin'), false);
  assert.equal(isWhatsApp('unknown-entry'), false);
  console.log('PASS: WhatsApp rows cleared; social/cold-call/archive rows unchanged; SQLite and legacy JSON backups verified.');
  console.log('Disposable fixture retained at:', directory);
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
