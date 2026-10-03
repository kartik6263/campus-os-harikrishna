import { type Module } from '../StudentPortal';
import type { Screen } from '../../lib/data';
// Phase 1 endpoints cover the student record, attendance, timetable, fees and
// announcements. Grievances, exam forms, library and scholarship schemes have
// no API yet and still read the mock module.
import {
  GRIEVANCES,
  EXAM_FORM,
  ISSUED_BOOKS,
  SCHOLARSHIPS,
} from '../../lib/studentdata';
import {
  useAnnouncementList,
  useFeeRecord,
  useStudentRecord,
  useSubjects,
  useTimetable,
} from '../../lib/queries';
import { StatusPill } from '../../components/ui';

interface Props {
  onNavigate: (m: Module) => void;
  onMainNavigate: (s: Screen) => void;
}

// ─── Computed values ──────────────────────────────────────────────────────────

/**
 * Derived dashboard figures. These were module constants over the mock data;
 * they are a hook now because the numbers come from the API. React Query
 * caches the underlying requests, so the sections calling this share a fetch.
 */
function useDashboardData() {
  const { data: SUBJECTS } = useSubjects();
  const { FEE_STRUCTURE, INSTALMENT_PLAN } = useFeeRecord();
  const { data: ANNOUNCEMENTS } = useAnnouncementList();

  const totalPresent = SUBJECTS.reduce((s, sub) => s + sub.present, 0);
  const totalClasses = SUBJECTS.reduce((s, sub) => s + sub.total, 0);
  const overallPct =
    totalClasses === 0 ? 0 : Math.round((totalPresent / totalClasses) * 100 * 10) / 10;

  const belowThreshold = SUBJECTS.filter(
    sub => sub.total > 0 && Math.round((sub.present / sub.total) * 100) < 75,
  );

  const totalFee = FEE_STRUCTURE.reduce((s, h) => s + h.amount, 0);
  const totalPaid = FEE_STRUCTURE.reduce((s, h) => s + (h.paid ?? 0), 0);
  const totalDue = totalFee - totalPaid;

  const nextInstalment = INSTALMENT_PLAN.plan.find(p => !p.paid);

  const urgentAnnouncements = ANNOUNCEMENTS.filter(a => a.urgent);
  const recentAnnouncements = [...ANNOUNCEMENTS]
    .sort((a, b) => {
      const toMs = (d: string) => {
        const [dd, mm, yyyy] = d.split('-').map(Number);
        return new Date(yyyy ?? 0, (mm ?? 1) - 1, dd ?? 1).getTime();
      };
      if (a.urgent && !b.urgent) return -1;
      if (!a.urgent && b.urgent) return 1;
      return toMs(b.date) - toMs(a.date);
    })
    .slice(0, 2);

  return {
    overallPct, belowThreshold, totalDue, nextInstalment,
    urgentAnnouncements, recentAnnouncements,
  };
}

const openGrievances = GRIEVANCES.filter(
  g => g.status === 'open' || g.status === 'in_progress' || g.status === 'escalated',
);

const libraryFineBooks = ISSUED_BOOKS.filter(b => b.fine > 0);

const nspPending = SCHOLARSHIPS.find(
  s => s.id === 'SCH002' && s.documents.some(d => !d.uploaded),
);

// ─── Primitives ───────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: string }) {
  return (
    <div className="bg-[#EDEFF3] px-4 py-2">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-[#5A6577]">
        {children}
      </span>
    </div>
  );
}

function ChevronRight() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

// ─── Section: Today's Timetable ───────────────────────────────────────────────

