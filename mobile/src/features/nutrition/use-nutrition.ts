import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useMemo } from 'react';

import { db } from '@/db/client';
import { appSettings, bodyMeasurements, mealLogs, workoutSessions } from '@/db/schema';
import { age, heightCm, sex } from '@/features/profile/profile';
import { latestWeightKg } from '@/features/progress/repository';

import { type DailyEnergy, dailyEnergy, proteinTarget } from './energy';
import { dayMeals, dayTotals, type DayTotals, type MealEntry, recentMeals, trainingKcalOn } from './repository';
import {
  loadNutritionSettings,
  type NutritionSettings,
  resolvedProtein,
  resolvedRate,
} from './settings';

export type NutritionDay = {
  totals: DayTotals;
  meals: MealEntry[];
  recent: MealEntry[];
  energy: DailyEnergy;
  /** Cel białka w gramach; null, dopóki nie znamy masy ciała. */
  protein: number | null;
  weightKg: number | null;
  settings: NutritionSettings;
};

/**
 * Stan kalorii dnia, przeliczany po każdym wpisie.
 *
 * Obserwujemy cztery tabele, bo budżet nie zależy tylko od zjedzonego: dochodzą ustawienia celu,
 * masa ciała z pomiarów i dzisiejsze treningi. Bez sygnału z sesji kafelek nie zauważyłby dodatku
 * za trening zakończony chwilę wcześniej.
 */
export function useNutritionDay(dayKey: string): NutritionDay {
  const { data: meals } = useLiveQuery(db.select({ id: mealLogs.id }).from(mealLogs));
  const { data: settingRows } = useLiveQuery(db.select({ key: appSettings.key }).from(appSettings));
  const { data: weights } = useLiveQuery(db.select({ id: bodyMeasurements.id }).from(bodyMeasurements));
  const { data: sessions } = useLiveQuery(db.select({ id: workoutSessions.id }).from(workoutSessions));

  return useMemo(() => {
    const settings = loadNutritionSettings(db);
    const weightKg = latestWeightKg(db);
    const proteinPerKg = resolvedProtein(settings);

    return {
      totals: dayTotals(db, dayKey),
      meals: dayMeals(db, dayKey),
      recent: recentMeals(db),
      weightKg,
      settings,
      protein: proteinTarget(weightKg, proteinPerKg),
      energy: dailyEnergy({
        sex: sex(db),
        heightCm: heightCm(db),
        years: age(db),
        weightKg,
        activity: settings.activity,
        trainingKcal: trainingKcalOn(db, dayKey, weightKg),
        mode: settings.mode,
        ratePerWeek: resolvedRate(settings),
        manualKcal: settings.manualKcal,
      }),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sygnały zmiany, dane czytają funkcje repozytorium
  }, [meals, settingRows, weights, sessions, dayKey]);
}
