import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useColorScheme } from 'react-native';

import { Colors } from '@/constants/theme';

// Android: maksymalnie 5 zakładek (ograniczenie Material Tabs).
const tabs = [
  { name: 'index', label: 'Dziś', icon: 'today' },
  { name: 'exercises', label: 'Ćwiczenia', icon: 'fitness_center' },
  { name: 'plans', label: 'Plany', icon: 'list_alt' },
  { name: 'calendar', label: 'Kalendarz', icon: 'calendar_month' },
  { name: 'history', label: 'Historia', icon: 'history' },
] as const;

export default function AppTabs() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'unspecified' ? 'light' : scheme];

  return (
    <NativeTabs
      backgroundColor={colors.background}
      indicatorColor={colors.backgroundElement}
      labelStyle={{ selected: { color: colors.text } }}>
      {tabs.map((tab) => (
        <NativeTabs.Trigger key={tab.name} name={tab.name}>
          <NativeTabs.Trigger.Label>{tab.label}</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon md={tab.icon} />
        </NativeTabs.Trigger>
      ))}
    </NativeTabs>
  );
}
