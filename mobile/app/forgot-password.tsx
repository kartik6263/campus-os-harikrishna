import { useState } from 'react';
import { router } from 'expo-router';
import { Button, InlineAlert, Input, Text } from '@/components';
import { AuthFrame } from '@/components/AuthFrame';
import { useLang } from '@/lib/language';
import { api, ApiError } from '@/lib/api';
import { useInstitution } from '@/lib/institution';

/** Anyone can ask for a link to set a new password. */
export default function ForgotPassword() {
  const { t, lang } = useLang();
  const inst = useInstitution();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      await api('/api/auth/forgot-password', { method: 'POST', anonymous: true, body: { email: email.trim() } });
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('Could not connect. Try again.', 'कनेक्ट नहीं हो सका। पुनः प्रयास करें।'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthFrame mark={inst.shortCode} title={t('Forgot password', 'पासवर्ड भूल गए')} subtitle={inst.displayName(lang)}>
      {sent ? (
        <>
          <InlineAlert type="success">
            {t('If that email has an account, a link to set a new password has been sent to it. It works once, for 30 minutes.',
              'यदि उस ईमेल का खाता है, तो नया पासवर्ड सेट करने का लिंक भेज दिया गया है। यह 30 मिनट तक एक बार काम करेगा।')}
          </InlineAlert>
          <Button full size="lg" title={t('Back to sign in', 'साइन इन पर वापस')} onPress={() => router.replace('/login')} />
        </>
      ) : (
        <>
          <Text variant="small" tone="slate">
            {t('Enter the email you sign in with. We will email you a link to set a new password.',
              'जिस ईमेल से आप साइन इन करते हैं, वह दर्ज करें। हम नया पासवर्ड सेट करने का लिंक ईमेल करेंगे।')}
          </Text>
          {error ? <InlineAlert type="error">{error}</InlineAlert> : null}
          <Input label="Email" labelHi="ईमेल" value={email} onChangeText={setEmail} autoCapitalize="none"
            autoCorrect={false} keyboardType="email-address" textContentType="emailAddress" />
          <Button full size="lg" loading={busy} disabled={!email.includes('@')} title={t('Send link', 'लिंक भेजें')} onPress={submit} />
          <Button full variant="secondary" title={t('Back to sign in', 'साइन इन पर वापस')} onPress={() => router.back()} />
        </>
      )}
    </AuthFrame>
  );
}
