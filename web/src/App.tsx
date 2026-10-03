import { lazy, Suspense, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LangProvider } from './lib/language';
import { AuthProvider, useAuth, ROLE_TITLES, type Role } from './lib/auth';
import { Button, PermissionDenied, Spinner, ToastContainer } from './components/ui';
import { InstitutionBoundary, InstitutionTitle } from './lib/institution';
import { HOME, PUBLIC_SCREENS, canOpen, loginFor, workspaceFor } from './lib/workspaces';
import WorkspaceSwitcher from './components/WorkspaceSwitcher';
import ErrorBoundary from './components/ErrorBoundary';
import Landing from './screens/Landing';
import Login from './screens/Login';
import { ForceChangePassword, ResetPassword } from './screens/PasswordScreens';
import type { Screen } from './lib/data';

// Each workspace is its own chunk, fetched when first opened: a student never
// downloads the examination back-office, nor a vendor the student portal.
const CertVerification = lazy(() => import('./screens/CertVerification'));
const ComponentIndex = lazy(() => import('./screens/ComponentIndex'));
const StudentPortal = lazy(() => import('./screens/StudentPortal'));
const AdminConsole = lazy(() => import('./screens/AdminConsole'));
const ITConsole = lazy(() => import('./screens/ITConsole'));
const FacultyPortal = lazy(() => import('./screens/FacultyPortal'));
const CollegeOffice = lazy(() => import('./screens/CollegeOffice'));
const PrincipalPortal = lazy(() => import('./screens/PrincipalPortal'));
const AcademicBackOffice = lazy(() => import('./screens/AcademicBackOffice'));
const AcadOps = lazy(() => import('./screens/AcadOps'));
const GovernanceOps = lazy(() => import('./screens/GovernanceOps'));
const IntelligenceLayer = lazy(() => import('./screens/IntelligenceLayer'));
const ParentPortal = lazy(() => import('./screens/ParentPortal'));
const VendorPortal = lazy(() => import('./screens/VendorPortal'));
const MobileAppShowcase = lazy(() => import('./screens/MobileAppShowcase'));

const pageSpinner = <div className="min-h-screen flex items-center justify-center bg-[#EDEFF3]"><Spinner size={24} /></div>;

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => {
          // The client already handled auth failures; retrying just repeats them.
          const status = (error as { status?: number })?.status;
          if (status === 401 || status === 403) return false;
          return failureCount < 2;
        },
      },
    },
  });
}

/** The token from an emailed "forgot password" link, if the page was opened from one. */
function readResetToken(): string | null {
  const token = new URLSearchParams(window.location.search).get('reset');
  if (token) window.history.replaceState(null, '', window.location.pathname); // keep it out of history
  return token;
}

/** A certificate's QR code opens the public verification page with its number and signature. */
function readVerifyLink(): { no: string; sig?: string } | null {
  const q = new URLSearchParams(window.location.search);
  const no = q.get('verify');
  if (!no) return null;
  window.history.replaceState(null, '', window.location.pathname);
  return { no, sig: q.get('sig') ?? undefined };
}
const VERIFY_LINK = readVerifyLink();

const LOGIN_ROUTE: Partial<Record<Screen, 'student' | 'staff' | 'admin' | 'parent' | 'vendor'>> = {
  'login-student': 'student',
  'login-staff': 'staff',
  'login-admin': 'admin',
  'login-parent': 'parent',
  'login-vendor': 'vendor',
};

