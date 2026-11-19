import * as XLSX from 'xlsx';
import {
  AttendanceRecord,
  Employee,
  EmployeeReportSummary,
  EmployeeShiftAssignment,
  LeaveRequest,
  Shift,
} from '../types/pdks';

const TURKISH_WEEKDAYS = [
  'Pazar',
  'Pazartesi',
  'Salı',
  'Çarşamba',
  'Perşembe',
  'Cuma',
  'Cumartesi',
] as const;

export function getLocalDateString(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getTurkishDayName(dateStr: string): string {
  const parts = dateStr.split('-').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return 'Pazartesi';
  const d = new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0);
  return TURKISH_WEEKDAYS[d.getDay()] || 'Pazartesi';
}

export function parseTimeToMinutes(timeStr?: string | null): number | null {
  if (!timeStr || typeof timeStr !== 'string') return null;
  const cleaned = timeStr.trim();
  const match = cleaned.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hours = parseInt(match[1], 10);
  const mins = parseInt(match[2], 10);
  if (Number.isNaN(hours) || Number.isNaN(mins) || hours < 0 || hours > 23 || mins < 0 || mins > 59) {
    return null;
  }
  return hours * 60 + mins;
}

/**
 * Formats minutes as HH:MM (e.g. 45 -> "00:45", 510 -> "08:30")
 */
