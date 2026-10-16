import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { LineChart } from '@/components/charts/line-chart';
import { Chip } from '@/components/chip';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { formatMl } from '@/features/hydration/format';
import { describeHydration, summarizeHydration } from '@/features/hydration/stats';
import { useHydrationHistory } from '@/features/hydration/use-hydration';
import { describeBalance, describeDays, summarize } from '@/features/nutrition/stats';
import { useNutritionStats } from '@/features/nutrition/use-nutrition-stats';
import { useTheme } from '@/hooks/use-theme';
import { todayKey } from '@/lib/date';
import { formatNumber, pluralWith } from '@/lib/number';

/** Okna, w których pyta się o te rzeczy: tydzień, dwa, miesiąc, kwartał. */
const PERIODS = [7, 14, 30, 90];

/** „28.09” — oś czasu potrzebuje dwóch znaków, nie nazwy miesiąca. */
const shortDay = (key: string): string => `${key.slice(8, 10)}.${key.slice(5, 7)}`;

/**
 * Picie i jedzenie w czasie, zestawione z celem każdego dnia.
 *
 * Kafelki na „Dziś” mówią o dzisiaj, a jeden dzień nie odpowiada na pytanie, czy to się trzyma
 * kupy przez miesiąc. Cel liczymy osobno dla każdej doby — dzień z długim biegiem miał wyższy
 * i tak jest tu pokazany, bo inaczej nadrobiony wyglądałby na przekroczony.
 *
 * Dni bez wpisu są przerwą w linii, nie zerem: nikt wtedy niczego nie zapisał, a to nie znaczy,
 * że nic nie pił ani nie jadł.
 */
export default function DailyStatsScreen() {
  const theme = useTheme();
  const today = todayKey();
  const [days, setDays] = useState(30);

  const hydration = useHydrationHistory(today, days);
  const nutrition = useNutritionStats(today, days);

  const water = summarizeHydration(hydration.days);
  const food = summarize(nutrition.days);

  return (
    <ThemedView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.chips}>
          {PERIODS.map((period) => (
            <Chip
              key={period}
              label={pluralWith(period, 'dzień', 'dni', 'dni')}
              selected={period === days}
              onPress={() => setDays(period)}
            />
          ))}
        </View>

        <View style={styles.section}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            WYPITE I CEL
          </ThemedText>
          <LineChart
            labels={hydration.days.map((day) => shortDay(day.dayKey))}
            series={[
              {
                name: 'Wypite',
                color: theme.chart1,
                values: hydration.days.map((day) => (day.milliliters > 0 ? day.milliliters : null)),
              },
              {
                name: 'Cel',
                color: theme.chart2,
                values: hydration.days.map((day) => day.target),
              },
            ]}
            formatValue={(value) => formatMl(value)}
            gridLines={5}
            emptyMessage="Jeszcze nie ma zapisanych dni."
          />
          <ThemedText type="small">{describeHydration(water)}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {hydration.streak === 0
              ? 'Cel dnia jeszcze nie dowieziony dzień po dniu.'
              : `Cel dowieziony ${pluralWith(hydration.streak, 'dzień', 'dni', 'dni')} z rzędu.`}
          </ThemedText>
        </View>

        <View style={styles.section}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            ZJEDZONE I BUDŻET
          </ThemedText>
          <LineChart
            labels={nutrition.days.map((day) => shortDay(day.dayKey))}
            series={[
              {
                name: 'Zjedzone',
                color: theme.chart1,
                values: nutrition.days.map((day) => (day.meals > 0 ? day.kcal : null)),
              },
              {
                name: 'Budżet',
                color: theme.chart2,
                values: nutrition.days.map((day) => day.target),
              },
            ]}
            formatValue={(value) => formatNumber(Math.round(value))}
            gridLines={5}
            emptyMessage="Jeszcze nie ma zapisanych dni."
          />
          <ThemedText type="small">{describeBalance(food)}</ThemedText>
          {describeDays(food) !== null && (
            <ThemedText type="small" themeColor="textSecondary">
              {describeDays(food)}
            </ThemedText>
          )}
        </View>

        <ThemedText type="small" themeColor="textSecondary">
          Cele liczymy dzisiejszą masą ciała i dzisiejszymi ustawieniami — trening z danego dnia
          wchodzi do celu tamtego dnia, ale zmiana masy czy celu diety przykłada się wstecz do
          wszystkich. Przy kilku tygodniach to różnica kilkudziesięciu kalorii i kilku łyków.
        </ThemedText>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.five, paddingBottom: Spacing.six },
  section: { gap: Spacing.two },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
});
