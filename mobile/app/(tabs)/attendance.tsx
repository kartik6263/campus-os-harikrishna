import { useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import {
  AppBar,
  Button,
  Card,
  InlineAlert,
  ProgressBar,
  ProgressRing,
  SectionHeader,
  Sheet,
  Skeleton,
  StatusPill,
  Text,
} from '@/components';
import { useLang } from '@/lib/language';
import { color, space } from '@/theme/tokens';
import { useAttendance, type AttendanceSubject } from '@/lib/queries';

export default function Attendance() {
  const { t } = useLang();
  const [detail, setDetail] = useState<AttendanceSubject | null>(null);
  const { data, isPending, isError, error, refetch, isRefetching } = useAttendance();

  const threshold = data?.threshold ?? 75;
  const shortfall = data?.subjects.filter((s) => !s.meetsThreshold) ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: color.page }}>
      <AppBar
        title={t('Attendance', 'उपस्थिति')}
        subtitle={t('Semester V · 2024–25', 'सेमेस्टर V · 2024–25')}
      />

      <ScrollView
        contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: 48 }}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor={color.marigold} />
        }
      >
        {isError ? (
          <InlineAlert type="error" title={t('Could not load attendance', 'उपस्थिति लोड नहीं हो सकी')}>
            {(error as Error).message}
          </InlineAlert>
        ) : null}

        <Card style={{ alignItems: 'center', gap: space.md }}>
          {isPending ? (
            <Skeleton width={112} height={112} style={{ borderRadius: 56 }} />
          ) : (
            <>
              <ProgressRing value={data?.overall.percent ?? 0} size={112} stroke={9} />
              <Text variant="small" tone="slate">
                {data?.overall.present} {t('of', 'में से')} {data?.overall.total}{' '}
                {t('classes attended', 'कक्षाएँ उपस्थित')}
              </Text>
              <StatusPill
                status={(data?.overall.percent ?? 0) >= threshold ? 'approved' : 'rejected'}
                label={
                  (data?.overall.percent ?? 0) >= threshold
                    ? t('Eligible for examination', 'परीक्षा के लिए पात्र')
                    : t('Below threshold', 'सीमा से नीचे')
                }
              />
            </>
          )}
        </Card>

        {shortfall.length > 0 ? (
          <InlineAlert type="error" title={t('Action needed', 'कार्रवाई आवश्यक')}>
            {t(
              `${shortfall.length} subject(s) sit below ${threshold}%. Tap a subject to see how many classes you must still attend.`,
              `${shortfall.length} विषय ${threshold}% से नीचे हैं। कितनी कक्षाएँ शेष हैं, देखने के लिए विषय पर टैप करें।`,
            )}
          </InlineAlert>
        ) : null}

        <SectionHeader
          title={t('Subject-wise', 'विषयवार')}
          subtitle={t(
            `${threshold}% required to sit the examination`,
            `परीक्षा हेतु ${threshold}% आवश्यक`,
          )}
        />

        <View style={{ gap: space.md }}>
          {isPending
            ? [0, 1, 2].map((i) => (
                <Card key={i} style={{ gap: space.md }}>
                  <Skeleton width="60%" height={16} />
                  <Skeleton height={8} />
                  <Skeleton width="40%" height={12} />
                </Card>
              ))
            : data?.subjects.map((s) => (
                <Card key={s.code} style={{ gap: space.md }}>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.md }}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text variant="small" weight="semibold">
                        {s.name}
                      </Text>
                      <Text variant="micro" tone="slate" mono>
                        {s.code} · {s.faculty}
                      </Text>
                    </View>
                    <Text variant="h3" weight="semibold" tone={s.meetsThreshold ? 'approved' : 'rejected'}>
                      {s.percent.toFixed(1)}%
                    </Text>
                  </View>

                  <ProgressBar value={s.percent} tone={s.meetsThreshold ? 'approved' : 'rejected'} />

                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                    <Text variant="micro" tone="slate" style={{ flex: 1 }}>
                      {s.present}/{s.total} {t('attended', 'उपस्थित')}
                      {!s.meetsThreshold
                        ? ` · ${t('attend', 'अगली')} ${s.classesNeeded} ${t('more to reach', 'कक्षाएँ शेष')} ${threshold}%`
                        : ''}
                    </Text>
                    <Button
                      size="sm"
                      variant="ghost"
                      title={t('Details', 'विवरण')}
                      onPress={() => setDetail(s)}
                    />
                  </View>
                </Card>
              ))}
        </View>

        <Button
          full
          size="lg"
          title={t('Mark attendance by QR', 'QR से उपस्थिति दर्ज करें')}
          onPress={() => router.push('/qr-scan')}
        />
      </ScrollView>

      <Sheet
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail?.name ?? ''}
        footer={<Button variant="secondary" title={t('Close', 'बंद करें')} onPress={() => setDetail(null)} />}
      >
        {detail ? (
          <View style={{ gap: space.md }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: space.md, columnGap: space.xl }}>
              <Stat label={t('Code', 'कोड')} value={detail.code} />
              <Stat label={t('Credits', 'क्रेडिट')} value={String(detail.credits)} />
              <Stat label={t('Room', 'कक्ष')} value={detail.room} />
              <Stat label={t('Held', 'आयोजित')} value={String(detail.total)} />
              <Stat label={t('Present', 'उपस्थित')} value={String(detail.present)} />
              <Stat label={t('Absent', 'अनुपस्थित')} value={String(detail.total - detail.present)} />
            </View>
            <Text variant="small" tone="slate">
              {t('Faculty', 'शिक्षक')}: {detail.faculty}
            </Text>
            {!detail.meetsThreshold ? (
              <InlineAlert type="warning">
                {t(
                  `Attend the next ${detail.classesNeeded} consecutive classes to reach ${threshold}%.`,
                  `${threshold}% तक पहुँचने के लिए अगली ${detail.classesNeeded} कक्षाओं में लगातार उपस्थित रहें।`,
                )}
              </InlineAlert>
            ) : (
              <InlineAlert type="success">
                {t('This subject clears the examination threshold.', 'यह विषय परीक्षा सीमा पूरी करता है।')}
              </InlineAlert>
            )}
          </View>
        ) : null}
      </Sheet>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ gap: 2, minWidth: 80 }}>
      <Text variant="micro" tone="slate" uppercase>
        {label}
      </Text>
      <Text variant="small" weight="medium" mono>
        {value}
      </Text>
    </View>
  );
}
