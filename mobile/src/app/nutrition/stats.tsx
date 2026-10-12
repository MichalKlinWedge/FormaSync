import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { LineChart } from '@/components/charts/line-chart';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { formatGrams, formatKcal } from '@/features/nutrition/format';
import { describeBalance, describeDays } from '@/features/nutrition/stats';
import { describeGaps, describeTdee, WINDOW_DAYS } from '@/features/nutrition/trend';
import { useNutritionStats } from '@/features/nutrition/use-nutrition-stats';
import { useTheme } from '@/hooks/use-theme';
import { formatNumber } from '@/lib/number';
import { todayKey } from '@/lib/date';

/** „28.09” — oś czasu potrzebuje dwóch znaków, nie nazwy miesiąca. */
const shortDay = (key: string): string => `${key.slice(8, 10)}.${key.slice(5, 7)}`;

/**
 * Statystyki jedzenia: zjedzone obok budżetu, masa ciała i własny wydatek policzony z obu.
 *
 * Ten ekran odpowiada na pytanie, którego nie da się rozstrzygnąć jednym dniem: czy wzór zgaduje
 * dobrze. Wzór jest średnią dla populacji, a dwa tygodnie własnych liczb mówią o własnym ciele.
 */
export default function NutritionStatsScreen() {
  const theme = useTheme();
  const today = todayKey();
  const { days, week, window, tdee, formulaKcal, weights, proteinTargetG } = useNutritionStats(today);

  const labels = days.map((day) => shortDay(day.dayKey));
  const eaten = days.map((day) => (day.meals > 0 ? day.kcal : null));
  const targets = days.map((day) => day.target);
  const weightLabels = weights.map((point) => shortDay(point.dayKey));
  const weightValues = weights.map((point) => point.weightKg);

  return (
    <ThemedView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.section}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            {`ZJEDZONE I BUDŻET — ${WINDOW_DAYS} DNI`}
          </ThemedText>
          <LineChart
            labels={labels}
            series={[
              { name: 'Zjedzone', color: theme.chart1, values: eaten },
              { name: 'Budżet', color: theme.chart2, values: targets },
            ]}
            formatValue={(value) => formatNumber(Math.round(value))}
            emptyMessage="Jeszcze nie ma zapisanych dni."
          />
          <ThemedText type="small" themeColor="textSecondary">
            Dni bez wpisu są przerwą w linii, a nie zerem — o takim dniu nic nie wiadomo i nie
            wchodzi on do żadnej średniej.
          </ThemedText>
        </View>

        <View style={styles.section}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            OSTATNI TYDZIEŃ
          </ThemedText>
          <ThemedText type="small">{describeBalance(week)}</ThemedText>
          {describeDays(week) !== null && (
            <ThemedText type="small" themeColor="textSecondary">
              {describeDays(week)}
            </ThemedText>
          )}
          {week.avgProtein !== null && (
            <ThemedText type="small" themeColor="textSecondary">
              {proteinTargetG === null
                ? `Białko: średnio ${formatGrams(week.avgProtein)} dziennie.`
                : `Białko: średnio ${formatGrams(week.avgProtein)} z ${formatGrams(proteinTargetG)} dziennie.`}
            </ThemedText>
          )}
          <ThemedText type="small" themeColor="textSecondary">
            {`Zapisane dni: ${week.days} z 7.`}
          </ThemedText>
        </View>

        <View style={styles.section}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            TWÓJ WYDATEK
          </ThemedText>
          {tdee.tdee === null ? (
            <ThemedText type="small" themeColor="textSecondary">
              {describeGaps(tdee.missing, window.days)}
            </ThemedText>
          ) : (
            <>
              <ThemedText type="title">{formatKcal(tdee.tdee.kcal)}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {describeTdee(tdee.tdee, formulaKcal)}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Budżet dnia nadal liczy wzór — ta liczba jest sprawdzeniem, czy wzór trafia. Jeśli
                rozjeżdża się o więcej niż dwieście kalorii przez kilka tygodni, popraw poziom
                aktywności albo wpisz budżet z ręki.
              </ThemedText>
              <Button
                label="Cel diety i dane"
                icon="settings"
                variant="secondary"
                onPress={() => router.push('/nutrition/settings')}
              />
            </>
          )}
        </View>

        <View style={styles.section}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            MASA CIAŁA
          </ThemedText>
          <LineChart
            labels={weightLabels}
            series={[{ name: 'Masa', color: theme.chart1, values: weightValues }]}
            formatValue={(value) => `${formatNumber(value, 1)} kg`}
            emptyMessage="Za mało pomiarów masy ciała w tym okresie."
          />
          <ThemedText type="small" themeColor="textSecondary">
            Pomiary wpisuje się razem z resztą ciała — Ustawienia → Pomiary. Bez nich nie da się
            policzyć własnego wydatku, bo to właśnie masa mówi, co stało się ze zjedzoną energią.
          </ThemedText>
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.four, paddingBottom: Spacing.six },
  section: { gap: Spacing.two },
});
