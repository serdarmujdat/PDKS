import React, { useState, useEffect, useMemo } from 'react';
import {
  Users,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Timer,
  Calendar,
  CalendarCheck,
  Send,
  Coffee,
  Check,
  X,
  Search,
  Filter,
  ArrowRight,
  ShieldCheck,
  Lock,
  ChevronRight,
  Info,
  BellRing,
  UserCheck,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import {
  Employee,
  AttendanceRecord,
  Shift,
  OvertimeRequest,
  LeaveRequest,
  CurrentUser,
  SupervisorAssignment,
} from '../types/pdks';
import { pdksStorage } from '../services/storage';
import { detectShiftTimeConflict } from './ShiftAndLeaveManagement';

interface SupervisorDashboardProps {
  currentUser: CurrentUser;
  onNavigateToShifts?: () => void;
  onNavigateToKiosk?: () => void;
}

export const SupervisorDashboard: React.FC<SupervisorDashboardProps> = ({
  currentUser,
  onNavigateToShifts,
  onNavigateToKiosk,
}) => {
  const isHRManager = pdksStorage.isHRorSuperAdmin(currentUser);

  // State
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [overtimeRequests, setOvertimeRequests] = useState<OvertimeRequest[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [supervisorAssignments, setSupervisorAssignments] = useState<SupervisorAssignment[]>([]);
  
  // For HR user: allow selecting which Birim Amiri to inspect
  const [selectedSupervisorId, setSelectedSupervisorId] = useState<string>('');

  // Active view tab inside Birim Dashboard
  const [activeSubTab, setActiveSubTab] = useState<'attendance' | 'missing-shifts' | 'overtime'>('attendance');

  // Filters
  const [attendanceStatusFilter, setAttendanceStatusFilter] = useState<'all' | 'inside' | 'break' | 'late' | 'outside' | 'leave'>('all');
  const [attendanceSearch, setAttendanceSearch] = useState<string>('');
  const [overtimeFilter, setOvertimeFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');

  // Quick Shift Assign Modal inside Dashboard
  const [assignModalEmployee, setAssignModalEmployee] = useState<Employee | null>(null);
  const [selectedShiftId, setSelectedShiftId] = useState<string>('');

  // Feedback toast
  const [feedbackToast, setFeedbackToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [sentReminderIds, setSentReminderIds] = useState<Record<string, boolean>>({});

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setFeedbackToast({ type, message });
    setTimeout(() => setFeedbackToast(null), 3500);
  };

  const loadData = () => {
    setEmployees(pdksStorage.getEmployees());
    setRecords(pdksStorage.getAttendanceRecords());
    setShifts(pdksStorage.getShifts());
    setOvertimeRequests(pdksStorage.getOvertimeRequests());
    setLeaveRequests(pdksStorage.getLeaveRequests());
    const assignments = pdksStorage.getSupervisorAssignments();
    setSupervisorAssignments(assignments);

    // If HR manager and no supervisor selected yet, pick first supervisor
    if (isHRManager && assignments.length > 0 && !selectedSupervisorId) {
      setSelectedSupervisorId(assignments[0].supervisorId);
    }
  };

  useEffect(() => {
    loadData();

    const handleLiveEvent = () => {
      loadData();
    };
    window.addEventListener('pdks-notification', handleLiveEvent);
    return () => window.removeEventListener('pdks-notification', handleLiveEvent);
  }, [isHRManager]);

  // Determine active supervisor context
  const activeSupervisor = useMemo(() => {
    if (isHRManager) {
      const match = supervisorAssignments.find(
        (sa) => sa.supervisorId === selectedSupervisorId || sa.id === selectedSupervisorId
      );
      if (match) return match;
      return supervisorAssignments[0] || null;
    }
    // Normal supervisor: match by currentUser
    const match = supervisorAssignments.find(
      (sa) =>
        sa.supervisorId === currentUser.employeeId ||
        sa.supervisorId === currentUser.id ||
        (currentUser.employeeId && sa.supervisorId === currentUser.employeeId) ||
        sa.supervisorName.toLowerCase() === currentUser.name.toLowerCase()
    );
    return match || null;
  }, [isHRManager, selectedSupervisorId, supervisorAssignments, currentUser]);

  // Responsible employee IDs for current supervisor view
  const responsibleEmpIds = useMemo(() => {
    if (isHRManager && activeSupervisor) {
      return activeSupervisor.assignedEmployeeIds || [];
    }
    return pdksStorage.getResponsibleEmployeeIdsForUser(currentUser);
  }, [isHRManager, activeSupervisor, currentUser]);

  // Filtered responsible employees list
  const responsibleEmployees = useMemo(() => {
    return employees.filter((e) => responsibleEmpIds.includes(e.id));
  }, [employees, responsibleEmpIds]);

  // Today string format YYYY-MM-DD
  const todayStr = useMemo(() => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }, []);

  // Compute attendance status for each responsible employee today
  const employeeAttendanceStatus = useMemo(() => {
    return responsibleEmployees.map((emp) => {
      const empShift = shifts.find((s) => s.id === emp.shiftId) || shifts[0];
      const todayRecord = records.find(
        (r) => r.employeeId === emp.id && r.date === todayStr && r.type === 'check_in'
      );
      const isLeave =
        emp.status === 'leave' ||
        leaveRequests.some(
          (l) =>
            l.employeeId === emp.id &&
            l.status === 'approved' &&
            l.startDate <= todayStr &&
            l.endDate >= todayStr
        );

      let statusCategory: 'inside' | 'break' | 'late' | 'outside' | 'leave';
      let statusLabel: string;
      let checkInTime: string | null = todayRecord ? todayRecord.timeStr : null;

      if (isLeave) {
        statusCategory = 'leave';
        statusLabel = 'İzinli / Raporlu';
      } else if (emp.currentPresence === 'break') {
        statusCategory = 'break';
        statusLabel = 'Molada';
      } else if (emp.currentPresence === 'inside') {
        if (todayRecord && todayRecord.status === 'late') {
          statusCategory = 'late';
          statusLabel = `Geç Geldi (${todayRecord.lateMinutes} dk)`;
        } else {
          statusCategory = 'inside';
          statusLabel = 'Çalışıyor (Zamanında)';
        }
      } else {
        statusCategory = 'outside';
        statusLabel = todayRecord ? 'Mesaisi Bitti (Çıkış Yaptı)' : 'Henüz Gelmedi';
      }

      return {
        employee: emp,
        shift: empShift,
        todayRecord,
        statusCategory,
        statusLabel,
        checkInTime,
        isLeave,
      };
    });
  }, [responsibleEmployees, shifts, records, todayStr, leaveRequests]);

  // Attendance summary metrics
  const attendanceMetrics = useMemo(() => {
    const total = employeeAttendanceStatus.length;
    const insideCount = employeeAttendanceStatus.filter(
      (e) => e.statusCategory === 'inside' || e.statusCategory === 'late'
    ).length;
    const breakCount = employeeAttendanceStatus.filter((e) => e.statusCategory === 'break').length;
    const lateCount = employeeAttendanceStatus.filter((e) => e.statusCategory === 'late').length;
    const outsideCount = employeeAttendanceStatus.filter((e) => e.statusCategory === 'outside').length;
    const leaveCount = employeeAttendanceStatus.filter((e) => e.statusCategory === 'leave').length;
    const attendanceRate = total > 0 ? Math.round(((insideCount + breakCount) / total) * 100) : 0;

    return {
      total,
      insideCount,
      breakCount,
      lateCount,
      outsideCount,
      leaveCount,
      attendanceRate,
    };
  }, [employeeAttendanceStatus]);

  // Missing Shift Plans Analysis
  const missingShiftAnalysis = useMemo(() => {
    return responsibleEmployees.map((emp) => {
      const hasShiftId = Boolean(emp.shiftId && emp.shiftId.trim() !== '');
      const assignedShift = shifts.find((s) => s.id === emp.shiftId);
      const isShiftValid = Boolean(hasShiftId && assignedShift);
      const hasWorkDays = assignedShift ? (assignedShift.workDays || []).length > 0 : false;

      let issueType: 'no_shift' | 'invalid_shift' | 'no_workdays' | 'ok' = 'ok';
      let issueMessage = 'Vardiya planı tanımlı ve güncel.';

      if (!hasShiftId) {
        issueType = 'no_shift';
        issueMessage = 'Personele atanmış herhangi bir vardiya bulunmuyor.';
      } else if (!assignedShift) {
        issueType = 'invalid_shift';
        issueMessage = `Atanan vardiya kodu (${emp.shiftId}) sistem tanımlarında bulunamadı.`;
      } else if (!hasWorkDays) {
        issueType = 'no_workdays';
        issueMessage = `Atanan "${assignedShift.name}" vardiyasında aktif çalışma günü tanımlanmamış.`;
      }

      return {
        employee: emp,
        shift: assignedShift,
        issueType,
        issueMessage,
        isMissingOrDefective: issueType !== 'ok',
      };
    });
  }, [responsibleEmployees, shifts]);

  const missingShiftsCount = useMemo(() => {
    return missingShiftAnalysis.filter((m) => m.isMissingOrDefective).length;
  }, [missingShiftAnalysis]);

  // Overtime Requests for Responsible Personnel
  const responsibleOvertimeRequests = useMemo(() => {
    return overtimeRequests.filter((ot) => responsibleEmpIds.includes(ot.employeeId));
  }, [overtimeRequests, responsibleEmpIds]);

  const pendingOvertimeRequests = useMemo(() => {
    return responsibleOvertimeRequests.filter((ot) => ot.status === 'pending');
  }, [responsibleOvertimeRequests]);

  const pendingOvertimeHours = useMemo(() => {
    return pendingOvertimeRequests.reduce((sum, ot) => sum + (ot.hours || 0), 0);
  }, [pendingOvertimeRequests]);

  // Filtered Attendance List
  const filteredAttendanceList = useMemo(() => {
    return employeeAttendanceStatus.filter((item) => {
      // Category filter
      if (attendanceStatusFilter === 'inside' && item.statusCategory !== 'inside') return false;
      if (attendanceStatusFilter === 'late' && item.statusCategory !== 'late') return false;
      if (attendanceStatusFilter === 'break' && item.statusCategory !== 'break') return false;
      if (attendanceStatusFilter === 'outside' && item.statusCategory !== 'outside') return false;
      if (attendanceStatusFilter === 'leave' && item.statusCategory !== 'leave') return false;

      // Search filter
      if (attendanceSearch.trim() !== '') {
        const query = attendanceSearch.toLowerCase();
        const matchName = item.employee.fullName.toLowerCase().includes(query);
        const matchId = item.employee.id.toLowerCase().includes(query);
        const matchTitle = item.employee.title.toLowerCase().includes(query);
        if (!matchName && !matchId && !matchTitle) return false;
      }
      return true;
    });
  }, [employeeAttendanceStatus, attendanceStatusFilter, attendanceSearch]);

  // Filtered Overtime List
  const filteredOvertimeList = useMemo(() => {
    return responsibleOvertimeRequests.filter((ot) => {
      if (overtimeFilter === 'all') return true;
      return ot.status === overtimeFilter;
    });
  }, [responsibleOvertimeRequests, overtimeFilter]);

  // Overtime Approval Handler
  const handleApproveOvertime = (ot: OvertimeRequest) => {
    const reviewer = `${currentUser.name} (Birim Amiri)`;
    const updated = pdksStorage.updateOvertimeStatus(ot.id, 'approved', reviewer);
    if (updated) {
      loadData();
      showToast(`✅ ${ot.employeeName} için ${ot.hours} saatlik fazla mesai talebi onaylandı.`);
    }
  };

  // Overtime Reject Handler
  const handleRejectOvertime = (ot: OvertimeRequest) => {
    if (window.confirm(`${ot.employeeName} personeline ait ${ot.hours} saatlik fazla mesai talebini reddetmek istediğinize emin misiniz?`)) {
      const reviewer = `${currentUser.name} (Birim Amiri)`;
      const updated = pdksStorage.updateOvertimeStatus(ot.id, 'rejected', reviewer);
      if (updated) {
        loadData();
        showToast(`❌ ${ot.employeeName} fazla mesai talebi reddedildi.`);
      }
    }
  };

  // Shift Assignment Submit
  const handleAssignShiftSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignModalEmployee || !selectedShiftId) return;

    const targetShift = shifts.find((s) => s.id === selectedShiftId);
    if (!targetShift) return;

    const updatedEmp: Employee = {
      ...assignModalEmployee,
      shiftId: selectedShiftId,
    };

    pdksStorage.saveEmployee(updatedEmp);
    loadData();
    setAssignModalEmployee(null);
    showToast(`✅ ${assignModalEmployee.fullName} personeline "${targetShift.name}" vardiyası atandı.`);

    pdksStorage.addNotification({
      type: 'shift_reminder',
      title: 'Vardiya Planınız Güncellendi',
      message: `Sayın ${assignModalEmployee.fullName}, çalışma vardiyanız Birim Amiriniz ${currentUser.name} tarafından "${targetShift.name}" (${targetShift.startTime} - ${targetShift.endTime}) olarak belirlendi.`,
      employeeId: assignModalEmployee.id,
      employeeName: assignModalEmployee.fullName,
      department: assignModalEmployee.department,
      severity: 'info',
    });
  };

  // Send Shift Reminder to Employee
  const handleSendReminder = (emp: Employee) => {
    const curShift = shifts.find((s) => s.id === emp.shiftId) || shifts[0];
    pdksStorage.addNotification({
      type: 'shift_reminder',
      title: 'Birim Amiri Mesai Hatırlatması',
      message: `Sayın ${emp.fullName}, Birim Amiriniz ${currentUser.name} tarafından mesai başlangıcınız hatırlatılmıştır. Lütfen QR kartınızı okutarak girişinizi tamamlayınız. (${curShift?.name || 'Vardiya'}: ${curShift?.startTime} - ${curShift?.endTime})`,
      employeeId: emp.id,
      employeeName: emp.fullName,
      department: emp.department,
      severity: 'warning',
    });

    setSentReminderIds((prev) => ({ ...prev, [emp.id]: true }));
    showToast(`${emp.fullName} personeline mesai başlangıç hatırlatması iletildi.`);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Toast Feedback Notification */}
      {feedbackToast && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl shadow-xl flex items-center gap-2 text-xs font-bold text-white animate-in slide-in-from-bottom ${
            feedbackToast.type === 'success' ? 'bg-emerald-600' : 'bg-rose-600'
          }`}
        >
          {feedbackToast.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0" />
          )}
          <span>{feedbackToast.message}</span>
        </div>
      )}

      {/* Header Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Birim Amiri Operasyon Paneli
            </h1>
            <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-900 border border-amber-300 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-amber-600" />
              <span>Birim Dashboard</span>
            </span>
            {isHRManager && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200">
                İK Denetim Modu
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Yalnızca sorumlu olduğunuz personellerin anlık katılım durumları, eksik vardiya planları ve amir onayına düşen fazla mesai talepleri.
          </p>
        </div>

        {/* HR Switcher & Fast Actions */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* If HR: Supervisor Switcher */}
          {isHRManager && supervisorAssignments.length > 0 && (
            <div className="flex items-center gap-1.5 bg-white border border-slate-300 rounded-xl px-2.5 py-1.5 shadow-2xs">
              <span className="text-[11px] font-semibold text-slate-500">Amir İncele:</span>
              <select
                value={selectedSupervisorId}
                onChange={(e) => setSelectedSupervisorId(e.target.value)}
                className="text-xs font-bold text-indigo-700 bg-transparent focus:outline-none cursor-pointer"
              >
                {supervisorAssignments.map((sa) => (
                  <option key={sa.id} value={sa.supervisorId}>
                    👑 {sa.supervisorName} ({sa.department}) · {sa.assignedEmployeeIds.length} Personel
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Quick Shifts Nav */}
          {onNavigateToShifts && (
            <button
              onClick={onNavigateToShifts}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 shadow-2xs transition-colors cursor-pointer"
            >
              <Calendar className="w-4 h-4 text-indigo-600" />
              <span>Vardiya Takvimine Git</span>
              <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
            </button>
          )}

          <button
            onClick={loadData}
            className="p-2 rounded-xl text-slate-600 bg-white hover:bg-slate-100 border border-slate-300 shadow-2xs transition-colors cursor-pointer"
            title="Verileri Yenile"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Active Supervisor Info Strip */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <img
            src={
              activeSupervisor
                ? employees.find((e) => e.id === activeSupervisor.supervisorId)?.avatar ||
                  currentUser.avatar
                : currentUser.avatar
            }
            alt="Amir Avatar"
            className="w-12 h-12 rounded-2xl object-cover border border-slate-200 shadow-2xs shrink-0"
          />
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-slate-900 leading-tight">
                {activeSupervisor ? activeSupervisor.supervisorName : currentUser.name}
              </h2>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-200">
                Yetkili Birim Amiri
              </span>
            </div>
            <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2">
              <span>{activeSupervisor ? activeSupervisor.department : currentUser.department}</span>
              <span aria-hidden="true">·</span>
              <span className="font-semibold text-indigo-700 font-mono">
                {responsibleEmployees.length} Sorumlu Personel
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-6 border-t md:border-t-0 md:border-l border-slate-100 pt-3 md:pt-0 md:pl-6 text-xs">
          <div>
            <div className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">Bugün</div>
            <div className="font-bold text-slate-800 font-mono mt-0.5">
              {new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'short' })}
            </div>
          </div>
          <div>
            <div className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">Anlık Katılım</div>
            <div className="font-bold text-emerald-700 font-mono mt-0.5 flex items-center gap-1">
              <span>%{attendanceMetrics.attendanceRate}</span>
              <span className="text-[10px] text-slate-400 font-normal">
                ({attendanceMetrics.insideCount + attendanceMetrics.breakCount}/{attendanceMetrics.total})
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 3 CORE SUMMARY PANELS (Prompt Requirements) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Panel 1: Anlık Katılım Durumu */}
        <div
          onClick={() => setActiveSubTab('attendance')}
          className={`bg-white border rounded-2xl p-5 shadow-xs transition-all cursor-pointer relative overflow-hidden ${
            activeSubTab === 'attendance'
              ? 'border-indigo-500 ring-2 ring-indigo-500/20'
              : 'border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-500 flex items-center gap-1.5">
              <Users className="w-4 h-4 text-indigo-600" />
              <span>1. Anlık Katılım Durumu</span>
            </span>
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700">
              Canlı
            </span>
          </div>

          <div className="space-y-3">
            <div className="flex items-baseline justify-between">
              <div className="text-2xl font-black text-slate-900 font-mono">
                {attendanceMetrics.insideCount}
                <span className="text-sm font-semibold text-slate-400">/{attendanceMetrics.total}</span>
              </div>
              <div className="text-xs font-bold text-emerald-700 font-mono">
                %{attendanceMetrics.attendanceRate} İşte
              </div>
            </div>

            {/* Quick breakdown badges */}
            <div className="grid grid-cols-2 gap-1.5 text-[11px] pt-1">
              <div className="flex items-center justify-between p-1.5 rounded-lg bg-emerald-50/70 border border-emerald-100 text-emerald-950">
                <span>Mesai Başında:</span>
                <span className="font-bold font-mono">{attendanceMetrics.insideCount}</span>
              </div>
              <div className="flex items-center justify-between p-1.5 rounded-lg bg-amber-50/70 border border-amber-100 text-amber-950">
                <span>Molada:</span>
                <span className="font-bold font-mono">{attendanceMetrics.breakCount}</span>
              </div>
              <div className="flex items-center justify-between p-1.5 rounded-lg bg-rose-50/70 border border-rose-100 text-rose-950">
                <span>Geç Kalan:</span>
                <span className="font-bold font-mono">{attendanceMetrics.lateCount}</span>
              </div>
              <div className="flex items-center justify-between p-1.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-700">
                <span>Giriş Yapmadı:</span>
                <span className="font-bold font-mono">{attendanceMetrics.outsideCount}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Panel 2: Eksik Vardiya Planları */}
        <div
          onClick={() => setActiveSubTab('missing-shifts')}
          className={`bg-white border rounded-2xl p-5 shadow-xs transition-all cursor-pointer relative overflow-hidden ${
            activeSubTab === 'missing-shifts'
              ? 'border-indigo-500 ring-2 ring-indigo-500/20'
              : 'border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-500 flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-amber-600" />
              <span>2. Eksik Vardiya Planları</span>
            </span>
            {missingShiftsCount > 0 ? (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 animate-pulse">
                {missingShiftsCount} Eksik
              </span>
            ) : (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                Tamamlandı
              </span>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex items-baseline justify-between">
              <div
                className={`text-2xl font-black font-mono ${
                  missingShiftsCount > 0 ? 'text-rose-600' : 'text-slate-900'
                }`}
              >
                {missingShiftsCount}
                <span className="text-sm font-semibold text-slate-400"> Personel</span>
              </div>
              <div className="text-[11px] font-medium text-slate-500">
                {missingShiftsCount > 0 ? 'Müdahale Gerekli' : 'Tümü Planlandı'}
              </div>
            </div>

            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 text-[11px] leading-relaxed text-slate-600">
              {missingShiftsCount > 0 ? (
                <div className="text-rose-900 font-medium flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                  <span>
                    {missingShiftsCount} personelin vardiyası atanmamış veya eksik. Planlamak için tıklayın.
                  </span>
                </div>
              ) : (
                <div className="text-emerald-900 font-medium flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>Sorumlu olduğunuz tüm personellerin haftalık vardiyaları eksiksiz planlanmıştır.</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Panel 3: Amir Onayına Düşen Fazla Mesailer */}
        <div
          onClick={() => setActiveSubTab('overtime')}
          className={`bg-white border rounded-2xl p-5 shadow-xs transition-all cursor-pointer relative overflow-hidden ${
            activeSubTab === 'overtime'
              ? 'border-indigo-500 ring-2 ring-indigo-500/20'
              : 'border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-500 flex items-center gap-1.5">
              <Timer className="w-4 h-4 text-purple-600" />
              <span>3. Fazla Mesai Talepleri</span>
            </span>
            {pendingOvertimeRequests.length > 0 ? (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300">
                {pendingOvertimeRequests.length} Onay Bekliyor
              </span>
            ) : (
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                Talep Yok
              </span>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex items-baseline justify-between">
              <div className="text-2xl font-black text-slate-900 font-mono">
                {pendingOvertimeRequests.length}
                <span className="text-sm font-semibold text-slate-400"> Talep</span>
              </div>
              <div className="text-xs font-bold text-purple-700 font-mono">
                {pendingOvertimeHours} Saat Toplam
              </div>
            </div>

            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 text-[11px] leading-relaxed text-slate-600">
              {pendingOvertimeRequests.length > 0 ? (
                <div className="text-amber-900 font-medium flex items-center gap-1.5">
                  <BellRing className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span>
                    Birim amiri onayınıza sunulan {pendingOvertimeRequests.length} talep incelenmeyi bekliyor.
                  </span>
                </div>
              ) : (
                <div className="text-slate-500 flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>Şu an inceleme bekleyen yeni fazla mesai başvurusu bulunmuyor.</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* SUB-TABS NAVIGATION CONTROLS */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-3 overflow-x-auto text-xs">
        <button
          onClick={() => setActiveSubTab('attendance')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeSubTab === 'attendance'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Anlık Katılım Takibi</span>
          <span
            className={`px-1.5 py-0.2 rounded-full text-[10px] ${
              activeSubTab === 'attendance' ? 'bg-indigo-500 text-white' : 'bg-slate-100 text-slate-600'
            }`}
          >
            {responsibleEmployees.length}
          </span>
        </button>

        <button
          onClick={() => setActiveSubTab('missing-shifts')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeSubTab === 'missing-shifts'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>Eksik Vardiya Planları</span>
          {missingShiftsCount > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-rose-500 text-white">
              {missingShiftsCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveSubTab('overtime')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeSubTab === 'overtime'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <Timer className="w-4 h-4" />
          <span>Fazla Mesai Onayları</span>
          {pendingOvertimeRequests.length > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-500 text-white">
              {pendingOvertimeRequests.length}
            </span>
          )}
        </button>
      </div>

      {/* ============================================================== */}
      {/* SECTION 1: ANLIK KATILIM TAKİBİ                                */}
      {/* ============================================================== */}
      {activeSubTab === 'attendance' && (
        <div className="space-y-4">
          {/* Filters & Search Toolbar */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
            {/* Segmented Filter Buttons */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs no-scrollbar">
              <button
                onClick={() => setAttendanceStatusFilter('all')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  attendanceStatusFilter === 'all'
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                Tümü ({employeeAttendanceStatus.length})
              </button>
              <button
                onClick={() => setAttendanceStatusFilter('inside')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  attendanceStatusFilter === 'inside'
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-600 hover:bg-emerald-50'
                }`}
              >
                İşte ({attendanceMetrics.insideCount})
              </button>
              <button
                onClick={() => setAttendanceStatusFilter('break')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  attendanceStatusFilter === 'break'
                    ? 'bg-amber-600 text-white'
                    : 'text-slate-600 hover:bg-amber-50'
                }`}
              >
                Molada ({attendanceMetrics.breakCount})
              </button>
              <button
                onClick={() => setAttendanceStatusFilter('late')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  attendanceStatusFilter === 'late'
                    ? 'bg-rose-600 text-white'
                    : 'text-slate-600 hover:bg-rose-50'
                }`}
              >
                Geç Kalan ({attendanceMetrics.lateCount})
              </button>
              <button
                onClick={() => setAttendanceStatusFilter('outside')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  attendanceStatusFilter === 'outside'
                    ? 'bg-slate-700 text-white'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                Giriş Yapmadı ({attendanceMetrics.outsideCount})
              </button>
              <button
                onClick={() => setAttendanceStatusFilter('leave')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  attendanceStatusFilter === 'leave'
                    ? 'bg-purple-600 text-white'
                    : 'text-slate-600 hover:bg-purple-50'
                }`}
              >
                İzinli ({attendanceMetrics.leaveCount})
              </button>
            </div>

            {/* Search Input */}
            <div className="relative sm:w-64">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Personel ara..."
                value={attendanceSearch}
                onChange={(e) => setAttendanceSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-indigo-500"
              />
            </div>
          </div>

          {/* Attendance Cards / Table */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs min-w-[750px]">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold">
                    <th className="py-3 px-4">Personel Bilgisi</th>
                    <th className="py-3 px-4">Anlık Durum</th>
                    <th className="py-3 px-4">Bugünkü Vardiyası</th>
                    <th className="py-3 px-4">Giriş Saati</th>
                    <th className="py-3 px-4 text-right">İşlemler</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredAttendanceList.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-slate-400 text-xs">
                        Filtreye uygun sorumlu personel bulunamadı.
                      </td>
                    </tr>
                  ) : (
                    filteredAttendanceList.map((item) => {
                      const emp = item.employee;
                      const hasSentReminder = sentReminderIds[emp.id];

                      return (
                        <tr key={emp.id} className="hover:bg-slate-50/70 transition-colors">
                          {/* Identity */}
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-3">
                              <div className="relative">
                                <img
                                  src={emp.avatar}
                                  alt={emp.fullName}
                                  className="w-9 h-9 rounded-xl object-cover border border-slate-200 shrink-0"
                                />
                                <span
                                  className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${
                                    item.statusCategory === 'inside'
                                      ? 'bg-emerald-500'
                                      : item.statusCategory === 'break'
                                      ? 'bg-amber-500'
                                      : item.statusCategory === 'late'
                                      ? 'bg-rose-500'
                                      : item.statusCategory === 'leave'
                                      ? 'bg-purple-500'
                                      : 'bg-slate-400'
                                  }`}
                                />
                              </div>
                              <div>
                                <div className="font-bold text-slate-900 leading-tight">
                                  {emp.fullName}
                                </div>
                                <div className="text-[10px] text-slate-500 mt-0.5">
                                  {emp.title} · <span className="font-mono text-indigo-600 font-semibold">{emp.id}</span>
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Status */}
                          <td className="py-3 px-4">
                            <span
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border ${
                                item.statusCategory === 'inside'
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                  : item.statusCategory === 'break'
                                  ? 'bg-amber-50 text-amber-800 border-amber-200'
                                  : item.statusCategory === 'late'
                                  ? 'bg-rose-50 text-rose-800 border-rose-200'
                                  : item.statusCategory === 'leave'
                                  ? 'bg-purple-50 text-purple-800 border-purple-200'
                                  : 'bg-slate-100 text-slate-600 border-slate-200'
                              }`}
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${
                                  item.statusCategory === 'inside'
                                    ? 'bg-emerald-600'
                                    : item.statusCategory === 'break'
                                    ? 'bg-amber-600'
                                    : item.statusCategory === 'late'
                                    ? 'bg-rose-600'
                                    : item.statusCategory === 'leave'
                                    ? 'bg-purple-600'
                                    : 'bg-slate-400'
                                }`}
                              />
                              <span>{item.statusLabel}</span>
                            </span>
                          </td>

                          {/* Scheduled Shift */}
                          <td className="py-3 px-4">
                            <div>
                              <div className="font-bold text-slate-800">{item.shift.name}</div>
                              <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                                {item.shift.startTime} - {item.shift.endTime} (±{item.shift.toleranceMinutes} dk)
                              </div>
                            </div>
                          </td>

                          {/* Check-in Time */}
                          <td className="py-3 px-4 font-mono">
                            {item.checkInTime ? (
                              <div>
                                <span className="font-bold text-slate-900">{item.checkInTime}</span>
                                {item.todayRecord?.status === 'late' && (
                                  <span className="block text-[10px] text-rose-600 font-semibold">
                                    +{item.todayRecord.lateMinutes} dk gecikme
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-400 italic">Kayıt Yok</span>
                            )}
                          </td>

                          {/* Actions */}
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* If absent / outside, allow sending reminder */}
                              {item.statusCategory === 'outside' && (
                                <button
                                  type="button"
                                  disabled={hasSentReminder}
                                  onClick={() => handleSendReminder(emp)}
                                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                                    hasSentReminder
                                      ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                      : 'bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200'
                                  }`}
                                  title="Personele mesai başlangıç hatırlatması gönder"
                                >
                                  <Send className="w-3 h-3 text-amber-600" />
                                  <span>{hasSentReminder ? 'İletildi' : 'Hatırlat'}</span>
                                </button>
                              )}

                              {/* Quick Reassign */}
                              <button
                                type="button"
                                onClick={() => {
                                  setAssignModalEmployee(emp);
                                  setSelectedShiftId(emp.shiftId || shifts[0]?.id || '');
                                }}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 transition-colors cursor-pointer"
                                title="Vardiyayı Değiştir"
                              >
                                <span>Vardiya Ata</span>
                              </button>
                            </div>
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

      {/* ============================================================== */}
      {/* SECTION 2: EKSİK VARDİYA PLANLARI                              */}
      {/* ============================================================== */}
      {activeSubTab === 'missing-shifts' && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-600" />
                  <span>Sorumlu Personeller Vardiya Planlama Durumu</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Vardiyası atanmamış veya hatalı yapılandırılmış personeller aşağıda listelenmektedir.
                </p>
              </div>

              {onNavigateToShifts && (
                <button
                  type="button"
                  onClick={onNavigateToShifts}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer shrink-0"
                >
                  <Calendar className="w-3.5 h-3.5" />
                  <span>Haftalık Takvimde Düzenle</span>
                </button>
              )}
            </div>

            {/* List of Missing / Defective Shifts */}
            {missingShiftsCount === 0 ? (
              <div className="p-8 text-center space-y-3 bg-emerald-50/50 border border-emerald-200 rounded-xl">
                <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 mx-auto flex items-center justify-center">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <h4 className="text-sm font-bold text-emerald-950">
                  Tüm Sorumlu Personellerin Vardiya Planı Eksiksiz!
                </h4>
                <p className="text-xs text-emerald-800 max-w-md mx-auto">
                  Sorumluluğunuzdaki {responsibleEmployees.length} personelin tamamı tanımlı ve aktif bir vardiyaya atanmıştır. Eksik veya çakışan planlama bulunmamaktadır.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-950 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>
                    Aşağıdaki {missingShiftsCount} personelin vardiya planlaması tamamlanmamıştır. Lütfen "Vardiya Ata" butonunu kullanarak planlamayı tamamlayınız.
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {missingShiftAnalysis
                    .filter((m) => m.isMissingOrDefective)
                    .map((item) => (
                      <div
                        key={item.employee.id}
                        className="bg-white border border-rose-200 hover:border-rose-300 rounded-xl p-4 shadow-2xs space-y-3 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-3">
                            <img
                              src={item.employee.avatar}
                              alt={item.employee.fullName}
                              className="w-10 h-10 rounded-xl object-cover border border-slate-200 shrink-0"
                            />
                            <div>
                              <div className="font-bold text-xs text-slate-900">
                                {item.employee.fullName}
                              </div>
                              <div className="text-[10px] text-slate-500">
                                {item.employee.department} · {item.employee.title}
                              </div>
                            </div>
                          </div>

                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800">
                            Eksik Plan
                          </span>
                        </div>

                        <div className="p-2.5 rounded-lg bg-rose-50/70 border border-rose-100 text-[11px] text-rose-900">
                          <strong>Durum:</strong> {item.issueMessage}
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => {
                              setAssignModalEmployee(item.employee);
                              setSelectedShiftId(shifts[0]?.id || '');
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer shadow-2xs"
                          >
                            <Clock className="w-3.5 h-3.5" />
                            <span>Hemen Vardiya Ata</span>
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* Coverage Table of All Staff */}
            <div className="pt-4 border-t border-slate-100 space-y-2">
              <h4 className="text-xs font-bold text-slate-800">
                Tüm Sorumlu Personellerin Mevcut Vardiya Durumu ({responsibleEmployees.length})
              </h4>
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                {missingShiftAnalysis.map((item) => (
                  <div
                    key={item.employee.id}
                    className="p-3 bg-white flex items-center justify-between gap-3 text-xs hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <img
                        src={item.employee.avatar}
                        alt={item.employee.fullName}
                        className="w-7 h-7 rounded-lg object-cover shrink-0 border border-slate-200"
                      />
                      <div className="truncate">
                        <span className="font-bold text-slate-900">{item.employee.fullName}</span>
                        <span className="text-slate-400 ml-1 text-[11px]">({item.employee.title})</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {item.shift ? (
                        <div className="text-right">
                          <span className="font-semibold text-slate-800">{item.shift.name}</span>
                          <span className="block text-[10px] text-slate-400 font-mono">
                            {item.shift.startTime} - {item.shift.endTime} · {(item.shift.workDays || []).length} Gün
                          </span>
                        </div>
                      ) : (
                        <span className="text-[11px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded">
                          Atanmamış
                        </span>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          setAssignModalEmployee(item.employee);
                          setSelectedShiftId(item.shift?.id || shifts[0]?.id || '');
                        }}
                        className="p-1 text-slate-400 hover:text-indigo-600 rounded cursor-pointer"
                        title="Vardiyayı Değiştir"
                      >
                        <Clock className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* SECTION 3: FAZLA MESAİ ONAYLARI                                */}
      {/* ============================================================== */}
      {activeSubTab === 'overtime' && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Timer className="w-4 h-4 text-purple-600" />
                  <span>Amir Onayına Düşen Fazla Mesai Talepleri</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Sorumlu olduğunuz personellerin fazla mesai başvurularını inceleyip doğrudan onaylayabilir veya reddedebilirsiniz.
                </p>
              </div>

              {/* Status filter */}
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs">
                <button
                  type="button"
                  onClick={() => setOvertimeFilter('pending')}
                  className={`px-3 py-1 rounded-lg font-bold transition-colors cursor-pointer ${
                    overtimeFilter === 'pending'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Onay Bekleyenler ({pendingOvertimeRequests.length})
                </button>
                <button
                  type="button"
                  onClick={() => setOvertimeFilter('approved')}
                  className={`px-3 py-1 rounded-lg font-semibold transition-colors cursor-pointer ${
                    overtimeFilter === 'approved'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Onaylananlar ({responsibleOvertimeRequests.filter((o) => o.status === 'approved').length})
                </button>
                <button
                  type="button"
                  onClick={() => setOvertimeFilter('all')}
                  className={`px-3 py-1 rounded-lg font-semibold transition-colors cursor-pointer ${
                    overtimeFilter === 'all'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Tümü ({responsibleOvertimeRequests.length})
                </button>
              </div>
            </div>

            {/* Overtime List */}
            {filteredOvertimeList.length === 0 ? (
              <div className="p-8 text-center space-y-2 bg-slate-50 border border-slate-200 rounded-xl">
                <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-400 mx-auto flex items-center justify-center">
                  <Timer className="w-5 h-5" />
                </div>
                <h4 className="text-xs font-bold text-slate-700">
                  {overtimeFilter === 'pending'
                    ? 'Onay bekleyen fazla mesai talebi bulunmuyor.'
                    : 'Filtreye uygun fazla mesai kaydı bulunamadı.'}
                </h4>
                <p className="text-[11px] text-slate-400">
                  Personeller mobil portaldan fazla mesai bildirdiğinde burada görünecektir.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredOvertimeList.map((ot) => {
                  const emp = employees.find((e) => e.id === ot.employeeId);
                  const isPending = ot.status === 'pending';

                  return (
                    <div
                      key={ot.id}
                      className={`p-4 rounded-xl border transition-all ${
                        isPending
                          ? 'bg-amber-50/40 border-amber-200'
                          : ot.status === 'approved'
                          ? 'bg-white border-slate-200'
                          : 'bg-slate-50 border-slate-200 opacity-75'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <img
                            src={
                              emp?.avatar ||
                              'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop'
                            }
                            alt={ot.employeeName}
                            className="w-10 h-10 rounded-xl object-cover border border-slate-200 shrink-0"
                          />
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-900 text-xs">{ot.employeeName}</span>
                              <span className="text-[10px] text-slate-400 font-mono">({ot.id})</span>
                              {isPending ? (
                                <span className="px-2 py-0.2 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                                  Amir Onayı Bekliyor
                                </span>
                              ) : ot.status === 'approved' ? (
                                <span className="px-2 py-0.2 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                  ✓ Onaylandı
                                </span>
                              ) : (
                                <span className="px-2 py-0.2 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                                  ✕ Reddedildi
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500 mt-0.5">
                              {ot.department} · Tarih: <span className="font-mono font-semibold text-slate-800">{ot.date}</span> (
                              {ot.startTime} - {ot.endTime}) · <strong className="text-purple-700">{ot.hours} Saat</strong>
                            </div>
                          </div>
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-2 self-end sm:self-auto">
                          {isPending ? (
                            <>
                              <button
                                type="button"
                                onClick={() => handleApproveOvertime(ot)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer shadow-2xs"
                                title="Fazla mesaiyi onayla"
                              >
                                <Check className="w-3.5 h-3.5" />
                                <span>Onayla</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRejectOvertime(ot)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg text-xs font-bold transition-colors cursor-pointer border border-rose-200"
                                title="Fazla mesaiyi reddet"
                              >
                                <X className="w-3.5 h-3.5" />
                                <span>Reddet</span>
                              </button>
                            </>
                          ) : (
                            <span className="text-[10px] text-slate-400 font-mono">
                              İnceleyen: {ot.reviewedBy || 'Yetkili'}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Stated Reason */}
                      {ot.reason && (
                        <div className="mt-2.5 pt-2 border-t border-slate-100 text-[11px] text-slate-600">
                          <span className="font-semibold text-slate-800">Mesai Gerekçesi: </span>
                          <span>{ot.reason}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* QUICK SHIFT ASSIGNMENT MODAL INSIDE DASHBOARD */}
      {assignModalEmployee && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <img
                  src={assignModalEmployee.avatar}
                  alt={assignModalEmployee.fullName}
                  className="w-10 h-10 rounded-xl object-cover border border-slate-200 shadow-2xs shrink-0"
                />
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    {assignModalEmployee.fullName} · Vardiya Planla
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    {assignModalEmployee.department} · {assignModalEmployee.title}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAssignModalEmployee(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAssignShiftSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Atanacak Yeni Vardiya
                </label>
                <select
                  required
                  value={selectedShiftId}
                  onChange={(e) => setSelectedShiftId(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                >
                  <option value="">-- Vardiya Seçin --</option>
                  {shifts.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.startTime} - {s.endTime}) [±{s.toleranceMinutes} dk]
                    </option>
                  ))}
                </select>
              </div>

              {/* Conflict Preview */}
              {selectedShiftId && (() => {
                const targetShift = shifts.find((s) => s.id === selectedShiftId);
                const currentShift = shifts.find((s) => s.id === assignModalEmployee.shiftId);
                if (targetShift && currentShift && targetShift.id !== currentShift.id) {
                  const conflict = detectShiftTimeConflict(targetShift, currentShift);
                  if (conflict.hasConflict) {
                    return (
                      <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-950 text-[11px] space-y-1">
                        <div className="font-bold flex items-center gap-1 text-amber-800">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                          <span>Çakışma Uyarısı</span>
                        </div>
                        <p>{conflict.message}</p>
                      </div>
                    );
                  }
                }
                return null;
              })()}

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setAssignModalEmployee(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl shadow-xs transition-colors cursor-pointer"
                >
                  Vardiyayı Kaydet & Bildir
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
