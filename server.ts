import express from 'express';
import type { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

const PDKS_API_KEY = process.env.PDKS_API_KEY || 'AQ.Ab8RN6IQLh43aJSyjpBqkesYfVh2cWmuCciG5Mrp8b4eagNrHQ';

// In-memory demo data store for backend API
const DB = {
  companyWallQR: {
    token: 'AQ.Ab8RN6IQLh43aJSyjpBqkesYfVh2cWmuCciG5Mrp8b4eagNrHQ',
    companyName: 'Asem Personel Devam Kontrol Sistemleri',
    branchName: 'Merkez Kampüs / Fabrika Ana Giriş',
    installationLocation: 'Giriş Turnikesi & Personel Bekleme Alanı Duvarı',
    qrPayload: 'AQ.Ab8RN6IQLh43aJSyjpBqkesYfVh2cWmuCciG5Mrp8b4eagNrHQ',
    enableGeofence: false,
    latitude: 41.0082,
    longitude: 28.9784,
    radiusMeters: 250,
  },
  users: [
    {
      id: 'ACC-1001',
      username: 'merve.ozer',
      password: 'Maxipluas5',
      employeeId: 'EMP-1002',
      name: 'Merve Özer',
      role: 'ik_yoneticisi',
      title: 'İnsan Kaynakları & Bordro Müdürü',
      department: 'İnsan Kaynakları',
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
    },
  ],
  employees: [
    {
      id: 'EMP-1001',
      fullName: 'Ahmet Faruk Yılmaz',
      department: 'Yazılım & Ar-Ge',
      currentPresence: 'inside',
    },
    {
      id: 'EMP-1002',
      fullName: 'Merve Özer',
      department: 'İnsan Kaynakları',
      currentPresence: 'inside',
    },
  ],
  shifts: [
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
  ],
  attendanceLogs: [] as any[],
};

// 1. POST /api/auth/login - Authentication endpoint
app.post('/api/auth/login', (req: Request, res: Response) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Kullanıcı adı ve şifre zorunludur.' });
  }

  const cleanUser = (username || '').toLowerCase().trim().replace(/^@+/, '');
  const cleanPass = (password || '').trim();

  const user = DB.users.find(
    (u) =>
      (u.username.toLowerCase().replace(/^@+/, '') === cleanUser ||
       u.employeeId.toLowerCase() === cleanUser) &&
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
      employeeId: user.employeeId,
      permissions: {
        canCheckInOut: true,
        canTakeBreak: true,
        canRequestLeave: true,
        canViewOwnStats: true,
      },
    },
  });
});

// 2. GET /api/company/wall-qr - Fixed Wall QR Data
app.get('/api/company/wall-qr', (_req: Request, res: Response) => {
  res.json({ success: true, data: DB.companyWallQR });
});

// 3. POST /api/company/wall-qr/rotate - Generate new secure token
app.post('/api/company/wall-qr/rotate', (_req: Request, res: Response) => {
  const suffix = Math.random().toString(36).substring(2, 8).toUpperCase();
  DB.companyWallQR.token = `ASEM:WALL:HQ-ISTANBUL:2026-${suffix}`;
  DB.companyWallQR.qrPayload = DB.companyWallQR.token;
  res.json({ success: true, data: DB.companyWallQR, message: 'Yeni duvar QR tokenı üretildi.' });
});

