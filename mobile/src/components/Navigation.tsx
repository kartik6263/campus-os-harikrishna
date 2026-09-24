import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { color, radius, space } from '@/theme/tokens';
import { Text } from './Text';
import { useLang } from '@/lib/language';

// ─── Tabs ─────────────────────────────────────────────────────────────────────

export interface TabItem {
  id: string;
  label: string;
  labelHi?: string;
}

/** Underlined tab strip — scrolls horizontally when the set overflows. */
export function Tabs({
  tabs,
  activeId,
  onChange,
}: {
  tabs: TabItem[];
  activeId: string;
  onChange: (id: string) => void;
}) {
  const { lang } = useLang();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.tabStrip}
      contentContainerStyle={styles.tabStripInner}
    >
      {tabs.map((tab) => {
        const active = tab.id === activeId;
        return (
          <Pressable
            key={tab.id}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(tab.id)}
            style={[styles.tab, active && styles.tabOn]}
          >
            <Text
              variant="small"
              weight={active ? 'semibold' : 'medium'}
              tone={active ? 'marigold' : 'slate'}
            >
              {lang === 'hi' && tab.labelHi ? tab.labelHi : tab.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

// ─── Segmented control ────────────────────────────────────────────────────────

/** Compact alternative to Tabs for two or three mutually exclusive views. */
export function Segmented({
  items,
  activeId,
  onChange,
}: {
  items: TabItem[];
  activeId: string;
  onChange: (id: string) => void;
}) {
  const { lang } = useLang();
  return (
    <View style={styles.segment}>
      {items.map((item) => {
        const active = item.id === activeId;
        return (
          <Pressable
            key={item.id}
            onPress={() => onChange(item.id)}
            style={[styles.segmentItem, active && styles.segmentItemOn]}
          >
            <Text variant="small" weight={active ? 'semibold' : 'regular'} tone={active ? 'ink' : 'slate'}>
              {lang === 'hi' && item.labelHi ? item.labelHi : item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ─── Breadcrumb ───────────────────────────────────────────────────────────────

export function Breadcrumb({ items }: { items: Array<{ label: string; onPress?: () => void }> }) {
  return (
    <View style={styles.crumbs}>
      {items.map((item, i) => (
        <View key={`${item.label}-${i}`} style={styles.crumb}>
          {i > 0 ? (
            <Text variant="small" tone="muted">
              /
            </Text>
          ) : null}
          <Pressable onPress={item.onPress} disabled={!item.onPress}>
            <Text
              variant="small"
              tone={i === items.length - 1 ? 'ink' : 'slate'}
              weight={i === items.length - 1 ? 'medium' : 'regular'}
            >
              {item.label}
            </Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

// ─── Stepper ──────────────────────────────────────────────────────────────────

export function Stepper({ steps, current }: { steps: Array<{ label: string }>; current: number }) {
  return (
    <View style={styles.stepper}>
      {steps.map((step, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <View key={step.label} style={styles.step}>
            <View style={styles.stepTrack}>
              <View style={[styles.stepLine, { opacity: i === 0 ? 0 : 1 }, i <= current && styles.stepLineOn]} />
              <View
                style={[
                  styles.stepDot,
                  done && styles.stepDotDone,
                  active && styles.stepDotActive,
                ]}
              >
                <Text variant="micro" weight="semibold" tone={done || active ? 'onDark' : 'slate'}>
                  {done ? '✓' : String(i + 1)}
                </Text>
              </View>
              <View
                style={[
                  styles.stepLine,
                  { opacity: i === steps.length - 1 ? 0 : 1 },
                  i < current && styles.stepLineOn,
                ]}
              />
            </View>
            <Text
              variant="micro"
              center
              tone={active ? 'marigold' : 'slate'}
              weight={active ? 'semibold' : 'regular'}
            >
              {step.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

// ─── Timeline ─────────────────────────────────────────────────────────────────

export interface TimelineItem {
  label: string;
  date: string;
  by: string;
  status: 'done' | 'current' | 'pending';
  note?: string;
}

export function Timeline({ items }: { items: TimelineItem[] }) {
  return (
    <View>
      {items.map((item, i) => (
        <View key={`${item.label}-${i}`} style={styles.timelineRow}>
          <View style={styles.timelineRail}>
            <View
              style={[
                styles.timelineDot,
                item.status === 'done' && { backgroundColor: color.approved },
                item.status === 'current' && { backgroundColor: color.marigold },
              ]}
            />
            {i < items.length - 1 ? <View style={styles.timelineLine} /> : null}
          </View>
          <View style={styles.timelineBody}>
            <Text variant="small" weight="medium" tone={item.status === 'pending' ? 'slate' : 'ink'}>
              {item.label}
            </Text>
            <Text variant="micro" tone="slate">
              {item.date} · {item.by}
            </Text>
            {item.note ? (
              <Text variant="micro" tone="slate">
                {item.note}
              </Text>
            ) : null}
          </View>
        </View>
      ))}
    </View>
  );
}

// ─── List row ─────────────────────────────────────────────────────────────────

/** Tappable record row — the mobile stand-in for a DataTable row. */
export function ListRow({
  title,
  subtitle,
  meta,
  right,
  onPress,
  last,
}: {
  title: string;
  subtitle?: string;
  meta?: string;
  right?: ReactNode;
  onPress?: () => void;
  last?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      onPress={onPress}
      style={({ pressed }) => [
        styles.listRow,
        !last && styles.listRowRuled,
        pressed && onPress ? { backgroundColor: color.hover } : null,
      ]}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="small" weight="medium">
          {title}
        </Text>
        {subtitle ? (
          <Text variant="micro" tone="slate">
            {subtitle}
          </Text>
        ) : null}
        {meta ? (
          <Text variant="micro" tone="slate" mono>
            {meta}
          </Text>
        ) : null}
      </View>
      {right}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tabStrip: { borderBottomWidth: 1, borderBottomColor: color.rule, flexGrow: 0 },
  tabStripInner: { paddingHorizontal: 2 },
  tab: {
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabOn: { borderBottomColor: color.marigold },

  segment: {
    flexDirection: 'row',
    backgroundColor: color.page,
    borderRadius: radius.control,
    padding: 3,
    gap: 3,
  },
  segmentItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: radius.sheet,
  },
  segmentItemOn: { backgroundColor: color.surface },

  crumbs: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  crumb: { flexDirection: 'row', alignItems: 'center', gap: 6 },

  stepper: { flexDirection: 'row', alignItems: 'flex-start' },
  step: { flex: 1, alignItems: 'center', gap: space.sm },
  stepTrack: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch' },
  stepLine: { flex: 1, height: 1, backgroundColor: color.rule },
  stepLineOn: { backgroundColor: color.marigold },
  stepDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: color.rule,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotDone: { backgroundColor: color.marigold },
  stepDotActive: { backgroundColor: color.marigold, borderWidth: 4, borderColor: color.marigoldLight },

  timelineRow: { flexDirection: 'row', gap: space.md },
  timelineRail: { alignItems: 'center', width: 12 },
  timelineDot: { width: 12, height: 12, borderRadius: 6, marginTop: 4, backgroundColor: color.rule },
  timelineLine: { width: 1, flex: 1, backgroundColor: color.rule, marginTop: 4 },
  timelineBody: { flex: 1, paddingBottom: space.lg, gap: 2 },

  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  listRowRuled: { borderBottomWidth: 1, borderBottomColor: color.rule },
});
