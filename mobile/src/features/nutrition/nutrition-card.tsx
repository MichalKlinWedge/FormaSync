import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { todayKey } from '@/lib/date';

import { budgetBar } from './bar';
import { describeEnergy } from './energy';
import { formatGrams, formatKcal, kcalHeadline } from './format';
import { useNutritionDay } from './use-nutrition';

/**
 * Kafelek kalorii na „Dziś”. Stoi obok nawodnienia i poza przełącznikiem sportu, bo je się
 * każdego dnia — także takiego bez treningu.
 *
 * Dopóki brakuje danych do wzoru, kafelek nie udaje budżetu: pokazuje zjedzone i mówi wprost,
 * czego potrzebuje.
 */
export function NutritionCard() {
  const theme = useTheme();
  const today = todayKey();
  const { totals, energy, protein, settings } = useNutritionDay(today);
  const target = energy.target;
  const left = target === null ? null : target - totals.kcal;
  const bar = target === null ? null : budgetBar(totals.kcal, target, energy.dayTarget);

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            KALORIE
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {describeEnergy(energy, settings.mode)}
          </ThemedText>
        </View>
        <ThemedText type="smallBold">{kcalHeadline(totals.kcal, target, energy.dayTarget)}</ThemedText>
      </View>

      {bar !== null && (
        <>
          <View style={[styles.track, { backgroundColor: theme.backgroundSelected }]}>
            {energy.planned > 0 && (
              <View
                style={[
                  styles.planned,
                  { left: `${bar.earned * 100}%`, backgroundColor: theme.chart2 },
                ]}
              />
            )}
            <View
              style={[
                styles.fill,
                {
                  backgroundColor: bar.over ? theme.accent : theme.chart1,
                  width: `${bar.ratio * 100}%`,
                },
              ]}
            />
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            {[
              (left as number) >= 0
                ? `Zostało ${formatKcal(left as number)}`
                : `Ponad budżet o ${formatKcal(-(left as number))}`,
              protein === null
                ? null
                : `białko ${formatGrams(totals.proteinG)} z ${formatGrams(protein)}`,
            ]
              .filter(Boolean)
              .join(' · ')}
          </ThemedText>
        </>
      )}

      <View style={styles.row}>
        <View style={styles.cell}>
          <Button label="Dodaj posiłek" icon="add" onPress={() => router.push('/nutrition/add')} />
        </View>
        <View style={styles.cell}>
          <Button
            label="Szczegóły"
            icon="chevron_right"
            variant="secondary"
            onPress={() => router.push('/nutrition')}
          />
        </View>
      </View>

      {target === null && (
        <Button
          label="Ustaw cel diety"
          icon="flag"
          variant="secondary"
          onPress={() => router.push('/nutrition/settings')}
        />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, padding: Spacing.three, gap: Spacing.two },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
  headerText: { flex: 1, gap: Spacing.half },
  track: { height: 12, borderRadius: 6, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 6 },
  planned: { position: 'absolute', top: 0, bottom: 0, right: 0 },
  row: { flexDirection: 'row', gap: Spacing.two },
  cell: { flex: 1 },
});
