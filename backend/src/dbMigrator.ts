import fs from 'fs';
import path from 'path';
import { dbManager } from './db';
import { CRMContact, CRMChat, CRMMessage, ColdCallLead, ArchivedClearedLead } from './store';

export class DbMigrator {
  public static async runAutoMigration() {
    try {
      await dbManager.initTables();

      const dataDir = path.join(__dirname, '../data');
      const jsonFile = path.join(dataDir, 'db.json');
      const jsonBakFile = path.join(dataDir, 'db.json.bak');

      let sourcePath = '';
      if (fs.existsSync(jsonBakFile) && fs.statSync(jsonBakFile).size > 50000) {
        sourcePath = jsonBakFile;
      } else if (fs.existsSync(jsonFile)) {
        sourcePath = jsonFile;
      }

      if (!sourcePath) {
        console.log('[DbMigrator] No legacy JSON files found. Skipping JSON-to-SQL migration.');
        return;
      }

      console.log(`[DbMigrator] Found legacy database file for migration: ${sourcePath}`);
      const raw = fs.readFileSync(sourcePath, 'utf-8');
      const parsed = JSON.parse(raw);

      // 1. Migrate Contacts
      if (parsed.contacts) {
        const contactsList = Object.values(parsed.contacts) as CRMContact[];
        console.log(`[DbMigrator] Migrating ${contactsList.length} contacts to SQL...`);
        for (const c of contactsList) {
          if (!c.jid) continue;
          await dbManager.query(
            `INSERT INTO crm_contacts (
              jid, name, phone, avatar_url, lead_status, call_status, follow_up_date, previous_follow_up_date,
              notes, notes_list, tags, ai_disabled, is_auto_warm, manually_saved, updated_at, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(jid) DO UPDATE SET
              name = EXCLUDED.name,
              lead_status = EXCLUDED.lead_status,
              call_status = EXCLUDED.call_status,
              follow_up_date = EXCLUDED.follow_up_date,
              notes = EXCLUDED.notes,
              notes_list = EXCLUDED.notes_list,
              updated_at = EXCLUDED.updated_at`,
            [
              c.jid,
              c.name || '',
              c.phone || '',
              c.avatarUrl || '',
              c.leadStatus || 'UNASSIGNED',
              c.callStatus || null,
              c.followUpDate || '',
              c.previousFollowUpDate || '',
              c.notes || '',
              JSON.stringify(c.notesList || []),
              JSON.stringify(c.tags || []),
              c.aiDisabled ? 1 : 0,
              c.isAutoWarm ? 1 : 0,
              c.manuallySaved ? 1 : 0,
              c.updatedAt || Date.now(),
              Date.now(),
            ]
          );
        }
      }

      // 2. Migrate Chats
      if (parsed.chats) {
        const chatsList = Object.values(parsed.chats) as CRMChat[];
        console.log(`[DbMigrator] Migrating ${chatsList.length} chats to SQL...`);
        for (const c of chatsList) {
          if (!c.jid) continue;
          await dbManager.query(
            `INSERT INTO crm_chats (
              jid, name, phone, unread_count, last_message_preview, last_message_at, last_message_from_me,
              last_message_status, avatar_url, is_group, lead_status, call_status, follow_up_date, previous_follow_up_date,
              notes, notes_list, tags, ai_disabled, is_auto_warm, manually_saved, updated_at, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(jid) DO UPDATE SET
              name = EXCLUDED.name,
              lead_status = EXCLUDED.lead_status,
              call_status = EXCLUDED.call_status,
              follow_up_date = EXCLUDED.follow_up_date,
              notes = EXCLUDED.notes,
              notes_list = EXCLUDED.notes_list,
              updated_at = EXCLUDED.updated_at`,
            [
              c.jid,
              c.name || '',
              c.phone || '',
              c.unreadCount || 0,
              c.lastMessagePreview || '',
              c.lastMessageAt || 0,
              c.lastMessageFromMe ? 1 : 0,
              c.lastMessageStatus || 'SENT',
              c.avatarUrl || '',
              c.isGroup ? 1 : 0,
              c.leadStatus || 'UNASSIGNED',
              c.callStatus || null,
              c.followUpDate || '',
              c.previousFollowUpDate || '',
              c.notes || '',
              JSON.stringify(c.notesList || []),
              JSON.stringify(c.tags || []),
              c.aiDisabled ? 1 : 0,
              c.isAutoWarm ? 1 : 0,
              c.manuallySaved ? 1 : 0,
              c.updatedAt || Date.now(),
              Date.now(),
            ]
          );
        }
      }

      // 3. Migrate Messages
      if (parsed.messages) {
        let msgCount = 0;
        for (const [chatJid, msgList] of Object.entries(parsed.messages)) {
          const list = msgList as CRMMessage[];
          for (const m of list) {
            if (!m.id) continue;
            await dbManager.query(
              `INSERT INTO crm_messages (
                id, chat_jid, sender_jid, sender_name, from_me, text, media_url, media_type, file_name, timestamp, status
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(id) DO NOTHING`,
              [
                m.id,
                chatJid,
                m.senderJid || '',
                m.senderName || '',
                m.fromMe ? 1 : 0,
                m.text || '',
                m.mediaUrl || '',
                m.mediaType || '',
                m.fileName || '',
                m.timestamp || Date.now(),
                m.status || 'SENT',
              ]
            );
            msgCount++;
          }
        }
        console.log(`[DbMigrator] Migrating ${msgCount} historical messages to SQL...`);
      }

      // 4. Migrate Cold Calls
      if (parsed.coldCalls) {
        const coldCallsList = Object.values(parsed.coldCalls) as ColdCallLead[];
        console.log(`[DbMigrator] Migrating ${coldCallsList.length} cold call leads to SQL...`);
        for (const lead of coldCallsList) {
          if (!lead.id) continue;
          await dbManager.query(
            `INSERT INTO cold_calls (
              id, business_name, person_name, phone, business_website, role, email, linkedin_profile,
              facebook_profile, insta_profile, follow_ups, note, notes_list, call_choice, call_status,
              follow_up_date, called_by, client_language, campaign_name, call_timestamp, call_outcome,
              custom_fields, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              person_name = EXCLUDED.person_name,
              business_name = EXCLUDED.business_name,
              call_status = EXCLUDED.call_status,
              follow_up_date = EXCLUDED.follow_up_date,
              notes_list = EXCLUDED.notes_list,
              updated_at = EXCLUDED.updated_at`,
            [
              lead.id,
              lead.businessName || lead.company || '',
              lead.personName || lead.name || '',
              lead.phone || '',
              lead.businessWebsite || '',
              lead.role || '',
              lead.email || '',
              lead.linkedinProfile || '',
              lead.facebookProfile || '',
              lead.instaProfile || '',
              JSON.stringify(lead.followUps || []),
              lead.note || '',
              JSON.stringify(lead.notesList || []),
              lead.callChoice || null,
              lead.callStatus || null,
              lead.followUpDate || '',
              lead.calledBy || null,
              lead.clientLanguage || '',
              lead.campaignName || 'Campaign 1',
              lead.callTimestamp || 0,
              lead.callOutcome || null,
              JSON.stringify(lead.customFields || {}),
              lead.createdAt || Date.now(),
              lead.updatedAt || Date.now(),
            ]
          );
        }
      }

      // 5. Migrate Archived Cleared Leads
      if (parsed.archivedClearedLeads) {
        const archivedList = Object.values(parsed.archivedClearedLeads) as ArchivedClearedLead[];
        console.log(`[DbMigrator] Migrating ${archivedList.length} archived cleared leads to SQL...`);
        for (const arch of archivedList) {
          if (!arch.jid) continue;
          const archId = `arch_${arch.jid}_${arch.clearedAt || Date.now()}`;
          await dbManager.query(
            `INSERT INTO archived_cleared_leads (
              id, jid, name, phone, previous_lead_status, previous_call_status, previous_follow_up_date,
              previous_notes_list, cleared_at, cleared_date
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO NOTHING`,
            [
              archId,
              arch.jid,
              arch.name || '',
              arch.phone || '',
              arch.previousLeadStatus || 'UNASSIGNED',
              arch.previousCallStatus || null,
              arch.previousFollowUpDate || '',
              JSON.stringify(arch.previousNotesList || []),
              arch.clearedAt || Date.now(),
              arch.clearedDate || '',
            ]
          );
        }
      }

      console.log('[DbMigrator] JSON to SQL Migration completed successfully!');
    } catch (err: any) {
      console.error('[DbMigrator] Migration error:', err.message);
    }
  }
}
