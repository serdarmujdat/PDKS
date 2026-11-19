import 'dotenv/config';
import express from 'express';
import type { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import crypto from 'crypto';
import {
  createInitialDatabase,
  getTodayString,
  DEFAULT_COMPANY_NAME,
  CANONICAL_SHIFT_TEMPLATES,
} from './src/db/defaultData.ts';
import type { PDKSDatabase } from './src/db/defaultData.ts';
import type {
  ActionType,
  AppPageKey,
  AttendanceRecord,
  Employee,
  Shift,
  EmployeeShiftAssignment,
  LeaveRequest,
  OvertimeRequest,
  PDKSNotification,
  UserAccount,
  UserCustomPermissions,
  SupervisorAssignment,
  SystemSettings,
} from './src/types/pdks';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const isDev = process.env.NODE_ENV !== 'production';
const PORT = Number(process.env.PORT) || 3000;

// Super Admin Cryptographic Verification (reads .env SUPER_ADMIN_USER / SUPER_ADMIN_PASS when defined,
// otherwise verifies against salted cryptographic digests so zero plaintext secrets reside in code)
const SUPER_ADMIN_USER_SHA256 = '80802ed665136a1d27474361f85b32aa8ddc505bfac518d347d17f07a685e54b';
const SUPER_ADMIN_PASS_SALT = 'pdks_sa_v1_9f4c2a8b';
const SUPER_ADMIN_PASS_SCRYPT = 'a5dbd6bb91a917311377f265093120ccddb9521df519ced4ee4603f5ed84265b';
const SUPER_ADMIN_SESSION_SECRET =
  process.env.SUPER_ADMIN_SESSION_SECRET || crypto.randomBytes(32).toString('hex');

const FULL_SUPER_ADMIN_PERMISSIONS: UserCustomPermissions = {
  allowedPages: ['dashboard', 'employees', 'records', 'shifts', 'performance', 'reports', 'kiosk', 'portal'],
  canCreate: true,
  canEdit: true,
  canDelete: true,
  canApprove: true,
  canExportReports: true,
  canManageDevices: true,
  canManageSettings: true,
  canClearLogs: true,
  canChangeCompanyName: true,
  canManagePermissions: true,
  canManageShifts: true,
  isFullAdmin: true,
};

const VALID_APP_PAGE_KEYS = new Set<AppPageKey>([
  'dashboard',
  'employees',
  'records',
  'shifts',
  'performance',
  'reports',
  'kiosk',
  'portal',
]);

const BOOLEAN_PERMISSION_KEYS = [
  'canCreate',
  'canEdit',
  'canDelete',
  'canApprove',
  'canExportReports',
  'canManageDevices',
  'canManageSettings',
  'canClearLogs',
  'canManagePermissions',
  'canManageShifts',
] as const;

function getDefaultPermissionsForRoleServer(
  role: string,
  isShiftSupervisor?: boolean,
  canManageShiftsFlag?: boolean
): UserCustomPermissions {
  if (role === 'SUPER_ADMIN') {
    return { ...FULL_SUPER_ADMIN_PERMISSIONS, allowedPages: [...FULL_SUPER_ADMIN_PERMISSIONS.allowedPages] };
  }
  if (role === 'ik_yoneticisi') {
    return {
      allowedPages: ['dashboard', 'employees', 'records', 'shifts', 'performance', 'reports', 'kiosk', 'portal'],
      canCreate: true,
      canEdit: true,
      canDelete: true,
      canApprove: true,
      canExportReports: true,
      canManageDevices: true,
      canManageSettings: true,
      canClearLogs: false,
      canChangeCompanyName: false,
      canManagePermissions: false,
      canManageShifts: true,
      isFullAdmin: false,
    };
  }
  if (role === 'birim_amiri') {
    const shiftEditEnabled = typeof canManageShiftsFlag === 'boolean' ? canManageShiftsFlag : true;
    return {
      allowedPages: ['shifts', 'kiosk', 'portal'],
      canCreate: false,
      canEdit: false,
      canDelete: false,
      canApprove: true,
      canExportReports: true,
      canManageDevices: false,
      canManageSettings: false,
      canClearLogs: false,
      canChangeCompanyName: false,
      canManagePermissions: false,
      canManageShifts: shiftEditEnabled,
      isFullAdmin: false,
    };
  }
  if (role === 'yonetici') {
    const shiftEditEnabled =
      typeof canManageShiftsFlag === 'boolean' ? canManageShiftsFlag : Boolean(isShiftSupervisor);
    return {
      allowedPages: ['shifts', 'kiosk', 'portal'],
      canCreate: false,
      canEdit: false,
      canDelete: false,
      canApprove: true,
      canExportReports: true,
      canManageDevices: false,
      canManageSettings: false,
      canClearLogs: false,
      canChangeCompanyName: false,
      canManagePermissions: false,
      canManageShifts: shiftEditEnabled,
      isFullAdmin: false,
    };
  }
  const shiftEditEnabled = typeof canManageShiftsFlag === 'boolean' ? canManageShiftsFlag : false;
  return {
    allowedPages: ['shifts', 'kiosk', 'portal'],
    canCreate: false,
    canEdit: false,
    canDelete: false,
    canApprove: false,
    canExportReports: false,
    canManageDevices: false,
    canManageSettings: false,
    canClearLogs: false,
    canChangeCompanyName: false,
    canManagePermissions: false,
    canManageShifts: shiftEditEnabled,
    isFullAdmin: false,
  };
}

function getEffectivePermissionsServer(user: Partial<UserAccount> | null | undefined): UserCustomPermissions {
  if (!user) return getDefaultPermissionsForRoleServer('personel', false, false);
  if (user.role === 'SUPER_ADMIN' || user.isHiddenSuperAdmin) {
    return { ...FULL_SUPER_ADMIN_PERMISSIONS, allowedPages: [...FULL_SUPER_ADMIN_PERMISSIONS.allowedPages] };
  }
  const base = getDefaultPermissionsForRoleServer(
    user.role || 'personel',
    user.isShiftSupervisor,
    user.can_manage_shifts
  );
  const custom = user.customPermissions;
  const resolvedCanManageShifts =
    user.role === 'ik_yoneticisi'
      ? true
      : typeof user.can_manage_shifts === 'boolean'
        ? user.can_manage_shifts
        : typeof custom?.canManageShifts === 'boolean'
          ? custom.canManageShifts
          : Boolean(base.canManageShifts);
  if (!custom) {
    return {
      ...base,
      canManageShifts: resolvedCanManageShifts,
    };
  }
  const isFullAdmin = Boolean(custom.isFullAdmin);
  const pages = Array.isArray(custom.allowedPages)
    ? custom.allowedPages.filter((p) => VALID_APP_PAGE_KEYS.has(p))
    : [...base.allowedPages];
  // Ensure read-only access to shifts page is always available for logged-in staff
  if (!pages.includes('shifts')) {
    pages.push('shifts');
  }
  return {
    allowedPages: pages,
    canCreate: typeof custom.canCreate === 'boolean' ? custom.canCreate : base.canCreate,
    canEdit: typeof custom.canEdit === 'boolean' ? custom.canEdit : base.canEdit,
    canDelete: typeof custom.canDelete === 'boolean' ? custom.canDelete : base.canDelete,
    canApprove: typeof custom.canApprove === 'boolean' ? custom.canApprove : base.canApprove,
    canExportReports: typeof custom.canExportReports === 'boolean' ? custom.canExportReports : base.canExportReports,
    canManageDevices: typeof custom.canManageDevices === 'boolean' ? custom.canManageDevices : base.canManageDevices,
    canManageSettings: typeof custom.canManageSettings === 'boolean' ? custom.canManageSettings : base.canManageSettings,
    canClearLogs: typeof custom.canClearLogs === 'boolean' ? custom.canClearLogs : base.canClearLogs,
    canChangeCompanyName: false,
    canManagePermissions: isFullAdmin || Boolean(custom.canManagePermissions),
    canManageShifts: resolvedCanManageShifts,
    isFullAdmin,
  };
}

function safeTimingEqualHex(hexA: string, hexB: string): boolean {
  try {
    const a = Buffer.from(hexA, 'hex');
    const b = Buffer.from(hexB, 'hex');
    if (a.length !== b.length || a.length === 0) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function verifySuperAdminCredentials(rawUsername: string, rawPassword: string): boolean {
  const cleanUser = (rawUsername || '').trim().replace(/^@+/, '').toLowerCase();
  const cleanPass = (rawPassword || '').trim();
  if (!cleanUser || !cleanPass) return false;

  const envUser = (process.env.SUPER_ADMIN_USER || '').trim().replace(/^@+/, '').toLowerCase();
  const envPass = (process.env.SUPER_ADMIN_PASS || '').trim();

  if (envUser && envPass) {
    const uHashA = crypto.createHash('sha256').update(cleanUser).digest('hex');
    const uHashB = crypto.createHash('sha256').update(envUser).digest('hex');
    const pHashA = crypto.createHash('sha256').update(cleanPass).digest('hex');
    const pHashB = crypto.createHash('sha256').update(envPass).digest('hex');
    return safeTimingEqualHex(uHashA, uHashB) && safeTimingEqualHex(pHashA, pHashB);
  }

  const userDigest = crypto.createHash('sha256').update(cleanUser).digest('hex');
  const passDigest = crypto.scryptSync(cleanPass, SUPER_ADMIN_PASS_SALT, 32).toString('hex');
  return (
    safeTimingEqualHex(userDigest, SUPER_ADMIN_USER_SHA256) &&
    safeTimingEqualHex(passDigest, SUPER_ADMIN_PASS_SCRYPT)
  );
}

function signSuperAdminToken(username: string): string {
  const payload = Buffer.from(
    JSON.stringify({ sub: 'SA-ROOT', role: 'SUPER_ADMIN', username, iat: Date.now() })
  ).toString('base64url');
  const sig = crypto
    .createHmac('sha256', SUPER_ADMIN_SESSION_SECRET)
    .update(payload)
    .digest('base64url');
  return `pdks_sa_${payload}.${sig}`;
}

function extractVerifiedSuperAdminUsername(token: string): string {
  if (!token || !token.startsWith('pdks_sa_')) return '';
  const raw = token.slice('pdks_sa_'.length);
  const parts = raw.split('.');
  if (parts.length !== 2) return '';
  const [payload, sig] = parts;
  const expectedSig = crypto
    .createHmac('sha256', SUPER_ADMIN_SESSION_SECRET)
    .update(payload)
    .digest('base64url');
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expectedSig);
    if (a.length !== b.length) return '';
    if (!crypto.timingSafeEqual(a, b)) return '';
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (decoded?.role === 'SUPER_ADMIN' && decoded?.sub === 'SA-ROOT') {
      return String(decoded?.username || '');
    }
    return '';
  } catch {
    return '';
  }
}

function verifySuperAdminToken(token: string): boolean {
  return Boolean(extractVerifiedSuperAdminUsername(token));
}

function signUserSessionToken(account: UserAccount): string {
  const payload = Buffer.from(
    JSON.stringify({
      sub: account.id,
      employeeId: account.employeeId,
      username: account.username,
      role: account.role,
      iat: Date.now(),
    })
  ).toString('base64url');
  const sig = crypto
    .createHmac('sha256', SUPER_ADMIN_SESSION_SECRET)
    .update(payload)
    .digest('base64url');
  return `pdks_usr_${payload}.${sig}`;
}

function verifyUserSessionToken(token: string): { sub: string; employeeId?: string; username: string } | null {
  if (!token || !token.startsWith('pdks_usr_')) return null;
  const raw = token.slice('pdks_usr_'.length);
  const parts = raw.split('.');
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  const expectedSig = crypto
    .createHmac('sha256', SUPER_ADMIN_SESSION_SECRET)
    .update(payload)
    .digest('base64url');
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expectedSig);
    if (a.length !== b.length) return null;
    if (!crypto.timingSafeEqual(a, b)) return null;
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (decoded?.sub && decoded?.role !== 'SUPER_ADMIN') {
      return {
        sub: String(decoded.sub),
        employeeId: decoded.employeeId ? String(decoded.employeeId) : undefined,
        username: String(decoded.username || ''),
      };
    }
    return null;
  } catch {
    return null;
  }
}

function extractUserSessionToken(req: Request): string {
  const headerToken = String(req.headers['x-pdks-session-token'] || '').trim();
  if (headerToken.startsWith('pdks_usr_')) return headerToken;
  const authHeader = String(req.headers.authorization || '');
  if (authHeader.startsWith('Bearer pdks_usr_')) {
    return authHeader.slice(7).trim();
  }
  return '';
}

function isHiddenSuperAdminItem(item: any): boolean {
  if (!item || typeof item !== 'object') return false;
  return (
    item.isHiddenSuperAdmin === true ||
    item.role === 'SUPER_ADMIN' ||
    item.employeeId === 'SA-ROOT' ||
    item.id === 'SA-ROOT'
  );
}

function isArchivedEmployeeServer(emp: Partial<Employee> | null | undefined): boolean {
  if (!emp) return false;
  return emp.isArchived === true || emp.status === 'inactive';
}

function isArchivedAccountServer(acc: Partial<UserAccount> | null | undefined): boolean {
  if (!acc) return false;
  return acc.isArchived === true || (!acc.isActive && Boolean(acc.archivedAt));
}

function isAdminOrManagerTargetServer(
  acc?: Partial<UserAccount> | null,
  emp?: Partial<Employee> | null
): boolean {
  if (isHiddenSuperAdminItem(acc) || isHiddenSuperAdminItem(emp)) return true;
  if (!acc && emp?.id && Array.isArray(dbState?.accounts)) {
    acc = dbState.accounts.find((a) => a.employeeId === emp.id && !isHiddenSuperAdminItem(a));
  }
  if (!acc) return false;
  const role = acc.role;
  const formerRole = acc.formerRole;
  if (
    role === 'SUPER_ADMIN' ||
    role === 'ik_yoneticisi' ||
    role === 'birim_amiri' ||
    role === 'yonetici'
  ) {
    return true;
  }
  if (
    formerRole === 'SUPER_ADMIN' ||
    formerRole === 'ik_yoneticisi' ||
    formerRole === 'birim_amiri' ||
    formerRole === 'yonetici'
  ) {
    return true;
  }
  if (acc.customPermissions?.isFullAdmin || acc.customPermissions?.canManagePermissions) {
    return true;
  }
  return false;
}

function resolveActorServer(req: Request): {
  isAuthenticated: boolean;
  isSuperAdmin: boolean;
  actorName: string;
  account?: UserAccount;
  perms: UserCustomPermissions;
} {
  const saToken = extractSuperAdminToken(req);
  if (verifySuperAdminToken(saToken)) {
    return {
      isAuthenticated: true,
      isSuperAdmin: true,
      actorName: 'Sistem Süper Yöneticisi',
      perms: { ...FULL_SUPER_ADMIN_PERMISSIONS, allowedPages: [...FULL_SUPER_ADMIN_PERMISSIONS.allowedPages] },
    };
  }
  const userToken = extractUserSessionToken(req);
  const claims = verifyUserSessionToken(userToken);
  if (!claims) {
    return {
      isAuthenticated: false,
      isSuperAdmin: false,
      actorName: '',
      perms: getDefaultPermissionsForRoleServer('personel', false),
    };
  }
  const actorAccount = dbState.accounts.find(
    (a) => !isHiddenSuperAdminItem(a) && a.isActive && !isArchivedAccountServer(a) && a.id === claims.sub
  );
  if (!actorAccount) {
    return {
      isAuthenticated: false,
      isSuperAdmin: false,
      actorName: '',
      perms: getDefaultPermissionsForRoleServer('personel', false),
    };
  }
  const linkedEmp = actorAccount.employeeId
    ? dbState.employees.find((e) => e.id === actorAccount.employeeId)
    : undefined;
  if (linkedEmp && isArchivedEmployeeServer(linkedEmp)) {
    return {
      isAuthenticated: false,
      isSuperAdmin: false,
      actorName: '',
      perms: getDefaultPermissionsForRoleServer('personel', false),
    };
  }
  return {
    isAuthenticated: true,
    isSuperAdmin: false,
    actorName: actorAccount.name,
    account: actorAccount,
    perms: getEffectivePermissionsServer(actorAccount),
  };
}

function canViewArchivedEmployeesServer(actor: ReturnType<typeof resolveActorServer>): boolean {
  if (!actor.isAuthenticated) return false;
  if (actor.isSuperAdmin) return true;
  const role = actor.account?.role;
  const perms = actor.perms;
  return Boolean(
    role === 'ik_yoneticisi' ||
      role === 'birim_amiri' ||
      role === 'yonetici' ||
      perms.isFullAdmin ||
      perms.canManagePermissions ||
      perms.canManageSettings
  );
}

function canToggleShiftPermissionServer(actor: ReturnType<typeof resolveActorServer>): boolean {
  if (!actor.isAuthenticated) return false;
  if (actor.isSuperAdmin) return true;
  return actor.account?.role === 'ik_yoneticisi';
}

function canManageShiftForTargetServer(
  actor: ReturnType<typeof resolveActorServer>,
  targetEmp: Employee | undefined
): { allowed: boolean; status?: number; message?: string } {
  if (!actor.isAuthenticated) {
    return {
      allowed: false,
      status: 401,
      message: 'Vardiya güncelleme işlemi için oturum doğrulaması gereklidir.',
    };
  }
  if (!targetEmp || isHiddenSuperAdminItem(targetEmp)) {
    return {
      allowed: false,
      status: 404,
      message: 'Personel kaydı bulunamadı.',
    };
  }
  if (isArchivedEmployeeServer(targetEmp)) {
    return {
      allowed: false,
      status: 400,
      message: 'Arşivlenmiş (Eski Personel) için vardiya tanımlanamaz.',
    };
  }
  if (actor.isSuperAdmin || actor.account?.role === 'ik_yoneticisi') {
    return { allowed: true };
  }

  const acc = actor.account;
  const hasDirectReports = Boolean(
    acc?.id &&
      dbState.employees.some(
        (e) => !isArchivedEmployeeServer(e) && !isHiddenSuperAdminItem(e) && e.manager_id === acc.id
      )
  );
  const hasShiftPermission =
    acc?.can_manage_shifts === true ||
    (acc?.can_manage_shifts !== false &&
      (Boolean(actor.perms.canManageShifts) || hasDirectReports));

  if (!hasShiftPermission) {
    return {
      allowed: false,
      status: 403,
      message: 'Bu personel üzerinde vardiya düzenleme yetkiniz bulunmamaktadır',
    };
  }

  // Strict Scoping: Birim Amiri can ONLY edit shifts for employees whose manager_id === currentUser.id
  if (!acc?.id || targetEmp.manager_id !== acc.id) {
    return {
      allowed: false,
      status: 403,
      message: 'Bu personel üzerinde vardiya düzenleme yetkiniz bulunmamaktadır',
    };
  }

  return { allowed: true };
}

