import { useEffect, useRef, useState } from 'react';
import { useLang } from '../lib/language';
import { useAuth, type SessionUser } from '../lib/auth';
import { api, ApiError } from '../lib/api';
import { Turnstile, TURNSTILE_SITE_KEY, type TurnstileHandle } from '../components/Turnstile';
import { Button, Input, InlineAlert, OtpInput, Spinner } from '../components/ui';
import type { Screen } from '../lib/data';
import { PRODUCT_NAME, useInstitution } from '../lib/institution';
import { isTenantSite } from '../lib/tenant';
import { HOME, canOpen } from '../lib/workspaces';

interface Props {
  onNavigate: (s: Screen) => void;
  route?: 'student' | 'staff' | 'admin' | 'parent' | 'vendor' | 'chooser';
  /** Where to go after signing in, when the user was stopped on the way there. */
  returnTo?: Screen;
}

type LoginState = 'idle' | 'loading' | 'otp-sent' | 'otp-expired' | 'otp-wrong' | 'wrong-password' | 'locked' | 'first-login' | 'reset-success' | 'success';

const ROUTE_CONFIG = {
  chooser: { title: 'Sign In to Resolion Campus OS', titleHi: 'Resolion Campus OS में साइन इन करें', subtitle: 'Choose your access type', subtitleHi: 'अपना एक्सेस प्रकार चुनें' },
  student: { title: 'Student & Parent Portal', titleHi: 'छात्र एवं अभिभावक पोर्टल', subtitle: 'Enrolment number or registered mobile', subtitleHi: 'नामांकन संख्या या पंजीकृत मोबाइल' },
  staff: { title: 'Faculty & Staff Portal', titleHi: 'शिक्षक एवं कर्मचारी पोर्टल', subtitle: 'Employee code or official email', subtitleHi: 'कर्मचारी कोड या आधिकारिक ईमेल' },
  admin: { title: 'Admin Console', titleHi: 'एडमिन कंसोल', subtitle: 'Official email address', subtitleHi: 'आधिकारिक ईमेल पता' },
  parent: { title: 'Parent Login', titleHi: 'अभिभावक लॉगिन', subtitle: "Student enrolment number + parent's mobile OTP", subtitleHi: 'छात्र नामांकन संख्या + अभिभावक मोबाइल OTP' },
  vendor: { title: 'Vendor / Supplier Portal', titleHi: 'विक्रेता / आपूर्तिकर्ता पोर्टल', subtitle: 'Registered email and password', subtitleHi: 'पंजीकृत ईमेल और पासवर्ड' },
};

const PORTALS: Array<{ id: 'student' | 'staff' | 'admin' | 'parent' | 'vendor'; label: string; labelHi: string; desc: string; descHi: string }> = [
  { id: 'student', label: 'Student Portal', labelHi: 'छात्र पोर्टल', desc: 'Results, fee, certificates', descHi: 'परिणाम, शुल्क, प्रमाण-पत्र' },
  { id: 'parent', label: 'Parent Access', labelHi: 'अभिभावक एक्सेस', desc: 'View ward\'s progress', descHi: 'वार्ड की प्रगति देखें' },
  { id: 'staff', label: 'Faculty & Staff', labelHi: 'शिक्षक एवं कर्मचारी', desc: 'Attendance, marks, payroll', descHi: 'उपस्थिति, अंक, वेतन' },
  { id: 'admin', label: 'Admin Console', labelHi: 'एडमिन कंसोल', desc: 'Administration & IT Cell', descHi: 'प्रशासन एवं आईटी सेल' },
  { id: 'vendor', label: 'Vendors & Suppliers', labelHi: 'विक्रेता एवं आपूर्तिकर्ता', desc: 'Tenders, bids, purchase orders, invoices', descHi: 'निविदा, बोली, क्रय आदेश, बिल' },
];

// The accounts created by the backend seed (prisma/seed.ts).
const SEEDED_DEMO_CREDS = {
  student: { id: 'priya.sharma.2021@demo.resolion.edu', pass: 'campus123' },
  staff: { id: 'rk.mishra@demo.resolion.edu', pass: 'campus123' },
  admin: { id: 'admin@demo.resolion.edu', pass: 'campus123' },
  parent: { id: 'parent.sharma@example.in', pass: 'campus123' },
  vendor: { id: 'ajay@technocraft.in', pass: 'campus123' },
  chooser: { id: '', pass: '' },
};

const NO_DEMO = { student: { id: '', pass: '' }, staff: { id: '', pass: '' }, admin: { id: '', pass: '' }, parent: { id: '', pass: '' }, vendor: { id: '', pass: '' }, chooser: { id: '', pass: '' } };

/** Demo sign-ins are hints on the demo only — never on an institute's own site. */
const DEMO_CREDS = isTenantSite() ? NO_DEMO : SEEDED_DEMO_CREDS;

