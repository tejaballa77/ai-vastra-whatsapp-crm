const path = require('path');
const fs = require('fs');

async function main() {
  const searchTerm = (process.argv[2] || '').toLowerCase().trim();
  const dbPath = path.join(__dirname, 'data', 'crm_database.sqlite3');

  // 1. Permanently delete test records (0, 1, 2) from SQLite database
  if (fs.existsSync(dbPath)) {
    try {
      const sqlite3 = require('sqlite3').verbose();
      await new Promise((resolve) => {
        const dbConn = new sqlite3.Database(dbPath, (err) => {
          if (err) return resolve();
          dbConn.run(
            `DELETE FROM crm_contacts 
             WHERE LOWER(jid) LIKE '%client new%' 
                OR LOWER(jid) LIKE '%sai durga%' 
                OR LOWER(jid) LIKE '%durga rao%' 
                OR LOWER(name) LIKE '%client new%' 
                OR LOWER(name) LIKE '%sai durga%' 
                OR LOWER(name) LIKE '%durga rao%'`,
            () => {
              dbConn.run(
                `DELETE FROM crm_chats 
                 WHERE LOWER(jid) LIKE '%client new%' 
                    OR LOWER(jid) LIKE '%sai durga%' 
                    OR LOWER(jid) LIKE '%durga rao%' 
                    OR LOWER(name) LIKE '%client new%' 
                    OR LOWER(name) LIKE '%sai durga%' 
                    OR LOWER(name) LIKE '%durga rao%'`,
                () => {
                  dbConn.close();
                  resolve();
                }
              );
            }
          );
        });
      });
    } catch (e) {
      // Ignore cleanup error and proceed
    }
  }

  // 2. Load CRM store
  const { db } = require('./dist/store');
  await db.initSqlData();

  const testKeywords = ['client new', 'sai durga', 'durga rao'];

  // Filter contacts: only show genuine WhatsApp CRM leads (exclude socials, test rows, and blank non-CRM chats)
  let list = db.getAllChatsSorted().filter((c) => {
    const jid = (c.jid || '').toLowerCase();
    const name = (c.name || '').toLowerCase();

    // Exclude social leads
    if (jid.includes('@instagram') || jid.includes('@linkedin') || jid.includes('@facebook')) {
      return false;
    }

    // Exclude test contacts 0, 1, 2
    for (const kw of testKeywords) {
      if (jid.includes(kw) || name.includes(kw)) {
        return false;
      }
    }

    // Must have real CRM data entered
    const hasStatus = c.leadStatus && c.leadStatus !== 'UNASSIGNED';
    const hasNotes = Boolean((c.notes && c.notes.trim().length > 0) || (c.notesList && c.notesList.length > 0));
    const hasFollowUp = Boolean(c.followUpDate && c.followUpDate !== '—' && c.followUpDate.trim().length > 0);
    const hasCall = Boolean(c.callStatus && c.callStatus !== '—');

    return hasStatus || hasNotes || hasFollowUp || hasCall || c.manuallySaved;
  });

  // Apply search filter if provided
  if (searchTerm) {
    list = list.filter((c) => {
      const n = (c.name || '').toLowerCase();
      const p = (c.phone || '').toLowerCase();
      const j = (c.jid || '').toLowerCase();
      const nt = (c.notes || '').toLowerCase();
      const st = (c.leadStatus || '').toLowerCase();
      return n.includes(searchTerm) || p.includes(searchTerm) || j.includes(searchTerm) || nt.includes(searchTerm) || st.includes(searchTerm);
    });
  }

  if (list.length === 0) {
    console.log('\n[AI Vastra CRM] No WhatsApp leads found' + (searchTerm ? ` matching "${searchTerm}"` : '') + '.\n');
    process.exit(0);
  }

  const tableData = list.map((c, idx) => {
    const displayName = c.name || c.phone || c.jid;
    const cleanNotes = (c.notes || '').replace(/[\r\n]+/g, ' ').trim();
    const truncatedNotes = cleanNotes.length > 45 ? cleanNotes.slice(0, 42) + '...' : cleanNotes;

    return {
      '#': idx + 1,
      'Name / Phone': displayName,
      'JID': c.jid || '—',
      'Lead Status': c.leadStatus || 'UNASSIGNED',
      'Call': c.callStatus || '—',
      'Follow-Up Date': c.followUpDate || '—',
      'Notes': truncatedNotes || '—'
    };
  });

  console.log('\n======================================== AI VASTRA CRM: WHATSAPP LEADS DATABASE ========================================');
  console.table(tableData);
  console.log(`Total Leads Stored in Database: ${tableData.length}`);
  console.log('=========================================================================================================================\n');

  process.exit(0);
}

main().catch((err) => {
  console.error('[AI Vastra CRM] Error:', err.message);
  process.exit(1);
});
