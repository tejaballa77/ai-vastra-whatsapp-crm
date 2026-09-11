const { dbManager } = require('./dist/db');
const { db } = require('./dist/store');

(async () => {
  try {
    await dbManager.initTables();
    await db.initSqlData();

    const chats = db.getAllChatsSorted().filter(c => {
      const hasStatus = Boolean(c.leadStatus && c.leadStatus !== 'UNASSIGNED');
      const hasCall = Boolean(c.callStatus && c.callStatus !== '—');
      const hasFollow = Boolean(c.followUpDate && c.followUpDate.trim().length > 0 && c.followUpDate !== '—');
      const hasNotes = Boolean((c.notesList && c.notesList.length > 0) || (c.notes && c.notes.trim().length > 0));
      return hasStatus || hasCall || hasFollow || hasNotes || c.manuallySaved;
    });

    const rows = chats.map(c => ({
      JID: c.jid,
      Name: c.name || 'Unsaved',
      Phone: c.phone || '—',
      'Lead Status': c.leadStatus || 'UNASSIGNED',
      'Call Status': c.callStatus || '—',
      'Follow-Up': c.followUpDate || '—',
      BDM: c.assignedUser || '—',
      Language: c.clientLanguage || '—',
      Notes: (c.notesList || []).join(' | ') || c.notes || '—'
    }));

    console.log('\n====================================================================================');
    console.log(`📊 AI VASTRA CRM - SAVED & EXTENSION ENTERED CHATS (${rows.length} Total Records)`);
    console.log('====================================================================================\n');

    if (rows.length === 0) {
      console.log('No saved CRM chats found yet.');
    } else {
      console.table(rows);
    }
  } catch (err) {
    console.error('Error fetching CRM data:', err.message);
  } finally {
    process.exit(0);
  }
})();
