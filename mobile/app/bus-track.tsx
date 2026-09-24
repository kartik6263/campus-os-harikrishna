import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import {
  AppBar,
  Button,
  Card,
  Divider,
  EmptyState,
  Field,
  FieldGrid,
  InlineAlert,
  Skeleton,
  StatusPill,
  Text,
  toast,
} from '@/components';
import { useLang } from '@/lib/language';
import { color, radius, space } from '@/theme/tokens';
import { formatDate, useTransport } from '@/lib/queries';

export default function BusTrack() {
  const { t } = useLang();
  const { data, isPending, isError, error, refetch, isRefetching } = useTransport();

  const stop = data?.currentStop ?? 0;
  const arrived = data ? stop >= data.stops.length - 1 : false;
  const next = data?.stops[Math.min(stop + 1, data.stops.length - 1)];

  return (
    <View style={{ flex: 1, backgroundColor: color.page }}>
      <AppBar
        back
        title={t('Bus tracking', 'बस ट्रैकिंग')}
        subtitle={data ? `${data.routeNo} · ${data.name}` : t('Transport', 'परिवहन')}
      />

      <ScrollView
        contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: 48 }}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor={color.marigold} />
        }
      >
        {isError ? (
          <InlineAlert type="error" title={t('Could not load transport', 'परिवहन विवरण लोड नहीं हो सका')}>
            {(error as Error).message}
          </InlineAlert>
        ) : null}

        {isPending ? (
          <Card style={{ gap: space.md }}>
            <Skeleton width="55%" height={20} />
            <Skeleton height={12} />
            <Skeleton width="70%" height={12} />
          </Card>
        ) : !data ? (
          <EmptyState
            title={t('No bus pass on file', 'कोई बस पास दर्ज नहीं')}
            description={t(
              'Apply for a transport pass at the college office to track your route here.',
              'यहाँ मार्ग देखने के लिए कॉलेज कार्यालय में परिवहन पास हेतु आवेदन करें।',
            )}
          />
        ) : (
          <>
            <Card style={{ gap: space.md }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                <View style={styles.busBadge}>
                  <Text variant="h3">🚌</Text>
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="h3" weight="semibold" mono>
                    {data.busNo}
                  </Text>
                  <Text variant="micro" tone="slate">
                    {t('Route', 'मार्ग')} {data.routeNo} · {data.driver}
                  </Text>
                </View>
                <StatusPill
                  status={arrived ? 'approved' : 'under-review'}
                  compact
                  label={arrived ? t('Arrived', 'पहुँच गई') : t('En route', 'मार्ग में')}
                />
              </View>

              <Divider />

              {arrived ? (
                <InlineAlert type="success">
                  {t('The bus has reached the college gate.', 'बस कॉलेज गेट पहुँच गई है।')}
                </InlineAlert>
              ) : (
                <InlineAlert type="info" title={t('Next stop', 'अगला पड़ाव')}>
                  {`${next?.name} · ${t('expected', 'अपेक्षित')} ${next?.time}`}
                </InlineAlert>
              )}
            </Card>

            {/* Route rail */}
            <Card style={{ gap: 0 }}>
              <Text variant="h3" weight="semibold" style={{ marginBottom: space.md }}>
                {t('Stops', 'पड़ाव')}
              </Text>

              {data.stops.map((s, i) => {
                const passed = i < stop;
                const here = i === stop;
                const last = i === data.stops.length - 1;

                return (
                  <View key={s.name} style={{ flexDirection: 'row', gap: space.md }}>
                    <View style={{ alignItems: 'center', width: 22 }}>
                      <View
                        style={[
                          styles.node,
                          passed && { backgroundColor: color.approved, borderColor: color.approved },
                          here && {
                            backgroundColor: color.marigold,
                            borderColor: color.marigoldLight,
                            borderWidth: 4,
                            width: 20,
                            height: 20,
                            borderRadius: 10,
                          },
                        ]}
                      />
                      {!last ? (
                        <View style={[styles.rail, (passed || here) && { backgroundColor: color.approved }]} />
                      ) : null}
                    </View>

                    <View style={{ flex: 1, paddingBottom: last ? 0 : space.xl }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                        <Text
                          variant="small"
                          weight={here ? 'semibold' : 'regular'}
                          tone={passed ? 'slate' : 'ink'}
                          style={{ flex: 1 }}
                        >
                          {s.name}
                        </Text>
                        <Text variant="micro" tone="slate" mono>
                          {s.time}
                        </Text>
                      </View>
                      {here ? (
                        <Text variant="micro" tone="marigold" weight="semibold">
                          {t('Bus is here', 'बस यहाँ है')}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                );
              })}
            </Card>

            <Card style={{ gap: space.md }}>
              <Text variant="h3" weight="semibold">
                {t('Bus pass', 'बस पास')}
              </Text>
              <Divider />
              <FieldGrid>
                <Field
                  label={t('Status', 'स्थिति')}
                  value={data.passValid ? t('Valid', 'वैध') : t('Expired', 'समाप्त')}
                />
                <Field label={t('Renew by', 'नवीनीकरण')} value={formatDate(data.passDue)} />
                <Field label={t('Driver', 'चालक')} value={data.driverPhone} mono />
              </FieldGrid>
            </Card>

            <Button
              full
              variant="secondary"
              title={t('Call the driver', 'चालक को कॉल करें')}
              onPress={() => toast.info(`${t('Dialling', 'डायल')} ${data.driverPhone}`)}
            />

            <Text variant="micro" tone="slate" center>
              {t('Location last updated', 'स्थान अंतिम बार अद्यतन')}:{' '}
              {new Date(data.lastUpdated).toLocaleString()}
            </Text>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  busBadge: {
    width: 44,
    height: 44,
    borderRadius: radius.card,
    backgroundColor: color.page,
    alignItems: 'center',
    justifyContent: 'center',
  },
  node: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: color.rule,
    backgroundColor: color.surface,
    marginTop: 3,
  },
  rail: { width: 2, flex: 1, backgroundColor: color.rule, marginVertical: 2 },
});