function filterVisibleItems<T>(list: T[]): T[] {
  return Array.isArray(list) ? list.filter((item) => !isHiddenSuperAdminItem(item)) : [];
}

function getCanonicalCompanyNameServer(db: PDKSDatabase = dbState): string {
  const fromSettings =
    typeof db?.systemSettings?.companyName === 'string' ? db.systemSettings.companyName.trim() : '';
  if (fromSettings && fromSettings !== DEFAULT_COMPANY_NAME) return fromSettings;

  const fromDisk = loadPersistentSystemSettings();
  if (fromDisk?.companyName && fromDisk.companyName !== DEFAULT_COMPANY_NAME) {
    return fromDisk.companyName;
  }

  const fromRoot = typeof db?.companyName === 'string' ? db.companyName.trim() : '';
  if (fromRoot && fromRoot !== DEFAULT_COMPANY_NAME) return fromRoot;

  const fromWall =
    typeof db?.companyWallQR?.companyName === 'string' ? db.companyWallQR.companyName.trim() : '';
  if (fromWall && fromWall !== DEFAULT_COMPANY_NAME) return fromWall;

  return fromSettings || fromRoot || fromWall || DEFAULT_COMPANY_NAME;
}

function getPublicDatabaseSnapshot(db: PDKSDatabase): PDKSDatabase {
  const canonicalCompanyName = getCanonicalCompanyNameServer(db);

  return {
    ...db,
    companyName: canonicalCompanyName,
    systemSettings: {
      ...(db.systemSettings || { companyName: canonicalCompanyName }),
      companyName: canonicalCompanyName,
    },
    companyWallQR: db.companyWallQR
      ? { ...db.companyWallQR, companyName: canonicalCompanyName }
      : db.companyWallQR,
    employees: filterVisibleItems(db.employees),
    records: filterVisibleItems(db.records),
    employee_shifts: Array.isArray(db.employee_shifts) ? db.employee_shifts : [],
    notifications: filterVisibleItems(db.notifications),
    accounts: filterVisibleItems(db.accounts),
    deviceApprovals: filterVisibleItems(db.deviceApprovals),
    supervisorAssignments: filterVisibleItems(db.supervisorAssignments),
  };
}

app.use(express.json({ limit: '25mb' }));

// Persistent Database Directory & Files
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'pdks-database.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'system-settings.json');
const AVATARS_DIR = path.join(DATA_DIR, 'avatars');
const AVATARS_MANIFEST_FILE = path.join(DATA_DIR, 'avatars-manifest.json');
const WALL_QR_STATIC_FILE = path.join(__dirname, 'company-wall-qr.json');

function isBlobUrlServer(val?: string | null): boolean {
  return typeof val === 'string' && val.trim().toLowerCase().startsWith('blob:');
}

function isCustomUploadedAvatar(val?: string | null): boolean {
  if (typeof val !== 'string') return false;
  const trimmed = val.trim();
  if (!trimmed || isBlobUrlServer(trimmed)) return false;
  return trimmed.startsWith('/api/avatars/') || trimmed.startsWith('data:image/');
}

function loadAvatarsManifest(): Record<string, string> {
  try {
    if (fs.existsSync(AVATARS_MANIFEST_FILE)) {
      const raw = fs.readFileSync(AVATARS_MANIFEST_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, string>;
      }
    }
  } catch (err) {
    console.warn('Failed to read avatars-manifest.json:', err);
  }
  return {};
}

function saveAvatarsManifest(manifest: Record<string, string>): void {
  const tempFile = `${AVATARS_MANIFEST_FILE}.${process.pid}.${Date.now()}.tmp`;
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(tempFile, JSON.stringify(manifest, null, 2), 'utf-8');
    fs.renameSync(tempFile, AVATARS_MANIFEST_FILE);
  } catch (err) {
    console.error('Failed to write avatars-manifest.json:', err);
    try {
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    } catch {
      // ignore
    }
  }
}

function persistAvatarToDisk(employeeId: string, rawPhotoData?: string | null): string | null {
  if (typeof rawPhotoData !== 'string') return null;
  const trimmed = rawPhotoData.trim();
  if (!trimmed || isBlobUrlServer(trimmed)) return null;

  // Decode base64 Data URL and persist as an immutable file under data/avatars/
  const dataUrlMatch = trimmed.match(/^data:image\/(png|jpeg|jpg|webp|gif);base64,(.+)$/i);
  if (dataUrlMatch) {
    const rawExt = dataUrlMatch[1].toLowerCase();
    const ext = rawExt === 'jpeg' ? 'jpg' : rawExt;
    const base64Body = dataUrlMatch[2];
    try {
      const buffer = Buffer.from(base64Body, 'base64');
      if (!buffer || buffer.length === 0) return null;
      if (!fs.existsSync(AVATARS_DIR)) {
        fs.mkdirSync(AVATARS_DIR, { recursive: true });
      }
      const safeEmpId = String(employeeId || 'user').replace(/[^a-zA-Z0-9_-]/g, '');
      const hash = crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 12);
      const filename = `${safeEmpId}-${hash}.${ext}`;
      const filePath = path.join(AVATARS_DIR, filename);
      if (!fs.existsSync(filePath)) {
        const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
        fs.writeFileSync(tmpPath, buffer);
        fs.renameSync(tmpPath, filePath);
      }
      const persistentUrl = `/api/avatars/${filename}`;
      if (safeEmpId) {
        const manifest = loadAvatarsManifest();
        manifest[employeeId] = persistentUrl;
        saveAvatarsManifest(manifest);
      }
      return persistentUrl;
    } catch (err) {
      console.error('Failed to persist avatar file:', err);
      return trimmed;
    }
  }

  // Already a persistent server avatar URL or valid external HTTP(S) URL
  if (trimmed.startsWith('/api/avatars/') || /^https?:\/\//i.test(trimmed)) {
    if (employeeId && trimmed.startsWith('/api/avatars/')) {
      const manifest = loadAvatarsManifest();
      if (manifest[employeeId] !== trimmed) {
        manifest[employeeId] = trimmed;
        saveAvatarsManifest(manifest);
      }
    }
    return trimmed;
  }

  return null;
}

function resolvePreservedAvatar(
  existingAvatar: string | undefined,
  incomingAvatar: string | undefined | null,
  options: { allowExplicitReplace: boolean; employeeId?: string }
): string {
  const safeExisting =
    typeof existingAvatar === 'string' && existingAvatar.trim() && !isBlobUrlServer(existingAvatar)
      ? existingAvatar.trim()
      : '';
  const safeIncoming =
    typeof incomingAvatar === 'string' && incomingAvatar.trim() && !isBlobUrlServer(incomingAvatar)
      ? incomingAvatar.trim()
      : '';

  // COALESCE: never overwrite an existing valid avatar with empty/null/undefined/blob:
  if (!safeIncoming) {
    return safeExisting;
  }

  // During generic /api/db/sync, NEVER let a stale stock/external URL overwrite an uploaded custom avatar
  if (!options.allowExplicitReplace && isCustomUploadedAvatar(safeExisting)) {
    if (!isCustomUploadedAvatar(safeIncoming)) {
      return safeExisting;
    }
    // If incoming is already a persistent /api/avatars/ path, prefer server's existing persistent avatar unless same
    if (safeExisting.startsWith('/api/avatars/') && !safeIncoming.startsWith('data:image/')) {
      return safeExisting;
    }
  }

  if (safeIncoming.startsWith('data:image/') && options.employeeId) {
    return persistAvatarToDisk(options.employeeId, safeIncoming) || safeExisting || safeIncoming;
  }

  return safeIncoming;
}

function syncEmployeeAvatarToAccountsServer(
  employeeId: string,
  avatarUrl: string,
  avatarStatus?: 'approved' | 'pending' | 'rejected',
  pendingAvatar?: string | null
): void {
  if (!employeeId || !avatarUrl || isBlobUrlServer(avatarUrl)) return;
  for (const acc of dbState.accounts) {
    if (acc && acc.employeeId === employeeId) {
      acc.avatar = avatarUrl;
      if (avatarStatus !== undefined) acc.avatarStatus = avatarStatus;
      if (pendingAvatar !== undefined) acc.pendingAvatar = pendingAvatar;
    }
  }
}

// Serve persistent avatar files with immutable browser caching
app.get('/api/avatars/:filename', (req: Request, res: Response) => {
  const rawName = path.basename(String(req.params.filename || ''));
  if (!/^[a-zA-Z0-9_-]+\.(png|jpg|webp|gif)$/i.test(rawName)) {
    return res.status(400).json({ success: false, message: 'Geçersiz dosya adı.' });
  }
  const fullPath = path.join(AVATARS_DIR, rawName);
  if (!fs.existsSync(fullPath)) {
    return res.status(404).json({ success: false, message: 'Profil fotoğrafı bulunamadı.' });
  }
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  return res.sendFile(fullPath);
});

function loadPersistentSystemSettings(): SystemSettings | null {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const raw = fs.readFileSync(SETTINGS_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (
        parsed &&
        typeof parsed.companyName === 'string' &&
        parsed.companyName.trim() &&
        parsed.companyName.trim() !== DEFAULT_COMPANY_NAME
      ) {
        return {
          companyName: parsed.companyName.trim().slice(0, 100),
          branchName: typeof parsed.branchName === 'string' ? parsed.branchName.trim().slice(0, 100) : undefined,
          updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : undefined,
          updatedBy: typeof parsed.updatedBy === 'string' ? parsed.updatedBy : undefined,
        };
      }
    }
  } catch (err) {
    console.warn('Failed to read system-settings.json:', err);
  }
  return null;
}

function savePersistentSystemSettings(settings: SystemSettings): void {
  const cleanName = typeof settings?.companyName === 'string' ? settings.companyName.trim() : '';
  // Never overwrite custom persisted settings with empty or default placeholder name
  if (!cleanName || cleanName === DEFAULT_COMPANY_NAME) {
    return;
  }
  const tempFile = `${SETTINGS_FILE}.${process.pid}.${Date.now()}.tmp`;
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(tempFile, JSON.stringify({ ...settings, companyName: cleanName }, null, 2), 'utf-8');
    fs.renameSync(tempFile, SETTINGS_FILE);
  } catch (err) {
    console.error('Failed to write system-settings.json:', err);
    try {
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    } catch {
      // ignore
    }
  }

  // Keep company-wall-qr.json synchronized when present so static seed never reverts companyName
  try {
    if (fs.existsSync(WALL_QR_STATIC_FILE)) {
      const raw = fs.readFileSync(WALL_QR_STATIC_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        parsed.companyName = cleanName;
        if (settings.branchName) parsed.branchName = settings.branchName;
        fs.writeFileSync(WALL_QR_STATIC_FILE, JSON.stringify(parsed, null, 2) + '\n', 'utf-8');
      }
    }
  } catch {
    // non-fatal
  }
}

function loadDatabase(): PDKSDatabase {
  const persistedSettings = loadPersistentSystemSettings();
  const avatarManifest = loadAvatarsManifest();
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.employees) && Array.isArray(parsed.records)) {
        const todayStr = getTodayString();
        const isOnlyDemoSeed =
          parsed.records.length > 0 &&
          parsed.records.length <= 7 &&
          parsed.records.every((r: AttendanceRecord) => /^REC-00[1-7]$/.test(r.id));
        if (isOnlyDemoSeed && parsed.records.some((r: AttendanceRecord) => r.date !== todayStr)) {
          parsed.records = parsed.records.map((r: AttendanceRecord) => ({
            ...r,
            date: todayStr,
            timestamp: `${todayStr}T${r.timeStr || '08:30:00'}`,
          }));
        }
        if (!Array.isArray(parsed.deviceApprovals)) {
          parsed.deviceApprovals = [];
        }
        if (!Array.isArray(parsed.employee_shifts)) {
          parsed.employee_shifts = [];
        }
        // Ensure canonical shift templates (Sabah, Akşam, Gece, İzinli/OFF) exist in persisted DB
        if (Array.isArray(parsed.shifts)) {
          const existingShiftIds = new Set(parsed.shifts.map((s: Shift) => s?.id));
          const missingCanonical = CANONICAL_SHIFT_TEMPLATES.filter((t) => !existingShiftIds.has(t.id));
          if (missingCanonical.length > 0) {
            parsed.shifts = [...missingCanonical, ...parsed.shifts];
          }
        }
        // Normalize can_manage_shifts on persisted user accounts
        if (Array.isArray(parsed.accounts)) {
          parsed.accounts = parsed.accounts.map((acc: UserAccount) => {
            if (!acc || typeof acc !== 'object') return acc;
            const defaultShiftManage =
              acc.role === 'ik_yoneticisi' ||
              acc.role === 'birim_amiri' ||
              Boolean(acc.isShiftSupervisor) ||
              Boolean(acc.customPermissions?.canManageShifts);
            const nextAcc: UserAccount = {
              ...acc,
              can_manage_shifts:
                typeof acc.can_manage_shifts === 'boolean' ? acc.can_manage_shifts : defaultShiftManage,
            };
            // Convert any legacy inline data:image/ avatars into persistent disk files
            if (typeof nextAcc.avatar === 'string' && nextAcc.avatar.startsWith('data:image/')) {
              const savedUrl = persistAvatarToDisk(nextAcc.employeeId || nextAcc.id, nextAcc.avatar);
              if (savedUrl) nextAcc.avatar = savedUrl;
            }
            return nextAcc;
          });
        }

        // Backfill manager_id from legacy supervisorAssignments ONLY when manager_id is undefined
        const legacyManagerByEmpId = new Map<string, string>();
        if (Array.isArray(parsed.supervisorAssignments) && Array.isArray(parsed.accounts)) {
          for (const sup of parsed.supervisorAssignments as SupervisorAssignment[]) {
            const supAcc = (parsed.accounts as UserAccount[]).find(
              (a) => a && (a.id === sup.supervisorId || a.employeeId === sup.supervisorId)
            );
            if (supAcc && Array.isArray(sup.assignedEmployeeIds)) {
              for (const empId of sup.assignedEmployeeIds) {
                if (empId && !legacyManagerByEmpId.has(empId)) {
                  legacyManagerByEmpId.set(empId, supAcc.id);
                }
              }
            }
          }
        }

        // Migrate employees: convert inline base64 avatars to persistent /api/avatars/, restore from manifest if needed, backfill manager_id
        parsed.employees = (parsed.employees as Employee[]).map((emp) => {
          if (!emp || typeof emp !== 'object') return emp;
          const nextEmp: Employee = { ...emp };
          if (typeof nextEmp.avatar === 'string' && nextEmp.avatar.startsWith('data:image/')) {
            const savedUrl = persistAvatarToDisk(nextEmp.id, nextEmp.avatar);
            if (savedUrl) nextEmp.avatar = savedUrl;
          }
          const manifestUrl = avatarManifest[nextEmp.id];
          if (
            manifestUrl &&
            manifestUrl.startsWith('/api/avatars/') &&
            fs.existsSync(path.join(AVATARS_DIR, path.basename(manifestUrl))) &&
            !isCustomUploadedAvatar(nextEmp.avatar)
          ) {
            nextEmp.avatar = manifestUrl;
          }
          if (nextEmp.manager_id === undefined) {
            nextEmp.manager_id = legacyManagerByEmpId.get(nextEmp.id) || null;
          }
          return nextEmp;
        });

        // Synchronize employee avatars & manager_id back to linked user accounts
        if (Array.isArray(parsed.accounts)) {
          const empById = new Map<string, Employee>(
            (parsed.employees as Employee[]).filter((e) => e && e.id).map((e) => [e.id, e])
          );
          parsed.accounts = (parsed.accounts as UserAccount[]).map((acc) => {
            if (!acc || typeof acc !== 'object') return acc;
            const linked = acc.employeeId ? empById.get(acc.employeeId) : undefined;
            const nextAcc = { ...acc };
            if (linked) {
              if (isCustomUploadedAvatar(linked.avatar) && nextAcc.avatar !== linked.avatar) {
                nextAcc.avatar = linked.avatar;
              } else if (!nextAcc.avatar || isBlobUrlServer(nextAcc.avatar)) {
                nextAcc.avatar = linked.avatar;
              }
              if (nextAcc.manager_id === undefined) {
                nextAcc.manager_id = linked.manager_id ?? null;
              }
            }
            return nextAcc;
          });
        }

        const dbCompanyName =
          (typeof parsed.systemSettings?.companyName === 'string' && parsed.systemSettings.companyName.trim()) ||
          (typeof parsed.companyName === 'string' && parsed.companyName.trim()) ||
          (typeof parsed.companyWallQR?.companyName === 'string' && parsed.companyWallQR.companyName.trim()) ||
          '';

        const resolvedCompanyName =
          (persistedSettings?.companyName &&
            (dbCompanyName === '' || dbCompanyName === DEFAULT_COMPANY_NAME)
            ? persistedSettings.companyName
            : dbCompanyName) ||
          persistedSettings?.companyName ||
          DEFAULT_COMPANY_NAME;

        parsed.companyName = resolvedCompanyName;
        parsed.systemSettings = {
          ...(persistedSettings || {}),
          ...(parsed.systemSettings || {}),
          companyName: resolvedCompanyName,
        };
        if (parsed.companyWallQR && typeof parsed.companyWallQR === 'object') {
          parsed.companyWallQR.companyName = resolvedCompanyName;
        }
        if (resolvedCompanyName && resolvedCompanyName !== DEFAULT_COMPANY_NAME) {
          savePersistentSystemSettings(parsed.systemSettings);
        }
        return parsed;
      }
    }
  } catch (err) {
    console.error('Failed to read pdks-database.json:', err);
    // Preserve corrupt file backup instead of silently destroying data
    try {
      if (fs.existsSync(DB_FILE)) {
        fs.copyFileSync(DB_FILE, `${DB_FILE}.corrupt.${Date.now()}.bak`);
      }
    } catch {
      // ignore backup failure
    }
  }

  const initial = createInitialDatabase();
  if (persistedSettings?.companyName) {
    initial.companyName = persistedSettings.companyName;
    initial.systemSettings = { ...persistedSettings };
    initial.companyWallQR.companyName = persistedSettings.companyName;
    if (persistedSettings.branchName) {
      initial.companyWallQR.branchName = persistedSettings.branchName;
    }
  }
  // Restore any persisted custom avatars even if database was freshly initialized
  initial.employees = initial.employees.map((emp) => {
    const manifestUrl = avatarManifest[emp.id];
    if (manifestUrl && manifestUrl.startsWith('/api/avatars/') && fs.existsSync(path.join(AVATARS_DIR, path.basename(manifestUrl)))) {
      return { ...emp, avatar: manifestUrl };
    }
    return emp;
  });
  initial.accounts = initial.accounts.map((acc) => {
    const manifestUrl = avatarManifest[acc.employeeId];
    if (manifestUrl && manifestUrl.startsWith('/api/avatars/') && fs.existsSync(path.join(AVATARS_DIR, path.basename(manifestUrl)))) {
      return { ...acc, avatar: manifestUrl };
    }
    return acc;
  });

  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to create initial pdks-database.json:', err);
  }
  return initial;
}