function Router() {
  const verifyLink = VERIFY_LINK;
  const [screen, setScreen] = useState<Screen>(verifyLink ? 'cert-verify' : 'landing');
  const [resetToken, setResetToken] = useState(readResetToken);
  const { user, loading } = useAuth();

  function navigate(s: Screen) {
    setScreen(s);
    window.scrollTo(0, 0);
  }

  if (resetToken) {
    return <ResetPassword token={resetToken} onDone={s => { setResetToken(null); navigate(s); }} />;
  }

  // A password the IT Cell issued must be replaced before anything else —
  // except on a sign-in page, which runs that step itself.
  if (user?.mustChangePassword && !screen.startsWith('login')) {
    return <ForceChangePassword onNavigate={navigate} />;
  }

  // The old generic staff portal is now each role's own workspace.
  const target: Screen = screen === 'staff-portal' ? (user ? HOME[user.role] : 'login-staff') : screen;

  if (!PUBLIC_SCREENS.includes(target)) {
    // Until the cookie session has been checked, show nothing rather than
    // flashing either the workspace or the sign-in form.
    if (loading) {
      return <div className="min-h-screen flex items-center justify-center bg-[#EDEFF3]"><Spinner size={24} /></div>;
    }
    // Signed out: the sign-in that suits the workspace, returning to it after.
    if (!user) {
      return <Login onNavigate={navigate} route={LOGIN_ROUTE[loginFor(target)] ?? 'staff'} returnTo={target} />;
    }
    if (!canOpen(user.role, target)) {
      return <AccessDenied role={user.role} screen={target} onNavigate={navigate} />;
    }
  }

  const loginRoute = LOGIN_ROUTE[target];

  return (
    <InstitutionBoundary>
      {target === 'landing' && <Landing onNavigate={navigate} />}
      {target === 'login' && <Login onNavigate={navigate} route="chooser" />}
      {loginRoute && <Login key={loginRoute} onNavigate={navigate} route={loginRoute} />}
      <ErrorBoundary resetKey={target} onHome={user ? () => navigate(HOME[user.role]) : () => navigate('landing')}>
      <Suspense fallback={pageSpinner}>
      {target === 'cert-verify' && <CertVerification onNavigate={navigate} initial={verifyLink} />}
      {target === 'component-index' && <ComponentIndex onNavigate={navigate} />}
      {target === 'student-portal' && <StudentPortal onNavigate={navigate} />}
      {target === 'admin-console' && <AdminConsole onNavigate={navigate} />}
      {target === 'it-console' && <ITConsole onNavigate={navigate} />}
      {target === 'faculty-portal' && <FacultyPortal onNavigate={navigate} />}
      {target === 'college-office' && <CollegeOffice onNavigate={navigate} />}
      {target === 'principal-portal' && <PrincipalPortal onNavigate={navigate} />}
      {target === 'academic-back-office' && <AcademicBackOffice onNavigate={navigate} />}
      {target === 'acad-ops' && <AcadOps onNavigate={navigate} />}
      {target === 'governance' && <GovernanceOps onNavigate={navigate} />}
      {target === 'intelligence' && <IntelligenceLayer onNavigate={navigate} />}
      {target === 'parent-portal' && <ParentPortal onNavigate={navigate} />}
      {target === 'vendor-portal' && <VendorPortal onNavigate={navigate} />}
      {target === 'mobile-app' && <MobileAppShowcase onNavigate={navigate} />}
      </Suspense>
      </ErrorBoundary>
      {/* A supplier has one portal, and the switcher searches campus records it may not read. */}
      {user && user.role !== 'VENDOR' && !PUBLIC_SCREENS.includes(target) && <WorkspaceSwitcher current={target} onNavigate={navigate} />}
    </InstitutionBoundary>
  );
}

export default function App() {
  const [queryClient] = useState(makeQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      <LangProvider>
        <AuthProvider>
          <InstitutionTitle />
          <ToastContainer />
          <Router />
        </AuthProvider>
      </LangProvider>
    </QueryClientProvider>
  );
}

/** A signed-in user asking for a workspace their role does not use. */
function AccessDenied({ role, screen, onNavigate }: { role: Role; screen: Screen; onNavigate: (s: Screen) => void }) {
  const { signOut } = useAuth();
  const ws = workspaceFor(screen);
  return (
    <div className="min-h-screen bg-[#EDEFF3] flex items-center justify-center p-6">
      <div className="bg-white border border-[#D3D8E0] rounded-[4px] max-w-md w-full">
        <PermissionDenied role={ROLE_TITLES[role]} />
        {ws && (
          <p className="text-center text-[13px] text-[#5A6577] -mt-8 mb-6 px-6">
            {ws.label} is open to: {ws.roles.map(r => ROLE_TITLES[r]).join(', ')}.
          </p>
        )}
        <div className="flex gap-3 justify-center pb-8">
          <Button variant="secondary" onClick={async () => { await signOut(); onNavigate(loginFor(screen)); }}>
            Sign in as someone else
          </Button>
          <Button onClick={() => onNavigate(HOME[role])}>Go to my workspace</Button>
        </div>
      </div>
    </div>
  );
}
