/**
 * Server state for the web app.
 *
 * Where a screen already renders a particular shape, the hook adapts the API
 * response into that same shape (see the `legacy*` helpers). That keeps the
 * large portal screens intact — they swap a mock import for a hook call
 * rather than being rewritten around a new data model.
 *
 * Phase 1 covers: profile, attendance, timetable, fees, results, transport,
 * notifications and announcements. Screens outside that set (certificates,
 * hostel, library, grievance, syllabus, placement) still read
 * `src/lib/studentdata.ts` and are marked as such at their import site.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { payFeeItem, payInstalment } from './payments';

// ─── API shapes ───────────────────────────────────────────────────────────────

export interface Profile {
  id: string;
  enrolmentNo: string;
  rollNo: string;
  name: string;
  nameHi: string | null;
  dob: string;
  gender: string | null;
  category: string | null;
  semester: number;
  year: number;
  batch: string;
  mobile: string | null;
  email: string;
  address: string | null;
  apaarId: string | null;
  abcId: string | null;
  abcCredits: number;
  abcTarget: number;
  digilockerLinked: boolean;
  validUpto: string | null;
  college: { code: string; name: string };
  programme: { code: string; name: string; shortName: string };
}

export interface AttendanceSubject {
  code: string;
  name: string;
  credits: number;
  faculty: string;
  room: string;
  total: number;
  present: number;
  percent: number;
  meetsThreshold: boolean;
  /** At or above the bar but under the institution's warning line. */
  warning?: boolean;
  late?: number;
  excused?: number;
  classesNeeded: number;
  canMiss?: number;
  /** Classes not marked present, newest first: what a dispute can be raised against. */
  missed?: Array<{ sessionId: string; date: string; time: string }>;
}

export interface Attendance {
  threshold: number;
  policy?: { threshold: number; condonationFloor: number; warnBelow: number; lateCountsAsPresent: boolean };
  overall: { present: number; total: number; percent: number };
  subjects: AttendanceSubject[];
}

export type ApiDay = 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT';

export interface ApiSlot {
  id: string;
  day: ApiDay;
  time: string;
  startTime: string;
  endTime: string;
  subject: string;
  code: string;
  faculty: string;
  room: string;
  cancelled: boolean;
  cancelReason: string | null;
  cancelledAt: string | null;
}

export interface Fees {
  summary: { total: number; paid: number; due: number };
  items: Array<{
    id: string;
    head: string;
    amount: number;
    paid: number;
    outstanding: number;
    category: 'TUITION' | 'DEVELOPMENT' | 'EXAM' | 'OTHER';
    dueDate: string | null;
  }>;
  instalments: Array<{
    id: string;
    number: number;
    amount: number;
    dueDate: string;
    paid: boolean;
    paidAt: string | null;
  }>;
  payments: Array<{
    id: string;
    date: string;
    head: string;
    amount: number;
    mode: string;
    txnId: string;
    receipt: string | null;
    status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'CANCELLED';
    kind?: 'RECEIPT' | 'CONCESSION' | 'REFUND';
    cancelReason?: string | null;
    /** The fee heads this payment settled. */
    appliedTo?: Array<{ head: string; amount: number }>;
  }>;
  concessions?: Array<{ id: string; no: string; head: string; kind: string; amount: number; status: 'PENDING' | 'APPROVED' | 'REJECTED'; note: string | null; at: string }>;
  refunds?: Array<{ id: string; no: string; head: string; amount: number; status: 'REQUESTED' | 'APPROVED' | 'PAID' | 'REJECTED'; note: string | null; paidAt: string | null; payoutMode: string | null; payoutRef: string | null; at: string }>;
  scholarships: Array<{
    id: string;
    name: string;
    amount: number;
    adjusted: boolean;
    adjustedAt: string | null;
  }>;
}

export interface SemResult {
  semester: number;
  declaredOn: string;
  sgpa: number;
  cgpa: number;
  totalCredits: number;
  outcome: 'PASS' | 'FAIL' | 'WITHHELD';
  subjects: Array<{
    code: string;
    name: string;
    internal: number;
    external: number;
    total: number;
    grade: string;
    passed: boolean;
  }>;
}

export interface Transport {
  routeNo: string;
  name: string;
  busNo: string;
  driver: string;
  driverPhone: string;
  currentStop: number;
  lastUpdated: string;
  passValid: boolean;
  passDue: string;
  stops: Array<{ name: string; time: string }>;
}