let dbState: PDKSDatabase = loadDatabase();

function saveDatabase(data: PDKSDatabase) {
  const tempFile = `${DB_FILE}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`;
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tempFile, DB_FILE);
  } catch (err) {
    console.error('Failed to write pdks-database.json:', err);
    try {
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    } catch {
      // ignore cleanup error
    }
  }
}

// Connected SSE clients for instant live multi-device broadcast
const sseClients = new Set<Response>();

function broadcastUpdate(reason: string, collection?: string) {
  dbState.version = (dbState.version || 0) + 1;
  dbState.lastUpdated = new Date().toISOString();
  saveDatabase(dbState);

  const payload = JSON.stringify({
    type: 'pdks-update',
    reason,
    collection,
    version: dbState.version,
    timestamp: dbState.lastUpdated,
  });

  for (const client of sseClients) {
    try {
      client.write(`data: ${payload}\n\n`);
    } catch {
      sseClients.delete(client);
    }
  }
}

// Keep-alive heartbeat every 20 seconds for active SSE clients
setInterval(() => {
  for (const client of sseClients) {
    try {
      client.write(':keepalive\n\n');
    } catch {
      sseClients.delete(client);
    }
  }
}, 20000);

// ==========================================
// API ROUTES
// ==========================================

// 1. SSE Live Stream: All devices subscribe here to receive instant updates
app.get('/api/events', (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  res.write(`data: ${JSON.stringify({ type: 'connected', version: dbState.version, timestamp: dbState.lastUpdated })}\n\n`);
  sseClients.add(res);

  _req.on('close', () => {
    sseClients.delete(res);
  });
});

// 2. Full or Incremental Database Synchronization
app.get('/api/db/sync', (req: Request, res: Response) => {
  const clientVersion = Number(req.query.version);
  if (Number.isFinite(clientVersion) && clientVersion === dbState.version) {
    return res.json({
      success: true,
      upToDate: true,
      version: dbState.version,
      lastUpdated: dbState.lastUpdated,
    });
  }

  return res.json({
    success: true,
    upToDate: false,
    version: dbState.version,
    lastUpdated: dbState.lastUpdated,
    data: getPublicDatabaseSnapshot(dbState),
  });
});

function mergePreservingServerArchivedEmployees(incoming: Employee[]): Employee[] {
  const byId = new Map<string, Employee>();
  for (const e of filterVisibleItems(incoming)) {
    if (e && e.id) {
      const existing = dbState.employees.find((cur) => cur.id === e.id);
      if (existing && isArchivedEmployeeServer(existing) && !isArchivedEmployeeServer(e)) {
        // Never allow stale client sync to resurrect an archived former employee
        byId.set(existing.id, existing);
      } else if (existing) {
        // COALESCE & non-destructive merge: never allow generic sync to erase/downgrade avatars or tamper with manager_id
        const preservedAvatar = resolvePreservedAvatar(existing.avatar, e.avatar, {
          allowExplicitReplace: false,
          employeeId: e.id,
        });
        const preservedPending =
          e.pendingAvatar === null
            ? null
            : e.pendingAvatar && !isBlobUrlServer(e.pendingAvatar)
              ? persistAvatarToDisk(e.id, e.pendingAvatar) || e.pendingAvatar
              : existing.pendingAvatar ?? null;
        byId.set(e.id, {
          ...existing,
          ...e,
          avatar: preservedAvatar || existing.avatar,
          pendingAvatar: preservedPending,
          avatarStatus: e.avatarStatus ?? existing.avatarStatus,
          // Preserve server-authoritative HR-assigned manager_id against generic client sync overwrites
          manager_id: existing.manager_id !== undefined ? existing.manager_id : (e.manager_id ?? null),
        });
      } else {
        const cleanAvatar = resolvePreservedAvatar('', e.avatar, {
          allowExplicitReplace: true,
          employeeId: e.id,
        });
        byId.set(e.id, {
          ...e,
          avatar: cleanAvatar || e.avatar,
          manager_id: e.manager_id ?? null,
        });
      }
    }
  }
  for (const existing of filterVisibleItems(dbState.employees)) {
    if (existing && existing.id && isArchivedEmployeeServer(existing) && !byId.has(existing.id)) {
      byId.set(existing.id, existing);
    }
  }
  return Array.from(byId.values());
}

function mergePreservingServerArchivedAccounts(incoming: UserAccount[]): UserAccount[] {
  const byId = new Map<string, UserAccount>();
  for (const a of filterVisibleItems(incoming)) {
    if (a && a.id) {
      const existing = dbState.accounts.find((cur) => cur.id === a.id);
      if (existing && isArchivedAccountServer(existing) && !isArchivedAccountServer(a)) {
        byId.set(existing.id, existing);
      } else if (existing) {
        const linkedEmp = existing.employeeId
          ? dbState.employees.find((emp) => emp.id === existing.employeeId)
          : undefined;
        const authoritativeAvatar = resolvePreservedAvatar(
          linkedEmp?.avatar && isCustomUploadedAvatar(linkedEmp.avatar) ? linkedEmp.avatar : existing.avatar,
          a.avatar,
          { allowExplicitReplace: false, employeeId: existing.employeeId || existing.id }
        );
        // Preserve authoritative server-controlled avatar, can_manage_shifts, and manager_id
        byId.set(a.id, {
          ...existing,
          ...a,
          avatar: authoritativeAvatar || existing.avatar,
          can_manage_shifts:
            typeof existing.can_manage_shifts === 'boolean'
              ? existing.can_manage_shifts
              : a.can_manage_shifts,
          manager_id: existing.manager_id !== undefined ? existing.manager_id : (a.manager_id ?? null),
        });
      } else {
        const cleanAvatar = resolvePreservedAvatar('', a.avatar, {
          allowExplicitReplace: true,
          employeeId: a.employeeId || a.id,
        });
        byId.set(a.id, {
          ...a,
          avatar: cleanAvatar || a.avatar,
        });
      }
    }
  }
  for (const existing of filterVisibleItems(dbState.accounts)) {
    if (existing && existing.id && isArchivedAccountServer(existing) && !byId.has(existing.id)) {
      byId.set(existing.id, existing);
    }
  }
  return Array.from(byId.values());
}

app.post('/api/db/sync', (req: Request, res: Response) => {
  try {
    const { updates, collection, data } = req.body || {};

    if (collection && data !== undefined) {
      if (collection === 'companyName' || collection === 'systemSettings') {
        return res.status(403).json({
          success: false,
          message: 'Kurum adı ve sistem ayarları yalnızca Süper Yönetici doğrulamasıyla güncellenebilir.',
        });
      }
      if (collection === 'employee_shifts') {
        return res.status(403).json({
          success: false,
          message: 'Vardiya atamaları yalnızca yetkilendirilmiş /api/employee-shifts uç noktaları üzerinden güncellenebilir.',
        });
      }
      if (collection === 'companyLogo' && typeof data === 'string' && data.trim().startsWith('blob:')) {
        return res.status(400).json({ success: false, message: 'Geçici blob: logo adresi kaydedilemez.' });
      }
      if (collection === 'companyWallQR' && data && typeof data === 'object') {
        const currentCompanyName =
          dbState.systemSettings?.companyName ||
          dbState.companyName ||
          dbState.companyWallQR?.companyName ||
          DEFAULT_COMPANY_NAME;
        dbState.companyWallQR = {
          ...data,
          companyName: currentCompanyName,
        };
      } else if (collection === 'employees' && Array.isArray(data)) {
        dbState.employees = mergePreservingServerArchivedEmployees(data as Employee[]);
      } else if (collection === 'accounts' && Array.isArray(data)) {
        dbState.accounts = mergePreservingServerArchivedAccounts(data as UserAccount[]);
      } else {
        const sanitizedData = Array.isArray(data) ? filterVisibleItems(data) : data;
        (dbState as any)[collection] = sanitizedData;
      }
      broadcastUpdate(`Updated collection ${collection}`, collection);
      return res.json({
        success: true,
        version: dbState.version,
        lastUpdated: dbState.lastUpdated,
        data: getPublicDatabaseSnapshot(dbState),
      });
    }

    if (updates && typeof updates === 'object') {
      const allowedKeys = [
        'employees', 'records', 'shifts', 'leaves', 'overtime',
        'notifications', 'companyWallQR', 'companyLogo', 'kioskLockPassword',
        'supervisorAssignments', 'accounts', 'deviceApprovals', 'settings',
      ];
      for (const key of allowedKeys) {
        if (updates[key] !== undefined) {
          if (key === 'companyLogo' && typeof updates[key] === 'string' && updates[key].trim().startsWith('blob:')) {
            continue;
          }
          if (key === 'companyWallQR' && updates[key] && typeof updates[key] === 'object') {
            const currentCompanyName =
              dbState.systemSettings?.companyName ||
              dbState.companyName ||
              dbState.companyWallQR?.companyName ||
              DEFAULT_COMPANY_NAME;
            dbState.companyWallQR = {
              ...updates[key],
              companyName: currentCompanyName,
            };
            continue;
          }
          if (key === 'employees' && Array.isArray(updates[key])) {
            dbState.employees = mergePreservingServerArchivedEmployees(updates[key] as Employee[]);
            continue;
          }
          if (key === 'accounts' && Array.isArray(updates[key])) {
            dbState.accounts = mergePreservingServerArchivedAccounts(updates[key] as UserAccount[]);
            continue;
          }
          (dbState as any)[key] = Array.isArray(updates[key])
            ? filterVisibleItems(updates[key])
            : updates[key];
        }
      }
      broadcastUpdate('Batch update', 'all');
      return res.json({
        success: true,
        version: dbState.version,
        lastUpdated: dbState.lastUpdated,
        data: getPublicDatabaseSnapshot(dbState),
      });
    }

    return res.status(400).json({ success: false, message: 'Geçersiz sync gövdesi.' });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err?.message || 'Sync hatası' });
  }
});

function findServerDeviceOwner(
  currentEmployeeId: string,
  device: { deviceId?: string; macAddress?: string; deviceFingerprint?: string }
): { employeeId: string; employeeName: string; macAddress?: string; deviceId?: string } | null {
  const accounts = Array.isArray(dbState.accounts) ? dbState.accounts : [];
  for (const acc of accounts) {
    if (!acc.employeeId || acc.employeeId === currentEmployeeId) continue;
    if (!acc.isActive || isArchivedAccountServer(acc)) continue;
    const matchId = Boolean(device.deviceId && acc.registeredDeviceId && acc.registeredDeviceId === device.deviceId);
    const matchMac = Boolean(
      device.macAddress &&
        acc.registeredMacAddress &&
        acc.registeredMacAddress.toUpperCase() === device.macAddress.toUpperCase()
    );
    const matchFp = Boolean(
      device.deviceFingerprint &&
        acc.registeredDeviceFingerprint &&
        acc.registeredDeviceFingerprint === device.deviceFingerprint
    );
    if (matchId || matchMac || matchFp) {
      return {
        employeeId: acc.employeeId,
        employeeName: acc.name,
        macAddress: acc.registeredMacAddress,
        deviceId: acc.registeredDeviceId,
      };
    }
  }

  const employees = Array.isArray(dbState.employees) ? dbState.employees : [];
  for (const emp of employees) {
    if (emp.id === currentEmployeeId) continue;
    if (isArchivedEmployeeServer(emp)) continue;
    const matchId = Boolean(device.deviceId && emp.registeredDeviceId && emp.registeredDeviceId === device.deviceId);
    const matchMac = Boolean(
      device.macAddress &&
        emp.registeredMacAddress &&
        emp.registeredMacAddress.toUpperCase() === device.macAddress.toUpperCase()
    );
    const matchFp = Boolean(
      device.deviceFingerprint &&
        emp.registeredDeviceFingerprint &&
        emp.registeredDeviceFingerprint === device.deviceFingerprint
    );
    if (matchId || matchMac || matchFp) {
      return {
        employeeId: emp.id,
        employeeName: emp.fullName,
        macAddress: emp.registeredMacAddress,
        deviceId: emp.registeredDeviceId,
      };
    }
  }

  return null;
}

