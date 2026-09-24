import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import {
  AppBar,
  Button,
  Card,
  EmptyState,
  InlineAlert,
  Segmented,
  Skeleton,
  StatusPill,
  Text,
  toast,
} from '@/components';
import { useLang } from '@/lib/language';
import { color, radius, space } from '@/theme/tokens';
import {
  relativeTime,
  useMarkAllRead,
  useMarkNotificationRead,
  useNotifications,
  type Notification,
} from '@/lib/queries';

const KIND_GLYPH: Record<Notification['kind'], string> = {
  ATTENDANCE: '⚠',
  FEE: '₹',
  RESULT: '🎓',
  EXAM: '📝',
  GENERAL: '🔔',
};

const KIND_COLOR: Record<Notification['kind'], string> = {
  ATTENDANCE: color.marigold,
  FEE: color.rejected,
  RESULT: color.approved,
  EXAM: color.info,
  GENERAL: color.slate,
};

export default function Notifications() {
  const { t, lang } = useLang();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const { data, isPending, isError, error, refetch, isRefetching } = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllRead();

  const items = useMemo(() => {
    const all = data?.items ?? [];
    return filter === 'unread' ? all.filter((n) => !n.readAt) : all;
  }, [data, filter]);

  const unreadCount = data?.unreadCount ?? 0;

  function open(n: Notification) {
    if (!n.readAt) markRead.mutate(n.id);
    if (n.href) router.push(n.href as never);
  }

  async function readEverything() {
    const res = await markAll.mutateAsync();
    toast.success(
      t(`${res.marked} notification(s) marked read.`, `${res.marked} सूचनाएँ पढ़ी गई चिह्नित।`),
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: color.page }}>
      <AppBar
        back
        title={t('Notifications', 'सूचनाएँ')}
        subtitle={t(`${unreadCount} unread`, `${unreadCount} अपठित`)}
      />

      <ScrollView
        contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: 48 }}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor={color.marigold} />
        }
      >
        {isError ? (
          <InlineAlert type="error" title={t('Could not load notifications', 'सूचनाएँ लोड नहीं हो सकीं')}>
            {(error as Error).message}
          </InlineAlert>
        ) : null}

        <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <Segmented
              items={[
                { id: 'all', label: t('All', 'सभी') },
                { id: 'unread', label: t('Unread', 'अपठित') },
              ]}
              activeId={filter}
              onChange={(v) => setFilter(v as 'all' | 'unread')}
            />
          </View>
          <Button
            size="sm"
            variant="ghost"
            title={t('Mark all', 'सभी पढ़ें')}
            loading={markAll.isPending}
            disabled={unreadCount === 0}
            onPress={readEverything}
          />
        </View>

        {isPending ? (
          <View style={{ gap: space.md }}>
            {[0, 1, 2].map((i) => (
              <Card key={i} style={{ gap: space.sm }}>
                <Skeleton width="65%" height={14} />
                <Skeleton height={12} />
              </Card>
            ))}
          </View>
        ) : items.length === 0 ? (
          <EmptyState
            title={t('You are all caught up', 'सब कुछ पढ़ लिया गया')}
            description={t('No unread notifications.', 'कोई अपठित सूचना नहीं।')}
          />
        ) : (
          <View style={{ gap: space.md }}>
            {items.map((n) => {
              const isRead = !!n.readAt;
              return (
                <Pressable key={n.id} onPress={() => open(n)}>
                  <Card style={[!isRead && styles.unread] as never}>
                    <View style={{ flexDirection: 'row', gap: space.md }}>
                      <View style={[styles.glyph, { backgroundColor: KIND_COLOR[n.kind] }]}>
                        <Text variant="small" weight="bold" tone="onDark">
                          {KIND_GLYPH[n.kind]}
                        </Text>
                      </View>

                      <View style={{ flex: 1, gap: 4 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                          <Text variant="small" weight={isRead ? 'medium' : 'semibold'} style={{ flex: 1 }}>
                            {lang === 'hi' && n.titleHi ? n.titleHi : n.title}
                          </Text>
                          {!isRead ? <View style={styles.dot} /> : null}
                        </View>

                        <Text variant="micro" tone="slate">
                          {lang === 'hi' && n.bodyHi ? n.bodyHi : n.body}
                        </Text>

                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: 2 }}>
                          <Text variant="micro" tone="muted">
                            {relativeTime(n.createdAt)}
                          </Text>
                          {n.urgent ? (
                            <StatusPill status="pending" compact label={t('Action needed', 'कार्रवाई')} />
                          ) : null}
                        </View>
                      </View>
                    </View>
                  </Card>
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  unread: { borderLeftWidth: 3, borderLeftColor: color.marigold },
  glyph: {
    width: 30,
    height: 30,
    borderRadius: radius.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: color.marigold },
});
