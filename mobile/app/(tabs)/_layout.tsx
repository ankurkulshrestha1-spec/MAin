import React from 'react';
import { Text } from 'react-native';
import { Tabs } from 'expo-router';
import { theme } from '../../src/theme';

/**
 * Emoji tab glyphs keep the app dependency-free — no icon font to install or
 * keep in sync with the Expo SDK version.
 */
function TabIcon({ glyph, color }: { glyph: string; color: string }) {
  return <Text style={{ fontSize: 20, color, opacity: color === theme.color.accent ? 1 : 0.55 }}>{glyph}</Text>;
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: theme.color.bg },
        headerTintColor: theme.color.text,
        headerTitleStyle: { fontWeight: '700' },
        tabBarStyle: {
          backgroundColor: theme.color.surface,
          borderTopColor: theme.color.border,
        },
        tabBarActiveTintColor: theme.color.accent,
        tabBarInactiveTintColor: theme.color.textMuted,
        sceneStyle: { backgroundColor: theme.color.bg },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'My Funds',
          tabBarIcon: ({ color }) => <TabIcon glyph="📊" color={color} />,
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: 'All Funds',
          tabBarIcon: ({ color }) => <TabIcon glyph="🔍" color={color} />,
        }}
      />
      <Tabs.Screen
        name="compare"
        options={{
          title: 'Compare',
          tabBarIcon: ({ color }) => <TabIcon glyph="⚖️" color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color }) => <TabIcon glyph="⚙️" color={color} />,
        }}
      />
    </Tabs>
  );
}