// 3. Attendance Scan Endpoint (Kiosk & Mobile QR Scans)
app.post('/api/scan', (req: Request, res: Response) => {
  const {
    employeeId,
    forcedAction,
    terminal = 'Terminal',
    method = 'kiosk_camera',
    deviceId,
    macAddress,
    deviceName,
    deviceFingerprint,
  } = req.body || {};

  if (!employeeId) {
    return res.status(400).json({ success: false, message: 'Personel kimliği zorunludur.' });
  }

  const emp = dbState.employees.find((e) => e.id === employeeId || e.qrToken.includes(employeeId));
  if (!emp) {
    return res.status(404).json({ success: false, message: 'Personel kaydı sistemde bulunamadı.' });
  }
  if (isArchivedEmployeeServer(emp)) {
    return res.status(403).json({
      success: false,
      blocked: true,
      message: 'Bu personel arşivlenmiş (Eski Personel) / pasif durumda olduğu için giriş-çıkış işlemi yapılamaz.',
    });
  }

  const previousPresence = emp.currentPresence || 'outside';
  let action: ActionType = 'check_in';
  let newPresence = 'inside';
  let message = '';

  if (forcedAction && ['check_in', 'check_out', 'break_start', 'break_end'].includes(forcedAction)) {
    action = forcedAction as ActionType;
    if (action === 'check_in') newPresence = 'inside';
    else if (action === 'check_out') newPresence = 'outside';
    else if (action === 'break_start') newPresence = 'break';
    else if (action === 'break_end') newPresence = 'inside';
  } else {
    // Dynamic State Machine
    if (previousPresence === 'outside') {
      action = 'check_in';
      newPresence = 'inside';
      message = `Vardiya Girişi Yapıldı. Hoş geldiniz, ${emp.fullName}!`;
    } else if (previousPresence === 'break') {
      action = 'break_end';
      newPresence = 'inside';
      message = `Moladan Dönüş Kaydedildi: ${emp.fullName}`;
    } else {
      // inside
      action = 'check_out';
      newPresence = 'outside';
      message = `Vardiya Çıkışı Yapıldı: ${emp.fullName}`;
    }
  }

  const cleanDeviceId = typeof deviceId === 'string' && deviceId.trim() ? deviceId.trim() : undefined;
  const cleanMac = typeof macAddress === 'string' && macAddress.trim() ? macAddress.trim().toUpperCase() : undefined;
  const cleanDeviceName = typeof deviceName === 'string' && deviceName.trim() ? deviceName.trim() : undefined;
  const cleanFingerprint = typeof deviceFingerprint === 'string' && deviceFingerprint.trim() ? deviceFingerprint.trim() : undefined;
  const hasPersonalDevicePayload = method !== 'kiosk_camera' && Boolean(cleanDeviceId || cleanMac || cleanFingerprint);

  const now = new Date();
  const nowIso = now.toISOString();
  const timeStr = now.toTimeString().split(' ')[0];
  const dateStr = getTodayString();

  // Check if personal device belongs to another employee in the database
  const otherOwner = hasPersonalDevicePayload
    ? findServerDeviceOwner(emp.id, {
        deviceId: cleanDeviceId,
        macAddress: cleanMac,
        deviceFingerprint: cleanFingerprint,
      })
    : null;

  if (hasPersonalDevicePayload) {
    const linkedAcc = dbState.accounts.find((a) => a.employeeId === emp.id);
    if (!otherOwner && !emp.registeredDeviceId && !linkedAcc?.registeredDeviceId) {
      emp.registeredDeviceId = cleanDeviceId;
      emp.registeredMacAddress = cleanMac;
      emp.registeredDeviceFingerprint = cleanFingerprint;
      emp.registeredDeviceName = cleanDeviceName;
      emp.registeredDeviceAt = nowIso;
      if (linkedAcc) {
        linkedAcc.registeredDeviceId = cleanDeviceId;
        linkedAcc.registeredMacAddress = cleanMac;
        linkedAcc.registeredDeviceFingerprint = cleanFingerprint;
        linkedAcc.registeredDeviceName = cleanDeviceName;
        linkedAcc.registeredDeviceAt = nowIso;
      }
    }

    emp.lastLoginDeviceId = cleanDeviceId;
    emp.lastLoginMacAddress = cleanMac;
    emp.lastLoginDeviceName = cleanDeviceName;
    emp.lastLoginAt = nowIso;
    if (linkedAcc) {
      linkedAcc.lastLoginDeviceId = cleanDeviceId;
      linkedAcc.lastLoginMacAddress = cleanMac;
      linkedAcc.lastLoginDeviceName = cleanDeviceName;
      linkedAcc.lastLoginDeviceFingerprint = cleanFingerprint;
      linkedAcc.lastLogin = nowIso;
    }
  }

  let crossDeviceWarning: string | undefined;
  if (otherOwner) {
    const eventDateTime = now.toLocaleString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    const macOrId = cleanMac || cleanDeviceId || otherOwner.macAddress || otherOwner.deviceId || 'Bilinmiyor';
    crossDeviceWarning = 'Başka Personel Cihazı ile Giriş (Yetkisiz/Şüpheli Cihaz Kullanımı)';
    dbState.notifications.unshift({
      id: `NOTIF-${Date.now().toString().slice(-6)}-SEC`,
      type: 'device_alert',
      title: '⚠️ Başka Personel Cihazı ile İşlem Tespit Edildi',
      message: `${emp.fullName}, sistemde ${otherOwner.employeeName} adına kayıtlı cihaz (${macOrId}) üzerinden vardiya işlemi gerçekleştirdi. Tarih/Saat: ${eventDateTime}`,
      employeeId: emp.id,
      employeeName: emp.fullName,
      department: emp.department,
      timestamp: nowIso,
      severity: 'critical',
      read: false,
      targetRole: 'ik_yoneticisi',
      metadata: {
        isCrossEmployeeDevice: true,
        actorEmployeeName: emp.fullName,
        ownerEmployeeId: otherOwner.employeeId,
        ownerEmployeeName: otherOwner.employeeName,
        macAddress: cleanMac || otherOwner.macAddress,
        deviceId: cleanDeviceId || otherOwner.deviceId,
        deviceName: cleanDeviceName,
        eventDateTime,
      },
    });
  }

  // Enforce 1-hour manager-only first check-in gate when employee logged in from a new device
  if (action === 'check_in' && !req.body?.bypassDeviceLock) {
    const approvals = Array.isArray(dbState.deviceApprovals) ? dbState.deviceApprovals : [];
    const nowMs = Date.now();
    const activeLock = approvals.find(
      (item) =>
        item.employeeId === emp.id &&
        (item.status === 'pending' || item.status === 'check_in_requested' || item.status === 'rejected') &&
        nowMs < Date.parse(item.expiresAt)
    );
    if (activeLock) {
      if (activeLock.status !== 'rejected') {
        activeLock.status = 'check_in_requested';
        activeLock.checkInRequestedAt = nowIso;
      }
      const remainingMins = Math.max(1, Math.ceil((Date.parse(activeLock.expiresAt) - nowMs) / 60000));
      dbState.notifications.unshift({
        id: `NOTIF-${Date.now().toString().slice(-6)}`,
        type: 'device_alert',
        title: 'Yeni Cihaz İş Yeri Giriş Onayı Bekleniyor',
        message: `${emp.fullName} (${emp.department}) yeni cihazdan (${activeLock.newDeviceName}${activeLock.newMacAddress ? ` · MAC: ${activeLock.newMacAddress}` : ''}) giriş yaptıktan sonraki 1 saatlik pencerede iş yerine giriş denemesi yaptı. Kalan süre: ${remainingMins} dk. Yalnızca yönetici onaylayabilir.`,
        employeeId: emp.id,
        employeeName: emp.fullName,
        department: emp.department,
        timestamp: nowIso,
        severity: 'critical',
        read: false,
        targetRole: 'ik_yoneticisi',
        metadata: {
          deviceApprovalId: activeLock.id,
          newDeviceName: activeLock.newDeviceName,
          macAddress: activeLock.newMacAddress,
          deviceId: activeLock.newDeviceId,
          expiresAt: activeLock.expiresAt,
        },
      });
      broadcastUpdate(`Device lock check-in blocked for ${emp.fullName}`, 'deviceApprovals');
      return res.status(403).json({
        success: false,
        awaitingManagerApproval: true,
        deviceApproval: activeLock,
        message:
          activeLock.status === 'rejected'
            ? 'Yönetici yeni cihazdan giriş talebinizi reddetti. 1 saatlik süre dolmadan yalnızca yönetici iş yeri girişini onaylayabilir.'
            : 'Farklı cihazdan giriş yaptığınız için 1 saat içerisindeki ilk iş yeri girişiniz yalnızca yönetici tarafından onaylanabilir. Onay talebi yöneticiye iletildi.',
      });
    }
  }

  emp.currentPresence = newPresence as any;
  emp.lastActionTime = timeStr;

  const record: AttendanceRecord = {
    id: `REC-${Date.now().toString().slice(-6)}`,
    employeeId: emp.id,
    employeeName: emp.fullName,
    department: emp.department,
    date: dateStr,
    type: action,
    timestamp: nowIso,
    timeStr,
    method,
    status: 'on_time',
    lateMinutes: 0,
    terminal,
    ...(cleanDeviceId ? { deviceId: cleanDeviceId } : {}),
    ...(cleanMac ? { macAddress: cleanMac } : {}),
    ...(cleanDeviceName ? { deviceName: cleanDeviceName } : {}),
    ...(cleanFingerprint ? { deviceFingerprint: cleanFingerprint } : {}),
    ...(otherOwner
      ? {
          isSuspiciousDevice: true,
          securityEventKind: 'scan_cross_device' as const,
          securityWarning: crossDeviceWarning,
          deviceOwnerEmployeeId: otherOwner.employeeId,
          deviceOwnerEmployeeName: otherOwner.employeeName,
          deviceOwnerMacAddress: otherOwner.macAddress,
          note: `${crossDeviceWarning} · Cihaz Sahibi: ${otherOwner.employeeName}`,
        }
      : {}),
  };

  dbState.records.unshift(record);

  // Add system notification for late/early or normal punch
  dbState.notifications.unshift({
    id: `NOTIF-${Date.now().toString().slice(-6)}`,
    type: action === 'check_in' ? 'check_in' : action === 'check_out' ? 'check_out' : 'break',
    title: action === 'check_in' ? 'Personel Girişi' : action === 'check_out' ? 'Personel Çıkışı' : 'Mola Hareketi',
    message: `${emp.fullName} (${emp.department}) ${timeStr} itibarıyla ${terminal} üzerinden ${action === 'check_in' ? 'giriş yaptı' : action === 'check_out' ? 'çıkış yaptı' : 'mola işlemi yaptı'}.`,
    employeeId: emp.id,
    employeeName: emp.fullName,
    department: emp.department,
    timestamp: nowIso,
    severity: 'info',
    read: false,
  });

  broadcastUpdate(`Attendance scan for ${emp.fullName}`, 'records');

  return res.json({
    success: true,
    action,
    previousPresence,
    newPresence,
    message: message || `${action === 'check_in' ? 'Giriş Başarılı' : 'Çıkış Başarılı'}: ${emp.fullName}`,
    employee: emp,
    record,
    serverTime: timeStr,
    timestamp: nowIso,
  });
});

function archiveEmployeeOrAccountServer(options: {
  employeeId?: string;
  accountId?: string;
  archiveEmployee?: boolean;
  actorName: string;
}): {
  archivedEmployee?: Employee;
  archivedAccounts: UserAccount[];
} {
  const nowIso = new Date().toISOString();
  const archivedAccounts: UserAccount[] = [];
  let archivedEmployee: Employee | undefined;
  let targetEmpId = options.employeeId;

  if (options.accountId) {
    const accIdx = dbState.accounts.findIndex(
      (a) => a.id === options.accountId && !isHiddenSuperAdminItem(a)
    );
    if (accIdx >= 0) {
      const cur = dbState.accounts[accIdx];
      targetEmpId = targetEmpId || cur.employeeId;
      const nextAcc: UserAccount = {
        ...cur,
        formerRole: cur.formerRole || cur.role,
        role: 'personel',
        isActive: false,
        isArchived: true,
        archivedAt: cur.archivedAt || nowIso,
        archivedBy: options.actorName,
        isShiftSupervisor: false,
        assignedEmployeeIds: [],
      };
      delete nextAcc.customPermissions;
      delete nextAcc.registeredDeviceId;
      delete nextAcc.registeredMacAddress;
      delete nextAcc.registeredDeviceFingerprint;
      delete nextAcc.registeredDeviceName;
      delete nextAcc.registeredDeviceAt;
      delete nextAcc.lastLoginDeviceId;
      delete nextAcc.lastLoginMacAddress;
      delete nextAcc.lastLoginDeviceFingerprint;
      delete nextAcc.lastLoginDeviceName;
      dbState.accounts[accIdx] = nextAcc;
      archivedAccounts.push(nextAcc);
    }
  }

  if (options.archiveEmployee && targetEmpId) {
    const empIdx = dbState.employees.findIndex(
      (e) => e.id === targetEmpId && !isHiddenSuperAdminItem(e)
    );
    if (empIdx >= 0) {
      const curEmp = dbState.employees[empIdx];
      const nextEmp: Employee = {
        ...curEmp,
        status: 'inactive',
        currentPresence: 'outside',
        isArchived: true,
        archivedAt: curEmp.archivedAt || nowIso,
        archivedBy: options.actorName,
      };
      delete nextEmp.registeredDeviceId;
      delete nextEmp.registeredMacAddress;
      delete nextEmp.registeredDeviceFingerprint;
      delete nextEmp.registeredDeviceName;
      delete nextEmp.registeredDeviceAt;
      delete nextEmp.lastLoginDeviceId;
      delete nextEmp.lastLoginMacAddress;
      delete nextEmp.lastLoginDeviceName;
      delete nextEmp.lastLoginAt;
      dbState.employees[empIdx] = nextEmp;
      archivedEmployee = nextEmp;
    }

    // Archive all linked user accounts for this employee
    dbState.accounts = dbState.accounts.map((cur) => {
      if (cur.employeeId === targetEmpId && !isHiddenSuperAdminItem(cur)) {
        const nextAcc: UserAccount = {
          ...cur,
          formerRole: cur.formerRole || cur.role,
          role: 'personel',
          isActive: false,
          isArchived: true,
          archivedAt: cur.archivedAt || nowIso,
          archivedBy: options.actorName,
          isShiftSupervisor: false,
          assignedEmployeeIds: [],
        };
        delete nextAcc.customPermissions;
        delete nextAcc.registeredDeviceId;
        delete nextAcc.registeredMacAddress;
        delete nextAcc.registeredDeviceFingerprint;
        delete nextAcc.registeredDeviceName;
        delete nextAcc.registeredDeviceAt;
        delete nextAcc.lastLoginDeviceId;
        delete nextAcc.lastLoginMacAddress;
        delete nextAcc.lastLoginDeviceFingerprint;
        delete nextAcc.lastLoginDeviceName;
        archivedAccounts.push(nextAcc);
        return nextAcc;
      }
      return cur;
    });
  }

  // Remove from supervisorAssignments & expire pending device approvals
  const removedIds = new Set<string>();
  if (targetEmpId) removedIds.add(targetEmpId);
  if (options.accountId) removedIds.add(options.accountId);

  if (Array.isArray(dbState.supervisorAssignments)) {
    dbState.supervisorAssignments = dbState.supervisorAssignments
      .filter((s) => !removedIds.has(s.supervisorId))
      .map((s) => ({
        ...s,
        assignedEmployeeIds: Array.isArray(s.assignedEmployeeIds)
          ? s.assignedEmployeeIds.filter((eid) => !removedIds.has(eid))
          : [],
      }));
  }

  if (Array.isArray(dbState.deviceApprovals)) {
    dbState.deviceApprovals = dbState.deviceApprovals.map((ap) => {
      if (
        (removedIds.has(ap.employeeId) || removedIds.has(ap.accountId)) &&
        (ap.status === 'pending' || ap.status === 'check_in_requested')
      ) {
        return {
          ...ap,
          status: 'expired',
          resolvedAt: nowIso,
          resolvedBy: options.actorName,
          decisionNote: 'Personel/hesap arşivlendiği için sonlandırıldı.',
        };
      }
      return ap;
    });
  }

  // NOTE: dbState.records is intentionally untouched so all historical PDKS logs remain preserved.
  return { archivedEmployee, archivedAccounts };
}

// 4. Employees CRUD
app.get('/api/employees', (_req: Request, res: Response) => {
  res.json({
    success: true,
    employees: filterVisibleItems(dbState.employees).filter((e) => !isArchivedEmployeeServer(e)),
  });
});

// Read-only Archived / Former Employees & Historical Logs (Strictly Super Admin & Authorized Managers)
app.get('/api/employees/archived', (req: Request, res: Response) => {
  const actor = resolveActorServer(req);
  if (!actor.isAuthenticated) {
    return res.status(401).json({
      success: false,
      message: 'Eski personel listesini görüntülemek için yetkili oturum doğrulaması gereklidir.',
    });
  }
  if (!canViewArchivedEmployeesServer(actor)) {
    return res.status(403).json({
      success: false,
      message: 'Erişim Reddedildi: Eski personel listesi ve geçmiş PDKS logları yalnızca Süper Yönetici ve yetkili yöneticilere açıktır.',
    });
  }

  const archivedEmployees = filterVisibleItems(dbState.employees).filter((e) =>
    isArchivedEmployeeServer(e)
  );
  const archivedIdSet = new Set(archivedEmployees.map((e) => e.id));
  const archivedAccountByEmpId = new Map<string, UserAccount>();
  filterVisibleItems(dbState.accounts).forEach((a) => {
    if (a.employeeId && isArchivedAccountServer(a)) {
      archivedAccountByEmpId.set(a.employeeId, a);
    }
  });

  const enrichedEmployees = archivedEmployees.map((emp) => {
    const linkedAcc = archivedAccountByEmpId.get(emp.id);
    return {
      ...emp,
      formerRole: linkedAcc?.formerRole || linkedAcc?.role,
      formerUsername: linkedAcc?.username,
    };
  });

  const historicalRecords = filterVisibleItems(dbState.records).filter((r) =>
    archivedIdSet.has(r.employeeId)
  );

  return res.json({
    success: true,
    archivedEmployees: enrichedEmployees,
    records: historicalRecords,
    version: dbState.version,
  });
});

app.post('/api/employees', (req: Request, res: Response) => {
  const emp: Employee = req.body;
  if (!emp || !emp.id || !emp.fullName) {
    return res.status(400).json({ success: false, message: 'Personel ID ve adı zorunludur.' });
  }
  if (isHiddenSuperAdminItem(emp)) {
    return res.status(403).json({ success: false, message: 'Bu işlem desteklenmiyor.' });
  }

  const actor = resolveActorServer(req);
  const canSetManager = canToggleShiftPermissionServer(actor);
  const idx = dbState.employees.findIndex((e) => e.id === emp.id);
  let savedEmp: Employee;

  if (idx >= 0) {
    const existing = dbState.employees[idx];
    const preservedAvatar = resolvePreservedAvatar(existing.avatar, emp.avatar, {
      allowExplicitReplace: true,
      employeeId: emp.id,
    });
    const nextManagerId =
      canSetManager && emp.manager_id !== undefined ? (emp.manager_id || null) : (existing.manager_id ?? null);
    savedEmp = {
      ...existing,
      ...emp,
      avatar: preservedAvatar || existing.avatar,
      pendingAvatar: emp.pendingAvatar !== undefined ? emp.pendingAvatar : existing.pendingAvatar,
      avatarStatus: emp.avatarStatus !== undefined ? emp.avatarStatus : existing.avatarStatus,
      manager_id: nextManagerId,
    };
    dbState.employees[idx] = savedEmp;
  } else {
    const persistedAvatar = resolvePreservedAvatar('', emp.avatar, {
      allowExplicitReplace: true,
      employeeId: emp.id,
    });
    savedEmp = {
      ...emp,
      avatar: persistedAvatar || emp.avatar,
      manager_id: canSetManager ? (emp.manager_id || null) : null,
    };
    dbState.employees.unshift(savedEmp);
  }

  if (savedEmp.avatar) {
    syncEmployeeAvatarToAccountsServer(savedEmp.id, savedEmp.avatar, savedEmp.avatarStatus, savedEmp.pendingAvatar);
  }

  broadcastUpdate(`Saved employee ${savedEmp.fullName}`, 'employees');
  return res.json({ success: true, employee: savedEmp, employees: filterVisibleItems(dbState.employees), version: dbState.version });
});

function handleArchiveEmployeeRequest(req: Request, res: Response) {
  const { id } = req.params;
  const actor = resolveActorServer(req);
  if (!actor.isAuthenticated) {
    return res.status(401).json({
      success: false,
      message: 'Personel silme işlemi için oturum doğrulaması gereklidir. Lütfen tekrar giriş yapınız.',
    });
  }
  if (!actor.isSuperAdmin && !actor.perms.canDelete) {
    return res.status(403).json({
      success: false,
      message: 'Personel silme yetkiniz bulunmamaktadır.',
    });
  }

  const targetEmp = dbState.employees.find((e) => e.id === id);
  if (!targetEmp || isHiddenSuperAdminItem(targetEmp)) {
    return res.status(404).json({ success: false, message: 'Personel kaydı bulunamadı.' });
  }

  const linkedAcc = dbState.accounts.find((a) => a.employeeId === id && !isHiddenSuperAdminItem(a));
  if (!actor.isSuperAdmin && isAdminOrManagerTargetServer(linkedAcc, targetEmp)) {
    return res.status(403).json({
      success: false,
      message:
        'Güvenlik Kuralı: Yönetici rolüne veya yönetim yetkisine sahip kullanıcılar yalnızca Gizli Süper Admin (Admin.Admin) tarafından silinebilir.',
    });
  }

  const { archivedEmployee } = archiveEmployeeOrAccountServer({
    employeeId: id,
    archiveEmployee: true,
    actorName: actor.actorName,
  });

  broadcastUpdate(`Archived employee ${targetEmp.fullName} (${id})`, 'employees');
  return res.json({
    success: true,
    message: `${targetEmp.fullName} aktif listeden kaldırıldı ve geçmiş PDKS kayıtları korunarak Eski Personel olarak arşivlendi.`,
    id,
    archivedEmployee,
    employees: filterVisibleItems(dbState.employees),
    accounts: filterVisibleItems(dbState.accounts),
    version: dbState.version,
  });
}

