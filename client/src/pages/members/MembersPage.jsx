import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import api from '../../api/axios';
import DashboardLayout from '../../components/layout/DashboardLayout';
import MemberTable from '../../components/members/MemberTable';
import MemberModals from '../../components/members/MemberModals';

const ROLES = ['student', 'teacher'];
const STATUSES = ['all', 'active', 'pending', 'rejected'];

// Sri Lankan school grades
const GRADES = [
  { label: 'Grade 1', value: 'Grade 1' },
  { label: 'Grade 2', value: 'Grade 2' },
  { label: 'Grade 3', value: 'Grade 3' },
  { label: 'Grade 4', value: 'Grade 4' },
  { label: 'Grade 5', value: 'Grade 5' },
  { label: 'Grade 6', value: 'Grade 6' },
  { label: 'Grade 7', value: 'Grade 7' },
  { label: 'Grade 8', value: 'Grade 8' },
  { label: 'Grade 9', value: 'Grade 9' },
  { label: 'Grade 10', value: 'Grade 10' },
  { label: 'Grade 11', value: 'Grade 11' },
  { label: 'Grade 12', value: 'Grade 12' },
  { label: 'Grade 13', value: 'Grade 13' },
  { label: 'Teacher', value: 'Teacher' },
  { label: 'Out of school', value: 'Out of school' },
];

// Class sections for each grade (A through H)
const CLASS_SECTIONS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

// A/L subject streams
const AL_STREAMS = [
  { label: 'Bio Science', value: 'Bio Science', subjects: 'Biology, Chemistry, Physics | Combined Maths' },
  { label: 'Physical Science', value: 'Physical Science', subjects: 'Combined Maths, Physics, Chemistry | ICT' },
  { label: 'Commerce', value: 'Commerce', subjects: 'Accounting, Business Studies, Economics | ICT' },
  { label: 'Arts', value: 'Arts', subjects: 'Sinhala / English / Tamil | Buddhism / Religions | History | Geography' },
  { label: 'Technology', value: 'Technology', subjects: 'Mechanical Technology | Electrical & Electronic | Building' },
  { label: 'ICT', value: 'ICT', subjects: 'ICT | ICT Practical | Economics | Combined Maths' },
];

function gradeLabel(val) {
  if (!val) return '';
  const match = GRADES.find((g) => g.value === val);
  return match ? match.label : val;
}

function displayGradeAndClass(m) {
  if (!m.grade) return '—';
  if (m.grade === 'Out of school' || m.grade === 'Teacher' || m.grade === 'Other') {
    return gradeLabel(m.grade);
  }
  // For grades 1-11: show "Grade 6-A" (grade + class section)
  if (m.grade && m.class && m.grade !== 'Grade 12' && m.grade !== 'Grade 13') {
    return `${gradeLabel(m.grade)}-${m.class}`;
  }
  // For grades 12/13: show grade + A/L stream
  if (m.grade === 'Grade 12' || m.grade === 'Grade 13') {
    const stream = m.class;
    if (stream) return `${gradeLabel(m.grade)} – ${stream}`;
    return gradeLabel(m.grade);
  }
  return gradeLabel(m.grade) || '—';
}

