const path = require('path');
const fs = require('fs');

async function main() {
  const searchTerm = (process.argv[2] || '').toLowerCase().trim();
  const dbPath = path.join(__dirname, 'data', 'crm_database.sqlite3');

  let rows = [];

  // 1. Try querying SQLite directly
  if (fs.existsSync(dbPath)) {
    try {
      const sqlite3 = require('sqlite3').verbose();
      rows = await new Promise((resolve, reject) => {
        const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
          if (err) return reject(err);
        });

        const sql = `
          SELECT 
            COALESCE(NULLIF(name, ''), jid) AS name,
            COALESCE(NULLIF(phone, ''), '') AS phone,
            jid,
            COALESCE(lead_status, 'UNASSIGNED') AS lead_status,
            COALESCE(call_status, '—') AS call_status,
            COALESCE(follow_up_date, '—') AS follow_up_date,
            COALESCE(notes, '') AS notes,
            updated_at
          FROM crm_contacts
          ORDER BY updated_at DESC
        `;

        db.all(sql, [], (err, results) => {
          db.close();
          if (err) return reject(err);
          resolve(results || []);
        });
      });
    } catch (e) {
      // Fallback to store if sqlite3 fails
    }
  }

  // 2. If no rows from direct sqlite, try loading through backend store
  if (rows.length === 0) {
    try {
      const { db } = require('./dist/store');
      await db.initSqlData();
      const chats = db.getAllChatsSorted();
      rows = chats.map(c => ({
        name: c.name || c.phone || c.jid,
        phone: c.phone || '',
        jid: c.jid || '',
        lead_status: c.leadStatus || 'UNASSIGNED',
        call_status: c.callStatus || '—',
        follow_up_date: c.followUpDate || '—',
        notes: c.notes || '',
        updated_at: c.updatedAt || 0
      }));
    } catch (e) {
      // Store fallback error ignored
    }
  }

  // Filter out social leads (Instagram, LinkedIn, Facebook)
  rows = rows.filter(r => {
    const jid = (r.jid || '').toLowerCase();
    return !jid.includes('@instagram') && !jid.includes('@linkedin') && !jid.includes('@facebook');
  });

  // Apply search term if provided
  if (searchTerm) {
    rows = rows.filter(r => {
      const name = (r.name || '').toLowerCase();
      const phone = (r.phone || '').toLowerCase();
      const jid = (r.jid || '').toLowerCase();
      const notes = (r.notes || '').toLowerCase();
      const status = (r.lead_status || '').toLowerCase();
      return name.includes(searchTerm) || phone.includes(searchTerm) || jid.includes(searchTerm) || notes.includes(searchTerm) || status.includes(searchTerm);
    });
  }

  if (rows.length === 0) {
    console.log('\n[AI Vastra CRM] No WhatsApp leads found in database' + (searchTerm ? ` matching "${searchTerm}"` : '') + '.\n');
    process.exit(0);
  }

  // Format phone number for clean display
  const formatPhone = (phone, jid) => {
    let raw = (phone || '').replace(/\D/g, '');
    if (!raw && jid && (jid.includes('@s.whatsapp.net') || jid.includes('@c.us'))) {
      raw = jid.split('@')[0].split(':')[0].replace(/\D/g, '');
    }
    if (!raw) return '—';
    if (raw.length === 12 && raw.startsWith('91')) {
      return `+91 ${raw.slice(2, 7)} ${raw.slice(7)}`;
    }
    if (raw.length === 10) {
      return `+91 ${raw.slice(0, 5)} ${raw.slice(5)}`;
    }
    return `+${raw}`;
  };

  const tableData = rows.map((r, idx) => {
    const cleanNotes = (r.notes || '').replace(/[\r\n]+/g, ' | ').trim();
    const truncatedNotes = cleanNotes.length > 45 ? cleanNotes.slice(0, 42) + '...' : cleanNotes;

    return {
      '#': idx + 1,
      'Contact Name': r.name || '—',
      'Phone Number': formatPhone(r.phone, r.jid),
      'Lead Status': r.lead_status || 'UNASSIGNED',
      'Call': r.call_status || '—',
      'Follow-Up': r.follow_up_date || '—',
      'Notes': truncatedNotes || '—'
    };
  });

  console.log('\n======================================== AI VASTRA CRM: WHATSAPP LEADS DATABASE ========================================');
  console.table(tableData);
  console.log(`Total Leads Stored in Database: ${tableData.length}`);
  console.log('=========================================================================================================================\n');

  process.exit(0);
}

main().catch(err => {
  console.error('[AI Vastra CRM] Error:', err.message);
  process.exit(1);
});
