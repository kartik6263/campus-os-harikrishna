import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Card, InlineAlert, Input, Text, toast } from '@/components';
import { useAuth } from '@/lib/auth';
import { useLang } from '@/lib/language';
import { useInstitution } from '@/lib/institution';
import { ApiError, API_BASE } from '@/lib/api';
import { router } from 'expo-router';
import { multiInstitute, useInstitute } from '@/lib/institute';
import { color, radius, space } from '@/theme/tokens';

export default function Login() {
  const { t, lang, toggle } = useLang();
  const inst = useInstitution();
  const { signIn } = useAuth();
  const { institute, forget } = useInstitute();
  const insets = useSafeAreaInsets();
  // Demo sign-ins belong to the demo only, never to a real institute.
  const isDemo = !institute;

  const [email, setEmail] = useState(isDemo ? 'priya.sharma.2021@demo.resolion.edu' : '');
  const [password, setPassword] = useState(isDemo ? 'campus123' : '');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      await signIn(email.trim(), password);
      toast.success(t('Signed in.', 'साइन इन हो गए।'));
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        // Almost always the dev server not running, or the phone not being
        // able to reach this machine — say which, rather than "Network error".
        setError(
          t(
            `Could not reach the server at ${API_BASE}. Is the backend running?`,
            `सर्वर ${API_BASE} तक नहीं पहुँच सका। क्या बैकएंड चल रहा है?`,
          ),
        );
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: color.ink }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + space['3xl'], paddingBottom: insets.bottom + space['3xl'] },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.brand}>
          <View style={styles.mark}>
            <Text variant="h2" weight="bold" tone="onDark">
              {inst.shortCode}
            </Text>
          </View>
          <Text variant="h1" weight="semibold" tone="onDark">
            Resolion Campus OS
          </Text>
          <Text variant="small" tone="muted" center>
            {inst.placeLine(lang)}
          </Text>
        </View>

        <Card style={{ gap: space.lg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text variant="h3" weight="semibold" style={{ flex: 1 }}>
              {t('Sign in', 'साइन इन करें')}
            </Text>
            <Pressable onPress={toggle} style={styles.lang} accessibilityLabel="Toggle language">
              <Text variant="micro" weight="semibold" tone="slate">
                {lang === 'en' ? 'हिं' : 'EN'}
              </Text>
            </Pressable>
          </View>

          {error ? <InlineAlert type="error">{error}</InlineAlert> : null}

          <Input
            label="Email"
            labelHi="ईमेल"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
            placeholder="you@college.ac.in"
          />

          <Input
            label="Password"
            labelHi="पासवर्ड"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            textContentType="password"
            placeholder="••••••••"
            suffix={
              <Pressable onPress={() => setShowPassword((s) => !s)} hitSlop={8}>
                <Text variant="micro" weight="semibold" tone="marigold">
                  {showPassword ? t('HIDE', 'छिपाएँ') : t('SHOW', 'दिखाएँ')}
                </Text>
              </Pressable>
            }
          />

          <Button
            full
            size="lg"
            loading={busy}
            title={busy ? t('Signing in…', 'साइन इन हो रहा है…') : t('Sign in', 'साइन इन करें')}
            onPress={submit}
          />

          <Pressable onPress={() => router.push('/forgot-password')} hitSlop={8} style={{ alignSelf: 'center' }}>
            <Text variant="small" weight="medium" tone="marigold">
              {t('Forgot password?', 'पासवर्ड भूल गए?')}
            </Text>
          </Pressable>

          {multiInstitute && institute ? (
            <View style={styles.instituteRow}>
              <Text variant="micro" tone="slate" style={{ flex: 1 }}>
                {t(`Institute: ${institute.name}`, `संस्थान: ${institute.name}`)}
              </Text>
              <Pressable onPress={forget} hitSlop={8}>
                <Text variant="micro" weight="semibold" tone="marigold">
                  {t('Change', 'बदलें')}
                </Text>
              </Pressable>
            </View>
          ) : null}
        </Card>

        {/* Seeded demo accounts — shown in the demo only. */}
        {isDemo ? (
        <Card style={{ gap: space.sm }}>
          <Text variant="micro" tone="slate" uppercase>
            {t('Demo accounts', 'डेमो खाते')}
          </Text>
          {[
            { role: t('Student', 'छात्र'), email: 'priya.sharma.2021@demo.resolion.edu' },
            { role: t('Parent', 'अभिभावक'), email: 'parent.sharma@example.in' },
            { role: t('Faculty', 'शिक्षक'), email: 'rk.mishra@demo.resolion.edu' },
          ].map((a) => (
            <Pressable
              key={a.email}
              onPress={() => {
                setEmail(a.email);
                setPassword('campus123');
              }}
              style={styles.demoRow}
            >
              <Text variant="small" weight="medium" style={{ width: 72 }}>
                {a.role}
              </Text>
              <Text variant="micro" tone="slate" mono style={{ flex: 1 }}>
                {a.email}
              </Text>
            </Pressable>
          ))}
          <Text variant="micro" tone="muted">
            {t('Password for all: campus123', 'सभी का पासवर्ड: campus123')}
          </Text>
        </Card>
        ) : null}

        {isDemo ? (
          <Text variant="micro" tone="muted" center>
            {API_BASE}
          </Text>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: space.xl, gap: space.xl },
  brand: { alignItems: 'center', gap: space.sm, marginBottom: space.sm },
  mark: {
    width: 60,
    height: 60,
    borderRadius: 14,
    backgroundColor: color.marigold,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.sm,
  },
  lang: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: color.rule,
  },
  instituteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: space.sm,
    borderTopWidth: 1,
    borderTopColor: color.rule,
  },
  demoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: color.rule,
  },
});
