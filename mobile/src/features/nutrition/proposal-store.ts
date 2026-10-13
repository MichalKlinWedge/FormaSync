import { getSetting, setSetting } from '@/db/settings';
import type { SyncDb } from '@/db/types';

import type { MealPlan } from './proposal';

/**
 * Propozycja na dany dzień, zapamiętana po ułożeniu.
 *
 * Powód jest prosty: układa się ją rano, a pytanie „co miałem zjeść na kolację” pada wieczorem.
 * Bez zapisu każde wejście na ekran kosztowałoby kolejne zapytanie do Google i dałoby inny zestaw
 * niż ten, pod który zrobiło się zakupy.
 *
 * Trzymamy tylko ostatni dzień. Historia propozycji nikomu nie służy — liczy się to, co faktycznie
 * zjedzone, a to leży w dzienniku.
 */

const KEY = 'nutrition_proposal';

export function saveProposal(db: SyncDb, dayKey: string, plan: MealPlan): void {
  setSetting(db, KEY, JSON.stringify({ dayKey, plan }));
}

/** Propozycja na ten dzień albo null — także wtedy, gdy zapisana jest z wczoraj. */
export function loadProposal(db: SyncDb, dayKey: string): MealPlan | null {
  const raw = getSetting(db, KEY);
  if (raw === null) return null;

  try {
    const parsed = JSON.parse(raw) as { dayKey?: unknown; plan?: MealPlan };
    if (parsed.dayKey !== dayKey) return null;
    const plan = parsed.plan;
    // Zapis mógł powstać w starszej wersji aplikacji; kształt sprawdzamy, zamiast ufać.
    if (plan === undefined || !Array.isArray(plan.meals) || plan.meals.length === 0) return null;
    return { meals: plan.meals, note: plan.note ?? null, warning: plan.warning ?? null };
  } catch {
    return null;
  }
}

export function clearProposal(db: SyncDb): void {
  setSetting(db, KEY, null);
}
