import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Clock,
  Calendar,
  Check,
  X,
  Plus,
  AlertCircle,
  CalendarCheck,
  ShieldAlert,
  CheckCircle2,
  Trash2,
  Shield,
  Lock,
  Download,
  FileSpreadsheet,
  FileText,
  Printer,
  Bell,
  BellRing,
  Send,
  ChevronDown,
  Sparkles,
  Users,
  AlertTriangle,
  Info,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Search,
  Filter,
  Timer,
  UserCheck,
  FileCheck2,
  UserPlus,
  Edit3,
  CheckSquare,
  Square,
  ShieldCheck,
} from 'lucide-react';
import { Shift, LeaveRequest, Employee, CurrentUser, OvertimeRequest, SupervisorAssignment, Department } from '../types/pdks';
import { pdksStorage } from '../services/storage';

interface ShiftAndLeaveManagementProps {
  currentUser?: CurrentUser;
}

interface UpcomingShiftItem {
  employee: Employee;
  shift: Shift;
  timeStatus: 'critical_soon' | 'starting_soon' | 'started' | 'upcoming_today' | 'off_day';
  minutesUntilStart: number;
  formattedRemaining: string;
  isWorkDay: boolean;
}

export interface ShiftConflictInfo {
  hasConflict: boolean;
  conflictingShift?: Shift;
  overlapMinutes: number;
  overlapHoursStr: string;
  sharedDays: string[];
  message: string;
}

/**
 * Çakışma Kontrolü (Shift Conflict Detection):
 * İki farklı vardiyanın çalışma günleri ve zaman aralıklarının çakışıp çakışmadığını denetler.
 */
export function detectShiftTimeConflict(
  shiftA: { startTime: string; endTime: string; workDays?: string[]; name?: string; id?: string },
  shiftB: { startTime: string; endTime: string; workDays?: string[]; name?: string; id?: string }
): ShiftConflictInfo {
  if (shiftA.id && shiftB.id && shiftA.id === shiftB.id) {
    return { hasConflict: false, overlapMinutes: 0, overlapHoursStr: '0', sharedDays: [], message: '' };
  }

  const daysA = shiftA.workDays && shiftA.workDays.length > 0 ? shiftA.workDays : ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma'];
  const daysB = shiftB.workDays && shiftB.workDays.length > 0 ? shiftB.workDays : ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma'];
  const sharedDays = daysA.filter((d) => daysB.includes(d));

  if (sharedDays.length === 0) {
    return { hasConflict: false, overlapMinutes: 0, overlapHoursStr: '0', sharedDays: [], message: '' };
  }

  const toMinutes = (timeStr: string) => {
    const [h, m] = (timeStr || '00:00').split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  };

  const startA = toMinutes(shiftA.startTime);
  const endA = toMinutes(shiftA.endTime);
  const startB = toMinutes(shiftB.startTime);
  const endB = toMinutes(shiftB.endTime);

  // Normalize overnight shifts
  const intervalsA = endA > startA
    ? [{ start: startA, end: endA }]
    : [{ start: startA, end: 1440 }, { start: 0, end: endA }];

  const intervalsB = endB > startB
    ? [{ start: startB, end: endB }]
    : [{ start: startB, end: 1440 }, { start: 0, end: endB }];

  let overlapMins = 0;
  for (const ia of intervalsA) {
    for (const ib of intervalsB) {
      const oStart = Math.max(ia.start, ib.start);
      const oEnd = Math.min(ia.end, ib.end);
      if (oEnd > oStart) {
        overlapMins += (oEnd - oStart);
      }
    }
  }

  if (overlapMins > 0) {
    const hours = (overlapMins / 60).toFixed(1).replace('.0', '');
    const shiftAName = shiftA.name || 'Vardiya 1';
    const shiftBName = shiftB.name || 'Vardiya 2';
    return {
      hasConflict: true,
      conflictingShift: shiftB as Shift,
      overlapMinutes: overlapMins,
      overlapHoursStr: hours,
      sharedDays,
      message: `"${shiftAName}" (${shiftA.startTime} - ${shiftA.endTime}) ile "${shiftBName}" (${shiftB.startTime} - ${shiftB.endTime}) aynı zaman dilimine denk gelmektedir! (${sharedDays.join(', ')} günlerinde ${hours} saat çakışma).`,
    };
  }

  return { hasConflict: false, overlapMinutes: 0, overlapHoursStr: '0', sharedDays: [], message: '' };
}

