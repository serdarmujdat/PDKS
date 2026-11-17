import { Employee, Shift, AttendanceRecord, LeaveRequest, OvertimeRequest, ActionType, AttendanceStatus, PresenceStatus, UserRole, CurrentUser, UserAccount, LoginResult, PDKSNotification, NotificationSettings, ReportFilter, EmployeeReportSummary, EmployeePerformanceMetric, DailyArrivalPoint, CompanyWallQRConfig, MobileScanMode, MobileScanResult, SupervisorAssignment, ThemeId, DeviceIdentity, DeviceEntryApproval } from '../types/pdks';
import {
  sanitizeString,
  checkLoginRateLimit,
  recordFailedLogin,
  clearLoginAttempts,
  calculateHaversineDistance,
} from '../utils/security';
import {
  auth,
  COMPANY_LOGO_MAX_LENGTH,
  fetchCompanyLogoFromFirestore,
  subscribeCompanyLogoFromFirestore,
  saveCompanyLogoToFirestore,
  saveUserThemeToFirestore,
  fetchAllUserThemesFromFirestore,
} from '../firebase';
import { DEFAULT_THEME_ID, isValidThemeId, applyThemeToDocument } from '../themes/themes';

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
  DEVICE_IDENTITY: 'asem_device_identity_v1',
  DEVICE_APPROVALS: 'asem_device_approvals_v1',
};

const NEW_DEVICE_LOCK_DURATION_MS = 60 * 60 * 1000; // 1 saat

function detectClientDeviceMetadata(): { platform: string; browser: string } {
  if (typeof navigator === 'undefined') {
    return { platform: 'Sunucu', browser: 'Sistem' };
  }
  const ua = navigator.userAgent || '';
  let platform = 'Bilgisayar';
  if (/iPhone/i.test(ua)) platform = 'iPhone';
  else if (/iPad/i.test(ua)) platform = 'iPad';
  else if (/Android/i.test(ua)) platform = 'Android';
  else if (/Windows/i.test(ua)) platform = 'Windows';
  else if (/Mac OS X|Macintosh/i.test(ua)) platform = 'macOS';
  else if (/Linux/i.test(ua)) platform = 'Linux';

  let browser = 'Tarayıcı';
  if (/Edg\//i.test(ua)) browser = 'Edge';
  else if (/OPR\//i.test(ua) || /Opera/i.test(ua)) browser = 'Opera';
  else if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) browser = 'Chrome';
  else if (/Firefox\//i.test(ua)) browser = 'Firefox';
  else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) browser = 'Safari';

  return { platform, browser };
}

function fnv1a32(input: string, seed = 0x811c9dc5): number {
  let hash = seed >>> 0;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function getCanvasFingerprintSignal(): string {
  if (typeof document === 'undefined') return 'ssr';
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 220;
    canvas.height = 40;
    const ctx = canvas.getContext('2d');
    if (!ctx) return 'no-2d';
    ctx.textBaseline = 'top';
    ctx.font = '14px sans-serif';
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(4, 4, 80, 20);
    ctx.fillStyle = '#4f46e5';
    ctx.fillText('ASEM-PDKS-FP-2026', 8, 8);
    return canvas.toDataURL().slice(-48);
  } catch {
    return 'canvas-blocked';
  }
}

function computeDeviceFingerprintAndMac(seedSalt = ''): {
  fingerprint: string;
  macAddress: string;
  suggestedDeviceId: string;
} {
  const nav = typeof navigator !== 'undefined' ? navigator : null;
  const scr = typeof screen !== 'undefined' ? screen : null;
  let tz = 'UTC';
  try {
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {}

  const rawSignals = [
    nav?.userAgent || 'ua',
    nav?.platform || 'plat',
    nav?.language || 'tr',
    String(nav?.hardwareConcurrency || 4),
    String((nav as any)?.deviceMemory || 4),
    String(scr?.width || 1920),
    String(scr?.height || 1080),
    String(scr?.colorDepth || 24),
    tz,
    getCanvasFingerprintSignal(),
    seedSalt,
  ].join('|');

  const h1 = fnv1a32(rawSignals, 0x811c9dc5);
  const h2 = fnv1a32(`${rawSignals}|MAC_SALT`, 0x9e3779b9);

  // Format as locally administered unicast MAC address (02:XX:XX:XX:XX:XX)
  const b0 = (((h1 >>> 24) & 0xff) & 0xfe) | 0x02;
  const b1 = (h1 >>> 16) & 0xff;
  const b2 = (h1 >>> 8) & 0xff;
  const b3 = h1 & 0xff;
  const b4 = (h2 >>> 24) & 0xff;
  const b5 = (h2 >>> 16) & 0xff;
  const toHex2 = (n: number) => n.toString(16).padStart(2, '0').toUpperCase();
  const macAddress = [b0, b1, b2, b3, b4, b5].map(toHex2).join(':');

  const h1Hex = h1.toString(16).padStart(8, '0').toUpperCase();
  const h2Hex = h2.toString(16).padStart(8, '0').toUpperCase();

  return {
    fingerprint: `FP-${h1Hex}${h2Hex.slice(0, 4)}`,
    macAddress,
    suggestedDeviceId: `DEV-${h1Hex}`,
  };
}

function generateShortDeviceId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `DEV-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    }
  } catch {}
  const rnd = Math.random().toString(36).substring(2, 10).toUpperCase();
  return `DEV-${rnd}`;
}

function formatDateTimeTR(d: Date): string {
  try {
    return d.toLocaleString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return d.toISOString();
  }
}

// Standard Default Corporate Logo (240x60 Standard Proportions SVG Data URI)
export const DEFAULT_COMPANY_LOGO = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 60" fill="none"><rect width="240" height="60" rx="12" fill="%234F46E5"/><g transform="translate(14, 12)"><rect width="36" height="36" rx="8" fill="%233730A3"/><path d="M8 8h8v8H8zM20 8h8v8h-8zM8 20h8v8H8zM22 22h4v4h-4z" fill="%23FFFFFF"/><circle cx="26" cy="10" r="1.5" fill="%23A5B4FC"/></g><text x="62" y="33" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="20" font-weight="800" fill="%23FFFFFF" letter-spacing="1">ASEM</text><text x="62" y="46" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="9.5" font-weight="600" fill="%23C7D2FE" letter-spacing="2.5">PDKS SİSTEMLERİ</text></svg>`;

// In-memory cache for corporate logo so even if localStorage hits quota limits, current session stays synced with backend DB
let inMemoryCompanyLogo: string | null = null;
// Authoritative logo synced from Firebase Firestore across browsers & container restarts
let firestoreAuthoritativeLogo: string | null = null;
let lastWarmedCloudLogo: string | null = null;

export function normalizeCompanyLogoSrc(logo?: string | null): string {
  const trimmed = logo ? logo.trim() : '';
  if (!trimmed) return '';
  if (trimmed.startsWith('data:image/svg+xml;utf8,')) {
    return trimmed.replace(
      /&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9a-fA-F]+;)/g,
      '%26amp;'
    );
  }
  return trimmed;
}

export function hasCustomLogoValue(logo?: string | null): boolean {
  const trimmed = normalizeCompanyLogoSrc(logo);
  return Boolean(trimmed && !trimmed.startsWith('blob:') && trimmed !== DEFAULT_COMPANY_LOGO);
}

function applyCompanyLogoLocally(logoVal: string, persistLocal = true): void {
  const normalized = normalizeCompanyLogoSrc(logoVal);
  if (!normalized || normalized.startsWith('blob:')) return;
  inMemoryCompanyLogo = normalized;
  if (persistLocal && typeof localStorage !== 'undefined') {
    try {
      if (normalized === DEFAULT_COMPANY_LOGO) {
        localStorage.removeItem(STORAGE_KEYS.COMPANY_LOGO);
      } else {
        localStorage.setItem(STORAGE_KEYS.COMPANY_LOGO, normalized);
      }
    } catch {}
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('pdks-logo-updated', { detail: normalized }));
  }
}

async function warmServerLogoIfNeeded(cloudLogo: string): Promise<void> {
  if (typeof window === 'undefined' || typeof fetch !== 'function') return;
  const trimmed = cloudLogo.trim();
  if (!hasCustomLogoValue(trimmed) || lastWarmedCloudLogo === trimmed) return;
  try {
    const res = await fetch('/api/company/logo', { headers: { 'Cache-Control': 'no-cache' } });
    if (!res.ok) return;
    const data = await res.json().catch(() => null);
    const serverLogo = typeof data?.logo === 'string' ? data.logo.trim() : '';
    if (!hasCustomLogoValue(serverLogo)) {
      lastWarmedCloudLogo = trimmed;
      await fetch('/api/company/logo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logo: trimmed }),
      });
    } else {
      lastWarmedCloudLogo = serverLogo;
    }
  } catch {
    // Ignore transient warm-up failures
  }
}

