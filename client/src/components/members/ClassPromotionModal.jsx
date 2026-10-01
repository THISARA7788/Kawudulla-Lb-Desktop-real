import React, { useState, useEffect } from 'react';
import api from '../../api/axios';

const GRADE_STEPS = [
  { from: 'Grade 1', to: 'Grade 2' },
  { from: 'Grade 2', to: 'Grade 3' },
  { from: 'Grade 3', to: 'Grade 4' },
  { from: 'Grade 4', to: 'Grade 5' },
  { from: 'Grade 5', to: 'Grade 6' },
  { from: 'Grade 6', to: 'Grade 7' },
  { from: 'Grade 7', to: 'Grade 8' },
  { from: 'Grade 8', to: 'Grade 9' },
  { from: 'Grade 9', to: 'Grade 10' },
  { from: 'Grade 10', to: 'Grade 11' },
  { from: 'Grade 11', to: 'Grade 12' },
  { from: 'Grade 12', to: 'Grade 13' },
  { from: 'Grade 13', to: 'Out of school' },
];

export default function ClassPromotionModal({
  isOpen,
  onClose,
  onPromotionComplete,
  showToast,
  GRADES,
  CLASS_SECTIONS,
}) {
  const [mode, setMode] = useState('annual-all'); // 'annual-all' | 'specific'
  const [sourceGrade, setSourceGrade] = useState('Grade 6');
  const [sourceClass, setSourceClass] = useState('all');
  const [targetGrade, setTargetGrade] = useState('Grade 7');
  const [targetClass, setTargetClass] = useState('');

  // Selected grades for Whole School promotion (all checked by default)
  const [selectedGrades, setSelectedGrades] = useState(GRADE_STEPS.map((s) => s.from));

  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [executing, setExecuting] = useState(false);
  const [confirmStep, setConfirmStep] = useState(false);

  // Auto-calculate default target grade when sourceGrade changes in single class mode
  useEffect(() => {
    if (mode === 'specific' && sourceGrade) {
      const match = sourceGrade.match(/\d+/);
      if (match) {
        const nextNum = parseInt(match[0], 10) + 1;
        if (nextNum <= 13) {
          setTargetGrade(`Grade ${nextNum}`);
        } else {
          setTargetGrade('Out of school');
        }
      }
    }
  }, [sourceGrade, mode]);

  // Load preview whenever criteria changes
  const fetchPreview = async () => {
    setPreviewLoading(true);
    setConfirmStep(false);
    try {
      const res = await api.post('/users/promote-preview', {
        mode,
        sourceGrade,
        sourceClass,
        targetGrade,
        targetClass: targetClass || (sourceClass !== 'all' ? sourceClass : ''),
        selectedGrades,
      });
      setPreviewData(res.data);
    } catch (err) {
      console.error('Preview error:', err);
      showToast(err.response?.data?.message || 'Failed to load preview', 'error');
    } finally {
      setPreviewLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchPreview();
    } else {
      setPreviewData(null);
      setConfirmStep(false);
    }
  }, [isOpen, mode, sourceGrade, sourceClass, targetGrade, targetClass, selectedGrades.length]);

  const toggleGrade = (gradeName) => {
    setSelectedGrades((prev) =>
      prev.includes(gradeName) ? prev.filter((g) => g !== gradeName) : [...prev, gradeName]
    );
  };

  const selectAllGrades = () => {
    setSelectedGrades(GRADE_STEPS.map((s) => s.from));
  };

  const deselectAllGrades = () => {
    setSelectedGrades([]);
  };

  const handleExecutePromotion = async () => {
    setExecuting(true);
    try {
      const res = await api.post('/users/promote', {
        mode,
        sourceGrade,
        sourceClass,
        targetGrade,
        targetClass: targetClass || (sourceClass !== 'all' ? sourceClass : ''),
        selectedGrades,
      });

      showToast(res.data.message || 'Promotion completed successfully!', 'success');
      if (onPromotionComplete) {
        onPromotionComplete();
      }
      onClose();
    } catch (err) {
      console.error('Promotion execute error:', err);
      showToast(err.response?.data?.message || 'Failed to execute promotion', 'error');
    } finally {
      setExecuting(false);
    }
  };

  if (!isOpen) return null;

  // Compute total selected students in Whole School mode
  let totalSelectedStudents = 0;
  if (mode === 'annual-all' && previewData?.breakdown) {
    selectedGrades.forEach((g) => {
      totalSelectedStudents += previewData.breakdown[g] || 0;
    });
  } else if (mode === 'specific') {
    totalSelectedStudents = previewData?.count || 0;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" onClick={onClose}></div>
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-lg w-full overflow-hidden relative z-10 p-6 max-h-[90vh] flex flex-col animate-[toast-enter_0.3s_cubic-bezier(0.16,1,0.3,1)_forwards]">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#9E0D0D]" style={{ fontSize: 24 }}>upgrade</span>
            <h2 className="text-lg font-bold" style={{ color: '#1a1245', fontFamily: "'Manrope', sans-serif" }}>
              Class Promotion
            </h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer">
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>close</span>
          </button>
        </div>

        {/* Mode Selector */}
        <div className="flex bg-slate-100 p-1 rounded-2xl mb-3 flex-shrink-0">
          <button
            type="button"
            onClick={() => setMode('annual-all')}
            className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              mode === 'annual-all' ? 'bg-white text-[#9E0D0D] shadow-xs' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Whole School (Checklist)
          </button>
          <button
            type="button"
            onClick={() => setMode('specific')}
            className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              mode === 'specific' ? 'bg-white text-[#9E0D0D] shadow-xs' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Single Class
          </button>
        </div>

        {/* Modal Body */}
        <div className="overflow-y-auto pr-1 flex-1 space-y-3 text-xs">
          {mode === 'annual-all' ? (
            <div className="space-y-2">
              {/* Quick Select Controls */}
              <div className="flex items-center justify-between px-1 text-xs">
                <span className="text-slate-500 font-semibold">Select grades to promote:</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={selectAllGrades}
                    className="text-[11px] font-bold text-[#9E0D0D] hover:underline cursor-pointer"
                  >
                    Select All
                  </button>
                  <span className="text-slate-300">|</span>
                  <button
                    type="button"
                    onClick={deselectAllGrades}
                    className="text-[11px] font-bold text-slate-500 hover:text-slate-800 hover:underline cursor-pointer"
                  >
                    Deselect All
                  </button>
                </div>
              </div>

              {/* Grade Steps Checklist */}
              <div className="border border-slate-200 rounded-2xl overflow-hidden divide-y divide-slate-100 bg-white">
                {GRADE_STEPS.map((step) => {
                  const count = previewData?.breakdown?.[step.from] || 0;
                  const isChecked = selectedGrades.includes(step.from);
                  const isZero = count === 0;

                  return (
                    <label
                      key={step.from}
                      className={`flex items-center justify-between px-3.5 py-2.5 transition-colors cursor-pointer select-none ${
                        isChecked ? 'bg-red-50/30' : 'bg-white hover:bg-slate-50'
                      } ${isZero ? 'opacity-60' : ''}`}
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleGrade(step.from)}
                          className="w-4 h-4 rounded text-[#9E0D0D] focus:ring-[#9E0D0D] cursor-pointer accent-[#9E0D0D]"
                        />
                        <div className="flex items-center gap-1.5 font-medium text-slate-800">
                          <span className="font-semibold">{step.from}</span>
                          <span className="text-slate-400">➔</span>
                          <span className={step.to === 'Out of school' ? 'font-bold text-rose-700' : 'font-semibold text-slate-800'}>
                            {step.to}
                          </span>
                        </div>
                      </div>

                      <span
                        className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                          count > 0 ? 'bg-slate-100 text-slate-700' : 'bg-slate-50 text-slate-400'
                        }`}
                      >
                        {count} {count === 1 ? 'Student' : 'Students'}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          ) : (
            /* Single Class Mode */
            <div className="space-y-3">
              <div className="space-y-3 bg-slate-50 p-3.5 rounded-2xl border border-slate-100">
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-slate-500 font-bold mb-1">From Grade</label>
                    <select
                      value={sourceGrade}
                      onChange={(e) => setSourceGrade(e.target.value)}
                      className="w-full px-3 py-2 text-xs font-semibold rounded-xl outline-none border border-slate-200 bg-white"
                    >
                      {GRADES.filter((g) => g.value !== 'Teacher' && g.value !== 'Other').map((g) => (
                        <option key={g.value} value={g.value}>{g.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-500 font-bold mb-1">Section</label>
                    <select
                      value={sourceClass}
                      onChange={(e) => setSourceClass(e.target.value)}
                      className="w-full px-3 py-2 text-xs font-semibold rounded-xl outline-none border border-slate-200 bg-white"
                    >
                      <option value="all">All Sections</option>
                      {CLASS_SECTIONS.map((c) => (
                        <option key={c} value={c}>Section {c}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-slate-500 font-bold mb-1">To Grade</label>
                    <select
                      value={targetGrade}
                      onChange={(e) => setTargetGrade(e.target.value)}
                      className="w-full px-3 py-2 text-xs font-semibold rounded-xl outline-none border border-slate-200 bg-white"
                    >
                      {GRADES.filter((g) => g.value !== 'Teacher' && g.value !== 'Other').map((g) => (
                        <option key={g.value} value={g.value}>{g.label}</option>
                      ))}
                      <option value="Out of school">Out of school</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-500 font-bold mb-1">New Section (Optional)</label>
                    <input
                      type="text"
                      value={targetClass}
                      onChange={(e) => setTargetClass(e.target.value)}
                      placeholder="Keep current section"
                      className="w-full px-3 py-2 text-xs rounded-xl outline-none border border-slate-200 bg-white"
                    />
                  </div>
                </div>
              </div>

              {/* Single Class Student List Preview */}
              <div className="bg-white rounded-2xl border border-slate-200 p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-slate-700 text-xs">
                    Students ({totalSelectedStudents})
                  </span>
                  {previewLoading && <span className="text-[11px] text-slate-400">Loading...</span>}
                </div>

                {previewData?.students && (
                  <div className="max-h-36 overflow-y-auto rounded-xl border border-slate-100 divide-y divide-slate-100 text-[11px]">
                    {previewData.students.length === 0 ? (
                      <div className="p-3 text-center text-slate-400">No active students found matching this class.</div>
                    ) : (
                      previewData.students.map((s) => (
                        <div key={s._id} className="p-2 px-3 flex justify-between items-center hover:bg-slate-50">
                          <span className="font-medium text-slate-800">{s.name}</span>
                          <span className="text-slate-500 font-mono text-[10px]">{s.memberId || '—'}</span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex gap-2.5 pt-3 mt-3 border-t border-slate-100 flex-shrink-0">
          {!confirmStep ? (
            <button
              type="button"
              onClick={() => setConfirmStep(true)}
              disabled={previewLoading || totalSelectedStudents === 0}
              className="flex-1 py-2.5 bg-[#9E0D0D] hover:bg-[#7F0A0A] text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all shadow-md active:scale-95 cursor-pointer disabled:opacity-40"
            >
              Promote ({totalSelectedStudents} {totalSelectedStudents === 1 ? 'Student' : 'Students'})
            </button>
          ) : (
            <button
              type="button"
              onClick={handleExecutePromotion}
              disabled={executing}
              className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all shadow-md active:scale-95 cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1"
            >
              {executing ? 'Promoting...' : `Confirm Promotion (${totalSelectedStudents})`}
            </button>
          )}

          <button
            type="button"
            onClick={confirmStep ? () => setConfirmStep(false) : onClose}
            className="px-5 py-2.5 border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer"
          >
            {confirmStep ? 'Back' : 'Cancel'}
          </button>
        </div>

      </div>
    </div>
  );
}
