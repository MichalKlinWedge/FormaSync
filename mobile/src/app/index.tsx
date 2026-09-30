import { router } from 'expo-router';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { db } from '@/db/client';
import { usePlanList } from '@/features/plans/use-plans';
import { elapsedSeconds, formatClock } from '@/features/workout/logic';
import { ensureNotificationPermission } from '@/features/workout/notifications';
import { ActiveSessionExistsError, startSession, type StartSessionOptions } from '@/features/workout/repository';
import { useActiveSessionBanner } from '@/features/workout/use-session';
import { useNow } from '@/hooks/use-now';
import { useTheme } from '@/hooks/use-theme';

export default function TodayScreen() {
  const theme = useTheme();
  const now = useNow(1000);
  const active = useActiveSessionBanner();
  const { own, templates } = usePlanList();

  const begin = (options: StartSessionOptions) => {
    try {
      startSession(db, options);
      void ensureNotificationPermission();
      router.push('/workout/active');
    } catch (e) {
      if (e instanceof ActiveSessionExistsError) {
        Alert.alert('Trening już trwa', 'Najpierw zakończ lub przerwij bieżący trening.');
      } else throw e;
    }
  };

  const quickStart = own.length > 0 ? own : templates;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <ScrollView contentContainerStyle={styles.content}>
          <ThemedText type="subtitle">FormaSync</ThemedText>

          {active ? (
            <Pressable
              onPress={() => router.push('/workout/active')}
              style={({ pressed }) => [styles.banner, { backgroundColor: theme.accent, opacity: pressed ? 0.8 : 1 }]}>
              <View style={styles.bannerText}>
                <ThemedText type="smallBold" style={{ color: theme.onAccent }}>
                  Trening trwa · {active.planTitle ?? 'Trening'}
                </ThemedText>
                <ThemedText type="title" style={[styles.clock, { color: theme.onAccent }]}>
                  {formatClock(elapsedSeconds(active.startTime, now))}
                </ThemedText>
              </View>
              <Icon name="chevron_right" size={26} color={theme.onAccent} />
            </Pressable>
          ) : (
            <View style={styles.section}>
              <ThemedText type="smallBold" themeColor="textSecondary">
                ROZPOCZNIJ TRENING
              </ThemedText>
              {quickStart.slice(0, 5).map((plan) => (
                <Pressable
                  key={plan.id}
                  onPress={() => begin({ kind: 'plan', planId: plan.id })}
                  style={({ pressed }) => [
                    styles.planRow,
                    { backgroundColor: theme.backgroundElement, opacity: pressed ? 0.7 : 1 },
                  ]}>
                  <View style={styles.bannerText}>
                    <ThemedText type="smallBold">{plan.title}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {plan.isTemplate ? 'szablon' : 'mój plan'}
                    </ThemedText>
                  </View>
                  <Icon name="play_arrow" size={24} color={theme.accent} />
                </Pressable>
              ))}
              <Button
                label="Trening bez planu"
                icon="add"
                variant="secondary"
                onPress={() => begin({ kind: 'empty' })}
              />
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.four, paddingBottom: BottomTabInset + Spacing.four },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderRadius: 16,
    padding: Spacing.three,
  },
  bannerText: { flex: 1 },
  clock: { fontSize: 36, lineHeight: 42 },
  section: { gap: Spacing.two },
  planRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderRadius: 14,
    padding: Spacing.three,
  },
});
