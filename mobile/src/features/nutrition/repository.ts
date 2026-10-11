import { and, asc, desc, eq, gte, ne } from 'drizzle-orm';

import * as schema from '@/db/schema';
import type { SyncDb } from '@/db/types';
import { normalizeText } from '@/features/exercises/filter';
import { addDays, toDateKey } from '@/lib/date';

import { trainingBurn } from './energy';
import { type FoodDraft, nutrientsFor } from './food';
import { loadFood, markFoodUsed, saveFood } from './food-repository';

/**
 * Zapis i odczyt zjedzonego. Posiłki leżą wiersz po wierszu, a dzień liczymy w strefie telefonu —
 * doba żywieniowa kończy się o północy tam, gdzie się mieszka, a nie w Greenwich.
 */

export type MealEntry = {
  id: number;
  loggedAt: string;
  meal: schema.MealType;
  /** Produkt, z którego wpis powstał; null dla wpisu z ręki i dla usuniętego produktu. */
  foodId: number | null;
  title: string;
  grams: number | null;
  kcal: number;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
};

export type MealInput = {
  meal: schema.MealType;
  title: string;
  foodId?: number | null;
  kcal: number;
  grams?: number | null;
  proteinG?: number | null;
  carbsG?: number | null;
  fatG?: number | null;
};

export class MealError extends Error {}

const positive = (value: number | null | undefined): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value * 10) / 10 : null;

/** Zapisuje zjedzony posiłek. Zwraca identyfikator, żeby dało się go od razu cofnąć. */
export function logMeal(db: SyncDb, input: MealInput, now: Date = new Date()): number {
  const title = input.title.trim();
  if (title === '') throw new MealError('Podaj, co to było.');
  const kcal = Math.round(input.kcal);
  if (!Number.isFinite(kcal) || kcal <= 0) throw new MealError('Podaj kalorie — bez nich wpis nic nie liczy.');

  return db
    .insert(schema.mealLogs)
    .values({
      loggedAt: now.toISOString(),
      dayKey: toDateKey(now),
      meal: input.meal,
      foodId: input.foodId ?? null,
      title,
      grams: positive(input.grams),
      kcal,
      proteinG: positive(input.proteinG),
      carbsG: positive(input.carbsG),
      fatG: positive(input.fatG),
    })
    .returning({ id: schema.mealLogs.id })
    .get().id;
}

export function removeMeal(db: SyncDb, id: number): void {
  db.delete(schema.mealLogs).where(eq(schema.mealLogs.id, id)).run();
}

/** Posiłki dnia od najwcześniejszego — oś czasu jedzenia. */
export function dayMeals(db: SyncDb, dayKey: string): MealEntry[] {
  return db
    .select({
      id: schema.mealLogs.id,
      loggedAt: schema.mealLogs.loggedAt,
      meal: schema.mealLogs.meal,
      foodId: schema.mealLogs.foodId,
      title: schema.mealLogs.title,
      grams: schema.mealLogs.grams,
      kcal: schema.mealLogs.kcal,
      proteinG: schema.mealLogs.proteinG,
      carbsG: schema.mealLogs.carbsG,
      fatG: schema.mealLogs.fatG,
    })
    .from(schema.mealLogs)
    .where(eq(schema.mealLogs.dayKey, dayKey))
    .orderBy(asc(schema.mealLogs.loggedAt), asc(schema.mealLogs.id))
    .all();
}

export type DayTotals = { kcal: number; proteinG: number; carbsG: number; fatG: number; meals: number };

/**
 * Suma dnia. Makroskładniki sumujemy, choć na pierwszym planie stoją tylko kalorie i białko —
 * licząc je od początku, nie trzeba będzie kiedyś przeliczać historii.
 */
export function dayTotals(db: SyncDb, dayKey: string): DayTotals {
  return dayMeals(db, dayKey).reduce<DayTotals>(
    (sum, entry) => ({
      kcal: sum.kcal + entry.kcal,
      proteinG: sum.proteinG + (entry.proteinG ?? 0),
      carbsG: sum.carbsG + (entry.carbsG ?? 0),
      fatG: sum.fatG + (entry.fatG ?? 0),
      meals: sum.meals + 1,
    }),
    { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, meals: 0 },
  );
}

/**
 * Ostatnio jedzone, bez powtórzeń nazw. Je się w kółko to samo, więc to ta lista — a nie żadna
 * baza produktów — decyduje, czy wpisywanie posiłków przeżyje drugi tydzień.
 */
