import { askAi, type Provider } from '@/features/ai/client';
import { AiError } from '@/features/ai/transport';

import type { FormWorkout } from '../brief';
import type { GoalBrief, PlannedWeek } from '../planner';

import { EMPTY_CONTEXT, type PromptContext } from './context';
import { buildPrompt, parsePlanReply, PlanReplyError } from './prompt';

/**
 * Plan ułożony przez model. Dokładamy go jako drugą opcję obok reguł — nie zamiast nich:
 * bez klucza, bez internetu i po błędzie po stronie dostawcy aplikacja nadal układa plan sama.
 *
 * Który dostawca odpowiada, decyduje ekran — tutaj liczy się tylko to, że odpowiedź przechodzi
 * przez ten sam odczyt i tę samą kontrolę co każda inna.
 */

export { PlanReplyError } from './prompt';

/** Cały przebieg: polecenie, zapytanie, odczyt planu. */
export async function planWithAi(
  provider: Provider,
  brief: GoalBrief,
  history: FormWorkout[],
  from: string,
  context: PromptContext = EMPTY_CONTEXT,
): Promise<PlannedWeek[]> {
  const reply = await askAi(buildPrompt(brief, history, from, context), { provider });
  try {
    return parsePlanReply(reply, brief, from);
  } catch (error) {
    // Błąd odczytu zostawiamy rozpoznawalnym: ekran ma zaproponować plan z reguł, a nie udawać,
    // że to awaria sieci.
    throw error instanceof PlanReplyError ? error : new AiError('Nie udało się odczytać planu.');
  }
}
