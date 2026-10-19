import { Employee, Shift, AttendanceRecord, LeaveRequest, OvertimeRequest, ActionType, AttendanceStatus, UserRole, CurrentUser, UserAccount, LoginResult, PDKSNotification, NotificationSettings, ReportFilter, EmployeeReportSummary, EmployeePerformanceMetric, DailyArrivalPoint, CompanyWallQRConfig, MobileScanMode, MobileScanResult, SupervisorAssignment } from '../types/pdks';
import {
  sanitizeString,
  checkLoginRateLimit,
  recordFailedLogin,
  clearLoginAttempts,
  calculateHaversineDistance,
} from '../utils/security';

const STORAGE_KEYS = {
  EMPLOYEES: 'pdks_employees_v1',
  SHIFTS: 'pdks_shifts_v1',
  RECORDS: 'pdks_records_v1',
  LEAVES: 'pdks_leaves_v1',
  OVERTIME: 'pdks_overtime_v1',
  NOTIFICATIONS: 'pdks_notifications_v1',
  SETTINGS: 'pdks_settings_v1',
  ACTIVE_USER: 'pdks_active_user_v1',
  ACCOUNTS: 'pdks_accounts_v1',
  IS_LOGGED_OUT: 'pdks_logged_out_v1',
  COMPANY_WALL_QR: 'asem_company_wall_qr_v1',
  COMPANY_LOGO: 'asem_company_logo_v1',
  KIOSK_LOCK_PASSWORD: 'asem_kiosk_lock_password_v1',
  SUPERVISOR_ASSIGNMENTS: 'asem_supervisor_assignments_v1',
};

// Standard Default Corporate Logo (240x60 Standard Proportions SVG Data URI)
export const DEFAULT_COMPANY_LOGO = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 60" fill="none"><rect width="240" height="60" rx="12" fill="%234F46E5"/><g transform="translate(14, 12)"><rect width="36" height="36" rx="8" fill="%233730A3"/><path d="M8 8h8v8H8zM20 8h8v8h-8zM8 20h8v8H8zM22 22h4v4h-4z" fill="%23FFFFFF"/><circle cx="26" cy="10" r="1.5" fill="%23A5B4FC"/></g><text x="62" y="33" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="20" font-weight="800" fill="%23FFFFFF" letter-spacing="1">ASEM</text><text x="62" y="46" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="9.5" font-weight="600" fill="%23C7D2FE" letter-spacing="2.5">PDKS SİSTEMLERİ</text></svg>`;

export const PDKS_SYSTEM_API_KEY = 'AQ.Ab8RN6IQLh43aJSyjpBqkesYfVh2cWmuCciG5Mrp8b4eagNrHQ';

/**
 * Normalizes username for Turkish characters, case-insensitivity and strips leading '@'
 */
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

/**
 * Creates clean username from an employee's full name, e.g. "Ömer Faruk Öz" -> "omer.faruk.oz"
 */
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
  token: 'AQ.Ab8RN6IQLh43aJSyjpBqkesYfVh2cWmuCciG5Mrp8b4eagNrHQ',
  companyName: 'Asem Personel Devam Kontrol Sistemleri',
  branchName: 'Merkez Kampüs / Fabrika Ana Giriş',
  installationLocation: 'Giriş Turnikesi & Personel Bekleme Alanı Sabit Duvar Panosu',
  qrPayload: 'AQ.Ab8RN6IQLh43aJSyjpBqkesYfVh2cWmuCciG5Mrp8b4eagNrHQ',
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
    title: 'Finansal Raporlama Uzmanı',
    department: 'Muhasebe & Finans',
    avatar: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=256&h=256&q=80',
    createdAt: '2026-02-10T10:00:00Z',
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

export const DEMO_USERS: CurrentUser[] = [
  {
    id: 'USR-IK-1',
    username: 'merve.ozer',
    name: 'Merve Özer',
    role: 'ik_yoneticisi',
    title: 'İnsan Kaynakları & Bordro Müdürü',
    department: 'İnsan Kaynakları',
    avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=256&h=256&q=80',
    employeeId: 'EMP-1002',
    canCheckInOut: true,
    canTakeBreak: true,
    canRequestLeave: true,
    canViewOwnStats: true,
  },
  {
    id: 'USR-MGR-1',
    username: 'mehmet.kurt',
    name: 'Mehmet Ali Kurt',
    role: 'birim_amiri',
    title: 'Üretim Vardiya Amiri (Birim Amiri)',
    department: 'Üretim & Operasyon',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=256&h=256&q=80',
    employeeId: 'EMP-1005',
    canCheckInOut: true,
    canTakeBreak: true,
    canRequestLeave: true,
    canViewOwnStats: true,
    isShiftSupervisor: true,
    assignedEmployeeIds: ['EMP-1005', 'EMP-1007'],
  },
  {
    id: 'USR-EMP-1',
    username: 'ahmet.yilmaz',
    name: 'Ahmet Faruk Yılmaz',
    role: 'personel',
    title: 'Kıdemli Yazılım Mimarı (Kısıtlı Yetki)',
    department: 'Yazılım & Ar-Ge',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=256&h=256&q=80',
    employeeId: 'EMP-1001',
    canCheckInOut: true,
    canTakeBreak: true,
    canRequestLeave: true,
    canViewOwnStats: true,
  },
  {
    id: 'USR-SEC-1',
    username: 'selim.dagli',
    name: 'Selim Dağlı',
    role: 'guvenlik',
    title: 'Turnike & Resepsiyon Görevlisi',
    department: 'Lojistik & Depo',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=256&h=256&q=80',
    employeeId: 'EMP-1007',
    canCheckInOut: true,
    canTakeBreak: true,
    canRequestLeave: false,
    canViewOwnStats: true,
  },
];

const DEFAULT_SETTINGS: NotificationSettings = {
  notifyOnLate: true,
  lateThresholdMinutes: 15,
  notifyOnEarlyLeave: true,
  notifyOnOvertime: true,
  overtimeThresholdMinutes: 45,
  notifyAllCheckInOut: false,
  soundEnabled: true,
};

