import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Text, Spinner } from '@/components';
import { useAuth } from '@/lib/auth';
import { useInstitution } from '@/lib/institution';
import { color, space } from '@/theme/tokens';

/**
 * Splash. Holds the navy brand field while the stored session is checked,
 * then hands off: signed in goes to the app, otherwise to onboarding.
 */
export default function Splash() {
  const { user, loading } = useAuth();
  const inst = useInstitution();
  const fade = useRef(new Animated.Value(0)).current;
  const rise = useRef(new Animated.Value(12)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 420, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(rise, { toValue: 0, duration: 420, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start();
  }, [fade, rise]);

  useEffect(() => {
    if (loading) return;
    // Hold the brand field briefly even when the session resolves instantly,
    // so the app does not flash past the splash.
    const t = setTimeout(() => {
      router.replace(user ? '/(tabs)' : '/onboarding');
    }, 900);
    return () => clearTimeout(t);
  }, [loading, user]);

  return (
    <View style={styles.root}>
      <Animated.View style={{ opacity: fade, transform: [{ translateY: rise }], alignItems: 'center', gap: space.md }}>
        <View style={styles.mark}>
          <Text variant="h1" weight="bold" tone="onDark">
            {inst.shortCode}
          </Text>
        </View>
        <Text variant="h2" weight="semibold" tone="onDark">
          Resolion Campus OS
        </Text>
        <Text variant="small" tone="muted" center>
          {inst.placeLine('en')}
        </Text>
      </Animated.View>

      <View style={styles.foot}>
        <Spinner size={18} tint={color.marigold} />
        <Text variant="micro" tone="muted">
          Government of the State · Higher Education
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: color.ink,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space['2xl'],
  },
  mark: {
    width: 72,
    height: 72,
    borderRadius: 16,
    backgroundColor: color.marigold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  foot: { position: 'absolute', bottom: 56, alignItems: 'center', gap: space.md },
});
