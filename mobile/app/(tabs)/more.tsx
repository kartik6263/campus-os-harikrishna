import { useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import {
  AppBar,
  Avatar,
  Button,
  Card,
  Divider,
  Field,
  FieldGrid,
  InlineAlert,
  ListRow,
  SectionHeader,
  Sheet,
  Skeleton,
  StatusPill,
  Text,
  Toggle,
} from '@/components';
import { useLang } from '@/lib/language';
import { useAuth } from '@/lib/auth';
import { multiInstitute, useInstitute } from '@/lib/institute';
import { color, space } from '@/theme/tokens';
import { useNotifications, useProfile } from '@/lib/queries';

export default function More() {
  const { t, lang, toggle } = useLang();
  const { user, signOut } = useAuth();
  const { institute, forget } = useInstitute();

  /** Signs out here, then forgets the institute so another can be chosen. */
  async function changeInstitute() {
    await signOut();
    await forget();
  }

  const [push, setPush] = useState(true);
  const [dataSaver, setDataSaver] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const profile = useProfile();
  const notifications = useNotifications();
  const unread = notifications.data?.unreadCount ?? 0;
  const student = profile.data;

  async function doSignOut() {
    setSigningOut(true);
    await signOut();
    setSigningOut(false);
    setConfirmSignOut(false);
    router.replace('/login');
  }

  return (
    <View style={{ flex: 1, backgroundColor: color.page }}>
      <AppBar title={t('More', 'अधिक')} />

      <ScrollView
        contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: 48 }}
        refreshControl={
          <RefreshControl
            refreshing={profile.isRefetching}
            onRefresh={() => void profile.refetch()}
            tintColor={color.marigold}
          />
        }
      >
        <Card style={{ gap: space.lg }}>
          {profile.isPending ? (
            <View style={{ gap: space.md }}>
              <Skeleton width="55%" height={18} />
              <Skeleton width="40%" height={12} />
            </View>
          ) : profile.isError ? (
            <InlineAlert type="error" title={t('Could not load your profile', 'प्रोफ़ाइल लोड नहीं हो सकी')}>
              {(profile.error as Error).message}
            </InlineAlert>
          ) : student ? (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                <Avatar name={student.name} size={52} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="h3" weight="semibold">
                    {lang === 'hi' && student.nameHi ? student.nameHi : student.name}
                  </Text>
                  <Text variant="micro" tone="slate" mono>
                    {student.enrolmentNo}
                  </Text>
                  <StatusPill status="valid" compact label={t('Enrolled', 'नामांकित')} />
                </View>
              </View>
              <Divider />
              <FieldGrid>
                <Field label={t('Programme', 'कार्यक्रम')} value={student.programme.shortName} />
                <Field label={t('Semester', 'सेमेस्टर')} value={String(student.semester)} />
                <Field label={t('Batch', 'बैच')} value={student.batch} />
                <Field label={t('Category', 'श्रेणी')} value={student.category ?? '—'} />
                <Field label="APAAR ID" value={student.apaarId ?? '—'} mono />
                <Field label="ABC ID" value={student.abcId ?? '—'} mono />
              </FieldGrid>
            </>
          ) : null}
        </Card>

        <SectionHeader title={t('Services', 'सेवाएँ')} />
        <Card flush>
          <ListRow
            title={t('Examination results', 'परीक्षा परिणाम')}
            subtitle={t('Semester-wise marksheets and CGPA', 'सेमेस्टरवार अंकसूची और CGPA')}
            onPress={() => router.push('/results')}
            right={<Chevron />}
          />
          <ListRow
            title={t('Notifications', 'सूचनाएँ')}
            subtitle={t(`${unread} unread`, `${unread} अपठित`)}
            onPress={() => router.push('/notifications')}
            right={<Chevron />}
          />
          <ListRow
            title={t('QR attendance', 'QR उपस्थिति')}
            subtitle={t('Scan the code shown in class', 'कक्षा में दिखाया गया कोड स्कैन करें')}
            onPress={() => router.push('/qr-scan')}
            right={<Chevron />}
          />
          <ListRow
            title={t('Bus tracking', 'बस ट्रैकिंग')}
            subtitle={t('Route and pass', 'मार्ग और पास')}
            onPress={() => router.push('/bus-track')}
            right={<Chevron />}
          />
          <ListRow
            title={t('Digital ID card', 'डिजिटल आईडी कार्ड')}
            subtitle={t('Works offline', 'ऑफ़लाइन भी काम करता है')}
            onPress={() => router.push('/digital-id')}
            right={<Chevron />}
          />
          <ListRow
            title={t('Connection status', 'कनेक्शन स्थिति')}
            subtitle={t('Offline behaviour and sync', 'ऑफ़लाइन व्यवहार और सिंक')}
            onPress={() => router.push('/offline')}
            right={<Chevron />}
            last
          />
        </Card>

        <SectionHeader title={t('Design system', 'डिज़ाइन सिस्टम')} />
        <Card flush>
          <ListRow
            title={t('Component index', 'कंपोनेंट सूची')}
            subtitle={t('Every component in the system, live', 'सिस्टम के सभी कंपोनेंट, सजीव')}
            onPress={() => router.push('/components')}
            right={<Chevron />}
            last
          />
        </Card>

        <SectionHeader title={t('Preferences', 'प्राथमिकताएँ')} />
        <Card style={{ gap: space.lg }}>
          <Toggle on={lang === 'hi'} onChange={toggle} label={t('Read in Hindi (हिन्दी)', 'हिन्दी में पढ़ें')} />
          <Divider />
          <Toggle on={push} onChange={setPush} label={t('Push notifications', 'पुश सूचनाएँ')} />
          <Divider />
          <Toggle on={dataSaver} onChange={setDataSaver} label={t('Data saver (text only)', 'डेटा सेवर (केवल पाठ)')} />
        </Card>

        <SectionHeader title={t('Account', 'खाता')} />
        <Card style={{ gap: space.md }}>
          <Field label={t('Signed in as', 'साइन इन')} value={user?.email ?? '—'} />
          {multiInstitute && institute ? (
            <>
              <Divider />
              <Field label={t('Institute', 'संस्थान')} value={institute.name} />
              <Button
                full
                variant="secondary"
                title={t('Change institute', 'संस्थान बदलें')}
                onPress={changeInstitute}
              />
            </>
          ) : null}
          <Divider />
          <Button
            full
            variant="destructive"
            title={t('Sign out', 'साइन आउट')}
            onPress={() => setConfirmSignOut(true)}
          />
        </Card>

        <Text variant="micro" tone="slate" center>
          Resolion Campus OS · v1.0.0{'\n'}
          {student?.college.name ?? ''}
        </Text>
      </ScrollView>

      <Sheet
        open={confirmSignOut}
        onClose={() => (signingOut ? undefined : setConfirmSignOut(false))}
        title={t('Sign out?', 'साइन आउट करें?')}
        footer={
          <>
            <Button
              variant="secondary"
              title={t('Cancel', 'रद्द')}
              disabled={signingOut}
              onPress={() => setConfirmSignOut(false)}
            />
            <Button variant="destructive" title={t('Sign out', 'साइन आउट')} loading={signingOut} onPress={doSignOut} />
          </>
        }
      >
        <Text variant="small" tone="slate">
          {t(
            'Your saved records will be cleared from this device and you will need to sign in again.',
            'इस डिवाइस से आपके सहेजे गए अभिलेख हट जाएँगे और आपको फिर साइन इन करना होगा।',
          )}
        </Text>
      </Sheet>
    </View>
  );
}

function Chevron() {
  return (
    <Text variant="h3" tone="muted">
      ›
    </Text>
  );
}