export const PDKS_SYSTEM_API_KEY = 'evren_llm_40eYxYnsM-qzeV7OOaIMmVfYB9KTajRcYFr-5bwh_Ko';

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
  {
    id: 'USR-FIN-1',
    username: 'emre.demir',
    name: 'Emre Can Demir',
    role: 'personel',
    title: 'Finansal Kontrolör',
    department: 'Muhasebe & Finans',
    avatar: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=256&h=256&q=80',
    employeeId: 'EMP-1003',
    canCheckInOut: true,
    canTakeBreak: true,
    canRequestLeave: true,
    canViewOwnStats: true,
  },
  {
    id: 'USR-DEV-1',
    username: 'mujdat.tosun',
    name: 'Müjdat Tosun',
    role: 'personel',
    title: 'Kıdemli Yazılım Geliştirici',
    department: 'Yazılım & Ar-Ge',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=256&h=256&q=80',
    employeeId: 'EMP-1009',
    canCheckInOut: true,
    canTakeBreak: true,
    canRequestLeave: true,
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
    status: 'leave', // on leave today
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

export function getTodayString(): string {
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

// ==========================================
// REAL-TIME MULTI-DEVICE SYNC ENGINE
// ==========================================
let localDbVersion = 0;
let isSyncing = false;
let sseConnection: EventSource | null = null;
let pollTimer: any = null;

let lastSyncTimestamp = 0;
let lastFocusSyncTimestamp = 0;

export async function syncWithServer(force = false): Promise<boolean> {
  if (typeof window === 'undefined' || typeof fetch !== 'function') return false;
  
  const now = Date.now();
  // Throttle: don't allow sync calls faster than once every 2 seconds unless explicit force
  if (!force && (isSyncing || now - lastSyncTimestamp < 2000)) {
    return false;
  }
  
  isSyncing = true;
  lastSyncTimestamp = now;

  try {
    const url = `/api/db/sync?version=${force ? 0 : localDbVersion}`;
    const res = await fetch(url, { headers: { 'Cache-Control': 'no-cache' } });
    if (!res.ok) return false;
    const json = await res.json();

    if (json && json.success) {
      if (json.upToDate) {
        return true;
      }

      if (json.data) {
        const d = json.data;
        const newVersion = json.version || (localDbVersion + 1);
        
        // Only update storage and fire sync events if version actually changed
        if (newVersion !== localDbVersion || force) {
          localDbVersion = newVersion;
          try {
            localStorage.setItem('pdks_db_version_v1', String(localDbVersion));
          } catch {}

          // Safe non-destructive merge for employees
          if (Array.isArray(d.employees)) {
            try {
              const localRaw = localStorage.getItem(STORAGE_KEYS.EMPLOYEES);
              const localEmps: Employee[] = localRaw ? JSON.parse(localRaw) : [];
              const localEmpMap = new Map<string, Employee>();
              for (const le of localEmps) {
                if (le && le.id) localEmpMap.set(le.id, le);
              }
              const empMap = new Map<string, Employee>();
              for (const emp of d.employees) {
                if (emp && emp.id) {
                  const localMatch = localEmpMap.get(emp.id);
                  const mergedEmp: Employee = { ...emp };
                  if (localMatch) {
                    if (!mergedEmp.registeredDeviceId && localMatch.registeredDeviceId) {
                      mergedEmp.registeredDeviceId = localMatch.registeredDeviceId;
                      mergedEmp.registeredMacAddress = localMatch.registeredMacAddress;
                      mergedEmp.registeredDeviceFingerprint = localMatch.registeredDeviceFingerprint;
                      mergedEmp.registeredDeviceName = localMatch.registeredDeviceName;
                      mergedEmp.registeredDeviceAt = localMatch.registeredDeviceAt;
                    }
                    if (!mergedEmp.lastLoginDeviceId && localMatch.lastLoginDeviceId) {
                      mergedEmp.lastLoginDeviceId = localMatch.lastLoginDeviceId;
                      mergedEmp.lastLoginMacAddress = localMatch.lastLoginMacAddress;
                      mergedEmp.lastLoginDeviceName = localMatch.lastLoginDeviceName;
                      mergedEmp.lastLoginAt = localMatch.lastLoginAt;
                    }
                  }
                  empMap.set(emp.id, mergedEmp);
                }
              }
              let hasMissing = false;
              for (const le of localEmps) {
                if (le && le.id && !empMap.has(le.id)) {
                  empMap.set(le.id, le);
                  hasMissing = true;
                }
              }
              const mergedEmps = Array.from(empMap.values());
              localStorage.setItem(STORAGE_KEYS.EMPLOYEES, JSON.stringify(mergedEmps));
              if (hasMissing) pushToServer('employees', mergedEmps);
            } catch {}
          }

          if (Array.isArray(d.records)) {
            const clientToday = getTodayString();
            const isOnlyDemoSeed =
              d.records.length > 0 &&
              d.records.length <= 7 &&
              d.records.every((r: AttendanceRecord) => r && /^REC-00[1-7]$/.test(r.id));
            const normalizedRecords = isOnlyDemoSeed
              ? d.records.map((r: AttendanceRecord) => ({
                  ...r,
                  date: clientToday,
                  timestamp: `${clientToday}T${r.timeStr || '08:30:00'}`,
                }))
              : d.records;
            try { localStorage.setItem(STORAGE_KEYS.RECORDS, JSON.stringify(normalizedRecords)); } catch {}
          }
          if (Array.isArray(d.shifts)) {
            try { localStorage.setItem(STORAGE_KEYS.SHIFTS, JSON.stringify(d.shifts)); } catch {}
          }
          if (Array.isArray(d.leaves)) {
            try { localStorage.setItem(STORAGE_KEYS.LEAVES, JSON.stringify(d.leaves)); } catch {}
          }
          if (Array.isArray(d.overtime)) {
            try { localStorage.setItem(STORAGE_KEYS.OVERTIME, JSON.stringify(d.overtime)); } catch {}
          }
          if (Array.isArray(d.notifications)) {
            try { localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(d.notifications)); } catch {}
          }

          // Wall QR update with immediate event dispatch
          if (d.companyWallQR) {
            try {
              localStorage.setItem(STORAGE_KEYS.COMPANY_WALL_QR, JSON.stringify(d.companyWallQR));
              window.dispatchEvent(new CustomEvent('pdks-wall-qr-updated', { detail: d.companyWallQR }));
            } catch {}
          }

          // Logo persistence: never allow a restarted container's DEFAULT_COMPANY_LOGO to overwrite an active custom/cloud logo
          if (typeof d.companyLogo === 'string' && d.companyLogo.trim() && !d.companyLogo.trim().startsWith('blob:')) {
            const logoVal = d.companyLogo.trim();
            if (firestoreAuthoritativeLogo !== null) {
              // Firestore is authoritative across browsers & restarts; keep it and warm server if needed
              if (hasCustomLogoValue(firestoreAuthoritativeLogo) && !hasCustomLogoValue(logoVal)) {
                void warmServerLogoIfNeeded(firestoreAuthoritativeLogo);
              }
            } else {
              const currentLocal = pdksStorage.getCompanyLogo();
              if (!hasCustomLogoValue(logoVal) && hasCustomLogoValue(currentLocal)) {
                // Server may have freshly restarted with default logo while client already holds a custom logo
                void warmServerLogoIfNeeded(currentLocal);
              } else {
                applyCompanyLogoLocally(logoVal, true);
              }
            }
          }

          if (typeof d.kioskLockPassword === 'string') {
            try { localStorage.setItem(STORAGE_KEYS.KIOSK_LOCK_PASSWORD, d.kioskLockPassword); } catch {}
          }
          if (Array.isArray(d.supervisorAssignments)) {
            try { localStorage.setItem(STORAGE_KEYS.SUPERVISOR_ASSIGNMENTS, JSON.stringify(d.supervisorAssignments)); } catch {}
          }

          if (Array.isArray(d.deviceApprovals)) {
            try {
              const localRaw = localStorage.getItem(STORAGE_KEYS.DEVICE_APPROVALS);
              const localApprovals: DeviceEntryApproval[] = localRaw ? JSON.parse(localRaw) : [];
              const mergedMap = new Map<string, DeviceEntryApproval>();
              for (const item of d.deviceApprovals) {
                if (item && item.id) mergedMap.set(item.id, item);
              }
              let hasLocalExtra = false;
              for (const la of localApprovals) {
                if (!la || !la.id) continue;
                const existing = mergedMap.get(la.id);
                if (!existing) {
                  mergedMap.set(la.id, la);
                  hasLocalExtra = true;
                } else {
                  const localResolved = existing.status === 'pending' && la.status !== 'pending';
                  const localNewerReq =
                    existing.status === 'pending' &&
                    la.status === 'check_in_requested';
                  if (localResolved || localNewerReq) {
                    mergedMap.set(la.id, la);
                    hasLocalExtra = true;
                  }
                }
              }
              const mergedList = Array.from(mergedMap.values()).sort(
                (a, b) => Date.parse(b.loginAt) - Date.parse(a.loginAt)
              );
              localStorage.setItem(STORAGE_KEYS.DEVICE_APPROVALS, JSON.stringify(mergedList));
              if (hasLocalExtra) pushToServer('deviceApprovals', mergedList);
            } catch {}
          }

          // Safe non-destructive merge for accounts (prevents new accounts from ever being deleted on other devices)
          if (Array.isArray(d.accounts)) {
            try {
              const localRaw = localStorage.getItem(STORAGE_KEYS.ACCOUNTS);
              const localAccounts: UserAccount[] = localRaw ? JSON.parse(localRaw) : [];
              const localMap = new Map<string, UserAccount>();
              for (const la of localAccounts) {
                if (la && la.id) localMap.set(la.id, la);
              }
              const accountMap = new Map<string, UserAccount>();
              for (const acc of d.accounts) {
                if (acc && acc.id) {
                  const localMatch = localMap.get(acc.id);
                  const mergedAcc: UserAccount = { ...acc };
                  if (localMatch) {
                    if (isValidThemeId(localMatch.themeId)) {
                      const localTime = localMatch.themeUpdatedAt ? Date.parse(localMatch.themeUpdatedAt) : 0;
                      const srvTime = acc.themeUpdatedAt ? Date.parse(acc.themeUpdatedAt) : 0;
                      if (!isValidThemeId(acc.themeId) || localTime > srvTime) {
                        mergedAcc.themeId = localMatch.themeId;
                        mergedAcc.themeUpdatedAt = localMatch.themeUpdatedAt;
                      }
                    }
                    // Preserve registered device binding if local holds a newer or missing-on-server device registration
                    if (!mergedAcc.registeredDeviceId && localMatch.registeredDeviceId) {
                      mergedAcc.registeredDeviceId = localMatch.registeredDeviceId;
                      mergedAcc.registeredMacAddress = localMatch.registeredMacAddress;
                      mergedAcc.registeredDeviceFingerprint = localMatch.registeredDeviceFingerprint;
                      mergedAcc.registeredDeviceName = localMatch.registeredDeviceName;
                      mergedAcc.registeredDeviceAt = localMatch.registeredDeviceAt;
                    }
                    if (!mergedAcc.lastLoginDeviceId && localMatch.lastLoginDeviceId) {
                      mergedAcc.lastLoginDeviceId = localMatch.lastLoginDeviceId;
                      mergedAcc.lastLoginMacAddress = localMatch.lastLoginMacAddress;
                      mergedAcc.lastLoginDeviceFingerprint = localMatch.lastLoginDeviceFingerprint;
                      mergedAcc.lastLoginDeviceName = localMatch.lastLoginDeviceName;
                    }
                  }
                  accountMap.set(acc.id, mergedAcc);
                }
              }
              let hasMissing = false;
              for (const la of localAccounts) {
                if (la && la.id && !accountMap.has(la.id)) {
                  accountMap.set(la.id, la);
                  hasMissing = true;
                }
              }
              const mergedAccounts = Array.from(accountMap.values());
              localStorage.setItem(STORAGE_KEYS.ACCOUNTS, JSON.stringify(mergedAccounts));

              // Keep active user's theme & device state aligned if updated from another device/session
              if (localStorage.getItem(STORAGE_KEYS.IS_LOGGED_OUT) !== 'true') {
                const activeRaw = localStorage.getItem(STORAGE_KEYS.ACTIVE_USER);
                if (activeRaw) {
                  try {
                    const activeParsed: CurrentUser = JSON.parse(activeRaw);
                    const matchedAcc = mergedAccounts.find(
                      (a) =>
                        a.id === activeParsed.id ||
                        normalizeUsername(a.username) === normalizeUsername(activeParsed.username)
                    );
                    if (matchedAcc) {
                      let activeChanged = false;
                      if (
                        matchedAcc.registeredDeviceId !== activeParsed.registeredDeviceId ||
                        matchedAcc.registeredMacAddress !== activeParsed.registeredMacAddress ||
                        matchedAcc.lastLoginDeviceId !== activeParsed.lastLoginDeviceId ||
                        matchedAcc.lastLoginMacAddress !== activeParsed.lastLoginMacAddress
                      ) {
                        activeParsed.registeredDeviceId = matchedAcc.registeredDeviceId;
                        activeParsed.registeredMacAddress = matchedAcc.registeredMacAddress;
                        activeParsed.registeredDeviceFingerprint = matchedAcc.registeredDeviceFingerprint;
                        activeParsed.registeredDeviceName = matchedAcc.registeredDeviceName;
                        activeParsed.registeredDeviceAt = matchedAcc.registeredDeviceAt;
                        activeParsed.lastLoginDeviceId = matchedAcc.lastLoginDeviceId;
                        activeParsed.lastLoginMacAddress = matchedAcc.lastLoginMacAddress;
                        activeParsed.lastLoginDeviceFingerprint = matchedAcc.lastLoginDeviceFingerprint;
                        activeParsed.lastLoginDeviceName = matchedAcc.lastLoginDeviceName;
                        activeChanged = true;
                      }
                      if (isValidThemeId(matchedAcc.themeId) && activeParsed.themeId !== matchedAcc.themeId) {
                        activeParsed.themeId = matchedAcc.themeId;
                        activeParsed.themeUpdatedAt = matchedAcc.themeUpdatedAt;
                        applyThemeToDocument(matchedAcc.themeId);
                        window.dispatchEvent(new CustomEvent('pdks-theme-updated', { detail: matchedAcc.themeId }));
                        activeChanged = true;
                      }
                      if (activeChanged) {
                        localStorage.setItem(STORAGE_KEYS.ACTIVE_USER, JSON.stringify(activeParsed));
                      }
                    }
                  } catch {}
                }
              }

              if (hasMissing) pushToServer('accounts', mergedAccounts);
            } catch {}
          }

          window.dispatchEvent(new CustomEvent('pdks-data-synced', { detail: { version: localDbVersion } }));
        }
        return true;
      }
    }
  } catch (err) {
    // Network offline / fallback quietly
  } finally {
    isSyncing = false;
  }
  return false;
}

export async function pushToServer(collection: string, data: any): Promise<void> {
  if (typeof window === 'undefined' || typeof fetch !== 'function') return;
  try {
    const res = await fetch('/api/db/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ collection, data }),
    });
    if (res.ok) {
      const json = await res.json();
      if (json && typeof json.version === 'number') {
        localDbVersion = json.version;
        try { localStorage.setItem('pdks_db_version_v1', String(localDbVersion)); } catch {}
      }
    }
  } catch (err) {
    console.warn(`Failed to push ${collection} to server:`, err);
  }
}

export async function pushBatchToServer(updates: Record<string, any>): Promise<void> {
  if (typeof window === 'undefined' || typeof fetch !== 'function') return;
  try {
    const res = await fetch('/api/db/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updates }),
    });
    if (res.ok) {
      const json = await res.json();
      if (json && typeof json.version === 'number') {
        localDbVersion = json.version;
        try { localStorage.setItem('pdks_db_version_v1', String(localDbVersion)); } catch {}
      }
    }
  } catch (err) {
    console.warn('Failed to batch push to server:', err);
  }
}

function setupLiveSync() {
  if (typeof window === 'undefined') return;

  try {
    const savedVer = localStorage.getItem('pdks_db_version_v1');
    if (savedVer) {
      localDbVersion = Number(savedVer) || 0;
    }
  } catch {
    // ignore
  }

  // Initial immediate fetch from server
  syncWithServer(true);

  // Setup Server-Sent Events (SSE) for zero-latency instant updates across all browsers
  if (typeof EventSource !== 'undefined') {
    try {
      if (sseConnection) sseConnection.close();
      sseConnection = new EventSource('/api/events');
      sseConnection.onmessage = (e) => {
        try {
          const payload = JSON.parse(e.data);
          if (payload.type === 'pdks-update' && payload.version > localDbVersion) {
            syncWithServer(false);
          }
        } catch {
          // ignore parse error
        }
      };
      sseConnection.onerror = () => {
        // SSE disconnected, fallback polling handles it
      };
    } catch {
      // ignore
    }
  }

  // Fallback Polling every 6 seconds to guarantee synchronization
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(() => {
    syncWithServer(false);
  }, 6000);

  // Throttled re-sync on window focus or visibility change (min 8 seconds between focus syncs)
  const handleFocusOrVisible = () => {
    const now = Date.now();
    if (now - lastFocusSyncTimestamp > 8000) {
      lastFocusSyncTimestamp = now;
      syncWithServer(false);
    }
  };

  window.addEventListener('focus', handleFocusOrVisible);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      handleFocusOrVisible();
    }
  });
}

