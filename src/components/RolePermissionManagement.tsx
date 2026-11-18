import React, { useState, useEffect, useMemo } from 'react';
import {
  ShieldAlert,
  Key,
  Trash2,
  Smartphone,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Search,
  Lock,
  Unlock,
  Users,
  BellOff,
  Sliders,
  EyeOff,
  Sparkles,
  Check,
  Edit3,
  X,
  Palette,
  LogOut,
  Crown,
  ShieldCheck,
  UserCog,
} from 'lucide-react';
import {
  AppPageKey,
  CurrentUser,
  UserAccount,
  UserCustomPermissions,
  UserRole,
} from '../types/pdks';
import {
  ALL_APP_PAGES,
  DELEGATED_FULL_ADMIN_PERMISSIONS,
  getDefaultPermissionsForRole,
  pdksStorage,
} from '../services/storage';
import { CompanySettingsPanel } from './CompanySettingsPanel';

interface RolePermissionManagementProps {
  currentUser: CurrentUser;
  onOpenLogoManager?: () => void;
  onOpenWallQR?: () => void;
  onOpenThemeSettings?: () => void;
  onLogout?: () => void;
}

const PAGE_LABELS: Record<AppPageKey, { label: string; desc: string }> = {
  dashboard: { label: 'Canlı Pano', desc: 'Anlık özet, bildirimler & canlı akış' },
  employees: { label: 'Personel Yönetimi', desc: 'Personel kartları, cihaz & hesap listesi' },
  records: { label: 'Geçiş Kayıtları', desc: 'PDKS giriş-çıkış hareket logları' },
  shifts: { label: 'Vardiya & İzin', desc: 'Vardiya planlama, izin & fazla mesai' },
  performance: { label: 'Performans Analizi', desc: 'İşe geliş istikrarı & skor analizleri' },
  reports: { label: 'Rapor Görüntüleme', desc: 'Tarih bazlı detaylı analiz & çıktılar' },
  kiosk: { label: 'Kiosk Terminali', desc: 'Turnike kamera & QR terminal ekranı' },
  portal: { label: 'Mobil Portal', desc: 'Personel QR okutma & izin talep ekranı' },
};

type BooleanActionKey = keyof Omit<UserCustomPermissions, 'allowedPages' | 'isFullAdmin'>;

const ACTION_PERMISSION_ITEMS: {
  key: BooleanActionKey;
  label: string;
  desc: string;
}[] = [
  { key: 'canCreate', label: 'Personel / Kayıt Ekleme', desc: 'Yeni personel, vardiya veya manuel kayıt oluşturma' },
  { key: 'canEdit', label: 'Bilgi Düzenleme', desc: 'Personel, durum ve vardiya bilgilerini güncelleme' },
  { key: 'canDelete', label: 'Personel / Kayıt Silme', desc: 'Personel veya vardiya kayıtlarını silme' },
  { key: 'canApprove', label: 'Onaylama Yetkisi', desc: 'İzin, mesai, fotoğraf ve yeni cihaz giriş onayları' },
  { key: 'canExportReports', label: 'Rapor Alma (Excel/PDF)', desc: 'CSV / Excel & yazdırılabilir rapor dışa aktarma' },
  { key: 'canManageDevices', label: 'Cihaz Sıfırlama', desc: 'Personel kayıtlı cihaz / MAC eşleşmesini sıfırlama' },
  { key: 'canManageSettings', label: 'Duvar QR Yönetimi & Logo', desc: 'Şirket logosu ve sabit duvar QR yönetimi' },
  { key: 'canClearLogs', label: 'Log Temizleme', desc: 'Giriş-çıkış geçiş hareket loglarını temizleme' },
  { key: 'canManagePermissions', label: 'Alt Yetki Tanımlama', desc: 'Kullanıcı Yetkilendirme panelinden kendi havuzu içinde yetki atama' },
];

const ASSIGNABLE_ROLES: { value: Exclude<UserRole, 'SUPER_ADMIN'>; label: string }[] = [
  { value: 'ik_yoneticisi', label: 'İK Yöneticisi' },
  { value: 'birim_amiri', label: 'Birim Amiri' },
  { value: 'yonetici', label: 'Bölüm Yöneticisi' },
  { value: 'personel', label: 'Personel' },
  { value: 'guvenlik', label: 'Turnike Görevlisi' },
];

