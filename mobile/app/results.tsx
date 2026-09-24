import { useState } from 'react';
import { View } from 'react-native';
import {
  AppBar,
  Button,
  Card,
  Divider,
  EmptyState,
  Field,
  FieldGrid,
  InlineAlert,
  Screen,
  Skeleton,
  StatusPill,
  Tabs,
  Text,
  toast,
} from '@/components';
import { useLang } from '@/lib/language';
import { useInstitution } from '@/lib/institution';
import { color, space } from '@/theme/tokens';
import { useResults } from '@/lib/queries';

export default function Results() {
  const { t, lang } = useLang();
  const inst = useInstitution();
  const { data, isPending, isError, error } = useResults();
  const [sem, setSem] = useState<string | null>(null);

  const results = data ?? [];
  // Default to the most recent declared semester once the data lands.
  const activeSem = sem ?? String(results[results.length - 1]?.semester ?? '');
  const result = results.find((r) => String(r.semester) === activeSem) ?? results[0];

  return (
    <View style={{ flex: 1, backgroundColor: color.page }}>
      <AppBar back title={t('Results', 'परिणाम')} subtitle={`BCA · ${inst.displayName(lang)}`} />

      <View style={{ backgroundColor: color.surface }}>
        <Tabs
          tabs={results.map((r) => ({ id: String(r.semester), label: `Sem ${r.semester}`, labelHi: `सेम ${r.semester}` }))}
          activeId={activeSem}
          onChange={setSem}
        />
      </View>

      <Screen>
        {isError ? (
          <InlineAlert type="error" title={t('Could not load results', 'परिणाम लोड नहीं हो सके')}>
            {(error as Error).message}
          </InlineAlert>
        ) : null}

        {isPending ? (
          <Card style={{ gap: space.md }}>
            <Skeleton width="45%" height={34} />
            <Skeleton height={12} />
            <Skeleton width="70%" height={12} />
          </Card>
        ) : !result ? (
          <EmptyState
            title={t('No results declared yet', 'अभी कोई परिणाम घोषित नहीं')}
            description={t('Declared semester results will appear here.', 'घोषित सेमेस्टर परिणाम यहाँ दिखेंगे।')}
          />
        ) : (
        <>
        {/* Result summary */}
        <Card style={{ gap: space.lg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.lg }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="micro" tone="slate" uppercase>
                SGPA
              </Text>
              <Text variant="display" weight="semibold" tone="marigold">
                {result.sgpa.toFixed(2)}
              </Text>
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="micro" tone="slate" uppercase>
                CGPA
              </Text>
              <Text variant="h1" weight="semibold">
                {result.cgpa.toFixed(2)}
              </Text>
            </View>
            <StatusPill
              status={result.outcome === 'PASS' ? 'approved' : 'rejected'}
              label={result.outcome === 'PASS' ? t('Pass', 'उत्तीर्ण') : result.outcome}
            />
          </View>
          <Divider />
          <FieldGrid>
            <Field label={t('Semester', 'सेमेस्टर')} value={String(result.semester)} />
            <Field label={t('Declared', 'घोषित')} value={result.declaredOn} />
            <Field label={t('Credits', 'क्रेडिट')} value={String(result.totalCredits)} />
          </FieldGrid>
        </Card>

        {/* Marks table — a ruled list rather than a scrolling grid */}
        <Card flush>
          <View style={[headRow, { borderBottomWidth: 1, borderBottomColor: color.rule }]}>
            <Text variant="micro" tone="slate" uppercase style={{ flex: 1 }}>
              {t('Subject', 'विषय')}
            </Text>
            <Text variant="micro" tone="slate" uppercase style={cell}>
              {t('Int', 'आंत')}
            </Text>
            <Text variant="micro" tone="slate" uppercase style={cell}>
              {t('Ext', 'बाह्य')}
            </Text>
            <Text variant="micro" tone="slate" uppercase style={cell}>
              {t('Tot', 'कुल')}
            </Text>
            <Text variant="micro" tone="slate" uppercase style={[cell, { width: 34 }]}>
              {t('Gr', 'ग्रे')}
            </Text>
          </View>

          {result.subjects.map((s, i, arr) => (
            <View
              key={s.code}
              style={[
                headRow,
                i < arr.length - 1 ? { borderBottomWidth: 1, borderBottomColor: color.rule } : null,
              ] as never}
            >
              <View style={{ flex: 1, gap: 2, paddingRight: space.sm }}>
                <Text variant="small" weight="medium">
                  {s.name}
                </Text>
                <Text variant="micro" tone="slate" mono>
                  {s.code}
                </Text>
              </View>
              <Text variant="small" mono style={cell}>
                {s.internal}
              </Text>
              <Text variant="small" mono style={cell}>
                {s.external}
              </Text>
              <Text variant="small" weight="semibold" mono style={cell}>
                {s.total}
              </Text>
              <Text
                variant="small"
                weight="semibold"
                mono
                tone={s.passed ? 'approved' : 'rejected'}
                style={[cell, { width: 34 }]}
              >
                {s.grade}
              </Text>
            </View>
          ))}
        </Card>

        <Button
          full
          variant="secondary"
          title={t('Download marksheet (PDF)', 'अंकसूची डाउनलोड करें (PDF)')}
          onPress={() =>
            toast.info(
              t('Marksheet queued — it will appear in DigiLocker.', 'अंकसूची कतार में — यह DigiLocker में दिखेगी।'),
            )
          }
        />

        <Text variant="micro" tone="slate" center>
          {t(
            'Provisional result. The signed marksheet issued by the Controller of Examinations is the record of authority.',
            'अनंतिम परिणाम। परीक्षा नियंत्रक द्वारा जारी हस्ताक्षरित अंकसूची ही प्रामाणिक अभिलेख है।',
          )}
        </Text>
        </>
        )}
      </Screen>
    </View>
  );
}

const headRow = {
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  paddingHorizontal: space.lg,
  paddingVertical: space.md,
  gap: 4,
};

const cell = { width: 38, textAlign: 'right' as const };