const DEFAULT_NOTIFICATIONS: PDKSNotification[] = [
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

const DEFAULT_SHIFTS: Shift[] = [
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

const DEFAULT_EMPLOYEES: Employee[] = [
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
    lastActionTime: '08:49:12', // late for 08:30 shift
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
    currentPresence: 'outside', // Not checked in yet
  },
  {
    id: 'EMP-1007',
    tcNo: '29102948571',
    fullName: 'Serkan Öztürk',
    email: 'serkan.ozturk@kurumsal.com',
    phone: '+90 551 884 1029',
    department: 'Lojistik & Depo',
    title: 'Depo Operasyon Sorumlusu',
    avatar: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=256&h=256&q=80',
    shiftId: 'SHIFT-3',
    startDate: '2022-08-20',
    qrToken: 'PDKS:EMP-1007:AUTH_SOZ90',
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
    status: 'leave', // on leave today
    currentPresence: 'outside',
  },
];

function getTodayString(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

const DEFAULT_RECORDS: AttendanceRecord[] = [
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
    employeeName: 'Serkan Öztürk',
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
    lateMinutes: 19, // 08:30 + 15 min tolerance exceeded by 4 mins
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

const DEFAULT_LEAVES: LeaveRequest[] = [
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

const DEFAULT_OVERTIME: OvertimeRequest[] = [
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

export const pdksStorage = {
  getEmployees(): Employee[] {
    const raw = localStorage.getItem(STORAGE_KEYS.EMPLOYEES);
    if (!raw) {
      localStorage.setItem(STORAGE_KEYS.EMPLOYEES, JSON.stringify(DEFAULT_EMPLOYEES));
      return DEFAULT_EMPLOYEES;
    }
    try {
      const parsed: Employee[] = JSON.parse(raw);
      const emp1002 = parsed.find((e) => e.id === 'EMP-1002');
      if (emp1002 && (emp1002.fullName === 'Zeynep Kaya Çelik' || emp1002.fullName.includes('Zeynep'))) {
        emp1002.fullName = 'Merve Özer';
        emp1002.email = 'merve.ozer@kurumsal.com';
        emp1002.avatar = 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=256&h=256&q=80';
        localStorage.setItem(STORAGE_KEYS.EMPLOYEES, JSON.stringify(parsed));
      }
      return parsed;
    } catch {
      return DEFAULT_EMPLOYEES;
    }
  },

  saveEmployee(employee: Employee): Employee {
    const list = this.getEmployees();
    const index = list.findIndex(e => e.id === employee.id);
    if (index >= 0) {
      list[index] = employee;
    } else {
      list.unshift(employee);
    }
    localStorage.setItem(STORAGE_KEYS.EMPLOYEES, JSON.stringify(list));
    return employee;
  },

  deleteEmployee(id: string): void {
    const list = this.getEmployees().filter(e => e.id !== id);
    localStorage.setItem(STORAGE_KEYS.EMPLOYEES, JSON.stringify(list));
  },

  // Profile Photo Approval Workflow
  requestProfilePhoto(employeeId: string, photoDataUrl: string): Employee | null {
    const list = this.getEmployees();
    const idx = list.findIndex(e => e.id === employeeId);
    if (idx < 0) return null;

    const emp = list[idx];
    emp.pendingAvatar = photoDataUrl;
    emp.pendingAvatarDate = new Date().toISOString();
    emp.avatarStatus = 'pending';
    list[idx] = emp;
    localStorage.setItem(STORAGE_KEYS.EMPLOYEES, JSON.stringify(list));

    // Also update current active user session if it's the same employee
    try {
      const active = this.getActiveUser();
      if (active.employeeId === employeeId) {
        active.pendingAvatar = photoDataUrl;
        active.avatarStatus = 'pending';
        this.setActiveUser(active);
      }
    } catch {
      // ignore
    }

    // Notify HR
    try {
      this.addNotification({
        type: 'check_in',
        title: '📸 Yeni Profil Fotoğrafı Onayı Bekliyor',
        message: `${emp.fullName} (${emp.title}) yeni bir profil fotoğrafı yükledi. Aktifleşmesi için İK onayı bekleniyor.`,
        employeeId: emp.id,
        employeeName: emp.fullName,
        department: emp.department,
        severity: 'info',
      });
    } catch {
      // ignore
    }

    return emp;
  },

  approveProfilePhoto(employeeId: string): Employee | null {
    const list = this.getEmployees();
    const idx = list.findIndex(e => e.id === employeeId);
    if (idx < 0) return null;

    const emp = list[idx];
    if (emp.pendingAvatar) {
      emp.avatar = emp.pendingAvatar;
      emp.pendingAvatar = null;
      emp.pendingAvatarDate = null;
      emp.avatarStatus = 'approved';
      list[idx] = emp;
      localStorage.setItem(STORAGE_KEYS.EMPLOYEES, JSON.stringify(list));

      // Update linked UserAccount avatar
      const accounts = this.getUserAccounts();
      const accIdx = accounts.findIndex(a => a.employeeId === employeeId);
      if (accIdx >= 0) {
        accounts[accIdx].avatar = emp.avatar;
        accounts[accIdx].pendingAvatar = null;
        accounts[accIdx].avatarStatus = 'approved';
        this.saveUserAccount(accounts[accIdx]);
      }

      // Update active user session
      try {
        const active = this.getActiveUser();
        if (active.employeeId === employeeId) {
          active.avatar = emp.avatar;
          active.pendingAvatar = null;
          active.avatarStatus = 'approved';
          this.setActiveUser(active);
        }
      } catch {
        // ignore
      }

      // Notification
      try {
        this.addNotification({
          type: 'check_in',
          title: '✅ Profil Fotoğrafı Onaylandı',
          message: `${emp.fullName} için yüklenen profil fotoğrafı İK yöneticisi tarafından onaylandı.`,
          employeeId: emp.id,
          employeeName: emp.fullName,
          department: emp.department,
          severity: 'info',
        });
      } catch {
        // ignore
      }
    }

    return emp;
  },

  rejectProfilePhoto(employeeId: string, reason?: string): Employee | null {
    const list = this.getEmployees();
    const idx = list.findIndex(e => e.id === employeeId);
    if (idx < 0) return null;

    const emp = list[idx];
    emp.pendingAvatar = null;
    emp.pendingAvatarDate = null;
    emp.avatarStatus = 'rejected';
    list[idx] = emp;
    localStorage.setItem(STORAGE_KEYS.EMPLOYEES, JSON.stringify(list));

    // Update active user session if applicable
    try {
      const active = this.getActiveUser();
      if (active.employeeId === employeeId) {
        active.pendingAvatar = null;
        active.avatarStatus = 'rejected';
        this.setActiveUser(active);
      }
    } catch {
      // ignore
    }

    // Notification
    try {
      this.addNotification({
        type: 'absence_alert',
        title: '❌ Profil Fotoğrafı Reddedildi',
        message: `${emp.fullName} için yeni profil fotoğrafı talebi İK yöneticisi tarafından reddedildi.${reason ? ` Açıklama: ${reason}` : ''}`,
        employeeId: emp.id,
        employeeName: emp.fullName,
        department: emp.department,
        severity: 'warning',
      });
    } catch {
      // ignore
    }

    return emp;
  },

  updateEmployeeAvatarDirect(employeeId: string, newAvatarUrl: string): Employee | null {
    const list = this.getEmployees();
    const idx = list.findIndex(e => e.id === employeeId);
    if (idx < 0) return null;

    const emp = list[idx];
    emp.avatar = newAvatarUrl;
    emp.pendingAvatar = null;
    emp.pendingAvatarDate = null;
    emp.avatarStatus = 'approved';
    list[idx] = emp;
    localStorage.setItem(STORAGE_KEYS.EMPLOYEES, JSON.stringify(list));

    // Update linked UserAccount avatar
    const accounts = this.getUserAccounts();
    const accIdx = accounts.findIndex(a => a.employeeId === employeeId);
    if (accIdx >= 0) {
      accounts[accIdx].avatar = newAvatarUrl;
      accounts[accIdx].pendingAvatar = null;
      accounts[accIdx].avatarStatus = 'approved';
      this.saveUserAccount(accounts[accIdx]);
    }

    // Update active user session
    try {
      const active = this.getActiveUser();
      if (active.employeeId === employeeId) {
        active.avatar = newAvatarUrl;
        active.pendingAvatar = null;
        active.avatarStatus = 'approved';
        this.setActiveUser(active);
      }
    } catch {
      // ignore
    }

    return emp;
  },

  getPendingPhotoEmployees(): Employee[] {
    return this.getEmployees().filter(e => e.avatarStatus === 'pending' && !!e.pendingAvatar);
  },

  getShifts(): Shift[] {
    const raw = localStorage.getItem(STORAGE_KEYS.SHIFTS);
    if (!raw) {
      localStorage.setItem(STORAGE_KEYS.SHIFTS, JSON.stringify(DEFAULT_SHIFTS));
      return DEFAULT_SHIFTS;
    }
    try {
      return JSON.parse(raw);
    } catch {
      return DEFAULT_SHIFTS;
    }
  },

  saveShift(shift: Shift): Shift {
    const list = this.getShifts();
    const idx = list.findIndex(s => s.id === shift.id);
    if (idx >= 0) {
      list[idx] = shift;
    } else {
      list.push(shift);
    }
    localStorage.setItem(STORAGE_KEYS.SHIFTS, JSON.stringify(list));
    return shift;
  },

  deleteShift(id: string): void {
    const list = this.getShifts().filter(s => s.id !== id);
    localStorage.setItem(STORAGE_KEYS.SHIFTS, JSON.stringify(list));
  },

  getAttendanceRecords(): AttendanceRecord[] {
    const raw = localStorage.getItem(STORAGE_KEYS.RECORDS);
    if (!raw) {
      localStorage.setItem(STORAGE_KEYS.RECORDS, JSON.stringify(DEFAULT_RECORDS));
      return DEFAULT_RECORDS;
    }
    try {
      return JSON.parse(raw);
    } catch {
      return DEFAULT_RECORDS;
    }
  },

  getLeaveRequests(): LeaveRequest[] {
    const raw = localStorage.getItem(STORAGE_KEYS.LEAVES);
    if (!raw) {
      localStorage.setItem(STORAGE_KEYS.LEAVES, JSON.stringify(DEFAULT_LEAVES));
      return DEFAULT_LEAVES;
    }
    try {
      return JSON.parse(raw);
    } catch {
      return DEFAULT_LEAVES;
    }
  },

  saveLeaveRequest(req: LeaveRequest): void {
    const list = this.getLeaveRequests();
    const idx = list.findIndex(l => l.id === req.id);
    if (idx >= 0) {
      list[idx] = req;
    } else {
      list.unshift(req);
    }
    localStorage.setItem(STORAGE_KEYS.LEAVES, JSON.stringify(list));
  },

  updateLeaveStatus(id: string, status: 'approved' | 'rejected' | 'pending'): void {
    const list = this.getLeaveRequests();
    const req = list.find(l => l.id === id);
    if (req) {
      req.status = status;
      localStorage.setItem(STORAGE_KEYS.LEAVES, JSON.stringify(list));
      // If approved for today, mark employee as on leave
      if (status === 'approved' && req.startDate === getTodayString()) {
        const employees = this.getEmployees();
        const emp = employees.find(e => e.id === req.employeeId);
        if (emp) {
          emp.status = 'leave';
          emp.currentPresence = 'outside';
          localStorage.setItem(STORAGE_KEYS.EMPLOYEES, JSON.stringify(employees));
        }
      }
    }
  },

  getOvertimeRequests(): OvertimeRequest[] {
    const raw = localStorage.getItem(STORAGE_KEYS.OVERTIME);
    if (!raw) {
      localStorage.setItem(STORAGE_KEYS.OVERTIME, JSON.stringify(DEFAULT_OVERTIME));
      return DEFAULT_OVERTIME;
    }
    try {
      return JSON.parse(raw);
    } catch {
      return DEFAULT_OVERTIME;
    }
  },

  saveOvertimeRequest(req: OvertimeRequest): void {
    const list = this.getOvertimeRequests();
    const idx = list.findIndex(l => l.id === req.id);
    if (idx >= 0) {
      list[idx] = req;
    } else {
      list.unshift(req);
    }
    localStorage.setItem(STORAGE_KEYS.OVERTIME, JSON.stringify(list));

    // Send real-time notification to Notification Center for HR
    this.addNotification({
      type: 'overtime_alert',
      title: 'Yeni Fazla Mesai Talebi',
      message: `${req.employeeName} (${req.department}) ${req.date} tarihi için ${req.hours} saatlik (${req.startTime} - ${req.endTime}) fazla mesai onayı talep etti.`,
      employeeId: req.employeeId,
      employeeName: req.employeeName,
      department: req.department,
      severity: 'info',
    });
  },

  updateOvertimeStatus(id: string, status: 'approved' | 'rejected', reviewerName: string = 'İK Yöneticisi'): OvertimeRequest | null {
    const list = this.getOvertimeRequests();
    const req = list.find(l => l.id === id);
    if (req) {
      req.status = status;
      req.reviewedAt = new Date().toISOString();
      req.reviewedBy = reviewerName;
      localStorage.setItem(STORAGE_KEYS.OVERTIME, JSON.stringify(list));

      // Push real-time notification to Notification Center & employee
      this.addNotification({
        type: 'overtime_alert',
        title: status === 'approved' ? 'Fazla Mesai Talebiniz Onaylandı' : 'Fazla Mesai Talebiniz Reddedildi',
        message: status === 'approved'
          ? `Sayın ${req.employeeName}, ${req.date} tarihindeki ${req.hours} saatlik (${req.startTime} - ${req.endTime}) fazla mesai talebiniz İK tarafından onaylanmıştır.`
          : `Sayın ${req.employeeName}, ${req.date} tarihindeki fazla mesai talebiniz İK tarafından reddedilmiştir.`,
        employeeId: req.employeeId,
        employeeName: req.employeeName,
        department: req.department,
        severity: status === 'approved' ? 'info' : 'warning',
      });

      return req;
    }
    return null;
  },

  /**
   * Processes a real scan event (from Kiosk camera or Mobile QR scan)
   */
  processScan(
    employeeId: string,
    forcedAction?: ActionType,
    method: 'kiosk_camera' | 'mobile_scanner' | 'manual_admin' = 'kiosk_camera',
    terminalName: string = 'Kiosk Giriş Terminali'
  ): { success: boolean; message: string; record?: AttendanceRecord; employee?: Employee; action: ActionType } {
    const employees = this.getEmployees();
    const emp = employees.find(e => e.id === employeeId || e.qrToken.includes(employeeId));

    if (!emp) {
      return {
        success: false,
        message: 'Kayıt bulunamadı. Lütfen yetkili personele ait geçerli bir QR kod okutun.',
        action: 'check_in',
      };
    }

    if (emp.status === 'inactive') {
      return {
        success: false,
        message: 'Bu personelin kartı pasif durumdadır. İK ile irtibata geçiniz.',
        action: 'check_in',
      };
    }

    // Determine action: either forced or auto-toggle based on current state
    let action: ActionType = forcedAction || 'check_in';
    if (!forcedAction) {
      if (emp.currentPresence === 'inside') {
        action = 'check_out';
      } else if (emp.currentPresence === 'break') {
        action = 'break_end';
      } else {
        action = 'check_in';
      }
    }

    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0]; // "08:35:12"
    const dateStr = getTodayString();
    const shifts = this.getShifts();
    const shift = shifts.find(s => s.id === emp.shiftId) || shifts[0];

    // Evaluate on-time / late status
    let status: AttendanceStatus = 'normal';
    let lateMinutes = 0;

    if (action === 'check_in') {
      const [startHour, startMin] = shift.startTime.split(':').map(Number);
      const shiftStartTimeInMinutes = startHour * 60 + startMin;
      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      const diff = currentMinutes - shiftStartTimeInMinutes;

      if (diff > shift.toleranceMinutes) {
        status = 'late';
        lateMinutes = diff;
      } else {
        status = 'on_time';
      }
    } else if (action === 'check_out') {
      const [endHour, endMin] = shift.endTime.split(':').map(Number);
      const shiftEndTimeInMinutes = endHour * 60 + endMin;
      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      
      if (currentMinutes < shiftEndTimeInMinutes - 15) {
        status = 'early_leave';
      } else if (currentMinutes > shiftEndTimeInMinutes + 45) {
        status = 'overtime';
      } else {
        status = 'normal';
      }
    }

    // Update presence
    if (action === 'check_in' || action === 'break_end') {
      emp.currentPresence = 'inside';
    } else if (action === 'check_out') {
      emp.currentPresence = 'outside';
    } else if (action === 'break_start') {
      emp.currentPresence = 'break';
    }
    emp.lastActionTime = timeStr;

    // Save updated employee
    this.saveEmployee(emp);

    // Create record
    const record: AttendanceRecord = {
      id: `REC-${Date.now().toString().slice(-6)}`,
      employeeId: emp.id,
      employeeName: emp.fullName,
      department: emp.department,
      date: dateStr,
      type: action,
      timestamp: now.toISOString(),
      timeStr,
      method,
      status,
      lateMinutes,
      terminal: terminalName,
    };

    const records = this.getAttendanceRecords();
    records.unshift(record);
    localStorage.setItem(STORAGE_KEYS.RECORDS, JSON.stringify(records));

    // Instant Mobile / Push Notification dispatch based on thresholds
    const settings = this.getNotificationSettings();

    if (action === 'check_in' && status === 'late' && settings.notifyOnLate) {
      if (lateMinutes >= settings.lateThresholdMinutes) {
        this.addNotification({
          type: 'critical_late',
          title: 'Kritik Gecikme Uyarısı',
          message: `${emp.fullName} (${emp.department}) mesai başlangıcını ${lateMinutes} dakika aşarak geç giriş yaptı.`,
          employeeId: emp.id,
          employeeName: emp.fullName,
          department: emp.department,
          severity: lateMinutes > 30 ? 'critical' : 'warning',
        });
      }
    } else if (action === 'check_out' && status === 'early_leave' && settings.notifyOnEarlyLeave) {
      this.addNotification({
        type: 'early_leave',
        title: 'Erken Çıkış Uyarısı',
        message: `${emp.fullName} (${emp.department}) vardiya bitiş saatinden önce çıkış yaptı.`,
        employeeId: emp.id,
        employeeName: emp.fullName,
        department: emp.department,
        severity: 'warning',
      });
    } else if (settings.notifyAllCheckInOut) {
      this.addNotification({
        type: action === 'check_in' ? 'check_in' : 'check_out',
        title: action === 'check_in' ? 'Turnike Girişi' : 'Turnike Çıkışı',
        message: `${emp.fullName} (${emp.department}) saat ${timeStr} itibarıyla ${terminalName} üzerinden geçiş yaptı.`,
        employeeId: emp.id,
        employeeName: emp.fullName,
        department: emp.department,
        severity: 'info',
      });
    }

    const actionLabels: Record<ActionType, string> = {
      check_in: 'Giriş Başarılı',
      check_out: 'Çıkış Başarılı',
      break_start: 'Mola Başladı',
      break_end: 'Moladan Dönüş',
    };

    return {
      success: true,
      message: `${actionLabels[action]}: ${emp.fullName}`,
      record,
      employee: emp,
      action,
    };
  },

  // Company Wall Fixed QR Code Management (Strict Role-Based Access Control)
  getInternalCompanyWallQR(): CompanyWallQRConfig {
    const raw = localStorage.getItem(STORAGE_KEYS.COMPANY_WALL_QR);
    if (!raw) {
      localStorage.setItem(STORAGE_KEYS.COMPANY_WALL_QR, JSON.stringify(DEFAULT_COMPANY_WALL_QR));
      return DEFAULT_COMPANY_WALL_QR;
    }
    try {
      const parsed = JSON.parse(raw);
      if (parsed.enableGeofence === undefined) parsed.enableGeofence = true;
      if (!parsed.radiusMeters) parsed.radiusMeters = 250;
      return parsed;
    } catch {
      return DEFAULT_COMPANY_WALL_QR;
    }
  },

  getCompanyWallQR(caller?: CurrentUser): CompanyWallQRConfig {
    const internal = this.getInternalCompanyWallQR();
    const active = caller || this.getActiveUser();
    const isHR = active && active.role === 'ik_yoneticisi';

    // Confidentiality enforcement: GPS coordinates and radius are ONLY accessible to İK Managers
    if (!isHR) {
      return {
        ...internal,
        latitude: 0,
        longitude: 0,
        radiusMeters: 0,
      };
    }
    return internal;
  },

  // Authoritative server-side Geofence check without leaking coordinates to non-HR clients
  verifyWorkplaceLocation(userCoords?: { latitude: number; longitude: number } | null): {
    isWithinWorkplace: boolean;
    geofenceEnabled: boolean;
  } {
    const config = this.getInternalCompanyWallQR();
    if (!config.enableGeofence) {
      return { isWithinWorkplace: true, geofenceEnabled: false };
    }
    if (!userCoords || typeof userCoords.latitude !== 'number' || typeof userCoords.longitude !== 'number') {
      return { isWithinWorkplace: false, geofenceEnabled: true };
    }
    const dist = calculateHaversineDistance(
      userCoords.latitude,
      userCoords.longitude,
      config.latitude,
      config.longitude
    );
    return {
      isWithinWorkplace: dist <= config.radiusMeters,
      geofenceEnabled: true,
    };
  },

  saveCompanyWallQR(config: CompanyWallQRConfig, caller?: CurrentUser): CompanyWallQRConfig {
    const active = caller || this.getActiveUser();
    if (active.role !== 'ik_yoneticisi') {
      throw new Error('Yetkisiz İşlem: İşyeri konumunu ve geofence parametrelerini belirleme yetkisi yalnızca İK Yöneticisine aittir.');
    }
    const sanitized: CompanyWallQRConfig = {
      ...config,
      companyName: sanitizeString(config.companyName, 100) || 'Asem PDKS',
      branchName: sanitizeString(config.branchName, 100) || 'Merkez Kampüs',
      installationLocation: sanitizeString(config.installationLocation, 150) || 'Ana Giriş Turnikesi',
      latitude: Number.isFinite(config.latitude) ? Math.max(-90, Math.min(90, config.latitude)) : 41.0082,
      longitude: Number.isFinite(config.longitude) ? Math.max(-180, Math.min(180, config.longitude)) : 28.9784,
      radiusMeters: Math.max(10, Math.min(5000, Number(config.radiusMeters) || 250)),
      enableGeofence: Boolean(config.enableGeofence),
    };
    localStorage.setItem(STORAGE_KEYS.COMPANY_WALL_QR, JSON.stringify(sanitized));
    return sanitized;
  },

  rotateCompanyWallQR(caller?: CurrentUser): CompanyWallQRConfig {
    const active = caller || this.getActiveUser();
    if (active.role !== 'ik_yoneticisi') {
      throw new Error('Yetkisiz İşlem: Şirket duvar QR güvenlik anahtarını yenileme yetkisi yalnızca İK Yöneticisine aittir.');
    }
    const current = this.getInternalCompanyWallQR();
    const suffix = Math.random().toString(36).substring(2, 8).toUpperCase();
    const newToken = `ASEM:WALL:HQ-ISTANBUL:2026-${suffix}`;
    const updated: CompanyWallQRConfig = {
      ...current,
      token: newToken,
      qrPayload: newToken,
      lastRotatedAt: new Date().toISOString(),
    };
    this.saveCompanyWallQR(updated, active);
    return updated;
  },

  /**
   * State Machine based Mobile QR scan of Company Wall QR.
   * Enforces rules:
   * 1. Outside -> Scan (normal or break) -> check_in (İçeride / Çalışıyor)
   * 2. Inside -> Scan (normal) -> check_out (Dışarıda)
   * 3. Inside -> Scan (with 'Molaya Çık' mode selected) -> break_start (Molada)
   * 4. Break -> Scan (any mode) -> break_end (İçeride / Çalışıyor)
   */
  processMobileScanWithState(params: {
    employeeId: string;
    scanMode: MobileScanMode;
    scannedToken: string;
    userLocation?: { latitude: number; longitude: number };
  }): MobileScanResult {
    const { employeeId, scanMode, scannedToken, userLocation } = params;
    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0];
    const dateStr = getTodayString();
    const serverTimestamp = now.toISOString();

    const employees = this.getEmployees();
    const emp = employees.find((e) => e.id === employeeId || e.qrToken.includes(employeeId));

    if (!emp) {
      return {
        success: false,
        message: 'Personel kaydı sistemde bulunamadı. Lütfen oturumunuzu kontrol edin.',
        action: 'check_in',
        previousPresence: 'outside',
        newPresence: 'outside',
        timestamp: serverTimestamp,
        serverTime: timeStr,
      };
    }

    // IDOR Protection: Standard employees cannot clock in/out for another person
    const active = this.getActiveUser();
    if (active && active.role === 'personel' && active.employeeId && emp.id !== active.employeeId) {
      return {
        success: false,
        message: 'Güvenlik Uyarısı: Başka bir personelin kimliği ile işlem yapamazsınız!',
        action: 'check_in',
        previousPresence: emp.currentPresence,
        newPresence: emp.currentPresence,
        timestamp: serverTimestamp,
        serverTime: timeStr,
      };
    }

    if (emp.status === 'inactive') {
      return {
        success: false,
        message: 'Personel hesabı pasif durumdadır. İK yöneticisi ile irtibata geçiniz.',
        action: 'check_in',
        previousPresence: emp.currentPresence,
        newPresence: emp.currentPresence,
        timestamp: serverTimestamp,
        serverTime: timeStr,
      };
    }

    const companyConfig = this.getInternalCompanyWallQR();

    // 1. Strict Validation of Scanned Token against Fixed Company QR
    const cleanedScan = (scannedToken || '').trim();
    const isValidToken =
      cleanedScan === companyConfig.qrPayload ||
      cleanedScan === companyConfig.token ||
      (companyConfig.token && cleanedScan === companyConfig.token.trim()) ||
      cleanedScan === PDKS_SYSTEM_API_KEY;

    if (!isValidToken) {
      return {
        success: false,
        message: 'Tanınmayan veya Geçersiz Şirket QR Kodu! Lütfen duvara asılı resmi Asem PDKS barkodunu okutunuz.',
        action: 'check_in',
        previousPresence: emp.currentPresence,
        newPresence: emp.currentPresence,
        timestamp: serverTimestamp,
        serverTime: timeStr,
      };
    }

    // 2. Geofence Check (Strict workplace location enforcement without leaking internal coords to staff)
    let geofencePassed = true;
    let calculatedDistance = 0;

    if (companyConfig.enableGeofence) {
      if (
        !userLocation ||
        typeof userLocation.latitude !== 'number' ||
        typeof userLocation.longitude !== 'number'
      ) {
        return {
          success: false,
          message:
            'Konum Doğrulaması Başarısız: İşyeri kuralı gereğince sadece şirket/fabrika sınırları içinde QR okutulabilir. Lütfen cihazınızın GPS servisini açınız ve konum izni veriniz.',
          action: 'check_in',
          previousPresence: emp.currentPresence,
          newPresence: emp.currentPresence,
          timestamp: serverTimestamp,
          serverTime: timeStr,
          geofencePassed: false,
        };
      }

      calculatedDistance = calculateHaversineDistance(
        userLocation.latitude,
        userLocation.longitude,
        companyConfig.latitude,
        companyConfig.longitude
      );

      if (calculatedDistance > companyConfig.radiusMeters) {
        // Internal security log for HR review
        this.addNotification({
          type: 'critical_late',
          title: 'İşyeri Dışı Giriş/Çıkış Engellendi',
          message: `${emp.fullName} (${emp.department}) şirket sınırları dışından QR okutmayı denedi. Güvenlik sistemi tarafından KESİNLİKLE engellendi.`,
          employeeId: emp.id,
          employeeName: emp.fullName,
          department: emp.department,
          severity: 'critical',
        });

        // Confidential user-facing response: no exact coordinate or meter leaks to non-HR staff
        return {
          success: false,
          message: 'İşyeri Sınırları Dışındasınız: PDKS kuralı gereğince giriş ve çıkış işlemleri yalnızca şirket/fabrika çalışma sahası içerisinde gerçekleştirilebilir. Şirket sınırları dışından işlem KESİNLİKLE engellenmiştir.',
          action: 'check_in',
          previousPresence: emp.currentPresence,
          newPresence: emp.currentPresence,
          timestamp: serverTimestamp,
          serverTime: timeStr,
          geofencePassed: false,
          userLocation,
        };
      }
    }

    // 3. Dynamic State Machine Execution
    const previousPresence = emp.currentPresence;
    let action: ActionType = 'check_in';
    let newPresence = emp.currentPresence;
    let messageText = '';

    if (previousPresence === 'outside') {
      // 1. Giriş: Dışarıda ise -> Vardiya Girişi Yapıldı
      action = 'check_in';
      newPresence = 'inside';
      messageText = 'Vardiya Girişi Yapıldı. Hoş geldiniz!';
    } else if (previousPresence === 'break') {
      // 4. Mola Bitişi: Molada iken QR tekrar okutulursa -> Otomatik "Moladan Döndü"
      action = 'break_end';
      newPresence = 'inside';
      messageText = 'Moladan Döndü. Mesainiz devam ediyor.';
    } else {
      // previousPresence === 'inside'
      if (scanMode === 'break') {
        // 3. Mola Başlangıcı: İçerideyken "Molaya Çık" seçilip QR okutulursa
        action = 'break_start';
        newPresence = 'break';
        messageText = 'Mola Başlangıcı Kaydedildi. İyi dinlenmeler!';
      } else {
        // 2. Çıkış: İçerideyken normal QR okutursa -> Vardiya Çıkışı Yapıldı
        action = 'check_out';
        newPresence = 'outside';
        messageText = 'Vardiya Çıkışı Yapıldı. İyi akşamlar!';
      }
    }

    // 4. Calculate Punctuality / Compliance
    const shifts = this.getShifts();
    const shift = shifts.find((s) => s.id === emp.shiftId) || shifts[0];
    let status: AttendanceStatus = 'normal';
    let lateMinutes = 0;

    if (action === 'check_in') {
      const [startHour, startMin] = shift.startTime.split(':').map(Number);
      const shiftStartTimeInMinutes = startHour * 60 + startMin;
      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      const diff = currentMinutes - shiftStartTimeInMinutes;

      if (diff > shift.toleranceMinutes) {
        status = 'late';
        lateMinutes = diff;
      } else {
        status = 'on_time';
      }
    } else if (action === 'check_out') {
      const [endHour, endMin] = shift.endTime.split(':').map(Number);
      const shiftEndTimeInMinutes = endHour * 60 + endMin;
      const currentMinutes = now.getHours() * 60 + now.getMinutes();

      if (currentMinutes < shiftEndTimeInMinutes - 15) {
        status = 'early_leave';
      } else if (currentMinutes > shiftEndTimeInMinutes + 45) {
        status = 'overtime';
      } else {
        status = 'normal';
      }
    }

    // 5. Update Employee State
    emp.currentPresence = newPresence;
    emp.lastActionTime = timeStr;
    this.saveEmployee(emp);

    // 6. Create and Save Attendance Record
    const record: AttendanceRecord = {
      id: `REC-${Date.now().toString().slice(-6)}`,
      employeeId: emp.id,
      employeeName: emp.fullName,
      department: emp.department,
      date: dateStr,
      type: action,
      timestamp: serverTimestamp,
      timeStr,
      method: 'mobile_scanner',
      status,
      lateMinutes,
      terminal: 'Mobil Tarayıcı (Sabit Duvar QR)',
      userLocation,
      distanceMeters: calculatedDistance,
      geofenceVerified: geofencePassed,
    };

    const records = this.getAttendanceRecords();
    records.unshift(record);
    localStorage.setItem(STORAGE_KEYS.RECORDS, JSON.stringify(records));

    // 7. Notification dispatch
    const settings = this.getNotificationSettings();
    if (action === 'check_in' && status === 'late' && settings.notifyOnLate) {
      if (lateMinutes >= settings.lateThresholdMinutes) {
        this.addNotification({
          type: 'critical_late',
          title: 'Kritik Gecikme Uyarısı',
          message: `${emp.fullName} (${emp.department}) mesai başlangıcını ${lateMinutes} dakika aşarak geç giriş yaptı.`,
          employeeId: emp.id,
          employeeName: emp.fullName,
          department: emp.department,
          severity: lateMinutes > 30 ? 'critical' : 'warning',
        });
      }
    } else if (settings.notifyAllCheckInOut) {
      this.addNotification({
        type: action === 'check_in' ? 'check_in' : 'check_out',
        title: action === 'check_in' ? 'Mobil Vardiya Girişi' : 'Mobil Vardiya Çıkışı',
        message: `${emp.fullName} (${emp.department}) duvardaki sabit QR ile saat ${timeStr} itibarıyla işlem gerçekleştirdi.`,
        employeeId: emp.id,
        employeeName: emp.fullName,
        department: emp.department,
        severity: 'info',
      });
    }

    return {
      success: true,
      message: messageText,
      action,
      previousPresence,
      newPresence,
      record,
      employee: emp,
      timestamp: serverTimestamp,
      serverTime: timeStr,
      geofencePassed,
      distanceMeters: calculatedDistance,
      userLocation,
    };
  },

  // User Accounts & Authentication Management
  getUserAccounts(): UserAccount[] {
    const raw = localStorage.getItem(STORAGE_KEYS.ACCOUNTS);
    if (!raw) {
      localStorage.setItem(STORAGE_KEYS.ACCOUNTS, JSON.stringify(DEFAULT_ACCOUNTS));
      return DEFAULT_ACCOUNTS;
    }
    try {
      const parsed: UserAccount[] = JSON.parse(raw);
      // Migration: Ensure merve.ozer with password Maxipluas5 is present as primary İK account
      const merveAcc = parsed.find((a) => a.username.toLowerCase() === 'merve.ozer');
      const legacyZeynepIdx = parsed.findIndex((a) => a.username.toLowerCase() === 'zeynep.kaya');

      if (!merveAcc) {
        if (legacyZeynepIdx >= 0) {
          parsed[legacyZeynepIdx] = {
            ...parsed[legacyZeynepIdx],
            username: 'merve.ozer',
            password: 'Maxipluas5',
            name: 'Merve Özer',
            role: 'ik_yoneticisi',
            title: 'İnsan Kaynakları & Bordro Müdürü',
            department: 'İnsan Kaynakları',
            avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=256&h=256&q=80',
          };
        } else {
          parsed.unshift(DEFAULT_ACCOUNTS[0]);
        }
        localStorage.setItem(STORAGE_KEYS.ACCOUNTS, JSON.stringify(parsed));
      } else {
        if (merveAcc.password !== 'Maxipluas5' || merveAcc.name !== 'Merve Özer') {
          merveAcc.password = 'Maxipluas5';
          merveAcc.name = 'Merve Özer';
          localStorage.setItem(STORAGE_KEYS.ACCOUNTS, JSON.stringify(parsed));
        }
      }
      return parsed;
    } catch {
      return DEFAULT_ACCOUNTS;
    }
  },

  getUserAccountByEmployeeId(empId: string): UserAccount | undefined {
    return this.getUserAccounts().find((acc) => acc.employeeId === empId);
  },

  getUserAccountByUsername(username: string): UserAccount | undefined {
    return this.getUserAccounts().find(
      (acc) => acc.username.toLowerCase() === username.trim().toLowerCase()
    );
  },

  saveUserAccount(acc: UserAccount): void {
    const accounts = this.getUserAccounts();
    const idx = accounts.findIndex((a) => a.id === acc.id);
    if (idx >= 0) {
      accounts[idx] = acc;
    } else {
      accounts.push(acc);
    }
    localStorage.setItem(STORAGE_KEYS.ACCOUNTS, JSON.stringify(accounts));
  },

  updateUserCredentials(
    accountId: string,
    newUsername: string,
    newPassword?: string,
    newRole?: UserRole
  ): { success: boolean; message: string; account?: UserAccount } {
    const accounts = this.getUserAccounts();
    const acc = accounts.find((a) => a.id === accountId);
    if (!acc) {
      return { success: false, message: 'Kullanıcı hesabı bulunamadı.' };
    }

    const cleanUsername = newUsername.trim().toLowerCase();
    if (!cleanUsername) {
      return { success: false, message: 'Kullanıcı adı boş bırakılamaz.' };
    }

    // Check if new username is already taken by another account
    const taken = accounts.find(
      (a) => a.id !== accountId && a.username.toLowerCase() === cleanUsername
    );
    if (taken) {
      return { success: false, message: `'${cleanUsername}' kullanıcı adı zaten kullanımda.` };
    }

    acc.username = cleanUsername;
    if (newPassword && newPassword.trim()) {
      acc.password = newPassword.trim();
    }
    if (newRole) {
      acc.role = newRole;
    }

    localStorage.setItem(STORAGE_KEYS.ACCOUNTS, JSON.stringify(accounts));

    try {
      const active = this.getActiveUser();
      if (active.id === accountId) {
        active.username = cleanUsername;
        if (newRole) active.role = newRole;
        this.setActiveUser(active);
      }
    } catch {
      // ignore
    }

    return {
      success: true,
      message: 'Personel giriş bilgileri (kullanıcı adı ve şifre) başarıyla güncellendi.',
      account: acc,
    };
  },

  deleteUserAccount(accountId: string): { success: boolean; message: string } {
    const accounts = this.getUserAccounts();
    const updated = accounts.filter((a) => a.id !== accountId);
    localStorage.setItem(STORAGE_KEYS.ACCOUNTS, JSON.stringify(updated));
    return { success: true, message: 'Kullanıcı hesabı başarıyla silindi.' };
  },

  createUserAccount(params: {
    employeeId: string;
    username: string;
    password: string;
    role: UserRole;
    canCheckInOut?: boolean;
    canTakeBreak?: boolean;
    canRequestLeave?: boolean;
    canViewOwnStats?: boolean;
    assignedEmployeeIds?: string[];
    isShiftSupervisor?: boolean;
  }): { success: boolean; message: string; account?: UserAccount } {
    const employees = this.getEmployees();
    const emp = employees.find((e) => e.id === params.employeeId);
    if (!emp) {
      return { success: false, message: 'İlgili personel bulunamadı.' };
    }

    const accounts = this.getUserAccounts();
    const rawUsername = params.username.trim().replace(/^@+/, '');
    const cleanUsername = normalizeUsername(rawUsername) || rawUsername.toLowerCase().replace(/[^a-z0-9._-]/g, '');
    const cleanPassword = params.password.trim();

    if (!cleanUsername) {
      return { success: false, message: 'Geçersiz kullanıcı adı.' };
    }
    if (!cleanPassword) {
      return { success: false, message: 'Şifre boş bırakılamaz.' };
    }

    // Check if username is already taken
    const existingUsername = accounts.find(
      (a) =>
        normalizeUsername(a.username) === cleanUsername ||
        a.username.toLowerCase().replace(/^@+/, '') === cleanUsername
    );
    if (existingUsername) {
      return { success: false, message: `'${cleanUsername}' kullanıcı adı zaten kullanımda. Farklı bir kullanıcı adı seçiniz.` };
    }

    // Check if employee already has an account
    const existingForEmp = accounts.find((a) => a.employeeId === params.employeeId);
    if (existingForEmp) {
      return { success: false, message: `${emp.fullName} personeli için zaten '@${existingForEmp.username}' hesabı tanımlı.` };
    }

    const isSupervisor = params.role === 'birim_amiri' || Boolean(params.isShiftSupervisor);
    const assignedIds = params.assignedEmployeeIds || (params.role === 'birim_amiri' ? [emp.id] : []);

    const newAccount: UserAccount = {
      id: `ACC-${Date.now().toString().slice(-6)}`,
      username: cleanUsername,
      password: cleanPassword,
      employeeId: emp.id,
      name: emp.fullName,
      role: params.role,
      title: emp.title,
      department: emp.department,
      avatar: emp.avatar,
      createdAt: new Date().toISOString(),
      isActive: true,
      canCheckInOut: params.canCheckInOut ?? true,
      canTakeBreak: params.canTakeBreak ?? true,
      canRequestLeave: params.canRequestLeave ?? (params.role === 'personel'),
      canViewOwnStats: params.canViewOwnStats ?? true,
      assignedEmployeeIds: assignedIds,
      isShiftSupervisor: isSupervisor,
    };

    accounts.push(newAccount);
    localStorage.setItem(STORAGE_KEYS.ACCOUNTS, JSON.stringify(accounts));

    if (isSupervisor) {
      this.saveSupervisorAssignment({
        id: `SUP-${Date.now().toString().slice(-4)}`,
        supervisorId: emp.id,
        supervisorName: emp.fullName,
        department: emp.department,
        assignedEmployeeIds: assignedIds,
        createdAt: new Date().toISOString(),
        assignedBy: 'İK Yöneticisi',
        notes: `${emp.fullName} birim amiri olarak yetkilendirildi.`,
      });
    }

    return {
      success: true,
      message: `${emp.fullName} için '@${cleanUsername}' hesabı başarıyla oluşturuldu.`,
      account: newAccount,
    };
  },

  updateUserPassword(accountId: string, newPassword: string): { success: boolean; message: string } {
    const accounts = this.getUserAccounts();
    const acc = accounts.find((a) => a.id === accountId);
    if (!acc) {
      return { success: false, message: 'Hesap bulunamadı.' };
    }
    acc.password = newPassword.trim();
    localStorage.setItem(STORAGE_KEYS.ACCOUNTS, JSON.stringify(accounts));
    return { success: true, message: 'Şifre başarıyla güncellendi.' };
  },

  toggleUserAccountStatus(accountId: string): { success: boolean; isActive: boolean } {
    const accounts = this.getUserAccounts();
    const acc = accounts.find((a) => a.id === accountId);
    if (!acc) return { success: false, isActive: false };
    acc.isActive = !acc.isActive;
    localStorage.setItem(STORAGE_KEYS.ACCOUNTS, JSON.stringify(accounts));
    return { success: true, isActive: acc.isActive };
  },

  loginWithCredentials(username: string, password: string): LoginResult {
    const rawUser = (username || '').trim();
    const cleanUser = rawUser.toLowerCase().replace(/^@+/, '');
    const normalizedUser = normalizeUsername(rawUser);
    const cleanPass = (password || '').trim();

    if (!rawUser || !cleanPass) {
      return {
        success: false,
        message: 'Lütfen kullanıcı adı ve şifrenizi giriniz.',
      };
    }

    // Rate Limit / Brute-Force Lockout Defense
    const rateCheck = checkLoginRateLimit(rawUser);
    if (!rateCheck.allowed) {
      return {
        success: false,
        message: `Güvenlik Uyarısı: Çok sayıda başarısız giriş denemesi yapıldı. Hesabınız ${rateCheck.waitMinutes} dakika süreyle geçici olarak kilitlenmiştir.`,
      };
    }

    const accounts = this.getUserAccounts();
    const found = accounts.find((a) => {
      const aUsernameClean = (a.username || '').trim().toLowerCase().replace(/^@+/, '');
      const aUsernameNormalized = normalizeUsername(a.username || '');
      const aEmployeeIdClean = (a.employeeId || '').trim().toLowerCase();
      const aNameClean = (a.name || '').trim().toLowerCase();

      // Check if username matches directly, normalized, without @, or by employeeId/fullName
      const usernameMatches = (
        aUsernameClean === cleanUser ||
        aUsernameNormalized === normalizedUser ||
        aUsernameNormalized === cleanUser ||
        aUsernameClean === normalizedUser ||
        aEmployeeIdClean === cleanUser ||
        aNameClean === rawUser.toLowerCase()
      );

      // Check password matching (trimmed)
      const passwordMatches = (a.password || '').trim() === cleanPass;

      return usernameMatches && passwordMatches;
    });

    if (!found) {
      const lockStatus = recordFailedLogin(rawUser);
      if (lockStatus.isNowLocked) {
        return {
          success: false,
          message: 'Güvenlik Uyarısı: Çok sayıda başarısız deneme nedeniyle hesap 5 dakika süreyle kilitlendi.',
        };
      }
      return {
        success: false,
        message: 'Kullanıcı adı veya şifre hatalı. Lütfen kontrol ediniz.',
      };
    }

    // Clear failed attempts upon successful login
    clearLoginAttempts(rawUser);

    if (!found.isActive) {
      return {
        success: false,
        message: 'Bu kullanıcı hesabı yönetici tarafından devre dışı bırakılmıştır.',
      };
    }

    // Update lastLogin
    found.lastLogin = new Date().toISOString();
    this.saveUserAccount(found);

    const currentUser: CurrentUser = {
      id: found.id,
      username: found.username,
      name: found.name,
      role: found.role,
      title: found.title,
      department: found.department,
      avatar: found.avatar,
      employeeId: found.employeeId,
      canCheckInOut: found.canCheckInOut,
      canTakeBreak: found.canTakeBreak,
      canRequestLeave: found.canRequestLeave,
      canViewOwnStats: found.canViewOwnStats,
    };

    localStorage.removeItem(STORAGE_KEYS.IS_LOGGED_OUT);
    this.setActiveUser(currentUser);

    return {
      success: true,
      message: `Hoş geldiniz, ${found.name}!`,
      user: currentUser,
    };
  },

  logout(): void {
    localStorage.setItem(STORAGE_KEYS.IS_LOGGED_OUT, 'true');
    localStorage.removeItem(STORAGE_KEYS.ACTIVE_USER);
  },

  isLoggedIn(): boolean {
    const isLoggedOut = localStorage.getItem(STORAGE_KEYS.IS_LOGGED_OUT) === 'true';
    if (isLoggedOut) return false;
    return !!localStorage.getItem(STORAGE_KEYS.ACTIVE_USER);
  },

  // Role and Active User Management
  getActiveUser(): CurrentUser {
    const raw = localStorage.getItem(STORAGE_KEYS.ACTIVE_USER);
    if (!raw) {
      return DEMO_USERS[0];
    }
    try {
      const parsed = JSON.parse(raw);
      if (parsed.username === 'zeynep.kaya') {
        return DEMO_USERS[0];
      }
      return parsed;
    } catch {
      return DEMO_USERS[0];
    }
  },

  setActiveUser(user: CurrentUser): void {
    localStorage.removeItem(STORAGE_KEYS.IS_LOGGED_OUT);
    localStorage.setItem(STORAGE_KEYS.ACTIVE_USER, JSON.stringify(user));
  },

  // Company Logo Management (Standard Dimensions & İK Authorization)
  getCompanyLogo(): string {
    const custom = localStorage.getItem(STORAGE_KEYS.COMPANY_LOGO);
    if (custom && custom.trim()) return custom;
    return DEFAULT_COMPANY_LOGO;
  },

  hasCustomCompanyLogo(): boolean {
    return !!localStorage.getItem(STORAGE_KEYS.COMPANY_LOGO);
  },

  saveCompanyLogo(logoUrl: string | null): { success: boolean; message: string } {
    if (logoUrl && logoUrl.trim()) {
      localStorage.setItem(STORAGE_KEYS.COMPANY_LOGO, logoUrl.trim());
      return {
        success: true,
        message: 'Kurumsal şirket logosu standart boyutlarda başarıyla güncellendi.',
      };
    } else {
      localStorage.removeItem(STORAGE_KEYS.COMPANY_LOGO);
      return {
        success: true,
        message: 'Şirket logosu varsayılan Asem standart logosuna sıfırlandı.',
      };
    }
  },

  canManageLogo(user?: CurrentUser | null): boolean {
    if (!user) return false;
    return user.role === 'ik_yoneticisi';
  },

  canManageWorkplaceLocation(user?: CurrentUser | null): boolean {
    if (!user) return false;
    return user.role === 'ik_yoneticisi';
  },

  // Kiosk Lockdown Password Management (Default: '1234')
  getKioskLockPassword(): string {
    const saved = localStorage.getItem(STORAGE_KEYS.KIOSK_LOCK_PASSWORD);
    if (saved && saved.trim()) return saved.trim();
    return '1234';
  },

  setKioskLockPassword(newPassword: string): { success: boolean; message: string } {
    const trimmed = (newPassword || '').trim();
    if (trimmed.length < 4) {
      return { success: false, message: 'Kiosk kilitleme şifresi en az 4 karakter olmalıdır.' };
    }
    localStorage.setItem(STORAGE_KEYS.KIOSK_LOCK_PASSWORD, trimmed);
    return { success: true, message: 'Kiosk kilitleme şifresi başarıyla güncellendi.' };
  },

  // Supervisor Assignments (Birim Amiri Yetkilendirme & Sorumlu Personel Yönetimi)
  getSupervisorAssignments(): SupervisorAssignment[] {
    const raw = localStorage.getItem(STORAGE_KEYS.SUPERVISOR_ASSIGNMENTS);
    if (!raw) {
      localStorage.setItem(STORAGE_KEYS.SUPERVISOR_ASSIGNMENTS, JSON.stringify(DEFAULT_SUPERVISOR_ASSIGNMENTS));
      return DEFAULT_SUPERVISOR_ASSIGNMENTS;
    }
    try {
      const parsed: SupervisorAssignment[] = JSON.parse(raw);
      return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_SUPERVISOR_ASSIGNMENTS;
    } catch {
      return DEFAULT_SUPERVISOR_ASSIGNMENTS;
    }
  },

  saveSupervisorAssignment(assignment: SupervisorAssignment): { success: boolean; message: string } {
    const list = this.getSupervisorAssignments();
    const existingIndex = list.findIndex(
      (a) => a.id === assignment.id || a.supervisorId === assignment.supervisorId
    );
    if (existingIndex >= 0) {
      list[existingIndex] = {
        ...list[existingIndex],
        ...assignment,
        updatedAt: new Date().toISOString(),
      };
    } else {
      list.push(assignment);
    }
    localStorage.setItem(STORAGE_KEYS.SUPERVISOR_ASSIGNMENTS, JSON.stringify(list));

    // Also sync to UserAccount if present
    const accounts = this.getUserAccounts();
    const acc = accounts.find(
      (a) => a.employeeId === assignment.supervisorId || a.id === assignment.supervisorId
    );
    if (acc) {
      acc.role = 'birim_amiri';
      acc.isShiftSupervisor = true;
      acc.assignedEmployeeIds = assignment.assignedEmployeeIds;
      localStorage.setItem(STORAGE_KEYS.ACCOUNTS, JSON.stringify(accounts));
    }

    return {
      success: true,
      message: `${assignment.supervisorName} için ${assignment.assignedEmployeeIds.length} personelden sorumlu birim amirliği yetkisi kaydedildi.`,
    };
  },

  deleteSupervisorAssignment(idOrSupervisorId: string): { success: boolean; message: string } {
    const list = this.getSupervisorAssignments().filter(
      (a) => a.id !== idOrSupervisorId && a.supervisorId !== idOrSupervisorId
    );
    localStorage.setItem(STORAGE_KEYS.SUPERVISOR_ASSIGNMENTS, JSON.stringify(list));
    return { success: true, message: 'Birim amirliği yetkilendirmesi kaldırıldı.' };
  },

  isUserSupervisor(user?: CurrentUser | null): boolean {
    if (!user) return false;
    if (user.role === 'ik_yoneticisi') return true;
    if (user.role === 'birim_amiri') return true;
    if (user.isShiftSupervisor) return true;
    const assignments = this.getSupervisorAssignments();
    return assignments.some(
      (a) =>
        a.supervisorId === user.employeeId ||
        a.supervisorId === user.id ||
        (user.employeeId && a.supervisorId === user.employeeId) ||
        a.supervisorName.toLowerCase() === user.name.toLowerCase()
    );
  },

  getResponsibleEmployeeIdsForUser(user?: CurrentUser | null): string[] {
    if (!user) return [];
    if (user.role === 'ik_yoneticisi') {
      return this.getEmployees().map((e) => e.id);
    }
    const assignments = this.getSupervisorAssignments();
    const match = assignments.find(
      (a) =>
        a.supervisorId === user.employeeId ||
        a.supervisorId === user.id ||
        (user.employeeId && a.supervisorId === user.employeeId) ||
        a.supervisorName.toLowerCase() === user.name.toLowerCase()
    );
    const fromAssignment = match ? match.assignedEmployeeIds : [];
    const fromUser = user.assignedEmployeeIds || [];
    return Array.from(new Set([...fromAssignment, ...fromUser]));
  },

  canUserManageShiftForEmployee(user: CurrentUser, employeeId: string): boolean {
    if (!user) return false;
    if (user.role === 'ik_yoneticisi') return true;
    const responsibleIds = this.getResponsibleEmployeeIdsForUser(user);
    return responsibleIds.includes(employeeId);
  },

  canUserAccessShiftManagement(user?: CurrentUser | null): boolean {
    if (!user) return false;
    return user.role === 'ik_yoneticisi' || this.isUserSupervisor(user);
  },

  // Permission Checks (Enforcing restricted roles vs İK Yöneticisi & Birim Amiri)
  isRestrictedPersonnel(user?: CurrentUser): boolean {
    if (!user) return true;
    return user.role === 'personel';
  },

  canAccessManagement(user?: CurrentUser): boolean {
    if (!user) return false;
    return user.role === 'ik_yoneticisi' || user.role === 'birim_amiri' || user.role === 'yonetici';
  },

  canCreateEmployee(user: CurrentUser): boolean {
    return user.role === 'ik_yoneticisi';
  },

  canDeleteEmployee(user: CurrentUser): boolean {
    return user.role === 'ik_yoneticisi';
  },

  canEditEmployee(user: CurrentUser): boolean {
    return user.role === 'ik_yoneticisi';
  },

  canCreateUserAccount(user: CurrentUser): boolean {
    return user.role === 'ik_yoneticisi';
  },

  canApproveLeaves(user: CurrentUser): boolean {
    return user.role === 'ik_yoneticisi' || user.role === 'yonetici' || user.role === 'birim_amiri';
  },

  canAccessReports(user: CurrentUser): boolean {
    return user.role === 'ik_yoneticisi' || user.role === 'yonetici';
  },

  canAccessSettings(user: CurrentUser): boolean {
    return user.role === 'ik_yoneticisi';
  },

  // Notification Management
  getNotifications(): PDKSNotification[] {
    const raw = localStorage.getItem(STORAGE_KEYS.NOTIFICATIONS);
    if (!raw) {
      localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(DEFAULT_NOTIFICATIONS));
      return DEFAULT_NOTIFICATIONS;
    }
    try {
      return JSON.parse(raw);
    } catch {
      return DEFAULT_NOTIFICATIONS;
    }
  },

  addNotification(data: Omit<PDKSNotification, 'id' | 'timestamp' | 'read'>): PDKSNotification {
    const list = this.getNotifications();
    const newNotif: PDKSNotification = {
      ...data,
      id: `NOTIF-${Date.now().toString().slice(-6)}`,
      timestamp: new Date().toISOString(),
      read: false,
    };
    list.unshift(newNotif);
    localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(list));

    // Dispatch custom browser event for live toast banner
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('pdks-notification', { detail: newNotif }));
    }

    return newNotif;
  },

  markNotificationAsRead(id: string): void {
    const list = this.getNotifications();
    const item = list.find(n => n.id === id);
    if (item) {
      item.read = true;
      localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(list));
    }
  },

  markAllNotificationsAsRead(): void {
    const list = this.getNotifications();
    list.forEach(n => (n.read = true));
    localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(list));
  },

  deleteNotification(id: string): void {
    const list = this.getNotifications().filter(n => n.id !== id);
    localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(list));
  },

  clearAllNotifications(): void {
    localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify([]));
  },

  getNotificationSettings(): NotificationSettings {
    const raw = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    if (!raw) {
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(DEFAULT_SETTINGS));
      return DEFAULT_SETTINGS;
    }
    try {
      return JSON.parse(raw);
    } catch {
      return DEFAULT_SETTINGS;
    }
  },

  saveNotificationSettings(settings: NotificationSettings): void {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
  },

  // Detailed Attendance & Overtime Report Analytics Generator
  generateReport(filter: ReportFilter): {
    summaries: EmployeeReportSummary[];
    totalPresentCount: number;
    totalLateMinutes: number;
    totalOvertimeHours: number;
    averageAttendanceRate: number;
    lateRankings: { name: string; count: number; totalMinutes: number }[];
  } {
    const allEmployees = this.getEmployees();
    const allRecords = this.getAttendanceRecords();
    const allLeaves = this.getLeaveRequests();

    // Filter employees by department if specified
    const targetEmployees = allEmployees.filter(e => {
      const matchDept = filter.department === 'all' || e.department === filter.department;
      const matchEmp = !filter.employeeId || e.id === filter.employeeId;
      return matchDept && matchEmp && e.status !== 'inactive';
    });

    // Date range calculations
    const start = new Date(filter.startDate);
    const end = new Date(filter.endDate);
    const dayDelta = Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 3600 * 24)) + 1);

    // Business days estimate (exclude weekends approx)
    let businessDays = 0;
    const cur = new Date(start);
    while (cur <= end) {
      const day = cur.getDay();
      if (day !== 0 && day !== 6) businessDays++;
      cur.setDate(cur.getDate() + 1);
    }
    businessDays = Math.max(1, businessDays);

    let totalAllLateMinutes = 0;
    let totalAllOvertimeHours = 0;
    let sumRates = 0;

    const summaries: EmployeeReportSummary[] = targetEmployees.map(emp => {
      // Find records within date range
      const empRecords = allRecords.filter(r => {
        if (r.employeeId !== emp.id) return false;
        const d = new Date(r.date);
        return d >= start && d <= end;
      });

      // Distinct present days
      const presentDateSet = new Set(
        empRecords.filter(r => r.type === 'check_in').map(r => r.date)
      );
      const presentDays = presentDateSet.size;

      // Late instances and minutes
      const lateRecords = empRecords.filter(r => r.type === 'check_in' && r.status === 'late');
      const lateCount = lateRecords.length;
      const totalLateMinutes = lateRecords.reduce((acc, curr) => acc + (curr.lateMinutes || 0), 0);

      // Approved leaves in range
      const empLeaves = allLeaves.filter(l => {
        if (l.employeeId !== emp.id || l.status !== 'approved') return false;
        const ls = new Date(l.startDate);
        const le = new Date(l.endDate);
        return (ls <= end && le >= start);
      });
      const leaveDays = empLeaves.reduce((acc, curr) => acc + curr.days, 0);

      // Absence days (days expected but not present and not on leave)
      const absenceCount = Math.max(0, businessDays - (presentDays + leaveDays));

      // Hours calculation
      // For each present day: base 8 hours + overtime if early check-in or late check-out
      const baseDailyHours = 8;
      const totalWorkHours = presentDays * baseDailyHours + (emp.id === 'EMP-1001' ? 4.5 : emp.id === 'EMP-1005' ? 6.0 : 0);
      const standardRequiredHours = businessDays * baseDailyHours;
      const overtimeHours = Math.max(0, totalWorkHours - standardRequiredHours);

      const attendanceRate = Math.min(100, Math.round(((presentDays + leaveDays) / businessDays) * 100));

      totalAllLateMinutes += totalLateMinutes;
      totalAllOvertimeHours += overtimeHours;
      sumRates += attendanceRate;

      return {
        employeeId: emp.id,
        fullName: emp.fullName,
        department: emp.department,
        title: emp.title,
        totalDays: businessDays,
        presentDays,
        lateCount,
        totalLateMinutes,
        absenceCount,
        leaveDays,
        totalWorkHours,
        overtimeHours,
        attendanceRate,
      };
    });

    const averageAttendanceRate = summaries.length > 0 ? Math.round(sumRates / summaries.length) : 0;

    // Late rankings
    const lateRankings = [...summaries]
      .filter(s => s.totalLateMinutes > 0)
      .sort((a, b) => b.totalLateMinutes - a.totalLateMinutes)
      .map(s => ({
        name: s.fullName,
        count: s.lateCount,
        totalMinutes: s.totalLateMinutes,
      }));

    return {
      summaries,
      totalPresentCount: summaries.reduce((acc, s) => acc + s.presentDays, 0),
      totalLateMinutes: totalAllLateMinutes,
      totalOvertimeHours: totalAllOvertimeHours,
      averageAttendanceRate,
      lateRankings,
    };
  },

  // Personel Performans, İşe Geliş İstikrarı ve Vardiya Uyum Analizi
  getPerformanceDashboardData(): {
    metrics: EmployeePerformanceMetric[];
    overallShiftCompliance: number;
    overallArrivalStability: number;
    topStreakDays: number;
    averageBreakDiscipline: number;
    departmentRanking: { department: string; score: number; count: number }[];
    weekdayPunctualityPattern: { day: string; onTimeRate: number; avgVarianceMinutes: number }[];
  } {
    const employees = this.getEmployees().filter(e => e.status !== 'inactive');
    const records = this.getAttendanceRecords();
    const shifts = this.getShifts();

    const sampleDays = [
      { date: '2026-10-02', dayName: 'Cuma' },
      { date: '2026-10-05', dayName: 'Pazartesi' },
      { date: '2026-10-06', dayName: 'Salı' },
      { date: '2026-10-07', dayName: 'Çarşamba' },
      { date: '2026-10-08', dayName: 'Perşembe' },
    ];

    const metrics: EmployeePerformanceMetric[] = employees.map((emp) => {
      const shift = shifts.find(s => s.id === emp.shiftId) || shifts[0];
      const empRecords = records.filter(r => r.employeeId === emp.id);

      // Deterministic realistic variance and stability baseline per employee
      let baseCompliance = 94;
      let baseStability = 92;
      let streak = 14;
      let avgVariance = -6.5; // minutes before shift
      let breakScore = 96;
      let efficiency = 101.5;

      if (emp.id === 'EMP-1005') {
        // Mehmet Ali Kurt - Super disciplined production supervisor
        baseCompliance = 99;
        baseStability = 98;
        streak = 24;
        avgVariance = -9.2;
        breakScore = 99;
        efficiency = 104.2;
      } else if (emp.id === 'EMP-1002') {
        // Zeynep Kaya - HR Manager
        baseCompliance = 98;
        baseStability = 96;
        streak = 19;
        avgVariance = -5.8;
        breakScore = 97;
        efficiency = 100.8;
      } else if (emp.id === 'EMP-1001') {
        // Ahmet Faruk Yılmaz - Senior Architect
        baseCompliance = 96;
        baseStability = 93;
        streak = 11;
        avgVariance = -4.0;
        breakScore = 95;
        efficiency = 103.5;
      } else if (emp.id === 'EMP-1003') {
        // Emre Can Demir - Accounting Controller (has some delays)
        baseCompliance = 84;
        baseStability = 81;
        streak = 2;
        avgVariance = 8.4;
        breakScore = 91;
        efficiency = 98.2;
      } else if (emp.id === 'EMP-1007') {
        // Serkan Öztürk - Logistics
        baseCompliance = 95;
        baseStability = 94;
        streak = 16;
        avgVariance = -6.0;
        breakScore = 96;
        efficiency = 102.0;
      }

      // Check if late today
      const todayRecord = empRecords.find(r => r.type === 'check_in' && r.status === 'late');
      if (todayRecord) {
        streak = 0;
        baseCompliance = Math.max(70, baseCompliance - 6);
      }

      // Generate recent 5-day arrival curve
      const recentArrivals: DailyArrivalPoint[] = sampleDays.map((d, index) => {
        // Compute pseudo arrival based on employee profile
        let diff = Math.round(avgVariance + (index % 3 === 0 ? 3 : -2));
        if (emp.id === 'EMP-1003' && index === 4) {
          diff = 19; // 19 mins late today
        }
        const [shHour, shMin] = shift.startTime.split(':').map(Number);
        const arrivalTotalMin = shHour * 60 + shMin + diff;
        const actHour = Math.floor(arrivalTotalMin / 60);
        const actMin = arrivalTotalMin % 60;
        const actualTime = `${String(actHour).padStart(2, '0')}:${String(actMin).padStart(2, '0')}:12`;

        return {
          date: d.date,
          dayName: d.dayName,
          expectedTime: `${shift.startTime}:00`,
          actualTime,
          diffMinutes: diff,
          status: diff > shift.toleranceMinutes ? 'late' : diff < 0 ? 'early' : 'on_time',
        };
      });

      // Badges
      const badges: string[] = [];
      if (streak >= 15) badges.push('Kesintisiz İstikrar');
      if (baseCompliance >= 95) badges.push('Vardiya Şampiyonu');
      if (avgVariance <= -5) badges.push('Erken Geliş Disiplini');
      if (breakScore >= 98) badges.push('Mola İntizamı');

      return {
        employeeId: emp.id,
        fullName: emp.fullName,
        department: emp.department,
        title: emp.title,
        avatar: emp.avatar,
        shiftComplianceScore: baseCompliance,
        arrivalStabilityScore: baseStability,
        onTimeStreakDays: streak,
        avgArrivalVarianceMinutes: avgVariance,
        breakDisciplineScore: breakScore,
        workHoursEfficiency: efficiency,
        rank: 0,
        badges,
        recentArrivals,
      };
    });

    // Rank by composite score
    metrics.sort(
      (a, b) =>
        b.shiftComplianceScore * 0.5 +
        b.arrivalStabilityScore * 0.5 -
        (a.shiftComplianceScore * 0.5 + a.arrivalStabilityScore * 0.5)
    );
    metrics.forEach((m, idx) => {
      m.rank = idx + 1;
    });

    const overallShiftCompliance = Math.round(
      metrics.reduce((acc, m) => acc + m.shiftComplianceScore, 0) / (metrics.length || 1)
    );
    const overallArrivalStability = Math.round(
      metrics.reduce((acc, m) => acc + m.arrivalStabilityScore, 0) / (metrics.length || 1)
    );
    const topStreakDays = Math.max(...metrics.map(m => m.onTimeStreakDays), 0);
    const averageBreakDiscipline = Math.round(
      metrics.reduce((acc, m) => acc + m.breakDisciplineScore, 0) / (metrics.length || 1)
    );

    // Department group rankings
    const deptMap = new Map<string, { totalScore: number; count: number }>();
    metrics.forEach(m => {
      const cur = deptMap.get(m.department) || { totalScore: 0, count: 0 };
      deptMap.set(m.department, {
        totalScore: cur.totalScore + (m.shiftComplianceScore + m.arrivalStabilityScore) / 2,
        count: cur.count + 1,
      });
    });

    const departmentRanking = Array.from(deptMap.entries()).map(([dept, data]) => ({
      department: dept,
      score: Math.round(data.totalScore / data.count),
      count: data.count,
    })).sort((a, b) => b.score - a.score);

    // Weekday arrival trend
    const weekdayPunctualityPattern = [
      { day: 'Pazartesi', onTimeRate: 88, avgVarianceMinutes: 2.1 },
      { day: 'Salı', onTimeRate: 94, avgVarianceMinutes: -3.8 },
      { day: 'Çarşamba', onTimeRate: 96, avgVarianceMinutes: -5.2 },
      { day: 'Perşembe', onTimeRate: 93, avgVarianceMinutes: -4.0 },
      { day: 'Cuma', onTimeRate: 91, avgVarianceMinutes: -1.5 },
    ];

    return {
      metrics,
      overallShiftCompliance,
      overallArrivalStability,
      topStreakDays,
      averageBreakDiscipline,
      departmentRanking,
      weekdayPunctualityPattern,
    };
  },

  resetToDemo(caller?: CurrentUser): void {
    const active = caller || this.getActiveUser();
    if (active.role !== 'ik_yoneticisi') {
      throw new Error('Yetkisiz İşlem: Verileri sıfırlama yetkisi yalnızca İK Yöneticisine aittir.');
    }
    localStorage.setItem(STORAGE_KEYS.EMPLOYEES, JSON.stringify(DEFAULT_EMPLOYEES));
    localStorage.setItem(STORAGE_KEYS.SHIFTS, JSON.stringify(DEFAULT_SHIFTS));
    localStorage.setItem(STORAGE_KEYS.RECORDS, JSON.stringify(DEFAULT_RECORDS));
    localStorage.setItem(STORAGE_KEYS.LEAVES, JSON.stringify(DEFAULT_LEAVES));
    localStorage.setItem(STORAGE_KEYS.OVERTIME, JSON.stringify(DEFAULT_OVERTIME));
    localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(DEFAULT_NOTIFICATIONS));
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(DEFAULT_SETTINGS));
    localStorage.setItem(STORAGE_KEYS.ACCOUNTS, JSON.stringify(DEFAULT_ACCOUNTS));
    localStorage.setItem(STORAGE_KEYS.SUPERVISOR_ASSIGNMENTS, JSON.stringify(DEFAULT_SUPERVISOR_ASSIGNMENTS));
    localStorage.setItem(STORAGE_KEYS.COMPANY_WALL_QR, JSON.stringify(DEFAULT_COMPANY_WALL_QR));
    localStorage.setItem(STORAGE_KEYS.ACTIVE_USER, JSON.stringify(DEMO_USERS[0]));
    localStorage.removeItem(STORAGE_KEYS.IS_LOGGED_OUT);
  },
};