/** Every seeded role, for one-click sign-in on the demo. */
const DEMO_ACCOUNTS: Record<'staff' | 'admin', Array<{ label: string; email: string }>> = {
  staff: [
    { label: 'Faculty', email: 'rk.mishra@demo.resolion.edu' },
    { label: 'Head of Department', email: 'ml.gupta@demo.resolion.edu' },
    { label: 'College Office', email: 'pushpa.sharma@demo.resolion.edu' },
    { label: 'Principal', email: 'principal@demo.resolion.edu' },
  ],
  admin: [
    { label: 'Administrator', email: 'admin@demo.resolion.edu' },
    { label: 'Registrar', email: 'registrar@demo.resolion.edu' },
  ],
};

/** Where a user goes after signing in: the page they were stopped on, if their role may open it, else their own workspace. */
const destinationFor = (user: SessionUser, returnTo?: Screen | null): Screen =>
  returnTo && canOpen(user.role, returnTo) ? returnTo : HOME[user.role];

/** Routes the API can actually authenticate. */
const LIVE_ROUTES: string[] = ['student', 'staff', 'admin', 'parent', 'vendor'];

export default function Login({ onNavigate, route = 'chooser', returnTo }: Props) {
  const { lang, toggle, t } = useLang();
  const [identifier, setIdentifier] = useState(DEMO_CREDS[route]?.id ?? '');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [loginState, setLoginState] = useState<LoginState>('idle');
  const [useOtp, setUseOtp] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [forgotMode, setForgotMode] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const [changing, setChanging] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const { user, signIn, adoptSession, patchUser } = useAuth();
  // Where to go once a required password change is done.
  const [pendingScreen, setPendingScreen] = useState<Screen | null>(null);
  const [forgotEmail, setForgotEmail] = useState('');
  // Open only until the organisation's IT Cell account exists.
  const [setupOpen, setSetupOpen] = useState(false);
  useEffect(() => {
    if (route !== 'admin') return;
    api<{ itCellSetupOpen: boolean }>('/api/auth/setup', { anonymous: true })
      .then(r => setSetupOpen(r.itCellSetupOpen))
      .catch(() => setSetupOpen(false));
  }, [route]);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const captcha = useRef<TurnstileHandle>(null);
  const [signupMode, setSignupMode] = useState(false);
  // On the demo deployment without a mail server, the API returns the code to show.
  const [demoCode, setDemoCode] = useState<string | null>(null);
  const [otpBusy, setOtpBusy] = useState(false);

  const inst = useInstitution();
  // "Contact IT Cell: <number>" only when the institution has set one.
  const helpSuffix = inst.helpLine ? `: ${inst.helpLine}` : '';
  const cfg = ROUTE_CONFIG[route];
  // Both the password and the emailed-code paths are held to the captcha.
  const needsCaptcha = LIVE_ROUTES.includes(route);
  const demo = DEMO_CREDS[route];
  const MAX_ATTEMPTS = 5;

  function getIdLabel() {
    // The API authenticates on email for every role.
    if (route === 'parent') return t("Parent's Email", 'अभिभावक का ईमेल');
    if (route === 'staff' || route === 'admin') return t('Official Email', 'आधिकारिक ईमेल');
    if (route === 'vendor') return t('Registered Email', 'पंजीकृत ईमेल');
    return t('Email', 'ईमेल');
  }

  function getIdPlaceholder() {
    return DEMO_CREDS[route]?.id || 'you@college.ac.in';
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loginState === 'locked') return;

    setAuthError(null);

    // A parent always signs in with an emailed code; anyone else may choose to.
    if (useOtp || route === 'parent') {
      setLoginState('loading');
      const sent = await requestCode();
      setLoginState(sent ? 'otp-sent' : 'idle');
      return;
    }

    setLoginState('loading');
    try {
      const user = await signIn(identifier.trim(), password, captchaToken ?? undefined);
      // Send the user where their role belongs, not where the form was opened.
      const dest = destinationFor(user, returnTo);
      // A password the IT Cell issued has to be replaced before going on.
      if (user.mustChangePassword) {
        setPendingScreen(dest);
        setLoginState('first-login');
        return;
      }
      setLoginState('success');
      await delay(400);
      onNavigate(dest);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        const next = attempts + 1;
        setAttempts(next);
        setLoginState(next >= MAX_ATTEMPTS ? 'locked' : 'wrong-password');
      } else {
        setAuthError(
          err instanceof ApiError
            ? err.message
            : unreachable(t),
        );
        setLoginState('idle');
      }
    } finally {
      // A Turnstile token is spent by the attempt, whatever its outcome.
      captcha.current?.reset();
    }
  }

  /** Asks the API to email a sign-in code. Returns whether one is on its way. */
  async function requestCode(): Promise<boolean> {
    setAuthError(null);
    setOtpBusy(true);
    try {
      const res = await api<{ sent: boolean; demoCode?: string }>('/api/auth/otp/request', {
        method: 'POST',
        anonymous: true,
        body: { email: identifier.trim(), turnstileToken: captchaToken ?? undefined },
      });
      setDemoCode(res.demoCode ?? null);
      setOtp('');
      return true;
    } catch (err) {
      setAuthError(err instanceof ApiError ? err.message : unreachable(t));
      return false;
    } finally {
      captcha.current?.reset();
      setOtpBusy(false);
    }
  }

  async function handleOtpVerify(e: React.FormEvent) {
    e.preventDefault();
    setAuthError(null);
    setOtpBusy(true);
    try {
      const payload = await api<{ accessToken: string; user: SessionUser }>('/api/auth/otp/verify', {
        method: 'POST',
        anonymous: true,
        body: { email: identifier.trim(), code: otp },
      });
      const user = await adoptSession(payload);
      const dest = destinationFor(user, returnTo);
      if (user.mustChangePassword) {
        setPendingScreen(dest);
        setLoginState('first-login');
        return;
      }
      setLoginState('success');
      await delay(300);
      onNavigate(dest);
    } catch (err) {
      const code = err instanceof ApiError ? err.code : undefined;
      setAuthError(err instanceof ApiError ? err.message : unreachable(t));
      setOtp('');
      setLoginState(code === 'otp_expired' || code === 'otp_missing' ? 'otp-expired' : 'otp-wrong');
    } finally {
      setOtpBusy(false);
    }
  }

  async function handlePasswordReset(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) return;
    setAuthError(null);
    setChanging(true);
    try {
      await api('/api/auth/change-password', {
        method: 'POST',
        body: { currentPassword: password, newPassword },
      });
      patchUser({ mustChangePassword: false });
      setLoginState('success');
      onNavigate(pendingScreen ?? (user ? destinationFor(user, returnTo) : 'landing'));
    } catch (err) {
      setAuthError(err instanceof ApiError ? err.message : unreachable(t));
    } finally {
      setChanging(false);
    }
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault();
    setAuthError(null);
    setLoginState('loading');
    try {
      await api('/api/auth/forgot-password', {
        method: 'POST',
        anonymous: true,
        body: { email: forgotEmail.trim(), turnstileToken: captchaToken ?? undefined },
      });
      setForgotSent(true);
      setForgotMode(false);
    } catch (err) {
      setAuthError(err instanceof ApiError ? err.message : unreachable(t));
    } finally {
      captcha.current?.reset();
      setLoginState('idle');
    }
  }

  if (route === 'chooser') {
    return (
      <LoginShell onNavigate={onNavigate} lang={lang} toggle={toggle} t={t}>
        <div className="max-w-md w-full">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 bg-[#16264A] rounded-[4px] flex items-center justify-center text-white font-bold text-[15px]">{inst.shortCode}</div>
            <div>
              <p className="text-[17px] font-semibold text-[#16264A]">{PRODUCT_NAME}</p>
              <p className="text-[12px] text-[#5A6577]">{lang === 'hi' ? inst.displayName(lang) : inst.place}</p>
            </div>
          </div>
          <h1 className="text-h2 font-semibold text-[#16264A] mb-1">{lang === 'hi' ? cfg.titleHi : cfg.title}</h1>
          <p className="text-[14px] text-[#5A6577] mb-6">{lang === 'hi' ? cfg.subtitleHi : cfg.subtitle}</p>
          <div className="flex flex-col gap-2">
            {PORTALS.map(p => (
              <button key={p.id} onClick={() => onNavigate(`login-${p.id}` as Screen)}
                className="flex items-center justify-between px-4 py-3.5 bg-white border border-[#D3D8E0] rounded-[4px] hover:border-[#E0952A] hover:bg-[#FEF9EC] transition-colors cursor-pointer group">
                <div>
                  <p className="text-[14px] font-medium text-[#16264A]">{lang === 'hi' ? p.labelHi : p.label}</p>
                  <p className="text-[12px] text-[#5A6577]">{lang === 'hi' ? p.descHi : p.desc}</p>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D3D8E0" strokeWidth="2" className="group-hover:stroke-[#E0952A] transition-colors"><path d="M9 18l6-6-6-6"/></svg>
              </button>
            ))}
          </div>
          <button onClick={() => onNavigate('cert-verify')} className="mt-6 text-[13px] text-[#5A6577] hover:text-[#16264A] cursor-pointer">{t('Verify a certificate without signing in →', 'साइन इन किए बिना प्रमाण-पत्र सत्यापित करें →')}</button>
        </div>
      </LoginShell>
    );
  }

  if (signupMode) {
    return (
      <LoginShell onNavigate={onNavigate} lang={lang} toggle={toggle} t={t}>
        {route === 'vendor' ? (
          <VendorRegister
            t={t}
            lang={lang}
            onBack={() => setSignupMode(false)}
            onCreated={async payload => {
              // Signed in at once; the portal says what empanelment still needs.
              await adoptSession(payload);
              onNavigate('vendor-portal');
            }}
          />
        ) : (
          <CreateAccount
            t={t}
            lang={lang}
            onBack={() => setSignupMode(false)}
            onCreated={async payload => {
              // The IT Cell is signed in straight away and starts at its console.
              await adoptSession(payload);
              onNavigate('it-console');
            }}
          />
        )}
      </LoginShell>
    );
  }

  if (loginState === 'first-login') {
    return (
      <LoginShell onNavigate={onNavigate} lang={lang} toggle={toggle} t={t}>
        <form onSubmit={handlePasswordReset} className="max-w-md w-full">
          <h1 className="text-h2 font-semibold text-[#16264A] mb-1">{t('Set your password', 'अपना पासवर्ड सेट करें')}</h1>
          <p className="text-[14px] text-[#5A6577] mb-6">{t('Your IT Cell gave you this password. Set your own before continuing.', 'यह पासवर्ड आपके IT Cell ने दिया है। आगे बढ़ने से पहले अपना पासवर्ड सेट करें।')}</p>
          {authError && <div className="mb-4"><InlineAlert type="error">{authError}</InlineAlert></div>}
          <InlineAlert type="warning">{t(`Do not share your password. ${inst.name} staff will never ask for it.`, 'अपना पासवर्ड किसी के साथ साझा न करें।')}</InlineAlert>
          <div className="flex flex-col gap-4 mt-5">
            <Input label={t('New Password', 'नया पासवर्ड')} type={showPass ? 'text' : 'password'} value={newPassword} onChange={e => setNewPassword(e.target.value)} required
              hint={t('Min 8 characters, one uppercase, one number', 'न्यूनतम 8 अक्षर, एक अपरकेस, एक अंक')}
              suffix={<button type="button" onClick={() => setShowPass(s => !s)} className="cursor-pointer text-[12px] text-[#5A6577]">{showPass ? t('Hide', 'छुपाएं') : t('Show', 'दिखाएं')}</button>} />
            <Input label={t('Confirm New Password', 'पासवर्ड की पुष्टि करें')} type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required
              error={confirmPassword && newPassword !== confirmPassword ? t('Passwords do not match', 'पासवर्ड मेल नहीं खाते') : undefined} />
            <Button type="submit" loading={changing} disabled={!newPassword || newPassword !== confirmPassword || newPassword.length < 8 || !/[A-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)}>
              {t('Set Password & Continue', 'पासवर्ड सेट करें और जारी रखें')}
            </Button>
          </div>
        </form>
      </LoginShell>
    );
  }

  if (loginState === 'otp-sent' || loginState === 'otp-expired' || loginState === 'otp-wrong') {
    return (
      <LoginShell onNavigate={onNavigate} lang={lang} toggle={toggle} t={t}>
        <form onSubmit={handleOtpVerify} className="max-w-md w-full">
          <button type="button" onClick={() => { setLoginState('idle'); setOtp(''); }} className="flex items-center gap-1 text-[13px] text-[#5A6577] hover:text-[#16264A] cursor-pointer mb-6">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg> {t('Back', 'वापस')}
          </button>
          <h1 className="text-h2 font-semibold text-[#16264A] mb-1">{t('Enter OTP', 'OTP दर्ज करें')}</h1>
          <p className="text-[14px] text-[#5A6577] mb-4">
            {t(`If ${identifier.trim()} has an account, a 6-digit code has been emailed to it. It expires in 10 minutes.`, `यदि ${identifier.trim()} का खाता है, तो उस पर 6 अंकों का कोड ईमेल किया गया है। यह 10 मिनट में समाप्त होगा।`)}
          </p>
          {demoCode && (
            <div className="mb-4">
              <InlineAlert type="info">
                {t('Demo deployment — no mail server is connected, so your code is shown here:', 'डेमो — मेल सर्वर नहीं जुड़ा है, इसलिए आपका कोड यहां दिखाया गया है:')}{' '}
                <button type="button" onClick={() => setOtp(demoCode)} className="font-mono font-bold tracking-widest underline cursor-pointer">{demoCode}</button>
              </InlineAlert>
            </div>
          )}
          {authError && (loginState === 'otp-expired' || loginState === 'otp-wrong') && <InlineAlert type="error">{authError}</InlineAlert>}
          <div className="mt-5 mb-6">
            <OtpInput value={otp} onChange={setOtp} />
          </div>
          <Button type="submit" loading={otpBusy} disabled={otp.length < 6} className="w-full">
            {t('Verify OTP', 'OTP सत्यापित करें')}
          </Button>
          <button type="button" disabled={otpBusy} onClick={async () => { if (await requestCode()) setLoginState('otp-sent'); }} className="mt-4 text-[13px] text-[#E0952A] hover:underline cursor-pointer disabled:opacity-50">{otpBusy ? t('Sending…', 'भेजा जा रहा है…') : t('Send a new code', 'नया कोड भेजें')}</button>
        </form>
      </LoginShell>
    );
  }

  return (
    <LoginShell onNavigate={onNavigate} lang={lang} toggle={toggle} t={t}>
      <div className="max-w-md w-full">
        <button onClick={() => onNavigate('login')} className="flex items-center gap-1 text-[13px] text-[#5A6577] hover:text-[#16264A] cursor-pointer mb-6">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg> {t('All portals', 'सभी पोर्टल')}
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="w-8 h-8 bg-[#16264A] rounded-[4px] flex items-center justify-center text-white font-bold text-[12px]">{inst.shortCode}</div>
          <div>
            <p className="text-[14px] font-semibold text-[#16264A]">{lang === 'hi' ? cfg.titleHi : cfg.title}</p>
            <p className="text-[12px] text-[#5A6577]">{lang === 'hi' ? cfg.subtitleHi : cfg.subtitle}</p>
          </div>
        </div>

        {loginState === 'locked' && (
          <InlineAlert type="error">
            {t(`Account locked after ${MAX_ATTEMPTS} failed attempts. Contact the IT Cell${helpSuffix}`, `${MAX_ATTEMPTS} असफल प्रयासों के बाद खाता लॉक। IT Cell से संपर्क करें${helpSuffix}`)}
          </InlineAlert>
        )}

        {forgotSent && (
          <InlineAlert type="success">
            {t('If that email has an account, a link to set a new password has been sent to it. It works once, for 30 minutes.', 'यदि उस ईमेल का खाता है, तो नया पासवर्ड सेट करने का लिंक भेज दिया गया है। यह 30 मिनट तक एक बार काम करेगा।')}
          </InlineAlert>
        )}

        {!forgotMode ? (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4 mt-4">
            {authError && <InlineAlert type="error">{authError}</InlineAlert>}

            <Input
              label={getIdLabel()}
              labelHi={getIdLabel()}
              placeholder={getIdPlaceholder()}
              value={identifier}
              onChange={e => setIdentifier(e.target.value)}
              required
              hint={demo.id ? `${t('Demo:', 'डेमो:')} ${demo.id}` : undefined}
            />

            {!useOtp && (
              <Input
                label={t('Password', 'पासवर्ड')}
                type={showPass ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                hint={demo.pass ? `${t('Demo:', 'डेमो:')} ${demo.pass}` : undefined}
                error={loginState === 'wrong-password'
                  ? t(`Wrong password. ${MAX_ATTEMPTS - attempts} attempts remaining.`, `गलत पासवर्ड। ${MAX_ATTEMPTS - attempts} प्रयास शेष।`)
                  : undefined}
                suffix={<button type="button" onClick={() => setShowPass(s => !s)} className="cursor-pointer text-[12px] text-[#5A6577]">{showPass ? t('Hide', 'छुपाएं') : t('Show', 'दिखाएं')}</button>}
              />
            )}

            {!useOtp && (
              <div className="flex items-center justify-between">
                <button type="button" onClick={() => setUseOtp(true)} className="text-[13px] text-[#5A6577] hover:text-[#16264A] cursor-pointer">{t('Use OTP instead', 'OTP से लॉगिन करें')}</button>
                <button type="button" onClick={() => { setForgotMode(true); setForgotSent(false); setAuthError(null); setForgotEmail(identifier.includes('@') ? identifier : ''); }} className="text-[13px] text-[#E0952A] hover:underline cursor-pointer">{t('Forgot password?', 'पासवर्ड भूल गए?')}</button>
              </div>
            )}

            {useOtp && route !== 'parent' && (
              <div className="flex items-center justify-between">
                <button type="button" onClick={() => setUseOtp(false)} className="text-[13px] text-[#5A6577] hover:text-[#16264A] cursor-pointer">{t('Use password instead', 'पासवर्ड से लॉगिन करें')}</button>
              </div>
            )}

            {needsCaptcha && <Turnstile ref={captcha} onToken={setCaptchaToken} lang={lang} />}

            <Button type="submit" loading={loginState === 'loading'} disabled={loginState === 'locked' || !identifier || (needsCaptcha && !!TURNSTILE_SITE_KEY && !captchaToken)} className="w-full">
              {useOtp || route === 'parent' ? t('Send OTP', 'OTP भेजें') : t('Sign In', 'साइन इन करें')}
            </Button>

            {route === 'admin' && setupOpen && (
              <p className="text-[13px] text-[#5A6577] text-center">
                {t('Setting up for the first time?', 'पहली बार सेट अप कर रहे हैं?')}{' '}
                <button type="button" onClick={() => setSignupMode(true)} className="text-[#E0952A] font-medium hover:underline cursor-pointer">
                  {t('Create IT Cell account', 'IT Cell खाता बनाएं')}
                </button>
              </p>
            )}
            {route === 'vendor' && (
              <p className="text-[13px] text-[#5A6577] text-center">
                {t('New supplier?', 'नए आपूर्तिकर्ता?')}{' '}
                <button type="button" onClick={() => setSignupMode(true)} className="text-[#E0952A] font-medium hover:underline cursor-pointer">
                  {t('Register your firm', 'अपनी फर्म पंजीकृत करें')}
                </button>
              </p>
            )}
            {route === 'admin' && !setupOpen && (
              <p className="text-[12px] text-[#5A6577] text-center">
                {t('Need an account? Your IT Cell creates it for you.', 'खाता चाहिए? आपका IT Cell इसे बनाता है।')}
              </p>
            )}

            {!isTenantSite() && (route === 'staff' || route === 'admin') && (
              <div className="border border-dashed border-[#D3D8E0] rounded-[4px] p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[#5A6577] mb-2">{t('Demo accounts · password campus123', 'डेमो खाते · पासवर्ड campus123')}</p>
                <div className="flex flex-wrap gap-1.5">
                  {DEMO_ACCOUNTS[route].map(a => (
                    <button key={a.email} type="button"
                      onClick={() => { setIdentifier(a.email); setPassword('campus123'); setUseOtp(false); setAuthError(null); }}
                      className={`text-[12px] px-2.5 py-1 rounded-[4px] border cursor-pointer transition-colors ${identifier === a.email ? 'border-[#E0952A] bg-[#FEF9EC] text-[#16264A] font-medium' : 'border-[#D3D8E0] text-[#5A6577] hover:border-[#E0952A]'}`}>
                      {a.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </form>
        ) : (
          <form onSubmit={handleForgot} className="flex flex-col gap-4 mt-4">
            {authError && <InlineAlert type="error">{authError}</InlineAlert>}
            <p className="text-[14px] text-[#5A6577]">{t('Enter the email you sign in with. We will email you a link to set a new password.', 'जिस ईमेल से आप साइन इन करते हैं, वह दर्ज करें। हम नया पासवर्ड सेट करने का लिंक ईमेल करेंगे।')}</p>
            <Input label={t('Email', 'ईमेल')} type="email" value={forgotEmail} onChange={e => setForgotEmail(e.target.value)} required autoComplete="email" />
            <Turnstile ref={captcha} onToken={setCaptchaToken} lang={lang} />
            <div className="flex gap-3">
              <Button type="button" variant="secondary" onClick={() => setForgotMode(false)}>{t('Cancel', 'रद्द करें')}</Button>
              <Button type="submit" loading={loginState === 'loading'} disabled={!forgotEmail || (!!TURNSTILE_SITE_KEY && !captchaToken)}>{t('Send Reset Link', 'रीसेट लिंक भेजें')}</Button>
            </div>
          </form>
        )}

        <div className="mt-6 pt-5 border-t border-[#D3D8E0]">
          <p className="text-[12px] text-[#5A6577] text-center">{inst.helpLine
            ? t(`Having trouble? Contact your office or call the IT Cell: ${inst.helpLine}`, `समस्या? अपने कार्यालय से संपर्क करें या IT Cell: ${inst.helpLine} पर कॉल करें`)
            : t('Having trouble? Contact your office or the IT Cell.', 'समस्या? अपने कार्यालय या IT Cell से संपर्क करें।')}</p>
        </div>
      </div>
    </LoginShell>
  );
}

/**
 * The organisation's IT Cell creates its own account, once. It is active and
 * signed in at once; everyone else is given an ID by the IT Cell.
 */
function CreateAccount({ t, lang, onBack, onCreated }: { t: (a: string, b: string) => string; lang: string; onBack: () => void; onCreated: (payload: { accessToken: string; user: SessionUser }) => void | Promise<void> }) {
  const inst = useInstitution();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const captcha = useRef<TurnstileHandle>(null);

  const weak = password.length > 0 && (password.length < 8 || !/[A-Z]/.test(password) || !/[0-9]/.test(password));
  const mismatch = confirm.length > 0 && password !== confirm;
  const ready = name.trim().length >= 2 && !!email && !!password && !weak && password === confirm && (!TURNSTILE_SITE_KEY || !!captchaToken);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setError(null);
    setBusy(true);
    try {
      const res = await api<{ accessToken: string; user: SessionUser }>('/api/auth/register', {
        method: 'POST',
        anonymous: true,
        body: { name: name.trim(), email: email.trim(), password, turnstileToken: captchaToken ?? undefined },
      });
      await onCreated(res);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : unreachable(t),
      );
      // A Turnstile token is single-use.
      captcha.current?.reset();
    } finally {
      setBusy(false);
    }
  }

  const rule = t('Min 8 characters, one uppercase, one number', 'न्यूनतम 8 अक्षर, एक अपरकेस, एक अंक');

  return (
    <form onSubmit={submit} className="max-w-md w-full">
      <button type="button" onClick={onBack} className="flex items-center gap-1 text-[13px] text-[#5A6577] hover:text-[#16264A] cursor-pointer mb-6">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg> {t('Back to sign in', 'साइन इन पर वापस')}
      </button>

      <div className="flex items-center gap-3 mb-6">
        <div className="w-8 h-8 bg-[#16264A] rounded-[4px] flex items-center justify-center text-white font-bold text-[12px]">{inst.shortCode}</div>
        <div>
          <p className="text-[14px] font-semibold text-[#16264A]">{t('Set up your IT Cell account', 'अपना IT Cell खाता बनाएं')}</p>
          <p className="text-[12px] text-[#5A6577]">{t('One-time setup — you then create IDs for everyone else', 'एक बार का सेटअप — फिर आप बाकी सभी के ID बनाएंगे')}</p>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        {error && <InlineAlert type="error">{error}</InlineAlert>}

        <Input label={t('Full Name', 'पूरा नाम')} value={name} onChange={e => setName(e.target.value)} required autoComplete="name" />
        <Input label={t('Official Email', 'आधिकारिक ईमेल')} type="email" placeholder={`you@${inst.emailDomain || 'institution.edu'}`} value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" />
        <Input
          label={t('Password', 'पासवर्ड')}
          type={showPass ? 'text' : 'password'}
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
          autoComplete="new-password"
          hint={weak ? undefined : rule}
          error={weak ? rule : undefined}
          suffix={<button type="button" onClick={() => setShowPass(s => !s)} className="cursor-pointer text-[12px] text-[#5A6577]">{showPass ? t('Hide', 'छुपाएं') : t('Show', 'दिखाएं')}</button>}
        />
        <Input
          label={t('Confirm Password', 'पासवर्ड की पुष्टि करें')}
          type="password"
          value={confirm}
          onChange={e => setConfirm(e.target.value)}
          required
          autoComplete="new-password"
          error={mismatch ? t('Passwords do not match', 'पासवर्ड मेल नहीं खाते') : undefined}
        />

        <Turnstile ref={captcha} onToken={setCaptchaToken} lang={lang} />

        <Button type="submit" loading={busy} disabled={!ready} className="w-full">
          {t('Create IT Cell account', 'IT Cell खाता बनाएं')}
        </Button>
      </div>
    </form>
  );
}

/**
 * A supplier registers its own firm. The account works at once but cannot
 * bid until the purchase desk verifies the documents and empanels it.
 */
function VendorRegister({ t, lang, onBack, onCreated }: { t: (a: string, b: string) => string; lang: string; onBack: () => void; onCreated: (payload: { accessToken: string; user: SessionUser }) => void | Promise<void> }) {
  const [f, setF] = useState({ name: '', gstin: '', pan: '', categories: '', contactName: '', contactMobile: '', email: '', password: '' });
  const [showPass, setShowPass] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const captcha = useRef<TurnstileHandle>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF(s => ({ ...s, [k]: e.target.value }));

  const gstin = f.gstin.trim().toUpperCase();
  const pan = f.pan.trim().toUpperCase();
  const gstinBad = gstin.length > 0 && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin);
  const panBad = pan.length > 0 && (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan) || (gstin.length === 15 && gstin.slice(2, 12) !== pan));
  const weak = f.password.length > 0 && (f.password.length < 8 || !/[A-Z]/.test(f.password) || !/[0-9]/.test(f.password));
  const categories = f.categories.split(',').map(s => s.trim()).filter(Boolean);
  const ready = f.name.trim().length >= 3 && gstin.length === 15 && !gstinBad && pan.length === 10 && !panBad && categories.length > 0 &&
    f.contactName.trim().length >= 2 && f.contactMobile.trim().length >= 10 && !!f.email && !!f.password && !weak && (!TURNSTILE_SITE_KEY || !!captchaToken);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setError(null);
    setBusy(true);
    try {
      const res = await api<{ accessToken: string; user: SessionUser }>('/api/vendor/register', {
        method: 'POST',
        anonymous: true,
        body: { ...f, gstin, pan, categories, email: f.email.trim(), turnstileToken: captchaToken ?? undefined },
      });
      await onCreated(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : unreachable(t));
      captcha.current?.reset();
    } finally {
      setBusy(false);
    }
  }

  const rule = t('Min 8 characters, one uppercase, one number', 'न्यूनतम 8 अक्षर, एक अपरकेस, एक अंक');

  return (
    <form onSubmit={submit} className="max-w-md w-full">
      <button type="button" onClick={onBack} className="flex items-center gap-1 text-[13px] text-[#5A6577] hover:text-[#16264A] cursor-pointer mb-6">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg> {t('Back to sign in', 'साइन इन पर वापस')}
      </button>
      <h1 className="text-h2 font-semibold text-[#16264A] mb-1">{t('Register your firm', 'अपनी फर्म पंजीकृत करें')}</h1>
      <p className="text-[13px] text-[#5A6577] mb-5">{t('Already supplying us? Use the email the purchase desk has on file and your existing record is linked.', 'पहले से आपूर्ति कर रहे हैं? क्रय विभाग में दर्ज ईमेल का उपयोग करें, आपका रिकॉर्ड जुड़ जाएगा।')}</p>
      <div className="flex flex-col gap-4">
        {error && <InlineAlert type="error">{error}</InlineAlert>}
        <Input label={t('Firm name (as on GST certificate)', 'फर्म का नाम (GST प्रमाणपत्र अनुसार)')} value={f.name} onChange={set('name')} required />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label="GSTIN" value={f.gstin} onChange={set('gstin')} required maxLength={15} placeholder="23AABCT1234D1ZQ" error={gstinBad ? t('Not a valid GSTIN', 'अमान्य GSTIN') : undefined} />
          <Input label="PAN" value={f.pan} onChange={set('pan')} required maxLength={10} placeholder="AABCT1234D" error={panBad ? t('Must match the PAN inside the GSTIN', 'GSTIN के अंदर के PAN से मेल खाना चाहिए') : undefined} />
        </div>
        <Input label={t('Supply categories', 'आपूर्ति श्रेणियाँ')} value={f.categories} onChange={set('categories')} required placeholder="IT Equipment, Software" hint={t('Separate with commas', 'अल्पविराम से अलग करें')} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label={t('Contact person', 'संपर्क व्यक्ति')} value={f.contactName} onChange={set('contactName')} required autoComplete="name" />
          <Input label={t('Mobile', 'मोबाइल')} value={f.contactMobile} onChange={set('contactMobile')} required autoComplete="tel" inputMode="tel" />
        </div>
        <Input label={t('Email', 'ईमेल')} type="email" value={f.email} onChange={set('email')} required autoComplete="email" />
        <Input
          label={t('Password', 'पासवर्ड')} type={showPass ? 'text' : 'password'} value={f.password} onChange={set('password')} required autoComplete="new-password"
          hint={weak ? undefined : rule} error={weak ? rule : undefined}
          suffix={<button type="button" onClick={() => setShowPass(s => !s)} className="cursor-pointer text-[12px] text-[#5A6577]">{showPass ? t('Hide', 'छुपाएं') : t('Show', 'दिखाएं')}</button>}
        />
        <Turnstile ref={captcha} onToken={setCaptchaToken} lang={lang} />
        <Button type="submit" loading={busy} disabled={!ready} className="w-full">{t('Register & continue', 'पंजीकरण करें और जारी रखें')}</Button>
      </div>
    </form>
  );
}

function LoginShell({ children, onNavigate, lang, toggle, t }: { children: React.ReactNode; onNavigate: (s: Screen) => void; lang: string; toggle: () => void; t: (a: string, b: string) => string }) {
  const inst = useInstitution();
  return (
    <div className="min-h-screen bg-[#EDEFF3] flex flex-col">
      <header className="h-14 bg-white border-b border-[#D3D8E0] flex items-center justify-between px-6">
        <button onClick={() => onNavigate('landing')} className="flex items-center gap-2 cursor-pointer">
          <div className="w-7 h-7 bg-[#16264A] rounded-[4px] flex items-center justify-center text-white font-bold text-[12px]">{inst.shortCode}</div>
          <span className="text-[14px] font-semibold text-[#16264A]">{PRODUCT_NAME}</span>
        </button>
        <div className="flex items-center gap-3">
          <button onClick={toggle} className="text-[12px] font-semibold text-[#5A6577] hover:text-[#16264A] cursor-pointer border border-[#D3D8E0] rounded-[4px] px-2 py-1">{lang === 'en' ? 'हिं' : 'EN'}</button>
          <button onClick={() => onNavigate('cert-verify')} className="text-[12px] text-[#5A6577] hover:text-[#16264A] cursor-pointer">{t('Verify Certificate', 'प्रमाण-पत्र जाँचें')}</button>
        </div>
      </header>
      <div className="flex-1 flex items-center justify-center p-6">
        {children}
      </div>
      <footer className="border-t border-[#D3D8E0] bg-white px-6 py-3 text-[11px] text-[#5A6577] text-center">
        © {new Date().getFullYear()} {PRODUCT_NAME} · {inst.place}
      </footer>
    </div>
  );
}

/**
 * What to say when the API does not answer at all. Deployed, that is almost
 * always the free Render instance waking up; locally, the backend not running.
 */
function unreachable(t: (a: string, b: string) => string) {
  return import.meta.env.PROD
    ? t(
        'The server is waking up — this can take up to a minute. Please try again shortly.',
        'सर्वर शुरू हो रहा है — इसमें एक मिनट तक लग सकता है। कृपया थोड़ी देर में पुनः प्रयास करें।',
      )
    : t(
        'Could not reach the server. Is the backend running on port 4000?',
        'सर्वर तक नहीं पहुँच सके। क्या बैकएंड पोर्ट 4000 पर चल रहा है?',
      );
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