export function recentMeals(db: SyncDb, limit = 8): MealEntry[] {
  const rows = db
    .select({
      id: schema.mealLogs.id,
      loggedAt: schema.mealLogs.loggedAt,
      meal: schema.mealLogs.meal,
      foodId: schema.mealLogs.foodId,
      title: schema.mealLogs.title,
      grams: schema.mealLogs.grams,
      kcal: schema.mealLogs.kcal,
      proteinG: schema.mealLogs.proteinG,
      carbsG: schema.mealLogs.carbsG,
      fatG: schema.mealLogs.fatG,
    })
    .from(schema.mealLogs)
    .orderBy(desc(schema.mealLogs.loggedAt), desc(schema.mealLogs.id))
    .limit(200)
    .all();

  const seen = new Set<string>();
  const unique: MealEntry[] = [];
  for (const row of rows) {
    const key = normalizeText(row.title);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(row);
    if (unique.length >= limit) break;
  }
  return unique;
}

/**
 * Posiłek z produktu: wartości liczy produkt, a wpis dostaje ich własną kopię. Przy okazji
 * odnotowujemy użycie, żeby produkt wrócił na górę listy wyboru.
 *
 * Masę zapisujemy tylko wtedy, gdy ją znamy: przy liczeniu na 100 g jest nią sama ilość, przy
 * porcjach — ilość razy masa porcji, o ile ktoś ją podał. Zmyślonych gramów nie wpisujemy.
 */
export function logFoodMeal(
  db: SyncDb,
  input: { meal: schema.MealType; foodId: number; amount: number },
  now: Date = new Date(),
): number {
  const food = loadFood(db, input.foodId);
  if (food === null) throw new MealError('Tego produktu już nie ma w bazie.');
  if (!(input.amount > 0)) throw new MealError('Podaj zjedzoną ilość.');

  const values = nutrientsFor(food, input.amount);
  const grams =
    food.basis === 'G100'
      ? input.amount
      : food.servingGrams === null
        ? null
        : input.amount * food.servingGrams;

  const id = logMeal(
    db,
    {
      meal: input.meal,
      foodId: food.id,
      title: food.name,
      kcal: values.kcal,
      proteinG: values.proteinG,
      carbsG: values.carbsG,
      fatG: values.fatG,
      grams,
    },
    now,
  );
  markFoodUsed(db, food.id, now);
  return id;
}

/**
 * Wpis z ręki, który od razu zostaje produktem. Tak rośnie baza: raz policzona owsianka wraca
 * nazajutrz jednym dotknięciem, a nie kolejnym liczeniem tego samego.
 *
 * Produkt powstaje „na porcję”, bo tyle wiadomo — kalorie całego posiłku. Na sto gramów nikt tego
 * nie przeliczy bez wagi, a wymyślona masa byłaby gorsza niż jej brak.
 */
export function logMealAsFood(
  db: SyncDb,
  input: MealInput,
  now: Date = new Date(),
): { mealId: number; foodId: number } {
  const draft: FoodDraft = {
    name: input.title.trim(),
    brand: null,
    basis: 'SERVING',
    kcal: Math.round(input.kcal),
    proteinG: positive(input.proteinG),
    carbsG: positive(input.carbsG),
    fatG: positive(input.fatG),
    servingName: null,
    servingGrams: positive(input.grams),
    portions: [],
  };
  const foodId = saveFood(db, draft);
  const mealId = logMeal(db, { ...input, foodId }, now);
  markFoodUsed(db, foodId, now);
  return { mealId, foodId };
}

/**
 * Kalorie dzisiejszych zakończonych treningów. Dzień bierzemy z początku treningu i w strefie
 * telefonu — bieg o 22:30 należy do dnia, w którym się odbył.
 */
export function trainingKcalOn(db: SyncDb, dayKey: string, weightKg: number | null): number {
  if (weightKg === null || weightKg <= 0) return 0;

  const sessions = db
    .select({
      sport: schema.workoutSessions.sport,
      startTime: schema.workoutSessions.startTime,
      endTime: schema.workoutSessions.endTime,
      totalDurationSeconds: schema.workoutSessions.totalDurationSeconds,
    })
    .from(schema.workoutSessions)
    .where(
      and(
        ne(schema.workoutSessions.status, 'IN_PROGRESS'),
        // Dzień wcześniej w zapasie: klucz dnia liczymy lokalnie, a `start_time` jest w UTC.
        gte(schema.workoutSessions.startTime, addDays(dayKey, -1)),
      ),
    )
    .all();

  let kcal = 0;
  for (const session of sessions) {
    if (toDateKey(new Date(session.startTime)) !== dayKey) continue;
    const seconds =
      session.totalDurationSeconds ??
      (session.endTime === null
        ? 0
        : Math.max(0, Math.round((Date.parse(session.endTime) - Date.parse(session.startTime)) / 1000)));
    kcal += trainingBurn(session.sport, seconds, weightKg);
  }
  return kcal;
}
