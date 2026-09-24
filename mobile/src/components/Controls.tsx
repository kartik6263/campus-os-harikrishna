import { useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type NativeSyntheticEvent,
  type TextInputKeyPressEventData,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path, Polygon } from 'react-native-svg';
import { color, font, radius, scrim, shadow, space } from '@/theme/tokens';
import { Text } from './Text';

// ─── Sheet (replaces web Modal + Drawer) ──────────────────────────────────────

/**
 * Bottom sheet. The web system has a centre Modal and a right Drawer; on a
 * phone both collapse to the same affordance, so this is the single surface.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + space.lg }]}>
        <View style={styles.grabber} />
        <View style={styles.sheetHead}>
          <Text variant="h3" weight="semibold" style={{ flex: 1 }}>
            {title}
          </Text>
          <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Close">
            <Text variant="h3" tone="slate">
              ✕
            </Text>
          </Pressable>
        </View>
        <View style={styles.sheetBody}>{children}</View>
        {footer ? <View style={styles.sheetFoot}>{footer}</View> : null}
      </View>
    </Modal>
  );
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

export function Avatar({ name, size = 32, src }: { name: string; size?: number; src?: string }) {
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  // Same deterministic hue as the web Avatar so a person looks identical on both.
  const hue = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 360;

  if (src) {
    return <Image source={{ uri: src }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  }
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: `hsl(${hue}, 45%, 40%)`,
      }}
    >
      <Text weight="medium" tone="onDark" style={{ fontSize: size * 0.38, lineHeight: size * 0.46 }}>
        {initials}
      </Text>
    </View>
  );
}

// ─── Checkbox ─────────────────────────────────────────────────────────────────

export function Checkbox({
  label,
  checked,
  onChange,
  disabled,
}: {
  label?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled: !!disabled }}
      onPress={disabled ? undefined : () => onChange(!checked)}
      style={[styles.checkRow, disabled && { opacity: 0.5 }]}
      hitSlop={6}
    >
      <View style={[styles.checkBox, checked && styles.checkBoxOn]}>
        {checked ? (
          <Text variant="micro" weight="bold" tone="onDark">
            ✓
          </Text>
        ) : null}
      </View>
      {label ? <Text variant="small">{label}</Text> : null}
    </Pressable>
  );
}

// ─── Toggle ───────────────────────────────────────────────────────────────────

export function Toggle({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
      onPress={() => onChange(!on)}
      style={styles.toggleRow}
      hitSlop={6}
    >
      {label ? (
        <Text variant="small" style={{ flex: 1 }}>
          {label}
        </Text>
      ) : null}
      <View style={[styles.track, on && { backgroundColor: color.marigold }]}>
        <View style={[styles.knob, on && { transform: [{ translateX: 18 }] }]} />
      </View>
    </Pressable>
  );
}

// ─── OTP input ────────────────────────────────────────────────────────────────

export function OtpInput({
  value,
  onChange,
  length = 6,
}: {
  value: string;
  onChange: (v: string) => void;
  length?: number;
}) {
  const refs = useRef<Array<TextInput | null>>([]);
  const chars = value.split('').concat(Array(length).fill('')).slice(0, length);

  function handleChange(i: number, v: string) {
    const digit = v.replace(/\D/g, '').slice(-1);
    const next = [...chars];
    next[i] = digit;
    onChange(next.join('').trimEnd());
    if (digit && i < length - 1) refs.current[i + 1]?.focus();
  }

  function handleKeyPress(i: number, e: NativeSyntheticEvent<TextInputKeyPressEventData>) {
    if (e.nativeEvent.key === 'Backspace' && !chars[i] && i > 0) refs.current[i - 1]?.focus();
  }

  return (
    <View style={styles.otpRow}>
      {chars.map((ch, i) => (
        <TextInput
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          value={ch}
          onChangeText={(v) => handleChange(i, v)}
          onKeyPress={(e) => handleKeyPress(i, e)}
          keyboardType="number-pad"
          maxLength={1}
          style={styles.otpCell}
          selectTextOnFocus
        />
      ))}
    </View>
  );
}

// ─── Verified seal ────────────────────────────────────────────────────────────

/** The marigold starburst seal used on certificates and the digital ID. */
export function VerifiedSeal({ size = 64 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Polygon
        points="32,2 40,10 50,8 54,18 64,22 62,32 64,42 54,46 50,56 40,54 32,62 24,54 14,56 10,46 0,42 2,32 0,22 10,18 14,8 24,10"
        fill={color.marigold}
      />
      <Polygon
        points="32,8 38.5,15 47,13 50.5,21.5 59,25 57,32 59,39 50.5,42.5 47,51 38.5,49 32,56 25.5,49 17,51 13.5,42.5 5,39 7,32 5,25 13.5,21.5 17,13 25.5,15"
        fill={color.marigoldHover}
        opacity={0.3}
      />
      <Path
        d="M20 32l8 8 16-16"
        stroke="#FFFFFF"
        strokeWidth={3.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

// ─── Progress ─────────────────────────────────────────────────────────────────

/** Horizontal meter. `tone` follows the status palette rather than a raw colour. */
export function ProgressBar({
  value,
  max = 100,
  tone = 'marigold',
  height = 8,
}: {
  value: number;
  max?: number;
  tone?: 'marigold' | 'approved' | 'rejected' | 'pending';
  height?: number;
}) {
  const pct = Math.max(0, Math.min(1, max === 0 ? 0 : value / max));
  const fill = {
    marigold: color.marigold,
    approved: color.approved,
    rejected: color.rejected,
    pending: color.pending,
  }[tone];

  return (
    <View style={[styles.progressTrack, { height, borderRadius: height / 2 }]}>
      <View
        style={{
          width: `${pct * 100}%`,
          height: '100%',
          borderRadius: height / 2,
          backgroundColor: fill,
        }}
      />
    </View>
  );
}

/** Circular percentage ring, used for attendance. */
export function ProgressRing({
  value,
  size = 72,
  stroke = 7,
  tone,
}: {
  value: number;
  size?: number;
  stroke?: number;
  tone?: string;
}) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value));
  const tint = tone ?? (pct >= 75 ? color.approved : pct >= 60 ? color.marigold : color.rejected);

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={color.rule} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={tint}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${(circ * pct) / 100} ${circ}`}
          fill="none"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <Text weight="semibold" style={{ fontSize: size * 0.24, color: tint }}>
        {pct.toFixed(0)}%
      </Text>
    </View>
  );
}


// ─── Pressable card ───────────────────────────────────────────────────────────

/** Tile used on the dashboard grid. */
export function TileButton({
  label,
  glyph,
  onPress,
  badge,
}: {
  label: string;
  glyph: string;
  onPress?: () => void;
  badge?: string;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const spring = (to: number) =>
    Animated.spring(scale, { toValue: to, useNativeDriver: true, speed: 40, bounciness: 4 }).start();

  return (
    <Animated.View style={{ transform: [{ scale }], flexBasis: '31%', flexGrow: 1 }}>
      <Pressable
        onPress={onPress}
        onPressIn={() => spring(0.96)}
        onPressOut={() => spring(1)}
        style={styles.tile}
      >
        <View style={styles.tileGlyph}>
          <Text variant="h3">{glyph}</Text>
        </View>
        <Text variant="micro" weight="medium" center numberOfLines={2}>
          {label}
        </Text>
        {badge ? (
          <View style={styles.tileBadge}>
            <Text variant="micro" weight="bold" tone="onDark" style={{ fontSize: 9 }}>
              {badge}
            </Text>
          </View>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: scrim },
  sheet: {
    backgroundColor: color.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    maxHeight: '86%',
    ...shadow.raised,
  },
  grabber: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: color.rule,
    alignSelf: 'center',
    marginBottom: space.md,
  },
  sheetHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingBottom: space.md,
    borderBottomWidth: 1,
    borderBottomColor: color.rule,
  },
  sheetBody: { paddingVertical: space.lg, gap: space.md },
  sheetFoot: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: space.md,
    paddingTop: space.md,
    borderTopWidth: 1,
    borderTopColor: color.rule,
  },

  checkRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  checkBox: {
    width: 20,
    height: 20,
    borderRadius: radius.sheet,
    borderWidth: 1.5,
    borderColor: color.rule,
    backgroundColor: color.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkBoxOn: { backgroundColor: color.marigold, borderColor: color.marigold },

  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  track: {
    width: 40,
    height: 22,
    borderRadius: 11,
    backgroundColor: color.rule,
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  knob: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#FFFFFF',
    ...shadow.card,
  },

  otpRow: { flexDirection: 'row', gap: space.sm },
  otpCell: {
    width: 44,
    height: 52,
    borderWidth: 1,
    borderColor: color.rule,
    borderRadius: radius.control,
    backgroundColor: color.surface,
    textAlign: 'center',
    fontSize: 20,
    fontFamily: font.mono,
    color: color.ink,
  },

  progressTrack: { backgroundColor: color.rule, overflow: 'hidden', width: '100%' },

  tile: {
    backgroundColor: color.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: color.rule,
    paddingVertical: space.md,
    paddingHorizontal: space.sm,
    alignItems: 'center',
    gap: space.sm,
    minHeight: 86,
    justifyContent: 'center',
  },
  tileGlyph: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: color.page,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    backgroundColor: color.rejected,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
