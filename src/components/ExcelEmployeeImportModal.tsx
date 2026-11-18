import React, { useState, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import {
  FileSpreadsheet,
  Upload,
  Download,
  CheckCircle2,
  AlertCircle,
  X,
  Users,
} from 'lucide-react';
import { Employee, Department, Shift, UserAccount } from '../types/pdks';
import { pdksStorage, slugifyNameToUsername, getTodayString } from '../services/storage';

interface ExcelEmployeeImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (count: number) => void;
  shifts: Shift[];
}

interface ParsedEmployeeRow {
  index: number;
  fullName: string;
  tcNo: string;
  department: Department;
  title: string;
  email: string;
  phone: string;
  shiftId: string;
  isValid: boolean;
  validationError?: string;
}

const VALID_DEPARTMENTS: Department[] = [
  'Yazılım & Ar-Ge',
  'İnsan Kaynakları',
  'Muhasebe & Finans',
  'Pazarlama & Satış',
  'Üretim & Operasyon',
  'Lojistik & Depo',
];

export const ExcelEmployeeImportModal: React.FC<ExcelEmployeeImportModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  shifts,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedEmployeeRow[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [createAccounts, setCreateAccounts] = useState(true);
  const [defaultShiftId, setDefaultShiftId] = useState<string>(shifts[0]?.id || 'SHIFT-1');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setErrorMessage(null);
      if (shifts.length > 0 && !shifts.some((s) => s.id === defaultShiftId)) {
        setDefaultShiftId(shifts[0].id);
      }
    }
  }, [isOpen, shifts, defaultShiftId]);

  if (!isOpen) return null;

  // 1. Download Sample Excel Template
  const handleDownloadTemplate = () => {
    const templateData = [
      {
        'Ad Soyad': 'Örnek Personel 1',
        'TC Kimlik No': '10000000001',
        'Departman': 'Yazılım & Ar-Ge',
        'Unvan': 'Yazılım Geliştirici',
        'E-posta': 'personel1@example.com',
        'Telefon': '+90 500 000 0001',
        'Vardiya': shifts[0]?.name || 'Standart Mesai',
      },
      {
        'Ad Soyad': 'Örnek Personel 2',
        'TC Kimlik No': '10000000002',
        'Departman': 'Üretim & Operasyon',
        'Unvan': 'Vardiya Teknisyeni',
        'E-posta': 'personel2@example.com',
        'Telefon': '+90 500 000 0002',
        'Vardiya': shifts[1]?.name || shifts[0]?.name || 'Sabah Vardiyası',
      },
      {
        'Ad Soyad': 'Örnek Personel 3',
        'TC Kimlik No': '10000000003',
        'Departman': 'Muhasebe & Finans',
        'Unvan': 'Finans Uzmanı',
        'E-posta': 'personel3@example.com',
        'Telefon': '+90 500 000 0003',
        'Vardiya': shifts[0]?.name || 'Standart Mesai',
      },
    ];

    const worksheet = XLSX.utils.json_to_sheet(templateData);
    // Set auto column width
    worksheet['!cols'] = [
      { wch: 22 },
      { wch: 16 },
      { wch: 22 },
      { wch: 28 },
      { wch: 28 },
      { wch: 18 },
      { wch: 26 },
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Personel Listesi');
    XLSX.writeFile(workbook, 'PDKS_Personel_Sablonu.xlsx');
  };

  // 2. Parse Uploaded Excel/CSV File
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      processFile(selectedFile);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const processFile = async (uploadedFile: File) => {
    setFile(uploadedFile);
    setIsProcessing(true);
    setErrorMessage(null);

    try {
      const buffer = await uploadedFile.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];

      if (!firstSheetName) {
        throw new Error('Excel dosyasında geçerli bir çalışma sayfası bulunamadı.');
      }

      const sheet = workbook.Sheets[firstSheetName];
      const rawData = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: '' });

      if (rawData.length === 0) {
        throw new Error('Yüklenen Excel listesi boş veya satır bulunamadı.');
      }

      const parsed: ParsedEmployeeRow[] = rawData.map((row, idx) => {
        // Smart column mapping (case-insensitive & accent-insensitive)
        const getVal = (...keys: string[]): string => {
          for (const key of keys) {
            for (const [k, v] of Object.entries(row)) {
              const cleanK = k.trim().toLowerCase().replace(/[\s_-]/g, '');
              const cleanTarget = key.trim().toLowerCase().replace(/[\s_-]/g, '');
              if (cleanK === cleanTarget) {
                return String(v || '').trim();
              }
            }
          }
          return '';
        };

        const fullName = getVal('adsoyad', 'adısoyadı', 'fullname', 'ad', 'isim');
        const tcNo = getVal('tckimlikno', 'tcno', 'tc', 'tckn', 'kimlikno');
        const rawDept = getVal('departman', 'department', 'bölüm', 'birim');
        const title = getVal('unvan', 'title', 'pozisyon', 'görev') || 'Personel';
        const email = getVal('eposta', 'email', 'e-posta', 'mail');
        const phone = getVal('telefon', 'phone', 'tel', 'gsm') || '+90 500 000 0000';
        const rawShift = getVal('vardiya', 'shift', 'shiftid', 'mesai');

        // Match department or fallback
        let department: Department = 'Yazılım & Ar-Ge';
        const matchedDept = VALID_DEPARTMENTS.find(
          (d) => d.toLowerCase() === rawDept.toLowerCase() || rawDept.toLowerCase().includes(d.toLowerCase())
        );
        if (matchedDept) {
          department = matchedDept;
        }

        // Match shift or fallback to defaultShiftId
        let shiftId = defaultShiftId;
        if (rawShift) {
          const matchedShift = shifts.find(
            (s) =>
              s.id.toLowerCase() === rawShift.toLowerCase() ||
              s.name.toLowerCase().includes(rawShift.toLowerCase())
          );
          if (matchedShift) {
            shiftId = matchedShift.id;
          }
        }

        // Validation
        let isValid = true;
        let validationError: string | undefined = undefined;

        if (!fullName || fullName.length < 3) {
          isValid = false;
          validationError = 'Ad Soyad en az 3 karakter olmalıdır';
        } else if (tcNo && tcNo.length !== 11) {
          isValid = false;
          validationError = 'T.C. Kimlik No 11 haneli olmalıdır';
        }

        return {
          index: idx + 1,
          fullName,
          tcNo: tcNo || `${Math.floor(10000000000 + Math.random() * 90000000000)}`,
          department,
          title,
          email: email || `${slugifyNameToUsername(fullName || 'personel')}@example.com`,
          phone,
          shiftId,
          isValid,
          validationError,
        };
      });

      setParsedRows(parsed);
    } catch (err: any) {
      setErrorMessage(err.message || 'Excel dosyası işlenirken bir hata oluştu.');
      setParsedRows([]);
    } finally {
      setIsProcessing(false);
    }
  };

  // 3. Execute Bulk Import
  const handleExecuteImport = () => {
    const validRows = parsedRows.filter((r) => r.isValid);
    if (validRows.length === 0) {
      setErrorMessage('Aktarılacak geçerli personel kaydı bulunmuyor.');
      return;
    }

    const existingEmployees = pdksStorage.getEmployees();
    const existingAccounts = pdksStorage.getUserAccounts();
    let currentMaxNumber = 1000;
    existingEmployees.forEach((e) => {
      const match = e.id.match(/EMP-(\d+)/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > currentMaxNumber) currentMaxNumber = num;
      }
    });

    const newEmployees: Employee[] = [];
    const newAccounts: UserAccount[] = [];
    const usedUsernames = new Set(existingAccounts.map((a) => a.username.toLowerCase()));
    const todayDate = getTodayString();

    validRows.forEach((row, i) => {
      const nextNum = currentMaxNumber + i + 1;
      const empId = `EMP-${nextNum}`;
      const baseSlug = slugifyNameToUsername(row.fullName) || `personel.${nextNum}`;
      const cleanUsername = usedUsernames.has(baseSlug.toLowerCase()) ? `${baseSlug}.${nextNum}` : baseSlug;
      usedUsernames.add(cleanUsername.toLowerCase());
      const qrToken = `PDKS-${empId}-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
      const avatarUrl = `https://images.unsplash.com/photo-${1534528741775 + ((i * 12345) % 100000)}?w=150&auto=format&fit=crop&q=80`;

      newEmployees.push({
        id: empId,
        fullName: row.fullName,
        tcNo: row.tcNo,
        department: row.department,
        title: row.title,
        email: row.email,
        phone: row.phone,
        shiftId: row.shiftId,
        startDate: todayDate,
        qrToken,
        avatar: avatarUrl,
        status: 'active',
        currentPresence: 'outside',
        avatarStatus: 'approved',
      });

      if (createAccounts) {
        newAccounts.push({
          id: `ACC-${Date.now().toString().slice(-5)}-${i}`,
          employeeId: empId,
          username: cleanUsername,
          password: '123456',
          role: 'personel',
          name: row.fullName,
          title: row.title,
          department: row.department,
          avatar: avatarUrl,
          avatarStatus: 'approved',
          isActive: true,
          canCheckInOut: true,
          canTakeBreak: true,
          canRequestLeave: true,
          canViewOwnStats: true,
          createdAt: new Date().toISOString(),
        });
      }
    });

    const importedCount = newEmployees.length;
    pdksStorage.saveEmployeesAndAccountsBatch(newEmployees, newAccounts);

    // Add in-system PDKS notification
    pdksStorage.addNotification({
      type: 'excel_import',
      title: 'Toplu Personel İçe Aktarımı Tamamlandı',
      message: `Excel listesinden ${importedCount} yeni çalışan başarıyla eklendi, PDKS kimlik kartları ve giriş hesapları üretildi.`,
      employeeId: 'all',
      employeeName: 'İK Yöneticisi',
      department: 'İnsan Kaynakları',
      severity: 'info',
    });

    setFile(null);
    setParsedRows([]);
    onSuccess(importedCount);
    onClose();
  };

  const validCount = parsedRows.filter((r) => r.isValid).length;
  const invalidCount = parsedRows.filter((r) => !r.isValid).length;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl max-w-4xl w-full shadow-2xl overflow-hidden border border-slate-200 flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 bg-gradient-to-r from-emerald-600 via-teal-600 to-indigo-700 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-xs flex items-center justify-center font-bold">
              <FileSpreadsheet className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                Excel Listesi ile Toplu Personel Ekleme
              </h3>
              <p className="text-xs text-white/80">
                Toplu çalışan sicil listesini Excel (.xlsx, .xls) veya CSV olarak sisteme aktarın.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            aria-label="Kapat"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1">
          {/* Step 1: Template Download Banner */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                <Download className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-900">Hazır Excel Şablonu</h4>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Doğru sütun başlıkları ve örnek satırları içeren şablonu bilgisayarınıza indirip doldurabilirsiniz.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleDownloadTemplate}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-lg shadow-xs transition-colors shrink-0 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Örnek Şablonu İndir (.xlsx)</span>
            </button>
          </div>

          {/* Step 2: Upload Zone */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            className="border-2 border-dashed border-slate-300 hover:border-indigo-500 rounded-2xl p-6 text-center cursor-pointer transition-colors bg-slate-50/50 hover:bg-indigo-50/20"
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".xlsx, .xls, .csv"
              className="hidden"
            />
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto mb-3 border border-indigo-100">
              <Upload className="w-6 h-6" />
            </div>
            <div className="font-bold text-sm text-slate-800">
              {file ? file.name : 'Excel veya CSV Dosyanızı Buraya Sürükleyin'}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              veya bilgisayarınızdan dosya seçmek için tıklayın (.xlsx, .xls, .csv desteklenir)
            </p>
          </div>

          {/* Error Message */}
          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Step 3: Options */}
          {parsedRows.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200">
              <div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={createAccounts}
                    onChange={(e) => setCreateAccounts(e.target.checked)}
                    className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                  />
                  <span className="text-xs font-bold text-slate-800">
                    Otomatik Personel Portal Giriş Hesabı Oluştur
                  </span>
                </label>
                <p className="text-[11px] text-slate-500 mt-1 pl-6">
                  Her çalışan için isimden kullanıcı adı ve varsayılan başlangıç şifresi (<strong>123456</strong>) tanımlanır.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Varsayılan Vardiya (Dosyada Belirtilmeyenler İçin):
                </label>
                <select
                  value={defaultShiftId}
                  onChange={(e) => setDefaultShiftId(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg text-slate-800"
                >
                  {shifts.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.startTime} - {s.endTime})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Step 4: Preview Table */}
          {parsedRows.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 font-bold text-slate-800">
                  <Users className="w-4 h-4 text-indigo-600" />
                  <span>Önizleme Listesi ({parsedRows.length} Kayıt)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    {validCount} Geçerli
                  </span>
                  {invalidCount > 0 && (
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                      {invalidCount} Hatalı
                    </span>
                  )}
                </div>
              </div>

              <div className="max-h-60 overflow-y-auto border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-slate-700 uppercase font-semibold text-[10px] tracking-wider sticky top-0">
                    <tr>
                      <th className="py-2 px-3">#</th>
                      <th className="py-2 px-3">Ad Soyad</th>
                      <th className="py-2 px-3">T.C. No</th>
                      <th className="py-2 px-3">Departman</th>
                      <th className="py-2 px-3">Unvan</th>
                      <th className="py-2 px-3">E-posta</th>
                      <th className="py-2 px-3 text-right">Durum</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {parsedRows.map((row) => (
                      <tr key={row.index} className={row.isValid ? 'hover:bg-slate-50' : 'bg-rose-50/50'}>
                        <td className="py-2 px-3 text-slate-400 font-mono text-[11px]">{row.index}</td>
                        <td className="py-2 px-3 font-bold text-slate-900">{row.fullName}</td>
                        <td className="py-2 px-3 text-slate-600 font-mono text-[11px]">{row.tcNo}</td>
                        <td className="py-2 px-3 text-slate-700">{row.department}</td>
                        <td className="py-2 px-3 text-slate-600">{row.title}</td>
                        <td className="py-2 px-3 text-slate-500 font-mono text-[11px] truncate max-w-[120px]">
                          {row.email}
                        </td>
                        <td className="py-2 px-3 text-right">
                          {row.isValid ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3" /> Hazır
                            </span>
                          ) : (
                            <span
                              className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200"
                              title={row.validationError}
                            >
                              <AlertCircle className="w-3 h-3" /> {row.validationError}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs">
          <div className="text-slate-500">
            {parsedRows.length > 0 ? (
              <span>
                Toplam <strong>{validCount}</strong> çalışan sisteme aktarılmaya hazır.
              </span>
            ) : (
              <span>Lütfen önce bir Excel veya CSV dosyası yükleyin.</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
            >
              Vazgeç
            </button>

            <button
              type="button"
              disabled={validCount === 0 || isProcessing}
              onClick={handleExecuteImport}
              className="inline-flex items-center gap-2 px-5 py-2 font-bold text-white bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-300 disabled:cursor-not-allowed rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{validCount > 0 ? `${validCount} Personeli Sisteme Aktar` : 'İçe Aktar'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
