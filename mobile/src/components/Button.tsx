import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import { color, radius } from '@/theme/tokens';
import { Spinner } from './Spinner';
import { Text } from './Text';
import type { ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps {
  title: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  disabled?: boolean;
  full?: boolean;
  icon?: ReactNode;
  style?: ViewStyle;
}

const VARIANT: Record<ButtonVariant, { bg: string; pressed: string; fg: string; border?: string }> = {
  primary: { bg: color.marigold, pressed: color.marigoldActive, fg: '#FFFFFF' },
  secondary: { bg: color.surface, pressed: color.pressed, fg: color.ink, border: color.rule },
  ghost: { bg: 'transparent', pressed: color.pressed, fg: color.ink },
  destructive: { bg: color.rejected, pressed: '#6E1720', fg: '#FFFFFF' },
};

// Touch targets are taller than the web control heights (28/36/44) so they
// clear the 44pt minimum on a phone.
const SIZE: Record<ButtonSize, { height: number; padH: number; fontSize: number }> = {
  sm: { height: 36, padH: 12, fontSize: 13 },
  md: { height: 44, padH: 16, fontSize: 15 },
  lg: { height: 52, padH: 20, fontSize: 15 },
};

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  loading,
  disabled,
  full,
  icon,
  style,
}: ButtonProps) {
  const v = VARIANT[variant];
  const s = SIZE[size];
  const isOff = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!isOff, busy: !!loading }}
      onPress={isOff ? undefined : onPress}
      style={({ pressed }) => [
        styles.base,
        {
          height: s.height,
          paddingHorizontal: s.padH,
          backgroundColor: pressed && !isOff ? v.pressed : v.bg,
          borderWidth: v.border ? 1 : 0,
          borderColor: v.border,
          opacity: isOff ? 0.5 : 1,
          alignSelf: full ? 'stretch' : 'flex-start',
        },
        style,
      ]}
    >
      {loading ? <Spinner size={14} tint={v.fg} /> : icon}
      <Text weight="medium" style={{ color: v.fg, fontSize: s.fontSize }}>
        {title}
      </Text>
    </Pressable>
  );
}

/** Row of buttons with the system's standard 12pt gap. */
export function ButtonRow({ children }: { children: ReactNode }) {
  return <View style={styles.row}>{children}</View>;
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: radius.control,
  },
  row: { flexDirection: 'row', gap: 12, alignItems: 'center' },
});
