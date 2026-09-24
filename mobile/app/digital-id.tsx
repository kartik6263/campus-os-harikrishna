import { StyleSheet, View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import {
  AppBar,
  Avatar,
  Button,
  Card,
  Divider,
  Field,
  FieldGrid,
  InlineAlert,
  Screen,
  Skeleton,
  StatusPill,
  Text,
  VerifiedSeal,
  toast,
} from '@/components';
import { useLang } from '@/lib/language';
import { useInstitution } from '@/lib/institution';
import { color, radius, space } from '@/theme/tokens';
import { formatDate, useProfile } from '@/lib/queries';

export default function DigitalId() {
  const { t, lang } = useLang();
  const inst = useInstitution();
  const { data: student, isPending, isError, error } = useProfile();

  return (
    <View style={{ flex: 1, backgroundColor: color.page }}>
      <AppBar back title={t('Digital ID', 'डिजिटल आईडी')} subtitle={t('Works offline', 'ऑफ़लाइन भी चले')} />

      <Screen>
        {isError ? (
          <InlineAlert type="error" title={t('Could not load your ID', 'आईडी लोड नहीं हो सकी')}>
            {(error as Error).message}
          </InlineAlert>
        ) : null}

        {isPending || !student ? (
          <Card style={{ gap: space.md }}>
            <Skeleton height={120} />
            <Skeleton width="60%" height={16} />
            <Skeleton width="40%" height={12} />
          </Card>
        ) : (
        <>
        {/* The card itself */}
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="micro" tone="muted" uppercase>
                {inst.placeLine(lang)}
              </Text>
              <Text variant="small" weight="semibold" tone="onDark">
                {t('Student Identity Card', 'छात्र परिचय पत्र')}
              </Text>
            </View>
            <VerifiedSeal size={38} />
          </View>

          <View style={styles.cardBody}>
            <View style={{ alignItems: 'center', gap: space.sm }}>
              <Avatar name={student.name} size={76} />
              <StatusPill status="valid" compact label={t('Active', 'सक्रिय')} />
            </View>

            <View style={{ flex: 1, gap: 6 }}>
              <Text variant="h3" weight="semibold">
                {lang === 'hi' && student.nameHi ? student.nameHi : student.name}
              </Text>
              <Text variant="micro" tone="slate" mono>
                {student.rollNo}
              </Text>
              <Divider />
              <Text variant="micro" tone="slate">
                {student.programme.name}
              </Text>
              <Text variant="micro" tone="slate">
                {t('Semester', 'सेमेस्टर')} {student.semester} · {t('Batch', 'बैच')} {student.batch}
              </Text>
            </View>
          </View>

          <View style={styles.cardFoot}>
            <QrGlyph />
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="micro" tone="muted" uppercase>
                {t('Valid up to', 'वैध तिथि')}
              </Text>
              <Text variant="small" weight="semibold" tone="onDark" mono>
                {formatDate(student.validUpto)}
              </Text>
              <Text variant="micro" tone="muted" mono>
                {student.enrolmentNo}
              </Text>
            </View>
          </View>
        </View>

        <InlineAlert type="info">
          {t(
            'Show this card at the gate, library and examination hall. It stays readable without a network connection.',
            'यह कार्ड गेट, पुस्तकालय और परीक्षा कक्ष में दिखाएँ। यह बिना नेटवर्क के भी पढ़ा जा सकता है।',
          )}
        </InlineAlert>

        <Card style={{ gap: space.md }}>
          <Text variant="h3" weight="semibold">
            {t('Linked records', 'संबद्ध अभिलेख')}
          </Text>
          <Divider />
          <FieldGrid>
            <Field label="APAAR ID" value={student.apaarId ?? "—"} mono />
            <Field label="ABC ID" value={student.abcId ?? "—"} mono />
            <Field
              label={t('ABC credits', 'ABC क्रेडिट')}
              value={`${student.abcCredits} / ${student.abcTarget}`}
            />
            <Field
              label="DigiLocker"
              value={student.digilockerLinked ? t('Linked', 'संबद्ध') : t('Not linked', 'असंबद्ध')}
            />
            <Field label={t('College code', 'कॉलेज कोड')} value={student.college.code} mono />
            <Field label={t('Category', 'श्रेणी')} value={student.category ?? "—"} />
          </FieldGrid>
        </Card>

        <Button
          full
          variant="secondary"
          title={t('Save to device', 'डिवाइस में सहेजें')}
          onPress={() => toast.success(t('ID card saved for offline use.', 'आईडी कार्ड ऑफ़लाइन उपयोग हेतु सहेजा गया।'))}
        />
        </>
        )}
      </Screen>
    </View>
  );
}

/**
 * Decorative QR block — a fixed pattern, not an encoder. Swap in a real
 * generator (e.g. `react-native-qrcode-svg`) when the verification endpoint
 * exists; it should encode the certificate-verification URL for this student.
 */
function QrGlyph({ size = 56 }: { size?: number }) {
  const cells = 9;
  const unit = size / cells;
  const pattern = [
    '111010111', '100010001', '101110101', '000101000', '110011011',
    '000101000', '101110101', '100010001', '111010111',
  ];

  return (
    <View style={{ padding: 4, backgroundColor: '#FFFFFF', borderRadius: 4 }}>
      <Svg width={size} height={size}>
        {pattern.flatMap((row, y) =>
          row.split('').map((bit, x) =>
            bit === '1' ? (
              <Rect key={`${x}-${y}`} x={x * unit} y={y * unit} width={unit} height={unit} fill={color.ink} />
            ) : null,
          ),
        )}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.card,
    overflow: 'hidden',
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.rule,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: color.ink,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  cardBody: {
    flexDirection: 'row',
    gap: space.lg,
    padding: space.lg,
  },
  cardFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: color.ink,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
});
