import React, { useState, useEffect } from 'react';
import {
  Users,
  UserCheck,
  Clock,
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  ArrowDownRight,
  Coffee,
  Calendar,
  Download,
  QrCode,
  TrendingUp,
  Printer,
  Code2,
  Search,
  Filter,
  CheckCircle2,
  Sparkles,
  Image as ImageIcon,
  Bell,
  Timer,
  CalendarCheck,
  Check,
  X,
  FileCheck2,
} from 'lucide-react';
import { Employee, AttendanceRecord, Department, OvertimeRequest, LeaveRequest } from '../types/pdks';
import { pdksStorage } from '../services/storage';
import { NotificationCenter } from './NotificationCenter';

interface DashboardOverviewProps {
  onNavigateToKiosk: () => void;
  onNavigateToEmployees: () => void;
  onNavigateToRecords: () => void;
  onNavigateToPerformance?: () => void;
  onOpenWallQR?: () => void;
  onOpenArchitecture?: () => void;
  onOpenLogoManager?: () => void;
  currentUser?: import('../types/pdks').CurrentUser;
}

export const DashboardOverview: React.FC<DashboardOverviewProps> = ({
  onNavigateToKiosk,
  onNavigateToEmployees,
  onNavigateToRecords,
  onNavigateToPerformance,
  onOpenWallQR,
  onOpenArchitecture,
  onOpenLogoManager,
  currentUser,
}) => {
  const activeUser = currentUser || pdksStorage.getActiveUser();
  const isHRManager = activeUser.role === 'ik_yoneticisi';
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [overtimeRequests, setOvertimeRequests] = useState<OvertimeRequest[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [statusFilter, setStatusFilter] = useState<'all' | 'inside' | 'break' | 'outside' | 'leave'>('all');
  const [approvalFilter, setApprovalFilter] = useState<'all' | 'overtime' | 'leave'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isNotificationModalOpen, setIsNotificationModalOpen] = useState(false);
  const [unreadAlertCount, setUnreadAlertCount] = useState(0);
  const [approvalFeedback, setApprovalFeedback] = useState<string | null>(null);
  const companyLogo = pdksStorage.getCompanyLogo();

  const loadData = () => {
    setEmployees(pdksStorage.getEmployees());
    setRecords(pdksStorage.getAttendanceRecords());
    setOvertimeRequests(pdksStorage.getOvertimeRequests());
    setLeaveRequests(pdksStorage.getLeaveRequests());
    const notifs = pdksStorage.getNotifications().filter((n) => !n.read);
    setUnreadAlertCount(notifs.length);
  };

  useEffect(() => {
    loadData();

    const handleLiveEvent = () => {
      loadData();
    };
    window.addEventListener('pdks-notification', handleLiveEvent);
    return () => window.removeEventListener('pdks-notification', handleLiveEvent);
  }, []);

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

  // Pending Approvals (Fazla Mesai ve İzin Talepleri)
  const pendingOvertimes = overtimeRequests.filter((r) => r.status === 'pending');
  const pendingLeaves = leaveRequests.filter((l) => l.status === 'pending');
  const totalPendingApprovals = pendingOvertimes.length + pendingLeaves.length;
  
  // Late today check
  const todayStr = new Date().toISOString().split('T')[0];
  const todayRecords = records.filter((r) => r.date === todayStr);
  const lateRecords = todayRecords.filter((r) => r.type === 'check_in' && r.status === 'late');
  
  // Employees who haven't arrived yet (not leave, and outside with no check-in today)
  const checkedInIds = new Set(todayRecords.filter((r) => r.type === 'check_in').map((r) => r.employeeId));
  const notArrivedEmployees = employees.filter((e) => e.status === 'active' && !checkedInIds.has(e.id));

  // Attendance percentage
  const activeCount = employees.filter((e) => e.status !== 'inactive').length;
  const attendanceRate = activeCount > 0 ? Math.round((checkedInIds.size / activeCount) * 100) : 0;

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
      r.type === 'check_in' ? 'Giriş' : r.type === 'check_out' ? 'Çıkış' : 'Mola',
      r.status === 'late' ? `Geç (${r.lateMinutes} dk)` : r.status === 'early_leave' ? 'Erken Çıkış' : 'Zamanında',
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
    <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8 space-y-5 sm:space-y-8">
      {/* Top Banner & Quick Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 pb-3 sm:pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
            Asem Canlı Yönetim Panosu
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5 sm:mt-1">
            Bugünkü katılım durumu, canlı geçiş hareketleri ve personel devam istatistikleri.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2">
          {isHRManager && onOpenLogoManager && (
            <button
              onClick={onOpenLogoManager}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-bold text-purple-700 bg-purple-50 border border-purple-200 hover:bg-purple-100 rounded-lg shadow-xs transition-colors cursor-pointer"
              title="Şirket logosunu standart boyutlarda ekleyin veya güncelleyin (İK Yetkisi)"
            >
              <ImageIcon className="w-3.5 h-3.5 text-purple-600" />
              <span>Kurumsal Logo</span>
            </button>
          )}

          {isHRManager && onOpenWallQR && (
            <button
              onClick={onOpenWallQR}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 rounded-lg shadow-xs transition-colors cursor-pointer"
              title="Şirket duvarına asılacak A4 poster QR kodunu görüntüle ve yazdır (Yalnızca İK)"
            >
              <Printer className="w-3.5 h-3.5 text-indigo-600" />
              <span>Duvar QR'ı</span>
            </button>
          )}

          {onNavigateToPerformance && (
            <button
              onClick={onNavigateToPerformance}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 rounded-lg shadow-xs transition-colors cursor-pointer"
            >
              <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
              <span>Performans</span>
            </button>
          )}

          <button
            onClick={handleExportCSV}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg shadow-xs transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span>Excel / CSV</span>
          </button>

          <button
            onClick={() => setIsNotificationModalOpen(true)}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-bold text-amber-900 bg-amber-50 border border-amber-200 hover:bg-amber-100 rounded-lg shadow-xs transition-colors cursor-pointer"
            title="Sistem Bildirim Merkezi: Gecikmeler, izinler ve vardiya alarmları"
          >
            <Bell className="w-3.5 h-3.5 text-amber-600" />
            <span>Bildirimler</span>
            {unreadAlertCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-rose-600 text-white text-[10px] font-bold font-mono">
                {unreadAlertCount > 9 ? '9+' : unreadAlertCount}
              </span>
            )}
          </button>

          <a
            href="#pending-approvals-section"
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-bold text-indigo-900 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 rounded-lg shadow-xs transition-colors cursor-pointer"
            title="Personel mobil portalından gelen onay bekleyen fazla mesai ve izin talepleri"
          >
            <FileCheck2 className="w-3.5 h-3.5 text-indigo-600" />
            <span>Onay Bekleyenler</span>
            {totalPendingApprovals > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-amber-600 text-white text-[10px] font-bold font-mono">
                {totalPendingApprovals}
              </span>
            )}
          </a>

          <button
            onClick={onNavigateToKiosk}
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-sm transition-colors cursor-pointer"
          >
            <QrCode className="w-3.5 h-3.5" />
            <span>Kiosk</span>
          </button>
        </div>
      </div>

      {/* İK Kurumsal Şirket Logosu Yönetim Alanı (Talep: Logo ekleme kısmı herkese açık olmasın ik yönetici sayfasında olsun) */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          {/* 240x60 Standart Boyutlu Logo Çerçevesi */}
          <div className="w-[240px] h-[60px] max-w-full rounded-xl border-2 border-dashed border-indigo-200 bg-slate-50 flex items-center justify-center p-2 shrink-0 self-center sm:self-auto shadow-2xs">
            <img
              src={companyLogo}
              alt="Kurumsal Standart Şirket Logosu"
              className="max-h-[48px] max-w-[220px] w-auto h-auto object-contain"
            />
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-slate-900">
                Kurumsal Şirket Logosu
              </h2>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-200">
                İK Yönetici Alanı
              </span>
            </div>
            <p className="text-xs text-slate-500 max-w-lg leading-relaxed">
              Bu logo giriş ekranında, üst menüde, turnike kiosklarında ve duvar QR posterlerinde standart <strong>240 × 60 px</strong> boyutlarında yayınlanır.
            </p>
            <div className="text-[11px] font-mono text-indigo-700 font-semibold">
              Standart Boyut: 240 × 60 px (4:1 En/Boy Oranı)
            </div>
          </div>
        </div>

        {onOpenLogoManager && (
          <button
            onClick={onOpenLogoManager}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-xs font-bold shadow-sm transition-all cursor-pointer whitespace-nowrap active:scale-95 shrink-0"
          >
            <ImageIcon className="w-4 h-4" />
            <span>Şirket Logosunu Değiştir / Yükle</span>
          </button>
        )}
      </div>


      {/* Primary KPI Grid (Tabular numerals enforced, Mobile Optimized) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 sm:gap-4">
        {/* Total Staff */}
        <div className="bg-white border border-slate-200 rounded-xl p-3 sm:p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium mb-1.5 sm:mb-2">
            <span className="truncate">Toplam Kadro</span>
            <Users className="w-4 h-4 text-slate-400 shrink-0" />
          </div>
          <div className="font-mono text-xl sm:text-2xl font-bold text-slate-900 tabular-nums">
            {totalEmployees}
          </div>
          <div className="text-[10px] sm:text-[11px] text-slate-500 mt-0.5 sm:mt-1 truncate">
            Kayıtlı aktif kadro
          </div>
        </div>

        {/* Present Inside */}
        <div className="bg-white border border-slate-200 rounded-xl p-3 sm:p-4 shadow-xs">
          <div className="flex items-center justify-between text-emerald-600 text-xs font-medium mb-1.5 sm:mb-2">
            <span className="truncate">Şu An Ofiste</span>
            <UserCheck className="w-4 h-4 text-emerald-500 shrink-0" />
          </div>
          <div className="font-mono text-xl sm:text-2xl font-bold text-emerald-700 tabular-nums">
            {insideEmployees.length}
          </div>
          <div className="text-[10px] sm:text-[11px] text-slate-500 mt-0.5 sm:mt-1 truncate">
            İşyerinde mesaide
          </div>
        </div>

        {/* On Break */}
        <div className="bg-white border border-slate-200 rounded-xl p-3 sm:p-4 shadow-xs">
          <div className="flex items-center justify-between text-amber-600 text-xs font-medium mb-1.5 sm:mb-2">
            <span className="truncate">Molada</span>
            <Coffee className="w-4 h-4 text-amber-500 shrink-0" />
          </div>
          <div className="font-mono text-xl sm:text-2xl font-bold text-amber-700 tabular-nums">
            {breakEmployees.length}
          </div>
          <div className="text-[10px] sm:text-[11px] text-slate-500 mt-0.5 sm:mt-1 truncate">
            Yemek & dinlenme
          </div>
        </div>

        {/* Not Arrived */}
        <div className="bg-white border border-slate-200 rounded-xl p-3 sm:p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium mb-1.5 sm:mb-2">
            <span className="truncate">Henüz Gelmedi</span>
            <Clock className="w-4 h-4 text-slate-400 shrink-0" />
          </div>
          <div className="font-mono text-xl sm:text-2xl font-bold text-slate-900 tabular-nums">
            {notArrivedEmployees.length}
          </div>
          <div className="text-[10px] sm:text-[11px] text-slate-500 mt-0.5 sm:mt-1 truncate">
            Giriş kaydı yok
          </div>
        </div>

        {/* Late Today */}
        <div className="bg-white border border-slate-200 rounded-xl p-3 sm:p-4 shadow-xs">
          <div className="flex items-center justify-between text-rose-600 text-xs font-medium mb-1.5 sm:mb-2">
            <span className="truncate">Geç Kalan</span>
            <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
          </div>
          <div className="font-mono text-xl sm:text-2xl font-bold text-rose-700 tabular-nums">
            {lateRecords.length}
          </div>
          <div className="text-[10px] sm:text-[11px] text-slate-500 mt-0.5 sm:mt-1 truncate">
            Toleransı aşan
          </div>
        </div>

        {/* Attendance Rate */}
        <div className="bg-white border border-slate-200 rounded-xl p-3 sm:p-4 shadow-xs">
          <div className="flex items-center justify-between text-indigo-600 text-xs font-medium mb-1.5 sm:mb-2">
            <span className="truncate">Katılım Oranı</span>
            <ArrowUpRight className="w-4 h-4 text-indigo-500 shrink-0" />
          </div>
          <div className="font-mono text-xl sm:text-2xl font-bold text-indigo-700 tabular-nums">
            %{attendanceRate}
          </div>
          <div className="text-[10px] sm:text-[11px] text-slate-500 mt-0.5 sm:mt-1 truncate">
            {checkedInIds.size} / {activeCount} çalışan
          </div>
        </div>
      </div>

      {/* Onay Bildirim Toastı */}
      {approvalFeedback && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-950 font-medium text-xs flex items-center justify-between shadow-xs animate-in fade-in duration-300">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{approvalFeedback}</span>
          </div>
          <button
            onClick={() => setApprovalFeedback(null)}
            className="text-emerald-700 hover:text-emerald-900 p-1"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* İK ONAY BEKLEYENLER LİSTESİ: Fazla Mesai & İzin Talepleri */}
      <div id="pending-approvals-section" className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-xs space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="w-8 h-8 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center">
                <FileCheck2 className="w-4 h-4" />
              </div>
              <h2 className="text-lg font-bold text-slate-900">
                Onay Bekleyen Talepler (Fazla Mesai & İzinler)
              </h2>
              {totalPendingApprovals > 0 ? (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
                  {totalPendingApprovals} Bekleyen Talep
                </span>
              ) : (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                  <Check className="w-3 h-3 text-emerald-600" />
                  Tüm Talepler Güncel
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Personel mobil portalı üzerinden talep edilen fazla mesailer ve izinler buraya düşer. İK onayladığında sistem içi <strong>Bildirim Merkezi</strong>'ne ve personele anlık bildirim düşer.
            </p>
          </div>

          {/* Filter Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none shrink-0">
            <button
              onClick={() => setApprovalFilter('all')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                approvalFilter === 'all'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Tümü ({totalPendingApprovals})
            </button>
            <button
              onClick={() => setApprovalFilter('overtime')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
                approvalFilter === 'overtime'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200'
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
                  : 'bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200'
              }`}
            >
              <CalendarCheck className="w-3.5 h-3.5" />
              <span>İzin Talepleri ({pendingLeaves.length})</span>
            </button>
          </div>
        </div>

        {/* List of Requests */}
        {totalPendingApprovals === 0 ||
        (approvalFilter === 'overtime' && pendingOvertimes.length === 0) ||
        (approvalFilter === 'leave' && pendingLeaves.length === 0) ? (
          <div className="py-8 text-center bg-slate-50/70 border border-dashed border-slate-200 rounded-xl space-y-2">
            <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 mx-auto flex items-center justify-center">
              <Check className="w-5 h-5" />
            </div>
            <p className="font-semibold text-xs text-slate-800">
              {approvalFilter === 'overtime'
                ? 'Onay bekleyen fazla mesai talebi bulunmuyor.'
                : approvalFilter === 'leave'
                ? 'Onay bekleyen izin talebi bulunmuyor.'
                : 'Şu an İK onayını bekleyen fazla mesai veya izin talebi bulunmamaktadır.'}
            </p>
            <p className="text-[11px] text-slate-400 max-w-md mx-auto">
              Personel mobil portalı üzerinden yeni bir fazla mesai veya izin formu gönderildiğinde anlık olarak burada listelenecektir.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {/* 1. OVERTIME REQUESTS */}
            {(approvalFilter === 'all' || approvalFilter === 'overtime') &&
              pendingOvertimes.map((ot) => (
                <div
                  key={ot.id}
                  className="bg-amber-50/40 border border-amber-200 rounded-xl p-4 shadow-2xs space-y-3 flex flex-col justify-between hover:border-amber-300 transition-colors"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                        <Timer className="w-3 h-3 text-amber-600" />
                        Fazla Mesai Talebi
                      </span>
                      <span className="text-[10px] font-mono text-slate-400 font-semibold">{ot.id}</span>
                    </div>

                    <div>
                      <div className="font-bold text-sm text-slate-900">{ot.employeeName}</div>
                      <div className="text-[11px] text-slate-500 font-mono">
                        {ot.employeeId} · {ot.department}
                      </div>
                    </div>

                    <div className="p-2.5 rounded-lg bg-white border border-amber-200/80 space-y-1.5 text-xs">
                      <div className="flex justify-between items-center text-slate-700">
                        <span className="text-slate-500">Tarih:</span>
                        <span className="font-bold font-mono text-slate-900">{ot.date}</span>
                      </div>
                      <div className="flex justify-between items-center text-slate-700">
                        <span className="text-slate-500">Saat Dilimi:</span>
                        <span className="font-mono font-semibold text-amber-800">
                          {ot.startTime} - {ot.endTime} ({ot.hours} Saat)
                        </span>
                      </div>
                      {ot.reason && (
                        <div className="pt-1.5 border-t border-slate-100 text-[11px] text-slate-600">
                          <span className="font-semibold text-slate-700">Gerekçe: </span>
                          <span className="italic">{ot.reason}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="pt-2 border-t border-amber-200/60 flex items-center justify-between gap-2">
                    <span className="text-[10px] text-slate-400 font-mono">
                      {new Date(ot.appliedAt).toLocaleDateString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleRejectOvertime(ot.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-rose-700 bg-white hover:bg-rose-50 border border-rose-200 rounded-lg transition-colors cursor-pointer"
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
                  </div>
                </div>
              ))}

            {/* 2. LEAVE REQUESTS */}
            {(approvalFilter === 'all' || approvalFilter === 'leave') &&
              pendingLeaves.map((lr) => (
                <div
                  key={lr.id}
                  className="bg-purple-50/40 border border-purple-200 rounded-xl p-4 shadow-2xs space-y-3 flex flex-col justify-between hover:border-purple-300 transition-colors"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
                        <CalendarCheck className="w-3 h-3 text-purple-600" />
                        {lr.leaveType}
                      </span>
                      <span className="text-[10px] font-mono text-slate-400 font-semibold">{lr.id}</span>
                    </div>

                    <div>
                      <div className="font-bold text-sm text-slate-900">{lr.employeeName}</div>
                      <div className="text-[11px] text-slate-500 font-mono">
                        {lr.employeeId} · {lr.department}
                      </div>
                    </div>

                    <div className="p-2.5 rounded-lg bg-white border border-purple-200/80 space-y-1.5 text-xs">
                      <div className="flex justify-between items-center text-slate-700">
                        <span className="text-slate-500">Tarih Aralığı:</span>
                        <span className="font-bold font-mono text-slate-900">
                          {lr.startDate} → {lr.endDate}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-slate-700">
                        <span className="text-slate-500">İzin Süresi:</span>
                        <span className="font-mono font-semibold text-purple-800">{lr.days} Gün</span>
                      </div>
                      {lr.reason && (
                        <div className="pt-1.5 border-t border-slate-100 text-[11px] text-slate-600">
                          <span className="font-semibold text-slate-700">Açıklama: </span>
                          <span className="italic">{lr.reason}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="pt-2 border-t border-purple-200/60 flex items-center justify-between gap-2">
                    <span className="text-[10px] text-slate-400 font-mono">
                      {new Date(lr.appliedAt).toLocaleDateString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleRejectLeave(lr.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-rose-700 bg-white hover:bg-rose-50 border border-rose-200 rounded-lg transition-colors cursor-pointer"
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
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>

      {/* Middle Row: Live Attendance Feed & Department Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Live Attendance Activity (Col 2) */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Bugünün Canlı Geçiş Akışı
              </h2>
              <p className="text-xs text-slate-500">
                Turnikelerden ve mobil QR okutuculardan gelen anlık hareketler
              </p>
            </div>
            <button
              onClick={onNavigateToRecords}
              className="text-xs font-medium text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
            >
              Tüm Kayıtlar <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Mobile Optimized View: Live Feed Card List (sm:hidden) */}
          <div className="sm:hidden space-y-2">
            {todayRecords.slice(0, 6).map((rec) => {
              const isCheckIn = rec.type === 'check_in';
              const isCheckOut = rec.type === 'check_out';
              const isBreak = rec.type.startsWith('break');

              return (
                <div
                  key={rec.id}
                  className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 flex items-center justify-between gap-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="font-mono font-bold text-slate-900 text-xs tabular-nums">
                        {rec.timeStr}
                      </span>
                      <span className="text-[10px] text-slate-400">·</span>
                      <span className="text-[10px] text-slate-500 font-mono">{rec.employeeId}</span>
                    </div>
                    <div className="font-semibold text-xs text-slate-900 truncate">
                      {rec.employeeName}
                    </div>
                    <div className="text-[10px] text-slate-500 truncate">{rec.department}</div>
                  </div>

                  <div className="flex flex-col items-end gap-1 shrink-0">
                    {isCheckIn && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100/80 text-emerald-800">
                        <ArrowDownRight className="w-3 h-3 text-emerald-600" /> Giriş
                      </span>
                    )}
                    {isCheckOut && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-100/80 text-rose-800">
                        <ArrowUpRight className="w-3 h-3 text-rose-600" /> Çıkış
                      </span>
                    )}
                    {isBreak && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100/80 text-amber-800">
                        <Coffee className="w-3 h-3 text-amber-600" />
                        {rec.type === 'break_start' ? 'Mola Başla' : 'Mola Bitir'}
                      </span>
                    )}

                    <span className="text-[10px]">
                      {rec.status === 'late' ? (
                        <span className="text-amber-700 font-semibold">Geç (+{rec.lateMinutes} dk)</span>
                      ) : rec.status === 'on_time' ? (
                        <span className="text-emerald-700 font-medium">Zamanında</span>
                      ) : rec.status === 'early_leave' ? (
                        <span className="text-orange-700 font-medium">Erken Çıkış</span>
                      ) : (
                        <span className="text-slate-500">Normal</span>
                      )}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop Table View (hidden sm:block) */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 font-semibold uppercase tracking-wider">
                  <th className="py-2.5 px-3">Saat</th>
                  <th className="py-2.5 px-3">Personel</th>
                  <th className="py-2.5 px-3">Departman</th>
                  <th className="py-2.5 px-3">Hareket Tipi</th>
                  <th className="py-2.5 px-3">Durum</th>
                  <th className="py-2.5 px-3">Terminal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {todayRecords.slice(0, 6).map((rec) => {
                  const isCheckIn = rec.type === 'check_in';
                  const isCheckOut = rec.type === 'check_out';
                  const isBreak = rec.type.startsWith('break');

                  return (
                    <tr key={rec.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-2.5 px-3 font-mono font-medium text-slate-900 tabular-nums">
                        {rec.timeStr}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-slate-900">{rec.employeeName}</div>
                        <div className="text-[11px] text-slate-500 font-mono">{rec.employeeId}</div>
                      </td>
                      <td className="py-2.5 px-3 text-slate-600">
                        {rec.department}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="flex items-center gap-1 font-medium">
                          {isCheckIn && (
                            <span className="text-emerald-700 flex items-center gap-1">
                              <ArrowDownRight className="w-3 h-3" /> Giriş
                            </span>
                          )}
                          {isCheckOut && (
                            <span className="text-rose-700 flex items-center gap-1">
                              <ArrowUpRight className="w-3 h-3" /> Çıkış
                            </span>
                          )}
                          {isBreak && (
                            <span className="text-amber-700 flex items-center gap-1">
                              <Coffee className="w-3 h-3" /> {rec.type === 'break_start' ? 'Mola Başlangıç' : 'Mola Bitiş'}
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="text-slate-600 font-medium">
                          {rec.status === 'late' ? (
                            <span className="text-amber-700">Geç ({rec.lateMinutes} dk)</span>
                          ) : rec.status === 'on_time' ? (
                            <span className="text-emerald-700">Zamanında</span>
                          ) : rec.status === 'early_leave' ? (
                            <span className="text-orange-700">Erken Çıkış</span>
                          ) : (
                            <span>Normal</span>
                          )}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-500 text-[11px]">
                        {rec.terminal || 'Kiosk Giriş'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Department Attendance Rates (Col 1) */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900 mb-1">
              Departman Devamlılığı
            </h2>
            <p className="text-xs text-slate-500 mb-4">
              Birim bazında ofis mevcudiyeti
            </p>

            <div className="space-y-4">
              {departmentStats.map((item) => (
                <div key={item.department} className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="font-medium text-slate-700">{item.department}</span>
                    <span className="font-mono text-slate-500 tabular-nums">
                      {item.present} / {item.total} (%{item.rate})
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
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

          <div className="pt-4 mt-4 border-t border-slate-100">
            <button
              onClick={onNavigateToEmployees}
              className="w-full py-2 px-3 text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Users className="w-3.5 h-3.5" /> Personel Kartlarını Yönet
            </button>
          </div>
        </div>
      </div>

      {/* CANLI PERSONEL DURUM TABLOSU (Kim Fabrikada/Ofiste, Kim Molada, Kim Çıkış Yapmış?) */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-xs space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-slate-900">
                Canlı Personel Durum Tablosu
              </h2>
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Gerçek Zamanlı
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Anlık olarak kim işletmede/fabrikada çalışıyor, kim molada, kim çıkış yapmış veya izinli?
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Search Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Personel veya departman ara..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 w-56"
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
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Tüm Kadro ({employees.length})
          </button>

          <button
            onClick={() => setStatusFilter('inside')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors whitespace-nowrap flex items-center gap-1.5 cursor-pointer shrink-0 ${
              statusFilter === 'inside'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span>Fabrikada / Ofiste ({insideEmployees.length})</span>
          </button>

          <button
            onClick={() => setStatusFilter('break')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors whitespace-nowrap flex items-center gap-1.5 cursor-pointer shrink-0 ${
              statusFilter === 'break'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200'
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
                : 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200'
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
                : 'bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-blue-400" />
            <span>İzinli ({leaveEmployees.length})</span>
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

              return (
                <div
                  key={emp.id}
                  className="p-3.5 bg-slate-50/90 rounded-xl border border-slate-200 space-y-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <img
                        src={emp.avatar}
                        alt={emp.fullName}
                        className="w-10 h-10 rounded-full object-cover border border-slate-200 shrink-0"
                        referrerPolicy="no-referrer"
                      />
                      <div className="min-w-0">
                        <div className="font-bold text-xs text-slate-900 truncate">
                          {emp.fullName}
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono">
                          {emp.id} · {emp.department}
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0">
                      {isLeave ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                          İzinli
                        </span>
                      ) : isInside ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-300">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          İçeride (Mesaide)
                        </span>
                      ) : isBreak ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-300">
                          <Coffee className="w-3 h-3 text-amber-600" />
                          Molada
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-300">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                          Dışarıda
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between text-[11px] text-slate-600">
                    <div>
                      <span className="text-slate-400">Son İşlem: </span>
                      <span className="font-mono font-medium text-slate-800">
                        {emp.lastActionTime || 'Bugün hareket yok'}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-500">
                      {emp.title}
                    </div>
                  </div>
                </div>
              );
            })}
        </div>

        {/* Desktop View: Live Status Table (hidden md:block) */}
        <div className="hidden md:block overflow-x-auto border border-slate-200 rounded-xl">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider">
                <th className="py-3 px-4">Personel Bilgisi</th>
                <th className="py-3 px-4">Departman & Görev</th>
                <th className="py-3 px-4">Anlık Durum Rozeti</th>
                <th className="py-3 px-4">Son İşlem Saati</th>
                <th className="py-3 px-4">Vardiya & Tolerans</th>
                <th className="py-3 px-4 text-right">Durum Detayı</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {employees
                .filter((emp) => {
                  if (statusFilter === 'inside') return emp.currentPresence === 'inside';
                  if (statusFilter === 'break') return emp.currentPresence === 'break';
                  if (statusFilter === 'outside') return emp.currentPresence === 'outside' && emp.status !== 'leave';
                  if (statusFilter === 'leave') return emp.status === 'leave';
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
                  const isOutside = !isInside && !isBreak;

                  return (
                    <tr key={emp.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <img
                            src={emp.avatar}
                            alt={emp.fullName}
                            className="w-9 h-9 rounded-full object-cover border border-slate-200"
                            referrerPolicy="no-referrer"
                          />
                          <div>
                            <div className="font-bold text-slate-900">{emp.fullName}</div>
                            <div className="text-[11px] font-mono text-slate-500">{emp.id}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-800">{emp.department}</div>
                        <div className="text-[11px] text-slate-500">{emp.title}</div>
                      </td>
                      <td className="py-3 px-4">
                        {isLeave ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                            İzinli (Yıllık / Rapor)
                          </span>
                        ) : isInside ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-300">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            İçeride (Çalışıyor)
                          </span>
                        ) : isBreak ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-300">
                            <Coffee className="w-3.5 h-3.5 text-amber-600" />
                            Molada (Dinlenmede)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-300">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                            Dışarıda (Ayrıldı)
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono font-medium text-slate-800">
                        {emp.lastActionTime || (
                          <span className="text-slate-400 font-normal">Bugün işlem yok</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-600">
                        <span className="font-medium text-slate-700">08:30 - 17:30</span>
                        <div className="text-[10px] text-slate-400">15 dk tolerans</div>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span className="text-slate-500 text-[11px]">
                          {isInside ? 'Aktif Mesai' : isBreak ? 'Öğle / Ara Dinlenme' : isLeave ? 'Resmi İzin' : 'Henüz Giriş Yok'}
                        </span>
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

