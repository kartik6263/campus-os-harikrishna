/**
 * The workspaces (portals) of the suite, and which roles may open each.
 *
 * One table drives the router's guard, where a user lands after signing in,
 * and the workspace switcher — so a portal a role cannot use is never offered
 * to it, and a link to one is refused the same way everywhere.
 */
import type { Role } from './auth';
import type { Screen } from './data';

export interface Workspace {
  screen: Screen;
  label: string;
  labelHi: string;
  description: string;
  icon: string;
  roles: Role[];
}

export const WORKSPACES: Workspace[] = [
  { screen: 'admin-console', label: 'Command Centre', labelHi: 'कमांड सेंटर', description: 'Live institution dashboard, colleges, students and audit', icon: '◎', roles: ['ADMIN', 'REGISTRAR'] },
  { screen: 'student-portal', label: 'Student Portal', labelHi: 'छात्र पोर्टल', description: 'Attendance, fees, results, hostel, library, certificates', icon: '🎓', roles: ['STUDENT'] },
  { screen: 'parent-portal', label: 'Parent Portal', labelHi: 'अभिभावक पोर्टल', description: "Your ward's attendance, results, fees and messages", icon: '👪', roles: ['PARENT'] },
  { screen: 'faculty-portal', label: 'Faculty Workspace', labelHi: 'संकाय कार्यक्षेत्र', description: 'Timetable, roll call, internal marks, mentoring, leave', icon: '📘', roles: ['FACULTY'] },
  { screen: 'college-office', label: 'College Office', labelHi: 'महाविद्यालय कार्यालय', description: 'Admissions, fee counter, certificates, exam forms', icon: '🏢', roles: ['OFFICE', 'REGISTRAR', 'ADMIN'] },
  { screen: 'principal-portal', label: "Principal's Office", labelHi: 'प्राचार्य कार्यालय', description: 'Approvals, workload, affiliation compliance', icon: '🏛', roles: ['PRINCIPAL', 'REGISTRAR', 'ADMIN'] },
  { screen: 'academic-back-office', label: 'Examination Back-Office', labelHi: 'परीक्षा बैक-ऑफिस', description: 'Exam sessions, centres, evaluation, results', icon: '📝', roles: ['REGISTRAR', 'ADMIN'] },
  { screen: 'acad-ops', label: 'Academic Operations', labelHi: 'शैक्षणिक संचालन', description: 'Admissions, hostel, library, transport, grievances, scholarships', icon: '⚙', roles: ['REGISTRAR', 'ADMIN'] },
  { screen: 'governance', label: 'Governance & Administration', labelHi: 'शासन एवं प्रशासन', description: 'Affiliation, accreditation, procurement, finance, HR, RTI', icon: '⚖', roles: ['PRINCIPAL', 'REGISTRAR', 'ADMIN'] },
  { screen: 'intelligence', label: 'Intelligence Layer', labelHi: 'इंटेलिजेंस लेयर', description: 'At-risk students, projections, AI assistant', icon: '✦', roles: ['FACULTY', 'PRINCIPAL', 'REGISTRAR', 'ADMIN'] },
  { screen: 'vendor-portal', label: 'Vendor Portal', labelHi: 'विक्रेता पोर्टल', description: 'Open tenders, sealed bids, purchase orders, invoices', icon: '🏭', roles: ['VENDOR'] },
  { screen: 'it-console', label: 'IT Cell', labelHi: 'आईटी सेल', description: 'Users, roles, permissions, institution profile, audit chain', icon: '🛡', roles: ['ADMIN', 'REGISTRAR'] },
];

/** Screens anyone may open without signing in. */
export const PUBLIC_SCREENS: Screen[] = [
  'landing', 'login', 'login-student', 'login-staff', 'login-admin', 'login-parent', 'login-vendor', 'cert-verify', 'component-index', 'mobile-app',
];

export const workspaceFor = (screen: Screen) => WORKSPACES.find((w) => w.screen === screen);

export const workspacesFor = (role: Role | undefined) => (role ? WORKSPACES.filter((w) => w.roles.includes(role)) : []);

export function canOpen(role: Role | undefined, screen: Screen): boolean {
  if (PUBLIC_SCREENS.includes(screen)) return true;
  const ws = workspaceFor(screen);
  return Boolean(role && ws?.roles.includes(role));
}

/** Where each role starts. */
export const HOME: Record<Role, Screen> = {
  STUDENT: 'student-portal',
  PARENT: 'parent-portal',
  FACULTY: 'faculty-portal',
  OFFICE: 'college-office',
  PRINCIPAL: 'principal-portal',
  REGISTRAR: 'admin-console',
  ADMIN: 'admin-console',
  VENDOR: 'vendor-portal',
};

/** Which sign-in form suits a workspace when a signed-out visitor asks for it. */
export function loginFor(screen: Screen): Screen {
  if (screen === 'student-portal') return 'login-student';
  if (screen === 'parent-portal') return 'login-parent';
  if (screen === 'vendor-portal') return 'login-vendor';
  if (screen === 'admin-console' || screen === 'it-console') return 'login-admin';
  return 'login-staff';
}
