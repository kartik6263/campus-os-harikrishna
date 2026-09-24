import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import {
  AppBar,
  Button,
  Card,
  Divider,
  InlineAlert,
  ListRow,
  Screen,
  SectionHeader,
  Skeleton,
  SkeletonRow,
  Spinner,
  StatusPill,
  Text,
  Toggle,
  toast,
} from '@/components';
import { useLang } from '@/lib/language';
import { useQueryClient } from '@tanstack/react-query';
import { color, radius, space } from '@/theme/tokens';

/**
 * Offline state. Demonstrates what the app keeps readable without a network
 * and what it defers, plus the loading treatment used while a sync runs.
 */
export default function Offline() {
  const { t } = useLang();
  const [online, setOnline] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const queryClient = useQueryClient();

  const CACHED = [
    { title: t('Digital ID card', 'डिजिटल आईडी कार्ड'), sub: t('Cached 20-09 · 08:12', 'संचित 20-09 · 08:12'), href: '/digital-id' },
    { title: t('Timetable', 'समय-सारणी'), sub: t('Cached 20-09 · 08:12', 'संचित 20-09 · 08:12'), href: '/(tabs)/timetable' },
    { title: t('Attendance summary', 'उपस्थिति सारांश'), sub: t('Cached 19-09 · 18:40', 'संचित 19-09 · 18:40'), href: '/(tabs)/attendance' },
    { title: t('Last declared result', 'अंतिम घोषित परिणाम'), sub: t('Cached 19-09 · 18:40', 'संचित 19-09 · 18:40'), href: '/results' },
  ];

  const DEFERRED = [
    t('Fee payment', 'शुल्क भुगतान'),
    t('QR attendance', 'QR उपस्थिति'),
    t('Bus location', 'बस स्थान'),
    t('New notifications', 'नई सूचनाएँ'),
  ];

  // A real refetch of every cached query, not a timer.
  async function sync() {
    setSyncing(true);
    try {
      await queryClient.refetchQueries();
      setOnline(true);
      toast.success(t('Synced with the server.', 'सर्वर से सिंक हो गया।'));
    } catch {
      toast.error(t('Could not reach the server.', 'सर्वर तक नहीं पहुँच सके।'));
    } finally {
      setSyncing(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: color.page }}>
      <AppBar back title={t('Connection', 'कनेक्शन')} subtitle={t('Offline behaviour', 'ऑफ़लाइन व्यवहार')} />

      <Screen>
        <Card style={{ gap: space.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
            <View style={[styles.signal, { backgroundColor: online ? color.approvedBg : color.rejectedBg }]}>
              <Text variant="h3">{online ? '📶' : '📵'}</Text>
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="h3" weight="semibold">
                {online ? t('Online', 'ऑनलाइन') : t('No connection', 'कोई कनेक्शन नहीं')}
              </Text>
              <Text variant="micro" tone="slate">
                {online
                  ? t('All records are current.', 'सभी अभिलेख अद्यतन हैं।')
                  : t('Showing records saved on this device.', 'इस डिवाइस पर सहेजे गए अभिलेख दिखाए जा रहे हैं।')}
              </Text>
            </View>
            <StatusPill
              status={online ? 'approved' : 'rejected'}
              compact
              label={online ? t('Live', 'लाइव') : t('Cached', 'संचित')}
            />
          </View>

          <Divider />

          <Toggle
            on={online}
            onChange={setOnline}
            label={t('Simulate a network connection', 'नेटवर्क कनेक्शन का अनुकरण')}
          />
        </Card>

        {!online ? (
          <InlineAlert type="warning" title={t('Working offline', 'ऑफ़लाइन कार्यरत')}>
            {t(
              'Anything you submit now is queued on the device and sent the moment a connection returns.',
              'अभी जो भी जमा करेंगे वह डिवाइस पर कतारबद्ध रहेगा और कनेक्शन लौटते ही भेज दिया जाएगा।',
            )}
          </InlineAlert>
        ) : null}

        <SectionHeader
          title={t('Available offline', 'ऑफ़लाइन उपलब्ध')}
          subtitle={t('Readable without a network', 'बिना नेटवर्क पढ़ा जा सकता है')}
        />
        <Card flush>
          {CACHED.map((c, i, arr) => (
            <ListRow
              key={c.title}
              title={c.title}
              subtitle={c.sub}
              last={i === arr.length - 1}
              onPress={() => router.push(c.href as never)}
              right={<StatusPill status="approved" compact label={t('Saved', 'सहेजा')} />}
            />
          ))}
        </Card>

        <SectionHeader
          title={t('Needs a connection', 'कनेक्शन आवश्यक')}
          subtitle={t('Queued until you are back online', 'ऑनलाइन लौटने तक कतारबद्ध')}
        />
        <Card flush>
          {DEFERRED.map((d, i, arr) => (
            <ListRow
              key={d}
              title={d}
              last={i === arr.length - 1}
              right={
                online ? (
                  <StatusPill status="approved" compact label={t('Ready', 'तैयार')} />
                ) : (
                  <StatusPill status="pending" compact label={t('Waiting', 'प्रतीक्षारत')} />
                )
              }
            />
          ))}
        </Card>

        {/* Loading treatment used while a sync is in flight */}
        {syncing ? (
          <Card style={{ gap: space.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
              <Spinner size={16} tint={color.marigold} />
              <Text variant="small" tone="slate">
                {t('Syncing records…', 'अभिलेख सिंक हो रहे हैं…')}
              </Text>
            </View>
            <Skeleton width="70%" height={14} />
            <SkeletonRow />
            <SkeletonRow />
          </Card>
        ) : null}

        <Button
          full
          size="lg"
          loading={syncing}
          title={syncing ? t('Syncing…', 'सिंक हो रहा है…') : t('Retry and sync now', 'पुनः प्रयास कर सिंक करें')}
          onPress={sync}
        />
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  signal: {
    width: 46,
    height: 46,
    borderRadius: radius.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
