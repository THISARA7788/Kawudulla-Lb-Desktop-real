const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const stream = require('stream');

// Models
const Book = require('../models/Book');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Fine = require('../models/Fine');
const FineConfig = require('../models/FineConfig');
const BookRequest = require('../models/BookRequest');
const Notification = require('../models/Notification');

const getMetaPath = () => {
  let baseDir;
  if (process.env.APPDATA) {
    baseDir = path.join(process.env.APPDATA, 'KawudullaLibrary', 'data');
  } else {
    baseDir = path.join(__dirname, '..', 'data');
  }
  if (!fs.existsSync(baseDir)) {
    fs.mkdirSync(baseDir, { recursive: true });
  }
  return path.join(baseDir, 'gdrive_backup_metadata.json');
};

const getGDriveMeta = () => {
  try {
    const metaPath = getMetaPath();
    if (fs.existsSync(metaPath)) {
      return JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
    }
  } catch (e) {}
  return { lastBackupMonth: null, lastBackupTime: null, lastUploadedFile: null, status: 'idle', lastError: null };
};

const saveGDriveMeta = (meta) => {
  try {
    const metaPath = getMetaPath();
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
  } catch (e) {
    console.error('Failed to save GDrive backup metadata:', e.message);
  }
};

class GoogleDriveBackupService {
  constructor() {
    this.meta = getGDriveMeta();
    this.status = this.meta.status || 'idle';
    this.timer = null;
    this.driveClient = null;
  }

  init() {
    console.log('☁️ Google Drive Monthly Automated Backup Service initialized.');
    
    // Check shortly after startup (after 10s)
    setTimeout(() => {
      this.checkAndRunMonthlyBackup();
    }, 10000);

    // Schedule periodic check every 6 hours
    this.timer = setInterval(() => {
      this.checkAndRunMonthlyBackup();
    }, 6 * 60 * 60 * 1000);
  }

  /**
   * Initializes Google Drive API client using either:
   * 1. Service Account JSON file path (GOOGLE_SERVICE_ACCOUNT_KEY_PATH)
   * 2. Direct JSON string in .env (GOOGLE_SERVICE_ACCOUNT_JSON)
   * 3. Default credentials / OAuth2
   */
  getDriveClient() {
    if (this.driveClient) return this.driveClient;

    try {
      const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH 
        ? path.resolve(process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH)
        : path.join(__dirname, '..', 'google-service-account.json');

      const jsonKey = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

      let auth;
      if (jsonKey) {
        const credentials = JSON.parse(jsonKey);
        auth = new google.auth.GoogleAuth({
          credentials,
          scopes: ['https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/drive'],
        });
      } else if (fs.existsSync(keyPath)) {
        auth = new google.auth.GoogleAuth({
          keyFile: keyPath,
          scopes: ['https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/drive'],
        });
      } else {
        return null;
      }

      this.driveClient = google.drive({ version: 'v3', auth });
      return this.driveClient;
    } catch (err) {
      console.warn('Google Drive Auth initialization warning:', err.message);
      return null;
    }
  }

