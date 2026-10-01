const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const connectDB = require('../config/db');
const googleDriveBackupService = require('../services/googleDriveBackupService');

const jsonFilePath = process.argv[2];

if (!jsonFilePath) {
  console.log('\n❌ Usage: node server/scripts/restore-from-json.js <path-to-json-backup-file>');
  console.log('Example: node server/scripts/restore-from-json.js Kawudulla_LB_Monthly_Backup_2026_10.json\n');
  process.exit(1);
}

const resolvedPath = path.resolve(jsonFilePath);

if (!fs.existsSync(resolvedPath)) {
  console.error(`\n❌ Error: Backup file not found at "${resolvedPath}"\n`);
  process.exit(1);
}

async function run() {
  try {
    console.log(`\n📂 Reading backup file: ${resolvedPath}...`);
    const fileContent = fs.readFileSync(resolvedPath, 'utf-8');
    const backupPayload = JSON.parse(fileContent);

    console.log('🔌 Connecting to database...');
    await connectDB();

    console.log(`🚀 Restoring database records from: ${backupPayload.meta?.period || 'JSON Backup'}...`);
    const result = await googleDriveBackupService.restoreFromBackupPayload(backupPayload);

    console.log('\n======================================================');
    console.log('🎉 DISASTER RECOVERY RESTORE COMPLETED SUCCESSFULLY!');
    console.log('======================================================');
    console.log(`📚 Books Restored:         ${result.counts.books}`);
    console.log(`👥 Members/Users Restored: ${result.counts.users}`);
    console.log(`🔄 Transactions Restored:  ${result.counts.transactions}`);
    console.log(`💰 Fines Restored:         ${result.counts.fines}`);
    console.log(`📩 Requests Restored:      ${result.counts.bookRequests}`);
    console.log('======================================================\n');

    process.exit(0);
  } catch (err) {
    console.error('\n❌ Restore Error:', err.message, '\n');
    process.exit(1);
  }
}

run();