export function formatMinutesHHMM(totalMinutes: number): string {
  const safe = Math.max(0, Math.round(totalMinutes));
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Formats minutes in human Turkish format (e.g. 42 -> "42 dk", 75 -> "1 sa 15 dk")
 */
export function formatMinutesTurkish(totalMinutes: number): string {
  const safe = Math.max(0, Math.round(totalMinutes));
  if (safe === 0) return '0 dk';
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  if (h === 0) return `${m} dk`;
  if (m === 0) return `${h} sa`;
  return `${h} sa ${m} dk`;
}

/**
 * Formats minutes as decimal hours string (e.g. 510 -> "8.5 saat")
 */
export function formatMinutesDecimalHours(totalMinutes: number): string {
  if (totalMinutes <= 0) return '-';
  const hours = Math.round((totalMinutes / 60) * 100) / 100;
  return `${hours.toFixed(hours % 1 === 0 ? 1 : 2).replace(/\.00$/, '.0')} saat`;
}

/**
 * Compact shift label for dense no-scroll calendar selects
 */
export function getCompactShiftLabel(shift?: Shift | null): string {
  if (!shift) return 'Standart';
  if (shift.isOffDay || shift.id === 'SHIFT-OFF' || shift.colorKey === 'off') return 'OFF / İzin';
  const base = shift.name.split('(')[0].trim();
  const lower = base.toLowerCase();
  if (lower.includes('sabah') || lower.includes('gündüz')) return 'Sabah';
  if (lower.includes('akşam')) return 'Akşam';
  if (lower.includes('gece')) return 'Gece';
  if (lower.includes('esnek')) return 'Esnek';
  if (lower.includes('hafta sonu') || lower.includes('cumartesi')) return 'H.Sonu';
  if (lower.includes('standart')) return 'Standart';
  return base.length > 10 ? `${base.slice(0, 9)}…` : base;
}

export interface ResolvedDailyShift {
  shift: Shift | null;
  shiftId: string;
  shiftName: string;
  startTime: string;
  endTime: string;
  toleranceMinutes: number;
  breakMinutes: number;
  isOffDay: boolean;
  isOverride: boolean;
}

/**
 * Resolves the authoritative shift assigned to an employee on a specific YYYY-MM-DD date.
 * Checks date-specific `employee_shifts` first, then falls back to default `emp.shiftId` + `workDays`.
 */
export function resolveEmployeeShiftForDate(
  emp: Employee,
  dateStr: string,
  shifts: Shift[],
  employeeShifts: EmployeeShiftAssignment[]
): ResolvedDailyShift {
  const override = employeeShifts.find(
    (es) => es.employeeId === emp.id && es.date === dateStr
  );
  const offShift = shifts.find((s) => s.isOffDay || s.id === 'SHIFT-OFF') || null;
  const defaultShift = shifts.find((s) => s.id === emp.shiftId) || shifts[0] || null;

  if (override) {
    const matched = shifts.find((s) => s.id === override.shiftId) || offShift || defaultShift;
    const isOff = Boolean(matched?.isOffDay || override.shiftId === 'SHIFT-OFF');
    return {
      shift: matched,
      shiftId: matched?.id || override.shiftId,
      shiftName: isOff ? 'İzinli / Hafta Tatili' : matched?.name || override.shiftId,
      startTime: isOff ? '-' : matched?.startTime || '08:30',
      endTime: isOff ? '-' : matched?.endTime || '17:30',
      toleranceMinutes: matched?.toleranceMinutes ?? 15,
      breakMinutes: matched?.breakMinutes ?? 60,
      isOffDay: isOff,
      isOverride: true,
    };
  }

  const dayName = getTurkishDayName(dateStr);
  const workDays = defaultShift?.workDays || [
    'Pazartesi',
    'Salı',
    'Çarşamba',
    'Perşembe',
    'Cuma',
  ];
  const isWorkDay = Boolean(defaultShift && !defaultShift.isOffDay && workDays.includes(dayName));

  if (!isWorkDay) {
    return {
      shift: offShift,
      shiftId: offShift?.id || 'SHIFT-OFF',
      shiftName: 'Hafta Tatili / OFF',
      startTime: '-',
      endTime: '-',
      toleranceMinutes: 0,
      breakMinutes: 0,
      isOffDay: true,
      isOverride: false,
    };
  }

  return {
    shift: defaultShift,
    shiftId: defaultShift!.id,
    shiftName: defaultShift!.name,
    startTime: defaultShift!.startTime,
    endTime: defaultShift!.endTime,
    toleranceMinutes: defaultShift!.toleranceMinutes ?? 15,
    breakMinutes: defaultShift!.breakMinutes ?? 60,
    isOffDay: false,
    isOverride: false,
  };
}

export type LiveShiftDelayState =
  | 'on_leave'
  | 'off_day'
  | 'not_started'
  | 'on_time'
  | 'late_checkin'
  | 'absent_late'
  | 'checked_out';

export interface LiveShiftDelayInfo {
  employeeId: string;
  dateStr: string;
  resolvedShift: ResolvedDailyShift;
  state: LiveShiftDelayState;
  isDelayed: boolean;
  /** Live or recorded delay minutes relative to shift start time */
  delayMinutes: number;
  /** Short badge copy (e.g. "42 dk gecikti" or "1 sa 15 dk gecikmeli giriş") */
  badgeText: string | null;
  severity: 'none' | 'warning' | 'critical';
  checkInTime: string | null;
  checkOutTime: string | null;
  /** Elapsed or completed net working minutes today */
  workedMinutesToday: number;
}

/**
 * Real-time shift delay calculator.
 * Automatically detects:
 * 1. Employees whose shift start time has passed and who have NOT checked in yet -> live incrementing delay.
 * 2. Employees who checked in AFTER their shift start time -> exact delay badge.
 */
export function calculateLiveShiftDelay(
  emp: Employee,
  now: Date,
  shifts: Shift[],
  employeeShifts: EmployeeShiftAssignment[],
  records: AttendanceRecord[],
  leaves: LeaveRequest[]
): LiveShiftDelayInfo {
  const todayStr = getLocalDateString(now);
  const resolvedShift = resolveEmployeeShiftForDate(emp, todayStr, shifts, employeeShifts);

  // 1. Check approved leave today
  const approvedLeave =
    emp.status === 'leave' ||
    leaves.some(
      (l) =>
        l.employeeId === emp.id &&
        l.status === 'approved' &&
        l.startDate <= todayStr &&
        l.endDate >= todayStr
    );

  // Today's check-in / check-out records for this employee
  const empTodayRecords = records
    .filter((r) => r.employeeId === emp.id && r.date === todayStr)
    .sort((a, b) => (a.timeStr || '').localeCompare(b.timeStr || ''));

  const firstCheckIn = empTodayRecords.find((r) => r.type === 'check_in') || null;
  const checkOuts = empTodayRecords.filter((r) => r.type === 'check_out');
  const lastCheckOut = checkOuts.length > 0 ? checkOuts[checkOuts.length - 1] : null;

  const nowMins = now.getHours() * 60 + now.getMinutes();
  const checkInMins = parseTimeToMinutes(firstCheckIn?.timeStr);
  const checkOutMins = parseTimeToMinutes(lastCheckOut?.timeStr);

  // Compute worked minutes today
  let workedMinutesToday = 0;
  if (checkInMins !== null) {
    if (checkOutMins !== null) {
      workedMinutesToday =
        checkOutMins >= checkInMins ? checkOutMins - checkInMins : 1440 - checkInMins + checkOutMins;
    } else if (emp.currentPresence === 'inside' || emp.currentPresence === 'break') {
      workedMinutesToday = Math.max(0, nowMins - checkInMins);
    }
  }

  if (approvedLeave) {
    return {
      employeeId: emp.id,
      dateStr: todayStr,
      resolvedShift,
      state: 'on_leave',
      isDelayed: false,
      delayMinutes: 0,
      badgeText: null,
      severity: 'none',
      checkInTime: firstCheckIn?.timeStr || null,
      checkOutTime: lastCheckOut?.timeStr || null,
      workedMinutesToday,
    };
  }

  if (resolvedShift.isOffDay) {
    return {
      employeeId: emp.id,
      dateStr: todayStr,
      resolvedShift,
      state: 'off_day',
      isDelayed: false,
      delayMinutes: 0,
      badgeText: null,
      severity: 'none',
      checkInTime: firstCheckIn?.timeStr || null,
      checkOutTime: lastCheckOut?.timeStr || null,
      workedMinutesToday,
    };
  }

  const shiftStartMins = parseTimeToMinutes(resolvedShift.startTime);
  const shiftEndMins = parseTimeToMinutes(resolvedShift.endTime);

  if (shiftStartMins === null) {
    return {
      employeeId: emp.id,
      dateStr: todayStr,
      resolvedShift,
      state: 'not_started',
      isDelayed: false,
      delayMinutes: 0,
      badgeText: null,
      severity: 'none',
      checkInTime: firstCheckIn?.timeStr || null,
      checkOutTime: lastCheckOut?.timeStr || null,
      workedMinutesToday,
    };
  }

  // Case A: Employee HAS checked in today
  if (firstCheckIn && checkInMins !== null) {
    // Compare check-in against shift start (handle midnight wrap for night shifts)
    let rawDelay = checkInMins - shiftStartMins;
    if (shiftStartMins >= 21 * 60 && checkInMins < 6 * 60) {
      rawDelay = 1440 - shiftStartMins + checkInMins;
    }
    // Use exact positive delay past shift start (or stored lateMinutes if higher)
    const computedDelay = Math.max(0, rawDelay);
    const delayMinutes = Math.max(computedDelay, firstCheckIn.lateMinutes || 0);
    const isCheckedOut = Boolean(lastCheckOut && emp.currentPresence === 'outside');

    if (delayMinutes > 0) {
      const formatted = formatMinutesTurkish(delayMinutes);
      return {
        employeeId: emp.id,
        dateStr: todayStr,
        resolvedShift,
        state: isCheckedOut ? 'checked_out' : 'late_checkin',
        isDelayed: true,
        delayMinutes,
        badgeText: `${formatted} gecikmeli giriş`,
        severity: delayMinutes >= 30 ? 'critical' : 'warning',
        checkInTime: firstCheckIn.timeStr,
        checkOutTime: lastCheckOut?.timeStr || null,
        workedMinutesToday,
      };
    }

    return {
      employeeId: emp.id,
      dateStr: todayStr,
      resolvedShift,
      state: isCheckedOut ? 'checked_out' : 'on_time',
      isDelayed: false,
      delayMinutes: 0,
      badgeText: null,
      severity: 'none',
      checkInTime: firstCheckIn.timeStr,
      checkOutTime: lastCheckOut?.timeStr || null,
      workedMinutesToday,
    };
  }

  // Case B: Employee is marked inside/break (e.g., manual presence override) without a check_in record
  if (emp.currentPresence === 'inside' || emp.currentPresence === 'break') {
    const manualMins = parseTimeToMinutes(emp.lastActionTime);
    const delayMinutes = manualMins !== null ? Math.max(0, manualMins - shiftStartMins) : 0;
    return {
      employeeId: emp.id,
      dateStr: todayStr,
      resolvedShift,
      state: delayMinutes > 0 ? 'late_checkin' : 'on_time',
      isDelayed: delayMinutes > 0,
      delayMinutes,
      badgeText: delayMinutes > 0 ? `${formatMinutesTurkish(delayMinutes)} gecikmeli giriş` : null,
      severity: delayMinutes >= 30 ? 'critical' : delayMinutes > 0 ? 'warning' : 'none',
      checkInTime: emp.lastActionTime || null,
      checkOutTime: null,
      workedMinutesToday: manualMins !== null ? Math.max(0, nowMins - manualMins) : 0,
    };
  }

  // Case C: Employee has NOT checked in yet today
  const isOvernightShift = shiftEndMins !== null && shiftEndMins <= shiftStartMins;
  const shiftAlreadyStarted = isOvernightShift
    ? nowMins >= shiftStartMins
    : nowMins > shiftStartMins;

  if (!shiftAlreadyStarted) {
    return {
      employeeId: emp.id,
      dateStr: todayStr,
      resolvedShift,
      state: 'not_started',
      isDelayed: false,
      delayMinutes: 0,
      badgeText: null,
      severity: 'none',
      checkInTime: null,
      checkOutTime: null,
      workedMinutesToday: 0,
    };
  }

  // Shift start time has passed and employee has NOT checked in -> live incrementing delay!
  const elapsedDelay = Math.max(1, nowMins - shiftStartMins);
  return {
    employeeId: emp.id,
    dateStr: todayStr,
    resolvedShift,
    state: 'absent_late',
    isDelayed: true,
    delayMinutes: elapsedDelay,
    badgeText: `${formatMinutesTurkish(elapsedDelay)} gecikti`,
    severity: elapsedDelay >= 15 ? 'critical' : 'warning',
    checkInTime: null,
    checkOutTime: null,
    workedMinutesToday: 0,
  };
}

export interface DailyAttendanceReportRow {
  rowKey: string;
  date: string;
  dayName: string;
  employeeId: string;
  employeeName: string;
  department: string;
  title: string;
  shiftName: string;
  shiftWindow: string;
  isOffDay: boolean;
  checkInTime: string;
  checkOutTime: string;
  netWorkMinutes: number;
  netWorkFormattedHHMM: string;
  netWorkDecimalHours: string;
  isOngoingWork: boolean;
  delayMinutes: number;
  delayFormattedHHMM: string;
  delayFormattedText: string;
  statusLabel:
    | 'Zamanında'
    | 'Gecikmeli Giriş'
    | 'Gecikti (Giriş Yok)'
    | 'İzinli'
    | 'Hafta Tatili'
    | 'Devamsız'
    | 'Bekliyor';
  statusTone: 'emerald' | 'amber' | 'rose' | 'indigo' | 'slate';
}

export interface DailyReportParams {
  startDate: string;
  endDate: string;
  department: string;
  employeeId: string;
  employees: Employee[];
  shifts: Shift[];
  employeeShifts: EmployeeShiftAssignment[];
  records: AttendanceRecord[];
  leaves: LeaveRequest[];
  now?: Date;
}

/**
 * Generates daily per-employee attendance rows with exact Net Working Time and Shift Delay calculations.
 */
export function generateDailyAttendanceRows(params: DailyReportParams): {
  rows: DailyAttendanceReportRow[];
  totalNetWorkMinutes: number;
  totalDelayMinutes: number;
  lateRowCount: number;
  absentRowCount: number;
} {
  const {
    startDate,
    endDate,
    department,
    employeeId,
    employees,
    shifts,
    employeeShifts,
    records,
    leaves,
    now = new Date(),
  } = params;

  const todayStr = getLocalDateString(now);
  const nowMins = now.getHours() * 60 + now.getMinutes();

  const targetEmployees = employees.filter((e) => {
    if (e.status === 'inactive') return false;
    const matchDept = !department || department === 'all' || e.department === department;
    const matchEmp = !employeeId || e.id === employeeId;
    return matchDept && matchEmp;
  });

  // Build inclusive date list (capped at 366 days for safety)
  const dates: string[] = [];
  const startParts = startDate.split('-').map(Number);
  const endParts = endDate.split('-').map(Number);
  if (
    startParts.length === 3 &&
    endParts.length === 3 &&
    !startParts.some(Number.isNaN) &&
    !endParts.some(Number.isNaN)
  ) {
    const cursor = new Date(startParts[0], startParts[1] - 1, startParts[2], 12, 0, 0);
    const endD = new Date(endParts[0], endParts[1] - 1, endParts[2], 12, 0, 0);
    let guard = 0;
    while (cursor <= endD && guard < 366) {
      dates.push(getLocalDateString(cursor));
      cursor.setDate(cursor.getDate() + 1);
      guard++;
    }
  }

  // Newest dates first
  dates.reverse();

  // Index records by `${employeeId}__${date}`
  const recordsByKey = new Map<string, AttendanceRecord[]>();
  for (const r of records) {
    const k = `${r.employeeId}__${r.date}`;
    const list = recordsByKey.get(k);
    if (list) list.push(r);
    else recordsByKey.set(k, [r]);
  }

  const rows: DailyAttendanceReportRow[] = [];
  let totalNetWorkMinutes = 0;
  let totalDelayMinutes = 0;
  let lateRowCount = 0;
  let absentRowCount = 0;

  for (const dateStr of dates) {
    const dayName = getTurkishDayName(dateStr);
    const isToday = dateStr === todayStr;
    const isFuture = dateStr > todayStr;

    for (const emp of targetEmployees) {
      const resolvedShift = resolveEmployeeShiftForDate(emp, dateStr, shifts, employeeShifts);
      const dayRecords = (recordsByKey.get(`${emp.id}__${dateStr}`) || [])
        .slice()
        .sort((a, b) => (a.timeStr || '').localeCompare(b.timeStr || ''));

      const firstIn = dayRecords.find((r) => r.type === 'check_in') || null;
      const checkOuts = dayRecords.filter((r) => r.type === 'check_out');
      const lastOut = checkOuts.length > 0 ? checkOuts[checkOuts.length - 1] : null;

      const approvedLeave = leaves.find(
        (l) =>
          l.employeeId === emp.id &&
          l.status === 'approved' &&
          l.startDate <= dateStr &&
          l.endDate >= dateStr
      );

      const inMins = parseTimeToMinutes(firstIn?.timeStr);
      const outMins = parseTimeToMinutes(lastOut?.timeStr);
      const shiftStartMins = parseTimeToMinutes(resolvedShift.startTime);

      // Net Working Time Calculation
      let netWorkMinutes = 0;
      let isOngoingWork = false;
      if (inMins !== null) {
        if (outMins !== null) {
          netWorkMinutes =
            outMins >= inMins ? outMins - inMins : 1440 - inMins + outMins;
        } else if (isToday && (emp.currentPresence === 'inside' || emp.currentPresence === 'break')) {
          netWorkMinutes = Math.max(0, nowMins - inMins);
          isOngoingWork = true;
        }
      }

      // Daily Delay Calculation
      let delayMinutes = 0;
      let statusLabel: DailyAttendanceReportRow['statusLabel'] = 'Bekliyor';
      let statusTone: DailyAttendanceReportRow['statusTone'] = 'slate';

      if (approvedLeave) {
        statusLabel = 'İzinli';
        statusTone = 'indigo';
      } else if (resolvedShift.isOffDay) {
        statusLabel = 'Hafta Tatili';
        statusTone = 'slate';
      } else if (firstIn && inMins !== null) {
        if (shiftStartMins !== null) {
          let rawDiff = inMins - shiftStartMins;
          if (shiftStartMins >= 21 * 60 && inMins < 6 * 60) {
            rawDiff = 1440 - shiftStartMins + inMins;
          }
          delayMinutes = Math.max(0, rawDiff, firstIn.lateMinutes || 0);
        } else {
          delayMinutes = firstIn.lateMinutes || 0;
        }

        if (delayMinutes > 0) {
          statusLabel = 'Gecikmeli Giriş';
          statusTone = 'amber';
          lateRowCount++;
        } else {
          statusLabel = 'Zamanında';
          statusTone = 'emerald';
        }
      } else if (isFuture) {
        statusLabel = 'Bekliyor';
        statusTone = 'slate';
      } else if (isToday) {
        if (shiftStartMins !== null && nowMins > shiftStartMins) {
          delayMinutes = Math.max(1, nowMins - shiftStartMins);
          statusLabel = 'Gecikti (Giriş Yok)';
          statusTone = 'rose';
          lateRowCount++;
        } else {
          statusLabel = 'Bekliyor';
          statusTone = 'slate';
        }
      } else {
        // Past workday with no check-in and no approved leave
        statusLabel = 'Devamsız';
        statusTone = 'rose';
        absentRowCount++;
      }

      totalNetWorkMinutes += netWorkMinutes;
      totalDelayMinutes += delayMinutes;

      const netWorkFormattedHHMM =
        netWorkMinutes > 0
          ? `${formatMinutesHHMM(netWorkMinutes)}${isOngoingWork ? ' (Canlı)' : ''}`
          : '-';
      const netWorkDecimalHours =
        netWorkMinutes > 0
          ? `${formatMinutesDecimalHours(netWorkMinutes)}${isOngoingWork ? '*' : ''}`
          : '-';

      rows.push({
        rowKey: `${emp.id}__${dateStr}`,
        date: dateStr,
        dayName,
        employeeId: emp.id,
        employeeName: emp.fullName,
        department: emp.department,
        title: emp.title,
        shiftName: resolvedShift.shiftName,
        shiftWindow: resolvedShift.isOffDay
          ? 'OFF'
          : `${resolvedShift.startTime} - ${resolvedShift.endTime}`,
        isOffDay: resolvedShift.isOffDay,
        checkInTime: firstIn?.timeStr || '-',
        checkOutTime: lastOut?.timeStr || (isOngoingWork ? 'Devam Ediyor' : '-'),
        netWorkMinutes,
        netWorkFormattedHHMM,
        netWorkDecimalHours,
        isOngoingWork,
        delayMinutes,
        delayFormattedHHMM: formatMinutesHHMM(delayMinutes),
        delayFormattedText: delayMinutes > 0 ? formatMinutesTurkish(delayMinutes) : '0 dk',
        statusLabel,
        statusTone,
      });
    }
  }

  return {
    rows,
    totalNetWorkMinutes,
    totalDelayMinutes,
    lateRowCount,
    absentRowCount,
  };
}

/**
 * Generates and downloads a real formatted multi-sheet Excel (.xlsx) workbook
 * containing the Daily Working Hours & Delay Report and Employee Summary Matrix.
 */
export function exportDailyReportToXlsx(params: {
  rows: DailyAttendanceReportRow[];
  summaries: EmployeeReportSummary[];
  companyName: string;
  startDate: string;
  endDate: string;
}): void {
  const { rows, summaries, companyName, startDate, endDate } = params;
  const workbook = XLSX.utils.book_new();

  // --- SHEET 1: Günlük Çalışma & Gecikme Detayı ---
  const totalNetMins = rows.reduce((acc, r) => acc + r.netWorkMinutes, 0);
  const totalDelayMins = rows.reduce((acc, r) => acc + r.delayMinutes, 0);

  const detailSheetData: (string | number)[][] = [
    [`${companyName} — GÜNLÜK ÇALIŞMA VE GECİKME SÜRESİ RAPORU`],
    [`Rapor Dönemi: ${startDate} / ${endDate}`, '', '', `Oluşturma: ${new Date().toLocaleString('tr-TR')}`],
    [],
    [
      'Tarih',
      'Gün',
      'Sicil No',
      'Personel Adı',
      'Birim / Departman',
      'Atanan Vardiya',
      'Vardiya Saatleri',
      'Giriş Saati',
      'Çıkış Saati',
      'Net Çalışma (SS:DD)',
      'Net Çalışma (Saat)',
      'Gecikme (SS:DD)',
      'Gecikme (Dk)',
      'Durum',
    ],
    ...rows.map((r) => [
      r.date,
      r.dayName,
      r.employeeId,
      r.employeeName,
      r.department,
      r.shiftName,
      r.shiftWindow,
      r.checkInTime,
      r.checkOutTime,
      r.netWorkFormattedHHMM,
      r.netWorkMinutes > 0 ? Number((r.netWorkMinutes / 60).toFixed(2)) : 0,
      r.delayFormattedHHMM,
      r.delayMinutes,
      r.statusLabel,
    ]),
    [],
    [
      'TOPLAM',
      `${rows.length} Kayıt`,
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      formatMinutesHHMM(totalNetMins),
      Number((totalNetMins / 60).toFixed(2)),
      formatMinutesHHMM(totalDelayMins),
      totalDelayMins,
      '',
    ],
  ];

  const wsDetail = XLSX.utils.aoa_to_sheet(detailSheetData);

  // Merge title banner across columns A..N
  wsDetail['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 13 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 2 } },
    { s: { r: 1, c: 3 }, e: { r: 1, c: 6 } },
  ];

  // AutoFilter on table header row (row index 3 -> Excel row 4)
  wsDetail['!autofilter'] = {
    ref: `A4:N${Math.max(4, rows.length + 4)}`,
  };

  // Readable column widths
  wsDetail['!cols'] = [
    { wch: 13 }, // Tarih
    { wch: 12 }, // Gün
    { wch: 12 }, // Sicil No
    { wch: 24 }, // Personel Adı
    { wch: 22 }, // Birim
    { wch: 24 }, // Atanan Vardiya
    { wch: 16 }, // Vardiya Saatleri
    { wch: 12 }, // Giriş Saati
    { wch: 14 }, // Çıkış Saati
    { wch: 19 }, // Net Çalışma (SS:DD)
    { wch: 18 }, // Net Çalışma (Saat)
    { wch: 16 }, // Gecikme (SS:DD)
    { wch: 14 }, // Gecikme (Dk)
    { wch: 20 }, // Durum
  ];

  XLSX.utils.book_append_sheet(workbook, wsDetail, 'Günlük Detay');

  // --- SHEET 2: Personel Özet Matrisi ---
  const summarySheetData: (string | number)[][] = [
    [`${companyName} — PERSONEL BAZLI DEVAMLILIK VE MESAI ÖZETİ (${startDate} - ${endDate})`],
    [],
    [
      'Sicil No',
      'Ad Soyad',
      'Birim / Departman',
      'Ünvan',
      'Hedef İş Günü',
      'Fiili Gelinen Gün',
      'Devam Oranı (%)',
      'Gecikme Adedi',
      'Toplam Gecikme (Dk)',
      'Devamsızlık (Gün)',
      'İzinli (Gün)',
      'Toplam Çalışma (Saat)',
      'Fazla Mesai (Saat)',
    ],
    ...summaries.map((s) => [
      s.employeeId,
      s.fullName,
      s.department,
      s.title,
      s.totalDays,
      s.presentDays,
      s.attendanceRate,
      s.lateCount,
      s.totalLateMinutes,
      s.absenceCount,
      s.leaveDays,
      Number(s.totalWorkHours.toFixed(2)),
      Number(s.overtimeHours.toFixed(2)),
    ]),
  ];

  const wsSummary = XLSX.utils.aoa_to_sheet(summarySheetData);
  wsSummary['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 12 } }];
  wsSummary['!autofilter'] = {
    ref: `A3:M${Math.max(3, summaries.length + 3)}`,
  };
  wsSummary['!cols'] = [
    { wch: 12 },
    { wch: 24 },
    { wch: 22 },
    { wch: 22 },
    { wch: 14 },
    { wch: 16 },
    { wch: 16 },
    { wch: 14 },
    { wch: 18 },
    { wch: 16 },
    { wch: 13 },
    { wch: 20 },
    { wch: 18 },
  ];

  XLSX.utils.book_append_sheet(workbook, wsSummary, 'Personel Özeti');

  const safeCompany = (companyName || 'PDKS')
    .replace(/[^a-zA-Z0-9ğüşıöçĞÜŞİÖÇ_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 30);
  const fileName = `${safeCompany || 'PDKS'}_Calisma_Gecikme_Raporu_${startDate}_${endDate}.xlsx`;

  XLSX.writeFile(workbook, fileName);
}
