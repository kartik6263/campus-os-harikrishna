import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { AppBar, Button, Card, InlineAlert, LoadingBlock, Screen, StatusPill, Text } from '@/components';
import { useLang } from '@/lib/language';
import { color, space } from '@/theme/tokens';
import { PILL, completeDigilocker, showDlDate, type CompleteResult } from '@/lib/verification';

/** `<scheme>://digilocker?code=…&state=…` — back from DigiLocker, by way of the web app. */
export default function DigilockerReturn() {
  const { t, lang } = useLang();
  const qc = useQueryClient();
  const params = useLocalSearchParams<{ code?: string; state?: string; error?: string; error_description?: string }>();
  const [result, setResult] = useState<CompleteResult | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    if (!params.state) { setFailure(t('This link did not come from DigiLocker.', 'यह लिंक डिजीलॉकर से नहीं आया।')); return; }
    completeDigilocker({ state: params.state, code: params.code, error: params.error, errorDescription: params.error_description })
      .then((r) => { setResult(r); void qc.invalidateQueries(); })
      .catch((err: Error) => setFailure(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.state]);

  const pill = (s: CompleteResult['identityStatus']) => <StatusPill status={PILL[s].status} label={lang === 'hi' ? PILL[s].labelHi : PILL[s].label} compact />;

  return (
    <View style={{ flex: 1, backgroundColor: color.page }}>
      <AppBar title={t('DigiLocker verification', 'डिजीलॉकर सत्यापन')} />
      <Screen>
        {!result && !failure ? <LoadingBlock /> : null}
        {failure ? <InlineAlert type="error">{failure}</InlineAlert> : null}
        {result ? (
          <Card style={{ gap: space.md }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text variant="h3" weight="semibold">{t('Identity', 'पहचान')}</Text>
              {pill(result.identityStatus)}
            </View>
            <Text>{result.dlName} · {showDlDate(result.dlDob)}</Text>
            {result.identityStatus === 'VERIFIED' ? (
              <InlineAlert type="success">{t('Your DigiLocker details match the institution’s record.', 'आपके डिजीलॉकर विवरण संस्थान के अभिलेख से मेल खाते हैं।')}</InlineAlert>
            ) : (
              <InlineAlert type="warning">{result.identityNote ?? t('Sent to the office for review.', 'समीक्षा हेतु कार्यालय भेजा गया।')}</InlineAlert>
            )}
            {result.abcApplies ? (
              <>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text weight="semibold">ABC ID {result.abcId ?? ''}</Text>
                  {pill(result.abcStatus)}
                </View>
                {!result.abcFound ? (
                  <InlineAlert type="info">{t('No ABC / APAAR card was found in your DigiLocker. Create one at abc.gov.in, then fetch again.', 'आपके डिजीलॉकर में ABC / APAAR कार्ड नहीं मिला। abc.gov.in पर बनाएँ, फिर दोबारा लाएँ।')}</InlineAlert>
                ) : result.abcNote ? (
                  <InlineAlert type="warning">{result.abcNote}</InlineAlert>
                ) : null}
              </>
            ) : null}
          </Card>
        ) : null}
        {result || failure ? <Button full title={t('Done', 'पूर्ण')} onPress={() => router.replace('/verification')} /> : null}
      </Screen>
    </View>
  );
}
