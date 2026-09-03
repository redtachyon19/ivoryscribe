import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { SessionProvider } from '@/lib/session';
import { initApiConfig } from '@/lib/config';
import { colors } from '@/lib/theme';

// Point @shared/api at the backend once, at module load, before any screen runs.
initApiConfig();

export default function RootLayout() {
  return (
    <SessionProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.text,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="auth" options={{ headerShown: false }} />
        <Stack.Screen name="library" options={{ title: 'Your Library' }} />
        <Stack.Screen name="editor/[id]" options={{ title: 'Editor' }} />
      </Stack>
    </SessionProvider>
  );
}
