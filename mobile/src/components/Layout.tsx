import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { color, radius, shadow, space } from '@/theme/tokens';
import { Text } from './Text';

/** Page background + scroll container. Every screen body sits in one of these. */
export function Screen({
  children,
  scroll = true,
  padded = true,
  style,
}: {
  children: ReactNode;
  scroll?: boolean;
  padded?: boolean;
  style?: ViewStyle;
}) {
  const insets = useSafeAreaInsets();
  const inner: ViewStyle = {
    padding: padded ? space.lg : 0,
    paddingBottom: (padded ? space.lg : 0) + insets.bottom + 16,
    gap: space.lg,
  };

  if (!scroll) {
    return <View style={[styles.page, inner, style]}>{children}</View>;
  }
  return (
    <ScrollView
      style={[styles.page, style]}
      contentContainerStyle={inner}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}

/** White record surface — the workhorse container of the system. */
export function Card({
  children,
  style,
  padded = true,
  flush,
}: {
  children: ReactNode;
  style?: ViewStyle;
  padded?: boolean;
  flush?: boolean;
}) {
  return (
    <View
      style={[
        styles.card,
        padded && { padding: space.lg },
        flush && { padding: 0 },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function SectionHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <View style={styles.sectionHeader}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="h3" weight="semibold">
          {title}
        </Text>
        {subtitle ? (
          <Text variant="small" tone="slate">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {action}
    </View>
  );
}

/** Horizontal hairline, the system's `border-rule` divider. */
export function Divider({ inset = 0 }: { inset?: number }) {
  return <View style={[styles.divider, { marginLeft: inset }]} />;
}

/** Label/value pair used throughout record sheets. */
export function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <View style={{ gap: 2, minWidth: 120, flex: 1 }}>
      <Text variant="micro" tone="slate" uppercase>
        {label}
      </Text>
      <Text variant="small" weight="medium" mono={mono}>
        {value}
      </Text>
    </View>
  );
}

export function FieldGrid({ children }: { children: ReactNode }) {
  return <View style={styles.fieldGrid}>{children}</View>;
}

/** Dark navy record band — the header of a record sheet. */
export function RecordBand({
  title,
  subtitle,
  id,
  meta,
}: {
  title: string;
  subtitle?: string;
  id?: string;
  meta?: Array<{ label: string; value: string }>;
}) {
  return (
    <View style={styles.band}>
      <View style={styles.bandTop}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="h3" weight="semibold" tone="onDark">
            {title}
          </Text>
          {subtitle ? (
            <Text variant="small" tone="muted">
              {subtitle}
            </Text>
          ) : null}
        </View>
        {id ? (
          <Text variant="small" tone="muted" mono>
            {id}
          </Text>
        ) : null}
      </View>
      {meta?.length ? (
        <View style={styles.bandMeta}>
          {meta.map((m) => (
            <View key={m.label} style={{ gap: 2, minWidth: 96 }}>
              <Text variant="micro" tone="muted" uppercase>
                {m.label}
              </Text>
              <Text variant="small" weight="medium" tone="onDark">
                {m.value}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: color.page },
  card: {
    backgroundColor: color.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: color.rule,
    ...shadow.card,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  divider: { height: 1, backgroundColor: color.rule },
  fieldGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: space.md, columnGap: space.lg },
  band: {
    backgroundColor: color.ink,
    padding: space.lg,
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
    gap: space.lg,
  },
  bandTop: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  bandMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: space.md,
    columnGap: space['2xl'],
    paddingTop: space.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.12)',
  },
});