export default function MembersPage() {
  const { user, token } = useAuth();
  const navigate = useNavigate();

  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [gradeFilter, setGradeFilter] = useState('all');
  const [classFilter, setClassFilter] = useState('all');
  const [streamFilter, setStreamFilter] = useState('all');

  // Pagination State (30 items per page by default)
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(30);

  const [modal, setModal] = useState(null); // null | 'edit' | 'add' | 'history'
  const [selected, setSelected] = useState(null);
  const [deleteConfirmMember, setDeleteConfirmMember] = useState(null);
  const [form, setForm] = useState({ name: '', email: '', grade: '', class: '', role: 'student' });
  const [addForm, setAddForm] = useState({ name: '', email: '', role: 'student', grade: '', class: '', memberId: '' });
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  // History state
  const [historyData, setHistoryData] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 2800);
  };

  const fetchMembers = async () => {
    try {
      setLoading(true);
      const res = await api.get('/users', { headers: { Authorization: `Bearer ${token}` } });
      const memberList = (res.data.users || []).filter((u) => u.role !== 'librarian');
      setMembers(memberList);
    } catch (err) {
      console.error('Fetch members error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchMembers(); }, []);

  useEffect(() => {
    if (user && user.role !== 'librarian') navigate('/dashboard', { replace: true });
  }, [user, navigate]);

  // Reset pagination to page 1 whenever filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [search, roleFilter, statusFilter, gradeFilter, classFilter, streamFilter]);

  const filtered = members.filter((m) => {
    const q = search.toLowerCase();
    const matchSearch =
      m.name.toLowerCase().includes(q) ||
      (m.email && m.email.toLowerCase().includes(q)) ||
      (m.phone && m.phone.toLowerCase().includes(q)) ||
      (m.memberId && m.memberId.toLowerCase().includes(q));
    const matchRole = roleFilter === 'all' || m.role === roleFilter;
    const matchStatus = statusFilter === 'all' || m.status === statusFilter;
    const matchGrade = gradeFilter === 'all' || m.grade === gradeFilter;
    const matchClass = classFilter === 'all' || m.class === classFilter;
    const matchStream = streamFilter === 'all' || m.class === streamFilter;
    return matchSearch && matchRole && matchStatus && matchGrade && matchClass && matchStream;
  });

  const openAddModal = () => {
    setAddForm({ name: '', phone: '', email: '', role: 'student', grade: '', class: '', memberId: '' });
    setError('');
    setModal('add');
  };

  const openEdit = (member) => {
    setSelected(member);
    setForm({
      name: member.name,
      phone: member.phone || '',
      email: member.email || '',
      grade: member.grade || '',
      class: member.class || '',
      role: member.role,
    });
    setError('');
    setModal('edit');
  };

  const openHistory = async (member) => {
    setSelected(member);
    setHistoryData(null);
    setHistoryLoading(true);
    setModal('history');
    try {
      const res = await api.get(`/library/users/${member._id}/history`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setHistoryData(res.data);
    } catch (err) {
      console.error('Fetch history error:', err);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleAddMember = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const res = await api.post('/users', addForm, { headers: { Authorization: `Bearer ${token}` } });
      setMembers((prev) => [res.data.user, ...prev]);
      setModal(null);
      showToast(`Member ${res.data.user.name} (${res.data.user.memberId}) added successfully!`, 'success');
    } catch (err) {
      console.error('Add member error:', err);
      const msg = err.response?.data?.message || (typeof err.response?.data === 'string' ? err.response.data : '') || err.message || 'Failed to add member.';
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await api.put(`/users/${selected._id}`, { name: form.name, phone: form.phone, email: form.email, grade: form.grade, class: form.class, role: form.role }, { headers: { Authorization: `Bearer ${token}` } });
      setMembers((prev) => prev.map((m) => (m._id === selected._id ? { ...m, ...res.data.user } : m)));
      setModal(null);
      showToast('Member updated successfully!', 'success');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update.');
    } finally { setSaving(false); }
  };

  const handleDelete = (member) => {
    setDeleteConfirmMember(member);
  };

  const executeDelete = async () => {
    if (!deleteConfirmMember) return;
    setActionLoading(true);
    try { 
      await api.delete(`/users/${deleteConfirmMember._id}`, { headers: { Authorization: `Bearer ${token}` } }); 
      setMembers((prev) => prev.filter((m) => m._id !== deleteConfirmMember._id)); 
      showToast(`Member ${deleteConfirmMember.name} deleted successfully!`, 'delete');
      setDeleteConfirmMember(null);
    }
    catch (err) { 
      showToast(err.response?.data?.message || 'Failed to delete.', 'error'); 
    }
    finally { 
      setActionLoading(false); 
    }
  };

  const handleStatusToggle = async (member, newStatus) => {
    setActionLoading(true);
    try { 
      const res = await api.put(`/users/${member._id}`, { status: newStatus }, { headers: { Authorization: `Bearer ${token}` } }); 
      setMembers((prev) => prev.map((m) => (m._id === member._id ? { ...m, ...res.data.user } : m))); 
      showToast(`Member status updated to ${newStatus}!`, 'success');
    }
    catch (err) { showToast(err.response?.data?.message || 'Failed to update status.', 'error'); }
    finally { setActionLoading(false); }
  };

  return (
    <DashboardLayout>
      {/* Top Control Panel Header */}
      <div className="relative lg:fixed lg:top-16 lg:left-64 lg:right-0 lg:z-20 bg-white pb-3 pt-3 px-4 sm:px-6 lg:px-8 border-b border-slate-200/80 shadow-xs">
        <div className="flex gap-2.5 items-center flex-wrap">
          <div className="relative flex-1 min-w-[180px]">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#94a3b8', fontSize: 18 }}>search</span>
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, ID..." className="w-full py-2.5 pl-9 pr-4 text-xs rounded-xl outline-none shadow-sm border border-slate-200 focus:border-[#9E0D0D] bg-white text-slate-800" />
          </div>

          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="py-2.5 px-3 text-xs font-semibold rounded-xl outline-none shadow-sm border border-slate-200 bg-white" style={{ color: '#2C2C3E', minWidth: 95 }}>
            {STATUSES.map((s) => <option key={s} value={s}>{s === 'all' ? 'All Status' : s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
          </select>
          <select value={gradeFilter} onChange={(e) => { setGradeFilter(e.target.value); setClassFilter('all'); }} className="py-2.5 px-3 text-xs font-semibold rounded-xl outline-none shadow-sm border border-slate-200 bg-white" style={{ color: '#2C2C3E', minWidth: 105 }}>
            <option value="all">All Grades</option>
            {GRADES.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
          </select>
          {gradeFilter !== 'all' && gradeFilter !== 'Grade 12' && gradeFilter !== 'Grade 13' && gradeFilter !== 'Teacher' && gradeFilter !== 'Other' && gradeFilter !== 'Out of school' && (
            <select value={classFilter} onChange={(e) => setClassFilter(e.target.value)} className="py-2.5 px-3 text-xs font-semibold rounded-xl outline-none shadow-sm border border-slate-200 bg-white" style={{ color: '#2C2C3E', minWidth: 95 }}>
              <option value="all">All Classes</option>
              {CLASS_SECTIONS.map((c) => <option key={c} value={c}>{gradeFilter} {c}</option>)}
            </select>
          )}
          {(gradeFilter === 'Grade 12' || gradeFilter === 'Grade 13') && (
            <select value={streamFilter} onChange={(e) => setStreamFilter(e.target.value)} className="py-2.5 px-3 text-xs font-semibold rounded-xl outline-none shadow-sm border border-slate-200 bg-white" style={{ color: '#2C2C3E', minWidth: 110 }}>
              <option value="all">All Streams</option>
              {AL_STREAMS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          )}

          {/* Action Buttons */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Add Member Button */}
            <button
              onClick={openAddModal}
              className="px-3.5 py-2.5 bg-[#9E0D0D] hover:bg-[#7F0A0A] text-white rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all shadow-md shadow-red-900/10 cursor-pointer active:scale-95 whitespace-nowrap"
            >
              <span className="material-symbols-outlined text-base">person_add</span>
              + New Member
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="pt-2 lg:pt-16 pb-4 space-y-4">
        {/* Member Stats Cards (Interactive Filters) */}
        {!loading && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 select-none">
            {/* Total Members */}
            <div 
              onClick={() => {
                setRoleFilter('all');
                setStatusFilter('all');
                setGradeFilter('all');
                setClassFilter('all');
                setStreamFilter('all');
                setCurrentPage(1);
              }}
              className={`bg-white rounded-2xl p-4 border border-l-4 border-l-indigo-500 flex items-center justify-between transition-all cursor-pointer hover:shadow-md hover:-translate-y-0.5 active:scale-98 ${
                roleFilter === 'all' && statusFilter === 'all' && gradeFilter === 'all'
                  ? 'border-indigo-200 ring-2 ring-indigo-500/20 bg-indigo-50/15 shadow-sm'
                  : 'border-slate-100/90 shadow-xs'
              }`}
              title="Click to view all members"
            >
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-indigo-900 block mb-0.5">
                  TOTAL MEMBERS
                </span>
                <span className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight block leading-tight">
                  {members.length}
                </span>
              </div>
              <div className="w-10 h-10 rounded-full border border-indigo-100 bg-indigo-50/60 flex items-center justify-center flex-shrink-0 shadow-2xs">
                <span className="material-symbols-outlined text-indigo-700 text-xl">group</span>
              </div>
            </div>

            {/* Students */}
            <div 
              onClick={() => {
                setRoleFilter(roleFilter === 'student' ? 'all' : 'student');
                setStatusFilter('all');
                setGradeFilter('all');
                setCurrentPage(1);
              }}
              className={`bg-white rounded-2xl p-4 border border-l-4 border-l-blue-500 flex items-center justify-between transition-all cursor-pointer hover:shadow-md hover:-translate-y-0.5 active:scale-98 ${
                roleFilter === 'student'
                  ? 'border-blue-200 ring-2 ring-blue-500/20 bg-blue-50/15 shadow-sm'
                  : 'border-slate-100/90 shadow-xs'
              }`}
              title="Click to filter students only"
            >
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-blue-900 block mb-0.5">
                  STUDENTS
                </span>
                <span className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight block leading-tight">
                  {members.filter(m => m.role === 'student').length}
                </span>
              </div>
              <div className="w-10 h-10 rounded-full border border-blue-100 bg-blue-50/60 flex items-center justify-center flex-shrink-0 shadow-2xs">
                <span className="material-symbols-outlined text-blue-700 text-xl">school</span>
              </div>
            </div>

            {/* Teachers */}
            <div 
              onClick={() => {
                setRoleFilter(roleFilter === 'teacher' ? 'all' : 'teacher');
                setStatusFilter('all');
                setGradeFilter('all');
                setCurrentPage(1);
              }}
              className={`bg-white rounded-2xl p-4 border border-l-4 border-l-emerald-500 flex items-center justify-between transition-all cursor-pointer hover:shadow-md hover:-translate-y-0.5 active:scale-98 ${
                roleFilter === 'teacher'
                  ? 'border-emerald-200 ring-2 ring-emerald-500/20 bg-emerald-50/15 shadow-sm'
                  : 'border-slate-100/90 shadow-xs'
              }`}
              title="Click to filter teachers only"
            >
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-emerald-900 block mb-0.5">
                  TEACHERS
                </span>
                <span className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight block leading-tight">
                  {members.filter(m => m.role === 'teacher').length}
                </span>
              </div>
              <div className="w-10 h-10 rounded-full border border-emerald-100 bg-emerald-50/60 flex items-center justify-center flex-shrink-0 shadow-2xs">
                <span className="material-symbols-outlined text-emerald-700 text-xl">badge</span>
              </div>
            </div>

            {/* Active Accounts */}
            <div 
              onClick={() => {
                setStatusFilter(statusFilter === 'active' ? 'all' : 'active');
                setRoleFilter('all');
                setGradeFilter('all');
                setCurrentPage(1);
              }}
              className={`bg-white rounded-2xl p-4 border border-l-4 border-l-teal-500 flex items-center justify-between transition-all cursor-pointer hover:shadow-md hover:-translate-y-0.5 active:scale-98 ${
                statusFilter === 'active'
                  ? 'border-teal-200 ring-2 ring-teal-500/20 bg-teal-50/15 shadow-sm'
                  : 'border-slate-100/90 shadow-xs'
              }`}
              title="Click to filter active accounts"
            >
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-teal-900 block mb-0.5">
                  ACTIVE ACCOUNTS
                </span>
                <span className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight block leading-tight">
                  {members.filter(m => m.status === 'active').length}
                </span>
              </div>
              <div className="w-10 h-10 rounded-full border border-teal-100 bg-teal-50/60 flex items-center justify-center flex-shrink-0 shadow-2xs">
                <span className="material-symbols-outlined text-teal-700 text-xl">how_to_reg</span>
              </div>
            </div>
          </div>
        )}

        <div className="rounded-xl border overflow-hidden shadow-sm" style={{ backgroundColor: '#fff', borderColor: '#f0f0f0' }}>
          <MemberTable
            loading={loading}
            filtered={filtered}
            currentPage={currentPage}
            setCurrentPage={setCurrentPage}
            itemsPerPage={itemsPerPage}
            setItemsPerPage={setItemsPerPage}
            openEdit={openEdit}
            openHistory={openHistory}
            handleDelete={handleDelete}
            handleStatusToggle={handleStatusToggle}
            actionLoading={actionLoading}
            ROLES={ROLES}
          />
        </div>
      </div>

      {/* Modals Container */}
      <MemberModals
        modal={modal}
        selected={selected}
        form={form}
        setForm={setForm}
        addForm={addForm}
        setAddForm={setAddForm}
        handleAddMember={handleAddMember}
        saving={saving}
        error={error}
        handleSave={handleSave}
        setModal={setModal}
        historyLoading={historyLoading}
        historyData={historyData}
        setHistoryData={setHistoryData}
        onImportComplete={(importedUsers) => {
          fetchMembers();
          showToast(`Imported ${importedUsers.length} members successfully!`, 'success');
        }}
        showToast={showToast}
        ROLES={ROLES}
        GRADES={GRADES}
        CLASS_SECTIONS={CLASS_SECTIONS}
        AL_STREAMS={AL_STREAMS}
      />

      {/* Custom Delete Confirmation Modal */}
      {deleteConfirmMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" onClick={() => setDeleteConfirmMember(null)}></div>
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-sm w-full overflow-hidden relative z-10 p-6 flex flex-col animate-[toast-enter_0.3s_cubic-bezier(0.16,1,0.3,1)_forwards]">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-3">
              <span className="material-symbols-outlined text-2xl">delete_forever</span>
            </div>
            <h3 className="text-base font-bold text-slate-800 text-center mb-1">Delete Member?</h3>
            <p className="text-xs text-slate-500 text-center mb-5">
              Are you sure you want to permanently delete <strong className="text-slate-800">{deleteConfirmMember.name}</strong> ({deleteConfirmMember.memberId || deleteConfirmMember.email})?
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={executeDelete}
                disabled={actionLoading}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all shadow-md shadow-rose-900/10 active:scale-95 cursor-pointer disabled:opacity-50"
              >
                {actionLoading ? 'Deleting...' : 'Yes, Delete'}
              </button>
              <button
                type="button"
                onClick={() => setDeleteConfirmMember(null)}
                disabled={actionLoading}
                className="flex-1 py-2.5 border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed top-3 left-0 lg:left-64 right-0 z-[9999] flex justify-center pointer-events-none">
          <style>{`
            @keyframes toast-enter {
              from { transform: translateY(-15px); opacity: 0; }
              to { transform: translateY(0); opacity: 1; }
            }
            .toast-popup {
              animation: toast-enter 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
            }
          `}</style>
          <div className={`toast-popup pointer-events-auto flex items-center gap-2.5 px-4 py-2 rounded-xl text-white shadow-lg border ${
            toast.type === 'error'
              ? 'bg-amber-600 border-amber-500/50'
              : toast.type === 'delete' 
                ? 'bg-rose-600 border-rose-500/50' 
                : 'bg-emerald-600 border-emerald-500/50'
          }`}>
            <span className="material-symbols-outlined text-white font-bold" style={{ fontSize: 18 }}>
              {toast.type === 'error' ? 'warning' : toast.type === 'delete' ? 'delete_forever' : 'check_circle'}
            </span>
            <span className="text-xs font-bold">{toast.message}</span>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
