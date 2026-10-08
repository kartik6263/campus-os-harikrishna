/**
 * Hostel management, read and changed through /api/hostel. The server holds
 * every rule — gender, capacity, one bed per student, the parent's consent,
 * the gate — so these hooks only carry its shapes.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

export type HostelGender = 'BOYS' | 'GIRLS' | 'CO_ED';
export type RoomStatus = 'AVAILABLE' | 'MAINTENANCE' | 'BLOCKED';
export type ApplicationStatus = 'PENDING' | 'WAITLISTED' | 'ALLOTTED' | 'REJECTED' | 'CANCELLED';
export type ComplaintStatus = 'OPEN' | 'ASSIGNED' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
export type Priority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
export type LeaveStatus = 'AWAITING_PARENT' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'OUT' | 'RETURNED';

export const GENDER_LABEL: Record<HostelGender, string> = { BOYS: 'Boys', GIRLS: 'Girls', CO_ED: 'Co-ed' };
export const LEAVE_LABEL: Record<LeaveStatus, string> = { AWAITING_PARENT: 'Awaiting parent', PENDING: 'With the warden', APPROVED: 'Approved', REJECTED: 'Not approved', CANCELLED: 'Withdrawn', OUT: 'Out', RETURNED: 'Returned' };
export const LEAVE_STYLE: Record<LeaveStatus, string> = {
  AWAITING_PARENT: 'bg-purple-100 text-purple-700', PENDING: 'bg-amber-100 text-amber-800', APPROVED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700', CANCELLED: 'bg-gray-100 text-gray-500', OUT: 'bg-blue-100 text-blue-700', RETURNED: 'bg-slate-100 text-slate-600',
};
export const COMPLAINT_LABEL: Record<ComplaintStatus, string> = { OPEN: 'Open', ASSIGNED: 'Assigned', IN_PROGRESS: 'In progress', RESOLVED: 'Resolved', CLOSED: 'Closed' };
export const COMPLAINT_STYLE: Record<ComplaintStatus, string> = {
  OPEN: 'bg-amber-100 text-amber-800', ASSIGNED: 'bg-blue-100 text-blue-700', IN_PROGRESS: 'bg-blue-100 text-blue-700', RESOLVED: 'bg-green-100 text-green-700', CLOSED: 'bg-gray-100 text-gray-600',
};
export const PRIORITY_STYLE: Record<Priority, string> = { LOW: 'text-gray-500', NORMAL: 'text-[#16264A]', HIGH: 'text-amber-700 font-semibold', URGENT: 'text-red-700 font-bold' };
export const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export interface HostelSummary {
  id: string; code: string; name: string; gender: HostelGender; active: boolean; wardenName: string | null; wardenPhone: string | null;
  address: string | null; amenities: string[]; rules: string | null; messRatePerMonth: number;
  rooms: number; beds: number; occupied: number; vacant: number; outOfService: number; openComplaints: number;
}
export interface Overview {
  totals: { hostels: number; beds: number; occupied: number; pendingApplications: number; waitlisted: number; openComplaints: number; overdueComplaints: number; studentsOut: number; overdueReturns: number; leaveRequests: number; visitorsIn: number };
  hostels: HostelSummary[];
}
export interface Bed { bed: string; allotmentId: string | null; allotmentNo: string | null; checkedIn: boolean; student: { id: string; name: string; enrolmentNo: string; programme: string } | null }
export interface Room {
  id: string; hostelId: string; roomNo: string; floor: number; capacity: number; ac: boolean; attachedBath: boolean; amenities: string[];
  rentPerSemester: number; status: RoomStatus; notes: string | null; occupied: number; beds: Bed[];
}
export interface Vacancy extends Room { hostel: { id: string; code: string; name: string; gender: HostelGender }; freeBeds: string[] }
export interface Application {
  id: string; applicationNo: string; academicYear: string; roomPreference: string; distanceKm: number; specialNeeds: string | null; reason: string;
  priorityScore: number; status: ApplicationStatus; decisionNote: string | null; decidedBy: string | null; decidedAt: string | null; createdAt: string;
  student: { id: string; name: string; enrolmentNo: string; gender: string | null; category: string | null; semester: number; status: string; programme: { shortName: string } };
  preferredHostel: { id: string; code: string; name: string } | null;
  allotment: { allotmentNo: string; bed: string; room: { roomNo: string; hostel: { code: string } } } | null;
}
export interface Resident {
  id: string; allotmentNo: string; bed: string; status: 'ACTIVE' | 'VACATED'; academicYear: string; allottedAt: string; allottedBy: string; checkedInAt: string | null;
  vacatedAt: string | null; vacateReason: string | null;
  student: { id: string; name: string; enrolmentNo: string; mobile: string | null; semester: number; programme: { shortName: string }; guardian: { email: string } | null };
  room: { id: string; roomNo: string; floor: number; rentPerSemester: number; hostel: { id: string; code: string; name: string } };
}
export interface RoomChange {
  id: string; requestNo: string; reason: string; status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'; decisionNote: string | null; createdAt: string;
  student: { id: string; name: string; enrolmentNo: string };
  allotment: { id: string; bed: string; room: { roomNo: string; hostel: { id: string; code: string } } };
  preferredRoom: { id: string; roomNo: string; hostel: { code: string } } | null;
}
export interface Complaint {
  id: string; ticketNo: string; category: string; priority: Priority; description: string; status: ComplaintStatus; assignedTo: string | null; response: string | null;
  dueBy: string; resolvedAt: string | null; rating: number | null; feedback: string | null; reopened: number; createdAt: string; overdue: boolean;
  student?: { id: string; name: string; enrolmentNo: string }; hostel?: { code: string; name: string }; room?: { roomNo: string } | null;
}
export interface Leave {
  id: string; passNo: string; kind: 'GATE_PASS' | 'LEAVE'; leaveFrom: string; leaveTo: string; destination: string; reason: string; status: LeaveStatus;
  parentConsent: 'PENDING' | 'GIVEN' | 'REFUSED' | 'NOT_REQUIRED'; parentNote: string | null; decisionNote: string | null; decidedBy: string | null;
  outAt: string | null; returnedAt: string | null; createdAt: string; overdue?: boolean; lateReturn?: boolean;
  student?: { id: string; name: string; enrolmentNo: string; mobile: string | null; guardian: { email: string } | null; hostelAllotments: Array<{ bed: string; room: { roomNo: string; hostel: { id: string; code: string } } }> };
}
export interface Visitor { id: string; visitorName: string; relation: string; phone: string; idProof: string | null; purpose: string; inAt: string; outAt: string | null; recordedBy: string; student: { name: string; enrolmentNo: string }; hostel: { code: string } }
export interface RollCall { date: string; marked: boolean; residents: Array<{ id: string; name: string; enrolmentNo: string; room: string; bed: string; status: 'PRESENT' | 'ABSENT' | 'ON_LEAVE' | null; pass: string | null; markedBy: string | null }> }
export interface MenuDay { day: number; breakfast: string; lunch: string; snacks: string; dinner: string; updatedBy?: string | null; updatedAt?: string }
export interface BillRun { id: string; kind: 'MESS' | 'RENT'; period: string; rate: number | null; charged: number; skipped: number; total: number; runBy: string; createdAt: string; hostel: { code: string; name: string } }

export interface MyHostel {
  student: { name: string; onRolls: boolean; parentLinked: boolean };
  allotment: null | {
    id: string; allotmentNo: string; bed: string; academicYear: string; allottedAt: string; checkedInAt: string | null;
    room: { id: string; roomNo: string; floor: number; capacity: number; ac: boolean; attachedBath: boolean; amenities: string[]; rentPerSemester: number };
    hostel: { id: string; code: string; name: string; address: string | null; wardenName: string | null; wardenPhone: string | null; amenities: string[]; rules: string | null; messRatePerMonth: number };
    roommates: Array<{ bed: string; name: string; programme: string }>;
  };
  hostels: Array<{ id: string; code: string; name: string; gender: HostelGender; amenities: string[]; address: string | null; messRatePerMonth: number; vacantBeds: number; rentFrom: number | null; rentTo: number | null; roomTypes: number[] }>;
  applications: Array<Omit<Application, 'student' | 'allotment' | 'preferredHostel'> & { preferredHostel: { name: string } | null }>;
  complaints: Complaint[];
  leaves: Leave[];
  roomChanges: Array<{ id: string; requestNo: string; reason: string; status: string; decisionNote: string | null; createdAt: string; preferredRoom: { roomNo: string } | null }>;
  menu: MenuDay[];
  absences: Array<{ date: string; markedBy: string }>;
  changeOptions: Array<{ id: string; roomNo: string; floor: number; capacity: number; ac: boolean; attachedBath: boolean; freeBeds: number }>;
  dues: Array<{ head: string; amount: number; paid: number; due: number; dueDate: string | null }>;
  categories: string[];
  today: string;
}

const qs = (o: Record<string, string | undefined>) => Object.entries(o).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v!)}`).join('&');

export const useOverview = () => useQuery({ queryKey: ['hostel', 'overview'], queryFn: () => api<Overview>('/api/hostel/overview') });
export const useRooms = (hostelId: string | null) => useQuery({ queryKey: ['hostel', 'rooms', hostelId], enabled: !!hostelId, queryFn: () => api<Room[]>(`/api/hostel/hostels/${hostelId}/rooms`) });
export const useVacancies = (studentId: string | null, hostelId?: string) =>
  useQuery({ queryKey: ['hostel', 'vacancies', studentId, hostelId], enabled: !!studentId, queryFn: () => api<Vacancy[]>(`/api/hostel/vacancies?${qs({ studentId: studentId!, hostelId })}`) });
export const useApplications = (status: string, q?: string) => useQuery({ queryKey: ['hostel', 'applications', status, q], queryFn: () => api<Application[]>(`/api/hostel/applications?${qs({ status, q })}`) });
export const useResidents = (f: { hostelId?: string; q?: string; status?: string }) => useQuery({ queryKey: ['hostel', 'residents', f], queryFn: () => api<Resident[]>(`/api/hostel/residents?${qs(f)}`) });
export const useRoomChanges = (status: string) => useQuery({ queryKey: ['hostel', 'room-changes', status], queryFn: () => api<RoomChange[]>(`/api/hostel/room-changes?${qs({ status })}`) });
export const useComplaints = (f: { hostelId?: string; status?: string }) => useQuery({ queryKey: ['hostel', 'complaints', f], queryFn: () => api<Complaint[]>(`/api/hostel/complaints?${qs(f)}`) });
export const useLeaves = (f: { hostelId?: string; status?: string }) => useQuery({ queryKey: ['hostel', 'leaves', f], queryFn: () => api<Leave[]>(`/api/hostel/leaves?${qs(f)}`) });
export const useVisitors = (f: { hostelId?: string; date?: string; inside?: string }) => useQuery({ queryKey: ['hostel', 'visitors', f], queryFn: () => api<Visitor[]>(`/api/hostel/visitors?${qs(f)}`) });
export const useRollCall = (hostelId: string | null, date: string) => useQuery({ queryKey: ['hostel', 'rollcall', hostelId, date], enabled: !!hostelId, queryFn: () => api<RollCall>(`/api/hostel/rollcall?${qs({ hostelId: hostelId!, date })}`) });
export const useMenu = (hostelId: string | null) => useQuery({ queryKey: ['hostel', 'menu', hostelId], enabled: !!hostelId, queryFn: () => api<MenuDay[]>(`/api/hostel/mess/menu?hostelId=${hostelId}`) });
export const useBillRuns = () => useQuery({ queryKey: ['hostel', 'bill-runs'], queryFn: () => api<BillRun[]>('/api/hostel/billing/runs') });
export const useMyHostel = () => useQuery({ queryKey: ['hostel', 'me'], queryFn: () => api<MyHostel>('/api/hostel/me') });

/** Every hostel write refreshes every hostel read; the screens overlap heavily. */
export function useHostelAction<V, R = unknown>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => { void qc.invalidateQueries({ queryKey: ['hostel'] }); } });
}

export const post = <R = unknown>(path: string, body?: unknown) => api<R>(`/api/hostel${path}`, { method: 'POST', ...(body !== undefined ? { body } : {}) });
export const patch = <R = unknown>(path: string, body: unknown) => api<R>(`/api/hostel${path}`, { method: 'PATCH', body });
export const put = <R = unknown>(path: string, body: unknown) => api<R>(`/api/hostel${path}`, { method: 'PUT', body });
export const del = (path: string) => api<void>(`/api/hostel${path}`, { method: 'DELETE' });

export const rupees = (n: number) => `₹${n.toLocaleString('en-IN')}`;
export const when = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true }) : '—');
export const day = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
/** A datetime-local value (yyyy-mm-ddThh:mm, local) as an ISO string with its offset. */
export const fromLocal = (v: string) => new Date(v).toISOString();
export const localNow = (plusMinutes = 0) => { const d = new Date(Date.now() + plusMinutes * 60_000); d.setSeconds(0, 0); return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16); };
