import { useState } from 'react';
import { Button, InlineAlert, Input, Text } from '@/components';
import { AuthFrame } from '@/components/AuthFrame';
import { useLang } from '@/lib/language';
import { useAuth } from '@/lib/auth';
import { api, ApiError } from '@/lib/api';
import { useInstitution } from '@/lib/institution';

const strong = (p: string) => p.length >= 8 && /[A-Z]/.test(p) && /[0-9]/.test(p);

/** Required before anything else when the IT Cell issued the password. */
export default function ChangePassword() {
  const { t, lang } = useLang();
  const { user, patchUser, signOut } = useAuth();
  const inst = useInstitution();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rule = t('Min 8 characters, one uppercase, one number', 'न्यूनतम 8 अक्षर, एक अपरकेस, एक अंक');

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      await api('/api/auth/change-password', { method: 'POST', body: { currentPassword: current, newPassword: next } });
      // The route guard sends the user on once this flag clears.
      patchUser({ mustChangePassword: false });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('Could not connect. Try again.', 'कनेक्ट नहीं हो सका। पुनः प्रयास करें।'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthFrame mark={inst.shortCode} title={t('Set your own password', 'अपना पासवर्ड सेट करें')} subtitle={inst.displayName(lang)}>
      <Text variant="small" tone="slate">
        {t(`Your IT Cell created ${user?.email ?? 'this account'} with a starting password. Replace it to continue.`,
          `आपके IT Cell ने ${user?.email ?? 'यह खाता'} एक प्रारंभिक पासवर्ड के साथ बनाया है। आगे बढ़ने के लिए इसे बदलें।`)}
      </Text>
      {error ? <InlineAlert type="error">{error}</InlineAlert> : null}
      <Input label="Password the IT Cell gave you" labelHi="IT Cell द्वारा दिया गया पासवर्ड" value={current}
        onChangeText={setCurrent} secureTextEntry autoCapitalize="none" textContentType="password" />
      <Input label="New password" labelHi="नया पासवर्ड" value={next} onChangeText={setNext} secureTextEntry
        autoCapitalize="none" textContentType="newPassword" hint={rule}
        error={next && !strong(next) ? rule : undefined} />
      <Input label="Confirm new password" labelHi="नए पासवर्ड की पुष्टि करें" value={confirm} onChangeText={setConfirm}
        secureTextEntry autoCapitalize="none" textContentType="newPassword"
        error={confirm && confirm !== next ? t('Passwords do not match', 'पासवर्ड मेल नहीं खाते') : undefined} />
      <Button full size="lg" loading={busy} disabled={!current || !strong(next) || next !== confirm}
        title={t('Save password & continue', 'पासवर्ड सहेजें और जारी रखें')} onPress={submit} />
      <Button full variant="secondary" title={t('Sign out', 'साइन आउट')} onPress={signOut} />
    </AuthFrame>
  );
}
