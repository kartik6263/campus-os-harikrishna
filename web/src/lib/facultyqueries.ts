/**
 * Server state for the faculty portal (Phase 2).
 *
 * Same approach as `queries.ts`: each screen already renders a particular
 * shape, so the `legacy*` hooks adapt the API response into that same shape.
 * The screens swap a mock import for a hook call rather than being rewritten
 * around a new data model.
 *
 * Covers: profile, teaching load, timetable, today's classes, rosters and the
 * register, attendance marking and corrections, internal marks with the
 * approval chain, mentoring, leave and study material.
 */
import { useMemo } from 'react';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { formatDate } from './queries';

// ─── API shapes ───────────────────────────────────────────────────────────────

export type SubjectKind = 'THEORY' | 'LAB' | 'PROJECT';
export type ApiAttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';
export type ApiMarksStatus = 'NOT_STARTED' | 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'RETURNED';
export type ApiLeaveStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
export type ApiLeaveKind =
  | 'CASUAL' | 'MEDICAL' | 'EARNED' | 'STUDY' | 'DUTY' | 'MATERNITY' | 'UNPAID';
export type ApiMaterialType = 'PDF' | 'PPT' | 'VIDEO' | 'LINK';

export interface FacultyProfile {
  id: string;
  employeeId: string;
  teacherCode: string | null;
  name: string;
  nameHi: string | null;
  designation: string;
  department: string;
  email: string;
  mobile: string | null;
  joinDate: string;
  specialization: string | null;
  isHod: boolean;
  college: { code: string; name: string; district: string | null };
  maxWeeklyLoad: number;
  currentLoad: number;
  menteesCount: number;
  subjectsCount: number;
  term: string;
}

export interface ApiAssignment {
  assignmentId: string;
  code: string;
  name: string;
  credits: number;
  semester: number;
  classLabel: string;
  section: string;
  room: string;
  kind: SubjectKind;
  totalStudents: number;
  marksStatus: ApiMarksStatus;
}

export interface ApiTimetableSlot {
  slotId: string;
  time: string;
  startTime: string;
  endTime: string;
  code: string;
  subject: string;
  classLabel: string | null;
  kind: SubjectKind;
  room: string;
  cancelled: boolean;
  cancelReason: string | null;
  hours: number;
}

export interface ApiTodayClass {
  slotId: string;
  sessionId: string | null;
  time: string;
  startTime: string;
  endTime: string;
  code: string;
  subject: string;
  classLabel: string | null;
  kind: SubjectKind;
  room: string;
  cancelled: boolean;
  cancelReason: string | null;
  attendanceMarked: boolean;
  markedAt: string | null;
  locked: boolean;
  lockedAt: string | null;
  studentsPresent: number | null;
  totalStudents: number;
  extra?: boolean;
  /** Taking this class for a colleague. */
  coveringFor?: string | null;
  /** A colleague takes this one. */
  coveredBy?: string | null;
}

export interface ApiRosterStudent {
  id: string;
  rollNo: string;
  enrolmentNo: string;
  name: string;
  nameHi: string | null;
  mobile: string | null;
  attendance: number;
  present: number;
  held: number;
}

export interface ApiSheetStudent {
  id: string;
  rollNo: string;
  name: string;
  nameHi: string | null;
  status: ApiAttendanceStatus | null;
  source: string | null;
  markedAt: string | null;
}

export interface ApiCorrection {
  id: string;
  studentId: string;
  rollNo: string;
  enrolmentNo: string;
  studentName: string;
  code: string;
  subject: string;
  date: string;
  time: string;
  markedAs: ApiAttendanceStatus;
  requestedStatus: ApiAttendanceStatus;
  reason: string;
  attachment: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  raisedAt: string;
  decidedAt: string | null;
  decisionNote: string | null;
}

