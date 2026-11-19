import React, { useState, useEffect, useMemo } from 'react';
import {
  Users,
  UserCheck,
  Clock,
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  ArrowDownRight,
  Coffee,
  Download,
  QrCode,
  TrendingUp,
  Printer,
  Search,
  CheckCircle2,
  Image as ImageIcon,
  Bell,
  Timer,
  CalendarCheck,
  Check,
  X,
  FileCheck2,
  Smartphone,
  ShieldAlert,
  Palette,
  LogOut,
  Sun,
  Moon,
} from 'lucide-react';
import {
  Employee,
  AttendanceRecord,
  Department,
  OvertimeRequest,
  LeaveRequest,
  DeviceEntryApproval,
  PDKSNotification,
  Shift,
  EmployeeShiftAssignment,
} from '../types/pdks';
import { pdksStorage, getTodayString } from '../services/storage';
import {
  calculateLiveShiftDelay,
  formatMinutesTurkish,
  LiveShiftDelayInfo,
} from '../utils/shiftTimeAnalytics';
import { useTheme } from '../contexts/ThemeContext';
import { NotificationCenter } from './NotificationCenter';
import { CompanyLogoImage } from './CompanyLogoImage';
import { CompanySettingsPanel } from './CompanySettingsPanel';

interface DashboardOverviewProps {
  onNavigateToKiosk: () => void;
  onNavigateToEmployees: () => void;
  onNavigateToRecords: () => void;
  onNavigateToPerformance?: () => void;
  onOpenWallQR?: () => void;
  onOpenLogoManager?: () => void;
  onOpenThemeSettings?: () => void;
  onLogout?: () => void;
  currentUser?: import('../types/pdks').CurrentUser;
  companyLogo?: string;
  companyName?: string;
}

