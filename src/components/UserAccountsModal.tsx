import React, { useState } from 'react';
import { Key, User, Plus, Search, Check, Copy, X, Shield, ShieldAlert, CheckCircle2, AlertCircle, Trash2, Power, Eye, EyeOff, Smartphone, RotateCcw, Edit3, Lock } from 'lucide-react';
import { UserAccount, UserRole, CurrentUser } from '../types/pdks';
import { pdksStorage, slugifyNameToUsername, normalizeUsername } from '../services/storage';

interface UserAccountsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: CurrentUser;
  onAccountsUpdated: () => void;
  initialSelectedEmpId?: string;
}

export const UserAccountsModal: React.FC<UserAccountsModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onAccountsUpdated,
  initialSelectedEmpId,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'list' | 'create'>('list');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRole, setSelectedRole] = useState<string>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Form State for creating new account
  const [formEmployeeId, setFormEmployeeId] = useState<string>(initialSelectedEmpId || '');
  const [formUsername, setFormUsername] = useState<string>('');
  const [formPassword, setFormPassword] = useState<string>('123456');
  const [formRole, setFormRole] = useState<UserRole>('personel');
  const [formCanCheckInOut, setFormCanCheckInOut] = useState<boolean>(true);
  const [formCanTakeBreak, setFormCanTakeBreak] = useState<boolean>(true);
  const [formCanRequestLeave, setFormCanRequestLeave] = useState<boolean>(true);
  const [formCanViewOwnStats, setFormCanViewOwnStats] = useState<boolean>(true);

  // Credentials edit state (Username and Password)
  const [editingAccId, setEditingAccId] = useState<string | null>(null);
  const [editUsernameValue, setEditUsernameValue] = useState<string>('');
  const [editingPasswordAccId, setEditingPasswordAccId] = useState<string | null>(null);
  const [newPasswordValue, setNewPasswordValue] = useState<string>('');
  const [revealedPasswordAccIds, setRevealedPasswordAccIds] = useState<Set<string>>(new Set());
  const [confirmDeleteAccId, setConfirmDeleteAccId] = useState<string | null>(null);
  const [isDeletingAcc, setIsDeletingAcc] = useState(false);
  const [companyName, setCompanyName] = useState<string>(() => pdksStorage.getCompanyName());

  React.useEffect(() => {
    const syncName = (e?: any) => {
      if (e?.detail && typeof e.detail === 'string') setCompanyName(e.detail);
      else setCompanyName(pdksStorage.getCompanyName());
    };
    window.addEventListener('pdks-company-name-updated', syncName);
    window.addEventListener('pdks-data-synced', syncName);
    return () => {
      window.removeEventListener('pdks-company-name-updated', syncName);
      window.removeEventListener('pdks-data-synced', syncName);
    };
  }, []);

  const togglePasswordVisibility = (id: string) => {
    setRevealedPasswordAccIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (!isOpen) return null;

  const accounts = pdksStorage.getUserAccounts();
  const employees = pdksStorage.getEmployees();
  const canManage = pdksStorage.canCreateUserAccount(currentUser);
  const isSuperAdmin = pdksStorage.isSuperAdmin(currentUser);

  // Auto populate username when employee is selected
  const handleSelectEmployee = (empId: string) => {
    setFormEmployeeId(empId);
    const emp = employees.find((e) => e.id === empId);
    if (emp) {
      // Create clean, Turkish-normalized username, e.g. "Örnek Personel 1" -> "ornek.personel.1"
      const suggested = slugifyNameToUsername(emp.fullName);
      setFormUsername(suggested);
    }
  };

  const handleCreateAccount = (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    if (!formEmployeeId) {
      setFeedback({ type: 'error', message: 'Lütfen bir personel seçiniz.' });
      return;
    }
    const cleanUser = normalizeUsername(formUsername) || formUsername.trim().replace(/^@+/, '');
    if (!cleanUser) {
      setFeedback({ type: 'error', message: 'Kullanıcı adı boş bırakılamaz.' });
      return;
    }
    const cleanPass = formPassword.trim();
    if (!cleanPass) {
      setFeedback({ type: 'error', message: 'Şifre boş bırakılamaz.' });
      return;
    }

    const res = pdksStorage.createUserAccount({
      employeeId: formEmployeeId,
      username: cleanUser,
      password: cleanPass,
      role: formRole,
      canCheckInOut: formCanCheckInOut,
      canTakeBreak: formCanTakeBreak,
      canRequestLeave: formCanRequestLeave,
      canViewOwnStats: formCanViewOwnStats,
    });

    if (res.success) {
      setFeedback({ type: 'success', message: res.message });
      onAccountsUpdated();
      setActiveSubTab('list');
      setFormEmployeeId('');
      setFormUsername('');
      setFormPassword('123456');
    } else {
      setFeedback({ type: 'error', message: res.message });
    }
  };

  const handleCopyCredentials = (acc: UserAccount) => {
    const text = `${companyName} · PDKS Giriş Bilgileri\nKullanıcı Adı: ${acc.username}\nŞifre: ${acc.password}\nRol: ${
      acc.role === 'personel' ? 'Personel (Kısıtlı Yetki)' : acc.role
    }\nGiriş URL: ${window.location.origin}`;

    navigator.clipboard.writeText(text);
    setCopiedId(acc.id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  const handleToggleStatus = (accId: string) => {
    const res = pdksStorage.toggleUserAccountStatus(accId);
    if (res.success) {
      onAccountsUpdated();
      setFeedback({
        type: 'success',
        message: `Hesap durumu ${res.isActive ? 'Aktif' : 'Pasif'} olarak güncellendi.`,
      });
      setTimeout(() => setFeedback(null), 3000);
    }
  };

  const handleDelete = async (acc: UserAccount) => {
    const check = pdksStorage.canDeleteTargetEmployee(currentUser, undefined, acc);
    if (!check.allowed) {
      setFeedback({
        type: 'error',
        message: check.reason || 'Bu yönetici hesabını silme yetkiniz bulunmamaktadır.',
      });
      setConfirmDeleteAccId(null);
      setTimeout(() => setFeedback(null), 4000);
      return;
    }
    setIsDeletingAcc(true);
    try {
      const res = await pdksStorage.archiveUserAccountAsync(acc.id);
      if (res.success) {
        onAccountsUpdated();
        setFeedback({ type: 'success', message: res.message });
      } else {
        setFeedback({ type: 'error', message: res.message });
      }
    } finally {
      setIsDeletingAcc(false);
      setConfirmDeleteAccId(null);
      setTimeout(() => setFeedback(null), 4000);
    }
  };

  const handleStartEdit = (acc: UserAccount) => {
    setEditingAccId(acc.id);
    setEditUsernameValue(acc.username);
  };

  const handleSaveUsernameOnly = async (accId: string) => {
    const trimmed = editUsernameValue.trim().replace(/^@+/, '');
    if (!trimmed) {
      setFeedback({ type: 'error', message: 'Kullanıcı adı boş bırakılamaz.' });
      return;
    }
    const res = await pdksStorage.updateUsernameSuperAdmin(accId, trimmed);
    if (res.success) {
      setFeedback({ type: 'success', message: res.message });
      setEditingAccId(null);
      setEditUsernameValue('');
      onAccountsUpdated();
      setTimeout(() => setFeedback(null), 3500);
    } else {
      setFeedback({ type: 'error', message: res.message });
    }
  };

  const handleSaveNewPassword = (accId: string) => {
    if (!newPasswordValue.trim()) {
      setFeedback({ type: 'error', message: 'Şifre boş bırakılamaz.' });
      return;
    }
    const target = accounts.find((a) => a.id === accId);
    if (!target) return;
    const res = pdksStorage.updateUserCredentials(
      accId,
      target.username,
      newPasswordValue.trim()
    );
    if (res.success) {
      setFeedback({ type: 'success', message: 'Şifre başarıyla güncellendi.' });
      setEditingPasswordAccId(null);
      setNewPasswordValue('');
      onAccountsUpdated();
      setTimeout(() => setFeedback(null), 3000);
    } else {
      setFeedback({ type: 'error', message: res.message });
    }
  };

  const handleResetAccountDevice = (acc: UserAccount) => {
    const res = pdksStorage.resetEmployeeRegisteredDevice(acc.employeeId, currentUser.name);
    if (res.success) {
      onAccountsUpdated();
      setFeedback({ type: 'success', message: res.message });
      setTimeout(() => setFeedback(null), 4000);
    } else {
      setFeedback({ type: 'error', message: res.message });
    }
  };

  const filteredAccounts = accounts.filter((acc) => {
    const matchesSearch =
      acc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      acc.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      acc.employeeId.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = selectedRole === 'all' || acc.role === selectedRole;
    return matchesSearch && matchesRole;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
      <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />

      <div className="relative bg-white w-full max-w-4xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden z-10 flex flex-col max-h-[94vh]">
        {/* Header */}
        <div className="p-4 sm:p-6 bg-linear-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-md shrink-0">
              <Key className="w-5 h-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
                  Kullanıcı Hesapları & Yetki Yönetimi
                </h2>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-500/30 text-indigo-200 border border-indigo-400/30">
                  {accounts.length} Kayıtlı Hesap
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-indigo-200">
                Personellere kullanıcı adı & şifreli kısıtlı giriş hesapları oluşturun ve yönetin
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
            title="Kapat"
            aria-label="Kapat"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Sub Navigation Bar */}
        <div className="bg-slate-100 border-b border-slate-200 px-4 sm:px-6 py-2.5 flex items-center justify-between gap-4 overflow-x-auto scrollbar-none">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveSubTab('list')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer ${
                activeSubTab === 'list'
                  ? 'bg-white dark:bg-indigo-600 text-indigo-700 dark:text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
              }`}
            >
              <User className="w-3.5 h-3.5" />
              <span>Tüm Kullanıcı Hesapları ({accounts.length})</span>
            </button>

            {canManage && (
              <button
                onClick={() => {
                  setActiveSubTab('create');
                  if (initialSelectedEmpId) handleSelectEmployee(initialSelectedEmpId);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer ${
                  activeSubTab === 'create'
                    ? 'bg-white dark:bg-indigo-600 text-indigo-700 dark:text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                }`}
              >
                <Plus className={`w-3.5 h-3.5 ${activeSubTab === 'create' ? 'text-indigo-600 dark:text-white' : 'text-indigo-600'}`} />
                <span>Yeni Personel Hesabı Aç</span>
              </button>
            )}
          </div>

          {!canManage && (
            <span className="text-[11px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200 flex items-center gap-1">
              <ShieldAlert className="w-3.5 h-3.5" />
              Hesap oluşturma ve silme yalnızca İK Yöneticisi yetkisindedir.
            </span>
          )}
        </div>

        {/* Feedback Alert */}
        {feedback && (
          <div
            className={`mx-6 mt-4 p-3 rounded-xl border text-xs flex items-center justify-between ${
              feedback.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-rose-50 border-rose-200 text-rose-800'
            }`}
          >
            <div className="flex items-center gap-2">
              {feedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              )}
              <span className="font-medium">{feedback.message}</span>
            </div>
            <button
              onClick={() => setFeedback(null)}
              className="text-slate-400 hover:text-slate-600 text-xs"
            >
              ✕
            </button>
          </div>
        )}

        {/* Main Content */}
        <div className="p-3.5 sm:p-6 overflow-y-auto flex-1 space-y-4">
          {activeSubTab === 'list' && (
            <>
              {/* Search & Filter Toolbar */}
              <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
                <div className="relative w-full sm:w-72">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="İsim, kullanıcı adı veya sicil ara..."
                    className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <select
                    value={selectedRole}
                    onChange={(e) => setSelectedRole(e.target.value)}
                    className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-white"
                  >
                    <option value="all">Tüm Roller</option>
                    <option value="personel">Personel (Kısıtlı)</option>
                    <option value="yonetici">Birim Yöneticisi</option>
                    <option value="ik_yoneticisi">İK Yöneticisi</option>
                    <option value="guvenlik">Güvenlik / Turnike</option>
                  </select>

                  {canManage && (
                    <button
                      onClick={() => setActiveSubTab('create')}
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Hesap Ekle</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Mobile User Accounts Card View (md:hidden) */}
              <div className="md:hidden divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-white shadow-xs">
                {filteredAccounts.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 text-xs">
                    Kriterlere uygun kullanıcı hesabı bulunamadı.
                  </div>
                ) : (
                  filteredAccounts.map((acc) => {
                    const isEditingPassword = editingPasswordAccId === acc.id;

                    return (
                      <div key={acc.id} className="p-3.5 space-y-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2.5">
                            <img
                              src={acc.avatar}
                              alt={acc.name}
                              className="w-9 h-9 rounded-full object-cover border border-slate-200 shrink-0"
                              referrerPolicy="no-referrer"
                            />
                            <div>
                              <div className="font-bold text-xs text-slate-900">{acc.name}</div>
                              <div className="text-[10px] text-slate-500">{acc.title} · {acc.department}</div>
                            </div>
                          </div>
                          <span
                            className={`inline-block w-2.5 h-2.5 rounded-full ${
                              acc.isActive ? 'bg-emerald-500' : 'bg-slate-300'
                            }`}
                            title={acc.isActive ? 'Aktif' : 'Pasif'}
                          />
                        </div>

                        {/* Username & Password */}
                        <div className="flex flex-wrap items-center justify-between gap-2 p-2 bg-slate-50 rounded-lg text-xs font-mono">
                          {isSuperAdmin && editingAccId === acc.id ? (
                            <div className="flex items-center gap-1">
                              <span className="text-indigo-600 font-bold">@</span>
                              <input
                                type="text"
                                value={editUsernameValue}
                                onChange={(e) => setEditUsernameValue(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    void handleSaveUsernameOnly(acc.id);
                                  } else if (e.key === 'Escape') {
                                    setEditingAccId(null);
                                  }
                                }}
                                className="w-28 px-1.5 py-0.5 border border-indigo-400 rounded text-xs bg-white text-slate-900"
                                placeholder="Kullanıcı adı"
                                autoFocus
                              />
                              <button
                                type="button"
                                onClick={() => void handleSaveUsernameOnly(acc.id)}
                                className="p-1 bg-emerald-600 text-white rounded hover:bg-emerald-700 cursor-pointer"
                                title="Kaydet"
                              >
                                <Check className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingAccId(null)}
                                className="p-1 bg-slate-200 text-slate-700 rounded hover:bg-slate-300 cursor-pointer"
                                title="İptal"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 text-indigo-700 font-bold">
                              <span>@{acc.username}</span>
                              {isSuperAdmin && (
                                <button
                                  type="button"
                                  onClick={() => handleStartEdit(acc)}
                                  className="p-0.5 text-indigo-500 hover:text-indigo-800 rounded transition-colors cursor-pointer"
                                  title="Kullanıcı Adını Değiştir (Süper Yönetici)"
                                >
                                  <Edit3 className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          )}

                          {isEditingPassword ? (
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                value={newPasswordValue}
                                onChange={(e) => setNewPasswordValue(e.target.value)}
                                className="w-24 px-1.5 py-0.5 border border-indigo-400 rounded text-xs bg-white"
                                placeholder="Yeni şifre"
                                autoFocus
                              />
                              <button
                                onClick={() => handleSaveNewPassword(acc.id)}
                                className="p-1 bg-emerald-600 text-white rounded hover:bg-emerald-700"
                                title="Kaydet"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => setEditingPasswordAccId(null)}
                                className="p-1 bg-slate-200 text-slate-700 rounded hover:bg-slate-300"
                                title="İptal"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <span className="bg-white px-2 py-0.5 rounded text-slate-800 font-bold border border-slate-200 tracking-wider font-mono text-xs">
                                {revealedPasswordAccIds.has(acc.id) ? acc.password : '••••••••'}
                              </span>
                              <button
                                type="button"
                                onClick={() => togglePasswordVisibility(acc.id)}
                                className="p-1 text-slate-400 hover:text-slate-600 rounded transition-colors"
                                title={revealedPasswordAccIds.has(acc.id) ? 'Şifreyi Gizle' : 'Şifreyi Göster'}
                              >
                                {revealedPasswordAccIds.has(acc.id) ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                              </button>
                              {canManage && (
                                <button
                                  onClick={() => {
                                    setEditingPasswordAccId(acc.id);
                                    setNewPasswordValue(acc.password);
                                  }}
                                  className="text-[10px] text-indigo-600 hover:text-indigo-800 font-sans font-semibold underline ml-0.5"
                                >
                                  Değiştir
                                </button>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Registered & Last Login Device Info */}
                        {(acc.registeredDeviceName || acc.registeredMacAddress || acc.registeredDeviceId) && (
                          <div className="p-2 bg-slate-50 rounded-lg border border-slate-200/80 text-[10px] space-y-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className="inline-flex items-center gap-1 font-semibold text-slate-700 truncate">
                                <Smartphone className="w-3 h-3 text-indigo-500 shrink-0" />
                                <span className="truncate">{acc.registeredDeviceName || 'Kayıtlı Cihaz'}</span>
                              </span>
                              {canManage && (
                                <button
                                  type="button"
                                  onClick={() => handleResetAccountDevice(acc)}
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-white hover:bg-rose-50 text-slate-600 hover:text-rose-700 border border-slate-200 hover:border-rose-200 text-[10px] font-semibold cursor-pointer shrink-0"
                                >
                                  <RotateCcw className="w-2.5 h-2.5" />
                                  <span>Cihazı Sıfırla</span>
                                </button>
                              )}
                            </div>
                            <div className="font-mono text-slate-500 flex flex-wrap gap-x-2">
                              {acc.registeredMacAddress && <span>MAC: <strong className="text-slate-700">{acc.registeredMacAddress}</strong></span>}
                              {acc.registeredDeviceId && <span>ID: <strong className="text-slate-700">{acc.registeredDeviceId}</strong></span>}
                            </div>
                            {(acc.lastLoginDeviceName || acc.lastLoginMacAddress) && (
                              <div className="text-[9px] font-mono text-slate-400">
                                Son Giriş: {acc.lastLoginDeviceName || '-'} {acc.lastLoginMacAddress ? `(${acc.lastLoginMacAddress})` : ''}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Role & Permissions Badge */}
                        <div className="flex flex-wrap items-center justify-between gap-1.5 text-[10px]">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-semibold border ${
                              acc.role === 'ik_yoneticisi'
                                ? 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-500/15 dark:text-purple-300 dark:border-purple-500/30'
                                : acc.role === 'birim_amiri' || acc.role === 'yonetici'
                                ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/30'
                                : acc.role === 'personel'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30'
                                : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30'
                            }`}
                          >
                            {acc.role === 'ik_yoneticisi' && 'İK Yöneticisi'}
                            {(acc.role === 'birim_amiri' || acc.role === 'yonetici') && 'Birim Amiri'}
                            {acc.role === 'personel' && 'Personel (Kısıtlı)'}
                            {acc.role === 'guvenlik' && 'Güvenlik'}
                          </span>

                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleCopyCredentials(acc)}
                              className={`px-2 py-1 rounded text-[11px] font-medium border flex items-center gap-1 ${
                                copiedId === acc.id
                                  ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                              }`}
                            >
                              {copiedId === acc.id ? (
                                <>
                                  <Check className="w-3 h-3 text-emerald-600" />
                                  <span>Kopyalandı</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3 text-slate-500" />
                                  <span>Paylaş</span>
                                </>
                              )}
                            </button>

                            {canManage && (() => {
                              const delCheck = pdksStorage.canDeleteTargetEmployee(currentUser, undefined, acc);
                              return (
                                <>
                                  <button
                                    onClick={() => handleToggleStatus(acc.id)}
                                    className="p-1 rounded text-slate-400 hover:text-amber-600 hover:bg-amber-50 border border-slate-200 cursor-pointer"
                                    title={acc.isActive ? 'Askıya Al' : 'Aktifleştir'}
                                  >
                                    <Power className="w-3.5 h-3.5" />
                                  </button>
                                  {delCheck.allowed ? (
                                    confirmDeleteAccId === acc.id ? (
                                      <div className="flex items-center gap-1">
                                        <button
                                          type="button"
                                          disabled={isDeletingAcc}
                                          onClick={() => void handleDelete(acc)}
                                          className="px-2 py-0.5 rounded bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-bold cursor-pointer disabled:opacity-50"
                                        >
                                          Onayla
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setConfirmDeleteAccId(null)}
                                          className="px-1.5 py-0.5 rounded bg-slate-200 text-slate-700 text-[10px] font-semibold cursor-pointer"
                                        >
                                          İptal
                                        </button>
                                      </div>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => setConfirmDeleteAccId(acc.id)}
                                        className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-slate-200 cursor-pointer"
                                        title="Hesabı Sil / Arşivle"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    )
                                  ) : (
                                    <span
                                      className="p-1 rounded text-slate-300 border border-slate-200/70 cursor-not-allowed"
                                      title={delCheck.reason}
                                    >
                                      <Lock className="w-3.5 h-3.5" />
                                    </span>
                                  )}
                                </>
                              );
                            })()}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Desktop Accounts Table (hidden md:block) */}
              <div className="hidden md:block border border-slate-200 rounded-xl overflow-x-auto bg-white shadow-xs">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold">
                      <th className="py-2.5 px-3">Personel</th>
                      <th className="py-2.5 px-3">Kullanıcı Adı</th>
                      <th className="py-2.5 px-3">Şifre</th>
                      <th className="py-2.5 px-3">Rol & Yetki Seviyesi</th>
                      <th className="py-2.5 px-3">Kayıtlı Cihaz (MAC / ID)</th>
                      <th className="py-2.5 px-3">İzinler (Giriş/Mola)</th>
                      <th className="py-2.5 px-3 text-center">Durum</th>
                      <th className="py-2.5 px-3 text-right">İşlemler</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredAccounts.map((acc) => {
                      const isRestricted = acc.role === 'personel';
                      const isEditingPassword = editingPasswordAccId === acc.id;

                      return (
                        <tr key={acc.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-2.5 px-3">
                            <div className="flex items-center gap-2.5">
                              <img
                                src={acc.avatar}
                                alt={acc.name}
                                className="w-7 h-7 rounded-full object-cover border border-slate-200 shrink-0"
                                referrerPolicy="no-referrer"
                              />
                              <div>
                                <div className="font-bold text-slate-900">{acc.name}</div>
                                <div className="text-[10px] text-slate-500">{acc.title} · {acc.department}</div>
                              </div>
                            </div>
                          </td>

                          <td className="py-2.5 px-3 font-mono font-semibold text-indigo-700">
                            {isSuperAdmin && editingAccId === acc.id ? (
                              <div className="flex items-center gap-1">
                                <span className="text-indigo-600">@</span>
                                <input
                                  type="text"
                                  value={editUsernameValue}
                                  onChange={(e) => setEditUsernameValue(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      void handleSaveUsernameOnly(acc.id);
                                    } else if (e.key === 'Escape') {
                                      setEditingAccId(null);
                                    }
                                  }}
                                  className="w-28 px-1.5 py-0.5 border border-indigo-400 rounded text-xs bg-white text-slate-900"
                                  placeholder="Kullanıcı adı"
                                  autoFocus
                                />
                                <button
                                  type="button"
                                  onClick={() => void handleSaveUsernameOnly(acc.id)}
                                  className="p-1 bg-emerald-600 text-white rounded hover:bg-emerald-700 cursor-pointer"
                                  title="Kaydet"
                                >
                                  <Check className="w-3 h-3" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingAccId(null)}
                                  className="p-1 bg-slate-200 text-slate-700 rounded hover:bg-slate-300 cursor-pointer"
                                  title="İptal"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5">
                                <span>@{acc.username}</span>
                                {isSuperAdmin && (
                                  <button
                                    type="button"
                                    onClick={() => handleStartEdit(acc)}
                                    className="p-1 text-slate-400 hover:text-indigo-700 rounded transition-colors cursor-pointer"
                                    title="Kullanıcı Adını Değiştir (Süper Yönetici)"
                                  >
                                    <Edit3 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            )}
                          </td>

                          <td className="py-2.5 px-3 font-mono">
                            {isEditingPassword ? (
                              <div className="flex items-center gap-1">
                                <input
                                  type="text"
                                  value={newPasswordValue}
                                  onChange={(e) => setNewPasswordValue(e.target.value)}
                                  className="w-20 px-1.5 py-0.5 border border-indigo-400 rounded text-xs bg-white"
                                  placeholder="Yeni şifre"
                                  autoFocus
                                />
                                <button
                                  onClick={() => handleSaveNewPassword(acc.id)}
                                  className="p-1 bg-emerald-600 text-white rounded hover:bg-emerald-700"
                                  title="Kaydet"
                                >
                                  <Check className="w-3 h-3" />
                                </button>
                                <button
                                  onClick={() => setEditingPasswordAccId(null)}
                                  className="p-1 bg-slate-200 text-slate-700 rounded hover:bg-slate-300"
                                  title="İptal"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5">
                                <span className="bg-slate-100 px-2 py-0.5 rounded text-slate-700 font-bold tracking-wider font-mono text-xs">
                                  {revealedPasswordAccIds.has(acc.id) ? acc.password : '••••••••'}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => togglePasswordVisibility(acc.id)}
                                  className="p-1 text-slate-400 hover:text-slate-600 rounded transition-colors"
                                  title={revealedPasswordAccIds.has(acc.id) ? 'Şifreyi Gizle' : 'Şifreyi Göster'}
                                >
                                  {revealedPasswordAccIds.has(acc.id) ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                </button>
                                {canManage && (
                                  <button
                                    onClick={() => {
                                      setEditingPasswordAccId(acc.id);
                                      setNewPasswordValue(acc.password);
                                    }}
                                    className="text-[10px] text-indigo-600 hover:text-indigo-800 underline ml-0.5"
                                    title="Şifreyi Değiştir"
                                  >
                                    Değiştir
                                  </button>
                                )}
                              </div>
                            )}
                          </td>

                          <td className="py-2.5 px-3">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                                acc.role === 'ik_yoneticisi'
                                  ? 'bg-purple-50 text-purple-700 border-purple-200'
                                  : acc.role === 'birim_amiri'
                                  ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                                  : acc.role === 'yonetici'
                                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                                  : acc.role === 'personel'
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : 'bg-amber-50 text-amber-700 border-amber-200'
                              }`}
                            >
                              {acc.role === 'ik_yoneticisi' && 'İK Yöneticisi (Tam Yetki)'}
                              {acc.role === 'birim_amiri' && 'Birim Amiri (Vardiya Yetkili)'}
                              {acc.role === 'yonetici' && 'Birim Yöneticisi'}
                              {acc.role === 'personel' && 'Personel (Kısıtlı Yetki)'}
                              {acc.role === 'guvenlik' && 'Güvenlik / Turnike'}
                            </span>
                          </td>

                          <td className="py-2.5 px-3">
                            {acc.registeredDeviceName || acc.registeredMacAddress || acc.registeredDeviceId ? (
                              <div className="space-y-0.5 max-w-[200px]">
                                <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-800 truncate">
                                  <Smartphone className="w-3 h-3 text-indigo-500 shrink-0" />
                                  <span className="truncate">{acc.registeredDeviceName || 'Kayıtlı Cihaz'}</span>
                                </div>
                                <div className="font-mono text-[9px] text-slate-500 leading-tight">
                                  {acc.registeredMacAddress && <div>MAC: {acc.registeredMacAddress}</div>}
                                  {acc.registeredDeviceId && <div>ID: {acc.registeredDeviceId}</div>}
                                  {(acc.lastLoginDeviceName || acc.lastLoginMacAddress) && (
                                    <div className="text-slate-400">
                                      Son: {acc.lastLoginMacAddress || acc.lastLoginDeviceName}
                                    </div>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <span className="text-[10px] text-slate-400">Henüz tanımlı değil</span>
                            )}
                          </td>

                          <td className="py-2.5 px-3">
                            <div className="flex flex-wrap items-center gap-1 text-[10px]">
                              {acc.canCheckInOut && (
                                <span className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded border border-slate-200" title="Giriş / Çıkış Yapabilir">
                                  Giriş/Çıkış
                                </span>
                              )}
                              {acc.canTakeBreak && (
                                <span className="bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded border border-amber-200" title="Mola Başlatabilir">
                                  Mola
                                </span>
                              )}
                              {acc.canRequestLeave && (
                                <span className="bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded border border-indigo-200" title="İzin Talebi İletebilir">
                                  İzin
                                </span>
                              )}
                              {isRestricted && (
                                <span className="bg-rose-50 text-rose-600 px-1.5 py-0.5 rounded border border-rose-200 font-medium" title="Yönetim Menüleri Kısıtlıdır">
                                  Yönetim Kısıtlı
                                </span>
                              )}
                            </div>
                          </td>

                          <td className="py-2.5 px-3 text-center">
                            <span
                              className={`inline-block w-2.5 h-2.5 rounded-full ${
                                acc.isActive ? 'bg-emerald-500' : 'bg-slate-300'
                              }`}
                              title={acc.isActive ? 'Aktif Hesap' : 'Pasif Hesap'}
                            />
                          </td>

                          <td className="py-2.5 px-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Copy credentials */}
                              <button
                                onClick={() => handleCopyCredentials(acc)}
                                className={`px-2 py-1 rounded text-[11px] font-medium border flex items-center gap-1 transition-colors ${
                                  copiedId === acc.id
                                    ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                                }`}
                                title="Kullanıcı Giriş Bilgilerini Kopyala"
                              >
                                {copiedId === acc.id ? (
                                  <>
                                    <Check className="w-3 h-3 text-emerald-600" />
                                    <span>Kopyalandı</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-3 h-3 text-slate-500" />
                                    <span>Paylaş</span>
                                  </>
                                )}
                              </button>

                              {canManage && (() => {
                                const delCheck = pdksStorage.canDeleteTargetEmployee(currentUser, undefined, acc);
                                return (
                                  <>
                                    {(acc.registeredDeviceId || acc.registeredMacAddress) && (
                                      <button
                                        type="button"
                                        onClick={() => handleResetAccountDevice(acc)}
                                        className="p-1 rounded text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 cursor-pointer"
                                        title="Kayıtlı Cihazı Sıfırla"
                                      >
                                        <RotateCcw className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                    <button
                                      onClick={() => handleToggleStatus(acc.id)}
                                      className="p-1 rounded text-slate-400 hover:text-amber-600 hover:bg-amber-50 cursor-pointer"
                                      title={acc.isActive ? 'Hesabı Askıya Al' : 'Hesabı Aktifleştir'}
                                    >
                                      <Power className="w-3.5 h-3.5" />
                                    </button>

                                    {delCheck.allowed ? (
                                      confirmDeleteAccId === acc.id ? (
                                        <div className="flex items-center gap-1">
                                          <button
                                            type="button"
                                            disabled={isDeletingAcc}
                                            onClick={() => void handleDelete(acc)}
                                            className="px-2 py-0.5 rounded bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-bold cursor-pointer disabled:opacity-50"
                                          >
                                            Onayla
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => setConfirmDeleteAccId(null)}
                                            className="px-1.5 py-0.5 rounded bg-slate-200 text-slate-700 text-[10px] font-semibold cursor-pointer"
                                          >
                                            İptal
                                          </button>
                                        </div>
                                      ) : (
                                        <button
                                          type="button"
                                          onClick={() => setConfirmDeleteAccId(acc.id)}
                                          className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                                          title="Hesabı Sil / Arşivle"
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                      )
                                    ) : (
                                      <span
                                        className="p-1 rounded text-slate-300 cursor-not-allowed"
                                        title={delCheck.reason}
                                      >
                                        <Lock className="w-3.5 h-3.5" />
                                      </span>
                                    )}
                                  </>
                                );
                              })()}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Informative restricted roles callout */}
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-950 text-xs space-y-1.5">
                <div className="font-bold flex items-center gap-1.5">
                  <Shield className="w-4 h-4 text-emerald-600" />
                  <span>Kısıtlı Personel Hesapları Nasıl Çalışır?</span>
                </div>
                <p className="text-emerald-800 leading-relaxed text-[11px]">
                  Yönetici tarafından açılan <strong>Personel (Kısıtlı Yetki)</strong> hesapları kullanıcı adı ve şifreleri ile sisteme giriş yaptıklarında yalnızca kendilerine ait <strong>Mobil Kartım & Giriş/Çıkış Portalı</strong> ekranını görürler.
                  Bu ekrandan doğrudan <strong>Giriş Yap</strong>, <strong>Çıkış Yap</strong>, <strong>Mola Başlat / Bitir</strong> butonlarını kullanabilir, dijital QR kodlarını turnikeye okutabilir ve mazeret izni talep edebilirler. Yönetimsel ayarlar, diğer personellerin kayıtları veya raporlama modülleri kısıtlıdır.
                </p>
              </div>
            </>
          )}

          {activeSubTab === 'create' && (
            <form onSubmit={handleCreateAccount} className="space-y-5 max-w-2xl mx-auto">
              <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-xl text-xs text-indigo-900 flex items-start gap-2.5">
                <Key className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">Yeni Personel Hesabı Tanımlama</span>
                  <p className="text-[11px] text-indigo-700 mt-0.5">
                    Bir personel seçiniz, giriş yapabileceği kullanıcı adı ve şifreyi belirleyiniz. Hesap oluşturulduğunda kullanıcı bu bilgilerle {companyName} PDKS sistemine erişebilecektir.
                  </p>
                </div>
              </div>

              {/* Employee Selection */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Personel Seçin: *
                </label>
                <select
                  value={formEmployeeId}
                  onChange={(e) => handleSelectEmployee(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl bg-white focus:ring-2 focus:ring-indigo-500 font-medium"
                  required
                >
                  <option value="">-- Personel Seçiniz --</option>
                  {employees.map((emp) => {
                    const existingAcc = accounts.find((a) => a.employeeId === emp.id);
                    return (
                      <option key={emp.id} value={emp.id}>
                        {emp.fullName} ({emp.department} - {emp.title}) {existingAcc ? `[Mevcut Hesap: @${existingAcc.username}]` : '[Hesap Yok]'}
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Username & Password Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Kullanıcı Adı: *
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-slate-400 font-mono text-xs">@</span>
                    <input
                      type="text"
                      value={formUsername}
                      onChange={(e) => setFormUsername(e.target.value.replace(/^@+/, '').replace(/\s+/g, ''))}
                      placeholder="Örn: kullanici.adi"
                      className="w-full pl-7 pr-3 py-2 text-xs font-mono border border-slate-300 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500"
                      required
                    />
                  </div>
                  <span className="text-[10px] text-slate-400 mt-1 block">
                    Personelin sisteme giriş yaparken kullanacağı takma ad
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Giriş Şifresi: *
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={formPassword}
                      onChange={(e) => setFormPassword(e.target.value)}
                      placeholder="Şifre giriniz"
                      className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setFormPassword(Math.floor(100000 + Math.random() * 900000).toString())}
                      className="absolute right-2 top-2 text-[10px] bg-slate-200 hover:bg-slate-300 text-slate-700 px-1.5 py-0.5 rounded font-mono"
                      title="Rastgele 6 Haneli Şifre Üret"
                    >
                      Üret
                    </button>
                  </div>
                  <span className="text-[10px] text-slate-400 mt-1 block">
                    Varsayılan: 123456 veya üretilen şifre
                  </span>
                </div>
              </div>

              {/* Role Selection */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Hesap Rolü & Yetki Seviyesi:
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <label
                    className={`p-3 rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${
                      formRole === 'personel'
                        ? 'border-emerald-500 bg-emerald-50/60 ring-2 ring-emerald-500/20'
                        : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-slate-900">Personel (Kısıtlı)</span>
                      <input
                        type="radio"
                        name="formRole"
                        value="personel"
                        checked={formRole === 'personel'}
                        onChange={() => setFormRole('personel')}
                        className="text-emerald-600"
                      />
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Yalnızca Giriş/Çıkış, Mola, QR Kart ve kendi devam takibi.
                    </p>
                  </label>

                  <label
                    className={`p-3 rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${
                      formRole === 'birim_amiri'
                        ? 'border-indigo-500 bg-indigo-50/60 ring-2 ring-indigo-500/20'
                        : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-slate-900">Birim Amiri</span>
                      <input
                        type="radio"
                        name="formRole"
                        value="birim_amiri"
                        checked={formRole === 'birim_amiri'}
                        onChange={() => setFormRole('birim_amiri')}
                        className="text-indigo-600"
                      />
                    </div>
                    <p className="text-[11px] text-slate-500">
                      İK'nın yetkilendirdiği personellerin vardiyalarını planlayabilir.
                    </p>
                  </label>

                  <label
                    className={`p-3 rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${
                      formRole === 'yonetici'
                        ? 'border-blue-500 bg-blue-50/60 ring-2 ring-blue-500/20'
                        : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-slate-900">Birim Yöneticisi</span>
                      <input
                        type="radio"
                        name="formRole"
                        value="yonetici"
                        checked={formRole === 'yonetici'}
                        onChange={() => setFormRole('yonetici')}
                        className="text-blue-600"
                      />
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Departman performansı, izin onayları ve canlı pano izleme.
                    </p>
                  </label>

                  <label
                    className={`p-3 rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${
                      formRole === 'guvenlik'
                        ? 'border-amber-500 bg-amber-50/60 ring-2 ring-amber-500/20'
                        : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-slate-900">Güvenlik / Turnike</span>
                      <input
                        type="radio"
                        name="formRole"
                        value="guvenlik"
                        checked={formRole === 'guvenlik'}
                        onChange={() => setFormRole('guvenlik')}
                        className="text-amber-600"
                      />
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Kiosk terminalini işletme ve kapı geçişlerini kontrol etme.
                    </p>
                  </label>
                </div>
              </div>

              {/* Explicit Restricted Privileges Checklist */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
                <span className="text-xs font-bold text-slate-800 block">
                  Yetki & Kısıtlama Ayarları (Kullanıcı İzinleri):
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <label className="flex items-center gap-2 p-2 bg-white rounded-lg border border-slate-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formCanCheckInOut}
                      onChange={(e) => setFormCanCheckInOut(e.target.checked)}
                      className="rounded text-indigo-600"
                    />
                    <div>
                      <span className="font-semibold text-slate-800">Giriş / Çıkış Yapabilme</span>
                      <p className="text-[10px] text-slate-500">Turnikeden veya portaldan giriş-çıkış basabilir</p>
                    </div>
                  </label>

                  <label className="flex items-center gap-2 p-2 bg-white rounded-lg border border-slate-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formCanTakeBreak}
                      onChange={(e) => setFormCanTakeBreak(e.target.checked)}
                      className="rounded text-indigo-600"
                    />
                    <div>
                      <span className="font-semibold text-slate-800">Mola Başlatma & Bitirme</span>
                      <p className="text-[10px] text-slate-500">Öğle veya dinlenme molalarını kayıt altına alabilir</p>
                    </div>
                  </label>

                  <label className="flex items-center gap-2 p-2 bg-white rounded-lg border border-slate-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formCanRequestLeave}
                      onChange={(e) => setFormCanRequestLeave(e.target.checked)}
                      className="rounded text-indigo-600"
                    />
                    <div>
                      <span className="font-semibold text-slate-800">İzin Talebinde Bulunma</span>
                      <p className="text-[10px] text-slate-500">Mazeret, yıllık izin veya rapor başvurusu yapabilir</p>
                    </div>
                  </label>

                  <label className="flex items-center gap-2 p-2 bg-white rounded-lg border border-slate-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formCanViewOwnStats}
                      onChange={(e) => setFormCanViewOwnStats(e.target.checked)}
                      className="rounded text-indigo-600"
                    />
                    <div>
                      <span className="font-semibold text-slate-800">Kendi İstatistiklerini Görme</span>
                      <p className="text-[10px] text-slate-500">Kişisel devamlılık oranı ve mesai saatlerini izleyebilir</p>
                    </div>
                  </label>
                </div>

                <div className="pt-2 border-t border-slate-200 text-[10px] text-slate-500 flex items-center gap-1.5">
                  <ShieldAlert className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span>
                    <strong>Kısıtlı Tutulan Alanlar:</strong> Personel hesabı diğer personellerin kayıtlarını göremez, yeni kullanıcı ekleyemez/silemez, vardiya ayarlarını ve şirket raporlarını değiştiremez.
                  </span>
                </div>
              </div>

              {/* Form Buttons */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setActiveSubTab('list')}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-xl text-xs font-semibold hover:bg-slate-50"
                >
                  İptal
                </button>

                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-md flex items-center gap-2"
                >
                  <Key className="w-4 h-4" />
                  <span>Hesabı Oluştur & Aktif Et</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
