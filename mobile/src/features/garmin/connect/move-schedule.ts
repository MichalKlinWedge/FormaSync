import { db } from '@/db/client';
import { setGarminSchedule } from '@/features/calendar/repository';

import { GarminAuthExpired, GarminError, isConnected } from './client';
import { scheduleOnGarmin, sendPlan, unscheduleOnGarmin } from './workouts';

/**
 * Co się stało z wpisem w kalendarzu Garmina przy przesuwaniu terminu. Przeniesienie to u Garmina
 * dwa osobne kroki — zdjęcie i wpisanie na nowo — więc może się udać w połowie. Kalendarz w
 * telefonie zostaje przesunięty niezależnie od wyniku; rozróżniamy je, żeby powiedzieć wprost,
 * co stoi u Garmina, zamiast milczeć albo udawać sukces.
 */
export type MoveOutcome =
  | { kind: 'MOVED'; date: string }
  /** Konto odłączone — u Garmina nic nie ruszyliśmy. */
  | { kind: 'NOT_CONNECTED' }
  /** Stary wpis zdjęty, nowego nie udało się założyć. */
  | { kind: 'REMOVED_ONLY'; reason: string }
  /** Nie udało się nawet zdjąć starego — stoi tam dalej na poprzedniej dacie. */
  | { kind: 'LEFT_BEHIND'; reason: string; date: string };

/**
 * Przenosi wpis w kalendarzu Garmina na nowy dzień. Najpierw zdejmujemy stary, dopiero potem
 * zakładamy nowy: odwrotna kolejność przy błędzie zostawiłaby w kalendarzu dwa te same treningi.
 */
export async function moveGarminSchedule(args: {
  scheduledId: number;
  planId: number;
  /** Numer dotychczasowego wpisu w kalendarzu Garmina. */
  scheduleId: string;
  /** Dzień, z którego termin odchodzi — do komunikatu, gdy zdjęcie się nie uda. */
  fromDate: string;
  toDate: string;
}): Promise<MoveOutcome> {
  if (!(await isConnected())) return { kind: 'NOT_CONNECTED' };

  try {
    await unscheduleOnGarmin(Number(args.scheduleId));
  } catch (error) {
    return { kind: 'LEFT_BEHIND', reason: describe(error), date: args.fromDate };
  }

  try {
    // Plan mógł się zmienić od ostatniej wysyłki, więc trening w bibliotece odświeżamy —
    // tak samo jak przy ręcznym wpisywaniu do kalendarza.
    const sent = await sendPlan(db, args.planId);
    const scheduleId = await scheduleOnGarmin(sent.workoutId, args.toDate);
    setGarminSchedule(db, args.scheduledId, { workoutId: sent.workoutId, scheduleId });
    return { kind: 'MOVED', date: args.toDate };
  } catch (error) {
    return { kind: 'REMOVED_ONLY', reason: describe(error) };
  }
}

function describe(error: unknown): string {
  if (error instanceof GarminAuthExpired) {
    return 'Połączenie z Garmin Connect wygasło. Zaloguj się ponownie w Ustawieniach.';
  }
  if (error instanceof GarminError) return error.message;
  return 'Nie udało się połączyć z Garminem. Sprawdź internet.';
}