export interface ApiMarksSheet {
  assignmentId: string;
  sheetId: string;
  code: string;
  subject: string;
  classLabel: string;
  kind: SubjectKind;
  status: ApiMarksStatus;
  submittedAt: string | null;
  decidedAt: string | null;
  decidedBy: string | null;
  returnReason: string | null;
  editable: boolean;
  maxTotal: number;
  components: Array<{ key: string; label: string; maxMarks: number; description: string | null }>;
  students: Array<{
    studentId: string;
    rollNo: string;
    enrolmentNo: string;
    name: string;
    marks: Record<string, number | null>;
    total: number;
    complete: boolean;
  }>;
}

export interface ApiMenteeSubject {
  code: string;
  name: string;
  faculty: string;
  attendance: number;
  present: number;
  held: number;
  internalMarks: number | null;
  maxInternal: number | null;
}

export interface ApiMentee {
  mentorshipId: string;
  id: string;
  rollNo: string;
  enrolmentNo: string;
  name: string;
  nameHi: string | null;
  mobile: string | null;
  programme: string;
  semester: number;
  attendance: number;
  cgpa: number | null;
  backlogs: number;
  lastInteraction: string | null;
  atRisk: boolean;
  alerts: string[];
  subjects: ApiMenteeSubject[];
}

export interface ApiLeave {
  id: string;
  kind: ApiLeaveKind;
  from: string;
  to: string;
  days: number;
  reason: string;
  substitute: string | null;
  status: ApiLeaveStatus;
  appliedAt: string;
  decidedAt: string | null;
  decidedBy: string | null;
  decisionNote: string | null;
}

export interface ApiMaterial {
  id: string;
  code: string;
  subject: string;
  unit: number;
  unitTitle: string;
  filename: string;
  url: string | null;
  type: ApiMaterialType;
  size: string | null;
  visibleToStudents: boolean;
  uploadedAt: string;
}

// ─── Queries ──────────────────────────────────────────────────────────────────

const keys = {
  profile: ['faculty', 'profile'] as const,
  subjects: ['faculty', 'subjects'] as const,
  timetable: ['faculty', 'timetable'] as const,
  today: (date?: string) => ['faculty', 'today', date ?? 'today'] as const,
  roster: (id: string) => ['faculty', 'roster', id] as const,
  sheet: (id: string) => ['faculty', 'sheet', id] as const,
  corrections: ['faculty', 'corrections'] as const,
  marks: (id: string) => ['faculty', 'marks', id] as const,
  mentees: ['faculty', 'mentees'] as const,
  leaves: ['faculty', 'leaves'] as const,
  materials: ['faculty', 'materials'] as const,
};

export const useFacultyProfile = () =>
  useQuery({ queryKey: keys.profile, queryFn: () => api<FacultyProfile>('/api/faculty/profile') });

export const useFacultyAssignments = () =>
  useQuery({ queryKey: keys.subjects, queryFn: () => api<ApiAssignment[]>('/api/faculty/subjects') });

export const useFacultyTimetableApi = () =>
  useQuery({
    queryKey: keys.timetable,
    queryFn: () =>
      api<{ term: string; totalHours: number; days: Record<string, ApiTimetableSlot[]> }>(
        '/api/faculty/timetable',
      ),
  });

export const useTodayClasses = (date?: string) =>
  useQuery({
    queryKey: keys.today(date),
    queryFn: () =>
      api<{ date: string; day: string; classes: ApiTodayClass[] }>(
        `/api/faculty/classes/today${date ? `?date=${date}` : ''}`,
      ),
  });

export const useRoster = (assignmentId: string | null) =>
  useQuery({
    queryKey: keys.roster(assignmentId ?? 'none'),
    enabled: !!assignmentId,
    queryFn: () =>
      api<{
        assignmentId: string;
        code: string;
        subject: string;
        classLabel: string;
        room: string;
        kind: SubjectKind;
        students: ApiRosterStudent[];
      }>(`/api/faculty/subjects/${assignmentId}/roster`),
  });

