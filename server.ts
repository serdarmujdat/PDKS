import express from 'express';
import type { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import {
  createInitialDatabase,
  getTodayString,
  PDKS_SYSTEM_API_KEY,
} from './src/db/defaultData.ts';
import type { PDKSDatabase } from './src/db/defaultData.ts';
import type {
  ActionType,
  AttendanceRecord,
  Employee,
  Shift,
  LeaveRequest,
  OvertimeRequest,
  PDKSNotification,
  UserAccount,
  SupervisorAssignment,
} from './src/types/pdks';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const isDev = process.env.NODE_ENV !== 'production';
const PORT = Number(process.env.PORT) || 3000;

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
        if (
          parsed.companyWallQR &&
          parsed.companyWallQR.token === 'AQ.Ab8RN6IQLh43aJSyjpBqkesYfVh2cWmuCciG5Mrp8b4eagNrHQ'
        ) {
          const isGeo = parsed.companyWallQR.enableGeofence !== false;
          const lat = parsed.companyWallQR.latitude || 41.0082;
          const lon = parsed.companyWallQR.longitude || 28.9784;
          const rad = parsed.companyWallQR.radiusMeters || 250;
          parsed.companyWallQR.token = PDKS_SYSTEM_API_KEY;
          parsed.companyWallQR.qrPayload = `ASEM:WALL:${PDKS_SYSTEM_API_KEY}:GEO:${isGeo ? 1 : 0}:${lat}:${lon}:${rad}`;
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
    data: dbState,
  });
});

app.post('/api/db/sync', (req: Request, res: Response) => {
  try {
    const { updates, collection, data } = req.body || {};

    if (collection && data !== undefined) {
      if (collection === 'companyLogo' && typeof data === 'string' && data.trim().startsWith('blob:')) {
        return res.status(400).json({ success: false, message: 'Geçici blob: logo adresi kaydedilemez.' });
      }
      (dbState as any)[collection] = data;
      broadcastUpdate(`Updated collection ${collection}`, collection);
      return res.json({ success: true, version: dbState.version, lastUpdated: dbState.lastUpdated, data: dbState });
    }

    if (updates && typeof updates === 'object') {
      const allowedKeys = [
        'employees', 'records', 'shifts', 'leaves', 'overtime',
        'notifications', 'companyWallQR', 'companyLogo', 'kioskLockPassword',
        'supervisorAssignments', 'accounts', 'settings',
      ];
      for (const key of allowedKeys) {
        if (updates[key] !== undefined) {
          if (key === 'companyLogo' && typeof updates[key] === 'string' && updates[key].trim().startsWith('blob:')) {
            continue;
          }
          (dbState as any)[key] = updates[key];
        }
      }
      broadcastUpdate('Batch update', 'all');
      return res.json({ success: true, version: dbState.version, lastUpdated: dbState.lastUpdated, data: dbState });
    }

    return res.status(400).json({ success: false, message: 'Geçersiz sync gövdesi.' });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err?.message || 'Sync hatası' });
  }
});

// 3. Attendance Scan Endpoint (Kiosk & Mobile QR Scans)
app.post('/api/scan', (req: Request, res: Response) => {
  const { employeeId, forcedAction, terminal = 'Terminal', method = 'kiosk_camera' } = req.body;

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

  const now = new Date();
  const timeStr = now.toTimeString().split(' ')[0];
  const dateStr = getTodayString();

  emp.currentPresence = newPresence as any;
  emp.lastActionTime = timeStr;

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
    status: 'on_time',
    lateMinutes: 0,
    terminal,
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
    timestamp: now.toISOString(),
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
    timestamp: now.toISOString(),
  });
});

// 4. Employees CRUD
app.get('/api/employees', (_req: Request, res: Response) => {
  res.json({ success: true, employees: dbState.employees });
});

app.post('/api/employees', (req: Request, res: Response) => {
  const emp: Employee = req.body;
  if (!emp || !emp.id || !emp.fullName) {
    return res.status(400).json({ success: false, message: 'Personel ID ve adı zorunludur.' });
  }

  const idx = dbState.employees.findIndex((e) => e.id === emp.id);
  if (idx >= 0) {
    dbState.employees[idx] = { ...dbState.employees[idx], ...emp };
  } else {
    dbState.employees.unshift(emp);
  }

  broadcastUpdate(`Saved employee ${emp.fullName}`, 'employees');
  return res.json({ success: true, employee: emp, employees: dbState.employees, version: dbState.version });
});

