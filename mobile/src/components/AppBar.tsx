import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { color, space } from '@/theme/tokens';
import { Text } from './Text';
import { useLang } from '@/lib/language';

/**
 * Navy app bar. Mirrors the web AppShell header: wordmark / title on the left,
 * the EN–हिं language switch and any screen actions on the right.
 */
export function AppBar({
  title,
  subtitle,
  back,
  right,
  showLang = true,
}: {
  title: string;
  subtitle?: string;
  back?: boolean;
  right?: ReactNode;
  showLang?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const { lang, toggle } = useLang();

  return (
    <View style={[styles.bar, { paddingTop: insets.top + space.sm }]}>
      {back ? (
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
          hitSlop={12}
          accessibilityLabel="Go back"
          style={styles.back}
        >
          <Text variant="h3" tone="onDark">
            ‹
          </Text>
        </Pressable>
      ) : null}

      <View style={{ flex: 1, gap: 1 }}>
        <Text variant="h3" weight="semibold" tone="onDark" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="micro" tone="muted" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      {right}

      {showLang ? (
        <Pressable onPress={toggle} style={styles.lang} accessibilityLabel="Toggle language">
          <Text variant="micro" weight="semibold" tone="onDark">
            {lang === 'en' ? 'हिं' : 'EN'}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: color.ink,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
  },
  back: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -6,
  },
  lang: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
  },
});