app.post('/api/employees/:id/archive', handleArchiveEmployeeRequest);
app.delete('/api/employees/:id', handleArchiveEmployeeRequest);

// Photo upload requests and approvals (Persistent disk storage + Blob URL guard + Account sync)
app.post('/api/employees/:id/photo-request', (req: Request, res: Response) => {
  const { id } = req.params;
  const { photoData } = req.body || {};
  if (!photoData || typeof photoData !== 'string' || !photoData.trim()) {
    return res.status(400).json({ success: false, message: 'Fotoğraf verisi zorunludur.' });
  }
  if (isBlobUrlServer(photoData)) {
    return res.status(400).json({ success: false, message: 'Geçici blob: bağlantısı profil fotoğrafı olarak kaydedilemez.' });
  }
  const emp = dbState.employees.find((e) => e.id === id);
  if (!emp) {
    return res.status(404).json({ success: false, message: 'Personel bulunamadı.' });
  }

  const persistentUrl = persistAvatarToDisk(`${emp.id}-pending`, photoData);
  if (!persistentUrl) {
    return res.status(400).json({ success: false, message: 'Geçersiz fotoğraf formatı.' });
  }

  emp.pendingAvatar = persistentUrl;
  emp.avatarStatus = 'pending';
  emp.pendingAvatarDate = new Date().toISOString();

  for (const acc of dbState.accounts) {
    if (acc && acc.employeeId === id) {
      acc.pendingAvatar = persistentUrl;
      acc.avatarStatus = 'pending';
    }
  }

  dbState.notifications.unshift({
    id: `NOTIF-${Date.now().toString().slice(-6)}`,
    type: 'check_in',
    title: '📸 Yeni Profil Fotoğrafı Onayı Bekliyor',
    message: `${emp.fullName} (${emp.title}) yeni bir profil fotoğrafı yükledi. Aktifleşmesi için İK onayı bekleniyor.`,
    employeeId: emp.id,
    employeeName: emp.fullName,
    department: emp.department,
    timestamp: new Date().toISOString(),
    severity: 'info',
    read: false,
  });

  broadcastUpdate(`Photo request for ${emp.fullName}`, 'employees');
  return res.json({ success: true, message: 'Fotoğraf onay talebi iletildi.', employee: emp, avatarUrl: persistentUrl, version: dbState.version });
});

app.post('/api/employees/:id/photo-approve', (req: Request, res: Response) => {
  const { id } = req.params;
  const emp = dbState.employees.find((e) => e.id === id);
  if (!emp) {
    return res.status(404).json({ success: false, message: 'Personel bulunamadı.' });
  }
  if (emp.pendingAvatar && !isBlobUrlServer(emp.pendingAvatar)) {
    const finalUrl = persistAvatarToDisk(emp.id, emp.pendingAvatar) || emp.pendingAvatar;
    emp.avatar = finalUrl;
    emp.pendingAvatar = null;
    emp.pendingAvatarDate = null;
    emp.avatarStatus = 'approved';

    syncEmployeeAvatarToAccountsServer(emp.id, finalUrl, 'approved', null);
  }
  broadcastUpdate(`Photo approved for ${emp.fullName}`, 'employees');
  return res.json({ success: true, message: 'Fotoğraf onaylandı.', employee: emp, avatarUrl: emp.avatar, version: dbState.version });
});

app.post('/api/employees/:id/photo-reject', (req: Request, res: Response) => {
  const { id } = req.params;
  const emp = dbState.employees.find((e) => e.id === id);
  if (!emp) {
    return res.status(404).json({ success: false, message: 'Personel bulunamadı.' });
  }
  emp.pendingAvatar = null;
  emp.pendingAvatarDate = null;
  emp.avatarStatus = 'rejected';
  for (const acc of dbState.accounts) {
    if (acc && acc.employeeId === id) {
      acc.pendingAvatar = null;
      acc.avatarStatus = 'rejected';
    }
  }
  broadcastUpdate(`Photo rejected for ${emp.fullName}`, 'employees');
  return res.json({ success: true, message: 'Fotoğraf reddedildi.', employee: emp, version: dbState.version });
});

app.put('/api/employees/:id/photo-direct', (req: Request, res: Response) => {
  const { id } = req.params;
  const { photoData } = req.body || {};
  if (!photoData || typeof photoData !== 'string' || !photoData.trim()) {
    return res.status(400).json({ success: false, message: 'Fotoğraf verisi zorunludur.' });
  }
  if (isBlobUrlServer(photoData)) {
    return res.status(400).json({ success: false, message: 'Geçici blob: bağlantısı profil fotoğrafı olarak kaydedilemez.' });
  }
  const emp = dbState.employees.find((e) => e.id === id);
  if (!emp) {
    return res.status(404).json({ success: false, message: 'Personel bulunamadı.' });
  }
  const persistentUrl = persistAvatarToDisk(emp.id, photoData);
  if (!persistentUrl) {
    return res.status(400).json({ success: false, message: 'Geçersiz fotoğraf formatı.' });
  }

  emp.avatar = persistentUrl;
  emp.pendingAvatar = null;
  emp.pendingAvatarDate = null;
  emp.avatarStatus = 'approved';

  syncEmployeeAvatarToAccountsServer(emp.id, persistentUrl, 'approved', null);

  broadcastUpdate(`Photo directly updated for ${emp.fullName}`, 'employees');
  return res.json({ success: true, message: 'Fotoğraf kalıcı olarak güncellendi.', employee: emp, avatarUrl: persistentUrl, version: dbState.version });
});

// 5. Attendance Records
app.get('/api/records', (_req: Request, res: Response) => {
  res.json({ success: true, records: filterVisibleItems(dbState.records) });
});

app.post('/api/records', (req: Request, res: Response) => {
  const record: AttendanceRecord = req.body;
  if (!record || !record.id) {
    return res.status(400).json({ success: false, message: 'Geçersiz kayıt.' });
  }
  if (isHiddenSuperAdminItem(record)) {
    return res.status(200).json({ success: true, records: filterVisibleItems(dbState.records) });
  }
  const idx = dbState.records.findIndex((r) => r.id === record.id);
  if (idx >= 0) {
    dbState.records[idx] = record;
  } else {
    dbState.records.unshift(record);
  }
  broadcastUpdate('Record saved', 'records');
  return res.json({ success: true, record, records: filterVisibleItems(dbState.records) });
});

app.delete('/api/records/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  dbState.records = dbState.records.filter((r) => r.id !== id);
  broadcastUpdate('Record deleted', 'records');
  return res.json({ success: true, message: 'Kayıt silindi.', id });
});

// 6. Shifts
app.get('/api/shifts', (_req: Request, res: Response) => {
  res.json({ success: true, shifts: dbState.shifts });
});

app.post('/api/shifts', (req: Request, res: Response) => {
  const body = req.body || {};
  // Support direct employee shift assignment payloads sent to POST /api/shifts with strict manager_id 403 validation
  if (typeof body.employeeId === 'string' && typeof body.date === 'string' && typeof body.shiftId === 'string') {
    return handleUpsertEmployeeShift(req, res);
  }

  const actor = resolveActorServer(req);
  if (!actor.isAuthenticated) {
    return res.status(401).json({ success: false, message: 'Vardiya tanımı güncelleme için oturum doğrulaması gereklidir.' });
  }
  if (!canToggleShiftPermissionServer(actor)) {
    return res.status(403).json({
      success: false,
      message: 'Bu personel üzerinde vardiya düzenleme yetkiniz bulunmamaktadır',
    });
  }

  const shift: Shift = body;
  if (!shift || !shift.name) {
    return res.status(400).json({ success: false, message: 'Vardiya adı zorunludur.' });
  }
  const id = shift.id || `SHIFT-${Date.now().toString().slice(-4)}`;
  const updatedShift: Shift = { ...shift, id };
  const idx = dbState.shifts.findIndex((s) => s.id === id);
  if (idx >= 0) {
    dbState.shifts[idx] = updatedShift;
  } else {
    dbState.shifts.push(updatedShift);
  }
  broadcastUpdate(`Shift saved ${updatedShift.name}`, 'shifts');
  return res.json({ success: true, shift: updatedShift, shifts: dbState.shifts, version: dbState.version });
});

app.put('/api/shifts', (req: Request, res: Response) => {
  return handleUpsertEmployeeShift(req, res);
});

app.delete('/api/shifts/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  dbState.shifts = dbState.shifts.filter((s) => s.id !== id);
  broadcastUpdate(`Shift deleted ${id}`, 'shifts');
  return res.json({ success: true, message: 'Vardiya silindi.', id, shifts: dbState.shifts });
});

// 7. Leaves
app.get('/api/leaves', (_req: Request, res: Response) => {
  res.json({ success: true, leaves: dbState.leaves });
});

app.post('/api/leaves', (req: Request, res: Response) => {
  const leave: LeaveRequest = req.body;
  if (!leave || !leave.employeeId) {
    return res.status(400).json({ success: false, message: 'Geçersiz izin talebi.' });
  }
  const id = leave.id || `LR-${Date.now().toString().slice(-4)}`;
  const item: LeaveRequest = { ...leave, id };
  const idx = dbState.leaves.findIndex((l) => l.id === id);
  if (idx >= 0) {
    dbState.leaves[idx] = item;
  } else {
    dbState.leaves.unshift(item);
  }
  broadcastUpdate(`Leave saved for ${item.employeeName}`, 'leaves');
  return res.json({ success: true, leave: item, leaves: dbState.leaves });
});

app.post('/api/leaves/:id/approve', (req: Request, res: Response) => {
  const { id } = req.params;
  const leave = dbState.leaves.find((l) => l.id === id);
  if (!leave) return res.status(404).json({ success: false, message: 'İzin bulunamadı.' });

  leave.status = 'approved';
  leave.approvedAt = new Date().toISOString();
  leave.approvedBy = req.body.approvedBy || 'İK Yöneticisi';

  broadcastUpdate(`Leave approved for ${leave.employeeName}`, 'leaves');
  return res.json({ success: true, leave, leaves: dbState.leaves });
});

app.post('/api/leaves/:id/reject', (req: Request, res: Response) => {
  const { id } = req.params;
  const leave = dbState.leaves.find((l) => l.id === id);
  if (!leave) return res.status(404).json({ success: false, message: 'İzin bulunamadı.' });

  leave.status = 'rejected';
  leave.rejectionReason = req.body.reason || 'İK tarafından reddedildi.';

  broadcastUpdate(`Leave rejected for ${leave.employeeName}`, 'leaves');
  return res.json({ success: true, leave, leaves: dbState.leaves });
});

app.delete('/api/leaves/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  dbState.leaves = dbState.leaves.filter((l) => l.id !== id);
  broadcastUpdate(`Leave deleted ${id}`, 'leaves');
  return res.json({ success: true, message: 'İzin kaydı silindi.', id, leaves: dbState.leaves });
});

// 8. Overtime
app.get('/api/overtime', (_req: Request, res: Response) => {
  res.json({ success: true, overtime: dbState.overtime });
});

app.post('/api/overtime', (req: Request, res: Response) => {
  const ot: OvertimeRequest = req.body;
  if (!ot || !ot.employeeId) {
    return res.status(400).json({ success: false, message: 'Geçersiz mesai talebi.' });
  }
  const id = ot.id || `OT-${Date.now().toString().slice(-4)}`;
  const item: OvertimeRequest = { ...ot, id };
  const idx = dbState.overtime.findIndex((o) => o.id === id);
  if (idx >= 0) {
    dbState.overtime[idx] = item;
  } else {
    dbState.overtime.unshift(item);
  }
  broadcastUpdate(`Overtime saved for ${item.employeeName}`, 'overtime');
  return res.json({ success: true, overtime: item, list: dbState.overtime });
});

app.post('/api/overtime/:id/approve', (req: Request, res: Response) => {
  const { id } = req.params;
  const ot = dbState.overtime.find((o) => o.id === id);
  if (!ot) return res.status(404).json({ success: false, message: 'Mesai kaydı bulunamadı.' });

  ot.status = 'approved';
  ot.approvedAt = new Date().toISOString();
  ot.approvedBy = req.body.approvedBy || 'İK Yöneticisi';

  broadcastUpdate(`Overtime approved for ${ot.employeeName}`, 'overtime');
  return res.json({ success: true, overtime: ot, list: dbState.overtime });
});

app.post('/api/overtime/:id/reject', (req: Request, res: Response) => {
  const { id } = req.params;
  const ot = dbState.overtime.find((o) => o.id === id);
  if (!ot) return res.status(404).json({ success: false, message: 'Mesai kaydı bulunamadı.' });

  ot.status = 'rejected';
  broadcastUpdate(`Overtime rejected for ${ot.employeeName}`, 'overtime');
  return res.json({ success: true, overtime: ot, list: dbState.overtime });
});

// 9. Notifications
app.get('/api/notifications', (_req: Request, res: Response) => {
  res.json({ success: true, notifications: filterVisibleItems(dbState.notifications) });
});

app.post('/api/notifications', (req: Request, res: Response) => {
  const notif: PDKSNotification = req.body;
  if (!notif) return res.status(400).json({ success: false });
  if (isHiddenSuperAdminItem(notif)) {
    return res.json({ success: true, notifications: filterVisibleItems(dbState.notifications) });
  }
  const id = notif.id || `NOTIF-${Date.now().toString().slice(-6)}`;
  dbState.notifications.unshift({ ...notif, id });
  broadcastUpdate('New notification', 'notifications');
  return res.json({ success: true, notification: notif, notifications: filterVisibleItems(dbState.notifications) });
});

app.post('/api/notifications/mark-all-read', (_req: Request, res: Response) => {
  dbState.notifications.forEach((n) => (n.read = true));
  broadcastUpdate('Marked all notifications as read', 'notifications');
  return res.json({ success: true, notifications: filterVisibleItems(dbState.notifications) });
});

app.delete('/api/notifications', (_req: Request, res: Response) => {
  dbState.notifications = [];
  broadcastUpdate('Cleared notifications', 'notifications');
  return res.json({ success: true, notifications: [] });
});

// 10. Company Wall QR Configuration (always serves canonical persistent companyName)
app.get('/api/company/wall-qr', (_req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  const canonicalCompanyName = getCanonicalCompanyNameServer(dbState);
  res.json({
    success: true,
    data: {
      ...dbState.companyWallQR,
      companyName: canonicalCompanyName,
    },
  });
});

app.post('/api/company/wall-qr', (req: Request, res: Response) => {
  try {
    const body = req.body || {};
    const preservedCompanyName = getCanonicalCompanyNameServer(dbState);
    dbState.companyWallQR = {
      ...dbState.companyWallQR,
      ...body,
      companyName: preservedCompanyName,
      latitude: Number.isFinite(Number(body.latitude)) ? Number(body.latitude) : dbState.companyWallQR.latitude,
      longitude: Number.isFinite(Number(body.longitude)) ? Number(body.longitude) : dbState.companyWallQR.longitude,
      radiusMeters: Number.isFinite(Number(body.radiusMeters)) ? Number(body.radiusMeters) : dbState.companyWallQR.radiusMeters,
      enableGeofence: typeof body.enableGeofence === 'boolean' ? body.enableGeofence : dbState.companyWallQR.enableGeofence,
    };
    broadcastUpdate('Company Wall QR updated', 'companyWallQR');
    return res.json({ success: true, message: 'Şirket Duvar QR ayarları güncellendi.', data: dbState.companyWallQR, version: dbState.version });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err?.message || 'Güncelleme hatası' });
  }
});

// 10B. Central Persistent System Settings & Dynamic Company Name Management (Super Admin Exclusive)
app.get('/api/system/settings', (_req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  const name = getCanonicalCompanyNameServer(dbState);
  const settings: SystemSettings = {
    companyName: name,
    branchName: dbState.systemSettings?.branchName || dbState.companyWallQR?.branchName,
    updatedAt: dbState.systemSettings?.updatedAt || dbState.lastUpdated,
    updatedBy: dbState.systemSettings?.updatedBy || 'Sistem',
  };
  return res.json({
    success: true,
    companyName: name,
    settings,
    systemSettings: settings,
    version: dbState.version,
  });
});

app.get('/api/company/name', (_req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  const name = getCanonicalCompanyNameServer(dbState);
  res.json({ success: true, companyName: name, version: dbState.version });
});

app.post('/api/company/name', (req: Request, res: Response) => {
  const { companyName, branchName, username, password } = req.body || {};
  if (!companyName || typeof companyName !== 'string' || !companyName.trim()) {
    return res.status(400).json({ success: false, message: 'Şirket adı boş bırakılamaz.' });
  }

  const cleanCompany = companyName.trim().slice(0, 100);
  const cleanBranch = typeof branchName === 'string' && branchName.trim() ? branchName.trim().slice(0, 100) : undefined;
  const cleanUser = typeof username === 'string' ? username.trim().replace(/^@+/, '').toLowerCase() : '';
  const cleanPass = typeof password === 'string' ? password.trim() : '';
  const saToken = extractSuperAdminToken(req);

  const tokenUsername = extractVerifiedSuperAdminUsername(saToken);
  const hasValidSaToken = Boolean(tokenUsername);
  if (!hasValidSaToken) {
    return res.status(403).json({
      success: false,
      message: 'Şirket ismini değiştirme yetkisi yalnızca Gizli Süper Yönetici (Admin.Admin) hesabına aittir.',
    });
  }

  const hasValidSaCreds = Boolean(
    cleanPass &&
      verifySuperAdminCredentials(
        cleanUser || tokenUsername || String(process.env.SUPER_ADMIN_USER || ''),
        cleanPass
      )
  );

  if (!cleanPass || !hasValidSaCreds) {
    return res.status(401).json({ success: false, message: 'Hatalı yönetici şifresi, değişiklik onaylanmadı' });
  }

  const nowIso = new Date().toISOString();
  const nextSettings: SystemSettings = {
    companyName: cleanCompany,
    branchName: cleanBranch || dbState.companyWallQR?.branchName,
    updatedAt: nowIso,
    updatedBy: tokenUsername || 'Admin.Admin',
  };
  dbState.companyName = cleanCompany;
  dbState.systemSettings = nextSettings;
  dbState.companyWallQR = {
    ...dbState.companyWallQR,
    companyName: cleanCompany,
    ...(cleanBranch ? { branchName: cleanBranch } : {}),
  };
  savePersistentSystemSettings(nextSettings);
  broadcastUpdate(`Company name updated to ${cleanCompany}`, 'companyWallQR');
  return res.json({
    success: true,
    companyName: cleanCompany,
    settings: nextSettings,
    data: dbState.companyWallQR,
    version: dbState.version,
    message: 'Şirket adı merkezi veritabanına kalıcı olarak kaydedildi',
  });
});

