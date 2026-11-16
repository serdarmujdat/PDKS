import type {
  Employee,
  AttendanceRecord,
  Shift,
  LeaveRequest,
  OvertimeRequest,
  PDKSNotification,
  CompanyWallQRConfig,
  UserAccount,
  SupervisorAssignment,
  NotificationSettings,
} from '../types/pdks';

export const PDKS_SYSTEM_API_KEY = 'evren_llm_40eYxYnsM-qzeV7OOaIMmVfYB9KTajRcYFr-5bwh_Ko';

export const DEFAULT_COMPANY_LOGO = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 60" fill="none"><rect width="240" height="60" rx="12" fill="%234F46E5"/><g transform="translate(14, 12)"><rect width="36" height="36" rx="8" fill="%233730A3"/><path d="M8 8h8v8H8zM20 8h8v8h-8zM8 20h8v8H8zM22 22h4v4h-4z" fill="%23FFFFFF"/><circle cx="26" cy="10" r="1.5" fill="%23A5B4FC"/></g><text x="62" y="33" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="20" font-weight="800" fill="%23FFFFFF" letter-spacing="1">ASEM</text><text x="62" y="46" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="9.5" font-weight="600" fill="%23C7D2FE" letter-spacing="2.5">PDKS SİSTEMLERİ</text></svg>`;

export const DEFAULT_KIOSK_LOCK_PASSWORD = '1234';

export function getTodayString(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function normalizeUsername(str: string): string {
  if (!str) return '';
  return str
    .trim()
    .replace(/^@+/, '')
    .toLocaleLowerCase('tr-TR')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '');
}

export function slugifyNameToUsername(fullName: string): string {
  if (!fullName) return '';
  return fullName
    .trim()
    .toLocaleLowerCase('tr-TR')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .toLowerCase()
    .replace(/\s+/g, '.')
    .replace(/[^a-z0-9._-]/g, '')
    .replace(/\.+/g, '.')
    .replace(/^\.|\.$/g, '');
}

export const DEFAULT_COMPANY_WALL_QR: CompanyWallQRConfig = {
  token: 'evren_llm_40eYxYnsM-qzeV7OOaIMmVfYB9KTajRcYFr-5bwh_Ko',
  companyName: 'Asem Personel Devam Kontrol Sistemleri',
  branchName: 'İşyeri / Ana Giriş',
  installationLocation: 'Giriş Turnikesi & Personel Bekleme Alanı Sabit Duvar Panosu',
  qrPayload: 'ASEM:WALL:evren_llm_40eYxYnsM-qzeV7OOaIMmVfYB9KTajRcYFr-5bwh_Ko:GEO:1:41.0082:28.9784:250',
  createdAt: '2026-01-01T00:00:00.000Z',
  lastRotatedAt: '2026-03-01T09:00:00.000Z',
  enableGeofence: true,
  latitude: 41.0082,
  longitude: 28.9784,
  radiusMeters: 250,
};

