const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const connectDB = require('../config/db');
const syncService = require('../services/syncService');

async function pullData() {
  console.log('Connecting to Local database...');
  await connectDB();

  console.log('Restoring records from Cloud Atlas to Local database...');
  const result = await syncService.restoreFromCloud();
  console.log('Restore result:', result);

  const mongoose = require('mongoose');
  const userCount = await mongoose.connection.collection('users').countDocuments({});
  const bookCount = await mongoose.connection.collection('books').countDocuments({});
  const txCount = await mongoose.connection.collection('transactions').countDocuments({});

  console.log(`Current Local Database Status:
  - Total Users/Members: ${userCount}
  - Total Books: ${bookCount}
  - Total Transactions: ${txCount}
  `);

  process.exit(0);
}

pullData().catch((err) => {
  console.error('Pull data error:', err);
  process.exit(1);
});
