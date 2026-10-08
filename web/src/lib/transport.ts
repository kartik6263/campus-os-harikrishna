/**
 * Transport management through /api/transport. The server holds every rule —
 * seats, fares, the fee before a pass works, papers and licences before a
 * trip, the order of stops — so these hooks carry its shapes only.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

export type PassState = 'ACTIVE' | 'PENDING_PAYMENT' | 'CANCELLED' | 'EXPIRED';
export type PaperState = 'ok' | 'expiring' | 'expired' | 'missing';

export const PASS_LABEL: Record<PassState, string> = { ACTIVE: 'Active', PENDING_PAYMENT: 'Fee unpaid', CANCELLED: 'Cancelled', EXPIRED: 'Expired' };
export const PASS_STYLE: Record<PassState, string> = { ACTIVE: 'bg-green-100 text-green-700', PENDING_PAYMENT: 'bg-amber-100 text-amber-800', CANCELLED: 'bg-gray-100 text-gray-500', EXPIRED: 'bg-red-100 text-red-700' };
export const PAPER_STYLE: Record<PaperState, string> = { ok: 'text-[#0E7A5F]', expiring: 'text-amber-700', expired: 'text-[#A8242C] font-semibold', missing: 'text-[#A8242C]' };

export interface Overview {
  totals: { routes: number; vehicles: number; seats: number; riders: number; pendingRequests: number; unpaid: number; openIncidents: number; tripsRunning: number; complianceIssues: number };
  compliance: Array<{ what: string; state: PaperState; till: string | null }>;
  routes: Array<{ id: string; routeNo: string; name: string; active: boolean; vehicle: { regNo: string; capacity: number } | null; driver: { name: string; phone: string } | null; stops: number; first: string | null; riders: number; seatsTaken: number; today: Array<{ shift: string; status: string; lastStop: number }>; blockers: string[] }>;
}
export interface Vehicle {
  id: string; regNo: string; kind: string; make: string | null; capacity: number; ownership: string; operator: string | null;
  fitnessValidTill: string | null; insuranceValidTill: string | null; permitValidTill: string | null; pucValidTill: string | null;
  gpsDeviceId: string | null; odometer: number; status: 'ACTIVE' | 'MAINTENANCE' | 'RETIRED'; notes: string | null;
  routes: string[]; lastLog: { date: string; kind: string } | null; papers: Array<{ name: string; till: string | null; state: PaperState }>;
}
export interface VehicleLog { id: string; kind: string; date: string; odometer: number | null; litres: number | null; cost: number; vendor: string | null; notes: string | null; by: string; kmpl: number | null }
export interface Crew { id: string; name: string; phone: string; role: 'DRIVER' | 'ATTENDANT'; licenceNo: string | null; licenceValidTill: string | null; verifiedOn: string | null; active: boolean; routes: string[] }
export interface Stop { id: string; name: string; time: string; order: number; fare: number; riders?: number }
export interface Route {
  id: string; routeNo: string; name: string; active: boolean; vehicleId: string | null; driverId: string | null; attendantId: string | null;
  vehicle: Vehicle | null; driver: Crew | null; attendant: Crew | null; stops: Stop[]; seatsTaken: number;
}
export interface Pass {
  id: string; passNo: string; status: 'ACTIVE' | 'PENDING_PAYMENT' | 'CANCELLED'; state: PassState; term: string | null; fee: number; feeDue: number; validTill: string; issuedAt: string; issuedBy: string | null; cancelledReason: string | null;
  student: { id: string; name: string; enrolmentNo: string; mobile: string | null; semester: number; programme: { shortName: string } };
  route: { id: string; routeNo: string; name: string }; stop: { id: string; name: string } | null;
}
export interface Request {
  id: string; requestNo: string; kind: 'NEW' | 'CHANGE'; term: string; note: string | null; status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'; decisionNote: string | null; createdAt: string;
  student: { id: string; name: string; enrolmentNo: string }; route: { id: string; routeNo: string; name: string }; stop: { id: string; name: string; fare: number }; seatsLeft: number;
}
export interface BoardStop { stopId: string; order: number; name: string; scheduled: string | null; departedAt: string | null; delayMinutes: number | null; skipped: boolean; eta: string | null }
export interface Trip {
  id: string; routeId: string; date: string; shift: 'MORNING' | 'EVENING'; status: 'RUNNING' | 'COMPLETED' | 'CANCELLED'; startedAt: string; endedAt: string | null;
  odometerStart: number | null; odometerEnd: number | null; lastStop: number; startedBy: string; note: string | null;
  route: Route; stops: BoardStop[]; riders: number | Array<{ passNo: string; student: { id: string; name: string; enrolmentNo: string; mobile: string | null }; stop: string | null; boarded: boolean }>;
  boarded?: number; boardings: Array<{ id: string; boardedAt: string; by: string; student: { name: string; enrolmentNo: string }; pass: { passNo: string; stop: { name: string } | null } }>;
}
export interface Incident { id: string; incidentNo: string; kind: string; severity: string; description: string; location: string | null; occurredAt: string; actionTaken: string | null; status: string; reportedBy: string; closedBy: string | null; closedAt: string | null; ridersAlerted: number; route: { routeNo: string } | null; vehicle: { regNo: string } | null }

export interface Live { tripId: string; shift: string; status: string; startedAt: string; endedAt: string | null; note: string | null; lastStop: number; lastUpdated: string; delayMinutes: number | null; stops: BoardStop[]; boardedAt: string | null }
export interface MyTransport {
  student: { name: string; onRolls: boolean };
  term: string;
  pass: null | {
    id: string; passNo: string; status: string; state: PassState; term: string | null; validTill: string; issuedAt: string; cancelledReason: string | null;
    fee: number; feeDue: number; feeDueDate: string | null; stop: { id: string; name: string; time: string } | null;
    route: { id: string; routeNo: string; name: string; active: boolean; vehicle: { regNo: string; kind: string; make: string | null } | null; driver: { name: string; phone: string } | null; attendant: { name: string; phone: string } | null; stops: Array<{ id: string; name: string; time: string; order: number }> };
  };
  live: Live | null;
  boardings: Array<{ date: string; shift: string; at: string }>;
  requests: Array<{ id: string; requestNo: string; kind: string; status: string; decisionNote: string | null; createdAt: string; route: { routeNo: string; name: string }; stop: { name: string; fare: number } }>;
  routes: Array<{ id: string; routeNo: string; name: string; seatsLeft: number; stops: Array<{ id: string; name: string; time: string; fare: number }> }>;
}

const qs = (o: Record<string, string | undefined>) => Object.entries(o).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v!)}`).join('&');

export const useOverview = () => useQuery({ queryKey: ['transport', 'overview'], queryFn: () => api<Overview>('/api/transport/overview') });
export const useVehicles = () => useQuery({ queryKey: ['transport', 'vehicles'], queryFn: () => api<Vehicle[]>('/api/transport/vehicles') });
export const useVehicleLogs = (id: string | null) => useQuery({ queryKey: ['transport', 'logs', id], enabled: !!id, queryFn: () => api<{ logs: VehicleLog[]; spend: number }>(`/api/transport/vehicles/${id}/logs`) });
export const useCrew = () => useQuery({ queryKey: ['transport', 'crew'], queryFn: () => api<Crew[]>('/api/transport/crew') });
export const useRoutes = () => useQuery({ queryKey: ['transport', 'routes'], queryFn: () => api<Route[]>('/api/transport/routes') });
export const usePasses = (f: { routeId?: string; status?: string; q?: string }) => useQuery({ queryKey: ['transport', 'passes', f], queryFn: () => api<Pass[]>(`/api/transport/passes?${qs(f)}`) });
export const useRequests = (status: string) => useQuery({ queryKey: ['transport', 'requests', status], queryFn: () => api<Request[]>(`/api/transport/requests?${qs({ status })}`) });
export const useTrips = (date: string) => useQuery({ queryKey: ['transport', 'trips', date], queryFn: () => api<{ date: string; trips: Trip[] }>(`/api/transport/trips?date=${date}`), refetchInterval: 30_000 });
export const useTrip = (id: string | null) => useQuery({ queryKey: ['transport', 'trip', id], enabled: !!id, queryFn: () => api<Trip>(`/api/transport/trips/${id}`), refetchInterval: 20_000 });
export const useIncidents = (status: string) => useQuery({ queryKey: ['transport', 'incidents', status], queryFn: () => api<Incident[]>(`/api/transport/incidents?${qs({ status })}`) });
/** Refreshed every 30 seconds while open, so the stop board follows the bus. */
export const useMyTransport = () => useQuery({ queryKey: ['transport', 'me'], queryFn: () => api<MyTransport>('/api/transport/me'), refetchInterval: 30_000 });

export function useTransportAction<V, R = unknown>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => { void qc.invalidateQueries({ queryKey: ['transport'] }); } });
}
export const post = <R = unknown>(path: string, body?: unknown) => api<R>(`/api/transport${path}`, { method: 'POST', ...(body !== undefined ? { body } : {}) });
export const patch = <R = unknown>(path: string, body: unknown) => api<R>(`/api/transport${path}`, { method: 'PATCH', body });
export const put = <R = unknown>(path: string, body: unknown) => api<R>(`/api/transport${path}`, { method: 'PUT', body });
export const del = (path: string) => api<void>(`/api/transport${path}`, { method: 'DELETE' });

export const rupees = (n: number) => `₹${n.toLocaleString('en-IN')}`;
export const day = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
export const time = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }) : '—');
export const isoDay = (iso: string | null | undefined) => (iso ? new Date(new Date(iso).getTime() + 5.5 * 3_600_000).toISOString().slice(0, 10) : '');
export const delayText = (m: number | null) => (m === null ? '' : m > 1 ? `${m} min late` : m < -1 ? `${-m} min early` : 'on time');
export const todayIst = () => new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);