export interface ApiNotification {
  id: string;
  kind: 'ATTENDANCE' | 'FEE' | 'RESULT' | 'EXAM' | 'GENERAL';
  title: string;
  titleHi: string | null;
  body: string;
  bodyHi: string | null;
  urgent: boolean;
  href: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface ApiAnnouncement {
  id: string;
  scope: 'UNIVERSITY' | 'COLLEGE' | 'DEPARTMENT' | 'BATCH';
  title: string;
  body: string;
  urgent: boolean;
  publishedAt: string;
}

// ─── Query keys ───────────────────────────────────────────────────────────────

export const keys = {
  profile: ['profile'] as const,
  attendance: ['attendance'] as const,
  timetable: ['timetable'] as const,
  fees: ['fees'] as const,
  results: ['results'] as const,
  transport: ['transport'] as const,
  notifications: ['notifications'] as const,
  announcements: ['announcements'] as const,
};

// ─── Raw queries ──────────────────────────────────────────────────────────────

export const useProfile = () =>
  useQuery({ queryKey: keys.profile, queryFn: () => api<Profile>('/api/student/profile') });

export const useAttendance = () =>
  useQuery({ queryKey: keys.attendance, queryFn: () => api<Attendance>('/api/student/attendance') });

export const useTimetableRaw = () =>
  useQuery({
    queryKey: keys.timetable,
    queryFn: () => api<{ days: ApiDay[]; byDay: Record<ApiDay, ApiSlot[]> }>('/api/student/timetable'),
  });

export const useFees = () =>
  useQuery({ queryKey: keys.fees, queryFn: () => api<Fees>('/api/student/fees') });

export const useResults = () =>
  useQuery({ queryKey: keys.results, queryFn: () => api<SemResult[]>('/api/student/results') });


export const useNotifications = () =>
  useQuery({
    queryKey: keys.notifications,
    queryFn: () => api<{ unreadCount: number; items: ApiNotification[] }>('/api/student/notifications'),
  });

export const useAnnouncements = () =>
  useQuery({ queryKey: keys.announcements, queryFn: () => api<ApiAnnouncement[]>('/api/announcements') });

// ─── Mutations ────────────────────────────────────────────────────────────────

export function usePayInstalment() {
  const qc = useQueryClient();
  return useMutation({
    // Razorpay Checkout where the server has a gateway; the simulated path on the demo.
    mutationFn: (instalmentId: string) => payInstalment(instalmentId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.fees });
      void qc.invalidateQueries({ queryKey: keys.notifications });
    },
  });
}

/** Pays the balance of one fee head (an exam fee, a mess bill) the same way as an instalment. */
export function usePayFeeItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (feeItemId: string) => payFeeItem(feeItemId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.fees });
      void qc.invalidateQueries({ queryKey: keys.notifications });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<{ marked: number }>('/api/student/notifications/read-all', { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.notifications }),
  });
}

// ─── Adapters to the shapes the existing screens render ──────────────────────

export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
export type LegacyDay = (typeof DAYS)[number];

const DAY_MAP: Record<ApiDay, LegacyDay> = {
  MON: 'Mon',
  TUE: 'Tue',
  WED: 'Wed',
  THU: 'Thu',
  FRI: 'Fri',
  SAT: 'Sat',
};

export interface LegacySubject {
  code: string;
  name: string;
  faculty: string;
  room: string;
  credits: number;
  total: number;
  present: number;
}

export interface LegacySlot {
  time: string;
  subject: string;
  code: string;
  faculty: string;
  room: string;
  cancelled?: boolean;
  cancelReason?: string;
  cancelledAt?: string;
}

/** `SUBJECTS` as the attendance and dashboard screens expect it. */
export function useSubjects(): { data: LegacySubject[]; isPending: boolean; error: unknown } {
  const q = useAttendance();
  return {
    data:
      q.data?.subjects.map((s) => ({
        code: s.code,
        name: s.name,
        faculty: s.faculty,
        room: s.room,
        credits: s.credits,
        total: s.total,
        present: s.present,
      })) ?? [],
    isPending: q.isPending,
    error: q.error,
  };
}

