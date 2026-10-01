const express = require('express');
const router = express.Router();
const syncService = require('../services/syncService');
const { protect, authorize } = require('../middleware/auth');

const googleDriveBackupService = require('../services/googleDriveBackupService');

// @route   GET /api/sync/status
// @desc    Get current cloud connection and backup status
// @access  Public / Protected
router.get('/status', (req, res) => {
  const atlasStatus = syncService.getStatus();
  res.json({
    ...atlasStatus,
    cloudAtlas: atlasStatus,
    googleDrive: googleDriveBackupService.getStatus(),
  });
});

// @route   GET /api/sync/gdrive/status
// @desc    Get Google Drive backup status
// @access  Public
router.get('/gdrive/status', (req, res) => {
  res.json(googleDriveBackupService.getStatus());
});

// @route   POST /api/sync/gdrive/backup
// @desc    Manually trigger Google Drive monthly backup
// @access  Private (Librarian)
router.post('/gdrive/backup', protect, authorize('librarian'), async (req, res) => {
  try {
    const force = req.body && req.body.force === true;
    const result = await googleDriveBackupService.runMonthlyBackup(force);
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message, status: 'error' });
  }
});

// @route   GET /api/sync/download-json
// @desc    Directly download single-file JSON backup
// @access  Private (Librarian)
router.get('/download-json', protect, authorize('librarian'), async (req, res) => {
  try {
    const { filename, payload } = await googleDriveBackupService.generateBackupPayload();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(JSON.stringify(payload, null, 2));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// @route   POST /api/sync/backup
// @desc    Manually push local database to MongoDB Cloud Atlas
// @access  Private (Librarian)
router.post('/backup', protect, authorize('librarian'), async (req, res) => {
  try {
    const result = await syncService.runBackup();
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message, status: 'error' });
  }
});

// @route   POST /api/sync/trigger
// @desc    Legacy alias for trigger backup
// @access  Private (Librarian)
router.post('/trigger', protect, authorize('librarian'), async (req, res) => {
  try {
    const result = await syncService.runBackup();
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message, status: 'error' });
  }
});

// @route   POST /api/sync/restore-json
// @desc    Disaster Recovery: Restore database directly from uploaded JSON backup payload
// @access  Private (Librarian)
router.post('/restore-json', protect, authorize('librarian'), async (req, res) => {
  try {
    const { backupPayload } = req.body;
    if (!backupPayload) {
      return res.status(400).json({ message: 'No backup payload provided in request body.' });
    }
    const result = await googleDriveBackupService.restoreFromBackupPayload(backupPayload);
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message, status: 'error' });
  }
});

module.exports = router;
