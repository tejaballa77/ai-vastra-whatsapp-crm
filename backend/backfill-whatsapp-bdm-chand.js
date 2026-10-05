const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const dbPath = path.join(__dirname, 'data', 'crm_database.sqlite3');
const bdmName = 'chand';

const db = new sqlite3.Database(dbPath);

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(error) {
      if (error) reject(error);
      else resolve(this.changes || 0);
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => {
      if (error) reject(error);
      else resolve(row);
    });
  });
}

async function main() {
  const beforeChats = await get(
    `SELECT COUNT(*) AS count FROM crm_chats
     WHERE COALESCE(platform, 'whatsapp') = 'whatsapp'
       AND COALESCE(TRIM(assigned_user), '') = ''
       AND (
         manually_saved = 1 OR
         COALESCE(TRIM(notes), '') <> '' OR
         COALESCE(TRIM(follow_up_date), '') <> '' OR
         COALESCE(TRIM(call_status), '') <> '' OR
         COALESCE(TRIM(lead_status), '') NOT IN ('', 'UNASSIGNED')
       )`
  );
  const beforeContacts = await get(
    `SELECT COUNT(*) AS count FROM crm_contacts
     WHERE COALESCE(platform, 'whatsapp') = 'whatsapp'
       AND COALESCE(TRIM(assigned_user), '') = ''
       AND (
         manually_saved = 1 OR
         COALESCE(TRIM(notes), '') <> '' OR
         COALESCE(TRIM(follow_up_date), '') <> '' OR
         COALESCE(TRIM(call_status), '') <> '' OR
         COALESCE(TRIM(lead_status), '') NOT IN ('', 'UNASSIGNED')
       )`
  );

  await run('BEGIN TRANSACTION');
  try {
    const chatChanges = await run(
      `UPDATE crm_chats
       SET assigned_user = ?
       WHERE COALESCE(platform, 'whatsapp') = 'whatsapp'
         AND COALESCE(TRIM(assigned_user), '') = ''
         AND (
           manually_saved = 1 OR
           COALESCE(TRIM(notes), '') <> '' OR
           COALESCE(TRIM(follow_up_date), '') <> '' OR
           COALESCE(TRIM(call_status), '') <> '' OR
           COALESCE(TRIM(lead_status), '') NOT IN ('', 'UNASSIGNED')
         )`,
      [bdmName]
    );
    const contactChanges = await run(
      `UPDATE crm_contacts
       SET assigned_user = ?
       WHERE COALESCE(platform, 'whatsapp') = 'whatsapp'
         AND COALESCE(TRIM(assigned_user), '') = ''
         AND (
           manually_saved = 1 OR
           COALESCE(TRIM(notes), '') <> '' OR
           COALESCE(TRIM(follow_up_date), '') <> '' OR
           COALESCE(TRIM(call_status), '') <> '' OR
           COALESCE(TRIM(lead_status), '') NOT IN ('', 'UNASSIGNED')
         )`,
      [bdmName]
    );
    await run('COMMIT');
    console.log(JSON.stringify({
      success: true,
      bdmName,
      eligibleBefore: {
        crm_chats: beforeChats.count,
        crm_contacts: beforeContacts.count
      },
      updated: {
        crm_chats: chatChanges,
        crm_contacts: contactChanges
      }
    }, null, 2));
  } catch (error) {
    await run('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    db.close();
  }
}

main().catch((error) => {
  console.error(error);
  db.close();
  process.exit(1);
});
