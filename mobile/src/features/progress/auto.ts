import { eq } from 'drizzle-orm';

import * as schema from '@/db/schema';
import { getSetting, setSetting } from '@/db/settings';
import type { SyncDb } from '@/db/types';
import { formatKg } from '@/lib/number';

import {
  applyProgression,
  changesPlan,
  type ProgressionAdvice,
  proposeProgression,
} from './progression';

/**
 * Progresja bez pytania.
 *
 * Kreator progresji działa od początku, ale trzeba o nim pamiętać — a po treningu pamięta się
 * o prysznicu, nie o przeglądzie ciężarów. Włączony tryb automatyczny robi to samo w tej samej
 * chwili: po zakończeniu treningu i po każdej poprawce w zapisanym treningu plan dostaje ciężary
 * na następny raz.
 *
 * Reguła jest ta sama, co w kreatorze — innej progresji w tej aplikacji nie ma. Zmienia się
 * wyłącznie to, kto klika „zapisz”.
 *
 * Powtórzenie niczego nie psuje: podstawą jest ciężar z sesji, nie ten z planu, więc drugie
 * przeliczenie tego samego treningu wychodzi na tę samą liczbę, która już w planie stoi — i nie
 * ma czego zapisywać. Dzięki temu wolno to wołać po każdej poprawce serii.
 */

const KEY = 'auto_progression';

export const autoProgressionOn = (db: SyncDb): boolean => getSetting(db, KEY) === 'yes';

export const setAutoProgression = (db: SyncDb, on: boolean): void =>
  setSetting(db, KEY, on ? 'yes' : null);

export type AppliedChange = {
  exerciseName: string;
  advice: ProgressionAdvice;
  from: number;
  to: number;
};

export type AutoProgression = { planId: number; planTitle: string; changes: AppliedChange[] };

/**
 * Przelicza progresję dla planu, z którego poszła ta sesja, i zapisuje ją w planie.
 *
 * Null znaczy „nic się nie wydarzyło” i ma kilka powodów naraz: tryb wyłączony, trening bez planu
 * (sam z siebie nie ma czego aktualizować), trening nieukończony albo plan, w którym po przeliczeniu
 * nie zmieniałoby się nic.
 */
export function runAutoProgression(db: SyncDb, sessionId: number): AutoProgression | null {
  if (!autoProgressionOn(db)) return null;

  const session = db
    .select({ planId: schema.workoutSessions.planId, status: schema.workoutSessions.status })
    .from(schema.workoutSessions)
    .where(eq(schema.workoutSessions.id, sessionId))
    .get();
  if (!session || session.planId === null || session.status !== 'COMPLETED') return null;

  const proposal = proposeProgression(db, session.planId, sessionId);
  if (proposal === null) return null;

  // Zapisujemy tylko to, co naprawdę zmienia plan. „Utrzymaj ciężar, który już tam stoi” jest
  // poprawnym werdyktem i żadną zmianą — wpisane, wyglądałoby na zmianę, której nie było.
  const actionable = proposal.suggestions.filter(changesPlan);
  if (actionable.length === 0) return null;

  applyProgression(db, actionable);

  return {
    planId: proposal.planId,
    planTitle: proposal.planTitle,
    changes: actionable.map((suggestion) => ({
      exerciseName: suggestion.exerciseName,
      advice: suggestion.advice,
      from: suggestion.planWeight,
      to: suggestion.suggestedWeight,
    })),
  };
}

/** Co się zmieniło, jednym zdaniem na ćwiczenie — do okienka po treningu. */
export function describeAutoProgression(result: AutoProgression): string {
  return result.changes
    .map((change) => `${change.exerciseName}: ${formatKg(change.from)} → ${formatKg(change.to)}`)
    .join('\n');
}
