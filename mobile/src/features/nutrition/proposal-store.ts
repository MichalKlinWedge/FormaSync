import { getSetting, setSetting } from '@/db/settings';
import type { SyncDb } from '@/db/types';

import type { MealPlan } from './proposal';

/**
 * Propozycje dnia po dniu, zapamiętane po ułożeniu.
 *
 * Powód jest prosty: układa się je z wyprzedzeniem, a pytanie „co miałem zjeść na kolację” pada
 * wieczorem. Bez zapisu każde wejście na ekran kosztowałoby kolejne zapytanie do Google i dałoby
 * inny zestaw niż ten, pod który zrobiło się zakupy.
 *
 * Trzymamy dzień dzisiejszy i to, co ułożone na przód. Wczorajsze propozycje znikają przy
 * najbliższym zapisie — historia propozycji nikomu nie służy, bo liczy się to, co faktycznie
 * zjedzone, a to leży w dzienniku.
 */

const KEY = 'nutrition_proposal';

type Stored = Record<string, MealPlan>;

/** Czy zapis ma kształt, któremu można zaufać. Powstał mógł w starszej wersji aplikacji. */
const isPlan = (value: unknown): value is MealPlan =>
  typeof value === 'object'
  && value !== null
  && Array.isArray((value as MealPlan).meals)
  && (value as MealPlan).meals.length > 0;

function read(db: SyncDb): Stored {
  const raw = getSetting(db, KEY);
  if (raw === null) return {};

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    // Pierwsza wersja trzymała jeden dzień jako { dayKey, plan }. Nie zmuszamy nikogo do układania
    // dzisiejszej propozycji od nowa tylko dlatego, że doszło planowanie na przód.
    if (typeof parsed.dayKey === 'string' && isPlan(parsed.plan)) {
      return { [parsed.dayKey]: parsed.plan };
    }

    const plans: Stored = {};
    for (const [dayKey, plan] of Object.entries(parsed)) {
      if (isPlan(plan)) plans[dayKey] = plan;
    }
    return plans;
  } catch {
    return {};
  }
}

/** Zapisuje propozycję na dany dzień i przy okazji sprząta to, co już minęło. */
export function saveProposal(db: SyncDb, dayKey: string, plan: MealPlan, today = dayKey): void {
  const plans = read(db);
  plans[dayKey] = plan;

  const kept: Stored = {};
  for (const [key, value] of Object.entries(plans)) {
    if (key >= today) kept[key] = value;
  }

  setSetting(db, KEY, JSON.stringify(kept));
}

/** Propozycja na ten dzień albo null. */
export function loadProposal(db: SyncDb, dayKey: string): MealPlan | null {
  const plan = read(db)[dayKey];
  if (plan === undefined) return null;
  return { meals: plan.meals, note: plan.note ?? null, warning: plan.warning ?? null };
}

/** Dni, na które coś już stoi — żeby było widać to bez wchodzenia w każdy z osobna. */
export const proposedDays = (db: SyncDb): string[] => Object.keys(read(db)).sort();

export function clearProposal(db: SyncDb): void {
  setSetting(db, KEY, null);
}
