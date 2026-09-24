import { useEffect, useState } from 'react';
import { Stack, router, useRootNavigationState, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  IBMPlexSans_400Regular,
  IBMPlexSans_500Medium,
  IBMPlexSans_600SemiBold,
  IBMPlexSans_700Bold,
} from '@expo-google-fonts/ibm-plex-sans';
import { IBMPlexMono_400Regular } from '@expo-google-fonts/ibm-plex-mono';
import { LangProvider } from '@/lib/language';
import { AuthProvider, useAuth } from '@/lib/auth';
import { InstituteProvider, multiInstitute, useInstitute } from '@/lib/institute';
import { ToastHost } from '@/components';
import { color, font } from '@/theme/tokens';

SplashScreen.preventAutoHideAsync().catch(() => {
  // Ignore — the splash may already be hidden on a fast reload.
});

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: (failureCount, error) => {
          // Never retry an auth failure; the interceptor already handled it.
          const status = (error as { status?: number })?.status;
          if (status === 401 || status === 403) return false;
          return failureCount < 2;
        },
      },
    },
  });
}

/** Keeps the route in step with the session. */
function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const { institute } = useInstitute();
  const segments = useSegments();
  const navState = useRootNavigationState();

  useEffect(() => {
    if (loading || !navState?.key) return;

    const first = segments[0] as string | undefined;
    const signInRoutes: Array<string | undefined> = ['login', 'onboarding', 'institute', 'forgot-password', undefined];

    // Many institutes, none chosen yet: that comes before anything else.
    if (multiInstitute && !institute) {
      if (first !== 'institute') router.replace('/institute');
      return;
    }
    if (!user) {
      if (!signInRoutes.includes(first)) router.replace('/login');
      return;
    }
    // A password the IT Cell issued is replaced before the app opens.
    if (user.mustChangePassword) {
      if (first !== 'change-password') router.replace('/change-password');
      return;
    }
    if (signInRoutes.includes(first) || first === 'change-password') router.replace('/(tabs)');
  }, [user, loading, institute, segments, navState?.key]);

  return <>{children}</>;
}

/** Holds everything session-related back until the institute is known. */
function InstituteReady({ children }: { children: React.ReactNode }) {
  const { ready } = useInstitute();
  return ready ? <>{children}</> : null;
}

export default function RootLayout() {
  const [queryClient] = useState(makeQueryClient);

  // Keys must match the family names in theme/tokens.ts.
  const [fontsReady, fontError] = useFonts({
    [font.sans]: IBMPlexSans_400Regular,
    [font.sansMedium]: IBMPlexSans_500Medium,
    [font.sansSemiBold]: IBMPlexSans_600SemiBold,
    [font.sansBold]: IBMPlexSans_700Bold,
    [font.mono]: IBMPlexMono_400Regular,
  });

  useEffect(() => {
    // Render anyway if a font fails: system fallback beats a stuck splash.
    if (fontsReady || fontError) SplashScreen.hideAsync().catch(() => {});
  }, [fontsReady, fontError]);

  if (!fontsReady && !fontError) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <LangProvider>
          <InstituteProvider>
          <InstituteReady>
          <AuthProvider>
            <AuthGate>
              <StatusBar style="light" />
              <Stack
                screenOptions={{
                  headerShown: false,
                  contentStyle: { backgroundColor: color.page },
                  animation: 'slide_from_right',
                }}
              >
                <Stack.Screen name="index" options={{ animation: 'fade' }} />
                <Stack.Screen name="onboarding" options={{ animation: 'fade' }} />
                <Stack.Screen name="login" options={{ animation: 'fade' }} />
                <Stack.Screen name="institute" options={{ animation: 'fade' }} />
                <Stack.Screen name="forgot-password" />
                <Stack.Screen name="change-password" options={{ animation: 'fade' }} />
                <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
              </Stack>
              <ToastHost />
            </AuthGate>
          </AuthProvider>
          </InstituteReady>
          </InstituteProvider>
        </LangProvider>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