export const DEFAULT_ACCOUNTS: UserAccount[] = [
  {
    id: 'ACC-1001',
    username: 'merve.ozer',
    password: 'Maxipluas5',
    employeeId: 'EMP-1002',
    name: 'Merve Özer',
    role: 'ik_yoneticisi',
    title: 'İnsan Kaynakları & Bordro Müdürü',
    department: 'İnsan Kaynakları',
    avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=256&h=256&q=80',
    createdAt: '2026-01-10T08:00:00Z',
    isActive: true,
    canCheckInOut: true,
    canTakeBreak: true,
    canRequestLeave: true,
    canViewOwnStats: true,
  },
  {
    id: 'ACC-1002',
    username: 'ahmet.yilmaz',
    password: '123456',
    employeeId: 'EMP-1001',
    name: 'Ahmet Faruk Yılmaz',
    role: 'personel',
    title: 'Kıdemli Yazılım Mimarı',
    department: 'Yazılım & Ar-Ge',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=256&h=256&q=80',
    createdAt: '2026-01-15T09:00:00Z',
    isActive: true,
    canCheckInOut: true,
    canTakeBreak: true,
    canRequestLeave: true,
    canViewOwnStats: true,
  },
  {
    id: 'ACC-1003',
    username: 'mehmet.kurt',
    password: '123456',
    employeeId: 'EMP-1005',
    name: 'Mehmet Ali Kurt',
    role: 'birim_amiri',
    title: 'Üretim Vardiya Amiri (Birim Amiri)',
    department: 'Üretim & Operasyon',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=256&h=256&q=80',
    createdAt: '2026-01-12T08:30:00Z',
    isActive: true,
    canCheckInOut: true,
    canTakeBreak: true,
    canRequestLeave: true,
    canViewOwnStats: true,
    isShiftSupervisor: true,
    assignedEmployeeIds: ['EMP-1005', 'EMP-1007'],
  },
  {
    id: 'ACC-1004',
    username: 'selim.dagli',
    password: '123456',
    employeeId: 'EMP-1007',
    name: 'Selim Dağlı',
    role: 'guvenlik',
    title: 'Turnike & Resepsiyon Görevlisi',
    department: 'Lojistik & Depo',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=256&h=256&q=80',
    createdAt: '2026-02-01T07:30:00Z',
    isActive: true,
    canCheckInOut: true,
    canTakeBreak: true,
    canRequestLeave: false,
    canViewOwnStats: true,
  },
  {
    id: 'ACC-1005',
    username: 'emre.demir',
    password: '123456',
    employeeId: 'EMP-1003',
    name: 'Emre Can Demir',
    role: 'personel',
    title: 'Finansal Kontrolör',
    department: 'Muhasebe & Finans',
    avatar: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=256&h=256&q=80',
    createdAt: '2026-02-10T10:00:00Z',
    isActive: true,
    canCheckInOut: true,
    canTakeBreak: true,
    canRequestLeave: true,
    canViewOwnStats: true,
  },
  {
    id: 'ACC-1009',
    username: 'mujdat.tosun',
    password: '123456',
    employeeId: 'EMP-1009',
    name: 'Müjdat Tosun',
    role: 'personel',
    title: 'Kıdemli Yazılım Geliştirici',
    department: 'Yazılım & Ar-Ge',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=256&h=256&q=80',
    createdAt: '2026-03-01T08:00:00Z',
    isActive: true,
    canCheckInOut: true,
    canTakeBreak: true,
    canRequestLeave: true,
    canViewOwnStats: true,
  },
];

export const DEFAULT_SUPERVISOR_ASSIGNMENTS: SupervisorAssignment[] = [
  {
    id: 'SUP-1001',
    supervisorId: 'EMP-1005',
    supervisorName: 'Mehmet Ali Kurt',
    department: 'Üretim & Operasyon',
    assignedEmployeeIds: ['EMP-1005', 'EMP-1007'],
    createdAt: '2026-01-12T08:30:00Z',
    assignedBy: 'Merve Özer (İK Yöneticisi)',
    notes: 'Üretim & Operasyon ve Lojistik personellerinin vardiyalarını ayarlama yetkisine sahip birim amiri.',
  },
];

export const DEFAULT_SETTINGS: NotificationSettings = {
  notifyOnLate: true,
  lateThresholdMinutes: 15,
  notifyOnEarlyLeave: true,
  notifyOnOvertime: true,
  overtimeThresholdMinutes: 45,
  notifyAllCheckInOut: false,
  soundEnabled: true,
};

export const DEFAULT_NOTIFICATIONS: PDKSNotification[] = [
  {
    id: 'NOTIF-01',
    type: 'critical_late',
    title: 'Kritik Gecikme Uyarısı',
    message: 'Emre Can Demir (Muhasebe & Finans) mesaiye 19 dakika gecikmeyle giriş yaptı.',
    employeeId: 'EMP-1003',
    employeeName: 'Emre Can Demir',
    department: 'Muhasebe & Finans',
    timestamp: new Date(Date.now() - 3600000 * 2).toISOString(),
    severity: 'warning',
    read: false,
  },
  {
    id: 'NOTIF-02',
    type: 'check_in',
    title: 'Vardiya Başlangıcı',
    message: 'Mehmet Ali Kurt (Üretim & Operasyon) 07:22:15 itibarıyla giriş turnikesinden geçti.',
    employeeId: 'EMP-1005',
    employeeName: 'Mehmet Ali Kurt',
    department: 'Üretim & Operasyon',
    timestamp: new Date(Date.now() - 3600000 * 4).toISOString(),
    severity: 'info',
    read: true,
  },
];

