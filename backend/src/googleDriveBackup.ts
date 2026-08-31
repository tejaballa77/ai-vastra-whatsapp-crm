import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { db } from './store';

// Helper to base64url encode
function base64url(data: string | Buffer): string {
  const buf = typeof data === 'string' ? Buffer.from(data) : data;
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

export class GoogleDriveBackupService {
  private backupIntervalMs = 3 * 60 * 60 * 1000; // 3 hours
  private timer: NodeJS.Timeout | null = null;

  constructor() {
    // Start automated 3-hour backup timer
    this.startSchedule();
  }

  public startSchedule() {
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => {
      console.log('[Google Drive Backup] Scheduled 3-hour backup triggering...');
      this.performBackup().catch((err) => console.error('[Google Drive Backup] Scheduled backup failed:', err.message));
    }, this.backupIntervalMs);
  }

  // Get Google Service Account Access Token via JWT
  private async getAccessToken(credentials: { client_email: string; private_key: string }): Promise<string> {
    const header = { alg: 'RS256', typ: 'JWT' };
    const now = Math.floor(Date.now() / 1000);
    const claim = {
      iss: credentials.client_email,
      scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive',
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now,
    };

    const encodedHeader = base64url(JSON.stringify(header));
    const encodedClaim = base64url(JSON.stringify(claim));
    const signatureInput = `${encodedHeader}.${encodedClaim}`;

    const signer = crypto.createSign('RSA-SHA256');
    signer.update(signatureInput);
    const signature = base64url(signer.sign(credentials.private_key));
    const jwt = `${signatureInput}.${signature}`;

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Failed to obtain Google access token: ${errText}`);
    }

    const data = (await res.json()) as { access_token: string };
    return data.access_token;
  }

  public async performBackup(): Promise<{ success: boolean; fileName: string; fileId?: string; message: string }> {
    const credsPath = path.join(__dirname, '../data/google-service-account.json');
    let credentials: { client_email: string; private_key: string } | null = null;

    if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
      try {
        credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
      } catch (e) {}
    }

    if (!credentials && fs.existsSync(credsPath)) {
      try {
        credentials = JSON.parse(fs.readFileSync(credsPath, 'utf-8'));
      } catch (e) {}
    }

    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID || '189FoGdo3GUHJ8FMvAkmyy6wD9iZIlQml';

    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}`;
    const fileName = `AI_Vastra_CRM_Backup_${dateStr}.json`;

    // Package database state
    const backupData = {
      timestamp: Date.now(),
      dateStr: now.toISOString(),
      contacts: Object.fromEntries(db.contacts),
      chats: Object.fromEntries(db.chats),
      messages: Object.fromEntries(db.messages),
      coldCalls: Object.fromEntries(db.coldCalls),
      archivedClearedLeads: Object.fromEntries(db.archivedClearedLeads),
      activeUsers: Array.from(db.activeUsers),
    };

    const fileContent = JSON.stringify(backupData, null, 2);

    if (!credentials || !credentials.client_email || !credentials.private_key) {
      // Save local backup file copy as fallback
      const localBackupDir = path.join(__dirname, '../data/backups');
      if (!fs.existsSync(localBackupDir)) fs.mkdirSync(localBackupDir, { recursive: true });
      fs.writeFileSync(path.join(localBackupDir, fileName), fileContent, 'utf-8');

      console.warn('[Google Drive Backup] Service Account credentials not provided yet. Backup saved locally:', fileName);
      return {
        success: false,
        fileName,
        message: 'Saved local backup copy. Add google-service-account.json to connect Google Drive.',
      };
    }

    const token = await this.getAccessToken(credentials);

    // Upload to Google Drive using multipart upload
    const boundary = '-------314159265358979323846';
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    const metadata = {
      name: fileName,
      mimeType: 'application/json',
      parents: folderId ? [folderId] : undefined,
    };

    let multipartRequestBody =
      delimiter +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(metadata) +
      delimiter +
      'Content-Type: application/json\r\n\r\n' +
      fileContent +
      closeDelimiter;

    const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: multipartRequestBody,
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Google Drive API upload failed: ${errText}`);
    }

    const driveFile = (await res.json()) as { id: string; name: string };
    console.log(`[Google Drive Backup] Successfully uploaded ${fileName} (File ID: ${driveFile.id})`);

    return {
      success: true,
      fileName,
      fileId: driveFile.id,
      message: `Backup successfully uploaded to Google Drive as ${fileName}`,
    };
  }
}

export const googleDriveBackupService = new GoogleDriveBackupService();
