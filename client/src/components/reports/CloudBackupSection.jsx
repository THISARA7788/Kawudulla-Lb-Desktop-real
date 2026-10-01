import React, { useState, useEffect, useRef } from 'react';
import api from '../../api/axios';
import { formatDateTime } from '../../utils/dateUtils';

const formatMonthYear = (monthStr, timeStr) => {
  if (monthStr && typeof monthStr === 'string') {
    const parts = monthStr.split('-');
    if (parts.length >= 2) {
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      const date = new Date(y, m - 1, 1);
      if (!isNaN(date.getTime())) {
        const monthName = date.toLocaleString('en-US', { month: 'long' });
        return `${monthName} ${y}`;
      }
    }
    return monthStr;
  }
  if (timeStr) {
    const d = new Date(timeStr);
    if (!isNaN(d.getTime())) {
      const monthName = d.toLocaleString('en-US', { month: 'long' });
      return `${monthName} ${d.getFullYear()}`;
    }
  }
  return 'None';
};

export default function CloudBackupSection({ showToast }) {
  const [atlasStatus, setAtlasStatus] = useState(null);
  const [gdriveStatus, setGDriveStatus] = useState(null);

  // Loading states for actions
  const [triggeringAtlasSync, setTriggeringAtlasSync] = useState(false);
  const [restoringFromAtlas, setRestoringFromAtlas] = useState(false);
  const [triggeringGDriveBackup, setTriggeringGDriveBackup] = useState(false);
  const [restoringFromFile, setRestoringFromFile] = useState(false);

  // Modals & File handling
  const [showAtlasRestoreModal, setShowAtlasRestoreModal] = useState(false);
  const [showFileRestoreModal, setShowFileRestoreModal] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [filePayload, setFilePayload] = useState(null);
  const fileInputRef = useRef(null);

  const fetchStatus = async () => {
    try {
      const res = await api.get('/sync/status');
      if (res.data) {
        setAtlasStatus(res.data.cloudAtlas || res.data);
        setGDriveStatus(res.data.googleDrive);
      }
    } catch (err) {
      console.error('Error fetching backup status:', err);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  // 1. Trigger MongoDB Atlas Cloud Backup
  const handleAtlasSync = async () => {
    try {
      setTriggeringAtlasSync(true);
      const res = await api.post('/sync/backup');
      if (res.data && res.data.success) {
        showToast(`MongoDB Atlas Cloud Synced! (${res.data.totalPushed || 0} records updated)`, 'success');
      } else {
        showToast('MongoDB Atlas Cloud is up to date!', 'success');
      }
      fetchStatus();
    } catch (err) {
      showToast('Atlas Sync Failed: ' + (err.response?.data?.message || err.message), 'error');
    } finally {
      setTriggeringAtlasSync(false);
    }
  };

  // 2. Restore all data from MongoDB Atlas Cloud
  const handleAtlasRestore = async () => {
    try {
      setRestoringFromAtlas(true);
      setShowAtlasRestoreModal(false);
      const res = await api.post('/sync/restore');
      if (res.data && res.data.success) {
        showToast(`Restored ${res.data.totalRestored || 0} records from Cloud Atlas!`, 'success');
        fetchStatus();
      } else {
        showToast(res.data.message || 'Cloud restore completed.', 'success');
      }
    } catch (err) {
      showToast('Atlas Restore Failed: ' + (err.response?.data?.message || err.message), 'error');
    } finally {
      setRestoringFromAtlas(false);
    }
  };

  // 3. Trigger Google Drive Backup
  const handleGDriveBackup = async () => {
    try {
      setTriggeringGDriveBackup(true);
      const res = await api.post('/sync/gdrive/backup', { force: true });
      if (res.data.status === 'success') {
        showToast('Google Drive Monthly Backup successfully uploaded!', 'success');
        fetchStatus();
      } else {
        showToast(res.data.message || 'Backup could not be completed.', 'error');
      }
    } catch (err) {
      showToast('Google Drive Upload Failed: ' + (err.response?.data?.message || err.message), 'error');
    } finally {
      setTriggeringGDriveBackup(false);
    }
  };

  // 4. Download JSON Backup
  const handleDownloadJson = async () => {
    try {
      const res = await api.get('/sync/download-json', { responseType: 'blob' });
      const blob = new Blob([res.data], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Kawudulla_Library_Backup_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      showToast('Backup JSON file downloaded successfully!', 'success');
    } catch (err) {
      showToast('Failed to download backup: ' + err.message, 'error');
    }
  };

  // 5. Select JSON file for restore
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.name.endsWith('.json')) {
      showToast('Please select a valid .json backup file.', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target.result);
        if (!parsed.data) {
          showToast('Invalid backup file structure.', 'error');
          return;
        }
        setSelectedFile(file);
        setFilePayload(parsed);
        setShowFileRestoreModal(true);
      } catch (err) {
        showToast('Error parsing JSON file: ' + err.message, 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = null; // reset input
  };

  // 6. Execute JSON restore
  const executeFileRestore = async () => {
    if (!filePayload) return;
    try {
      setRestoringFromFile(true);
      setShowFileRestoreModal(false);
      const res = await api.post('/sync/restore-json', { backupPayload: filePayload });
      if (res.data.status === 'success') {
        const counts = res.data.counts || {};
        showToast(
          `Restored from JSON! (${counts.books || 0} Books, ${counts.users || 0} Members, ${counts.transactions || 0} Records)`,
          'success'
        );
        setSelectedFile(null);
        setFilePayload(null);
      } else {
        showToast(res.data.message || 'Restore failed.', 'error');
      }
    } catch (err) {
      showToast('Error restoring database: ' + (err.response?.data?.message || err.message), 'error');
    } finally {
      setRestoringFromFile(false);
    }
  };

  const isAtlasOnline = atlasStatus?.isOnline;
  const isDriveLinked = gdriveStatus?.isConfigured;

  return (
    <div className="space-y-4">
      {/* Hidden file input for JSON restore */}
      <input
        type="file"
        ref={fileInputRef}
        accept=".json"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* 2-Column Clean Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Card 1: MongoDB Cloud Atlas */}
        <div className="rounded-2xl border border-slate-200/80 border-l-4 border-l-blue-600 bg-white p-5 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <span className="material-symbols-outlined text-[20px]">cloud_sync</span>
                </div>
                <div>
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-800">MongoDB Atlas Cloud</h3>
                  <p className="text-[11px] text-slate-400 font-medium">Continuous live cloud synchronization</p>
                </div>
              </div>
              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${
                isAtlasOnline
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-slate-100 text-slate-600 border-slate-200'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${isAtlasOnline ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`}></span>
                {isAtlasOnline ? 'Cloud Online' : 'Offline'}
              </span>
            </div>

            {/* Essential Status info */}
            <div className="mt-4 p-3 bg-slate-50/80 rounded-xl border border-slate-100 flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500">Last Cloud Sync:</span>
              <span className="text-[11px] font-black text-slate-700">
                {atlasStatus?.lastBackupTime ? formatDateTime(atlasStatus.lastBackupTime) : 'Not Synced Yet'}
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-2 mt-5">
            <button
              onClick={handleAtlasSync}
              disabled={triggeringAtlasSync || !isAtlasOnline}
              className="py-2.5 px-3 rounded-xl text-xs font-black uppercase tracking-wider text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-1.5 transition-all shadow-xs cursor-pointer active:scale-95"
            >
              <span className={`material-symbols-outlined text-[16px] ${triggeringAtlasSync ? 'animate-spin' : ''}`}>
                {triggeringAtlasSync ? 'sync' : 'cloud_sync'}
              </span>
              <span>{triggeringAtlasSync ? 'Syncing...' : 'Sync Now'}</span>
            </button>

            <button
              onClick={() => setShowAtlasRestoreModal(true)}
              disabled={restoringFromAtlas || !isAtlasOnline}
              className="py-2.5 px-3 rounded-xl text-xs font-black uppercase tracking-wider text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 disabled:opacity-50 flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-95"
            >
              <span className={`material-symbols-outlined text-[16px] ${restoringFromAtlas ? 'animate-spin' : ''}`}>
                cloud_download
              </span>
              <span>{restoringFromAtlas ? 'Restoring...' : 'Restore'}</span>
            </button>
          </div>
        </div>

        {/* Card 2: Google Drive Backup */}
        <div className="rounded-2xl border border-slate-200/80 border-l-4 border-l-emerald-600 bg-white p-5 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <span className="material-symbols-outlined text-[20px]">add_to_drive</span>
                </div>
                <div>
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-800">Google Drive Backup</h3>
                  <p className="text-[11px] text-slate-400 font-medium">Monthly automated cloud archive</p>
                </div>
              </div>
              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${
                isDriveLinked
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-amber-50 text-amber-700 border-amber-200'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${isDriveLinked ? 'bg-emerald-500 animate-pulse' : 'bg-amber-400'}`}></span>
                {isDriveLinked ? 'Drive Linked' : 'Not Linked'}
              </span>
            </div>

            {/* Essential Status info */}
            <div className="mt-4 p-3 bg-slate-50/80 rounded-xl border border-slate-100 flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500">Latest Drive Backup:</span>
              <span className="text-[11px] font-black text-emerald-700">
                {formatMonthYear(gdriveStatus?.lastBackupMonth, gdriveStatus?.lastBackupTime)}
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-3 gap-2 mt-5">
            <button
              onClick={handleGDriveBackup}
              disabled={triggeringGDriveBackup || !isDriveLinked}
              className="py-2.5 px-2 rounded-xl text-[11px] font-black uppercase tracking-wider text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-1 transition-all shadow-xs cursor-pointer active:scale-95"
            >
              <span className={`material-symbols-outlined text-[15px] ${triggeringGDriveBackup ? 'animate-spin' : ''}`}>
                {triggeringGDriveBackup ? 'progress_activity' : 'cloud_upload'}
              </span>
              <span>{triggeringGDriveBackup ? 'Uploading...' : 'Upload Drive'}</span>
            </button>

            <button
              onClick={handleDownloadJson}
              className="py-2.5 px-2 rounded-xl text-[11px] font-black uppercase tracking-wider text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 flex items-center justify-center gap-1 transition-all cursor-pointer active:scale-95"
            >
              <span className="material-symbols-outlined text-[15px]">download</span>
              <span>Get JSON</span>
            </button>

            <button
              onClick={() => fileInputRef.current && fileInputRef.current.click()}
              className="py-2.5 px-2 rounded-xl text-[11px] font-black uppercase tracking-wider text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 flex items-center justify-center gap-1 transition-all cursor-pointer active:scale-95"
            >
              <span className="material-symbols-outlined text-[15px]">restore</span>
              <span>Restore JSON</span>
            </button>
          </div>
        </div>
      </div>

      {/* Confirmation Modal for Atlas Restore */}
      {showAtlasRestoreModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-100 space-y-4">
            <div className="flex items-center gap-3 text-blue-600">
              <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                <span className="material-symbols-outlined text-2xl">cloud_download</span>
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900">Pull All Data from MongoDB Atlas</h4>
                <p className="text-xs text-slate-500">Cloud Disaster Recovery</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              This will pull all records from MongoDB Atlas Cloud and restore them into your local computer's database.
            </p>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowAtlasRestoreModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAtlasRestore}
                disabled={restoringFromAtlas}
                className="inline-flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shadow-sm transition-all cursor-pointer"
              >
                <span className="material-symbols-outlined text-sm">cloud_download</span>
                Confirm & Pull from Cloud
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal for JSON File Restore */}
      {showFileRestoreModal && selectedFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-100 space-y-4">
            <div className="flex items-center gap-3 text-amber-600">
              <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
                <span className="material-symbols-outlined text-2xl">settings_backup_restore</span>
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900">Confirm JSON Database Restore</h4>
                <p className="text-xs text-slate-500">File: {selectedFile.name}</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to restore all books, members, and transactions from this JSON backup file into your database?
            </p>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setShowFileRestoreModal(false);
                  setSelectedFile(null);
                  setFilePayload(null);
                }}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeFileRestore}
                disabled={restoringFromFile}
                className="inline-flex items-center gap-2 px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-xl shadow-sm transition-all cursor-pointer"
              >
                <span className="material-symbols-outlined text-sm">check_circle</span>
                Confirm & Restore
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