export const ShiftAndLeaveManagement: React.FC<ShiftAndLeaveManagementProps> = ({ currentUser }) => {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [overtimes, setOvertimes] = useState<OvertimeRequest[]>([]);
  const [overtimeFilter, setOvertimeFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [permissionNotice, setPermissionNotice] = useState<string | null>(null);
  const [notificationToast, setNotificationToast] = useState<string | null>(null);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [sentNotificationIds, setSentNotificationIds] = useState<Record<string, boolean>>({});

  // View Switcher Tab: 'calendar' (Haftalık Takvim) | 'shifts' (Vardiyalar) | 'supervisors' (Birim Amirleri) | 'leaves' (İzinler) | 'overtime' (Fazla Mesailer) | 'all' (Tümü)
  const [activeViewTab, setActiveViewTab] = useState<'calendar' | 'shifts' | 'supervisors' | 'leaves' | 'overtime' | 'all'>('calendar');

  // Interactive Weekly Calendar States
  const [currentWeekOffset, setCurrentWeekOffset] = useState<number>(0);
  const [calendarDeptFilter, setCalendarDeptFilter] = useState<string>('all');
  const [calendarSearch, setCalendarSearch] = useState<string>('');
  const [selectedCellDetail, setSelectedCellDetail] = useState<{
    employee: Employee;
    dateStr: string;
    dayName: string;
    shift: Shift;
    isWorkDay: boolean;
    leave?: LeaveRequest;
  } | null>(null);
  const [reassignShiftId, setReassignShiftId] = useState<string>('');

  // Dedicated Assign Shift with Conflict Check Modal State
  const [isAssignShiftModalOpen, setIsAssignShiftModalOpen] = useState(false);
  const [assignForm, setAssignForm] = useState<{
    employeeId: string;
    shiftId: string;
  }>({
    employeeId: '',
    shiftId: '',
  });

  const activeUser = currentUser || pdksStorage.getActiveUser();
  const isHRManager = activeUser.role === 'ik_yoneticisi';
  const isSupervisor = pdksStorage.isUserSupervisor(activeUser);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  // Supervisor Management States
  const [supervisorAssignments, setSupervisorAssignments] = useState<SupervisorAssignment[]>(() =>
    pdksStorage.getSupervisorAssignments()
  );
  const [isSupervisorModalOpen, setIsSupervisorModalOpen] = useState(false);
  const [editingSupervisorId, setEditingSupervisorId] = useState<string | null>(null);
  const [supervisorFormEmpId, setSupervisorFormEmpId] = useState<string>('');
  const [supervisorFormAssignedIds, setSupervisorFormAssignedIds] = useState<string[]>([]);
  const [supervisorFormNotes, setSupervisorFormNotes] = useState<string>('');
  const [supervisorModalSearch, setSupervisorModalSearch] = useState<string>('');
  const [supervisorModalDeptFilter, setSupervisorModalDeptFilter] = useState<string>('all');

  // Calendar Birim Amiri Filter Controls
  const [onlyMyResponsible, setOnlyMyResponsible] = useState<boolean>(isSupervisor && !isHRManager);
  const [supervisorFilter, setSupervisorFilter] = useState<string>('all');

  // Responsible Employees for currently active user
  const responsibleEmpIds = useMemo(() => {
    return pdksStorage.getResponsibleEmployeeIdsForUser(activeUser);
  }, [activeUser, supervisorAssignments]);

  // Dynamic 7 days of the active week (Monday to Sunday)
  const weekDays = useMemo(() => {
    const now = new Date();
    const currentDay = now.getDay(); // 0 is Sunday, 1 is Monday...
    const diffToMonday = (currentDay === 0 ? -6 : 1) - currentDay;
    const monday = new Date(now);
    monday.setDate(now.getDate() + diffToMonday + currentWeekOffset * 7);

    const dayNames = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const dateStr = d.toISOString().split('T')[0];
      const isToday = dateStr === new Date().toISOString().split('T')[0];
      days.push({
        date: d,
        dateStr,
        dayName: dayNames[i],
        formattedDate: d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }),
        isToday,
      });
    }
    return days;
  }, [currentWeekOffset]);

  const weekLabel = useMemo(() => {
    if (weekDays.length === 0) return '';
    const first = weekDays[0];
    const last = weekDays[6];
    return `${first.formattedDate} - ${last.formattedDate} ${last.date.getFullYear()}`;
  }, [weekDays]);

  const calendarEmployees = useMemo(() => {
    return employees.filter((emp) => {
      // If Birim Amiri and "onlyMyResponsible" is active, restrict to their responsible personnel
      if (isSupervisor && !isHRManager && onlyMyResponsible) {
        if (!responsibleEmpIds.includes(emp.id)) return false;
      }

      // If HR selected a specific Birim Amiri filter
      if (supervisorFilter !== 'all') {
        const supAss = supervisorAssignments.find(
          (s) => s.id === supervisorFilter || s.supervisorId === supervisorFilter
        );
        if (supAss && !supAss.assignedEmployeeIds.includes(emp.id)) {
          return false;
        }
      }

      const matchesDept = calendarDeptFilter === 'all' || emp.department === calendarDeptFilter;
      const matchesSearch =
        calendarSearch.trim() === '' ||
        emp.fullName.toLowerCase().includes(calendarSearch.toLowerCase()) ||
        emp.id.toLowerCase().includes(calendarSearch.toLowerCase()) ||
        emp.title.toLowerCase().includes(calendarSearch.toLowerCase());
      return matchesDept && matchesSearch;
    });
  }, [employees, calendarDeptFilter, calendarSearch, onlyMyResponsible, supervisorFilter, isSupervisor, isHRManager, responsibleEmpIds, supervisorAssignments]);

  // Shift Modal
  const [isShiftModalOpen, setIsShiftModalOpen] = useState(false);
  const [shiftForm, setShiftForm] = useState<Partial<Shift>>({
    name: '',
    startTime: '08:30',
    endTime: '17:30',
    toleranceMinutes: 15,
    breakMinutes: 60,
    workDays: ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma'],
  });

  // Leave Modal
  const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false);
  const [leaveForm, setLeaveForm] = useState({
    employeeId: '',
    leaveType: 'Yıllık İzin' as LeaveRequest['leaveType'],
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
    days: 1,
    reason: '',
  });

  const loadData = () => {
    setShifts(pdksStorage.getShifts());
    setLeaves(pdksStorage.getLeaveRequests());
    setEmployees(pdksStorage.getEmployees());
    setOvertimes(pdksStorage.getOvertimeRequests());
    setSupervisorAssignments(pdksStorage.getSupervisorAssignments());
  };

  useEffect(() => {
    loadData();

    const handleLiveEvent = () => {
      loadData();
    };
    window.addEventListener('pdks-notification', handleLiveEvent);
    return () => window.removeEventListener('pdks-notification', handleLiveEvent);
  }, []);

  // Close export dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setIsExportMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Calculate upcoming shifts for today in real-time
  const upcomingShifts: UpcomingShiftItem[] = useMemo(() => {
    const daysOfWeek = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
    const now = new Date();
    const todayDayName = daysOfWeek[now.getDay()];
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    return employees.map((emp) => {
      const shift = shifts.find((s) => s.id === emp.shiftId) || shifts[0];
      if (!shift) return null;

      const isWorkDay = shift.workDays.includes(todayDayName);
      if (!isWorkDay) {
        return {
          employee: emp,
          shift,
          timeStatus: 'off_day',
          minutesUntilStart: 9999,
          formattedRemaining: 'Bugün İzinli / Çalışma Günü Değil',
          isWorkDay: false,
        };
      }

      const [sh, sm] = (shift.startTime || '08:30').split(':').map(Number);
      const shiftStartMinutes = sh * 60 + sm;
      const diff = shiftStartMinutes - currentMinutes;

      if (diff > 0 && diff <= 45) {
        return {
          employee: emp,
          shift,
          timeStatus: 'critical_soon',
          minutesUntilStart: diff,
          formattedRemaining: `${diff} dakika kaldı`,
          isWorkDay: true,
        };
      } else if (diff > 45 && diff <= 120) {
        return {
          employee: emp,
          shift,
          timeStatus: 'starting_soon',
          minutesUntilStart: diff,
          formattedRemaining: `${diff} dakika kaldı`,
          isWorkDay: true,
        };
      } else if (diff <= 0 && diff >= -180) {
        return {
          employee: emp,
          shift,
          timeStatus: 'started',
          minutesUntilStart: diff,
          formattedRemaining: `${Math.abs(diff)} dk önce başladı`,
          isWorkDay: true,
        };
      } else if (diff > 120) {
        const hrs = Math.floor(diff / 60);
        const mins = diff % 60;
        return {
          employee: emp,
          shift,
          timeStatus: 'upcoming_today',
          minutesUntilStart: diff,
          formattedRemaining: `${hrs} sa ${mins} dk sonra`,
          isWorkDay: true,
        };
      } else {
        return {
          employee: emp,
          shift,
          timeStatus: 'upcoming_today',
          minutesUntilStart: diff,
          formattedRemaining: 'Vardiya saatleri tamamlandı',
          isWorkDay: true,
        };
      }
    }).filter(Boolean) as UpcomingShiftItem[];
  }, [employees, shifts]);

  const criticalShiftsCount = upcomingShifts.filter(
    (u) => u.timeStatus === 'critical_soon' || u.timeStatus === 'starting_soon'
  ).length;

  // Single employee mobile/in-app notification trigger
  const handleSendShiftNotification = (item: UpcomingShiftItem) => {
    const notif = pdksStorage.addNotification({
      title: `⏰ Vardiya Hatırlatması (${item.shift.name})`,
      message: `Sayın ${item.employee.fullName}, "${item.shift.name}" mesainiz saat ${item.shift.startTime}'te başlayacaktır (${item.formattedRemaining}). Lütfen turnike veya duvar QR koduyla işyeri girişinizi tamamlayınız.`,
      type: 'shift_reminder',
      severity: item.timeStatus === 'critical_soon' ? 'critical' : 'warning',
      employeeId: item.employee.id,
      employeeName: item.employee.fullName,
      department: item.employee.department,
    });

    setSentNotificationIds((prev) => ({ ...prev, [item.employee.id]: true }));
    setNotificationToast(`Mobil vardiya bildirimi "${item.employee.fullName}" personeline başarıyla iletildi.`);
    setTimeout(() => setNotificationToast(null), 3500);
  };

  // Broadcast notification to all upcoming shift employees
  const handleBroadcastUpcomingNotifications = () => {
    const targets = upcomingShifts.filter(
      (u) => u.timeStatus === 'critical_soon' || u.timeStatus === 'starting_soon' || u.timeStatus === 'started'
    );

    const targetList = targets.length > 0 ? targets : upcomingShifts.filter((u) => u.isWorkDay);

    targetList.forEach((item) => {
      pdksStorage.addNotification({
        title: `⚠️ Vardiya Hatırlatması: ${item.shift.name}`,
        message: `Sayın ${item.employee.fullName}, "${item.shift.name}" vardiyanız (${item.shift.startTime} - ${item.shift.endTime}) için sistem içi hatırlatmadır. İşyerine ulaştığınızda QR okutarak girişinizi yapınız.`,
        type: 'shift_reminder',
        severity: 'warning',
        employeeId: item.employee.id,
        employeeName: item.employee.fullName,
        department: item.employee.department,
      });
      setSentNotificationIds((prev) => ({ ...prev, [item.employee.id]: true }));
    });

    setNotificationToast(
      `Vardiyası yaklaşan ${targetList.length} personelin tümüne mobil bildirim ve sistem içi uyarı iletildi!`
    );
    setTimeout(() => setNotificationToast(null), 4500);
  };

  // Export 1: CSV for Shifts
  const handleExportShiftsCSV = () => {
    const headers = ['Vardiya Kodu', 'Vardiya Adı', 'Başlangıç Saati', 'Bitiş Saati', 'Tolerans (Dk)', 'Mola Süresi (Dk)', 'Çalışma Günleri'];
    const rows = shifts.map((s) => [
      `"${s.id}"`,
      `"${s.name.replace(/"/g, '""')}"`,
      `"${s.startTime}"`,
      `"${s.endTime}"`,
      s.toleranceMinutes,
      s.breakMinutes,
      `"${s.workDays.join(', ')}"`,
    ]);
    const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Asem_Vardiyalar_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setIsExportMenuOpen(false);
    setNotificationToast('Vardiya listesi CSV formatında bilgisayarınıza indirildi.');
    setTimeout(() => setNotificationToast(null), 3000);
  };

  // Export 2: CSV for Leaves
  const handleExportLeavesCSV = () => {
    const headers = ['Talep No', 'Personel ID', 'Personel Adı Soyadı', 'Departman', 'İzin Türü', 'Başlangıç Tarihi', 'Bitiş Tarihi', 'Gün', 'Gerekçe', 'Durum', 'Başvuru Tarihi'];
    const rows = leaves.map((lr) => [
      `"${lr.id}"`,
      `"${lr.employeeId}"`,
      `"${(lr.employeeName || '').replace(/"/g, '""')}"`,
      `"${(lr.department || '').replace(/"/g, '""')}"`,
      `"${lr.leaveType}"`,
      `"${lr.startDate}"`,
      `"${lr.endDate}"`,
      lr.days,
      `"${(lr.reason || '').replace(/"/g, '""')}"`,
      `"${lr.status === 'approved' ? 'Onaylandı' : lr.status === 'rejected' ? 'Reddedildi' : 'Bekliyor'}"`,
      `"${lr.appliedAt.split('T')[0]}"`,
    ]);
    const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Asem_Izin_Talepleri_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setIsExportMenuOpen(false);
    setNotificationToast('İzin ve mazeret listesi CSV formatında indirildi.');
    setTimeout(() => setNotificationToast(null), 3000);
  };

  // Export 3: Combined Shift & Staff Roster CSV
  const handleExportCombinedCSV = () => {
    const headers = ['Personel ID', 'Ad Soyad', 'Departman', 'Unvan', 'Atanmış Vardiya', 'Mesai Saatleri', 'Çalışma Günleri', 'Mevcut Durum'];
    const rows = employees.map((emp) => {
      const shift = shifts.find((s) => s.id === emp.shiftId);
      return [
        `"${emp.id}"`,
        `"${emp.fullName.replace(/"/g, '""')}"`,
        `"${emp.department}"`,
        `"${emp.title}"`,
        `"${(shift ? shift.name : 'Standart Mesai').replace(/"/g, '""')}"`,
        `"${shift ? `${shift.startTime} - ${shift.endTime}` : '-'}"`,
        `"${shift ? shift.workDays.join(', ') : '-'}"`,
        `"${emp.currentPresence === 'inside' ? 'İşyerinde' : emp.currentPresence === 'break' ? 'Molada' : 'Dışarıda'}"`,
      ];
    });
    const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Asem_Personel_Vardiya_Cizelgesi_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setIsExportMenuOpen(false);
    setNotificationToast('Personel vardiya çizelgesi CSV olarak indirildi.');
    setTimeout(() => setNotificationToast(null), 3000);
  };

  // Export 4: PDF Print view
  const handlePrintPDF = () => {
    setIsExportMenuOpen(false);
    setIsPrintModalOpen(true);
  };

  const executeBrowserPrint = () => {
    window.print();
  };

  // Delete Shift (Only ik_yoneticisi)
  const handleDeleteShift = (id: string, name: string) => {
    if (!isHRManager) {
      setPermissionNotice('Yetkisiz İşlem: Vardiya silme yetkisi yalnızca İK Yöneticisine aittir.');
      setTimeout(() => setPermissionNotice(null), 4000);
      return;
    }

    if (window.confirm(`"${name}" (${id}) vardiyasını silmek istediğinize emin misiniz?`)) {
      pdksStorage.deleteShift(id);
      loadData();
    }
  };

  // Conflict Detection Memos
  const createShiftConflict = useMemo(() => {
    if (!shiftForm.startTime || !shiftForm.endTime) return null;
    for (const existingShift of shifts) {
      const conflict = detectShiftTimeConflict(
        {
          name: shiftForm.name || 'Yeni Vardiya',
          startTime: shiftForm.startTime,
          endTime: shiftForm.endTime,
          workDays: shiftForm.workDays,
        },
        existingShift
      );
      if (conflict.hasConflict) return conflict;
    }
    return null;
  }, [shiftForm.startTime, shiftForm.endTime, shiftForm.workDays, shiftForm.name, shifts]);

  const calendarCellConflict = useMemo(() => {
    if (!selectedCellDetail || !reassignShiftId) return null;
    const targetShift = shifts.find((s) => s.id === reassignShiftId);
    if (!targetShift) return null;
    const currentShift = selectedCellDetail.shift;
    if (currentShift && currentShift.id !== targetShift.id) {
      const conflict = detectShiftTimeConflict(targetShift, currentShift);
      if (conflict.hasConflict) return conflict;
    }
    return null;
  }, [selectedCellDetail, reassignShiftId, shifts]);

  const assignShiftConflict = useMemo(() => {
    if (!assignForm.employeeId || !assignForm.shiftId) return null;
    const emp = employees.find((e) => e.id === assignForm.employeeId);
    const targetShift = shifts.find((s) => s.id === assignForm.shiftId);
    if (!emp || !targetShift) return null;
    const currentEmpShift = shifts.find((s) => s.id === emp.shiftId) || shifts[0];
    if (currentEmpShift && currentEmpShift.id !== targetShift.id) {
      const conflict = detectShiftTimeConflict(targetShift, currentEmpShift);
      if (conflict.hasConflict) return conflict;
    }
    return null;
  }, [assignForm.employeeId, assignForm.shiftId, employees, shifts]);

  // Overtime Approval Handlers
  const handleApproveOvertime = (id: string) => {
    if (!isHRManager) {
      setPermissionNotice('Yetkisiz İşlem: Fazla mesai onaylama yetkisi yalnızca İK Yöneticisine aittir.');
      setTimeout(() => setPermissionNotice(null), 4000);
      return;
    }
    const updated = pdksStorage.updateOvertimeStatus(id, 'approved', activeUser.name);
    if (updated) {
      loadData();
      setNotificationToast(`✅ ${updated.employeeName} için ${updated.hours} saatlik fazla mesai talebi onaylandı ve Bildirim Merkezi'ne iletildi.`);
      setTimeout(() => setNotificationToast(null), 3500);
    }
  };

  const handleRejectOvertime = (id: string) => {
    if (!isHRManager) {
      setPermissionNotice('Yetkisiz İşlem: Fazla mesai reddetme yetkisi yalnızca İK Yöneticisine aittir.');
      setTimeout(() => setPermissionNotice(null), 4000);
      return;
    }
    const updated = pdksStorage.updateOvertimeStatus(id, 'rejected', activeUser.name);
    if (updated) {
      loadData();
      setNotificationToast(`❌ ${updated.employeeName} için fazla mesai talebi reddedildi.`);
      setTimeout(() => setNotificationToast(null), 3500);
    }
  };

  // Dedicated Shift Assignment Submit with Conflict Warning Check (IK & Birim Amiri)
  const handleAssignShiftSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignForm.employeeId || !assignForm.shiftId) return;

    const canManageEmp = pdksStorage.canUserManageShiftForEmployee(activeUser, assignForm.employeeId);
    if (!canManageEmp) {
      setPermissionNotice(
        isSupervisor
          ? 'Yetkisiz İşlem: Bu personel yetki alanınızda değildir. Yalnızca İK tarafından sorumlu kılındığınız personellerin vardiyalarını planlayabilirsiniz.'
          : 'Yetkisiz İşlem: Vardiya atama yetkisi yalnızca İK Yöneticisine ve görevlendirilen Birim Amirlerine aittir.'
      );
      setTimeout(() => setPermissionNotice(null), 4000);
      return;
    }

    if (assignShiftConflict?.hasConflict) {
      const proceed = window.confirm(
        `⚠️ Çakışma Kontrolü Uyarısı:\n\n${assignShiftConflict.message}\n\nVardiya atamasını yine de gerçekleştirmek istediğinize emin misiniz?`
      );
      if (!proceed) return;
    }

    const emp = employees.find((e) => e.id === assignForm.employeeId);
    if (!emp) return;

    const targetShift = shifts.find((s) => s.id === assignForm.shiftId);
    const updatedEmp: Employee = {
      ...emp,
      shiftId: assignForm.shiftId,
    };
    pdksStorage.saveEmployee(updatedEmp);
    loadData();
    setIsAssignShiftModalOpen(false);

    const actorLabel = isHRManager ? 'İK Yöneticisi' : 'Birim Amiri';
    setNotificationToast(`${emp.fullName} personeline "${targetShift?.name}" vardiyası başarıyla atandı.`);
    setTimeout(() => setNotificationToast(null), 3500);

    pdksStorage.addNotification({
      type: 'shift_reminder',
      title: 'Yeni Çalışma Vardiyası Atandı',
      message: `Sayın ${emp.fullName}, çalışma vardiyanız ${activeUser.name} (${actorLabel}) tarafından "${targetShift?.name}" (${targetShift?.startTime} - ${targetShift?.endTime}) olarak belirlenmiştir.`,
      employeeId: emp.id,
      employeeName: emp.fullName,
      department: emp.department,
      severity: 'info',
    });
  };

  // Supervisor Management Action Handlers
  const handleOpenNewSupervisorModal = () => {
    setEditingSupervisorId(null);
    const candidate = employees.find((e) => !supervisorAssignments.some((sa) => sa.supervisorId === e.id));
    const targetEmpId = candidate?.id || employees[0]?.id || '';
    setSupervisorFormEmpId(targetEmpId);
    if (candidate) {
      const deptEmps = employees.filter((e) => e.department === candidate.department).map((e) => e.id);
      setSupervisorFormAssignedIds(deptEmps);
    } else {
      setSupervisorFormAssignedIds([]);
    }
    setSupervisorFormNotes('');
    setSupervisorModalSearch('');
    setSupervisorModalDeptFilter('all');
    setIsSupervisorModalOpen(true);
  };

  const handleEditSupervisor = (assignment: SupervisorAssignment) => {
    setEditingSupervisorId(assignment.id);
    setSupervisorFormEmpId(assignment.supervisorId);
    setSupervisorFormAssignedIds([...assignment.assignedEmployeeIds]);
    setSupervisorFormNotes(assignment.notes || '');
    setSupervisorModalSearch('');
    setSupervisorModalDeptFilter('all');
    setIsSupervisorModalOpen(true);
  };

  const handleDeleteSupervisor = (assignment: SupervisorAssignment) => {
    if (window.confirm(`${assignment.supervisorName} kullanıcısının Birim Amiri yetkilendirmesi kaldırılsın mı?`)) {
      pdksStorage.deleteSupervisorAssignment(assignment.id);
      loadData();
      setNotificationToast(`${assignment.supervisorName} için birim amirliği yetkisi kaldırıldı.`);
      setTimeout(() => setNotificationToast(null), 3000);
    }
  };

  const handleSaveSupervisorAssignment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isHRManager) return;
    const supEmp = employees.find((e) => e.id === supervisorFormEmpId);
    if (!supEmp) return;

    if (supervisorFormAssignedIds.length === 0) {
      alert('Lütfen bu Birim Amirinin sorumlu olacağı en az 1 personel seçiniz.');
      return;
    }

    const assignment: SupervisorAssignment = {
      id: editingSupervisorId || `SUP-${Date.now().toString().slice(-4)}`,
      supervisorId: supEmp.id,
      supervisorName: supEmp.fullName,
      department: supEmp.department,
      assignedEmployeeIds: supervisorFormAssignedIds,
      createdAt: new Date().toISOString(),
      assignedBy: `${activeUser.name} (İK Yöneticisi)`,
      notes: supervisorFormNotes || `${supEmp.department} vardiya planlaması ve takibi`,
    };

    pdksStorage.saveSupervisorAssignment(assignment);
    loadData();
    setIsSupervisorModalOpen(false);
    setNotificationToast(
      `✅ ${supEmp.fullName} Birim Amiri olarak yetkilendirildi (${supervisorFormAssignedIds.length} personelden sorumlu).`
    );
    setTimeout(() => setNotificationToast(null), 4000);

    pdksStorage.addNotification({
      type: 'system_alert',
      title: 'Birim Amiri Vardiya Yetkilendirmesi',
      message: `Sayın ${supEmp.fullName}, İK Yöneticisi tarafından ${supervisorFormAssignedIds.length} personelin vardiyalarını planlama yetkisine sahip Birim Amiri olarak atandınız.`,
      employeeId: supEmp.id,
      employeeName: supEmp.fullName,
      department: supEmp.department,
      severity: 'info',
    });
  };

  // Save Shift (Only ik_yoneticisi)
  const handleSaveShift = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isHRManager) {
      setPermissionNotice('Yetkisiz İşlem: Yeni vardiya ekleme yetkisi yalnızca İK Yöneticisine aittir.');
      setTimeout(() => setPermissionNotice(null), 4000);
      return;
    }
    if (!shiftForm.name) return;

    // Çakışma Kontrolü (Conflict Check)
    if (createShiftConflict?.hasConflict) {
      const proceed = window.confirm(
        `⚠️ Çakışma Kontrolü Uyarısı:\n\n${createShiftConflict.message}\n\nBu vardiya planını yine de kaydetmek istediğinize emin misiniz?`
      );
      if (!proceed) return;
    }

    const newShift: Shift = {
      id: `SHIFT-${Date.now().toString().slice(-4)}`,
      name: shiftForm.name,
      startTime: shiftForm.startTime || '08:30',
      endTime: shiftForm.endTime || '17:30',
      toleranceMinutes: Number(shiftForm.toleranceMinutes) || 15,
      breakMinutes: Number(shiftForm.breakMinutes) || 60,
      workDays: shiftForm.workDays || ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma'],
    };

    pdksStorage.saveShift(newShift);
    setIsShiftModalOpen(false);
    loadData();
    setNotificationToast('Yeni vardiya planı başarıyla kaydedildi.');
    setTimeout(() => setNotificationToast(null), 3000);
  };

  // Save Leave Request
  const handleSaveLeave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!leaveForm.employeeId) return;

    const emp = employees.find((x) => x.id === leaveForm.employeeId);
    if (!emp) return;

    const newReq: LeaveRequest = {
      id: `LR-${Date.now().toString().slice(-4)}`,
      employeeId: emp.id,
      employeeName: emp.fullName,
      department: emp.department,
      leaveType: leaveForm.leaveType,
      startDate: leaveForm.startDate,
      endDate: leaveForm.endDate,
      days: Number(leaveForm.days) || 1,
      reason: leaveForm.reason || 'Kişisel izin talebi',
      status: 'pending',
      appliedAt: new Date().toISOString(),
    };

    pdksStorage.saveLeaveRequest(newReq);
    setIsLeaveModalOpen(false);
    loadData();
    setNotificationToast('İzin talebi sisteme iletildi.');
    setTimeout(() => setNotificationToast(null), 3000);
  };

  const handleUpdateStatus = (id: string, status: 'approved' | 'rejected') => {
    pdksStorage.updateLeaveStatus(id, status);
    loadData();
    setNotificationToast(
      status === 'approved' ? 'İzin talebi onaylandı.' : 'İzin talebi reddedildi.'
    );
    setTimeout(() => setNotificationToast(null), 3000);
  };

  // Reassign Shift for Employee from Interactive Calendar (IK & Yetkili Birim Amiri)
  const handleApplyShiftReassignment = () => {
    if (!selectedCellDetail || !reassignShiftId) return;

    const canManageEmp = pdksStorage.canUserManageShiftForEmployee(
      activeUser,
      selectedCellDetail.employee.id
    );
    if (!canManageEmp) {
      setPermissionNotice(
        isSupervisor
          ? `Yetkisiz İşlem: ${selectedCellDetail.employee.fullName} yetki alanınızda değildir. Yalnızca İK'nın size atadığı personellerin vardiyasını düzenleyebilirsiniz.`
          : 'Yetkisiz İşlem: Vardiya değiştirme yetkisi yalnızca İK Yöneticisine ve görevlendirilen Birim Amirlerine aittir.'
      );
      setTimeout(() => setPermissionNotice(null), 4000);
      return;
    }

    // Çakışma Kontrolü Uyarısı
    if (calendarCellConflict?.hasConflict) {
      const proceed = window.confirm(
        `⚠️ Çakışma Kontrolü Uyarısı:\n\n${calendarCellConflict.message}\n\nYine de bu vardiyayı personele atamak istediğinize emin misiniz?`
      );
      if (!proceed) return;
    }

    const updatedEmp: Employee = {
      ...selectedCellDetail.employee,
      shiftId: reassignShiftId,
    };
    pdksStorage.saveEmployee(updatedEmp);
    loadData();
    const newShift = shifts.find((s) => s.id === reassignShiftId);
    setNotificationToast(
      `${selectedCellDetail.employee.fullName} için vardiya "${newShift?.name || reassignShiftId}" olarak güncellendi.`
    );
    setTimeout(() => setNotificationToast(null), 3500);

    const actorLabel = isHRManager ? 'İK Yöneticisi' : 'Birim Amiri';
    // Notify employee about shift change
    pdksStorage.addNotification({
      type: 'shift_reminder',
      title: 'Vardiya Planınız Güncellendi',
      message: `${selectedCellDetail.employee.fullName}, çalışma vardiyanız ${activeUser.name} (${actorLabel}) tarafından "${newShift?.name || reassignShiftId}" olarak güncellendi.`,
      employeeId: selectedCellDetail.employee.id,
      employeeName: selectedCellDetail.employee.fullName,
      department: selectedCellDetail.employee.department,
      severity: 'info',
    });

    setSelectedCellDetail(null);
  };

  // Send Shift Reminder directly from cell click
  const handleSendCellReminder = () => {
    if (!selectedCellDetail) return;
    pdksStorage.addNotification({
      type: 'shift_reminder',
      title: `Vardiya Hatırlatması (${selectedCellDetail.dayName})`,
      message: `Sayın ${selectedCellDetail.employee.fullName}, ${selectedCellDetail.dateStr} (${selectedCellDetail.dayName}) tarihindeki ${selectedCellDetail.shift.name} (${selectedCellDetail.shift.startTime} - ${selectedCellDetail.shift.endTime}) mesainiz için QR kartınızı okutmayı unutmayınız.`,
      employeeId: selectedCellDetail.employee.id,
      employeeName: selectedCellDetail.employee.fullName,
      department: selectedCellDetail.employee.department,
      severity: 'info',
    });

    setSentNotificationIds((prev) => ({ ...prev, [selectedCellDetail.employee.id]: true }));
    setNotificationToast(`${selectedCellDetail.employee.fullName} personeline mobil vardiya hatırlatması iletildi.`);
    setTimeout(() => setNotificationToast(null), 3500);
  };

  // Handle cell click in Weekly Calendar
  const handleCellClick = (
    emp: Employee,
    day: { date: Date; dateStr: string; dayName: string; formattedDate: string; isToday: boolean },
    shift: Shift,
    isWorkDay: boolean,
    leave?: LeaveRequest
  ) => {
    setSelectedCellDetail({
      employee: emp,
      dateStr: day.dateStr,
      dayName: day.dayName,
      shift,
      isWorkDay,
      leave,
    });
    setReassignShiftId(emp.shiftId || shift.id);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Page Title & HR Export Toolbar */}
      <div className="pb-4 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Vardiya ve İzin Yönetimi
            </h1>
            {isHRManager ? (
              <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200">
                İK Yönetici Paneli: Tam Yetki & Birim Amiri Atama Aktif
              </span>
            ) : isSupervisor ? (
              <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-300 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-amber-600" />
                Birim Amiri Paneli: Sorumlu Olduğunuz {responsibleEmpIds.length} Personelin Vardiyalarını Düzenleme Yetkisi Aktif
              </span>
            ) : (
              <span className="text-[10px] font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200 flex items-center gap-1">
                <Lock className="w-3 h-3 text-slate-400" />
                Vardiya Düzenleme Kısıtlı (Yalnızca İK ve Yetkili Birim Amirleri)
              </span>
            )}
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Mesai saatleri, gecikme toleransları, birim amiri yetki atamaları ve personel vardiya planlaması.
          </p>
        </div>

        {/* HR Manager Export Toolbar (User Request: PDF & CSV Download) */}
        <div className="flex items-center gap-2.5 self-start md:self-auto flex-wrap">
          <div className="relative" ref={exportMenuRef}>
            <button
              onClick={() => setIsExportMenuOpen(!isExportMenuOpen)}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-bold text-slate-800 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl shadow-xs transition-colors cursor-pointer"
              title="Mevcut listeleri PDF veya CSV formatında bilgisayarınıza indirin"
            >
              <Download className="w-4 h-4 text-indigo-600" />
              <span>Dışa Aktar (PDF / CSV)</span>
              <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isExportMenuOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* Dropdown Menu */}
            {isExportMenuOpen && (
              <div className="absolute right-0 mt-2 w-72 bg-white rounded-2xl shadow-xl border border-slate-200 py-2 z-30 animate-fade-in text-xs">
                <div className="px-3 py-1.5 border-b border-slate-100 font-bold text-slate-500 text-[11px] uppercase tracking-wider">
                  Rapor Dışa Aktarımı (İK)
                </div>

                <button
                  onClick={handlePrintPDF}
                  className="w-full text-left px-3.5 py-2.5 hover:bg-slate-50 flex items-center gap-2.5 text-slate-800 transition-colors cursor-pointer"
                >
                  <FileText className="w-4 h-4 text-rose-600 shrink-0" />
                  <div>
                    <div className="font-bold text-xs">Raporu Yazdır / PDF İndir</div>
                    <div className="text-[11px] text-slate-400">Şirket antetli tam liste (PDF kaydet)</div>
                  </div>
                </button>

                <button
                  onClick={handleExportShiftsCSV}
                  className="w-full text-left px-3.5 py-2.5 hover:bg-slate-50 flex items-center gap-2.5 text-slate-800 transition-colors cursor-pointer"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
                  <div>
                    <div className="font-bold text-xs">Vardiyalar Listesi (CSV)</div>
                    <div className="text-[11px] text-slate-400">Excel uyumlu mesai tanımları</div>
                  </div>
                </button>

                <button
                  onClick={handleExportLeavesCSV}
                  className="w-full text-left px-3.5 py-2.5 hover:bg-slate-50 flex items-center gap-2.5 text-slate-800 transition-colors cursor-pointer"
                >
                  <FileSpreadsheet className="w-4 h-4 text-indigo-600 shrink-0" />
                  <div>
                    <div className="font-bold text-xs">İzin & Mazeret Talepleri (CSV)</div>
                    <div className="text-[11px] text-slate-400">Onaylı/bekleyen izin kayıtları</div>
                  </div>
                </button>

                <button
                  onClick={handleExportCombinedCSV}
                  className="w-full text-left px-3.5 py-2.5 hover:bg-slate-50 flex items-center gap-2.5 text-slate-800 transition-colors cursor-pointer border-t border-slate-100"
                >
                  <Users className="w-4 h-4 text-purple-600 shrink-0" />
                  <div>
                    <div className="font-bold text-xs">Personel Vardiya Çizelgesi (CSV)</div>
                    <div className="text-[11px] text-slate-400">Tüm personelin atandığı vardiyalar</div>
                  </div>
                </button>
              </div>
            )}
          </div>

          {isHRManager && (
            <button
              onClick={handleOpenNewSupervisorModal}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-xl shadow-xs transition-colors cursor-pointer"
              title="Birim Amirleri Atayın ve Sorumlu Oldukları Personelleri Belirleyin (İK Yetkisi)"
            >
              <Users className="w-4 h-4 text-indigo-600" />
              <span>Birim Amiri Yetkilendirme</span>
              <span className="bg-indigo-200 text-indigo-900 text-[10px] px-1.5 py-0.2 rounded-full font-bold">
                {supervisorAssignments.length} Amir
              </span>
            </button>
          )}

          <button
            onClick={handleBroadcastUpcomingNotifications}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-bold text-amber-900 bg-amber-100 hover:bg-amber-200 border border-amber-300 rounded-xl shadow-xs transition-colors cursor-pointer"
            title="Vardiyası yaklaşan personele toplu mobil bildirim gönder"
          >
            <BellRing className="w-4 h-4 text-amber-700" />
            <span>Toplu Mobil Bildirim Gönder</span>
          </button>
        </div>
      </div>

      {/* Birim Amiri Sorumluluk & Yetki Bilgi Panosu */}
      {isSupervisor && !isHRManager && (
        <div className="bg-gradient-to-r from-amber-50 via-orange-50/40 to-slate-50 border border-amber-300/80 rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-xs">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-bold text-sm sm:text-base text-amber-950">
                  Birim Amiri Vardiya Yönetim Paneli
                </h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-200 text-amber-900 border border-amber-300">
                  Yetkili Birim Amiri: @{activeUser.username}
                </span>
              </div>
              <p className="text-xs text-amber-900/90 mt-1 leading-relaxed">
                Hoş geldiniz <strong>{activeUser.name}</strong>. İK Yönetimi tarafından sorumlu kılındığınız <strong>{responsibleEmpIds.length} personelin</strong> haftalık vardiya planlamasını aşağıdaki çizelgeden veya "Vardiya Ata" butonuyla gerçekleştirebilirsiniz.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
            <button
              onClick={() => {
                setAssignForm({
                  employeeId: responsibleEmpIds[0] || employees[0]?.id || '',
                  shiftId: shifts[0]?.id || '',
                });
                setIsAssignShiftModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-xl shadow-xs transition-colors cursor-pointer whitespace-nowrap"
            >
              <UserCheck className="w-4 h-4" />
              <span>Personelime Vardiya Ata</span>
            </button>
          </div>
        </div>
      )}

      {/* Floating Notification Toast */}
      {notificationToast && (
        <div className="bg-emerald-600 text-white px-4 py-3 rounded-xl text-xs font-bold flex items-center justify-between shadow-lg animate-fade-in">
          <div className="flex items-center gap-2">
            <CheckCheck className="w-4 h-4 shrink-0" />
            <span>{notificationToast}</span>
          </div>
          <button onClick={() => setNotificationToast(null)} className="text-white hover:text-emerald-200 font-bold px-1">
            ✕
          </button>
        </div>
      )}

      {/* Permission Notice Toast */}
      {permissionNotice && (
        <div className="bg-rose-50 border border-rose-300 text-rose-800 p-3 rounded-xl text-xs font-semibold flex items-center justify-between animate-fade-in shadow-xs">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{permissionNotice}</span>
          </div>
          <button onClick={() => setPermissionNotice(null)} className="text-rose-600 font-bold px-2">
            ✕
          </button>
        </div>
      )}

      {/* PROMINENT SYSTEM ALERT: Yaklaşan Vardiyalar ve Personel Mobil Bildirimleri Paneli */}
      <div className="bg-gradient-to-r from-amber-50 via-indigo-50/40 to-slate-50 border border-amber-200/90 rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-800 flex items-center justify-center shrink-0 border border-amber-300">
              <Bell className="w-5 h-5 text-amber-700" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900 leading-tight">
                  Yaklaşan Vardiya Uyarıları ve Personel Mobil Bildirimleri
                </h2>
                {criticalShiftsCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-extrabold bg-rose-600 text-white animate-pulse">
                    {criticalShiftsCount} Acil
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-600 mt-0.5">
                Başlamasına az kalan veya devam eden vardiyalar için sistem içi canlı uyarılar ve anlık mobil bildirim gönderimi.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleBroadcastUpcomingNotifications}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-xs transition-colors cursor-pointer whitespace-nowrap"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Tüm Yaklaşanlara Bildir</span>
            </button>
          </div>
        </div>

        {/* Live Upcoming Shifts Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
          {upcomingShifts.slice(0, 6).map((item) => {
            const isAlreadySent = sentNotificationIds[item.employee.id];

            return (
              <div
                key={item.employee.id}
                className={`p-3.5 rounded-xl border transition-all flex flex-col justify-between gap-2.5 ${
                  item.timeStatus === 'critical_soon'
                    ? 'bg-rose-50/80 border-rose-300 ring-1 ring-rose-400/40'
                    : item.timeStatus === 'starting_soon'
                    ? 'bg-amber-50/80 border-amber-300'
                    : item.timeStatus === 'started'
                    ? 'bg-emerald-50/70 border-emerald-300'
                    : 'bg-white border-slate-200'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <img
                      src={item.employee.avatar}
                      alt={item.employee.fullName}
                      className="w-9 h-9 rounded-xl object-cover border border-slate-200 shrink-0"
                    />
                    <div>
                      <div className="font-bold text-xs text-slate-900 leading-tight">
                        {item.employee.fullName}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {item.employee.department} · {item.employee.title}
                      </div>
                    </div>
                  </div>

                  {/* Status Pill */}
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${
                      item.timeStatus === 'critical_soon'
                        ? 'bg-rose-600 text-white animate-pulse'
                        : item.timeStatus === 'starting_soon'
                        ? 'bg-amber-100 text-amber-900 border border-amber-300 font-extrabold'
                        : item.timeStatus === 'started'
                        ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {item.formattedRemaining}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-200/60">
                  <div className="text-[11px] text-slate-600">
                    <span className="font-semibold text-slate-800">{item.shift.name}</span>
                    <span className="font-mono text-slate-500 ml-1">({item.shift.startTime} - {item.shift.endTime})</span>
                  </div>

                  <button
                    onClick={() => handleSendShiftNotification(item)}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                      isAlreadySent
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                        : 'bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 shadow-2xs'
                    }`}
                    title="Bu personele mobil uygulama ve tarayıcı bildirimi gönder"
                  >
                    {isAlreadySent ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-600" />
                        <span>İletildi</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-3 h-3 text-indigo-600" />
                        <span>Uyar</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* VIEW SWITCHER TABS */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-xs">
          <button
            onClick={() => setActiveViewTab('calendar')}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl font-bold transition-all cursor-pointer whitespace-nowrap ${
              activeViewTab === 'calendar'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <CalendarDays className="w-4 h-4" />
            <span>Haftalık Vardiya Takvimi</span>
            <span
              className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                activeViewTab === 'calendar' ? 'bg-indigo-500 text-white' : 'bg-slate-100 text-slate-600'
              }`}
            >
              Etkileşimli
            </span>
          </button>

          <button
            onClick={() => setActiveViewTab('shifts')}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl font-bold transition-all cursor-pointer whitespace-nowrap ${
              activeViewTab === 'shifts'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>Vardiya Tanımları ({shifts.length})</span>
          </button>

          {/* Birim Amirleri & Yetkilendirme Tabı */}
          <button
            onClick={() => setActiveViewTab('supervisors')}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl font-bold transition-all cursor-pointer whitespace-nowrap ${
              activeViewTab === 'supervisors'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Birim Amirleri & Yetkiler ({supervisorAssignments.length})</span>
            {isHRManager && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-purple-100 text-purple-700 font-bold">
                İK Yönetimi
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveViewTab('leaves')}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl font-bold transition-all cursor-pointer whitespace-nowrap ${
              activeViewTab === 'leaves'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <CalendarCheck className="w-4 h-4" />
            <span>İzin Talepleri ({leaves.length})</span>
          </button>

          <button
            onClick={() => setActiveViewTab('overtime')}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl font-bold transition-all cursor-pointer whitespace-nowrap ${
              activeViewTab === 'overtime'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Timer className="w-4 h-4" />
            <span>Fazla Mesai Talepleri ({overtimes.length})</span>
            {overtimes.filter((o) => o.status === 'pending').length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-rose-500 text-white text-[10px] font-bold">
                {overtimes.filter((o) => o.status === 'pending').length} bekleyen
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveViewTab('all')}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl font-semibold transition-all cursor-pointer whitespace-nowrap ${
              activeViewTab === 'all'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-white text-slate-500 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Tümünü Göster</span>
          </button>
        </div>

        {/* Vardiya Ata & Çakışma Denetimi Butonu (İK ve Birim Amirleri için) */}
        {(isHRManager || isSupervisor) && (
          <button
            onClick={() => {
              const allowedEmps = isHRManager
                ? employees
                : employees.filter((e) => responsibleEmpIds.includes(e.id));
              setAssignForm({
                employeeId: allowedEmps[0]?.id || '',
                shiftId: shifts[0]?.id || '',
              });
              setIsAssignShiftModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 shadow-2xs transition-colors cursor-pointer whitespace-nowrap shrink-0"
            title="Personellere vardiya atarken iki farklı vardiyanın çakışmasını otomatik denetleyin"
          >
            <UserCheck className="w-4 h-4 text-indigo-600" />
            <span>Vardiya Ata & Çakışma Denetimi</span>
          </button>
        )}
      </div>

      {/* ETKİLEŞİMLİ HAFTALIK VARDİYA TAKVİMİ GÖRÜNÜMÜ */}
      {(activeViewTab === 'calendar' || activeViewTab === 'all') && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs space-y-4">
            {/* Week Controls & Filters */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="inline-flex items-center rounded-xl border border-slate-200 bg-slate-50 p-1 shadow-2xs">
                  <button
                    onClick={() => setCurrentWeekOffset((prev) => prev - 1)}
                    className="p-1.5 hover:bg-white text-slate-700 rounded-lg transition-colors cursor-pointer"
                    title="Önceki Hafta"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setCurrentWeekOffset(0)}
                    className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                      currentWeekOffset === 0
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'text-slate-700 hover:bg-white'
                    }`}
                  >
                    Bu Hafta
                  </button>
                  <button
                    onClick={() => setCurrentWeekOffset((prev) => prev + 1)}
                    className="p-1.5 hover:bg-white text-slate-700 rounded-lg transition-colors cursor-pointer"
                    title="Sonraki Hafta"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                <div className="font-bold text-sm text-slate-900 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-indigo-600" />
                  <span>{weekLabel}</span>
                  {currentWeekOffset !== 0 && (
                    <span className="text-[10px] text-slate-400 font-normal">
                      ({currentWeekOffset > 0 ? `+${currentWeekOffset} hafta` : `${currentWeekOffset} hafta`})
                    </span>
                  )}
                </div>
              </div>

              {/* Department, Supervisor & Search Filter */}
              <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                <div className="relative flex-1 sm:w-44">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Personel ara..."
                    value={calendarSearch}
                    onChange={(e) => setCalendarSearch(e.target.value)}
                    className="w-full pl-8 pr-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-indigo-500 text-slate-800"
                  />
                </div>

                <select
                  value={calendarDeptFilter}
                  onChange={(e) => setCalendarDeptFilter(e.target.value)}
                  className="px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-700 focus:bg-white cursor-pointer"
                >
                  <option value="all">Tüm Departmanlar</option>
                  <option value="Yazılım & Ar-Ge">Yazılım & Ar-Ge</option>
                  <option value="İnsan Kaynakları">İnsan Kaynakları</option>
                  <option value="Muhasebe & Finans">Muhasebe & Finans</option>
                  <option value="Pazarlama & Satış">Pazarlama & Satış</option>
                  <option value="Üretim & Operasyon">Üretim & Operasyon</option>
                  <option value="Lojistik & Depo">Lojistik & Depo</option>
                </select>

                {/* HR Supervisor Filter */}
                {isHRManager && (
                  <>
                    <select
                      value={supervisorFilter}
                      onChange={(e) => setSupervisorFilter(e.target.value)}
                      className="px-2.5 py-1.5 text-xs bg-purple-50/70 border border-purple-200 text-purple-900 rounded-xl font-medium focus:bg-white cursor-pointer"
                      title="Birim Amirinin sorumlu olduğu personelleri filtreleyin"
                    >
                      <option value="all">Tüm Personeller (Genel)</option>
                      {supervisorAssignments.map((sa) => (
                        <option key={sa.id} value={sa.id}>
                          👑 {sa.supervisorName} ({sa.assignedEmployeeIds.length} Sorumlu Personel)
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      onClick={handleOpenNewSupervisorModal}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer shrink-0 shadow-2xs"
                      title="Yeni Birim Amiri yetkilendir ve sorumlu personellerini seç"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      <span>Birim Amiri Yetkilendir</span>
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Birim Amiri Active Planning Mode Callout */}
            {isSupervisor && !isHRManager && (
              <div className="p-3.5 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-amber-500 text-white flex items-center justify-center font-bold shrink-0 shadow-2xs">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="font-bold text-amber-950">
                      Birim Amiri Vardiya Planlama Modu: {activeUser.name}
                    </span>
                    <p className="text-[11px] text-amber-800">
                      İK tarafından sorumlu kılındığınız <strong>{responsibleEmpIds.length} personelin</strong> vardiyalarını takvim hücrelerine tıklayarak veya "Vardiya Ata" butonuyla planlayabilirsiniz.
                    </p>
                  </div>
                </div>
                <label className="inline-flex items-center gap-2 px-3 py-1.5 bg-white/90 border border-amber-300 rounded-lg text-amber-950 font-bold text-xs cursor-pointer shadow-2xs shrink-0">
                  <input
                    type="checkbox"
                    checked={onlyMyResponsible}
                    onChange={(e) => setOnlyMyResponsible(e.target.checked)}
                    className="rounded text-amber-600 focus:ring-amber-500"
                  />
                  <span>Sadece Sorumlu Olduğum Personeller ({responsibleEmpIds.length})</span>
                </label>
              </div>
            )}

            {/* Interactive Grid Table */}
            <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-2xs">
              <table className="w-full border-collapse text-left text-xs min-w-[950px]">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-700">
                    <th className="py-3 px-3.5 font-bold text-xs sticky left-0 bg-slate-50 z-10 w-60 border-r border-slate-200 shadow-2xs">
                      Personel ({calendarEmployees.length})
                    </th>
                    {weekDays.map((day) => (
                      <th
                        key={day.dateStr}
                        className={`py-2.5 px-3 text-center border-r border-slate-200 last:border-r-0 min-w-[110px] ${
                          day.isToday ? 'bg-indigo-50/70 border-b-2 border-b-indigo-600' : ''
                        }`}
                      >
                        <div className="flex items-center justify-center gap-1">
                          <span className="font-bold text-slate-900">{day.dayName.slice(0, 3)}</span>
                          {day.isToday && (
                            <span className="px-1.5 py-0.2 rounded-full text-[9px] font-extrabold bg-indigo-600 text-white">
                              BUGÜN
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono mt-0.5">{day.formattedDate}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {calendarEmployees.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-400 text-xs">
                        Arama veya filtre kriterlerinize uygun personel bulunamadı.
                      </td>
                    </tr>
                  ) : (
                    calendarEmployees.map((emp) => {
                      const empShift = shifts.find((s) => s.id === emp.shiftId) || shifts[0];
                      const isResponsible = responsibleEmpIds.includes(emp.id);

                      return (
                        <tr key={emp.id} className="hover:bg-slate-50/60 transition-colors">
                          {/* Sticky Employee Identity Column */}
                          <td className="py-3 px-3.5 sticky left-0 bg-white hover:bg-slate-50/60 z-10 border-r border-slate-200 shadow-2xs">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <img
                                src={emp.avatar}
                                alt={emp.fullName}
                                className="w-8 h-8 rounded-xl object-cover border border-slate-200 shrink-0"
                              />
                              <div className="min-w-0 flex-1">
                                <div className="font-bold text-xs text-slate-900 truncate leading-tight">
                                  {emp.fullName}
                                </div>
                                <div className="text-[10px] text-slate-500 truncate mt-0.5">
                                  {emp.title} · <span className="font-mono text-indigo-600 font-semibold">{emp.id}</span>
                                </div>

                                {/* Responsibility Badge for Birim Amiri */}
                                {isSupervisor && !isHRManager && (
                                  <div className="mt-1">
                                    {isResponsible ? (
                                      <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[9px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                        <Check className="w-2.5 h-2.5 text-emerald-600" />
                                        <span>Sorumlu Personeliniz</span>
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[9px] font-medium bg-slate-100 text-slate-500 border border-slate-200">
                                        <Lock className="w-2.5 h-2.5 text-slate-400" />
                                        <span>Yetki Dışı</span>
                                      </span>
                                    )}
                                  </div>
                                )}

                                {/* Supervisor Info for HR */}
                                {isHRManager && (() => {
                                  const supMatch = supervisorAssignments.find((sa) => sa.assignedEmployeeIds.includes(emp.id));
                                  return supMatch ? (
                                    <div className="mt-1">
                                      <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[9px] font-medium bg-purple-50 text-purple-700 border border-purple-200">
                                        <ShieldCheck className="w-2.5 h-2.5 text-purple-600" />
                                        <span>Amir: {supMatch.supervisorName}</span>
                                      </span>
                                    </div>
                                  ) : (
                                    <div className="mt-1">
                                      <span className="inline-block px-1.5 py-0.2 rounded text-[9px] text-slate-400 bg-slate-50 border border-slate-200">
                                        Birim Amiri Atanmadı
                                      </span>
                                    </div>
                                  );
                                })()}
                              </div>
                            </div>
                          </td>

                          {/* 7 Week Day Cells */}
                          {weekDays.map((day) => {
                            // Check for approved leave
                            const leave = leaves.find(
                              (l) =>
                                l.employeeId === emp.id &&
                                l.status === 'approved' &&
                                l.startDate <= day.dateStr &&
                                l.endDate >= day.dateStr
                            );

                            const isWorkDay = empShift.workDays.includes(day.dayName);

                            return (
                              <td
                                key={day.dateStr}
                                onClick={() => handleCellClick(emp, day, empShift, isWorkDay, leave)}
                                className={`py-2 px-2.5 border-r border-slate-100 last:border-r-0 cursor-pointer transition-all hover:ring-2 hover:ring-indigo-400 hover:ring-inset ${
                                  day.isToday ? 'bg-indigo-50/20' : ''
                                }`}
                                title="Vardiya detayını görüntülemek veya değiştirmek için tıklayın"
                              >
                                {leave ? (
                                  <div className="p-2 rounded-xl bg-purple-50 border border-purple-200 text-purple-900 shadow-2xs text-center space-y-0.5">
                                    <div className="text-[10px] font-bold truncate flex items-center justify-center gap-1">
                                      <CalendarCheck className="w-3 h-3 text-purple-600 shrink-0" />
                                      <span>İzinli</span>
                                    </div>
                                    <div className="text-[9px] text-purple-700 truncate font-medium">
                                      {leave.leaveType}
                                    </div>
                                  </div>
                                ) : isWorkDay ? (
                                  <div className="p-2 rounded-xl bg-emerald-50/70 hover:bg-emerald-100/70 border border-emerald-200 text-emerald-950 shadow-2xs space-y-0.5 text-center transition-colors">
                                    <div className="font-mono font-bold text-[11px] text-emerald-900 leading-tight">
                                      {empShift.startTime} - {empShift.endTime}
                                    </div>
                                    <div className="text-[9px] text-emerald-700 font-semibold truncate">
                                      {empShift.name}
                                    </div>
                                    <div className="text-[9px] text-emerald-600 font-mono">
                                      ±{empShift.toleranceMinutes} dk
                                    </div>
                                  </div>
                                ) : (
                                  <div className="p-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-400 text-center text-[10px] font-medium">
                                    Hafta Tatili
                                  </div>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })
                  )}
                </tbody>

                {/* Capacity Summary Footer */}
                <tfoot className="bg-slate-100 font-bold text-xs border-t-2 border-slate-200">
                  <tr>
                    <td className="py-2.5 px-3.5 sticky left-0 bg-slate-100 border-r border-slate-200 text-slate-700">
                      Günlük Personel Kapasitesi
                    </td>
                    {weekDays.map((day) => {
                      let workingCount = 0;
                      let leaveCount = 0;
                      calendarEmployees.forEach((emp) => {
                        const leave = leaves.find(
                          (l) =>
                            l.employeeId === emp.id &&
                            l.status === 'approved' &&
                            l.startDate <= day.dateStr &&
                            l.endDate >= day.dateStr
                        );
                        if (leave) {
                          leaveCount++;
                        } else {
                          const empShift = shifts.find((s) => s.id === emp.shiftId) || shifts[0];
                          if (empShift.workDays.includes(day.dayName)) {
                            workingCount++;
                          }
                        }
                      });

                      return (
                        <td key={day.dateStr} className="py-2.5 px-2 text-center border-r border-slate-200 last:border-r-0">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] bg-emerald-100 text-emerald-800">
                            {workingCount} Çalışıyor
                          </span>
                          {leaveCount > 0 && (
                            <div className="text-[9px] text-purple-700 mt-0.5">
                              {leaveCount} İzinli
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-500 pt-1">
              <span className="flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                Vardiya detayını görmek, personeli farklı vardiyaya atamak veya anlık uyarı göndermek için hücreye tıklayın.
              </span>
              <span className="font-mono text-[11px]">
                Toplam {calendarEmployees.length} Personel / {shifts.length} Tanımlı Vardiya
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Section 1: Vardiya ve Mesai Planları */}
      {(activeViewTab === 'shifts' || activeViewTab === 'all') && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-indigo-600" />
              <h2 className="text-lg font-bold text-slate-900">Tanımlı Çalışma Vardiyaları</h2>
            </div>
          {isHRManager ? (
            <button
              onClick={() => {
                setShiftForm({
                  name: '',
                  startTime: '08:30',
                  endTime: '17:30',
                  toleranceMinutes: 15,
                  breakMinutes: 60,
                  workDays: ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma'],
                });
                setIsShiftModalOpen(true);
              }}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-xs transition-colors cursor-pointer w-full sm:w-auto"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Yeni Vardiya Ekle (İK Yetkisi)</span>
            </button>
          ) : (
            <div
              className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-400 bg-slate-100 rounded-lg cursor-not-allowed border border-slate-200 w-full sm:w-auto"
              title="Vardiya ekleme yetkisi yalnızca İK Yöneticisine aittir"
            >
              <Lock className="w-3 h-3 text-slate-400" />
              <span>Vardiya Ekle (Yetki Gerekli)</span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {shifts.map((s) => (
            <div
              key={s.id}
              className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col justify-between group hover:border-slate-300 transition-colors"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-mono text-slate-400 font-semibold">{s.id}</span>
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] bg-indigo-50 text-indigo-700 font-medium px-2 py-0.5 rounded">
                      ±{s.toleranceMinutes} dk
                    </span>
                    {isHRManager && (
                      <button
                        onClick={() => handleDeleteShift(s.id, s.name)}
                        className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors cursor-pointer"
                        title={`"${s.name}" vardiyasını sil`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                <h3 className="font-bold text-sm text-slate-900 leading-snug">{s.name}</h3>

                <div className="mt-4 space-y-2 text-xs">
                  <div className="flex justify-between items-center text-slate-600">
                    <span>Giriş / Çıkış:</span>
                    <span className="font-mono font-semibold text-slate-900 tabular-nums">
                      {s.startTime} - {s.endTime}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-slate-600">
                    <span>Mola Süresi:</span>
                    <span className="font-mono text-slate-800 tabular-nums">{s.breakMinutes} Dakika</span>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                <div className="flex flex-wrap gap-1">
                  {s.workDays.map((d) => (
                    <span
                      key={d}
                      className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-medium"
                    >
                      {d.slice(0, 3)}
                    </span>
                  ))}
                </div>
                {isHRManager && (
                  <button
                    onClick={() => handleDeleteShift(s.id, s.name)}
                    className="text-[10px] text-rose-600 hover:text-rose-700 font-semibold opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Sil</span>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
      )}

      {/* Section: Birim Amirleri ve Sorumlu Personel Yetkilendirme (İK ve Yetkili Amirler) */}
      {(activeViewTab === 'supervisors' || activeViewTab === 'all') && (
        <div className="space-y-5 pt-4 border-t border-slate-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-indigo-600" />
                <h2 className="text-lg font-bold text-slate-900">
                  Birim Amirleri & Sorumlu Personel Yetkilendirme
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                  {supervisorAssignments.length} Birim Amiri Tanımlı
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                İK Yöneticisi tarafından atanan birim amirleri yalnızca kendilerine bağlı personellerin vardiya planlarını oluşturabilir ve güncelleyebilir.
              </p>
            </div>

            {isHRManager ? (
              <button
                type="button"
                onClick={handleOpenNewSupervisorModal}
                className="inline-flex items-center justify-center gap-2 px-3.5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl shadow-xs transition-colors cursor-pointer shrink-0"
              >
                <UserPlus className="w-4 h-4" />
                <span>Yeni Birim Amiri Yetkilendir & Personel Ata</span>
              </button>
            ) : (
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-500 text-xs rounded-xl font-medium border border-slate-200">
                <Lock className="w-3.5 h-3.5 text-slate-400" />
                <span>Yetkilendirme İK Yöneticisine Aittir</span>
              </div>
            )}
          </div>

          {/* Hierarchy Info Box */}
          <div className="bg-gradient-to-r from-indigo-50/80 via-purple-50/60 to-slate-50 p-4 rounded-2xl border border-indigo-100 text-xs text-slate-700 space-y-2">
            <div className="flex items-center gap-2 font-bold text-indigo-950">
              <Shield className="w-4 h-4 text-indigo-600 shrink-0" />
              <span>Rol & Yetkilendirme Matrisi Nasıl İşler?</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[11px] leading-relaxed">
              <div className="bg-white/90 p-3 rounded-xl border border-indigo-100/60 shadow-2xs">
                <span className="font-bold text-purple-900 block mb-1">1. İK Yöneticisi (Üst Yönetici)</span>
                Tüm şirket personellerinin vardiyalarını belirler ve hangi personellerin hangi Birim Amirine bağlı olacağını yetkilendirir.
              </div>
              <div className="bg-white/90 p-3 rounded-xl border border-amber-100/60 shadow-2xs">
                <span className="font-bold text-amber-900 block mb-1">2. Birim Amirleri (Atanan Yetkililer)</span>
                Yalnızca İK'nın kendilerine atadığı personellerin haftalık vardiyalarını oluşturabilir, değiştirebilir ve takvimden izleyebilir.
              </div>
              <div className="bg-white/90 p-3 rounded-xl border border-emerald-100/60 shadow-2xs">
                <span className="font-bold text-emerald-900 block mb-1">3. Personeller (Çalışanlar)</span>
                Yalnızca kendi vardiyalarını, giriş/çıkış saatlerini mobil kartta görüntüler; diğer personellerin vardiyasını değiştiremez.
              </div>
            </div>
          </div>

          {/* Supervisor Cards Grid */}
          {supervisorAssignments.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 mx-auto flex items-center justify-center">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-slate-800">Henüz Birim Amiri Atanmadı</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Personellerin vardiyalarını ilgili amirlerin yönetebilmesi için yukarıdaki "Yeni Birim Amiri Yetkilendir" butonunu kullanarak birim amiri atayınız.
              </p>
              {isHRManager && (
                <button
                  type="button"
                  onClick={handleOpenNewSupervisorModal}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>İlk Birim Amirini Ata</span>
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {supervisorAssignments.map((sa) => {
                const supEmp = employees.find((e) => e.id === sa.supervisorId);
                const assignedEmps = employees.filter((e) => sa.assignedEmployeeIds.includes(e.id));
                const isCurrentSupervisor = activeUser.employeeId === sa.supervisorId || activeUser.id === sa.supervisorId;

                return (
                  <div
                    key={sa.id}
                    className="bg-white border border-slate-200 hover:border-slate-300 rounded-2xl p-5 shadow-xs space-y-4 transition-all"
                  >
                    {/* Header: Supervisor Info */}
                    <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-100">
                      <div className="flex items-center gap-3">
                        <img
                          src={supEmp?.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop'}
                          alt={sa.supervisorName}
                          className="w-12 h-12 rounded-2xl object-cover border border-slate-200 shadow-2xs shrink-0"
                        />
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-bold text-sm text-slate-900 leading-tight">
                              {sa.supervisorName}
                            </h3>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                              Birim Amiri
                            </span>
                            {isCurrentSupervisor && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                Sizsiniz
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            {sa.department} · <span className="font-mono text-indigo-600 font-semibold">{sa.supervisorId}</span>
                          </div>
                        </div>
                      </div>

                      {/* HR Edit / Delete Actions */}
                      {isHRManager && (
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleEditSupervisor(sa)}
                            className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                            title="Sorumlu personelleri düzenle"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteSupervisor(sa)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                            title="Birim Amirliği yetkisini kaldır"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Responsibility Scope / Notes */}
                    <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 text-xs text-slate-700 flex items-start gap-2">
                      <Info className="w-3.5 h-3.5 text-indigo-500 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-semibold text-slate-900 text-[11px]">Yetki Kapsamı & Görev:</div>
                        <div className="text-[11px] text-slate-600">{sa.notes || 'Departman personelleri haftalık vardiya planlaması ve takibi.'}</div>
                      </div>
                    </div>

                    {/* Assigned Personnel Chips */}
                    <div>
                      <div className="flex items-center justify-between text-xs mb-2">
                        <span className="font-bold text-slate-800 flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5 text-slate-500" />
                          <span>Sorumlu Olduğu Personeller ({assignedEmps.length})</span>
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          Yetkilendiren: {sa.assignedBy}
                        </span>
                      </div>

                      <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pr-1">
                        {assignedEmps.map((emp) => {
                          const curShift = shifts.find((s) => s.id === emp.shiftId) || shifts[0];
                          return (
                            <div
                              key={emp.id}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white border border-slate-200 text-slate-800 text-[11px] shadow-2xs hover:border-indigo-300 transition-colors"
                            >
                              <img
                                src={emp.avatar}
                                alt={emp.fullName}
                                className="w-4 h-4 rounded-full object-cover shrink-0"
                              />
                              <span className="font-semibold">{emp.fullName}</span>
                              <span className="text-[9px] font-mono px-1 rounded bg-slate-100 text-slate-600">
                                {curShift?.name.split(' ')[0] || 'Vardiya'}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Footer Actions */}
                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setSupervisorFilter(sa.id);
                          setActiveViewTab('calendar');
                        }}
                        className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-800 cursor-pointer"
                      >
                        <Calendar className="w-3.5 h-3.5" />
                        <span>Takvimde Bu Amir'in Personellerini Gör</span>
                      </button>

                      {(isHRManager || isCurrentSupervisor) && (
                        <button
                          type="button"
                          onClick={() => {
                            setAssignForm({
                              employeeId: assignedEmps[0]?.id || '',
                              shiftId: shifts[0]?.id || '',
                            });
                            setIsAssignShiftModalOpen(true);
                          }}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 transition-colors cursor-pointer"
                        >
                          <UserCheck className="w-3.5 h-3.5" />
                          <span>Vardiya Planla</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Section 2: İzin ve Mazeret Talepleri */}
      {(activeViewTab === 'leaves' || activeViewTab === 'all') && (
        <div className="space-y-4 pt-4 border-t border-slate-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CalendarCheck className="w-5 h-5 text-indigo-600" />
              <h2 className="text-lg font-bold text-slate-900">İzin ve Mazeret Talepleri</h2>
            </div>
          <button
            onClick={() => {
              if (employees.length > 0) {
                setLeaveForm((prev) => ({ ...prev, employeeId: employees[0].id }));
              }
              setIsLeaveModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-xs transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Yeni İzin Talebi</span>
          </button>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
          {/* Mobile Leave Request Cards (md:hidden) */}
          <div className="md:hidden divide-y divide-slate-100">
            {leaves.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-xs">
                Aktif izin talebi bulunmuyor.
              </div>
            ) : (
              leaves.map((lr) => (
                <div key={lr.id} className="p-3.5 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-bold text-xs text-slate-900">{lr.employeeName}</div>
                      <div className="text-[10px] text-slate-500 font-mono">
                        {lr.id} · {lr.department}
                      </div>
                    </div>

                    <div>
                      {lr.status === 'approved' ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-full text-[10px] border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3" /> Onaylandı
                        </span>
                      ) : lr.status === 'rejected' ? (
                        <span className="inline-flex items-center gap-1 text-rose-700 font-bold bg-rose-50 px-2 py-0.5 rounded-full text-[10px] border border-rose-200">
                          <AlertCircle className="w-3 h-3" /> Reddedildi
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-amber-700 font-bold bg-amber-50 px-2 py-0.5 rounded-full text-[10px] border border-amber-200">
                          <Clock className="w-3 h-3" /> Onay Bekliyor
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[11px] pt-1">
                    <span className="font-semibold text-slate-800">{lr.leaveType}</span>
                    <span className="font-mono text-slate-600 font-medium">
                      {lr.startDate} - {lr.endDate} ({lr.days} Gün)
                    </span>
                  </div>

                  {lr.reason && (
                    <div className="text-[11px] text-slate-600 bg-slate-50 p-2 rounded-lg border border-slate-100">
                      {lr.reason}
                    </div>
                  )}

                  {lr.status === 'pending' && isHRManager && (
                    <div className="flex items-center gap-2 pt-1.5 border-t border-slate-100">
                      <button
                        onClick={() => handleUpdateStatus(lr.id, 'approved')}
                        className="flex-1 py-1.5 px-3 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow-xs transition-colors cursor-pointer text-center"
                      >
                        Onayla
                      </button>
                      <button
                        onClick={() => handleUpdateStatus(lr.id, 'rejected')}
                        className="flex-1 py-1.5 px-3 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg border border-rose-200 transition-colors cursor-pointer text-center"
                      >
                        Reddet
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Desktop Leave Table (hidden md:block) */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-500 font-semibold uppercase tracking-wider">
                  <th className="py-3 px-4">Talep No & Personel</th>
                  <th className="py-3 px-4">İzin Türü</th>
                  <th className="py-3 px-4">Tarih Aralığı</th>
                  <th className="py-3 px-4">Süre</th>
                  <th className="py-3 px-4">Gerekçe</th>
                  <th className="py-3 px-4">Onay Durumu</th>
                  <th className="py-3 px-4 text-right">İşlem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {leaves.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400">
                      Aktif izin talebi bulunmuyor.
                    </td>
                  </tr>
                ) : (
                  leaves.map((lr) => (
                    <tr key={lr.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900">{lr.employeeName}</div>
                        <div className="text-[11px] text-slate-500 font-mono">
                          {lr.id} · {lr.department}
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <span className="font-medium text-slate-800">{lr.leaveType}</span>
                      </td>

                      <td className="py-3 px-4 font-mono text-slate-700 whitespace-nowrap">
                        {lr.startDate} - {lr.endDate}
                      </td>

                      <td className="py-3 px-4 font-mono font-medium text-slate-900">
                        {lr.days} Gün
                      </td>

                      <td className="py-3 px-4 text-slate-600 max-w-xs truncate">
                        {lr.reason}
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap">
                        {lr.status === 'approved' ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold bg-emerald-50 px-2.5 py-1 rounded-md text-[11px]">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Onaylandı
                          </span>
                        ) : lr.status === 'rejected' ? (
                          <span className="inline-flex items-center gap-1 text-rose-700 font-semibold bg-rose-50 px-2.5 py-1 rounded-md text-[11px]">
                            <AlertCircle className="w-3.5 h-3.5" /> Reddedildi
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-amber-700 font-semibold bg-amber-50 px-2.5 py-1 rounded-md text-[11px]">
                            <Clock className="w-3.5 h-3.5" /> Bekliyor
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-right">
                        {lr.status === 'pending' ? (
                          isHRManager ? (
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => handleUpdateStatus(lr.id, 'approved')}
                                className="px-2.5 py-1 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-md shadow-xs transition-colors cursor-pointer"
                              >
                                Onayla
                              </button>
                              <button
                                onClick={() => handleUpdateStatus(lr.id, 'rejected')}
                                className="px-2.5 py-1 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-md transition-colors cursor-pointer"
                              >
                                Reddet
                              </button>
                            </div>
                          ) : (
                            <span className="text-slate-400 text-xs italic">İK Onayı Bekliyor</span>
                          )
                        ) : (
                          <span className="text-slate-400 text-xs">Tamamlandı</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      )}

      {/* Section 3: Fazla Mesai Talepleri */}
      {(activeViewTab === 'overtime' || activeViewTab === 'all') && (
        <div className="space-y-4 pt-4 border-t border-slate-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Timer className="w-5 h-5 text-amber-600" />
              <h2 className="text-lg font-bold text-slate-900">Fazla Mesai Talepleri</h2>
              {overtimes.filter((o) => o.status === 'pending').length > 0 && (
                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
                  {overtimes.filter((o) => o.status === 'pending').length} Onay Bekliyor
                </span>
              )}
            </div>

            {/* Overtime Filter Tabs */}
            <div className="flex items-center gap-1.5 text-xs overflow-x-auto pb-1 no-scrollbar">
              <button
                onClick={() => setOvertimeFilter('all')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  overtimeFilter === 'all'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Tümü ({overtimes.length})
              </button>
              <button
                onClick={() => setOvertimeFilter('pending')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  overtimeFilter === 'pending'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200'
                }`}
              >
                Bekleyenler ({overtimes.filter((o) => o.status === 'pending').length})
              </button>
              <button
                onClick={() => setOvertimeFilter('approved')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  overtimeFilter === 'approved'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                }`}
              >
                Onaylananlar ({overtimes.filter((o) => o.status === 'approved').length})
              </button>
              <button
                onClick={() => setOvertimeFilter('rejected')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  overtimeFilter === 'rejected'
                    ? 'bg-rose-600 text-white shadow-xs'
                    : 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200'
                }`}
              >
                Reddedilenler ({overtimes.filter((o) => o.status === 'rejected').length})
              </button>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider">
                    <th className="py-3 px-4">Personel Bilgisi</th>
                    <th className="py-3 px-4">Tarih</th>
                    <th className="py-3 px-4">Saat Aralığı & Süre</th>
                    <th className="py-3 px-4">Talep Nedeni</th>
                    <th className="py-3 px-4">Talep Tarihi</th>
                    <th className="py-3 px-4">Onay Durumu</th>
                    <th className="py-3 px-4 text-right">İşlem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {overtimes
                    .filter((ot) => {
                      if (overtimeFilter === 'all') return true;
                      return ot.status === overtimeFilter;
                    })
                    .length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-400">
                        Bu filtreye uygun fazla mesai talebi bulunamadı.
                      </td>
                    </tr>
                  ) : (
                    overtimes
                      .filter((ot) => {
                        if (overtimeFilter === 'all') return true;
                        return ot.status === overtimeFilter;
                      })
                      .map((ot) => (
                        <tr key={ot.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-3 px-4">
                            <div className="font-bold text-slate-900">{ot.employeeName}</div>
                            <div className="text-[11px] font-mono text-slate-500">
                              {ot.employeeId} · {ot.department}
                            </div>
                          </td>
                          <td className="py-3 px-4 font-mono font-medium text-slate-800">
                            {ot.date}
                          </td>
                          <td className="py-3 px-4">
                            <span className="font-mono font-semibold text-slate-900">
                              {ot.startTime} - {ot.endTime}
                            </span>
                            <span className="ml-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                              {ot.hours} Saat
                            </span>
                          </td>
                          <td className="py-3 px-4 max-w-xs truncate text-slate-600">
                            {ot.reason || '-'}
                          </td>
                          <td className="py-3 px-4 text-slate-500 font-mono text-[11px]">
                            {new Date(ot.appliedAt).toLocaleDateString('tr-TR')}
                          </td>
                          <td className="py-3 px-4">
                            {ot.status === 'approved' ? (
                              <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold bg-emerald-50 px-2.5 py-1 rounded-md text-[11px] border border-emerald-200">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Onaylandı
                              </span>
                            ) : ot.status === 'rejected' ? (
                              <span className="inline-flex items-center gap-1 text-rose-700 font-semibold bg-rose-50 px-2.5 py-1 rounded-md text-[11px] border border-rose-200">
                                <AlertCircle className="w-3.5 h-3.5 text-rose-600" /> Reddedildi
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-amber-700 font-semibold bg-amber-50 px-2.5 py-1 rounded-md text-[11px] border border-amber-200">
                                <Clock className="w-3.5 h-3.5 text-amber-600" /> İK Onayı Bekliyor
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right">
                            {ot.status === 'pending' ? (
                              isHRManager ? (
                                <div className="flex items-center justify-end gap-1.5">
                                  <button
                                    onClick={() => handleApproveOvertime(ot.id)}
                                    className="px-2.5 py-1 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-md shadow-xs transition-colors cursor-pointer"
                                    title="Fazla mesaiyi onayla ve Bildirim Merkezine gönder"
                                  >
                                    Onayla
                                  </button>
                                  <button
                                    onClick={() => handleRejectOvertime(ot.id)}
                                    className="px-2.5 py-1 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-md transition-colors cursor-pointer"
                                    title="Fazla mesaiyi reddet"
                                  >
                                    Reddet
                                  </button>
                                </div>
                              ) : (
                                <span className="text-slate-400 text-xs italic">Yetki Gerekli</span>
                              )
                            ) : (
                              <span className="text-slate-400 text-xs">
                                {ot.reviewedBy ? `${ot.reviewedBy}` : 'Tamamlandı'}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: INTERACTIVE CELL DETAIL & SHIFT REASSIGNMENT */}
      {selectedCellDetail && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl border border-slate-200">
            <div className="flex items-start justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <img
                  src={selectedCellDetail.employee.avatar}
                  alt={selectedCellDetail.employee.fullName}
                  className="w-11 h-11 rounded-2xl object-cover border border-slate-200 shadow-2xs"
                />
                <div>
                  <h4 className="font-bold text-sm text-slate-900 leading-tight">
                    {selectedCellDetail.employee.fullName}
                  </h4>
                  <p className="text-xs text-slate-500">
                    {selectedCellDetail.employee.department} · {selectedCellDetail.employee.title}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setSelectedCellDetail(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Date & Shift Information */}
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Tarih & Gün:</span>
                <span className="font-bold text-slate-900 font-mono">
                  {selectedCellDetail.dateStr} ({selectedCellDetail.dayName})
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-500">Durum:</span>
                {selectedCellDetail.leave ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800">
                    Resmi İzin ({selectedCellDetail.leave.leaveType})
                  </span>
                ) : selectedCellDetail.isWorkDay ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                    Vardiyada ({selectedCellDetail.shift.startTime} - {selectedCellDetail.shift.endTime})
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-200 text-slate-700">
                    Hafta Tatili
                  </span>
                )}
              </div>

              {selectedCellDetail.leave && (
                <div className="text-[11px] text-purple-800 pt-1 border-t border-purple-100">
                  <strong>Gerekçe:</strong> {selectedCellDetail.leave.reason}
                </div>
              )}
            </div>

            {/* Shift Reassignment: Allowed for HR Manager OR Assigned Birim Amiri */}
            {!selectedCellDetail.leave && (
              pdksStorage.canUserManageShiftForEmployee(activeUser, selectedCellDetail.employee.id) ? (
                <div className="p-3.5 rounded-xl bg-indigo-50/60 border border-indigo-200 space-y-2.5 text-xs">
                  <label className="block font-bold text-indigo-950">
                    {isHRManager
                      ? 'Vardiya Planını Değiştir (İK Yetkisi):'
                      : `Vardiya Planını Değiştir (Birim Amiri: ${activeUser.name}):`}
                  </label>
                  <div className="flex items-center gap-2">
                    <select
                      value={reassignShiftId}
                      onChange={(e) => setReassignShiftId(e.target.value)}
                      className="flex-1 px-3 py-1.5 text-xs bg-white border border-indigo-300 rounded-lg text-slate-800 cursor-pointer font-medium"
                    >
                      {shifts.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.startTime} - {s.endTime})
                        </option>
                      ))}
                    </select>

                    <button
                      onClick={handleApplyShiftReassignment}
                      className="px-3.5 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-xs transition-colors cursor-pointer shrink-0"
                    >
                      Kaydet
                    </button>
                  </div>

                  {/* ÇAKIŞMA KONTROLÜ UYARISI */}
                  {calendarCellConflict?.hasConflict && (
                    <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl text-amber-950 space-y-1 animate-in fade-in">
                      <div className="flex items-center gap-1.5 font-bold text-amber-800">
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>Çakışma Kontrolü Uyarısı!</span>
                      </div>
                      <p className="text-[11px] leading-relaxed">
                        {calendarCellConflict.message}
                      </p>
                      <div className="text-[10px] text-amber-700 font-medium">
                        ⚠️ İki farklı vardiya aynı zaman dilimine denk gelmektedir. Atama yapılırsa personelin mesai çizelgesinde çakışma oluşacaktır.
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-500 flex items-start gap-2">
                  <Lock className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-slate-700">Vardiya Düzenleme Kısıtlı</span>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {isSupervisor
                        ? `Bu personel sorumluluk alanınızda değildir. Yalnızca İK tarafından size atanan ${responsibleEmpIds.length} personelin vardiyasını değiştirebilirsiniz.`
                        : 'Vardiya değiştirme yetkisi yalnızca İK Yöneticisine ve görevlendirilen Birim Amirlerine aittir.'}
                    </p>
                  </div>
                </div>
              )
            )}

            {/* Quick Actions */}
            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                onClick={handleSendCellReminder}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-bold text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                <Send className="w-3.5 h-3.5 text-amber-700" />
                <span>Vardiya Uyarısı Gönder</span>
              </button>

              <button
                onClick={() => {
                  setLeaveForm({
                    employeeId: selectedCellDetail.employee.id,
                    leaveType: 'Yıllık İzin',
                    startDate: selectedCellDetail.dateStr,
                    endDate: selectedCellDetail.dateStr,
                    days: 1,
                    reason: `${selectedCellDetail.dayName} günü için izin talebi`,
                  });
                  setSelectedCellDetail(null);
                  setIsLeaveModalOpen(true);
                }}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                <CalendarCheck className="w-3.5 h-3.5 text-indigo-600" />
                <span>İzin Tanımla</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Yeni Vardiya */}
      {isShiftModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">Yeni Vardiya Planı Tanımla</h3>
              <button
                onClick={() => setIsShiftModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveShift} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Vardiya Adı
                </label>
                <input
                  type="text"
                  required
                  placeholder="Örn: 2. Vardiya (16:00 - 00:00)"
                  value={shiftForm.name}
                  onChange={(e) => setShiftForm({ ...shiftForm, name: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Başlangıç Saati
                  </label>
                  <input
                    type="time"
                    required
                    value={shiftForm.startTime}
                    onChange={(e) => setShiftForm({ ...shiftForm, startTime: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Bitiş Saati
                  </label>
                  <input
                    type="time"
                    required
                    value={shiftForm.endTime}
                    onChange={(e) => setShiftForm({ ...shiftForm, endTime: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Tolerans (Dk)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={60}
                    value={shiftForm.toleranceMinutes}
                    onChange={(e) => setShiftForm({ ...shiftForm, toleranceMinutes: Number(e.target.value) })}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Mola Süresi (Dk)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={180}
                    value={shiftForm.breakMinutes}
                    onChange={(e) => setShiftForm({ ...shiftForm, breakMinutes: Number(e.target.value) })}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                  />
                </div>
              </div>

              {/* Çalışma Günleri */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Çalışma Günleri
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'].map((day) => {
                    const isSelected = (shiftForm.workDays || []).includes(day);
                    return (
                      <button
                        type="button"
                        key={day}
                        onClick={() => {
                          const currentDays = shiftForm.workDays || [];
                          if (isSelected) {
                            setShiftForm({ ...shiftForm, workDays: currentDays.filter((d) => d !== day) });
                          } else {
                            setShiftForm({ ...shiftForm, workDays: [...currentDays, day] });
                          }
                        }}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {day.slice(0, 3)}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* ÇAKIŞMA KONTROLÜ: Canlı Çakışma Uyarısı */}
              {createShiftConflict?.hasConflict && (
                <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl text-amber-950 text-xs space-y-1.5 animate-in fade-in">
                  <div className="flex items-center gap-1.5 font-bold text-amber-800">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>Çakışma Kontrolü: Vardiya Saat Çakışması!</span>
                  </div>
                  <p className="text-[11px] leading-relaxed">
                    Girilen saat aralığı ({shiftForm.startTime} - {shiftForm.endTime}), mevcut <strong>"{createShiftConflict.conflictingShift?.name}"</strong> ({createShiftConflict.conflictingShift?.startTime} - {createShiftConflict.conflictingShift?.endTime}) vardiyası ile aynı zaman dilimine denk gelmektedir.
                  </p>
                  <div className="text-[10px] text-amber-700 font-mono font-medium">
                    Çakışan Ortak Günler: {createShiftConflict.sharedDays.join(', ')} ({createShiftConflict.overlapHoursStr} saat çakışma)
                  </div>
                </div>
              )}

              <div className="pt-4 border-t border-slate-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsShiftModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-sm"
                >
                  Kaydet
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Yeni İzin Talebi */}
      {isLeaveModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">İzin Talebi Oluştur</h3>
              <button
                onClick={() => setIsLeaveModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveLeave} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Personel Seçin
                </label>
                <select
                  value={leaveForm.employeeId}
                  onChange={(e) => setLeaveForm({ ...leaveForm, employeeId: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.fullName} ({e.department})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  İzin Türü
                </label>
                <select
                  value={leaveForm.leaveType}
                  onChange={(e) => setLeaveForm({ ...leaveForm, leaveType: e.target.value as any })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="Yıllık İzin">Yıllık İzin</option>
                  <option value="Mazeret İzni">Mazeret İzni</option>
                  <option value="Hastalık / Rapor">Hastalık / Rapor</option>
                  <option value="Uzaktan Çalışma (Home Office)">Uzaktan Çalışma (Home Office)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Başlangıç Tarihi
                  </label>
                  <input
                    type="date"
                    required
                    value={leaveForm.startDate}
                    onChange={(e) => setLeaveForm({ ...leaveForm, startDate: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Bitiş Tarihi
                  </label>
                  <input
                    type="date"
                    required
                    value={leaveForm.endDate}
                    onChange={(e) => setLeaveForm({ ...leaveForm, endDate: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Toplam Gün
                </label>
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={leaveForm.days}
                  onChange={(e) => setLeaveForm({ ...leaveForm, days: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Açıklama / Gerekçe
                </label>
                <textarea
                  rows={2}
                  placeholder="İzin gerekçesi..."
                  value={leaveForm.reason}
                  onChange={(e) => setLeaveForm({ ...leaveForm, reason: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="pt-4 border-t border-slate-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsLeaveModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-sm"
                >
                  Talebi Gönder
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: PERSONEL VARDİYA ATAMA & ÇAKIŞMA DENETİMİ (İK & BİRİM AMİRİ) */}
      {isAssignShiftModalOpen && (() => {
        const assignableEmployees = isHRManager
          ? employees
          : employees.filter((e) => responsibleEmpIds.includes(e.id));

        return (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-700 flex items-center justify-center">
                    <UserCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">
                      {isSupervisor && !isHRManager ? 'Personel Vardiya Planlama (Birim Amiri)' : 'Personel Vardiya Atama'}
                    </h3>
                    <p className="text-xs text-slate-500">
                      {isSupervisor && !isHRManager
                        ? `Birim Amiri: ${activeUser.name} · Sorumlu Olduğunuz ${assignableEmployees.length} Personel`
                        : 'Otomatik Çakışma Kontrolü ve Bildirim Sistemi'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAssignShiftModalOpen(false)}
                  className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleAssignShiftSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Personel Seçin ({assignableEmployees.length} Personel Mevcut)
                  </label>
                  {assignableEmployees.length === 0 ? (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                      ⚠️ Henüz İK tarafından size atanmış bir personel bulunmamaktadır. Vardiya planlaması yapabilmek için İK Yöneticisinin size personel yetkilendirmesi yapması gerekmektedir.
                    </div>
                  ) : (
                    <select
                      required
                      value={assignForm.employeeId}
                      onChange={(e) => setAssignForm({ ...assignForm, employeeId: e.target.value })}
                      className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                    >
                      <option value="">Personel Seçin...</option>
                      {assignableEmployees.map((e) => {
                        const curShift = shifts.find((s) => s.id === e.shiftId) || shifts[0];
                        return (
                          <option key={e.id} value={e.id}>
                            {e.fullName} ({e.department}) - Mevcut: {curShift ? curShift.name : 'Standart'}
                          </option>
                        );
                      })}
                    </select>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Atanacak Yeni Vardiya
                  </label>
                  <select
                    required
                    value={assignForm.shiftId}
                    onChange={(e) => setAssignForm({ ...assignForm, shiftId: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                  >
                    <option value="">Vardiya Seçin...</option>
                    {shifts.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.startTime} - {s.endTime}) [Tolerans: ±{s.toleranceMinutes} dk]
                      </option>
                    ))}
                  </select>
                </div>

                {/* OTOMATİK ÇAKIŞMA KONTROLÜ (CONFLICT CHECK) PANELİ */}
                {assignForm.employeeId && assignForm.shiftId && (
                  <div className="pt-2">
                    {assignShiftConflict?.hasConflict ? (
                      <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-xl text-amber-950 space-y-1.5 animate-in fade-in">
                        <div className="flex items-center gap-2 font-bold text-amber-800 text-xs">
                          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                          <span>⚠️ Çakışma Kontrolü: Vardiya Zaman Çakışması Bulundu!</span>
                        </div>
                        <p className="text-xs leading-relaxed text-amber-900">
                          {assignShiftConflict.message}
                        </p>
                        <div className="text-[11px] text-amber-700 bg-amber-100/60 p-2 rounded-lg font-medium">
                          İki farklı vardiyanın aynı zaman dilimine denk gelmesi durumunda sistem giriş-çıkış toleransı ve mesai saatlerini denetlerken uyarı verecektir. Atamayı yine de gerçekleştirebilirsiniz.
                        </div>
                      </div>
                    ) : (
                      <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900 space-y-1 animate-in fade-in">
                        <div className="flex items-center gap-1.5 font-bold text-emerald-800 text-xs">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                          <span>🟢 Çakışma Kontrolü: Temiz</span>
                        </div>
                        <p className="text-[11px] text-emerald-700">
                          Seçilen vardiya personelin takvimiyle uyumludur; herhangi bir zaman çakışması tespit edilmemiştir.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsAssignShiftModalOpen(false)}
                    className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                  >
                    İptal
                  </button>
                  <button
                    type="submit"
                    disabled={assignableEmployees.length === 0}
                    className={`px-4 py-2 text-xs font-bold text-white rounded-lg shadow-sm transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                      assignShiftConflict?.hasConflict
                        ? 'bg-amber-600 hover:bg-amber-700'
                        : 'bg-indigo-600 hover:bg-indigo-500'
                    }`}
                  >
                    {assignShiftConflict?.hasConflict ? 'Çakışmaya Rağmen Ata' : 'Vardiyayı Ata ve Personele Bildir'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}

      {/* MODAL: BİRİM AMİRİ YETKİLENDİR & SORUMLU PERSONEL ATA (İK YÖNETİCİSİ) */}
      {isSupervisorModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 space-y-5 my-6">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-700 flex items-center justify-center shadow-2xs">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {editingSupervisorId ? 'Birim Amiri Yetkisini Düzenle' : 'Yeni Birim Amiri Yetkilendir & Personel Ata'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Birim amirinin hangi personellerden sorumlu olacağını ve vardiyalarını planlayacağını belirleyin.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsSupervisorModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSupervisorAssignment} className="space-y-4">
              {/* Adım 1: Birim Amiri Seçimi */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5">
                  1. Birim Amiri Olarak Görevlendirilecek Personel: *
                </label>
                <select
                  required
                  value={supervisorFormEmpId}
                  onChange={(e) => {
                    const newId = e.target.value;
                    setSupervisorFormEmpId(newId);
                    const selected = employees.find((emp) => emp.id === newId);
                    if (selected && !editingSupervisorId) {
                      // Automatically select peers in the same department
                      const deptEmps = employees
                        .filter((emp) => emp.department === selected.department)
                        .map((emp) => emp.id);
                      setSupervisorFormAssignedIds(deptEmps);
                    }
                  }}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-semibold text-slate-900"
                >
                  <option value="">-- Birim Amiri Seçin --</option>
                  {employees.map((emp) => {
                    const alreadySupervisor = supervisorAssignments.some(
                      (sa) => sa.supervisorId === emp.id && sa.id !== editingSupervisorId
                    );
                    return (
                      <option key={emp.id} value={emp.id}>
                        {emp.fullName} ({emp.department} - {emp.title}) {alreadySupervisor ? '👑 [Halihazırda Birim Amiri]' : ''}
                      </option>
                    );
                  })}
                </select>
                <span className="text-[11px] text-slate-500 mt-1 block">
                  Seçilen personel, Asem PDKS sisteminde Birim Amiri yetkisiyle yalnızca kendisine atanan çalışanların vardiyalarını yönetebilecektir.
                </span>
              </div>

              {/* Adım 2: Sorumlu Olacağı Personeller */}
              <div className="space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <label className="block text-xs font-bold text-slate-800">
                    2. Sorumlu Olacağı Personelleri Seçin ({supervisorFormAssignedIds.length} / {employees.length} Seçili): *
                  </label>

                  {/* Fast selection helpers */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {supervisorFormEmpId && (() => {
                      const selSupervisor = employees.find((e) => e.id === supervisorFormEmpId);
                      if (!selSupervisor) return null;
                      const deptEmps = employees.filter((e) => e.department === selSupervisor.department).map((e) => e.id);
                      return (
                        <button
                          type="button"
                          onClick={() => {
                            setSupervisorFormAssignedIds(deptEmps);
                          }}
                          className="px-2 py-1 text-[10px] font-bold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-md border border-indigo-200 transition-colors cursor-pointer"
                        >
                          Tüm {selSupervisor.department} ({deptEmps.length})
                        </button>
                      );
                    })()}

                    <button
                      type="button"
                      onClick={() => setSupervisorFormAssignedIds(employees.map((e) => e.id))}
                      className="px-2 py-1 text-[10px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md transition-colors cursor-pointer"
                    >
                      Tümünü Seç
                    </button>
                    <button
                      type="button"
                      onClick={() => setSupervisorFormAssignedIds([])}
                      className="px-2 py-1 text-[10px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-md transition-colors cursor-pointer"
                    >
                      Temizle
                    </button>
                  </div>
                </div>

                {/* Search & Department Filter within Modal */}
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Personel ara..."
                      value={supervisorModalSearch}
                      onChange={(e) => setSupervisorModalSearch(e.target.value)}
                      className="w-full pl-8 pr-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-indigo-500"
                    />
                  </div>

                  <select
                    value={supervisorModalDeptFilter}
                    onChange={(e) => setSupervisorModalDeptFilter(e.target.value)}
                    className="px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-700 focus:bg-white cursor-pointer"
                  >
                    <option value="all">Tüm Departmanlar</option>
                    <option value="Yazılım & Ar-Ge">Yazılım & Ar-Ge</option>
                    <option value="İnsan Kaynakları">İnsan Kaynakları</option>
                    <option value="Muhasebe & Finans">Muhasebe & Finans</option>
                    <option value="Pazarlama & Satış">Pazarlama & Satış</option>
                    <option value="Üretim & Operasyon">Üretim & Operasyon</option>
                    <option value="Lojistik & Depo">Lojistik & Depo</option>
                  </select>
                </div>

                {/* Checkbox List of Employees */}
                <div className="max-h-56 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100 bg-slate-50/50 p-1">
                  {employees
                    .filter((emp) => {
                      const matchesDept =
                        supervisorModalDeptFilter === 'all' || emp.department === supervisorModalDeptFilter;
                      const matchesSearch =
                        supervisorModalSearch.trim() === '' ||
                        emp.fullName.toLowerCase().includes(supervisorModalSearch.toLowerCase()) ||
                        emp.id.toLowerCase().includes(supervisorModalSearch.toLowerCase());
                      return matchesDept && matchesSearch;
                    })
                    .map((emp) => {
                      const isChecked = supervisorFormAssignedIds.includes(emp.id);
                      const isSelf = emp.id === supervisorFormEmpId;
                      const curShift = shifts.find((s) => s.id === emp.shiftId) || shifts[0];

                      return (
                        <label
                          key={emp.id}
                          className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors ${
                            isChecked
                              ? 'bg-indigo-50/70 border border-indigo-200/80 text-indigo-950 font-medium'
                              : 'hover:bg-white text-slate-700'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSupervisorFormAssignedIds((prev) => [...prev, emp.id]);
                                } else {
                                  setSupervisorFormAssignedIds((prev) => prev.filter((id) => id !== emp.id));
                                }
                              }}
                              className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                            />
                            <img
                              src={emp.avatar}
                              alt={emp.fullName}
                              className="w-7 h-7 rounded-lg object-cover shrink-0 border border-slate-200"
                            />
                            <div className="truncate">
                              <div className="text-xs font-bold leading-tight flex items-center gap-1.5">
                                <span>{emp.fullName}</span>
                                {isSelf && (
                                  <span className="text-[9px] px-1.5 py-0.2 bg-amber-100 text-amber-800 rounded font-bold">
                                    Amirin Kendisi
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] text-slate-500">
                                {emp.department} · {emp.title}
                              </div>
                            </div>
                          </div>

                          <div className="text-right shrink-0 font-mono text-[10px] text-slate-500 ml-2">
                            <span className="px-1.5 py-0.5 rounded bg-white border border-slate-200">
                              {curShift?.name || 'Vardiya'}
                            </span>
                          </div>
                        </label>
                      );
                    })}
                </div>
              </div>

              {/* Adım 3: Görev Açıklaması & Not */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  3. Yetki Kapsamı / Görev Notu (İsteğe Bağlı):
                </label>
                <input
                  type="text"
                  placeholder="Örn: Üretim hattı personellerinin haftalık vardiya çizelgelerinin planlanması"
                  value={supervisorFormNotes}
                  onChange={(e) => setSupervisorFormNotes(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Footer */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
                <span className="text-xs text-slate-500 font-medium">
                  {supervisorFormAssignedIds.length} Personel Birim Amirine Bağlanacak
                </span>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsSupervisorModalOpen(false)}
                    className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                  >
                    İptal
                  </button>
                  <button
                    type="submit"
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl shadow-xs transition-colors cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Yetkilendirmeyi Kaydet & Personele Bildir</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Printable Report / PDF View */}
      {isPrintModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6">
          <div className="bg-white rounded-2xl max-w-4xl w-full shadow-2xl border border-slate-200 overflow-hidden my-6">
            <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between no-print">
              <div className="flex items-center gap-3">
                <FileText className="w-5 h-5 text-indigo-400" />
                <h3 className="font-bold text-base">Vardiya ve İzin Resmi Raporu (PDF / Yazdır)</h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={executeBrowserPrint}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>Yazdır / PDF Kaydet</span>
                </button>
                <button
                  onClick={() => setIsPrintModalOpen(false)}
                  className="text-slate-400 hover:text-white p-1"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Print Body */}
            <div className="p-6 sm:p-8 space-y-6 text-slate-800 text-xs">
              <div className="border-b border-slate-300 pb-4 flex items-center justify-between">
                <div>
                  <h1 className="text-xl font-bold text-slate-900">ASEM PDKS · VARDİYA & İZİN RESMİ RAPORU</h1>
                  <p className="text-slate-500 text-xs mt-0.5">
                    İnsan Kaynakları ve Personel Devam Kontrol Sistemi Raporu
                  </p>
                </div>
                <div className="text-right font-mono text-slate-600">
                  <div>Tarih: {new Date().toLocaleDateString('tr-TR')}</div>
                  <div>Raporlayan: {activeUser.name} ({activeUser.title})</div>
                </div>
              </div>

              {/* Summary Stats */}
              <div className="grid grid-cols-4 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div>
                  <div className="text-slate-500 text-[11px]">Toplam Personel</div>
                  <div className="text-lg font-bold text-slate-900">{employees.length}</div>
                </div>
                <div>
                  <div className="text-slate-500 text-[11px]">Tanımlı Vardiya</div>
                  <div className="text-lg font-bold text-slate-900">{shifts.length}</div>
                </div>
                <div>
                  <div className="text-slate-500 text-[11px]">Aktif İzin Talebi</div>
                  <div className="text-lg font-bold text-slate-900">{leaves.length}</div>
                </div>
                <div>
                  <div className="text-slate-500 text-[11px]">Onaylı İzinler</div>
                  <div className="text-lg font-bold text-emerald-700">
                    {leaves.filter((l) => l.status === 'approved').length}
                  </div>
                </div>
              </div>

              {/* Shifts Table */}
              <div>
                <h4 className="font-bold text-sm text-slate-900 mb-2">1. Tanımlı Vardiyalar</h4>
                <table className="w-full border-collapse border border-slate-300 text-[11px]">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 font-bold">
                      <th className="border border-slate-300 p-2 text-left">Kod</th>
                      <th className="border border-slate-300 p-2 text-left">Vardiya Adı</th>
                      <th className="border border-slate-300 p-2 text-left">Giriş - Çıkış</th>
                      <th className="border border-slate-300 p-2 text-left">Tolerans</th>
                      <th className="border border-slate-300 p-2 text-left">Mola</th>
                      <th className="border border-slate-300 p-2 text-left">Çalışma Günleri</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shifts.map((s) => (
                      <tr key={s.id}>
                        <td className="border border-slate-300 p-2 font-mono">{s.id}</td>
                        <td className="border border-slate-300 p-2 font-bold">{s.name}</td>
                        <td className="border border-slate-300 p-2 font-mono">{s.startTime} - {s.endTime}</td>
                        <td className="border border-slate-300 p-2 font-mono">±{s.toleranceMinutes} dk</td>
                        <td className="border border-slate-300 p-2 font-mono">{s.breakMinutes} dk</td>
                        <td className="border border-slate-300 p-2">{s.workDays.join(', ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Leaves Table */}
              <div>
                <h4 className="font-bold text-sm text-slate-900 mb-2">2. İzin ve Mazeret Kayıtları</h4>
                <table className="w-full border-collapse border border-slate-300 text-[11px]">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 font-bold">
                      <th className="border border-slate-300 p-2 text-left">Talep No</th>
                      <th className="border border-slate-300 p-2 text-left">Personel Adı</th>
                      <th className="border border-slate-300 p-2 text-left">Departman</th>
                      <th className="border border-slate-300 p-2 text-left">İzin Türü</th>
                      <th className="border border-slate-300 p-2 text-left">Tarih Aralığı</th>
                      <th className="border border-slate-300 p-2 text-left">Gün</th>
                      <th className="border border-slate-300 p-2 text-left">Durum</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaves.map((lr) => (
                      <tr key={lr.id}>
                        <td className="border border-slate-300 p-2 font-mono">{lr.id}</td>
                        <td className="border border-slate-300 p-2 font-semibold">{lr.employeeName}</td>
                        <td className="border border-slate-300 p-2">{lr.department}</td>
                        <td className="border border-slate-300 p-2">{lr.leaveType}</td>
                        <td className="border border-slate-300 p-2 font-mono">{lr.startDate} - {lr.endDate}</td>
                        <td className="border border-slate-300 p-2 font-mono">{lr.days} Gün</td>
                        <td className="border border-slate-300 p-2 font-bold">
                          {lr.status === 'approved' ? 'ONAYLANDI' : lr.status === 'rejected' ? 'REDDEDİLDİ' : 'BEKLİYOR'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="pt-8 border-t border-slate-300 flex justify-between text-slate-500 text-[11px]">
                <div>İnsan Kaynakları Departman İmzası: ____________________</div>
                <div>Kurumsal Kaşe: ____________________</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
