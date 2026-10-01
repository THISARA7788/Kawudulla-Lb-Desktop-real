const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '..', '.env') });
const connectDB = require('../config/db');
const mongoose = require('mongoose');
const User = require('../models/User');
const autoPromotionService = require('../services/autoPromotionService');

async function testAutoPromotion() {
  await connectDB();
  console.log('\n======================================================');
  console.log('🧪 YEAR-END AUTO PROMOTION TEST & SIMULATION');
  console.log('======================================================\n');

  const UserCounter = mongoose.models.UserCounter || mongoose.model('UserCounter');

  // 1. Show current grade distribution
  console.log('📊 Current Active Student Distribution:');
  const grades = [
    'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5',
    'Grade 6', 'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10',
    'Grade 11', 'Grade 12', 'Grade 13', 'Out of school'
  ];

  for (const g of grades) {
    const count = await User.countDocuments({ role: 'student', status: 'active', grade: g });
    if (count > 0) {
      const sample = await User.find({ role: 'student', status: 'active', grade: g }).limit(2).select('memberId name grade class');
      const sampleNames = sample.map(s => `${s.name} (${s.memberId}${s.class && s.grade !== 'Out of school' ? '-' + s.class : ''})`).join(', ');
      console.log(`   • ${g.padEnd(14)}: ${count} student(s) -> e.g. ${sampleNames}`);
    }
  }

  // 2. Simulate previous year in database tracker
  const currentYear = new Date().getFullYear();
  const simulatedPastYear = currentYear - 1;
  console.log(`\n⏳ Simulating database state where last promotion occurred in: ${simulatedPastYear}`);
  
  await UserCounter.findOneAndUpdate(
    { _id: 'lastPromotionYear' },
    { $set: { seq: simulatedPastYear } },
    { upsert: true }
  );

  console.log(`🚀 Triggering autoPromotionService.checkAndPromote() for Year ${currentYear}...`);
  await autoPromotionService.checkAndPromote();

  // 3. Show updated grade distribution
  console.log('\n✅ Post-Promotion Active Student Distribution:');
  for (const g of grades) {
    const count = await User.countDocuments({ role: 'student', status: 'active', grade: g });
    if (count > 0) {
      const sample = await User.find({ role: 'student', status: 'active', grade: g }).limit(2).select('memberId name grade class');
      const sampleNames = sample.map(s => `${s.name} (${s.memberId}${s.class && s.grade !== 'Out of school' ? '-' + s.class : ''})`).join(', ');
      console.log(`   • ${g.padEnd(14)}: ${count} student(s) -> e.g. ${sampleNames}`);
    }
  }

  const tracker = await UserCounter.findById('lastPromotionYear');
  console.log(`\n🔒 Database tracker updated: lastPromotionYear is now set to ${tracker.seq} (Safe from duplicate runs).`);
  console.log('======================================================\n');

  process.exit(0);
}

testAutoPromotion().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
