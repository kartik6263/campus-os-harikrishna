import { useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import {
  AppBar,
  Card,
  EmptyState,
  InlineAlert,
  Skeleton,
  StatusPill,
  Tabs,
  Text,
} from '@/components';
import { useLang } from '@/lib/language';
import { color, radius, space } from '@/theme/tokens';
import { DAYS, isNonTeachingDay, todayKey, useTimetable, type Day } from '@/lib/queries';

const DAY_LABEL: Record<Day, { en: string; hi: string }> = {
  MON: { en: 'Mon', hi: 'सोम' },
  TUE: { en: 'Tue', hi: 'मंगल' },
  WED: { en: 'Wed', hi: 'बुध' },
  THU: { en: 'Thu', hi: 'गुरु' },
  FRI: { en: 'Fri', hi: 'शुक्र' },
  SAT: { en: 'Sat', hi: 'शनि' },
};

export default function Timetable() {
  const { t } = useLang();
  const [day, setDay] = useState<Day>(todayKey());
  const { data, isPending, isError, error, refetch, isRefetching } = useTimetable();

  const slots = data?.byDay?.[day] ?? [];
  const cancelled = slots.filter((s) => s.cancelled).length;

  return (
    <View style={{ flex: 1, backgroundColor: color.page }}>
      <AppBar title={t('Timetable', 'समय-सारणी')} subtitle={t('BCA · Semester V', 'BCA · सेमेस्टर V')} />

      <View style={{ backgroundColor: color.surface }}>
        <Tabs
          tabs={DAYS.map((d) => ({ id: d, label: DAY_LABEL[d].en, labelHi: DAY_LABEL[d].hi }))}
          activeId={day}
          onChange={(id) => setDay(id as Day)}
        />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: 48 }}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor={color.marigold} />
        }
      >
        {isError ? (
          <InlineAlert type="error" title={t('Could not load the timetable', 'समय-सारणी लोड नहीं हो सकी')}>
            {(error as Error).message}
          </InlineAlert>
        ) : null}

        {day === todayKey() && !isNonTeachingDay() ? (
          <Text variant="micro" tone="marigold" weight="semibold" uppercase>
            {t('Today', 'आज')}
          </Text>
        ) : null}

        {cancelled > 0 ? (
          <InlineAlert type="warning">
            {t(`${cancelled} class cancelled on this day.`, `इस दिन ${cancelled} कक्षा रद्द है।`)}
          </InlineAlert>
        ) : null}

        {isPending ? (
          <View style={{ gap: space.md }}>
            {[0, 1, 2].map((i) => (
              <Card key={i} style={{ gap: space.sm }}>
                <Skeleton width="55%" height={16} />
                <Skeleton width="35%" height={12} />
              </Card>
            ))}
          </View>
        ) : slots.length === 0 ? (
          <EmptyState
            title={t('No classes', 'कोई कक्षा नहीं')}
            description={t('Nothing is scheduled for this day.', 'इस दिन कुछ भी निर्धारित नहीं है।')}
          />
        ) : (
          <View style={{ gap: space.md }}>
            {slots.map((slot) => (
              <Card
                key={slot.id}
                style={[
                  { flexDirection: 'row', gap: space.md },
                  slot.cancelled ? { opacity: 0.75 } : null,
                ] as never}
              >
                {/* Time rail */}
                <View style={styles_rail}>
                  <Text variant="micro" weight="semibold" mono tone="slate">
                    {slot.startTime}
                  </Text>
                  <View
                    style={{
                      width: 3,
                      flex: 1,
                      borderRadius: 2,
                      minHeight: 24,
                      backgroundColor: slot.cancelled ? color.rejected : color.marigold,
                    }}
                  />
                  <Text variant="micro" mono tone="muted">
                    {slot.endTime}
                  </Text>
                </View>

                <View style={{ flex: 1, gap: 4 }}>
                  <Text
                    variant="small"
                    weight="semibold"
                    style={slot.cancelled ? { textDecorationLine: 'line-through' } : undefined}
                  >
                    {slot.subject}
                  </Text>
                  <Text variant="micro" tone="slate" mono>
                    {slot.code} · {slot.room}
                  </Text>
                  <Text variant="micro" tone="slate">
                    {slot.faculty}
                  </Text>

                  {slot.cancelled ? (
                    <View style={{ gap: 4, marginTop: 4 }}>
                      <StatusPill status="rejected" compact label={t('Cancelled', 'रद्द')} />
                      <Text variant="micro" tone="rejected">
                        {slot.cancelReason}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </Card>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles_rail = {
  alignItems: 'center' as const,
  gap: 4,
  paddingRight: space.sm,
  borderRightWidth: 1,
  borderRightColor: color.rule,
  minWidth: 52,
  borderRadius: radius.sheet,
};