export interface ApiDaySheet {
  assignmentId: string;
  code: string;
  subject: string;
  classLabel: string;
  date: string;
  scheduled: boolean;
  slotId: string | null;
  time: string | null;
  room: string;
  cancelled: boolean;
  sessionId: string | null;
  markedAt: string | null;
  locked: boolean;
  lockedAt: string | null;
  lockHours: number;
  students: ApiSheetStudent[];
}

/** The roll call for one subject on one day, opened or not. */
export const useDaySheet = (assignmentId: string | null, date: string) =>
  useQuery({
    queryKey: ['faculty', 'daysheet', assignmentId ?? 'none', date],
    enabled: !!assignmentId,
    queryFn: () =>
      api<ApiDaySheet>(`/api/faculty/subjects/${assignmentId}/sheet?date=${date}`),
  });

/** Saves it, opening the session on the first save. */
export function useSaveDaySheet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      assignmentId,
      date,
      records,
      draft,
    }: {
      assignmentId: string;
      date: string;
      records: Array<{ studentId: string; status: ApiAttendanceStatus }>;
      draft?: boolean;
    }) =>
      api<{ sessionId: string; saved: number; present: number; absent: number }>(
        `/api/faculty/subjects/${assignmentId}/sheet`,
        { method: 'POST', body: { date, records, draft: draft ?? false } },
      ),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['faculty'] }),
  });
}

export const useCorrections = () =>
  useQuery({
    queryKey: keys.corrections,
    queryFn: () => api<ApiCorrection[]>('/api/faculty/corrections'),
  });

export const useMenteesApi = () =>
  useQuery({ queryKey: keys.mentees, queryFn: () => api<ApiMentee[]>('/api/faculty/mentees') });

export const useLeavesApi = () =>
  useQuery({
    queryKey: keys.leaves,
    queryFn: () =>
      api<{ daysTakenThisYear: number; pending: number; leaves: ApiLeave[] }>(
        '/api/faculty/leaves',
      ),
  });

export const useMaterialsApi = () =>
  useQuery({ queryKey: keys.materials, queryFn: () => api<ApiMaterial[]>('/api/faculty/materials') });

// ─── Mutations ────────────────────────────────────────────────────────────────

/** Opens the roll call for a slot, then hands back the session to mark against. */
export function useOpenSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ slotId, date }: { slotId: string; date?: string }) =>
      api<{ sessionId: string; code: string; date: string }>(
        `/api/faculty/classes/${slotId}/session`,
        { method: 'POST', body: { ...(date ? { date } : {}) } },
      ),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['faculty', 'today'] }),
  });
}

export function useMarkAttendance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      sessionId,
      records,
    }: {
      sessionId: string;
      records: Array<{ studentId: string; status: ApiAttendanceStatus }>;
    }) =>
      api<{ saved: number; present: number; absent: number }>(
        `/api/faculty/sessions/${sessionId}/attendance`,
        { method: 'POST', body: { records } },
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['faculty'] });
    },
  });
}

export function useDecideCorrection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, decision, note }: { id: string; decision: 'APPROVE' | 'REJECT'; note?: string }) =>
      api(`/api/faculty/corrections/${id}/decide`, { method: 'POST', body: { decision, note } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['faculty'] }),
  });
}

export function useSaveMarks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      assignmentId,
      entries,
    }: {
      assignmentId: string;
      entries: Array<{ studentId: string; component: string; value: number | null }>;
    }) =>
      api<{ saved: number; status: ApiMarksStatus }>(
        `/api/faculty/marks/${assignmentId}/entries`,
        { method: 'PUT', body: { entries } },
      ),
    onSuccess: (_d, v) => {
      void qc.invalidateQueries({ queryKey: keys.marks(v.assignmentId) });
      void qc.invalidateQueries({ queryKey: keys.subjects });
    },
  });
}

export function useSubmitMarks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (assignmentId: string) =>
      api<{ status: ApiMarksStatus }>(`/api/faculty/marks/${assignmentId}/submit`, {
        method: 'POST',
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['faculty'] }),
  });
}

