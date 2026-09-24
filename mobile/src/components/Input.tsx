import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { color, font, radius, type } from '@/theme/tokens';
import { Text } from './Text';
import { useLang } from '@/lib/language';

export interface InputProps extends TextInputProps {
  label?: string;
  labelHi?: string;
  error?: string;
  hint?: string;
  prefix?: ReactNode;
  suffix?: ReactNode;
}

export function Input({ label, labelHi, error, hint, prefix, suffix, style, ...props }: InputProps) {
  const { lang } = useLang();
  const [focused, setFocused] = useState(false);
  const displayLabel = lang === 'hi' && labelHi ? labelHi : label;

  const borderColor = error ? color.rejected : focused ? color.marigold : color.rule;

  return (
    <View style={styles.field}>
      {displayLabel ? (
        <Text variant="small" weight="medium">
          {displayLabel}
        </Text>
      ) : null}
      <View style={[styles.shell, { borderColor }]}>
        {prefix ? <View style={styles.affix}>{prefix}</View> : null}
        <TextInput
          style={[styles.input, style]}
          placeholderTextColor={color.slate}
          onFocus={(e) => {
            setFocused(true);
            props.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            props.onBlur?.(e);
          }}
          {...props}
        />
        {suffix ? <View style={styles.affix}>{suffix}</View> : null}
      </View>
      {error ? (
        <Text variant="micro" tone="rejected">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="micro" tone="slate">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

export interface SelectOption {
  value: string;
  label: string;
}

/**
 * Native-friendly stand-in for the web `<Select>` — renders the options as a
 * wrapped set of chips rather than a dropdown, which avoids a modal picker for
 * the short option lists this app uses.
 */
export function Select({
  label,
  value,
  options,
  onChange,
  error,
}: {
  label?: string;
  value: string;
  options: SelectOption[];
  onChange: (v: string) => void;
  error?: string;
}) {
  return (
    <View style={styles.field}>
      {label ? (
        <Text variant="small" weight="medium">
          {label}
        </Text>
      ) : null}
      <View style={styles.chips}>
        {options.map((opt) => {
          const active = opt.value === value;
          return (
            <Pressable
              key={opt.value}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              onPress={() => onChange(opt.value)}
              style={[styles.chip, active && styles.chipOn]}
            >
              <Text variant="small" weight={active ? 'semibold' : 'regular'} tone={active ? 'onDark' : 'slate'}>
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {error ? (
        <Text variant="micro" tone="rejected">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: 6 },
  shell: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.control,
    backgroundColor: color.surface,
  },
  input: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: type.body.fontSize,
    fontFamily: font.sans,
    color: color.ink,
  },
  affix: { paddingHorizontal: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: color.rule,
    backgroundColor: color.surface,
  },
  chipOn: { backgroundColor: color.ink, borderColor: color.ink },
});