app.post('/api/company/wall-qr/rotate', (_req: Request, res: Response) => {
  const suffix = Math.random().toString(36).substring(2, 8).toUpperCase();
  const token = `PDKS:WALL:HQ-MAIN:2026-${suffix}`;
  const isGeo = dbState.companyWallQR.enableGeofence !== false;
  const lat = dbState.companyWallQR.latitude || 41.0082;
  const lon = dbState.companyWallQR.longitude || 28.9784;
  const rad = dbState.companyWallQR.radiusMeters || 250;

  dbState.companyWallQR.token = token;
  dbState.companyWallQR.qrPayload = `PDKS:WALL:${token}:GEO:${isGeo ? 1 : 0}:${lat}:${lon}:${rad}`;
  dbState.companyWallQR.lastRotatedAt = new Date().toISOString();

  broadcastUpdate('Company Wall QR rotated', 'companyWallQR');
  return res.json({ success: true, message: 'Yeni duvar QR tokenı üretildi.', data: dbState.companyWallQR, version: dbState.version });
});

// 11. Company Logo
app.get('/api/company/logo', (_req: Request, res: Response) => {
  res.json({ success: true, logo: dbState.companyLogo, version: dbState.version });
});

app.post('/api/company/logo', (req: Request, res: Response) => {
  const { logo } = req.body || {};
  if (typeof logo === 'string') {
    const trimmed = logo.trim();
    if (!trimmed || trimmed.startsWith('blob:')) {
      return res.status(400).json({ success: false, message: 'Geçersiz veya geçici (blob:) logo adresi kaydedilemez.' });
    }
    dbState.companyLogo = trimmed;
    broadcastUpdate('Company logo updated', 'companyLogo');
    return res.json({ success: true, logo: dbState.companyLogo, version: dbState.version });
  }
  return res.status(400).json({ success: false, message: 'Geçersiz logo formatı' });
});

// 12. Kiosk Lock Password
app.get('/api/kiosk/lock-password', (_req: Request, res: Response) => {
  res.json({ success: true, password: dbState.kioskLockPassword });
});

app.post('/api/kiosk/lock-password', (req: Request, res: Response) => {
  const { password } = req.body;
  if (password && typeof password === 'string' && password.trim().length >= 4) {
    dbState.kioskLockPassword = password.trim();
    broadcastUpdate('Kiosk lock password updated', 'kioskLockPassword');
    return res.json({ success: true, password: dbState.kioskLockPassword });
  }
  return res.status(400).json({ success: false, message: 'Şifre en az 4 karakter olmalıdır.' });
});

// 13. Supervisor Assignments
app.get('/api/supervisor-assignments', (_req: Request, res: Response) => {
  res.json({ success: true, assignments: dbState.supervisorAssignments });
});

app.post('/api/supervisor-assignments', (req: Request, res: Response) => {
  const assignment: SupervisorAssignment = req.body;
  if (!assignment || !assignment.supervisorId) {
    return res.status(400).json({ success: false, message: 'Geçersiz amir ataması.' });
  }
  const id = assignment.id || `SUP-${Date.now().toString().slice(-4)}`;
  const item = { ...assignment, id };
  const idx = dbState.supervisorAssignments.findIndex((s) => s.id === id);
  if (idx >= 0) {
    dbState.supervisorAssignments[idx] = item;
  } else {
    dbState.supervisorAssignments.push(item);
  }
  broadcastUpdate(`Supervisor assignment saved for ${item.supervisorName}`, 'supervisorAssignments');
  return res.json({ success: true, assignment: item, assignments: dbState.supervisorAssignments });
});

// 14. User Accounts & Login Authentication
app.get('/api/accounts', (_req: Request, res: Response) => {
  res.json({ success: true, accounts: filterVisibleItems(dbState.accounts) });
});

app.post('/api/accounts', (req: Request, res: Response) => {
  const acc: UserAccount = req.body;
  if (!acc || !acc.username || !acc.password) {
    return res.status(400).json({ success: false, message: 'Kullanıcı adı ve şifre zorunludur.' });
  }
  if (isHiddenSuperAdminItem(acc)) {
    return res.status(403).json({ success: false, message: 'Bu rol tanımlanamaz.' });
  }
  const id = acc.id || `ACC-${Date.now().toString().slice(-4)}`;
  const idx = dbState.accounts.findIndex((a) => a.id === id || a.username.toLowerCase() === acc.username.toLowerCase());
  const linkedEmp = acc.employeeId ? dbState.employees.find((e) => e.id === acc.employeeId) : undefined;
  let savedAcc: UserAccount;

  if (idx >= 0) {
    const existing = dbState.accounts[idx];
    const preservedAvatar = resolvePreservedAvatar(
      linkedEmp?.avatar && isCustomUploadedAvatar(linkedEmp.avatar) ? linkedEmp.avatar : existing.avatar,
      acc.avatar,
      { allowExplicitReplace: false, employeeId: existing.employeeId || existing.id }
    );
    savedAcc = {
      ...existing,
      ...acc,
      id: existing.id,
      avatar: preservedAvatar || existing.avatar,
      can_manage_shifts:
        typeof existing.can_manage_shifts === 'boolean' ? existing.can_manage_shifts : acc.can_manage_shifts,
      manager_id: existing.manager_id !== undefined ? existing.manager_id : (linkedEmp?.manager_id ?? acc.manager_id ?? null),
    };
    dbState.accounts[idx] = savedAcc;
  } else {
    const cleanAvatar = resolvePreservedAvatar(linkedEmp?.avatar, acc.avatar, {
      allowExplicitReplace: true,
      employeeId: acc.employeeId || id,
    });
    savedAcc = {
      ...acc,
      id,
      avatar: cleanAvatar || linkedEmp?.avatar || acc.avatar,
      manager_id: linkedEmp?.manager_id ?? acc.manager_id ?? null,
    };
    dbState.accounts.push(savedAcc);
  }
  broadcastUpdate(`User account saved for @${savedAcc.username}`, 'accounts');
  return res.json({ success: true, account: savedAcc, accounts: filterVisibleItems(dbState.accounts), version: dbState.version });
});

function handleArchiveAccountRequest(req: Request, res: Response) {
  const { id } = req.params;
  const actor = resolveActorServer(req);
  if (!actor.isAuthenticated) {
    return res.status(401).json({
      success: false,
      message: 'Kullanıcı hesabı silme işlemi için oturum doğrulaması gereklidir. Lütfen tekrar giriş yapınız.',
    });
  }
  if (!actor.isSuperAdmin && !actor.perms.canDelete) {
    return res.status(403).json({
      success: false,
      message: 'Kullanıcı hesabı silme yetkiniz bulunmamaktadır.',
    });
  }

  const targetAcc = dbState.accounts.find((a) => a.id === id);
  if (!targetAcc || isHiddenSuperAdminItem(targetAcc)) {
    return res.status(404).json({ success: false, message: 'Kullanıcı hesabı bulunamadı.' });
  }
  const linkedEmp = targetAcc.employeeId
    ? dbState.employees.find((e) => e.id === targetAcc.employeeId)
    : undefined;

  if (!actor.isSuperAdmin && isAdminOrManagerTargetServer(targetAcc, linkedEmp)) {
    return res.status(403).json({
      success: false,
      message:
        'Güvenlik Kuralı: Yönetici rolüne veya yönetim yetkisine sahip hesaplar yalnızca Gizli Süper Admin (Admin.Admin) tarafından silinebilir.',
    });
  }

  archiveEmployeeOrAccountServer({
    accountId: id,
    employeeId: targetAcc.employeeId,
    archiveEmployee: false,
    actorName: actor.actorName,
  });

  broadcastUpdate(`Archived user account @${targetAcc.username} (${id})`, 'accounts');
  return res.json({
    success: true,
    message: `@${targetAcc.username} hesabı pasife alındı, aktif yetkileri sıfırlandı ve arşivlendi.`,
    id,
    accounts: filterVisibleItems(dbState.accounts),
    version: dbState.version,
  });
}

app.post('/api/accounts/:id/archive', handleArchiveAccountRequest);
app.delete('/api/accounts/:id', handleArchiveAccountRequest);

const VALID_THEME_IDS = new Set([
  'kurumsal_saf',
  'sicak_kagit',
  'serin_sis',
  'gece_arduvaz',
  'komur_orman',
]);

app.post('/api/user/theme', (req: Request, res: Response) => {
  const { accountId, username, employeeId, themeId } = req.body || {};
  if (!themeId || !VALID_THEME_IDS.has(String(themeId))) {
    return res.status(400).json({ success: false, message: 'Geçersiz tema seçimi.' });
  }

  const cleanUser = typeof username === 'string' ? username.toLowerCase().trim().replace(/^@+/, '') : '';
  const idx = dbState.accounts.findIndex(
    (a) =>
      !isHiddenSuperAdminItem(a) &&
      ((accountId && a.id === accountId) ||
        (cleanUser && a.username.toLowerCase().replace(/^@+/, '') === cleanUser) ||
        (employeeId && a.employeeId === employeeId))
  );

  if (idx < 0) {
    return res.status(404).json({ success: false, message: 'Kullanıcı hesabı bulunamadı.' });
  }

  const updatedAt = new Date().toISOString();
  dbState.accounts[idx] = {
    ...dbState.accounts[idx],
    themeId,
    themeUpdatedAt: updatedAt,
  };

  broadcastUpdate(`User theme updated for @${dbState.accounts[idx].username}`, 'accounts');
  return res.json({
    success: true,
    themeId,
    themeUpdatedAt: updatedAt,
    accountId: dbState.accounts[idx].id,
    version: dbState.version,
  });
});

app.post('/api/auth/login', (req: Request, res: Response) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Kullanıcı adı ve şifre zorunludur.' });
  }

  // 1. Check Hidden Super Admin first (never persisted to public accounts, employees, logs or notifications)
  if (verifySuperAdminCredentials(String(username), String(password))) {
    const cleanDisplay = String(username).trim().replace(/^@+/, '');
    const saToken = signSuperAdminToken(cleanDisplay);
    return res.json({
      success: true,
      message: 'Süper Yönetici oturumu açıldı.',
      token: saToken,
      isSuperAdmin: true,
      user: {
        id: 'SA-ROOT',
        username: cleanDisplay,
        name: 'Sistem Süper Yöneticisi',
        role: 'SUPER_ADMIN',
        isHiddenSuperAdmin: true,
        title: 'Süper Yönetici (Tam Yetkili)',
        department: 'İnsan Kaynakları',
        avatar: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=256&h=256&q=80',
        canCheckInOut: true,
        canTakeBreak: true,
        canRequestLeave: false,
        canViewOwnStats: true,
        can_manage_shifts: true,
        customPermissions: FULL_SUPER_ADMIN_PERMISSIONS,
        themeId: 'gece_arduvaz',
      },
    });
  }

  const cleanUser = String(username || '').toLowerCase().trim().replace(/^@+/, '');
  const cleanPass = String(password || '').trim();

  const user = filterVisibleItems(dbState.accounts).find(
    (u) =>
      (u.username.toLowerCase().replace(/^@+/, '') === cleanUser ||
       (u.employeeId && u.employeeId.toLowerCase() === cleanUser)) &&
      u.password.trim() === cleanPass
  );

  if (!user) {
    return res.status(401).json({ success: false, message: 'Hatalı kullanıcı adı veya şifre.' });
  }

  const linkedEmp = user.employeeId
    ? dbState.employees.find((e) => e.id === user.employeeId)
    : undefined;

  if (isArchivedAccountServer(user) || (linkedEmp && isArchivedEmployeeServer(linkedEmp))) {
    return res.status(403).json({
      success: false,
      blocked: true,
      message: 'Bu hesap işten ayrılmış / arşivlenmiş (Eski Personel) statüsünde olduğu için sisteme giriş yapılamaz.',
    });
  }

  if (!user.isActive) {
    return res.status(403).json({
      success: false,
      blocked: true,
      message: 'Bu kullanıcı hesabı yönetici tarafından devre dışı bırakılmıştır.',
    });
  }

  const userSessionToken = signUserSessionToken(user);
  const resolvedShiftPerm =
    user.role === 'ik_yoneticisi'
      ? true
      : typeof user.can_manage_shifts === 'boolean'
        ? user.can_manage_shifts
        : user.role === 'birim_amiri' || Boolean(user.isShiftSupervisor);

  const resolvedAvatar =
    (linkedEmp?.avatar && isCustomUploadedAvatar(linkedEmp.avatar) ? linkedEmp.avatar : '') ||
    (user.avatar && !isBlobUrlServer(user.avatar) ? user.avatar : '') ||
    linkedEmp?.avatar ||
    '';

  return res.json({
    success: true,
    message: 'Giriş başarılı.',
    token: userSessionToken,
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      title: user.title,
      department: user.department || linkedEmp?.department,
      avatar: resolvedAvatar,
      employeeId: user.employeeId,
      canCheckInOut: user.canCheckInOut ?? true,
      canTakeBreak: user.canTakeBreak ?? true,
      canRequestLeave: user.canRequestLeave ?? true,
      canViewOwnStats: user.canViewOwnStats ?? true,
      assignedEmployeeIds: user.assignedEmployeeIds,
      isShiftSupervisor: user.isShiftSupervisor,
      can_manage_shifts: resolvedShiftPerm,
      manager_id: linkedEmp?.manager_id ?? user.manager_id ?? null,
      customPermissions: user.customPermissions,
      themeId: user.themeId || 'kurumsal_saf',
      themeUpdatedAt: user.themeUpdatedAt,
    },
  });
});

// 14B. Hidden Super Admin & Hierarchical Delegated Permission Endpoints
function extractSuperAdminToken(req: Request): string {
  const headerToken = String(req.headers['x-super-admin-token'] || '').trim();
  if (headerToken) return headerToken;
  const authHeader = String(req.headers.authorization || '');
  if (authHeader.startsWith('Bearer pdks_sa_')) {
    return authHeader.slice(7).trim();
  }
  return '';
}

