const mongoose = require('mongoose');
const User = require('../models/User');

/**
 * =========================================================================
 * AUTOMATIC YEAR-END CLASS PROMOTION SERVICE
 * =========================================================================
 * Automatically transitions students to the next academic grade at the end of each year:
 * - Grade 13 -> Out of school
 * - Grade 12 -> Grade 13
 * - Grade 11 -> Grade 12 (class reset to '' for A/L stream selection)
 * - Grade 10 -> Grade 11
 * - Grade 9  -> Grade 10
 * - Grade 8  -> Grade 9
 * - Grade 7  -> Grade 8
 * - Grade 6  -> Grade 7
 * - Grade 5  -> Grade 6
 * - Grade 4  -> Grade 5
 * - Grade 3  -> Grade 4
 * - Grade 2  -> Grade 3
 * - Grade 1  -> Grade 2
 *
 * Runs descending updates in safe order so students are only promoted once.
 * Tracks the last executed promotion year in UserCounter with _id: 'lastPromotionYear'.
 */

const progressionMap = [
  { from: 'Grade 13', to: 'Out of school', keepClass: false }, // Clear class/stream when student leaves school
  { from: 'Grade 12', to: 'Grade 13', keepClass: true },
  { from: 'Grade 11', to: 'Grade 12', keepClass: false }, // Reset class/section for O/L to A/L transition
  { from: 'Grade 10', to: 'Grade 11', keepClass: true },
  { from: 'Grade 9', to: 'Grade 10', keepClass: true },
  { from: 'Grade 8', to: 'Grade 9', keepClass: true },
  { from: 'Grade 7', to: 'Grade 8', keepClass: true },
  { from: 'Grade 6', to: 'Grade 7', keepClass: true },
  { from: 'Grade 5', to: 'Grade 6', keepClass: true },
  { from: 'Grade 4', to: 'Grade 5', keepClass: true },
  { from: 'Grade 3', to: 'Grade 4', keepClass: true },
  { from: 'Grade 2', to: 'Grade 3', keepClass: true },
  { from: 'Grade 1', to: 'Grade 2', keepClass: true },
];

class AutoPromotionService {
  constructor() {
    this.interval = null;
  }

  getCounterModel() {
    return mongoose.models.UserCounter || mongoose.model('UserCounter');
  }

  async checkAndPromote() {
    try {
      const currentYear = new Date().getFullYear();
      const UserCounter = this.getCounterModel();

      let tracker = await UserCounter.findById('lastPromotionYear');

      if (!tracker) {
        // First run on existing system: initialize to current year to prevent accidental duplicate promotion
        await UserCounter.create({
          _id: 'lastPromotionYear',
          seq: currentYear,
        });
        console.log(`[AutoPromotion] Initialized lastPromotionYear tracker at year ${currentYear}.`);
        return;
      }

      if (currentYear > tracker.seq) {
        console.log(`[AutoPromotion] Academic year rollover detected (${tracker.seq} -> ${currentYear}). Starting automatic student promotion...`);

        let totalPromoted = 0;
        const details = [];

        for (const step of progressionMap) {
          const query = { role: 'student', status: 'active', grade: step.from };
          const count = await User.countDocuments(query);

          if (count > 0) {
            const updateObj = { grade: step.to };
            if (!step.keepClass) {
              updateObj.class = ''; // Reset section for O/L to A/L transition
            }
            await User.updateMany(query, { $set: updateObj });
            totalPromoted += count;
            details.push(`${step.from} ➔ ${step.to} (${count} students)`);
          }
        }

        tracker.seq = currentYear;
        await tracker.save();

        console.log(`[AutoPromotion] Year-end promotion completed successfully for academic year ${currentYear}! Total students promoted: ${totalPromoted}.`);
        if (details.length > 0) {
          console.log(`[AutoPromotion] Details: ${details.join(' | ')}`);
        }
      }
    } catch (error) {
      console.error('[AutoPromotion] Error checking or executing automatic promotion:', error.message);
    }
  }

  init() {
    // Run initial check on server startup
    this.checkAndPromote();

    // Periodically check every 12 hours
    if (this.interval) clearInterval(this.interval);
    this.interval = setInterval(() => {
      this.checkAndPromote();
    }, 12 * 60 * 60 * 1000);
  }
}

module.exports = new AutoPromotionService();
