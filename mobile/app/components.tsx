import { useState } from 'react';
import { View } from 'react-native';
import {
  AppBar,
  Avatar,
  Breadcrumb,
  Button,
  ButtonRow,
  Card,
  Checkbox,
  Divider,
  EmptyState,
  Field,
  FieldGrid,
  InlineAlert,
  Input,
  ListRow,
  LoadingBlock,
  OtpInput,
  PermissionDenied,
  ProgressBar,
  ProgressRing,
  RecordBand,
  Screen,
  SectionHeader,
  Segmented,
  Select,
  Sheet,
  Skeleton,
  SkeletonRow,
  Spinner,
  StatusPill,
  Stepper,
  Tabs,
  Text,
  TileButton,
  Timeline,
  Toggle,
  VerifiedSeal,
  toast,
  type StatusType,
} from '@/components';
import { useLang } from '@/lib/language';
import { color, space } from '@/theme/tokens';

/**
 * Live gallery of the mobile design system — the counterpart to the web
 * build's `src/screens/ComponentIndex.tsx`. Every exported component is
 * rendered here, so nothing ships untested.
 */
export default function ComponentIndex() {
  const { t } = useLang();

  const [group, setGroup] = useState('actions');
  const [text, setText] = useState('');
  const [otp, setOtp] = useState('12');
  const [checked, setChecked] = useState(true);
  const [toggled, setToggled] = useState(false);
  const [choice, setChoice] = useState('day');
  const [seg, setSeg] = useState('all');
  const [step, setStep] = useState(1);
  const [sheet, setSheet] = useState(false);

  const GROUPS = [
    { id: 'actions', label: t('Actions', 'क्रियाएँ') },
    { id: 'forms', label: t('Forms', 'फ़ॉर्म') },
    { id: 'status', label: t('Status', 'स्थिति') },
    { id: 'layout', label: t('Layout', 'लेआउट') },
    { id: 'navigation', label: t('Navigation', 'नेविगेशन') },
    { id: 'states', label: t('States', 'अवस्थाएँ') },
  ];

  const ALL_STATUSES: StatusType[] = [
    'approved', 'pending', 'rejected', 'draft', 'under-review',
    'paid', 'overdue', 'valid', 'revoked', 'tampered',
  ];

  return (
    <View style={{ flex: 1, backgroundColor: color.page }}>
      <AppBar
        back
        title={t('Component index', 'कंपोनेंट सूची')}
        subtitle={t('Resolion Campus OS mobile design system', 'कैंपस ओएस मोबाइल डिज़ाइन सिस्टम')}
      />

      <View style={{ backgroundColor: color.surface }}>
        <Tabs tabs={GROUPS} activeId={group} onChange={setGroup} />
      </View>

      <Screen>
        {group === 'actions' ? (
          <>
            <SectionHeader title="Button" subtitle="4 variants · 3 sizes" />
            <Card style={{ gap: space.md }}>
              <ButtonRow>
                <Button title="Primary" onPress={() => toast.success('Primary pressed')} />
                <Button variant="secondary" title="Secondary" />
              </ButtonRow>
              <ButtonRow>
                <Button variant="ghost" title="Ghost" />
                <Button variant="destructive" title="Destructive" />
              </ButtonRow>
              <Divider />
              <ButtonRow>
                <Button size="sm" title="Small" />
                <Button size="md" title="Medium" />
              </ButtonRow>
              <Button size="lg" full title="Large · full width" />
              <Divider />
              <ButtonRow>
                <Button title="Loading" loading />
                <Button title="Disabled" disabled />
              </ButtonRow>
            </Card>

            <SectionHeader title="TileButton" subtitle={t('Dashboard grid tile', 'डैशबोर्ड टाइल')} />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md }}>
              <TileButton glyph="📷" label="Scan" onPress={() => toast.info('Tile pressed')} />
              <TileButton glyph="📊" label="Results" />
              <TileButton glyph="🔔" label="Alerts" badge="3" />
            </View>

            <SectionHeader title="toast" subtitle={t('Four severities', 'चार स्तर')} />
            <Card style={{ gap: space.md }}>
              <ButtonRow>
                <Button size="sm" variant="secondary" title="Success" onPress={() => toast.success('Record saved.')} />
                <Button size="sm" variant="secondary" title="Error" onPress={() => toast.error('Could not save.')} />
              </ButtonRow>
              <ButtonRow>
                <Button size="sm" variant="secondary" title="Info" onPress={() => toast.info('Sync queued.')} />
                <Button size="sm" variant="secondary" title="Warning" onPress={() => toast.warning('Attendance is low.')} />
              </ButtonRow>
            </Card>

            <SectionHeader title="Sheet" />
            <Button variant="secondary" title={t('Open sheet', 'शीट खोलें')} onPress={() => setSheet(true)} />
          </>
        ) : null}

        {group === 'forms' ? (
          <>
            <SectionHeader title="Input" />
            <Card style={{ gap: space.lg }}>
              <Input
                label="Enrolment number"
                labelHi="नामांकन संख्या"
                placeholder="RDU/2021/BCA/0342"
                value={text}
                onChangeText={setText}
              />
              <Input label="With hint" placeholder="98xxx xxxxx" hint="Registered mobile only" prefix={<Text tone="slate">+91</Text>} />
              <Input label="With error" value="abc" error="Enter digits only" />
            </Card>

            <SectionHeader title="Select" subtitle={t('Chips, not a dropdown', 'चिप्स, ड्रॉपडाउन नहीं')} />
            <Card>
              <Select
                label={t('Range', 'अवधि')}
                value={choice}
                onChange={setChoice}
                options={[
                  { value: 'day', label: t('Day', 'दिन') },
                  { value: 'week', label: t('Week', 'सप्ताह') },
                  { value: 'month', label: t('Month', 'माह') },
                ]}
              />
            </Card>

            <SectionHeader title="OtpInput" />
            <Card style={{ gap: space.md }}>
              <OtpInput value={otp} onChange={setOtp} />
              <Text variant="micro" tone="slate">
                {t('Value', 'मान')}: {otp || '—'}
              </Text>
            </Card>

            <SectionHeader title="Checkbox · Toggle" />
            <Card style={{ gap: space.lg }}>
              <Checkbox label={t('I accept the examination rules', 'मैं परीक्षा नियम स्वीकार करता/करती हूँ')} checked={checked} onChange={setChecked} />
              <Checkbox label={t('Disabled option', 'निष्क्रिय विकल्प')} checked={false} onChange={() => {}} disabled />
              <Divider />
              <Toggle on={toggled} onChange={setToggled} label={t('Push notifications', 'पुश सूचनाएँ')} />
            </Card>
          </>
        ) : null}

        {group === 'status' ? (
          <>
            <SectionHeader title="StatusPill" subtitle={t('10 record states', '10 अभिलेख अवस्थाएँ')} />
            <Card>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
                {ALL_STATUSES.map((s) => (
                  <StatusPill key={s} status={s} />
                ))}
              </View>
            </Card>

            <SectionHeader title="InlineAlert" />
            <View style={{ gap: space.md }}>
              <InlineAlert type="info" title="Information">
                The examination form window closes on 30 September.
              </InlineAlert>
              <InlineAlert type="success" title="Approved">
                Your migration certificate has been issued.
              </InlineAlert>
              <InlineAlert type="warning" title="Attendance shortfall">
                Two subjects sit below the 75% threshold.
              </InlineAlert>
              <InlineAlert type="error" title="Payment failed">
                The gateway declined the transaction. No amount was debited.
              </InlineAlert>
            </View>

            <SectionHeader title="ProgressBar · ProgressRing" />
            <Card style={{ gap: space.lg }}>
              <ProgressBar value={82} tone="approved" />
              <ProgressBar value={64} tone="marigold" />
              <ProgressBar value={38} tone="rejected" />
              <Divider />
              <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
                <ProgressRing value={82} />
                <ProgressRing value={64} />
                <ProgressRing value={38} />
              </View>
            </Card>

            <SectionHeader title="VerifiedSeal · Avatar · Spinner" />
            <Card style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' }}>
              <VerifiedSeal size={56} />
              <Avatar name="Priya Sharma" size={48} />
              <Avatar name="R K Mishra" size={48} />
              <Spinner size={26} tint={color.marigold} />
            </Card>
          </>
        ) : null}

        {group === 'layout' ? (
          <>
            <SectionHeader title="RecordBand" subtitle={t('Record sheet header', 'अभिलेख शीर्ष')} />
            <View>
              <RecordBand
                title="Priya Sharma"
                subtitle="Bachelor of Computer Applications"
                id="RDU/2021/BCA/0342"
                meta={[
                  { label: 'Semester', value: 'V' },
                  { label: 'Batch', value: '2021–24' },
                  { label: 'Category', value: 'OBC' },
                ]}
              />
              <Card style={{ borderTopLeftRadius: 0, borderTopRightRadius: 0 }}>
                <Text variant="small" tone="slate">
                  {t('Record body sits directly beneath the band.', 'अभिलेख का मुख्य भाग बैंड के ठीक नीचे रहता है।')}
                </Text>
              </Card>
            </View>

            <SectionHeader title="Field · FieldGrid" />
            <Card>
              <FieldGrid>
                <Field label="Roll number" value="GMC/BCA/2021/0342" mono />
                <Field label="APAAR ID" value="APAAR2021MP1042867" mono />
                <Field label="Programme" value="BCA" />
                <Field label="Semester" value="5" />
              </FieldGrid>
            </Card>

            <SectionHeader title="ListRow" subtitle={t('Replaces the web DataTable', 'वेब DataTable का विकल्प')} />
            <Card flush>
              <ListRow title="Software Engineering" subtitle="BCA501 · CS-201" right={<StatusPill status="approved" compact />} />
              <ListRow title="Database Management" subtitle="BCA502 · CS-203" right={<StatusPill status="pending" compact />} />
              <ListRow title="Computer Networks" subtitle="BCA503 · CS-101" right={<StatusPill status="rejected" compact />} last />
            </Card>

            <SectionHeader title="Card · Divider · SectionHeader" />
            <Card style={{ gap: space.md }}>
              <Text variant="small">{t('A padded surface.', 'पैडिंग युक्त सतह।')}</Text>
              <Divider />
              <Text variant="small" tone="slate">
                {t('Divider above.', 'ऊपर विभाजक।')}
              </Text>
            </Card>

            <SectionHeader title="Text" subtitle={t('The type ramp', 'टाइप रैंप')} />
            <Card style={{ gap: space.sm }}>
              <Text variant="display" weight="semibold">Display 32</Text>
              <Text variant="h1" weight="semibold">Heading 1 · 26</Text>
              <Text variant="h2" weight="semibold">Heading 2 · 21</Text>
              <Text variant="h3" weight="semibold">Heading 3 · 17</Text>
              <Text variant="body">Body · 15 — the default reading size.</Text>
              <Text variant="small" tone="slate">Small · 13 — secondary copy.</Text>
              <Text variant="micro" tone="slate" uppercase>Micro · 11 — labels</Text>
              <Text variant="small" mono>Mono · RDU/2021/BCA/0342</Text>
            </Card>
          </>
        ) : null}

        {group === 'navigation' ? (
          <>
            <SectionHeader title="Breadcrumb" />
            <Card>
              <Breadcrumb
                items={[
                  { label: t('Home', 'होम'), onPress: () => toast.info('Home') },
                  { label: t('Academics', 'शैक्षणिक'), onPress: () => toast.info('Academics') },
                  { label: t('Results', 'परिणाम') },
                ]}
              />
            </Card>

            <SectionHeader title="Segmented" />
            <Card>
              <Segmented
                items={[
                  { id: 'all', label: t('All', 'सभी') },
                  { id: 'unread', label: t('Unread', 'अपठित') },
                  { id: 'urgent', label: t('Urgent', 'अत्यावश्यक') },
                ]}
                activeId={seg}
                onChange={setSeg}
              />
            </Card>

            <SectionHeader title="Stepper" />
            <Card style={{ gap: space.lg }}>
              <Stepper
                steps={[
                  { label: t('Applied', 'आवेदन') },
                  { label: t('Scrutiny', 'जाँच') },
                  { label: t('Approved', 'स्वीकृत') },
                  { label: t('Issued', 'जारी') },
                ]}
                current={step}
              />
              <ButtonRow>
                <Button size="sm" variant="secondary" title={t('Back', 'पीछे')} onPress={() => setStep((s) => Math.max(0, s - 1))} />
                <Button size="sm" variant="secondary" title={t('Next', 'आगे')} onPress={() => setStep((s) => Math.min(3, s + 1))} />
              </ButtonRow>
            </Card>

            <SectionHeader title="Timeline" />
            <Card>
              <Timeline
                items={[
                  { label: t('Application submitted', 'आवेदन जमा'), date: '12-08-2024', by: 'Priya Sharma', status: 'done' },
                  { label: t('Verified by college office', 'कॉलेज कार्यालय द्वारा सत्यापित'), date: '16-08-2024', by: 'Smt. A. Rathore', status: 'done', note: t('Documents in order.', 'दस्तावेज़ सही हैं।') },
                  { label: t('Pending at Registrar', 'कुलसचिव के पास लंबित'), date: '—', by: t('Awaiting action', 'कार्रवाई शेष'), status: 'current' },
                  { label: t('Certificate issued', 'प्रमाण-पत्र जारी'), date: '—', by: '—', status: 'pending' },
                ]}
              />
            </Card>

            <SectionHeader title="Tabs" subtitle={t('The strip at the top of this screen', 'इस स्क्रीन के शीर्ष की पट्टी')} />
          </>
        ) : null}

        {group === 'states' ? (
          <>
            <SectionHeader title="Skeleton · SkeletonRow" />
            <Card style={{ gap: space.md }}>
              <Skeleton width="60%" height={18} />
              <Skeleton width="85%" height={14} />
              <Skeleton height={14} />
              <Divider />
              <SkeletonRow />
              <SkeletonRow />
            </Card>

            <SectionHeader title="LoadingBlock" />
            <Card flush>
              <LoadingBlock label={t('Fetching records…', 'अभिलेख लाए जा रहे हैं…')} />
            </Card>

            <SectionHeader title="EmptyState" />
            <Card flush>
              <EmptyState
                title={t('No grievances filed', 'कोई शिकायत दर्ज नहीं')}
                description={t('Anything you raise will appear here with its tracking status.', 'आपके द्वारा दर्ज कोई भी शिकायत यहाँ स्थिति सहित दिखेगी।')}
                action={<Button size="sm" title={t('File a grievance', 'शिकायत दर्ज करें')} />}
              />
            </Card>

            <SectionHeader title="PermissionDenied" />
            <Card flush>
              <PermissionDenied role="Student" />
            </Card>
          </>
        ) : null}
      </Screen>

      <Sheet
        open={sheet}
        onClose={() => setSheet(false)}
        title={t('Bottom sheet', 'बॉटम शीट')}
        footer={
          <>
            <Button variant="secondary" title={t('Cancel', 'रद्द')} onPress={() => setSheet(false)} />
            <Button
              title={t('Confirm', 'पुष्टि')}
              onPress={() => {
                setSheet(false);
                toast.success(t('Confirmed.', 'पुष्ट।'));
              }}
            />
          </>
        }
      >
        <Text variant="small" tone="slate">
          {t(
            'On the web this system has a centre Modal and a right Drawer. On a phone both collapse to this one surface.',
            'वेब पर इस सिस्टम में केंद्र Modal और दायाँ Drawer है। फ़ोन पर दोनों इसी एक सतह में सिमट जाते हैं।',
          )}
        </Text>
        <FieldGrid>
          <Field label={t('Component', 'कंपोनेंट')} value="Sheet" />
          <Field label={t('Replaces', 'विकल्प')} value="Modal + Drawer" />
        </FieldGrid>
      </Sheet>
    </View>
  );
}