export function useApplyLeave() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      kind: ApiLeaveKind;
      from: string;
      to: string;
      reason: string;
      substitute?: string;
    }) => api<ApiLeave>('/api/faculty/leaves', { method: 'POST', body }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.leaves }),
  });
}

export function useCancelLeave() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api(`/api/faculty/leaves/${id}/cancel`, { method: 'POST' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.leaves }),
  });
}

export function useAddMaterial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      code: string;
      unit: number;
      unitTitle: string;
      filename: string;
      type: ApiMaterialType;
      size?: string;
      url?: string;
      visibleToStudents?: boolean;
    }) => api<{ id: string }>('/api/faculty/materials', { method: 'POST', body }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.materials }),
  });
}

export function useUpdateMaterial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; unitTitle?: string; visibleToStudents?: boolean }) =>
      api(`/api/faculty/materials/${id}`, { method: 'PATCH', body }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.materials }),
  });
}

export function useDeleteMaterial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/api/faculty/materials/${id}`, { method: 'DELETE' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.materials }),
  });
}

/** Cancels a class on the timetable, optionally notifying the enrolled students. */
export function useCancelClass() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ slotId, reason, notify }: { slotId: string; reason: string; notify: boolean }) =>
      api<{ notified: number }>(`/api/faculty/slots/${slotId}/cancel`, {
        method: "POST",
        body: { reason, notify },
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["faculty"] }),
  });
}

export function useAddMentorNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ studentId, note }: { studentId: string; note: string }) =>
      api(`/api/faculty/mentees/${studentId}/notes`, { method: 'POST', body: { note } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.mentees }),
  });
}

// ═══ Legacy adapters — the shapes the screens already render ═════════════════

export interface LegacyFaculty {
  id: string;
  employeeId: string;
  name: string;
  nameHi: string;
  designation: string;
  department: string;
  college: string;
  collegeCode: string;
  email: string;
  mobile: string;
  joinDate: string;
  experience: string;
  specialization: string;
  maxWeeklyLoad: number;
  currentLoad: number;
  menteesCount: number;
  isHod: boolean;
}

/** Whole years between a join date and today, as the profile card prints it. */
function experienceFrom(joinDate: string): string {
  const years = Math.floor((Date.now() - new Date(joinDate).getTime()) / (365.25 * 86_400_000));
  return `${years} year${years === 1 ? '' : 's'}`;
}

/** `FACULTY` as every faculty screen expects it. */
export function useFacultyRecord() {
  const q = useFacultyProfile();
  const f = q.data;

  return {
    data: f
      ? ({
          id: f.teacherCode ?? f.employeeId,
          employeeId: f.employeeId,
          name: f.name,
          nameHi: f.nameHi ?? f.name,
          designation: f.designation,
          department: f.department,
          college: f.college.name,
          collegeCode: f.college.code,
          email: f.email,
          mobile: f.mobile ?? '—',
          joinDate: formatDate(f.joinDate),
          experience: experienceFrom(f.joinDate),
          specialization: f.specialization ?? '—',
          maxWeeklyLoad: f.maxWeeklyLoad,
          currentLoad: f.currentLoad,
          menteesCount: f.menteesCount,
          isHod: f.isHod,
        } satisfies LegacyFaculty)
      : null,
    isPending: q.isPending,
    error: q.error,
  };
}

export interface LegacyFacultySubject {
  assignmentId: string;
  code: string;
  name: string;
  classLabel: string;
  semester: number;
  programme: string;
  section: string;
  totalStudents: number;
  room: string;
  credits: number;
  type: 'theory' | 'lab' | 'project';
  marksStatus: 'not_started' | 'draft' | 'submitted' | 'approved' | 'returned';
}

const kindToType = (k: SubjectKind) => k.toLowerCase() as 'theory' | 'lab' | 'project';

/** `MY_SUBJECTS`, with the assignment id the write paths need carried along. */
export function useMySubjects() {
  const q = useFacultyAssignments();
  return {
    data: (q.data ?? []).map<LegacyFacultySubject>((a) => ({
      assignmentId: a.assignmentId,
      code: a.code,
      name: a.name,
      classLabel: a.classLabel,
      semester: a.semester,
      // "BCA V Sem A" — the programme is the first token.
      programme: a.classLabel.split(' ')[0] ?? '',
      section: a.section,
      totalStudents: a.totalStudents,
      room: a.room,
      credits: a.credits,
      type: kindToType(a.kind),
      marksStatus: a.marksStatus.toLowerCase() as LegacyFacultySubject['marksStatus'],
    })),
    isPending: q.isPending,
    error: q.error,
  };
}

export interface LegacyTodayClass {
  slotId: string;
  sessionId: string | null;
  time: string;
  subject: string;
  code: string;
  classLabel: string;
  room: string;
  type: 'theory' | 'lab' | 'project';
  attendanceMarked: boolean;
  studentsPresent?: number;
  totalStudents: number;
  cancelled?: boolean;
  cancelReason?: string | null;
  locked: boolean;
  extra?: boolean;
  coveringFor?: string | null;
  coveredBy?: string | null;
}

/** `TODAY_CLASSES` as the dashboard expects it. */
export function useTodayClassList(date?: string) {
  const q = useTodayClasses(date);
  return {
    data: (q.data?.classes ?? []).map<LegacyTodayClass>((c) => ({
      slotId: c.slotId,
      sessionId: c.sessionId,
      time: c.time,
      subject: c.subject,
      code: c.code,
      classLabel: c.classLabel ?? '',
      room: c.room,
      type: kindToType(c.kind),
      attendanceMarked: c.attendanceMarked,
      studentsPresent: c.studentsPresent ?? undefined,
      totalStudents: c.totalStudents,
      cancelled: c.cancelled,
      cancelReason: c.cancelReason,
      locked: c.locked,
      extra: c.extra,
      coveringFor: c.coveringFor ?? null,
      coveredBy: c.coveredBy ?? null,
    })),
    date: q.data?.date ?? null,
    day: q.data?.day ?? null,
    isPending: q.isPending,
    error: q.error,
  };
}

export interface LegacyRosterStudent {
  id: string;
  rollNo: string;
  name: string;
  mobile?: string;
  attendance?: number;
}

/** `ROSTER[code]` for one class. */
export function useRosterList(assignmentId: string | null) {
  const q = useRoster(assignmentId);
  return {
    data: (q.data?.students ?? []).map<LegacyRosterStudent>((s) => ({
      id: s.id,
      rollNo: s.rollNo,
      name: s.name,
      mobile: s.mobile ?? undefined,
      attendance: s.attendance,
    })),
    isPending: q.isPending,
    error: q.error,
  };
}

export interface LegacyCorrection {
  id: string;
  studentId: string;
  studentName: string;
  rollNo: string;
  code: string;
  date: string;
  markedAs: 'P' | 'A' | 'L' | 'E';
  requestedStatus: 'P' | 'A' | 'L' | 'E';
  reason: string;
  attachment?: string;
  raisedOn: string;
  status: 'pending' | 'approved' | 'rejected';
}

const SHORT: Record<ApiAttendanceStatus, 'P' | 'A' | 'L' | 'E'> = {
  PRESENT: 'P',
  ABSENT: 'A',
  LATE: 'L',
  EXCUSED: 'E',
};

/** `CORRECTION_REQUESTS` as the dashboard and marking screen expect it. */
export function useCorrectionList() {
  const q = useCorrections();
  return {
    data: (q.data ?? []).map<LegacyCorrection>((c) => ({
      id: c.id,
      studentId: c.studentId,
      studentName: c.studentName,
      rollNo: c.rollNo,
      code: c.code,
      date: formatDate(c.date),
      markedAs: SHORT[c.markedAs],
      requestedStatus: SHORT[c.requestedStatus],
      reason: c.reason,
      attachment: c.attachment ?? undefined,
      raisedOn: formatDate(c.raisedAt),
      status: c.status.toLowerCase() as LegacyCorrection['status'],
    })),
    isPending: q.isPending,
    error: q.error,
  };
}

export interface LegacyMarksComponent {
  id: string;
  label: string;
  maxMarks: number;
  description: string;
}

export interface LegacyStudentMarks {
  studentId: string;
  rollNo: string;
  name: string;
  marks: Record<string, number | null>;
}

export interface LegacySubjectMarks {
  assignmentId: string;
  status: 'not_started' | 'draft' | 'submitted' | 'approved' | 'returned';
  submittedOn?: string;
  approvedBy?: string;
  returnReason?: string;
  editable: boolean;
  components: LegacyMarksComponent[];
  students: LegacyStudentMarks[];
}

/**
 * `MARKS_DATA` keyed by subject code, plus the components each sheet actually
 * carries. One request per assignment — the lecturer has a handful, and the
 * screen shows a status badge for every one of them at once.
 */
export function useMarksData(assignments: LegacyFacultySubject[]) {
  const results = useQueries({
    queries: assignments.map((a) => ({
      queryKey: keys.marks(a.assignmentId),
      queryFn: () => api<ApiMarksSheet>(`/api/faculty/marks/${a.assignmentId}`),
    })),
  });

  // Memoised on when each sheet last changed. The marks screen seeds its
  // editable grid from this in an effect, so a fresh object every render
  // would re-seed on every render and never settle.
  const stamp = results.map((r) => r.dataUpdatedAt).join(',');
  const codes = assignments.map((a) => a.code).join(',');

  const data = useMemo(() => {
    const out: Record<string, LegacySubjectMarks> = {};
    assignments.forEach((a, i) => {
      const sheet = results[i]?.data;
      if (!sheet) return;
      out[a.code] = {
        assignmentId: a.assignmentId,
        status: sheet.status.toLowerCase() as LegacySubjectMarks['status'],
        submittedOn: sheet.submittedAt ? formatDate(sheet.submittedAt) : undefined,
        approvedBy: sheet.decidedBy ?? undefined,
        returnReason: sheet.returnReason ?? undefined,
        editable: sheet.editable,
        components: sheet.components.map((c) => ({
          id: c.key,
          label: c.label,
          maxMarks: c.maxMarks,
          description: c.description ?? '',
        })),
        students: sheet.students.map((s) => ({
          studentId: s.studentId,
          rollNo: s.rollNo,
          name: s.name,
          marks: s.marks,
        })),
      };
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stamp, codes]);

  return {
    data,
    isPending: results.some((r) => r.isPending),
    error: results.find((r) => r.error)?.error ?? null,
  };
}

export interface LegacyMentee {
  id: string;
  rollNo: string;
  name: string;
  programme: string;
  semester: number;
  attendance: number;
  cgpa: number;
  lastInteraction: string;
  atRisk: boolean;
  alerts: string[];
  subjects: Array<{
    code: string;
    name: string;
    attendance: number;
    internalMarks: number;
    maxInternal: number;
  }>;
}

/** `MENTEES` as the mentoring screen expects it. */
export function useMenteeList() {
  const q = useMenteesApi();
  return {
    data: (q.data ?? []).map<LegacyMentee>((m) => ({
      id: m.id,
      rollNo: m.rollNo,
      name: m.name,
      programme: m.programme,
      semester: m.semester,
      attendance: m.attendance,
      cgpa: m.cgpa ?? 0,
      lastInteraction: m.lastInteraction ? formatDate(m.lastInteraction) : '—',
      atRisk: m.atRisk,
      alerts: m.alerts,
      subjects: m.subjects.map((s) => ({
        code: s.code,
        name: s.name,
        attendance: s.attendance,
        internalMarks: s.internalMarks ?? 0,
        maxInternal: s.maxInternal ?? 0,
      })),
    })),
    isPending: q.isPending,
    error: q.error,
  };
}

export interface LegacyLeave {
  id: string;
  type: string;
  kind: ApiLeaveKind;
  from: string;
  to: string;
  days: number;
  reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  appliedOn: string;
  approvedBy?: string;
  rejectReason?: string;
  substituteArranged?: string;
}

/** The labels the apply form offers, and the enum each one maps to. */
export const LEAVE_KIND_LABELS: Record<ApiLeaveKind, string> = {
  CASUAL: 'Casual Leave',
  MEDICAL: 'Medical Leave',
  EARNED: 'Earned Leave',
  STUDY: 'Study Leave',
  MATERNITY: 'Maternity/Paternity Leave',
  DUTY: 'Duty Leave',
  UNPAID: 'Leave Without Pay',
};

export const LEAVE_LABEL_TO_KIND = Object.fromEntries(
  Object.entries(LEAVE_KIND_LABELS).map(([k, v]) => [v, k as ApiLeaveKind]),
) as Record<string, ApiLeaveKind>;

/** `FACULTY_LEAVES` as the leave screen expects it. */
export function useLeaveList() {
  const q = useLeavesApi();
  return {
    data: (q.data?.leaves ?? []).map<LegacyLeave>((l) => ({
      id: l.id,
      type: LEAVE_KIND_LABELS[l.kind],
      kind: l.kind,
      from: formatDate(l.from),
      to: formatDate(l.to),
      days: l.days,
      reason: l.reason,
      status: l.status.toLowerCase() as LegacyLeave['status'],
      appliedOn: formatDate(l.appliedAt),
      approvedBy: l.decidedBy ?? undefined,
      rejectReason: l.status === 'REJECTED' ? (l.decisionNote ?? undefined) : undefined,
      substituteArranged: l.substitute ?? undefined,
    })),
    daysTaken: q.data?.daysTakenThisYear ?? 0,
    isPending: q.isPending,
    error: q.error,
  };
}

export interface LegacyMaterial {
  id: string;
  subjectCode: string;
  unit: number;
  unitTitle: string;
  filename: string;
  type: 'pdf' | 'video' | 'link' | 'ppt';
  uploadedOn: string;
  size?: string;
  visibleToStudents: boolean;
}

/** `STUDY_MATERIALS` as the material screen expects it. */
export function useMaterialList() {
  const q = useMaterialsApi();
  return {
    data: (q.data ?? []).map<LegacyMaterial>((m) => ({
      id: m.id,
      subjectCode: m.code,
      unit: m.unit,
      unitTitle: m.unitTitle,
      filename: m.filename,
      type: m.type.toLowerCase() as LegacyMaterial['type'],
      uploadedOn: formatDate(m.uploadedAt),
      size: m.size ?? undefined,
      visibleToStudents: m.visibleToStudents,
    })),
    isPending: q.isPending,
    error: q.error,
  };
}

/** `FACULTY_TIMETABLE` keyed by the three-letter day the grid uses. */
export function useFacultyTimetableGrid() {
  const q = useFacultyTimetableApi();

  const DAY_LABELS: Record<string, string> = {
    MON: 'Mon', TUE: 'Tue', WED: 'Wed', THU: 'Thu', FRI: 'Fri', SAT: 'Sat',
  };

  const data: Record<string, Array<{
    slotId: string;
    time: string;
    subject: string;
    code: string;
    classLabel: string;
    room: string;
    type: string;
    cancelled: boolean;
  }>> = {};

  for (const [apiDay, label] of Object.entries(DAY_LABELS)) {
    data[label] = (q.data?.days?.[apiDay] ?? []).map((s) => ({
      slotId: s.slotId,
      time: s.time,
      subject: s.subject,
      code: s.code,
      classLabel: s.classLabel ?? '',
      room: s.room,
      type: kindToType(s.kind),
      cancelled: s.cancelled,
    }));
  }

  return { data, totalHours: q.data?.totalHours ?? 0, isPending: q.isPending, error: q.error };
}