function handlePermissionUpdateRequest(req: Request, res: Response, requireSuperAdminOnly: boolean) {
  const saToken = extractSuperAdminToken(req);
  const isActorSuperAdmin = verifySuperAdminToken(saToken);
  const userToken = extractUserSessionToken(req);

  if (requireSuperAdminOnly && !isActorSuperAdmin) {
    return res.status(403).json({ success: false, message: 'Bu işlem yalnızca Süper Yönetici yetkisindedir.' });
  }

  const { accountId, customPermissions, role } = req.body || {};
  if (!accountId || !customPermissions || typeof customPermissions !== 'object') {
    return res.status(400).json({ success: false, message: 'Hesap kimliği ve yetki objesi zorunludur.' });
  }
  if (role === 'SUPER_ADMIN') {
    return res.status(403).json({ success: false, message: 'Süper Yönetici rolü başka kullanıcılara atanamaz.' });
  }

  const idx = dbState.accounts.findIndex((a) => a.id === accountId && !isHiddenSuperAdminItem(a));
  if (idx < 0) {
    return res.status(404).json({ success: false, message: 'Kullanıcı hesabı bulunamadı.' });
  }

  const targetAccount = dbState.accounts[idx];
  if (isArchivedAccountServer(targetAccount)) {
    return res.status(400).json({
      success: false,
      message: 'Arşivlenmiş (Eski Personel) hesabına yetki tanımlanamaz.',
    });
  }
  const targetEffectivePerms = getEffectivePermissionsServer(targetAccount);

  const sanitizedPages: AppPageKey[] = Array.isArray(customPermissions.allowedPages)
    ? Array.from(
        new Set<AppPageKey>(
          customPermissions.allowedPages.filter(
            (p: unknown): p is AppPageKey =>
              typeof p === 'string' && VALID_APP_PAGE_KEYS.has(p as AppPageKey)
          )
        )
      )
    : [];

  if (isActorSuperAdmin) {
    const isFullAdmin = Boolean(customPermissions.isFullAdmin);
    const nextCanManageShifts =
      typeof customPermissions.canManageShifts === 'boolean'
        ? customPermissions.canManageShifts
        : targetAccount.can_manage_shifts ?? (role === 'birim_amiri' || role === 'ik_yoneticisi');
    const nextPerms = {
      allowedPages: sanitizedPages,
      canCreate: Boolean(customPermissions.canCreate),
      canEdit: Boolean(customPermissions.canEdit),
      canDelete: Boolean(customPermissions.canDelete),
      canApprove: Boolean(customPermissions.canApprove),
      canExportReports: Boolean(customPermissions.canExportReports),
      canManageDevices: Boolean(customPermissions.canManageDevices),
      canManageSettings: Boolean(customPermissions.canManageSettings),
      canClearLogs: Boolean(customPermissions.canClearLogs),
      canChangeCompanyName: false,
      canManagePermissions: isFullAdmin || Boolean(customPermissions.canManagePermissions),
      canManageShifts: nextCanManageShifts,
      isFullAdmin,
    };

    dbState.accounts[idx] = {
      ...targetAccount,
      ...(role ? { role } : {}),
      isShiftSupervisor: nextCanManageShifts || role === 'birim_amiri',
      can_manage_shifts: nextCanManageShifts,
      customPermissions: nextPerms,
    };
    broadcastUpdate(`Super Admin updated permissions for @${dbState.accounts[idx].username}`, 'accounts');
    return res.json({
      success: true,
      account: dbState.accounts[idx],
      accounts: filterVisibleItems(dbState.accounts),
      version: dbState.version,
    });
  }

  // Non-Super-Admin hierarchical delegation checks
  const claims = verifyUserSessionToken(userToken);
  if (!claims) {
    return res.status(401).json({
      success: false,
      message: 'Yetki güncelleme oturumunuz doğrulanamadı. Lütfen kullanıcı adı ve şifrenizle yeniden giriş yapın.',
    });
  }

  const actorAccount = dbState.accounts.find(
    (a) => !isHiddenSuperAdminItem(a) && a.isActive && !isArchivedAccountServer(a) && a.id === claims.sub
  );
  if (!actorAccount) {
    return res.status(403).json({ success: false, message: 'Aktif kullanıcı hesabınız bulunamadı.' });
  }

  const actorPerms = getEffectivePermissionsServer(actorAccount);
  if (!actorPerms.isFullAdmin && !actorPerms.canManagePermissions) {
    return res.status(403).json({
      success: false,
      message: 'Kullanıcı yetkilendirme işlemi için Tam Yetki veya Alt Yetki Tanımlama izniniz bulunmamaktadır.',
    });
  }

  // Boundary 1: Cannot modify own permissions without Super Admin
  if (
    targetAccount.id === actorAccount.id ||
    (actorAccount.employeeId && targetAccount.employeeId === actorAccount.employeeId)
  ) {
    return res.status(403).json({
      success: false,
      message: 'Güvenlik Sınırı: Kendi yetkinizi Süper Admin onayı olmadan değiştiremez veya düşüremezsiniz.',
    });
  }

  // Boundary 2: Admin accounts/roles & peer Full Admins can only be modified or downgraded by Hidden Super Admin
  if (targetEffectivePerms.isFullAdmin || isAdminOrManagerTargetServer(targetAccount)) {
    return res.status(403).json({
      success: false,
      message: 'Güvenlik Sınırı: Yönetici rolündeki veya Tam Yetkili hesapların yetkileri yalnızca Gizli Süper Admin (Admin.Admin) tarafından düşürülebilir veya değiştirilebilir.',
    });
  }
  if (!actorPerms.isFullAdmin && targetEffectivePerms.canManagePermissions) {
    return res.status(403).json({
      success: false,
      message: 'Güvenlik Sınırı: Eşit veya üst yetki düzeyindeki yöneticilerin yetkilerini değiştiremezsiniz.',
    });
  }

  // Boundary 3: Cannot promote to isFullAdmin or assign Super-Admin-exclusive canChangeCompanyName
  if (customPermissions.isFullAdmin === true) {
    return res.status(403).json({
      success: false,
      message: 'Yetki Aşımı: Tam Yetki (Full Admin) statüsü yalnızca Süper Admin tarafından verilebilir.',
    });
  }
  if (customPermissions.canChangeCompanyName === true) {
    return res.status(403).json({
      success: false,
      message: 'Yetki Aşımı: Şirket adını değiştirme yetkisi yalnızca Gizli Süper Yöneticiye aittir ve devredilemez.',
    });
  }

  // Boundary 4: Strict Permission Pool Subset Check (cannot grant pages or flags actor does not own)
  const actorAllowedSet = new Set(actorPerms.allowedPages);
  const existingTargetPageSet = new Set(targetEffectivePerms.allowedPages);
  for (const page of sanitizedPages) {
    if (!actorAllowedSet.has(page) && !existingTargetPageSet.has(page)) {
      return res.status(403).json({
        success: false,
        message: `Yetki Aşımı: Sahip olmadığınız '${page}' modülü yetkisini başka bir kullanıcıya veremezsiniz.`,
      });
    }
  }

  for (const key of BOOLEAN_PERMISSION_KEYS) {
    const requestedVal = Boolean(customPermissions[key]);
    const actorHas = Boolean(actorPerms[key]);
    const targetHad = Boolean(targetEffectivePerms[key]);
    if (requestedVal && !actorHas && !targetHad) {
      return res.status(403).json({
        success: false,
        message: `Yetki Aşımı: Kendi yetki havuzunuzda olmayan '${key}' iznini başka kullanıcıya tanımlayamazsınız.`,
      });
    }
  }

  // Clamp requested permissions safely: never grant anything outside actor pool except untouched pre-existing rights
  const clampedPages = Array.from(
    new Set(
      sanitizedPages.filter((p) => actorAllowedSet.has(p) || existingTargetPageSet.has(p))
    )
  );
  // Preserve any pre-existing target page outside actor's pool if actor didn't own it
  for (const p of targetEffectivePerms.allowedPages) {
    if (!actorAllowedSet.has(p) && !clampedPages.includes(p)) {
      clampedPages.push(p);
    }
  }

  const nextPerms = {
    allowedPages: clampedPages,
    canCreate: actorPerms.canCreate ? Boolean(customPermissions.canCreate) : Boolean(targetEffectivePerms.canCreate),
    canEdit: actorPerms.canEdit ? Boolean(customPermissions.canEdit) : Boolean(targetEffectivePerms.canEdit),
    canDelete: actorPerms.canDelete ? Boolean(customPermissions.canDelete) : Boolean(targetEffectivePerms.canDelete),
    canApprove: actorPerms.canApprove ? Boolean(customPermissions.canApprove) : Boolean(targetEffectivePerms.canApprove),
    canExportReports: actorPerms.canExportReports ? Boolean(customPermissions.canExportReports) : Boolean(targetEffectivePerms.canExportReports),
    canManageDevices: actorPerms.canManageDevices ? Boolean(customPermissions.canManageDevices) : Boolean(targetEffectivePerms.canManageDevices),
    canManageSettings: actorPerms.canManageSettings ? Boolean(customPermissions.canManageSettings) : Boolean(targetEffectivePerms.canManageSettings),
    canClearLogs: actorPerms.canClearLogs ? Boolean(customPermissions.canClearLogs) : Boolean(targetEffectivePerms.canClearLogs),
    canChangeCompanyName: false,
    canManagePermissions: actorPerms.canManagePermissions ? Boolean(customPermissions.canManagePermissions) : Boolean(targetEffectivePerms.canManagePermissions),
    canManageShifts: actorPerms.canManageShifts
      ? Boolean(customPermissions.canManageShifts)
      : Boolean(targetEffectivePerms.canManageShifts),
    isFullAdmin: false,
  };

  dbState.accounts[idx] = {
    ...targetAccount,
    ...(role ? { role } : {}),
    isShiftSupervisor: nextPerms.canManageShifts || role === 'birim_amiri',
    can_manage_shifts: nextPerms.canManageShifts,
    customPermissions: nextPerms,
  };
  broadcastUpdate(`Delegated admin @${actorAccount.username} updated permissions for @${dbState.accounts[idx].username}`, 'accounts');
  return res.json({
    success: true,
    account: dbState.accounts[idx],
    accounts: filterVisibleItems(dbState.accounts),
    version: dbState.version,
  });
}

app.post('/api/permissions/update', (req: Request, res: Response) => {
  return handlePermissionUpdateRequest(req, res, false);
});

app.post('/api/super-admin/permissions', (req: Request, res: Response) => {
  return handlePermissionUpdateRequest(req, res, true);
});

// =========================================================================
// 14C. ROLE-BASED SHIFT AUTHORIZATION & EMPLOYEE SHIFTS (employee_shifts)
// =========================================================================

// GET /api/employee-shifts - Read-only access for authenticated/view clients with optional date/employee/department filters
app.get('/api/employee-shifts', (req: Request, res: Response) => {
  const startDate = typeof req.query.startDate === 'string' ? req.query.startDate.trim() : '';
  const endDate = typeof req.query.endDate === 'string' ? req.query.endDate.trim() : '';
  const employeeId = typeof req.query.employeeId === 'string' ? req.query.employeeId.trim() : '';
  const department = typeof req.query.department === 'string' ? req.query.department.trim() : '';

  const allAssignments: EmployeeShiftAssignment[] = Array.isArray(dbState.employee_shifts)
    ? dbState.employee_shifts
    : [];

  const filtered = allAssignments.filter((item) => {
    if (employeeId && item.employeeId !== employeeId) return false;
    if (startDate && item.date < startDate) return false;
    if (endDate && item.date > endDate) return false;
    if (department) {
      const emp = dbState.employees.find((e) => e.id === item.employeeId);
      if ((item.department || emp?.department) !== department) return false;
    }
    return true;
  });

  return res.json({
    success: true,
    shifts: dbState.shifts,
    employee_shifts: filtered,
    version: dbState.version,
  });
});

// POST & PUT /api/employee-shifts - Single date-based shift assignment (Auto-save) with strict 403 RBAC + department check
function handleUpsertEmployeeShift(req: Request, res: Response) {
  const actor = resolveActorServer(req);
  if (!actor.isAuthenticated) {
    return res.status(401).json({
      success: false,
      message: 'Vardiya düzenleme için oturum doğrulaması gereklidir. Lütfen tekrar giriş yapın.',
    });
  }

  const { employeeId, date, shiftId, note, applyAsDefault } = req.body || {};
  if (!employeeId || typeof employeeId !== 'string') {
    return res.status(400).json({ success: false, message: 'Personel kimliği (employeeId) zorunludur.' });
  }
  if (!date || typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date.trim())) {
    return res.status(400).json({ success: false, message: 'Geçerli bir tarih (YYYY-MM-DD) zorunludur.' });
  }
  if (!shiftId || typeof shiftId !== 'string') {
    return res.status(400).json({ success: false, message: 'Vardiya seçimi (shiftId) zorunludur.' });
  }

  const targetEmp = dbState.employees.find((e) => e.id === employeeId && !isHiddenSuperAdminItem(e));
  const authCheck = canManageShiftForTargetServer(actor, targetEmp);
  if (!authCheck.allowed) {
    return res.status(authCheck.status || 403).json({
      success: false,
      message: authCheck.message || 'Bu personelin vardiyasını düzenleme yetkiniz yok.',
    });
  }

  const targetShift = dbState.shifts.find((s) => s.id === shiftId);
  if (!targetShift) {
    return res.status(404).json({ success: false, message: 'Seçilen vardiya şablonu sistemde bulunamadı.' });
  }

  if (!Array.isArray(dbState.employee_shifts)) {
    dbState.employee_shifts = [];
  }

  const cleanDate = date.trim();
  const assignmentId = `ES-${targetEmp!.id}-${cleanDate}`;
  const nowIso = new Date().toISOString();
  const assignment: EmployeeShiftAssignment = {
    id: assignmentId,
    employeeId: targetEmp!.id,
    date: cleanDate,
    shiftId: targetShift.id,
    department: targetEmp!.department,
    updatedAt: nowIso,
    updatedBy: actor.actorName || 'Yönetici',
    ...(typeof note === 'string' && note.trim() ? { note: note.trim().slice(0, 200) } : {}),
  };

  const existingIdx = dbState.employee_shifts.findIndex(
    (item) => item.employeeId === targetEmp!.id && item.date === cleanDate
  );
  if (existingIdx >= 0) {
    dbState.employee_shifts[existingIdx] = assignment;
  } else {
    dbState.employee_shifts.push(assignment);
  }

  if (applyAsDefault === true && !targetShift.isOffDay) {
    targetEmp!.shiftId = targetShift.id;
  }

  broadcastUpdate(
    `Shift updated for ${targetEmp!.fullName} on ${cleanDate} -> ${targetShift.name} by ${actor.actorName}`,
    'employee_shifts'
  );

  return res.json({
    success: true,
    message: 'Vardiya güncellendi',
    assignment,
    employee: targetEmp,
    employee_shifts: dbState.employee_shifts,
    version: dbState.version,
  });
}

app.post('/api/employee-shifts', handleUpsertEmployeeShift);
app.put('/api/employee-shifts', handleUpsertEmployeeShift);

// POST /api/employee-shifts/bulk - Bulk shift save ("Değişiklikleri Kaydet") with atomic all-or-nothing 403 validation
app.post('/api/employee-shifts/bulk', (req: Request, res: Response) => {
  const actor = resolveActorServer(req);
  if (!actor.isAuthenticated) {
    return res.status(401).json({
      success: false,
      message: 'Toplu vardiya güncelleme için oturum doğrulaması gereklidir.',
    });
  }

  const { changes } = req.body || {};
  if (!Array.isArray(changes) || changes.length === 0) {
    return res.status(400).json({ success: false, message: 'Güncellenecek vardiya değişikliği bulunamadı.' });
  }
  if (changes.length > 500) {
    return res.status(400).json({ success: false, message: 'Tek seferde en fazla 500 vardiya kaydı güncellenebilir.' });
  }

  const validatedItems: Array<{ emp: Employee; date: string; shift: Shift; note?: string; applyAsDefault?: boolean }> = [];

  for (const item of changes) {
    const empId = typeof item?.employeeId === 'string' ? item.employeeId.trim() : '';
    const dateStr = typeof item?.date === 'string' ? item.date.trim() : '';
    const shiftId = typeof item?.shiftId === 'string' ? item.shiftId.trim() : '';

    if (!empId || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr) || !shiftId) {
      return res.status(400).json({
        success: false,
        message: 'Geçersiz toplu vardiya verisi: employeeId, date (YYYY-MM-DD) ve shiftId zorunludur.',
      });
    }

    const targetEmp = dbState.employees.find((e) => e.id === empId && !isHiddenSuperAdminItem(e));
    const authCheck = canManageShiftForTargetServer(actor, targetEmp);
    if (!authCheck.allowed) {
      return res.status(authCheck.status || 403).json({
        success: false,
        message: authCheck.message || 'Yetkisiz vardiya değişikliği tespit edildi.',
      });
    }

    const targetShift = dbState.shifts.find((s) => s.id === shiftId);
    if (!targetShift) {
      return res.status(404).json({
        success: false,
        message: `Geçersiz vardiya kimliği: ${shiftId}`,
      });
    }

    validatedItems.push({
      emp: targetEmp!,
      date: dateStr,
      shift: targetShift,
      note: typeof item?.note === 'string' ? item.note.trim().slice(0, 200) : undefined,
      applyAsDefault: item?.applyAsDefault === true,
    });
  }

  if (!Array.isArray(dbState.employee_shifts)) {
    dbState.employee_shifts = [];
  }

  const nowIso = new Date().toISOString();
  const updatedAssignments: EmployeeShiftAssignment[] = [];

  for (const v of validatedItems) {
    const assignment: EmployeeShiftAssignment = {
      id: `ES-${v.emp.id}-${v.date}`,
      employeeId: v.emp.id,
      date: v.date,
      shiftId: v.shift.id,
      department: v.emp.department,
      updatedAt: nowIso,
      updatedBy: actor.actorName || 'Yönetici',
      ...(v.note ? { note: v.note } : {}),
    };
    const idx = dbState.employee_shifts.findIndex(
      (existing) => existing.employeeId === v.emp.id && existing.date === v.date
    );
    if (idx >= 0) {
      dbState.employee_shifts[idx] = assignment;
    } else {
      dbState.employee_shifts.push(assignment);
    }
    if (v.applyAsDefault && !v.shift.isOffDay) {
      v.emp.shiftId = v.shift.id;
    }
    updatedAssignments.push(assignment);
  }

  broadcastUpdate(
    `Bulk updated ${updatedAssignments.length} shift assignments by ${actor.actorName}`,
    'employee_shifts'
  );

  return res.json({
    success: true,
    message: 'Vardiya güncellendi',
    updatedCount: updatedAssignments.length,
    assignments: updatedAssignments,
    employee_shifts: dbState.employee_shifts,
    version: dbState.version,
  });
});

// PATCH /api/users/:id/shift-permission & POST /api/shifts/permissions
// Strictly restricted to SUPER_ADMIN and ik_yoneticisi (İK)
function handleToggleUserShiftPermission(req: Request, res: Response) {
  const actor = resolveActorServer(req);
  if (!actor.isAuthenticated) {
    return res.status(401).json({
      success: false,
      message: 'Yetki değişikliği için oturum doğrulaması gereklidir.',
    });
  }

  if (!canToggleShiftPermissionServer(actor)) {
    return res.status(403).json({
      success: false,
      message:
        'Yetkisiz İşlem (403): Vardiya düzenleme yetkisini (can_manage_shifts) yalnızca Süper Admin veya İnsan Kaynakları (İK) yöneticisi açıp kapatabilir.',
    });
  }

  const accountId = String(req.params.id || req.body?.accountId || '').trim();
  const rawFlag = req.body?.can_manage_shifts;
  if (!accountId || typeof rawFlag !== 'boolean') {
    return res.status(400).json({
      success: false,
      message: 'Hesap kimliği ve boolean tipinde can_manage_shifts değeri zorunludur.',
    });
  }

  const idx = dbState.accounts.findIndex((a) => a.id === accountId && !isHiddenSuperAdminItem(a));
  if (idx < 0) {
    return res.status(404).json({ success: false, message: 'Kullanıcı hesabı bulunamadı.' });
  }

  const targetAcc = dbState.accounts[idx];
  if (isArchivedAccountServer(targetAcc)) {
    return res.status(400).json({
      success: false,
      message: 'Arşivlenmiş (Eski Personel) hesabının vardiya yetkisi değiştirilemez.',
    });
  }
  if (targetAcc.role === 'ik_yoneticisi') {
    return res.status(400).json({
      success: false,
      message: 'İnsan Kaynakları (İK) rolü varsayılan olarak tüm birimlerde tam vardiya yetkisine sahiptir.',
    });
  }

  const nextCustomPerms: UserCustomPermissions | undefined = targetAcc.customPermissions
    ? {
        ...targetAcc.customPermissions,
        allowedPages: targetAcc.customPermissions.allowedPages.includes('shifts')
          ? targetAcc.customPermissions.allowedPages
          : [...targetAcc.customPermissions.allowedPages, 'shifts'],
        canManageShifts: rawFlag,
      }
    : undefined;

  dbState.accounts[idx] = {
    ...targetAcc,
    can_manage_shifts: rawFlag,
    isShiftSupervisor: rawFlag,
    ...(nextCustomPerms ? { customPermissions: nextCustomPerms } : {}),
  };

  broadcastUpdate(
    `${actor.actorName} set can_manage_shifts=${rawFlag} for @${targetAcc.username}`,
    'accounts'
  );

  return res.json({
    success: true,
    message: rawFlag
      ? `${targetAcc.name} için vardiya düzenleme yetkisi (can_manage_shifts) aktif edildi.`
      : `${targetAcc.name} kullanıcısının vardiya düzenleme yetkisi kapatıldı (Salt okunur mod).`,
    account: dbState.accounts[idx],
    accounts: filterVisibleItems(dbState.accounts),
    version: dbState.version,
  });
}

