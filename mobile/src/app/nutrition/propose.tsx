import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { db } from '@/db/client';
// Klient Gemini jest jeden dla całej aplikacji — ten sam, co przy planiście i przy opisie posiłku.
import { askGemini, GeminiError, NoApiKeyError } from '@/features/goals/ai/gemini';
import { formatGrams, formatKcal } from '@/features/nutrition/format';
import { MEAL_LABELS } from '@/features/nutrition/meal';
import {
  buildPlanPrompt,
  DEFAULT_LUNCH_SHARE,
  describeItems,
  freeBudget,
  type MealPlan,
  MealPlanError,
  parseMealPlan,
  type PlanRequest,
  type ProposedMeal,
} from '@/features/nutrition/proposal';
import { loadProposal, saveProposal } from '@/features/nutrition/proposal-store';
import { logMeal, MealError, plannedTrainingOn, typicalLunch } from '@/features/nutrition/repository';
import { nutritionGuidance } from '@/features/nutrition/settings';
import { useNutritionDay } from '@/features/nutrition/use-nutrition';
import { SPORT_LABELS } from '@/features/sports/sport';
import { useTheme } from '@/hooks/use-theme';
import { addDays, todayKey } from '@/lib/date';

/** Z ilu tygodni liczymy typowy obiad. Sześć wystarcza, żeby złapać rytm, i nie pamięta diety sprzed pół roku. */
const LUNCH_WINDOW_DAYS = 42;

/**
 * Propozycja jedzenia na dziś.
 *
 * Układana rano i zapamiętana na cały dzień: pytanie „co miałem zjeść na kolację” pada wieczorem,
 * a drugie zapytanie do Google dałoby wtedy inny zestaw niż ten, pod który zrobiło się zakupy.
 *
 * Obiad jest poza propozycją, bo zwykle nie jest niczyją decyzją. Wchodzi jako liczba — podana,
 * gdy wiesz, co będzie, a w przeciwnym razie wzięta z mediany Twoich obiadów.
 */
