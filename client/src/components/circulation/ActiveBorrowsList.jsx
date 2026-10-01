import React from 'react';
import { formatDate } from '../../utils/dateUtils';

/**
 * ActiveBorrowsList Component
 * Displays the current borrowings profile of a specific library user.
 * 
 * Runs in two modes:
 * 1. Interactive Selection: Displays active checkout cards as clickable buttons for checking books back in.
 * 2. Read-Only Summary: Renders a compact static list showing checkouts and overdue statuses.
 * 
 * @param {Array} borrows - List of active transaction checkouts
 * @param {Object} selectedMember - Currently selected user profile context
 * @param {Array} selectedBorrows - Currently selected borrow records to return
 * @param {Function} onSelect - Interactive click callback. If empty, the component defaults to read-only mode.
 * @param {string} maxHeight - Max vertical boundary scroll height
 */
export default function ActiveBorrowsList({
  borrows = [],
  selectedMember,
  selectedBorrows = [],
  onSelect,
  maxHeight = '340px',
  returnDate
}) {
  
  // 1. Initial State: No member chosen yet
  if (!selectedMember) {
    return (
      <div className="text-center py-8">
        <span className="material-symbols-outlined mx-auto block mb-2" style={{ color: '#D1D5DB', fontSize: 40 }}>person_outline</span>
        <p className="text-xs" style={{ color: '#9CA3AF' }}>Select a member to view borrowings</p>
      </div>
    );
  }

  // 2. Empty State: Selected member exists but has no active checked-out books
  if (borrows.length === 0) {
    return (
      <div className="text-center py-6">
        <span className="material-symbols-outlined mx-auto block mb-1" style={{ color: '#D1D5DB', fontSize: 36 }}>check_circle</span>
        <p className="text-xs font-medium" style={{ color: '#9CA3AF' }}>No active borrowings</p>
      </div>
    );
  }

  // Determine if the component should run in interactive clickable mode
  const isInteractive = typeof onSelect === 'function';

  return (
    <div className="space-y-1.5 overflow-y-auto pr-1" style={{ maxHeight }}>
      {borrows.map((b, i) => {
        // Calculate overdue dates and count days overdue using returnDate when available
        const evalDate = returnDate ? new Date(returnDate) : new Date();
        if (returnDate) {
          const now = new Date();
          evalDate.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
        }
        const isOverdue = new Date(b.dueDate) < evalDate;
        const diffTime = evalDate - new Date(b.dueDate);
        const daysOverdue = isOverdue ? Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24))) : 0;
        const book = b.book || {};
        const isSelected = selectedBorrows.some(sel => sel._id === b._id);

        // MODE 1: Interactive selector list (used on the Return Book page)
        if (isInteractive) {
          const cardClass = isOverdue
            ? isSelected 
              ? 'border-red-400 bg-red-100/40 shadow-sm' 
              : 'border-red-100 hover:border-red-300 bg-red-50/40'
            : isSelected 
              ? 'border-amber-400 bg-amber-50/45 shadow-sm' 
              : 'border-slate-100 hover:border-amber-200 bg-slate-50/20';

          return (
            <button
              key={b._id || i}
              type="button"
              onClick={() => onSelect(b)}
              className={`w-full flex items-center gap-3 p-2.5 rounded-xl text-left transition-all border ${cardClass}`}
            >
              {/* Book Cover Thumbnail (w-11 h-15 for clear visibility) */}
              <div className="w-11 h-15 rounded-lg bg-amber-50 border border-slate-200/80 flex items-center justify-center flex-shrink-0 overflow-hidden shadow-sm">
                {book.coverImageUrl ? (
                  <img src={book.coverImageUrl} alt="Cover" className="w-full h-full object-cover" />
                ) : (
                  <span className="material-symbols-outlined text-amber-500 text-lg" style={{ color: isOverdue ? '#DC2626' : '#F59E0B' }}>menu_book</span>
                )}
              </div>
              
              {/* Book Details */}
              <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
                <div className="flex justify-between items-start gap-2">
                  <div className="text-sm font-black text-slate-800 line-clamp-2 leading-snug mb-1 flex-grow">{book.title || 'Book'}</div>
                  <span className="text-[9px] font-bold text-slate-455 whitespace-nowrap bg-slate-50 border border-slate-150 px-1.5 py-0.5 rounded-md flex-shrink-0 mt-0.5">
                    {formatDate(b.dueDate)}
                  </span>
                </div>
                
                {/* Overdue/Active badge helper */}
                <div className="flex items-center select-none">
                  {isOverdue ? (
                    <div className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-red-50 border border-red-200 text-red-600 mt-1 shadow-sm">
                      <span className="material-symbols-outlined text-xs font-bold leading-none text-red-650" style={{ fontSize: 13 }}>warning</span>
                      <span>{daysOverdue}d Overdue (LKR {(daysOverdue * 10).toFixed(2)} fine)</span>
                    </div>
                  ) : (
                    <span className="text-[8px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-wider text-emerald-700 bg-emerald-100/60 mt-1">
                      Active
                    </span>
                  )}
                </div>
              </div>
              
              {/* Checkbox selector indicator */}
              <div className={`w-4.5 h-4.5 rounded-md border flex-shrink-0 flex-shrink-0 flex items-center justify-center transition-all ${
                isSelected 
                  ? isOverdue ? 'border-red-500 bg-red-500 shadow-sm' : 'border-amber-400 bg-amber-400 shadow-sm' 
                  : 'border-slate-350 bg-white'
              }`}>
                {isSelected && <span className="material-symbols-outlined text-white text-xs font-bold">check</span>}
              </div>
            </button>
          );
        }

        // MODE 2: Read-only compact summary list (used on the Issue Book page)
        return (
          <div key={b._id || i} className={`p-2.5 rounded-xl text-xs border transition-colors ${
            isOverdue ? 'bg-rose-50/60 border-rose-200/80 text-rose-900' : 'bg-slate-50/80 border-slate-200/70 text-slate-800'
          }`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <span className="font-bold text-xs text-slate-800 line-clamp-2 leading-snug block" title={book.title}>
                  {book.title || 'Untitled Book'}
                </span>
                {book.bookId && (
                  <span className="text-[10px] font-mono font-bold text-[#9E0D0D] block mt-0.5">
                    ID: {book.bookId}
                  </span>
                )}
              </div>
              <span className={`text-[8.5px] font-black px-1.5 py-0.5 rounded-md flex-shrink-0 uppercase tracking-wide border ${
                isOverdue ? 'text-rose-700 bg-rose-100/80 border-rose-200' : 'text-emerald-700 bg-emerald-100/80 border-emerald-200'
              }`}>
                {isOverdue ? 'Overdue' : 'Active'}
              </span>
            </div>
            
            <div className="mt-2 pt-1.5 border-t border-slate-200/60 flex items-center justify-between text-[10px]">
              <span className="text-slate-400 font-semibold">Due Date:</span>
              <span className={`font-bold ${isOverdue ? 'text-rose-600 font-black' : 'text-slate-650'}`}>
                {formatDate(b.dueDate)}
              </span>
            </div>

            {isOverdue && daysOverdue > 0 && (
              <div className="mt-1.5 flex items-center gap-1 text-[9.5px] font-black text-rose-700 bg-rose-100/80 px-2 py-0.5 rounded-md border border-rose-200">
                <span className="material-symbols-outlined" style={{ fontSize: 12 }}>warning</span>
                <span>{daysOverdue}d overdue (LKR {(daysOverdue * 10).toFixed(2)})</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
