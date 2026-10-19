export type Department =
  | 'Yazılım & Ar-Ge'
  | 'İnsan Kaynakları'
  | 'Muhasebe & Finans'
  | 'Pazarlama & Satış'
  | 'Üretim & Operasyon'
  | 'Lojistik & Depo';

export type PresenceStatus = 'inside' | 'outside' | 'break';

export interface Shift {
  id: string;
  name: string;
  startTime: string; // "08:30"
  endTime: string;   // "17:30"
  toleranceMinutes: number; // e.g. 15
  breakMinutes: number;     // e.g. 60
  workDays: string[];
}

export interface Employee {
  id: string; // e.g. "EMP-1001"
  tcNo: string;
  fullName: string;
  email: string;
  phone: string;
  department: Department;
  title: string;
  avatar: string;
  shiftId: string;
  startDate: string;
  qrToken: string; // "PDKS:EMP-1001:SEC74A"
  status: 'active' | 'leave' | 'inactive';
  currentPresence: PresenceStatus;
  lastActionTime?: string;
  // Profile Photo Approval Workflow:
  pendingAvatar?: string | null;
  pendingAvatarDate?: string | null;
  avatarStatus?: 'approved' | 'pending' | 'rejected';
}

export type ActionType = 'check_in' | 'check_out' | 'break_start' | 'break_end';

export type AttendanceStatus = 'on_time' | 'late' | 'early_leave' | 'normal' | 'overtime';

export type UserRole = 'ik_yoneticisi' | 'birim_amiri' | 'yonetici' | 'personel' | 'guvenlik';

export interface SupervisorAssignment {
  id: string; // e.g. "SUP-1001"
  supervisorId: string; // Employee ID or User Account ID (e.g. "EMP-1005")
  supervisorName: string;
  department: Department | string;
  assignedEmployeeIds: string[]; // List of Employee IDs this supervisor is authorized to schedule
  createdAt: string;
  updatedAt?: string;
  assignedBy?: string; // e.g. "Merve Özer (İK Yöneticisi)"
  notes?: string;
}

export interface UserAccount {
  id: string;
  username: string;
  password: string;
  employeeId: string;
  name: string;
  role: UserRole;
  title: string;
  department?: Department;
  avatar: string;
  pendingAvatar?: string | null;
  avatarStatus?: 'approved' | 'pending' | 'rejected';
  createdAt: string;
  lastLogin?: string;
  isActive: boolean;
  // Specific restricted permission flags
  canCheckInOut: boolean;    // Giriş - Çıkış yapabilme izni
  canTakeBreak: boolean;      // Mola başlatıp bitirebilme izni
  canRequestLeave: boolean;   // İzin talebi gönderebilme izni
  canViewOwnStats: boolean;   // Kendi çalışma ve mesai özetini görebilme izni
  // Supervisor / Birim Amiri Vardiya Yetkilendirme
  assignedEmployeeIds?: string[]; // Sorumlu olduğu personellerin sicil no listesi
  isShiftSupervisor?: boolean;     // Vardiya ayarlama yetkisi verildi mi
}

export interface CurrentUser {
  id: string;
  username: string;
  name: string;
  role: UserRole;
  title: string;
  department?: Department;
  avatar: string;
  employeeId?: string;
  pendingAvatar?: string | null;
  avatarStatus?: 'approved' | 'pending' | 'rejected';
  canCheckInOut?: boolean;
  canTakeBreak?: boolean;
  canRequestLeave?: boolean;
  canViewOwnStats?: boolean;
  // Supervisor / Birim Amiri Vardiya Yetkilendirme
  assignedEmployeeIds?: string[];
  isShiftSupervisor?: boolean;
}

export interface LoginResult {
  success: boolean;
  message: string;
  user?: CurrentUser;
}

