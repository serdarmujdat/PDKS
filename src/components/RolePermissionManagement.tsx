import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  Key,
  Building2,
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
  Save,
  Sparkles,
  Check,
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
  getDefaultPermissionsForRole,
  pdksStorage,
} from '../services/storage';
import { CompanySettingsPanel } from './CompanySettingsPanel';

interface RolePermissionManagementProps {
  currentUser: CurrentUser;
  onOpenLogoManager?: () => void;
  onOpenWallQR?: () => void;
}

const PAGE_LABELS: Record<AppPageKey, { label: string; desc: string }> = {
  dashboard: { label: 'Canlı Pano', desc: 'Anlık özet, bildirimler & canlı akış' },
  employees: { label: 'Personel', desc: 'Personel kartları, cihaz & hesap listesi' },
  records: { label: 'Kayıtlar', desc: 'PDKS giriş-çıkış hareket logları' },
  shifts: { label: 'Vardiya & İzin', desc: 'Vardiya planlama, izin & fazla mesai' },
  performance: { label: 'Performans', desc: 'İşe geliş istikrarı & skor analizleri' },
  reports: { label: 'Raporlar', desc: 'Tarih bazlı detaylı analiz & çıktılar' },
  kiosk: { label: 'Kiosk', desc: 'Turnike kamera & QR terminal ekranı' },
  portal: { label: 'Mobil Portal', desc: 'Personel QR okutma & izin talep ekranı' },
};