/** `TIMETABLE` keyed by 'Mon'…'Sat', as the timetable screen expects. */
export function useTimetable(): {
  data: Record<LegacyDay, LegacySlot[]>;
  isPending: boolean;
  error: unknown;
} {
  const q = useTimetableRaw();

  const empty: Record<LegacyDay, LegacySlot[]> = {
    Mon: [], Tue: [], Wed: [], Thu: [], Fri: [], Sat: [],
  };

  if (!q.data) return { data: empty, isPending: q.isPending, error: q.error };

  const out = { ...empty };
  for (const apiDay of Object.keys(q.data.byDay) as ApiDay[]) {
    out[DAY_MAP[apiDay]] = (q.data.byDay[apiDay] ?? []).map((s) => ({
      time: s.time,
      subject: s.subject,
      code: s.code,
      faculty: s.faculty,
      room: s.room,
      ...(s.cancelled ? { cancelled: true } : {}),
      ...(s.cancelReason ? { cancelReason: s.cancelReason } : {}),
      ...(s.cancelledAt
        ? { cancelledAt: new Date(s.cancelledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }
        : {}),
    }));
  }

  return { data: out, isPending: q.isPending, error: q.error };
}

/** `STUDENT` as the profile and dashboard screens expect it. */
export function useStudentRecord() {
  const q = useProfile();
  const p = q.data;

  return {
    data: p
      ? {
          id: p.enrolmentNo,
          rollNo: p.rollNo,
          name: p.name,
          nameHi: p.nameHi ?? p.name,
          dob: formatDate(p.dob),
          category: p.category ?? '—',
          gender: p.gender ?? '—',
          programme: p.programme.name,
          programmeShort: p.programme.shortName,
          semester: p.semester,
          year: p.year,
          batch: p.batch,
          college: p.college.name,
          collegeCode: p.college.code,
          department: p.programme.name,
          mobile: p.mobile ?? '—',
          email: p.email,
          // Not modelled in Phase 1; the profile screen renders a dash.
          altMobile: '—',
          digilockerLinkedDate: '—',
          address: p.address ?? '—',
          apaarId: p.apaarId ?? '—',
          abcId: p.abcId ?? '—',
          abcCredits: p.abcCredits,
          abcTarget: p.abcTarget,
          digilockerLinked: p.digilockerLinked,
          validUpto: p.validUpto,
        }
      : null,
    isPending: q.isPending,
    error: q.error,
  };
}

export interface LegacyFeeHead {
  head: string;
  amount: number;
  category: 'tuition' | 'development' | 'exam' | 'other';
  paid: number;
}

const FEE_CATEGORY: Record<Fees['items'][number]['category'], LegacyFeeHead['category']> = {
  TUITION: 'tuition',
  DEVELOPMENT: 'development',
  EXAM: 'exam',
  OTHER: 'other',
};

/** `FEE_STRUCTURE` / `INSTALMENT_PLAN` / `PAYMENTS` as the fee screens expect. */
export function useFeeRecord() {
  const q = useFees();
  const d = q.data;

  return {
    summary: d?.summary ?? { total: 0, paid: 0, due: 0 },
    FEE_STRUCTURE: (d?.items ?? []).map((f) => ({
      head: f.head,
      amount: f.amount,
      category: FEE_CATEGORY[f.category],
      paid: f.paid,
    })),
    INSTALMENT_PLAN: {
      opted: (d?.instalments.length ?? 0) > 0,
      plan: (d?.instalments ?? []).map((i) => ({
        id: i.id,
        instalment: i.number,
        amount: i.amount,
        due: formatDate(i.dueDate),
        paid: i.paid,
        paidDate: i.paidAt ? formatDate(i.paidAt) : undefined,
      })),
    },
    PAYMENTS: (d?.payments ?? []).map((p) => ({
      id: p.id,
      date: formatDate(p.date),
      head: p.head,
      amount: p.amount,
      mode: p.mode,
      txnId: p.txnId,
      receipt: p.receipt ?? '—',
      status: p.status.toLowerCase() as 'success' | 'failed' | 'pending',
    })),
    SCHOLARSHIP: d?.scholarships[0]
      ? {
          name: d.scholarships[0].name,
          amount: d.scholarships[0].amount,
          adjusted: d.scholarships[0].adjusted,
          adjustedDate: formatDate(d.scholarships[0].adjustedAt),
        }
      : null,
    isPending: q.isPending,
    error: q.error,
  };
}

export interface LegacySemResult {
  sem: number;
  year: string;
  sgpa: number;
  cgpa: number;
  totalCredits: number;
  result: 'Pass' | 'Fail' | 'Withheld';
  subjects: Array<{
    code: string;
    name: string;
    internal: number;
    external: number;
    total: number;
    grade: string;
    status: 'pass' | 'fail';
  }>;
}

const OUTCOME: Record<SemResult['outcome'], LegacySemResult['result']> = {
  PASS: 'Pass',
  FAIL: 'Fail',
  WITHHELD: 'Withheld',
};

/** `RESULTS` as the examination screen expects it. */
export function useResultsRecord() {
  const q = useResults();
  return {
    data: (q.data ?? []).map<LegacySemResult>((r) => ({
      sem: r.semester,
      year: r.declaredOn,
      sgpa: r.sgpa,
      cgpa: r.cgpa,
      totalCredits: r.totalCredits,
      result: OUTCOME[r.outcome],
      subjects: r.subjects.map((s) => ({
        code: s.code,
        name: s.name,
        internal: s.internal,
        external: s.external,
        total: s.total,
        grade: s.grade,
        status: s.passed ? ('pass' as const) : ('fail' as const),
      })),
    })),
    isPending: q.isPending,
    error: q.error,
  };
}

/** `ANNOUNCEMENTS` as the announcements screen expects it. */
export function useAnnouncementList() {
  const q = useAnnouncements();
  return {
    data: (q.data ?? []).map((a) => ({
      id: a.id,
      scope: a.scope.toLowerCase() as 'university' | 'college' | 'department' | 'batch',
      title: a.title,
      body: a.body,
      date: formatDate(a.publishedAt),
      urgent: a.urgent,
    })),
    isPending: q.isPending,
    error: q.error,
  };
}

// ─── Shared formatting ────────────────────────────────────────────────────────

/** Indian digit grouping: ₹1,23,456 */
export const inr = (n: number) => {
  const sign = n < 0 ? '-' : '';
  const s = Math.abs(Math.round(n)).toString();
  if (s.length <= 3) return `${sign}₹${s}`;
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${sign}₹${rest},${last3}`;
};

export const formatDate = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
};

export function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return `${Math.round(days / 7)} week(s) ago`;
}