export const DEFAULT_SHIFTS: Shift[] = [
  {
    id: 'SHIFT-1',
    name: 'Standart Mesai (08:30 - 17:30)',
    startTime: '08:30',
    endTime: '17:30',
    toleranceMinutes: 15,
    breakMinutes: 60,
    workDays: ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma'],
  },
  {
    id: 'SHIFT-2',
    name: 'Esnek Ar-Ge Mesaisi (09:00 - 18:00)',
    startTime: '09:00',
    endTime: '18:00',
    toleranceMinutes: 20,
    breakMinutes: 60,
    workDays: ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma'],
  },
  {
    id: 'SHIFT-3',
    name: 'Üretim / Saha Vardiyası (07:30 - 16:00)',
    startTime: '07:30',
    endTime: '16:00',
    toleranceMinutes: 10,
    breakMinutes: 45,
    workDays: ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'],
  },
  {
    id: 'SHIFT-4',
    name: 'Akşam Destek Vardiyası (16:00 - 00:00)',
    startTime: '16:00',
    endTime: '00:00',
    toleranceMinutes: 15,
    breakMinutes: 45,
    workDays: ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma'],
  },
];

export const DEFAULT_EMPLOYEES: Employee[] = [
  {
    id: 'EMP-1001',
    tcNo: '28471938402',
    fullName: 'Ahmet Faruk Yılmaz',
    email: 'ahmet.yilmaz@kurumsal.com',
    phone: '+90 532 411 9283',
    department: 'Yazılım & Ar-Ge',
    title: 'Kıdemli Yazılım Mimarı',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=256&h=256&q=80',
    shiftId: 'SHIFT-2',
    startDate: '2021-03-15',
    qrToken: 'PDKS:EMP-1001:AUTH_AFY88',
    status: 'active',
    currentPresence: 'inside',
    lastActionTime: '08:52:10',
  },
  {
    id: 'EMP-1002',
    tcNo: '49281740192',
    fullName: 'Merve Özer',
    email: 'merve.ozer@kurumsal.com',
    phone: '+90 533 821 5420',
    department: 'İnsan Kaynakları',
    title: 'İnsan Kaynakları & Bordro Müdürü',
    avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=256&h=256&q=80',
    shiftId: 'SHIFT-1',
    startDate: '2020-09-01',
    qrToken: 'PDKS:EMP-1002:AUTH_MOZ34',
    status: 'active',
    currentPresence: 'inside',
    lastActionTime: '08:24:45',
  },
  {
    id: 'EMP-1003',
    tcNo: '37192840195',
    fullName: 'Emre Can Demir',
    email: 'emre.demir@kurumsal.com',
    phone: '+90 542 918 2039',
    department: 'Muhasebe & Finans',
    title: 'Finansal Kontrolör',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=256&h=256&q=80',
    shiftId: 'SHIFT-1',
    startDate: '2022-01-10',
    qrToken: 'PDKS:EMP-1003:AUTH_ECD91',
    status: 'active',
    currentPresence: 'inside',
    lastActionTime: '08:49:12',
  },
  {
    id: 'EMP-1004',
    tcNo: '18492049182',
    fullName: 'Elif Ceren Şahin',
    email: 'elif.sahin@kurumsal.com',
    phone: '+90 535 771 9021',
    department: 'Pazarlama & Satış',
    title: 'Kurumsal Satış Yöneticisi',
    avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=256&h=256&q=80',
    shiftId: 'SHIFT-1',
    startDate: '2023-05-18',
    qrToken: 'PDKS:EMP-1004:AUTH_ECS12',
    status: 'active',
    currentPresence: 'break',
    lastActionTime: '11:45:00',
  },
  {
    id: 'EMP-1005',
    tcNo: '58291039481',
    fullName: 'Mehmet Ali Kurt',
    email: 'mehmet.kurt@kurumsal.com',
    phone: '+90 544 329 8812',
    department: 'Üretim & Operasyon',
    title: 'Üretim Vardiya Amiri',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=256&h=256&q=80',
    shiftId: 'SHIFT-3',
    startDate: '2019-11-04',
    qrToken: 'PDKS:EMP-1005:AUTH_MAK55',
    status: 'active',
    currentPresence: 'inside',
    lastActionTime: '07:22:15',
  },
  {
    id: 'EMP-1006',
    tcNo: '67192839401',
    fullName: 'Burcu Yoldaş',
    email: 'burcu.yoldas@kurumsal.com',
    phone: '+90 536 291 4059',
    department: 'Yazılım & Ar-Ge',
    title: 'Frontend Arayüz Mühendisi',
    avatar: 'https://images.unsplash.com/photo-1567532939604-b6b5b0db2604?auto=format&fit=crop&w=256&h=256&q=80',
    shiftId: 'SHIFT-2',
    startDate: '2023-02-01',
    qrToken: 'PDKS:EMP-1006:AUTH_BYD77',
    status: 'active',
    currentPresence: 'outside',
  },
  {
    id: 'EMP-1007',
    tcNo: '29102948571',
    fullName: 'Selim Dağlı',
    email: 'selim.dagli@kurumsal.com',
    phone: '+90 551 884 1029',
    department: 'Lojistik & Depo',
    title: 'Turnike & Resepsiyon Görevlisi',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=256&h=256&q=80',
    shiftId: 'SHIFT-3',
    startDate: '2022-08-20',
    qrToken: 'PDKS:EMP-1007:AUTH_SDG90',
    status: 'active',
    currentPresence: 'inside',
    lastActionTime: '07:28:40',
  },
  {
    id: 'EMP-1008',
    tcNo: '81920394857',
    fullName: 'Deniz Aktaş',
    email: 'deniz.aktas@kurumsal.com',
    phone: '+90 538 901 3344',
    department: 'Pazarlama & Satış',
    title: 'Dijital Pazarlama Uzmanı',
    avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=256&h=256&q=80',
    shiftId: 'SHIFT-1',
    startDate: '2024-01-15',
    qrToken: 'PDKS:EMP-1008:AUTH_DAK22',
    status: 'leave',
    currentPresence: 'outside',
  },
  {
    id: 'EMP-1009',
    tcNo: '38491028472',
    fullName: 'Müjdat Tosun',
    email: 'mujdat.tosun@kurumsal.com',
    phone: '+90 534 819 2045',
    department: 'Yazılım & Ar-Ge',
    title: 'Kıdemli Yazılım Geliştirici',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=256&h=256&q=80',
    shiftId: 'SHIFT-2',
    startDate: '2024-03-01',
    qrToken: 'PDKS:EMP-1009:AUTH_MTS99',
    status: 'active',
    currentPresence: 'inside',
    lastActionTime: '08:45:10',
  },
];