app.delete('/api/employees/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  dbState.employees = dbState.employees.filter((e) => e.id !== id);
  broadcastUpdate(`Deleted employee ${id}`, 'employees');
  return res.json({ success: true, message: 'Personel silindi.', id, employees: dbState.employees, version: dbState.version });
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
  res.json({ success: true, records: dbState.records });
});

app.post('/api/records', (req: Request, res: Response) => {
  const record: AttendanceRecord = req.body;
  if (!record || !record.id) {
    return res.status(400).json({ success: false, message: 'Geçersiz kayıt.' });
  }
  const idx = dbState.records.findIndex((r) => r.id === record.id);
  if (idx >= 0) {
    dbState.records[idx] = record;
  } else {
    dbState.records.unshift(record);
  }
  broadcastUpdate('Record saved', 'records');
  return res.json({ success: true, record, records: dbState.records });
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
  res.json({ success: true, notifications: dbState.notifications });
});

app.post('/api/notifications', (req: Request, res: Response) => {
  const notif: PDKSNotification = req.body;
  if (!notif) return res.status(400).json({ success: false });
  const id = notif.id || `NOTIF-${Date.now().toString().slice(-6)}`;
  dbState.notifications.unshift({ ...notif, id });
  broadcastUpdate('New notification', 'notifications');
  return res.json({ success: true, notification: notif, notifications: dbState.notifications });
});

app.post('/api/notifications/mark-all-read', (_req: Request, res: Response) => {
  dbState.notifications.forEach((n) => (n.read = true));
  broadcastUpdate('Marked all notifications as read', 'notifications');
  return res.json({ success: true, notifications: dbState.notifications });
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
    dbState.companyWallQR = {
      ...dbState.companyWallQR,
      ...body,
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

app.post('/api/company/wall-qr/rotate', (_req: Request, res: Response) => {
  const suffix = Math.random().toString(36).substring(2, 8).toUpperCase();
  const token = `ASEM:WALL:HQ-ISTANBUL:2026-${suffix}`;
  const isGeo = dbState.companyWallQR.enableGeofence !== false;
  const lat = dbState.companyWallQR.latitude || 41.0082;
  const lon = dbState.companyWallQR.longitude || 28.9784;
  const rad = dbState.companyWallQR.radiusMeters || 250;

  dbState.companyWallQR.token = token;
  dbState.companyWallQR.qrPayload = `ASEM:WALL:${token}:GEO:${isGeo ? 1 : 0}:${lat}:${lon}:${rad}`;
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
  res.json({ success: true, accounts: dbState.accounts });
});

app.post('/api/accounts', (req: Request, res: Response) => {
  const acc: UserAccount = req.body;
  if (!acc || !acc.username || !acc.password) {
    return res.status(400).json({ success: false, message: 'Kullanıcı adı ve şifre zorunludur.' });
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
  return res.json({ success: true, account: item, accounts: dbState.accounts, version: dbState.version });
});

app.delete('/api/accounts/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  dbState.accounts = dbState.accounts.filter((a) => a.id !== id);
  broadcastUpdate(`User account deleted ${id}`, 'accounts');
  return res.json({ success: true, message: 'Kullanıcı hesabı silindi.', id, accounts: dbState.accounts, version: dbState.version });
});

app.post('/api/auth/login', (req: Request, res: Response) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Kullanıcı adı ve şifre zorunludur.' });
  }

  const cleanUser = (username || '').toLowerCase().trim().replace(/^@+/, '');
  const cleanPass = (password || '').trim();

  const user = dbState.accounts.find(
    (u) =>
      (u.username.toLowerCase().replace(/^@+/, '') === cleanUser ||
       (u.employeeId && u.employeeId.toLowerCase() === cleanUser)) &&
      u.password.trim() === cleanPass
  );

  if (!user) {
    return res.status(401).json({ success: false, message: 'Hatalı kullanıcı adı veya şifre.' });
  }

  return res.json({
    success: true,
    message: 'Giriş başarılı.',
    token: `asem_jwt_${user.id}_${Date.now()}`,
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
    },
  });
});

// 15. Reset Database to Initial Demo State
app.post('/api/reset-to-demo', (_req: Request, res: Response) => {
  dbState = createInitialDatabase();
  saveDatabase(dbState);
  broadcastUpdate('Database reset to demo state', 'all');
  return res.json({ success: true, message: 'Veritabanı sıfırlandı.', data: dbState });
});

// 16. Health check
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'Asem PDKS Unified API Server',
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
