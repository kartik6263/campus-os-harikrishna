import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Card } from './Layout';
import { Text } from './Text';
import { color, space } from '@/theme/tokens';

/** The dark sign-in backdrop with a card, shared by the pre-sign-in screens. */
export function AuthFrame({ mark, title, subtitle, children }: {
  mark: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: color.ink }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + space['3xl'], paddingBottom: insets.bottom + space['3xl'] }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.brand}>
          <View style={styles.mark}>
            <Text variant="h2" weight="bold" tone="onDark">{mark}</Text>
          </View>
          <Text variant="h2" weight="semibold" tone="onDark" center>{title}</Text>
          {subtitle ? <Text variant="small" tone="muted" center>{subtitle}</Text> : null}
        </View>
        <Card style={{ gap: space.lg }}>{children}</Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: space.xl, gap: space.xl },
  brand: { alignItems: 'center', gap: space.sm, marginBottom: space.sm },
  mark: {
    minWidth: 60, height: 60, paddingHorizontal: 10, borderRadius: 14,
    backgroundColor: color.marigold, alignItems: 'center', justifyContent: 'center', marginBottom: space.sm,
  },
});
