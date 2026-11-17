import React, { useState, useEffect } from 'react';
import { Calendar, Download, Printer, Filter, TrendingUp, Clock, AlertTriangle, UserX, Award, BarChart3, Users, ArrowUpRight } from 'lucide-react';
import { Department, Employee, ReportFilter, EmployeeReportSummary } from '../types/pdks';
import { pdksStorage } from '../services/storage';

export const AnalyticsReports: React.FC = () => {
  const canExport = pdksStorage.canExportReports(pdksStorage.getActiveUser());
  const [companyName, setCompanyName] = useState<string>(() => pdksStorage.getCompanyName());
  // Preset calculations
  const today = new Date();
  const formatYMD = (d: Date) => d.toISOString().split('T')[0];

  const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const sevenDaysAgo = new Date(Date.now() - 6 * 24 * 3600 * 1000);

  const [datePreset, setDatePreset] = useState<'this_month' | 'last_7_days' | 'today' | 'custom'>('this_month');
  const [filter, setFilter] = useState<ReportFilter>({
    startDate: formatYMD(firstDayOfMonth),
    endDate: formatYMD(today),
    department: 'all',
    employeeId: '',
  });

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

  const [departments] = useState<Department[]>([
    'Yazılım & Ar-Ge',
    'İnsan Kaynakları',
    'Muhasebe & Finans',
    'Pazarlama & Satış',
    'Üretim & Operasyon',
    'Lojistik & Depo',
  ]);

  const [employees, setEmployees] = useState<Employee[]>([]);

  useEffect(() => {
    setEmployees(pdksStorage.getEmployees());
    const syncName = (e?: any) => {
      if (e?.detail && typeof e.detail === 'string') setCompanyName(e.detail);
      else setCompanyName(pdksStorage.getCompanyName());
    };
    window.addEventListener('pdks-company-name-updated', syncName);
    window.addEventListener('pdks-wall-qr-updated', syncName);
    window.addEventListener('pdks-data-synced', syncName);
    return () => {
      window.removeEventListener('pdks-company-name-updated', syncName);
      window.removeEventListener('pdks-wall-qr-updated', syncName);
      window.removeEventListener('pdks-data-synced', syncName);
    };
  }, []);

  // Recalculate on filter change
  useEffect(() => {
    const data = pdksStorage.generateReport(filter);
    setReportData(data);
  }, [filter]);

  const handlePresetChange = (preset: 'this_month' | 'last_7_days' | 'today' | 'custom') => {
    setDatePreset(preset);
    const now = new Date();
    if (preset === 'today') {
      setFilter((prev) => ({
        ...prev,
        startDate: formatYMD(now),
        endDate: formatYMD(now),
      }));
    } else if (preset === 'last_7_days') {
      setFilter((prev) => ({
        ...prev,
        startDate: formatYMD(new Date(Date.now() - 6 * 24 * 3600 * 1000)),
        endDate: formatYMD(now),
      }));
    } else if (preset === 'this_month') {
      setFilter((prev) => ({
        ...prev,
        startDate: formatYMD(new Date(now.getFullYear(), now.getMonth(), 1)),
        endDate: formatYMD(now),
      }));
    }
  };

  // Export Detailed CSV
  const handleExportCSV = () => {
    const headers = [
      'Sicil No',
      'Ad Soyad',
      'Departman',
      'Ünvan',
      'Hedef İş Günü',
      'Fiili Gelinen Gün',
      'Devam Oranı (%)',
      'Gecikme Adedi',
      'Toplam Gecikme (Dk)',
      'Devamsızlık (Gün)',
      'İzinli (Gün)',
      'Toplam Çalışma (Saat)',
      'Fazla Mesai (Saat)',
    ];

    const rows = reportData.summaries.map((s) => [
      s.employeeId,
      s.fullName,
      s.department,
      s.title,
      s.totalDays,
      s.presentDays,
      `%${s.attendanceRate}`,
      s.lateCount,
      s.totalLateMinutes,
      s.absenceCount,
      s.leaveDays,
      s.totalWorkHours,
      s.overtimeHours,
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
    link.setAttribute('download', `PDKS_Detayli_Rapor_${filter.startDate}_${filter.endDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header and Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
            {companyName} · Devamlılık, Gecikme ve Mesai Analizi
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Belirli tarih aralıkları için ayrıntılı personel devam kontrol, devamsızlık ve fazla mesai raporları.
          </p>
        </div>

        {canExport && (
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
            <button
              onClick={handlePrint}
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              <Printer className="w-4 h-4 text-slate-500" />
              <span>Yazdır / PDF</span>
            </button>

            <button
              onClick={handleExportCSV}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Excel / CSV İndir</span>
            </button>
          </div>
        )}
      </div>

      {/* Date Range & Filter Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Preset Buttons */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
            <button
              onClick={() => handlePresetChange('today')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                datePreset === 'today'
                  ? 'bg-white text-indigo-700 shadow-xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Bugün
            </button>
            <button
              onClick={() => handlePresetChange('last_7_days')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                datePreset === 'last_7_days'
                  ? 'bg-white text-indigo-700 shadow-xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Son 7 Gün
            </button>
            <button
              onClick={() => handlePresetChange('this_month')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                datePreset === 'this_month'
                  ? 'bg-white text-indigo-700 shadow-xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Bu Ay
            </button>
            <button
              onClick={() => setDatePreset('custom')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                datePreset === 'custom'
                  ? 'bg-white text-indigo-700 shadow-xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Özel Aralık
            </button>
          </div>

          <span className="text-xs font-mono text-slate-500">
            Aralık: {filter.startDate} - {filter.endDate}
          </span>
        </div>

        {/* Inputs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-slate-100">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Başlangıç Tarihi
            </label>
            <input
              type="date"
              value={filter.startDate}
              onChange={(e) => {
                setDatePreset('custom');
                setFilter({ ...filter, startDate: e.target.value });
              }}
              className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-slate-50/50"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Bitiş Tarihi
            </label>
            <input
              type="date"
              value={filter.endDate}
              onChange={(e) => {
                setDatePreset('custom');
                setFilter({ ...filter, endDate: e.target.value });
              }}
              className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-slate-50/50"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Departman Filtresi
            </label>
            <select
              value={filter.department}
              onChange={(e) => setFilter({ ...filter, department: e.target.value })}
              className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-white"
            >
              <option value="all">Tüm Departmanlar</option>
              {departments.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Personel Seçimi
            </label>
            <select
              value={filter.employeeId}
              onChange={(e) => setFilter({ ...filter, employeeId: e.target.value })}
              className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-white"
            >
              <option value="">Tüm Personeller ({employees.length})</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.fullName} ({emp.id})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Aggregate KPI Summary Cards (Tabular figures) */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Attendance Rate */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
          <div className="flex items-center justify-between text-indigo-600 mb-2">
            <span className="text-xs font-medium text-slate-500">Genel Devamlılık Oranı</span>
            <TrendingUp className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="font-mono text-3xl font-bold text-slate-900 tabular-nums">
            %{reportData.averageAttendanceRate}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Fiili mesai ve onaylı izinler toplamı
          </p>
        </div>

        {/* Total Late Duration */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
          <div className="flex items-center justify-between text-amber-600 mb-2">
            <span className="text-xs font-medium text-slate-500">Toplam Gecikme Süresi</span>
            <AlertTriangle className="w-4 h-4 text-amber-500" />
          </div>
          <div className="font-mono text-3xl font-bold text-amber-700 tabular-nums">
            {reportData.totalLateMinutes} <span className="text-sm font-normal text-slate-500">Dk</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            {(reportData.totalLateMinutes / 60).toFixed(1)} iş saati kayıp
          </p>
        </div>

        {/* Total Overtime */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
          <div className="flex items-center justify-between text-emerald-600 mb-2">
            <span className="text-xs font-medium text-slate-500">Hak Edilen Fazla Mesai</span>
            <Clock className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="font-mono text-3xl font-bold text-emerald-700 tabular-nums">
            {reportData.totalOvertimeHours.toFixed(1)} <span className="text-sm font-normal text-slate-500">Saat</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Standart vardiyayı aşan çalışma
          </p>
        </div>

        {/* Total Absence */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
          <div className="flex items-center justify-between text-rose-600 mb-2">
            <span className="text-xs font-medium text-slate-500">Toplam Devamsızlık</span>
            <UserX className="w-4 h-4 text-rose-500" />
          </div>
          <div className="font-mono text-3xl font-bold text-rose-700 tabular-nums">
            {reportData.summaries.reduce((acc, s) => acc + s.absenceCount, 0)}{' '}
            <span className="text-sm font-normal text-slate-500">Gün</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            İzinsiz veya kart basılmayan günler
          </p>
        </div>
      </div>

      {/* Middle Section: Late Arrivals Rankings & Department Health */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Late Arrival Leaderboard (Col 1) */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
            <div className="flex items-center gap-2">
              <Award className="w-4 h-4 text-amber-500" />
              <h3 className="font-bold text-sm text-slate-900">En Çok Geciken Personeller</h3>
            </div>
            <span className="text-[11px] font-mono text-slate-400">Sıralama</span>
          </div>

          {reportData.lateRankings.length === 0 ? (
            <div className="text-center py-8 text-xs text-slate-400">
              Bu dönemde gecikme kaydı bulunmuyor. Tebrikler!
            </div>
          ) : (
            <div className="space-y-3">
              {reportData.lateRankings.slice(0, 5).map((rank, i) => (
                <div
                  key={rank.name}
                  className="flex items-center justify-between text-xs p-2.5 rounded-lg bg-slate-50 border border-slate-100"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-700 font-bold text-[10px] flex items-center justify-center font-mono">
                      {i + 1}
                    </span>
                    <div>
                      <div className="font-semibold text-slate-900">{rank.name}</div>
                      <div className="text-[11px] text-slate-500 font-mono">
                        {rank.count} kez gecikti
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="font-mono font-bold text-amber-700 tabular-nums">
                      {rank.totalMinutes} Dk
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Detailed Matrix Table (Col 2) */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div>
                <h3 className="font-bold text-sm text-slate-900">Personel Bazlı Devamlılık Matrisi</h3>
                <p className="text-xs text-slate-500">
                  Dönem bazında iş günü, fiili katılım ve mesai süreleri dökümü
                </p>
              </div>
              <span className="text-xs font-mono text-slate-500">
                {reportData.summaries.length} Personel
              </span>
            </div>

            {/* Mobile Cards View (md:hidden) */}
            <div className="md:hidden divide-y divide-slate-100">
              {reportData.summaries.map((s) => (
                <div key={s.employeeId} className="p-3.5 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-bold text-slate-900 text-sm">{s.fullName}</div>
                      <div className="text-xs text-slate-500 font-mono">
                        {s.employeeId} · {s.department}
                      </div>
                    </div>
                    <span
                      className={`font-mono font-bold text-xs px-2 py-0.5 rounded-md ${
                        s.attendanceRate >= 90
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : s.attendanceRate >= 70
                          ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                          : 'bg-rose-50 text-rose-700 border border-rose-200'
                      }`}
                    >
                      %{s.attendanceRate} Devam
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 p-2.5 rounded-lg border border-slate-100 font-mono">
                    <div>
                      <span className="text-slate-400 block text-[10px]">İş Günü / Gelinen:</span>
                      <span className="font-semibold text-slate-800">{s.presentDays} / {s.totalDays} Gün</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px]">Toplam Çalışma:</span>
                      <span className="font-semibold text-slate-900">{s.totalWorkHours} Saat</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px]">Gecikme:</span>
                      {s.totalLateMinutes > 0 ? (
                        <span className="font-semibold text-amber-700">{s.totalLateMinutes} Dk ({s.lateCount} kez)</span>
                      ) : (
                        <span className="text-slate-400">0 Dk</span>
                      )}
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px]">Fazla Mesai / İzin:</span>
                      <span className="font-semibold text-emerald-700">
                        {s.overtimeHours > 0 ? `+${s.overtimeHours}s` : '0s'}
                        {s.leaveDays > 0 ? ` · ${s.leaveDays}g izin` : ''}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Table View (hidden md:block) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-500 font-semibold uppercase tracking-wider">
                    <th className="py-2.5 px-3">Personel</th>
                    <th className="py-2.5 px-3 text-center">İş Günü / Gelinen</th>
                    <th className="py-2.5 px-3 text-center">Devam (%)</th>
                    <th className="py-2.5 px-3 text-center">Gecikme</th>
                    <th className="py-2.5 px-3 text-center">İzinli</th>
                    <th className="py-2.5 px-3 text-right">Toplam Çalışma</th>
                    <th className="py-2.5 px-3 text-right">Fazla Mesai</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {reportData.summaries.map((s) => (
                    <tr key={s.employeeId} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-slate-900">{s.fullName}</div>
                        <div className="text-[11px] text-slate-500 font-mono">
                          {s.employeeId} · {s.department}
                        </div>
                      </td>

                      <td className="py-2.5 px-3 text-center font-mono tabular-nums text-slate-700">
                        {s.presentDays} / {s.totalDays}
                      </td>

                      <td className="py-2.5 px-3 text-center font-mono font-semibold tabular-nums">
                        <span
                          className={
                            s.attendanceRate >= 90
                              ? 'text-emerald-700'
                              : s.attendanceRate >= 70
                              ? 'text-indigo-700'
                              : 'text-rose-700'
                          }
                        >
                          %{s.attendanceRate}
                        </span>
                      </td>

                      <td className="py-2.5 px-3 text-center font-mono tabular-nums">
                        {s.totalLateMinutes > 0 ? (
                          <span className="text-amber-700 font-medium">
                            {s.totalLateMinutes} Dk ({s.lateCount} kez)
                          </span>
                        ) : (
                          <span className="text-slate-400">0</span>
                        )}
                      </td>

                      <td className="py-2.5 px-3 text-center font-mono tabular-nums text-slate-600">
                        {s.leaveDays > 0 ? `${s.leaveDays} Gün` : '-'}
                      </td>

                      <td className="py-2.5 px-3 text-right font-mono font-semibold text-slate-900 tabular-nums">
                        {s.totalWorkHours} Saat
                      </td>

                      <td className="py-2.5 px-3 text-right font-mono font-semibold text-emerald-700 tabular-nums">
                        {s.overtimeHours > 0 ? `+${s.overtimeHours} Saat` : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
