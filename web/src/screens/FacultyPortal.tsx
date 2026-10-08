import { useState, type ReactElement } from 'react';
import type { Screen } from '../lib/data';
import { Avatar } from '../components/ui';
import PortalUser, { WorkspaceLink } from '../components/PortalUser';
import { useAuth } from '../lib/auth';
import { useFacultyRecord } from '../lib/facultyqueries';
import FacultyDashboard from './faculty/FacultyDashboard';
import AttendanceMarking from './faculty/AttendanceMarking';
import MarksEntry from './faculty/MarksEntry';
import FacultyTimetable from './faculty/FacultyTimetable';
import StudyMaterial from './faculty/StudyMaterial';
import LeaveApplication from './faculty/LeaveApplication';
import StudentMentoring from './faculty/StudentMentoring';
import ParentMessages from './faculty/ParentMessages';
import MySubjects from './faculty/MySubjects';
import SubjectAllocation from './shared/SubjectAllocation';
import AttendanceAdmin from './shared/AttendanceAdmin';
import TimetableManagement from './shared/TimetableManagement';
import { inst } from '../lib/institution';

interface Props {
  onNavigate: (s: Screen) => void;
}

type Module =
  | 'dashboard'
  | 'subjects'
  | 'allocation'
  | 'attendance'
  | 'att-desk'
  | 'dept-timetable'
  | 'marks'
  | 'timetable'
  | 'study-material'
  | 'leave'
  | 'mentoring'
  | 'parents';

const MODULE_LABELS: Record<Module, string> = {
  dashboard: 'Dashboard',
  subjects: 'My Subjects',
  allocation: 'Subject Allocation',
  attendance: 'Attendance Marking',
  'att-desk': 'Attendance Desk',
  'dept-timetable': 'Department Timetable',
  marks: 'Internal Marks',
  timetable: 'Timetable',
  'study-material': 'Study Material',
  leave: 'Leave Application',
  mentoring: 'Student Mentoring',
  parents: 'Parent Messages',
};

interface NavItem {
  id: Module;
  label: string;
  icon: () => ReactElement;
}

function IconHome() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}
function IconCheck() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 11 12 14 22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  );
}
function IconEdit() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}
function IconCalendar() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}
function IconUpload() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}
function IconBriefcase() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
    </svg>
  );
}
function IconUsers() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}
function IconBell() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}
function IconLogout() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: IconHome },
  { id: 'subjects', label: 'My Subjects', icon: IconUsers },
  { id: 'attendance', label: 'Attendance Marking', icon: IconCheck },
  { id: 'att-desk', label: 'Attendance Desk', icon: IconCalendar },
  { id: 'marks', label: 'Internal Marks', icon: IconEdit },
  { id: 'timetable', label: 'Timetable', icon: IconCalendar },
  { id: 'study-material', label: 'Study Material', icon: IconUpload },
  { id: 'leave', label: 'Leave Application', icon: IconBriefcase },
  { id: 'mentoring', label: 'Student Mentoring', icon: IconUsers },
  { id: 'parents', label: 'Parent Messages', icon: IconBell },
];

export default function FacultyPortal({ onNavigate }: Props) {
  // The shell renders before the profile lands; only the name strip waits.
  const { data: faculty } = useFacultyRecord();
  const { signOut } = useAuth();
  const [module, setModule] = useState<Module>('dashboard');

  // Cast onNavigate to accept unknown so child module Props (onNavigate: (s: unknown) => void) are satisfied
  const moduleProps = {
    onNavigate: onNavigate as (s: unknown) => void,
    onModule: (m: string) => setModule(m as Module),
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[#EDEFF3]" style={{ fontFamily: "'IBM Plex Sans', sans-serif" }}>
      {/* Left Sidebar */}
      <aside className="w-56 flex-shrink-0 bg-[#16264A] flex flex-col h-full">
        {/* Faculty identity */}
        <div className="px-4 py-4 border-b border-white/10">
          <div className="flex items-center gap-2 mb-2">
            <Avatar name={faculty?.name ?? '…'} size={36} />
            <div className="min-w-0">
              <p className="text-white text-[13px] font-semibold truncate leading-tight">{faculty?.name ?? 'Loading…'}</p>
              <p className="text-white/60 text-[11px] truncate">{faculty?.designation ?? ''}</p>
            </div>
          </div>
          <span className="inline-block bg-white/10 text-white/80 text-[10px] font-mono px-2 py-0.5 rounded-[2px] truncate max-w-full">
            {faculty?.department ?? ''}
          </span>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-2 overflow-y-auto">
          {[...NAV_ITEMS, ...(faculty?.isHod ? [{ id: 'allocation' as Module, label: 'Subject Allocation (HOD)', icon: IconCalendar }, { id: 'dept-timetable' as Module, label: 'Department Timetable (HOD)', icon: IconCalendar }] : [])].map((item) => {
            const active = module === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setModule(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-[13px] font-medium transition-colors text-left cursor-pointer
                  ${active
                    ? 'bg-white/10 text-white border-l-2 border-[#E0952A]'
                    : 'text-white/70 hover:bg-white/5 hover:text-white border-l-2 border-transparent'
                  }`}
              >
                <span className="flex-shrink-0"><item.icon /></span>
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Bottom actions */}
        <div className="border-t border-white/10 p-3 space-y-1">
          <WorkspaceLink screen="intelligence" label="At-risk students ↗" onNavigate={onNavigate} className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-white/60 hover:text-white hover:bg-white/5 rounded-[2px] transition-colors cursor-pointer" />
          <button
            onClick={async () => { await signOut(); onNavigate('landing'); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-white/60 hover:text-[#E0952A] hover:bg-white/5 rounded-[2px] transition-colors cursor-pointer"
          >
            <IconLogout />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <header className="h-14 bg-[#0D1B35] flex items-center px-6 gap-4 flex-shrink-0">
          <div className="flex items-center gap-2 mr-4">
            <div className="w-6 h-6 bg-[#E0952A] rounded-[2px] flex items-center justify-center">
              <span className="text-white text-[10px] font-bold">{inst().shortCode}</span>
            </div>
            <span className="text-white font-semibold text-[15px] tracking-tight">Resolion Campus OS</span>
          </div>

          {/* Breadcrumb */}
          <div className="flex-1 flex items-center gap-2 text-[13px]">
            <span className="text-white/40">Faculty Portal</span>
            <span className="text-white/30">/</span>
            <span className="text-white/80">{MODULE_LABELS[module]}</span>
          </div>

          {/* Right: college + bell + avatar */}
          <div className="flex items-center gap-4">
            <span className="text-white/50 text-[12px] truncate max-w-[180px] hidden md:block">
              {faculty?.college ?? ''}
            </span>
            <PortalUser onNavigate={onNavigate} />
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto">
          {module === 'dashboard' && <FacultyDashboard {...moduleProps} />}
          {module === 'subjects' && <MySubjects {...moduleProps} />}
          {module === 'allocation' && <SubjectAllocation />}
          {module === 'attendance' && <AttendanceMarking {...moduleProps} />}
          {module === 'att-desk' && <AttendanceAdmin />}
          {module === 'dept-timetable' && <TimetableManagement />}
          {module === 'marks' && <MarksEntry {...moduleProps} />}
          {module === 'timetable' && <FacultyTimetable {...moduleProps} />}
          {module === 'study-material' && <StudyMaterial {...moduleProps} />}
          {module === 'leave' && <LeaveApplication {...moduleProps} />}
          {module === 'mentoring' && <StudentMentoring {...moduleProps} />}
          {module === 'parents' && <ParentMessages />}
        </main>
      </div>
    </div>
  );
}
