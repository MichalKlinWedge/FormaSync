import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { formatDistance } from '@/features/endurance/format';
import { useGoals, weeksLeft } from '@/features/goals/use-goals';
import { SPORT_LABELS } from '@/features/sports/sport';
import { useTheme } from '@/hooks/use-theme';
import { formatDate } from '@/lib/date';
import { pluralWith } from '@/lib/number';

export default function GoalsScreen() {
  const theme = useTheme();
  const { active, past } = useGoals();

  return (
    <ThemedView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedText type="small" themeColor="textSecondary">
          Cel to zawody z datą i dystansem. Plan pod niego liczymy z Twojej historii — aplikacja wie,
          ile biegasz w tygodniu i jak szybko — a gotowy harmonogram wpisujemy do kalendarza.
        </ThemedText>

        <Button label="Nowy cel" icon="add" onPress={() => router.push('/goal/new')} />

        {active.length === 0 && (
          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="small" themeColor="textSecondary">
              Nie ma jeszcze żadnego celu. Dodaj zawody, a ułożę plan tydzień po tygodniu.
            </ThemedText>
          </ThemedView>
        )}

        {active.map((goal) => {
          const left = weeksLeft(goal);
          return (
            <Pressable
              key={goal.id}
              onPress={() => router.push({ pathname: '/goal/[id]', params: { id: goal.id } })}>
              <ThemedView type="backgroundElement" style={styles.card}>
                <View style={styles.row}>
                  <View style={styles.rowText}>
                    <ThemedText type="smallBold">{goal.title}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {[
                        SPORT_LABELS[goal.sport],
                        formatDistance(goal.distanceMeters),
                        formatDate(goal.eventDate),
                      ].join(' · ')}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {left === 0
                        ? 'Termin już minął.'
                        : `Zostało ${pluralWith(left, 'tydzień', 'tygodnie', 'tygodni')}.`}
                      {goal.plannedBy === null ? ' Plan jeszcze nieułożony.' : ''}
                    </ThemedText>
                  </View>
                  <Icon name="chevron_right" size={26} color={theme.textSecondary} />
                </View>
              </ThemedView>
            </Pressable>
          );
        })}

        {past.length > 0 && (
          <View style={styles.group}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              ZAMKNIĘTE
            </ThemedText>
            {past.map((goal) => (
              <Pressable
                key={goal.id}
                onPress={() => router.push({ pathname: '/goal/[id]', params: { id: goal.id } })}>
                <ThemedView type="backgroundElement" style={styles.card}>
                  <ThemedText type="small">{goal.title}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {formatDate(goal.eventDate)} · {goal.status === 'DONE' ? 'dowieziony' : 'porzucony'}
                  </ThemedText>
                </ThemedView>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.three, paddingBottom: Spacing.six },
  card: { borderRadius: 16, padding: Spacing.three, gap: Spacing.half },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  rowText: { flex: 1, gap: Spacing.half },
  group: { gap: Spacing.two },
});
