import React, { useState, useEffect, useMemo } from 'react';
import {
  Download,
  Printer,
  TrendingUp,
  Clock,
  AlertTriangle,
  UserX,
  Award,
  FileSpreadsheet,
  Search,
} from 'lucide-react';
import {
  AttendanceRecord,
  Department,
  Employee,
  EmployeeReportSummary,
  EmployeeShiftAssignment,
  LeaveRequest,
  ReportFilter,
  Shift,
} from '../types/pdks';
import { pdksStorage } from '../services/storage';
import {
  exportDailyReportToXlsx,
  formatMinutesHHMM,
  formatMinutesTurkish,
  generateDailyAttendanceRows,
  getLocalDateString,
} from '../utils/shiftTimeAnalytics';

export const AnalyticsReports: React.FC = () => {
  const canExport = pdksStorage.canExportReports(pdksStorage.getActiveUser());
  const [companyName, setCompanyName] = useState<string>(() => pdksStorage.getCompanyName());
  const [nowTick, setNowTick] = useState<number>(() => Date.now());

  const today = new Date();
  const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  const [datePreset, setDatePreset] = useState<'this_month' | 'last_7_days' | 'today' | 'custom'>('last_7_days');
  const [filter, setFilter] = useState<ReportFilter>({
    startDate: getLocalDateString(new Date(Date.now() - 6 * 24 * 3600 * 1000)),
    endDate: getLocalDateString(today),
    department: 'all',
    employeeId: '',
  });
  const [dailyStatusFilter, setDailyStatusFilter] = useState<'all' | 'delayed' | 'worked' | 'absent'>('all');
  const [tableSearch, setTableSearch] = useState<string>('');

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [employeeShifts, setEmployeeShifts] = useState<EmployeeShiftAssignment[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);

  const [reportData, setReportData] = useState<{
    summaries: EmployeeReportSummary[];
    totalPresentCount: number;
    totalLateMinutes: number;
    totalOvertimeHours: number;
    averageAttendanceRate: number;
    lateRankings: { name: string; count: number; totalMinutes: number }[];
  }>({
    summaries: [],
    totalPresentCount: 0,
    totalLateMinutes: 0,
    totalOvertimeHours: 0,
    averageAttendanceRate: 0,
    lateRankings: [],
  });

  const departments: Department[] = [
    'Yazılım & Ar-Ge',
    'İnsan Kaynakları',
    'Muhasebe & Finans',
    'Pazarlama & Satış',
    'Üretim & Operasyon',
    'Lojistik & Depo',
  ];

  const loadSourceData = () => {
    setEmployees(pdksStorage.getEmployees());
    setShifts(pdksStorage.getAllShiftsIncludingInactive());
    setEmployeeShifts(pdksStorage.getEmployeeShifts());
    setRecords(pdksStorage.getAttendanceRecords());
    setLeaves(pdksStorage.getLeaveRequests());
    setNowTick(Date.now());
  };

  useEffect(() => {
    loadSourceData();
    const tickTimer = setInterval(() => {
      setNowTick(Date.now());
    }, 15000);

    const handleDataSync = () => {
      loadSourceData();
      setCompanyName(pdksStorage.getCompanyName());
    };
    const syncName = (e?: any) => {
      if (e?.detail && typeof e.detail === 'string') setCompanyName(e.detail);
      else setCompanyName(pdksStorage.getCompanyName());
    };

    window.addEventListener('pdks-company-name-updated', syncName);
    window.addEventListener('pdks-wall-qr-updated', syncName);
    window.addEventListener('pdks-data-synced', handleDataSync);
    return () => {
      clearInterval(tickTimer);
      window.removeEventListener('pdks-company-name-updated', syncName);
      window.removeEventListener('pdks-wall-qr-updated', syncName);
      window.removeEventListener('pdks-data-synced', handleDataSync);
    };
  }, []);

  // Recalculate summary report on filter or source data change
  useEffect(() => {
    const data = pdksStorage.generateReport(filter);
    setReportData(data);
  }, [filter, employees, records, leaves]);

  // Daily net work & delay computation (real-time for today + exact historical rows)
  const dailyReport = useMemo(() => {
    return generateDailyAttendanceRows({
      startDate: filter.startDate,
      endDate: filter.endDate,
      department: filter.department,
      employeeId: filter.employeeId,
      employees,
      shifts,
      employeeShifts,
      records,
      leaves,
      now: new Date(nowTick),
    });
  }, [filter, employees, shifts, employeeShifts, records, leaves, nowTick]);

  // Filtered daily rows for on-screen table and Excel export
  const visibleDailyRows = useMemo(() => {
    return dailyReport.rows.filter((row) => {
      if (dailyStatusFilter === 'delayed' && row.delayMinutes <= 0) return false;
      if (dailyStatusFilter === 'worked' && row.netWorkMinutes <= 0) return false;
      if (dailyStatusFilter === 'absent' && row.statusLabel !== 'Devamsız' && row.statusLabel !== 'Gecikti (Giriş Yok)') {
        return false;
      }
      if (tableSearch.trim()) {
        const q = tableSearch.toLowerCase();
        return (
          row.employeeName.toLowerCase().includes(q) ||
          row.employeeId.toLowerCase().includes(q) ||
          row.department.toLowerCase().includes(q) ||
          row.shiftName.toLowerCase().includes(q) ||
          row.date.includes(q)
        );
      }
      return true;
    });
  }, [dailyReport.rows, dailyStatusFilter, tableSearch]);

  const handlePresetChange = (preset: 'this_month' | 'last_7_days' | 'today' | 'custom') => {
    setDatePreset(preset);
    const now = new Date();
    if (preset === 'today') {
      setFilter((prev) => ({
        ...prev,
        startDate: getLocalDateString(now),
        endDate: getLocalDateString(now),
      }));
    } else if (preset === 'last_7_days') {
      setFilter((prev) => ({
        ...prev,
        startDate: getLocalDateString(new Date(Date.now() - 6 * 24 * 3600 * 1000)),
        endDate: getLocalDateString(now),
      }));
    } else if (preset === 'this_month') {
      setFilter((prev) => ({
        ...prev,
        startDate: getLocalDateString(new Date(now.getFullYear(), now.getMonth(), 1)),
        endDate: getLocalDateString(now),
      }));
    }
  };

  // Real formatted .xlsx Excel Export
  const handleExportXlsx = () => {
    exportDailyReportToXlsx({
      rows: visibleDailyRows,
      summaries: reportData.summaries,
      companyName,
      startDate: filter.startDate,
      endDate: filter.endDate,
    });
  };

  // Detailed Daily CSV Export (secondary lightweight fallback)
  const handleExportCSV = () => {
    const headers = [
      'Tarih',
      'Gün',
      'Sicil No',
      'Personel Adı',
      'Birim',
      'Atanan Vardiya',
      'Vardiya Saatleri',
      'Giriş Saati',
      'Çıkış Saati',
      'Net Çalışma (SS:DD)',
      'Net Çalışma (Saat)',
      'Gecikme (SS:DD)',
      'Gecikme (Dk)',
      'Durum',
    ];

    const rows = visibleDailyRows.map((r) => [
      r.date,
      r.dayName,
      r.employeeId,
      r.employeeName,
      r.department,
      r.shiftName,
      r.shiftWindow,
      r.checkInTime,
      r.checkOutTime,
      r.netWorkFormattedHHMM,
      r.netWorkDecimalHours,
      r.delayFormattedHHMM,
      r.delayMinutes,
      r.statusLabel,
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,\uFEFF' +
      [
        `Kurum / Şirket;${companyName};Dönem;${filter.startDate} - ${filter.endDate}`,
        headers.join(';'),
        ...rows.map((row) => row.join(';')),
      ].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `PDKS_Gunluk_Rapor_${filter.startDate}_${filter.endDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = () => {
    window.print();
  };

  const totalNetHoursStr = (dailyReport.totalNetWorkMinutes / 60).toFixed(1);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
      {/* Header and Primary Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            {companyName} · Çalışma, Gecikme ve Devam Raporları
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Günlük net çalışma süreleri, vardiya başlangıcına göre gecikme hesabı ve biçimlendirilmiş Excel (.xlsx) çıktısı.
          </p>
        </div>

        {canExport && (
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
            >
              <Printer className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
              <span>Yazdır / PDF</span>
            </button>

            <button
              type="button"
              onClick={handleExportCSV}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
              <span>CSV İndir</span>
            </button>

            <button
              type="button"
              onClick={handleExportXlsx}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs transition-colors cursor-pointer whitespace-nowrap"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Excel Olarak İndir (.xlsx)</span>
            </button>
          </div>
        )}
      </div>

      {/* Date Range & Unit / Employee Filter Bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
            <button
              type="button"
              onClick={() => handlePresetChange('today')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                datePreset === 'today'
                  ? 'bg-white dark:bg-indigo-600 text-indigo-700 dark:text-white shadow-2xs font-semibold'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Bugün
            </button>
            <button
              type="button"
              onClick={() => handlePresetChange('last_7_days')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                datePreset === 'last_7_days'
                  ? 'bg-white dark:bg-indigo-600 text-indigo-700 dark:text-white shadow-2xs font-semibold'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Son 7 Gün
            </button>
            <button
              type="button"
              onClick={() => handlePresetChange('this_month')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                datePreset === 'this_month'
                  ? 'bg-white dark:bg-indigo-600 text-indigo-700 dark:text-white shadow-2xs font-semibold'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Bu Ay
            </button>
            <button
              type="button"
              onClick={() => setDatePreset('custom')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                datePreset === 'custom'
                  ? 'bg-white dark:bg-indigo-600 text-indigo-700 dark:text-white shadow-2xs font-semibold'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Özel Aralık
            </button>
          </div>

          <span className="text-xs font-mono text-slate-500 dark:text-slate-400 tabular-nums">
            Dönem: {filter.startDate} → {filter.endDate} · {visibleDailyRows.length} günlük kayıt
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Başlangıç Tarihi
            </label>
            <input
              type="date"
              value={filter.startDate}
              onChange={(e) => {
                setDatePreset('custom');
                setFilter({ ...filter, startDate: e.target.value });
              }}
              className="w-full px-3 py-1.5 text-xs font-mono border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 tabular-nums"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Bitiş Tarihi
            </label>
            <input
              type="date"
              value={filter.endDate}
              onChange={(e) => {
                setDatePreset('custom');
                setFilter({ ...filter, endDate: e.target.value });
              }}
              className="w-full px-3 py-1.5 text-xs font-mono border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 tabular-nums"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Birim / Departman
            </label>
            <select
              value={filter.department}
              onChange={(e) => setFilter({ ...filter, department: e.target.value })}
              className="w-full px-3 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 cursor-pointer"
            >
              <option value="all">Tüm Birimler</option>
              {departments.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Personel
            </label>
            <select
              value={filter.employeeId}
              onChange={(e) => setFilter({ ...filter, employeeId: e.target.value })}
              className="w-full px-3 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 cursor-pointer"
            >
              <option value="">Tüm Personeller ({employees.length})</option>
              {employees
                .filter((e) => filter.department === 'all' || e.department === filter.department)
                .map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.fullName} ({emp.id})
                  </option>
                ))}
            </select>
          </div>
        </div>
      </div>

      {/* Aggregate KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Toplam Net Çalışma</span>
            <Clock className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="font-mono text-2xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">
            {formatMinutesHHMM(dailyReport.totalNetWorkMinutes)}
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 tabular-nums">
            {totalNetHoursStr} saat fiili çalışma
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Toplam Gecikme</span>
            <AlertTriangle className="w-4 h-4 text-amber-500" />
          </div>
          <div className="font-mono text-2xl font-bold text-amber-700 dark:text-amber-300 tabular-nums">
            {formatMinutesHHMM(dailyReport.totalDelayMinutes)}
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 tabular-nums">
            {formatMinutesTurkish(dailyReport.totalDelayMinutes)} · {dailyReport.lateRowCount} kayıt
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Genel Devam Oranı</span>
            <TrendingUp className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="font-mono text-2xl font-bold text-indigo-700 dark:text-indigo-300 tabular-nums">
            %{reportData.averageAttendanceRate}
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            Fiili mesai ve onaylı izinler dahil
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Devamsız Gün</span>
            <UserX className="w-4 h-4 text-rose-500" />
          </div>
          <div className="font-mono text-2xl font-bold text-rose-700 dark:text-rose-300 tabular-nums">
            {dailyReport.absentRowCount}
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            İzinsiz giriş yapılmayan iş günü
          </p>
        </div>
      </div>

      {/* PRIMARY TABLE: Günlük Çalışma & Gecikme Süresi Detay Tablosu */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Günlük Çalışma ve Gecikme Süresi Dökümü
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Her personel için günlük atanan vardiya, fiili giriş/çıkış saatleri, net çalışma ve gecikme süreleri.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Tabloda ara..."
                value={tableSearch}
                onChange={(e) => setTableSearch(e.target.value)}
                className="pl-8 pr-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-100 w-44 focus:outline-indigo-500"
              />
            </div>

            <div className="inline-flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg text-xs">
              {(
                [
                  ['all', 'Tümü'],
                  ['delayed', 'Gecikenler'],
                  ['worked', 'Çalışanlar'],
                  ['absent', 'Gelmeyenler'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setDailyStatusFilter(key)}
                  className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer whitespace-nowrap ${
                    dailyStatusFilter === key
                      ? 'bg-white dark:bg-indigo-600 text-slate-900 dark:text-white shadow-2xs font-semibold'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-semibold">
                <th className="py-2.5 px-3">Personel & Birim</th>
                <th className="py-2.5 px-3">Tarih</th>
                <th className="py-2.5 px-3">Atanan Vardiya</th>
                <th className="py-2.5 px-3 text-center">Giriş Saati</th>
                <th className="py-2.5 px-3 text-center">Çıkış Saati</th>
                <th className="py-2.5 px-3 text-right">Net Çalışma Süresi</th>
                <th className="py-2.5 px-3 text-right">Gecikme Süresi</th>
                <th className="py-2.5 px-3 text-right">Durum</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {visibleDailyRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-slate-400 dark:text-slate-500">
                    Seçili tarih aralığı ve filtrelere uygun günlük kayıt bulunamadı.
                  </td>
                </tr>
              ) : (
                visibleDailyRows.slice(0, 250).map((row) => (
                  <tr
                    key={row.rowKey}
                    className={`transition-colors ${
                      row.statusLabel === 'Gecikti (Giriş Yok)'
                        ? 'bg-rose-50/40 dark:bg-rose-950/15 hover:bg-rose-50/70 dark:hover:bg-rose-950/25'
                        : 'hover:bg-slate-50/70 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <td className="py-2.5 px-3">
                      <div className="font-semibold text-slate-900 dark:text-slate-100">{row.employeeName}</div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        {row.department} · <span className="font-mono tabular-nums">{row.employeeId}</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <div className="font-mono font-semibold text-slate-800 dark:text-slate-200 tabular-nums">
                        {row.date}
                      </div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400">{row.dayName}</div>
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="font-medium text-slate-800 dark:text-slate-200 truncate max-w-[165px]">
                        {row.shiftName.split('(')[0].trim()}
                      </div>
                      <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                        {row.shiftWindow}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono font-semibold text-slate-800 dark:text-slate-200 tabular-nums">
                      {row.checkInTime}
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono text-slate-700 dark:text-slate-300 tabular-nums">
                      {row.checkOutTime}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                      {row.netWorkMinutes > 0 ? (
                        <div>
                          <span className="font-bold text-slate-900 dark:text-slate-100">
                            {row.netWorkFormattedHHMM}
                          </span>
                          <div className="text-[10px] text-slate-500 dark:text-slate-400">
                            {row.netWorkDecimalHours}
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-400 dark:text-slate-500">-</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                      {row.delayMinutes > 0 ? (
                        <div
                          className={
                            row.statusTone === 'rose'
                              ? 'text-rose-700 dark:text-rose-300 font-bold'
                              : 'text-amber-700 dark:text-amber-300 font-bold'
                          }
                        >
                          <span>{row.delayFormattedHHMM}</span>
                          <div className="text-[10px] font-sans font-semibold">
                            {row.delayFormattedText}
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-400 dark:text-slate-500">00:00 (0 dk)</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right whitespace-nowrap">
                      <span
                        className={`text-[11px] font-semibold ${
                          row.statusTone === 'emerald'
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : row.statusTone === 'amber'
                            ? 'text-amber-700 dark:text-amber-300'
                            : row.statusTone === 'rose'
                            ? 'text-rose-700 dark:text-rose-300'
                            : row.statusTone === 'indigo'
                            ? 'text-indigo-700 dark:text-indigo-300'
                            : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        {row.statusLabel}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {visibleDailyRows.length > 250 && (
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Ekranda ilk 250 satır gösteriliyor. Tüm {visibleDailyRows.length} kayıt Excel (.xlsx) çıktısına eksiksiz aktarılır.
          </p>
        )}
      </div>

      {/* Bottom Section: Late Arrivals Leaderboard & Per-Employee Period Matrix */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 mb-3">
            <div className="flex items-center gap-2">
              <Award className="w-4 h-4 text-amber-500" />
              <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">En Çok Geciken Personeller</h3>
            </div>
            <span className="text-[11px] font-mono text-slate-400">Sıralama</span>
          </div>

          {reportData.lateRankings.length === 0 ? (
            <div className="text-center py-8 text-xs text-slate-400 dark:text-slate-500">
              Bu dönemde gecikme kaydı bulunmuyor.
            </div>
          ) : (
            <div className="space-y-2.5">
              {reportData.lateRankings.slice(0, 5).map((rank, i) => (
                <div
                  key={rank.name}
                  className="flex items-center justify-between text-xs p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/70 border border-slate-100 dark:border-slate-800"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-[10px] flex items-center justify-center font-mono tabular-nums">
                      {i + 1}
                    </span>
                    <div>
                      <div className="font-semibold text-slate-900 dark:text-slate-100">{rank.name}</div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                        {rank.count} kez gecikti
                      </div>
                    </div>
                  </div>
                  <span className="font-mono font-bold text-amber-700 dark:text-amber-300 tabular-nums">
                    {formatMinutesTurkish(rank.totalMinutes)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 mb-3">
            <div>
              <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                Personel Bazlı Dönem Özeti
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Excel çalışma kitabının 2. sayfasına otomatik eklenir
              </p>
            </div>
            <span className="text-xs font-mono text-slate-500 dark:text-slate-400 tabular-nums">
              {reportData.summaries.length} Personel
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 font-semibold">
                  <th className="py-2 px-3">Personel</th>
                  <th className="py-2 px-3 text-center">Gelinen / İş Günü</th>
                  <th className="py-2 px-3 text-center">Devam (%)</th>
                  <th className="py-2 px-3 text-center">Gecikme</th>
                  <th className="py-2 px-3 text-center">İzinli</th>
                  <th className="py-2 px-3 text-right">Toplam Saat</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {reportData.summaries.map((s) => (
                  <tr key={s.employeeId} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="py-2 px-3">
                      <div className="font-semibold text-slate-900 dark:text-slate-100">{s.fullName}</div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                        {s.employeeId} · {s.department}
                      </div>
                    </td>
                    <td className="py-2 px-3 text-center font-mono tabular-nums text-slate-700 dark:text-slate-300">
                      {s.presentDays} / {s.totalDays}
                    </td>
                    <td className="py-2 px-3 text-center font-mono font-semibold tabular-nums">
                      <span
                        className={
                          s.attendanceRate >= 90
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : s.attendanceRate >= 70
                            ? 'text-indigo-700 dark:text-indigo-300'
                            : 'text-rose-700 dark:text-rose-300'
                        }
                      >
                        %{s.attendanceRate}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-center font-mono tabular-nums">
                      {s.totalLateMinutes > 0 ? (
                        <span className="text-amber-700 dark:text-amber-300 font-medium">
                          {s.totalLateMinutes} dk ({s.lateCount})
                        </span>
                      ) : (
                        <span className="text-slate-400 dark:text-slate-500">0</span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-center font-mono tabular-nums text-slate-600 dark:text-slate-400">
                      {s.leaveDays > 0 ? `${s.leaveDays} gün` : '-'}
                    </td>
                    <td className="py-2 px-3 text-right font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                      {s.totalWorkHours} sa
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
