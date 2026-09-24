import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { color, radius, shadow, space } from '@/theme/tokens';
import { Text } from './Text';

// ─── Toast ────────────────────────────────────────────────────────────────────

type ToastType = 'success' | 'error' | 'info' | 'warning';
interface ToastMsg {
  id: number;
  type: ToastType;
  message: string;
}

let listeners: Array<(t: ToastMsg) => void> = [];
let nextId = 0;
const emit = (type: ToastType) => (message: string) =>
  listeners.forEach((l) => l({ id: ++nextId, type, message }));

/** Same imperative API as the web system: `toast.success('Saved')`. */
export const toast = {
  success: emit('success'),
  error: emit('error'),
  info: emit('info'),
  warning: emit('warning'),
};

const TOAST_ACCENT: Record<ToastType, string> = {
  success: color.approved,
  error: color.rejected,
  info: color.marigold,
  warning: color.pending,
};
const TOAST_GLYPH: Record<ToastType, string> = {
  success: '✓',
  error: '✕',
  info: 'i',
  warning: '!',
};

function ToastCard({ item }: { item: ToastMsg }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [anim]);

  return (
    <Animated.View
      style={[
        styles.toast,
        { borderLeftColor: TOAST_ACCENT[item.type] },
        {
          opacity: anim,
          transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
        },
      ]}
    >
      <View style={[styles.toastGlyph, { backgroundColor: TOAST_ACCENT[item.type] }]}>
        <Text variant="micro" weight="bold" tone="onDark">
          {TOAST_GLYPH[item.type]}
        </Text>
      </View>
      <Text variant="small" style={{ flex: 1 }}>
        {item.message}
      </Text>
    </Animated.View>
  );
}

/** Mount once, at the root. Toasts stack above the tab bar. */
export function ToastHost() {
  const [items, setItems] = useState<ToastMsg[]>([]);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    const listener = (t: ToastMsg) => {
      setItems((prev) => [...prev, t]);
      setTimeout(() => setItems((prev) => prev.filter((x) => x.id !== t.id)), 4000);
    };
    listeners.push(listener);
    return () => {
      listeners = listeners.filter((l) => l !== listener);
    };
  }, []);

  if (!items.length) return null;
  return (
    <View pointerEvents="none" style={[styles.toastHost, { bottom: insets.bottom + 72 }]}>
      {items.map((t) => (
        <ToastCard key={t.id} item={t} />
      ))}
    </View>
  );
}

// ─── Inline Alert ─────────────────────────────────────────────────────────────

const ALERT: Record<ToastType, { bg: string; border: string; fg: string }> = {
  info: { bg: '#EFF6FF', border: '#93C5FD', fg: '#1D4ED8' },
  success: { bg: '#D1FAE5', border: '#6EE7B7', fg: '#0E7A5F' },
  warning: { bg: '#FEF9EC', border: '#FDE68A', fg: '#8A6D1F' },
  error: { bg: '#FEE2E2', border: '#FCA5A5', fg: '#A8242C' },
};

export function InlineAlert({
  type,
  title,
  children,
}: {
  type: ToastType;
  title?: string;
  children: ReactNode;
}) {
  const a = ALERT[type];
  return (
    <View style={[styles.alert, { backgroundColor: a.bg, borderColor: a.border }]}>
      {title ? (
        <Text variant="small" weight="semibold" style={{ color: a.fg }}>
          {title}
        </Text>
      ) : null}
      {typeof children === 'string' ? (
        <Text variant="small" style={{ color: a.fg }}>
          {children}
        </Text>
      ) : (
        children
      )}
    </View>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

/** Shimmering placeholder, mirrors the web `.skeleton` keyframe. */
export function Skeleton({
  width,
  height = 16,
  style,
}: {
  width?: number | string;
  height?: number;
  style?: object;
}) {
  const pulse = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 750,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.4,
          duration: 750,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <Animated.View
      style={[
        {
          width: (width ?? '100%') as never,
          height,
          borderRadius: radius.sheet,
          backgroundColor: '#E8EBF0',
          opacity: pulse,
        },
        style,
      ]}
    />
  );
}

export function SkeletonRow() {
  return (
    <View style={styles.skeletonRow}>
      <Skeleton width="45%" height={14} />
      <Skeleton width="25%" height={14} />
    </View>
  );
}

// ─── Empty & denied states ────────────────────────────────────────────────────

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <View style={styles.state}>
      <View style={[styles.stateIcon, { backgroundColor: color.page }]}>
        <Text variant="h3" tone="slate">
          ☐
        </Text>
      </View>
      <Text variant="body" weight="medium" center>
        {title}
      </Text>
      {description ? (
        <Text variant="small" tone="slate" center>
          {description}
        </Text>
      ) : null}
      {action ? <View style={{ marginTop: space.sm }}>{action}</View> : null}
    </View>
  );
}

export function PermissionDenied({ role }: { role?: string }) {
  return (
    <View style={styles.state}>
      <View style={[styles.stateIcon, { backgroundColor: color.rejectedBg }]}>
        <Text variant="h3" tone="rejected">
          ⊘
        </Text>
      </View>
      <Text variant="body" weight="semibold" center>
        Access Denied
      </Text>
      <Text variant="small" tone="slate" center>
        Your role {role ? `(${role}) ` : ''}does not have permission to view this section.
      </Text>
      <Text variant="micro" tone="slate" center>
        Contact your system administrator to request access.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  toastHost: { position: 'absolute', left: space.lg, right: space.lg, gap: space.sm },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: color.surface,
    borderRadius: radius.control,
    borderLeftWidth: 4,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    ...shadow.raised,
  },
  toastGlyph: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alert: {
    borderWidth: 1,
    borderRadius: radius.control,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    gap: 4,
  },
  skeletonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: space.lg,
    paddingVertical: space.md,
    borderBottomWidth: 1,
    borderBottomColor: color.rule,
  },
  state: { paddingVertical: 56, paddingHorizontal: space.lg, alignItems: 'center', gap: 6 },
  stateIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.sm,
  },
});
