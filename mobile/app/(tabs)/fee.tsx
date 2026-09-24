import { useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import {
  AppBar,
  Button,
  Card,
  Divider,
  InlineAlert,
  ListRow,
  ProgressBar,
  Segmented,
  Sheet,
  Skeleton,
  StatusPill,
  Text,
  Timeline,
  toast,
} from '@/components';
import { useLang } from '@/lib/language';
import { color, space } from '@/theme/tokens';
import { formatDate, inr, useFees, usePayInstalment } from '@/lib/queries';
import { ApiError } from '@/lib/api';

type Pane = 'due' | 'history';

export default function Fee() {
  const { t } = useLang();
  const [pane, setPane] = useState<Pane>('due');
  const [confirming, setConfirming] = useState(false);

  const { data, isPending, isError, error, refetch, isRefetching } = useFees();
  const pay = usePayInstalment();

  const nextDue = data?.instalments.find((i) => !i.paid);
  const due = data?.summary.due ?? 0;
  const scholarship = data?.scholarships.find((s) => s.adjusted);

  async function confirmPayment() {
    if (!nextDue) return;
    try {
      const receipt = await pay.mutateAsync(nextDue.id);
      setConfirming(false);
      toast.success(
        t(`Paid ${inr(receipt.amount)} — receipt ${receipt.receipt}`, `${inr(receipt.amount)} भुगतान — रसीद ${receipt.receipt}`),
      );
    } catch (err) {
      setConfirming(false);
      toast.error(err instanceof ApiError ? err.message : t('Payment failed.', 'भुगतान विफल।'));
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: color.page }}>
      <AppBar title={t('Fees', 'शुल्क')} subtitle={t('Semester V · 2024–25', 'सेमेस्टर V · 2024–25')} />

      <ScrollView
        contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: 48 }}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} tintColor={color.marigold} />
        }
      >
        {isError ? (
          <InlineAlert type="error" title={t('Could not load fees', 'शुल्क विवरण लोड नहीं हो सका')}>
            {(error as Error).message}
          </InlineAlert>
        ) : null}

        <Card style={{ gap: space.md }}>
          <Text variant="micro" tone="slate" uppercase>
            {t('Outstanding', 'बकाया')}
          </Text>
          {isPending ? (
            <Skeleton width="60%" height={34} />
          ) : (
            <Text variant="display" weight="semibold" tone={due > 0 ? 'rejected' : 'approved'}>
              {inr(due)}
            </Text>
          )}
          <ProgressBar value={data?.summary.paid ?? 0} max={data?.summary.total || 1} tone="approved" />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text variant="micro" tone="slate">
              {t('Paid', 'भुगतान')} {inr(data?.summary.paid ?? 0)}
            </Text>
            <Text variant="micro" tone="slate">
              {t('Total', 'कुल')} {inr(data?.summary.total ?? 0)}
            </Text>
          </View>
          {nextDue ? (
            <Button
              full
              size="lg"
              title={`${t('Pay', 'भुगतान करें')} ${inr(nextDue.amount)}`}
              onPress={() => setConfirming(true)}
            />
          ) : !isPending ? (
            <StatusPill status="paid" />
          ) : null}
        </Card>

        {scholarship ? (
          <InlineAlert type="success" title={t('Scholarship adjusted', 'छात्रवृत्ति समायोजित')}>
            {`${scholarship.name} — ${inr(scholarship.amount)} ${t('credited on', 'को जमा')} ${formatDate(scholarship.adjustedAt)}`}
          </InlineAlert>
        ) : null}

        <Segmented
          items={[
            { id: 'due', label: t('Breakdown', 'विवरण') },
            { id: 'history', label: t('History', 'इतिहास') },
          ]}
          activeId={pane}
          onChange={(v) => setPane(v as Pane)}
        />

        {pane === 'due' ? (
          <>
            <Card flush>
              {(data?.items ?? []).map((f, i, arr) => (
                <ListRow
                  key={f.id}
                  title={f.head}
                  subtitle={`${inr(f.amount)} · ${f.category.toLowerCase()}`}
                  last={i === arr.length - 1}
                  right={
                    f.outstanding === 0 ? (
                      <StatusPill status="paid" compact />
                    ) : (
                      <Text variant="small" weight="semibold" tone="rejected">
                        {inr(f.outstanding)}
                      </Text>
                    )
                  }
                />
              ))}
            </Card>

            {data?.instalments.length ? (
              <Card style={{ gap: space.md }}>
                <Text variant="h3" weight="semibold">
                  {t('Instalment plan', 'किस्त योजना')}
                </Text>
                <Divider />
                <Timeline
                  items={data.instalments.map((p) => ({
                    label: `${t('Instalment', 'किस्त')} ${p.number} — ${inr(p.amount)}`,
                    date: p.paid
                      ? `${t('Paid', 'भुगतान')} ${formatDate(p.paidAt)}`
                      : `${t('Due', 'देय')} ${formatDate(p.dueDate)}`,
                    by: p.paid ? t('Confirmed', 'पुष्ट') : t('Awaiting payment', 'भुगतान शेष'),
                    status: p.paid ? 'done' : 'current',
                  }))}
                />
              </Card>
            ) : null}
          </>
        ) : (
          <Card flush>
            {(data?.payments ?? []).map((p, i, arr) => (
              <ListRow
                key={p.id}
                title={p.head}
                subtitle={`${formatDate(p.date)} · ${p.mode}`}
                meta={p.receipt ?? undefined}
                last={i === arr.length - 1}
                right={
                  <Text variant="small" weight="semibold" tone={p.amount < 0 ? 'approved' : 'ink'}>
                    {inr(p.amount)}
                  </Text>
                }
              />
            ))}
          </Card>
        )}
      </ScrollView>

      <Sheet
        open={confirming}
        onClose={() => (pay.isPending ? undefined : setConfirming(false))}
        title={t('Confirm payment', 'भुगतान की पुष्टि करें')}
        footer={
          <>
            <Button
              variant="secondary"
              title={t('Cancel', 'रद्द')}
              disabled={pay.isPending}
              onPress={() => setConfirming(false)}
            />
            <Button title={t('Pay by UPI', 'UPI से भुगतान')} loading={pay.isPending} onPress={confirmPayment} />
          </>
        }
      >
        <View style={{ gap: space.md }}>
          <Text variant="h2" weight="semibold">
            {inr(nextDue?.amount ?? 0)}
          </Text>
          <Text variant="small" tone="slate">
            {t('Instalment', 'किस्त')} {nextDue?.number} · {t('due', 'देय')} {formatDate(nextDue?.dueDate)}
          </Text>
          <Divider />
          <InlineAlert type="info">
            {t(
              'This records the payment against your account. A live deployment would hand off to the university gateway first.',
              'यह भुगतान आपके खाते में दर्ज करता है। वास्तविक परिनियोजन में पहले विश्वविद्यालय गेटवे पर भेजा जाएगा।',
            )}
          </InlineAlert>
        </View>
      </Sheet>
    </View>
  );
}
