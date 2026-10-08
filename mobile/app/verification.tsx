import { useState } from 'react';
import { View } from 'react-native';
import { AppBar, Button, Card, Divider, Field, FieldGrid, InlineAlert, Screen, Skeleton, StatusPill, Text, toast } from '@/components';
import { useLang } from '@/lib/language';
import { color, space } from '@/theme/tokens';
import { PILL, appScheme, showDlDate, startDigilocker, useMyVerification } from '@/lib/verification';

/** The student's identity and ABC ID, verified through their own DigiLocker. */
export default function Verification() {
  const { t, lang } = useLang();
  const { data: v, isPending, isError, error } = useMyVerification();
  const [busy, setBusy] = useState(false);
  const scheme = appScheme();
  const pill = (s: keyof typeof PILL) => <StatusPill status={PILL[s].status} label={lang === 'hi' ? PILL[s].labelHi : PILL[s].label} compact />;

  async function go() {
    if (!scheme) return;
    setBusy(true);
    try {
      await startDigilocker(scheme);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: color.page }}>
      <AppBar back title={t('Verification', 'सत्यापन')} subtitle="DigiLocker · ABC ID" />
      <Screen>
        {isError ? <InlineAlert type="error">{(error as Error).message}</InlineAlert> : null}
        {isPending || !v ? (
          <Card style={{ gap: space.md }}><Skeleton height={80} /><Skeleton width="60%" height={14} /></Card>
        ) : (
          <>
            <Card style={{ gap: space.md }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text variant="h3" weight="semibold">{t('Identity', 'पहचान')}</Text>
                {pill(v.identityStatus)}
              </View>
              <Divider />
              {v.identitySource === 'DIGILOCKER' ? (
                <FieldGrid>
                  <Field label={t('Name in DigiLocker', 'डिजीलॉकर में नाम')} value={`${v.dlName ?? '—'}${v.nameMatch === false ? ' ✗' : v.nameMatch ? ' ✓' : ''}`} />
                  <Field label={t('Date of birth', 'जन्म तिथि')} value={`${showDlDate(v.dlDob)}${v.dobMatch === false ? ' ✗' : v.dobMatch ? ' ✓' : ''}`} />
                  <Field label="Aadhaar" value={v.aadhaarLast4 ? `XXXX XXXX ${v.aadhaarLast4}` : '—'} mono />
                  <Field label={t('Verified on', 'सत्यापन तिथि')} value={v.verifiedAt ? new Date(v.verifiedAt).toLocaleDateString('en-IN') : '—'} />
                </FieldGrid>
              ) : v.identitySource === 'DOCUMENT' ? (
                <Text variant="small" tone="muted">{t('An ID proof you uploaded is checked by the office.', 'आपके द्वारा अपलोड किया गया पहचान प्रमाण कार्यालय जाँचता है।')}</Text>
              ) : (
                <Text variant="small" tone="muted">{t('Verify with your own DigiLocker: your name and date of birth are matched with the institution’s record.', 'अपने डिजीलॉकर से सत्यापित करें: आपका नाम और जन्म तिथि संस्थान के अभिलेख से मिलाए जाते हैं।')}</Text>
              )}
              {v.identityNote ? <InlineAlert type={v.identityStatus === 'REJECTED' ? 'error' : 'warning'}>{v.identityNote}</InlineAlert> : null}
            </Card>

            {v.abcApplies ? (
              <Card style={{ gap: space.md }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text variant="h3" weight="semibold">ABC ID</Text>
                  {pill(v.abcStatus)}
                </View>
                <Divider />
                <Field label={t('Academic Bank of Credits', 'एकेडमिक बैंक ऑफ क्रेडिट्स')} value={v.abcId ?? v.record.abcId ?? '—'} mono />
                {v.abcSource ? <Text variant="small" tone="muted">{v.abcSource === 'DIGILOCKER' ? t('Read from the ABC card in your DigiLocker', 'आपके डिजीलॉकर के ABC कार्ड से') : t('Entered by you, with your card attached', 'आपके द्वारा दर्ज, कार्ड संलग्न')}</Text> : null}
                {v.abcNote ? <InlineAlert type={v.abcStatus === 'REJECTED' ? 'error' : 'warning'}>{v.abcNote}</InlineAlert> : null}
              </Card>
            ) : null}

            {v.digilockerEnabled && scheme && (v.identityStatus !== 'VERIFIED' || v.identitySource === 'DIGILOCKER' || (v.abcApplies && v.abcStatus !== 'VERIFIED')) ? (
              <Button full loading={busy} title={v.linked ? t('Fetch again from DigiLocker', 'डिजीलॉकर से फिर लाएँ') : t('Verify with DigiLocker', 'डिजीलॉकर से सत्यापित करें')} onPress={go} />
            ) : null}
            {!v.digilockerEnabled ? (
              <InlineAlert type="info">{t('DigiLocker is not yet connected for your institute. Upload an ID proof or your ABC card from Profile on the web portal; the office verifies it.', 'आपके संस्थान के लिए डिजीलॉकर अभी जुड़ा नहीं है। वेब पोर्टल की प्रोफ़ाइल से पहचान प्रमाण या ABC कार्ड अपलोड करें; कार्यालय सत्यापित करेगा।')}</InlineAlert>
            ) : !scheme ? (
              <InlineAlert type="info">{t('DigiLocker can return only to the installed app. In this preview, verify from Profile on the web portal.', 'डिजीलॉकर केवल इंस्टॉल किए गए ऐप पर लौट सकता है। इस पूर्वावलोकन में वेब पोर्टल की प्रोफ़ाइल से सत्यापित करें।')}</InlineAlert>
            ) : null}
            <Text variant="micro" tone="muted">
              {t('Only your name, date of birth, gender, the last four digits of Aadhaar and the list of issued documents are kept.', 'केवल आपका नाम, जन्म तिथि, लिंग, आधार के अंतिम चार अंक और जारी दस्तावेज़ों की सूची रखी जाती है।')}
            </Text>
          </>
        )}
      </Screen>
    </View>
  );
}