export default function ProposeMealsScreen() {
  const theme = useTheme();
  const today = todayKey();
  const { totals, meals, energy, protein, weightKg } = useNutritionDay(today);

  const [lunchText, setLunchText] = useState('');
  const [withTraining, setWithTraining] = useState(true);
  const [plan, setPlan] = useState<MealPlan | null>(() => loadProposal(db, today));
  const [eaten, setEaten] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);

  // Liczone raz na wejście: ani typowy obiad, ani historia treningów nie zmieniają się w trakcie.
  const typical = useMemo(() => typicalLunch(db, addDays(today, -LUNCH_WINDOW_DAYS), today), [today]);
  const planned = useMemo(() => plannedTrainingOn(db, today, weightKg), [today, weightKg]);

  const training = withTraining ? planned : null;
  const dayKcal = (energy.target ?? 0) + (training?.kcal ?? 0);

  const lunchLogged = meals.some((entry) => entry.meal === 'LUNCH');
  const lunchDescribed = lunchText.trim() !== '';
  const lunchKcal = typical?.kcal ?? Math.round(dayKcal * DEFAULT_LUNCH_SHARE);

  // Obiad odejmujemy tylko wtedy, gdy nie ma go ani w dzienniku, ani w samej propozycji.
  const subtracted = lunchLogged || lunchDescribed ? null : { kcal: lunchKcal, proteinG: typical?.proteinG ?? null };
  const free = freeBudget({
    dayKcal,
    eatenKcal: totals.kcal,
    eatenProteinG: totals.proteinG,
    proteinTargetG: protein,
    lunch: subtracted,
  });

  const request: PlanRequest = {
    kcal: free.kcal,
    proteinG: free.proteinG,
    lunch: { kcal: lunchKcal, description: lunchDescribed ? lunchText.trim() : null },
    guidance: nutritionGuidance(db),
    training:
      training === null
        ? null
        : `${SPORT_LABELS[training.sport].toLowerCase()}, około ${training.minutes} min`,
  };

  const propose = async () => {
    if (energy.target === null) {
      Alert.alert('Najpierw budżet dnia', 'Bez celu diety i danych do wzoru nie ma czego dzielić.', [
        { text: 'Nie teraz', style: 'cancel' },
        { text: 'Uzupełnij', onPress: () => router.push('/nutrition/settings') },
      ]);
      return;
    }
    if (free.kcal <= 0) {
      Alert.alert('Budżet na dziś wyczerpany', 'Na te posiłki nic już nie zostało.');
      return;
    }

    setBusy(true);
    try {
      const result = parseMealPlan(await askGemini(buildPlanPrompt(request)), request);
      setPlan(result);
      setEaten([]);
      saveProposal(db, today, result);
    } catch (e) {
      if (e instanceof NoApiKeyError) {
        Alert.alert('Brak klucza do Gemini', 'Klucz wkleja się raz, w ustawieniach planisty AI.', [
          { text: 'Nie teraz', style: 'cancel' },
          { text: 'Ustawienia', onPress: () => router.push('/goal/ai') },
        ]);
      } else {
        const retry = e instanceof GeminiError && e.retryable;
        Alert.alert(
          'Nie udało się ułożyć',
          e instanceof GeminiError || e instanceof MealPlanError ? e.message : 'Nieznany błąd połączenia.',
          retry
            ? [
                { text: 'Nie teraz', style: 'cancel' },
                { text: 'Ponów', onPress: () => void propose() },
              ]
            : undefined,
        );
      }
    } finally {
      setBusy(false);
    }
  };

  /** Posiłek z propozycji do dziennika — bez opisywania go drugi raz. */
  const eat = (meal: ProposedMeal) => {
    const grams = meal.items.reduce((sum, item) => sum + (item.grams ?? 0), 0);
    try {
      logMeal(db, {
        meal: meal.meal,
        title: meal.title,
        kcal: meal.kcal,
        proteinG: meal.proteinG,
        grams: grams > 0 ? grams : null,
      });
      setEaten((current) => [...current, meal.meal]);
    } catch (e) {
      Alert.alert('Nie zapisano', e instanceof MealError ? e.message : (e as Error).message);
    }
  };

  return (
    <ThemedView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.section}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            DO ROZDYSPONOWANIA
          </ThemedText>
          <ThemedText type="title">{formatKcal(free.kcal)}</ThemedText>
          {free.proteinG !== null && (
            <ThemedText type="small" themeColor="textSecondary">
              {`Białko w tych posiłkach: ${formatGrams(free.proteinG)}.`}
            </ThemedText>
          )}
          <ThemedText type="small" themeColor="textSecondary">
            {`Budżet dnia ${formatKcal(dayKcal)}${training === null ? '' : ` (w tym ${formatKcal(training.kcal)} za zaplanowany trening)`}`}
            {totals.kcal > 0 ? `, zjedzone ${formatKcal(totals.kcal)}` : ''}.
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {describeLunch({ logged: lunchLogged, described: lunchDescribed, kcal: lunchKcal, days: typical?.days ?? 0 })}
          </ThemedText>
        </View>

        <View style={styles.section}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            DZIŚ NA OBIAD
          </ThemedText>
          <TextInput
            value={lunchText}
            onChangeText={setLunchText}
            placeholder="np. schabowy z ziemniakami i surówką — zostaw puste, jeśli nie wiesz"
            placeholderTextColor={theme.textSecondary}
            multiline
            style={[
              styles.input,
              { color: theme.text, backgroundColor: theme.background, borderColor: theme.border },
            ]}
          />
          <ThemedText type="small" themeColor="textSecondary">
            Gdy wpiszesz, Gemini najpierw go oszacuje, a resztę dnia ułoży wokół niego. Gdy zostawisz
            puste, odejmujemy od budżetu typowy obiad i w propozycji go nie będzie.
          </ThemedText>
        </View>

        <View style={styles.section}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            TRENING NA DZIŚ
          </ThemedText>
          {planned === null ? (
            <ThemedText type="small" themeColor="textSecondary">
              Nic zaplanowanego na dziś albo brak historii, z której dałoby się ocenić czas — budżet
              idzie bez treningu. Gdy trening się odbędzie, budżet urośnie sam.
            </ThemedText>
          ) : (
            <>
              <Chip
                label={`${SPORT_LABELS[planned.sport]} ~${planned.minutes} min · +${formatKcal(planned.kcal)}`}
                selected={withTraining}
                onPress={() => setWithTraining((on) => !on)}
              />
              <ThemedText type="small" themeColor="textSecondary">
                Czas wzięty z tego, ile zwykle trwa u Ciebie taki trening — to szacunek na zapas,
                a nie pomiar. Stuknij, żeby go nie doliczać.
              </ThemedText>
            </>
          )}
        </View>

        <View style={styles.section}>
          <ThemedText type="small" themeColor="textSecondary">
            Do Google pojadą: liczby budżetu i białka, wartość obiadu, Twoje wytyczne żywieniowe i to,
            co napiszesz wyżej. Nie pojadą pomiary ciała, treningi ani dziennik posiłków.
          </ThemedText>
          <Button
            label={showPrompt ? 'Ukryj polecenie' : 'Pokaż, co pojedzie do Google'}
            icon="visibility"
            variant="secondary"
            onPress={() => setShowPrompt((shown) => !shown)}
          />
          {showPrompt && (
            <ThemedText type="small" selectable style={styles.prompt}>
              {buildPlanPrompt(request)}
            </ThemedText>
          )}
          <Button
            label={busy ? 'Pytam Gemini…' : plan === null ? 'Ułóż propozycję' : 'Ułóż od nowa'}
            icon="auto_awesome"
            onPress={() => void propose()}
            disabled={busy}
          />
          {busy && (
            <View style={styles.busy}>
              <ActivityIndicator />
              <ThemedText type="small" themeColor="textSecondary">
                Zwykle kilkanaście sekund.
              </ThemedText>
            </View>
          )}
        </View>

        {plan !== null && (
          <>
            {plan.warning !== null && (
              <ThemedText type="small" style={{ color: theme.accent }}>
                {plan.warning}
              </ThemedText>
            )}
            {plan.note !== null && (
              <ThemedText type="small" themeColor="textSecondary">
                {`Model założył: ${plan.note}`}
              </ThemedText>
            )}

            {plan.meals.map((meal) => (
              <View key={`${meal.meal}-${meal.title}`} style={styles.section}>
                <View style={styles.groupHeader}>
                  <ThemedText type="smallBold" themeColor="textSecondary">
                    {MEAL_LABELS[meal.meal].toUpperCase()}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {[formatKcal(meal.kcal), meal.proteinG === null ? null : `białko ${formatGrams(meal.proteinG)}`]
                      .filter(Boolean)
                      .join(' · ')}
                  </ThemedText>
                </View>
                <ThemedText>{meal.title}</ThemedText>
                {meal.items.length > 0 && (
                  <ThemedText type="small" themeColor="textSecondary">
                    {describeItems(meal.items)}
                  </ThemedText>
                )}
                {meal.estimated ? (
                  <ThemedText type="small" themeColor="textSecondary">
                    Twój obiad — tylko oszacowany, nie układany.
                  </ThemedText>
                ) : null}
                <Button
                  label={eaten.includes(meal.meal) ? 'Zapisane' : 'Zjedzone'}
                  icon={eaten.includes(meal.meal) ? 'check' : 'add'}
                  variant="secondary"
                  disabled={eaten.includes(meal.meal)}
                  onPress={() => eat(meal)}
                />
              </View>
            ))}

            <ThemedText type="small" themeColor="textSecondary">
              Liczby są oszacowaniem modelu, nie etykietą z opakowania. „Zjedzone” wpisuje posiłek do
              dziennika tak, jak go widzisz — jeśli zjesz inaczej, popraw wpis w dzienniku.
            </ThemedText>
          </>
        )}
      </ScrollView>
    </ThemedView>
  );
}

/** Skąd wzięła się wartość obiadu — liczba bez tego zdania wyglądałaby na wziętą z powietrza. */
function describeLunch(input: { logged: boolean; described: boolean; kcal: number; days: number }): string {
  if (input.logged) return 'Obiad jest już w dzienniku, więc nie odejmujemy go drugi raz.';
  if (input.described) return 'Obiad liczymy z Twojego opisu — wejdzie do propozycji jako oszacowany.';
  if (input.days === 0) {
    return `Nie ma jeszcze zapisanych obiadów, więc przyjmujemy ${formatKcal(input.kcal)} — ${Math.round(
      DEFAULT_LUNCH_SHARE * 100,
    )}% budżetu. To zgadywanie; po kilku obiadach w dzienniku liczba będzie Twoja.`;
  }
  return `Obiad: ${formatKcal(input.kcal)} — mediana z ${input.days} dni z dziennika.`;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.four, paddingBottom: Spacing.six },
  section: { gap: Spacing.two },
  groupHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  input: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
    fontSize: 16,
    minHeight: 72,
    textAlignVertical: 'top',
  },
  prompt: { opacity: 0.8 },
  busy: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
});
