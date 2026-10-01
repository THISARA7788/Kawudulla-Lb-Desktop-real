// ==================================================================================
// 👤 MEMBER 4: ISSUE BOOK
// WHAT DOES THIS FILE DO?
// This page handles checkout transactions for borrowing books.
// - Step 1: Find a student or teacher (Member).
// - Step 2: Search or scan a barcode/QR code to find the book.
// - Step 3: Set due date and confirm the checkout to issue the book.
// ==================================================================================
import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import api from '../../api/axios';
import DashboardLayout from '../../components/layout/DashboardLayout';
import ActiveBorrowsList from '../../components/circulation/ActiveBorrowsList';
import RecentTransactionsList from '../../components/circulation/RecentTransactionsList';

const GRADES = [
  'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6', 'Grade 7', 'Grade 8',
  'Grade 9', 'Grade 10', 'Grade 11', 'Grade 12', 'Grade 13', 'Out of school',
];
const CLASS_SECTIONS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

export default function IssueBook() {
  const { token } = useAuth();

  // Wizard Steps
  const [step, setStep] = useState(1);
  const [policyVerified, setPolicyVerified] = useState(false);
  const [searchFilter, setSearchFilter] = useState('All');

  // Member state
  const [memberSearch, setMemberSearch] = useState('');
  const [memberResults, setMemberResults] = useState([]);
  const [showMemberSuggestions, setShowMemberSuggestions] = useState(true);
  const [selectedMember, setSelectedMember] = useState(null);
  const memberInputRef = useRef(null);
  const [memberInputFocused, setMemberInputFocused] = useState(false);
  
  // Unified Error Toast State
  const [toastError, setToastError] = useState('');
  const toastTimeoutRef = useRef(null);

  const showErrorToast = (msg) => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    setToastError(msg);
    toastTimeoutRef.current = setTimeout(() => {
      setToastError('');
    }, 4000);
  };

  const setError = (msg) => {
    if (msg) showErrorToast(msg);
    else setToastError('');
  };
  const setMemberError = (msg) => {
    if (msg) showErrorToast(msg);
    else setToastError('');
  };
  const setBookError = (msg) => {
    if (msg) showErrorToast(msg);
    else setToastError('');
  };

  // Cart state for multi-book checkout
  const [cart, setCart] = useState([]);
  const [outstandingFines, setOutstandingFines] = useState(0);
  const [overdueCount, setOverdueCount] = useState(0);

  // Book search state
  const [bookSearch, setBookSearch] = useState('');
  const [bookResults, setBookResults] = useState([]);
  const [showBookSuggestions, setShowBookSuggestions] = useState(true);

  // Issue details
  const [issueDate, setIssueDate] = useState(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 14);
    return d.toISOString().split('T')[0];
  });
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [issuedDetails, setIssuedDetails] = useState(null);

  // Right panel
  const [activeBorrows, setActiveBorrows] = useState([]);
  const [borrowLimit, setBorrowLimit] = useState(5);
  const [recentIssues, setRecentIssues] = useState([]);

  // Unified scanner / manual book search state
  const [bookInputFocused, setBookInputFocused] = useState(false);
  const bookInputRef = useRef(null);


  // Data
  const [allUsers, setAllUsers] = useState([]);
  const [allBooks, setAllBooks] = useState([]);

  // Load data on mount
  useEffect(() => {
    const init = async () => {
      try {
        const [usersRes, booksRes, txRes] = await Promise.all([
          api.get('/users', { headers: { Authorization: `Bearer ${token}` } }),
          api.get('/library/books'),
          api.get('/library/transactions?status=active&limit=30'),
        ]);
        setAllUsers(usersRes.data.users || []);
        setAllBooks(booksRes.data.books || []);
        setRecentIssues(txRes.data.transactions || []);
        
        console.log('Loaded users:', usersRes.data.users?.length || 0);
        console.log('Loaded books:', booksRes.data.books?.length || 0);
        console.log('Loaded recent issues:', txRes.data.transactions?.length || 0);
      } catch (err) {
        console.error('Init error:', err);
        setError('Failed to load initial data');
      }
    };
    init();
  }, [token]);

  // Suggestion data: unique recent books from recentIssues
  const recentBooks = (() => {
    const seen = new Set();
    const result = [];
    for (const tx of recentIssues) {
      if (tx.book && !seen.has(tx.book._id)) {
        seen.add(tx.book._id);
        result.push(tx.book);
      }
      if (result.length >= 6) break;
    }
    return result;
  })();

  // Suggestion data: unique recent members from recentIssues
  const recentMembers = (() => {
    const seen = new Set();
    const result = [];
    for (const tx of recentIssues) {
      if (tx.user && !seen.has(tx.user._id)) {
        seen.add(tx.user._id);
        result.push(tx.user);
      }
      if (result.length >= 8) break;
    }
    return result;
  })();

  // Filter members (only when searching)
  useEffect(() => {
    if (memberSearch.trim().length >= 1) {
      let list = allUsers.filter(u => u.status === 'active' && u.role !== 'librarian');
      const q = memberSearch.toLowerCase();
      list = list.filter(u =>
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.memberId && u.memberId.toLowerCase().includes(q))
      );
      setMemberResults(list);
    } else {
      setMemberResults([]);
    }
  }, [memberSearch, allUsers]);

  // Filter books based on search query and search filter tabs
  useEffect(() => {
    if (bookSearch.length >= 1) {
      const q = bookSearch.toLowerCase();
      const results = allBooks.filter(b => {
        if (searchFilter === 'Title') {
          return b.title.toLowerCase().includes(q);
        } else if (searchFilter === 'Author') {
          return b.author.toLowerCase().includes(q);
        } else if (searchFilter === 'Barcode') {
          return (b.bookId && b.bookId.toLowerCase().includes(q)) || 
                 (b.isbn && b.isbn.toLowerCase().includes(q));
        } else {
          // 'All'
          return b.title.toLowerCase().includes(q) ||
                 b.author.toLowerCase().includes(q) ||
                 (b.bookId && b.bookId.toLowerCase().includes(q)) ||
                 (b.isbn && b.isbn.toLowerCase().includes(q)) ||
                 b.category.toLowerCase().includes(q);
        }
      });
      setBookResults(results);
    } else {
      setBookResults([]);
    }
  }, [bookSearch, allBooks, searchFilter]);

  // Fetch borrowing info
  const fetchBorrowingInfo = async (userId) => {
    try {
      const res = await api.get(`/library/users/${userId}/borrowing-info`);
      setActiveBorrows(res.data.borrowedBooks || []);
      setBorrowLimit(res.data.limit || 5);
      setOutstandingFines(res.data.outstandingFinesTotal || 0);
      setOverdueCount(res.data.overdueCount || 0);
      console.log(`Loaded active borrows: ${res.data.borrowedBooks?.length || 0}, fines: ${res.data.outstandingFinesTotal || 0} for user ${userId}`);
    } catch (err) {
      console.error('Borrowing info error:', err);
      setError('Failed to load borrowing information');
    }
  };

  const handleSelectMember = (m) => {
    setSelectedMember(m);
    setMemberSearch(m.name);
    setShowMemberSuggestions(false);
    setMemberError('');
    fetchBorrowingInfo(m._id);
    setCart([]); // Clear cart when switching members
    setStep(2); // Automatically proceed to step 2!
    setTimeout(() => {
      if (bookInputRef.current) bookInputRef.current.focus();
    }, 50);
  };

  const handleSelectBook = (b) => {
    // Check if book has 0 available copies
    if ((b.availableCopies || 0) <= 0) {
      setBookError(`"${b.title}" is currently unavailable (0 copies available).`);
      return;
    }
    // Check if book is already in cart
    if (cart.some(item => item.book._id === b._id)) {
      setBookError(`"${b.title}" is already in the checkout cart.`);
      setBookSearch('');
      return;
    }
    // Check if user already has this book borrowed
    if (activeBorrows.some(item => item.book && item.book._id === b._id)) {
      setBookError(`Member already has "${b.title}" borrowed.`);
      setBookSearch('');
      return;
    }
    // Check if cart + activeBorrows exceeds limit
    if (activeBorrows.length + cart.length >= borrowLimit) {
      setBookError(`Cannot add book. Borrower has reached their limit (${borrowLimit} books).`);
      setBookSearch('');
      return;
    }

    setCart([...cart, {
      book: b,
      dueDate: dueDate, // default to the global due date
      notes: '',
    }]);

    setBookSearch('');
    setShowBookSuggestions(true);
    setBookError('');

    setTimeout(() => {
      if (bookInputRef.current) {
        bookInputRef.current.value = '';
        bookInputRef.current.focus();
      }
    }, 50);
  };

  const removeFromCart = (bookId) => {
    setCart(cart.filter(item => item.book._id !== bookId));
  };

  const updateCartItemDueDate = (bookId, dateVal) => {
    setCart(cart.map(item => item.book._id === bookId ? { ...item, dueDate: dateVal } : item));
  };

  const updateCartItemNotes = (bookId, notesVal) => {
    setCart(cart.map(item => item.book._id === bookId ? { ...item, notes: notesVal } : item));
  };

  const applyPresetDueDate = (days) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    const newDateStr = d.toISOString().split('T')[0];
    setDueDate(newDateStr);
    
    // Also update all items currently in cart
    setCart(cart.map(item => ({ ...item, dueDate: newDateStr })));
  };

  const clearMember = () => {
    setSelectedMember(null);
    setMemberSearch('');
    setActiveBorrows([]);
    setOutstandingFines(0);
    setOverdueCount(0);
    setCart([]);
    setShowMemberSuggestions(true);
    setMemberError('');
    setStep(1); // Go back to step 1
    setPolicyVerified(false);
  };

  const clearBook = () => {
    setBookSearch('');
    setShowBookSuggestions(true);
    setBookError('');
  };

  const clearAll = () => {
    clearMember();
    clearBook();
    setNotes('');
    setCart([]);
    setStep(1);
    setPolicyVerified(false);
  };

  // Reusable barcode processor
  const processBarcode = (query) => {
    const cleanQuery = query.trim().toUpperCase();
    if (!cleanQuery) return;

    // Check if it's a Member ID (starts with KMV or matches user memberId patterns)
    const isMemberId = cleanQuery.startsWith('KMV') || allUsers.some(u => u.memberId && u.memberId.toUpperCase() === cleanQuery);
    
    if (isMemberId) {
      const matchedUser = allUsers.find(
        u => u.memberId && u.memberId.toUpperCase() === cleanQuery
      );
      if (matchedUser) {
        handleSelectMember(matchedUser);
        setBookSearch('');
        setMemberSearch('');
        setBookError('');
        setMemberError('');
      } else {
        setMemberError(`No member found matching ID "${query}"`);
        setBookSearch('');
      }
    } else {
      // Treat as Book search / ISBN
      const cleanBookQuery = cleanQuery.replace(/[-\s]/g, '');
      const book = allBooks.find(b => 
        (b.bookId && b.bookId.toUpperCase() === cleanQuery) ||
        (b.isbn && b.isbn.replace(/[-\s]/g, '').toUpperCase() === cleanBookQuery)
      );

      if (book) {
        if (book.availableCopies <= 0) {
          setBookError(`Book "${book.title}" has no copies available.`);
          setBookSearch('');
          return;
        }
        handleSelectBook(book);
        setBookSearch('');
        setBookError('');
      } else {
        // Fallback to title/author filter results
        if (bookResults.length > 0) {
          const firstBook = bookResults[0];
          if (firstBook.availableCopies <= 0) {
            setBookError(`Book "${firstBook.title}" has no copies available.`);
            setBookSearch('');
            return;
          }
          handleSelectBook(firstBook);
          setBookSearch('');
          setBookError('');
        } else {
          if (cleanQuery.startsWith('BK') || /^\d{6,}/.test(query)) {
            setBookError(`No book found matching barcode/ISBN "${query}".`);
            setBookSearch('');
          }
        }
      }
    }
  };

  const handleMemberSearchKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const query = memberSearch.trim();
      if (!query) return;

      // Check if exact match by name or member ID
      const matchedUser = allUsers.find(
        u => (u.memberId && u.memberId.toUpperCase() === query.toUpperCase()) || 
             u.name.toLowerCase() === query.toLowerCase()
      );

      if (matchedUser) {
        handleSelectMember(matchedUser);
        setMemberSearch('');
        setMemberError('');
      } else {
        // Fallback to top result
        if (memberResults.length > 0) {
          handleSelectMember(memberResults[0]);
          setMemberSearch('');
          setMemberError('');
        } else {
          setMemberError(`No member found matching ID/name "${memberSearch}"`);
        }
      }
    }
  };

  const handleBookSearchKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const query = bookSearch.trim();
      if (!query) return;
      processBarcode(query);
    }
  };

  // Auto-focus inputs on state changes (immediate layout adjustment)
  useEffect(() => {
    if (!selectedMember) {
      if (memberInputRef.current) {
        memberInputRef.current.focus();
      }
    } else {
      if (bookInputRef.current) {
        bookInputRef.current.focus();
      }
    }
  }, [selectedMember]);

  // Global keydown scanner interceptor
  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      if (showSuccessModal) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setShowSuccessModal(false);
          setIssuedDetails(null);
          if (!selectedMember) {
            if (memberInputRef.current) memberInputRef.current.focus();
          } else {
            if (bookInputRef.current) bookInputRef.current.focus();
          }
          return;
        }
      }

      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (['Shift', 'Control', 'Alt', 'Meta', 'Tab', 'CapsLock', 'Enter', 'Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Backspace', 'Delete'].includes(e.key)) return;

      if (
        document.activeElement.tagName === 'INPUT' ||
        document.activeElement.tagName === 'TEXTAREA' ||
        document.activeElement.tagName === 'SELECT'
      ) {
        return;
      }

      if (!selectedMember) {
        if (memberInputRef.current) {
          memberInputRef.current.focus();
        }
      } else {
        if (bookInputRef.current) {
          bookInputRef.current.focus();
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [selectedMember, showSuccessModal]);

  // Automatic Barcode Scan Key Interceptor
  useEffect(() => {
    let buffer = '';
    let lastKeyTime = Date.now();

    const handleGlobalScan = (e) => {
      if (
        document.activeElement.tagName === 'INPUT' ||
        document.activeElement.tagName === 'TEXTAREA' ||
        document.activeElement.tagName === 'SELECT'
      ) {
        return;
      }

      const currentTime = Date.now();
      if (currentTime - lastKeyTime > 200) {
        buffer = '';
      }
      lastKeyTime = currentTime;

      if (e.key === 'Enter') {
        const query = buffer.trim();
        if (query) {
          processBarcode(query);
          buffer = '';
        }
        e.preventDefault();
      } else if (e.key.length === 1) {
        buffer += e.key;
      }
    };

    window.addEventListener('keydown', handleGlobalScan);
    return () => window.removeEventListener('keydown', handleGlobalScan);
  }, [allUsers, allBooks, cart, activeBorrows, borrowLimit, bookResults]);

  // Close success modal automatically when a new member scan or book scan starts
  useEffect(() => {
    if ((memberSearch || bookSearch) && showSuccessModal) {
      setShowSuccessModal(false);
      setIssuedDetails(null);
    }
  }, [memberSearch, bookSearch, showSuccessModal]);

  const canIssue = selectedMember && cart.length > 0 && !saving;

  const handleIssue = async () => {
    setError('');
    if (!canIssue) return;

    setSaving(true);
    try {
      const issuePayload = cart.map(item => {
        const todayStr = new Date().toISOString().split('T')[0];
        const now = new Date();
        let finalIssueDate = now.toISOString();
        
        if (issueDate !== todayStr) {
          const selected = new Date(issueDate);
          selected.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
          finalIssueDate = selected.toISOString();
        }
        
        return {
          bookId: item.book._id,
          dueDate: item.dueDate,
          notes: item.notes || notes,
          issueDate: finalIssueDate
        };
      });

      await api.post('/library/issue/bulk', {
        userId: selectedMember._id,
        issues: issuePayload,
      }, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const [usersRes, booksRes, txRes] = await Promise.all([
        api.get('/users', { headers: { Authorization: `Bearer ${token}` } }),
        api.get('/library/books'),
        api.get('/library/transactions?status=active&limit=30'),
      ]);
      setAllUsers(usersRes.data.users || []);
      setAllBooks(booksRes.data.books || []);
      setRecentIssues(txRes.data.transactions || []);

      // Keep details for the success popup before clearing states
      setIssuedDetails({
        member: selectedMember,
        books: cart.map(item => item.book),
        dueDate,
      });
      setShowSuccessModal(true);

      clearAll();
      setShowMemberSuggestions(true);
      setShowBookSuggestions(true);
      setIssueDate(new Date().toISOString().split('T')[0]);
      const d = new Date(); d.setDate(d.getDate() + 14);
      setDueDate(d.toISOString().split('T')[0]);
      console.log('Books issued successfully!');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to issue books.');
    } finally {
      setSaving(false);
    }
  };

  function gradeDisplay(u) {
    if (u.role === 'student') {
      if (u.grade && u.class) return `${u.grade.replace('Grade ', '')}-${u.class}`;
      if (u.grade) return u.grade.replace('Grade ', '');
      return 'Student';
    }
    if (u.role === 'teacher') return 'Teacher';
    return u.role;
  }

  const getInitials = (name) => {
    if (!name) return 'U';
    return name.trim().charAt(0).toUpperCase();
  };

  const handleStepClick = (targetStep) => {
    if (targetStep === 1) {
      setStep(1);
    } else if (targetStep === 2 && selectedMember) {
      setStep(2);
    }
  };

  const selectedPresetDays = (() => {
    if (!issueDate || !dueDate) return null;
    const timeDiff = new Date(dueDate).getTime() - new Date(issueDate).getTime();
    return Math.round(timeDiff / (1000 * 3600 * 24));
  })();

  return (
    <DashboardLayout>
      {/* Toast Error Popup */}
      {toastError && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[9999] max-w-sm w-full px-4 animate-toast-slide-down">
          <style>{`
            @keyframes slideDown {
              0% { transform: translate(-50%, -20px); opacity: 0; }
              100% { transform: translate(-50%, 0); opacity: 1; }
            }
            .animate-toast-slide-down {
              animation: slideDown 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
            }
          `}</style>
          <div 
            className="bg-white border-l-4 border-red-600 rounded-xl p-3.5 shadow-xl flex items-center justify-between gap-3"
            style={{ boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)' }}
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="material-symbols-outlined text-red-650 flex-shrink-0 animate-pulse" style={{ fontSize: 18 }}>error</span>
              <p className="text-[11px] font-bold text-slate-700 leading-normal truncate max-w-[260px]">{toastError}</p>
            </div>
            <button 
              onClick={() => setToastError('')}
              className="text-slate-400 hover:text-slate-600 flex-shrink-0 cursor-pointer p-0.5 rounded-full hover:bg-slate-100"
            >
              <span className="material-symbols-outlined text-base">close</span>
            </button>
          </div>
        </div>
      )}

      <div className="mx-auto space-y-3" style={{ maxWidth: '1280px', fontFamily: "'Inter', sans-serif" }}>

        <div className="flex flex-col lg:flex-row gap-3.5">
          {/* ========= MAIN COLUMN (Steppers + Step Views) ========= */}
          <div className="flex-1 flex flex-col space-y-3">

            {/* Stepper Header (3 Distinct States: 1. Select Member -> 2. Add Book -> 3. Issue Books) */}
            <div className="bg-white rounded-2xl p-3 border border-slate-100 shadow-sm flex items-center justify-between select-none">
              {/* Step 1: Select Member */}
              <button 
                onClick={() => setStep(1)}
                className="flex items-center gap-2.5 text-left focus:outline-none cursor-pointer group"
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs transition-all ${
                  !selectedMember 
                    ? 'bg-[#9E0D0D] text-white shadow-md' 
                    : 'bg-amber-100 text-[#D97706] border border-amber-200'
                }`}>
                  {selectedMember ? <span className="material-symbols-outlined text-sm font-bold">check</span> : '1'}
                </div>
                <div>
                  <span className="block text-xs font-black text-slate-750 group-hover:text-[#9E0D0D] transition-colors">Select Member</span>
                  <span className="block text-[10px] text-slate-400 font-semibold truncate max-w-[130px]">
                    {selectedMember ? selectedMember.name : 'Choose borrower'}
                  </span>
                </div>
              </button>

              <div className={`flex-1 h-[2px] mx-3 transition-all duration-300 ${selectedMember ? 'bg-[#9E0D0D]' : 'bg-slate-200'}`} />

              {/* Step 2: Add Book */}
              <button 
                onClick={() => { if (selectedMember) setStep(2); }}
                disabled={!selectedMember}
                className={`flex items-center gap-2.5 text-left focus:outline-none ${selectedMember ? 'cursor-pointer group' : 'cursor-not-allowed opacity-60'}`}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs transition-all ${
                  selectedMember && cart.length === 0
                    ? 'bg-[#9E0D0D] text-white shadow-md'
                    : (cart.length > 0 ? 'bg-amber-100 text-[#D97706] border border-amber-200' : 'bg-slate-100 text-slate-400')
                }`}>
                  {cart.length > 0 ? <span className="material-symbols-outlined text-sm font-bold">check</span> : '2'}
                </div>
                <div>
                  <span className={`block text-xs font-black transition-colors ${selectedMember ? 'text-slate-750 group-hover:text-[#9E0D0D]' : 'text-slate-455'}`}>Add Book</span>
                  <span className="block text-[10px] text-slate-400 font-semibold truncate max-w-[130px]">
                    {cart.length > 0 ? `${cart.length} book${cart.length > 1 ? 's' : ''} added` : 'Scan or search'}
                  </span>
                </div>
              </button>

              <div className={`flex-1 h-[2px] mx-3 transition-all duration-300 ${cart.length > 0 ? 'bg-[#9E0D0D]' : 'bg-slate-200'}`} />

              {/* Step 3: Issue Books */}
              <div 
                className={`flex items-center gap-2.5 text-left ${cart.length > 0 ? 'opacity-100' : 'opacity-60'}`}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs transition-all ${
                  cart.length > 0
                    ? 'bg-[#9E0D0D] text-white shadow-md ring-2 ring-red-400/40' 
                    : 'bg-slate-100 text-slate-400'
                }`}>
                  3
                </div>
                <div>
                  <span className={`block text-xs font-black transition-colors ${cart.length > 0 ? 'text-[#9E0D0D]' : 'text-slate-455'}`}>Issue Books</span>
                  <span className="block text-[10px] text-slate-400 font-semibold truncate max-w-[130px]">
                    {cart.length > 0 ? 'Ready to issue' : 'Confirm & issue'}
                  </span>
                </div>
              </div>
            </div>

            {/* Selected Borrower Details Card */}
            {selectedMember && (
              <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4 animate-fadeIn">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full flex items-center justify-center text-white flex-shrink-0 shadow-md font-black text-lg select-none" style={{ background: 'linear-gradient(135deg, #9E0D0D 0%, #4C0000 100%)' }}>
                    {getInitials(selectedMember.name)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-extrabold text-slate-800">{selectedMember.name}</h3>
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-600 border border-emerald-200">Active</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-600 uppercase">
                        ID: {selectedMember.memberId || '—'}
                      </span>
                      <span className="text-[10px] font-black px-2 py-0.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 uppercase">
                        {selectedMember.role}
                      </span>
                      {selectedMember.role === 'student' && selectedMember.grade && (
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-600 uppercase">
                          {gradeDisplay(selectedMember)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Search another member */}
                <button 
                  onClick={clearMember}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-white border border-[#9E0D0D] text-[#9E0D0D] hover:bg-red-50/50 transition-all hover:shadow-sm active:scale-95 flex items-center gap-1.5 flex-shrink-0 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-sm">person_search</span>
                  Search another member
                </button>
              </div>
            )}



            {/* ========= STEP 1 VIEW: Member Selection ========= */}
            {step === 1 && !selectedMember && (
              <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm space-y-3 animate-fadeIn flex flex-col h-[420px]">
                <div className="flex items-center gap-2 pb-2.5 border-b border-slate-100">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-indigo-50">
                    <span className="material-symbols-outlined text-indigo-650" style={{ fontSize: 18 }}>person_search</span>
                  </div>
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-700">Select Member</h3>
                    <p className="text-[10px] text-slate-400">Search for active student or teacher to begin checkout</p>
                  </div>
                </div>

                <div className="relative">
                  <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: memberInputFocused ? '#9E0D0D' : '#94A3B8', fontSize: 20 }}>
                    person_search
                  </span>
                  <input
                    ref={memberInputRef}
                    type="text"
                    value={memberSearch}
                    onChange={(e) => { setMemberSearch(e.target.value); setMemberError(''); }}
                    onKeyDown={handleMemberSearchKeyDown}
                    onFocus={() => setMemberInputFocused(true)}
                    onBlur={() => setMemberInputFocused(false)}
                    placeholder=""
                    className="w-full py-2.5 pl-10 pr-4 text-sm rounded-xl outline-none border transition-all bg-slate-50/50 focus:bg-white"
                    style={{ 
                      borderColor: memberInputFocused ? '#9E0D0D' : '#E2E8F0',
                    }}
                  />
                </div>



                {/* Suggestions List */}
                <div className="border border-slate-100 rounded-xl overflow-hidden divide-y divide-slate-100 overflow-y-auto flex-1 min-h-0">
                  {memberSearch.trim() === '' ? (
                    <div className="p-8 text-center flex flex-col items-center justify-center h-full select-none">
                      <span className="material-symbols-outlined text-slate-300 mb-1" style={{ fontSize: 32 }}>person_search</span>
                      <p className="text-xs text-slate-400 font-medium">Search for a student or teacher by name or Member ID</p>
                    </div>
                  ) : memberResults.length === 0 ? (
                    <div className="p-8 text-center flex flex-col items-center justify-center h-full select-none animate-fadeIn">
                      <span className="material-symbols-outlined text-slate-300 text-4xl mb-1.5">person_off</span>
                      <p className="text-xs text-slate-500 font-extrabold uppercase tracking-wider">No members found</p>
                      <p className="text-[10px] text-slate-400 mt-1 max-w-[200px] leading-normal">
                        No active member matched "{memberSearch}". Please check spelling or ID.
                      </p>
                    </div>
                  ) : (
                    memberResults.slice(0, 25).map((u) => (
                      <button
                        key={u._id}
                        onClick={() => handleSelectMember(u)}
                        className="w-full p-3.5 flex items-center justify-between gap-4 text-left hover:bg-slate-50/50 transition-colors cursor-pointer"
                      >
                        <div className="flex gap-3 items-center min-w-0">
                          <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-white font-black" style={{ background: 'linear-gradient(135deg, #9E0D0D 0%, #4C0000 100%)' }}>
                            {getInitials(u.name)}
                          </div>
                          <div className="min-w-0">
                            <h4 className="text-xs font-bold text-slate-800 truncate">{u.name}</h4>
                            <p className="text-[10px] text-slate-450 truncate">
                              {u.memberId || '—'} • {gradeDisplay(u)}
                            </p>
                          </div>
                        </div>

                        <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border ${
                          u.role === 'student' ? 'bg-blue-50 text-blue-600 border-blue-100' : 'bg-amber-50 text-amber-600 border-amber-100'
                        }`}>
                          {u.role.toUpperCase()}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* ========= STEP 2 VIEW: Add Books ========= */}
            {step === 2 && selectedMember && (
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 animate-fadeIn">
                {/* Left side search catalog */}
                <div className="xl:col-span-7 space-y-3">
                  <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm flex flex-col justify-between h-[420px]">
                    {/* Header bar */}
                    <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-100 animate-fadeIn">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-amber-50">
                        <span className="material-symbols-outlined text-amber-650" style={{ fontSize: 18 }}>qr_code_scanner</span>
                      </div>
                      <div>
                        <h3 className="text-sm font-extrabold text-slate-700">Scan or Search Book</h3>
                      </div>
                    </div>

                    {/* Input search with Enter button */}
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: bookInputFocused ? '#D97706' : '#94A3B8', fontSize: 20 }}>
                          {bookInputFocused ? 'qr_code_scanner' : 'search'}
                        </span>
                        <input
                          ref={bookInputRef}
                          type="text"
                          value={bookSearch}
                          onChange={(e) => { setBookSearch(e.target.value); setBookError(''); }}
                          onFocus={() => setBookInputFocused(true)}
                          onBlur={() => setBookInputFocused(false)}
                          onKeyDown={handleBookSearchKeyDown}
                          placeholder=""
                          className="w-full py-2.5 pl-10 pr-10 text-sm rounded-xl outline-none border transition-all bg-slate-50/50 focus:bg-white"
                          style={{ 
                            borderColor: bookInputFocused ? '#D97706' : '#E2E8F0',
                            fontFamily: bookSearch.startsWith('BK') || /^\d{6}/.test(bookSearch) ? 'monospace' : 'inherit',
                          }}
                        />
                        {bookSearch && (
                          <button 
                            onClick={() => setBookSearch('')}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-450 hover:text-slate-650 p-0.5 rounded-full hover:bg-slate-200"
                          >
                            <span className="material-symbols-outlined text-base">close</span>
                          </button>
                        )}
                      </div>
                      <button
                        onClick={() => processBarcode(bookSearch)}
                        className="px-4 py-2 text-xs font-bold border border-slate-200 rounded-xl bg-slate-50 text-slate-700 hover:bg-slate-100 hover:shadow-sm transition-all active:scale-95 cursor-pointer flex-shrink-0"
                      >
                        Enter
                      </button>
                    </div>




                    {/* Book catalog selection items */}
                    <div className="mt-3 border border-slate-100 rounded-xl overflow-hidden divide-y divide-slate-100 overflow-y-auto pr-1 flex-1 min-h-0">
                      {bookSearch.trim() === '' ? (
                        <div className="p-8 text-center flex flex-col items-center justify-center h-full select-none">
                          <span className="material-symbols-outlined text-slate-300 mb-1" style={{ fontSize: 30 }}>search</span>
                          <p className="text-xs text-slate-400 font-medium">Search for a book</p>
                        </div>
                      ) : bookResults.length === 0 ? (
                        <div className="p-8 text-center flex flex-col items-center justify-center h-full select-none animate-fadeIn">
                          <span className="material-symbols-outlined text-slate-300 mb-1.5" style={{ fontSize: 36 }}>search_off</span>
                          <p className="text-xs text-slate-500 font-extrabold uppercase tracking-wider">No books found</p>
                          <p className="text-[10px] text-slate-400 mt-1 max-w-[200px] leading-normal">
                            No copies available or query matched. Please check barcodes.
                          </p>
                        </div>
                      ) : (
                        bookResults.map((bk) => {
                          const inCart = cart.some(item => item.book._id === bk._id);
                          return (
                            <div key={bk._id} className="p-2.5 flex items-center justify-between gap-4 transition-colors hover:bg-slate-50/20">
                              <div className="flex gap-3 items-center min-w-0">
                                <div className="w-10 h-10 rounded-lg bg-amber-50 border border-amber-250 flex items-center justify-center flex-shrink-0 overflow-hidden">
                                  {bk.coverImageUrl ? (
                                    <img src={bk.coverImageUrl} alt="Cover" className="w-full h-full object-cover" />
                                  ) : (
                                    <span className="material-symbols-outlined text-amber-600 text-xl">menu_book</span>
                                  )}
                                </div>
                                <div className="min-w-0">
                                  <h4 className="text-xs font-black text-slate-800 truncate">{bk.title}</h4>
                                  <p className="text-[10px] text-slate-450 mt-0.5 truncate">
                                    {bk.author} • ID: <span className="font-mono font-bold">{bk.bookId}</span>
                                  </p>
                                  <div className="mt-1 flex items-center gap-2">
                                    <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border ${
                                      (bk.availableCopies || 0) > 0
                                        ? 'bg-emerald-50 text-emerald-600 border-emerald-100'
                                        : 'bg-red-50 text-red-600 border-red-100'
                                    }`}>
                                      {(bk.availableCopies !== undefined && bk.availableCopies !== null) ? bk.availableCopies : 0} Available{(bk.availableCopies || 0) <= 0 ? ' (Out of stock)' : ''}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              <button
                                onClick={() => handleSelectBook(bk)}
                                disabled={inCart || (bk.availableCopies || 0) <= 0}
                                className={`w-28 flex-shrink-0 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all border text-center ${
                                  inCart
                                    ? 'bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed font-semibold'
                                    : (bk.availableCopies || 0) <= 0
                                      ? 'bg-red-50 border-red-200 text-red-600 cursor-not-allowed font-semibold'
                                      : 'bg-[#9E0D0D] border-[#9E0D0D] text-white hover:opacity-90 active:scale-95 shadow-sm shadow-red-900/10 cursor-pointer'
                                }`}
                              >
                                {inCart ? 'In Cart' : (bk.availableCopies || 0) <= 0 ? 'Out of Stock' : '+ Add to cart'}
                              </button>
                            </div>
                          );
                        })
                      )}
                    </div>


                  </div>
                </div>

                {/* Right side checkout cart details */}
                <div className="xl:col-span-5 space-y-3">
                  <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm flex flex-col justify-between h-[420px] relative">
                    <div className="flex-1 flex flex-col min-h-0">
                      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-100 flex-shrink-0">
                        <span className="material-symbols-outlined text-[#9E0D0D] text-xl">shopping_cart</span>
                        <div>
                          <h3 className="text-sm font-extrabold text-slate-705">Checkout Cart ({cart.length})</h3>
                        </div>
                      </div>

                      {cart.length === 0 ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-center p-8 select-none">
                          <span className="material-symbols-outlined text-slate-300 mb-1" style={{ fontSize: 30 }}>local_library</span>
                          <p className="text-xs text-slate-400 font-medium">Cart is empty</p>
                        </div>
                      ) : cart.length === 1 ? (
                        <div className="animate-fadeIn flex-1 flex flex-col min-h-0 overflow-y-auto pr-1">
                          <div className="flex gap-3.5 items-start p-3 bg-slate-50/60 border border-slate-100 rounded-2xl">
                            {/* Cover Image */}
                            <div className="w-20 h-28 rounded-xl bg-amber-50 border border-amber-250 flex items-center justify-center flex-shrink-0 overflow-hidden shadow-sm">
                              {cart[0].book.coverImageUrl ? (
                                <img src={cart[0].book.coverImageUrl} alt="Cover" className="w-full h-full object-cover" />
                              ) : (
                                <span className="material-symbols-outlined text-amber-650 text-3xl">menu_book</span>
                              )}
                            </div>
                            
                            {/* Book Basic Info + Accession No & ISBN */}
                            <div className="flex-1 min-w-0 flex flex-col justify-between self-stretch">
                              <div>
                                <div className="flex justify-between items-start gap-2">
                                  <h4 className="text-xs font-black text-slate-800 line-clamp-2 leading-tight">{cart[0].book.title}</h4>
                                  <button
                                    onClick={() => removeFromCart(cart[0].book._id)}
                                    className="p-1 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0 cursor-pointer"
                                    title="Remove book"
                                  >
                                    <span className="material-symbols-outlined text-base">delete</span>
                                  </button>
                                </div>
                                <p className="text-[11px] text-slate-500 font-semibold mt-0.5 truncate">{cart[0].book.author || 'Unknown Author'}</p>
                              </div>

                              <div className="space-y-1.5 mt-2">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-[9px] font-mono font-bold px-2 py-0.5 rounded-lg bg-red-50 text-[#9E0D0D] border border-red-100">
                                    ID: {cart[0].book.bookId}
                                  </span>
                                  <span className="text-[9px] font-mono font-bold px-2 py-0.5 rounded-lg bg-slate-100 text-slate-650 border border-slate-200">
                                    ISBN: {cart[0].book.isbn || '—'}
                                  </span>
                                </div>

                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-[8px] font-black px-1.5 py-0.5 rounded bg-amber-50 text-amber-750 border border-amber-100 uppercase">
                                    {cart[0].book.category}
                                  </span>
                                  <span className="text-[8px] font-black px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 border border-emerald-100">
                                    {cart[0].book.availableCopies} Available
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : (
                        /* Selected Books list for multiple books */
                        <div className="space-y-2 flex-1 max-h-[160px] overflow-y-auto pr-1">
                          {cart.map((item) => (
                            <div key={item.book._id} className="p-2.5 bg-slate-50/50 border border-slate-100 rounded-xl flex items-center justify-between gap-3 animate-fadeIn">
                              <div className="flex gap-2 items-center min-w-0">
                                <div className="w-8 h-8 rounded-lg bg-amber-50 border border-amber-250 flex items-center justify-center flex-shrink-0 overflow-hidden">
                                  {item.book.coverImageUrl ? (
                                    <img src={item.book.coverImageUrl} alt="Cover" className="w-full h-full object-cover" />
                                  ) : (
                                    <span className="material-symbols-outlined text-amber-650 text-lg">menu_book</span>
                                  )}
                                </div>
                                <div className="min-w-0">
                                  <h4 className="text-xs font-black text-slate-700 truncate">{item.book.title}</h4>
                                </div>
                              </div>

                              <button
                                onClick={() => removeFromCart(item.book._id)}
                                className="p-1 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0 cursor-pointer"
                              >
                                <span className="material-symbols-outlined text-base">close</span>
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {cart.length > 0 && (
                      <div className="mt-4 pt-3 border-t border-slate-100 space-y-3">
                        {/* Preset dates */}
                        <div>
                          <div className="flex items-center gap-1.5">
                            {[
                              { label: '1 week', days: 7 },
                              { label: '2 weeks', days: 14 },
                              { label: '1 month', days: 30 }
                            ].map((preset) => {
                              const isActive = selectedPresetDays === preset.days;
                              return (
                                <button
                                  key={preset.label}
                                  type="button"
                                  onClick={() => applyPresetDueDate(preset.days)}
                                  className={`flex-1 py-1 px-2 text-[10px] font-bold rounded-lg transition-all cursor-pointer ${
                                    isActive
                                      ? 'bg-[#9E0D0D] border border-[#9E0D0D] text-white shadow-sm'
                                      : 'bg-amber-50 border border-amber-200 text-amber-800 hover:bg-amber-100 hover:shadow-sm'
                                  }`}
                                >
                                  {preset.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* Custom Date selectors (Explicit YYYY-MM-DD format with standard font) */}
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <span className="block text-[9px] font-black uppercase tracking-wider text-slate-400 mb-0.5">Issue Date</span>
                            <div className="relative flex items-center w-full px-2.5 py-1.5 text-xs rounded-xl border border-slate-200 bg-white hover:border-slate-300 focus-within:border-[#9E0D0D] cursor-pointer shadow-2xs transition-all group">
                              <span className="font-medium text-slate-800 text-xs flex-1 select-none">
                                {issueDate || 'YYYY-MM-DD'}
                              </span>
                              <span className="material-symbols-outlined text-slate-400 group-hover:text-slate-600 text-sm flex-shrink-0">
                                calendar_today
                              </span>
                              <input
                                type="date"
                                value={issueDate}
                                onChange={(e) => {
                                  const newIssueDate = e.target.value;
                                  setIssueDate(newIssueDate);
                                  // Maintain same day duration spacing when issue date changes
                                  const prevDays = selectedPresetDays || 14;
                                  const newDue = new Date(newIssueDate);
                                  newDue.setDate(newDue.getDate() + prevDays);
                                  setDueDate(newDue.toISOString().split('T')[0]);
                                }}
                                className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                              />
                            </div>
                          </div>
                          <div>
                            <span className="block text-[9px] font-black uppercase tracking-wider text-slate-400 mb-0.5">Due Date</span>
                            <div className="relative flex items-center w-full px-2.5 py-1.5 text-xs rounded-xl border border-slate-200 bg-white hover:border-slate-300 focus-within:border-[#9E0D0D] cursor-pointer shadow-2xs transition-all group">
                              <span className="font-medium text-slate-800 text-xs flex-1 select-none">
                                {dueDate || 'YYYY-MM-DD'}
                              </span>
                              <span className="material-symbols-outlined text-slate-400 group-hover:text-slate-600 text-sm flex-shrink-0">
                                calendar_today
                              </span>
                              <input
                                type="date"
                                value={dueDate}
                                onChange={(e) => {
                                  const newDateStr = e.target.value;
                                  setDueDate(newDateStr);
                                  setCart(cart.map(item => ({ ...item, dueDate: newDateStr })));
                                }}
                                className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                              />
                            </div>
                          </div>
                        </div>

                        {/* -------------------------------------------------------------
                            🔴 BUTTON: "Proceed to Checkout Cart" Button (Step 2)
                            To change the color of this button:
                            - Modify "bg-[#9E0D0D]" to your color (e.g. bg-blue-600)
                        {/* -------------------------------------------------------------
                            🔴 BUTTON: Direct "Issue Books" and Clear Cart Actions (Step 2)
                           ------------------------------------------------------------- */}
                        <div className="flex items-center gap-2 pt-1">
                          <button
                            onClick={clearAll}
                            type="button"
                            className="px-3 py-2.5 rounded-xl text-xs font-bold border border-slate-200 hover:bg-red-50 hover:text-red-700 hover:border-red-200 transition-all flex items-center justify-center gap-1 active:scale-95 cursor-pointer text-slate-500"
                            title="Clear all books from cart"
                          >
                            <span className="material-symbols-outlined text-base">delete</span>
                            Clear
                          </button>

                          <button
                            onClick={handleIssue}
                            disabled={!canIssue || saving}
                            className="flex-1 py-2.5 rounded-xl text-xs font-black text-white flex items-center justify-center gap-2 shadow-md transition-all active:scale-95 select-none"
                            style={{
                              backgroundColor: (canIssue && !saving) ? '#9E0D0D' : '#D1D5DB',
                              boxShadow: (canIssue && !saving) ? '0 4px 12px rgba(158,13,13,0.2)' : 'none',
                              cursor: (canIssue && !saving) ? 'pointer' : 'not-allowed',
                            }}
                          >
                            <span className="material-symbols-outlined text-base">check_circle</span>
                            {saving ? 'Processing...' : `Issue ${cart.length} Book${cart.length > 1 ? 's' : ''}`}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ========= RIGHT SIDEBAR ========= */}
          <div className="w-full lg:w-64 space-y-3 flex-shrink-0 animate-fadeIn select-none flex flex-col">
            {/* When member is selected (Add Books & Review & Issue stages): Show Borrower's active Borrowings on top, with Warning Badges underneath */}
            {selectedMember ? (
              <div className="space-y-3 flex flex-col flex-1">
                {/* Main Borrowings Card (Placed on top, expands to full height when no warnings exist) */}
                <div className={`rounded-2xl p-4 border border-slate-100 shadow-sm bg-white animate-fadeIn flex flex-col justify-between ${
                  !(outstandingFines > 0 || overdueCount > 0) ? 'flex-1 min-h-[380px]' : 'space-y-3'
                }`}>
                  <div>
                    <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="material-symbols-outlined text-indigo-650" style={{ fontSize: 18 }}>receipt_long</span>
                        <span className="text-xs font-black uppercase tracking-wider text-slate-700 truncate">Borrowings</span>
                      </div>
                      <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border flex-shrink-0 ${
                        activeBorrows.length >= borrowLimit 
                          ? 'bg-red-50 text-red-600 border-red-100' 
                          : 'bg-indigo-50 text-indigo-600 border-indigo-105'
                      }`}>
                        {activeBorrows.length} / {borrowLimit} Books
                      </span>
                    </div>
                    
                    <div className="mt-3">
                      <ActiveBorrowsList
                        borrows={activeBorrows}
                        selectedMember={selectedMember}
                        maxHeight={(outstandingFines > 0 || overdueCount > 0) ? "220px" : "380px"}
                      />
                    </div>
                  </div>

                  <div className="pt-2.5 border-t border-slate-100 mt-3">
                    <div className="flex items-center justify-between mb-1.5 text-[10px] text-slate-400 font-bold">
                      <span>Quota Limit</span>
                      <span className="font-extrabold text-slate-650">{Math.min(activeBorrows.length, borrowLimit)} of {borrowLimit} used</span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-300" style={{
                        width: `${Math.min((activeBorrows.length / borrowLimit) * 100, 100)}%`,
                        backgroundColor: activeBorrows.length >= borrowLimit ? '#EF4444' : '#9E0D0D',
                      }} />
                    </div>
                  </div>
                </div>

                {/* Warning Alert Cards (fines / overdue) placed below Borrowings Card */}
                {(outstandingFines > 0 || overdueCount > 0) && (
                  <div className="space-y-2.5 animate-fadeIn">
                    {outstandingFines > 0 && (
                      <div className="relative overflow-hidden rounded-2xl p-3.5 sm:p-4 border border-amber-300 bg-gradient-to-br from-amber-50 via-amber-50/90 to-amber-100/50 text-amber-950 shadow-sm ring-2 ring-amber-400/40 animate-pulse transition-all">
                        <div className="flex items-start gap-3">
                          <div className="relative w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-300/80 flex items-center justify-center flex-shrink-0 text-amber-700 shadow-2xs">
                            <span className="material-symbols-outlined text-xl">payments</span>
                            <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-500 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-600"></span>
                            </span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-1.5 mb-0.5">
                              <span className="text-[10px] font-black uppercase tracking-wider text-amber-900">Unpaid Fines</span>
                              <span className="px-1.5 py-0.5 rounded-md bg-amber-200/80 text-amber-950 text-[9px] font-black tracking-tight uppercase">Dues Pending</span>
                            </div>
                            <div className="text-sm font-black text-amber-950 tracking-tight">LKR {outstandingFines}.00</div>
                            <p className="text-[10px] font-semibold text-amber-800/85 mt-0.5 leading-snug">
                              Borrower has unpaid fine balance.
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                    {overdueCount > 0 && (
                      <div className="relative overflow-hidden rounded-2xl p-3.5 sm:p-4 border border-rose-300 bg-gradient-to-br from-rose-50 via-rose-50/90 to-rose-100/50 text-rose-950 shadow-sm ring-2 ring-rose-400/40 animate-pulse transition-all">
                        <div className="flex items-start gap-3">
                          <div className="relative w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-300/80 flex items-center justify-center flex-shrink-0 text-rose-700 shadow-2xs">
                            <span className="material-symbols-outlined text-xl">warning</span>
                            <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-500 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-600"></span>
                            </span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-1.5 mb-0.5">
                              <span className="text-[10px] font-black uppercase tracking-wider text-rose-900">Overdue Books</span>
                              <span className="px-1.5 py-0.5 rounded-md bg-rose-200/80 text-rose-950 text-[9px] font-black tracking-tight uppercase">Action Required</span>
                            </div>
                            <div className="text-sm font-black text-rose-950 tracking-tight">
                              {overdueCount} {overdueCount > 1 ? 'Books Overdue' : 'Book Overdue'}
                            </div>
                            <p className="text-[10px] font-semibold text-rose-800/85 mt-0.5 leading-snug">
                              Past allowed return deadline.
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              /* When no member is selected (Step 1): Show Recent Issues matching Select Member card height */
              <div className="rounded-2xl p-4 border border-slate-100 shadow-sm bg-white flex flex-col h-[420px] animate-fadeIn">
                <div className="flex items-center justify-between gap-1.5 mb-3 select-none pb-2 border-b border-slate-100">
                  <div className="flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-emerald-600" style={{ fontSize: 18 }}>history</span>
                    <span className="text-xs font-black uppercase tracking-wider text-slate-700 truncate">Recent Issues</span>
                  </div>
                  {recentIssues.length > 0 && (
                    <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">
                      {recentIssues.length} Active
                    </span>
                  )}
                </div>

                <RecentTransactionsList
                  transactions={recentIssues}
                  type="issues"
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Success Modal Overlay */}
      {showSuccessModal && issuedDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fadeIn" style={{ backgroundColor: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(8px)' }}>
          <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl transition-all border border-slate-100 flex flex-col items-center text-center relative overflow-hidden animate-scaleUp">
            <div className="absolute top-0 left-0 right-0 h-2 bg-emerald-500" />
            
            <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600 mb-4 mt-2 animate-bounce">
              <span className="material-symbols-outlined text-4xl font-bold">check_circle</span>
            </div>

            <h3 className="text-xl font-black mb-1 text-slate-800">
              Checkout Successful!
            </h3>
            <p className="text-slate-400 text-xs mb-5">Issued {issuedDetails.books ? issuedDetails.books.length : 1} books successfully</p>

            <div className="w-full rounded-2xl p-4 mb-6 border border-slate-100 bg-slate-50/50 flex flex-col gap-3.5 text-left text-xs">
              <div className="flex gap-3">
                <span className="material-symbols-outlined text-slate-400 mt-0.5" style={{ fontSize: 18 }}>person</span>
                <div className="flex-1 min-w-0">
                  <div className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Borrower</div>
                  <div className="font-extrabold text-slate-850 truncate">{issuedDetails.member.name}</div>
                  <div className="text-[10px] text-slate-500 font-mono font-bold">{issuedDetails.member.memberId}</div>
                </div>
              </div>
              
              <div className="border-t border-dashed border-slate-200" />

              <div className="flex gap-3">
                <span className="material-symbols-outlined text-slate-400 mt-0.5" style={{ fontSize: 18 }}>menu_book</span>
                <div className="flex-1 min-w-0">
                  <div className="text-[9px] font-black text-slate-400 uppercase tracking-wider mb-1">Issued Items</div>
                  <div className="flex flex-col gap-1 max-h-[140px] overflow-y-auto pr-1">
                    {issuedDetails.books ? (
                      issuedDetails.books.map((bk) => (
                        <div key={bk._id} className="font-extrabold text-slate-800 text-xs py-0.5 flex justify-between items-center border-b border-slate-100 last:border-0 animate-fadeIn">
                          <span className="truncate pr-2 font-bold">{bk.title}</span>
                          <span className="font-mono text-[9px] text-slate-400 flex-shrink-0 font-bold">{bk.bookId}</span>
                        </div>
                      ))
                    ) : (
                      <div className="font-extrabold text-slate-800">{issuedDetails.book?.title}</div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex gap-3 w-full">
              <button
                onClick={() => {
                  setShowSuccessModal(false);
                  setIssuedDetails(null);
                }}
                className="flex-1 py-3 rounded-xl text-xs font-black text-white transition-all hover:opacity-90 flex items-center justify-center gap-1.5 shadow-md bg-emerald-600 shadow-emerald-100 cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