export const DEFAULT_RECORDS: AttendanceRecord[] = [
  {
    id: 'REC-001',
    employeeId: 'EMP-1005',
    employeeName: 'Mehmet Ali Kurt',
    department: 'Üretim & Operasyon',
    date: getTodayString(),
    type: 'check_in',
    timestamp: `${getTodayString()}T07:22:15`,
    timeStr: '07:22:15',
    method: 'kiosk_camera',
    status: 'on_time',
    lateMinutes: 0,
    terminal: 'Kiosk Giriş Turnikesi A1',
  },
  {
    id: 'REC-002',
    employeeId: 'EMP-1007',
    employeeName: 'Selim Dağlı',
    department: 'Lojistik & Depo',
    date: getTodayString(),
    type: 'check_in',
    timestamp: `${getTodayString()}T07:28:40`,
    timeStr: '07:28:40',
    method: 'kiosk_camera',
    status: 'on_time',
    lateMinutes: 0,
    terminal: 'Lojistik Kapı Terminali',
  },
  {
    id: 'REC-003',
    employeeId: 'EMP-1002',
    employeeName: 'Merve Özer',
    department: 'İnsan Kaynakları',
    date: getTodayString(),
    type: 'check_in',
    timestamp: `${getTodayString()}T08:24:45`,
    timeStr: '08:24:45',
    method: 'kiosk_camera',
    status: 'on_time',
    lateMinutes: 0,
    terminal: 'Merkez Ofis Turnikesi',
  },
  {
    id: 'REC-004',
    employeeId: 'EMP-1003',
    employeeName: 'Emre Can Demir',
    department: 'Muhasebe & Finans',
    date: getTodayString(),
    type: 'check_in',
    timestamp: `${getTodayString()}T08:49:12`,
    timeStr: '08:49:12',
    method: 'kiosk_camera',
    status: 'late',
    lateMinutes: 19,
    terminal: 'Merkez Ofis Turnikesi',
  },
  {
    id: 'REC-005',
    employeeId: 'EMP-1001',
    employeeName: 'Ahmet Faruk Yılmaz',
    department: 'Yazılım & Ar-Ge',
    date: getTodayString(),
    type: 'check_in',
    timestamp: `${getTodayString()}T08:52:10`,
    timeStr: '08:52:10',
    method: 'mobile_scanner',
    status: 'on_time',
    lateMinutes: 0,
    terminal: 'Mobil QR Okutma (Ar-Ge Katı)',
  },
  {
    id: 'REC-006',
    employeeId: 'EMP-1004',
    employeeName: 'Elif Ceren Şahin',
    department: 'Pazarlama & Satış',
    date: getTodayString(),
    type: 'check_in',
    timestamp: `${getTodayString()}T08:29:10`,
    timeStr: '08:29:10',
    method: 'kiosk_camera',
    status: 'on_time',
    lateMinutes: 0,
    terminal: 'Merkez Ofis Turnikesi',
  },
  {
    id: 'REC-007',
    employeeId: 'EMP-1004',
    employeeName: 'Elif Ceren Şahin',
    department: 'Pazarlama & Satış',
    date: getTodayString(),
    type: 'break_start',
    timestamp: `${getTodayString()}T11:45:00`,
    timeStr: '11:45:00',
    method: 'kiosk_camera',
    status: 'normal',
    lateMinutes: 0,
    terminal: 'Kafeterya Terminali',
  },
];

