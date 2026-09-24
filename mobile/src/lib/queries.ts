/**
 * Server state for the app. Every screen reads through these hooks — the
 * old `src/lib/data.ts` mock module is no longer imported anywhere.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

// ─── Shapes returned by the API ───────────────────────────────────────────────

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
  classesNeeded: number;
}

export interface Attendance {
  threshold: number;
  overall: { present: number; total: number; percent: number };
  subjects: AttendanceSubject[];
}

export type Day = 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT';

export interface Slot {
  id: string;
  day: Day;
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

export interface Timetable {
  days: Day[];
  byDay: Record<Day, Slot[]>;
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
    status: 'PENDING' | 'SUCCESS' | 'FAILED';
  }>;
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

export interface Notification {
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

export interface ActiveSession {
  sessionId: string;
  code: string;
  subject: string;
  faculty: string;
  room: string;
  slot: string;
  date: string;
  expiresAt: string;
  alreadyMarked: boolean;
  markedAt: string | null;
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export const keys = {
  profile: ['profile'] as const,
  attendance: ['attendance'] as const,
  timetable: ['timetable'] as const,
  fees: ['fees'] as const,
  results: ['results'] as const,
  transport: ['transport'] as const,
  notifications: ['notifications'] as const,
  activeSession: ['attendance', 'active-session'] as const,
};

export const useProfile = () =>
  useQuery({ queryKey: keys.profile, queryFn: () => api<Profile>('/api/student/profile') });

export const useAttendance = () =>
  useQuery({ queryKey: keys.attendance, queryFn: () => api<Attendance>('/api/student/attendance') });

export const useTimetable = () =>
  useQuery({ queryKey: keys.timetable, queryFn: () => api<Timetable>('/api/student/timetable') });

export const useFees = () =>
  useQuery({ queryKey: keys.fees, queryFn: () => api<Fees>('/api/student/fees') });

export const useResults = () =>
  useQuery({ queryKey: keys.results, queryFn: () => api<SemResult[]>('/api/student/results') });

export const useTransport = () =>
  useQuery({ queryKey: keys.transport, queryFn: () => api<Transport | null>('/api/student/transport') });

export const useNotifications = () =>
  useQuery({
    queryKey: keys.notifications,
    queryFn: () =>
      api<{ unreadCount: number; items: Notification[] }>('/api/student/notifications'),
  });

export const useActiveSession = () =>
  useQuery({
    queryKey: keys.activeSession,
    queryFn: () => api<ActiveSession | null>('/api/attendance/session/active'),
  });

// ─── Mutations ────────────────────────────────────────────────────────────────

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api<void>(`/api/student/notifications/${id}/read`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.notifications }),
  });
}

export function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<{ marked: number }>('/api/student/notifications/read-all', { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.notifications }),
  });
}

export function usePayInstalment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (instalmentId: string) =>
      api<{ id: string; txnId: string; receipt: string; amount: number }>(
        '/api/student/fees/pay',
        { method: 'POST', body: { instalmentId, mode: 'UPI' } },
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.fees });
      void qc.invalidateQueries({ queryKey: keys.notifications });
    },
  });
}

export function useMarkAttendance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (token: string) =>
      api<{ id: string; subject: string; code: string; room: string; slot: string; markedAt: string }>(
        '/api/attendance/mark',
        { method: 'POST', body: { token } },
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.attendance });
      void qc.invalidateQueries({ queryKey: keys.activeSession });
    },
  });
}

// ─── Helpers the screens share ────────────────────────────────────────────────

/** Indian digit grouping: ₹1,23,456 */
export const inr = (n: number) => {
  const sign = n < 0 ? '-' : '';
  const s = Math.abs(Math.round(n)).toString();
  if (s.length <= 3) return `${sign}₹${s}`;
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${sign}₹${rest},${last3}`;
};

export const DAYS: Day[] = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

/** True on Sunday, the one day with no teaching slots. */
export const isNonTeachingDay = (now = new Date()) => now.getDay() === 0;

/** The weekday whose timetable to show; Sunday falls through to Monday. */
export const todayKey = (now = new Date()): Day => DAYS[(now.getDay() + 6) % 7] ?? 'MON';

export const formatDate = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
};

/** "2 hours ago" style stamp for notification rows. */
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
  const weeks = Math.round(days / 7);
  return `${weeks} week${weeks === 1 ? '' : 's'} ago`;
}
