import { router } from 'expo-router';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { db } from '@/db/client';
import { mealTypes } from '@/db/schema';
import { describeEnergy } from '@/features/nutrition/energy';
import { formatGrams, formatKcal, mealTime } from '@/features/nutrition/format';
import { describeGoal } from '@/features/nutrition/goal';
import { MEAL_LABELS } from '@/features/nutrition/meal';
import { type MealEntry, removeMeal } from '@/features/nutrition/repository';
import { resolvedRate } from '@/features/nutrition/settings';
import { useNutritionDay } from '@/features/nutrition/use-nutrition';
import { useTheme } from '@/hooks/use-theme';
import { formatDayWithWeekday, todayKey } from '@/lib/date';

/**
 * Dzień w kaloriach: budżet, z czego wyszedł, i co się na niego zjadło.
 *
 * Posiłki stoją w grupach, a nie jednym ciągiem: pytanie „ile dziś zostało” pada zwykle przed
 * kolacją, więc trzeba na pierwszy rzut oka widzieć, co już było.
 */
export default function NutritionScreen() {
  const theme = useTheme();
  const today = todayKey();
  const { totals, meals, energy, protein, settings } = useNutritionDay(today);
  const target = energy.target;
  const left = target === null ? null : target - totals.kcal;

  const confirmRemove = (entry: MealEntry) =>
    Alert.alert('Usunąć wpis?', `${entry.title} · ${formatKcal(entry.kcal)}`, [
      { text: 'Anuluj', style: 'cancel' },
      { text: 'Usuń', style: 'destructive', onPress: () => removeMeal(db, entry.id) },
    ]);

  return (
    <ThemedView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.section}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            {formatDayWithWeekday(today).toUpperCase()}
          </ThemedText>
          <ThemedText type="title">
            {target === null ? formatKcal(totals.kcal) : `${formatKcal(totals.kcal)} / ${formatKcal(target)}`}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {describeEnergy(energy, settings.mode)}
          </ThemedText>
          {left !== null && (
            <ThemedText type="smallBold" style={{ color: left >= 0 ? theme.success : theme.accent }}>
              {left >= 0 ? `Zostało ${formatKcal(left)}` : `Ponad budżet o ${formatKcal(-left)}`}
            </ThemedText>
          )}
          {protein !== null && (
            <ThemedText type="small" themeColor="textSecondary">
              {`Białko: ${formatGrams(totals.proteinG)} z ${formatGrams(protein)}`}
            </ThemedText>
          )}
          <ThemedText type="small" themeColor="textSecondary">
            {`Cel: ${describeGoal(settings.mode, resolvedRate(settings))}.`}
          </ThemedText>
        </View>

        {meals.length === 0 ? (
          <ThemedText type="small" themeColor="textSecondary">
            Dziś nic jeszcze nie zapisane.
          </ThemedText>
        ) : (
          mealTypes
            .map((meal) => ({ meal, items: meals.filter((entry) => entry.meal === meal) }))
            .filter((group) => group.items.length > 0)
            .map((group) => (
              <View key={group.meal} style={styles.section}>
                <View style={styles.groupHeader}>
                  <ThemedText type="smallBold" themeColor="textSecondary">
                    {MEAL_LABELS[group.meal].toUpperCase()}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {formatKcal(group.items.reduce((sum, entry) => sum + entry.kcal, 0))}
                  </ThemedText>
                </View>
                {group.items.map((entry) => (
                  <View key={entry.id} style={styles.row}>
                    <ThemedText type="small" themeColor="textSecondary" style={styles.time}>
                      {mealTime(entry.loggedAt)}
                    </ThemedText>
                    <View style={styles.rowText}>
                      <ThemedText type="small">{entry.title}</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {[
                          formatKcal(entry.kcal),
                          entry.proteinG === null ? null : `białko ${formatGrams(entry.proteinG)}`,
                          entry.grams === null ? null : formatGrams(entry.grams),
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </ThemedText>
                    </View>
                    <Pressable
                      accessibilityLabel={`Usuń ${entry.title}`}
                      onPress={() => confirmRemove(entry)}
                      hitSlop={6}>
                      <Icon name="delete" size={20} color={theme.textSecondary} />
                    </Pressable>
                  </View>
                ))}
              </View>
            ))
        )}

        <Button label="Dodaj posiłek" icon="add" onPress={() => router.push('/nutrition/add')} />
        <Button
          label="Cel diety i dane"
          icon="settings"
          variant="secondary"
          onPress={() => router.push('/nutrition/settings')}
        />
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.four, paddingBottom: Spacing.six },
  section: { gap: Spacing.two },
  groupHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
  time: { width: 44 },
  rowText: { flex: 1, gap: Spacing.half },
});
