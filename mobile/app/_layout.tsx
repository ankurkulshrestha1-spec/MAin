import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { theme } from '../src/theme';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // NAVs publish once a day, so aggressive refetching buys nothing.
      staleTime: 5 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: theme.color.bg },
            headerTintColor: theme.color.text,
            headerTitleStyle: { fontWeight: '700' },
            contentStyle: { backgroundColor: theme.color.bg },
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="fund/[id]" options={{ title: 'Fund' }} />
        </Stack>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
