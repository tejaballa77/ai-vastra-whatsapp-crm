import fs from 'fs';
import path from 'path';

// Unified Database Adapter supporting PostgreSQL and SQLite
export class DatabaseManager {
  private isPg: boolean = false;
  private pgPool: any = null;
  private sqliteDb: any = null;
  private initialized: boolean = false;

  constructor() {
    this.initEngine();
  }

  private initEngine() {
    const dataDir = path.join(__dirname, '../data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    const hasPgEnv = Boolean(
      process.env.DATABASE_URL ||
      process.env.PGHOST ||
      process.env.POSTGRES_URL
    );

    if (hasPgEnv) {
      try {
        const { Pool } = require('pg');
        const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
        
        if (connectionString) {
          this.pgPool = new Pool({ connectionString, ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false });
        } else {
          this.pgPool = new Pool({
            host: process.env.PGHOST || 'localhost',
            user: process.env.PGUSER || 'postgres',
            password: process.env.PGPASSWORD || '',
            database: process.env.PGDATABASE || 'aivastra_crm',
            port: Number(process.env.PGPORT || 5432),
          });
        }
        this.isPg = true;
        console.log('[DatabaseManager] Connected to PostgreSQL Database Engine!');
      } catch (err: any) {
        console.warn('[DatabaseManager] PostgreSQL connection fallback to SQLite:', err.message);
        this.initSqlite(dataDir);
      }
    } else {
      this.initSqlite(dataDir);
    }
  }

  private initSqlite(dataDir: string) {
    try {
      const sqlite3 = require('sqlite3').verbose();
      const dbPath = path.join(dataDir, 'crm_database.sqlite3');
      this.sqliteDb = new sqlite3.Database(dbPath);
      this.sqliteDb.run('PRAGMA journal_mode = WAL;');
      this.sqliteDb.run('PRAGMA busy_timeout = 5000;');
      this.sqliteDb.run('PRAGMA synchronous = NORMAL;');
      this.isPg = false;
      console.log(`[DatabaseManager] Connected to Persistent SQLite Database Engine (WAL Mode Enabled): ${dbPath}`);
    } catch (err: any) {
      console.error('[DatabaseManager] SQLite initialization error:', err.message);
    }
  }

  public async query(sql: string, params: any[] = []): Promise<any[]> {
    if (this.isPg && this.pgPool) {
      // PostgreSQL query execution ($1, $2 syntax)
      let pgSql = sql;
      let paramIdx = 1;
      while (pgSql.includes('?')) {
        pgSql = pgSql.replace('?', `$${paramIdx++}`);
      }
      const res = await this.pgPool.query(pgSql, params);
      return res.rows || [];
    } else if (this.sqliteDb) {
      // SQLite query execution (? syntax)
      return new Promise((resolve, reject) => {
        const isSelect = sql.trim().toUpperCase().startsWith('SELECT') || sql.trim().toUpperCase().startsWith('PRAGMA');
        if (isSelect) {
          this.sqliteDb.all(sql, params, (err: any, rows: any[]) => {
            if (err) reject(err);
            else resolve(rows || []);
          });
        } else {
          this.sqliteDb.run(sql, params, function (err: any) {
            if (err) reject(err);
            else resolve([]);
          });
        }
      });
    }
    return [];
  }

  public async initTables() {
    if (this.initialized) return;

    console.log('[DatabaseManager] Initializing SQL Database Tables...');

    // 1. Contacts Table
    await this.query(`
      CREATE TABLE IF NOT EXISTS crm_contacts (
        jid TEXT PRIMARY KEY,
        name TEXT,
        phone TEXT,
        avatar_url TEXT,
        lead_status TEXT DEFAULT 'UNASSIGNED',
        call_status TEXT,
        follow_up_date TEXT,
        previous_follow_up_date TEXT,
        notes TEXT,
        notes_list TEXT,
        tags TEXT,
        ai_disabled INTEGER DEFAULT 0,
        is_auto_warm INTEGER DEFAULT 0,
        manually_saved INTEGER DEFAULT 0,
        updated_at BIGINT,
        created_at BIGINT
      );
    `);

    // 2. Chats Table
    await this.query(`
      CREATE TABLE IF NOT EXISTS crm_chats (
        jid TEXT PRIMARY KEY,
        name TEXT,
        phone TEXT,
        unread_count INTEGER DEFAULT 0,
        last_message_preview TEXT,
        last_message_at BIGINT DEFAULT 0,
        last_message_from_me INTEGER DEFAULT 0,
        last_message_status TEXT,
        avatar_url TEXT,
        is_group INTEGER DEFAULT 0,
        lead_status TEXT DEFAULT 'UNASSIGNED',
        call_status TEXT,
        follow_up_date TEXT,
        previous_follow_up_date TEXT,
        notes TEXT,
        notes_list TEXT,
        tags TEXT,
        ai_disabled INTEGER DEFAULT 0,
        is_auto_warm INTEGER DEFAULT 0,
        manually_saved INTEGER DEFAULT 0,
        updated_at BIGINT,
        created_at BIGINT
      );
    `);

    // 3. Messages Table
    await this.query(`
      CREATE TABLE IF NOT EXISTS crm_messages (
        id TEXT PRIMARY KEY,
        chat_jid TEXT,
        sender_jid TEXT,
        sender_name TEXT,
        from_me INTEGER DEFAULT 0,
        text TEXT,
        media_url TEXT,
        media_type TEXT,
        file_name TEXT,
        timestamp BIGINT,
        status TEXT
      );
    `);

    // 4. Cold Calls Table
    await this.query(`
      CREATE TABLE IF NOT EXISTS cold_calls (
        id TEXT PRIMARY KEY,
        business_name TEXT,
        person_name TEXT,
        phone TEXT,
        business_website TEXT,
        role TEXT,
        email TEXT,
        linkedin_profile TEXT,
        facebook_profile TEXT,
        insta_profile TEXT,
        follow_ups TEXT,
        note TEXT,
        notes_list TEXT,
        call_choice TEXT,
        call_status TEXT,
        follow_up_date TEXT,
        called_by TEXT,
        client_language TEXT,
        campaign_name TEXT,
        call_timestamp BIGINT,
        call_outcome TEXT,
        custom_fields TEXT,
        created_at BIGINT,
        updated_at BIGINT
      );
    `);

    // 5. Immutable Archived Cleared Leads Table (NEVER DELETED)
    await this.query(`
      CREATE TABLE IF NOT EXISTS archived_cleared_leads (
        id TEXT PRIMARY KEY,
        jid TEXT,
        name TEXT,
        phone TEXT,
        previous_lead_status TEXT,
        previous_call_status TEXT,
        previous_follow_up_date TEXT,
        previous_notes_list TEXT,
        cleared_at BIGINT,
        cleared_date TEXT
      );
    `);

    // 6. LID to Phone JID Mapping Table
    await this.query(`
      CREATE TABLE IF NOT EXISTS lid_to_jid_map (
        lid TEXT PRIMARY KEY,
        phone_jid TEXT
      );
    `);

    // 7. Active Users Table
    await this.query(`
      CREATE TABLE IF NOT EXISTS active_users (
        username TEXT PRIMARY KEY,
        created_at BIGINT
      );
    `);

    // 8. Cleared Leads Blacklist Table (Persistent across restarts)
    await this.query(`
      CREATE TABLE IF NOT EXISTS cleared_leads_blacklist (
        key TEXT PRIMARY KEY,
        cleared_at BIGINT
      );
    `);

    this.initialized = true;
    console.log('[DatabaseManager] SQL Database Tables initialized successfully!');
  }
}

export const dbManager = new DatabaseManager();
