import { useState } from 'react';
import { router } from 'expo-router';
import { Button, InlineAlert, Input, Text } from '@/components';
import { AuthFrame } from '@/components/AuthFrame';
import { useLang } from '@/lib/language';
import { InstituteLookupError, lookUpInstitute, useInstitute } from '@/lib/institute';

/** First launch: which institute is this phone for? */
export default function ChooseInstitute() {
  const { t } = useLang();
  const { choose } = useInstitute();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const messages = {
    'not-found': t('No institute has that code. Check it with your institute.', 'इस कोड का कोई संस्थान नहीं है। अपने संस्थान से जाँच करें।'),
    suspended: t('This institute’s account is suspended. Contact its IT Cell.', 'इस संस्थान का खाता निलंबित है। उसके IT Cell से संपर्क करें।'),
    provisioning: t('This institute is still being set up. Try again in a few minutes.', 'यह संस्थान अभी सेट हो रहा है। कुछ मिनट बाद पुनः प्रयास करें।'),
    unreachable: t('Could not connect. Check your internet and try again.', 'कनेक्ट नहीं हो सका। इंटरनेट जाँचें और पुनः प्रयास करें।'),
  };

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      const inst = await lookUpInstitute(code);
      await choose(inst);
      router.replace('/login');
    } catch (err) {
      setError(err instanceof InstituteLookupError ? messages[err.reason] : messages.unreachable);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthFrame mark="R" title="Resolion Campus OS" subtitle={t('Find your institute', 'अपना संस्थान खोजें')}>
      <Text variant="small" tone="slate">
        {t('Enter the institute code your school, college or university gave you — for example, "sunrise".',
          'अपने स्कूल, कॉलेज या विश्वविद्यालय द्वारा दिया गया संस्थान कोड दर्ज करें — उदाहरण: "sunrise"।')}
      </Text>
      {error ? <InlineAlert type="error">{error}</InlineAlert> : null}
      <Input
        label="Institute code"
        labelHi="संस्थान कोड"
        value={code}
        onChangeText={setCode}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="sunrise"
        onSubmitEditing={submit}
      />
      <Button full size="lg" loading={busy} disabled={code.trim().length < 3} title={t('Continue', 'आगे बढ़ें')} onPress={submit} />
    </AuthFrame>
  );
}
