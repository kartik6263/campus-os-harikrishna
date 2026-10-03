import { useState } from 'react';
import { useLang } from '../lib/language';
import { useAuth } from '../lib/auth';
import { api, ApiError } from '../lib/api';
import { useInstitution, PRODUCT_NAME } from '../lib/institution';
import { Button, InlineAlert, Input } from '../components/ui';
import type { Screen } from '../lib/data';

const strong = (p: string) => p.length >= 8 && /[A-Z]/.test(p) && /[0-9]/.test(p);

function Frame({ children }: { children: React.ReactNode }) {
  const inst = useInstitution();
  return (
    <div className="min-h-screen bg-[#EDEFF3] flex flex-col">
      <header className="h-14 bg-white border-b border-[#D3D8E0] flex items-center gap-2 px-6">
        <div className="w-7 h-7 bg-[#16264A] rounded-[4px] flex items-center justify-center text-white font-bold text-[12px]">{inst.shortCode}</div>
        <span className="text-[14px] font-semibold text-[#16264A]">{PRODUCT_NAME}</span>
        <span className="text-[12px] text-[#5A6577] hidden sm:inline">· {inst.name}</span>
      </header>
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white border border-[#D3D8E0] rounded-[4px] p-6">{children}</div>
      </div>
    </div>
  );
}

function NewPasswordFields({ value, confirm, onValue, onConfirm }: {
  value: string; confirm: string; onValue: (v: string) => void; onConfirm: (v: string) => void;
}) {
  const { t } = useLang();
  const rule = t('Min 8 characters, one uppercase, one number', 'न्यूनतम 8 अक्षर, एक अपरकेस, एक अंक');
  return (
    <>
      <Input label={t('New password', 'नया पासवर्ड')} type="password" value={value} onChange={e => onValue(e.target.value)}
        required autoComplete="new-password" hint={value && !strong(value) ? undefined : rule}
        error={value && !strong(value) ? rule : undefined} />
      <Input label={t('Confirm new password', 'नए पासवर्ड की पुष्टि करें')} type="password" value={confirm}
        onChange={e => onConfirm(e.target.value)} required autoComplete="new-password"
        error={confirm && confirm !== value ? t('Passwords do not match', 'पासवर्ड मेल नहीं खाते') : undefined} />
    </>
  );
}

/**
 * Shown to anyone signed in with a password the IT Cell issued — after a
 * reload too — until they set their own.
 */
export function ForceChangePassword({ onNavigate }: { onNavigate: (s: Screen) => void }) {
  const { t } = useLang();
  const { patchUser, signOut, user } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api('/api/auth/change-password', { method: 'POST', body: { currentPassword: current, newPassword: next } });
      patchUser({ mustChangePassword: false });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('Could not reach the server. Try again.', 'सर्वर तक नहीं पहुँच सके। पुनः प्रयास करें।'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Frame>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div>
          <h1 className="text-[18px] font-semibold text-[#16264A]">{t('Set your own password', 'अपना पासवर्ड सेट करें')}</h1>
          <p className="text-[13px] text-[#5A6577] mt-1">
            {t(`Your IT Cell created ${user?.email ?? 'this account'} with a starting password. Replace it to continue.`,
              `आपके IT Cell ने ${user?.email ?? 'यह खाता'} एक प्रारंभिक पासवर्ड के साथ बनाया है। आगे बढ़ने के लिए इसे बदलें।`)}
          </p>
        </div>
        {error && <InlineAlert type="error">{error}</InlineAlert>}
        <Input label={t('Password the IT Cell gave you', 'IT Cell द्वारा दिया गया पासवर्ड')} type="password" value={current}
          onChange={e => setCurrent(e.target.value)} required autoComplete="current-password" />
        <NewPasswordFields value={next} confirm={confirm} onValue={setNext} onConfirm={setConfirm} />
        <Button type="submit" loading={busy} disabled={!current || !strong(next) || next !== confirm} className="w-full">
          {t('Save password & continue', 'पासवर्ड सहेजें और जारी रखें')}
        </Button>
        <button type="button" onClick={async () => { await signOut(); onNavigate('landing'); }}
          className="text-[12px] text-[#5A6577] hover:text-[#16264A] cursor-pointer">{t('Sign out', 'साइन आउट')}</button>
      </form>
    </Frame>
  );
}

/** Opened from the emailed "forgot password" link (…/?reset=<token>). */
export function ResetPassword({ token, onDone }: { token: string; onDone: (s: Screen) => void }) {
  const { t } = useLang();
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api('/api/auth/reset-password', { method: 'POST', anonymous: true, body: { token, password: next } });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('Could not reach the server. Try again.', 'सर्वर तक नहीं पहुँच सके। पुनः प्रयास करें।'));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <Frame>
        <div className="flex flex-col gap-4">
          <InlineAlert type="success">{t('Your new password is set. You have been signed out everywhere else.', 'आपका नया पासवर्ड सेट हो गया है। अन्य सभी जगह से साइन आउट कर दिया गया है।')}</InlineAlert>
          <Button onClick={() => onDone('login')} className="w-full">{t('Go to sign in', 'साइन इन पर जाएं')}</Button>
        </div>
      </Frame>
    );
  }

  return (
    <Frame>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <h1 className="text-[18px] font-semibold text-[#16264A]">{t('Choose a new password', 'नया पासवर्ड चुनें')}</h1>
        {error && <InlineAlert type="error">{error}</InlineAlert>}
        <NewPasswordFields value={next} confirm={confirm} onValue={setNext} onConfirm={setConfirm} />
        <Button type="submit" loading={busy} disabled={!strong(next) || next !== confirm} className="w-full">
          {t('Set new password', 'नया पासवर्ड सेट करें')}
        </Button>
        <button type="button" onClick={() => onDone('login')} className="text-[12px] text-[#5A6577] hover:text-[#16264A] cursor-pointer">
          {t('Back to sign in', 'साइन इन पर वापस')}
        </button>
      </form>
    </Frame>
  );
}
