import React, { useState, useEffect } from 'react';
import api from '../../api/axios';
import { formatDate } from '../../utils/dateUtils';

export default function CloudBackupSection({ showToast }) {
  const [status, setStatus] = useState(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [triggeringBackup, setTriggeringBackup] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [filePayload, setFilePayload] = useState(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  const fetchStatus = async () => {
    try {
      setLoadingStatus(true);
      const res = await api.get('/api/sync/gdrive/status');
      setStatus(res.data);
    } catch (err) {
      console.error('Error fetching Google Drive backup status:', err);
    } finally {
      setLoadingStatus(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const handleTriggerManualBackup = async () => {
    try {
      setTriggeringBackup(true);
      const res = await api.post('/api/sync/gdrive/backup', { force: true });
      if (res.data.status === 'success') {
        showToast('✅ Google Drive Backup successfully uploaded!', 'success');
        fetchStatus();
      } else {
        showToast(res.data.message || 'Backup could not be completed.', 'error');
      }
    } catch (err) {
      showToast('Error uploading to Google Drive: ' + (err.response?.data?.message || err.message), 'error');
    } finally {
      setTriggeringBackup(false);
    }
  };

  const handleDownloadJson = async () => {
    try {
      const res = await api.get('/api/sync/download-json', { responseType: 'blob' });
      const blob = new Blob([res.data], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Kawudulla_Library_Backup_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      showToast('📥 Backup JSON file downloaded successfully!', 'success');
    } catch (err) {
      showToast('Failed to download backup: ' + err.message, 'error');
    }
  };

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
          showToast('Invalid backup file. Missing data structure.', 'error');
          return;
        }
        setSelectedFile(file);
        setFilePayload(parsed);
      } catch (err) {
        showToast('Error parsing JSON file: ' + err.message, 'error');
      }
    };
    reader.readAsText(file);
  };

  const executeRestore = async () => {
    if (!filePayload) return;
    try {
      setRestoring(true);
      setShowConfirmModal(false);
      const res = await api.post('/api/sync/restore-json', { backupPayload: filePayload });
      if (res.data.status === 'success') {
        const counts = res.data.counts || {};
        showToast(
          `🎉 Database Restored Successfully! (${counts.books || 0} Books, ${counts.users || 0} Members, ${counts.transactions || 0} Records)`,
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
      setRestoring(false);
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* 1. Google Drive Cloud Status Card */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-slate-100">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-200/60 flex items-center justify-center text-emerald-600">
              <span className="material-symbols-outlined text-2xl">cloud_sync</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-800">Google Drive Automated Cloud Backup</h3>
                {status?.isConfigured ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    Connected & Active
                  </span>
                ) : (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
                    Not Configured
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Automatically uploads a single clean JSON backup to your Google Drive at the end of every month.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleTriggerManualBackup}
              disabled={triggeringBackup || !status?.isConfigured}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold rounded-xl shadow-sm transition-all"
            >
              <span className={`material-symbols-outlined text-sm ${triggeringBackup ? 'animate-spin' : ''}`}>
                {triggeringBackup ? 'progress_activity' : 'cloud_upload'}
              </span>
              {triggeringBackup ? 'Uploading to Drive...' : 'Upload to Drive Now'}
            </button>
            <button
              onClick={handleDownloadJson}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-all"
            >
              <span className="material-symbols-outlined text-sm">download</span>
              Download .JSON
            </button>
          </div>
        </div>

        {/* Info Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-5">
          <div className="bg-slate-50/80 rounded-xl p-4 border border-slate-200/60">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Target Folder</span>
            <p className="text-xs font-bold text-slate-700 mt-1 flex items-center gap-1.5">
              <span className="material-symbols-outlined text-emerald-600 text-base">folder_shared</span>
              Kawudulla Library Backups
            </p>
          </div>

          <div className="bg-slate-50/80 rounded-xl p-4 border border-slate-200/60">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Last Backup Month</span>
            <p className="text-xs font-bold text-slate-700 mt-1 flex items-center gap-1.5">
              <span className="material-symbols-outlined text-blue-600 text-base">calendar_month</span>
              {status?.lastBackupMonth ? status.lastBackupMonth : 'Never Backed Up'}
            </p>
          </div>

          <div className="bg-slate-50/80 rounded-xl p-4 border border-slate-200/60">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Last Upload Time</span>
            <p className="text-xs font-bold text-slate-700 mt-1 flex items-center gap-1.5">
              <span className="material-symbols-outlined text-purple-600 text-base">schedule</span>
              {status?.lastBackupTime ? new Date(status.lastBackupTime).toLocaleString() : '—'}
            </p>
          </div>
        </div>

        {status?.lastUploadedFile && (
          <div className="mt-4 p-3 bg-emerald-50/60 border border-emerald-200/60 rounded-xl flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 text-emerald-900 font-medium">
              <span className="material-symbols-outlined text-emerald-600 text-base">task_alt</span>
              Latest Drive Backup File: <span className="font-bold">{status.lastUploadedFile}</span>
            </div>
            <span className="text-[11px] text-emerald-700 font-semibold">100% Synced</span>
          </div>
        )}
      </div>

      {/* 2. Disaster Recovery / Restore Database from JSON Card */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm">
        <div className="flex items-center gap-3.5 pb-4 border-b border-slate-100">
          <div className="w-12 h-12 rounded-xl bg-amber-50 border border-amber-200/60 flex items-center justify-center text-amber-600">
            <span className="material-symbols-outlined text-2xl">settings_backup_restore</span>
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-800">Disaster Recovery (Restore from Backup File)</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              If the computer was replaced or formatted, select the downloaded Google Drive <span className="font-semibold text-slate-700">.json</span> file to restore all library records in seconds.
            </p>
          </div>
        </div>

        <div className="mt-5 space-y-4">
          <div className="border-2 border-dashed border-slate-200 hover:border-blue-400 rounded-2xl p-6 text-center transition-colors bg-slate-50/50">
            <span className="material-symbols-outlined text-3xl text-slate-400 mb-2">upload_file</span>
            <p className="text-xs font-medium text-slate-700">Select Google Drive Backup JSON File</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Accepts .json backup files generated by Kawudulla Library System</p>
            <input
              type="file"
              accept=".json"
              onChange={handleFileChange}
              className="mt-3 block mx-auto text-xs text-slate-500 file:mr-3 file:py-1.5 file:px-3.5 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
            />
          </div>

          {selectedFile && filePayload && (
            <div className="p-4 bg-blue-50/60 border border-blue-200/80 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-blue-600 text-base">description</span>
                  <span className="text-xs font-bold text-slate-800">{selectedFile.name}</span>
                </div>
                <span className="text-[11px] text-blue-700 font-semibold">
                  Period: {filePayload.meta?.period || 'N/A'}
                </span>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                <div className="bg-white/80 p-2 rounded-lg border border-blue-100">
                  <span className="text-[10px] text-slate-400">Books</span>
                  <p className="font-bold text-slate-800">{filePayload.meta?.counts?.books ?? filePayload.data?.books?.length ?? 0}</p>
                </div>
                <div className="bg-white/80 p-2 rounded-lg border border-blue-100">
                  <span className="text-[10px] text-slate-400">Members</span>
                  <p className="font-bold text-slate-800">{filePayload.meta?.counts?.users ?? filePayload.data?.users?.length ?? 0}</p>
                </div>
                <div className="bg-white/80 p-2 rounded-lg border border-blue-100">
                  <span className="text-[10px] text-slate-400">Circulation Records</span>
                  <p className="font-bold text-slate-800">{filePayload.meta?.counts?.transactions ?? filePayload.data?.transactions?.length ?? 0}</p>
                </div>
                <div className="bg-white/80 p-2 rounded-lg border border-blue-100">
                  <span className="text-[10px] text-slate-400">Fines</span>
                  <p className="font-bold text-slate-800">{filePayload.meta?.counts?.fines ?? filePayload.data?.fines?.length ?? 0}</p>
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedFile(null);
                    setFilePayload(null);
                  }}
                  className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-semibold rounded-lg transition-all"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => setShowConfirmModal(true)}
                  disabled={restoring}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-lg shadow-sm transition-all"
                >
                  <span className="material-symbols-outlined text-sm">settings_backup_restore</span>
                  Restore Database from File
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-100 space-y-4 animate-scaleUp">
            <div className="flex items-center gap-3 text-amber-600">
              <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
                <span className="material-symbols-outlined text-2xl">warning</span>
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900">Confirm Database Restore</h4>
                <p className="text-xs text-slate-500">Disaster Recovery Action</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              This will import all records from <span className="font-bold text-slate-800">{selectedFile?.name}</span> into the database. Existing records with matching IDs will be updated.
            </p>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeRestore}
                disabled={restoring}
                className="inline-flex items-center gap-2 px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-xl shadow-sm transition-all"
              >
                <span className="material-symbols-outlined text-sm">check_circle</span>
                Confirm & Start Restore
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
