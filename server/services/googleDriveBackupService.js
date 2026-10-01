const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
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
    try {
      // Reload env to pick up freshly added tokens dynamically
      const envPath = path.join(__dirname, '..', '.env');
      if (fs.existsSync(envPath)) {
        require('dotenv').config({ path: envPath, override: true });
      }

      if (this.driveClient) return this.driveClient;

      const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET;
      const refreshToken = process.env.GOOGLE_DRIVE_REFRESH_TOKEN;

      // 1. OAuth2 Client (Best for Personal @gmail.com accounts - uses full 15 GB quota)
      if (clientId && clientSecret && refreshToken) {
        const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, 'http://localhost:8085/oauth2callback');
        oauth2Client.setCredentials({ refresh_token: refreshToken });
        this.driveClient = google.drive({ version: 'v3', auth: oauth2Client });
        return this.driveClient;
      }

      // 2. Service Account Key JSON
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
      User.find({}).lean(),
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
          supportsAllDrives: true,
          includeItemsFromAllDrives: true,
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
          supportsAllDrives: true,
        });
        console.log(`✅ Updated existing Google Drive backup: ${filename} (ID: ${uploadResult.data.id})`);
      } else {
        uploadResult = await drive.files.create({
          resource: fileMetadata,
          media: media,
          fields: 'id, name, webViewLink',
          supportsAllDrives: true,
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

  /**
   * Disaster Recovery: Restores all collections from a single-file JSON backup payload
   */
  async restoreFromBackupPayload(backupPayload) {
    if (!backupPayload || !backupPayload.data) {
      throw new Error('Invalid backup file format. Missing "data" section.');
    }

    const {
      books = [],
      users = [],
      transactions = [],
      fines = [],
      fineConfigs = [],
      bookRequests = [],
      notifications = [],
    } = backupPayload.data;

    const collectionsToRestore = [
      { name: 'users', docs: users },
      { name: 'books', docs: books },
      { name: 'transactions', docs: transactions },
      { name: 'fines', docs: fines },
      { name: 'fineconfigs', docs: fineConfigs },
      { name: 'bookrequests', docs: bookRequests },
      { name: 'notifications', docs: notifications },
    ];

    const counts = {};

    for (const item of collectionsToRestore) {
      if (item.docs && item.docs.length > 0) {
        try {
          const coll = mongoose.connection.collection(item.name);
          const ops = item.docs.map((doc) => {
            const cleanDoc = { ...doc };
            let docId = cleanDoc._id;
            if (typeof docId === 'string' && mongoose.Types.ObjectId.isValid(docId) && docId.length === 24) {
              docId = new mongoose.Types.ObjectId(docId);
            }
            cleanDoc._id = docId;
            return {
              replaceOne: {
                filter: { _id: docId },
                replacement: cleanDoc,
                upsert: true,
              },
            };
          });

          await coll.bulkWrite(ops, { ordered: false });
          counts[item.name] = item.docs.length;
        } catch (err) {
          console.warn(`[JSON Restore Warning] on ${item.name}:`, err.message);
          counts[item.name] = 0;
        }
      } else {
        counts[item.name] = 0;
      }
    }

    // Reconcile book availability after restore
    try {
      const syncService = require('./syncService');
      if (typeof syncService.reconcileBookAvailability === 'function') {
        await syncService.reconcileBookAvailability();
      }
    } catch (rErr) {
      console.warn('Reconcile error after JSON restore:', rErr.message);
    }

    console.log(`🎉 Disaster Recovery Complete: Restored ${counts.books || 0} books, ${counts.users || 0} users, ${counts.transactions || 0} transactions.`);

    return {
      status: 'success',
      message: 'Database successfully restored from JSON backup.',
      counts: {
        books: counts.books || 0,
        users: counts.users || 0,
        transactions: counts.transactions || 0,
        fines: counts.fines || 0,
        fineConfigs: counts.fineconfigs || 0,
        bookRequests: counts.bookrequests || 0,
      },
      restoredAt: new Date().toISOString(),
    };
  }

  getStatus() {
    this.meta = getGDriveMeta();
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
