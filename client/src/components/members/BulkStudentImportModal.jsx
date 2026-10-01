import React, { useState, useRef } from 'react';
import api from '../../api/axios';

export default function BulkStudentImportModal({
  isOpen,
  onClose,
  onImportComplete,
  showToast,
}) {
  const fileInputRef = useRef(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleDownloadTemplate = async () => {
    try {
      const response = await api.get('/users/template', {
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'Kawudulla_Student_Import_Template.xlsx');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Template download error:', err);
      showToast('Failed to download template. Please try again.', 'error');
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleStartImport = async () => {
    if (!selectedFile) {
      showToast('Please select an Excel or CSV file first.', 'error');
      return;
    }

    setImporting(true);
    setImportResult(null);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('defaultPassword', 'Kmv@1234');

      const res = await api.post('/users/import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setImportResult({
        success: true,
        importedCount: res.data.importedCount,
        skippedCount: res.data.skippedCount,
        errors: res.data.errors || [],
      });

      if (onImportComplete) {
        onImportComplete(res.data.importedUsers || []);
      }
      showToast(`Successfully registered ${res.data.importedCount} student(s)!`, 'success');
    } catch (err) {
      console.error('Bulk registration error:', err);
      showToast(err.response?.data?.message || 'Failed to import members. Check file format.', 'error');
    } finally {
      setImporting(false);
    }
  };

  const resetModal = () => {
    setSelectedFile(null);
    setImportResult(null);
    setImporting(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" onClick={resetModal}></div>
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-lg w-full overflow-hidden relative z-10 p-6 max-h-[90vh] flex flex-col animate-[toast-enter_0.3s_cubic-bezier(0.16,1,0.3,1)_forwards]">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <span className="material-symbols-outlined text-2xl">file_upload</span>
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800" style={{ fontFamily: "'Manrope', sans-serif" }}>
                Bulk Student Registration (Excel)
              </h2>
              <p className="text-[11px] text-slate-400">Import and register students quickly using spreadsheets</p>
            </div>
          </div>
          <button onClick={resetModal} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer">
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto pr-1 flex-1 space-y-4 text-xs">
          
          {/* Step 1: Download Template */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80">
            <div className="flex items-center justify-between gap-3">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#9E0D0D] block mb-0.5">Step 1</span>
                <h4 className="font-bold text-slate-800 text-xs">Download Official Excel Template</h4>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Download the formatted template, fill in student names & grades, and save.
                </p>
              </div>
              <button
                type="button"
                onClick={handleDownloadTemplate}
                className="px-3.5 py-2 bg-white border border-slate-300 hover:border-[#9E0D0D] hover:text-[#9E0D0D] rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-xs transition-all active:scale-95 cursor-pointer whitespace-nowrap"
              >
                <span className="material-symbols-outlined text-base text-[#9E0D0D]">download</span>
                Template (.xlsx)
              </button>
            </div>
          </div>

          {/* Step 2: Upload File Area */}
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#9E0D0D] block mb-1">Step 2</span>
            
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current && fileInputRef.current.click()}
              className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all ${
                isDragging
                  ? 'border-[#9E0D0D] bg-red-50/50'
                  : selectedFile
                    ? 'border-emerald-400 bg-emerald-50/30'
                    : 'border-slate-300 hover:border-slate-400 bg-slate-50/40 hover:bg-slate-50'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileChange}
                className="hidden"
              />

              {selectedFile ? (
                <div className="flex flex-col items-center">
                  <span className="material-symbols-outlined text-emerald-600 text-3xl mb-1">task</span>
                  <p className="font-bold text-slate-800 text-xs">{selectedFile.name}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">{(selectedFile.size / 1024).toFixed(1)} KB &middot; Click to change file</p>
                </div>
              ) : (
                <div className="flex flex-col items-center">
                  <span className="material-symbols-outlined text-slate-400 text-3xl mb-1">upload_file</span>
                  <p className="font-bold text-slate-700 text-xs">Click to browse or Drag & Drop Excel file</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">Supports .xlsx, .xls, and .csv files</p>
                </div>
              )}
            </div>
          </div>

          {/* Instructions Summary */}
          <div className="bg-slate-50/70 p-3 rounded-2xl border border-slate-200/60 text-[11px] text-slate-600 space-y-1">
            <div className="font-bold text-slate-700 flex items-center gap-1 mb-1">
              <span className="material-symbols-outlined text-amber-600 text-sm">tips_and_updates</span>
              Key Guidelines:
            </div>
            <p>✓ <strong>Email is Optional:</strong> If students do not have emails, leave it blank. The system automatically creates unique accounts.</p>
            <p>✓ <strong>Admission / Member ID:</strong> If provided, will be set as the student's library card ID.</p>
          </div>

          {/* Results Summary if completed */}
          {importResult && (
            <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 animate-fadeIn space-y-1.5">
              <div className="flex items-center gap-2 font-bold text-xs">
                <span className="material-symbols-outlined text-emerald-600 text-base">check_circle</span>
                Import Completed Successfully!
              </div>
              <p className="text-[11px] text-emerald-700">
                Total registered members: <strong>{importResult.importedCount}</strong>
              </p>
              {importResult.skippedCount > 0 && (
                <p className="text-[10px] text-amber-700 font-medium">
                  Skipped {importResult.skippedCount} duplicates/empty rows.
                </p>
              )}
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="flex gap-3 pt-3 mt-3 border-t border-slate-100 flex-shrink-0">
          <button
            type="button"
            onClick={handleStartImport}
            disabled={!selectedFile || importing}
            className="flex-1 py-2.5 bg-[#9E0D0D] hover:bg-[#7F0A0A] text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all shadow-md active:scale-95 cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            {importing ? (
              <>
                <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
                Importing...
              </>
            ) : (
              'Upload & Register Students'
            )}
          </button>
          <button
            type="button"
            onClick={resetModal}
            className="px-5 py-2.5 border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer"
          >
            {importResult ? 'Done' : 'Cancel'}
          </button>
        </div>

      </div>
    </div>
  );
}
