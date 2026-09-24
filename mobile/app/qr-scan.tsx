import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import {
  AppBar,
  Button,
  Card,
  Divider,
  EmptyState,
  Field,
  FieldGrid,
  InlineAlert,
  Input,
  Screen,
  Skeleton,
  Spinner,
  Text,
  VerifiedSeal,
  toast,
} from '@/components';
import { useLang } from '@/lib/language';
import { color, radius, space } from '@/theme/tokens';
import { useActiveSession, useMarkAttendance } from '@/lib/queries';
import { ApiError } from '@/lib/api';

/**
 * QR attendance.
 *
 * The scan itself is still simulated — there is no camera dependency — but the
 * token is now verified by the server: it must match an open session, the
 * student must be enrolled in that subject, and a second scan is rejected.
 * To use the real camera: `npx expo install expo-camera`, replace
 * <Viewfinder/> with <CameraView barcodeScannerSettings={{ barcodeTypes:
 * ['qr'] }} onBarcodeScanned={({ data }) => submit(data)} /> and add the
 * camera permission strings to app.json. The submit path below is unchanged.
 */
export default function QrScan() {
  const { t } = useLang();
  const session = useActiveSession();
  const mark = useMarkAttendance();

  const [manualToken, setManualToken] = useState('');
  const [done, setDone] = useState<null | {
    subject: string;
    code: string;
    room: string;
    slot: string;
    markedAt: string;
  }>(null);

  async function submit(token: string) {
    try {
      const res = await mark.mutateAsync(token);
      setDone(res);
      toast.success(t(`Attendance marked for ${res.code}.`, `${res.code} के लिए उपस्थिति दर्ज।`));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('Could not mark attendance.', 'उपस्थिति दर्ज नहीं हो सकी।'));
    }
  }

  const active = session.data;

  return (
    <View style={{ flex: 1, backgroundColor: color.page }}>
      <AppBar
        back
        title={t('QR Attendance', 'QR उपस्थिति')}
        subtitle={active?.subject ?? t('No open class', 'कोई खुली कक्षा नहीं')}
      />

      <Screen>
        {done ? (
          <Card style={{ alignItems: 'center', gap: space.md }}>
            <VerifiedSeal size={72} />
            <Text variant="h2" weight="semibold" center>
              {t('Attendance marked', 'उपस्थिति दर्ज')}
            </Text>
            <Text variant="small" tone="slate" center>
              {done.subject} · {done.slot}
            </Text>
            <Divider />
            <FieldGrid>
              <Field label={t('Subject', 'विषय')} value={done.code} mono />
              <Field label={t('Room', 'कक्ष')} value={done.room} />
              <Field
                label={t('Marked at', 'समय')}
                value={new Date(done.markedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              />
            </FieldGrid>
            <Button
              full
              title={t('Back to attendance', 'उपस्थिति पर लौटें')}
              onPress={() => router.replace('/(tabs)/attendance')}
            />
          </Card>
        ) : session.isPending ? (
          <Card style={{ gap: space.md }}>
            <Skeleton height={200} />
            <Skeleton width="60%" height={16} />
          </Card>
        ) : !active ? (
          <>
            <EmptyState
              title={t('No class is open right now', 'अभी कोई कक्षा खुली नहीं है')}
              description={t(
                'Your faculty opens a scan window at the start of class. It will appear here.',
                'शिक्षक कक्षा के आरंभ में स्कैन अवधि खोलते हैं। वह यहाँ दिखाई देगी।',
              )}
              action={
                <Button
                  size="sm"
                  variant="secondary"
                  title={t('Check again', 'फिर देखें')}
                  loading={session.isRefetching}
                  onPress={() => void session.refetch()}
                />
              }
            />
          </>
        ) : active.alreadyMarked ? (
          <Card style={{ alignItems: 'center', gap: space.md }}>
            <VerifiedSeal size={64} />
            <Text variant="h3" weight="semibold" center>
              {t('Already marked', 'पहले ही दर्ज')}
            </Text>
            <Text variant="small" tone="slate" center>
              {active.subject} · {active.slot}
            </Text>
            <Button
              full
              variant="secondary"
              title={t('Back to attendance', 'उपस्थिति पर लौटें')}
              onPress={() => router.replace('/(tabs)/attendance')}
            />
          </Card>
        ) : (
          <>
            <Viewfinder scanning={mark.isPending} />

            <Card style={{ gap: space.sm }}>
              <Text variant="h3" weight="semibold">
                {active.subject}
              </Text>
              <Text variant="small" tone="slate">
                {active.faculty} · {active.room}
              </Text>
              <Divider />
              <FieldGrid>
                <Field label={t('Slot', 'कालांश')} value={active.slot} />
                <Field label={t('Code', 'कोड')} value={active.code} mono />
              </FieldGrid>
            </Card>

            <InlineAlert type="info">
              {t(
                'Point the camera at the code projected by your faculty. The server checks the code, your enrolment and whether you have already marked.',
                'शिक्षक द्वारा दिखाए गए कोड पर कैमरा रखें। सर्वर कोड, आपका नामांकन और पूर्व उपस्थिति जाँचता है।',
              )}
            </InlineAlert>

            <Input
              label={t('Or type the code shown in class', 'या कक्षा में दिखाया कोड लिखें')}
              value={manualToken}
              onChangeText={setManualToken}
              autoCapitalize="characters"
              autoCorrect={false}
              placeholder="RDU-ATT-…"
            />

            <Button
              full
              size="lg"
              loading={mark.isPending}
              title={
                mark.isPending
                  ? t('Checking…', 'जाँच हो रही है…')
                  : manualToken.trim()
                    ? t('Submit code', 'कोड जमा करें')
                    : t('Simulate scan', 'स्कैन का अनुकरण करें')
              }
              onPress={() => submit(manualToken.trim() || 'RDU-ATT-DEMO-BCA501')}
            />
          </>
        )}
      </Screen>
    </View>
  );
}

/** Dark camera field with a marigold reticle and a sweeping scan line. */
function Viewfinder({ scanning }: { scanning: boolean }) {
  const sweep = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(sweep, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(sweep, { toValue: 0, duration: 1600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [sweep]);

  const translateY = sweep.interpolate({ inputRange: [0, 1], outputRange: [8, 208] });

  return (
    <View style={styles.finder}>
      <View style={[styles.corner, styles.tl]} />
      <View style={[styles.corner, styles.tr]} />
      <View style={[styles.corner, styles.bl]} />
      <View style={[styles.corner, styles.br]} />

      <Animated.View style={[styles.sweep, { transform: [{ translateY }] }]} />

      {scanning ? (
        <View style={styles.finderCentre}>
          <Spinner size={26} tint={color.marigold} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  finder: {
    height: 240,
    borderRadius: radius.card,
    backgroundColor: '#0D1730',
    overflow: 'hidden',
  },
  corner: {
    position: 'absolute',
    width: 34,
    height: 34,
    borderColor: color.marigold,
  },
  tl: { top: 20, left: 20, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 6 },
  tr: { top: 20, right: 20, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 6 },
  bl: { bottom: 20, left: 20, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 6 },
  br: { bottom: 20, right: 20, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 6 },
  sweep: {
    position: 'absolute',
    left: 20,
    right: 20,
    height: 2,
    backgroundColor: color.marigold,
    opacity: 0.85,
  },
  finderCentre: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
