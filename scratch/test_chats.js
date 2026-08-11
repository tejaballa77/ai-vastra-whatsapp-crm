const { db } = require('../backend/dist/store.js');
console.log('Total message keys:', db.messages.size);
const sampleJid = '917065858588@s.whatsapp.net';
const msgs = db.getMessagesForChat(sampleJid);
console.log(`Messages for ${sampleJid}:`, msgs.length);
if (msgs.length > 0) {
  console.log('Sample msg:', msgs[0]);
}
