import React, { useState, useEffect } from 'react';
import { Download, Search, Plus, ArrowDownRight, ArrowUpRight, Coffee, ShieldAlert, Smartphone, X, Trash2 } from 'lucide-react';
import { AttendanceRecord, Employee, ActionType } from '../types/pdks';
import { pdksStorage, getTodayString } from '../services/storage';

export const AttendanceLogs: React.FC = () => {
  const activeUser = pdksStorage.getActiveUser();
  const canCreate = pdksStorage.canCreateEmployee(activeUser);
  const canExport = pdksStorage.canExportReports(activeUser);
  const canClear = pdksStorage.canClearLogs(activeUser);
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [companyName, setCompanyName] = useState<string>(() => pdksStorage.getCompanyName());

  // Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedDate, setSelectedDate] = useState<string>('');

  // Manual record modal
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [manualForm, setManualForm] = useState({
    employeeId: '',
    date: getTodayString(),
    timeStr: '08:30:00',
    type: 'check_in' as ActionType,
    note: 'Kart unutuldu - İK onaylı manuel kayıt',
  });

  const loadData = () => {
    setRecords(pdksStorage.getAttendanceRecords());
    setEmployees(pdksStorage.getEmployees());
    setCompanyName(pdksStorage.getCompanyName());
  };

  useEffect(() => {
    loadData();
    const handleSync = () => loadData();
    const handleNameSync = (e?: any) => {
      if (e?.detail && typeof e.detail === 'string') setCompanyName(e.detail);
      else setCompanyName(pdksStorage.getCompanyName());
    };
    window.addEventListener('pdks-data-synced', handleSync);
    window.addEventListener('pdks-notification', handleSync);
    window.addEventListener('pdks-company-name-updated', handleNameSync);
    window.addEventListener('pdks-wall-qr-updated', handleNameSync);
    return () => {
      window.removeEventListener('pdks-data-synced', handleSync);
      window.removeEventListener('pdks-notification', handleSync);
      window.removeEventListener('pdks-company-name-updated', handleNameSync);
      window.removeEventListener('pdks-wall-qr-updated', handleNameSync);
    };
  }, []);

  const suspiciousCount = records.filter((r) => r.isSuspiciousDevice || r.type === 'security_alert').length;

  const filteredRecords = records.filter((rec) => {
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !q ||
      rec.employeeName.toLowerCase().includes(q) ||
      rec.employeeId.toLowerCase().includes(q) ||
      (rec.macAddress && rec.macAddress.toLowerCase().includes(q)) ||
      (rec.deviceId && rec.deviceId.toLowerCase().includes(q)) ||
      (rec.deviceOwnerEmployeeName && rec.deviceOwnerEmployeeName.toLowerCase().includes(q)) ||
      (rec.securityWarning && rec.securityWarning.toLowerCase().includes(q));

    const matchesType = selectedType === 'all' || rec.type === selectedType;
    const matchesStatus =
      selectedStatus === 'all' ||
      (selectedStatus === 'suspicious'
        ? Boolean(rec.isSuspiciousDevice || rec.type === 'security_alert')
        : rec.status === selectedStatus);
    const matchesDate = !selectedDate || rec.date === selectedDate;

    return matchesSearch && matchesType && matchesStatus && matchesDate;
  });

  // Handle Manual Log Submission
  const handleSaveManualRecord = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualForm.employeeId) return;

    const emp = employees.find((x) => x.id === manualForm.employeeId);
    if (!emp) return;

    const newRecord: AttendanceRecord = {
      id: `MAN-${Date.now().toString().slice(-6)}`,
      employeeId: emp.id,
      employeeName: emp.fullName,
      department: emp.department,
      date: manualForm.date,
      type: manualForm.type,
      timestamp: `${manualForm.date}T${manualForm.timeStr}`,
      timeStr: manualForm.timeStr,
      method: 'manual_admin',
      status: 'normal',
      lateMinutes: 0,
      note: manualForm.note,
      terminal: 'İK Yönetim Paneli (Manuel Kayıt)',
    };

    const current = pdksStorage.getAttendanceRecords();
    current.unshift(newRecord);
    localStorage.setItem('pdks_records_v1', JSON.stringify(current));

    setIsManualModalOpen(false);
    loadData();
  };

  // Export CSV
  const handleExportCSV = () => {
    const headers = [
      'Kayıt ID',
      'Sicil No',
      'Ad Soyad',
      'Departman',
      'Tarih',
      'Saat',
      'İşlem Türü',
      'Durum',
      'Gecikme (Dk)',
      'Yöntem',
      'MAC Adresi',
      'Device ID',
      'Cihaz Modeli',
      'Güvenlik Uyarısı / Cihaz Sahibi',
      'Terminal / Not',
    ];

    const rows = filteredRecords.map((r) => [
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
        ? 'Güvenlik Uyarısı (Cihaz)'
        : 'Mola',
      r.isSuspiciousDevice ? 'Şüpheli Cihaz' : r.status,
      r.lateMinutes,
      r.method,
      r.macAddress || '-',
      r.deviceId || '-',
      r.deviceName || '-',
      r.isSuspiciousDevice
        ? `${r.securityWarning || 'Başka Personel Cihazı ile Giriş'} (${r.deviceOwnerEmployeeName || '-'})`
        : '-',
      r.note || r.terminal || '-',
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,\uFEFF' +
      [
        `Kurum / Şirket;${companyName};Tarih;${getTodayString()}`,
        headers.join(';'),
        ...rows.map((row) => row.join(';')),
      ].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `PDKS_Giris_Cikis_Kayitlari_${getTodayString()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
            {companyName} · Giriş - Çıkış Hareket Kayıtları
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5 sm:mt-1">
            Turnike ve mobil tarayıcılardan gelen tüm PDKS logları, gecikme ve mesai hareketleri.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
          {canCreate && (
            <button
              onClick={() => {
                if (employees.length > 0) {
                  setManualForm((prev) => ({ ...prev, employeeId: employees[0].id }));
                }
                setIsManualModalOpen(true);
              }}
              className="inline-flex items-center justify-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg shadow-sm transition-colors whitespace-nowrap cursor-pointer"
            >
              <Plus className="w-4 h-4 text-slate-500" />
              <span>Manuel Kayıt Ekle</span>
            </button>
          )}

          {canExport && (
            <button
              onClick={handleExportCSV}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-sm transition-colors whitespace-nowrap cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Excel / CSV İndir</span>
            </button>
          )}

          {canClear && records.length > 0 && (
            !confirmClearAll ? (
              <button
                type="button"
                onClick={() => setConfirmClearAll(true)}
                className="inline-flex items-center justify-center gap-2 px-3.5 py-2 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                <span>Logları Temizle</span>
              </button>
            ) : (
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-rose-50 border border-rose-300 text-xs">
                <span className="font-bold text-rose-900">Tüm loglar silinsin mi?</span>
                <button
                  type="button"
                  onClick={async () => {
                    await pdksStorage.clearAttendanceLogs('all');
                    setConfirmClearAll(false);
                    loadData();
                  }}
                  className="px-2 py-0.5 rounded bg-rose-600 text-white font-bold cursor-pointer"
                >
                  Evet
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmClearAll(false)}
                  className="px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-700 font-semibold cursor-pointer"
                >
                  İptal
                </button>
              </div>
            )
          )}
        </div>
      </div>

      {/* Security Alert Summary Banner if suspicious cross-device logs exist */}
      {suspiciousCount > 0 && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-rose-600 text-white flex items-center justify-center shrink-0">
              <ShieldAlert className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-rose-900">
                Başka Personel Cihazı ile Giriş / İşlem Tespit Edildi ({suspiciousCount} Kayıt)
              </h3>
              <p className="text-[11px] text-rose-700">
                Sistemde başka bir personele kayıtlı MAC / Device ID üzerinden gerçekleştirilen şüpheli işlemler aşağıda kırmızı uyarı ile işaretlenmiştir.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSelectedStatus(selectedStatus === 'suspicious' ? 'all' : 'suspicious')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors shrink-0 cursor-pointer ${
              selectedStatus === 'suspicious'
                ? 'bg-rose-600 text-white border-rose-600'
                : 'bg-white text-rose-700 border-rose-300 hover:bg-rose-100'
            }`}
          >
            {selectedStatus === 'suspicious' ? 'Tüm Kayıtları Göster' : `Şüpheli Kayıtları Filtrele (${suspiciousCount})`}
          </button>
        </div>
      )}

      {/* Filter Toolbar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs grid grid-cols-1 md:grid-cols-5 gap-3">
        {/* Search */}
        <div className="relative md:col-span-2">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Personel, Sicil, MAC Adresi veya Device ID ara..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50/50"
          />
        </div>

        {/* Date Filter */}
        <div>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50/50 text-slate-700"
          />
        </div>

        {/* Action Type Filter */}
        <div>
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white text-slate-700"
          >
            <option value="all">Tüm Hareketler</option>
            <option value="check_in">Sadece Girişler</option>
            <option value="check_out">Sadece Çıkışlar</option>
            <option value="break_start">Mola Başlangıç</option>
            <option value="break_end">Mola Dönüş</option>
            <option value="security_alert">Güvenlik Uyarısı (Cihaz)</option>
          </select>
        </div>

        {/* Status Filter */}
        <div>
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white text-slate-700"
          >
            <option value="all">Tüm Durumlar</option>
            <option value="on_time">Zamanında</option>
            <option value="late">Gecikmeli</option>
            <option value="early_leave">Erken Çıkış</option>
            <option value="suspicious">Şüpheli / Başka Personel Cihazı</option>
          </select>
        </div>
      </div>

      {/* Record Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
        {/* Mobile Logs Card View (md:hidden) */}
        <div className="md:hidden divide-y divide-slate-100">
          {filteredRecords.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs">
              Seçili filtrelere uygun hareket kaydı bulunamadı.
            </div>
          ) : (
            filteredRecords.map((r) => {
              const isCheckIn = r.type === 'check_in';
              const isCheckOut = r.type === 'check_out';
              const isBreak = r.type.startsWith('break');
              const isSecurityAlert = r.type === 'security_alert';

              return (
                <div
                  key={r.id}
                  className={`p-3.5 space-y-2 ${
                    r.isSuspiciousDevice || isSecurityAlert ? 'bg-rose-50/60 border-l-4 border-l-rose-500' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-bold text-xs text-slate-900">{r.employeeName}</div>
                      <div className="text-[10px] text-slate-500 font-mono">
                        {r.employeeId} · {r.department}
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="font-mono font-bold text-xs text-slate-900 tabular-nums">
                        {r.timeStr}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono">{r.date}</div>
                    </div>
                  </div>

                  {r.isSuspiciousDevice && (
                    <div className="p-2 rounded-lg bg-rose-100/80 border border-rose-200 text-rose-900 text-[10px] space-y-0.5">
                      <div className="font-bold flex items-center gap-1">
                        <ShieldAlert className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                        <span>{r.securityWarning || 'Başka Personel Cihazı ile Giriş'}</span>
                      </div>
                      {r.deviceOwnerEmployeeName && (
                        <div>
                          Cihaz Sahibi: <strong>{r.deviceOwnerEmployeeName}</strong>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-1.5 pt-1.5 border-t border-slate-100 text-[11px]">
                    <div>
                      {isCheckIn && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-800">
                          <ArrowDownRight className="w-3 h-3 text-emerald-600" /> Giriş
                        </span>
                      )}
                      {isCheckOut && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-100 text-rose-800">
                          <ArrowUpRight className="w-3 h-3 text-rose-600" /> Çıkış
                        </span>
                      )}
                      {isBreak && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 text-amber-800">
                          <Coffee className="w-3 h-3 text-amber-600" />
                          {r.type === 'break_start' ? 'Molaya Çıktı' : 'Moladan Döndü'}
                        </span>
                      )}
                      {isSecurityAlert && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                          <ShieldAlert className="w-3 h-3 text-rose-600" /> Güvenlik Uyarısı
                        </span>
                      )}
                    </div>

                    <div>
                      {r.isSuspiciousDevice ? (
                        <span className="text-rose-700 font-bold text-[10px]">Şüpheli Cihaz</span>
                      ) : r.status === 'late' ? (
                        <span className="text-amber-700 font-bold text-[10px]">Geç (+{r.lateMinutes} dk)</span>
                      ) : r.status === 'on_time' ? (
                        <span className="text-emerald-700 font-semibold text-[10px]">Zamanında</span>
                      ) : r.status === 'early_leave' ? (
                        <span className="text-orange-700 font-semibold text-[10px]">Erken Çıkış</span>
                      ) : (
                        <span className="text-slate-500 text-[10px]">Standart</span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-1 text-[10px] text-slate-500 pt-1">
                    <span className="font-mono">
                      {r.terminal || 'Kiosk'}
                      {r.macAddress ? ` · MAC: ${r.macAddress}` : ''}
                    </span>
                    <span className="truncate max-w-[240px]">{r.note || '-'}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Desktop Record Table (hidden md:block) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-500 font-semibold uppercase tracking-wider">
                <th className="py-3 px-4">Tarih & Saat</th>
                <th className="py-3 px-4">Personel</th>
                <th className="py-3 px-4">Departman</th>
                <th className="py-3 px-4">İşlem Türü</th>
                <th className="py-3 px-4">Zaman / Güvenlik Durumu</th>
                <th className="py-3 px-4">Cihaz & MAC / Terminal</th>
                <th className="py-3 px-4">Not / Açıklama</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    Seçili filtrelere uygun hareket kaydı bulunamadı.
                  </td>
                </tr>
              ) : (
                filteredRecords.map((r) => {
                  const isCheckIn = r.type === 'check_in';
                  const isCheckOut = r.type === 'check_out';
                  const isBreak = r.type.startsWith('break');
                  const isSecurityAlert = r.type === 'security_alert';

                  return (
                    <tr
                      key={r.id}
                      className={`transition-colors ${
                        r.isSuspiciousDevice || isSecurityAlert
                          ? 'bg-rose-50/60 hover:bg-rose-50 border-l-4 border-l-rose-500'
                          : 'hover:bg-slate-50/60'
                      }`}
                    >
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="font-mono font-medium text-slate-900 tabular-nums text-sm">
                          {r.timeStr}
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono">{r.date}</div>
                      </td>

                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900">{r.employeeName}</div>
                        <div className="text-[11px] text-slate-500 font-mono">{r.employeeId}</div>
                      </td>

                      <td className="py-3 px-4 text-slate-600">{r.department}</td>

                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 font-semibold">
                          {isCheckIn && (
                            <span className="text-emerald-700 flex items-center gap-1">
                              <ArrowDownRight className="w-3.5 h-3.5" /> Giriş Yapıldı
                            </span>
                          )}
                          {isCheckOut && (
                            <span className="text-rose-700 flex items-center gap-1">
                              <ArrowUpRight className="w-3.5 h-3.5" /> Çıkış Yapıldı
                            </span>
                          )}
                          {isBreak && (
                            <span className="text-amber-700 flex items-center gap-1">
                              <Coffee className="w-3.5 h-3.5" />
                              {r.type === 'break_start' ? 'Molaya Çıktı' : 'Moladan Döndü'}
                            </span>
                          )}
                          {isSecurityAlert && (
                            <span className="text-rose-700 flex items-center gap-1">
                              <ShieldAlert className="w-3.5 h-3.5" /> Güvenlik Uyarısı
                            </span>
                          )}
                        </span>
                      </td>

                      <td className="py-3 px-4">
                        {r.isSuspiciousDevice ? (
                          <div className="space-y-1">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-100 text-rose-800 border border-rose-200 text-[10px] font-bold">
                              <ShieldAlert className="w-3 h-3 shrink-0" />
                              <span>Başka Personel Cihazı</span>
                            </span>
                            {r.deviceOwnerEmployeeName && (
                              <div className="text-[10px] text-rose-700 font-semibold">
                                Cihaz Sahibi: {r.deviceOwnerEmployeeName}
                              </div>
                            )}
                          </div>
                        ) : r.status === 'late' ? (
                          <div className="text-amber-700 font-medium">
                            Geç Kaldı ({r.lateMinutes} dk)
                          </div>
                        ) : r.status === 'on_time' ? (
                          <div className="text-emerald-700 font-medium">Zamanında</div>
                        ) : r.status === 'early_leave' ? (
                          <div className="text-orange-700 font-medium">Erken Çıkış</div>
                        ) : (
                          <div className="text-slate-600">Standart</div>
                        )}
                      </td>

                      <td className="py-3 px-4">
                        <div className="text-slate-800 font-medium">{r.terminal || 'Kiosk'}</div>
                        <div className="text-[10px] text-slate-400">
                          {r.type === 'security_alert'
                            ? 'Sistem Hesap Girişi'
                            : r.method === 'kiosk_camera'
                            ? 'Kamera QR Tarama'
                            : r.method === 'mobile_scanner'
                            ? 'Mobil Cihaz'
                            : 'Yönetici Manuel'}
                        </div>
                        {(r.macAddress || r.deviceId || r.deviceName) && (
                          <div className="mt-1 text-[10px] font-mono text-slate-600 space-y-0.5">
                            {r.deviceName && (
                              <div className="flex items-center gap-1 text-slate-700 font-sans font-medium">
                                <Smartphone className="w-3 h-3 text-indigo-500 shrink-0" />
                                <span>{r.deviceName}</span>
                              </div>
                            )}
                            {r.macAddress && <div>MAC: <strong className="text-slate-800">{r.macAddress}</strong></div>}
                            {r.deviceId && <div>ID: {r.deviceId}</div>}
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-4 text-slate-500 text-xs max-w-[260px]">
                        {r.isSuspiciousDevice && (
                          <div className="text-rose-700 font-semibold text-[11px] mb-0.5">
                            {r.securityWarning || 'Başka Personel Cihazı ile Giriş (Yetkisiz/Şüpheli Cihaz Kullanımı)'}
                          </div>
                        )}
                        <div>{r.note || '-'}</div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL: Manuel Kayıt Ekle */}
      {isManualModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl overflow-hidden border border-slate-200">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <h3 className="font-bold text-base text-slate-900">
                Manuel PDKS Hareketi Ekle
              </h3>
              <button
                onClick={() => setIsManualModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveManualRecord} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Personel Seçimi *
                </label>
                <select
                  required
                  value={manualForm.employeeId}
                  onChange={(e) => setManualForm({ ...manualForm, employeeId: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                >
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.fullName} ({emp.id} - {emp.department})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Tarih
                  </label>
                  <input
                    type="date"
                    required
                    value={manualForm.date}
                    onChange={(e) => setManualForm({ ...manualForm, date: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Saat (SS:DD:ss)
                  </label>
                  <input
                    type="time"
                    step="1"
                    required
                    value={manualForm.timeStr}
                    onChange={(e) => setManualForm({ ...manualForm, timeStr: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  İşlem Türü
                </label>
                <select
                  value={manualForm.type}
                  onChange={(e) => setManualForm({ ...manualForm, type: e.target.value as ActionType })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                >
                  <option value="check_in">Giriş Yapıldı (Check-In)</option>
                  <option value="check_out">Çıkış Yapıldı (Check-Out)</option>
                  <option value="break_start">Mola Başlangıcı</option>
                  <option value="break_end">Mola Dönüşü</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Gerekçe & Not
                </label>
                <textarea
                  rows={2}
                  value={manualForm.note}
                  onChange={(e) => setManualForm({ ...manualForm, note: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="pt-4 border-t border-slate-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsManualModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-sm"
                >
                  Kaydı Sisteme İşle
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
