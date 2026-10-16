import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { describeLeft } from '@/features/calendar/day-record';
import { formatMl } from '@/features/hydration/format';
import { useHydrationDay } from '@/features/hydration/use-hydration';
import { formatGrams, formatKcal } from '@/features/nutrition/format';
import { useNutritionDay } from '@/features/nutrition/use-nutrition';

/**
 * Co tego dnia wypite i zjedzone — razem z celem, który wtedy obowiązywał.
 *
 * Kalendarz mówił dotąd wyłącznie o treningach, a dzień to także to, czym się go przeszło.
 * Przy zaległym nawodnieniu albo wyjątkowo lekkim dniu w jedzeniu zwykle widać, skąd wziął się
 * trening, który „nie poszedł”.
 *
 * Cel liczymy dzisiejszą masą ciała i dzisiejszymi ustawieniami — trzymanie ich stanu sprzed
 * każdego dnia kosztowałoby osobny zapis na dzień i nie zmieniło żadnego wniosku.
 */
export function DayRecordCard({ dayKey, today }: { dayKey: string; today: string }) {
  const hydration = useHydrationDay(dayKey);
  const nutrition = useNutritionDay(dayKey);

  // Przyszłość nic jeszcze nie zapisała, a propozycja posiłków stoi wyżej i mówi o niej więcej.
  if (dayKey > today) return null;

  const drank = hydration.consumed;
  const eaten = nutrition.totals.kcal;
  const kcalTarget = nutrition.energy.target;

  return (
    <>
      <ThemedText type="smallBold" themeColor="textSecondary">
        TEGO DNIA
      </ThemedText>
      <ThemedView type="backgroundElement" style={styles.card}>
        {drank === 0 && eaten === 0 ? (
          <ThemedText type="small" themeColor="textSecondary">
            Nic nie zapisane — ani wypite, ani zjedzone.
          </ThemedText>
        ) : (
          <>
            <View style={styles.row}>
              <ThemedText type="small" themeColor="textSecondary" style={styles.label}>
                Nawodnienie
              </ThemedText>
              <ThemedText type="small" style={styles.value}>
                {drank === 0
                  ? 'nic nie zapisane'
                  : `${formatMl(drank)} z ${formatMl(hydration.target.total)}`}
              </ThemedText>
            </View>
            {drank > 0 && (
              <ThemedText type="small" themeColor="textSecondary">
                {describeLeft(hydration.target.total - drank, formatMl)}
              </ThemedText>
            )}

            <View style={styles.row}>
              <ThemedText type="small" themeColor="textSecondary" style={styles.label}>
                Kalorie
              </ThemedText>
              <ThemedText type="small" style={styles.value}>
                {eaten === 0
                  ? 'nic nie zapisane'
                  : kcalTarget === null
                    ? formatKcal(eaten)
                    : `${formatKcal(eaten)} z ${formatKcal(kcalTarget)}`}
              </ThemedText>
            </View>
            {eaten > 0 && kcalTarget !== null && (
              <ThemedText type="small" themeColor="textSecondary">
                {describeLeft(kcalTarget - eaten, formatKcal)}
              </ThemedText>
            )}
            {eaten > 0 && nutrition.protein !== null && (
              <ThemedText type="small" themeColor="textSecondary">
                {`Białko ${formatGrams(nutrition.totals.proteinG)} z ${formatGrams(nutrition.protein)}.`}
              </ThemedText>
            )}
          </>
        )}
      </ThemedView>
    </>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 12, padding: Spacing.three, gap: Spacing.one },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  label: { width: 100 },
  value: { flex: 1 },
});
