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
} from './src/db/defaultData.ts';
import type { PDKSDatabase } from './src/db/defaultData.ts';
import type {
  ActionType,
  AppPageKey,
  AttendanceRecord,
  Employee,
  Shift,
  LeaveRequest,
  OvertimeRequest,
  PDKSNotification,
  UserAccount,
  UserCustomPermissions,
  SupervisorAssignment,
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
] as const;

function getDefaultPermissionsForRoleServer(role: string, isShiftSupervisor?: boolean): UserCustomPermissions {
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
      isFullAdmin: false,
    };
  }
  if (role === 'birim_amiri') {
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
      isFullAdmin: false,
    };
  }
  if (role === 'yonetici') {
    return {
      allowedPages: isShiftSupervisor ? ['shifts', 'kiosk', 'portal'] : ['kiosk', 'portal'],
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
      isFullAdmin: false,
    };
  }
  return {
    allowedPages: isShiftSupervisor ? ['shifts', 'kiosk', 'portal'] : ['kiosk', 'portal'],
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
    isFullAdmin: false,
  };
}

function getEffectivePermissionsServer(user: Partial<UserAccount> | null | undefined): UserCustomPermissions {
  if (!user) return getDefaultPermissionsForRoleServer('personel', false);
  if (user.role === 'SUPER_ADMIN' || user.isHiddenSuperAdmin) {
    return { ...FULL_SUPER_ADMIN_PERMISSIONS, allowedPages: [...FULL_SUPER_ADMIN_PERMISSIONS.allowedPages] };
  }
  const base = getDefaultPermissionsForRoleServer(user.role || 'personel', user.isShiftSupervisor);
  const custom = user.customPermissions;
  if (!custom) return base;
  const isFullAdmin = Boolean(custom.isFullAdmin);
  return {
    allowedPages: Array.isArray(custom.allowedPages)
      ? custom.allowedPages.filter((p) => VALID_APP_PAGE_KEYS.has(p))
      : base.allowedPages,
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

function filterVisibleItems<T>(list: T[]): T[] {
  return Array.isArray(list) ? list.filter((item) => !isHiddenSuperAdminItem(item)) : [];
}

function getPublicDatabaseSnapshot(db: PDKSDatabase): PDKSDatabase {
  return {
    ...db,
    employees: filterVisibleItems(db.employees),
    records: filterVisibleItems(db.records),
    notifications: filterVisibleItems(db.notifications),
    accounts: filterVisibleItems(db.accounts),
    deviceApprovals: filterVisibleItems(db.deviceApprovals),
    supervisorAssignments: filterVisibleItems(db.supervisorAssignments),
  };
}

app.use(express.json({ limit: '25mb' }));

// Persistent Database Directory & File
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'pdks-database.json');

function loadDatabase(): PDKSDatabase {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.employees) && Array.isArray(parsed.records)) {
        // If database still holds only untouched initial demo seed records from a prior date,
        // keep their dates aligned with today so Canlı Pano accurately reflects demo check-ins.
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
        const resolvedCompanyName =
          (typeof parsed.companyName === 'string' && parsed.companyName.trim()) ||
          (typeof parsed.companyWallQR?.companyName === 'string' && parsed.companyWallQR.companyName.trim()) ||
          DEFAULT_COMPANY_NAME;
        parsed.companyName = resolvedCompanyName;
        if (parsed.companyWallQR && typeof parsed.companyWallQR === 'object') {
          parsed.companyWallQR.companyName = resolvedCompanyName;
        }
        return parsed;
      }
    }
  } catch (err) {
    console.warn('Failed to read pdks-database.json, initializing fresh database:', err);
  }

  const initial = createInitialDatabase();
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

