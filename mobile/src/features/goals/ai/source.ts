import type { SyncDb } from '@/db/types';
import { guidance } from '@/features/ai/tokens';
import { loadEnduranceWorkouts } from '@/features/endurance/stats';

import { buildBrief, currentForm } from '../brief';
import { type Goal, goalPlan } from '../repository';

import { buildContext, planResults } from './context';
import { buildPrompt } from './prompt';

/**
 * Polecenie dla tego celu — jedno miejsce dla ekranu podglądu i dla samego zapytania.
 *
 * Dwa ekrany składały je osobno i nic nie pilnowało, żeby wychodziło to samo. Pokazywanie
 * polecenia ma sens tylko wtedy, gdy pokazuje dokładnie to, co pojedzie — więc składa je ta sama
 * funkcja, a ekran podglądu pyta o to samo, o co pyta przycisk.
 */

export type GoalPrompt = {
  text: string;
  /** Czy to polecenie poprawione ręcznie i zapisane przy celu. */
  custom: boolean;
  /** Polecenie złożone z dzisiejszych danych — do porównania i do przywrócenia. */
  generated: string;
};

export function goalPrompt(db: SyncDb, goal: Goal, from: string, now = new Date()): GoalPrompt {
  // Realizacja dotychczasowego planu: bez niej korekta nie wie nic o własnych skutkach.
  const results = planResults(goalPlan(db, goal.id), loadEnduranceWorkouts(db, goal.sport), from);

  const generated = buildPrompt(
    buildBrief(db, goal, now),
    currentForm(db, goal.sport).history,
    from,
    buildContext(db, goal.sport, guidance(), now, results),
  );

  const saved = goal.aiPrompt?.trim() ?? '';
  return { text: saved === '' ? generated : saved, custom: saved !== '', generated };
}