// 4. POST /api/scan-qr - State Machine execution on QR scan
app.post('/api/scan-qr', (req: Request, res: Response) => {
  const { employeeId, scannedToken, scanMode = 'normal', userLocation } = req.body;

  if (!employeeId || !scannedToken) {
    return res.status(400).json({ success: false, message: 'employeeId ve scannedToken gereklidir.' });
  }

  const emp = DB.employees.find((e) => e.id === employeeId);
  if (!emp) {
    return res.status(404).json({ success: false, message: 'Personel kaydı bulunamadı.' });
  }

  // Token verification
  if (
    !scannedToken.includes(DB.companyWallQR.token) &&
    !scannedToken.includes(PDKS_API_KEY) &&
    !scannedToken.startsWith('ASEM:WALL:')
  ) {
    return res.status(400).json({ success: false, message: 'Geçersiz Şirket QR Kodu.' });
  }

  const previousPresence = emp.currentPresence;
  let action = 'check_in';
  let newPresence = 'inside';
  let message = '';

  // STATE MACHINE RULES:
  if (previousPresence === 'outside') {
    action = 'check_in';
    newPresence = 'inside';
    message = 'Vardiya Girişi Yapıldı. Hoş geldiniz!';
  } else if (previousPresence === 'break') {
    action = 'break_end';
    newPresence = 'inside';
    message = 'Moladan Döndü. Mesainiz devam ediyor.';
  } else {
    // inside
    if (scanMode === 'break') {
      action = 'break_start';
      newPresence = 'break';
      message = 'Mola Başlangıcı Kaydedildi.';
    } else {
      action = 'check_out';
      newPresence = 'outside';
      message = 'Vardiya Çıkışı Yapıldı.';
    }
  }

  emp.currentPresence = newPresence;
  const now = new Date();
  const timeStr = now.toTimeString().split(' ')[0];
  const record = {
    id: `REC-${Date.now().toString().slice(-6)}`,
    employeeId: emp.id,
    employeeName: emp.fullName,
    action,
    timestamp: now.toISOString(),
    timeStr,
    terminal: 'Mobil Cihaz (Sabit Duvar QR)',
  };
  DB.attendanceLogs.unshift(record);

  return res.json({
    success: true,
    action,
    previousPresence,
    newPresence,
    message,
    serverTime: timeStr,
    serverTimestamp: now.toISOString(),
    record,
  });
});

// 5. GET /api/admin/logs - Attendance audit logs
app.get('/api/admin/logs', (_req: Request, res: Response) => {
  res.json({ success: true, count: DB.attendanceLogs.length, logs: DB.attendanceLogs });
});

// 6. GET /api/employees/status-live - Live staff presence table
app.get('/api/employees/status-live', (_req: Request, res: Response) => {
  res.json({ success: true, employees: DB.employees });
});

// 7. GET /api/shifts - List defined work shifts
app.get('/api/shifts', (_req: Request, res: Response) => {
  res.json({ success: true, shifts: DB.shifts });
});

// 8. POST /api/shifts - Create or update shift (Only ik_yoneticisi)
app.post('/api/shifts', (req: Request, res: Response) => {
  const userRole = (req.headers['x-user-role'] as string) || req.body.role;
  if (userRole !== 'ik_yoneticisi') {
    return res.status(403).json({
      success: false,
      message: 'Yetkisiz İşlem: Vardiya tanımlama ve güncelleme yetkisi yalnızca İK Yöneticisine aittir.',
    });
  }

  const { name, startTime, endTime, toleranceMinutes, breakMinutes, workDays } = req.body;
  if (!name || !startTime || !endTime) {
    return res.status(400).json({ success: false, message: 'Vardiya adı, başlangıç ve bitiş saatleri zorunludur.' });
  }

  const shift = {
    id: req.body.id || `SHIFT-${Date.now().toString().slice(-4)}`,
    name,
    startTime,
    endTime,
    toleranceMinutes: Number(toleranceMinutes) || 15,
    breakMinutes: Number(breakMinutes) || 60,
    workDays: workDays || ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma'],
  };

  const idx = DB.shifts.findIndex((s) => s.id === shift.id);
  if (idx >= 0) {
    DB.shifts[idx] = shift;
  } else {
    DB.shifts.push(shift);
  }

  return res.json({ success: true, message: 'Vardiya başarıyla kaydedildi.', shift });
});

