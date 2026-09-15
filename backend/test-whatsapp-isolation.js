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
test('CRM shows phone-JID aliases once despite stale phone columns and device suffixes', () => {
  const source = fs.readFileSync(path.join(root, 'frontend/src/components/WhatsAppCrmModule.tsx'), 'utf8');
  const block = source.slice(source.indexOf('  const phoneToKey ='), source.indexOf('  const allRawChats ='));
  const code = ts.transpileModule(block + '\n globalThis.result = Array.from(chatsMap.values());', { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
  const context = { rawChats: [
    { jid: '918471058274@s.whatsapp.net', phone: '918471058274', name: 'Contact', notesList: ['keep'] },
    { jid: '918471058274@c.us', phone: '919000000001', name: 'Contact', notesList: ['keep'] },
    { jid: '918471058274:12@s.whatsapp.net', name: 'Contact', notesList: ['keep'] },
    { jid: '919000000001@s.whatsapp.net', phone: '918471058274', name: 'Contact', notesList: ['separate'] },
  ], BAD_NAMES: new Set(), canonicalPhone: (p) => p.length === 12 && p.startsWith('91') ? p.slice(2) : p };
  vm.runInNewContext(code, context);
  assert.equal(context.result.length, 2);
  assert.deepEqual(Array.from(context.result[0].notesList), ['keep']);
  const db = makeStore();
  assert.equal(db.resolveJid('918471058274:12@c.us'), '918471058274@s.whatsapp.net');
});
test('startup does not delete saved leads or apply hardcoded contact corrections', () => {
  const source = fs.readFileSync(path.join(__dirname, 'src/store.ts'), 'utf8');
  const startup = source.slice(0, source.indexOf('  public saveData()'));
  assert.equal(/DELETE FROM crm_(?:chats|contacts)/i.test(startup), false);
  assert.equal(startup.includes('Contradictions'), false);
});
test('phone-keyed extension data renders before a slow server responds, but stale chats do not render', () => {
  const context = { console, setTimeout: () => {}, setInterval: () => {}, rendered: [],
    chrome: { storage: { local: { get: (keys, cb) => cb({ crm_meta_918471058274: { notesList: ['keep'], leadStatus: 'INTERESTED' } }) } }, runtime: { sendMessage: () => {} } } };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, 'X/content.js'), 'utf8'), context);
  vm.runInContext("renderCrmPanel = () => rendered.push([...activeFormData.notesList]); activePhoneClean = '918471058274'; activeDisplayName = 'New Saved Name'; fetchRequestGeneration = 4; fetchCrmMetadata('918471058274', 'New Saved Name', '', 4);", context);
  assert.equal(context.rendered.length, 1);
  assert.deepEqual(Array.from(context.rendered[0]), ['keep']);
  vm.runInContext("fetchCrmMetadata('918471058274', 'Old Chat', '', 3);", context);
  assert.equal(context.rendered.length, 1);
});
test('unsaving a contact syncs its verified formatted phone without damaging numeric names', () => {
  const context = { console, setTimeout: () => {}, setInterval: () => {} };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, 'X/content.js'), 'utf8'), context);
  assert.equal(vm.runInContext("getContactTitleToSync('+91 84710 58274', '918471058274')", context), '+91 84710 58274');
  assert.equal(vm.runInContext("getContactTitleToSync('+91 90000 00001', '918471058274')", context), '');
  assert.equal(vm.runInContext("getContactTitleToSync('Teja 1', '918471058274')", context), 'Teja 1');
  assert.equal(vm.runInContext("getContactTitleToSync('123455', '918471058274')", context), '123455');
});
test('contact drawer fallback accepts only the matching labelled WhatsApp panel', () => {
  const title = { getAttribute: () => 'Google Maps India', textContent: 'Google Maps India' };
  const panel = { id: 'wa-info', closest: () => null, getAttribute: () => 'Contact info', querySelectorAll: (q) => q.includes('span') ? [title] : [] };
  const document = { querySelector: (q) => q.includes('#main') ? title : null, querySelectorAll: () => [panel] };
  const context = { document, console, setTimeout: () => {}, setInterval: () => {} };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, 'X/content.js'), 'utf8'), context);
  assert.equal(vm.runInContext('findActiveContactInfoDrawer()', context), panel);
  panel.id = 'aivastra-crm-panel';
  assert.equal(vm.runInContext('findActiveContactInfoDrawer()', context), null);
});
test('international phone JIDs retain full country codes and do not merge across countries', () => {
  const db = makeStore();
  const numbers = ['923128304098', '14155552671', '447911123456', '971501234567', '6591234567', '3545551234', '918471058274', '8471058274'];
  for (const phone of numbers) {
    const jid = `${phone}@s.whatsapp.net`;
    db.updateCrmMetadata(jid, { phone, name: `Contact ${phone}`, notesList: [`private ${phone}`], leadStatus: 'INTERESTED' });
    assert.equal(db.resolveJid(jid), jid);
    assert.equal(db.chats.get(jid).phone, phone);
    assert.equal(db.contacts.get(jid).phone, phone);
    assert.equal(db.formatPhoneFallback(phone).replace(/\D/g, ''), phone);
  }
  assert.equal(db.chats.size, numbers.length);
  assert.throws(() => db.updateCrmMetadata('8471058274@s.whatsapp.net', { phone: '918471058274' }), /does not match/);
  const context = { console, setTimeout: () => {}, setInterval: () => {} };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, 'X/content.js'), 'utf8'), context);
  for (const phone of numbers) assert.equal(vm.runInContext(`getContactTitleToSync('+${phone}', '${phone}')`, context).replace(/\D/g, ''), phone);
});
test('extension save preserves a ten-digit international number instead of prepending India', () => {
  const sent = [];
  const span = { getAttribute: () => '+65 9123 4567' };
  const document = { querySelector: () => ({ querySelectorAll: () => [span] }) };
  const context = { document, console, alert: message => { throw Error(message); }, setTimeout: () => {}, setInterval: () => {} };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, 'X/content.js'), 'utf8'), context);
  context.sent = sent;
  vm.runInContext("activePhoneClean = '6591234567'; activeDisplayName = '+65 9123 4567'; extractPhoneNumberFromDom = () => '6591234567'; safeStorageSet = () => {}; safeSendMessage = message => sent.push(message); injectChatListBadges = () => {}; activeFormData.notesList = ['keep']; saveCrmMetadata();", context);
  assert.equal(sent[0].jid, '6591234567@s.whatsapp.net');
  assert.equal(sent[0].data.phone, '6591234567');
});
test('business contact phone extraction handles typed JIDs, nested number text and ambiguity safely', () => {
  const context = { console, setTimeout: () => {}, setInterval: () => {} };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, 'X/content.js'), 'utf8'), context);
  assert.equal(vm.runInContext("contactRecordPhone({id: {user: '123456789012345', server:'lid'}, pnJid: {user:'923128304098',server:'s.whatsapp.net'}})", context), '923128304098');
  assert.equal(vm.runInContext("contactRecordPhone({id: {user:'123456789012345',server:'lid'}})", context), '');
  assert.equal(vm.runInContext("contactRecordPhone({id:'6591234567:12@c.us'})", context), '6591234567');
  const node = text => ({ children: [{}], textContent: text, closest: () => null });
  context.drawer = { querySelectorAll: selector => selector.startsWith('a[href') ? [] : [node('+92 312 8304098'), node('123455'), node('10:00 AM - 6:00 PM')] };
  assert.equal(vm.runInContext('extractContactInfoPhone(drawer)', context), '923128304098');
  context.drawer = { querySelectorAll: selector => selector.startsWith('a[href') ? [] : [node('+92 312 8304098'), node('+91 84710 58274')] };
  assert.equal(vm.runInContext('extractContactInfoPhone(drawer)', context), '');
});
test('unlabelled business info pane is bounded to the active contact, not the app or CRM', () => {
  const title = { textContent: 'Business Contact', children: [], getAttribute: () => '' };
  const header = { getAttribute: () => 'Business Contact' };
  const panel = { id: 'business-pane', querySelector: () => null, querySelectorAll: () => [title], parentElement: null };
  const marker = { textContent: 'Contact info', children: [], closest: () => null, parentElement: panel };
  const document = { body: {}, querySelector: selector => selector.includes('#main') ? header : null, querySelectorAll: selector => selector.includes('[role="dialog"]') ? [] : [marker] };
  const context = { document, console, setTimeout: () => {}, setInterval: () => {} };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, 'X/content.js'), 'utf8'), context);
  assert.equal(vm.runInContext('findActiveContactInfoDrawer()', context), panel);
  panel.id = 'app';
  assert.equal(vm.runInContext('findActiveContactInfoDrawer()', context), null);
});
test('Save click does not claim success before server confirmation', () => {
  const source = fs.readFileSync(path.join(root, 'X/content.js'), 'utf8');
  const handler = source.slice(source.indexOf("document.getElementById('aivastra-save-main-btn').onclick"), source.indexOf('// Dustbin delete buttons'));
  assert.equal(handler.includes('avatarUrl, true'), false);
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
async function testRenameRefresh() {
  const openRequest = {};
  const readRequest = {};
  const transaction = { objectStore: () => ({ getAll: () => readRequest }) };
  const context = { console, setTimeout: () => {}, setInterval: () => {}, detections: 0,
    indexedDB: { databases: async () => [{ name: 'model-storage' }], open: () => openRequest } };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, 'X/content.js'), 'utf8'), context);
  vm.runInContext("detectActiveContact = () => { detections++; }; indexedDbContactMap.set('old name', '918471058274');", context);
  await vm.runInContext('syncContactsFromIndexedDb()', context);
  openRequest.onsuccess({ target: { result: { objectStoreNames: ['contact'], transaction: () => transaction, close: () => {} } } });
  readRequest.onsuccess({ target: { result: [{ id: '918471058274@c.us', name: 'New Name' }] } });
  assert.equal(context.detections, 1);
  assert.equal(vm.runInContext("findPhoneInCacheByName('New Name')", context), '918471058274');
  assert.equal(vm.runInContext("findPhoneInCacheByName('Old Name')", context), '');
  transaction.oncomplete();
  console.log('PASS: refreshed WhatsApp address book resolves renamed contact immediately and removes stale name mappings.');
}
testRenameRefresh().catch(error => { console.error(error); process.exitCode = 1; });
