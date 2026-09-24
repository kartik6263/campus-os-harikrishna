import { useEffect, useRef } from 'react';
import { Animated, Easing, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { color } from '@/theme/tokens';
import { Text } from './Text';

/** Matches the web `.animate-spin` arc spinner (0.8s linear, 50/14 dash). */
export function Spinner({ size = 16, tint = color.ink }: { size?: number; tint?: string }) {
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 800,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [spin]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <Animated.View style={{ width: size, height: size, transform: [{ rotate }] }}>
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Circle
          cx="12"
          cy="12"
          r="10"
          stroke={tint}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray="50 14"
          fill="none"
        />
      </Svg>
    </Animated.View>
  );
}

/** Full-width loading block for screen-level waits. */
export function LoadingBlock({ label }: { label?: string }) {
  return (
    <View style={{ paddingVertical: 48, alignItems: 'center', gap: 12 }}>
      <Spinner size={22} tint={color.marigold} />
      {label ? (
        <Text variant="small" tone="slate">
          {label}
        </Text>
      ) : null}
    </View>
  );
}
