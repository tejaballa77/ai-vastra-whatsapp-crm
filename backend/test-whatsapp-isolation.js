const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('PASS:', name); }
function makeStore() {
  const exports = {};
  const context = { exports, __dirname: path.join(__dirname, 'src'), console, Date, setTimeout,
    require(name) {
      if (name === 'fs') return { existsSync: () => true, writeFileSync: () => {} };
      if (name === 'path') return path;
      if (name === 'xlsx') return {};
      if (name === './db') return { dbManager: { query: async () => [] } };
      throw new Error('Unexpected dependency: ' + name);
    },
  };
  const source = fs.readFileSync(path.join(__dirname, 'src/store.ts'), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true, target: ts.ScriptTarget.ES2020 } }).outputText, context);
  return exports.db;
}
test('saving Global Traders preserves the separate unsaved lead and its notes', () => {
  const db = makeStore();
  db.updateCrmMetadata('918471058274@s.whatsapp.net', { phone: '918471058274', name: '+91 84710 58274', notesList: ['unsaved private note'], leadStatus: 'INTERESTED' });
  db.updateCrmMetadata('919000000001@s.whatsapp.net', { phone: '919000000001', name: 'Global Traders', notesList: ['global private note'], leadStatus: 'WARM' });
  assert.equal(db.chats.size, 2);
  assert.deepEqual(Array.from(db.chats.get('918471058274@s.whatsapp.net').notesList), ['unsaved private note']);
  assert.deepEqual(Array.from(db.chats.get('919000000001@s.whatsapp.net').notesList), ['global private note']);
});
test('backend rejects conflicting phone and JID before modifying either record', () => {
  const db = makeStore();
  assert.throws(() => db.updateCrmMetadata('918471058274@s.whatsapp.net', { phone: '919000000001', name: 'Global Traders' }), /does not match/);
  assert.equal(db.chats.size, 0);
});
test('backend rejects name-only identity instead of guessing a contact', () => {
  const db = makeStore();
  assert.throws(() => db.updateCrmMetadata('Global Traders', { name: 'Global Traders' }), /verified WhatsApp/);
});
test('exact numeric contact names and renamed names preserve notes on the same JID', () => {
  const db = makeStore();
  db.updateCrmMetadata('919000000001@s.whatsapp.net', { name: 'Global Traders', notesList: ['keep'] });
  db.updateCrmMetadata('919000000001@s.whatsapp.net', { name: 'Teja 1' });
  assert.equal(db.chats.get('919000000001@s.whatsapp.net').name, 'Teja 1');
  db.updateCrmMetadata('919000000001@s.whatsapp.net', { name: '123455' });
  assert.equal(db.chats.get('919000000001@s.whatsapp.net').name, '123455');
  assert.deepEqual(Array.from(db.chats.get('919000000001@s.whatsapp.net').notesList), ['keep']);
});
test('CRM frontend never merges different phones merely because names match', () => {
  const source = fs.readFileSync(path.join(root, 'frontend/src/components/WhatsAppCrmModule.tsx'), 'utf8');
  const block = source.slice(source.indexOf('  const phoneToKey ='), source.indexOf('  const allRawChats ='));
  const code = ts.transpileModule(block + '\n globalThis.result = Array.from(chatsMap.values());', { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
  const context = { rawChats: [{ jid: '918471058274@s.whatsapp.net', phone: '918471058274', name: 'Global Traders', notesList: ['first'] }, { jid: '919000000001@s.whatsapp.net', phone: '919000000001', name: 'Global Traders', notesList: ['second'] }], BAD_NAMES: new Set(), canonicalPhone: (p) => p.length === 12 && p.startsWith('91') ? p.slice(2) : p };
  vm.runInNewContext(code, context);
  assert.equal(context.result.length, 2);
});
test('extension cache cannot use corrupted CRM names to guess another phone', () => {
  const context = { console, setTimeout: () => {}, setInterval: () => {} };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, 'X/content.js'), 'utf8'), context);
  vm.runInContext("chatsMetadataMap = { wrong: { name: 'Global Traders', phone: '918471058274' } };", context);
  assert.equal(vm.runInContext("findPhoneInCacheByName('Global Traders')", context), '');
  vm.runInContext("indexedDbContactMap.set('global traders', '919000000001');", context);
  assert.equal(vm.runInContext("findPhoneInCacheByName('Global Traders 1')", context), '');
});
test('selected sidebar extraction cannot climb into another contact in its parent', () => {
  const title = { getAttribute: () => 'Global Traders' };
  const parent = { id: 'list-container', getAttribute: () => 'false_918471058274@c.us_message' };
  const row = { id: '', parentElement: parent, closest() { return this; }, getAttribute: () => '', querySelector: (selector) => selector === 'span[title]' ? title : null, querySelectorAll: () => [] };
  const header = { querySelectorAll: () => [] };
  const document = { body: {}, querySelector: (selector) => selector === '#pane-side [aria-selected="true"]' ? row : selector === '#main header span[title]' ? title : selector === '#main header' ? header : null, querySelectorAll: () => [] };
  const context = { document, console, setTimeout: () => {}, setInterval: () => {} };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, 'X/content.js'), 'utf8'), context);
  assert.equal(vm.runInContext('extractPhoneNumberFromDom()', context), '');
});
console.log(`${passed} isolation regression tests passed. No real database was accessed.`);