export const DashboardOverview: React.FC<DashboardOverviewProps> = ({
  onNavigateToKiosk,
  onNavigateToEmployees,
  onNavigateToRecords,
  onNavigateToPerformance,
  onOpenWallQR,
  onOpenLogoManager,
  onOpenThemeSettings,
  onLogout,
  currentUser,
  companyLogo: propCompanyLogo,
  companyName: propCompanyName,
}) => {
  const activeUser = currentUser || pdksStorage.getActiveUser();
  const { mode: themeMode, themeDef, setMode: setThemeMode } = useTheme();
  const isSuperAdmin = pdksStorage.isSuperAdmin(activeUser);
  const isHRManager = pdksStorage.isHRorSuperAdmin(activeUser);
  const canManageSettings = pdksStorage.canAccessSettings(activeUser);
  const canManageLogo = pdksStorage.canManageLogo(activeUser);
  const canApprove = pdksStorage.canApproveRequests(activeUser);
  const canExport = pdksStorage.canExportReports(activeUser);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [employeeShifts, setEmployeeShifts] = useState<EmployeeShiftAssignment[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [overtimeRequests, setOvertimeRequests] = useState<OvertimeRequest[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [deviceApprovals, setDeviceApprovals] = useState<DeviceEntryApproval[]>([]);
  const [crossDeviceAlerts, setCrossDeviceAlerts] = useState<PDKSNotification[]>([]);
  const [nowTick, setNowTick] = useState<number>(() => Date.now());
  const [statusFilter, setStatusFilter] = useState<'all' | 'inside' | 'break' | 'outside' | 'leave' | 'delayed'>('all');
  const [approvalFilter, setApprovalFilter] = useState<'all' | 'device' | 'overtime' | 'leave'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isNotificationModalOpen, setIsNotificationModalOpen] = useState(false);
  const [unreadAlertCount, setUnreadAlertCount] = useState(0);
  const [approvalFeedback, setApprovalFeedback] = useState<string | null>(null);
  const [companyLogo, setCompanyLogo] = useState<string>(() => propCompanyLogo || pdksStorage.getCompanyLogo());
  const [companyName, setCompanyName] = useState<string>(() => propCompanyName || pdksStorage.getCompanyName());

  useEffect(() => {
    if (propCompanyLogo) setCompanyLogo(propCompanyLogo);
  }, [propCompanyLogo]);

  useEffect(() => {
    if (propCompanyName) setCompanyName(propCompanyName);
  }, [propCompanyName]);

  const loadData = () => {
    setEmployees(pdksStorage.getEmployees());
    setShifts(pdksStorage.getShifts());
    setEmployeeShifts(pdksStorage.getEmployeeShifts());
    setRecords(pdksStorage.getAttendanceRecords());
    setOvertimeRequests(pdksStorage.getOvertimeRequests());
    setLeaveRequests(pdksStorage.getLeaveRequests());
    setDeviceApprovals(pdksStorage.getDeviceEntryApprovals());
    setNowTick(Date.now());
    setCompanyLogo(pdksStorage.getCompanyLogo());
    setCompanyName(pdksStorage.getCompanyName());
    const allNotifs = pdksStorage.getNotifications();
    const notifs = allNotifs.filter((n) => !n.read && (!n.targetRole || n.targetRole === activeUser.role || isHRManager || canApprove));
    setUnreadAlertCount(notifs.length);
    setCrossDeviceAlerts(
      allNotifs
        .filter((n) => n.metadata?.isCrossEmployeeDevice && !n.read && (!n.targetRole || n.targetRole === activeUser.role || isHRManager || canApprove))
        .slice(0, 4)
    );
  };

  useEffect(() => {
    loadData();

    const timer = setInterval(() => {
      setNowTick(Date.now());
    }, 10000);

    const handleLiveEvent = () => {
      loadData();
    };
    const handleLogoEvent = (e: any) => {
      if (e?.detail && typeof e.detail === 'string') {
        setCompanyLogo(e.detail);
      } else {
        setCompanyLogo(pdksStorage.getCompanyLogo());
      }
    };
    const handleCompanyNameEvent = (e: any) => {
      if (e?.detail && typeof e.detail === 'string') {
        setCompanyName(e.detail);
      } else {
        setCompanyName(pdksStorage.getCompanyName());
      }
    };
    window.addEventListener('pdks-notification', handleLiveEvent);
    window.addEventListener('pdks-data-synced', handleLiveEvent);
    window.addEventListener('pdks-logo-updated', handleLogoEvent);
    window.addEventListener('pdks-company-name-updated', handleCompanyNameEvent);
    window.addEventListener('pdks-wall-qr-updated', handleCompanyNameEvent);
    return () => {
      clearInterval(timer);
      window.removeEventListener('pdks-notification', handleLiveEvent);
      window.removeEventListener('pdks-data-synced', handleLiveEvent);
      window.removeEventListener('pdks-logo-updated', handleLogoEvent);
      window.removeEventListener('pdks-company-name-updated', handleCompanyNameEvent);
      window.removeEventListener('pdks-wall-qr-updated', handleCompanyNameEvent);
    };
  }, []);

  // Handlers for New Device Entry Approvals
  const handleApproveDeviceEntry = (id: string, bindNewDevice: boolean) => {
    const res = pdksStorage.approveDeviceEntryRequest(id, {
      bindNewDevice,
      actorName: activeUser.name,
    });
    if (res.success) {
      loadData();
      setApprovalFeedback(`✅ ${res.message}`);
      setTimeout(() => setApprovalFeedback(null), 5000);
    }
  };

  const handleRejectDeviceEntry = (id: string) => {
    const res = pdksStorage.rejectDeviceEntryRequest(id, undefined, activeUser.name);
    if (res.success) {
      loadData();
      setApprovalFeedback(`❌ ${res.message}`);
      setTimeout(() => setApprovalFeedback(null), 4500);
    }
  };

  // Handlers for Overtime Approval
  const handleApproveOvertime = (id: string) => {
    const updated = pdksStorage.updateOvertimeStatus(id, 'approved', activeUser.name);
    if (updated) {
      loadData();
      setApprovalFeedback(`✅ ${updated.employeeName} için ${updated.hours} saatlik fazla mesai talebi onaylandı ve Bildirim Merkezi'ne iletildi.`);
      setTimeout(() => setApprovalFeedback(null), 4500);
    }
  };

  const handleRejectOvertime = (id: string) => {
    const updated = pdksStorage.updateOvertimeStatus(id, 'rejected', activeUser.name);
    if (updated) {
      loadData();
      setApprovalFeedback(`❌ ${updated.employeeName} için fazla mesai talebi reddedildi.`);
      setTimeout(() => setApprovalFeedback(null), 4500);
    }
  };

  // Handlers for Leave Approval
  const handleApproveLeave = (id: string) => {
    pdksStorage.updateLeaveStatus(id, 'approved');
    loadData();
    setApprovalFeedback('✅ İzin talebi onaylandı ve personele bildirim iletildi.');
    setTimeout(() => setApprovalFeedback(null), 4500);
  };

  const handleRejectLeave = (id: string) => {
    pdksStorage.updateLeaveStatus(id, 'rejected');
    loadData();
    setApprovalFeedback('❌ İzin talebi reddedildi.');
    setTimeout(() => setApprovalFeedback(null), 4500);
  };


  const totalEmployees = employees.length;
  const insideEmployees = employees.filter((e) => e.currentPresence === 'inside');
  const breakEmployees = employees.filter((e) => e.currentPresence === 'break');
  const leaveEmployees = employees.filter((e) => e.status === 'leave');
  const outsideEmployees = employees.filter((e) => e.currentPresence === 'outside' && e.status !== 'leave');

  // Pending Approvals (Yeni Cihaz Güvenlik Onayları, Fazla Mesai ve İzin Talepleri)
  const activeDeviceApprovals = deviceApprovals.filter(
    (d) =>
      (d.status === 'pending' || d.status === 'check_in_requested') &&
      nowTick < Date.parse(d.expiresAt)
  );
  const pendingOvertimes = overtimeRequests.filter((r) => r.status === 'pending');
  const pendingLeaves = leaveRequests.filter((l) => l.status === 'pending');
  const totalPendingApprovals =
    activeDeviceApprovals.length + pendingOvertimes.length + pendingLeaves.length;
  
  // Late today check (local date matching storage & server /api/scan)
  const todayStr = getTodayString();
  const todayRecords = records
    .filter((r) => r.date === todayStr)
    .sort((a, b) => {
      const timeCompare = (b.timeStr || '').localeCompare(a.timeStr || '');
      if (timeCompare !== 0) return timeCompare;
      return (b.timestamp || '').localeCompare(a.timestamp || '');
    });

  // Real-time live delay evaluation per employee (auto-ticks every 10s + SSE/polling sync)
  const liveDelayMap = useMemo(() => {
    const nowDate = new Date(nowTick);
    const map = new Map<string, LiveShiftDelayInfo>();
    for (const emp of employees) {
      map.set(
        emp.id,
        calculateLiveShiftDelay(emp, nowDate, shifts, employeeShifts, records, leaveRequests)
      );
    }
    return map;
  }, [employees, shifts, employeeShifts, records, leaveRequests, nowTick]);

  const delayedEmployees = useMemo(
    () => employees.filter((e) => liveDelayMap.get(e.id)?.isDelayed),
    [employees, liveDelayMap]
  );
  const absentLateCount = useMemo(
    () => delayedEmployees.filter((e) => liveDelayMap.get(e.id)?.state === 'absent_late').length,
    [delayedEmployees, liveDelayMap]
  );
  const lateCheckinCount = delayedEmployees.length - absentLateCount;

  // Employees who haven't arrived yet (not in office, not on break, not on leave)
  const notArrivedEmployees = outsideEmployees;

  // Attendance & Participation percentage: active staff currently present (inside or on break)
  const activeCount = employees.filter((e) => e.status !== 'inactive').length;
  const presentCount = insideEmployees.length + breakEmployees.length;
  const attendanceRate = activeCount > 0 ? Math.round((presentCount / activeCount) * 100) : 0;

  // Department breakdown
  const departments: Department[] = [
    'Yazılım & Ar-Ge',
    'İnsan Kaynakları',
    'Muhasebe & Finans',
    'Pazarlama & Satış',
    'Üretim & Operasyon',
    'Lojistik & Depo',
  ];

  const departmentStats = departments.map((dept) => {
    const deptEmps = employees.filter((e) => e.department === dept);
    const presentCount = deptEmps.filter((e) => e.currentPresence === 'inside' || e.currentPresence === 'break').length;
    const rate = deptEmps.length > 0 ? Math.round((presentCount / deptEmps.length) * 100) : 0;
    return {
      department: dept,
      total: deptEmps.length,
      present: presentCount,
      rate,
    };
  }).filter(d => d.total > 0);

  // Export records to CSV
  const handleExportCSV = () => {
    const headers = ['Kayıt No', 'Sicil ID', 'Ad Soyad', 'Departman', 'Tarih', 'Saat', 'İşlem', 'Durum', 'Terminal'];
    const rows = records.map((r) => [
      r.id,
      r.employeeId,
      r.employeeName,
      r.department,
      r.date,
      r.timeStr,
      r.type === 'check_in'
        ? 'Giriş'
        : r.type === 'check_out'
        ? 'Çıkış'
        : r.type === 'security_alert'
        ? 'Güvenlik Uyarısı'
        : 'Mola',
      r.isSuspiciousDevice
        ? 'Şüpheli Cihaz'
        : r.status === 'late'
        ? `Geç (${r.lateMinutes} dk)`
        : r.status === 'early_leave'
        ? 'Erken Çıkış'
        : 'Zamanında',
      r.terminal || '-',
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,\uFEFF' +
      [headers.join(';'), ...rows.map((e) => e.join(';'))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `PDKS_Giris_Cikis_Raporu_${todayStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="w-full max-w-7xl mx-auto min-w-0 px-3 sm:px-6 lg:px-8 py-4 sm:py-8 space-y-5 sm:space-y-8">
      {/* Top Banner & Quick Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 pb-3 sm:pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            {companyName} · Canlı Yönetim Panosu
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5 sm:mt-1">
            Bugünkü katılım durumu, canlı geçiş hareketleri ve personel devam istatistikleri.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2">
          {canManageSettings && onOpenLogoManager && (
            <button
              onClick={onOpenLogoManager}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-bold text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-500/15 border border-purple-200 dark:border-purple-500/30 hover:bg-purple-100 dark:hover:bg-purple-500/25 rounded-lg shadow-xs transition-colors cursor-pointer whitespace-nowrap shrink-0"
              title="Şirket logosunu standart boyutlarda ekleyin veya güncelleyin"
            >
              <ImageIcon className="w-3.5 h-3.5 text-purple-600 dark:text-purple-300" />
              <span>Kurumsal Logo</span>
            </button>
          )}

          {canManageSettings && onOpenWallQR && (
            <button
              onClick={onOpenWallQR}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-500/15 border border-indigo-200 dark:border-indigo-500/30 hover:bg-indigo-100 dark:hover:bg-indigo-500/25 rounded-lg shadow-xs transition-colors cursor-pointer whitespace-nowrap shrink-0"
              title="Şirket duvarına asılacak A4 poster QR kodunu görüntüle ve yazdır"
            >
              <Printer className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-300" />
              <span>Duvar QR'ı</span>
            </button>
          )}

          {onNavigateToPerformance && (
            <button
              onClick={onNavigateToPerformance}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-200 dark:border-emerald-500/30 hover:bg-emerald-100 dark:hover:bg-emerald-500/25 rounded-lg shadow-xs transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <TrendingUp className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-300" />
              <span>Performans</span>
            </button>
          )}

          {canExport && (
            <button
              onClick={handleExportCSV}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg shadow-xs transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
              <span>Excel / CSV</span>
            </button>
          )}

          <button
            onClick={() => setIsNotificationModalOpen(true)}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-bold text-amber-900 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/15 border border-amber-200 dark:border-amber-500/30 hover:bg-amber-100 dark:hover:bg-amber-500/25 rounded-lg shadow-xs transition-colors cursor-pointer whitespace-nowrap shrink-0"
            title="Sistem Bildirim Merkezi: Gecikmeler, izinler ve vardiya alarmları"
          >
            <Bell className="w-3.5 h-3.5 text-amber-600 dark:text-amber-300" />
            <span>Bildirimler</span>
            {unreadAlertCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-rose-600 text-white text-[10px] font-bold font-mono tabular-nums">
                {unreadAlertCount > 9 ? '9+' : unreadAlertCount}
              </span>
            )}
          </button>

          <a
            href="#pending-approvals-section"
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-bold text-indigo-900 dark:text-indigo-200 bg-indigo-50 dark:bg-indigo-500/15 border border-indigo-200 dark:border-indigo-500/30 hover:bg-indigo-100 dark:hover:bg-indigo-500/25 rounded-lg shadow-xs transition-colors cursor-pointer whitespace-nowrap shrink-0"
            title="Personel mobil portalından gelen onay bekleyen fazla mesai ve izin talepleri"
          >
            <FileCheck2 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-300" />
            <span>Onay Bekleyenler</span>
            {totalPendingApprovals > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-amber-600 text-white text-[10px] font-bold font-mono tabular-nums">
                {totalPendingApprovals}
              </span>
            )}
          </a>

          <button
            onClick={onNavigateToKiosk}
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-sm transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <QrCode className="w-3.5 h-3.5" />
            <span>Kiosk</span>
          </button>

          {/* Direct Light / Dark Mode Switch (Açık / Koyu Tema) */}
          <div
            role="group"
            aria-label="Tema Modu Seçimi"
            className="col-span-2 sm:col-span-1 inline-flex items-center p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shrink-0"
          >
            <button
              type="button"
              onClick={() => void setThemeMode('light', activeUser)}
              aria-pressed={themeMode === 'light'}
              className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                themeMode === 'light'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
              title="Açık Tema moduna geç"
            >
              <Sun className="w-3.5 h-3.5 text-amber-500" />
              <span>Açık Tema</span>
            </button>
            <button
              type="button"
              onClick={() => void setThemeMode('dark', activeUser)}
              aria-pressed={themeMode === 'dark'}
              className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                themeMode === 'dark'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
              title="Koyu Tema moduna geç"
            >
              <Moon className="w-3.5 h-3.5" />
              <span>Koyu Tema</span>
            </button>
          </div>

          {onOpenThemeSettings && (
            <button
              type="button"
              onClick={onOpenThemeSettings}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg shadow-xs transition-colors cursor-pointer whitespace-nowrap shrink-0"
              title={`Tüm tema paletlerini aç (Aktif: ${themeDef.name})`}
            >
              <Palette className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              <span>Temalar</span>
            </button>
          )}

          {onLogout && (
            <button
              type="button"
              onClick={onLogout}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-500/15 border border-rose-200 dark:border-rose-500/30 hover:bg-rose-100 dark:hover:bg-rose-500/25 rounded-lg shadow-xs transition-colors cursor-pointer whitespace-nowrap shrink-0"
              title="Oturumu Kapat"
            >
              <LogOut className="w-3.5 h-3.5 text-rose-600 dark:text-rose-300" />
              <span>Çıkış Yap</span>
            </button>
          )}
        </div>
      </div>

      {/* İK Kurumsal Şirket Logosu Yönetim Alanı (Talep: Logo ekleme kısmı herkese açık olmasın ik yönetici sayfasında olsun) */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 transition-colors">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          {/* 240x60 Standart Boyutlu Logo Çerçevesi */}
          <div className="w-[240px] h-[60px] max-w-full rounded-xl border-2 border-dashed border-indigo-200 dark:border-indigo-500/40 bg-slate-50 dark:bg-slate-800/80 flex items-center justify-center p-2 shrink-0 self-center sm:self-auto shadow-2xs">
            <CompanyLogoImage
              src={companyLogo}
              alt={companyName}
              companyName={companyName}
              className="max-h-[48px] max-w-[220px] w-auto h-auto object-contain"
              variant={themeMode === 'dark' ? 'dark' : 'light'}
            />
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Kurumsal Şirket Logosu
              </h2>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-500/20 text-purple-800 dark:text-purple-200 border border-purple-200 dark:border-purple-500/30">
                İK Yönetici Alanı
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-lg leading-relaxed">
              Bu logo giriş ekranında, üst menüde, turnike kiosklarında ve duvar QR posterlerinde standart <strong className="text-slate-700 dark:text-slate-200">240 × 60 px</strong> boyutlarında yayınlanır.
            </p>
            <div className="text-[11px] font-mono text-indigo-700 dark:text-indigo-300 font-semibold">
              Standart Boyut: 240 × 60 px (4:1 En/Boy Oranı)
            </div>
          </div>
        </div>

        {canManageLogo && onOpenLogoManager && (
          <button
            onClick={onOpenLogoManager}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-xs font-bold shadow-sm transition-all cursor-pointer whitespace-nowrap active:scale-95 shrink-0"
          >
            <ImageIcon className="w-4 h-4" />
            <span>Şirket Logosunu Değiştir / Yükle</span>
          </button>
        )}
      </div>

      {/* Sistem / Şirket Ayarları (Yalnızca Gizli Süper Yönetici - Admin.Admin) */}
      {isSuperAdmin && (
        <CompanySettingsPanel
          currentUser={activeUser}
          onCompanyUpdated={(updatedName) => setCompanyName(updatedName)}
        />
      )}


      {/* Primary KPI Grid (Tabular numerals enforced, Mobile Optimized) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 sm:gap-4">
        {/* Total Staff */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 sm:p-4 shadow-xs transition-colors">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-medium mb-1.5 sm:mb-2">
            <span className="truncate">Toplam Kadro</span>
            <Users className="w-4 h-4 text-slate-400 dark:text-slate-500 shrink-0" />
          </div>
          <div className="font-mono text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">
            {totalEmployees}
          </div>
          <div className="text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 sm:mt-1 truncate">
            Kayıtlı aktif kadro
          </div>
        </div>

        {/* Present Inside */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 sm:p-4 shadow-xs transition-colors">
          <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400 text-xs font-medium mb-1.5 sm:mb-2">
            <span className="truncate">Şu An Ofiste</span>
            <UserCheck className="w-4 h-4 text-emerald-500 dark:text-emerald-400 shrink-0" />
          </div>
          <div className="font-mono text-xl sm:text-2xl font-bold text-emerald-700 dark:text-emerald-300 tabular-nums">
            {insideEmployees.length}
          </div>
          <div className="text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 sm:mt-1 truncate">
            İşyerinde mesaide
          </div>
        </div>

        {/* On Break */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 sm:p-4 shadow-xs transition-colors">
          <div className="flex items-center justify-between text-amber-600 dark:text-amber-400 text-xs font-medium mb-1.5 sm:mb-2">
            <span className="truncate">Molada</span>
            <Coffee className="w-4 h-4 text-amber-500 dark:text-amber-400 shrink-0" />
          </div>
          <div className="font-mono text-xl sm:text-2xl font-bold text-amber-700 dark:text-amber-300 tabular-nums">
            {breakEmployees.length}
          </div>
          <div className="text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 sm:mt-1 truncate">
            Yemek & dinlenme
          </div>
        </div>

        {/* Not Arrived */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 sm:p-4 shadow-xs transition-colors">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-medium mb-1.5 sm:mb-2">
            <span className="truncate">Henüz Gelmedi</span>
            <Clock className="w-4 h-4 text-slate-400 dark:text-slate-500 shrink-0" />
          </div>
          <div className="font-mono text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">
            {notArrivedEmployees.length}
          </div>
          <div className="text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 sm:mt-1 truncate">
            Dışarıda / Gelmedi
          </div>
        </div>

        {/* Late Today (Live Shift Delay Counter) */}
        <div
          onClick={() => setStatusFilter('delayed')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && setStatusFilter('delayed')}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-rose-300 dark:hover:border-rose-600/60 rounded-xl p-3 sm:p-4 shadow-xs transition-colors cursor-pointer"
          title="Geciken ve henüz giriş yapmamış personelleri filtrele"
        >
          <div className="flex items-center justify-between text-rose-600 dark:text-rose-400 text-xs font-medium mb-1.5 sm:mb-2">
            <span className="truncate">Canlı Gecikme</span>
            <AlertTriangle className="w-4 h-4 text-rose-500 dark:text-rose-400 shrink-0" />
          </div>
          <div className="font-mono text-xl sm:text-2xl font-bold text-rose-700 dark:text-rose-300 tabular-nums">
            {delayedEmployees.length}
          </div>
          <div className="text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 sm:mt-1 truncate tabular-nums">
            {delayedEmployees.length > 0
              ? `${lateCheckinCount} geç giriş · ${absentLateCount} gelmedi`
              : 'Gecikme yok'}
          </div>
        </div>

        {/* Attendance Rate */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 sm:p-4 shadow-xs transition-colors">
          <div className="flex items-center justify-between text-indigo-600 dark:text-indigo-400 text-xs font-medium mb-1.5 sm:mb-2">
            <span className="truncate">Katılım Oranı</span>
            <ArrowUpRight className="w-4 h-4 text-indigo-500 dark:text-indigo-400 shrink-0" />
          </div>
          <div className="font-mono text-xl sm:text-2xl font-bold text-indigo-700 dark:text-indigo-300 tabular-nums">
            %{attendanceRate}
          </div>
          <div className="text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 sm:mt-1 truncate">
            {presentCount} / {activeCount} çalışan
          </div>
        </div>
      </div>

      {/* Onay Bildirim Toastı */}
      {approvalFeedback && (
        <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-300 dark:border-emerald-500/30 text-emerald-950 dark:text-emerald-200 font-medium text-xs flex items-center justify-between shadow-xs animate-in fade-in duration-300">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>{approvalFeedback}</span>
          </div>
          <button
            onClick={() => setApprovalFeedback(null)}
            className="text-emerald-700 dark:text-emerald-300 hover:text-emerald-900 dark:hover:text-emerald-100 p-1 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* KRİTİK CİHAZ GÜVENLİĞİ BİLDİRİMLERİ: Başka Personel Cihazı ile Giriş */}
      {(isHRManager || canApprove) && crossDeviceAlerts.length > 0 && (
        <div className="bg-rose-50 dark:bg-rose-500/10 border-2 border-rose-300 dark:border-rose-500/40 rounded-2xl p-4 sm:p-5 shadow-xs space-y-3 animate-fade-in">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-rose-600 text-white flex items-center justify-center shrink-0">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-rose-950 dark:text-rose-200 flex items-center gap-2 flex-wrap">
                  <span>Başka Personel Cihazı ile Giriş Tespit Edildi</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-rose-200 dark:bg-rose-500/25 text-rose-900 dark:text-rose-200">
                    {crossDeviceAlerts.length} Anlık Uyarı
                  </span>
                </h2>
                <p className="text-xs text-rose-800 dark:text-rose-300">
                  Bir personel, veritabanında başka bir personele kayıtlı cihaz üzerinden giriş/vardiya işlemi gerçekleştirdi.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={onNavigateToRecords}
                className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 hover:bg-rose-100 dark:hover:bg-rose-500/20 text-rose-800 dark:text-rose-200 border border-rose-300 dark:border-rose-500/40 text-xs font-bold cursor-pointer"
              >
                Hareket Kayıtlarını Aç
              </button>
              <button
                type="button"
                onClick={() => {
                  crossDeviceAlerts.forEach((a) => pdksStorage.markNotificationAsRead(a.id));
                  loadData();
                }}
                className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold cursor-pointer"
              >
                Okundu İşaretle
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {crossDeviceAlerts.map((alert) => (
              <div
                key={alert.id}
                className="bg-white dark:bg-slate-900 rounded-xl p-3 border border-rose-200 dark:border-rose-500/30 text-xs space-y-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-rose-900 dark:text-rose-200">{alert.metadata?.actorEmployeeName || alert.employeeName}</span>
                  <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                    {alert.metadata?.eventDateTime || new Date(alert.timestamp).toLocaleString('tr-TR')}
                  </span>
                </div>
                <div className="text-[11px] text-slate-700 dark:text-slate-300 space-y-0.5">
                  <div>
                    Cihazın Asıl Sahibi: <strong className="text-rose-700 dark:text-rose-300">{alert.metadata?.ownerEmployeeName || '-'}</strong>
                  </div>
                  <div className="font-mono text-[10px] text-slate-600 dark:text-slate-400">
                    MAC / ID: <strong className="text-slate-900 dark:text-slate-200">{alert.metadata?.macAddress || alert.metadata?.deviceId || '-'}</strong>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* İK ONAY BEKLEYENLER LİSTESİ: Fazla Mesai & İzin Talepleri */}
      <div id="pending-approvals-section" className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xs space-y-5 transition-colors">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="w-8 h-8 rounded-xl bg-amber-50 dark:bg-amber-500/15 border border-amber-200 dark:border-amber-500/30 text-amber-700 dark:text-amber-300 flex items-center justify-center">
                <FileCheck2 className="w-4 h-4" />
              </div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                Onay Bekleyen Talepler (Yeni Cihaz, Fazla Mesai & İzinler)
              </h2>
              {totalPendingApprovals > 0 ? (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-500/30">
                  {totalPendingApprovals} Bekleyen Talep
                </span>
              ) : (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30 flex items-center gap-1">
                  <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                  Tüm Talepler Güncel
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Farklı cihazdan giriş yapan personellerin 1 saat içerisindeki ilk iş yeri giriş onayları, fazla mesailer ve izinler anlık olarak buraya düşer.
            </p>
          </div>

          {/* Filter Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none shrink-0">
            <button
              onClick={() => setApprovalFilter('all')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                approvalFilter === 'all'
                  ? 'bg-slate-900 dark:bg-indigo-600 text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              Tümü ({totalPendingApprovals})
            </button>
            <button
              onClick={() => setApprovalFilter('device')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
                approvalFilter === 'device'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'bg-rose-50 dark:bg-rose-500/15 text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-500/25 border border-rose-200 dark:border-rose-500/30'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>Yeni Cihaz ({activeDeviceApprovals.length})</span>
            </button>
            <button
              onClick={() => setApprovalFilter('overtime')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
                approvalFilter === 'overtime'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-500/25 border border-amber-200 dark:border-amber-500/30'
              }`}
            >
              <Timer className="w-3.5 h-3.5" />
              <span>Fazla Mesai ({pendingOvertimes.length})</span>
            </button>
            <button
              onClick={() => setApprovalFilter('leave')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
                approvalFilter === 'leave'
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'bg-purple-50 dark:bg-purple-500/15 text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-500/25 border border-purple-200 dark:border-purple-500/30'
              }`}
            >
              <CalendarCheck className="w-3.5 h-3.5" />
              <span>İzin Talepleri ({pendingLeaves.length})</span>
            </button>
          </div>
        </div>

        {/* List of Requests */}
        {totalPendingApprovals === 0 ||
        (approvalFilter === 'device' && activeDeviceApprovals.length === 0) ||
        (approvalFilter === 'overtime' && pendingOvertimes.length === 0) ||
        (approvalFilter === 'leave' && pendingLeaves.length === 0) ? (
          <div className="py-8 text-center bg-slate-50/70 dark:bg-slate-800/50 border border-dashed border-slate-200 dark:border-slate-700 rounded-xl space-y-2">
            <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 mx-auto flex items-center justify-center">
              <Check className="w-5 h-5" />
            </div>
            <p className="font-semibold text-xs text-slate-800 dark:text-slate-200">
              {approvalFilter === 'device'
                ? 'Onay bekleyen yeni cihaz iş yeri girişi bulunmuyor.'
                : approvalFilter === 'overtime'
                ? 'Onay bekleyen fazla mesai talebi bulunmuyor.'
                : approvalFilter === 'leave'
                ? 'Onay bekleyen izin talebi bulunmuyor.'
                : 'Şu an İK onayını bekleyen yeni cihaz girişi, fazla mesai veya izin talebi bulunmamaktadır.'}
            </p>
            <p className="text-[11px] text-slate-400 dark:text-slate-400 max-w-md mx-auto">
              Personel farklı bir cihazdan giriş yaptığında veya fazla mesai / izin formu gönderdiğinde anlık olarak burada listelenecektir.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {/* 0. NEW DEVICE 1-HOUR ENTRY APPROVAL REQUESTS */}
            {(approvalFilter === 'all' || approvalFilter === 'device') &&
              activeDeviceApprovals.map((devReq) => {
                const remainingMins = Math.max(
                  1,
                  Math.ceil((Date.parse(devReq.expiresAt) - nowTick) / 60000)
                );
                const isRequested = devReq.status === 'check_in_requested';
                return (
                  <div
                    key={devReq.id}
                    className={`rounded-xl p-4 shadow-2xs space-y-3 flex flex-col justify-between transition-colors border ${
                      isRequested
                        ? 'bg-rose-50/60 dark:bg-rose-500/10 border-rose-300 dark:border-rose-500/35 hover:border-rose-400'
                        : 'bg-amber-50/50 dark:bg-amber-500/10 border-amber-300 dark:border-amber-500/35 hover:border-amber-400'
                    }`}
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                            isRequested
                              ? 'bg-rose-100 dark:bg-rose-500/20 text-rose-800 dark:text-rose-200 border-rose-200 dark:border-rose-500/30'
                              : 'bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-200 border-amber-200 dark:border-amber-500/30'
                          }`}
                        >
                          <ShieldAlert className="w-3 h-3" />
                          {isRequested ? 'İş Yeri Girişi Denendi (Acil)' : 'Farklı Cihazdan Giriş'}
                        </span>
                        <span className="text-[10px] font-mono font-bold text-rose-700 dark:text-rose-300 bg-white dark:bg-slate-900 px-2 py-0.5 rounded border border-rose-200 dark:border-rose-500/30">
                          {remainingMins} dk kaldı
                        </span>
                      </div>

                      <div>
                        <div className="font-bold text-sm text-slate-900 dark:text-slate-100">{devReq.employeeName}</div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                          @{devReq.username} · {devReq.department}
                        </div>
                      </div>

                      <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1.5 text-xs">
                        <div className="flex justify-between items-center gap-2 text-slate-700 dark:text-slate-300">
                          <span className="text-slate-500 dark:text-slate-400 shrink-0">Kayıtlı Cihaz:</span>
                          <span className="font-mono font-semibold text-slate-800 dark:text-slate-200 truncate">
                            {devReq.registeredDeviceName}
                            {devReq.registeredMacAddress ? ` (${devReq.registeredMacAddress})` : ''}
                          </span>
                        </div>
                        <div className="flex justify-between items-center gap-2 text-slate-700 dark:text-slate-300">
                          <span className="text-slate-500 dark:text-slate-400 shrink-0">Yeni Cihaz:</span>
                          <span className="font-mono font-bold text-rose-700 dark:text-rose-300 truncate">
                            {devReq.newDeviceName}
                            {devReq.newMacAddress ? ` (${devReq.newMacAddress})` : ''}
                          </span>
                        </div>
                        <div className="pt-1.5 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-400">
                          Yeni cihazdan giriş sonrası <strong className="text-slate-800 dark:text-slate-200">1 saat</strong> içindeki ilk iş yeri girişi yalnızca yönetici onayına tabidir.
                        </div>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-200/70 dark:border-slate-800 space-y-2">
                      <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                        <span>
                          Giriş:{' '}
                          {new Date(devReq.loginAt).toLocaleTimeString('tr-TR', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                        <span>
                          Kilit Bitişi:{' '}
                          {new Date(devReq.expiresAt).toLocaleTimeString('tr-TR', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      {canApprove ? (
                        <div className="flex flex-wrap items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleRejectDeviceEntry(devReq.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-rose-700 dark:text-rose-300 bg-white dark:bg-slate-800 hover:bg-rose-50 dark:hover:bg-rose-500/20 border border-rose-200 dark:border-rose-500/30 rounded-lg transition-colors cursor-pointer"
                            title="Yeni cihazdan iş yeri girişini reddet"
                          >
                            <X className="w-3.5 h-3.5" />
                            <span>Reddet</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleApproveDeviceEntry(devReq.id, false)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs transition-colors cursor-pointer"
                            title="Sadece bugünkü ilk iş yeri girişini onayla"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Girişi Onayla</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleApproveDeviceEntry(devReq.id, true)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-xs transition-colors cursor-pointer"
                            title="İş yeri girişini onayla ve yeni cihazı kullanıcının ana cihazı olarak kaydet"
                          >
                            <Smartphone className="w-3.5 h-3.5" />
                            <span>Onayla + Cihazı Kaydet</span>
                          </button>
                        </div>
                      ) : (
                        <div className="text-[11px] text-amber-700 dark:text-amber-300 font-semibold text-right">
                          Yalnızca İK Yöneticisi onaylayabilir
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

            {/* 1. OVERTIME REQUESTS */}
            {(approvalFilter === 'all' || approvalFilter === 'overtime') &&
              pendingOvertimes.map((ot) => (
                <div
                  key={ot.id}
                  className="bg-amber-50/40 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-xl p-4 shadow-2xs space-y-3 flex flex-col justify-between hover:border-amber-300 dark:hover:border-amber-400/50 transition-colors"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-500/30">
                        <Timer className="w-3 h-3 text-amber-600 dark:text-amber-300" />
                        Fazla Mesai Talebi
                      </span>
                      <span className="text-[10px] font-mono text-slate-400 dark:text-slate-400 font-semibold">{ot.id}</span>
                    </div>

                    <div>
                      <div className="font-bold text-sm text-slate-900 dark:text-slate-100">{ot.employeeName}</div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                        {ot.employeeId} · {ot.department}
                      </div>
                    </div>

                    <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-amber-200/80 dark:border-amber-500/25 space-y-1.5 text-xs">
                      <div className="flex justify-between items-center text-slate-700 dark:text-slate-300">
                        <span className="text-slate-500 dark:text-slate-400">Tarih:</span>
                        <span className="font-bold font-mono text-slate-900 dark:text-slate-100">{ot.date}</span>
                      </div>
                      <div className="flex justify-between items-center text-slate-700 dark:text-slate-300">
                        <span className="text-slate-500 dark:text-slate-400">Saat Dilimi:</span>
                        <span className="font-mono font-semibold text-amber-800 dark:text-amber-300">
                          {ot.startTime} - {ot.endTime} ({ot.hours} Saat)
                        </span>
                      </div>
                      {ot.reason && (
                        <div className="pt-1.5 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-400">
                          <span className="font-semibold text-slate-700 dark:text-slate-200">Gerekçe: </span>
                          <span className="italic">{ot.reason}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="pt-2 border-t border-amber-200/60 dark:border-amber-500/20 flex items-center justify-between gap-2">
                    <span className="text-[10px] text-slate-400 dark:text-slate-400 font-mono">
                      {new Date(ot.appliedAt).toLocaleDateString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {canApprove && (
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleRejectOvertime(ot.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-rose-700 dark:text-rose-300 bg-white dark:bg-slate-800 hover:bg-rose-50 dark:hover:bg-rose-500/20 border border-rose-200 dark:border-rose-500/30 rounded-lg transition-colors cursor-pointer"
                          title="Talebi Reddet"
                        >
                          <X className="w-3.5 h-3.5" />
                          <span>Reddet</span>
                        </button>
                        <button
                          onClick={() => handleApproveOvertime(ot.id)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs transition-colors cursor-pointer"
                          title="Fazla Mesaiyi Onayla ve Personele Bildirim Gönder"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Onayla</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}

            {/* 2. LEAVE REQUESTS */}
            {(approvalFilter === 'all' || approvalFilter === 'leave') &&
              pendingLeaves.map((lr) => (
                <div
                  key={lr.id}
                  className="bg-purple-50/40 dark:bg-purple-500/10 border border-purple-200 dark:border-purple-500/30 rounded-xl p-4 shadow-2xs space-y-3 flex flex-col justify-between hover:border-purple-300 dark:hover:border-purple-400/50 transition-colors"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-100 dark:bg-purple-500/20 text-purple-800 dark:text-purple-200 border border-purple-200 dark:border-purple-500/30">
                        <CalendarCheck className="w-3 h-3 text-purple-600 dark:text-purple-300" />
                        {lr.leaveType}
                      </span>
                      <span className="text-[10px] font-mono text-slate-400 dark:text-slate-400 font-semibold">{lr.id}</span>
                    </div>

                    <div>
                      <div className="font-bold text-sm text-slate-900 dark:text-slate-100">{lr.employeeName}</div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                        {lr.employeeId} · {lr.department}
                      </div>
                    </div>

                    <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-purple-200/80 dark:border-purple-500/25 space-y-1.5 text-xs">
                      <div className="flex justify-between items-center text-slate-700 dark:text-slate-300">
                        <span className="text-slate-500 dark:text-slate-400">Tarih Aralığı:</span>
                        <span className="font-bold font-mono text-slate-900 dark:text-slate-100">
                          {lr.startDate} → {lr.endDate}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-slate-700 dark:text-slate-300">
                        <span className="text-slate-500 dark:text-slate-400">İzin Süresi:</span>
                        <span className="font-mono font-semibold text-purple-800 dark:text-purple-300">{lr.days} Gün</span>
                      </div>
                      {lr.reason && (
                        <div className="pt-1.5 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-400">
                          <span className="font-semibold text-slate-700 dark:text-slate-200">Açıklama: </span>
                          <span className="italic">{lr.reason}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="pt-2 border-t border-purple-200/60 dark:border-purple-500/20 flex items-center justify-between gap-2">
                    <span className="text-[10px] text-slate-400 dark:text-slate-400 font-mono">
                      {new Date(lr.appliedAt).toLocaleDateString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {canApprove && (
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleRejectLeave(lr.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-rose-700 dark:text-rose-300 bg-white dark:bg-slate-800 hover:bg-rose-50 dark:hover:bg-rose-500/20 border border-rose-200 dark:border-rose-500/30 rounded-lg transition-colors cursor-pointer"
                          title="İzni Reddet"
                        >
                          <X className="w-3.5 h-3.5" />
                          <span>Reddet</span>
                        </button>
                        <button
                          onClick={() => handleApproveLeave(lr.id)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs transition-colors cursor-pointer"
                          title="İzni Onayla ve Personele Bildir"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Onayla</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>

      {/* Middle Row: Live Attendance Feed & Department Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Live Attendance Activity (Col 2) */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs transition-colors">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 mb-4">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Bugünün Canlı Geçiş Akışı
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Turnikelerden ve mobil QR okutuculardan gelen anlık hareketler
              </p>
            </div>
            <button
              onClick={onNavigateToRecords}
              className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 flex items-center gap-1 cursor-pointer"
            >
              Tüm Kayıtlar <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Mobile Optimized View: Live Feed Card List (sm:hidden) */}
          <div className="sm:hidden space-y-2">
            {todayRecords.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
                Bugün ({todayStr}) için henüz giriş-çıkış hareketi kaydedilmedi.
              </div>
            ) : (
              todayRecords.slice(0, 10).map((rec) => {
                const isCheckIn = rec.type === 'check_in';
                const isCheckOut = rec.type === 'check_out';
                const isBreak = rec.type.startsWith('break');
                const isSecurityAlert = rec.type === 'security_alert';

                return (
                  <div
                    key={rec.id}
                    className={`p-3 rounded-xl border flex items-center justify-between gap-2.5 ${
                      rec.isSuspiciousDevice || isSecurityAlert
                        ? 'bg-rose-50/70 dark:bg-rose-500/10 border-rose-300 dark:border-rose-500/35'
                        : 'bg-slate-50 dark:bg-slate-800/70 border-slate-200/80 dark:border-slate-700'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="font-mono font-bold text-slate-900 dark:text-slate-100 text-xs tabular-nums">
                          {rec.timeStr}
                        </span>
                        <span className="text-[10px] text-slate-400 dark:text-slate-500">·</span>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">{rec.employeeId}</span>
                      </div>
                      <div className="font-semibold text-xs text-slate-900 dark:text-slate-100 truncate">
                        {rec.employeeName}
                      </div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">{rec.department}</div>
                      {rec.isSuspiciousDevice && (
                        <div className="text-[10px] font-semibold text-rose-700 dark:text-rose-300 truncate mt-0.5">
                          Başka Cihaz ({rec.deviceOwnerEmployeeName || '-'})
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col items-end gap-1 shrink-0">
                      {isCheckIn && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100/80 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300">
                          <ArrowDownRight className="w-3 h-3 text-emerald-600 dark:text-emerald-400" /> Giriş
                        </span>
                      )}
                      {isCheckOut && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-100/80 dark:bg-rose-500/20 text-rose-800 dark:text-rose-300">
                          <ArrowUpRight className="w-3 h-3 text-rose-600 dark:text-rose-400" /> Çıkış
                        </span>
                      )}
                      {isBreak && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100/80 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300">
                          <Coffee className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                          {rec.type === 'break_start' ? 'Mola Başla' : 'Mola Bitir'}
                        </span>
                      )}
                      {isSecurityAlert && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-100 dark:bg-rose-500/20 text-rose-800 dark:text-rose-200 border border-rose-200 dark:border-rose-500/30">
                          <ShieldAlert className="w-3 h-3 text-rose-600 dark:text-rose-400" /> Güvenlik
                        </span>
                      )}

                      <span className="text-[10px]">
                        {rec.isSuspiciousDevice ? (
                          <span className="text-rose-700 dark:text-rose-300 font-bold">Şüpheli Cihaz</span>
                        ) : rec.status === 'late' ? (
                          <span className="text-amber-700 dark:text-amber-300 font-semibold">Geç (+{rec.lateMinutes} dk)</span>
                        ) : rec.status === 'on_time' ? (
                          <span className="text-emerald-700 dark:text-emerald-300 font-medium">Zamanında</span>
                        ) : rec.status === 'early_leave' ? (
                          <span className="text-orange-700 dark:text-orange-300 font-medium">Erken Çıkış</span>
                        ) : (
                          <span className="text-slate-500 dark:text-slate-400">Normal</span>
                        )}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Desktop Table View (hidden sm:block) */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 dark:text-slate-400 font-semibold uppercase tracking-wider">
                  <th className="py-2.5 px-3">Saat</th>
                  <th className="py-2.5 px-3">Personel</th>
                  <th className="py-2.5 px-3">Departman</th>
                  <th className="py-2.5 px-3">Hareket Tipi</th>
                  <th className="py-2.5 px-3">Durum</th>
                  <th className="py-2.5 px-3">Terminal / Cihaz</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {todayRecords.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 px-3 text-center text-xs text-slate-500 dark:text-slate-400">
                      Bugün ({todayStr}) için henüz giriş-çıkış hareketi kaydedilmedi.
                    </td>
                  </tr>
                ) : (
                  todayRecords.slice(0, 12).map((rec) => {
                    const isCheckIn = rec.type === 'check_in';
                    const isCheckOut = rec.type === 'check_out';
                    const isBreak = rec.type.startsWith('break');
                    const isSecurityAlert = rec.type === 'security_alert';

                    return (
                      <tr
                        key={rec.id}
                        className={`transition-colors ${
                          rec.isSuspiciousDevice || isSecurityAlert
                            ? 'bg-rose-50/60 dark:bg-rose-500/10 hover:bg-rose-50 dark:hover:bg-rose-500/15'
                            : 'hover:bg-slate-50/70 dark:hover:bg-slate-800/60'
                        }`}
                      >
                        <td className="py-2.5 px-3 font-mono font-medium text-slate-900 dark:text-slate-100 tabular-nums">
                          {rec.timeStr}
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="font-semibold text-slate-900 dark:text-slate-100">{rec.employeeName}</div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">{rec.employeeId}</div>
                        </td>
                        <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300">
                          {rec.department}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="flex items-center gap-1 font-medium">
                            {isCheckIn && (
                              <span className="text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
                                <ArrowDownRight className="w-3 h-3" /> Giriş
                              </span>
                            )}
                            {isCheckOut && (
                              <span className="text-rose-700 dark:text-rose-300 flex items-center gap-1">
                                <ArrowUpRight className="w-3 h-3" /> Çıkış
                              </span>
                            )}
                            {isBreak && (
                              <span className="text-amber-700 dark:text-amber-300 flex items-center gap-1">
                                <Coffee className="w-3 h-3" /> {rec.type === 'break_start' ? 'Mola Başlangıç' : 'Mola Bitiş'}
                              </span>
                            )}
                            {isSecurityAlert && (
                              <span className="text-rose-700 dark:text-rose-300 flex items-center gap-1 font-semibold">
                                <ShieldAlert className="w-3 h-3" /> Güvenlik Uyarısı
                              </span>
                            )}
                          </span>
                        </td>
                        <td className="py-2.5 px-3">
                          {rec.isSuspiciousDevice ? (
                            <div>
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-100 dark:bg-rose-500/20 text-rose-800 dark:text-rose-200 border border-rose-200 dark:border-rose-500/30 text-[10px] font-bold">
                                Başka Personel Cihazı
                              </span>
                              {rec.deviceOwnerEmployeeName && (
                                <div className="text-[10px] text-rose-700 dark:text-rose-300 font-medium mt-0.5">
                                  Sahip: {rec.deviceOwnerEmployeeName}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-600 dark:text-slate-300 font-medium">
                              {rec.status === 'late' ? (
                                <span className="text-amber-700 dark:text-amber-300">Geç ({rec.lateMinutes} dk)</span>
                              ) : rec.status === 'on_time' ? (
                                <span className="text-emerald-700 dark:text-emerald-300">Zamanında</span>
                              ) : rec.status === 'early_leave' ? (
                                <span className="text-orange-700 dark:text-orange-300">Erken Çıkış</span>
                              ) : (
                                <span>Normal</span>
                              )}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-slate-500 dark:text-slate-400 text-[11px]">
                          <div>{rec.terminal || 'Kiosk Giriş'}</div>
                          {rec.macAddress && (
                            <div className="text-[10px] font-mono text-slate-400 dark:text-slate-500">
                              MAC: {rec.macAddress}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Department Attendance Rates (Col 1) */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs flex flex-col justify-between transition-colors">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-1">
              Departman Devamlılığı
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              Birim bazında ofis mevcudiyeti
            </p>

            <div className="space-y-4">
              {departmentStats.map((item) => (
                <div key={item.department} className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="font-medium text-slate-700 dark:text-slate-200">{item.department}</span>
                    <span className="font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                      {item.present} / {item.total} (%{item.rate})
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        item.rate >= 80
                          ? 'bg-emerald-500'
                          : item.rate >= 50
                          ? 'bg-indigo-500'
                          : 'bg-amber-500'
                      }`}
                      style={{ width: `${item.rate}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-4 mt-4 border-t border-slate-100 dark:border-slate-800">
            <button
              onClick={onNavigateToEmployees}
              className="w-full py-2 px-3 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Users className="w-3.5 h-3.5" /> Personel Kartlarını Yönet
            </button>
          </div>
        </div>
      </div>

      {/* CANLI PERSONEL DURUM TABLOSU (Kim İşyerinde/Ofiste, Kim Molada, Kim Çıkış Yapmış?) */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xs space-y-5 transition-colors">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                Canlı Personel Durum Tablosu
              </h2>
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Gerçek Zamanlı
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Anlık olarak kim işyerinde çalışıyor, kim molada, kim çıkış yapmış veya izinli?
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Search Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Personel veya departman ara..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:bg-white dark:focus:bg-slate-900 focus:ring-2 focus:ring-indigo-500 w-56"
              />
            </div>
          </div>
        </div>

        {/* Status Filter Tabs (Required: Kim İçeride, Kim Molada, Kim Çıkış Yapmış?) */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer shrink-0 ${
              statusFilter === 'all'
                ? 'bg-slate-900 dark:bg-indigo-600 text-white shadow-xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            Tüm Kadro ({employees.length})
          </button>

          <button
            onClick={() => setStatusFilter('inside')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors whitespace-nowrap flex items-center gap-1.5 cursor-pointer shrink-0 ${
              statusFilter === 'inside'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-500/25 border border-emerald-200 dark:border-emerald-500/30'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span>İşyerinde / Ofiste ({insideEmployees.length})</span>
          </button>

          <button
            onClick={() => setStatusFilter('break')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors whitespace-nowrap flex items-center gap-1.5 cursor-pointer shrink-0 ${
              statusFilter === 'break'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-500/25 border border-amber-200 dark:border-amber-500/30'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            <span>Molada ({breakEmployees.length})</span>
          </button>

          <button
            onClick={() => setStatusFilter('outside')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors whitespace-nowrap flex items-center gap-1.5 cursor-pointer shrink-0 ${
              statusFilter === 'outside'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'bg-rose-50 dark:bg-rose-500/15 text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-500/25 border border-rose-200 dark:border-rose-500/30'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-rose-400" />
            <span>Dışarıda / Ayrıldı ({employees.filter(e => e.currentPresence === 'outside' && e.status !== 'leave').length})</span>
          </button>

          <button
            onClick={() => setStatusFilter('leave')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap flex items-center gap-1.5 cursor-pointer shrink-0 ${
              statusFilter === 'leave'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-500/25 border border-blue-200 dark:border-blue-500/30'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-blue-400" />
            <span>İzinli ({leaveEmployees.length})</span>
          </button>

          <button
            onClick={() => setStatusFilter('delayed')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors whitespace-nowrap flex items-center gap-1.5 cursor-pointer shrink-0 ${
              statusFilter === 'delayed'
                ? 'bg-orange-600 text-white shadow-xs'
                : 'bg-orange-50 dark:bg-orange-500/15 text-orange-800 dark:text-orange-300 hover:bg-orange-100 dark:hover:bg-orange-500/25 border border-orange-200 dark:border-orange-500/30'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Geciken / Gelmeyen ({delayedEmployees.length})</span>
          </button>
        </div>

        {/* Mobile View: Personnel Live Status Cards (md:hidden) */}
        <div className="md:hidden space-y-2.5">
          {employees
            .filter((emp) => {
              if (statusFilter === 'inside') return emp.currentPresence === 'inside';
              if (statusFilter === 'break') return emp.currentPresence === 'break';
              if (statusFilter === 'outside') return emp.currentPresence === 'outside' && emp.status !== 'leave';
              if (statusFilter === 'leave') return emp.status === 'leave';
              if (statusFilter === 'delayed') return Boolean(liveDelayMap.get(emp.id)?.isDelayed);
              return true;
            })
            .filter((emp) => {
              if (!searchQuery) return true;
              const q = searchQuery.toLowerCase();
              return (
                emp.fullName.toLowerCase().includes(q) ||
                emp.department.toLowerCase().includes(q) ||
                emp.id.toLowerCase().includes(q)
              );
            })
            .map((emp) => {
              const isInside = emp.currentPresence === 'inside';
              const isBreak = emp.currentPresence === 'break';
              const isLeave = emp.status === 'leave';
              const delayInfo = liveDelayMap.get(emp.id);

              return (
                <div
                  key={emp.id}
                  className={`p-3.5 rounded-xl border space-y-2.5 ${
                    delayInfo?.state === 'absent_late'
                      ? 'bg-rose-50/60 dark:bg-rose-950/20 border-rose-300 dark:border-rose-500/40'
                      : delayInfo?.isDelayed
                      ? 'bg-amber-50/50 dark:bg-amber-950/20 border-amber-300 dark:border-amber-500/40'
                      : 'bg-slate-50/90 dark:bg-slate-800/70 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <img
                        src={emp.avatar}
                        alt={emp.fullName}
                        className="w-10 h-10 rounded-full object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                        referrerPolicy="no-referrer"
                      />
                      <div className="min-w-0">
                        <div className="font-bold text-xs text-slate-900 dark:text-slate-100 truncate">
                          {emp.fullName}
                        </div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                          {emp.id} · {emp.department}
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0 text-right space-y-1">
                      {isLeave ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-50 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-500/30">
                          İzinli
                        </span>
                      ) : isInside ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-500/30">
                          İçeride (Mesaide)
                        </span>
                      ) : isBreak ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-500/30">
                          <Coffee className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                          Molada
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                          Dışarıda
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Live Delay Warning Strip on Mobile Card */}
                  {delayInfo?.isDelayed && delayInfo.badgeText && (
                    <div
                      className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-[11px] font-bold border tabular-nums ${
                        delayInfo.state === 'absent_late' || delayInfo.severity === 'critical'
                          ? 'bg-rose-100/90 dark:bg-rose-500/20 text-rose-800 dark:text-rose-200 border-rose-300 dark:border-rose-500/40'
                          : 'bg-amber-100/90 dark:bg-amber-500/20 text-amber-900 dark:text-amber-200 border-amber-300 dark:border-amber-500/40'
                      }`}
                    >
                      <span className="inline-flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        <span>{delayInfo.badgeText}</span>
                      </span>
                      <span className="font-mono text-[10px]">
                        Vardiya {delayInfo.resolvedShift.startTime}
                      </span>
                    </div>
                  )}

                  <div className="pt-2 border-t border-slate-200/60 dark:border-slate-700 flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-300">
                    <div className="font-mono tabular-nums">
                      <span className="text-slate-400 dark:text-slate-400 font-sans">Vardiya: </span>
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        {delayInfo?.resolvedShift.isOffDay
                          ? 'OFF'
                          : `${delayInfo?.resolvedShift.startTime || '08:30'}–${delayInfo?.resolvedShift.endTime || '17:30'}`}
                      </span>
                    </div>
                    <div className="font-mono tabular-nums text-[10px] text-slate-500 dark:text-slate-400">
                      Giriş: {delayInfo?.checkInTime || emp.lastActionTime || 'Yok'}
                    </div>
                  </div>
                </div>
              );
            })}
        </div>

        {/* Desktop View: Live Status Table (hidden md:block) */}
        <div className="hidden md:block overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold">
                <th className="py-3 px-4">Personel Bilgisi</th>
                <th className="py-3 px-4">Departman & Görev</th>
                <th className="py-3 px-4">Anlık Durum</th>
                <th className="py-3 px-4">Canlı Gecikme Takibi</th>
                <th className="py-3 px-4">Giriş / Son İşlem</th>
                <th className="py-3 px-4">Bugünkü Vardiya</th>
                <th className="py-3 px-4 text-right">Mesai Süresi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {employees
                .filter((emp) => {
                  if (statusFilter === 'inside') return emp.currentPresence === 'inside';
                  if (statusFilter === 'break') return emp.currentPresence === 'break';
                  if (statusFilter === 'outside') return emp.currentPresence === 'outside' && emp.status !== 'leave';
                  if (statusFilter === 'leave') return emp.status === 'leave';
                  if (statusFilter === 'delayed') return Boolean(liveDelayMap.get(emp.id)?.isDelayed);
                  return true;
                })
                .filter((emp) => {
                  if (!searchQuery) return true;
                  const q = searchQuery.toLowerCase();
                  return (
                    emp.fullName.toLowerCase().includes(q) ||
                    emp.department.toLowerCase().includes(q) ||
                    emp.id.toLowerCase().includes(q)
                  );
                })
                .map((emp) => {
                  const isInside = emp.currentPresence === 'inside';
                  const isBreak = emp.currentPresence === 'break';
                  const isLeave = emp.status === 'leave';
                  const delayInfo = liveDelayMap.get(emp.id);
                  const shiftInfo = delayInfo?.resolvedShift;

                  return (
                    <tr
                      key={emp.id}
                      className={`transition-colors ${
                        delayInfo?.state === 'absent_late'
                          ? 'bg-rose-50/40 dark:bg-rose-950/15 hover:bg-rose-50/80 dark:hover:bg-rose-950/25'
                          : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/60'
                      }`}
                    >
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <img
                            src={emp.avatar}
                            alt={emp.fullName}
                            className="w-9 h-9 rounded-full object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                            referrerPolicy="no-referrer"
                          />
                          <div>
                            <div className="font-bold text-slate-900 dark:text-slate-100">{emp.fullName}</div>
                            <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 tabular-nums">{emp.id}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-800 dark:text-slate-200">{emp.department}</div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">{emp.title}</div>
                      </td>
                      <td className="py-3 px-4">
                        {isLeave ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 dark:text-blue-300">
                            İzinli
                          </span>
                        ) : isInside ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                            İçeride (Çalışıyor)
                          </span>
                        ) : isBreak ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
                            <Coffee className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                            Molada
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400">
                            {delayInfo?.checkOutTime ? 'Çıkış Yaptı' : 'Giriş Yapmadı'}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        {delayInfo?.isDelayed && delayInfo.badgeText ? (
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold border tabular-nums whitespace-nowrap ${
                              delayInfo.state === 'absent_late' || delayInfo.severity === 'critical'
                                ? 'bg-rose-50 dark:bg-rose-500/20 text-rose-800 dark:text-rose-200 border-rose-300 dark:border-rose-500/40'
                                : 'bg-amber-50 dark:bg-amber-500/20 text-amber-800 dark:text-amber-200 border-amber-300 dark:border-amber-500/40'
                            }`}
                            title={
                              delayInfo.state === 'absent_late'
                                ? 'Vardiya başlangıç saati geçti — gecikme sayacı canlı artıyor'
                                : 'Vardiya başlangıç saatinden sonra giriş yapıldı'
                            }
                          >
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                            <span>{delayInfo.badgeText}</span>
                          </span>
                        ) : delayInfo?.state === 'on_time' || delayInfo?.state === 'checked_out' ? (
                          <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                            Zamanında
                          </span>
                        ) : delayInfo?.state === 'off_day' ? (
                          <span className="text-[11px] text-slate-400 dark:text-slate-500">Hafta Tatili</span>
                        ) : delayInfo?.state === 'on_leave' ? (
                          <span className="text-[11px] text-blue-600 dark:text-blue-400">Resmi İzin</span>
                        ) : (
                          <span className="text-[11px] text-slate-400 dark:text-slate-500">Vardiya Başlamadı</span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono font-medium text-slate-800 dark:text-slate-200 tabular-nums">
                        {delayInfo?.checkInTime ? (
                          <div>
                            <span>{delayInfo.checkInTime}</span>
                            {delayInfo.checkOutTime && (
                              <div className="text-[10px] text-slate-400 dark:text-slate-500">
                                Çıkış: {delayInfo.checkOutTime}
                              </div>
                            )}
                          </div>
                        ) : emp.lastActionTime ? (
                          emp.lastActionTime
                        ) : (
                          <span className="text-slate-400 dark:text-slate-500 font-sans font-normal">Giriş yok</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-600 dark:text-slate-300">
                        {shiftInfo?.isOffDay ? (
                          <span className="text-slate-400 dark:text-slate-500 font-medium">Hafta Tatili / OFF</span>
                        ) : (
                          <>
                            <span className="font-mono font-semibold text-slate-800 dark:text-slate-200 tabular-nums">
                              {shiftInfo?.startTime || '08:30'} - {shiftInfo?.endTime || '17:30'}
                            </span>
                            <div className="text-[10px] text-slate-400 dark:text-slate-500 truncate max-w-[150px]">
                              {shiftInfo?.shiftName?.split('(')[0].trim() || 'Standart'} · ±{shiftInfo?.toleranceMinutes ?? 15} dk
                            </div>
                          </>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums">
                        {delayInfo && delayInfo.workedMinutesToday > 0 ? (
                          <span className="font-semibold text-slate-800 dark:text-slate-200">
                            {formatMinutesTurkish(delayInfo.workedMinutesToday)}
                          </span>
                        ) : (
                          <span className="text-slate-400 dark:text-slate-500 text-[11px] font-sans">
                            {isLeave ? 'İzinli' : shiftInfo?.isOffDay ? 'OFF' : '-'}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>

      {/* İK & Yönetici Bildirim Merkezi Modalı */}
      <NotificationCenter
        mode="modal"
        isOpen={isNotificationModalOpen}
        onClose={() => setIsNotificationModalOpen(false)}
        title="İK & Yönetici Bildirim Merkezi"
        currentUser={activeUser}
      />
    </div>
  );
};

