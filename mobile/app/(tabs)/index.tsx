import { RefreshControl, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import {
  AppBar,
  Avatar,
  Button,
  Card,
  Divider,
  InlineAlert,
  ListRow,
  ProgressRing,
  SectionHeader,
  Skeleton,
  StatusPill,
  Text,
  TileButton,
} from '@/components';
import { useLang } from '@/lib/language';
import { color, space } from '@/theme/tokens';
import {
  inr,
  isNonTeachingDay,
  relativeTime,
  todayKey,
  useAttendance,
  useFees,
  useNotifications,
  useProfile,
  useTimetable,
} from '@/lib/queries';

export default function Dashboard() {
  const { t, lang } = useLang();

  const profile = useProfile();
  const attendance = useAttendance();
  const fees = useFees();
  const timetable = useTimetable();
  const notifications = useNotifications();

  const day = todayKey();
  const offDay = isNonTeachingDay();
  const classes = timetable.data?.byDay?.[day] ?? [];
  const unread = notifications.data?.unreadCount ?? 0;
  const atRisk = attendance.data?.subjects.filter((s) => !s.meetsThreshold) ?? [];

  const refreshing =
    profile.isRefetching || attendance.isRefetching || fees.isRefetching || timetable.isRefetching;

  function refreshAll() {
    void profile.refetch();
    void attendance.refetch();
    void fees.refetch();
    void timetable.refetch();
    void notifications.refetch();
  }

  const due = fees.data?.summary.due ?? 0;

  return (
    <View style={{ flex: 1, backgroundColor: color.page }}>
      <AppBar
        title={t('Resolion Campus OS', 'कैंपस ओएस')}
        subtitle={
          profile.data
            ? `${profile.data.programme.shortName} · ${t('Semester', 'सेमेस्टर')} ${profile.data.semester}`
            : '—'
        }
      />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: 48 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refreshAll} tintColor={color.marigold} />
        }
      >
        {/* Identity strip */}
        <Card>
          {profile.isPending ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
              <Skeleton width={46} height={46} style={{ borderRadius: 23 }} />
              <View style={{ flex: 1, gap: 6 }}>
                <Skeleton width="55%" height={16} />
                <Skeleton width="40%" height={12} />
              </View>
            </View>
          ) : profile.isError ? (
            <InlineAlert type="error" title={t('Could not load your profile', 'प्रोफ़ाइल लोड नहीं हो सकी')}>
              {(profile.error as Error).message}
            </InlineAlert>
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
              <Avatar name={profile.data.name} size={46} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="h3" weight="semibold">
                  {lang === 'hi' && profile.data.nameHi ? profile.data.nameHi : profile.data.name}
                </Text>
                <Text variant="micro" tone="slate" mono>
                  {profile.data.rollNo}
                </Text>
              </View>
              <Button
                size="sm"
                variant="secondary"
                title={t('ID', 'आईडी')}
                onPress={() => router.push('/digital-id')}
              />
            </View>
          )}
        </Card>

        {atRisk.length > 0 ? (
          <InlineAlert type="warning" title={t('Attendance shortfall', 'उपस्थिति में कमी')}>
            {t(
              `${atRisk.length} subject(s) are below the ${attendance.data?.threshold}% examination threshold.`,
              `${atRisk.length} विषय ${attendance.data?.threshold}% परीक्षा सीमा से नीचे हैं।`,
            )}
          </InlineAlert>
        ) : null}

        {/* Attendance + fee at a glance */}
        <View style={{ flexDirection: 'row', gap: space.md }}>
          <Card style={{ flex: 1, alignItems: 'center', gap: space.sm }}>
            {attendance.isPending ? (
              <Skeleton width={78} height={78} style={{ borderRadius: 39 }} />
            ) : (
              <ProgressRing value={attendance.data?.overall.percent ?? 0} size={78} />
            )}
            <Text variant="micro" tone="slate" uppercase>
              {t('Attendance', 'उपस्थिति')}
            </Text>
            <Text variant="micro" tone="slate">
              {attendance.data
                ? `${attendance.data.overall.present}/${attendance.data.overall.total} ${t('classes', 'कक्षाएँ')}`
                : '—'}
            </Text>
          </Card>

          <Card style={{ flex: 1, justifyContent: 'space-between', gap: space.sm }}>
            <Text variant="micro" tone="slate" uppercase>
              {t('Fee due', 'शुल्क बकाया')}
            </Text>
            {fees.isPending ? (
              <Skeleton width="70%" height={26} />
            ) : (
              <Text variant="h2" weight="semibold" tone={due > 0 ? 'rejected' : 'approved'}>
                {inr(due)}
              </Text>
            )}
            <StatusPill status={due > 0 ? 'overdue' : 'paid'} compact />
            <Button
              size="sm"
              full
              title={due > 0 ? t('Pay now', 'भुगतान करें') : t('View', 'देखें')}
              onPress={() => router.push('/(tabs)/fee')}
            />
          </Card>
        </View>

        {/* Quick actions */}
        <View style={{ gap: space.md }}>
          <SectionHeader title={t('Quick actions', 'त्वरित कार्य')} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md }}>
            <TileButton glyph="📷" label={t('QR Attendance', 'QR उपस्थिति')} onPress={() => router.push('/qr-scan')} />
            <TileButton glyph="📊" label={t('Results', 'परिणाम')} onPress={() => router.push('/results')} />
            <TileButton glyph="🚌" label={t('Bus', 'बस')} onPress={() => router.push('/bus-track')} />
            <TileButton glyph="🪪" label={t('Digital ID', 'डिजिटल आईडी')} onPress={() => router.push('/digital-id')} />
            <TileButton
              glyph="🔔"
              label={t('Alerts', 'सूचनाएँ')}
              badge={unread ? String(unread) : undefined}
              onPress={() => router.push('/notifications')}
            />
            <TileButton glyph="🗓" label={t('Timetable', 'समय-सारणी')} onPress={() => router.push('/(tabs)/timetable')} />
          </View>
        </View>

        {/* Today's classes */}
        <View style={{ gap: space.md }}>
          <SectionHeader
            title={offDay ? t('Next classes', 'अगली कक्षाएँ') : t("Today's classes", 'आज की कक्षाएँ')}
            subtitle={`${day} · ${classes.length} ${t('scheduled', 'निर्धारित')}`}
          />
          <Card flush>
            {timetable.isPending ? (
              <View style={{ padding: space.lg, gap: space.md }}>
                <Skeleton height={14} />
                <Skeleton width="80%" height={14} />
              </View>
            ) : classes.length === 0 ? (
              <View style={{ padding: space.lg }}>
                <Text variant="small" tone="slate">
                  {t('No classes scheduled.', 'कोई कक्षा निर्धारित नहीं है।')}
                </Text>
              </View>
            ) : (
              classes.map((slot, i) => (
                <ListRow
                  key={slot.id}
                  title={slot.subject}
                  subtitle={`${slot.time} · ${slot.room} · ${slot.faculty}`}
                  last={i === classes.length - 1}
                  right={
                    slot.cancelled ? (
                      <StatusPill status="rejected" compact label={t('Cancelled', 'रद्द')} />
                    ) : (
                      <Text variant="micro" tone="slate" mono>
                        {slot.code}
                      </Text>
                    )
                  }
                />
              ))
            )}
          </Card>
        </View>

        {/* Recent notifications */}
        <View style={{ gap: space.md }}>
          <SectionHeader
            title={t('Recent alerts', 'हाल की सूचनाएँ')}
            action={
              <Button
                size="sm"
                variant="ghost"
                title={t('See all', 'सभी देखें')}
                onPress={() => router.push('/notifications')}
              />
            }
          />
          <Card flush>
            {notifications.isPending ? (
              <View style={{ padding: space.lg, gap: space.md }}>
                <Skeleton height={14} />
                <Skeleton width="70%" height={14} />
              </View>
            ) : (
              (notifications.data?.items ?? []).slice(0, 3).map((n, i, arr) => (
                <ListRow
                  key={n.id}
                  title={lang === 'hi' && n.titleHi ? n.titleHi : n.title}
                  subtitle={relativeTime(n.createdAt)}
                  last={i === arr.length - 1}
                  onPress={() => router.push('/notifications')}
                  right={
                    n.readAt ? undefined : (
                      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: color.marigold }} />
                    )
                  }
                />
              ))
            )}
          </Card>
        </View>

        <Divider />
        <Text variant="micro" tone="slate" center>
          {profile.data?.college.name ?? ''}
        </Text>
      </ScrollView>
    </View>
  );
}
