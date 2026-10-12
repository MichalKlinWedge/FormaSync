import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useMemo } from 'react';

import { db } from '@/db/client';
import { appSettings, bodyMeasurements, mealLogs, workoutSessions } from '@/db/schema';
import { age, heightCm, sex } from '@/features/profile/profile';
import { latestWeightKg } from '@/features/progress/repository';
import { addDays } from '@/lib/date';

import { dailyEnergy } from './energy';
import { dayTotalsRange, trainingKcalRange, weightPointsSince } from './repository';
import { loadNutritionSettings, type NutritionSettings, resolvedProtein, resolvedRate } from './settings';
import { type DayStat, summarize, type Summary } from './stats';
import { adaptiveTdee, type TdeeResult, WINDOW_DAYS, type WeightPoint } from './trend';

/** Ile dni liczy „ostatni tydzień” w podsumowaniu. */
const WEEK_DAYS = 7;

export type NutritionStats = {
  /** Kolejne dni okna, od najstarszego — także te bez wpisu. */
  days: DayStat[];
  week: Summary;
  window: Summary;
  tdee: TdeeResult;
  /**
   * Wydatek ze wzoru, porównywalny z własnym: utrzymanie plus średni trening z okna. Bez treningu
   * porównanie byłoby nieuczciwe, bo własny wydatek ma treningi w sobie.
   */
  formulaKcal: number | null;
  weights: WeightPoint[];
  proteinTargetG: number | null;
  settings: NutritionSettings;
};

/**
 * Dane do statystyk kalorii: dwa tygodnie wstecz, dzień po dniu.
 *
 * Budżet każdego dnia liczymy dzisiejszą masą ciała — w dwa tygodnie zmienia ona przemianę
 * podstawową o kilkanaście kalorii, a trzymanie masy sprzed każdego dnia kosztowałoby zapytanie
 * na dzień i nie zmieniło żadnego wniosku.
 */
export function useNutritionStats(todayKey: string): NutritionStats {
  const { data: meals } = useLiveQuery(db.select({ id: mealLogs.id }).from(mealLogs));
  const { data: settingRows } = useLiveQuery(db.select({ key: appSettings.key }).from(appSettings));
  const { data: weights } = useLiveQuery(db.select({ id: bodyMeasurements.id }).from(bodyMeasurements));
  const { data: sessions } = useLiveQuery(db.select({ id: workoutSessions.id }).from(workoutSessions));

  return useMemo(() => {
    const from = addDays(todayKey, -(WINDOW_DAYS - 1));
    const settings = loadNutritionSettings(db);
    const weightKg = latestWeightKg(db);

    const totals = new Map(dayTotalsRange(db, from, todayKey).map((row) => [row.dayKey, row]));
    const training = trainingKcalRange(db, from, todayKey, weightKg);

    const profile = {
      sex: sex(db),
      heightCm: heightCm(db),
      years: age(db),
      weightKg,
      activity: settings.activity,
      mode: settings.mode,
      ratePerWeek: resolvedRate(settings),
      manualKcal: settings.manualKcal,
    };

    const days: DayStat[] = [];
    for (let index = 0; index < WINDOW_DAYS; index += 1) {
      const dayKey = addDays(from, index);
      const row = totals.get(dayKey);
      const trainingKcal = training[dayKey] ?? 0;
      days.push({
        dayKey,
        kcal: row?.kcal ?? 0,
        proteinG: Math.round(row?.proteinG ?? 0),
        trainingKcal,
        meals: row?.meals ?? 0,
        target: dailyEnergy({ ...profile, trainingKcal }).target,
      });
    }

    const logged = days.filter((day) => day.meals > 0);
    const points = weightPointsSince(db, from);
    const base = dailyEnergy({ ...profile, trainingKcal: 0 }).base;
    const avgTraining = Math.round(
      days.reduce((sum, day) => sum + day.trainingKcal, 0) / Math.max(days.length, 1),
    );

    return {
      days,
      week: summarize(days.slice(-WEEK_DAYS)),
      window: summarize(days),
      tdee: adaptiveTdee(
        logged.map((day) => day.kcal),
        points,
      ),
      formulaKcal: base === null ? null : base + avgTraining,
      weights: points,
      proteinTargetG:
        weightKg === null || weightKg <= 0 ? null : Math.round(weightKg * resolvedProtein(settings)),
      settings,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sygnały zmiany, dane czytają funkcje repozytorium
  }, [meals, settingRows, weights, sessions, todayKey]);
}
