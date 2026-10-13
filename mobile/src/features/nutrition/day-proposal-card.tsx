import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { db } from '@/db/client';
import { appSettings } from '@/db/schema';

import { formatKcal } from './format';
import { MEAL_LABELS } from './meal';
import { loadProposal } from './proposal-store';

/**
 * Posiłki na wybrany dzień w kalendarzu — tuż pod treningami, bo to jedna decyzja, nie dwie:
 * dzień z biegiem je się inaczej niż dzień bez.
 *
 * Kafelek pokazuje gotową propozycję albo prowadzi do jej ułożenia na ten sam dzień. Samej
 * propozycji tutaj nie układamy: to zapytanie do modelu i kilkanaście sekund czekania, więc należy
 * do ekranu, który o tym mówi.
 */
export function DayProposalCard({ dayKey, today }: { dayKey: string; today: string }) {
  // Propozycja leży w ustawieniach; bez tego sygnału kalendarz nie zauważyłby jej po powrocie.
  const { data: rows } = useLiveQuery(db.select({ key: appSettings.key }).from(appSettings));
  const plan = useMemo(
    () => loadProposal(db, dayKey),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sygnał zmiany, dane czyta magazyn propozycji
    [rows, dayKey],
  );

  // Wstecz się nie planuje. Co było zjedzone, mówi dziennik — i to on jest wtedy właściwym miejscem.
  if (dayKey < today) return null;

  const total = plan?.meals.reduce((sum, meal) => sum + meal.kcal, 0) ?? 0;

  return (
    <>
      <ThemedText type="smallBold" themeColor="textSecondary">
        POSIŁKI
      </ThemedText>
      {plan === null ? (
        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText type="small" themeColor="textSecondary">
            Na ten dzień nie ma jeszcze propozycji.
          </ThemedText>
        </ThemedView>
      ) : (
        <ThemedView type="backgroundElement" style={styles.card}>
          {plan.meals.map((meal) => (
            <View key={`${meal.meal}-${meal.title}`} style={styles.row}>
              <ThemedText type="small" themeColor="textSecondary" style={styles.meal}>
                {MEAL_LABELS[meal.meal]}
              </ThemedText>
              <ThemedText type="small" style={styles.title} numberOfLines={1}>
                {meal.title}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {formatKcal(meal.kcal)}
              </ThemedText>
            </View>
          ))}
          <ThemedText type="small" themeColor="textSecondary">
            {`Razem ${formatKcal(total)}. Składniki i gramatura są w propozycji.`}
          </ThemedText>
        </ThemedView>
      )}
      <Button
        label={plan === null ? 'Zaplanuj posiłki na ten dzień' : 'Otwórz propozycję'}
        icon="auto_awesome"
        variant="secondary"
        onPress={() => router.push({ pathname: '/nutrition/propose', params: { day: dayKey } })}
      />
    </>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 12, padding: Spacing.three, gap: Spacing.two },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  meal: { width: 86 },
  title: { flex: 1 },
});