function TodayTimetable() {
  const { data: TIMETABLE } = useTimetable();
  const slots = (TIMETABLE['Mon'] ?? []).slice(0, 3);

  return (
    <section>
      <SectionLabel>Today's Timetable — Monday</SectionLabel>
      <div className="bg-white">
        {slots.map((slot, i) => (
          <div
            key={slot.code + slot.time}
            className={`flex items-start px-4 py-3 gap-3${i < slots.length - 1 ? ' border-b border-[#D3D8E0]' : ''}`}
          >
            {/* Time column */}
            <div className="flex-shrink-0 w-[88px]">
              <span
                className="text-[12px] text-[#5A6577] leading-tight"
                style={{ fontFamily: "'IBM Plex Mono', monospace" }}
              >
                {slot.time}
              </span>
            </div>

            {/* Subject info */}
            <div className="flex-1 min-w-0">
              {slot.cancelled ? (
                <>
                  <span className="line-through text-[14px] font-medium text-[#5A6577] leading-tight block">
                    {slot.code} — {slot.subject}
                  </span>
                  {slot.cancelReason && (
                    <span className="text-[12px] text-[#A8242C] mt-0.5 block">{slot.cancelReason}</span>
                  )}
                </>
              ) : (
                <>
                  <span className="text-[14px] font-medium text-[#16264A] leading-tight block">
                    {slot.code}
                  </span>
                  <span className="text-[12px] text-[#5A6577] mt-0.5 block truncate">{slot.subject}</span>
                </>
              )}
            </div>

            {/* Room + cancelled badge */}
            <div className="flex-shrink-0 flex flex-col items-end gap-1">
              {slot.cancelled ? (
                <span className="text-[11px] font-semibold text-white bg-[#A8242C] px-1.5 py-0.5 rounded-[2px] leading-none">
                  Cancelled
                </span>
              ) : (
                <span
                  className="text-[12px] text-[#5A6577]"
                  style={{ fontFamily: "'IBM Plex Mono', monospace" }}
                >
                  {slot.room}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── Section: Attendance Summary ─────────────────────────────────────────────

interface AttendanceSummaryProps {
  onNavigate: (m: Module) => void;
}

function AttendanceSummary({ onNavigate }: AttendanceSummaryProps) {
  const { overallPct, belowThreshold } = useDashboardData();
  const barPct = Math.min(overallPct, 100);

  return (
    <section>
      <SectionLabel>Attendance</SectionLabel>
      <div className="bg-white px-4 py-3">
        {/* Overall percentage */}
        <div className="flex items-baseline gap-3 mb-2">
          <span className="text-[28px] font-bold text-[#16264A] leading-none">{overallPct}%</span>
          <span className="text-[13px] text-[#5A6577]">overall attendance</span>
        </div>

        {/* Progress bar */}
        <div
          className="w-full h-[4px] rounded-[2px] overflow-hidden mb-2"
          style={{ backgroundColor: '#D3D8E0' }}
        >
          <div
            className="h-full rounded-[2px]"
            style={{
              width: `${barPct}%`,
              backgroundColor: overallPct < 75 ? '#A8242C' : '#0E7A5F',
            }}
          />
        </div>

        {/* Warning */}
        {belowThreshold.length > 0 && (
          <p className="text-[12px] font-medium text-[#A8242C] mb-2">
            {belowThreshold.length} subject{belowThreshold.length > 1 ? 's' : ''} below 75% threshold
          </p>
        )}

        {/* CTA */}
        <button
          onClick={() => onNavigate('attendance')}
          className="text-[13px] font-medium text-[#E0952A] active:opacity-70 mt-1"
        >
          View details →
        </button>
      </div>
    </section>
  );
}

// ─── Section: Fee Dues ───────────────────────────────────────────────────────

interface FeeDuesProps {
  onNavigate: (m: Module) => void;
}

function FeeDues({ onNavigate }: FeeDuesProps) {
  const { totalDue, nextInstalment } = useDashboardData();
  const dueLabel = `₹${totalDue.toLocaleString('en-IN')}`;
  const nextDue = nextInstalment?.due ?? '—';

  return (
    <section>
      <SectionLabel>Fee Dues</SectionLabel>
      <div className="bg-white px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <span className="text-[22px] font-bold text-[#16264A] leading-none block">{dueLabel} due</span>
          <span className="text-[12px] text-[#5A6577] mt-1 block">
            Next instalment due: {nextDue}
          </span>
        </div>
        <button
          onClick={() => onNavigate('fee')}
          className="flex-shrink-0 inline-flex items-center justify-center h-11 px-4 rounded-[4px] text-[14px] font-semibold text-white active:opacity-80"
          style={{ backgroundColor: '#E0952A', minWidth: 110 }}
        >
          Pay {dueLabel}
        </button>
      </div>
    </section>
  );
}

// ─── Section: Announcements ──────────────────────────────────────────────────

interface AnnouncementsProps {
  onNavigate: (m: Module) => void;
}

function AnnouncementsSection({ onNavigate }: AnnouncementsProps) {
  const { urgentAnnouncements, recentAnnouncements } = useDashboardData();
  return (
    <section>
      <SectionLabel>Announcements</SectionLabel>
      <div className="bg-white">
        {/* Header row */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-[#D3D8E0]">
          <span className="inline-flex items-center gap-1.5">
            <span
              className="text-[11px] font-semibold text-white px-1.5 py-0.5 rounded-[2px] leading-none"
              style={{ backgroundColor: '#E0952A' }}
            >
              {urgentAnnouncements.length} new
            </span>
            <span className="text-[12px] text-[#5A6577]">urgent notices</span>
          </span>
          <button
            onClick={() => onNavigate('announcements')}
            className="text-[13px] font-medium text-[#E0952A] active:opacity-70"
          >
            View all →
          </button>
        </div>

        {/* Top 2 announcements */}
        {recentAnnouncements.map((ann, i) => (
          <button
            key={ann.id}
            onClick={() => onNavigate('announcements')}
            className={`w-full flex items-start gap-3 px-4 py-3 text-left active:bg-[#EDEFF3]${i < recentAnnouncements.length - 1 ? ' border-b border-[#D3D8E0]' : ''}`}
          >
            {ann.urgent && (
              <span className="flex-shrink-0 mt-0.5 w-1.5 h-1.5 rounded-full bg-[#A8242C] mt-1.5" />
            )}
            <span className="flex-1 min-w-0">
              <span className="text-[13px] font-medium text-[#16264A] leading-snug block truncate">
                {ann.title}
              </span>
              <span className="text-[11px] text-[#5A6577] mt-0.5 block">{ann.date}</span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

// ─── Section: Open Grievances ─────────────────────────────────────────────────

interface GrievancesProps {
  onNavigate: (m: Module) => void;
}

function GrievancesSection({ onNavigate }: GrievancesProps) {
  if (openGrievances.length === 0) return null;

  const statusMap: Record<string, 'pending' | 'approved' | 'rejected' | 'under-review'> = {
    open: 'pending',
    in_progress: 'under-review',
    escalated: 'rejected',
  };

  return (
    <section>
      <SectionLabel>Open Grievances</SectionLabel>
      <div className="bg-white">
        {openGrievances.map((g, i) => (
          <div
            key={g.id}
            className={`flex items-center gap-3 px-4 py-3${i < openGrievances.length - 1 ? ' border-b border-[#D3D8E0]' : ''}`}
          >
            <div className="flex-1 min-w-0">
              <span
                className="text-[12px] text-[#5A6577] block leading-none mb-1"
                style={{ fontFamily: "'IBM Plex Mono', monospace" }}
              >
                {g.id}
              </span>
              <span className="text-[13px] font-medium text-[#16264A] block leading-snug truncate">
                {g.subject}
              </span>
              <span className="text-[11px] text-[#5A6577] mt-0.5 block">SLA: {g.slaDeadline}</span>
            </div>
            <div className="flex-shrink-0 flex flex-col items-end gap-2">
              <StatusPill status={statusMap[g.status] ?? 'pending'} />
              <button
                onClick={() => onNavigate('grievance')}
                className="text-[12px] font-medium text-[#E0952A] active:opacity-70"
              >
                Track →
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── Section: Pending Actions ─────────────────────────────────────────────────

interface PendingActionsProps {
  onNavigate: (m: Module) => void;
}

interface ActionItem {
  key: string;
  label: string;
  sub: string;
  target: Module;
  urgent?: boolean;
}

function PendingActions({ onNavigate }: PendingActionsProps) {
  const actions: ActionItem[] = [];

  // Exam form
  if (EXAM_FORM.status === 'open') {
    actions.push({
      key: 'exam-form',
      label: 'Examination form — fill by ' + EXAM_FORM.lastDateFill,
      sub: 'Sem V · Nov 2024 · ₹' + EXAM_FORM.regularFee,
      target: 'examination',
      urgent: true,
    });
  }

  // Library fines
  for (const book of libraryFineBooks) {
    actions.push({
      key: 'lib-fine-' + book.id,
      label: `Library fine due — ₹${book.fine} on '${book.title}'`,
      sub: `Due date: ${book.dueDate}`,
      target: 'library',
    });
  }

  // NSP scholarship missing doc
  if (nspPending) {
    const missingDocs = nspPending.documents.filter(d => !d.uploaded);
    actions.push({
      key: 'nsp-docs',
      label: `NSP Scholarship — ${missingDocs[0]?.name ?? 'Document'} not uploaded`,
      sub: nspPending.name,
      target: 'scholarship',
      urgent: true,
    });
  }

  if (actions.length === 0) return null;

  return (
    <section>
      <SectionLabel>Pending Actions</SectionLabel>
      <div className="bg-white">
        {actions.map((action, i) => (
          <button
            key={action.key}
            onClick={() => onNavigate(action.target)}
            className={`w-full flex items-center gap-3 px-4 py-3 text-left active:bg-[#EDEFF3] transition-colors${i < actions.length - 1 ? ' border-b border-[#D3D8E0]' : ''}`}
          >
            {action.urgent && (
              <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-[#E0952A] mt-0.5 self-start mt-[7px]" />
            )}
            <span className="flex-1 min-w-0">
              <span className="text-[13px] font-medium text-[#16264A] leading-snug block">
                {action.label}
              </span>
              <span className="text-[11px] text-[#5A6577] mt-0.5 block">{action.sub}</span>
            </span>
            <span className="flex-shrink-0 text-[#5A6577]">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

// ─── Student Identity Strip ───────────────────────────────────────────────────

function IdentityStrip() {
  const { data: STUDENT } = useStudentRecord();
  if (!STUDENT) return null;
  return (
    <div className="bg-white border-b border-[#D3D8E0] px-4 py-3 flex items-center gap-3">
      {/* Initials avatar */}
      <div
        className="flex-shrink-0 w-10 h-10 rounded-[2px] flex items-center justify-center text-[15px] font-bold text-white"
        style={{ backgroundColor: '#16264A' }}
      >
        {STUDENT.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-[15px] font-semibold text-[#16264A] leading-tight">{STUDENT.name}</p>
        <p className="text-[12px] text-[#5A6577] truncate">
          {STUDENT.programmeShort} · Sem {STUDENT.semester} · {STUDENT.college.replace('Govt. ', '')}
        </p>
      </div>

      <div className="flex-shrink-0 text-right">
        <p
          className="text-[11px] text-[#5A6577] leading-none"
          style={{ fontFamily: "'IBM Plex Mono', monospace" }}
        >
          {STUDENT.id}
        </p>
        <p className="text-[11px] text-[#0E7A5F] mt-1 font-medium">DigiLocker linked</p>
      </div>
    </div>
  );
}

// ─── Dashboard ───────────────────────────────────────────────────────────────

export default function Dashboard({ onNavigate, onMainNavigate: _onMainNavigate }: Props) {
  return (
    <div className="bg-[#EDEFF3] min-h-full flex flex-col gap-[1px]">
      <IdentityStrip />
      <TodayTimetable />
      <AttendanceSummary onNavigate={onNavigate} />
      <FeeDues onNavigate={onNavigate} />
      <AnnouncementsSection onNavigate={onNavigate} />
      <GrievancesSection onNavigate={onNavigate} />
      <PendingActions onNavigate={onNavigate} />
      {/* Bottom breathing room */}
      <div className="h-4" />
    </div>
  );
}