app.post('/api/db/sync', (req: Request, res: Response) => {
  try {
    const { updates, collection, data } = req.body || {};

    if (collection && data !== undefined) {
      if (collection === 'companyLogo' && typeof data === 'string' && data.trim().startsWith('blob:')) {
        return res.status(400).json({ success: false, message: 'Geçici blob: logo adresi kaydedilemez.' });
      }
      if (collection === 'companyWallQR' && data && typeof data === 'object') {
        const currentCompanyName =
          dbState.companyName || dbState.companyWallQR?.companyName || DEFAULT_COMPANY_NAME;
        dbState.companyWallQR = {
          ...data,
          companyName: currentCompanyName,
        };
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
              dbState.companyName || dbState.companyWallQR?.companyName || DEFAULT_COMPANY_NAME;
            dbState.companyWallQR = {
              ...updates[key],
              companyName: currentCompanyName,
            };
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

// 4. Employees CRUD
app.get('/api/employees', (_req: Request, res: Response) => {
  res.json({ success: true, employees: filterVisibleItems(dbState.employees) });
});

app.post('/api/employees', (req: Request, res: Response) => {
  const emp: Employee = req.body;
  if (!emp || !emp.id || !emp.fullName) {
    return res.status(400).json({ success: false, message: 'Personel ID ve adı zorunludur.' });
  }
  if (isHiddenSuperAdminItem(emp)) {
    return res.status(403).json({ success: false, message: 'Bu işlem desteklenmiyor.' });
  }

  const idx = dbState.employees.findIndex((e) => e.id === emp.id);
  if (idx >= 0) {
    dbState.employees[idx] = { ...dbState.employees[idx], ...emp };
  } else {
    dbState.employees.unshift(emp);
  }

  broadcastUpdate(`Saved employee ${emp.fullName}`, 'employees');
  return res.json({ success: true, employee: emp, employees: filterVisibleItems(dbState.employees), version: dbState.version });
});

app.delete('/api/employees/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  dbState.employees = dbState.employees.filter((e) => e.id !== id);
  broadcastUpdate(`Deleted employee ${id}`, 'employees');
  return res.json({ success: true, message: 'Personel silindi.', id, employees: filterVisibleItems(dbState.employees), version: dbState.version });
});

// Photo upload requests and approvals
app.post('/api/employees/:id/photo-request', (req: Request, res: Response) => {
  const { id } = req.params;
  const { photoData } = req.body;
  if (!photoData) {
    return res.status(400).json({ success: false, message: 'Fotoğraf verisi zorunludur.' });
  }
  const emp = dbState.employees.find((e) => e.id === id);
  if (!emp) {
    return res.status(404).json({ success: false, message: 'Personel bulunamadı.' });
  }

  emp.pendingAvatar = photoData;
  emp.avatarStatus = 'pending';
  emp.pendingAvatarDate = new Date().toISOString();

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
  return res.json({ success: true, message: 'Fotoğraf onay talebi iletildi.', employee: emp });
});

app.post('/api/employees/:id/photo-approve', (req: Request, res: Response) => {
  const { id } = req.params;
  const emp = dbState.employees.find((e) => e.id === id);
  if (!emp) {
    return res.status(404).json({ success: false, message: 'Personel bulunamadı.' });
  }
  if (emp.pendingAvatar) {
    emp.avatar = emp.pendingAvatar;
    emp.pendingAvatar = null;
    emp.pendingAvatarDate = null;
    emp.avatarStatus = 'approved';

    const account = dbState.accounts.find((a) => a.employeeId === id);
    if (account) {
      account.avatar = emp.avatar;
    }
  }
  broadcastUpdate(`Photo approved for ${emp.fullName}`, 'employees');
  return res.json({ success: true, message: 'Fotoğraf onaylandı.', employee: emp });
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
  broadcastUpdate(`Photo rejected for ${emp.fullName}`, 'employees');
  return res.json({ success: true, message: 'Fotoğraf reddedildi.', employee: emp });
});

app.put('/api/employees/:id/photo-direct', (req: Request, res: Response) => {
  const { id } = req.params;
  const { photoData } = req.body;
  const emp = dbState.employees.find((e) => e.id === id);
  if (!emp) {
    return res.status(404).json({ success: false, message: 'Personel bulunamadı.' });
  }
  emp.avatar = photoData;
  emp.pendingAvatar = null;
  emp.avatarStatus = 'approved';

  const account = dbState.accounts.find((a) => a.employeeId === id);
  if (account) {
    account.avatar = emp.avatar;
  }

  broadcastUpdate(`Photo directly updated for ${emp.fullName}`, 'employees');
  return res.json({ success: true, message: 'Fotoğraf güncellendi.', employee: emp });
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
  const shift: Shift = req.body;
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
  return res.json({ success: true, shift: updatedShift, shifts: dbState.shifts });
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

// 10. Company Wall QR Configuration
app.get('/api/company/wall-qr', (_req: Request, res: Response) => {
  res.json({ success: true, data: dbState.companyWallQR });
});

app.post('/api/company/wall-qr', (req: Request, res: Response) => {
  try {
    const body = req.body || {};
    const preservedCompanyName =
      dbState.companyName || dbState.companyWallQR?.companyName || DEFAULT_COMPANY_NAME;
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

// 10B. Dynamic Company Name Management (Requires logged-in admin password confirmation)
app.get('/api/company/name', (_req: Request, res: Response) => {
  const name = dbState.companyName || dbState.companyWallQR?.companyName || DEFAULT_COMPANY_NAME;
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

  dbState.companyName = cleanCompany;
  dbState.companyWallQR = {
    ...dbState.companyWallQR,
    companyName: cleanCompany,
    ...(cleanBranch ? { branchName: cleanBranch } : {}),
  };
  broadcastUpdate(`Company name updated to ${cleanCompany}`, 'companyWallQR');
  return res.json({
    success: true,
    companyName: cleanCompany,
    data: dbState.companyWallQR,
    version: dbState.version,
    message: 'Şirket adı başarıyla güncellendi',
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
  const item = { ...acc, id };
  const idx = dbState.accounts.findIndex((a) => a.id === id || a.username.toLowerCase() === acc.username.toLowerCase());
  if (idx >= 0) {
    dbState.accounts[idx] = { ...dbState.accounts[idx], ...item };
  } else {
    dbState.accounts.push(item);
  }
  broadcastUpdate(`User account saved for @${item.username}`, 'accounts');
  return res.json({ success: true, account: item, accounts: filterVisibleItems(dbState.accounts), version: dbState.version });
});

app.delete('/api/accounts/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  dbState.accounts = dbState.accounts.filter((a) => a.id !== id);
  broadcastUpdate(`User account deleted ${id}`, 'accounts');
  return res.json({ success: true, message: 'Kullanıcı hesabı silindi.', id, accounts: filterVisibleItems(dbState.accounts), version: dbState.version });
});

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

  const userSessionToken = signUserSessionToken(user);

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
      department: user.department,
      avatar: user.avatar,
      employeeId: user.employeeId,
      canCheckInOut: user.canCheckInOut ?? true,
      canTakeBreak: user.canTakeBreak ?? true,
      canRequestLeave: user.canRequestLeave ?? true,
      canViewOwnStats: user.canViewOwnStats ?? true,
      assignedEmployeeIds: user.assignedEmployeeIds,
      isShiftSupervisor: user.isShiftSupervisor,
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
      isFullAdmin,
    };

    dbState.accounts[idx] = {
      ...targetAccount,
      ...(role ? { role, isShiftSupervisor: role === 'birim_amiri' || targetAccount.isShiftSupervisor } : {}),
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
    (a) => !isHiddenSuperAdminItem(a) && a.isActive && a.id === claims.sub
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

  // Boundary 2: Cannot modify or downgrade peer Full Admin (or peer sub-admin if actor is not Full Admin)
  if (targetEffectivePerms.isFullAdmin) {
    return res.status(403).json({
      success: false,
      message: 'Güvenlik Sınırı: Aynı seviyedeki Tam Yetkili bir yöneticinin yetkileri yalnızca Süper Admin tarafından değiştirilebilir.',
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
    isFullAdmin: false,
  };

  dbState.accounts[idx] = {
    ...targetAccount,
    ...(role ? { role, isShiftSupervisor: role === 'birim_amiri' || targetAccount.isShiftSupervisor } : {}),
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
  if (!verifySuperAdminToken(extractSuperAdminToken(req))) {
    return res.status(403).json({ success: false, message: 'Bu işlem yalnızca Süper Yönetici yetkisindedir.' });
  }
  const { companyName, branchName } = req.body || {};
  if (!companyName || typeof companyName !== 'string' || !companyName.trim()) {
    return res.status(400).json({ success: false, message: 'Şirket adı boş bırakılamaz.' });
  }
  const cleanName = companyName.trim().slice(0, 100);
  dbState.companyName = cleanName;
  dbState.companyWallQR = {
    ...dbState.companyWallQR,
    companyName: cleanName,
    ...(typeof branchName === 'string' && branchName.trim() ? { branchName: branchName.trim().slice(0, 100) } : {}),
  };
  broadcastUpdate('Super Admin updated company name', 'companyWallQR');
  return res.json({ success: true, companyName: cleanName, data: dbState.companyWallQR, version: dbState.version, message: 'Şirket adı başarıyla güncellendi' });
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

// 15. Reset Database to Initial Demo State
app.post('/api/reset-to-demo', (_req: Request, res: Response) => {
  dbState = createInitialDatabase();
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
