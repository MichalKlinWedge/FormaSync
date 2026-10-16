import { router } from 'expo-router';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { db } from '@/db/client';
import { useScheduledRange } from '@/features/calendar/use-calendar';
import { HydrationCard } from '@/features/hydration/hydration-card';
import { NutritionCard } from '@/features/nutrition/nutrition-card';
import { useActiveSport } from '@/features/sports/sport-store';
import { UpdateBadge } from '@/features/updates/update-badge';
import { elapsedSeconds, formatClock } from '@/features/workout/logic';
import { ensureNotificationPermission } from '@/features/workout/notifications';
import { ActiveSessionExistsError, startSession, type StartSessionOptions } from '@/features/workout/repository';
import { useActiveSessionBanner } from '@/features/workout/use-session';
import { useNow } from '@/hooks/use-now';
import { useTheme } from '@/hooks/use-theme';
import { formatDayWithWeekday, todayKey } from '@/lib/date';

export default function TodayScreen() {
  const theme = useTheme();
  const now = useNow(1000);
  const today = todayKey();
  const active = useActiveSessionBanner();
  // Dyscyplina dotyczy już tylko treningu bez planu; wybór z tego ekranu zniknął, bo nie
  // zmieniał na nim niczego poza listą, której też tu nie ma.
  const sport = useActiveSport();
  const todayEntries = useScheduledRange(today, today).filter((entry) => !entry.isCompleted);

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

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.header}>
            <View style={styles.rowText}>
              <ThemedText type="subtitle">FormaSync</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {formatDayWithWeekday(today)}
              </ThemedText>
            </View>
            <UpdateBadge />
            <Pressable
              accessibilityLabel="Ustawienia"
              onPress={() => router.push('/settings')}
              hitSlop={8}>
              <Icon name="settings" size={26} color={theme.textSecondary} />
            </Pressable>
          </View>

          <HydrationCard />

          <NutritionCard />

          {active ? (
            <Pressable
              onPress={() => router.push('/workout/active')}
              style={({ pressed }) => [styles.banner, { backgroundColor: theme.accent, opacity: pressed ? 0.8 : 1 }]}>
              <View style={styles.rowText}>
                <ThemedText type="smallBold" style={{ color: theme.onAccent }}>
                  Trening trwa · {active.title ?? active.planTitle ?? 'Trening'}
                </ThemedText>
                <ThemedText type="title" style={[styles.clock, { color: theme.onAccent }]}>
                  {formatClock(elapsedSeconds(active.startTime, now))}
                </ThemedText>
              </View>
              <Icon name="chevron_right" size={26} color={theme.onAccent} />
            </Pressable>
          ) : (
            <>
              {/* Tylko to, co stoi na dziś w kalendarzu. Lista planów „na wszelki wypadek” mówiła
                  o wszystkich dyscyplinach naraz i spychała dzisiejszy trening poza ekran. */}
              <View style={styles.section}>
                <ThemedText type="smallBold" themeColor="textSecondary">
                  W PLANIE NA DZIŚ
                </ThemedText>
                {todayEntries.length === 0 ? (
                  <ThemedText type="small" themeColor="textSecondary">
                    Nic nie zaplanowane. Termin dołożysz w kalendarzu, a trening bez planu
                    zaczniesz przyciskiem niżej.
                  </ThemedText>
                ) : (
                  todayEntries.map((entry) => (
                    <Pressable
                      key={entry.id}
                      onPress={() => begin({ kind: 'scheduled', scheduledId: entry.id })}
                      style={({ pressed }) => [
                        styles.row,
                        { backgroundColor: theme.backgroundSelected, opacity: pressed ? 0.7 : 1 },
                      ]}>
                      <View style={styles.rowText}>
                        <ThemedText type="smallBold">{entry.planTitle}</ThemedText>
                        <ThemedText type="small" themeColor="textSecondary">
                          {entry.scheduledTime ?? 'cały dzień'}
                        </ThemedText>
                      </View>
                      <Icon name="play_arrow" size={24} color={theme.accent} />
                    </Pressable>
                  ))
                )}
                <Button
                  label="Trening bez planu"
                  icon="add"
                  variant="secondary"
                  onPress={() => begin({ kind: 'empty', sport })}
                />
              </View>
            </>
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
  clock: { fontSize: 36, lineHeight: 42 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.three },
  section: { gap: Spacing.two },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderRadius: 14,
    padding: Spacing.three,
  },
  rowText: { flex: 1 },
});