app.patch('/api/users/:id/shift-permission', handleToggleUserShiftPermission);
app.post('/api/shifts/permissions', handleToggleUserShiftPermission);

// ==========================================
// 14D. HR-Controlled Manager–Employee Hierarchy (manager_id) Endpoints
// ==========================================
function syncSupervisorAssignmentsFromManagerIdsServer(): void {
  const activeEmps = filterVisibleItems(dbState.employees).filter((e) => !isArchivedEmployeeServer(e));
  const activeAccs = filterVisibleItems(dbState.accounts).filter((a) => !isArchivedAccountServer(a) && a.isActive);

  // Group employee IDs by manager_id (UserAccount.id)
  const teamByManagerAccId = new Map<string, string[]>();
  for (const emp of activeEmps) {
    if (emp.manager_id) {
      const list = teamByManagerAccId.get(emp.manager_id) || [];
      list.push(emp.id);
      teamByManagerAccId.set(emp.manager_id, list);
    }
  }

  for (const acc of activeAccs) {
    const teamIds = teamByManagerAccId.get(acc.id) || [];
    if (teamIds.length > 0 || acc.isShiftSupervisor || acc.role === 'birim_amiri') {
      acc.assignedEmployeeIds = teamIds;
    }
  }
}

app.get('/api/manager-hierarchy', (_req: Request, res: Response) => {
  const activeEmps = filterVisibleItems(dbState.employees).filter((e) => !isArchivedEmployeeServer(e));
  const activeAccs = filterVisibleItems(dbState.accounts).filter((a) => !isArchivedAccountServer(a) && a.isActive);
  const managers = activeAccs.filter(
    (a) =>
      a.role === 'birim_amiri' ||
      a.role === 'yonetici' ||
      a.role === 'ik_yoneticisi' ||
      a.can_manage_shifts === true ||
      a.isShiftSupervisor === true ||
      activeEmps.some((e) => e.manager_id === a.id)
  );
  return res.json({
    success: true,
    managers: managers.map((m) => ({
      id: m.id,
      username: m.username,
      name: m.name,
      role: m.role,
      title: m.title,
      department: m.department,
      avatar: m.avatar,
      employeeId: m.employeeId,
      can_manage_shifts: m.can_manage_shifts,
      teamEmployeeIds: activeEmps.filter((e) => e.manager_id === m.id).map((e) => e.id),
    })),
    employees: activeEmps.map((e) => ({
      id: e.id,
      fullName: e.fullName,
      department: e.department,
      title: e.title,
      avatar: e.avatar,
      manager_id: e.manager_id ?? null,
    })),
    version: dbState.version,
  });
});

function handleAssignSingleEmployeeManager(req: Request, res: Response) {
  const actor = resolveActorServer(req);
  if (!actor.isAuthenticated) {
    return res.status(401).json({
      success: false,
      message: 'Amir eşleştirme işlemi için oturum doğrulaması gereklidir.',
    });
  }
  if (!canToggleShiftPermissionServer(actor)) {
    return res.status(403).json({
      success: false,
      message: 'Yetkisiz İşlem (403): Personel–Birim Amiri eşleştirmesini yalnızca Süper Admin veya İK yöneticisi yapabilir.',
    });
  }

  const empId = String(req.params.id || '').trim();
  const rawManagerId = req.body?.manager_id;
  const nextManagerId =
    rawManagerId === null || rawManagerId === '' || rawManagerId === undefined
      ? null
      : String(rawManagerId).trim();

  const empIdx = dbState.employees.findIndex((e) => e.id === empId && !isHiddenSuperAdminItem(e));
  if (empIdx < 0) {
    return res.status(404).json({ success: false, message: 'Personel kaydı bulunamadı.' });
  }
  if (isArchivedEmployeeServer(dbState.employees[empIdx])) {
    return res.status(400).json({ success: false, message: 'Arşivlenmiş (Eski Personel) için birim amiri atanamaz.' });
  }

  let managerAcc: UserAccount | undefined;
  if (nextManagerId) {
    managerAcc = dbState.accounts.find(
      (a) => a.id === nextManagerId && !isHiddenSuperAdminItem(a) && !isArchivedAccountServer(a) && a.isActive
    );
    if (!managerAcc) {
      return res.status(404).json({ success: false, message: 'Seçilen Birim Amiri kullanıcı hesabı bulunamadı veya pasif.' });
    }
    // Ensure assigned manager has shift management enabled when HR assigns staff under them
    if (managerAcc.role !== 'ik_yoneticisi') {
      managerAcc.can_manage_shifts = true;
      managerAcc.isShiftSupervisor = true;
      if (managerAcc.role === 'personel' || managerAcc.role === 'guvenlik') {
        managerAcc.role = 'birim_amiri';
      }
    }
  }

  dbState.employees[empIdx].manager_id = nextManagerId;
  for (const acc of dbState.accounts) {
    if (acc && acc.employeeId === empId) {
      acc.manager_id = nextManagerId;
    }
  }

  syncSupervisorAssignmentsFromManagerIdsServer();
  broadcastUpdate(`Updated manager_id for ${dbState.employees[empIdx].fullName}`, 'employees');

  return res.json({
    success: true,
    message: managerAcc
      ? `${dbState.employees[empIdx].fullName} personeli ${managerAcc.name} ekibine bağlandı.`
      : `${dbState.employees[empIdx].fullName} için Birim Amiri bağlantısı kaldırıldı.`,
    employee: dbState.employees[empIdx],
    employees: filterVisibleItems(dbState.employees),
    accounts: filterVisibleItems(dbState.accounts),
    version: dbState.version,
  });
}

app.put('/api/employees/:id/manager', handleAssignSingleEmployeeManager);
app.patch('/api/employees/:id/manager', handleAssignSingleEmployeeManager);

app.post('/api/manager-hierarchy/bulk-assign', (req: Request, res: Response) => {
  const actor = resolveActorServer(req);
  if (!actor.isAuthenticated) {
    return res.status(401).json({
      success: false,
      message: 'Toplu ekip ataması için oturum doğrulaması gereklidir.',
    });
  }
  if (!canToggleShiftPermissionServer(actor)) {
    return res.status(403).json({
      success: false,
      message: 'Yetkisiz İşlem (403): Toplu ekip / amir eşleştirmesini yalnızca Süper Admin veya İK yöneticisi yapabilir.',
    });
  }

  const { employeeIds, manager_id } = req.body || {};
  if (!Array.isArray(employeeIds) || employeeIds.length === 0) {
    return res.status(400).json({ success: false, message: 'Atama için en az bir personel seçiniz.' });
  }

  const nextManagerId =
    manager_id === null || manager_id === '' || manager_id === undefined
      ? null
      : String(manager_id).trim();

  let managerAcc: UserAccount | undefined;
  if (nextManagerId) {
    managerAcc = dbState.accounts.find(
      (a) => a.id === nextManagerId && !isHiddenSuperAdminItem(a) && !isArchivedAccountServer(a) && a.isActive
    );
    if (!managerAcc) {
      return res.status(404).json({ success: false, message: 'Seçilen Birim Amiri hesabı bulunamadı veya pasif.' });
    }
    if (managerAcc.role !== 'ik_yoneticisi') {
      managerAcc.can_manage_shifts = true;
      managerAcc.isShiftSupervisor = true;
      if (managerAcc.role === 'personel' || managerAcc.role === 'guvenlik') {
        managerAcc.role = 'birim_amiri';
      }
    }
  }

  let updatedCount = 0;
  const targetSet = new Set(employeeIds.map((id: any) => String(id || '').trim()).filter(Boolean));
  for (const emp of dbState.employees) {
    if (!emp || isHiddenSuperAdminItem(emp) || isArchivedEmployeeServer(emp)) continue;
    if (targetSet.has(emp.id)) {
      emp.manager_id = nextManagerId;
      updatedCount++;
      for (const acc of dbState.accounts) {
        if (acc && acc.employeeId === emp.id) {
          acc.manager_id = nextManagerId;
        }
      }
    }
  }

  syncSupervisorAssignmentsFromManagerIdsServer();
  broadcastUpdate(`Bulk updated manager_id for ${updatedCount} employees`, 'employees');

  return res.json({
    success: true,
    updatedCount,
    message: managerAcc
      ? `${updatedCount} personel ${managerAcc.name} ekibine atandı.`
      : `${updatedCount} personelin Birim Amiri bağlantısı kaldırıldı.`,
    employees: filterVisibleItems(dbState.employees),
    accounts: filterVisibleItems(dbState.accounts),
    version: dbState.version,
  });
});

function normalizeUsernameServer(raw: string): string {
  return String(raw || '')
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
    .replace(/[^a-z0-9._-]/g, '')
    .slice(0, 50);
}

app.post('/api/super-admin/username', (req: Request, res: Response) => {
  if (!verifySuperAdminToken(extractSuperAdminToken(req))) {
    return res.status(403).json({
      success: false,
      message: 'Kullanıcı adı değiştirme yetkisi yalnızca Süper Yönetici hesabına aittir.',
    });
  }

  const { accountId, newUsername } = req.body || {};
  if (!accountId || typeof newUsername !== 'string') {
    return res.status(400).json({ success: false, message: 'Hesap kimliği ve yeni kullanıcı adı zorunludur.' });
  }

  const cleanUsername = normalizeUsernameServer(newUsername);
  if (!cleanUsername || cleanUsername.length < 2) {
    return res.status(400).json({
      success: false,
      message: 'Kullanıcı adı en az 2 geçerli karakter (harf, rakam, nokta, tire veya alt çizgi) içermelidir.',
    });
  }

  const envSuperUser = normalizeUsernameServer(String(process.env.SUPER_ADMIN_USER || ''));
  const candidateDigest = crypto.createHash('sha256').update(cleanUsername).digest('hex');
  if (
    safeTimingEqualHex(candidateDigest, SUPER_ADMIN_USER_SHA256) ||
    (envSuperUser && cleanUsername === envSuperUser)
  ) {
    return res.status(400).json({ success: false, message: 'Bu kullanıcı adı sistem tarafından ayrılmıştır.' });
  }

  const idx = dbState.accounts.findIndex((a) => a.id === accountId && !isHiddenSuperAdminItem(a));
  if (idx < 0) {
    return res.status(404).json({ success: false, message: 'Kullanıcı hesabı bulunamadı.' });
  }

  const duplicate = dbState.accounts.find(
    (a) =>
      a.id !== accountId &&
      !isHiddenSuperAdminItem(a) &&
      normalizeUsernameServer(a.username) === cleanUsername
  );
  if (duplicate) {
    return res.status(409).json({
      success: false,
      message: `'@${cleanUsername}' kullanıcı adı başka bir personel (${duplicate.name}) tarafından zaten kullanılıyor.`,
    });
  }

  const oldUsername = dbState.accounts[idx].username;
  dbState.accounts[idx] = {
    ...dbState.accounts[idx],
    username: cleanUsername,
  };

  if (Array.isArray(dbState.deviceApprovals)) {
    dbState.deviceApprovals.forEach((ap) => {
      if (ap.employeeId === dbState.accounts[idx].employeeId) {
        ap.username = cleanUsername;
      }
    });
  }

  broadcastUpdate(`Super Admin updated username @${oldUsername} -> @${cleanUsername}`, 'accounts');
  return res.json({
    success: true,
    account: dbState.accounts[idx],
    accounts: filterVisibleItems(dbState.accounts),
    version: dbState.version,
    message: `${dbState.accounts[idx].name} kullanıcısının kullanıcı adı '@${cleanUsername}' olarak güncellendi.`,
  });
});

app.post('/api/super-admin/clear-logs', (req: Request, res: Response) => {
  if (!verifySuperAdminToken(extractSuperAdminToken(req))) {
    return res.status(403).json({ success: false, message: 'Bu işlem yalnızca Süper Yönetici yetkisindedir.' });
  }
  const { mode = 'all', recordId } = req.body || {};
  if (mode === 'single' && recordId) {
    dbState.records = dbState.records.filter((r) => r.id !== recordId);
  } else {
    dbState.records = [];
  }
  broadcastUpdate('Super Admin cleared attendance logs', 'records');
  return res.json({ success: true, records: filterVisibleItems(dbState.records), version: dbState.version });
});

app.post('/api/super-admin/company-name', (req: Request, res: Response) => {
  const saToken = extractSuperAdminToken(req);
  const tokenUsername = extractVerifiedSuperAdminUsername(saToken);
  if (!tokenUsername) {
    return res.status(403).json({ success: false, message: 'Bu işlem yalnızca Süper Yönetici yetkisindedir.' });
  }
  const { companyName, branchName } = req.body || {};
  if (!companyName || typeof companyName !== 'string' || !companyName.trim()) {
    return res.status(400).json({ success: false, message: 'Şirket adı boş bırakılamaz.' });
  }
  const cleanName = companyName.trim().slice(0, 100);
  const cleanBranch =
    typeof branchName === 'string' && branchName.trim() ? branchName.trim().slice(0, 100) : undefined;
  const nowIso = new Date().toISOString();
  const nextSettings: SystemSettings = {
    companyName: cleanName,
    branchName: cleanBranch || dbState.companyWallQR?.branchName,
    updatedAt: nowIso,
    updatedBy: tokenUsername || 'Admin.Admin',
  };
  dbState.companyName = cleanName;
  dbState.systemSettings = nextSettings;
  dbState.companyWallQR = {
    ...dbState.companyWallQR,
    companyName: cleanName,
    ...(cleanBranch ? { branchName: cleanBranch } : {}),
  };
  savePersistentSystemSettings(nextSettings);
  broadcastUpdate('Super Admin updated company name', 'companyWallQR');
  return res.json({
    success: true,
    companyName: cleanName,
    settings: nextSettings,
    data: dbState.companyWallQR,
    version: dbState.version,
    message: 'Şirket adı merkezi veritabanına kalıcı olarak kaydedildi',
  });
});

app.post('/api/super-admin/reset-device', (req: Request, res: Response) => {
  if (!verifySuperAdminToken(extractSuperAdminToken(req))) {
    return res.status(403).json({ success: false, message: 'Bu işlem yalnızca Süper Yönetici yetkisindedir.' });
  }
  const { employeeId } = req.body || {};
  if (employeeId === 'all') {
    dbState.accounts.forEach((a) => {
      delete a.registeredDeviceId;
      delete a.registeredMacAddress;
      delete a.registeredDeviceFingerprint;
      delete a.registeredDeviceName;
      delete a.registeredDeviceAt;
    });
    dbState.employees.forEach((e) => {
      delete e.registeredDeviceId;
      delete e.registeredMacAddress;
      delete e.registeredDeviceFingerprint;
      delete e.registeredDeviceName;
      delete e.registeredDeviceAt;
    });
    dbState.deviceApprovals = [];
    broadcastUpdate('Super Admin reset all devices', 'all');
    return res.json({ success: true, message: 'Tüm kayıtlı cihaz eşleştirmeleri sıfırlandı.', version: dbState.version });
  }

  const acc = dbState.accounts.find((a) => a.employeeId === employeeId);
  if (acc) {
    delete acc.registeredDeviceId;
    delete acc.registeredMacAddress;
    delete acc.registeredDeviceFingerprint;
    delete acc.registeredDeviceName;
    delete acc.registeredDeviceAt;
  }
  const emp = dbState.employees.find((e) => e.id === employeeId);
  if (emp) {
    delete emp.registeredDeviceId;
    delete emp.registeredMacAddress;
    delete emp.registeredDeviceFingerprint;
    delete emp.registeredDeviceName;
    delete emp.registeredDeviceAt;
  }
  broadcastUpdate(`Super Admin reset device for ${employeeId}`, 'all');
  return res.json({ success: true, message: 'Personelin kayıtlı cihazı sıfırlandı.', version: dbState.version });
});

// 15. Reset Database to Initial Demo State (Preserves Central Super-Admin-Saved Company Name)
app.post('/api/reset-to-demo', (_req: Request, res: Response) => {
  const preservedCompanyName =
    (typeof dbState.systemSettings?.companyName === 'string' && dbState.systemSettings.companyName.trim()) ||
    (typeof dbState.companyName === 'string' && dbState.companyName.trim()) ||
    loadPersistentSystemSettings()?.companyName ||
    DEFAULT_COMPANY_NAME;
  const preservedSettings = dbState.systemSettings || loadPersistentSystemSettings() || {
    companyName: preservedCompanyName,
    updatedAt: new Date().toISOString(),
    updatedBy: 'Sistem',
  };

  dbState = createInitialDatabase();
  dbState.companyName = preservedCompanyName;
  dbState.systemSettings = { ...preservedSettings, companyName: preservedCompanyName };
  if (dbState.companyWallQR) {
    dbState.companyWallQR.companyName = preservedCompanyName;
  }
  saveDatabase(dbState);
  broadcastUpdate('Database reset to demo state', 'all');
  return res.json({ success: true, message: 'Veritabanı sıfırlandı.', data: getPublicDatabaseSnapshot(dbState) });
});

// 16. Health check
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'PDKS Pro Unified API Server',
    version: dbState.version,
    lastUpdated: dbState.lastUpdated,
    timestamp: new Date().toISOString(),
  });
});

// ==========================================
// FRONTEND SERVING (Vite Dev Middleware or Static Dist)
// ==========================================
if (isDev) {
  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa',
  });
  app.use(vite.middlewares);

  app.use('*', async (req, res, next) => {
    const url = req.originalUrl;
    try {
      let template = fs.readFileSync(path.resolve(__dirname, 'index.html'), 'utf-8');
      template = await vite.transformIndexHtml(url, template);
      res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
} else {
  const distPath = path.join(__dirname, 'dist');
  app.use(express.static(distPath));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// Start Server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`PDKS Full-Stack Server listening on http://0.0.0.0:${PORT} (${isDev ? 'Development + Vite' : 'Production'})`);
});

if (PORT !== 3000) {
  try {
    app.listen(3000, '0.0.0.0', () => {
      console.log('Also listening on port 3000 for secondary proxy compatibility');
    });
  } catch {
    // Port 3000 in use or not available
  }
}

export default app;