// 9. DELETE /api/shifts/:id - Delete shift (Only ik_yoneticisi)
app.delete('/api/shifts/:id', (req: Request, res: Response) => {
  const userRole = (req.headers['x-user-role'] as string) || (req.query.role as string);
  if (userRole !== 'ik_yoneticisi') {
    return res.status(403).json({
      success: false,
      message: 'Yetkisiz İşlem: Vardiya silme yetkisi yalnızca İK Yöneticisine aittir.',
    });
  }

  const { id } = req.params;
  const initialLen = DB.shifts.length;
  DB.shifts = DB.shifts.filter((s) => s.id !== id);

  if (DB.shifts.length === initialLen) {
    return res.status(404).json({ success: false, message: 'Silinecek vardiya bulunamadı.' });
  }

  return res.json({ success: true, message: 'Vardiya başarıyla silindi.', id });
});

// 10. POST /api/employees/:id/photo-request - Personnel submits new photo for approval
app.post('/api/employees/:id/photo-request', (req: Request, res: Response) => {
  const { id } = req.params;
  const { photoData } = req.body;
  if (!photoData) {
    return res.status(400).json({ success: false, message: 'Fotoğraf verisi gereklidir.' });
  }
  const emp = DB.employees.find((e) => e.id === id);
  if (!emp) {
    return res.status(404).json({ success: false, message: 'Personel bulunamadı.' });
  }
  (emp as any).pendingAvatar = photoData;
  (emp as any).avatarStatus = 'pending';
  (emp as any).pendingAvatarDate = new Date().toISOString();
  return res.json({
    success: true,
    message: 'Yeni profil fotoğrafınız yüklendi. İK yöneticisi onayı bekleniyor.',
    employee: emp,
  });
});

// 11. POST /api/employees/:id/photo-approve - İK yöneticisi approves pending photo
app.post('/api/employees/:id/photo-approve', (req: Request, res: Response) => {
  const userRole = (req.headers['x-user-role'] as string) || req.body.role;
  if (userRole !== 'ik_yoneticisi') {
    return res.status(403).json({
      success: false,
      message: 'Yetkisiz İşlem: Fotoğraf onaylama yetkisi yalnızca İK Yöneticisine aittir.',
    });
  }
  const { id } = req.params;
  const emp = DB.employees.find((e) => e.id === id);
  if (!emp) {
    return res.status(404).json({ success: false, message: 'Personel bulunamadı.' });
  }
  if ((emp as any).pendingAvatar) {
    (emp as any).avatar = (emp as any).pendingAvatar;
    (emp as any).pendingAvatar = null;
    (emp as any).avatarStatus = 'approved';
  }
  return res.json({
    success: true,
    message: `${emp.fullName} profil fotoğrafı onaylandı ve aktifleştirildi.`,
    employee: emp,
  });
});

// 12. PUT /api/employees/:id/photo-direct - İK yöneticisi directly updates photo
app.put('/api/employees/:id/photo-direct', (req: Request, res: Response) => {
  const userRole = (req.headers['x-user-role'] as string) || req.body.role;
  if (userRole !== 'ik_yoneticisi') {
    return res.status(403).json({
      success: false,
      message: 'Yetkisiz İşlem: Doğrudan fotoğraf değiştirme yetkisi yalnızca İK Yöneticisine aittir.',
    });
  }
  const { id } = req.params;
  const { photoData } = req.body;
  const emp = DB.employees.find((e) => e.id === id);
  if (!emp) {
    return res.status(404).json({ success: false, message: 'Personel bulunamadı.' });
  }
  (emp as any).avatar = photoData;
  (emp as any).pendingAvatar = null;
  (emp as any).avatarStatus = 'approved';
  return res.json({
    success: true,
    message: `${emp.fullName} fotoğrafı doğrudan güncellendi.`,
    employee: emp,
  });
});

// Health check
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'Asem PDKS API', timestamp: new Date().toISOString() });
});

// Static frontend assets and SPA fallback
const distPath = path.join(__dirname, 'dist');
app.use(express.static(distPath));

app.get('*', (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

// Start Express server
const portNumber = Number(PORT) || 3000;
app.listen(portNumber, '0.0.0.0', () => {
  console.log(`Server listening on http://0.0.0.0:${portNumber}`);
});

export default app;