export const RolePermissionManagement: React.FC<RolePermissionManagementProps> = ({
  currentUser,
  onOpenLogoManager,
  onOpenWallQR,
  onOpenThemeSettings,
  onLogout,
}) => {
  const isSuperAdmin = pdksStorage.isSuperAdmin(currentUser);
  const canAccessPermissions = pdksStorage.canAccessPermissions(currentUser);
  const isActorFullAdmin = pdksStorage.isFullAdminAccount(currentUser);
  const actorPerms = pdksStorage.getEffectivePermissions(currentUser);
  const canManageSettings = pdksStorage.canAccessSettings(currentUser);
  const canManageDevices = pdksStorage.canManageDevices(currentUser);
  const canClearLogs = pdksStorage.canClearLogs(currentUser);

  const [accounts, setAccounts] = useState<UserAccount[]>([]);
  const [employeesMap, setEmployeesMap] = useState<
    Record<string, { registeredDeviceId?: string; registeredMacAddress?: string; registeredDeviceName?: string }>
  >({});
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');

  // Two-step inline confirmations (never use window.confirm)
  const [confirmClearLogs, setConfirmClearLogs] = useState(false);
  const [confirmClearNotifs, setConfirmClearNotifs] = useState(false);
  const [confirmResetAllDevices, setConfirmResetAllDevices] = useState(false);
  const [confirmResetDemo, setConfirmResetDemo] = useState(false);

  // Feedback banner
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [savingAccountId, setSavingAccountId] = useState<string | null>(null);
  const [editingUsernameAccId, setEditingUsernameAccId] = useState<string | null>(null);
  const [draftUsername, setDraftUsername] = useState<string>('');

  const showFeedback = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => {
      setFeedback((prev) => (prev?.message === message ? null : prev));
    }, 5000);
  };

  const loadData = () => {
    const visibleAccounts = pdksStorage.getUserAccounts();
    setAccounts(visibleAccounts);
    const emps = pdksStorage.getEmployees();
    const map: Record<
      string,
      { registeredDeviceId?: string; registeredMacAddress?: string; registeredDeviceName?: string }
    > = {};
    emps.forEach((e) => {
      map[e.id] = {
        registeredDeviceId: e.registeredDeviceId,
        registeredMacAddress: e.registeredMacAddress,
        registeredDeviceName: e.registeredDeviceName,
      };
    });
    setEmployeesMap(map);
  };

  useEffect(() => {
    if (!canAccessPermissions) return;
    loadData();
    const handleSync = () => loadData();
    window.addEventListener('pdks-data-synced', handleSync);
    return () => window.removeEventListener('pdks-data-synced', handleSync);
  }, [canAccessPermissions]);

  const filteredAccounts = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return accounts.filter((acc) => {
      const matchesSearch =
        !q ||
        acc.name.toLowerCase().includes(q) ||
        acc.username.toLowerCase().includes(q) ||
        acc.employeeId.toLowerCase().includes(q) ||
        (acc.department || '').toLowerCase().includes(q);
      const matchesRole = roleFilter === 'all' || acc.role === roleFilter;
      return matchesSearch && matchesRole;
    });
  }, [accounts, searchQuery, roleFilter]);

  useEffect(() => {
    if (filteredAccounts.length === 0) return;
    const stillExists = filteredAccounts.some((a) => a.id === selectedAccountId);
    if (!stillExists) {
      const firstEditable = filteredAccounts.find((a) =>
        pdksStorage.canModifyTargetPermissions(currentUser, a).allowed
      );
      setSelectedAccountId((firstEditable || filteredAccounts[0]).id);
    }
  }, [filteredAccounts, selectedAccountId, currentUser]);

  if (!canAccessPermissions) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <div className="bg-white border border-rose-200 rounded-2xl p-8 shadow-xs space-y-3">
          <Lock className="w-10 h-10 text-rose-500 mx-auto" />
          <h2 className="text-lg font-bold text-slate-900">Yetkisiz Erişim</h2>
          <p className="text-xs text-slate-500">
            Kullanıcı yetkilendirme ekranına erişim için Tam Yetki veya Alt Yetki Tanımlama izniniz bulunmalıdır.
          </p>
        </div>
      </div>
    );
  }

  const getAccountPermissions = (acc: UserAccount): UserCustomPermissions => {
    return pdksStorage.getEffectivePermissions(acc);
  };

  const selectedAccount =
    filteredAccounts.find((a) => a.id === selectedAccountId) ||
    accounts.find((a) => a.id === selectedAccountId) ||
    filteredAccounts[0] ||
    null;

  const applyPermissionUpdate = async (
    acc: UserAccount,
    nextPerms: UserCustomPermissions,
    nextRole?: UserRole,
    label?: string
  ) => {
    const modCheck = pdksStorage.canModifyTargetPermissions(currentUser, acc);
    if (!modCheck.allowed) {
      showFeedback('error', modCheck.reason || 'Bu kullanıcının yetkilerini değiştirme izniniz yok.');
      return;
    }

    setSavingAccountId(acc.id);
    const res = await pdksStorage.updateUserCustomPermissions(acc.id, nextPerms, nextRole);
    setSavingAccountId(null);
    if (res.success) {
      loadData();
      showFeedback('success', label || `${acc.name} yetkileri anlık olarak güncellendi.`);
    } else {
      showFeedback('error', res.message);
    }
  };

  const handleStartUsernameEdit = (acc: UserAccount) => {
    if (!isSuperAdmin) return;
    setEditingUsernameAccId(acc.id);
    setDraftUsername(acc.username);
  };

  const handleCancelUsernameEdit = () => {
    setEditingUsernameAccId(null);
    setDraftUsername('');
  };

  const handleSaveUsername = async (acc: UserAccount) => {
    if (!isSuperAdmin) return;
    const trimmed = draftUsername.trim().replace(/^@+/, '');
    if (!trimmed) {
      showFeedback('error', 'Kullanıcı adı boş bırakılamaz.');
      return;
    }
    setSavingAccountId(acc.id);
    const res = await pdksStorage.updateUsernameSuperAdmin(acc.id, trimmed);
    setSavingAccountId(null);
    if (res.success) {
      setEditingUsernameAccId(null);
      setDraftUsername('');
      loadData();
      showFeedback('success', res.message);
    } else {
      showFeedback('error', res.message);
    }
  };

  const handleToggleFullAdmin = (acc: UserAccount) => {
    if (!isSuperAdmin) {
      showFeedback('error', 'Tam Yetki (Full Admin) statüsü yalnızca Süper Admin tarafından atanabilir.');
      return;
    }
    const cur = getAccountPermissions(acc);
    const nextIsFull = !cur.isFullAdmin;
    const nextPerms: UserCustomPermissions = nextIsFull
      ? {
          ...DELEGATED_FULL_ADMIN_PERMISSIONS,
          allowedPages: [...DELEGATED_FULL_ADMIN_PERMISSIONS.allowedPages],
          canChangeCompanyName: false,
          canManagePermissions: true,
          isFullAdmin: true,
        }
      : {
          ...cur,
          canChangeCompanyName: false,
          isFullAdmin: false,
          canManagePermissions: false,
        };
    void applyPermissionUpdate(
      acc,
      nextPerms,
      acc.role,
      nextIsFull
        ? `${acc.name} kullanıcısına Tam Yetki (Full Admin · Kullanıcı Yetkilendirme) tanımlandı.`
        : `${acc.name} kullanıcısının Tam Yetki (Full Admin) statüsü kaldırıldı.`
    );
  };

  const handleTogglePage = (acc: UserAccount, page: AppPageKey) => {
    const cur = getAccountPermissions(acc);
    const exists = cur.allowedPages.includes(page);
    if (!isSuperAdmin && !actorPerms.allowedPages.includes(page)) {
      showFeedback('error', `Yetki Sınırı: Kendi havuzunuzda olmayan '${PAGE_LABELS[page].label}' modülünü veremezsiniz.`);
      return;
    }
    const updatedPages = exists
      ? cur.allowedPages.filter((p) => p !== page)
      : [...cur.allowedPages, page];
    void applyPermissionUpdate(
      acc,
      { ...cur, allowedPages: updatedPages },
      acc.role,
      `${acc.name} için '${PAGE_LABELS[page].label}' modül erişimi ${exists ? 'kaldırıldı' : 'verildi'}.`
    );
  };

  const handleToggleAction = (
    acc: UserAccount,
    key: BooleanActionKey,
    actionLabel: string
  ) => {
    const cur = getAccountPermissions(acc);
    const nextVal = !cur[key];
    if (!isSuperAdmin && !actorPerms[key]) {
      showFeedback('error', `Yetki Sınırı: Sahip olmadığınız '${actionLabel}' iznini tanımlayamazsınız.`);
      return;
    }
    const nextPerms: UserCustomPermissions = { ...cur, [key]: nextVal };
    if (key === 'canManagePermissions' && !nextVal && cur.isFullAdmin && isSuperAdmin) {
      nextPerms.isFullAdmin = false;
    }
    void applyPermissionUpdate(
      acc,
      nextPerms,
      acc.role,
      `${acc.name} için '${actionLabel}' yetkisi ${nextVal ? 'açıldı' : 'kapatıldı'}.`
    );
  };

  const handleRoleChange = (acc: UserAccount, newRole: Exclude<UserRole, 'SUPER_ADMIN'>) => {
    const template = getDefaultPermissionsForRole(newRole, acc.isShiftSupervisor);
    const safePerms = isSuperAdmin
      ? {
          ...template,
          isFullAdmin: acc.customPermissions?.isFullAdmin ?? false,
          canManagePermissions: acc.customPermissions?.canManagePermissions ?? false,
          canChangeCompanyName: false,
        }
      : pdksStorage.clampDelegatedPermissionsToActorPool(currentUser, template, acc);
    void applyPermissionUpdate(
      acc,
      safePerms,
      newRole,
      `${acc.name} rolü '${ASSIGNABLE_ROLES.find((r) => r.value === newRole)?.label || newRole}' olarak güncellendi.`
    );
  };

  const applyPreset = (
    acc: UserAccount,
    preset: 'full_admin' | 'full_hr' | 'shift_supervisor' | 'report_viewer' | 'restricted_portal'
  ) => {
    if (preset === 'full_admin') {
      if (!isSuperAdmin) {
        showFeedback('error', 'Tam Yetki şablonu yalnızca Süper Admin tarafından uygulanabilir.');
        return;
      }
      void applyPermissionUpdate(
        acc,
        {
          ...DELEGATED_FULL_ADMIN_PERMISSIONS,
          allowedPages: [...DELEGATED_FULL_ADMIN_PERMISSIONS.allowedPages],
          canChangeCompanyName: false,
          isFullAdmin: true,
          canManagePermissions: true,
        },
        acc.role,
        `${acc.name} kullanıcısına Tam Yetki (Full Admin) şablonu uygulandı.`
      );
      return;
    }

    let rawTemplate: UserCustomPermissions;
    let presetLabel = '';
    if (preset === 'full_hr') {
      rawTemplate = getDefaultPermissionsForRole('ik_yoneticisi');
      presetLabel = 'Tam İK Yetkisi';
    } else if (preset === 'shift_supervisor') {
      rawTemplate = getDefaultPermissionsForRole('birim_amiri');
      presetLabel = 'Vardiya & Onay Yetkilisi';
    } else if (preset === 'report_viewer') {
      rawTemplate = {
        allowedPages: ['dashboard', 'records', 'performance', 'reports', 'portal'],
        canCreate: false,
        canEdit: false,
        canDelete: false,
        canApprove: false,
        canExportReports: true,
        canManageDevices: false,
        canManageSettings: false,
        canClearLogs: false,
        canChangeCompanyName: false,
        canManagePermissions: false,
        isFullAdmin: false,
      };
      presetLabel = 'Raporlama Görüntüleyici';
    } else {
      rawTemplate = getDefaultPermissionsForRole('personel');
      presetLabel = 'Sadece Kiosk & Portal';
    }

    const safePerms = isSuperAdmin
      ? rawTemplate
      : pdksStorage.clampDelegatedPermissionsToActorPool(currentUser, rawTemplate, acc);
    void applyPermissionUpdate(
      acc,
      safePerms,
      acc.role,
      `${acc.name} için '${presetLabel}' şablonu${!isSuperAdmin ? ' (yetki havuzunuza göre filtrelenerek)' : ''} uygulandı.`
    );
  };

  const handleClearLogs = async () => {
    const res = await pdksStorage.clearAttendanceLogs('all');
    setConfirmClearLogs(false);
    if (res.success) {
      showFeedback('success', res.message);
    } else {
      showFeedback('error', res.message);
    }
  };

  const handleClearNotifications = () => {
    pdksStorage.clearAllNotifications();
    setConfirmClearNotifs(false);
    showFeedback('success', 'Tüm sistem bildirimleri temizlendi.');
  };

  const handleResetAllDevices = async () => {
    const res = await pdksStorage.resetDeviceSuperAdmin('all');
    setConfirmResetAllDevices(false);
    if (res.success) {
      showFeedback('success', res.message);
      loadData();
    } else {
      showFeedback('error', res.message);
    }
  };

  const handleResetSingleDevice = async (acc: UserAccount) => {
    if (!canManageDevices) {
      showFeedback('error', 'Cihaz sıfırlama yetkiniz bulunmamaktadır.');
      return;
    }
    const res = await pdksStorage.resetDeviceSuperAdmin(acc.employeeId);
    if (res.success) {
      showFeedback('success', `${acc.name} için kayıtlı cihaz / MAC eşleşmesi sıfırlandı.`);
      loadData();
    } else {
      showFeedback('error', res.message);
    }
  };

  const handleResetToDemo = () => {
    if (!isSuperAdmin) return;
    try {
      pdksStorage.resetToDemo(currentUser);
      setConfirmResetDemo(false);
      loadData();
      showFeedback('success', 'Tüm PDKS verileri başlangıç durumuna sıfırlandı.');
    } catch (err: any) {
      showFeedback('error', err?.message || 'Sıfırlama sırasında hata oluştu.');
    }
  };

  const selectedPerms = selectedAccount ? getAccountPermissions(selectedAccount) : null;
  const selectedDevice = selectedAccount ? employeesMap[selectedAccount.employeeId] : undefined;
  const selectedModCheck = selectedAccount
    ? pdksStorage.canModifyTargetPermissions(currentUser, selectedAccount)
    : { allowed: false };
  const isSelectedSaving = Boolean(selectedAccount && savingAccountId === selectedAccount.id);

  const actorOwnedActionCount = ACTION_PERMISSION_ITEMS.filter((i) => Boolean(actorPerms[i.key])).length;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
      {/* Header */}
      <div className="bg-white border border-purple-200 rounded-2xl p-5 sm:p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-purple-600 text-white flex items-center justify-center shadow-sm shrink-0">
            {isSuperAdmin ? <ShieldAlert className="w-6 h-6" /> : <UserCog className="w-6 h-6" />}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
                {isSuperAdmin ? 'Yetki & Rol Yönetimi' : 'Kullanıcı Yetkilendirme'}
              </h1>
              {isSuperAdmin ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
                  <EyeOff className="w-3 h-3" />
                  Gizli Süper Yönetici Modu
                </span>
              ) : isActorFullAdmin ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                  <Crown className="w-3 h-3 text-amber-700" />
                  Tam Yetkili Yönetici · Yetki Devri Aktif
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
                  <ShieldCheck className="w-3 h-3" />
                  Alt Yetki Yöneticisi
                </span>
              )}
            </div>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              {isSuperAdmin
                ? 'Oturumunuz personel tablolarında, loglarda, bildirimlerde ve raporlarda tamamen görünmezdir. Tüm kullanıcılara Tam Yetki veya özel yetki havuzu tanımlayabilirsiniz.'
                : 'Sadece kendi yetki havuzunuz dahilindeki modül ve işlem izinlerini alt personel ve birim amirlerine tanımlayabilirsiniz. Kendi yetkiniz ve aynı seviyedeki Tam Yetkili hesaplar güvenlik kilidi altındadır.'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {canManageSettings && onOpenLogoManager && (
            <button
              type="button"
              onClick={onOpenLogoManager}
              className="px-3.5 py-2 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-xl transition-colors cursor-pointer"
            >
              Şirket Logosu
            </button>
          )}
          {canManageSettings && onOpenWallQR && (
            <button
              type="button"
              onClick={onOpenWallQR}
              className="px-3.5 py-2 text-xs font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-xl transition-colors cursor-pointer"
            >
              Duvar QR Yönetimi
            </button>
          )}
          {onOpenThemeSettings && (
            <button
              type="button"
              onClick={onOpenThemeSettings}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-xl transition-colors cursor-pointer"
            >
              <Palette className="w-3.5 h-3.5 text-indigo-600" />
              <span>Tema Ayarları</span>
            </button>
          )}
          {onLogout && (
            <button
              type="button"
              onClick={onLogout}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5 text-rose-600" />
              <span>Çıkış Yap</span>
            </button>
          )}
        </div>
      </div>

      {/* Delegated Admin Permission Pool Summary */}
      {!isSuperAdmin && (
        <div className="bg-amber-50/80 border border-amber-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <ShieldCheck className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-950 space-y-0.5">
              <div className="font-bold">
                Yetki Dağıtım Sınırınız Aktif ({actorPerms.allowedPages.length}/{ALL_APP_PAGES.length} Modül · {actorOwnedActionCount}/{ACTION_PERMISSION_ITEMS.length} İşlem İzni)
              </div>
              <p className="text-[11px] text-amber-800">
                Yalnızca kendi sahip olduğunuz yetkileri dağıtabilirsiniz. Kendi hesabınızın yetkisini düşüremez ve aynı seviyedeki başka bir Tam Yetkili yöneticiyi düzenleyemezsiniz.
              </p>
            </div>
          </div>
          <span className="text-[11px] font-mono font-bold px-2.5 py-1 rounded-lg bg-white border border-amber-200 text-amber-900 shrink-0">
            @{currentUser.username}
          </span>
        </div>
      )}

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`p-4 rounded-xl border text-xs font-semibold flex items-center gap-2.5 animate-fade-in ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Section 1: Super-Admin-Only Company Name Settings & Permitted Maintenance Controls */}
      {(isSuperAdmin || canClearLogs || canManageDevices) && (
        <div className={`grid grid-cols-1 ${isSuperAdmin ? 'lg:grid-cols-2' : ''} gap-6`}>
          {isSuperAdmin && (
            <CompanySettingsPanel
              currentUser={currentUser}
              compact
              onCompanyUpdated={() => loadData()}
            />
          )}

          {(isSuperAdmin || canClearLogs || canManageDevices) && (
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
              <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100">
                <Sliders className="w-5 h-5 text-rose-600" />
                <div>
                  <h2 className="text-sm font-bold text-slate-900">Sistem Bakım & Güvenlik Kontrolleri</h2>
                  <p className="text-[11px] text-slate-500">
                    Yetki havuzunuzdaki log temizleme ve cihaz sıfırlama kontrolleri.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(isSuperAdmin || canClearLogs) && (
                  !confirmClearLogs ? (
                    <button
                      type="button"
                      onClick={() => setConfirmClearLogs(true)}
                      className="p-3 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-left transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2 text-xs font-bold text-rose-800">
                        <Trash2 className="w-4 h-4 text-rose-600" />
                        <span>Tüm PDKS Loglarını Temizle</span>
                      </div>
                      <p className="text-[10px] text-rose-700 mt-1">
                        Tüm giriş/çıkış ve cihaz güvenlik kayıtlarını siler.
                      </p>
                    </button>
                  ) : (
                    <div className="p-3 rounded-xl border border-rose-400 bg-rose-50 space-y-2">
                      <div className="text-[11px] font-bold text-rose-900">
                        Tüm giriş-çıkış logları kalıcı silinsin mi?
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleClearLogs}
                          className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-[11px] font-bold cursor-pointer"
                        >
                          Evet, Temizle
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmClearLogs(false)}
                          className="px-3 py-1 bg-white border border-slate-200 text-slate-700 rounded-lg text-[11px] font-semibold cursor-pointer"
                        >
                          Vazgeç
                        </button>
                      </div>
                    </div>
                  )
                )}

                {(isSuperAdmin || canManageDevices) && (
                  !confirmResetAllDevices ? (
                    <button
                      type="button"
                      onClick={() => setConfirmResetAllDevices(true)}
                      className="p-3 rounded-xl border border-amber-200 bg-amber-50 hover:bg-amber-100 text-left transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2 text-xs font-bold text-amber-900">
                        <Smartphone className="w-4 h-4 text-amber-600" />
                        <span>Tüm Kayıtlı Cihazları Sıfırla</span>
                      </div>
                      <p className="text-[10px] text-amber-800 mt-1">
                        Tüm personellerin MAC / Device ID eşleşmesini sıfırlar.
                      </p>
                    </button>
                  ) : (
                    <div className="p-3 rounded-xl border border-amber-400 bg-amber-50 space-y-2">
                      <div className="text-[11px] font-bold text-amber-900">
                        Tüm kayıtlı cihaz eşleşmeleri sıfırlansın mı?
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleResetAllDevices}
                          className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-[11px] font-bold cursor-pointer"
                        >
                          Evet, Sıfırla
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmResetAllDevices(false)}
                          className="px-3 py-1 bg-white border border-slate-200 text-slate-700 rounded-lg text-[11px] font-semibold cursor-pointer"
                        >
                          Vazgeç
                        </button>
                      </div>
                    </div>
                  )
                )}

                {isSuperAdmin && (
                  !confirmClearNotifs ? (
                    <button
                      type="button"
                      onClick={() => setConfirmClearNotifs(true)}
                      className="p-3 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-left transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                        <BellOff className="w-4 h-4 text-slate-600" />
                        <span>Tüm Bildirimleri Temizle</span>
                      </div>
                      <p className="text-[10px] text-slate-500 mt-1">
                        Yönetici ve personel bildirim kutusunu boşaltır.
                      </p>
                    </button>
                  ) : (
                    <div className="p-3 rounded-xl border border-slate-400 bg-slate-50 space-y-2">
                      <div className="text-[11px] font-bold text-slate-900">
                        Tüm bildirimler temizlensin mi?
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleClearNotifications}
                          className="px-3 py-1 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-[11px] font-bold cursor-pointer"
                        >
                          Onayla
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmClearNotifs(false)}
                          className="px-3 py-1 bg-white border border-slate-200 text-slate-700 rounded-lg text-[11px] font-semibold cursor-pointer"
                        >
                          İptal
                        </button>
                      </div>
                    </div>
                  )
                )}

                {isSuperAdmin && (
                  !confirmResetDemo ? (
                    <button
                      type="button"
                      onClick={() => setConfirmResetDemo(true)}
                      className="p-3 rounded-xl border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-left transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2 text-xs font-bold text-indigo-900">
                        <RotateCcw className="w-4 h-4 text-indigo-600" />
                        <span>Demo Verilerine Sıfırla</span>
                      </div>
                      <p className="text-[10px] text-indigo-700 mt-1">
                        Sistemi temiz başlangıç verilerine döndürür.
                      </p>
                    </button>
                  ) : (
                    <div className="p-3 rounded-xl border border-indigo-400 bg-indigo-50 space-y-2">
                      <div className="text-[11px] font-bold text-indigo-900">
                        Demo verilerine dönülsün mü?
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleResetToDemo}
                          className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[11px] font-bold cursor-pointer"
                        >
                          Sıfırla
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmResetDemo(false)}
                          className="px-3 py-1 bg-white border border-slate-200 text-slate-700 rounded-lg text-[11px] font-semibold cursor-pointer"
                        >
                          İptal
                        </button>
                      </div>
                    </div>
                  )
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Section 2: Master-Detail User Selector & Hierarchical Permission Assignment */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
        <div className="p-5 sm:p-6 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-600 flex items-center justify-center shrink-0">
              <Key className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                {isSuperAdmin
                  ? 'Hiyerarşik Yetki & Rol Tanımlama Paneli'
                  : 'Kullanıcı & Alt Yönetici Yetki Dağıtım Paneli'}
              </h2>
              <p className="text-xs text-slate-500">
                Soldan bir kullanıcı seçin; atanabilecek modüller ve işlem izinleri anında güncellenir ve hedef kullanıcının oturumuna yansır.
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Kullanıcı, sicil veya departman ara..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50/50 text-slate-900 w-full sm:w-64"
              />
            </div>

            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white text-slate-700"
            >
              <option value="all">Tüm Roller ({accounts.length})</option>
              {ASSIGNABLE_ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 min-h-[520px]">
          {/* Left Column: User List */}
          <div className="lg:col-span-4 border-b lg:border-b-0 lg:border-r border-slate-200 bg-slate-50/50 divide-y divide-slate-200/80 max-h-[340px] lg:max-h-[760px] overflow-y-auto">
            {filteredAccounts.length === 0 ? (
              <div className="py-12 px-4 text-center text-xs text-slate-400">
                Arama kriterlerine uygun kullanıcı hesabı bulunamadı.
              </div>
            ) : (
              filteredAccounts.map((acc) => {
                const perms = getAccountPermissions(acc);
                const isSelected = selectedAccount?.id === acc.id;
                const modCheck = pdksStorage.canModifyTargetPermissions(currentUser, acc);
                const isSelf =
                  acc.id === currentUser.id ||
                  (currentUser.employeeId && acc.employeeId === currentUser.employeeId);

                return (
                  <button
                    key={acc.id}
                    type="button"
                    onClick={() => setSelectedAccountId(acc.id)}
                    className={`w-full text-left p-4 flex items-start gap-3 transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-indigo-50/90 dark:bg-indigo-500/20 border-l-4 border-l-indigo-600 dark:border-l-indigo-400'
                        : 'hover:bg-white dark:hover:bg-slate-800/70 border-l-4 border-l-transparent'
                    }`}
                  >
                    <img
                      src={acc.avatar}
                      alt={acc.name}
                      className="w-10 h-10 rounded-full object-cover border border-slate-200 shrink-0"
                      referrerPolicy="no-referrer"
                    />
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="text-xs font-bold text-slate-900 truncate">{acc.name}</span>
                        {!modCheck.allowed && (
                          <Lock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                        <span className="font-mono text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100">
                          @{acc.username}
                        </span>
                        <span className="text-slate-500 truncate">{acc.department}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-1 pt-0.5">
                        {perms.isFullAdmin && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                            <Crown className="w-2.5 h-2.5" />
                            Tam Yetkili
                          </span>
                        )}
                        {!perms.isFullAdmin && perms.canManagePermissions && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
                            <UserCog className="w-2.5 h-2.5" />
                            Alt Yetkili
                          </span>
                        )}
                        {isSelf && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200">
                            Kendi Hesabınız
                          </span>
                        )}
                        <span className="text-[10px] text-slate-500">
                          {perms.allowedPages.length} modül
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Right Column: Selected User Detailed Permission & Module Assignment */}
          <div className="lg:col-span-8 p-5 sm:p-6 space-y-5">
            {!selectedAccount || !selectedPerms ? (
              <div className="py-16 text-center text-xs text-slate-400">
                Yetki düzenlemek için soldaki listeden bir kullanıcı seçin.
              </div>
            ) : (
              <>
                {/* Selected User Top Header */}
                <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 pb-4 border-b border-slate-200">
                  <div className="flex items-center gap-3.5">
                    <img
                      src={selectedAccount.avatar}
                      alt={selectedAccount.name}
                      className="w-12 h-12 rounded-full object-cover border border-slate-200 shrink-0"
                      referrerPolicy="no-referrer"
                    />
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-bold text-slate-900">{selectedAccount.name}</h3>
                        {isSuperAdmin && editingUsernameAccId === selectedAccount.id ? (
                          <div className="inline-flex items-center gap-1 bg-indigo-50/80 border border-indigo-300 rounded-lg px-2 py-0.5">
                            <span className="text-[11px] font-mono font-bold text-indigo-600">@</span>
                            <input
                              type="text"
                              value={draftUsername}
                              onChange={(e) => setDraftUsername(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  void handleSaveUsername(selectedAccount);
                                } else if (e.key === 'Escape') {
                                  handleCancelUsernameEdit();
                                }
                              }}
                              maxLength={50}
                              placeholder="yeni.kullanici"
                              autoFocus
                              className="w-36 sm:w-44 px-1.5 py-0.5 text-[11px] font-mono bg-white border border-indigo-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900"
                            />
                            <button
                              type="button"
                              disabled={isSelectedSaving}
                              onClick={() => void handleSaveUsername(selectedAccount)}
                              className="p-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer disabled:opacity-50"
                              title="Kullanıcı Adını Kaydet"
                            >
                              <Check className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              disabled={isSelectedSaving}
                              onClick={handleCancelUsernameEdit}
                              className="p-1 rounded bg-slate-200 hover:bg-slate-300 text-slate-700 cursor-pointer disabled:opacity-50"
                              title="İptal"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1">
                            <span className="text-[11px] font-mono text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100">
                              @{selectedAccount.username}
                            </span>
                            {isSuperAdmin && (
                              <button
                                type="button"
                                onClick={() => handleStartUsernameEdit(selectedAccount)}
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700 hover:text-indigo-900 bg-white hover:bg-indigo-50 border border-indigo-200 rounded-md transition-colors cursor-pointer"
                                title="Kullanıcı Adını Değiştir"
                              >
                                <Edit3 className="w-3 h-3" />
                                <span>Kullanıcı Adı Değiştir</span>
                              </button>
                            )}
                          </div>
                        )}
                        <span className="text-[11px] font-mono text-slate-500">
                          {selectedAccount.employeeId}
                        </span>
                        {isSelectedSaving && (
                          <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                            Kaydediliyor...
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {selectedAccount.title} · {selectedAccount.department}
                      </div>
                      {selectedDevice?.registeredDeviceId || selectedDevice?.registeredMacAddress ? (
                        <div className="flex flex-wrap items-center gap-2 mt-1 text-[10px] font-mono text-slate-500">
                          <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                            <Smartphone className="w-3 h-3" />
                            {selectedDevice.registeredMacAddress || selectedDevice.registeredDeviceId}
                          </span>
                          {selectedDevice.registeredDeviceName && (
                            <span>({selectedDevice.registeredDeviceName})</span>
                          )}
                        </div>
                      ) : (
                        <div className="text-[10px] text-slate-400 mt-1">
                          Henüz kayıtlı cihaz eşleşmesi yok
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Role Selector & Single Device Reset */}
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-semibold text-slate-500">Rol:</span>
                      <select
                        value={selectedAccount.role}
                        disabled={!selectedModCheck.allowed || isSelectedSaving}
                        onChange={(e) =>
                          handleRoleChange(
                            selectedAccount,
                            e.target.value as Exclude<UserRole, 'SUPER_ADMIN'>
                          )
                        }
                        className="px-2.5 py-1.5 text-xs font-semibold border border-slate-200 rounded-lg bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {ASSIGNABLE_ROLES.map((r) => (
                          <option key={r.value} value={r.value}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    {canManageDevices && (selectedDevice?.registeredDeviceId || selectedDevice?.registeredMacAddress) && (
                      <button
                        type="button"
                        onClick={() => handleResetSingleDevice(selectedAccount)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg transition-colors cursor-pointer"
                        title="Bu personelin kayıtlı cihazını sıfırla"
                      >
                        <Smartphone className="w-3.5 h-3.5 text-amber-600" />
                        <span>Cihazı Sıfırla</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Protected Account Warning Banner (Self / Peer Full Admin Lock) */}
                {!selectedModCheck.allowed && (
                  <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 flex items-start gap-3">
                    <Lock className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                    <div className="space-y-1 text-xs">
                      <div className="font-bold">Yetki Düzenleme Kilitli (Güvenlik Sınırı)</div>
                      <p className="text-[11px] text-rose-800">{selectedModCheck.reason}</p>
                    </div>
                  </div>
                )}

                {/* Super Admin Exclusive Delegation: Tam Yetki (Full Admin) */}
                <div
                  className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    selectedPerms.isFullAdmin
                      ? 'bg-amber-50/90 dark:bg-amber-500/15 border-amber-300 dark:border-amber-400/40'
                      : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                        selectedPerms.isFullAdmin
                          ? 'bg-amber-500 text-white'
                          : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-300'
                      }`}
                    >
                      <Crown className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-bold text-slate-900">
                          Tam Yetki (Full Admin / Yetki Yönetimi İzni)
                        </span>
                        {!isSuperAdmin && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200">
                            <Lock className="w-2.5 h-2.5" />
                            Sadece Süper Admin
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-600 mt-0.5">
                        Aktif edildiğinde bu kullanıcı kendi panelinde &quot;Kullanıcı Yetkilendirme&quot; sekmesini görür, kendi yetki havuzu dahilinde alt yetkiler dağıtabilir ve diğer yöneticiler tarafından yetkisi düşürülemez. (Şirket adını değiştirme yetkisi yalnızca Süper Admin&apos;e özeldir.)
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={!isSuperAdmin || isSelectedSaving}
                    onClick={() => handleToggleFullAdmin(selectedAccount)}
                    className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 ${
                      !isSuperAdmin
                        ? 'bg-slate-200 dark:bg-slate-700/80 text-slate-500 dark:text-slate-300 cursor-not-allowed'
                        : selectedPerms.isFullAdmin
                        ? 'bg-amber-600 hover:bg-amber-700 text-white cursor-pointer shadow-xs'
                        : 'bg-purple-600 hover:bg-purple-700 text-white cursor-pointer shadow-xs'
                    }`}
                  >
                    {selectedPerms.isFullAdmin ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Tam Yetki Aktif</span>
                      </>
                    ) : (
                      <>
                        <Crown className="w-3.5 h-3.5" />
                        <span>Tam Yetki Ver</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Quick Templates */}
                <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                  <span className="inline-flex items-center gap-1 font-semibold text-slate-500 mr-1">
                    <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                    Hızlı Şablonlar:
                  </span>
                  {isSuperAdmin && (
                    <button
                      type="button"
                      disabled={!selectedModCheck.allowed || isSelectedSaving}
                      onClick={() => applyPreset(selectedAccount, 'full_admin')}
                      className="px-2.5 py-1 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 font-bold transition-colors cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
                    >
                      Tam Yetki (Full Admin)
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={!selectedModCheck.allowed || isSelectedSaving}
                    onClick={() => applyPreset(selectedAccount, 'full_hr')}
                    className="px-2.5 py-1 rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 font-semibold transition-colors cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
                  >
                    Tam İK Yetkisi
                  </button>
                  <button
                    type="button"
                    disabled={!selectedModCheck.allowed || isSelectedSaving}
                    onClick={() => applyPreset(selectedAccount, 'shift_supervisor')}
                    className="px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 font-semibold transition-colors cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
                  >
                    Vardiya & Onay Yetkilisi
                  </button>
                  <button
                    type="button"
                    disabled={!selectedModCheck.allowed || isSelectedSaving}
                    onClick={() => applyPreset(selectedAccount, 'report_viewer')}
                    className="px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 font-semibold transition-colors cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
                  >
                    Raporlama Görüntüleyici
                  </button>
                  <button
                    type="button"
                    disabled={!selectedModCheck.allowed || isSelectedSaving}
                    onClick={() => applyPreset(selectedAccount, 'restricted_portal')}
                    className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 font-semibold transition-colors cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
                  >
                    Sadece Kiosk & Portal
                  </button>
                </div>

                {/* Permission Grids: Modules (Pages) & Action Rights */}
                <div className="space-y-4">
                  {/* Accessible Modules / Pages */}
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-indigo-600" />
                        <span>Atanabilecek Modüller / Sayfalar ({selectedPerms.allowedPages.length}/{ALL_APP_PAGES.length})</span>
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                      {ALL_APP_PAGES.map((pageItem) => {
                        const page = pageItem.key;
                        const enabled = selectedPerms.allowedPages.includes(page);
                        const inActorPool = isSuperAdmin || actorPerms.allowedPages.includes(page);
                        const canToggleThis = selectedModCheck.allowed && inActorPool && !isSelectedSaving;

                        return (
                          <label
                            key={page}
                            title={
                              !inActorPool
                                ? 'Bu modül kendi yetki havuzunuzda olmadığı için verilemez'
                                : PAGE_LABELS[page].desc
                            }
                            className={`flex items-center justify-between gap-2 p-2.5 rounded-lg border text-xs font-medium transition-all select-none ${
                              !canToggleThis ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'
                            } ${
                              enabled
                                ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                                : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <input
                                type="checkbox"
                                checked={enabled}
                                disabled={!canToggleThis}
                                onChange={() => handleTogglePage(selectedAccount, page)}
                                className="sr-only"
                              />
                              <span
                                data-theme-keep={enabled ? 'true' : undefined}
                                className={`w-4 h-4 rounded flex items-center justify-center border shrink-0 ${
                                  enabled
                                    ? 'bg-white text-indigo-600 border-white'
                                    : 'bg-slate-50 dark:bg-slate-800 border-slate-300 dark:border-slate-600'
                                }`}
                              >
                                {enabled && <Check className="w-3 h-3 stroke-[3]" />}
                              </span>
                              <span className="truncate">{PAGE_LABELS[page].label}</span>
                            </div>
                            {!inActorPool && <Lock className="w-3 h-3 shrink-0 opacity-75" />}
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  {/* Action Permissions */}
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                        <Unlock className="w-3.5 h-3.5 text-emerald-600" />
                        <span>İşlem İzinleri (Anlık Uygulanır)</span>
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {ACTION_PERMISSION_ITEMS.map((item) => {
                        const enabled = Boolean(selectedPerms[item.key]);
                        const inActorPool = isSuperAdmin || Boolean(actorPerms[item.key]);
                        const canToggleThis = selectedModCheck.allowed && inActorPool && !isSelectedSaving;

                        return (
                          <button
                            key={item.key}
                            type="button"
                            disabled={!canToggleThis}
                            title={
                              !inActorPool
                                ? 'Bu izin kendi yetki havuzunuzda olmadığı için tanımlanamaz'
                                : item.desc
                            }
                            onClick={() => handleToggleAction(selectedAccount, item.key, item.label)}
                            className={`flex items-center justify-between gap-3 p-3 rounded-xl border text-xs transition-all text-left ${
                              !canToggleThis ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'
                            } ${
                              enabled
                                ? 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-950 dark:text-emerald-100 border-emerald-300 dark:border-emerald-500/40 font-semibold'
                                : 'bg-white dark:bg-slate-900/60 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                            }`}
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="truncate font-semibold">{item.label}</span>
                                {!inActorPool && (
                                  <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-200 shrink-0">
                                    <Lock className="w-2.5 h-2.5" />
                                    Havuz Dışı
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] text-slate-500 dark:text-slate-300/80 font-normal mt-0.5 line-clamp-1">
                                {item.desc}
                              </div>
                            </div>

                            <span
                              className={`w-8 h-4.5 rounded-full p-0.5 transition-colors flex items-center shrink-0 ${
                                enabled ? 'bg-emerald-600 justify-end' : 'bg-slate-300 dark:bg-slate-600 justify-start'
                              }`}
                            >
                              <span
                                data-theme-keep="true"
                                className="w-3.5 h-3.5 rounded-full bg-white shadow-xs"
                              />
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
