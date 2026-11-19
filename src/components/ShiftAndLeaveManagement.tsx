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
  Timer,
  UserCheck,
  UserPlus,
  Edit3,
  ShieldCheck,
  Save,
  RotateCcw,
  List,
  LayoutGrid,
  Eye,
  Loader2,
  Ban,
} from 'lucide-react';
import {
  Shift,
  EmployeeShiftAssignment,
  LeaveRequest,
  Employee,
  CurrentUser,
  OvertimeRequest,
  SupervisorAssignment,
  UserAccount,
  AttendanceRecord,
} from '../types/pdks';
import { pdksStorage } from '../services/storage';
import {
  calculateLiveShiftDelay,
  getCompactShiftLabel,
  getLocalDateString,
  LiveShiftDelayInfo,
} from '../utils/shiftTimeAnalytics';

const SHORT_DAY_LABELS: Record<string, string> = {
  Pazartesi: 'Pzt',
  Salı: 'Sal',
  Çarşamba: 'Çar',
  Perşembe: 'Per',
  Cuma: 'Cum',
  Cumartesi: 'Cmt',
  Pazar: 'Paz',
};

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
  const [employeeShifts, setEmployeeShifts] = useState<EmployeeShiftAssignment[]>([]);
  const [userAccounts, setUserAccounts] = useState<UserAccount[]>([]);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [nowTick, setNowTick] = useState<number>(() => Date.now());
  const [overtimes, setOvertimes] = useState<OvertimeRequest[]>([]);
  const [overtimeFilter, setOvertimeFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [permissionNotice, setPermissionNotice] = useState<string | null>(null);
  const [notificationToast, setNotificationToast] = useState<string | null>(null);
  const [floatingToast, setFloatingToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [sentNotificationIds, setSentNotificationIds] = useState<Record<string, boolean>>({});

  // Quick Shift Assignment UI States
  const [calendarViewMode, setCalendarViewMode] = useState<'weekly' | 'daily'>('weekly');
  const [selectedDailyDate, setSelectedDailyDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [saveMode, setSaveMode] = useState<'auto' | 'bulk'>('auto');
  const [pendingShiftChanges, setPendingShiftChanges] = useState<Record<string, { employeeId: string; date: string; shiftId: string }>>({});
  const [savingCellKey, setSavingCellKey] = useState<string | null>(null);
  const [isBulkSaving, setIsBulkSaving] = useState<boolean>(false);
  const [togglingPermAccountId, setTogglingPermAccountId] = useState<string | null>(null);
  const [permSearchQuery, setPermSearchQuery] = useState<string>('');

  // HR-Controlled Team / Manager Hierarchy (manager_id) States
  const [selectedTeamEmpIds, setSelectedTeamEmpIds] = useState<string[]>([]);
  const [bulkTargetManagerId, setBulkTargetManagerId] = useState<string>('');
  const [isAssigningManager, setIsAssigningManager] = useState<boolean>(false);
  const [assigningSingleEmpId, setAssigningSingleEmpId] = useState<string | null>(null);
  const [teamSearchQuery, setTeamSearchQuery] = useState<string>('');
  const [teamManagerFilter, setTeamManagerFilter] = useState<string>('all');

  // View Switcher Tab: 'calendar' (Haftalık Takvim) | 'shifts' (Vardiyalar) | 'supervisors' (Yetkilendirme) | 'leaves' (İzinler) | 'overtime' (Fazla Mesailer) | 'all' (Tümü)
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
  const isHRManager = pdksStorage.isHRorSuperAdmin(activeUser);
  const canCancelLeave =
    pdksStorage.isSuperAdmin(activeUser) || activeUser?.role === 'ik_yoneticisi';
  const canToggleShiftPermissions = pdksStorage.canToggleShiftPermission(activeUser);
  const canManageShifts = pdksStorage.hasShiftManagePermission(activeUser);
  const managedDepartment = pdksStorage.getManagedShiftDepartment(activeUser);
  const isUnitManagerOnly = canManageShifts && !isHRManager;
  const isReadOnlyShiftViewer = !canManageShifts;
  const canApprove = pdksStorage.canApproveRequests(activeUser);
  const canExport = pdksStorage.canExportReports(activeUser);
  const canDelete = pdksStorage.canDeleteEmployee(activeUser);
  const isSupervisor = isUnitManagerOnly;
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const [companyName, setCompanyName] = useState<string>(() => pdksStorage.getCompanyName());

  const showFloatingToast = (type: 'success' | 'error', message: string) => {
    setFloatingToast({ type, message });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => {
      setFloatingToast(null);
    }, 3500);
  };

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const syncName = (e?: any) => {
      if (e?.detail && typeof e.detail === 'string') setCompanyName(e.detail);
      else setCompanyName(pdksStorage.getCompanyName());
    };
    window.addEventListener('pdks-company-name-updated', syncName);
    window.addEventListener('pdks-wall-qr-updated', syncName);
    window.addEventListener('pdks-data-synced', syncName);
    return () => {
      window.removeEventListener('pdks-company-name-updated', syncName);
      window.removeEventListener('pdks-wall-qr-updated', syncName);
      window.removeEventListener('pdks-data-synced', syncName);
    };
  }, []);

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
  const [onlyMyResponsible, setOnlyMyResponsible] = useState<boolean>(isUnitManagerOnly);
  const [supervisorFilter, setSupervisorFilter] = useState<string>('all');

  // Responsible Employees for currently active user (strictly department-scoped for Birim Yöneticisi / Amir)
  const responsibleEmpIds = useMemo(() => {
    return pdksStorage.getResponsibleEmployeeIdsForUser(activeUser);
  }, [activeUser, employees, userAccounts, supervisorAssignments]);

  // Dynamic 7 days of the active week (Monday to Sunday)
  const todayLocalStr = getLocalDateString(new Date(nowTick));

  const weekDays = useMemo(() => {
    const now = new Date(nowTick);
    const currentDay = now.getDay(); // 0 is Sunday, 1 is Monday...
    const diffToMonday = (currentDay === 0 ? -6 : 1) - currentDay;
    const monday = new Date(now);
    monday.setDate(now.getDate() + diffToMonday + currentWeekOffset * 7);

    const dayNames = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const dateStr = getLocalDateString(d);
      const isToday = dateStr === todayLocalStr;
      days.push({
        date: d,
        dateStr,
        dayName: dayNames[i],
        shortDayName: SHORT_DAY_LABELS[dayNames[i]] || dayNames[i].slice(0, 3),
        formattedDate: d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }),
        isToday,
      });
    }
    return days;
  }, [currentWeekOffset, todayLocalStr]);

  const weekLabel = useMemo(() => {
    if (weekDays.length === 0) return '';
    const first = weekDays[0];
    const last = weekDays[6];
    return `${first.formattedDate} - ${last.formattedDate} ${last.date.getFullYear()}`;
  }, [weekDays]);

  // Eligible Birim Amiri / Manager accounts for HR Ekip-Amir assignment & filtering
  const managerAccounts = useMemo(() => {
    return userAccounts.filter(
      (acc) =>
        acc.isActive &&
        (acc.role === 'birim_amiri' ||
          acc.role === 'yonetici' ||
          acc.can_manage_shifts === true ||
          acc.role === 'ik_yoneticisi')
    );
  }, [userAccounts]);

  const managerById = useMemo(() => {
    const map = new Map<string, UserAccount>();
    for (const acc of userAccounts) {
      map.set(acc.id, acc);
    }
    return map;
  }, [userAccounts]);

  const calendarEmployees = useMemo(() => {
    return employees.filter((emp) => {
      // STRICT manager_id scoping for Unit Manager / Birim Amiri:
      // Can ONLY view and edit employees explicitly assigned to them by HR (emp.manager_id === activeUser.id).
      if (isUnitManagerOnly) {
        if (emp.manager_id !== activeUser.id) return false;
      }

      // HR / Super Admin Birim Amiri filter
      if (isHRManager && supervisorFilter !== 'all') {
        if (supervisorFilter === 'unassigned') {
          if (emp.manager_id) return false;
        } else if (emp.manager_id !== supervisorFilter) {
          return false;
        }
      }

      const matchesDept = isUnitManagerOnly
        ? true
        : calendarDeptFilter === 'all' || emp.department === calendarDeptFilter;
      const matchesSearch =
        calendarSearch.trim() === '' ||
        emp.fullName.toLowerCase().includes(calendarSearch.toLowerCase()) ||
        emp.id.toLowerCase().includes(calendarSearch.toLowerCase()) ||
        emp.title.toLowerCase().includes(calendarSearch.toLowerCase());
      return matchesDept && matchesSearch;
    });
  }, [
    employees,
    calendarDeptFilter,
    calendarSearch,
    supervisorFilter,
    isUnitManagerOnly,
    activeUser.id,
    isHRManager,
  ]);

  // Filtered employees inside HR "Ekip / Amir Eşleştirme" panel
  const filteredTeamEmployees = useMemo(() => {
    return employees.filter((emp) => {
      if (teamManagerFilter === 'unassigned') {
        if (emp.manager_id) return false;
      } else if (teamManagerFilter !== 'all') {
        if (emp.manager_id !== teamManagerFilter) return false;
      }
      if (teamSearchQuery.trim()) {
        const q = teamSearchQuery.toLowerCase();
        const mgrName = emp.manager_id ? (managerById.get(emp.manager_id)?.name || '').toLowerCase() : '';
        return (
          emp.fullName.toLowerCase().includes(q) ||
          emp.id.toLowerCase().includes(q) ||
          emp.department.toLowerCase().includes(q) ||
          emp.title.toLowerCase().includes(q) ||
          mgrName.includes(q)
        );
      }
      return true;
    });
  }, [employees, teamManagerFilter, teamSearchQuery, managerById]);

  const handleSingleManagerAssign = async (empId: string, nextManagerId: string | null) => {
    if (!canToggleShiftPermissions) {
      showFloatingToast('error', 'Yetkisiz İşlem (403): Ekip–Amir eşleştirme yetkisi yalnızca Süper Admin ve İK yöneticisine aittir.');
      return;
    }
    setAssigningSingleEmpId(empId);
    try {
      const res = await pdksStorage.assignEmployeeManagerAsync(empId, nextManagerId);
      if (res.success) {
        loadData();
        showFloatingToast('success', res.message || 'Birim amiri eşleştirmesi güncellendi.');
      } else {
        showFloatingToast('error', res.message || 'Eşleştirme güncellenemedi.');
      }
    } finally {
      setAssigningSingleEmpId(null);
    }
  };

  const handleBulkManagerAssign = async () => {
    if (!canToggleShiftPermissions) {
      showFloatingToast('error', 'Yetkisiz İşlem (403): Toplu ekip atama yetkisi yalnızca Süper Admin ve İK yöneticisine aittir.');
      return;
    }
    if (selectedTeamEmpIds.length === 0) {
      showFloatingToast('error', 'Lütfen önce en az bir personel seçiniz.');
      return;
    }
    setIsAssigningManager(true);
    try {
      const targetMgr = bulkTargetManagerId === '__UNASSIGN__' || !bulkTargetManagerId ? null : bulkTargetManagerId;
      const res = await pdksStorage.bulkAssignManagerAsync(selectedTeamEmpIds, targetMgr);
      if (res.success) {
        setSelectedTeamEmpIds([]);
        loadData();
        showFloatingToast('success', res.message || 'Toplu ekip ataması tamamlandı.');
      } else {
        showFloatingToast('error', res.message || 'Toplu atama gerçekleştirilemedi.');
      }
    } finally {
      setIsAssigningManager(false);
    }
  };

  // Quick Shift Lookup Map from employee_shifts table: `${employeeId}__${date}` -> EmployeeShiftAssignment
  const employeeShiftMap = useMemo(() => {
    const map = new Map<string, EmployeeShiftAssignment>();
    for (const item of employeeShifts) {
      if (item && item.employeeId && item.date) {
        map.set(`${item.employeeId}__${item.date}`, item);
      }
    }
    return map;
  }, [employeeShifts]);

  const getShiftToneClass = (shift?: Shift | null) => {
    if (!shift) return 'bg-slate-50 dark:bg-slate-800/70 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300';
    if (shift.isOffDay || shift.id === 'SHIFT-OFF' || shift.colorKey === 'off') {
      return 'bg-slate-100 dark:bg-slate-800/90 border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400';
    }
    if (shift.colorKey === 'night' || shift.id === 'SHIFT-GECE' || shift.startTime === '00:00') {
      return 'bg-indigo-50 dark:bg-indigo-950/50 border-indigo-200 dark:border-indigo-700/70 text-indigo-900 dark:text-indigo-200';
    }
    if (shift.colorKey === 'evening' || shift.id === 'SHIFT-AKSAM' || shift.startTime >= '15:00') {
      return 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-700/70 text-amber-900 dark:text-amber-200';
    }
    return 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-700/70 text-emerald-900 dark:text-emerald-200';
  };

  const hasActiveOffDayShift = useMemo(
    () => shifts.some((s) => Boolean(s.isOffDay || s.id === 'SHIFT-OFF' || s.colorKey === 'off')),
    [shifts]
  );

  const calendarSelectableShifts = useMemo<Shift[]>(() => {
    if (hasActiveOffDayShift) return shifts;
    return [
      ...shifts,
      {
        id: 'SHIFT-OFF',
        name: 'İzinli / Hafta Tatili',
        startTime: '00:00',
        endTime: '00:00',
        toleranceMinutes: 0,
        breakMinutes: 0,
        workDays: [],
        isOffDay: true,
        colorKey: 'off',
        is_active: true,
      },
    ];
  }, [shifts, hasActiveOffDayShift]);

  const getEffectiveShiftForCell = (emp: Employee, dateStr: string, dayName: string) => {
    const cellKey = `${emp.id}__${dateStr}`;
    const pending = pendingShiftChanges[cellKey];
    const savedOverride = employeeShiftMap.get(cellKey);
    const defaultShift =
      calendarSelectableShifts.find((s) => s.id === emp.shiftId) ||
      calendarSelectableShifts.find((s) => !s.isOffDay) ||
      calendarSelectableShifts[0];
    const offDayShift = calendarSelectableShifts.find(
      (s) => s.isOffDay || s.id === 'SHIFT-OFF' || s.colorKey === 'off'
    );
    const defaultIsWorkDay = defaultShift ? defaultShift.workDays.includes(dayName) : false;

    const effectiveShiftId = pending
      ? pending.shiftId
      : savedOverride
        ? savedOverride.shiftId
        : defaultIsWorkDay && defaultShift
          ? defaultShift.id
          : offDayShift?.id || 'SHIFT-OFF';

    const shiftObj =
      calendarSelectableShifts.find((s) => s.id === effectiveShiftId) ||
      offDayShift ||
      defaultShift;

    return {
      cellKey,
      shiftId: shiftObj?.id || effectiveShiftId,
      shift: shiftObj,
      isPending: Boolean(pending),
      isOverride: Boolean(savedOverride),
      assignment: savedOverride,
    };
  };

  const handleInlineShiftChange = async (emp: Employee, dateStr: string, nextShiftId: string) => {
    if (!pdksStorage.canUserManageShiftForEmployee(activeUser, emp.id)) {
      showFloatingToast(
        'error',
        'Yetkisiz İşlem (403): Bu personelin vardiyasını düzenleme yetkiniz bulunmamaktadır.'
      );
      return;
    }

    const cellKey = `${emp.id}__${dateStr}`;

    if (saveMode === 'bulk') {
      setPendingShiftChanges((prev) => ({
        ...prev,
        [cellKey]: { employeeId: emp.id, date: dateStr, shiftId: nextShiftId },
      }));
      return;
    }

    // Auto-Save Mode: persist immediately to backend API
    setSavingCellKey(cellKey);
    try {
      const result = await pdksStorage.saveEmployeeShiftAsync({
        employeeId: emp.id,
        date: dateStr,
        shiftId: nextShiftId,
      });
      if (result.success) {
        loadData();
        showFloatingToast('success', 'Vardiya güncellendi');
      } else {
        showFloatingToast('error', result.message || 'Vardiya güncellenemedi.');
      }
    } finally {
      setSavingCellKey(null);
    }
  };

  const handleApplyRowWeekShift = async (emp: Employee, nextShiftId: string) => {
    if (!nextShiftId) return;
    if (!pdksStorage.canUserManageShiftForEmployee(activeUser, emp.id)) {
      showFloatingToast('error', 'Yetkisiz İşlem (403): Bu personelin vardiyasını düzenleme yetkiniz yok.');
      return;
    }
    const weekdayDates = weekDays.slice(0, 5).map((d) => d.dateStr);
    if (saveMode === 'bulk') {
      setPendingShiftChanges((prev) => {
        const next = { ...prev };
        for (const dateStr of weekdayDates) {
          next[`${emp.id}__${dateStr}`] = { employeeId: emp.id, date: dateStr, shiftId: nextShiftId };
        }
        return next;
      });
      showFloatingToast('success', `${emp.fullName} için hafta içi 5 gün toplu kuyruğa eklendi.`);
      return;
    }

    setSavingCellKey(`ROW__${emp.id}`);
    try {
      const changes = weekdayDates.map((dateStr, idx) => ({
        employeeId: emp.id,
        date: dateStr,
        shiftId: nextShiftId,
        applyAsDefault: idx === 0,
      }));
      const result = await pdksStorage.saveEmployeeShiftsBulkAsync(changes);
      if (result.success) {
        loadData();
        showFloatingToast('success', 'Vardiya güncellendi');
      } else {
        showFloatingToast('error', result.message || 'Haftalık vardiya atanamadı.');
      }
    } finally {
      setSavingCellKey(null);
    }
  };

  const handleSaveBulkShifts = async () => {
    const entries = Object.values(pendingShiftChanges);
    if (entries.length === 0) return;
    setIsBulkSaving(true);
    try {
      const result = await pdksStorage.saveEmployeeShiftsBulkAsync(entries);
      if (result.success) {
        setPendingShiftChanges({});
        loadData();
        showFloatingToast('success', `Vardiya güncellendi (${result.updatedCount || entries.length} kayıt)`);
      } else {
        showFloatingToast('error', result.message || 'Toplu vardiya güncellemesi başarısız oldu.');
      }
    } finally {
      setIsBulkSaving(false);
    }
  };

  const handleToggleUserShiftPermission = async (acc: UserAccount) => {
    if (!canToggleShiftPermissions) {
      showFloatingToast(
        'error',
        'Yetkisiz İşlem (403): Vardiya yetkisini yalnızca Süper Admin veya İK yöneticisi değiştirebilir.'
      );
      return;
    }
    const currentEnabled = pdksStorage.hasShiftManagePermission({
      id: acc.id,
      username: acc.username,
      name: acc.name,
      role: acc.role,
      title: acc.title,
      department: acc.department,
      avatar: acc.avatar,
      employeeId: acc.employeeId,
      can_manage_shifts: acc.can_manage_shifts,
      isShiftSupervisor: acc.isShiftSupervisor,
      customPermissions: acc.customPermissions,
    });
    const nextEnabled = !currentEnabled;
    setTogglingPermAccountId(acc.id);
    try {
      const res = await pdksStorage.updateUserShiftPermissionAsync(acc.id, nextEnabled);
      if (res.success) {
        loadData();
        showFloatingToast('success', res.message || 'Vardiya yetkisi güncellendi.');
      } else {
        showFloatingToast('error', res.message || 'Yetki değiştirilemedi.');
      }
    } finally {
      setTogglingPermAccountId(null);
    }
  };

  const pendingChangesCount = Object.keys(pendingShiftChanges).length;

  const selectedDailyDayName = useMemo(() => {
    const d = new Date(`${selectedDailyDate}T12:00:00`);
    const names = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
    return Number.isNaN(d.getTime()) ? 'Pazartesi' : names[d.getDay()];
  }, [selectedDailyDate]);

  // Shift Modal & In-App Delete Confirmation State (iframe-safe, no window.confirm)
  const [isShiftModalOpen, setIsShiftModalOpen] = useState(false);
  const [isSavingShift, setIsSavingShift] = useState(false);
  const [shiftToDelete, setShiftToDelete] = useState<Shift | null>(null);
  const [isDeletingShift, setIsDeletingShift] = useState(false);
  const [shiftForm, setShiftForm] = useState<Partial<Shift>>({
    name: '',
    startTime: '08:30',
    endTime: '17:30',
    toleranceMinutes: 15,
    breakMinutes: 60,
    workDays: ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma'],
    isOffDay: false,
  });

  // Leave Modal & HR Leave Cancellation Modal (iframe-safe, no window.confirm)
  const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false);
  const [leaveToCancel, setLeaveToCancel] = useState<LeaveRequest | null>(null);
  const [cancelLeaveReason, setCancelLeaveReason] = useState<string>('');
  const [isCancellingLeave, setIsCancellingLeave] = useState<boolean>(false);
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
    setEmployeeShifts(pdksStorage.getEmployeeShifts());
    setUserAccounts(pdksStorage.getUserAccounts());
    setLeaves(pdksStorage.getLeaveRequests());
    setEmployees(pdksStorage.getEmployees());
    setRecords(pdksStorage.getAttendanceRecords());
    setOvertimes(pdksStorage.getOvertimeRequests());
    setSupervisorAssignments(pdksStorage.getSupervisorAssignments());
  };

  useEffect(() => {
    loadData();

    const handleLiveEvent = () => {
      loadData();
    };
    window.addEventListener('pdks-notification', handleLiveEvent);
    window.addEventListener('pdks-data-synced', handleLiveEvent);
    const tickTimer = setInterval(() => {
      setNowTick(Date.now());
    }, 15000);
    return () => {
      window.removeEventListener('pdks-notification', handleLiveEvent);
      window.removeEventListener('pdks-data-synced', handleLiveEvent);
      clearInterval(tickTimer);
    };
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

  // Live per-employee shift delay status (auto-ticks every 15s + updates on SSE/data sync)
  const liveDelayMap = useMemo(() => {
    const now = new Date(nowTick);
    const map = new Map<string, LiveShiftDelayInfo>();
    for (const emp of employees) {
      map.set(emp.id, calculateLiveShiftDelay(emp, now, shifts, employeeShifts, records, leaves));
    }
    return map;
  }, [employees, shifts, employeeShifts, records, leaves, nowTick]);

  const liveDelaySummary = useMemo(() => {
    let absentLate = 0;
    let lateCheckIn = 0;
    for (const emp of calendarEmployees) {
      const info = liveDelayMap.get(emp.id);
      if (info?.state === 'absent_late') absentLate++;
      else if (info?.state === 'late_checkin') lateCheckIn++;
    }
    return { absentLate, lateCheckIn, total: absentLate + lateCheckIn };
  }, [calendarEmployees, liveDelayMap]);

  // Calculate upcoming shifts for today in real-time
  const upcomingShifts: UpcomingShiftItem[] = useMemo(() => {
    const daysOfWeek = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
    const now = new Date(nowTick);
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
  }, [employees, shifts, nowTick]);

  const criticalShiftsCount = upcomingShifts.filter(
    (u) => u.timeStatus === 'critical_soon' || u.timeStatus === 'starting_soon'
  ).length;

  // Single employee mobile/in-app notification trigger
  const handleSendShiftNotification = (item: UpcomingShiftItem) => {
    pdksStorage.addNotification({
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
    a.download = `PDKS_Vardiyalar_${new Date().toISOString().split('T')[0]}.csv`;
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
    a.download = `PDKS_Izin_Talepleri_${new Date().toISOString().split('T')[0]}.csv`;
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
    a.download = `PDKS_Personel_Vardiya_Cizelgesi_${new Date().toISOString().split('T')[0]}.csv`;
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

  // Delete Shift (İK / Super Admin / Silme Yetkili) — opens in-app confirmation modal
  const handleDeleteShift = (id: string, name: string) => {
    if (!isHRManager && !canDelete) {
      setPermissionNotice('Yetkisiz İşlem: Vardiya silme yetkiniz bulunmamaktadır.');
      setTimeout(() => setPermissionNotice(null), 4000);
      return;
    }
    const target = shifts.find((s) => s.id === id) || {
      id,
      name,
      startTime: '08:00',
      endTime: '17:00',
      toleranceMinutes: 15,
      breakMinutes: 60,
      workDays: [],
    };
    setShiftToDelete(target);
  };

  const confirmDeleteShift = async () => {
    if (!shiftToDelete) return;
    setIsDeletingShift(true);
    try {
      const res = await pdksStorage.deleteShiftAsync(shiftToDelete.id);
      if (res.success) {
        setShiftToDelete(null);
        loadData();
        showFloatingToast('success', res.message || 'Vardiya tanımı kaldırıldı.');
      } else {
        showFloatingToast('error', res.message || 'Vardiya silinemedi.');
      }
    } finally {
      setIsDeletingShift(false);
    }
  };

  // Shift template definitions intentionally allow overlapping hours across templates
  // (e.g. 08:00-17:00 alongside 09:00-18:00 or 22:00-06:00 overnight shifts).

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
    if (!canApprove) {
      setPermissionNotice('Yetkisiz İşlem: Fazla mesai onaylama yetkiniz bulunmamaktadır.');
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
    if (!canApprove) {
      setPermissionNotice('Yetkisiz İşlem: Fazla mesai reddetme yetkiniz bulunmamaktadır.');
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
      showFloatingToast('error', 'Lütfen bu Birim Amirinin sorumlu olacağı en az 1 personel seçiniz.');
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

  // Save Shift (Only ik_yoneticisi / Super Admin — NO overlap restriction, supports overnight shifts)
  const handleSaveShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isHRManager) {
      setPermissionNotice('Yetkisiz İşlem: Yeni vardiya ekleme yetkisi yalnızca İK Yöneticisine aittir.');
      setTimeout(() => setPermissionNotice(null), 4000);
      return;
    }
    const cleanName = (shiftForm.name || '').trim();
    if (!cleanName) {
      showFloatingToast('error', 'Lütfen vardiya adı giriniz.');
      return;
    }

    const isOffDay = Boolean(shiftForm.isOffDay);
    const startTime = isOffDay ? '00:00' : (shiftForm.startTime || '08:30').trim();
    const endTime = isOffDay ? '00:00' : (shiftForm.endTime || '17:30').trim();
    const selectedDays = isOffDay
      ? []
      : shiftForm.workDays && shiftForm.workDays.length > 0
        ? shiftForm.workDays
        : ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma'];

    const shiftId =
      typeof shiftForm.id === 'string' && shiftForm.id.trim()
        ? shiftForm.id.trim()
        : isOffDay && !hasActiveOffDayShift
          ? 'SHIFT-OFF'
          : isOffDay
            ? `SHIFT-OFF-${Date.now().toString().slice(-5)}`
            : `SHIFT-${Date.now().toString().slice(-6)}`;

    const newShift: Shift = {
      id: shiftId,
      name: cleanName,
      startTime,
      endTime,
      toleranceMinutes: isOffDay ? 0 : Math.max(0, Number(shiftForm.toleranceMinutes) || 0),
      breakMinutes: isOffDay ? 0 : Math.max(0, Number(shiftForm.breakMinutes) || 0),
      workDays: selectedDays,
      isOffDay,
      colorKey: isOffDay ? 'off' : 'custom',
      is_active: true,
    };

    setIsSavingShift(true);
    try {
      const res = await pdksStorage.saveShiftAsync(newShift);
      if (res.success) {
        setIsShiftModalOpen(false);
        loadData();
        showFloatingToast('success', res.message || 'Yeni vardiya planı başarıyla kaydedildi.');
      } else {
        showFloatingToast('error', res.message || 'Vardiya kaydedilemedi.');
      }
    } finally {
      setIsSavingShift(false);
    }
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

  const handleOpenCancelLeaveModal = (leave: LeaveRequest) => {
    if (!canCancelLeave) {
      showFloatingToast('error', '403 Forbidden: Yıllık izin iptal yetkisi sadece İK birimindedir');
      return;
    }
    setLeaveToCancel(leave);
    setCancelLeaveReason('');
  };

  const handleConfirmCancelLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!leaveToCancel) return;
    if (!canCancelLeave) {
      showFloatingToast('error', '403 Forbidden: Yıllık izin iptal yetkisi sadece İK birimindedir');
      return;
    }
    const cleanedReason = cancelLeaveReason.trim();
    if (!cleanedReason) {
      showFloatingToast('error', 'Lütfen iptal nedenini belirtiniz.');
      return;
    }

    setIsCancellingLeave(true);
    try {
      const res = await pdksStorage.cancelLeaveRequestAsync(leaveToCancel.id, cleanedReason);
      if (res.success) {
        setLeaveToCancel(null);
        setCancelLeaveReason('');
        loadData();
        showFloatingToast('success', res.message);
      } else {
        showFloatingToast('error', res.message || 'İzin talebi iptal edilemedi.');
      }
    } finally {
      setIsCancellingLeave(false);
    }
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
    <div className="w-full max-w-7xl mx-auto min-w-0 px-3 sm:px-6 lg:px-8 py-4 sm:py-8 space-y-5 sm:space-y-8">
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

        {/* Export Toolbar (PDF & CSV Download) */}
        <div className="flex items-center gap-2.5 self-start md:self-auto flex-wrap">
          {canExport && (
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
                    Rapor Dışa Aktarımı
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
          )}

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

      {/* Salt Okunur Görüntüleme Bilgi Panosu (Yetkisiz Kullanıcılar İçin) */}
      {isReadOnlyShiftViewer && (
        <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start sm:items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-slate-200/80 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center shrink-0">
              <Eye className="w-4.5 h-4.5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                  Salt Okunur Vardiya Görüntüleme Modu
                </h3>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-slate-200/80 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                  can_manage_shifts: Pasif
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 leading-relaxed">
                Vardiya düzenleme yetkiniz aktif değildir. Haftalık ve günlük çalışma çizelgelerini görüntüleyebilir, ancak vardiya değişikliği yapamazsınız.
              </p>
            </div>
          </div>
          <div className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 shrink-0">
            <Lock className="w-3.5 h-3.5" />
            <span>Düzenleme Kilitli</span>
          </div>
        </div>
      )}

      {/* Birim Amiri Sorumluluk & Yetki Bilgi Panosu (Kendi Birimine Kısıtlı) */}
      {isUnitManagerOnly && (
        <div className="bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-600 text-white flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-bold text-sm text-amber-950 dark:text-amber-100">
                  Birim Yöneticisi Vardiya Yetkisi — {managedDepartment || 'Birim Tanımsız'}
                </h3>
                <span className="text-[11px] font-mono font-semibold text-amber-800 dark:text-amber-300">
                  can_manage_shifts: Aktif
                </span>
              </div>
              <p className="text-xs text-amber-900/90 dark:text-amber-200/80 mt-0.5 leading-relaxed">
                Hoş geldiniz <strong>{activeUser.name}</strong>. Yalnızca kendi biriminize (<strong>{managedDepartment || '—'}</strong>) bağlı <strong>{calendarEmployees.length} personelin</strong> vardiyalarını tablodaki açılır listelerden anlık veya toplu olarak güncelleyebilirsiniz.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
            <button
              onClick={() => {
                setAssignForm({
                  employeeId: calendarEmployees[0]?.id || '',
                  shiftId: shifts[0]?.id || '',
                });
                setIsAssignShiftModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
            >
              <UserCheck className="w-4 h-4" />
              <span>Birimime Vardiya Ata</span>
            </button>
          </div>
        </div>
      )}

      {/* Fixed Floating Toast Notification ("Vardiya güncellendi" / Error) */}
      {floatingToast && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed bottom-5 right-5 z-50 max-w-md px-4 py-3 rounded-xl border shadow-lg text-xs font-semibold flex items-center gap-2.5 animate-fade-in ${
            floatingToast.type === 'success'
              ? 'bg-emerald-600 text-white border-emerald-500'
              : 'bg-rose-600 text-white border-rose-500'
          }`}
        >
          {floatingToast.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <ShieldAlert className="w-4 h-4 shrink-0" />
          )}
          <span className="leading-snug">{floatingToast.message}</span>
          <button
            type="button"
            onClick={() => setFloatingToast(null)}
            className="ml-2 text-white/80 hover:text-white cursor-pointer"
            aria-label="Kapat"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Inline Notification Toast */}
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

      {/* VIEW SWITCHER TABS — 2 Satırlı Kaydırmasız Tam Sığan Düzen */}
      <div className="w-full overflow-x-hidden border-b border-slate-200 dark:border-slate-800 pb-3 space-y-2">
        {/* 1. Satır: Ana 4 Sekme */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
          <button
            type="button"
            onClick={() => setActiveViewTab('calendar')}
            className={`w-full min-w-0 flex items-center justify-between gap-1.5 px-3 py-2 rounded-xl font-bold transition-all cursor-pointer border ${
              activeViewTab === 'calendar'
                ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 border-slate-200 dark:border-slate-700'
            }`}
            title="Haftalık Vardiya Takvimi (Etkileşimli)"
          >
            <span className="inline-flex items-center gap-1.5 min-w-0">
              <CalendarDays className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Haftalık Vardiya Takvimi</span>
            </span>
            <span
              className={`px-1.5 py-0.5 rounded-md text-[10px] font-semibold shrink-0 ${
                activeViewTab === 'calendar'
                  ? 'bg-indigo-500 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
              }`}
            >
              Etkileşimli
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveViewTab('shifts')}
            className={`w-full min-w-0 flex items-center justify-between gap-1.5 px-3 py-2 rounded-xl font-bold transition-all cursor-pointer border tabular-nums ${
              activeViewTab === 'shifts'
                ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 border-slate-200 dark:border-slate-700'
            }`}
            title={`Vardiya Tanımları (${shifts.length})`}
          >
            <span className="inline-flex items-center gap-1.5 min-w-0">
              <Clock className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Vardiya Tanımları</span>
            </span>
            <span
              className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono font-bold shrink-0 ${
                activeViewTab === 'shifts'
                  ? 'bg-indigo-500 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
              }`}
            >
              {shifts.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveViewTab('supervisors')}
            className={`w-full min-w-0 flex items-center justify-between gap-1.5 px-3 py-2 rounded-xl font-bold transition-all cursor-pointer border tabular-nums ${
              activeViewTab === 'supervisors'
                ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 border-slate-200 dark:border-slate-700'
            }`}
            title={`Birim Amirleri & Yetkiler (${supervisorAssignments.length})`}
          >
            <span className="inline-flex items-center gap-1.5 min-w-0">
              <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">
                Birim Amirleri & Yetkiler ({supervisorAssignments.length})
              </span>
            </span>
            {isHRManager && (
              <span
                className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold shrink-0 ${
                  activeViewTab === 'supervisors'
                    ? 'bg-indigo-500 text-white'
                    : 'bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300'
                }`}
              >
                İK Yönetimi
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveViewTab('leaves')}
            className={`w-full min-w-0 flex items-center justify-between gap-1.5 px-3 py-2 rounded-xl font-bold transition-all cursor-pointer border tabular-nums ${
              activeViewTab === 'leaves'
                ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 border-slate-200 dark:border-slate-700'
            }`}
            title={`İzin Talepleri (${leaves.length})`}
          >
            <span className="inline-flex items-center gap-1.5 min-w-0">
              <CalendarCheck className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">İzin Talepleri</span>
            </span>
            <span
              className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono font-bold shrink-0 ${
                activeViewTab === 'leaves'
                  ? 'bg-indigo-500 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
              }`}
            >
              {leaves.length}
            </span>
          </button>
        </div>

        {/* 2. Satır: Fazla Mesai, Tümünü Göster ve Hızlı Vardiya Atama */}
        <div
          className={`grid grid-cols-1 gap-2 text-xs ${
            isHRManager || isSupervisor ? 'sm:grid-cols-3' : 'sm:grid-cols-2'
          }`}
        >
          <button
            type="button"
            onClick={() => setActiveViewTab('overtime')}
            className={`w-full min-w-0 flex items-center justify-between gap-1.5 px-3 py-2 rounded-xl font-bold transition-all cursor-pointer border tabular-nums ${
              activeViewTab === 'overtime'
                ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 border-slate-200 dark:border-slate-700'
            }`}
            title={`Fazla Mesai Talepleri (${overtimes.length})`}
          >
            <span className="inline-flex items-center gap-1.5 min-w-0">
              <Timer className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Fazla Mesai Talepleri ({overtimes.length})</span>
            </span>
            {overtimes.filter((o) => o.status === 'pending').length > 0 && (
              <span className="px-1.5 py-0.5 rounded-md bg-rose-500 text-white text-[10px] font-bold shrink-0">
                {overtimes.filter((o) => o.status === 'pending').length} bekleyen
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveViewTab('all')}
            className={`w-full min-w-0 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl font-semibold transition-all cursor-pointer border ${
              activeViewTab === 'all'
                ? 'bg-slate-900 dark:bg-indigo-600 text-white border-slate-900 dark:border-indigo-600 shadow-xs'
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 border-slate-200 dark:border-slate-700'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Tümünü Göster</span>
          </button>

          {(isHRManager || isSupervisor) && (
            <button
              type="button"
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
              className="w-full min-w-0 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-indigo-700 dark:text-indigo-200 bg-indigo-50 dark:bg-indigo-950/50 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 border border-indigo-200 dark:border-indigo-800 transition-colors cursor-pointer"
              title="Personellere vardiya atarken iki farklı vardiyanın çakışmasını otomatik denetleyin"
            >
              <UserCheck className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
              <span className="truncate">Vardiya Ata & Çakışma Denetimi</span>
            </button>
          )}
        </div>
      </div>

      {/* ETKİLEŞİMLİ HAFTALIK VARDİYA TAKVİMİ & HIZLI VARDİYA ATAMA ARAYÜZÜ */}
      {(activeViewTab === 'calendar' || activeViewTab === 'all') && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 sm:p-5 space-y-4">
            {/* Top Toolbar: View Switcher + Save Mode + Bulk Save Actions */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2 flex-wrap">
                {/* Weekly vs Daily Quick List Switcher */}
                <div className="inline-flex items-center rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 p-0.5">
                  <button
                    type="button"
                    onClick={() => setCalendarViewMode('weekly')}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                      calendarViewMode === 'weekly'
                        ? 'bg-white dark:bg-slate-700 text-indigo-700 dark:text-indigo-200 shadow-2xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                    <span>Haftalık Takvim</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCalendarViewMode('daily')}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                      calendarViewMode === 'daily'
                        ? 'bg-white dark:bg-slate-700 text-indigo-700 dark:text-indigo-200 shadow-2xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    <List className="w-3.5 h-3.5" />
                    <span>Günlük Hızlı Liste</span>
                  </button>
                </div>

                {/* Date / Week Navigation */}
                {calendarViewMode === 'weekly' ? (
                  <div className="flex items-center gap-2">
                    <div className="inline-flex items-center rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 p-0.5">
                      <button
                        type="button"
                        onClick={() => setCurrentWeekOffset((prev) => prev - 1)}
                        className="p-1.5 hover:bg-white dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-md transition-colors cursor-pointer"
                        title="Önceki Hafta"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setCurrentWeekOffset(0)}
                        className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                          currentWeekOffset === 0
                            ? 'bg-indigo-600 text-white'
                            : 'text-slate-700 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700'
                        }`}
                      >
                        Bu Hafta
                      </button>
                      <button
                        type="button"
                        onClick={() => setCurrentWeekOffset((prev) => prev + 1)}
                        className="p-1.5 hover:bg-white dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-md transition-colors cursor-pointer"
                        title="Sonraki Hafta"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="font-semibold text-xs sm:text-sm text-slate-900 dark:text-slate-100 flex items-center gap-1.5 tabular-nums">
                      <Calendar className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                      <span>{weekLabel}</span>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        const d = new Date(`${selectedDailyDate}T12:00:00`);
                        d.setDate(d.getDate() - 1);
                        setSelectedDailyDate(d.toISOString().split('T')[0]);
                      }}
                      className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-white dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 cursor-pointer"
                      title="Önceki Gün"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <input
                      type="date"
                      value={selectedDailyDate}
                      onChange={(e) => e.target.value && setSelectedDailyDate(e.target.value)}
                      className="px-2.5 py-1.5 text-xs font-mono font-semibold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 tabular-nums"
                    />
                    <button
                      type="button"
                      onClick={() => setSelectedDailyDate(new Date().toISOString().split('T')[0])}
                      className="px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-white dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 cursor-pointer"
                    >
                      Bugün
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const d = new Date(`${selectedDailyDate}T12:00:00`);
                        d.setDate(d.getDate() + 1);
                        setSelectedDailyDate(d.toISOString().split('T')[0]);
                      }}
                      className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-white dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 cursor-pointer"
                      title="Sonraki Gün"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                    <span className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 ml-1">
                      {selectedDailyDayName}
                    </span>
                  </div>
                )}
              </div>

              {/* Right Side: Save Mode Toggle & Bulk Save CTA (Only for authorized managers) */}
              {canManageShifts ? (
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="inline-flex items-center rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 p-0.5 text-[11px]">
                    <button
                      type="button"
                      onClick={() => {
                        if (pendingChangesCount > 0) {
                          setPendingShiftChanges({});
                        }
                        setSaveMode('auto');
                      }}
                      className={`px-2.5 py-1 font-semibold rounded-md transition-colors cursor-pointer ${
                        saveMode === 'auto'
                          ? 'bg-emerald-600 text-white'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                      }`}
                      title="Dropdown seçildiğinde anında veritabanına kaydeder"
                    >
                      Otomatik Kayıt
                    </button>
                    <button
                      type="button"
                      onClick={() => setSaveMode('bulk')}
                      className={`px-2.5 py-1 font-semibold rounded-md transition-colors cursor-pointer ${
                        saveMode === 'bulk'
                          ? 'bg-indigo-600 text-white'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                      }`}
                      title="Birden fazla hücreyi düzenleyip tek seferde kaydedin"
                    >
                      Toplu Düzenle
                    </button>
                  </div>

                  {saveMode === 'bulk' && (
                    <div className="flex items-center gap-1.5">
                      {pendingChangesCount > 0 && (
                        <button
                          type="button"
                          onClick={() => setPendingShiftChanges({})}
                          disabled={isBulkSaving}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>İptal</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={handleSaveBulkShifts}
                        disabled={pendingChangesCount === 0 || isBulkSaving}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors tabular-nums ${
                          pendingChangesCount > 0
                            ? 'bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed'
                        }`}
                      >
                        {isBulkSaving ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Save className="w-3.5 h-3.5" />
                        )}
                        <span>
                          Değişiklikleri Kaydet{pendingChangesCount > 0 ? ` (${pendingChangesCount})` : ''}
                        </span>
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                  <Eye className="w-3.5 h-3.5" />
                  <span>Salt Okunur Görünüm</span>
                </div>
              )}
            </div>

            {/* Filter Bar: Search, Department (HR only; Unit Managers locked to own dept) & Quick Legend */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative w-full sm:w-52">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Personel adı veya sicil ara..."
                    value={calendarSearch}
                    onChange={(e) => setCalendarSearch(e.target.value)}
                    className="w-full pl-8 pr-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:bg-white dark:focus:bg-slate-900 focus:outline-indigo-500 text-slate-800 dark:text-slate-100"
                  />
                </div>

                {isUnitManagerOnly ? (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 border border-amber-200 dark:border-amber-800 rounded-lg tabular-nums">
                    <Lock className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                    <span>Ekibim: {responsibleEmpIds.length} Personel (İK Atamalı)</span>
                  </div>
                ) : (
                  <>
                    <select
                      value={calendarDeptFilter}
                      onChange={(e) => setCalendarDeptFilter(e.target.value)}
                      className="px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-200 focus:bg-white dark:focus:bg-slate-900 cursor-pointer"
                    >
                      <option value="all">Tüm Departmanlar</option>
                      <option value="Yazılım & Ar-Ge">Yazılım & Ar-Ge</option>
                      <option value="İnsan Kaynakları">İnsan Kaynakları</option>
                      <option value="Muhasebe & Finans">Muhasebe & Finans</option>
                      <option value="Pazarlama & Satış">Pazarlama & Satış</option>
                      <option value="Üretim & Operasyon">Üretim & Operasyon</option>
                      <option value="Lojistik & Depo">Lojistik & Depo</option>
                    </select>

                    {isHRManager && (
                      <select
                        value={supervisorFilter}
                        onChange={(e) => setSupervisorFilter(e.target.value)}
                        aria-label="Birim Amiri Filtresi"
                        className="px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-200 focus:bg-white dark:focus:bg-slate-900 cursor-pointer"
                      >
                        <option value="all">Tüm Birim Amirleri</option>
                        <option value="unassigned">
                          Amir Atanmamış ({employees.filter((e) => !e.manager_id).length})
                        </option>
                        {managerAccounts.map((mgr) => {
                          const teamCount = employees.filter((e) => e.manager_id === mgr.id).length;
                          return (
                            <option key={mgr.id} value={mgr.id}>
                              Amir: {mgr.name} ({teamCount})
                            </option>
                          );
                        })}
                      </select>
                    )}
                  </>
                )}

                {canToggleShiftPermissions && (
                  <button
                    type="button"
                    onClick={() => setActiveViewTab('supervisors')}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 dark:bg-indigo-950/50 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-200 border border-indigo-200 dark:border-indigo-700 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Ekip & Yetki Yönetimi</span>
                  </button>
                )}
              </div>

              {/* Compact Shift Color Legend + Live Delay Status */}
              <div className="flex items-center gap-3 text-[11px] text-slate-600 dark:text-slate-400 flex-wrap">
                {liveDelaySummary.total > 0 && (
                  <span
                    className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 font-semibold tabular-nums"
                    title="Vardiya başlangıç saati geçtiği halde giriş yapmayan veya geç giriş yapan personeller"
                  >
                    <Timer className="w-3 h-3 shrink-0" />
                    <span>
                      Canlı Gecikme: {liveDelaySummary.total}
                      {liveDelaySummary.absentLate > 0 ? ` (${liveDelaySummary.absentLate} gelmedi)` : ''}
                    </span>
                  </span>
                )}
                <span className="inline-flex items-center gap-1">
                  <span className="w-2 h-2 rounded-xs bg-emerald-500" />
                  Sabah
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-2 h-2 rounded-xs bg-amber-500" />
                  Akşam
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-2 h-2 rounded-xs bg-indigo-500" />
                  Gece
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-2 h-2 rounded-xs bg-slate-400" />
                  OFF / İzin
                </span>
              </div>
            </div>

            {calendarViewMode === 'weekly' ? (
              <>
                {/* Weekly Interactive Quick-Dropdown Grid Table (No-Scroll Full-Fit 100%) */}
                <div className="w-full overflow-x-hidden rounded-xl border border-slate-200 dark:border-slate-800">
                  <table className="w-full table-fixed border-collapse text-left text-xs">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200">
                        <th className="w-[23%] py-2 px-2 font-semibold text-[11px] border-r border-slate-200 dark:border-slate-700">
                          Personel ({calendarEmployees.length})
                        </th>
                        {weekDays.map((day) => (
                          <th
                            key={day.dateStr}
                            className={`w-[11%] py-1.5 px-1 text-center border-r border-slate-200 dark:border-slate-700 last:border-r-0 ${
                              day.isToday
                                ? 'bg-indigo-50/80 dark:bg-indigo-950/50 border-b-2 border-b-indigo-600'
                                : ''
                            }`}
                          >
                            <div className="flex items-center justify-center gap-1 leading-none">
                              <span className="font-bold text-[11px] text-slate-900 dark:text-slate-100">
                                {day.shortDayName}
                              </span>
                              {day.isToday && (
                                <span
                                  className="w-1.5 h-1.5 rounded-full bg-indigo-600 dark:bg-indigo-400 shrink-0"
                                  title="Bugün"
                                />
                              )}
                            </div>
                            <div className="text-[9.5px] text-slate-500 dark:text-slate-400 font-mono tabular-nums mt-0.5 truncate">
                              {day.formattedDate}
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
                      {calendarEmployees.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="py-10 text-center text-slate-500 dark:text-slate-400 text-xs">
                            {isUnitManagerOnly && responsibleEmpIds.length === 0
                              ? 'İK tarafından ekibinize henüz personel atanmamıştır. Vardiya düzenleyebilmek için İK yöneticisinin personel eşleştirmesi yapması gerekir.'
                              : 'Arama veya filtre kriterlerinize uygun personel bulunamadı.'}
                          </td>
                        </tr>
                      ) : (
                        calendarEmployees.map((emp) => {
                          const canEditRow = pdksStorage.canUserManageShiftForEmployee(activeUser, emp.id);
                          const isRowSaving = savingCellKey === `ROW__${emp.id}`;
                          const assignedMgr = emp.manager_id ? managerById.get(emp.manager_id) : undefined;
                          const delayInfo = liveDelayMap.get(emp.id);

                          return (
                            <tr
                              key={emp.id}
                              className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors"
                            >
                              {/* Compact Employee Identity + Live Delay Badge + Quick Week Apply */}
                              <td className="py-2 px-2 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 align-top">
                                <div className="flex items-start gap-1.5 min-w-0">
                                  <img
                                    src={emp.avatar}
                                    alt={emp.fullName}
                                    className="w-7 h-7 rounded-md object-cover border border-slate-200 dark:border-slate-700 shrink-0 mt-0.5 hidden sm:block"
                                  />
                                  <div className="min-w-0 flex-1 space-y-0.5">
                                    <div
                                      className="font-semibold text-[11.5px] text-slate-900 dark:text-slate-100 truncate leading-tight"
                                      title={`${emp.fullName} (${emp.id})`}
                                    >
                                      {emp.fullName}
                                    </div>
                                    <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate leading-tight">
                                      {emp.department}
                                      {isHRManager && assignedMgr ? ` · ${assignedMgr.name.split(' ')[0]}` : ''}
                                    </div>

                                    {delayInfo?.isDelayed && (
                                      <div
                                        className={`inline-flex items-center gap-1 max-w-full px-1.5 py-0.5 rounded text-[9.5px] font-bold leading-tight tabular-nums truncate ${
                                          delayInfo.severity === 'critical'
                                            ? 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                                            : 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                                        }`}
                                        title={`Bugünkü vardiya: ${delayInfo.resolvedShift?.startTime || '--:--'}–${delayInfo.resolvedShift?.endTime || '--:--'} · ${delayInfo.badgeText}`}
                                      >
                                        <AlertTriangle className="w-2.5 h-2.5 shrink-0" />
                                        <span className="truncate">{delayInfo.badgeText}</span>
                                      </div>
                                    )}

                                    {canEditRow && (
                                      <div className="pt-0.5 flex items-center gap-1">
                                        <select
                                          aria-label={`${emp.fullName} hafta içi hızlı vardiya ata`}
                                          value=""
                                          disabled={isRowSaving}
                                          onChange={(e) => {
                                            if (e.target.value) {
                                              void handleApplyRowWeekShift(emp, e.target.value);
                                            }
                                          }}
                                          className="w-full min-w-0 px-1 py-0.5 text-[9.5px] font-medium bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-slate-600 dark:text-slate-300 cursor-pointer focus:outline-indigo-500 truncate"
                                        >
                                          <option value="">Pzt–Cum hızlı ata...</option>
                                          {calendarSelectableShifts.map((s) => (
                                            <option key={s.id} value={s.id}>
                                              {getCompactShiftLabel(s)} ({s.isOffDay ? 'OFF' : `${s.startTime}–${s.endTime}`})
                                            </option>
                                          ))}
                                        </select>
                                        {isRowSaving && (
                                          <Loader2 className="w-2.5 h-2.5 animate-spin text-indigo-600 shrink-0" />
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </td>

                              {/* 7 Day Cells — Compact No-Scroll Fit */}
                              {weekDays.map((day) => {
                                const leave = leaves.find(
                                  (l) =>
                                    l.employeeId === emp.id &&
                                    l.status === 'approved' &&
                                    l.startDate <= day.dateStr &&
                                    l.endDate >= day.dateStr
                                );

                                const resolved = getEffectiveShiftForCell(emp, day.dateStr, day.dayName);
                                const isCellSaving = savingCellKey === resolved.cellKey;
                                const toneClass = getShiftToneClass(resolved.shift);
                                const isTodayDelayed = day.isToday && delayInfo?.isDelayed;

                                return (
                                  <td
                                    key={day.dateStr}
                                    className={`py-1.5 px-1 border-r border-slate-100 dark:border-slate-800 last:border-r-0 align-middle ${
                                      isTodayDelayed
                                        ? delayInfo?.severity === 'critical'
                                          ? 'bg-rose-50/40 dark:bg-rose-950/20'
                                          : 'bg-amber-50/40 dark:bg-amber-950/20'
                                        : day.isToday
                                        ? 'bg-indigo-50/25 dark:bg-indigo-950/20'
                                        : ''
                                    }`}
                                  >
                                    {leave ? (
                                      <div
                                        className="px-1 py-1.5 rounded-md bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 text-purple-900 dark:text-purple-200 text-center"
                                        title={`Onaylı İzin: ${leave.leaveType}`}
                                      >
                                        <div className="text-[10px] font-bold truncate">İzinli</div>
                                        <div className="text-[8.5px] text-purple-700 dark:text-purple-300 truncate">
                                          {leave.leaveType.split(' ')[0]}
                                        </div>
                                      </div>
                                    ) : canEditRow ? (
                                      <div className="space-y-0.5 min-w-0">
                                        <select
                                          aria-label={`${emp.fullName} ${day.dayName} vardiyası`}
                                          value={resolved.shiftId}
                                          disabled={isCellSaving || isBulkSaving}
                                          title={
                                            resolved.shift
                                              ? `${resolved.shift.name} (${resolved.shift.isOffDay ? 'OFF' : `${resolved.shift.startTime}–${resolved.shift.endTime}`})`
                                              : 'Vardiya seç'
                                          }
                                          onChange={(e) =>
                                            void handleInlineShiftChange(emp, day.dateStr, e.target.value)
                                          }
                                          className={`w-full min-w-0 px-1 py-1 text-[10px] font-semibold rounded-md border transition-colors cursor-pointer focus:outline-none focus:ring-1 focus:ring-indigo-500 truncate ${toneClass} ${
                                            resolved.isPending
                                              ? 'ring-1 ring-indigo-500 border-indigo-500'
                                              : ''
                                          }`}
                                        >
                                          {calendarSelectableShifts.map((s) => (
                                            <option
                                              key={s.id}
                                              value={s.id}
                                              className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                                            >
                                              {getCompactShiftLabel(s)}
                                            </option>
                                          ))}
                                        </select>
                                        <div className="flex items-center justify-between gap-0.5 px-0.5 text-[8.5px] text-slate-500 dark:text-slate-400 font-mono tabular-nums leading-none">
                                          <span className="truncate">
                                            {resolved.shift?.isOffDay
                                              ? 'OFF'
                                              : `${resolved.shift?.startTime || '--:--'}–${resolved.shift?.endTime || '--:--'}`}
                                          </span>
                                          {isCellSaving ? (
                                            <Loader2 className="w-2.5 h-2.5 animate-spin text-indigo-600 shrink-0" />
                                          ) : resolved.isPending ? (
                                            <span
                                              className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0"
                                              title="Kaydedilmeyi bekliyor"
                                            />
                                          ) : resolved.isOverride ? (
                                            <span
                                              className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"
                                              title={`Özel Atama · ${resolved.assignment?.updatedBy || 'Yönetici'}`}
                                            />
                                          ) : null}
                                        </div>
                                      </div>
                                    ) : (
                                      <div
                                        className={`px-1 py-1.5 rounded-md border text-center min-w-0 ${toneClass}`}
                                        title={
                                          resolved.shift
                                            ? `${resolved.shift.name} (${resolved.shift.isOffDay ? 'OFF' : `${resolved.shift.startTime}–${resolved.shift.endTime}`})`
                                            : 'Salt okunur vardiya'
                                        }
                                      >
                                        {resolved.shift?.isOffDay ? (
                                          <div className="text-[10px] font-semibold truncate">OFF</div>
                                        ) : (
                                          <>
                                            <div className="font-mono font-bold text-[9.5px] tabular-nums leading-tight truncate">
                                              {resolved.shift?.startTime}–{resolved.shift?.endTime}
                                            </div>
                                            <div className="text-[9px] truncate opacity-85">
                                              {getCompactShiftLabel(resolved.shift)}
                                            </div>
                                          </>
                                        )}
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
                    <tfoot className="bg-slate-50 dark:bg-slate-800/90 font-semibold text-xs border-t border-slate-200 dark:border-slate-700">
                      <tr>
                        <td className="py-2 px-2 bg-slate-50 dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 text-[11px] text-slate-700 dark:text-slate-200 truncate">
                          Günlük Kapasite
                        </td>
                        {weekDays.map((day) => {
                          let workingCount = 0;
                          let offOrLeaveCount = 0;
                          calendarEmployees.forEach((emp) => {
                            const leave = leaves.find(
                              (l) =>
                                l.employeeId === emp.id &&
                                l.status === 'approved' &&
                                l.startDate <= day.dateStr &&
                                l.endDate >= day.dateStr
                            );
                            if (leave) {
                              offOrLeaveCount++;
                            } else {
                              const resolved = getEffectiveShiftForCell(emp, day.dateStr, day.dayName);
                              if (resolved.shift && !resolved.shift.isOffDay) {
                                workingCount++;
                              } else {
                                offOrLeaveCount++;
                              }
                            }
                          });

                          return (
                            <td
                              key={day.dateStr}
                              className="py-1.5 px-1 text-center border-r border-slate-200 dark:border-slate-700 last:border-r-0 tabular-nums"
                            >
                              <div className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 truncate">
                                {workingCount} Aktif
                              </div>
                              {offOrLeaveCount > 0 && (
                                <div className="text-[9px] text-slate-500 dark:text-slate-400 truncate">
                                  {offOrLeaveCount} OFF
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </>
            ) : (
              /* DAILY QUICK LIST VIEW (No-Scroll Full-Fit + Live Delay Status) */
              <div className="w-full overflow-x-hidden rounded-xl border border-slate-200 dark:border-slate-800">
                <table className="w-full table-fixed text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200">
                      <th className="w-[30%] py-2 px-3 font-semibold">Personel</th>
                      <th className="w-[20%] py-2 px-3 font-semibold">Birim / Canlı Durum</th>
                      <th className="w-[32%] py-2 px-3 font-semibold truncate">
                        Vardiya ({selectedDailyDate} · {selectedDailyDayName})
                      </th>
                      <th className="w-[18%] py-2 px-3 font-semibold text-right">Kayıt</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
                    {calendarEmployees.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-10 text-center text-slate-500 dark:text-slate-400">
                          {isUnitManagerOnly && responsibleEmpIds.length === 0
                            ? 'İK tarafından ekibinize henüz personel atanmamıştır.'
                            : 'Filtre kriterlerinize uygun personel bulunamadı.'}
                        </td>
                      </tr>
                    ) : (
                      calendarEmployees.map((emp) => {
                        const canEditRow = pdksStorage.canUserManageShiftForEmployee(activeUser, emp.id);
                        const assignedMgr = emp.manager_id ? managerById.get(emp.manager_id) : undefined;
                        const delayInfo = selectedDailyDate === todayLocalStr ? liveDelayMap.get(emp.id) : undefined;
                        const leave = leaves.find(
                          (l) =>
                            l.employeeId === emp.id &&
                            l.status === 'approved' &&
                            l.startDate <= selectedDailyDate &&
                            l.endDate >= selectedDailyDate
                        );
                        const resolved = getEffectiveShiftForCell(emp, selectedDailyDate, selectedDailyDayName);
                        const isCellSaving = savingCellKey === resolved.cellKey;
                        const toneClass = getShiftToneClass(resolved.shift);

                        return (
                          <tr
                            key={emp.id}
                            className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                          >
                            <td className="py-2.5 px-3">
                              <div className="flex items-center gap-2 min-w-0">
                                <img
                                  src={emp.avatar}
                                  alt={emp.fullName}
                                  className="w-7 h-7 rounded-md object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                                />
                                <div className="min-w-0">
                                  <div className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                                    {emp.fullName}
                                  </div>
                                  <div className="text-[10.5px] text-slate-500 dark:text-slate-400 truncate">
                                    {emp.title} · <span className="font-mono tabular-nums">{emp.id}</span>
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="py-2.5 px-3">
                              <div className="text-slate-700 dark:text-slate-300 font-medium truncate">
                                {emp.department}
                              </div>
                              {delayInfo?.isDelayed ? (
                                <div
                                  className={`inline-flex items-center gap-1 mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold tabular-nums max-w-full truncate ${
                                    delayInfo.severity === 'critical'
                                      ? 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                                      : 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                                  }`}
                                >
                                  <AlertTriangle className="w-2.5 h-2.5 shrink-0" />
                                  <span className="truncate">{delayInfo.badgeText}</span>
                                </div>
                              ) : isHRManager ? (
                                <div className="text-[10px] text-indigo-700 dark:text-indigo-300 font-medium mt-0.5 truncate">
                                  {assignedMgr ? `Amir: ${assignedMgr.name}` : 'Amir Atanmamış'}
                                </div>
                              ) : null}
                            </td>
                            <td className="py-2.5 px-3">
                              {leave ? (
                                <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 text-purple-800 dark:text-purple-200 font-semibold text-[11px] truncate max-w-full">
                                  <CalendarCheck className="w-3 h-3 shrink-0" />
                                  <span className="truncate">İzinli ({leave.leaveType})</span>
                                </span>
                              ) : canEditRow ? (
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <select
                                    aria-label={`${emp.fullName} günlük vardiya`}
                                    value={resolved.shiftId}
                                    disabled={isCellSaving || isBulkSaving}
                                    onChange={(e) =>
                                      void handleInlineShiftChange(emp, selectedDailyDate, e.target.value)
                                    }
                                    className={`w-full min-w-0 px-2 py-1.5 text-xs font-semibold rounded-lg border cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500 truncate ${toneClass} ${
                                      resolved.isPending ? 'ring-2 ring-indigo-500 border-indigo-500' : ''
                                    }`}
                                  >
                                    {calendarSelectableShifts.map((s) => (
                                      <option
                                        key={s.id}
                                        value={s.id}
                                        className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                                      >
                                        {s.isOffDay ? `${s.name} (OFF)` : s.name}
                                      </option>
                                    ))}
                                  </select>
                                  {isCellSaving && (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600 shrink-0" />
                                  )}
                                </div>
                              ) : (
                                <span
                                  className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-[11px] font-semibold truncate max-w-full ${toneClass}`}
                                >
                                  {resolved.shift?.isOffDay
                                    ? 'İzinli / Hafta Tatili'
                                    : `${resolved.shift?.name || 'Standart'}`}
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-right text-[10.5px] text-slate-500 dark:text-slate-400 tabular-nums truncate">
                              {resolved.isPending ? (
                                <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                                  Bekliyor
                                </span>
                              ) : resolved.isOverride ? (
                                <span title={resolved.assignment?.updatedBy || 'Yönetici'}>
                                  Özel Atama
                                </span>
                              ) : (
                                <span>Varsayılan</span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400 pt-1">
              <span className="flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                {canManageShifts
                  ? saveMode === 'auto'
                    ? 'Açılır listeden seçtiğiniz vardiya anında sunucuda doğrulanıp kaydedilir ve gecikme takibi canlı güncellenir.'
                    : 'Değişikliklerinizi yapıp sağ üstteki "Değişiklikleri Kaydet" butonuyla toplu olarak kaydedebilirsiniz.'
                  : 'Salt okunur moddasınız. Vardiya düzenleme izni için İK veya Süper Admin ile iletişime geçiniz.'}
              </span>
              <span className="font-mono text-[11px] tabular-nums">
                {calendarEmployees.length} Personel · {shifts.length} Vardiya · {employeeShifts.length} Özel Kayıt
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Section 1: Vardiya Tanımları (No-Scroll Compact Full-Fit Grid) */}
      {(activeViewTab === 'shifts' || activeViewTab === 'all') && (
        <div className="w-full overflow-x-hidden space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Vardiya Tanımları
              </h2>
              <span className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                ({shifts.length})
              </span>
            </div>
            {isHRManager ? (
              <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => {
                    setShiftForm({
                      id: !hasActiveOffDayShift ? 'SHIFT-OFF' : undefined,
                      name: 'İzinli / Hafta Tatili',
                      startTime: '00:00',
                      endTime: '00:00',
                      toleranceMinutes: 0,
                      breakMinutes: 0,
                      workDays: [],
                      isOffDay: true,
                      colorKey: 'off',
                    });
                    setIsShiftModalOpen(true);
                  }}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors cursor-pointer flex-1 sm:flex-none"
                >
                  <Calendar className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                  <span>{hasActiveOffDayShift ? 'Yeni İzin Günü (OFF)' : 'İzin Günü (OFF) Oluştur'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShiftForm({
                      name: '',
                      startTime: '08:30',
                      endTime: '17:30',
                      toleranceMinutes: 15,
                      breakMinutes: 60,
                      workDays: ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma'],
                      isOffDay: false,
                    });
                    setIsShiftModalOpen(true);
                  }}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors cursor-pointer flex-1 sm:flex-none"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Yeni Vardiya Ekle</span>
                </button>
              </div>
            ) : (
              <div
                className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 rounded-lg cursor-not-allowed border border-slate-200 dark:border-slate-700 w-full sm:w-auto"
                title="Vardiya ekleme yetkisi yalnızca İK Yöneticisine aittir"
              >
                <Lock className="w-3 h-3" />
                <span>Vardiya Ekle (Yetki Gerekli)</span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2.5 w-full">
            {shifts.map((s) => {
              const accentClass = s.isOffDay
                ? 'bg-slate-400'
                : s.startTime >= '22:00' || s.startTime < '06:00'
                ? 'bg-indigo-500'
                : s.startTime >= '14:00'
                ? 'bg-amber-500'
                : 'bg-emerald-500';
              const compactDays = s.isOffDay
                ? 'Tatilde / OFF'
                : s.workDays.map((d) => SHORT_DAY_LABELS[d] || d.slice(0, 3)).join(' · ');

              return (
                <div
                  key={s.id}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 flex flex-col justify-between gap-2 min-w-0 hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
                >
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${accentClass}`} />
                        <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500 font-semibold truncate">
                          {s.id}
                        </span>
                      </div>
                      {(isHRManager || canDelete) && (
                        <button
                          type="button"
                          onClick={() => handleDeleteShift(s.id, s.name)}
                          className="p-1 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded transition-colors cursor-pointer shrink-0"
                          title={`"${s.name}" vardiyasını sil`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    <h3
                      className="font-bold text-xs text-slate-900 dark:text-slate-100 leading-snug truncate"
                      title={s.name}
                    >
                      {s.name}
                    </h3>

                    <div className="font-mono font-bold text-sm text-slate-900 dark:text-slate-100 tabular-nums tracking-tight">
                      {s.isOffDay ? 'OFF / İzinli' : `${s.startTime} – ${s.endTime}`}
                    </div>

                    <div className="text-[10.5px] text-slate-500 dark:text-slate-400 tabular-nums truncate">
                      {s.isOffDay
                        ? 'Çalışma günü değil'
                        : `±${s.toleranceMinutes} dk tolerans · ${s.breakMinutes} dk mola`}
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-[10px] font-medium text-slate-600 dark:text-slate-400 truncate" title={compactDays}>
                    {compactDays}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Section: Rol Tabanlı Vardiya Yetkilendirme (can_manage_shifts) & Birim Amirleri */}
      {(activeViewTab === 'supervisors' || activeViewTab === 'all') && (
        <div className="space-y-5 pt-4 border-t border-slate-200 dark:border-slate-800">
          {/* DEDICATED PANEL: Rol Tabanlı Vardiya Yetkilendirme (can_manage_shifts: true/false) */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 sm:p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <ShieldCheck className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                  <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    Rol Tabanlı Vardiya Yetkilendirme (<code className="font-mono text-xs text-indigo-600 dark:text-indigo-400">can_manage_shifts</code>)
                  </h2>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Sadece <strong>Süper Admin</strong> ve <strong>İK</strong> rolleri kullanıcıların vardiya düzenleme yetkisini açıp kapatabilir. Yetki verilen Birim Yöneticisi / Amir yalnızca kendi birimindeki personellerin vardiyasını yönetebilir.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative w-full sm:w-52">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Kullanıcı veya birim ara..."
                    value={permSearchQuery}
                    onChange={(e) => setPermSearchQuery(e.target.value)}
                    className="w-full pl-8 pr-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-100 focus:outline-indigo-500"
                  />
                </div>
                {!canToggleShiftPermissions && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 whitespace-nowrap">
                    <Lock className="w-3 h-3" />
                    <span>Sadece Süper Admin / İK</span>
                  </span>
                )}
              </div>
            </div>

            <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300">
                    <th className="py-2.5 px-4 font-semibold">Kullanıcı</th>
                    <th className="py-2.5 px-4 font-semibold">Rol</th>
                    <th className="py-2.5 px-4 font-semibold">Yetki Kapsamı</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Vardiya Düzenleme (can_manage_shifts)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {userAccounts
                    .filter((acc) => {
                      if (!permSearchQuery.trim()) return true;
                      const q = permSearchQuery.toLowerCase();
                      return (
                        acc.name.toLowerCase().includes(q) ||
                        acc.username.toLowerCase().includes(q) ||
                        (acc.department || '').toLowerCase().includes(q)
                      );
                    })
                    .map((acc) => {
                      const isHRRole = acc.role === 'ik_yoneticisi';
                      const linkedEmp = employees.find((e) => e.id === acc.employeeId);
                      const dept = acc.department || linkedEmp?.department || '—';
                      const isEnabled = isHRRole
                        ? true
                        : typeof acc.can_manage_shifts === 'boolean'
                          ? acc.can_manage_shifts
                          : acc.role === 'birim_amiri' || Boolean(acc.isShiftSupervisor);
                      const isBusy = togglingPermAccountId === acc.id;

                      const roleText =
                        acc.role === 'ik_yoneticisi'
                          ? 'İK Yöneticisi'
                          : acc.role === 'birim_amiri'
                            ? 'Birim Yöneticisi / Amir'
                            : acc.role === 'yonetici'
                              ? 'Bölüm Yöneticisi'
                              : acc.role === 'guvenlik'
                                ? 'Turnike Görevlisi'
                                : 'Personel';

                      return (
                        <tr
                          key={acc.id}
                          className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                        >
                          <td className="py-2.5 px-4">
                            <div className="flex items-center gap-2.5">
                              <img
                                src={acc.avatar}
                                alt={acc.name}
                                className="w-7 h-7 rounded-lg object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                              />
                              <div>
                                <div className="font-semibold text-slate-900 dark:text-slate-100">{acc.name}</div>
                                <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                                  @{acc.username} · {acc.employeeId}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="py-2.5 px-4 text-slate-700 dark:text-slate-300 font-medium">
                            {roleText}
                          </td>
                          <td className="py-2.5 px-4 text-slate-600 dark:text-slate-400">
                            {isHRRole ? (
                              <span className="font-semibold text-indigo-700 dark:text-indigo-300">
                                Tüm Birimler (Tam Erişim)
                              </span>
                            ) : isEnabled ? (
                              <span className="tabular-nums">
                                Bağlı Ekip:{' '}
                                <strong className="text-slate-800 dark:text-slate-200">
                                  {employees.filter((e) => e.manager_id === acc.id).length} Personel
                                </strong>{' '}
                                (İK Atamalı)
                              </span>
                            ) : (
                              <span className="text-slate-400 dark:text-slate-500">Salt Okunur ({dept})</span>
                            )}
                          </td>
                          <td className="py-2.5 px-4 text-right">
                            {isHRRole ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-700 dark:text-indigo-300">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Varsayılan Aktif</span>
                              </span>
                            ) : (
                              <div className="inline-flex items-center gap-2.5">
                                <span
                                  className={`text-[11px] font-semibold ${
                                    isEnabled
                                      ? 'text-emerald-700 dark:text-emerald-400'
                                      : 'text-slate-400 dark:text-slate-500'
                                  }`}
                                >
                                  {isEnabled ? 'Aktif' : 'Kapalı'}
                                </span>
                                <button
                                  type="button"
                                  role="switch"
                                  aria-checked={isEnabled}
                                  aria-label={`${acc.name} vardiya düzenleme yetkisi`}
                                  disabled={!canToggleShiftPermissions || isBusy}
                                  onClick={() => void handleToggleUserShiftPermission(acc)}
                                  className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                                    !canToggleShiftPermissions
                                      ? 'opacity-50 cursor-not-allowed'
                                      : 'cursor-pointer'
                                  } ${
                                    isEnabled
                                      ? 'bg-emerald-600'
                                      : 'bg-slate-300 dark:bg-slate-700'
                                  }`}
                                >
                                  <span
                                    className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                                      isEnabled ? 'translate-x-4.5' : 'translate-x-1'
                                    }`}
                                  />
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>

          {/* DEDICATED HR PANEL: Ekip / Birim Amiri Eşleştirme (manager_id) */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 sm:p-5 space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Users className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                  <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    Ekip / Birim Amiri Eşleştirme (<code className="font-mono text-xs text-indigo-600 dark:text-indigo-400">manager_id</code>)
                  </h2>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Hangi personelin hangi <strong>Birim Amirine</strong> bağlı olduğunu yalnızca <strong>Süper Admin</strong> ve <strong>İK Yöneticisi</strong> belirler. Birim Amirleri yalnızca kendilerine atanan personellerin vardiyalarını görebilir ve düzenleyebilir.
                </p>
              </div>

              {!canToggleShiftPermissions && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 whitespace-nowrap self-start lg:self-center">
                  <Lock className="w-3.5 h-3.5" />
                  <span>Salt Okunur — Eşleştirme Yetkisi Sadece Süper Admin / İK</span>
                </span>
              )}
            </div>

            {/* Filter & Bulk Assign Bar */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative w-full sm:w-56">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Personel, sicil veya amir ara..."
                    value={teamSearchQuery}
                    onChange={(e) => setTeamSearchQuery(e.target.value)}
                    className="w-full pl-8 pr-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-100 focus:outline-indigo-500"
                  />
                </div>
                <select
                  value={teamManagerFilter}
                  onChange={(e) => setTeamManagerFilter(e.target.value)}
                  className="px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-200 cursor-pointer"
                >
                  <option value="all">Tüm Personeller ({employees.length})</option>
                  <option value="unassigned">
                    Amir Atanmamış ({employees.filter((e) => !e.manager_id).length})
                  </option>
                  {managerAccounts.map((mgr) => (
                    <option key={mgr.id} value={mgr.id}>
                      {mgr.name} Ekibi ({employees.filter((e) => e.manager_id === mgr.id).length})
                    </option>
                  ))}
                </select>
              </div>

              {canToggleShiftPermissions && (
                <div className="flex items-center gap-2 flex-wrap bg-slate-50 dark:bg-slate-800/70 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700">
                  <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 tabular-nums">
                    Seçili: {selectedTeamEmpIds.length}
                  </span>
                  <select
                    value={bulkTargetManagerId}
                    onChange={(e) => setBulkTargetManagerId(e.target.value)}
                    aria-label="Toplu atama için hedef Birim Amiri"
                    className="px-2.5 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-800 dark:text-slate-100 cursor-pointer"
                  >
                    <option value="">Hedef Birim Amiri Seçin...</option>
                    <option value="__UNASSIGN__">Amir Bağlantısını Kaldır (Atamasız Yap)</option>
                    {managerAccounts.map((mgr) => (
                      <option key={mgr.id} value={mgr.id}>
                        {mgr.name} (@{mgr.username})
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={
                      selectedTeamEmpIds.length === 0 || !bulkTargetManagerId || isAssigningManager
                    }
                    onClick={() => void handleBulkManagerAssign()}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                      selectedTeamEmpIds.length > 0 && bulkTargetManagerId && !isAssigningManager
                        ? 'bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer'
                        : 'bg-slate-200 dark:bg-slate-700 text-slate-400 dark:text-slate-500 cursor-not-allowed'
                    }`}
                  >
                    {isAssigningManager ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <UserCheck className="w-3.5 h-3.5" />
                    )}
                    <span>Seçilenleri Amire Ata</span>
                  </button>
                </div>
              )}
            </div>

            {/* Employee -> Manager Mapping Table */}
            <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300">
                    {canToggleShiftPermissions && (
                      <th className="py-2.5 px-3 w-9">
                        <input
                          type="checkbox"
                          aria-label="Görünür tüm personelleri seç"
                          checked={
                            filteredTeamEmployees.length > 0 &&
                            filteredTeamEmployees.every((e) => selectedTeamEmpIds.includes(e.id))
                          }
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedTeamEmpIds(filteredTeamEmployees.map((emp) => emp.id));
                            } else {
                              setSelectedTeamEmpIds([]);
                            }
                          }}
                          className="rounded border-slate-300 text-indigo-600 cursor-pointer"
                        />
                      </th>
                    )}
                    <th className="py-2.5 px-4 font-semibold">Personel</th>
                    <th className="py-2.5 px-4 font-semibold">Departman / Ünvan</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Bağlı Olduğu Birim Amiri</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredTeamEmployees.length === 0 ? (
                    <tr>
                      <td
                        colSpan={canToggleShiftPermissions ? 4 : 3}
                        className="py-8 text-center text-slate-400 dark:text-slate-500"
                      >
                        Kriterlere uygun personel bulunamadı.
                      </td>
                    </tr>
                  ) : (
                    filteredTeamEmployees.map((emp) => {
                      const assignedMgr = emp.manager_id ? managerById.get(emp.manager_id) : undefined;
                      const isRowBusy = assigningSingleEmpId === emp.id;
                      const isSelected = selectedTeamEmpIds.includes(emp.id);

                      return (
                        <tr
                          key={emp.id}
                          className={`transition-colors ${
                            isSelected
                              ? 'bg-indigo-50/50 dark:bg-indigo-950/30'
                              : 'hover:bg-slate-50/70 dark:hover:bg-slate-800/40'
                          }`}
                        >
                          {canToggleShiftPermissions && (
                            <td className="py-2.5 px-3">
                              <input
                                type="checkbox"
                                aria-label={`${emp.fullName} seç`}
                                checked={isSelected}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedTeamEmpIds((prev) =>
                                      prev.includes(emp.id) ? prev : [...prev, emp.id]
                                    );
                                  } else {
                                    setSelectedTeamEmpIds((prev) => prev.filter((id) => id !== emp.id));
                                  }
                                }}
                                className="rounded border-slate-300 text-indigo-600 cursor-pointer"
                              />
                            </td>
                          )}
                          <td className="py-2.5 px-4">
                            <div className="flex items-center gap-2.5">
                              <img
                                src={emp.avatar}
                                alt={emp.fullName}
                                className="w-7 h-7 rounded-lg object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                              />
                              <div>
                                <div className="font-semibold text-slate-900 dark:text-slate-100">
                                  {emp.fullName}
                                </div>
                                <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                                  {emp.id}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="py-2.5 px-4">
                            <div className="font-medium text-slate-800 dark:text-slate-200">
                              {emp.department}
                            </div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400">{emp.title}</div>
                          </td>
                          <td className="py-2.5 px-4 text-right">
                            {canToggleShiftPermissions ? (
                              <div className="inline-flex items-center gap-2 justify-end">
                                {isRowBusy && (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600 shrink-0" />
                                )}
                                <select
                                  aria-label={`${emp.fullName} için Birim Amiri seç`}
                                  value={emp.manager_id || ''}
                                  disabled={isRowBusy || isAssigningManager}
                                  onChange={(e) =>
                                    void handleSingleManagerAssign(emp.id, e.target.value || null)
                                  }
                                  className="px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-100 cursor-pointer focus:outline-indigo-500 max-w-[240px]"
                                >
                                  <option value="">Atanmamış (Amir Yok)</option>
                                  {managerAccounts
                                    .filter((m) => m.employeeId !== emp.id)
                                    .map((mgr) => (
                                      <option key={mgr.id} value={mgr.id}>
                                        {mgr.name} (@{mgr.username})
                                      </option>
                                    ))}
                                </select>
                              </div>
                            ) : assignedMgr ? (
                              <span className="font-semibold text-indigo-700 dark:text-indigo-300">
                                {assignedMgr.name}
                              </span>
                            ) : (
                              <span className="text-slate-400 dark:text-slate-500">Atanmamış</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
            <div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Birim Amirleri & Sorumluluk Notları ({supervisorAssignments.length})
                </h2>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Birim amirliği sorumluluk kayıtları ve departman bazlı görev tanımları.
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
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-xs rounded-xl font-medium border border-slate-200 dark:border-slate-700">
                <Lock className="w-3.5 h-3.5 text-slate-400" />
                <span>Yetkilendirme İK Yöneticisine Aittir</span>
              </div>
            )}
          </div>

          {/* Hierarchy Info Box */}
          <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 space-y-2">
            <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-slate-100">
              <Shield className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
              <span>Rol & Ekip Hiyerarşisi Matrisi Nasıl İşler?</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[11px] leading-relaxed">
              <div className="bg-white dark:bg-slate-800/70 p-3 rounded-lg border border-slate-200 dark:border-slate-700">
                <span className="font-bold text-purple-900 dark:text-purple-300 block mb-1">1. Süper Admin & İK</span>
                Tüm personellerin vardiyasını yönetir, <code className="font-mono">can_manage_shifts</code> yetkisini açıp kapatır ve hangi personelin hangi amire (<code className="font-mono">manager_id</code>) bağlı olduğunu belirler.
              </div>
              <div className="bg-white dark:bg-slate-800/70 p-3 rounded-lg border border-slate-200 dark:border-slate-700">
                <span className="font-bold text-amber-900 dark:text-amber-300 block mb-1">2. Birim Yöneticisi / Amir</span>
                Yalnızca İK tarafından kendi ekibine (<code className="font-mono">manager_id</code>) atanan personelleri görür ve düzenler; diğer personeller için API istekleri sunucu düzeyinde <strong>403 Forbidden</strong> ile reddedilir.
              </div>
              <div className="bg-white dark:bg-slate-800/70 p-3 rounded-lg border border-slate-200 dark:border-slate-700">
                <span className="font-bold text-emerald-900 dark:text-emerald-300 block mb-1">3. Yetkisiz Kullanıcı / Personel</span>
                Vardiya sayfasını yalnızca salt okunur modda açabilir; düzenleme ve ekip atama kontrolleri gizlenir ve sunucu düzeyinde engellenir.
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

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xs overflow-hidden">
          {/* Mobile Leave Request Cards (md:hidden) */}
          <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800">
            {leaves.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-xs">
                Aktif izin talebi bulunmuyor.
              </div>
            ) : (
              leaves.map((lr) => {
                const balanceInfo =
                  lr.leaveType === 'Yıllık İzin'
                    ? pdksStorage.getEmployeeAnnualLeaveBalance(lr.employeeId)
                    : null;
                const canShowCancelBtn =
                  canCancelLeave && (lr.status === 'pending' || lr.status === 'approved');
                return (
                  <div
                    key={lr.id}
                    className={`p-3.5 space-y-2.5 ${
                      lr.status === 'cancelled' ? 'bg-slate-50/70 dark:bg-slate-800/40' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-bold text-xs text-slate-900 dark:text-slate-100">
                          {lr.employeeName}
                        </div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                          {lr.id} · {lr.department}
                        </div>
                        {balanceInfo && (
                          <div className="text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold mt-0.5 tabular-nums">
                            Yıllık İzin Bakiyesi: {balanceInfo.remaining} / {balanceInfo.entitlement} gün
                          </div>
                        )}
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
                        ) : lr.status === 'cancelled' ? (
                          <span className="inline-flex items-center gap-1 text-slate-700 dark:text-slate-300 font-bold bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full text-[10px] border border-slate-300 dark:border-slate-700">
                            <Ban className="w-3 h-3 text-rose-600" /> İptal Edildi
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-amber-700 font-bold bg-amber-50 px-2 py-0.5 rounded-full text-[10px] border border-amber-200">
                            <Clock className="w-3 h-3" /> Onay Bekliyor
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[11px] pt-1">
                      <span className="font-semibold text-slate-800 dark:text-slate-200">{lr.leaveType}</span>
                      <span className="font-mono text-slate-600 dark:text-slate-300 font-medium tabular-nums">
                        {lr.startDate} - {lr.endDate} ({lr.days} Gün)
                      </span>
                    </div>

                    {lr.reason && (
                      <div className="text-[11px] text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/70 p-2 rounded-lg border border-slate-100 dark:border-slate-700">
                        {lr.reason}
                      </div>
                    )}

                    {lr.status === 'cancelled' && (
                      <div className="text-[10.5px] bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200/80 dark:border-rose-900/60 rounded-lg p-2 space-y-0.5 text-rose-900 dark:text-rose-200">
                        <div className="font-semibold flex items-center justify-between gap-2">
                          <span>İptal Eden: {lr.cancelled_by || 'İK Yöneticisi'}</span>
                          {lr.cancelled_at && (
                            <span className="font-mono text-[10px] opacity-80">
                              {new Date(lr.cancelled_at).toLocaleString('tr-TR', {
                                day: '2-digit',
                                month: '2-digit',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          )}
                        </div>
                        {lr.cancel_reason && (
                          <div className="text-[10.5px] text-rose-800 dark:text-rose-300">
                            Neden: {lr.cancel_reason}
                          </div>
                        )}
                        {typeof lr.balance_refunded_days === 'number' && lr.balance_refunded_days > 0 && (
                          <div className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
                            +{lr.balance_refunded_days} gün yıllık izin bakiyesine iade edildi · Takvim güncellendi
                          </div>
                        )}
                      </div>
                    )}

                    {((lr.status === 'pending' && canApprove) || canShowCancelBtn) && (
                      <div className="flex flex-wrap items-center gap-2 pt-1.5 border-t border-slate-100 dark:border-slate-800">
                        {lr.status === 'pending' && canApprove && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleUpdateStatus(lr.id, 'approved')}
                              className="flex-1 py-1.5 px-3 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow-xs transition-colors cursor-pointer text-center"
                            >
                              Onayla
                            </button>
                            <button
                              type="button"
                              onClick={() => handleUpdateStatus(lr.id, 'rejected')}
                              className="flex-1 py-1.5 px-3 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg border border-rose-200 transition-colors cursor-pointer text-center"
                            >
                              Reddet
                            </button>
                          </>
                        )}
                        {canShowCancelBtn && (
                          <button
                            type="button"
                            onClick={() => handleOpenCancelLeaveModal(lr)}
                            className="inline-flex items-center justify-center gap-1.5 flex-1 py-1.5 px-3 text-xs font-bold text-amber-800 bg-amber-50 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-300 rounded-lg border border-amber-300 transition-colors cursor-pointer"
                          >
                            <Ban className="w-3.5 h-3.5" />
                            <span>İzni İptal Et</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Desktop Leave Table (hidden md:block) */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/70 text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider">
                  <th className="py-3 px-4">Talep No & Personel</th>
                  <th className="py-3 px-4">İzin Türü</th>
                  <th className="py-3 px-4">Tarih Aralığı</th>
                  <th className="py-3 px-4">Süre</th>
                  <th className="py-3 px-4">Gerekçe / İptal Kaydı</th>
                  <th className="py-3 px-4">Onay Durumu</th>
                  <th className="py-3 px-4 text-right">İşlem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {leaves.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400">
                      Aktif izin talebi bulunmuyor.
                    </td>
                  </tr>
                ) : (
                  leaves.map((lr) => {
                    const balanceInfo =
                      lr.leaveType === 'Yıllık İzin'
                        ? pdksStorage.getEmployeeAnnualLeaveBalance(lr.employeeId)
                        : null;
                    const canShowCancelBtn =
                      canCancelLeave && (lr.status === 'pending' || lr.status === 'approved');

                    return (
                      <tr
                        key={lr.id}
                        className={`hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors ${
                          lr.status === 'cancelled' ? 'bg-slate-50/50 dark:bg-slate-800/30' : ''
                        }`}
                      >
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-900 dark:text-slate-100">
                            {lr.employeeName}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                            {lr.id} · {lr.department}
                          </div>
                          {balanceInfo && (
                            <div className="text-[10.5px] text-indigo-600 dark:text-indigo-400 font-semibold mt-0.5 tabular-nums">
                              Kalan Yıllık İzin: {balanceInfo.remaining} / {balanceInfo.entitlement} gün
                            </div>
                          )}
                        </td>

                        <td className="py-3 px-4">
                          <span className="font-medium text-slate-800 dark:text-slate-200">
                            {lr.leaveType}
                          </span>
                        </td>

                        <td className="py-3 px-4 font-mono text-slate-700 dark:text-slate-300 whitespace-nowrap tabular-nums">
                          {lr.startDate} - {lr.endDate}
                        </td>

                        <td className="py-3 px-4 font-mono font-medium text-slate-900 dark:text-slate-100 tabular-nums">
                          {lr.days} Gün
                        </td>

                        <td className="py-3 px-4 text-slate-600 dark:text-slate-300 max-w-xs">
                          <div className="truncate" title={lr.reason}>
                            {lr.reason}
                          </div>
                          {lr.status === 'cancelled' && (
                            <div className="mt-1 p-1.5 rounded-md bg-rose-50/80 dark:bg-rose-950/40 border border-rose-200/80 dark:border-rose-900/60 text-[10.5px] space-y-0.5">
                              <div className="font-semibold text-rose-800 dark:text-rose-200">
                                İptal: {lr.cancel_reason || 'İK tarafından iptal edildi'}
                              </div>
                              <div className="text-[10px] text-rose-700/90 dark:text-rose-300/90">
                                {lr.cancelled_by || 'İK Yöneticisi'}
                                {lr.cancelled_at
                                  ? ` · ${new Date(lr.cancelled_at).toLocaleString('tr-TR', {
                                      day: '2-digit',
                                      month: '2-digit',
                                      year: 'numeric',
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })}`
                                  : ''}
                              </div>
                              {typeof lr.balance_refunded_days === 'number' && lr.balance_refunded_days > 0 && (
                                <div className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
                                  +{lr.balance_refunded_days} gün bakiye iade edildi
                                </div>
                              )}
                            </div>
                          )}
                        </td>

                        <td className="py-3 px-4 whitespace-nowrap">
                          {lr.status === 'approved' ? (
                            <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold bg-emerald-50 px-2.5 py-1 rounded-md text-[11px] border border-emerald-200/70">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Onaylandı
                            </span>
                          ) : lr.status === 'rejected' ? (
                            <span className="inline-flex items-center gap-1 text-rose-700 font-semibold bg-rose-50 px-2.5 py-1 rounded-md text-[11px] border border-rose-200/70">
                              <AlertCircle className="w-3.5 h-3.5" /> Reddedildi
                            </span>
                          ) : lr.status === 'cancelled' ? (
                            <span className="inline-flex items-center gap-1 text-slate-700 dark:text-slate-200 font-semibold bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-md text-[11px] border border-slate-300 dark:border-slate-700">
                              <Ban className="w-3.5 h-3.5 text-rose-600" /> İptal Edildi
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-amber-700 font-semibold bg-amber-50 px-2.5 py-1 rounded-md text-[11px] border border-amber-200/70">
                              <Clock className="w-3.5 h-3.5" /> Bekliyor
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          {lr.status === 'pending' ? (
                            <div className="flex items-center justify-end gap-1.5">
                              {canApprove ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateStatus(lr.id, 'approved')}
                                    className="px-2.5 py-1 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-md shadow-xs transition-colors cursor-pointer"
                                  >
                                    Onayla
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateStatus(lr.id, 'rejected')}
                                    className="px-2.5 py-1 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-md transition-colors cursor-pointer"
                                  >
                                    Reddet
                                  </button>
                                </>
                              ) : (
                                <span className="text-slate-400 text-xs italic">İK Onayı Bekliyor</span>
                              )}
                              {canShowCancelBtn && (
                                <button
                                  type="button"
                                  onClick={() => handleOpenCancelLeaveModal(lr)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-amber-800 bg-amber-50 hover:bg-rose-50 hover:text-rose-700 border border-amber-300 hover:border-rose-300 rounded-md transition-colors cursor-pointer"
                                  title="İK Yetkisi ile İzni İptal Et"
                                >
                                  <Ban className="w-3 h-3" />
                                  <span>İzni İptal Et</span>
                                </button>
                              )}
                            </div>
                          ) : lr.status === 'approved' ? (
                            canShowCancelBtn ? (
                              <button
                                type="button"
                                onClick={() => handleOpenCancelLeaveModal(lr)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-md transition-colors cursor-pointer"
                                title="Onaylanmış izni iptal et, bakiyeyi iade et ve takvimi temizle"
                              >
                                <Ban className="w-3.5 h-3.5" />
                                <span>İzni İptal Et</span>
                              </button>
                            ) : (
                              <span className="text-slate-400 text-xs">Tamamlandı</span>
                            )
                          ) : lr.status === 'cancelled' ? (
                            <span className="text-slate-400 text-xs font-medium">İptal Kaydedildi</span>
                          ) : (
                            <span className="text-slate-400 text-xs">Tamamlandı</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
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
                    ? 'bg-slate-900 dark:bg-indigo-600 text-white shadow-xs'
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
            {/* Mobile Overtime Request Cards (md:hidden) */}
            <div className="md:hidden divide-y divide-slate-100">
              {overtimes
                .filter((ot) => {
                  if (overtimeFilter === 'all') return true;
                  return ot.status === overtimeFilter;
                })
                .length === 0 ? (
                <div className="py-8 text-center text-slate-400 text-xs">
                  Bu filtreye uygun fazla mesai talebi bulunamadı.
                </div>
              ) : (
                overtimes
                  .filter((ot) => {
                    if (overtimeFilter === 'all') return true;
                    return ot.status === overtimeFilter;
                  })
                  .map((ot) => (
                    <div key={ot.id} className="p-3.5 space-y-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-bold text-xs text-slate-900">{ot.employeeName}</div>
                          <div className="text-[10px] text-slate-500 font-mono">
                            {ot.employeeId} · {ot.department}
                          </div>
                        </div>
                        <div>
                          {ot.status === 'approved' ? (
                            <span className="inline-flex items-center gap-1 text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-full text-[10px] border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3" /> Onaylandı
                            </span>
                          ) : ot.status === 'rejected' ? (
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

                      <div className="flex items-center justify-between text-xs bg-slate-50 p-2 rounded-lg border border-slate-100">
                        <span className="font-mono font-medium text-slate-700">{ot.date}</span>
                        <span className="font-mono font-bold text-amber-800">
                          {ot.startTime} - {ot.endTime} ({ot.hours} Saat)
                        </span>
                      </div>

                      {ot.reason && (
                        <div className="text-[11px] text-slate-600 bg-white p-2 rounded-lg border border-slate-100">
                          <span className="font-semibold text-slate-700">Gerekçe: </span>
                          <span className="italic">{ot.reason}</span>
                        </div>
                      )}

                      {ot.status === 'pending' && canApprove && (
                        <div className="flex items-center gap-2 pt-1.5 border-t border-slate-100">
                          <button
                            onClick={() => handleApproveOvertime(ot.id)}
                            className="flex-1 py-1.5 px-3 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow-xs transition-colors cursor-pointer text-center"
                          >
                            Onayla
                          </button>
                          <button
                            onClick={() => handleRejectOvertime(ot.id)}
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

            {/* Desktop Overtime Table (hidden md:block) */}
            <div className="hidden md:block overflow-x-auto w-full max-w-full touch-pan-x">
              <table className="w-full text-left text-xs min-w-[700px]">
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
                              canApprove ? (
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
                      {calendarSelectableShifts.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.isOffDay ? `${s.name} (OFF / İzinli)` : `${s.name} (${s.startTime} - ${s.endTime})`}
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

      {/* MODAL: Yeni Vardiya (Saat çakışması kısıtlaması yok, gece vardiyası destekli) */}
      {isShiftModalOpen && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 dark:bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => !isSavingShift && setIsShiftModalOpen(false)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Yeni Vardiya Planı Tanımla
              </h3>
              <button
                type="button"
                disabled={isSavingShift}
                onClick={() => setIsShiftModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveShift} className="mt-4 space-y-4">
              {/* Vardiya Türü Seçici: Çalışma Vardiyası vs İzin Günü / Hafta Tatili (OFF) */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Plan Türü
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setShiftForm((prev) => ({
                        ...prev,
                        id: prev.id === 'SHIFT-OFF' ? undefined : prev.id,
                        isOffDay: false,
                        colorKey: 'custom',
                        name: prev.name === 'İzinli / Hafta Tatili' ? '' : prev.name,
                        startTime: prev.startTime === '00:00' ? '08:30' : prev.startTime || '08:30',
                        endTime: prev.endTime === '00:00' ? '17:30' : prev.endTime || '17:30',
                        toleranceMinutes: prev.toleranceMinutes || 15,
                        breakMinutes: prev.breakMinutes || 60,
                        workDays:
                          prev.workDays && prev.workDays.length > 0
                            ? prev.workDays
                            : ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma'],
                      }))
                    }
                    className={`px-3 py-2 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                      !shiftForm.isOffDay
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                  >
                    Çalışma Vardiyası
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setShiftForm((prev) => ({
                        ...prev,
                        id: !hasActiveOffDayShift ? 'SHIFT-OFF' : prev.id,
                        isOffDay: true,
                        colorKey: 'off',
                        name: prev.name?.trim() ? prev.name : 'İzinli / Hafta Tatili',
                        startTime: '00:00',
                        endTime: '00:00',
                        toleranceMinutes: 0,
                        breakMinutes: 0,
                        workDays: [],
                      }))
                    }
                    className={`px-3 py-2 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                      shiftForm.isOffDay
                        ? 'bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900 border-slate-800 dark:border-slate-200 shadow-xs'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                  >
                    İzin Günü / Hafta Tatili (OFF)
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {shiftForm.isOffDay ? 'İzin Günü Adı' : 'Vardiya Adı'}
                </label>
                <input
                  type="text"
                  required
                  placeholder={
                    shiftForm.isOffDay
                      ? 'Örn: İzinli / Hafta Tatili'
                      : 'Örn: Gece Vardiyası (22:00 - 06:00)'
                  }
                  value={shiftForm.name || ''}
                  onChange={(e) => setShiftForm({ ...shiftForm, name: e.target.value })}
                  className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {shiftForm.isOffDay ? (
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs flex items-start gap-2.5">
                  <Info className="w-4 h-4 shrink-0 text-slate-500 dark:text-slate-400 mt-0.5" />
                  <div className="space-y-1">
                    <div className="font-semibold text-slate-900 dark:text-slate-100">
                      İzin Günü / Hafta Tatili (OFF) Şablonu
                    </div>
                    <p className="text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">
                      Bu şablon haftalık ve günlük vardiya takviminde personelleri <strong>İzinli / OFF</strong> olarak işaretlemek için kullanılır. Giriş beklenmez ve gecikme uyarısı üretmez.
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Başlangıç Saati
                      </label>
                      <input
                        type="time"
                        required
                        value={shiftForm.startTime || '08:30'}
                        onChange={(e) => setShiftForm({ ...shiftForm, startTime: e.target.value })}
                        className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono tabular-nums"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Bitiş Saati
                      </label>
                      <input
                        type="time"
                        required
                        value={shiftForm.endTime || '17:30'}
                        onChange={(e) => setShiftForm({ ...shiftForm, endTime: e.target.value })}
                        className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono tabular-nums"
                      />
                    </div>
                  </div>

                  {shiftForm.startTime &&
                    shiftForm.endTime &&
                    shiftForm.endTime <= shiftForm.startTime && (
                      <div className="p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800 text-indigo-800 dark:text-indigo-200 text-[11px] flex items-center gap-2">
                        <Info className="w-4 h-4 shrink-0 text-indigo-600 dark:text-indigo-400" />
                        <span>
                          <strong>Gece vardiyası</strong> algılandı ({shiftForm.startTime} başlar, ertesi gün{' '}
                          <span className="font-mono font-semibold">{shiftForm.endTime}</span> saatinde biter).
                        </span>
                      </div>
                    )}

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Tolerans (Dk)
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={60}
                        value={shiftForm.toleranceMinutes ?? 15}
                        onChange={(e) => setShiftForm({ ...shiftForm, toleranceMinutes: Number(e.target.value) })}
                        className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono tabular-nums"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Mola Süresi (Dk)
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={180}
                        value={shiftForm.breakMinutes ?? 60}
                        onChange={(e) => setShiftForm({ ...shiftForm, breakMinutes: Number(e.target.value) })}
                        className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono tabular-nums"
                      />
                    </div>
                  </div>

                  {/* Çalışma Günleri */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Çalışma Günleri
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        { full: 'Pazartesi', label: 'Pzt' },
                        { full: 'Salı', label: 'Sal' },
                        { full: 'Çarşamba', label: 'Çar' },
                        { full: 'Perşembe', label: 'Per' },
                        { full: 'Cuma', label: 'Cum' },
                        { full: 'Cumartesi', label: 'Cmt' },
                        { full: 'Pazar', label: 'Paz' },
                      ].map(({ full, label }) => {
                        const isSelected = (shiftForm.workDays || []).includes(full);
                        return (
                          <button
                            type="button"
                            key={full}
                            onClick={() => {
                              const currentDays = shiftForm.workDays || [];
                              if (isSelected) {
                                setShiftForm({ ...shiftForm, workDays: currentDays.filter((d) => d !== full) });
                              } else {
                                setShiftForm({ ...shiftForm, workDays: [...currentDays, full] });
                              }
                            }}
                            className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                              isSelected
                                ? 'bg-indigo-600 text-white border-indigo-600'
                                : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                            }`}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}

              <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  disabled={isSavingShift}
                  onClick={() => setIsShiftModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  disabled={isSavingShift}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 rounded-lg shadow-xs cursor-pointer"
                >
                  {isSavingShift && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{isSavingShift ? 'Kaydediliyor...' : 'Kaydet'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Vardiya Silme Onayı (In-App Modal — iframe uyumlu, soft/hard delete) */}
      {shiftToDelete && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 dark:bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => !isDeletingShift && setShiftToDelete(null)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-5 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Vardiya Tanımını Kaldır
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                  <strong>&quot;{shiftToDelete.name}&quot;</strong> ({shiftToDelete.id}) vardiya tanımını kaldırmak istediğinize emin misiniz?
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">
                  Bu vardiya geçmiş veya aktif personel kayıtlarında kullanıldıysa veri bütünlüğü için pasife alınarak listeden gizlenir; kullanılmadıysa kalıcı olarak silinir.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                disabled={isDeletingShift}
                onClick={() => setShiftToDelete(null)}
                className="px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg cursor-pointer"
              >
                Vazgeç
              </button>
              <button
                type="button"
                disabled={isDeletingShift}
                onClick={() => void confirmDeleteShift()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-60 rounded-lg cursor-pointer"
              >
                {isDeletingShift ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                <span>{isDeletingShift ? 'Kaldırılıyor...' : 'Evet, Kaldır'}</span>
              </button>
            </div>
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

      {/* MODAL: İK & SÜPER ADMİN İZİN İPTAL ONAY & İPTAL NEDENİ (Audit + Bakiye İadesi + Takvim Geri Alma) */}
      {leaveToCancel && (() => {
        const balanceInfo =
          leaveToCancel.leaveType === 'Yıllık İzin'
            ? pdksStorage.getEmployeeAnnualLeaveBalance(leaveToCancel.employeeId)
            : null;
        const willRefundAnnualDays =
          leaveToCancel.status === 'approved' && leaveToCancel.leaveType === 'Yıllık İzin'
            ? typeof leaveToCancel.balance_deducted_days === 'number'
              ? leaveToCancel.balance_deducted_days
              : leaveToCancel.days
            : 0;
        const projectedBalance =
          balanceInfo
            ? Math.min(balanceInfo.entitlement, balanceInfo.remaining + willRefundAnnualDays)
            : null;

        return (
          <div
            className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 dark:bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4"
            onClick={() => !isCancellingLeave && setLeaveToCancel(null)}
          >
            <div
              className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                    <Ban className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                      İzin Talebini İptal Et (İK Yetkisi)
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Kayıt silinmez; &quot;İptal Edildi&quot; olarak denetim kaydına (Audit Log) alınır.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={isCancellingLeave}
                  onClick={() => setLeaveToCancel(null)}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-slate-900 dark:text-slate-100">
                    {leaveToCancel.employeeName}
                  </span>
                  <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                    {leaveToCancel.id}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-300">
                  <span>{leaveToCancel.leaveType}</span>
                  <span className="font-mono font-semibold tabular-nums">
                    {leaveToCancel.startDate} – {leaveToCancel.endDate} ({leaveToCancel.days} Gün)
                  </span>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/70 text-[11px] text-amber-900 dark:text-amber-200 space-y-1.5">
                <div className="font-bold flex items-center gap-1.5">
                  <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                  <span>Otomatik Geri Alma İşlemleri</span>
                </div>
                {willRefundAnnualDays > 0 && balanceInfo && projectedBalance !== null ? (
                  <p>
                    • <strong>Yıllık İzin Bakiyesi İadesi:</strong>{' '}
                    <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400">
                      +{willRefundAnnualDays} gün
                    </span>{' '}
                    iade edilecek ({balanceInfo.remaining} gün →{' '}
                    <strong className="font-mono">{projectedBalance} gün</strong>).
                  </p>
                ) : (
                  <p>
                    • Bu izin talebinde onaylanmış yıllık izin düşümü olmadığı için bakiye değişikliği yapılmayacaktır.
                  </p>
                )}
                <p>
                  • <strong>Vardiya Takvimi &amp; PDKS:</strong>{' '}
                  <span className="font-mono">{leaveToCancel.startDate} – {leaveToCancel.endDate}</span>{' '}
                  aralığındaki &quot;İzinli&quot; blokajı kaldırılacak ve personel tekrar vardiya atamasına ve giriş-çıkış takibine açılacaktır.
                </p>
              </div>

              <form onSubmit={handleConfirmCancelLeave} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    İptal Nedeni <span className="text-rose-500">*</span>
                  </label>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {[
                      'Personel talebiyle iptal',
                      'İş yoğunluğu nedeniyle ertelendi',
                      'Plan değişikliği',
                      'Hatalı tarih girişi',
                    ].map((preset) => (
                      <button
                        type="button"
                        key={preset}
                        onClick={() => setCancelLeaveReason(preset)}
                        className={`px-2 py-1 rounded-md text-[10.5px] font-medium border transition-colors cursor-pointer ${
                          cancelLeaveReason === preset
                            ? 'bg-rose-600 text-white border-rose-600'
                            : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                        }`}
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                  <textarea
                    rows={3}
                    required
                    placeholder="Örn: Personel talebiyle iptal edildi veya iş yoğunluğu nedeniyle ertelendi..."
                    value={cancelLeaveReason}
                    onChange={(e) => setCancelLeaveReason(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                </div>

                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
                  <button
                    type="button"
                    disabled={isCancellingLeave}
                    onClick={() => setLeaveToCancel(null)}
                    className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
                  >
                    Vazgeç
                  </button>
                  <button
                    type="submit"
                    disabled={isCancellingLeave || !cancelLeaveReason.trim()}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-60 rounded-lg shadow-xs cursor-pointer"
                  >
                    {isCancellingLeave ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Ban className="w-3.5 h-3.5" />
                    )}
                    <span>{isCancellingLeave ? 'İptal Ediliyor...' : 'İzni İptal Et ve Geri Al'}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}

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
                    {calendarSelectableShifts.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.isOffDay
                          ? `${s.name} (OFF / İzinli)`
                          : `${s.name} (${s.startTime} - ${s.endTime}) [Tolerans: ±${s.toleranceMinutes} dk]`}
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
                  Seçilen personel, PDKS sisteminde Birim Amiri yetkisiyle yalnızca kendisine atanan çalışanların vardiyalarını yönetebilecektir.
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
                  <h1 className="text-xl font-bold text-slate-900">{companyName} · VARDİYA & İZİN RESMİ RAPORU</h1>
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