  /**
   * Finds or creates the designated backup folder on Google Drive
   */
  async getOrCreateBackupFolder(drive) {
    const customFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
    if (customFolderId && customFolderId.trim() !== '') {
      return customFolderId.trim();
    }

    const folderName = 'Kawudulla Library Monthly Backups';
    try {
      const res = await drive.files.list({
        q: `name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
        fields: 'files(id, name)',
        spaces: 'drive',
      });

      if (res.data.files && res.data.files.length > 0) {
        return res.data.files[0].id;
      }

      // Create new folder
      const folderMetadata = {
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
      };
      const folder = await drive.files.create({
        resource: folderMetadata,
        fields: 'id',
      });
      console.log(`📁 Created Google Drive Folder: "${folderName}" (ID: ${folder.data.id})`);
      return folder.data.id;
    } catch (err) {
      console.error('Error fetching/creating Google Drive folder:', err.message);
      return null;
    }
  }

  /**
   * Generates a single, comprehensive, clean JSON backup object of all collections
   */
  async generateBackupPayload() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const period = `${year}-${month}`;

    const [books, users, transactions, fines, fineConfigs, bookRequests, notifications] = await Promise.all([
      Book.find({}).lean(),
      User.find({}).select('-password').lean(),
      Transaction.find({}).lean(),
      Fine.find({}).lean(),
      FineConfig.find({}).lean(),
      BookRequest.find({}).lean(),
      Notification.find({}).lean(),
    ]);

    const backupPayload = {
      meta: {
        system: 'Kawudulla Central College Library Management System',
        version: '1.0.0',
        backupType: 'Monthly Automated Single-File JSON Cloud Backup',
        createdAt: now.toISOString(),
        period: period,
        counts: {
          books: books.length,
          users: users.length,
          transactions: transactions.length,
          fines: fines.length,
          fineConfigs: fineConfigs.length,
          bookRequests: bookRequests.length,
          notifications: notifications.length,
        },
      },
      data: {
        books,
        users,
        transactions,
        fines,
        fineConfigs,
        bookRequests,
        notifications,
      },
    };

    return {
      period,
      filename: `Kawudulla_LB_Monthly_Backup_${year}_${month}.json`,
      payload: backupPayload,
    };
  }

  /**
   * Runs the automated backup and uploads the single .json file to Google Drive
   */
  async runMonthlyBackup(force = false) {
    const now = new Date();
    const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    if (!force && this.meta.lastBackupMonth === currentMonthKey) {
      console.log(`ℹ️ Google Drive Backup for month ${currentMonthKey} already uploaded. Skipping.`);
      return { status: 'skipped', message: `Backup for ${currentMonthKey} already uploaded.` };
    }

    const drive = this.getDriveClient();
    if (!drive) {
      const msg = 'Google Drive credentials not configured in server/.env (GOOGLE_SERVICE_ACCOUNT_JSON or google-service-account.json)';
      console.log(`ℹ️ ${msg}`);
      return { status: 'unconfigured', message: msg };
    }

    try {
      this.status = 'uploading';
      console.log(`🚀 Generating and uploading monthly backup for period: ${currentMonthKey}...`);

      const { period, filename, payload } = await this.generateBackupPayload();
      const folderId = await this.getOrCreateBackupFolder(drive);

      const jsonString = JSON.stringify(payload, null, 2);
      const bufferStream = new stream.PassThrough();
      bufferStream.end(Buffer.from(jsonString, 'utf-8'));

      const fileMetadata = {
        name: filename,
        parents: folderId ? [folderId] : [],
      };
      const media = {
        mimeType: 'application/json',
        body: bufferStream,
      };

      // Check if file with same name already exists in target folder to update or create
      let existingFileId = null;
      if (folderId) {
        const checkRes = await drive.files.list({
          q: `name = '${filename}' and '${folderId}' in parents and trashed = false`,
          fields: 'files(id, name)',
        });
        if (checkRes.data.files && checkRes.data.files.length > 0) {
          existingFileId = checkRes.data.files[0].id;
        }
      }

      let uploadResult;
      if (existingFileId) {
        uploadResult = await drive.files.update({
          fileId: existingFileId,
          media: media,
          fields: 'id, name, webViewLink',
        });
        console.log(`✅ Updated existing Google Drive backup: ${filename} (ID: ${uploadResult.data.id})`);
      } else {
        uploadResult = await drive.files.create({
          resource: fileMetadata,
          media: media,
          fields: 'id, name, webViewLink',
        });
        console.log(`✅ Uploaded new Google Drive monthly backup: ${filename} (ID: ${uploadResult.data.id})`);
      }

      this.meta = {
        lastBackupMonth: period,
        lastBackupTime: new Date().toISOString(),
        lastUploadedFile: filename,
        fileId: uploadResult.data.id,
        status: 'synced',
        lastError: null,
      };
      this.status = 'synced';
      saveGDriveMeta(this.meta);

      return {
        status: 'success',
        filename,
        fileId: uploadResult.data.id,
        timestamp: this.meta.lastBackupTime,
      };
    } catch (err) {
      console.error('❌ Google Drive Monthly Backup Error:', err.message);
      this.status = 'error';
      this.meta.lastError = err.message;
      this.meta.status = 'error';
      saveGDriveMeta(this.meta);
      return { status: 'error', message: err.message };
    }
  }

  /**
   * Checks if today is the end of the month (e.g. Day >= 27) or if previous month wasn't backed up
   */
  async checkAndRunMonthlyBackup() {
    const now = new Date();
    const day = now.getDate();
    const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // Run automatically if it's the 27th or later of the month, or if never backed up for current month
    if (day >= 27 && this.meta.lastBackupMonth !== currentMonthKey) {
      await this.runMonthlyBackup();
    }
  }

  getStatus() {
    return {
      isConfigured: !!this.getDriveClient(),
      status: this.status,
      lastBackupMonth: this.meta.lastBackupMonth,
      lastBackupTime: this.meta.lastBackupTime,
      lastUploadedFile: this.meta.lastUploadedFile,
      lastError: this.meta.lastError,
    };
  }
}

const googleDriveBackupService = new GoogleDriveBackupService();
module.exports = googleDriveBackupService;