export interface PDKSNotification {
  id: string;
  type: 'critical_late' | 'early_leave' | 'overtime_alert' | 'absence_alert' | 'check_in' | 'check_out' | 'shift_reminder' | 'leave_status' | 'system_alert' | 'excel_import' | string;
  title: string;
  message: string;
  employeeId: string;
  employeeName: string;
  department: Department;
  timestamp: string;
  severity: 'info' | 'warning' | 'critical';
  read: boolean;
}

export interface NotificationSettings {
  notifyOnLate: boolean;
  lateThresholdMinutes: number;
  notifyOnEarlyLeave: boolean;
  notifyOnOvertime: boolean;
  overtimeThresholdMinutes: number;
  notifyAllCheckInOut: boolean;
  soundEnabled: boolean;
}

export interface ReportFilter {
  startDate: string;
  endDate: string;
  department: string;
  employeeId: string;
}

export interface EmployeeReportSummary {
  employeeId: string;
  fullName: string;
  department: Department;
  title: string;
  totalDays: number;
  presentDays: number;
  lateCount: number;
  totalLateMinutes: number;
  absenceCount: number;
  leaveDays: number;
  totalWorkHours: number;
  overtimeHours: number;
  attendanceRate: number;
}

export interface DailyArrivalPoint {
  date: string;
  dayName: string;
  expectedTime: string;
  actualTime: string;
  diffMinutes: number; // negative means early, positive means late
  status: 'early' | 'on_time' | 'late';
}

export interface EmployeePerformanceMetric {
  employeeId: string;
  fullName: string;
  department: Department;
  title: string;
  avatar: string;
  shiftComplianceScore: number; // 0-100%
  arrivalStabilityScore: number; // 0-100%
  onTimeStreakDays: number; // current consecutive on-time arrivals
  avgArrivalVarianceMinutes: number; // average minutes relative to shift start
  breakDisciplineScore: number; // 0-100%
  workHoursEfficiency: number; // 0-100+%
  rank: number;
  badges: string[];
  recentArrivals: DailyArrivalPoint[];
}

export interface AttendanceRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  department: Department;
  date: string; // "YYYY-MM-DD"
  type: ActionType;
  timestamp: string; // ISO
  timeStr: string;   // "08:32:15"
  method: 'kiosk_camera' | 'mobile_scanner' | 'manual_admin';
  status: AttendanceStatus;
  lateMinutes: number;
  note?: string;
  terminal?: string;
  userLocation?: { latitude: number; longitude: number };
  distanceMeters?: number;
  geofenceVerified?: boolean;
}

export interface LeaveRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  department: Department;
  leaveType: 'Yıllık İzin' | 'Mazeret İzni' | 'Hastalık / Rapor' | 'Uzaktan Çalışma (Home Office)';
  startDate: string;
  endDate: string;
  days: number;
  reason: string;
  status: 'approved' | 'pending' | 'rejected';
  appliedAt: string;
}

export interface OvertimeRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  department: Department;
  date: string;
  startTime: string;
  endTime: string;
  hours: number;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  appliedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
}

export interface KioskScanResult {
  success: boolean;
  message: string;
  employee?: Employee;
  record?: AttendanceRecord;
  scanType?: ActionType;
  timestamp?: string;
}

export type MobileScanMode = 'normal' | 'break';

export interface CompanyWallQRConfig {
  token: string;
  companyName: string;
  branchName: string;
  installationLocation: string;
  qrPayload: string;
  createdAt: string;
  lastRotatedAt?: string;
  enableGeofence: boolean;
  latitude: number;
  longitude: number;
  radiusMeters: number;
}

export interface MobileScanResult {
  success: boolean;
  message: string;
  action: ActionType;
  previousPresence: PresenceStatus;
  newPresence: PresenceStatus;
  record?: AttendanceRecord;
  employee?: Employee;
  timestamp: string;
  serverTime: string;
  geofencePassed?: boolean;
  distanceMeters?: number;
  userLocation?: { latitude: number; longitude: number };
}