// Automatically initiate live sync in browser
if (typeof window !== 'undefined') {
  setupLiveSync();
}

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
    pushToServer('employees', list);
    window.dispatchEvent(new CustomEvent('pdks-data-synced'));
    return employee;
  },

  updateEmployeePresenceManual(
    employeeId: string,
    newPresence: PresenceStatus,
    options?: {
      timeStr?: string;
      note?: string;
      recordAttendance?: boolean;
      actorName?: string;
    }
  ): { success: boolean; message: string; employee?: Employee; record?: AttendanceRecord } {
    const list = this.getEmployees();
    const idx = list.findIndex(e => e.id === employeeId);
    if (idx < 0) {
      return { success: false, message: 'Personel bulunamadı.' };
    }

    const emp = { ...list[idx] };
    const previousPresence = emp.currentPresence;
    const now = new Date();
    const rawTime = (options?.timeStr || '').trim();
    const normalizedTime = rawTime
      ? (rawTime.length === 5 ? `${rawTime}:00` : rawTime)
      : now.toTimeString().split(' ')[0];
    const dateStr = getTodayString();

    emp.currentPresence = newPresence;
    emp.lastActionTime = normalizedTime;
    list[idx] = emp;
    localStorage.setItem(STORAGE_KEYS.EMPLOYEES, JSON.stringify(list));

    let createdRecord: AttendanceRecord | undefined;
    const shouldRecord = options?.recordAttendance !== false;

    if (shouldRecord) {
      const action: ActionType =
        newPresence === 'break'
          ? 'break_start'
          : newPresence === 'outside'
          ? 'check_out'
          : previousPresence === 'break'
          ? 'break_end'
          : 'check_in';

      const shifts = this.getShifts();
      const shift = shifts.find(s => s.id === emp.shiftId) || shifts[0];
      let status: AttendanceStatus = 'normal';
      let lateMinutes = 0;

      const [hh, mm] = normalizedTime.split(':').map(Number);
      const currentMinutes =
        (isNaN(hh) ? now.getHours() : hh) * 60 + (isNaN(mm) ? now.getMinutes() : mm);

      if (action === 'check_in' && shift) {
        const [startHour, startMin] = shift.startTime.split(':').map(Number);
        const shiftStartMins = startHour * 60 + startMin;
        const diff = currentMinutes - shiftStartMins;
        if (diff > shift.toleranceMinutes) {
          status = 'late';
          lateMinutes = diff;
        } else {
          status = 'on_time';
        }
      } else if (action === 'check_out' && shift) {
        const [endHour, endMin] = shift.endTime.split(':').map(Number);
        const shiftEndMins = endHour * 60 + endMin;
        if (currentMinutes < shiftEndMins - 15) {
          status = 'early_leave';
        } else if (currentMinutes > shiftEndMins + 45) {
          status = 'overtime';
        }
      }

      const [yr, mo, dy] = dateStr.split('-').map(Number);
      const recordTimestamp = new Date(
        yr || now.getFullYear(),
        (mo || now.getMonth() + 1) - 1,
        dy || now.getDate(),
        isNaN(hh) ? now.getHours() : hh,
        isNaN(mm) ? now.getMinutes() : mm,
        0
      ).toISOString();

      createdRecord = {
        id: `MAN-${Date.now().toString().slice(-6)}`,
        employeeId: emp.id,
        employeeName: emp.fullName,
        department: emp.department,
        date: dateStr,
        type: action,
        timestamp: recordTimestamp,
        timeStr: normalizedTime,
        method: 'manual_admin',
        status,
        lateMinutes,
        note: options?.note?.trim() || 'Kart basmayı unuttu — İK manuel durum düzenlemesi',
        terminal: options?.actorName ? `İK Manuel (${options.actorName})` : 'İK Manuel Düzenleme',
      };

      const records = this.getAttendanceRecords();
      records.unshift(createdRecord);
      localStorage.setItem(STORAGE_KEYS.RECORDS, JSON.stringify(records));

      pushBatchToServer({
        employees: list,
        records,
      });
    } else {
      pushToServer('employees', list);
    }

    window.dispatchEvent(new CustomEvent('pdks-data-synced'));

    const presenceLabel =
      newPresence === 'inside'
        ? 'Ofiste (İçeride)'
        : newPresence === 'break'
        ? 'Molada'
        : 'Ofis Dışında';

    return {
      success: true,
      message: `${emp.fullName} durumu "${presenceLabel}" olarak güncellendi.`,
      employee: emp,
      record: createdRecord,
    };
  },

  saveEmployeesAndAccountsBatch(newEmployees: Employee[], newAccounts: UserAccount[]): void {
    const empList = this.getEmployees();
    for (const emp of newEmployees) {
      const idx = empList.findIndex(e => e.id === emp.id);
      if (idx >= 0) empList[idx] = emp;
      else empList.unshift(emp);
    }
    localStorage.setItem(STORAGE_KEYS.EMPLOYEES, JSON.stringify(empList));

    const accList = this.getUserAccounts();
    for (const acc of newAccounts) {
      const idx = accList.findIndex(a => a.id === acc.id || a.username.toLowerCase() === acc.username.toLowerCase());
      if (idx >= 0) accList[idx] = { ...accList[idx], ...acc };
      else accList.push(acc);
    }
    localStorage.setItem(STORAGE_KEYS.ACCOUNTS, JSON.stringify(accList));

    pushBatchToServer({
      employees: empList,
      accounts: accList,
    });
    window.dispatchEvent(new CustomEvent('pdks-data-synced'));
  },

  deleteEmployee(id: string): void {
    const list = this.getEmployees().filter(e => e.id !== id);
    localStorage.setItem(STORAGE_KEYS.EMPLOYEES, JSON.stringify(list));
    pushToServer('employees', list);
    window.dispatchEvent(new CustomEvent('pdks-data-synced'));
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
    pushToServer('employees', list);
    window.dispatchEvent(new CustomEvent('pdks-data-synced'));

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
      pushToServer('employees', list);
      window.dispatchEvent(new CustomEvent('pdks-data-synced'));

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
    pushToServer('employees', list);
    window.dispatchEvent(new CustomEvent('pdks-data-synced'));

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
    pushToServer('employees', list);
    window.dispatchEvent(new CustomEvent('pdks-data-synced'));

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
    pushToServer('shifts', list);
    window.dispatchEvent(new CustomEvent('pdks-data-synced'));
    return shift;
  },

  deleteShift(id: string): void {
    const list = this.getShifts().filter(s => s.id !== id);
    localStorage.setItem(STORAGE_KEYS.SHIFTS, JSON.stringify(list));
    pushToServer('shifts', list);
    window.dispatchEvent(new CustomEvent('pdks-data-synced'));
  },

  getAttendanceRecords(): AttendanceRecord[] {
    const raw = localStorage.getItem(STORAGE_KEYS.RECORDS);
    if (!raw) {
      localStorage.setItem(STORAGE_KEYS.RECORDS, JSON.stringify(DEFAULT_RECORDS));
      return DEFAULT_RECORDS;
    }
    try {
      const parsed: AttendanceRecord[] = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const clientToday = getTodayString();
        const isOnlyDemoSeed =
          parsed.length <= 7 &&
          parsed.every((r) => r && /^REC-00[1-7]$/.test(r.id));
        if (isOnlyDemoSeed && parsed.some((r) => r.date !== clientToday)) {
          const normalized = parsed.map((r) => ({
            ...r,
            date: clientToday,
            timestamp: `${clientToday}T${r.timeStr || '08:30:00'}`,
          }));
          try { localStorage.setItem(STORAGE_KEYS.RECORDS, JSON.stringify(normalized)); } catch {}
          return normalized;
        }
      }
      return Array.isArray(parsed) ? parsed : DEFAULT_RECORDS;
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
    pushToServer('leaves', list);
    window.dispatchEvent(new CustomEvent('pdks-data-synced'));
  },

  updateLeaveStatus(id: string, status: 'approved' | 'rejected' | 'pending'): void {
    const list = this.getLeaveRequests();
    const req = list.find(l => l.id === id);
    if (req) {
      req.status = status;
      localStorage.setItem(STORAGE_KEYS.LEAVES, JSON.stringify(list));
      pushToServer('leaves', list);
      // If approved for today, mark employee as on leave
      if (status === 'approved' && req.startDate === getTodayString()) {
        const employees = this.getEmployees();
        const emp = employees.find(e => e.id === req.employeeId);
        if (emp) {
          emp.status = 'leave';
          emp.currentPresence = 'outside';
          localStorage.setItem(STORAGE_KEYS.EMPLOYEES, JSON.stringify(employees));
          pushToServer('employees', employees);
        }
      }
      window.dispatchEvent(new CustomEvent('pdks-data-synced'));
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
    pushToServer('overtime', list);
    window.dispatchEvent(new CustomEvent('pdks-data-synced'));

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
      pushToServer('overtime', list);
      window.dispatchEvent(new CustomEvent('pdks-data-synced'));

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

    // 1-Hour New-Device Check-In Gate: If employee logged in from a different device within the last 1 hour,
    // only İK Yöneticisi can approve their first workplace check-in!
    const activeCaller = this.getActiveUser();
    if (action === 'check_in' && activeCaller?.role !== 'ik_yoneticisi') {
      const lockCheck = this.enforceNewDeviceCheckInGate(emp, terminalName);
      if (lockCheck.blocked) {
        return {
          success: false,
          message: lockCheck.message,
          action: 'check_in',
        };
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

    // Device identity capture & cross-employee check when employee acts on their own device (or non-shared kiosk)
    const device = this.getDeviceIdentity();
    const isSharedOperatorKiosk =
      method === 'kiosk_camera' &&
      activeCaller &&
      activeCaller.employeeId &&
      activeCaller.employeeId !== emp.id &&
      (activeCaller.role === 'ik_yoneticisi' || activeCaller.role === 'guvenlik');

    let crossOwner: ReturnType<typeof pdksStorage.findOtherDeviceOwner> = null;
    if (!isSharedOperatorKiosk && method !== 'manual_admin') {
      crossOwner = this.findOtherDeviceOwner(emp.id, device);
      if (!emp.registeredDeviceId && !crossOwner) {
        this.bindRegisteredDeviceToEmployee(emp.id, device, now.toISOString());
        emp.registeredDeviceId = device.deviceId;
        emp.registeredMacAddress = device.macAddress;
        emp.registeredDeviceFingerprint = device.fingerprint;
        emp.registeredDeviceName = device.deviceName;
        emp.registeredDeviceAt = now.toISOString();
      }
      emp.lastLoginDeviceId = device.deviceId;
      emp.lastLoginMacAddress = device.macAddress;
      emp.lastLoginDeviceName = device.deviceName;
      emp.lastLoginAt = now.toISOString();
      this.syncEmployeeLastDevice(emp.id, device, now.toISOString());
    }

    // Save updated employee
    this.saveEmployee(emp);

    const crossWarningText = crossOwner
      ? `Başka Personel Cihazı ile Giriş (Yetkisiz/Şüpheli Cihaz Kullanımı) · Cihaz Sahibi: ${crossOwner.employeeName}`
      : undefined;

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
      note: crossWarningText,
      deviceId: method === 'manual_admin' ? undefined : device.deviceId,
      macAddress: method === 'manual_admin' ? undefined : device.macAddress,
      deviceName: method === 'manual_admin' ? undefined : device.deviceName,
      deviceFingerprint: method === 'manual_admin' ? undefined : device.fingerprint,
      isSuspiciousDevice: Boolean(crossOwner),
      securityEventKind: crossOwner ? 'scan_cross_device' : undefined,
      securityWarning: crossOwner
        ? 'Başka Personel Cihazı ile Giriş (Yetkisiz/Şüpheli Cihaz Kullanımı)'
        : undefined,
      deviceOwnerEmployeeId: crossOwner?.employeeId,
      deviceOwnerEmployeeName: crossOwner?.employeeName,
      deviceOwnerMacAddress: crossOwner?.macAddress,
    };

    const records = this.getAttendanceRecords();
    records.unshift(record);
    localStorage.setItem(STORAGE_KEYS.RECORDS, JSON.stringify(records));

    if (crossOwner) {
      this.triggerCrossEmployeeNotification(emp, crossOwner, device, 'Vardiya / QR İşlemi', now);
    }

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

    pushBatchToServer({
      employees: this.getEmployees(),
      accounts: this.getUserAccounts(),
      records: this.getAttendanceRecords(),
      notifications: this.getNotifications(),
    });
    window.dispatchEvent(new CustomEvent('pdks-data-synced'));

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
      if (parsed.token === 'AQ.Ab8RN6IQLh43aJSyjpBqkesYfVh2cWmuCciG5Mrp8b4eagNrHQ') {
        parsed.token = PDKS_SYSTEM_API_KEY;
        const isGeo = Boolean(parsed.enableGeofence);
        parsed.qrPayload = `ASEM:WALL:${PDKS_SYSTEM_API_KEY}:GEO:${isGeo ? 1 : 0}:${parsed.latitude || 41.0082}:${parsed.longitude || 28.9784}:${parsed.radiusMeters || 250}`;
        try { localStorage.setItem(STORAGE_KEYS.COMPANY_WALL_QR, JSON.stringify(parsed)); } catch {}
      }
      return parsed;
    } catch {
      return DEFAULT_COMPANY_WALL_QR;
    }
  },

  async fetchCompanyWallQRFromServer(): Promise<CompanyWallQRConfig | null> {
    if (typeof window === 'undefined' || typeof fetch !== 'function') return null;
    try {
      const res = await fetch('/api/company/wall-qr');
      if (!res.ok) return null;
      const json = await res.json();
      if (json && json.success && json.data) {
        const current = this.getInternalCompanyWallQR();
        const merged: CompanyWallQRConfig = {
          ...current,
          ...json.data,
          latitude: Number.isFinite(Number(json.data.latitude)) ? Number(json.data.latitude) : current.latitude,
          longitude: Number.isFinite(Number(json.data.longitude)) ? Number(json.data.longitude) : current.longitude,
          radiusMeters: Number(json.data.radiusMeters) || current.radiusMeters,
          enableGeofence: typeof json.data.enableGeofence === 'boolean' ? json.data.enableGeofence : current.enableGeofence,
        };
        localStorage.setItem(STORAGE_KEYS.COMPANY_WALL_QR, JSON.stringify(merged));
        window.dispatchEvent(new CustomEvent('pdks-wall-qr-updated', { detail: merged }));
        return merged;
      }
    } catch {
      // offline or server unavailable fallback silently
    }
    return null;
  },

  syncCompanyWallQRFromVerifiedScan(
    geo: { enableGeofence: boolean; latitude: number; longitude: number; radiusMeters: number },
    token?: string
  ): CompanyWallQRConfig {
    const current = this.getInternalCompanyWallQR();
    const updated: CompanyWallQRConfig = {
      ...current,
      token: token || current.token,
      latitude: geo.latitude,
      longitude: geo.longitude,
      radiusMeters: geo.radiusMeters,
      enableGeofence: geo.enableGeofence,
    };
    localStorage.setItem(STORAGE_KEYS.COMPANY_WALL_QR, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent('pdks-wall-qr-updated', { detail: updated }));
    return updated;
  },

  parseWallQRToken(rawScannedText: string): {
    isValid: boolean;
    token: string;
    geoConfig?: {
      enableGeofence: boolean;
      latitude: number;
      longitude: number;
      radiusMeters: number;
    } | null;
  } {
    let raw = (rawScannedText || '').trim();
    // Strip wrapping quotes if scanner or barcode detector returned quoted text
    if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
      raw = raw.slice(1, -1).trim();
    }
    if (!raw) {
      return { isValid: false, token: '' };
    }

    // URL parameter extraction (e.g. https://domain.com/portal?token=... or ?qr=...)
    if (raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('asem://')) {
      try {
        const urlObj = new URL(raw);
        const qToken = urlObj.searchParams.get('token') || urlObj.searchParams.get('qr') || urlObj.searchParams.get('payload');
        if (qToken) {
          raw = qToken.trim();
        }
      } catch {
        // ignore url parse error
      }
    }

    const currentConfig = this.getInternalCompanyWallQR();
    const upperRaw = raw.toUpperCase();

    // 0. Dynamic Kiosk Terminal Rotating QR Code (if scanned from screen)
    if (upperRaw.startsWith('PDKS_KIOSK_DYNAMIC:') || upperRaw.startsWith('PDKS:KIOSK')) {
      return {
        isValid: true,
        token: currentConfig.token,
        geoConfig: null,
      };
    }

    // 1. Format: ASEM:WALL:<TOKEN>:GEO:<1|0>:<LAT>:<LON>:<RADIUS>
    if (upperRaw.includes('ASEM:WALL')) {
      const parts = raw.split(':');
      const geoIdx = parts.findIndex((p) => p.toUpperCase() === 'GEO');
      if (geoIdx !== -1 && parts.length >= geoIdx + 5) {
        const token = parts.slice(2, geoIdx).join(':');
        const enabled = parts[geoIdx + 1] === '1';
        const lat = parseFloat(parts[geoIdx + 2]);
        const lon = parseFloat(parts[geoIdx + 3]);
        const rad = parseInt(parts[geoIdx + 4], 10);

        return {
          isValid: true,
          token: token || currentConfig.token,
          geoConfig: Number.isFinite(lat) && Number.isFinite(lon)
            ? {
                enableGeofence: enabled,
                latitude: lat,
                longitude: lon,
                radiusMeters: Number.isFinite(rad) && rad > 0 ? rad : currentConfig.radiusMeters || 250,
              }
            : null,
        };
      }

      // Format starting with or containing ASEM:WALL without GEO tag
      return {
        isValid: true,
        token: currentConfig.token,
        geoConfig: null,
      };
    }

    // 2. JSON Format: {"type":"ASEM_WALL_QR","token":"...","lat":40.1,"lon":29.1,"rad":250,"geo":true}
    if ((raw.startsWith('{') && raw.endsWith('}')) || (raw.startsWith('{"') && raw.endsWith('"}'))) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed.token || parsed.type === 'ASEM_WALL_QR' || parsed.companyQR) {
          return {
            isValid: true,
            token: parsed.token || currentConfig.token,
            geoConfig: Number.isFinite(parsed.lat) && Number.isFinite(parsed.lon)
              ? {
                  enableGeofence: parsed.geo !== false,
                  latitude: Number(parsed.lat),
                  longitude: Number(parsed.lon),
                  radiusMeters: Number(parsed.rad) || currentConfig.radiusMeters || 250,
                }
              : null,
          };
        }
      } catch {
        // Not valid JSON
      }
    }

    // 3. Exact matching with stored token, payload, or PDKS_SYSTEM_API_KEY / default key
    const isDirectMatch =
      raw === currentConfig.token ||
      raw === currentConfig.qrPayload ||
      raw === PDKS_SYSTEM_API_KEY ||
      raw === DEFAULT_COMPANY_WALL_QR.token ||
      raw === DEFAULT_COMPANY_WALL_QR.qrPayload ||
      raw.includes(currentConfig.token) ||
      raw.includes(PDKS_SYSTEM_API_KEY) ||
      (currentConfig.token && currentConfig.token.includes(raw) && raw.length >= 10);

    if (isDirectMatch) {
      return {
        isValid: true,
        token: currentConfig.token,
        geoConfig: null,
      };
    }

    // 4. Any token containing the official PDKS API key prefix, standard company token, or company prefixes
    if (
      raw.includes('evren_llm_40eYxYnsM-qzeV7OOaIMmVfYB9KTajRcYFr-5bwh_Ko') ||
      raw.includes('evren_llm_') ||
      raw.includes('AQ.Ab8RN6IQLh43aJSyjpBqkesYfVh2cWmuCciG5Mrp8b4eagNrHQ') ||
      raw.includes('AQ.Ab8') ||
      upperRaw.includes('ASEM') ||
      upperRaw.includes('WALL') ||
      upperRaw.includes('PDKS') ||
      upperRaw.includes('HQ-') ||
      upperRaw.includes(':GEO:') ||
      (raw.length >= 6 && currentConfig.token && (currentConfig.token.includes(raw) || raw.includes(currentConfig.token)))
    ) {
      return {
        isValid: true,
        token: currentConfig.token,
        geoConfig: null,
      };
    }

    return {
      isValid: false,
      token: raw,
      geoConfig: null,
    };
  },

  getCompanyWallQR(_caller?: CurrentUser): CompanyWallQRConfig {
    return this.getInternalCompanyWallQR();
  },

  // Authoritative Geofence check factoring in device accuracy and radius
  verifyWorkplaceLocation(userCoords?: { latitude: number; longitude: number; accuracy?: number } | null): {
    isWithinWorkplace: boolean;
    geofenceEnabled: boolean;
    distanceMeters?: number;
    radiusMeters?: number;
  } {
    const config = this.getInternalCompanyWallQR();
    if (!config.enableGeofence) {
      return { isWithinWorkplace: true, geofenceEnabled: false, distanceMeters: 0, radiusMeters: config.radiusMeters || 250 };
    }
    if (!userCoords || typeof userCoords.latitude !== 'number' || typeof userCoords.longitude !== 'number') {
      return { isWithinWorkplace: false, geofenceEnabled: true, distanceMeters: undefined, radiusMeters: config.radiusMeters || 250 };
    }

    const targetLat = Number.isFinite(config.latitude) && Math.abs(config.latitude) > 0.001 ? config.latitude : 41.0082;
    const targetLon = Number.isFinite(config.longitude) && Math.abs(config.longitude) > 0.001 ? config.longitude : 28.9784;
    const allowedRadius = Math.max(10, Number(config.radiusMeters) || 250);

    const dist = calculateHaversineDistance(
      userCoords.latitude,
      userCoords.longitude,
      targetLat,
      targetLon
    );
    // Generous indoor buffer for mobile phone GPS inaccuracy (thick walls/roofs can cause ±60-150m drift)
    const accuracyBuffer = Math.max(userCoords.accuracy || 60, 150);
    const effectiveDistance = Math.max(0, dist - accuracyBuffer);
    return {
      isWithinWorkplace: effectiveDistance <= allowedRadius,
      geofenceEnabled: true,
      distanceMeters: dist,
      radiusMeters: allowedRadius,
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
      branchName: sanitizeString(config.branchName, 100) || 'İşyeri',
      installationLocation: sanitizeString(config.installationLocation, 150) || 'Ana Giriş Turnikesi',
      latitude: Number.isFinite(config.latitude) ? Math.max(-90, Math.min(90, config.latitude)) : 41.0082,
      longitude: Number.isFinite(config.longitude) ? Math.max(-180, Math.min(180, config.longitude)) : 28.9784,
      radiusMeters: Math.max(10, Math.min(5000, Number(config.radiusMeters) || 250)),
      enableGeofence: Boolean(config.enableGeofence),
    };
    localStorage.setItem(STORAGE_KEYS.COMPANY_WALL_QR, JSON.stringify(sanitized));
    window.dispatchEvent(new CustomEvent('pdks-wall-qr-updated', { detail: sanitized }));
    window.dispatchEvent(new CustomEvent('pdks-data-synced'));

    // Persist to backend server so any other device fetches the updated location & geofence setting
    if (typeof window !== 'undefined' && typeof fetch === 'function') {
      fetch('/api/company/wall-qr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sanitized),
      }).then(async (res) => {
        if (res.ok) {
          const json = await res.json();
          if (json && typeof json.version === 'number') {
            localDbVersion = json.version;
            try { localStorage.setItem('pdks_db_version_v1', String(localDbVersion)); } catch {}
          }
        }
      }).catch((err) => {
        console.warn('Backend wall-qr sync note (running offline/client):', err);
      });
    }

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
    userLocation?: { latitude: number; longitude: number; accuracy?: number };
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

    // 1. Validation & Parsing of Scanned Token against Fixed Company QR
    const parsedQR = this.parseWallQRToken(scannedToken || '');
    if (!parsedQR.isValid) {
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

    const companyConfig = this.getInternalCompanyWallQR();
    // Server / İK setting is authoritative: if GPS verification is disabled in HR settings,
    // never let an older printed QR poster (:GEO:1:) re-enable location enforcement.
    const isGeofenceEnabled = companyConfig.enableGeofence !== false && (parsedQR.geoConfig ? parsedQR.geoConfig.enableGeofence : true);
    if (parsedQR.geoConfig && companyConfig.enableGeofence !== false) {
      this.syncCompanyWallQRFromVerifiedScan(parsedQR.geoConfig, parsedQR.token);
    }

    const effectiveGeo = parsedQR.geoConfig
      ? { ...parsedQR.geoConfig, enableGeofence: isGeofenceEnabled }
      : {
          enableGeofence: Boolean(companyConfig.enableGeofence),
          latitude: companyConfig.latitude,
          longitude: companyConfig.longitude,
          radiusMeters: companyConfig.radiusMeters,
        };

    // 2. Geofence Check (Workplace location enforcement with indoor GPS tolerance)
    let calculatedDistance = 0;
    let geofencePassed = true;

    const effLat = Number.isFinite(effectiveGeo.latitude) && Math.abs(effectiveGeo.latitude) > 0.001 ? effectiveGeo.latitude : 41.0082;
    const effLon = Number.isFinite(effectiveGeo.longitude) && Math.abs(effectiveGeo.longitude) > 0.001 ? effectiveGeo.longitude : 28.9784;

    if (effectiveGeo.enableGeofence) {
      if (
        !userLocation ||
        typeof userLocation.latitude !== 'number' ||
        typeof userLocation.longitude !== 'number'
      ) {
        return {
          success: false,
          message:
            'Konum Doğrulaması Başarısız: İşyeri kuralı gereğince sadece işyeri sınırları içinde QR okutulabilir. Lütfen cihazınızın GPS servisini açınız ve konum izni veriniz.',
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
        effLat,
        effLon
      );

      // Account for mobile indoor GPS jitter (concrete/metal roofs reduce satellite precision)
      const accuracyBuffer = Math.max(userLocation.accuracy || 80, 200);
      const effectiveDistance = Math.max(0, calculatedDistance - accuracyBuffer);

      if (effectiveDistance > effectiveGeo.radiusMeters) {
        // Internal security log for HR review
        this.addNotification({
          type: 'critical_late',
          title: 'İşyeri Dışı Giriş/Çıkış Engellendi',
          message: `${emp.fullName} (${emp.department}) işyeri sınırları dışından QR okutmayı denedi (${calculatedDistance}m uzaklıkta). Güvenlik sistemi tarafından engellendi.`,
          employeeId: emp.id,
          employeeName: emp.fullName,
          department: emp.department,
          severity: 'critical',
        });

        const distStr = calculatedDistance >= 1000 ? `${(calculatedDistance / 1000).toFixed(1)} km` : `${calculatedDistance} metre`;

        return {
          success: false,
          message: `İşyeri Sınırları Dışındasınız: Cihazınız işyeri merkezinden ${distStr} mesafede algılandı (İzin verilen sınır: ${effectiveGeo.radiusMeters}m). İşyeri alanındaysanız İK yöneticisinden GPS yarıçapını artırmasını veya GPS Doğrulamasını kapatmasını talep edebilirsiniz.`,
          action: 'check_in',
          previousPresence: emp.currentPresence,
          newPresence: emp.currentPresence,
          timestamp: serverTimestamp,
          serverTime: timeStr,
          geofencePassed: false,
          userLocation,
          distanceMeters: calculatedDistance,
          allowedRadiusMeters: effectiveGeo.radiusMeters,
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

    // 3b. 1-Hour New-Device Manager-Only First Check-In Gate
    if (action === 'check_in' && active?.role !== 'ik_yoneticisi') {
      const lockCheck = this.enforceNewDeviceCheckInGate(emp, 'Mobil Tarayıcı (Sabit Duvar QR)');
      if (lockCheck.blocked) {
        return {
          success: false,
          message: lockCheck.message,
          action: 'check_in',
          previousPresence,
          newPresence: previousPresence,
          timestamp: serverTimestamp,
          serverTime: timeStr,
          geofencePassed,
          distanceMeters: calculatedDistance,
          userLocation,
          awaitingManagerApproval: true,
          deviceApproval: lockCheck.approval,
        };
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

    // 5. Device Identification, Registration (if first-time & unowned) & Cross-Employee Device Check
    const device = this.getDeviceIdentity();
    const crossOwner = this.findOtherDeviceOwner(emp.id, device);
    const accForEmp = this.getUserAccountByEmployeeId(emp.id);
    const alreadyRegistered = Boolean(emp.registeredDeviceId || accForEmp?.registeredDeviceId);

    if (!alreadyRegistered && !crossOwner) {
      this.bindRegisteredDeviceToEmployee(emp.id, device, serverTimestamp);
      emp.registeredDeviceId = device.deviceId;
      emp.registeredMacAddress = device.macAddress;
      emp.registeredDeviceFingerprint = device.fingerprint;
      emp.registeredDeviceName = device.deviceName;
      emp.registeredDeviceAt = serverTimestamp;
    }

    emp.lastLoginDeviceId = device.deviceId;
    emp.lastLoginMacAddress = device.macAddress;
    emp.lastLoginDeviceName = device.deviceName;
    emp.lastLoginAt = serverTimestamp;
    this.syncEmployeeLastDevice(emp.id, device, serverTimestamp);

    // Update Employee State locally (batch synced with records & notifications below)
    emp.currentPresence = newPresence;
    emp.lastActionTime = timeStr;
    const empList = this.getEmployees();
    const empIdx = empList.findIndex(e => e.id === emp.id);
    if (empIdx >= 0) empList[empIdx] = emp;
    else empList.unshift(emp);
    localStorage.setItem(STORAGE_KEYS.EMPLOYEES, JSON.stringify(empList));

    const crossWarningNote = crossOwner
      ? `Başka Personel Cihazı ile Giriş (Yetkisiz/Şüpheli Cihaz Kullanımı) · Cihaz Sahibi: ${crossOwner.employeeName}`
      : undefined;

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
      note: crossWarningNote,
      deviceId: device.deviceId,
      macAddress: device.macAddress,
      deviceName: device.deviceName,
      deviceFingerprint: device.fingerprint,
      isSuspiciousDevice: Boolean(crossOwner),
      securityEventKind: crossOwner ? 'scan_cross_device' : undefined,
      securityWarning: crossOwner
        ? 'Başka Personel Cihazı ile Giriş (Yetkisiz/Şüpheli Cihaz Kullanımı)'
        : undefined,
      deviceOwnerEmployeeId: crossOwner?.employeeId,
      deviceOwnerEmployeeName: crossOwner?.employeeName,
      deviceOwnerMacAddress: crossOwner?.macAddress,
    };

    const records = this.getAttendanceRecords();
    records.unshift(record);
    localStorage.setItem(STORAGE_KEYS.RECORDS, JSON.stringify(records));

    if (crossOwner) {
      this.triggerCrossEmployeeNotification(emp, crossOwner, device, 'Mobil QR Vardiya İşlemi', now);
    }

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

    pushBatchToServer({
      employees: this.getEmployees(),
      accounts: this.getUserAccounts(),
      records: this.getAttendanceRecords(),
      notifications: this.getNotifications(),
    });
    window.dispatchEvent(new CustomEvent('pdks-data-synced'));

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
    pushToServer('accounts', accounts);
    window.dispatchEvent(new CustomEvent('pdks-data-synced'));
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
    pushToServer('accounts', accounts);
    window.dispatchEvent(new CustomEvent('pdks-data-synced'));

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
    pushToServer('accounts', updated);
    window.dispatchEvent(new CustomEvent('pdks-data-synced'));
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
    pushToServer('accounts', accounts);
    window.dispatchEvent(new CustomEvent('pdks-data-synced'));

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

    // Device Identity Registration, Cross-Employee Detection & Multi-Device 1-Hour Manager Approval Gate
    const device = this.getDeviceIdentity();
    const nowDate = new Date();
    const nowIso = nowDate.toISOString();
    let firstDeviceRegistered = false;
    let newDeviceDetected = false;
    let createdOrUpdatedApproval: DeviceEntryApproval | undefined;

    // Check if this device/MAC/fingerprint is ALREADY registered to another employee in the database
    const crossOwner = this.findOtherDeviceOwner(found.employeeId, device);
    const crossEmployeeDeviceDetected = Boolean(crossOwner);

    // Match user's own registered device via Device ID, MAC Address, or Browser Fingerprint
    const matchesOwnRegistered = Boolean(
      found.registeredDeviceId &&
        (found.registeredDeviceId === device.deviceId ||
          (found.registeredMacAddress && found.registeredMacAddress === device.macAddress) ||
          (found.registeredDeviceFingerprint && found.registeredDeviceFingerprint === device.fingerprint))
    );

    if (!found.registeredDeviceId && !crossOwner) {
      // First-time registration (only bind if not already owned by another employee)
      firstDeviceRegistered = true;
      found.registeredDeviceId = device.deviceId;
      found.registeredMacAddress = device.macAddress;
      found.registeredDeviceFingerprint = device.fingerprint;
      found.registeredDeviceName = device.deviceName;
      found.registeredDeviceAt = nowIso;
    } else if ((!matchesOwnRegistered || crossOwner) && found.role !== 'ik_yoneticisi') {
      newDeviceDetected = true;
      const approvals = this.getDeviceEntryApprovals();
      const updatedApprovals = approvals.map((item) => {
        if (
          item.employeeId === found.employeeId &&
          (item.status === 'pending' || item.status === 'check_in_requested') &&
          (item.newDeviceId !== device.deviceId || nowDate.getTime() >= Date.parse(item.expiresAt))
        ) {
          return { ...item, status: 'expired' as const };
        }
        return item;
      });

      const expiresAtIso = new Date(nowDate.getTime() + NEW_DEVICE_LOCK_DURATION_MS).toISOString();
      const existingSameDevice = updatedApprovals.find(
        (item) =>
          item.employeeId === found.employeeId &&
          item.newDeviceId === device.deviceId &&
          (item.status === 'pending' || item.status === 'check_in_requested') &&
          nowDate.getTime() < Date.parse(item.expiresAt)
      );

      if (existingSameDevice) {
        existingSameDevice.loginAt = nowIso;
        existingSameDevice.expiresAt = expiresAtIso;
        existingSameDevice.newMacAddress = device.macAddress;
        existingSameDevice.newDeviceFingerprint = device.fingerprint;
        createdOrUpdatedApproval = existingSameDevice;
      } else {
        createdOrUpdatedApproval = {
          id: `DEVAPP-${Date.now().toString().slice(-6)}`,
          employeeId: found.employeeId,
          accountId: found.id,
          username: found.username,
          employeeName: found.name,
          department: found.department || 'Genel',
          registeredDeviceId: found.registeredDeviceId || 'YOK',
          registeredMacAddress: found.registeredMacAddress,
          registeredDeviceName:
            found.registeredDeviceName || found.registeredDeviceId || 'Henüz Kayıtlı Cihaz Yok',
          newDeviceId: device.deviceId,
          newMacAddress: device.macAddress,
          newDeviceFingerprint: device.fingerprint,
          newDeviceName: device.deviceName,
          loginAt: nowIso,
          expiresAt: expiresAtIso,
          status: 'pending',
        };
        updatedApprovals.unshift(createdOrUpdatedApproval);
      }

      localStorage.setItem(STORAGE_KEYS.DEVICE_APPROVALS, JSON.stringify(updatedApprovals));

      // Standard new-device 1-hour lock manager notification (when not already covered or in addition to cross-device alert)
      const managerNotif = this.addNotification({
        type: 'device_alert',
        title: crossOwner
          ? 'Farklı & Başka Personele Kayıtlı Cihazdan Giriş'
          : 'Farklı Cihazdan Giriş Uyarısı',
        message: crossOwner
          ? `${found.name} (@${found.username}), ${crossOwner.employeeName} adına kayıtlı cihazdan (${device.macAddress} · ${device.deviceId}) giriş yaptı. Önümüzdeki 1 saat içindeki ilk iş yeri girişi yalnızca yönetici onayına tabidir.`
          : `${found.name} (@${found.username}) kayıtlı cihazı (${found.registeredDeviceName || found.registeredDeviceId}) dışında yeni bir cihazdan (${device.deviceName} · MAC: ${device.macAddress}) giriş yaptı. Önümüzdeki 1 saat içindeki ilk iş yeri girişi yalnızca yönetici tarafından onaylanabilir.`,
        employeeId: found.employeeId,
        employeeName: found.name,
        department: (found.department || 'Genel') as any,
        severity: crossOwner ? 'critical' : 'warning',
        targetRole: 'ik_yoneticisi',
        metadata: {
          deviceApprovalId: createdOrUpdatedApproval.id,
          newDeviceName: device.deviceName,
          expiresAt: expiresAtIso,
          macAddress: device.macAddress,
          deviceId: device.deviceId,
          deviceName: device.deviceName,
        },
      });
      createdOrUpdatedApproval.notificationId = managerNotif.id;
      localStorage.setItem(STORAGE_KEYS.DEVICE_APPROVALS, JSON.stringify(updatedApprovals));
    }

    // Update last login device on both account & employee profile
    found.lastLoginDeviceId = device.deviceId;
    found.lastLoginMacAddress = device.macAddress;
    found.lastLoginDeviceFingerprint = device.fingerprint;
    found.lastLoginDeviceName = device.deviceName;
    found.lastLogin = nowIso;

    const allAccounts = this.getUserAccounts();
    const accIdx = allAccounts.findIndex((a) => a.id === found.id);
    if (accIdx >= 0) allAccounts[accIdx] = found;
    else allAccounts.push(found);
    localStorage.setItem(STORAGE_KEYS.ACCOUNTS, JSON.stringify(allAccounts));

    // Mirror registered & last-login MAC/Device info onto the Employee profile
    const employees = this.getEmployees();
    const empMatch = employees.find((e) => e.id === found.employeeId);
    if (empMatch) {
      if (found.registeredDeviceId) {
        empMatch.registeredDeviceId = found.registeredDeviceId;
        empMatch.registeredMacAddress = found.registeredMacAddress;
        empMatch.registeredDeviceFingerprint = found.registeredDeviceFingerprint;
        empMatch.registeredDeviceName = found.registeredDeviceName;
        empMatch.registeredDeviceAt = found.registeredDeviceAt;
      }
      empMatch.lastLoginDeviceId = device.deviceId;
      empMatch.lastLoginMacAddress = device.macAddress;
      empMatch.lastLoginDeviceName = device.deviceName;
      empMatch.lastLoginAt = nowIso;
      localStorage.setItem(STORAGE_KEYS.EMPLOYEES, JSON.stringify(employees));
    }

    // Critical Cross-Employee Device Alert + Security Log Entry in AttendanceLogs
    if (crossOwner) {
      const actorEmp: Employee = empMatch || {
        id: found.employeeId,
        tcNo: '',
        fullName: found.name,
        email: '',
        phone: '',
        department: (found.department || 'Genel') as any,
        title: found.title,
        avatar: found.avatar,
        shiftId: 'SHIFT-1',
        startDate: getTodayString(),
        qrToken: '',
        status: 'active',
        currentPresence: 'outside',
      };
      this.logCrossEmployeeLoginSecurityEvent(actorEmp, crossOwner, device, nowDate);
    }

    if (newDeviceDetected || crossEmployeeDeviceDetected || firstDeviceRegistered) {
      pushBatchToServer({
        accounts: allAccounts,
        employees: this.getEmployees(),
        records: this.getAttendanceRecords(),
        deviceApprovals: this.getDeviceEntryApprovals(),
        notifications: this.getNotifications(),
      });
    } else {
      pushBatchToServer({
        accounts: allAccounts,
        employees: this.getEmployees(),
      });
    }
    window.dispatchEvent(new CustomEvent('pdks-data-synced'));

    const resolvedTheme = this.getUserTheme(found);
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
      assignedEmployeeIds: found.assignedEmployeeIds,
      isShiftSupervisor: found.isShiftSupervisor,
      themeId: resolvedTheme,
      themeUpdatedAt: found.themeUpdatedAt,
      registeredDeviceId: found.registeredDeviceId,
      registeredMacAddress: found.registeredMacAddress,
      registeredDeviceFingerprint: found.registeredDeviceFingerprint,
      registeredDeviceName: found.registeredDeviceName,
      registeredDeviceAt: found.registeredDeviceAt,
      lastLoginDeviceId: found.lastLoginDeviceId,
      lastLoginMacAddress: found.lastLoginMacAddress,
      lastLoginDeviceFingerprint: found.lastLoginDeviceFingerprint,
      lastLoginDeviceName: found.lastLoginDeviceName,
    };

    localStorage.removeItem(STORAGE_KEYS.IS_LOGGED_OUT);
    this.setActiveUser(currentUser);

    return {
      success: true,
      message: crossOwner
        ? `Güvenlik Uyarısı: Giriş yaptığınız cihaz (${device.macAddress}) sistemde ${crossOwner.employeeName} adına kayıtlıdır! Durum yöneticiye raporlandı.`
        : newDeviceDetected
        ? `Hoş geldiniz, ${found.name}! Yeni cihazdan giriş algılandı — 1 saat içindeki ilk iş yeri girişiniz yönetici onayına tabidir.`
        : firstDeviceRegistered
        ? `Hoş geldiniz, ${found.name}! Bu cihaz (${device.deviceName} · MAC: ${device.macAddress}) hesabınıza ilk güvenli cihaz olarak kaydedildi.`
        : `Hoş geldiniz, ${found.name}!`,
      user: currentUser,
      firstDeviceRegistered,
      newDeviceDetected,
      crossEmployeeDeviceDetected,
      crossEmployeeOwnerName: crossOwner?.employeeName,
      deviceApproval: createdOrUpdatedApproval,
    };
  },

  // =========================================================================
  // DEVICE BINDING, MAC FINGERPRINT & CROSS-EMPLOYEE SECURITY ENGINE
  // =========================================================================

  getDeviceIdentity(): DeviceIdentity {
    if (typeof localStorage === 'undefined') {
      return {
        deviceId: 'DEV-SERVER',
        macAddress: '02:00:00:00:00:01',
        fingerprint: 'FP-SERVER000001',
        deviceName: 'Sunucu',
        platform: 'Sunucu',
        browser: 'Sistem',
        createdAt: new Date().toISOString(),
      };
    }
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.DEVICE_IDENTITY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.deviceId && parsed.deviceName) {
          if (!parsed.macAddress || !parsed.fingerprint) {
            const computed = computeDeviceFingerprintAndMac(parsed.deviceId);
            const upgraded: DeviceIdentity = {
              ...parsed,
              macAddress: parsed.macAddress || computed.macAddress,
              fingerprint: parsed.fingerprint || computed.fingerprint,
            };
            localStorage.setItem(STORAGE_KEYS.DEVICE_IDENTITY, JSON.stringify(upgraded));
            return upgraded;
          }
          return parsed;
        }
      }
    } catch {}
    const { platform, browser } = detectClientDeviceMetadata();
    const computed = computeDeviceFingerprintAndMac();
    const deviceId = computed.suggestedDeviceId || generateShortDeviceId();
    const shortSuffix = deviceId.replace(/^DEV-/, '').slice(0, 4);
    const identity: DeviceIdentity = {
      deviceId,
      macAddress: computed.macAddress,
      fingerprint: computed.fingerprint,
      deviceName: `${platform} · ${browser} (#${shortSuffix})`,
      platform,
      browser,
      createdAt: new Date().toISOString(),
    };
    try {
      localStorage.setItem(STORAGE_KEYS.DEVICE_IDENTITY, JSON.stringify(identity));
    } catch {}
    return identity;
  },

  findOtherDeviceOwner(
    currentEmployeeId: string,
    device: DeviceIdentity
  ): {
    employeeId: string;
    employeeName: string;
    department: string;
    macAddress: string;
    deviceId: string;
    deviceName: string;
  } | null {
    if (!device) return null;
    const employees = this.getEmployees();
    const accounts = this.getUserAccounts();

    for (const acc of accounts) {
      if (!acc || acc.employeeId === currentEmployeeId) continue;
      if (!acc.registeredDeviceId && !acc.registeredMacAddress && !acc.registeredDeviceFingerprint) continue;
      const sameDevice =
        (acc.registeredDeviceId && acc.registeredDeviceId === device.deviceId) ||
        (acc.registeredMacAddress && acc.registeredMacAddress === device.macAddress) ||
        (acc.registeredDeviceFingerprint && acc.registeredDeviceFingerprint === device.fingerprint);
      if (sameDevice) {
        return {
          employeeId: acc.employeeId,
          employeeName: acc.name,
          department: acc.department || 'Genel',
          macAddress: acc.registeredMacAddress || device.macAddress,
          deviceId: acc.registeredDeviceId || device.deviceId,
          deviceName: acc.registeredDeviceName || device.deviceName,
        };
      }
    }

    for (const emp of employees) {
      if (!emp || emp.id === currentEmployeeId) continue;
      if (!emp.registeredDeviceId && !emp.registeredMacAddress && !emp.registeredDeviceFingerprint) continue;
      const sameDevice =
        (emp.registeredDeviceId && emp.registeredDeviceId === device.deviceId) ||
        (emp.registeredMacAddress && emp.registeredMacAddress === device.macAddress) ||
        (emp.registeredDeviceFingerprint && emp.registeredDeviceFingerprint === device.fingerprint);
      if (sameDevice) {
        return {
          employeeId: emp.id,
          employeeName: emp.fullName,
          department: emp.department || 'Genel',
          macAddress: emp.registeredMacAddress || device.macAddress,
          deviceId: emp.registeredDeviceId || device.deviceId,
          deviceName: emp.registeredDeviceName || device.deviceName,
        };
      }
    }

    return null;
  },

  bindRegisteredDeviceToEmployee(employeeId: string, device: DeviceIdentity, timestampIso: string): void {
    const accounts = this.getUserAccounts();
    let accChanged = false;
    for (const acc of accounts) {
      if (acc.employeeId === employeeId) {
        acc.registeredDeviceId = device.deviceId;
        acc.registeredMacAddress = device.macAddress;
        acc.registeredDeviceFingerprint = device.fingerprint;
        acc.registeredDeviceName = device.deviceName;
        acc.registeredDeviceAt = timestampIso;
        acc.lastLoginDeviceId = device.deviceId;
        acc.lastLoginMacAddress = device.macAddress;
        acc.lastLoginDeviceFingerprint = device.fingerprint;
        acc.lastLoginDeviceName = device.deviceName;
        accChanged = true;
      }
    }
    if (accChanged) {
      localStorage.setItem(STORAGE_KEYS.ACCOUNTS, JSON.stringify(accounts));
    }

    const employees = this.getEmployees();
    const emp = employees.find((e) => e.id === employeeId);
    if (emp) {
      emp.registeredDeviceId = device.deviceId;
      emp.registeredMacAddress = device.macAddress;
      emp.registeredDeviceFingerprint = device.fingerprint;
      emp.registeredDeviceName = device.deviceName;
      emp.registeredDeviceAt = timestampIso;
      emp.lastLoginDeviceId = device.deviceId;
      emp.lastLoginMacAddress = device.macAddress;
      emp.lastLoginDeviceName = device.deviceName;
      emp.lastLoginAt = timestampIso;
      localStorage.setItem(STORAGE_KEYS.EMPLOYEES, JSON.stringify(employees));
    }
  },

  syncEmployeeLastDevice(employeeId: string, device: DeviceIdentity, timestampIso: string): void {
    const accounts = this.getUserAccounts();
    let accChanged = false;
    for (const acc of accounts) {
      if (acc.employeeId === employeeId) {
        acc.lastLoginDeviceId = device.deviceId;
        acc.lastLoginMacAddress = device.macAddress;
        acc.lastLoginDeviceFingerprint = device.fingerprint;
        acc.lastLoginDeviceName = device.deviceName;
        accChanged = true;
      }
    }
    if (accChanged) {
      localStorage.setItem(STORAGE_KEYS.ACCOUNTS, JSON.stringify(accounts));
    }
  },

  triggerCrossEmployeeNotification(
    actorEmp: Employee,
    owner: {
      employeeId: string;
      employeeName: string;
      department: string;
      macAddress: string;
      deviceId: string;
      deviceName: string;
    },
    device: DeviceIdentity,
    actionLabel: string,
    eventDate: Date
  ): void {
    const eventDateTime = formatDateTimeTR(eventDate);
    this.addNotification({
      type: 'device_alert',
      title: 'Yetkisiz/Şüpheli Cihaz: Başka Personel Cihazı ile Giriş',
      message: `İşlemi Yapan: ${actorEmp.fullName} | Cihaz Sahibi: ${owner.employeeName} | MAC / Device ID: ${device.macAddress} (${device.deviceId}) | İşlem: ${actionLabel} | Tarih & Saat: ${eventDateTime}. Başka Personel Cihazı ile Giriş tespit edildi!`,
      employeeId: actorEmp.id,
      employeeName: actorEmp.fullName,
      department: actorEmp.department,
      severity: 'critical',
      targetRole: 'ik_yoneticisi',
      metadata: {
        isCrossEmployeeDevice: true,
        actorEmployeeName: actorEmp.fullName,
        ownerEmployeeId: owner.employeeId,
        ownerEmployeeName: owner.employeeName,
        macAddress: device.macAddress,
        deviceId: device.deviceId,
        deviceName: device.deviceName,
        eventDateTime,
      },
    });
  },

  logCrossEmployeeLoginSecurityEvent(
    actorEmp: Employee,
    owner: {
      employeeId: string;
      employeeName: string;
      department: string;
      macAddress: string;
      deviceId: string;
      deviceName: string;
    },
    device: DeviceIdentity,
    eventDate: Date
  ): void {
    const timeStr = eventDate.toTimeString().split(' ')[0];
    const dateStr = getTodayString();
    const secRecord: AttendanceRecord = {
      id: `SEC-${Date.now().toString().slice(-6)}`,
      employeeId: actorEmp.id,
      employeeName: actorEmp.fullName,
      department: actorEmp.department,
      date: dateStr,
      type: 'security_alert',
      timestamp: eventDate.toISOString(),
      timeStr,
      method: 'mobile_scanner',
      status: 'normal',
      lateMinutes: 0,
      terminal: 'Web / Mobil Oturum Girişi',
      note: `Başka Personel Cihazı ile Giriş (Yetkisiz/Şüpheli Cihaz Kullanımı) · Cihaz Sahibi: ${owner.employeeName}`,
      deviceId: device.deviceId,
      macAddress: device.macAddress,
      deviceName: device.deviceName,
      deviceFingerprint: device.fingerprint,
      isSuspiciousDevice: true,
      securityEventKind: 'login_cross_device',
      securityWarning: 'Başka Personel Cihazı ile Giriş (Yetkisiz/Şüpheli Cihaz Kullanımı)',
      deviceOwnerEmployeeId: owner.employeeId,
      deviceOwnerEmployeeName: owner.employeeName,
      deviceOwnerMacAddress: owner.macAddress,
    };
    const records = this.getAttendanceRecords();
    records.unshift(secRecord);
    localStorage.setItem(STORAGE_KEYS.RECORDS, JSON.stringify(records));

    this.triggerCrossEmployeeNotification(actorEmp, owner, device, 'Sistem Girişi', eventDate);
  },

  getDeviceEntryApprovals(): DeviceEntryApproval[] {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(STORAGE_KEYS.DEVICE_APPROVALS);
    if (!raw) return [];
    try {
      const parsed: DeviceEntryApproval[] = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      const nowMs = Date.now();
      let mutated = false;
      const normalized = parsed.map((item) => {
        if (
          (item.status === 'pending' || item.status === 'check_in_requested') &&
          nowMs >= Date.parse(item.expiresAt)
        ) {
          mutated = true;
          return { ...item, status: 'expired' as const };
        }
        return item;
      });
      if (mutated) {
        localStorage.setItem(STORAGE_KEYS.DEVICE_APPROVALS, JSON.stringify(normalized));
      }
      return normalized;
    } catch {
      return [];
    }
  },

  getActiveNewDeviceLock(employeeId: string): DeviceEntryApproval | null {
    if (!employeeId) return null;
    const nowMs = Date.now();
    const list = this.getDeviceEntryApprovals();
    return (
      list.find(
        (item) =>
          item.employeeId === employeeId &&
          (item.status === 'pending' || item.status === 'check_in_requested' || item.status === 'rejected') &&
          nowMs < Date.parse(item.expiresAt)
      ) || null
    );
  },

  enforceNewDeviceCheckInGate(
    emp: Employee,
    sourceLabel: string = 'Mobil / Kiosk'
  ): { blocked: boolean; message: string; approval?: DeviceEntryApproval } {
    const activeLock = this.getActiveNewDeviceLock(emp.id);
    if (!activeLock) {
      return { blocked: false, message: '' };
    }

    const nowMs = Date.now();
    const remainingMins = Math.max(1, Math.ceil((Date.parse(activeLock.expiresAt) - nowMs) / 60000));

    if (activeLock.status === 'rejected') {
      return {
        blocked: true,
        approval: activeLock,
        message: `Yeni cihazdan giriş talebiniz yönetici tarafından reddedildi. ${remainingMins} dakika içinde yalnızca yönetici onaylarsa iş yerine giriş yapabilirsiniz.`,
      };
    }

    const list = this.getDeviceEntryApprovals();
    const idx = list.findIndex((x) => x.id === activeLock.id);
    const prevReqTime = activeLock.checkInRequestedAt ? Date.parse(activeLock.checkInRequestedAt) : 0;
    const shouldNotify = !prevReqTime || nowMs - prevReqTime > 15000;

    const updatedItem: DeviceEntryApproval = {
      ...activeLock,
      status: 'check_in_requested',
      checkInRequestedAt: new Date().toISOString(),
    };
    if (idx >= 0) {
      list[idx] = updatedItem;
    } else {
      list.unshift(updatedItem);
    }
    localStorage.setItem(STORAGE_KEYS.DEVICE_APPROVALS, JSON.stringify(list));

    if (shouldNotify) {
      this.addNotification({
        type: 'device_alert',
        title: 'İş Yeri Girişi İçin Yönetici Onayı Bekleniyor',
        message: `${emp.fullName} (${emp.department}), yeni cihaz (${updatedItem.newDeviceName}) ile giriş yaptıktan sonraki 1 saatlik pencerede (${remainingMins} dk kaldı) ${sourceLabel} üzerinden iş yerine giriş denemesi yaptı. Onaylamanız bekleniyor.`,
        employeeId: emp.id,
        employeeName: emp.fullName,
        department: emp.department,
        severity: 'critical',
        targetRole: 'ik_yoneticisi',
        metadata: {
          deviceApprovalId: updatedItem.id,
          newDeviceName: updatedItem.newDeviceName,
          expiresAt: updatedItem.expiresAt,
        },
      });
    }

    pushBatchToServer({
      deviceApprovals: list,
      notifications: this.getNotifications(),
    });
    window.dispatchEvent(new CustomEvent('pdks-data-synced'));

    return {
      blocked: true,
      approval: updatedItem,
      message: `Farklı cihazdan giriş yaptığınız için ${remainingMins} dakika boyunca ilk iş yeri girişiniz yalnızca yönetici tarafından onaylanabilir. Onay talebi yöneticiye iletildi.`,
    };
  },

  requestNewDeviceCheckInApproval(employeeId: string): {
    success: boolean;
    message: string;
    approval?: DeviceEntryApproval;
  } {
    const emp = this.getEmployees().find((e) => e.id === employeeId);
    if (!emp) {
      return { success: false, message: 'Personel bulunamadı.' };
    }
    const activeLock = this.getActiveNewDeviceLock(employeeId);
    if (!activeLock) {
      return { success: false, message: 'Aktif yeni cihaz bekleme kaydı bulunamadı.' };
    }

    const list = this.getDeviceEntryApprovals();
    const idx = list.findIndex((x) => x.id === activeLock.id);
    const updatedItem: DeviceEntryApproval = {
      ...activeLock,
      status: 'check_in_requested',
      checkInRequestedAt: new Date().toISOString(),
    };
    if (idx >= 0) list[idx] = updatedItem;
    localStorage.setItem(STORAGE_KEYS.DEVICE_APPROVALS, JSON.stringify(list));

    const remainingMins = Math.max(1, Math.ceil((Date.parse(updatedItem.expiresAt) - Date.now()) / 60000));
    this.addNotification({
      type: 'device_alert',
      title: 'Yeni Cihaz İlk İş Yeri Giriş Onay Talebi',
      message: `${emp.fullName} (@${updatedItem.username}) yeni cihazından (${updatedItem.newDeviceName}) 1 saatlik süre içinde iş yerine ilk giriş için yönetici onayı talep etti. (Kalan süre: ${remainingMins} dk)`,
      employeeId: emp.id,
      employeeName: emp.fullName,
      department: emp.department,
      severity: 'critical',
      targetRole: 'ik_yoneticisi',
      metadata: {
        deviceApprovalId: updatedItem.id,
        newDeviceName: updatedItem.newDeviceName,
        expiresAt: updatedItem.expiresAt,
      },
    });

    pushBatchToServer({
      deviceApprovals: list,
      notifications: this.getNotifications(),
    });
    window.dispatchEvent(new CustomEvent('pdks-data-synced'));

    return {
      success: true,
      message: 'İş yeri giriş onay talebiniz İK Yöneticisine iletildi. Yönetici onayladığında girişiniz tamamlanacaktır.',
      approval: updatedItem,
    };
  },

  approveDeviceEntryRequest(
    requestId: string,
    options?: { bindNewDevice?: boolean; actorName?: string }
  ): { success: boolean; message: string; approval?: DeviceEntryApproval; record?: AttendanceRecord } {
    const active = this.getActiveUser();
    if (active?.role !== 'ik_yoneticisi') {
      return { success: false, message: 'Yetkisiz İşlem: Yeni cihazdan iş yeri girişini yalnızca İK Yöneticisi onaylayabilir.' };
    }

    const list = this.getDeviceEntryApprovals();
    const idx = list.findIndex((x) => x.id === requestId);
    if (idx < 0) {
      return { success: false, message: 'Onay talebi bulunamadı.' };
    }

    const req = { ...list[idx] };
    const now = new Date();
    const nowIso = now.toISOString();
    const timeStr = now.toTimeString().split(' ')[0];
    const dateStr = getTodayString();
    const actorName = options?.actorName || active.name || 'İK Yöneticisi';

    req.status = 'approved';
    req.resolvedAt = nowIso;
    req.resolvedBy = actorName;
    req.decisionNote = options?.bindNewDevice
      ? 'İş yeri girişi onaylandı ve yeni cihaz kayıtlı cihaz olarak tanımlandı.'
      : 'İlk iş yeri girişi yönetici tarafından onaylandı.';
    list[idx] = req;
    localStorage.setItem(STORAGE_KEYS.DEVICE_APPROVALS, JSON.stringify(list));

    // Optionally bind the new device as registered device on the user account & employee profile
    const accounts = this.getUserAccounts();
    if (options?.bindNewDevice) {
      const acc = accounts.find((a) => a.id === req.accountId || a.employeeId === req.employeeId);
      if (acc) {
        acc.registeredDeviceId = req.newDeviceId;
        acc.registeredMacAddress = req.newMacAddress || acc.registeredMacAddress;
        acc.registeredDeviceFingerprint = req.newDeviceFingerprint || acc.registeredDeviceFingerprint;
        acc.registeredDeviceName = req.newDeviceName;
        acc.registeredDeviceAt = nowIso;
        localStorage.setItem(STORAGE_KEYS.ACCOUNTS, JSON.stringify(accounts));
      }
    }

    // Perform the employee's first workplace check-in if currently outside
    const employees = this.getEmployees();
    const empIdx = employees.findIndex((e) => e.id === req.employeeId);
    let createdRecord: AttendanceRecord | undefined;

    if (empIdx >= 0) {
      const emp = { ...employees[empIdx] };
      if (options?.bindNewDevice) {
        emp.registeredDeviceId = req.newDeviceId;
        emp.registeredMacAddress = req.newMacAddress || emp.registeredMacAddress;
        emp.registeredDeviceFingerprint = req.newDeviceFingerprint || emp.registeredDeviceFingerprint;
        emp.registeredDeviceName = req.newDeviceName;
        emp.registeredDeviceAt = nowIso;
      }
      if (emp.currentPresence === 'outside') {
        const shifts = this.getShifts();
        const shift = shifts.find((s) => s.id === emp.shiftId) || shifts[0];
        let status: AttendanceStatus = 'on_time';
        let lateMinutes = 0;
        if (shift) {
          const [startHour, startMin] = shift.startTime.split(':').map(Number);
          const shiftStartMins = startHour * 60 + startMin;
          const currentMinutes = now.getHours() * 60 + now.getMinutes();
          const diff = currentMinutes - shiftStartMins;
          if (diff > shift.toleranceMinutes) {
            status = 'late';
            lateMinutes = diff;
          }
        }

        emp.currentPresence = 'inside';
        emp.lastActionTime = timeStr;
        employees[empIdx] = emp;
        localStorage.setItem(STORAGE_KEYS.EMPLOYEES, JSON.stringify(employees));

        createdRecord = {
          id: `DEVIN-${Date.now().toString().slice(-6)}`,
          employeeId: emp.id,
          employeeName: emp.fullName,
          department: emp.department,
          date: dateStr,
          type: 'check_in',
          timestamp: nowIso,
          timeStr,
          method: 'manual_admin',
          status,
          lateMinutes,
          note: `Yeni cihaz (${req.newDeviceName}${req.newMacAddress ? ` · ${req.newMacAddress}` : ''}) ilk giriş yönetici onayı`,
          terminal: `Yönetici Onaylı Giriş (${actorName})`,
          deviceId: req.newDeviceId,
          macAddress: req.newMacAddress,
          deviceName: req.newDeviceName,
        };

        const records = this.getAttendanceRecords();
        records.unshift(createdRecord);
        localStorage.setItem(STORAGE_KEYS.RECORDS, JSON.stringify(records));
      } else if (options?.bindNewDevice) {
        employees[empIdx] = emp;
        localStorage.setItem(STORAGE_KEYS.EMPLOYEES, JSON.stringify(employees));
      }

      this.addNotification({
        type: 'device_alert',
        title: 'İş Yeri Girişiniz Onaylandı',
        message: `${req.newDeviceName} cihazıyla giriş yaptıktan sonraki ilk iş yeri girişiniz ${actorName} tarafından onaylandı.${options?.bindNewDevice ? ' Ayrıca bu cihaz yeni kayıtlı cihazınız olarak tanımlandı.' : ''}`,
        employeeId: emp.id,
        employeeName: emp.fullName,
        department: emp.department,
        severity: 'info',
        metadata: {
          deviceApprovalId: req.id,
          newDeviceName: req.newDeviceName,
          macAddress: req.newMacAddress,
          deviceId: req.newDeviceId,
        },
      });
    }

    pushBatchToServer({
      deviceApprovals: this.getDeviceEntryApprovals(),
      employees: this.getEmployees(),
      records: this.getAttendanceRecords(),
      accounts: this.getUserAccounts(),
      notifications: this.getNotifications(),
    });
    window.dispatchEvent(new CustomEvent('pdks-data-synced'));

    return {
      success: true,
      message: `${req.employeeName} için yeni cihaz ilk iş yeri girişi onaylandı.${options?.bindNewDevice ? ' Yeni cihaz kaydedildi.' : ''}`,
      approval: req,
      record: createdRecord,
    };
  },

  rejectDeviceEntryRequest(
    requestId: string,
    reason?: string,
    actorName?: string
  ): { success: boolean; message: string; approval?: DeviceEntryApproval } {
    const active = this.getActiveUser();
    if (active?.role !== 'ik_yoneticisi') {
      return { success: false, message: 'Yetkisiz İşlem: Bu işlem yalnızca İK Yöneticisine aittir.' };
    }

    const list = this.getDeviceEntryApprovals();
    const idx = list.findIndex((x) => x.id === requestId);
    if (idx < 0) {
      return { success: false, message: 'Onay talebi bulunamadı.' };
    }

    const req = { ...list[idx] };
    const actor = actorName || active.name || 'İK Yöneticisi';
    req.status = 'rejected';
    req.resolvedAt = new Date().toISOString();
    req.resolvedBy = actor;
    req.decisionNote = reason?.trim() || 'Yönetici tarafından reddedildi.';
    list[idx] = req;
    localStorage.setItem(STORAGE_KEYS.DEVICE_APPROVALS, JSON.stringify(list));

    this.addNotification({
      type: 'device_alert',
      title: 'Yeni Cihaz İş Yeri Girişi Reddedildi',
      message: `${req.newDeviceName} cihazıyla yaptığınız iş yeri giriş talebi ${actor} tarafından reddedildi.${reason ? ` Sebep: ${reason}` : ''}`,
      employeeId: req.employeeId,
      employeeName: req.employeeName,
      department: (req.department || 'Genel') as any,
      severity: 'critical',
      metadata: {
        deviceApprovalId: req.id,
        newDeviceName: req.newDeviceName,
        macAddress: req.newMacAddress,
        deviceId: req.newDeviceId,
      },
    });

    pushBatchToServer({
      deviceApprovals: list,
      notifications: this.getNotifications(),
    });
    window.dispatchEvent(new CustomEvent('pdks-data-synced'));

    return {
      success: true,
      message: `${req.employeeName} için yeni cihaz giriş talebi reddedildi.`,
      approval: req,
    };
  },

  resetEmployeeRegisteredDevice(
    employeeId: string,
    actorName?: string
  ): { success: boolean; message: string } {
    const active = this.getActiveUser();
    if (active?.role !== 'ik_yoneticisi') {
      return { success: false, message: 'Yetkisiz İşlem: Cihaz sıfırlama yetkisi yalnızca İK Yöneticisine aittir.' };
    }
    const accounts = this.getUserAccounts();
    const acc = accounts.find((a) => a.employeeId === employeeId);
    const employees = this.getEmployees();
    const emp = employees.find((e) => e.id === employeeId);

    if (!acc && !emp) {
      return { success: false, message: 'Personel veya giriş hesabı bulunamadı.' };
    }

    if (acc) {
      delete acc.registeredDeviceId;
      delete acc.registeredMacAddress;
      delete acc.registeredDeviceFingerprint;
      delete acc.registeredDeviceName;
      delete acc.registeredDeviceAt;
      localStorage.setItem(STORAGE_KEYS.ACCOUNTS, JSON.stringify(accounts));
    }

    if (emp) {
      delete emp.registeredDeviceId;
      delete emp.registeredMacAddress;
      delete emp.registeredDeviceFingerprint;
      delete emp.registeredDeviceName;
      delete emp.registeredDeviceAt;
      localStorage.setItem(STORAGE_KEYS.EMPLOYEES, JSON.stringify(employees));
    }

    // Expire any active lock for this employee
    const approvals = this.getDeviceEntryApprovals().map((item) =>
      item.employeeId === employeeId &&
      (item.status === 'pending' || item.status === 'check_in_requested' || item.status === 'rejected')
        ? { ...item, status: 'expired' as const, resolvedAt: new Date().toISOString(), resolvedBy: actorName || active.name }
        : item
    );
    localStorage.setItem(STORAGE_KEYS.DEVICE_APPROVALS, JSON.stringify(approvals));

    pushBatchToServer({
      accounts,
      employees,
      deviceApprovals: approvals,
    });
    window.dispatchEvent(new CustomEvent('pdks-data-synced'));

    const displayName = acc?.name || emp?.fullName || employeeId;
    return {
      success: true,
      message: `${displayName} personelin kayıtlı cihazı (MAC / Device ID) sıfırlandı. Bir sonraki giriş yaptığı cihaz otomatik tanımlanacaktır.`,
    };
  },

  logout(): void {
    localStorage.setItem(STORAGE_KEYS.IS_LOGGED_OUT, 'true');
    localStorage.removeItem(STORAGE_KEYS.ACTIVE_USER);
    applyThemeToDocument(DEFAULT_THEME_ID);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('pdks-theme-updated', { detail: DEFAULT_THEME_ID }));
    }
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
      if (parsed.username === 'emre.demir' || parsed.employeeId === 'EMP-1003') {
        parsed.title = 'Finansal Kontrolör';
      }
      if (!isValidThemeId(parsed.themeId)) {
        parsed.themeId = this.getUserTheme(parsed);
      }
      return parsed;
    } catch {
      return DEMO_USERS[0];
    }
  },

  setActiveUser(user: CurrentUser): void {
    localStorage.removeItem(STORAGE_KEYS.IS_LOGGED_OUT);
    const resolvedTheme = isValidThemeId(user.themeId) ? user.themeId : this.getUserTheme(user);
    const enrichedUser: CurrentUser = { ...user, themeId: resolvedTheme };
    localStorage.setItem(STORAGE_KEYS.ACTIVE_USER, JSON.stringify(enrichedUser));
    applyThemeToDocument(resolvedTheme);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('pdks-theme-updated', { detail: resolvedTheme }));
    }
  },

  // Per-User Personal Theme Management (Account-Scoped + Server + Firebase Sync)
  getUserTheme(
    targetUser?: Partial<Pick<CurrentUser, 'id' | 'username' | 'employeeId' | 'themeId'>> | null
  ): ThemeId {
    const refUser = targetUser || (this.isLoggedIn() ? this.getActiveUser() : null);
    if (!refUser) return DEFAULT_THEME_ID;

    try {
      const accounts = this.getUserAccounts();
      const normUser = normalizeUsername(refUser.username || '');
      const matched = accounts.find(
        (a) =>
          (refUser.id && a.id === refUser.id) ||
          (normUser && normalizeUsername(a.username) === normUser) ||
          (refUser.employeeId && a.employeeId === refUser.employeeId)
      );
      if (matched && isValidThemeId(matched.themeId)) {
        return matched.themeId;
      }
    } catch {}

    if (isValidThemeId(refUser.themeId)) {
      return refUser.themeId;
    }

    try {
      const keySuffix = normalizeUsername(refUser.username || '') || refUser.id || refUser.employeeId || '';
      if (keySuffix) {
        const stored = localStorage.getItem(`pdks_user_theme_v1_${keySuffix}`);
        if (isValidThemeId(stored)) {
          return stored;
        }
      }
    } catch {}

    return DEFAULT_THEME_ID;
  },

  async saveUserTheme(
    themeId: ThemeId,
    targetUser?: CurrentUser | null
  ): Promise<{ success: boolean; themeId: ThemeId; cloudSynced: boolean; message: string }> {
    if (!isValidThemeId(themeId)) {
      return {
        success: false,
        themeId: DEFAULT_THEME_ID,
        cloudSynced: false,
        message: 'Geçersiz tema seçimi.',
      };
    }

    const active = targetUser || this.getActiveUser();
    const nowIso = new Date().toISOString();
    const normUser = normalizeUsername(active.username || '');

    // 1. Update matching UserAccount in STORAGE_KEYS.ACCOUNTS
    let matchedAccountId = active.id;
    try {
      const accounts = this.getUserAccounts();
      const idx = accounts.findIndex(
        (a) =>
          (active.id && a.id === active.id) ||
          (normUser && normalizeUsername(a.username) === normUser) ||
          (active.employeeId && a.employeeId === active.employeeId)
      );
      if (idx >= 0) {
        matchedAccountId = accounts[idx].id;
        accounts[idx] = {
          ...accounts[idx],
          themeId,
          themeUpdatedAt: nowIso,
        };
        localStorage.setItem(STORAGE_KEYS.ACCOUNTS, JSON.stringify(accounts));
      }
    } catch {}

    // 2. Save per-account localStorage cache
    try {
      const keySuffix = normUser || matchedAccountId || active.employeeId || '';
      if (keySuffix) {
        localStorage.setItem(`pdks_user_theme_v1_${keySuffix}`, themeId);
      }
    } catch {}

    // 3. Update active user record and immediately apply to DOM if saving for active user
    try {
      if (this.isLoggedIn()) {
        const currentActive = this.getActiveUser();
        const isSameUser =
          currentActive.id === active.id ||
          (normUser && normalizeUsername(currentActive.username) === normUser);
        if (isSameUser) {
          const updatedActive: CurrentUser = {
            ...currentActive,
            themeId,
            themeUpdatedAt: nowIso,
          };
          localStorage.setItem(STORAGE_KEYS.ACTIVE_USER, JSON.stringify(updatedActive));
          applyThemeToDocument(themeId);
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('pdks-theme-updated', { detail: themeId }));
          }
        }
      }
    } catch {}

    // 4. Persist to backend server DB (/api/user/theme) so other browsers/sessions on this account pick it up
    if (typeof window !== 'undefined' && typeof fetch === 'function') {
      try {
        const res = await fetch('/api/user/theme', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            accountId: matchedAccountId,
            username: active.username,
            employeeId: active.employeeId,
            themeId,
          }),
        });
        const json = await res.json().catch(() => null);
        if (res.ok && json?.version) {
          localDbVersion = json.version;
          try { localStorage.setItem('pdks_db_version_v1', String(localDbVersion)); } catch {}
        }
      } catch (err) {
        console.warn('User theme API sync error:', err);
      }
    }

    // 5. Also persist to Firebase Firestore if Google Auth is active
    let cloudSynced = false;
    if (auth.currentUser) {
      try {
        const accountKey = matchedAccountId || normUser || active.employeeId || 'default';
        cloudSynced = await saveUserThemeToFirestore(accountKey, themeId);
      } catch (err) {
        console.warn('User theme Firestore sync error:', err);
      }
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('pdks-data-synced'));
    }

    return {
      success: true,
      themeId,
      cloudSynced,
      message: 'Hesap temanız kaydedildi ve profilinize uygulandı.',
    };
  },

  async syncUserThemesFromCloud(): Promise<void> {
    if (typeof window === 'undefined' || !auth.currentUser) return;
    try {
      const cloudMap = await fetchAllUserThemesFromFirestore();
      const entries = Object.entries(cloudMap);
      if (entries.length === 0) return;

      const accounts = this.getUserAccounts();
      let changed = false;
      for (const [accountKey, cloudTheme] of entries) {
        if (!isValidThemeId(cloudTheme)) continue;
        const acc = accounts.find(
          (a) =>
            a.id === accountKey ||
            normalizeUsername(a.username) === normalizeUsername(accountKey) ||
            a.employeeId === accountKey
        );
        if (acc && !isValidThemeId(acc.themeId)) {
          acc.themeId = cloudTheme;
          changed = true;
        }
      }

      if (changed) {
        localStorage.setItem(STORAGE_KEYS.ACCOUNTS, JSON.stringify(accounts));
        if (this.isLoggedIn()) {
          const active = this.getActiveUser();
          const refreshedTheme = this.getUserTheme(active);
          applyThemeToDocument(refreshedTheme);
          window.dispatchEvent(new CustomEvent('pdks-theme-updated', { detail: refreshedTheme }));
        }
      }
    } catch (err) {
      console.warn('syncUserThemesFromCloud error:', err);
    }
  },

  // Company Logo Management (Standard Dimensions & İK Authorization + Firestore Cloud Persistence)
  getCompanyLogo(): string {
    if (firestoreAuthoritativeLogo && firestoreAuthoritativeLogo.trim() && !firestoreAuthoritativeLogo.startsWith('blob:')) {
      return normalizeCompanyLogoSrc(firestoreAuthoritativeLogo);
    }
    if (inMemoryCompanyLogo && inMemoryCompanyLogo.trim() && !inMemoryCompanyLogo.startsWith('blob:')) {
      return normalizeCompanyLogoSrc(inMemoryCompanyLogo);
    }
    try {
      const custom = localStorage.getItem(STORAGE_KEYS.COMPANY_LOGO);
      if (custom && custom.trim() && !custom.startsWith('blob:')) {
        inMemoryCompanyLogo = normalizeCompanyLogoSrc(custom);
        return inMemoryCompanyLogo;
      }
    } catch {}
    return DEFAULT_COMPANY_LOGO;
  },

  subscribeToCloudLogo(): () => void {
    if (typeof window === 'undefined') return () => {};
    return subscribeCompanyLogoFromFirestore((cloudLogo) => {
      firestoreAuthoritativeLogo = cloudLogo;
      applyCompanyLogoLocally(cloudLogo, true);
      if (hasCustomLogoValue(cloudLogo)) {
        void warmServerLogoIfNeeded(cloudLogo);
      }
    });
  },

  async fetchCompanyLogoFromServer(): Promise<string> {
    if (typeof window === 'undefined') return pdksStorage.getCompanyLogo();

    try {
      const cloudLogo = await fetchCompanyLogoFromFirestore();
      if (cloudLogo) {
        firestoreAuthoritativeLogo = cloudLogo;
        applyCompanyLogoLocally(cloudLogo, true);
        if (hasCustomLogoValue(cloudLogo)) {
          void warmServerLogoIfNeeded(cloudLogo);
        }
        return cloudLogo;
      }
    } catch (err) {
      console.warn('fetchCompanyLogoFromFirestore error:', err);
    }

    if (typeof fetch !== 'function') return pdksStorage.getCompanyLogo();
    try {
      const res = await fetch('/api/company/logo', { headers: { 'Cache-Control': 'no-cache' } });
      if (res.ok) {
        const data = await res.json();
        if (data && data.success && typeof data.logo === 'string' && data.logo.trim() && !data.logo.startsWith('blob:')) {
          const logoVal = data.logo.trim();
          if (typeof data.version === 'number') {
            localDbVersion = data.version;
            try { localStorage.setItem('pdks_db_version_v1', String(localDbVersion)); } catch {}
          }
          const currentLocal = pdksStorage.getCompanyLogo();
          if (!hasCustomLogoValue(logoVal) && hasCustomLogoValue(currentLocal)) {
            void warmServerLogoIfNeeded(currentLocal);
            return currentLocal;
          }
          applyCompanyLogoLocally(logoVal, true);
          return logoVal;
        }
      }
    } catch (err) {
      console.warn('fetchCompanyLogoFromServer error:', err);
    }
    return pdksStorage.getCompanyLogo();
  },

  hasCustomCompanyLogo(): boolean {
    const current = this.getCompanyLogo();
    return Boolean(current && current !== DEFAULT_COMPANY_LOGO);
  },

  async saveCompanyLogoAsync(
    logoUrl: string | null
  ): Promise<{ success: boolean; message: string; logo: string; cloudSynced: boolean }> {
    const rawTrimmed = normalizeCompanyLogoSrc(logoUrl);
    if (rawTrimmed.startsWith('blob:')) {
      return {
        success: false,
        cloudSynced: false,
        message: 'Geçici dosya bağlantısı (blob:) kaydedilemez. Lütfen görseli yeniden seçiniz.',
        logo: this.getCompanyLogo(),
      };
    }

    const val = rawTrimmed || DEFAULT_COMPANY_LOGO;
    if (val.length > COMPANY_LOGO_MAX_LENGTH) {
      return {
        success: false,
        cloudSynced: false,
        message: 'Logo görseli 900 KB boyut sınırını aşıyor. Lütfen daha küçük veya sıkıştırılmış bir görsel seçiniz.',
        logo: this.getCompanyLogo(),
      };
    }

    inMemoryCompanyLogo = val;
    try {
      if (rawTrimmed && val !== DEFAULT_COMPANY_LOGO) {
        localStorage.setItem(STORAGE_KEYS.COMPANY_LOGO, val);
      } else {
        localStorage.removeItem(STORAGE_KEYS.COMPANY_LOGO);
      }
    } catch (e) {
      console.warn('LocalStorage saveCompanyLogo quota warning:', e);
    }

    let serverSaved = false;
    let serverErrorMessage = '';

    if (typeof window !== 'undefined' && typeof fetch === 'function') {
      try {
        const res = await fetch('/api/company/logo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ logo: val }),
        });
        const json = await res.json().catch(() => null);
        if (res.ok && json?.success) {
          serverSaved = true;
          if (typeof json.version === 'number') {
            localDbVersion = json.version;
            try { localStorage.setItem('pdks_db_version_v1', String(localDbVersion)); } catch {}
          }
          if (typeof json.logo === 'string' && json.logo.trim()) {
            inMemoryCompanyLogo = json.logo.trim();
            lastWarmedCloudLogo = json.logo.trim();
          }
        } else {
          serverErrorMessage =
            json?.message || 'Logo sunucu önbelleğine kaydedilemedi.';
        }
      } catch (err) {
        console.warn('Logo API sync error:', err);
        serverErrorMessage = 'Sunucu bağlantısı kurulamadığı için yerel sunucu güncellenemedi.';
      }
    }

    let cloudSynced = false;
    let cloudErrorMessage = '';
    if (auth.currentUser) {
      try {
        await saveCompanyLogoToFirestore(val);
        firestoreAuthoritativeLogo = val;
        cloudSynced = true;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.warn('Logo Firestore sync error:', errMsg);
        if (errMsg.toLowerCase().includes('permission') || errMsg.includes('insufficient')) {
          cloudErrorMessage =
            'Firebase bulut yazma yetkisi reddedildi. Lütfen yetkili yönetici Google hesabı ile oturum açınız.';
        } else {
          cloudErrorMessage = errMsg;
        }
      }
    } else {
      cloudErrorMessage =
        'Farklı tarayıcılarda kalıcılık için yetkili Google hesabı ile bulut doğrulaması gereklidir.';
    }

    if (!serverSaved && !cloudSynced) {
      return {
        success: false,
        cloudSynced: false,
        message: cloudErrorMessage || serverErrorMessage || 'Logo kaydedilemedi.',
        logo: this.getCompanyLogo(),
      };
    }

    const finalSavedLogo = inMemoryCompanyLogo || val;
    window.dispatchEvent(new CustomEvent('pdks-logo-updated', { detail: finalSavedLogo }));
    window.dispatchEvent(new CustomEvent('pdks-data-synced'));

    if (cloudSynced) {
      return {
        success: true,
        cloudSynced: true,
        logo: finalSavedLogo,
        message: rawTrimmed
          ? 'Kurumsal şirket logosu kalıcı bulut veritabanına (Firebase) kaydedildi. Tüm tarayıcı ve cihazlarda kalıcıdır.'
          : 'Şirket logosu bulutta varsayılan standart logoya sıfırlandı.',
      };
    }

    return {
      success: true,
      cloudSynced: false,
      logo: finalSavedLogo,
      message: `${
        rawTrimmed ? 'Logo aktif sunucuya kaydedildi' : 'Logo aktif sunucuda sıfırlandı'
      }, ancak bulut kaydı tamamlanamadı: ${cloudErrorMessage}`,
    };
  },

  saveCompanyLogo(logoUrl: string | null): { success: boolean; message: string } {
    const rawTrimmed = logoUrl && logoUrl.trim() ? logoUrl.trim() : '';
    if (rawTrimmed.startsWith('blob:')) {
      return {
        success: false,
        message: 'Geçici blob: adresi kaydedilemez.',
      };
    }
    const val = rawTrimmed || DEFAULT_COMPANY_LOGO;
    inMemoryCompanyLogo = val;
    try {
      if (rawTrimmed && val !== DEFAULT_COMPANY_LOGO) {
        localStorage.setItem(STORAGE_KEYS.COMPANY_LOGO, val);
      } else {
        localStorage.removeItem(STORAGE_KEYS.COMPANY_LOGO);
      }
    } catch (e) {
      console.warn('LocalStorage saveCompanyLogo quota warning:', e);
    }

    void this.saveCompanyLogoAsync(logoUrl);
    return {
      success: true,
      message: rawTrimmed
        ? 'Kurumsal şirket logosu güncellendi.'
        : 'Şirket logosu varsayılan standart logoya sıfırlandı.',
    };
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
    pushToServer('kioskLockPassword', trimmed);
    window.dispatchEvent(new CustomEvent('pdks-data-synced'));
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
    pushToServer('supervisorAssignments', list);
    window.dispatchEvent(new CustomEvent('pdks-data-synced'));

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
      pushToServer('accounts', accounts);
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
    pushToServer('supervisorAssignments', list);
    window.dispatchEvent(new CustomEvent('pdks-data-synced'));
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
        // Selim Dağlı - Logistics
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
    localStorage.setItem(STORAGE_KEYS.DEVICE_APPROVALS, JSON.stringify([]));
    localStorage.setItem(STORAGE_KEYS.ACTIVE_USER, JSON.stringify(DEMO_USERS[0]));
    localStorage.removeItem(STORAGE_KEYS.IS_LOGGED_OUT);

    try {
      if (typeof window !== 'undefined' && typeof fetch === 'function') {
        fetch('/api/reset-to-demo', { method: 'POST' }).catch(() => {});
      }
    } catch {
      // ignore
    }

    window.dispatchEvent(new CustomEvent('pdks-data-synced'));
  },
};