const ACTION_PERMISSION_ITEMS: {
  key: keyof Omit<UserCustomPermissions, 'allowedPages'>;
  label: string;
  desc: string;
}[] = [
  { key: 'canCreate', label: 'Oluşturma', desc: 'Yeni personel, vardiya veya kayıt ekleme' },
  { key: 'canEdit', label: 'Düzenleme', desc: 'Personel ve vardiya bilgilerini güncelleme' },
  { key: 'canDelete', label: 'Silme', desc: 'Personel veya vardiya kayıtlarını silme' },
  { key: 'canApprove', label: 'Onaylama', desc: 'İzin, mesai, fotoğraf & cihaz onayları' },
  { key: 'canExportReports', label: 'Rapor Alma', desc: 'CSV / Excel & yazdırılabilir rapor indirme' },
  { key: 'canManageDevices', label: 'Cihaz Yönetimi', desc: 'Personel kayıtlı cihaz / MAC sıfırlama' },
  { key: 'canManageSettings', label: 'Sistem Ayarları', desc: 'Logo, Duvar QR ve şirket ayarlarına erişim' },
  { key: 'canClearLogs', label: 'Log Temizleme', desc: 'Giriş-çıkış hareket kayıtlarını temizleme' },
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
}) => {
  const isSuperAdmin = pdksStorage.isSuperAdmin(currentUser);
  const [accounts, setAccounts] = useState<UserAccount[]>([]);
  const [employeesMap, setEmployeesMap] = useState<Record<string, { registeredDeviceId?: string; registeredMacAddress?: string; registeredDeviceName?: string }>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');

  // Two-step inline confirmations (never use window.confirm)
  const [confirmClearLogs, setConfirmClearLogs] = useState(false);
  const [confirmClearNotifs, setConfirmClearNotifs] = useState(false);
  const [confirmResetAllDevices, setConfirmResetAllDevices] = useState(false);
  const [confirmResetDemo, setConfirmResetDemo] = useState(false);

  // Feedback banner
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [savingAccountId, setSavingAccountId] = useState<string | null>(null);

  const showFeedback = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => {
      setFeedback((prev) => (prev?.message === message ? null : prev));
    }, 4500);
  };

  const loadData = () => {
    setAccounts(pdksStorage.getUserAccounts());
    const emps = pdksStorage.getEmployees();
    const map: Record<string, { registeredDeviceId?: string; registeredMacAddress?: string; registeredDeviceName?: string }> = {};
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
    if (!isSuperAdmin) return;
    loadData();
    const handleSync = () => loadData();
    window.addEventListener('pdks-data-synced', handleSync);
    return () => window.removeEventListener('pdks-data-synced', handleSync);
  }, [isSuperAdmin]);

  if (!isSuperAdmin) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <div className="bg-white border border-rose-200 rounded-2xl p-8 shadow-xs space-y-3">
          <Lock className="w-10 h-10 text-rose-500 mx-auto" />
          <h2 className="text-lg font-bold text-slate-900">Yetkisiz Erişim</h2>
          <p className="text-xs text-slate-500">Bu ekran yalnızca yetkili sistem yöneticisine özeldir.</p>
        </div>
      </div>
    );
  }

  const getAccountPermissions = (acc: UserAccount): UserCustomPermissions => {
    const base = getDefaultPermissionsForRole(acc.role);
    if (!acc.customPermissions) return base;
    return {
      allowedPages: Array.isArray(acc.customPermissions.allowedPages)
        ? acc.customPermissions.allowedPages
        : base.allowedPages,
      canCreate: typeof acc.customPermissions.canCreate === 'boolean' ? acc.customPermissions.canCreate : base.canCreate,
      canEdit: typeof acc.customPermissions.canEdit === 'boolean' ? acc.customPermissions.canEdit : base.canEdit,
      canDelete: typeof acc.customPermissions.canDelete === 'boolean' ? acc.customPermissions.canDelete : base.canDelete,
      canApprove: typeof acc.customPermissions.canApprove === 'boolean' ? acc.customPermissions.canApprove : base.canApprove,
      canExportReports: typeof acc.customPermissions.canExportReports === 'boolean' ? acc.customPermissions.canExportReports : base.canExportReports,
      canManageDevices: typeof acc.customPermissions.canManageDevices === 'boolean' ? acc.customPermissions.canManageDevices : base.canManageDevices,
      canManageSettings: typeof acc.customPermissions.canManageSettings === 'boolean' ? acc.customPermissions.canManageSettings : base.canManageSettings,
      canClearLogs: typeof acc.customPermissions.canClearLogs === 'boolean' ? acc.customPermissions.canClearLogs : base.canClearLogs,
    };
  };

  const applyPermissionUpdate = async (
    acc: UserAccount,
    nextPerms: UserCustomPermissions,
    nextRole?: UserRole,
    label?: string
  ) => {
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

  const handleTogglePage = (acc: UserAccount, page: AppPageKey) => {
    const cur = getAccountPermissions(acc);
    const exists = cur.allowedPages.includes(page);
    const updatedPages = exists
      ? cur.allowedPages.filter((p) => p !== page)
      : [...cur.allowedPages, page];
    void applyPermissionUpdate(
      acc,
      { ...cur, allowedPages: updatedPages },
      acc.role,
      `${acc.name} için '${PAGE_LABELS[page].label}' sayfa erişimi ${exists ? 'kaldırıldı' : 'verildi'}.`
    );
  };

  const handleToggleAction = (
    acc: UserAccount,
    key: keyof Omit<UserCustomPermissions, 'allowedPages'>,
    actionLabel: string
  ) => {
    const cur = getAccountPermissions(acc);
    const nextVal = !cur[key];
    void applyPermissionUpdate(
      acc,
      { ...cur, [key]: nextVal },
      acc.role,
      `${acc.name} için '${actionLabel}' yetkisi ${nextVal ? 'açıldı' : 'kapatıldı'}.`
    );
  };

  const handleRoleChange = (acc: UserAccount, newRole: Exclude<UserRole, 'SUPER_ADMIN'>) => {
    const nextPerms = getDefaultPermissionsForRole(newRole);
    void applyPermissionUpdate(
      acc,
      nextPerms,
      newRole,
      `${acc.name} rolü '${ASSIGNABLE_ROLES.find((r) => r.value === newRole)?.label || newRole}' olarak güncellendi ve varsayılan yetkiler uygulandı.`
    );
  };

  const applyPreset = (
    acc: UserAccount,
    preset: 'full_hr' | 'shift_supervisor' | 'report_viewer' | 'restricted_portal'
  ) => {
    if (preset === 'full_hr') {
      void applyPermissionUpdate(acc, getDefaultPermissionsForRole('ik_yoneticisi'), acc.role, `${acc.name} için Tam İK Yetkisi şablonu uygulandı.`);
    } else if (preset === 'shift_supervisor') {
      void applyPermissionUpdate(acc, getDefaultPermissionsForRole('birim_amiri'), acc.role, `${acc.name} için Vardiya & Onay Yetkilisi şablonu uygulandı.`);
    } else if (preset === 'report_viewer') {
      void applyPermissionUpdate(
        acc,
        {
          allowedPages: ['dashboard', 'records', 'performance', 'reports', 'portal'],
          canCreate: false,
          canEdit: false,
          canDelete: false,
          canApprove: false,
          canExportReports: true,
          canManageDevices: false,
          canManageSettings: false,
          canClearLogs: false,
        },
        acc.role,
        `${acc.name} için Raporlama Görüntüleyici şablonu uygulandı.`
      );
    } else {
      void applyPermissionUpdate(acc, getDefaultPermissionsForRole('personel'), acc.role, `${acc.name} için Sadece Kiosk & Portal şablonu uygulandı.`);
    }
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
    const res = await pdksStorage.resetDeviceSuperAdmin(acc.employeeId);
    if (res.success) {
      showFeedback('success', `${acc.name} için kayıtlı cihaz / MAC eşleşmesi sıfırlandı.`);
      loadData();
    } else {
      showFeedback('error', res.message);
    }
  };

  const handleResetToDemo = () => {
    try {
      pdksStorage.resetToDemo(currentUser);
      setConfirmResetDemo(false);
      loadData();
      showFeedback('success', 'Tüm PDKS verileri başlangıç durumuna sıfırlandı.');
    } catch (err: any) {
      showFeedback('error', err?.message || 'Sıfırlama sırasında hata oluştu.');
    }
  };

  const filteredAccounts = accounts.filter((acc) => {
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !q ||
      acc.name.toLowerCase().includes(q) ||
      acc.username.toLowerCase().includes(q) ||
      acc.employeeId.toLowerCase().includes(q) ||
      (acc.department || '').toLowerCase().includes(q);
    const matchesRole = roleFilter === 'all' || acc.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header */}
      <div className="bg-white border border-purple-200 rounded-2xl p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-purple-600 text-white flex items-center justify-center shadow-sm shrink-0">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
                Yetki & Rol Yönetimi
              </h1>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
                <EyeOff className="w-3 h-3" />
                Gizli Süper Yönetici Modu
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Oturumunuz personel tablolarında, loglarda, bildirimlerde ve raporlarda tamamen görünmezdir. Tüm sistem ayarlarına şifresiz tam erişime sahipsiniz.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {onOpenLogoManager && (
            <button
              type="button"
              onClick={onOpenLogoManager}
              className="px-3.5 py-2 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-xl transition-colors cursor-pointer"
            >
              Şirket Logosu (Şifresiz)
            </button>
          )}
          {onOpenWallQR && (
            <button
              type="button"
              onClick={onOpenWallQR}
              className="px-3.5 py-2 text-xs font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-xl transition-colors cursor-pointer"
            >
              Duvar QR Yönetimi
            </button>
          )}
        </div>
      </div>

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

      {/* Section 1: Sistem / Şirket Ayarları & Maintenance Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CompanySettingsPanel
          currentUser={currentUser}
          compact
          onCompanyUpdated={() => loadData()}
        />

        {/* System-wide Maintenance & Reset Actions */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100">
            <Sliders className="w-5 h-5 text-rose-600" />
            <div>
              <h2 className="text-sm font-bold text-slate-900">Sistem Bakım & Güvenlik Kontrolleri</h2>
              <p className="text-[11px] text-slate-500">
                Log temizleme, cihaz sıfırlama ve sistem veri kontrolleri.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Clear Attendance Logs */}
            {!confirmClearLogs ? (
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
            )}

            {/* Reset All Registered Devices */}
            {!confirmResetAllDevices ? (
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
            )}

            {/* Clear Notifications */}
            {!confirmClearNotifs ? (
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
            )}

            {/* Reset Demo Data */}
            {!confirmResetDemo ? (
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
            )}
          </div>
        </div>
      </div>

      {/* Section 2: Dynamic User & Sub-Admin Permission Matrix */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
        <div className="p-6 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-600 flex items-center justify-center shrink-0">
              <Key className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Dinamik Kullanıcı & Alt Yönetici Yetki Tanımlama Paneli
              </h2>
              <p className="text-xs text-slate-500">
                Her kullanıcı için erişilebilir sayfaları ve işlem yetkilerini seçin. Değişiklikler tüm oturumlara anlık uygulanır.
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

        <div className="divide-y divide-slate-200">
          {filteredAccounts.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400">
              Arama kriterlerine uygun kullanıcı hesabı bulunamadı.
            </div>
          ) : (
            filteredAccounts.map((acc) => {
              const perms = getAccountPermissions(acc);
              const device = employeesMap[acc.employeeId];
              const isSaving = savingAccountId === acc.id;

              return (
                <div key={acc.id} className="p-6 space-y-5 hover:bg-slate-50/40 transition-colors">
                  {/* Account Top Row */}
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div className="flex items-center gap-3.5">
                      <img
                        src={acc.avatar}
                        alt={acc.name}
                        className="w-11 h-11 rounded-full object-cover border border-slate-200 shrink-0"
                        referrerPolicy="no-referrer"
                      />
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-sm font-bold text-slate-900">{acc.name}</h3>
                          <span className="text-[11px] font-mono text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100">
                            @{acc.username}
                          </span>
                          <span className="text-[11px] font-mono text-slate-500">
                            {acc.employeeId}
                          </span>
                          {isSaving && (
                            <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                              Kaydediliyor...
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {acc.title} · {acc.department}
                        </div>
                        {device?.registeredDeviceId || device?.registeredMacAddress ? (
                          <div className="flex flex-wrap items-center gap-2 mt-1 text-[10px] font-mono text-slate-500">
                            <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                              <Smartphone className="w-3 h-3" />
                              {device.registeredMacAddress || device.registeredDeviceId}
                            </span>
                            {device.registeredDeviceName && (
                              <span>({device.registeredDeviceName})</span>
                            )}
                          </div>
                        ) : (
                          <div className="text-[10px] text-slate-400 mt-1">
                            Henüz kayıtlı cihaz eşleşmesi yok
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Role Selector, Presets & Device Reset */}
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-semibold text-slate-500">Rol:</span>
                        <select
                          value={acc.role}
                          onChange={(e) =>
                            handleRoleChange(acc, e.target.value as Exclude<UserRole, 'SUPER_ADMIN'>)
                          }
                          className="px-2.5 py-1.5 text-xs font-semibold border border-slate-200 rounded-lg bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                          {ASSIGNABLE_ROLES.map((r) => (
                            <option key={r.value} value={r.value}>
                              {r.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      {(device?.registeredDeviceId || device?.registeredMacAddress) && (
                        <button
                          type="button"
                          onClick={() => handleResetSingleDevice(acc)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg transition-colors cursor-pointer"
                          title="Bu personelin kayıtlı cihazını sıfırla"
                        >
                          <Smartphone className="w-3.5 h-3.5 text-amber-600" />
                          <span>Cihazı Sıfırla</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Quick Templates */}
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                    <span className="inline-flex items-center gap-1 font-semibold text-slate-500 mr-1">
                      <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                      Hızlı Şablonlar:
                    </span>
                    <button
                      type="button"
                      onClick={() => applyPreset(acc, 'full_hr')}
                      className="px-2.5 py-1 rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 font-semibold transition-colors cursor-pointer"
                    >
                      Tam İK Yetkisi
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPreset(acc, 'shift_supervisor')}
                      className="px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 font-semibold transition-colors cursor-pointer"
                    >
                      Vardiya & Onay Yetkilisi
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPreset(acc, 'report_viewer')}
                      className="px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 font-semibold transition-colors cursor-pointer"
                    >
                      Raporlama Görüntüleyici
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPreset(acc, 'restricted_portal')}
                      className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 font-semibold transition-colors cursor-pointer"
                    >
                      Sadece Kiosk & Portal
                    </button>
                  </div>

                  {/* Permission Grids: Accessible Pages & Action Rights */}
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    {/* Accessible Pages */}
                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5 text-indigo-600" />
                          <span>Erişilebilir Sayfalar ({perms.allowedPages.length}/{ALL_APP_PAGES.length})</span>
                        </span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {ALL_APP_PAGES.map((pageItem) => {
                          const page = pageItem.key;
                          const enabled = perms.allowedPages.includes(page);
                          return (
                            <label
                              key={page}
                              title={PAGE_LABELS[page].desc}
                              className={`flex items-center gap-2 p-2 rounded-lg border text-xs font-medium cursor-pointer transition-all select-none ${
                                enabled
                                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                                  : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={enabled}
                                onChange={() => handleTogglePage(acc, page)}
                                className="sr-only"
                              />
                              <span
                                className={`w-4 h-4 rounded flex items-center justify-center border shrink-0 ${
                                  enabled
                                    ? 'bg-white text-indigo-600 border-white'
                                    : 'bg-slate-50 border-slate-300'
                                }`}
                              >
                                {enabled && <Check className="w-3 h-3 stroke-[3]" />}
                              </span>
                              <span className="truncate">{PAGE_LABELS[page].label}</span>
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
                          <span>İşlem Yetkileri</span>
                        </span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {ACTION_PERMISSION_ITEMS.map((item) => {
                          const enabled = Boolean(perms[item.key]);
                          return (
                            <button
                              key={item.key}
                              type="button"
                              title={item.desc}
                              onClick={() => handleToggleAction(acc, item.key, item.label)}
                              className={`flex items-center justify-between gap-2 p-2 rounded-lg border text-xs font-medium cursor-pointer transition-all text-left ${
                                enabled
                                  ? 'bg-emerald-50 text-emerald-900 border-emerald-300 font-semibold'
                                  : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                              }`}
                            >
                              <span className="truncate">{item.label}</span>
                              <span
                                className={`w-7 h-4 rounded-full p-0.5 transition-colors flex items-center shrink-0 ${
                                  enabled ? 'bg-emerald-600 justify-end' : 'bg-slate-300 justify-start'
                                }`}
                              >
                                <span className="w-3 h-3 rounded-full bg-white shadow-xs" />
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
