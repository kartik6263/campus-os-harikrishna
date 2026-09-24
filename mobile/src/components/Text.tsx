import { Text as RNText, type TextProps as RNTextProps, StyleSheet } from 'react-native';
import { color, font, type } from '@/theme/tokens';

type Variant = keyof typeof type;
type Weight = 'regular' | 'medium' | 'semibold' | 'bold';

export interface TextProps extends RNTextProps {
  variant?: Variant;
  weight?: Weight;
  tone?: 'ink' | 'slate' | 'muted' | 'marigold' | 'approved' | 'rejected' | 'pending' | 'onDark';
  mono?: boolean;
  center?: boolean;
  uppercase?: boolean;
}

const WEIGHT: Record<Weight, { fontFamily: string; fontWeight: '400' | '500' | '600' | '700' }> = {
  regular: { fontFamily: font.sans, fontWeight: '400' },
  medium: { fontFamily: font.sansMedium, fontWeight: '500' },
  semibold: { fontFamily: font.sansSemiBold, fontWeight: '600' },
  bold: { fontFamily: font.sansBold, fontWeight: '700' },
};

const TONE = {
  ink: color.ink,
  slate: color.slate,
  muted: color.muted,
  marigold: color.marigold,
  approved: color.approved,
  rejected: color.rejected,
  pending: color.pending,
  onDark: '#FFFFFF',
} as const;

/** The only text primitive in the app — keeps the type ramp and colour roles honest. */
export function Text({
  variant = 'body',
  weight = 'regular',
  tone = 'ink',
  mono,
  center,
  uppercase,
  style,
  ...props
}: TextProps) {
  return (
    <RNText
      style={[
        type[variant],
        WEIGHT[weight],
        mono && { fontFamily: font.mono },
        { color: TONE[tone] },
        center && styles.center,
        uppercase && styles.uppercase,
        style,
      ]}
      {...props}
    />
  );
}

const styles = StyleSheet.create({
  center: { textAlign: 'center' },
  uppercase: { textTransform: 'uppercase', letterSpacing: 0.6 },
});
