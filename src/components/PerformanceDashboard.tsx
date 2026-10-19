import React, { useState, useEffect } from 'react';
import { Award, TrendingUp, ShieldCheck, Clock, UserCheck, Flame, Download, CheckCircle2, AlertCircle, ArrowUpRight, ArrowDownRight, Coffee, Calendar, Search } from 'lucide-react';
import { EmployeePerformanceMetric, Department } from '../types/pdks';
import { pdksStorage } from '../services/storage';

export const PerformanceDashboard: React.FC = () => {
  const [data, setData] = useState<{
    metrics: EmployeePerformanceMetric[];
    overallShiftCompliance: number;
    overallArrivalStability: number;
    topStreakDays: number;
    averageBreakDiscipline: number;
    departmentRanking: { department: string; score: number; count: number }[];
    weekdayPunctualityPattern: { day: string; onTimeRate: number; avgVarianceMinutes: number }[];
  }>({
    metrics: [],
    overallShiftCompliance: 0,
    overallArrivalStability: 0,
    topStreakDays: 0,
    averageBreakDiscipline: 0,
    departmentRanking: [],
    weekdayPunctualityPattern: [],
  });

  const [selectedDept, setSelectedDept] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEmpId, setSelectedEmpId] = useState<string>('');

  useEffect(() => {
    const res = pdksStorage.getPerformanceDashboardData();
    setData(res);
    if (res.metrics.length > 0) {
      setSelectedEmpId(res.metrics[0].employeeId);
    }
  }, []);

  const filteredMetrics = data.metrics.filter((m) => {
    const matchesDept = selectedDept === 'all' || m.department === selectedDept;
    const matchesSearch =
      m.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.employeeId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.title.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesDept && matchesSearch;
  });

  const activeEmployee = data.metrics.find((m) => m.employeeId === selectedEmpId) || data.metrics[0];

  // Export Performance CSV
  const handleExportCSV = () => {
    const headers = [
      'Sıra',
      'Sicil No',
      'Ad Soyad',
      'Departman',
      'Ünvan',
      'Vardiya Uyum Skoru (%)',
      'Geliş İstikrar Skoru (%)',
      'Kesintisiz Seri (Gün)',
      'Ortalama Geliş Farkı (Dk)',
      'Mola Disiplini (%)',
      'Mesai Verimliliği (%)',
      'Başarı Rozetleri',
    ];

    const rows = filteredMetrics.map((m) => [
      m.rank,
      m.employeeId,
      m.fullName,
      m.department,
      m.title,
      `%${m.shiftComplianceScore}`,
      `%${m.arrivalStabilityScore}`,
      m.onTimeStreakDays,
      m.avgArrivalVarianceMinutes < 0
        ? `${Math.abs(m.avgArrivalVarianceMinutes)} dk erken`
        : `${m.avgArrivalVarianceMinutes} dk geç`,
      `%${m.breakDisciplineScore}`,
      `%${m.workHoursEfficiency}`,
      m.badges.join(' | '),
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,\uFEFF' +
      [headers.join(';'), ...rows.map((row) => row.join(';'))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Asem_Personel_Performans_Analizi_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Dashboard Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Asem Personel Performans & İstikrar Dashboard'u
            </h1>
            <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 font-mono">
              ASEM ANALYTICS
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Vardiya uyum skorları, işe geliş dakikliği, devamlılık istikrarı ve departman disiplin metrikleri.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCSV}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-sm transition-colors whitespace-nowrap"
          >
            <Download className="w-4 h-4" />
            <span>Performans Verilerini İndir</span>
          </button>
        </div>
      </div>

      {/* Aggregate KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Shift Compliance Score */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
          <div className="flex items-center justify-between text-indigo-600 mb-2">
            <span className="text-xs font-medium text-slate-500">Ortalama Vardiya Uyumu</span>
            <ShieldCheck className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="font-mono text-3xl font-bold text-slate-900 tabular-nums">
            %{data.overallShiftCompliance}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Vardiya başlama ve bitiş tolerans intizamı
          </p>
        </div>

        {/* Arrival Stability Score */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
          <div className="flex items-center justify-between text-emerald-600 mb-2">
            <span className="text-xs font-medium text-slate-500">İşe Geliş İstikrar Puanı</span>
            <TrendingUp className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="font-mono text-3xl font-bold text-emerald-700 tabular-nums">
            %{data.overallArrivalStability}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Günlük giriş dakikliği sürekliliği
          </p>
        </div>

        {/* Top Streak */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
          <div className="flex items-center justify-between text-amber-600 mb-2">
            <span className="text-xs font-medium text-slate-500">Kesintisiz İstikrar Serisi</span>
            <Flame className="w-4 h-4 text-amber-500" />
          </div>
          <div className="font-mono text-3xl font-bold text-amber-700 tabular-nums">
            {data.topStreakDays} <span className="text-sm font-normal text-slate-500">İş Günü</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            0 gecikmeyle devam eden kurum rekoru
          </p>
        </div>

        {/* Break Discipline Score */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
          <div className="flex items-center justify-between text-blue-600 mb-2">
            <span className="text-xs font-medium text-slate-500">Mola Disiplin Skoru</span>
            <Coffee className="w-4 h-4 text-blue-500" />
          </div>
          <div className="font-mono text-3xl font-bold text-blue-700 tabular-nums">
            %{data.averageBreakDiscipline}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Tahsis edilen mola sürelerine riayet
          </p>
        </div>
      </div>

      {/* Top Performers Podium (Ayın İstikrar Şampiyonları) */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Award className="w-5 h-5 text-amber-500" />
          <h2 className="text-lg font-bold text-slate-900">Ayın İstikrar Şampiyonları (Top 3)</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {data.metrics.slice(0, 3).map((champion, idx) => (
            <div
              key={champion.employeeId}
              onClick={() => setSelectedEmpId(champion.employeeId)}
              className={`p-5 rounded-2xl border transition-all cursor-pointer relative overflow-hidden bg-white shadow-xs hover:border-indigo-400 ${
                selectedEmpId === champion.employeeId ? 'ring-2 ring-indigo-500 border-transparent' : 'border-slate-200'
              }`}
            >
              {/* Medal indicator */}
              <div
                className={`absolute top-0 right-0 px-3 py-1 text-xs font-bold font-mono rounded-bl-xl ${
                  idx === 0
                    ? 'bg-amber-100 text-amber-800 border-l border-b border-amber-200'
                    : idx === 1
                    ? 'bg-slate-100 text-slate-700 border-l border-b border-slate-200'
                    : 'bg-orange-100 text-orange-800 border-l border-b border-orange-200'
                }`}
              >
                #{idx + 1} Derece
              </div>

              <div className="flex items-center gap-3 mb-3">
                <img
                  src={champion.avatar}
                  alt={champion.fullName}
                  className="w-12 h-12 rounded-full object-cover border-2 border-indigo-200"
                  referrerPolicy="no-referrer"
                />
                <div>
                  <h3 className="font-bold text-sm text-slate-900">{champion.fullName}</h3>
                  <p className="text-xs text-slate-500">{champion.title}</p>
                  <p className="text-[11px] text-slate-400 font-mono">{champion.department}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 my-3 p-3 bg-slate-50 rounded-xl text-xs">
                <div>
                  <span className="text-slate-500 text-[11px]">Vardiya Uyumu</span>
                  <div className="font-mono font-bold text-slate-900 text-sm">
                    %{champion.shiftComplianceScore}
                  </div>
                </div>
                <div>
                  <span className="text-slate-500 text-[11px]">Geliş İstikrarı</span>
                  <div className="font-mono font-bold text-emerald-700 text-sm">
                    %{champion.arrivalStabilityScore}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-100">
                <span className="flex items-center gap-1 text-amber-700 font-semibold font-mono">
                  <Flame className="w-3.5 h-3.5 text-amber-500" />
                  {champion.onTimeStreakDays} Gün Kesintisiz
                </span>
                <span className="text-[11px] text-indigo-600 font-medium">
                  {champion.avgArrivalVarianceMinutes < 0
                    ? `${Math.abs(champion.avgArrivalVarianceMinutes)} dk erken`
                    : 'Zamanında'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Interactive Individual Deep Dive & Weekday Trends Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Selected Employee Detailed Diagnostic (Cols 2) */}
        {activeEmployee && (
          <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl p-6 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-start justify-between pb-4 border-b border-slate-100 mb-4">
                <div className="flex items-center gap-3">
                  <img
                    src={activeEmployee.avatar}
                    alt={activeEmployee.fullName}
                    className="w-14 h-14 rounded-full object-cover border-2 border-indigo-500"
                    referrerPolicy="no-referrer"
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-base text-slate-900">
                        {activeEmployee.fullName}
                      </h3>
                      <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                        Sıra #{activeEmployee.rank}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 mt-0.5">
                      {activeEmployee.title} · {activeEmployee.department}
                    </p>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {activeEmployee.badges.map((b) => (
                        <span
                          key={b}
                          className="text-[10px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md font-medium"
                        >
                          ✓ {b}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-xs text-slate-500 block">Genel Performans</span>
                  <span className="font-mono text-2xl font-bold text-indigo-700">
                    %{Math.round((activeEmployee.shiftComplianceScore + activeEmployee.arrivalStabilityScore) / 2)}
                  </span>
                </div>
              </div>

              {/* Individual Performance Breakdown */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-[11px] text-slate-500 block">Vardiya Uyumu</span>
                  <span className="font-mono text-lg font-bold text-slate-900">
                    %{activeEmployee.shiftComplianceScore}
                  </span>
                  <span className="text-[10px] text-emerald-600 block mt-0.5">Yüksek Uyum</span>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-[11px] text-slate-500 block">Geliş İstikrarı</span>
                  <span className="font-mono text-lg font-bold text-emerald-700">
                    %{activeEmployee.arrivalStabilityScore}
                  </span>
                  <span className="text-[10px] text-slate-500 block mt-0.5">Dakik Giriş</span>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-[11px] text-slate-500 block">Ortalama Sapma</span>
                  <span className="font-mono text-lg font-bold text-slate-900">
                    {activeEmployee.avgArrivalVarianceMinutes < 0
                      ? `-${Math.abs(activeEmployee.avgArrivalVarianceMinutes)} dk`
                      : `+${activeEmployee.avgArrivalVarianceMinutes} dk`}
                  </span>
                  <span className="text-[10px] text-slate-500 block mt-0.5">
                    {activeEmployee.avgArrivalVarianceMinutes < 0 ? 'Erken Geliş' : 'Geçikme Eğilimi'}
                  </span>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-[11px] text-slate-500 block">Mola İntizamı</span>
                  <span className="font-mono text-lg font-bold text-blue-700">
                    %{activeEmployee.breakDisciplineScore}
                  </span>
                  <span className="text-[10px] text-slate-500 block mt-0.5">Kurala Riayet</span>
                </div>
              </div>

              {/* Arrival Timeline Curve (Son 5 Gün Geliş Çizelgesi) */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    Son Günlerin İşe Geliş Dakikliği (Beklenen vs Fiili)
                  </h4>
                  <span className="text-[11px] text-slate-400 font-mono">
                    Günlük Sapma Grafiği
                  </span>
                </div>

                <div className="space-y-2">
                  {activeEmployee.recentArrivals.map((arrival) => {
                    const isLate = arrival.status === 'late';
                    const isEarly = arrival.status === 'early';

                    return (
                      <div
                        key={arrival.date}
                        className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50/80 border border-slate-100 text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-slate-700 w-20">{arrival.dayName}</span>
                          <span className="text-slate-400 font-mono text-[11px]">{arrival.date}</span>
                        </div>

                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <span className="font-mono text-slate-500 text-[11px]">
                              Planlanan: {arrival.expectedTime}
                            </span>
                            <span className="mx-1 text-slate-300">·</span>
                            <span className="font-mono font-bold text-slate-900">
                              Geliş: {arrival.actualTime}
                            </span>
                          </div>

                          <span
                            className={`px-2 py-0.5 rounded font-mono text-[11px] font-semibold ${
                              isLate
                                ? 'bg-amber-100 text-amber-800'
                                : isEarly
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-slate-200 text-slate-800'
                            }`}
                          >
                            {isLate
                              ? `+${arrival.diffMinutes} dk Geç`
                              : isEarly
                              ? `${arrival.diffMinutes} dk Erken`
                              : '0 dk Tam Vaktinde'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Right Column: Weekday Punctuality Trend & Department Discipline (Col 1) */}
        <div className="space-y-6">
          {/* Weekday Arrival Pattern (Pazartesi vs Cuma İstikrarı) */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
            <h3 className="font-bold text-sm text-slate-900 mb-1">
              Haftanın Günleri Bazında Dakiklik
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Giriş saatlerinde gün bazlı sapma eğilimleri
            </p>

            <div className="space-y-3">
              {data.weekdayPunctualityPattern.map((p) => (
                <div key={p.day} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="font-medium text-slate-700">{p.day}</span>
                    <span className="font-mono font-semibold text-slate-900 tabular-nums">
                      %{p.onTimeRate} Zamanında
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        p.onTimeRate >= 95
                          ? 'bg-emerald-500'
                          : p.onTimeRate >= 90
                          ? 'bg-indigo-500'
                          : 'bg-amber-500'
                      }`}
                      style={{ width: `${p.onTimeRate}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Department Performance Ranking */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
            <h3 className="font-bold text-sm text-slate-900 mb-1">
              Departman Uyum ve İstikrar Kıyaslaması
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Birim bazlı kümülatif vardiya intizamı
            </p>

            <div className="space-y-3">
              {data.departmentRanking.map((dept, i) => (
                <div
                  key={dept.department}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-xs"
                >
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 font-bold text-[10px] flex items-center justify-center font-mono">
                      {i + 1}
                    </span>
                    <div>
                      <div className="font-semibold text-slate-900">{dept.department}</div>
                      <div className="text-[10px] text-slate-500 font-mono">
                        {dept.count} Çalışan
                      </div>
                    </div>
                  </div>

                  <span className="font-mono font-bold text-indigo-700 tabular-nums text-sm">
                    %{dept.score}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Full Employee Performance & Compliance Table */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
        {/* Table Filter Toolbar */}
        <div className="p-4 border-b border-slate-200 flex flex-col md:flex-row gap-3 justify-between items-center bg-slate-50/50">
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Personel veya ünvan ile ara..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-white"
            />
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto">
            <label className="text-xs font-semibold text-slate-500">Departman:</label>
            <select
              value={selectedDept}
              onChange={(e) => setSelectedDept(e.target.value)}
              className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-white"
            >
              <option value="all">Tüm Departmanlar</option>
              {data.departmentRanking.map((d) => (
                <option key={d.department} value={d.department}>
                  {d.department}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Mobile Ranking Card View (md:hidden) */}
        <div className="md:hidden divide-y divide-slate-100">
          {filteredMetrics.map((m) => {
            const isSelected = selectedEmpId === m.employeeId;

            return (
              <div
                key={m.employeeId}
                className={`p-3.5 space-y-2.5 transition-colors ${
                  isSelected ? 'bg-indigo-50/50' : ''
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="font-mono font-bold text-xs text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-lg shrink-0">
                      #{m.rank}
                    </span>
                    <img
                      src={m.avatar}
                      alt={m.fullName}
                      className="w-10 h-10 rounded-full object-cover border border-slate-200 shrink-0"
                      referrerPolicy="no-referrer"
                    />
                    <div className="min-w-0">
                      <div className="font-bold text-xs text-slate-900 truncate">{m.fullName}</div>
                      <div className="text-[10px] text-slate-500 font-mono truncate">{m.department}</div>
                    </div>
                  </div>

                  <button
                    onClick={() => setSelectedEmpId(m.employeeId)}
                    className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer shrink-0 ${
                      isSelected
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                    }`}
                  >
                    {isSelected ? 'Seçili' : 'Detay'}
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-2 pt-1.5 border-t border-slate-100 text-center">
                  <div className="bg-slate-50 p-2 rounded-lg border border-slate-100">
                    <div className="text-[10px] text-slate-500">Vardiya Uyumu</div>
                    <div className="font-mono font-bold text-xs text-emerald-700">
                      %{m.shiftComplianceScore}
                    </div>
                  </div>

                  <div className="bg-slate-50 p-2 rounded-lg border border-slate-100">
                    <div className="text-[10px] text-slate-500">İstikrar Skoru</div>
                    <div className="font-mono font-bold text-xs text-indigo-700">
                      %{m.arrivalStabilityScore}
                    </div>
                  </div>

                  <div className="bg-slate-50 p-2 rounded-lg border border-slate-100">
                    <div className="text-[10px] text-slate-500">Seri</div>
                    <div className="font-mono font-bold text-xs text-amber-700 flex items-center justify-center gap-0.5">
                      <Flame className="w-3 h-3 text-amber-500" />
                      <span>{m.onTimeStreakDays}G</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Desktop Table View (hidden md:block) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-semibold uppercase tracking-wider">
                <th className="py-3 px-4">Sıra</th>
                <th className="py-3 px-4">Personel</th>
                <th className="py-3 px-4">Departman & Görev</th>
                <th className="py-3 px-4 text-center">Vardiya Uyumu</th>
                <th className="py-3 px-4 text-center">İstikrar Skoru</th>
                <th className="py-3 px-4 text-center">Kesintisiz Seri</th>
                <th className="py-3 px-4 text-center">Ortalama Sapma</th>
                <th className="py-3 px-4 text-right">Detay İncele</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredMetrics.map((m) => {
                const isSelected = selectedEmpId === m.employeeId;

                return (
                  <tr
                    key={m.employeeId}
                    className={`hover:bg-slate-50/80 transition-colors ${
                      isSelected ? 'bg-indigo-50/40' : ''
                    }`}
                  >
                    <td className="py-3 px-4 font-mono font-bold text-slate-700">
                      #{m.rank}
                    </td>

                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2.5">
                        <img
                          src={m.avatar}
                          alt={m.fullName}
                          className="w-8 h-8 rounded-full object-cover border border-slate-200"
                          referrerPolicy="no-referrer"
                        />
                        <div>
                          <div className="font-semibold text-slate-900">{m.fullName}</div>
                          <div className="text-[11px] text-slate-500 font-mono">{m.employeeId}</div>
                        </div>
                      </div>
                    </td>

                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-900">{m.department}</div>
                      <div className="text-[11px] text-slate-500">{m.title}</div>
                    </td>

                    <td className="py-3 px-4 text-center font-mono font-semibold tabular-nums">
                      <span
                        className={
                          m.shiftComplianceScore >= 95
                            ? 'text-emerald-700'
                            : m.shiftComplianceScore >= 90
                            ? 'text-indigo-700'
                            : 'text-amber-700'
                        }
                      >
                        %{m.shiftComplianceScore}
                      </span>
                    </td>

                    <td className="py-3 px-4 text-center font-mono font-semibold tabular-nums">
                      <span
                        className={
                          m.arrivalStabilityScore >= 95
                            ? 'text-emerald-700'
                            : m.arrivalStabilityScore >= 90
                            ? 'text-indigo-700'
                            : 'text-amber-700'
                        }
                      >
                        %{m.arrivalStabilityScore}
                      </span>
                    </td>

                    <td className="py-3 px-4 text-center">
                      <span className="inline-flex items-center gap-1 font-mono font-bold text-slate-800">
                        <Flame className="w-3.5 h-3.5 text-amber-500" />
                        {m.onTimeStreakDays} Gün
                      </span>
                    </td>

                    <td className="py-3 px-4 text-center font-mono tabular-nums">
                      {m.avgArrivalVarianceMinutes < 0 ? (
                        <span className="text-emerald-700">
                          {Math.abs(m.avgArrivalVarianceMinutes)} dk erken
                        </span>
                      ) : (
                        <span className="text-amber-700">
                          +{m.avgArrivalVarianceMinutes} dk gecikme
                        </span>
                      )}
                    </td>

                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => setSelectedEmpId(m.employeeId)}
                        className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors ${
                          isSelected
                            ? 'bg-indigo-600 text-white'
                            : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                        }`}
                      >
                        {isSelected ? 'Seçili' : 'İncele'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