export const DEFAULT_LEAVES: LeaveRequest[] = [
  {
    id: 'LR-101',
    employeeId: 'EMP-1008',
    employeeName: 'Deniz Aktaş',
    department: 'Pazarlama & Satış',
    leaveType: 'Yıllık İzin',
    startDate: getTodayString(),
    endDate: getTodayString(),
    days: 1,
    reason: 'Kişisel işler ve aile ziyareti için planlı izin.',
    status: 'approved',
    appliedAt: '2026-10-06T14:30:00',
  },
  {
    id: 'LR-102',
    employeeId: 'EMP-1006',
    employeeName: 'Burcu Yoldaş',
    department: 'Yazılım & Ar-Ge',
    leaveType: 'Uzaktan Çalışma (Home Office)',
    startDate: '2026-10-12',
    endDate: '2026-10-12',
    days: 1,
    reason: 'Sprint teslimatı odaklanma günü.',
    status: 'pending',
    appliedAt: '2026-10-08T09:15:00',
  },
];

export const DEFAULT_OVERTIME: OvertimeRequest[] = [
  {
    id: 'OT-101',
    employeeId: 'EMP-1001',
    employeeName: 'Ahmet Yılmaz',
    department: 'Yazılım & Ar-Ge',
    date: getTodayString(),
    startTime: '18:00',
    endTime: '21:00',
    hours: 3,
    reason: 'Sürüm canlıya alma ve acil veri tabanı performans optimizasyonu',
    status: 'pending',
    appliedAt: new Date(Date.now() - 3600000 * 3).toISOString(),
  },
  {
    id: 'OT-102',
    employeeId: 'EMP-1003',
    employeeName: 'Mehmet Demir',
    department: 'Üretim & Operasyon',
    date: getTodayString(),
    startTime: '16:30',
    endTime: '19:30',
    hours: 3,
    reason: 'Hammadde sevkiyatı ve vardiya sonrası acil montaj desteği',
    status: 'pending',
    appliedAt: new Date(Date.now() - 3600000 * 5).toISOString(),
  },
];

export interface PDKSDatabase {
  version: number;
  lastUpdated: string;
  employees: Employee[];
  records: AttendanceRecord[];
  shifts: Shift[];
  leaves: LeaveRequest[];
  overtime: OvertimeRequest[];
  notifications: PDKSNotification[];
  companyWallQR: CompanyWallQRConfig;
  companyLogo: string;
  kioskLockPassword: string;
  supervisorAssignments: SupervisorAssignment[];
  accounts: UserAccount[];
  settings: NotificationSettings;
}

export function createInitialDatabase(): PDKSDatabase {
  return {
    version: 1,
    lastUpdated: new Date().toISOString(),
    employees: JSON.parse(JSON.stringify(DEFAULT_EMPLOYEES)),
    records: JSON.parse(JSON.stringify(DEFAULT_RECORDS)),
    shifts: JSON.parse(JSON.stringify(DEFAULT_SHIFTS)),
    leaves: JSON.parse(JSON.stringify(DEFAULT_LEAVES)),
    overtime: JSON.parse(JSON.stringify(DEFAULT_OVERTIME)),
    notifications: JSON.parse(JSON.stringify(DEFAULT_NOTIFICATIONS)),
    companyWallQR: JSON.parse(JSON.stringify(DEFAULT_COMPANY_WALL_QR)),
    companyLogo: DEFAULT_COMPANY_LOGO,
    kioskLockPassword: DEFAULT_KIOSK_LOCK_PASSWORD,
    supervisorAssignments: JSON.parse(JSON.stringify(DEFAULT_SUPERVISOR_ASSIGNMENTS)),
    accounts: JSON.parse(JSON.stringify(DEFAULT_ACCOUNTS)),
    settings: JSON.parse(JSON.stringify(DEFAULT_SETTINGS)),
  };
}
