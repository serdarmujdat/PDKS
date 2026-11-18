import React, { useState, useEffect } from 'react';
import { Plus, Search, QrCode, Printer, Trash2, Edit2, Download, Check, X, Shield, Lock, ShieldAlert, Key, Camera, CheckCircle2, AlertCircle, Clock, MapPin, FileSpreadsheet, Smartphone, RotateCcw, Archive, History, Users, ArrowDownRight, ArrowUpRight, Coffee, FileText } from 'lucide-react';
import { Employee, Department, Shift, CurrentUser, UserAccount, PresenceStatus, DeviceEntryApproval, AttendanceRecord, UserRole } from '../types/pdks';
import { pdksStorage, slugifyNameToUsername, normalizeUsername, getTodayString } from '../services/storage';
import { generateQRDataURL } from '../utils/qr';
import { UserAccountsModal } from './UserAccountsModal';
import { ExcelEmployeeImportModal } from './ExcelEmployeeImportModal';

interface EmployeeManagementProps {
  currentUser?: CurrentUser;
  onOpenWallQR?: () => void;
}

export const EmployeeManagement: React.FC<EmployeeManagementProps> = ({ currentUser: propUser, onOpenWallQR }) => {
  const [currentUser, setCurrentUser] = useState<CurrentUser>(propUser || pdksStorage.getActiveUser());
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [accounts, setAccounts] = useState<UserAccount[]>([]);
  const [deviceApprovals, setDeviceApprovals] = useState<DeviceEntryApproval[]>([]);
  const [companyName, setCompanyName] = useState<string>(() => pdksStorage.getCompanyName());
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('all');

  // Dynamic Permission Checks
  const canCreate = pdksStorage.canCreateEmployee(currentUser);
  const canDelete = pdksStorage.canDeleteEmployee(currentUser);
  const canEdit = pdksStorage.canEditEmployee(currentUser);
  const canApprove = pdksStorage.canApproveRequests(currentUser);
  const canManageDevices = pdksStorage.canManageDevices(currentUser);
  const canManageAccounts = pdksStorage.canCreateUserAccount(currentUser);
  const canViewArchived = pdksStorage.canViewArchivedEmployees(currentUser);

  // Active vs Archived (Eski Personel) Read-Only View
  const [activeViewTab, setActiveViewTab] = useState<'active' | 'archived'>('active');
  const [archivedEmployees, setArchivedEmployees] = useState<Array<Employee & { formerRole?: UserRole; formerUsername?: string }>>([]);
  const [archivedRecords, setArchivedRecords] = useState<AttendanceRecord[]>([]);
  const [archivedLoading, setArchivedLoading] = useState(false);
  const [archivedAccessError, setArchivedAccessError] = useState<string | null>(null);
  const [archivedSearch, setArchivedSearch] = useState('');
  const [archivedDeptFilter, setArchivedDeptFilter] = useState<string>('all');
  const [selectedArchivedEmp, setSelectedArchivedEmp] = useState<(Employee & { formerRole?: UserRole; formerUsername?: string }) | null>(null);
  const [logTypeFilter, setLogTypeFilter] = useState<'all' | 'check_in' | 'check_out' | 'break_start' | 'break_end' | 'security_alert'>('all');
  const [logDateFilter, setLogDateFilter] = useState<string>('');

  // Soft-Delete Confirmation Modal state
  const [deleteTargetEmp, setDeleteTargetEmp] = useState<Employee | null>(null);
  const [isDeletingEmp, setIsDeletingEmp] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [badgeEmployee, setBadgeEmployee] = useState<Employee | null>(null);
  const [badgeQRUrl, setBadgeQRUrl] = useState<string>('');
  const [isAccountsModalOpen, setIsAccountsModalOpen] = useState(false);
  const [accountModalEmpId, setAccountModalEmpId] = useState<string | undefined>(undefined);
  const [isExcelModalOpen, setIsExcelModalOpen] = useState(false);

  // Profile Photo Management Modals (İK Onayı & Doğrudan Değiştirme)
  const [photoReviewEmp, setPhotoReviewEmp] = useState<Employee | null>(null);
  const [photoChangeEmp, setPhotoChangeEmp] = useState<Employee | null>(null);
  const [directPhotoInput, setDirectPhotoInput] = useState<string>('');
  const [photoNotice, setPhotoNotice] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // HR Manual Presence Override Modal (Kart Basmayı Unutan Personel)
  const [presenceEditEmp, setPresenceEditEmp] = useState<Employee | null>(null);
  const [presenceTarget, setPresenceTarget] = useState<PresenceStatus>('inside');
  const [presenceTime, setPresenceTime] = useState<string>('');
  const [presenceNote, setPresenceNote] = useState<string>('Kart basmayı unuttu');
  const [recordPresenceLog, setRecordPresenceLog] = useState<boolean>(true);

  // Form State
  const [formData, setFormData] = useState({
    fullName: '',
    tcNo: '',
    department: 'Yazılım & Ar-Ge' as Department,
    title: '',
    email: '',
    phone: '',
    shiftId: 'SHIFT-1',
    avatar: '',
  });

  // Account creation toggle inside New Employee Modal
  const [createAccountWithEmp, setCreateAccountWithEmp] = useState(true);
  const [accountUsername, setAccountUsername] = useState('');
  const [accountPassword, setAccountPassword] = useState('123456');

  const loadArchivedData = async () => {
    const activeUsr = propUser || pdksStorage.getActiveUser();
    if (!pdksStorage.canViewArchivedEmployees(activeUsr)) {
      setArchivedEmployees([]);
      setArchivedRecords([]);
      setActiveViewTab('active');
      return;
    }
    setArchivedLoading(true);
    setArchivedAccessError(null);
    try {
      const res = await pdksStorage.getArchivedEmployeesWithLogsAsync();
      if (!res.allowed) {
        setArchivedAccessError(res.message || 'Eski personel listesine erişim izniniz bulunmamaktadır.');
        setArchivedEmployees([]);
        setArchivedRecords([]);
      } else {
        setArchivedEmployees(res.employees);
        setArchivedRecords(res.records);
        setSelectedArchivedEmp((prev) =>
          prev ? res.employees.find((e) => e.id === prev.id) || res.employees[0] || null : res.employees[0] || null
        );
      }
    } finally {
      setArchivedLoading(false);
    }
  };

  const loadData = () => {
    setCurrentUser(propUser || pdksStorage.getActiveUser());
    setEmployees(pdksStorage.getEmployees());
    setShifts(pdksStorage.getShifts());
    setAccounts(pdksStorage.getUserAccounts());
    setDeviceApprovals(pdksStorage.getDeviceEntryApprovals());
  };

  useEffect(() => {
    if (propUser) setCurrentUser(propUser);
  }, [propUser]);

  useEffect(() => {
    loadData();
    void loadArchivedData();
    const handleSync = () => {
      loadData();
      void loadArchivedData();
      setCompanyName(pdksStorage.getCompanyName());
    };
    const handleNameSync = (e?: any) => {
      if (e?.detail && typeof e.detail === 'string') setCompanyName(e.detail);
      else setCompanyName(pdksStorage.getCompanyName());
    };
    window.addEventListener('pdks-data-synced', handleSync);
    window.addEventListener('pdks-company-name-updated', handleNameSync);
    window.addEventListener('pdks-wall-qr-updated', handleNameSync);
    return () => {
      window.removeEventListener('pdks-data-synced', handleSync);
      window.removeEventListener('pdks-company-name-updated', handleNameSync);
      window.removeEventListener('pdks-wall-qr-updated', handleNameSync);
    };
  }, []);

  // Filter employees
  const filteredEmployees = employees.filter((emp) => {
    const matchesSearch =
      emp.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      emp.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      emp.tcNo.includes(searchQuery) ||
      emp.title.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesDept = selectedDepartment === 'all' || emp.department === selectedDepartment;
    return matchesSearch && matchesDept;
  });

  // Open Badge View
  const handleOpenBadge = async (emp: Employee) => {
    setBadgeEmployee(emp);
    const qrUrl = await generateQRDataURL(emp.qrToken, { width: 300 });
    setBadgeQRUrl(qrUrl);
  };

  // Open Edit Modal
  const handleOpenEdit = (emp: Employee) => {
    setFormError(null);
    setEditingEmployee(emp);
    setFormData({
      fullName: emp.fullName,
      tcNo: emp.tcNo,
      department: emp.department,
      title: emp.title,
      email: emp.email,
      phone: emp.phone,
      shiftId: emp.shiftId,
      avatar: emp.avatar,
    });
    setIsAddModalOpen(true);
  };

  // Open Manual Presence Override Modal (for employees who forgot to scan card)
  const handleOpenPresenceModal = (emp: Employee) => {
    setPresenceEditEmp(emp);
    setPresenceTarget(emp.currentPresence);
    setPresenceTime(new Date().toTimeString().slice(0, 5));
    setPresenceNote('Kart basmayı unuttu');
    setRecordPresenceLog(true);
  };

  const handleSavePresenceChange = (e: React.FormEvent) => {
    e.preventDefault();
    if (!presenceEditEmp || !canEdit) return;
    const res = pdksStorage.updateEmployeePresenceManual(presenceEditEmp.id, presenceTarget, {
      timeStr: presenceTime,
      note: presenceNote,
      recordAttendance: recordPresenceLog,
      actorName: currentUser.name,
    });
    if (res.success) {
      loadData();
      setPresenceEditEmp(null);
      setPhotoNotice(res.message);
      setTimeout(() => setPhotoNotice(null), 4000);
    }
  };

  const handleResetDevice = (emp: Employee) => {
    const res = pdksStorage.resetEmployeeRegisteredDevice(emp.id, currentUser.name);
    if (res.success) {
      loadData();
      setPhotoNotice(res.message);
      setTimeout(() => setPhotoNotice(null), 4500);
    }
  };

  const handleQuickApproveDevice = (approvalId: string) => {
    const res = pdksStorage.approveDeviceEntryRequest(approvalId, {
      bindNewDevice: false,
      actorName: currentUser.name,
    });
    if (res.success) {
      loadData();
      setPhotoNotice(res.message);
      setTimeout(() => setPhotoNotice(null), 4500);
    }
  };

  // Save (Create or Update)
  const handleSaveEmployee = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!formData.fullName.trim() || !formData.title.trim()) {
      setFormError('Lütfen Ad Soyad ve Unvan/Pozisyon alanlarını doldurunuz.');
      return;
    }

    if (editingEmployee) {
      const updated: Employee = {
        ...editingEmployee,
        ...formData,
        fullName: formData.fullName.trim(),
        title: formData.title.trim(),
      };
      pdksStorage.saveEmployee(updated);
      setPhotoNotice(`${updated.fullName} bilgileri başarıyla güncellendi.`);
      setTimeout(() => setPhotoNotice(null), 4000);
    } else {
      let maxNum = 1000;
      employees.forEach((emp) => {
        const match = emp.id.match(/EMP-(\d+)/);
        if (match) {
          const parsedNum = parseInt(match[1], 10);
          if (parsedNum > maxNum) maxNum = parsedNum;
        }
      });
      const nextNum = maxNum + 1;
      const newId = `EMP-${nextNum}`;

      // Validate linked username availability BEFORE saving employee so state stays consistent
      let desiredUsername = '';
      if (createAccountWithEmp) {
        const rawCandidate = accountUsername.trim()
          ? normalizeUsername(accountUsername)
          : slugifyNameToUsername(formData.fullName);
        desiredUsername = rawCandidate || `user.${nextNum}`;
        const existingAccounts = pdksStorage.getUserAccounts();
        const isTaken = existingAccounts.some(
          (a) => normalizeUsername(a.username) === desiredUsername || a.username.toLowerCase().replace(/^@+/, '') === desiredUsername
        );
        if (isTaken) {
          if (accountUsername.trim()) {
            setFormError(`'@${desiredUsername}' kullanıcı adı zaten kullanımda. Lütfen farklı bir kullanıcı adı giriniz.`);
            return;
          }
          desiredUsername = `${desiredUsername}.${nextNum}`;
        }
      }

      const randomSecret = Math.random().toString(36).substring(2, 7).toUpperCase();
      const cleanNameSlug = slugifyNameToUsername(formData.fullName) || `personel.${nextNum}`;
      const newEmp: Employee = {
        id: newId,
        fullName: formData.fullName.trim(),
        tcNo: formData.tcNo.trim() || String(10000000000 + nextNum),
        department: formData.department,
        title: formData.title.trim(),
        email: formData.email.trim() || `${cleanNameSlug}@example.com`,
        phone: formData.phone.trim() || '+90 500 000 0000',
        avatar:
          formData.avatar.trim() ||
          'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=256&h=256&q=80',
        shiftId: formData.shiftId || shifts[0]?.id || 'SHIFT-1',
        startDate: getTodayString(),
        qrToken: `PDKS:${newId}:SEC_${randomSecret}`,
        status: 'active',
        currentPresence: 'outside',
      };
      pdksStorage.saveEmployee(newEmp);

      // Create linked user login account if checked
      if (createAccountWithEmp) {
        const finalPass = accountPassword.trim() || '123456';
        const accResult = pdksStorage.createUserAccount({
          employeeId: newId,
          username: desiredUsername,
          password: finalPass,
          role: 'personel',
          canCheckInOut: true,
          canTakeBreak: true,
          canRequestLeave: true,
          canViewOwnStats: true,
        });
        if (!accResult.success) {
          setFormError(accResult.message);
        }
      }

      setPhotoNotice(`${newEmp.fullName} (${newEmp.id}) için yeni personel kartı ve QR kimliği oluşturuldu.`);
      setTimeout(() => setPhotoNotice(null), 4000);
    }

    setIsAddModalOpen(false);
    setEditingEmployee(null);
    setFormError(null);
    setAccountUsername('');
    setAccountPassword('123456');
    setCreateAccountWithEmp(true);
    setFormData({
      fullName: '',
      tcNo: '',
      department: 'Yazılım & Ar-Ge',
      title: '',
      email: '',
      phone: '',
      shiftId: shifts[0]?.id || 'SHIFT-1',
      avatar: '',
    });
    loadData();
  };

  // Soft-Delete / Archive Employee Request
  const handleRequestDeleteEmployee = (emp: Employee) => {
    setActionError(null);
    const empAcc = accounts.find((a) => a.employeeId === emp.id);
    const check = pdksStorage.canDeleteTargetEmployee(currentUser, emp, empAcc);
    if (!check.allowed) {
      setActionError(check.reason || 'Bu personeli silme yetkiniz bulunmamaktadır.');
      setTimeout(() => setActionError(null), 5000);
      return;
    }
    setDeleteTargetEmp(emp);
  };

  const handleConfirmArchiveEmployee = async () => {
    if (!deleteTargetEmp) return;
    setIsDeletingEmp(true);
    setActionError(null);
    try {
      const res = await pdksStorage.archiveEmployeeAsync(deleteTargetEmp.id);
      if (res.success) {
        setPhotoNotice(res.message);
        setTimeout(() => setPhotoNotice(null), 5000);
        setDeleteTargetEmp(null);
        loadData();
        await loadArchivedData();
      } else {
        setActionError(res.message);
        setDeleteTargetEmp(null);
        setTimeout(() => setActionError(null), 5000);
      }
    } finally {
      setIsDeletingEmp(false);
    }
  };

  // Handlers for Photo Approval & Direct Change
  const pendingPhotoEmployees = employees.filter(
    (e) => e.avatarStatus === 'pending' && !!e.pendingAvatar
  );

  const handleApprovePhoto = (empId: string) => {
    const updated = pdksStorage.approveProfilePhoto(empId);
    if (updated) {
      setPhotoNotice(`${updated.fullName} isimli personelin yeni profil fotoğrafı onaylandı ve aktifleştirildi.`);
      loadData();
      setPhotoReviewEmp(null);
      setTimeout(() => setPhotoNotice(null), 4000);
    }
  };

  const handleRejectPhoto = (empId: string) => {
    const updated = pdksStorage.rejectProfilePhoto(empId);
    if (updated) {
      setPhotoNotice(`${updated.fullName} isimli personelin yeni profil fotoğrafı talebi reddedildi.`);
      loadData();
      setPhotoReviewEmp(null);
      setTimeout(() => setPhotoNotice(null), 4000);
    }
  };

  const handleSaveDirectPhoto = (empId: string, photoUrl: string) => {
    if (!photoUrl) return;
    const updated = pdksStorage.updateEmployeeAvatarDirect(empId, photoUrl);
    if (updated) {
      setPhotoNotice(`${updated.fullName} personelin profil fotoğrafı doğrudan güncellendi.`);
      loadData();
      setPhotoChangeEmp(null);
      setDirectPhotoInput('');
      setTimeout(() => setPhotoNotice(null), 4000);
    }
  };

  const handleDirectFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setDirectPhotoInput(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  // Print Badge
  const handlePrintBadge = () => {
    window.print();
  };

  // Download Badge QR Image
  const handleDownloadQR = () => {
    if (!badgeQRUrl || !badgeEmployee) return;
    const a = document.createElement('a');
    a.href = badgeQRUrl;
    a.download = `PDKS_QR_${badgeEmployee.id}_${badgeEmployee.fullName.replace(/\s+/g, '_')}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="w-full max-w-7xl mx-auto min-w-0 px-3 sm:px-6 lg:px-8 py-4 sm:py-8 space-y-4 sm:space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Personel & Kimlik Kartı Yönetimi
            </h1>
            <span
              className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${
                canCreate
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-amber-50 text-amber-700 border border-amber-200'
              }`}
            >
              {canCreate ? 'İK Yöneticisi Modu (Tam Yetki)' : `${currentUser.title} (Salt Okuma / İnceleme)`}
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Çalışan sicil bilgileri, QR kart basımı, vardiya atamaları ve durum kontrolü.
          </p>
        </div>

        {canCreate ? (
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => {
                setAccountModalEmpId(undefined);
                setIsAccountsModalOpen(true);
              }}
              className="inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg shadow-xs transition-colors whitespace-nowrap cursor-pointer"
              title="Personel Giriş Hesapları ve Şifre Yönetimi"
            >
              <Key className="w-4 h-4 text-indigo-600" />
              <span>Kullanıcı Hesapları ({accounts.length})</span>
            </button>

            {onOpenWallQR && (
              <button
                type="button"
                onClick={onOpenWallQR}
                className="inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-lg shadow-xs transition-colors whitespace-nowrap cursor-pointer"
                title="Şirket işyeri GPS koordinatlarını, Geofence yarıçapını belirleyin ve Duvar QR kodunu yazdırın (Yalnızca İK)"
              >
                <MapPin className="w-4 h-4 text-purple-600" />
                <span>İşyeri Konumu & Duvar QR</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setIsExcelModalOpen(true)}
              className="inline-flex items-center justify-center gap-2 px-3.5 py-2 text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-lg shadow-xs transition-colors whitespace-nowrap cursor-pointer"
              title="Personel listesini Excel (.xlsx) veya CSV formatında toplu aktarın"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              <span>Excel Listesi ile Ekle</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setEditingEmployee(null);
                setFormError(null);
                setFormData({
                  fullName: '',
                  tcNo: '',
                  department: 'Yazılım & Ar-Ge',
                  title: '',
                  email: '',
                  phone: '',
                  shiftId: shifts[0]?.id || 'SHIFT-1',
                  avatar: '',
                });
                setAccountUsername('');
                setAccountPassword('123456');
                setCreateAccountWithEmp(true);
                setIsAddModalOpen(true);
              }}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-sm transition-colors whitespace-nowrap cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Yeni Personel Tanımla</span>
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 text-slate-500 rounded-lg text-xs font-medium border border-slate-200">
            <Lock className="w-3.5 h-3.5 text-slate-400" />
            <span>Personel Ekleme Yetkisi: Yalnızca İK Yöneticisi</span>
          </div>
        )}
      </div>

      {/* Feedback Toast */}
      {photoNotice && (
        <div className="bg-emerald-600 text-white px-4 py-3 rounded-xl text-xs font-semibold flex items-center justify-between shadow-lg animate-fade-in border border-emerald-500">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-white shrink-0" />
            <span>{photoNotice}</span>
          </div>
          <button onClick={() => setPhotoNotice(null)} className="text-white hover:text-emerald-200 cursor-pointer">
            ✕
          </button>
        </div>
      )}

      {actionError && (
        <div className="bg-rose-600 text-white px-4 py-3 rounded-xl text-xs font-semibold flex items-center justify-between shadow-lg animate-fade-in border border-rose-500">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-white shrink-0" />
            <span>{actionError}</span>
          </div>
          <button onClick={() => setActionError(null)} className="text-white hover:text-rose-200 cursor-pointer">
            ✕
          </button>
        </div>
      )}

      {/* Active vs Read-Only Eski Personel View Switcher (Strictly Authorized Managers & Super Admin) */}
      {canViewArchived && (
        <div className="flex flex-wrap items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-1.5 shadow-xs w-fit">
          <button
            type="button"
            onClick={() => setActiveViewTab('active')}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
              activeViewTab === 'active'
                ? 'bg-slate-900 dark:bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Aktif Personel Listesi</span>
            <span
              className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono ${
                activeViewTab === 'active'
                  ? 'bg-white/20 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
              }`}
            >
              {employees.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveViewTab('archived');
              void loadArchivedData();
            }}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
              activeViewTab === 'archived'
                ? 'bg-slate-900 dark:bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Archive className="w-3.5 h-3.5" />
            <span>Eski Personel Listesi</span>
            <span
              className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono ${
                activeViewTab === 'archived'
                  ? 'bg-white/20 text-white'
                  : 'bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300'
              }`}
            >
              {archivedEmployees.length}
            </span>
          </button>
        </div>
      )}

      {activeViewTab === 'archived' && canViewArchived ? (
        (() => {
          const filteredArchived = archivedEmployees.filter((emp) => {
            const q = archivedSearch.toLowerCase().trim();
            const matchesSearch =
              !q ||
              emp.fullName.toLowerCase().includes(q) ||
              emp.id.toLowerCase().includes(q) ||
              (emp.tcNo || '').includes(q) ||
              (emp.title || '').toLowerCase().includes(q) ||
              (emp.formerUsername || '').toLowerCase().includes(q);
            const matchesDept = archivedDeptFilter === 'all' || emp.department === archivedDeptFilter;
            return matchesSearch && matchesDept;
          });

          const selectedEmpLogs = selectedArchivedEmp
            ? archivedRecords.filter((rec) => {
                if (rec.employeeId !== selectedArchivedEmp.id) return false;
                if (logTypeFilter !== 'all' && rec.type !== logTypeFilter) return false;
                if (logDateFilter && rec.date !== logDateFilter) return false;
                return true;
              })
            : [];

          const totalForSelected = selectedArchivedEmp
            ? archivedRecords.filter((r) => r.employeeId === selectedArchivedEmp.id)
            : [];
          const checkInCount = totalForSelected.filter((r) => r.type === 'check_in').length;
          const checkOutCount = totalForSelected.filter((r) => r.type === 'check_out').length;
          const breakCount = totalForSelected.filter(
            (r) => r.type === 'break_start' || r.type === 'break_end'
          ).length;

          const formatRoleLabel = (role?: UserRole) => {
            if (role === 'ik_yoneticisi') return 'İK Yöneticisi';
            if (role === 'birim_amiri' || role === 'yonetici') return 'Birim Amiri';
            if (role === 'guvenlik') return 'Güvenlik';
            return 'Personel';
          };

          const formatArchivedAt = (iso?: string) => {
            if (!iso) return '-';
            try {
              return new Date(iso).toLocaleString('tr-TR', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              });
            } catch {
              return iso;
            }
          };

          return (
            <div className="space-y-4">
              {/* Read-Only Security Notice Banner */}
              <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-700/60 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0">
                    <Lock className="w-4 h-4" />
                  </div>
                  <div className="text-xs">
                    <div className="font-bold text-amber-950 dark:text-amber-200">
                      Salt Okunur Eski Personel Arşivi & Geçmiş PDKS Logları
                    </div>
                    <p className="text-[11px] text-amber-800 dark:text-amber-300/90 mt-0.5">
                      İşten ayrılan veya silinen personellerin kimlik bilgileri ve geçmiş giriş-çıkış kayıtları denetim amacıyla korunur. Bu listedeki kişiler sisteme giriş yapamaz, vardiya/yetki ekranlarında yer almaz ve bu ekrandan düzenlenemez.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void loadArchivedData()}
                  disabled={archivedLoading}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-amber-300 dark:border-amber-700/60 text-amber-900 dark:text-amber-200 text-xs font-semibold hover:bg-amber-100/60 dark:hover:bg-slate-700 cursor-pointer shrink-0 disabled:opacity-50"
                >
                  <RotateCcw className={`w-3.5 h-3.5 ${archivedLoading ? 'animate-spin' : ''}`} />
                  <span>Arşivi Yenile</span>
                </button>
              </div>

              {archivedAccessError && (
                <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-700/60 text-rose-800 dark:text-rose-200 rounded-xl p-4 text-xs flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                  <span>{archivedAccessError}</span>
                </div>
              )}

              {/* Search & Filter */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3.5 shadow-xs flex flex-col sm:flex-row gap-3 items-center justify-between">
                <div className="relative w-full sm:w-80">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Eski personel adı, sicil no, TC veya kullanıcı adı ara..."
                    value={archivedSearch}
                    onChange={(e) => setArchivedSearch(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50/60 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  />
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <select
                    value={archivedDeptFilter}
                    onChange={(e) => setArchivedDeptFilter(e.target.value)}
                    className="w-full sm:w-52 px-3 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="all">Tüm Birimler ({archivedEmployees.length})</option>
                    {[
                      'Yazılım & Ar-Ge',
                      'İnsan Kaynakları',
                      'Muhasebe & Finans',
                      'Pazarlama & Satış',
                      'Üretim & Operasyon',
                      'Lojistik & Depo',
                    ].map((dept) => (
                      <option key={dept} value={dept}>
                        {dept}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Split View: Archived Employees List + Selected Employee Historical PDKS Logs */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                {/* Left Column: Former Employees Read-Only List */}
                <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xs overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Archive className="w-4 h-4 text-slate-500 dark:text-slate-300" />
                      <h2 className="text-xs font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider">
                        Eski Personel Kayıtları ({filteredArchived.length})
                      </h2>
                    </div>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-200/80 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                      Salt Okunur
                    </span>
                  </div>

                  {archivedLoading && filteredArchived.length === 0 ? (
                    <div className="py-12 text-center text-xs text-slate-400">
                      Arşiv kayıtları yükleniyor...
                    </div>
                  ) : filteredArchived.length === 0 ? (
                    <div className="py-12 px-4 text-center space-y-2">
                      <Archive className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto" />
                      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                        {archivedEmployees.length === 0
                          ? 'Henüz arşivlenmiş (Eski Personel) kaydı bulunmamaktadır.'
                          : 'Arama kriterine uygun eski personel bulunamadı.'}
                      </p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[600px] overflow-y-auto">
                      {filteredArchived.map((emp) => {
                        const logCount = archivedRecords.filter((r) => r.employeeId === emp.id).length;
                        const isSelected = selectedArchivedEmp?.id === emp.id;

                        return (
                          <button
                            key={emp.id}
                            type="button"
                            onClick={() => setSelectedArchivedEmp(emp)}
                            className={`w-full text-left p-3.5 transition-colors cursor-pointer flex items-start justify-between gap-3 ${
                              isSelected
                                ? 'bg-indigo-50/90 dark:bg-indigo-950/60 border-l-4 border-indigo-600 dark:border-indigo-400'
                                : 'hover:bg-slate-50 dark:hover:bg-slate-800/50 border-l-4 border-transparent'
                            }`}
                          >
                            <div className="flex items-start gap-2.5 min-w-0">
                              <img
                                src={emp.avatar}
                                alt={emp.fullName}
                                className="w-10 h-10 rounded-full object-cover border border-slate-200 dark:border-slate-700 grayscale opacity-80 shrink-0"
                                referrerPolicy="no-referrer"
                              />
                              <div className="min-w-0 space-y-0.5">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="font-bold text-xs text-slate-900 dark:text-slate-100 truncate">
                                    {emp.fullName}
                                  </span>
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-500/30">
                                    Eski Personel
                                  </span>
                                </div>
                                <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                                  {emp.title} · {emp.department}
                                </div>
                                <div className="text-[10px] font-mono text-slate-400 dark:text-slate-500 flex flex-wrap gap-x-2">
                                  <span>{emp.id}</span>
                                  {emp.formerUsername && <span>@{emp.formerUsername}</span>}
                                  <span>({formatRoleLabel(emp.formerRole)})</span>
                                </div>
                                <div className="text-[10px] text-slate-400 dark:text-slate-500">
                                  Arşiv Tarihi: {formatArchivedAt(emp.archivedAt)}
                                  {emp.archivedBy ? ` · ${emp.archivedBy}` : ''}
                                </div>
                              </div>
                            </div>

                            <div className="shrink-0 flex flex-col items-end gap-1">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 font-mono">
                                <History className="w-3 h-3 text-indigo-500" />
                                {logCount} Kayıt
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Right Column: Historical PDKS Logs Viewer (Strictly Read-Only) */}
                <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xs overflow-hidden flex flex-col">
                  {selectedArchivedEmp ? (
                    <>
                      <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/60 space-y-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <img
                              src={selectedArchivedEmp.avatar}
                              alt={selectedArchivedEmp.fullName}
                              className="w-11 h-11 rounded-full object-cover border border-slate-300 dark:border-slate-600 grayscale"
                              referrerPolicy="no-referrer"
                            />
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                                  {selectedArchivedEmp.fullName}
                                </h3>
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-500/30">
                                  Pasif / Eski Personel
                                </span>
                              </div>
                              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                                {selectedArchivedEmp.id} · TC: {selectedArchivedEmp.tcNo} · {selectedArchivedEmp.department}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                            <FileText className="w-3.5 h-3.5 text-indigo-500" />
                            <span>Geçmiş PDKS Logları (Salt Okunur)</span>
                          </div>
                        </div>

                        {/* Quick Summary Stats */}
                        <div className="grid grid-cols-4 gap-2">
                          <div className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                            <div className="text-[10px] text-slate-500 dark:text-slate-400">Toplam Log</div>
                            <div className="text-sm font-bold text-slate-900 dark:text-white font-mono">{totalForSelected.length}</div>
                          </div>
                          <div className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                            <div className="text-[10px] text-slate-500 dark:text-slate-400">Giriş</div>
                            <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400 font-mono">{checkInCount}</div>
                          </div>
                          <div className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                            <div className="text-[10px] text-slate-500 dark:text-slate-400">Çıkış</div>
                            <div className="text-sm font-bold text-rose-600 dark:text-rose-400 font-mono">{checkOutCount}</div>
                          </div>
                          <div className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                            <div className="text-[10px] text-slate-500 dark:text-slate-400">Mola</div>
                            <div className="text-sm font-bold text-amber-600 dark:text-amber-400 font-mono">{breakCount}</div>
                          </div>
                        </div>

                        {/* Log Filters */}
                        <div className="flex flex-wrap items-center gap-2">
                          <select
                            value={logTypeFilter}
                            onChange={(e) => setLogTypeFilter(e.target.value as any)}
                            className="px-2.5 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100"
                          >
                            <option value="all">Tüm Hareketler</option>
                            <option value="check_in">Sadece Giriş</option>
                            <option value="check_out">Sadece Çıkış</option>
                            <option value="break_start">Mola Başlangıç</option>
                            <option value="break_end">Moladan Dönüş</option>
                            <option value="security_alert">Güvenlik Uyarıları</option>
                          </select>
                          <input
                            type="date"
                            value={logDateFilter}
                            onChange={(e) => setLogDateFilter(e.target.value)}
                            className="px-2.5 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100"
                          />
                          {(logTypeFilter !== 'all' || logDateFilter) && (
                            <button
                              type="button"
                              onClick={() => {
                                setLogTypeFilter('all');
                                setLogDateFilter('');
                              }}
                              className="px-2.5 py-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                            >
                              Filtreyi Temizle
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Read-Only Logs Table */}
                      <div className="overflow-x-auto max-h-[450px] overflow-y-auto">
                        {selectedEmpLogs.length === 0 ? (
                          <div className="py-14 text-center text-xs text-slate-400">
                            Seçili kriterlere ait geçmiş PDKS hareketi bulunamadı.
                          </div>
                        ) : (
                          <table className="w-full text-left text-xs">
                            <thead>
                              <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider">
                                <th className="py-2.5 px-3">Tarih & Saat</th>
                                <th className="py-2.5 px-3">İşlem Türü</th>
                                <th className="py-2.5 px-3">Durum</th>
                                <th className="py-2.5 px-3">Terminal / Cihaz / Not</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                              {selectedEmpLogs.map((rec) => (
                                <tr key={rec.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                                  <td className="py-2.5 px-3 font-mono whitespace-nowrap">
                                    <div className="font-semibold text-slate-800 dark:text-slate-100">{rec.date}</div>
                                    <div className="text-[11px] text-slate-500 dark:text-slate-400">{rec.timeStr}</div>
                                  </td>
                                  <td className="py-2.5 px-3 whitespace-nowrap">
                                    {rec.type === 'check_in' && (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30">
                                        <ArrowDownRight className="w-3 h-3" />
                                        Giriş
                                      </span>
                                    )}
                                    {rec.type === 'check_out' && (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 dark:bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-500/30">
                                        <ArrowUpRight className="w-3 h-3" />
                                        Çıkış
                                      </span>
                                    )}
                                    {(rec.type === 'break_start' || rec.type === 'break_end') && (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-500/30">
                                        <Coffee className="w-3 h-3" />
                                        {rec.type === 'break_start' ? 'Mola Başlangıcı' : 'Moladan Dönüş'}
                                      </span>
                                    )}
                                    {rec.type === 'security_alert' && (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 dark:bg-rose-500/20 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-500/40">
                                        <ShieldAlert className="w-3 h-3" />
                                        Güvenlik Uyarısı
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-2.5 px-3 whitespace-nowrap">
                                    <span className="text-[11px] font-medium text-slate-700 dark:text-slate-300">
                                      {rec.status === 'on_time'
                                        ? 'Zamanında'
                                        : rec.status === 'late'
                                        ? `Geç (${rec.lateMinutes} dk)`
                                        : rec.status === 'early_leave'
                                        ? 'Erken Çıkış'
                                        : rec.status === 'overtime'
                                        ? 'Fazla Mesai'
                                        : 'Normal'}
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-3 text-[11px] text-slate-600 dark:text-slate-300">
                                    <div className="font-medium text-slate-800 dark:text-slate-200">{rec.terminal || '-'}</div>
                                    {(rec.macAddress || rec.deviceId) && (
                                      <div className="text-[10px] font-mono text-slate-400 dark:text-slate-500">
                                        {rec.macAddress || ''} {rec.deviceId ? `· ${rec.deviceId}` : ''}
                                      </div>
                                    )}
                                    {rec.note && (
                                      <div className="text-[10px] text-slate-500 dark:text-slate-400 italic mt-0.5">
                                        {rec.note}
                                      </div>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="py-16 px-4 text-center text-xs text-slate-400">
                      Geçmiş PDKS hareketlerini görüntülemek için sol listeden bir eski personel seçiniz.
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })()
      ) : (
      <>
      {/* PENDING PHOTO APPROVALS BANNER (İK Yönetici Onayı) */}
      {canEdit && pendingPhotoEmployees.length > 0 && (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-4 shadow-sm animate-fade-in space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-amber-500 text-white flex items-center justify-center font-bold">
                <Camera className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-amber-950 flex items-center gap-2">
                  <span>Profil Fotoğrafı Onayı Bekleyen Personeller</span>
                  <span className="px-2 py-0.5 rounded-full bg-amber-200 text-amber-900 text-xs font-mono font-bold">
                    {pendingPhotoEmployees.length} Bekleyen
                  </span>
                </h3>
                <p className="text-[11px] text-amber-800">
                  Personellerin kendi yüklediği profil fotoğrafları İK onayı verilene kadar aktifleşmez. Buradan inceleyip onaylayabilir veya reddedebilirsiniz.
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
            {pendingPhotoEmployees.map((emp) => (
              <div
                key={emp.id}
                className="bg-white rounded-xl p-3 border border-amber-200 shadow-xs flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-2.5">
                  <div className="relative">
                    <img
                      src={emp.pendingAvatar || emp.avatar}
                      alt={emp.fullName}
                      className="w-12 h-12 rounded-xl object-cover border-2 border-amber-400 shadow-xs"
                      referrerPolicy="no-referrer"
                    />
                    <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-amber-500 rounded-full border-2 border-white" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900">{emp.fullName}</h4>
                    <p className="text-[10px] text-slate-500">{emp.department} · {emp.title}</p>
                    <span className="text-[9px] font-mono text-amber-700 bg-amber-100/70 px-1.5 py-0.5 rounded inline-block mt-0.5">
                      Onay Bekliyor
                    </span>
                  </div>
                </div>

                <div className="flex flex-col gap-1 shrink-0">
                  <button
                    onClick={() => setPhotoReviewEmp(emp)}
                    className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold shadow-xs transition-colors"
                  >
                    İncele
                  </button>
                  <button
                    onClick={() => handleApprovePhoto(emp.id)}
                    className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold shadow-xs transition-colors flex items-center justify-center gap-1"
                  >
                    <Check className="w-3 h-3" />
                    <span>Onayla</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex flex-col md:flex-row gap-4 justify-between items-center">
        {/* Search Input */}
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="İsim, Sicil No, TC No veya Ünvan ara..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50/50"
          />
        </div>

        {/* Department Filter Bar */}
        <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto scrollbar-none">
          <button
            onClick={() => setSelectedDepartment('all')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
              selectedDepartment === 'all'
                ? 'bg-slate-900 dark:bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Tüm Birimler ({employees.length})
          </button>
          {[
            'Yazılım & Ar-Ge',
            'İnsan Kaynakları',
            'Muhasebe & Finans',
            'Pazarlama & Satış',
            'Üretim & Operasyon',
            'Lojistik & Depo',
          ].map((dept) => (
            <button
              key={dept}
              onClick={() => setSelectedDepartment(dept)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                selectedDepartment === dept
                  ? 'bg-slate-900 dark:bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {dept}
            </button>
          ))}
        </div>
      </div>

      {/* Personnel List Container */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
        {/* Mobile Personnel Card View (md:hidden) */}
        <div className="md:hidden divide-y divide-slate-100">
          {filteredEmployees.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs">
              Kriterlere uygun personel bulunamadı.
            </div>
          ) : (
            filteredEmployees.map((emp) => {
              const shift = shifts.find((s) => s.id === emp.shiftId);
              const isInside = emp.currentPresence === 'inside';
              const isBreak = emp.currentPresence === 'break';
              const empAcc = accounts.find((a) => a.employeeId === emp.id);

              return (
                <div key={emp.id} className="p-3.5 space-y-3">
                  {/* Row 1: Avatar, Name, Department & Presence */}
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="relative shrink-0">
                        <img
                          src={emp.avatar}
                          alt={emp.fullName}
                          className="w-11 h-11 rounded-full object-cover border border-slate-200"
                          referrerPolicy="no-referrer"
                        />
                        {emp.avatarStatus === 'pending' && emp.pendingAvatar && (
                          <span
                            className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-amber-500 rounded-full border-2 border-white"
                            title="Yeni fotoğraf onay bekliyor"
                          />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold text-xs text-slate-900 truncate">
                          {emp.fullName}
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono truncate">
                          {emp.id} · {emp.department}
                        </div>
                        <div className="text-[10px] text-slate-600 truncate">
                          {emp.title}
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0 text-right flex flex-col items-end gap-1">
                      {canEdit ? (
                        <button
                          type="button"
                          onClick={() => handleOpenPresenceModal(emp)}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold transition-all cursor-pointer hover:ring-2 hover:ring-indigo-400/50 ${
                            isInside
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-300'
                              : isBreak
                              ? 'bg-amber-50 text-amber-700 border border-amber-300'
                              : 'bg-slate-100 text-slate-600 border border-slate-200'
                          }`}
                          title="Mevcut durumu manuel değiştir (Kart unutma vb.)"
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              isInside ? 'bg-emerald-500 animate-pulse' : isBreak ? 'bg-amber-500' : 'bg-slate-400'
                            }`}
                          />
                          <span>{isInside ? 'Ofiste' : isBreak ? 'Molada' : 'Dışarıda'}</span>
                          <Edit2 className="w-2.5 h-2.5 opacity-70 ml-0.5" />
                        </button>
                      ) : (
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            isInside
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-300'
                              : isBreak
                              ? 'bg-amber-50 text-amber-700 border border-amber-300'
                              : 'bg-slate-100 text-slate-600 border border-slate-200'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              isInside ? 'bg-emerald-500 animate-pulse' : isBreak ? 'bg-amber-500' : 'bg-slate-400'
                            }`}
                          />
                          <span>{isInside ? 'Ofiste' : isBreak ? 'Molada' : 'Dışarıda'}</span>
                        </span>
                      )}

                      {emp.lastActionTime && (
                        <div className="text-[9px] font-mono text-slate-400">
                          {emp.lastActionTime}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Row 2: Account badge & Shift badge */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-[11px]">
                    <div className="flex items-center gap-1.5">
                      {empAcc ? (
                        <button
                          onClick={() => {
                            setAccountModalEmpId(emp.id);
                            setIsAccountsModalOpen(true);
                          }}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 font-mono text-[10px] font-semibold cursor-pointer"
                        >
                          <Key className="w-3 h-3 text-emerald-600" />
                          <span>@{empAcc.username}</span>
                        </button>
                      ) : canManageAccounts ? (
                        <button
                          onClick={() => {
                            setAccountModalEmpId(emp.id);
                            setIsAccountsModalOpen(true);
                          }}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 border border-slate-200 text-[10px] font-medium cursor-pointer"
                        >
                          <Plus className="w-3 h-3 text-indigo-600" />
                          <span>Hesap Tanımla</span>
                        </button>
                      ) : (
                        <span className="text-[10px] text-slate-400">Hesap Yok</span>
                      )}

                      <span className="text-[10px] text-slate-500 bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
                        {shift?.startTime || '08:30'} - {shift?.endTime || '17:30'}
                      </span>

                      {(() => {
                        const regDeviceName = empAcc?.registeredDeviceName || emp.registeredDeviceName;
                        const regMac = empAcc?.registeredMacAddress || emp.registeredMacAddress;
                        const regDevId = empAcc?.registeredDeviceId || emp.registeredDeviceId;
                        const lastDevName = empAcc?.lastLoginDeviceName || emp.lastLoginDeviceName;
                        const lastMac = empAcc?.lastLoginMacAddress || emp.lastLoginMacAddress;
                        const lastDevId = empAcc?.lastLoginDeviceId || emp.lastLoginDeviceId;
                        const isDifferentLastDevice = Boolean(
                          regDevId && ((lastDevId && lastDevId !== regDevId) || (lastMac && regMac && lastMac !== regMac))
                        );

                        return regDeviceName || regDevId || regMac ? (
                          <div className="w-full mt-1 p-2 rounded-lg bg-slate-50 border border-slate-200 space-y-1 text-[10px]">
                            <div className="flex items-center justify-between gap-1.5">
                              <span className="inline-flex items-center gap-1 font-semibold text-slate-700 truncate">
                                <Smartphone className="w-3 h-3 text-indigo-500 shrink-0" />
                                <span className="truncate">{regDeviceName || 'Kayıtlı Cihaz'}</span>
                              </span>
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 shrink-0">
                                Kayıtlı Cihaz
                              </span>
                            </div>
                            <div className="font-mono text-slate-600 flex flex-wrap gap-x-2 gap-y-0.5">
                              {regMac && <span>MAC: <strong className="text-slate-800">{regMac}</strong></span>}
                              {regDevId && <span>ID: <strong className="text-slate-800">{regDevId}</strong></span>}
                            </div>
                            {(lastDevName || lastMac) && (
                              <div className={`pt-1 border-t border-slate-200/80 font-mono text-[9px] ${isDifferentLastDevice ? 'text-rose-700 font-semibold' : 'text-slate-500'}`}>
                                Son Giriş: {lastDevName || '-'} {lastMac ? `(${lastMac})` : ''}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-[10px] text-slate-400">
                            İlk girişte cihaz kaydedilecek
                          </span>
                        );
                      })()}
                    </div>

                    {/* Device Lock Quick Approve or Device Reset */}
                    {(() => {
                      const activeLock = deviceApprovals.find(
                        (d) =>
                          d.employeeId === emp.id &&
                          (d.status === 'pending' || d.status === 'check_in_requested') &&
                          Date.now() < Date.parse(d.expiresAt)
                      );
                      const hasBoundDevice = Boolean(
                        empAcc?.registeredDeviceId || empAcc?.registeredMacAddress || emp.registeredDeviceId || emp.registeredMacAddress
                      );
                      return (
                        <div className="flex flex-wrap items-center gap-1.5">
                          {canApprove && activeLock && (
                            <button
                              type="button"
                              onClick={() => handleQuickApproveDevice(activeLock.id)}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-100 hover:bg-rose-200 text-rose-800 border border-rose-300 text-[10px] font-bold cursor-pointer"
                            >
                              <ShieldAlert className="w-3 h-3" />
                              <span>Yeni Cihaz Girişini Onayla</span>
                            </button>
                          )}
                          {canManageDevices && hasBoundDevice && (
                            <button
                              type="button"
                              onClick={() => handleResetDevice(emp)}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-700 border border-slate-200 hover:border-rose-200 text-[10px] font-semibold cursor-pointer"
                              title="Kayıtlı cihazı sıfırla (Cihaz değişikliğinde yeni cihazı tanımlamak için)"
                            >
                              <RotateCcw className="w-2.5 h-2.5" />
                              <span>Cihazı Sıfırla</span>
                            </button>
                          )}
                          {canApprove && emp.avatarStatus === 'pending' && emp.pendingAvatar && (
                            <button
                              onClick={() => setPhotoReviewEmp(emp)}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold cursor-pointer"
                            >
                              <Camera className="w-3 h-3" />
                              <span>Fotoğraf Onayla</span>
                            </button>
                          )}
                        </div>
                      );
                    })()}
                  </div>

                  {/* Row 3: Action Buttons */}
                  <div className="flex items-center justify-between gap-1.5 pt-2 border-t border-slate-100">
                    <button
                      onClick={() => handleOpenBadge(emp)}
                      className="flex-1 py-1.5 px-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer"
                    >
                      <QrCode className="w-3.5 h-3.5" />
                      <span>PDKS Kartı</span>
                    </button>

                    {canEdit && (
                      <button
                        onClick={() => {
                          setPhotoChangeEmp(emp);
                          setDirectPhotoInput(emp.avatar);
                        }}
                        className="p-1.5 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg border border-slate-200 cursor-pointer"
                        title="Profil Fotoğrafını Değiştir"
                      >
                        <Camera className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {canEdit && (
                      <button
                        onClick={() => handleOpenEdit(emp)}
                        className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg border border-slate-200 cursor-pointer"
                        title="Bilgileri Düzenle"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {(() => {
                      const delCheck = pdksStorage.canDeleteTargetEmployee(currentUser, emp, empAcc);
                      if (delCheck.allowed) {
                        return (
                          <button
                            onClick={() => handleRequestDeleteEmployee(emp)}
                            className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg border border-rose-200 cursor-pointer"
                            title="Personeli Sil / Arşivle"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        );
                      }
                      return (
                        <span
                          className="p-1.5 text-slate-300 dark:text-slate-600 cursor-not-allowed"
                          title={delCheck.reason || 'Silme yetkisi kısıtlı'}
                        >
                          <Lock className="w-3.5 h-3.5" />
                        </span>
                      );
                    })()}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Desktop Personnel Table (hidden md:block) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-500 font-semibold uppercase tracking-wider">
                <th className="py-3 px-4">Personel Bilgisi</th>
                <th className="py-3 px-4">Sicil & TC No</th>
                <th className="py-3 px-4">Departman & Görev</th>
                <th className="py-3 px-4">Hesap & Kayıtlı Cihaz (MAC / ID)</th>
                <th className="py-3 px-4">Vardiya</th>
                <th className="py-3 px-4">Mevcut Durum</th>
                <th className="py-3 px-4 text-right">İşlemler</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredEmployees.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    Kriterlere uygun personel bulunamadı.
                  </td>
                </tr>
              ) : (
                filteredEmployees.map((emp) => {
                  const shift = shifts.find((s) => s.id === emp.shiftId);
                  const isInside = emp.currentPresence === 'inside';
                  const isBreak = emp.currentPresence === 'break';

                  return (
                    <tr key={emp.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="relative group shrink-0">
                            <img
                              src={emp.avatar}
                              alt={emp.fullName}
                              className="w-10 h-10 rounded-full object-cover border border-slate-200"
                              referrerPolicy="no-referrer"
                            />
                            {emp.avatarStatus === 'pending' && emp.pendingAvatar && (
                              <span
                                className="absolute -top-1 -right-1 w-4 h-4 bg-amber-500 rounded-full border-2 border-white flex items-center justify-center text-[9px] text-white font-bold animate-ping"
                                title="Yeni fotoğraf onay bekliyor"
                              />
                            )}
                            {canEdit && (
                              <button
                                onClick={() => {
                                  setPhotoChangeEmp(emp);
                                  setDirectPhotoInput(emp.avatar);
                                }}
                                className="absolute inset-0 bg-slate-900/60 rounded-full opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity text-[10px]"
                                title="Fotoğrafı Değiştir (İK Yetkisi)"
                              >
                                <Camera className="w-4 h-4" />
                              </button>
                            )}
                          </div>

                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-slate-900 text-sm">
                                {emp.fullName}
                              </span>
                              {emp.avatarStatus === 'pending' && emp.pendingAvatar && (
                                <button
                                  onClick={() => setPhotoReviewEmp(emp)}
                                  className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-100/80 px-2 py-0.5 rounded-full hover:bg-amber-200 transition-colors"
                                  title="Yeni yüklenen fotoğrafı incele ve onayla"
                                >
                                  <Camera className="w-3 h-3 text-amber-600" />
                                  <span>Fotoğraf Onay Bekliyor</span>
                                </button>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500 flex items-center gap-2">
                              <span>{emp.email}</span>
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <div className="font-mono font-medium text-slate-900">{emp.id}</div>
                        <div className="font-mono text-[11px] text-slate-500">{emp.tcNo}</div>
                      </td>

                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-900">{emp.department}</div>
                        <div className="text-[11px] text-slate-500">{emp.title}</div>
                      </td>

                      <td className="py-3 px-4">
                        {(() => {
                          const empAcc = accounts.find((a) => a.employeeId === emp.id);
                          const regDeviceName = empAcc?.registeredDeviceName || emp.registeredDeviceName;
                          const regMac = empAcc?.registeredMacAddress || emp.registeredMacAddress;
                          const regDevId = empAcc?.registeredDeviceId || emp.registeredDeviceId;
                          const lastDevName = empAcc?.lastLoginDeviceName || emp.lastLoginDeviceName;
                          const lastMac = empAcc?.lastLoginMacAddress || emp.lastLoginMacAddress;
                          const lastDevId = empAcc?.lastLoginDeviceId || emp.lastLoginDeviceId;
                          const isDifferentLastDevice = Boolean(
                            regDevId && ((lastDevId && lastDevId !== regDevId) || (lastMac && regMac && lastMac !== regMac))
                          );
                          const activeLock = deviceApprovals.find(
                            (d) =>
                              d.employeeId === emp.id &&
                              (d.status === 'pending' || d.status === 'check_in_requested') &&
                              Date.now() < Date.parse(d.expiresAt)
                          );

                          return (
                            <div className="space-y-1.5">
                              {empAcc ? (
                                <button
                                  onClick={() => {
                                    setAccountModalEmpId(emp.id);
                                    setIsAccountsModalOpen(true);
                                  }}
                                  className="group inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100/80 border border-emerald-200 text-emerald-800 transition-colors text-left"
                                  title="Kullanıcı Giriş Hesabını İncele / Düzenle"
                                >
                                  <Key className="w-3 h-3 text-emerald-600 shrink-0" />
                                  <div>
                                    <span className="font-mono font-semibold text-xs text-emerald-700 block leading-tight">
                                      @{empAcc.username}
                                    </span>
                                    <span className="text-[9px] text-emerald-600/80 block leading-none">
                                      {empAcc.role === 'personel' ? 'Kısıtlı Yetki' : empAcc.role}
                                    </span>
                                  </div>
                                </button>
                              ) : canManageAccounts ? (
                                <button
                                  onClick={() => {
                                    setAccountModalEmpId(emp.id);
                                    setIsAccountsModalOpen(true);
                                  }}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-100 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-200 text-slate-600 hover:text-indigo-700 font-semibold text-[11px] transition-colors"
                                  title="Bu personele kullanıcı adı ve şifreli giriş hesabı tanımla"
                                >
                                  <Plus className="w-3 h-3 text-indigo-600" />
                                  <span>Hesap Aç</span>
                                </button>
                              ) : (
                                <span className="text-slate-400 text-[11px] block">Hesap Tanımsız</span>
                              )}

                              {regDeviceName || regDevId || regMac ? (
                                <div className="p-1.5 rounded-lg bg-slate-50 border border-slate-200/90 space-y-0.5 max-w-[260px]">
                                  <div className="flex items-center justify-between gap-1.5">
                                    <span
                                      className="inline-flex items-center gap-1 text-slate-800 font-semibold text-[10px] truncate"
                                      title={`Kayıtlı Cihaz: ${regDeviceName || '-'}`}
                                    >
                                      <Smartphone className="w-3 h-3 text-indigo-500 shrink-0" />
                                      <span className="truncate">{regDeviceName || 'Kayıtlı Cihaz'}</span>
                                    </span>
                                    {canManageDevices && (
                                      <button
                                        type="button"
                                        onClick={() => handleResetDevice(emp)}
                                        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-white hover:bg-rose-50 text-slate-500 hover:text-rose-700 border border-slate-200 hover:border-rose-200 text-[9px] font-semibold cursor-pointer shrink-0"
                                        title="Kayıtlı cihazı sıfırla (Cihaz değişikliğinde yeni cihazı tanımlamak için)"
                                      >
                                        <RotateCcw className="w-2.5 h-2.5" />
                                        <span>Sıfırla</span>
                                      </button>
                                    )}
                                  </div>
                                  <div className="font-mono text-[9px] text-slate-600 leading-tight space-y-0.5">
                                    {regMac && (
                                      <div>
                                        MAC: <span className="font-bold text-slate-800">{regMac}</span>
                                      </div>
                                    )}
                                    {regDevId && (
                                      <div>
                                        ID: <span className="font-semibold text-slate-700">{regDevId}</span>
                                      </div>
                                    )}
                                    {(lastDevName || lastMac) && (
                                      <div className={isDifferentLastDevice ? 'text-rose-700 font-semibold' : 'text-slate-400'}>
                                        Son Giriş: {lastDevName || '-'} {lastMac ? `(${lastMac})` : ''}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              ) : (
                                <div className="text-[10px] text-slate-400">
                                  İlk girişte cihaz kaydedilecek
                                </div>
                              )}

                              {activeLock && (
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-200 text-[10px] font-bold">
                                    <ShieldAlert className="w-2.5 h-2.5" />
                                    <span>Yeni Cihaz Kilidi</span>
                                  </span>
                                  {canApprove && (
                                    <button
                                      type="button"
                                      onClick={() => handleQuickApproveDevice(activeLock.id)}
                                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold cursor-pointer"
                                      title={`${activeLock.newDeviceName} için ilk iş yeri girişini onayla`}
                                    >
                                      <Check className="w-2.5 h-2.5" />
                                      <span>Girişi Onayla</span>
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </td>

                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-800">{shift?.name || 'Standart'}</div>
                        <div className="text-[11px] text-slate-500 font-mono">
                          {shift?.startTime} - {shift?.endTime} (±{shift?.toleranceMinutes} dk)
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`w-2 h-2 rounded-full shrink-0 ${
                                isInside
                                  ? 'bg-emerald-500 animate-pulse'
                                  : isBreak
                                  ? 'bg-amber-500'
                                  : 'bg-slate-400'
                              }`}
                            />
                            <span className="font-medium text-slate-700">
                              {isInside ? 'Ofiste (İçeride)' : isBreak ? 'Molada' : 'Ofis Dışında'}
                            </span>
                          </div>
                          {canEdit && (
                            <button
                              type="button"
                              onClick={() => handleOpenPresenceModal(emp)}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 hover:bg-indigo-50 text-slate-600 hover:text-indigo-700 border border-slate-200 hover:border-indigo-200 text-[10px] font-semibold transition-colors cursor-pointer"
                              title="Kart basmayı unutan personel için mevcut durumu değiştir"
                            >
                              <Edit2 className="w-2.5 h-2.5" />
                              <span>Değiştir</span>
                            </button>
                          )}
                        </div>
                        {emp.lastActionTime && (
                          <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                            Son hareket: {emp.lastActionTime}
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* QR Badge Button */}
                          <button
                            onClick={() => handleOpenBadge(emp)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-xs font-semibold transition-colors"
                            title="Kimlik Kartı ve QR Kodu Görüntüle / Yazdır"
                          >
                            <QrCode className="w-3.5 h-3.5" />
                            <span>PDKS Kartı</span>
                          </button>

                          {/* Change Photo Button (Direct İK Yöneticisi) */}
                          {canEdit && (
                            <button
                              onClick={() => {
                                setPhotoChangeEmp(emp);
                                setDirectPhotoInput(emp.avatar);
                              }}
                              className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                              title="Profil Fotoğrafını Değiştir (İK Yetkisi)"
                            >
                              <Camera className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {/* Edit Button (Only İK Yöneticisi) */}
                          {canEdit && (
                            <button
                              onClick={() => handleOpenEdit(emp)}
                              className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
                              title="Düzenle"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {/* Delete Button (Admin/Manager Targets Protected for Super Admin Only) */}
                          {(() => {
                            const rowAcc = accounts.find((a) => a.employeeId === emp.id);
                            const delCheck = pdksStorage.canDeleteTargetEmployee(currentUser, emp, rowAcc);
                            if (delCheck.allowed) {
                              return (
                                <button
                                  onClick={() => handleRequestDeleteEmployee(emp)}
                                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                  title="Personeli Sil / Arşivle"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              );
                            }
                            return (
                              <span
                                className="p-1.5 text-slate-300 dark:text-slate-600 cursor-not-allowed"
                                title={delCheck.reason || 'Bu kullanıcıyı silme yetkiniz bulunmamaktadır'}
                              >
                                <Lock className="w-3.5 h-3.5" />
                              </span>
                            );
                          })()}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      </>
      )}

      {/* MODAL: PDKS Kimlik Kartı ve QR Kod Önizleme & Yazdırma */}
      {badgeEmployee && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl overflow-hidden border border-slate-200">
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50 no-print">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-indigo-600" />
                <h3 className="font-bold text-sm text-slate-900">
                  Personel Kimlik Kartı & QR Kod
                </h3>
              </div>
              <button
                onClick={() => setBadgeEmployee(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Printable ID Card Container */}
            <div className="p-6 flex flex-col items-center">
              <div
                id="printable-badge-area"
                className="print-area w-72 rounded-2xl border-2 border-slate-800 bg-white p-5 shadow-lg relative flex flex-col items-center text-center overflow-hidden"
              >
                {/* Security Header Band */}
                <div className="w-full bg-slate-900 text-white py-2 px-3 rounded-lg mb-4 flex items-center justify-between gap-2">
                  <div className="text-[10px] font-bold tracking-wider uppercase text-left truncate">
                    {companyName}
                  </div>
                  <div className="text-[9px] font-mono text-indigo-300 shrink-0">
                    PDKS-ID
                  </div>
                </div>

                {/* Employee Portrait Photo */}
                <div className="relative mb-3">
                  <img
                    src={badgeEmployee.avatar}
                    alt={badgeEmployee.fullName}
                    className="w-24 h-24 rounded-full object-cover border-4 border-slate-100 shadow-sm"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute bottom-0 right-0 w-6 h-6 rounded-full bg-emerald-500 border-2 border-white flex items-center justify-center text-white">
                    <Check className="w-3.5 h-3.5" />
                  </div>
                </div>

                {/* Name & Title */}
                <h4 className="text-base font-bold text-slate-900 leading-tight">
                  {badgeEmployee.fullName}
                </h4>
                <p className="text-xs text-indigo-700 font-semibold mt-0.5">
                  {badgeEmployee.title}
                </p>
                <p className="text-[11px] text-slate-500">
                  {badgeEmployee.department}
                </p>

                {/* High Contrast QR Code */}
                <div className="my-4 p-2 bg-white rounded-xl border border-slate-200 shadow-inner">
                  {badgeQRUrl ? (
                    <img
                      src={badgeQRUrl}
                      alt="Badge QR"
                      className="w-36 h-36 object-contain"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-36 h-36 bg-slate-100 animate-pulse rounded" />
                  )}
                </div>

                {/* Sicil & Micro Details */}
                <div className="w-full border-t border-slate-100 pt-3 flex justify-between items-center text-[11px] font-mono text-slate-500">
                  <span>Sicil: <strong>{badgeEmployee.id}</strong></span>
                  <span>TC: <strong>***{badgeEmployee.tcNo.slice(-4)}</strong></span>
                </div>

                {/* Token string */}
                <div className="text-[9px] text-slate-400 font-mono mt-1">
                  {badgeEmployee.qrToken}
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between no-print">
              <button
                onClick={handleDownloadQR}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                <span>QR İndir</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  onClick={handlePrintBadge}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors shadow-sm"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Kartı Yazdır</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Yeni Personel Ekle / Düzenle */}
      {isAddModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4"
          onClick={() => setIsAddModalOpen(false)}
        >
          <div
            className="bg-white rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden border border-slate-200 flex flex-col max-h-[92vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50 shrink-0">
              <h3 className="font-bold text-base text-slate-900">
                {editingEmployee ? 'Personel Bilgilerini Güncelle' : 'Yeni Personel Kartı Oluştur'}
              </h3>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer"
                aria-label="Kapat"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEmployee} className="p-6 space-y-4 overflow-y-auto flex-1">
              {formError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Ad Soyad *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Örn: Ayşe Gökçen"
                  value={formData.fullName}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    TC Kimlik No
                  </label>
                  <input
                    type="text"
                    maxLength={11}
                    placeholder="11 haneli TC No"
                    value={formData.tcNo}
                    onChange={(e) => setFormData({ ...formData, tcNo: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Departman *
                  </label>
                  <select
                    value={formData.department}
                    onChange={(e) => setFormData({ ...formData, department: e.target.value as Department })}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                  >
                    <option value="Yazılım & Ar-Ge">Yazılım & Ar-Ge</option>
                    <option value="İnsan Kaynakları">İnsan Kaynakları</option>
                    <option value="Muhasebe & Finans">Muhasebe & Finans</option>
                    <option value="Pazarlama & Satış">Pazarlama & Satış</option>
                    <option value="Üretim & Operasyon">Üretim & Operasyon</option>
                    <option value="Lojistik & Depo">Lojistik & Depo</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Ünvan / Pozisyon *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Örn: Yazılım Uzmanı"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Çalışma Vardiyası
                  </label>
                  <select
                    value={formData.shiftId}
                    onChange={(e) => setFormData({ ...formData, shiftId: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                  >
                    {shifts.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Kurumsal E-posta
                  </label>
                  <input
                    type="email"
                    placeholder="isim@example.com"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Telefon No
                  </label>
                  <input
                    type="text"
                    placeholder="+90 5XX XXX XX XX"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Profil Fotoğrafı URL (İsteğe bağlı)
                </label>
                <input
                  type="url"
                  placeholder="https://..."
                  value={formData.avatar}
                  onChange={(e) => setFormData({ ...formData, avatar: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Login Account creation block for new employees */}
              {!editingEmployee && (
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={createAccountWithEmp}
                      onChange={(e) => setCreateAccountWithEmp(e.target.checked)}
                      className="rounded text-indigo-600"
                    />
                    <div className="flex items-center gap-1.5">
                      <Key className="w-3.5 h-3.5 text-indigo-600" />
                      <span className="text-xs font-bold text-slate-800">
                        Bu personel için kullanıcı giriş hesabı oluştur
                      </span>
                    </div>
                  </label>

                  {createAccountWithEmp && (
                    <div className="grid grid-cols-2 gap-3 pt-1">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                          Kullanıcı Adı:
                        </label>
                        <input
                          type="text"
                          placeholder={formData.fullName ? slugifyNameToUsername(formData.fullName) : 'Örn: kullanici.adi'}
                          value={accountUsername}
                          onChange={(e) => setAccountUsername(e.target.value.replace(/^@+/, '').replace(/\s+/g, ''))}
                          className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded-lg bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                          Giriş Şifresi:
                        </label>
                        <input
                          type="text"
                          value={accountPassword}
                          onChange={(e) => setAccountPassword(e.target.value)}
                          className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded-lg bg-white"
                        />
                      </div>
                      <div className="col-span-2 text-[10px] text-emerald-700 bg-emerald-50 p-2 rounded border border-emerald-200">
                        Bu hesap <strong>Personel (Kısıtlı Yetki)</strong> olarak açılacaktır. Kullanıcı yalnızca kendi Giriş/Çıkış, Mola ve dijital QR kartına erişebilir.
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="pt-4 border-t border-slate-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-sm"
                >
                  {editingEmployee ? 'Değişiklikleri Kaydet' : 'Personeli Kaydet ve QR Oluştur'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* User Accounts Management Modal */}
      <UserAccountsModal
        isOpen={isAccountsModalOpen}
        onClose={() => {
          setIsAccountsModalOpen(false);
          setAccountModalEmpId(undefined);
        }}
        currentUser={currentUser}
        onAccountsUpdated={loadData}
        initialSelectedEmpId={accountModalEmpId}
      />

      {/* MODAL 1: PENDING PHOTO REVIEW & APPROVAL (İK Onay Ekranı) */}
      {photoReviewEmp && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
                  <Camera className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">
                    Yeni Profil Fotoğrafı Onayı
                  </h3>
                  <p className="text-xs text-slate-500">
                    Personel tarafından yüklenen yeni fotoğrafı inceleyiniz
                  </p>
                </div>
              </div>
              <button
                onClick={() => setPhotoReviewEmp(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Employee Info Header */}
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs flex items-center justify-between">
              <div>
                <span className="font-bold text-slate-800 text-sm block">{photoReviewEmp.fullName}</span>
                <span className="text-slate-500">{photoReviewEmp.department} · {photoReviewEmp.title}</span>
              </div>
              <span className="font-mono text-xs font-semibold px-2 py-1 rounded bg-white text-indigo-700 border border-slate-200">
                {photoReviewEmp.id}
              </span>
            </div>

            {/* Side-by-side comparison */}
            <div className="grid grid-cols-2 gap-4">
              {/* Existing active photo */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-center space-y-2">
                <span className="text-xs font-semibold text-slate-600 block">Mevcut Aktif Fotoğraf</span>
                <img
                  src={photoReviewEmp.avatar}
                  alt="Mevcut"
                  className="w-28 h-28 rounded-2xl object-cover mx-auto border-2 border-slate-300 shadow-xs"
                  referrerPolicy="no-referrer"
                />
                <span className="inline-block text-[10px] font-bold text-slate-500 bg-white px-2 py-0.5 rounded-full border border-slate-200">
                  Şu Anda Kullanılan
                </span>
              </div>

              {/* New submitted photo */}
              <div className="bg-amber-50/70 p-4 rounded-xl border-2 border-amber-300 text-center space-y-2">
                <span className="text-xs font-bold text-amber-900 block">Yüklenen Yeni Fotoğraf</span>
                <img
                  src={photoReviewEmp.pendingAvatar || photoReviewEmp.avatar}
                  alt="Yeni Yüklenen"
                  className="w-28 h-28 rounded-2xl object-cover mx-auto border-2 border-amber-500 shadow-md"
                  referrerPolicy="no-referrer"
                />
                <span className="inline-block text-[10px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full border border-amber-300">
                  ⏳ İK Onayı Bekliyor
                </span>
              </div>
            </div>

            {photoReviewEmp.pendingAvatarDate && (
              <div className="text-[11px] text-slate-500 text-center">
                Yükleme Tarihi: {new Date(photoReviewEmp.pendingAvatarDate).toLocaleString('tr-TR')}
              </div>
            )}

            {/* Actions */}
            <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setPhotoReviewEmp(null)}
                className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Kapat
              </button>
              <button
                type="button"
                onClick={() => handleRejectPhoto(photoReviewEmp.id)}
                className="px-4 py-2 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl flex items-center gap-1.5 transition-colors"
              >
                <X className="w-4 h-4" />
                <span>Fotoğrafı Reddet</span>
              </button>
              <button
                type="button"
                onClick={() => handleApprovePhoto(photoReviewEmp.id)}
                className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 shadow-sm rounded-xl flex items-center gap-1.5 transition-colors"
              >
                <Check className="w-4 h-4" />
                <span>Onayla ve Aktifleştir</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: DIRECT PHOTO CHANGE (İK Yöneticisi Doğrudan Değiştirme) */}
      {photoChangeEmp && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center">
                  <Camera className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">
                    Profil Fotoğrafını Değiştir (İK Yetkisi)
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    {photoChangeEmp.fullName} için fotoğrafı doğrudan güncelleyin
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setPhotoChangeEmp(null);
                  setDirectPhotoInput('');
                }}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Current/Preview Avatar */}
            <div className="flex flex-col items-center justify-center py-2 space-y-2">
              <div className="relative">
                <img
                  src={directPhotoInput || photoChangeEmp.avatar}
                  alt={photoChangeEmp.fullName}
                  className="w-24 h-24 rounded-full object-cover border-4 border-indigo-100 shadow-md"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs shadow">
                  <Camera className="w-3.5 h-3.5" />
                </div>
              </div>
              <span className="text-[11px] font-semibold text-slate-500">
                Canlı Önizleme
              </span>
            </div>

            {/* Upload from file */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Cihazdan Yeni Fotoğraf Yükle:
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={handleDirectFileUpload}
                className="w-full text-xs text-slate-600 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 cursor-pointer"
              />
            </div>

            {/* Or custom URL */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Veya Fotoğraf Web Bağlantısı (URL):
              </label>
              <input
                type="url"
                value={directPhotoInput}
                onChange={(e) => setDirectPhotoInput(e.target.value)}
                placeholder="https://images.unsplash.com/..."
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Quick preset avatars */}
            <div>
              <span className="block text-[11px] font-semibold text-slate-500 mb-1.5">
                Örnek Kurumsal Fotoğraflar:
              </span>
              <div className="flex items-center gap-2">
                {[
                  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=256&h=256&q=80',
                  'https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=256&h=256&q=80',
                  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=256&h=256&q=80',
                  'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=256&h=256&q=80',
                  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=256&h=256&q=80',
                ].map((presetUrl, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setDirectPhotoInput(presetUrl)}
                    className={`w-9 h-9 rounded-full overflow-hidden border-2 transition-transform hover:scale-110 ${
                      directPhotoInput === presetUrl ? 'border-indigo-600 ring-2 ring-indigo-200' : 'border-slate-200'
                    }`}
                  >
                    <img src={presetUrl} alt="Preset" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setPhotoChangeEmp(null);
                  setDirectPhotoInput('');
                }}
                className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                İptal
              </button>
              <button
                type="button"
                onClick={() => handleSaveDirectPhoto(photoChangeEmp.id, directPhotoInput || photoChangeEmp.avatar)}
                className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 shadow-sm rounded-xl"
              >
                Doğrudan Kaydet & Aktifleştir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 5: EXCEL İLE TOPLU PERSONEL EKLEME MODALI */}
      <ExcelEmployeeImportModal
        isOpen={isExcelModalOpen}
        onClose={() => setIsExcelModalOpen(false)}
        shifts={shifts}
        onSuccess={(count) => {
          loadData();
          setPhotoNotice(`${count} yeni çalışan Excel listesinden başarıyla içe aktarıldı ve PDKS kartları oluşturuldu.`);
          setTimeout(() => setPhotoNotice(null), 5000);
        }}
      />

      {/* MODAL 6: MEVCUT DURUM MANUEL DÜZENLEME MODALI (İK Yetkisi - Kart Unutma vb.) */}
      {presenceEditEmp && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-700 flex items-center justify-center">
                  <Clock className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Mevcut Durumu Güncelle</h3>
                  <p className="text-[11px] text-slate-500">
                    {presenceEditEmp.fullName} · {presenceEditEmp.department}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPresenceEditEmp(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSavePresenceChange} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-2">
                  Yeni Mevcut Durum Seçin
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setPresenceTarget('inside')}
                    className={`p-2.5 rounded-xl border text-center text-xs font-semibold transition-all cursor-pointer flex flex-col items-center gap-1.5 ${
                      presenceTarget === 'inside'
                        ? 'bg-emerald-50 border-emerald-500 text-emerald-800 ring-2 ring-emerald-500/20'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                    <span>Ofiste</span>
                    <span className="text-[10px] opacity-80 font-normal">İçeride</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPresenceTarget('break')}
                    className={`p-2.5 rounded-xl border text-center text-xs font-semibold transition-all cursor-pointer flex flex-col items-center gap-1.5 ${
                      presenceTarget === 'break'
                        ? 'bg-amber-50 border-amber-500 text-amber-800 ring-2 ring-amber-500/20'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                    <span>Molada</span>
                    <span className="text-[10px] opacity-80 font-normal">Ara / Dinlenme</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPresenceTarget('outside')}
                    className={`p-2.5 rounded-xl border text-center text-xs font-semibold transition-all cursor-pointer flex flex-col items-center gap-1.5 ${
                      presenceTarget === 'outside'
                        ? 'bg-slate-100 border-slate-400 text-slate-900 ring-2 ring-slate-400/20'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full bg-slate-400" />
                    <span>Ofis Dışında</span>
                    <span className="text-[10px] opacity-80 font-normal">Çıkış Yaptı</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    İşlem Saati
                  </label>
                  <input
                    type="time"
                    required
                    value={presenceTime}
                    onChange={(e) => setPresenceTime(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Açıklama / Neden
                  </label>
                  <input
                    type="text"
                    value={presenceNote}
                    onChange={(e) => setPresenceNote(e.target.value)}
                    placeholder="Örn: Kart basmayı unuttu"
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <label className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={recordPresenceLog}
                  onChange={(e) => setRecordPresenceLog(e.target.checked)}
                  className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                />
                <div className="text-xs">
                  <span className="font-semibold text-slate-800 block">
                    Geçiş kayıtlarına manuel hareket ekle
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Canlı Pano ve Kayıtlar geçmişinde İK manuel düzenlemesi olarak görünür.
                  </span>
                </div>
              </label>

              <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setPresenceEditEmp(null)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-sm flex items-center gap-1.5 cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Durumu Kaydet</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Personel Soft-Delete / Arşivleme Onayı */}
      {deleteTargetEmp && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-700 space-y-4">
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-500/20 border border-rose-200 dark:border-rose-500/40 text-rose-600 dark:text-rose-300 flex items-center justify-center shrink-0">
                  <Archive className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Personeli Sil ve Eski Personel Olarak Arşivle
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {deleteTargetEmp.fullName} ({deleteTargetEmp.id}) · {deleteTargetEmp.department}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDeleteTargetEmp(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-700/60 text-xs text-amber-900 dark:text-amber-200 space-y-1.5">
              <div className="font-bold flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                <span>Bu İşlemin Sonuçları:</span>
              </div>
              <ul className="list-disc pl-4 space-y-1 text-[11px]">
                <li>Personel aktif personel listesinden, vardiya planlarından, yetki atamalarından ve giriş-çıkış ekranlarından kaldırılır.</li>
                <li>Aktif yetkileri sıfırlanır ve sisteme tekrar giriş yapamaz.</li>
                <li>Temel kimlik bilgileri ve tüm geçmiş PDKS (giriş-çıkış/mola) kayıtları silinmez; salt okunur <strong>Eski Personel Listesi</strong> arşivinde korunur.</li>
              </ul>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={isDeletingEmp}
                onClick={() => setDeleteTargetEmp(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
              >
                İptal
              </button>
              <button
                type="button"
                disabled={isDeletingEmp}
                onClick={() => void handleConfirmArchiveEmployee()}
                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-sm flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isDeletingEmp ? 'Arşivleniyor...' : 'Sil ve Arşivle'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
