import { setGarminSchedule } from '@/features/calendar/repository';
import type { ScheduledEntry } from '@/features/calendar/repository';
import type { SyncDb } from '@/db/types';
import { startOfWeek } from '@/lib/date';
import { pluralWith } from '@/lib/number';

import { GarminAuthExpired, GarminError } from './client';
import { EmptyPlanError } from './payload';
import { scheduleOnGarmin, sendPlan } from './workouts';

/**
 * Wysyłka całego tygodnia do kalendarza Garmina.
 *
 * Plan układa się i poprawia tygodniami, a wpisywanie go do Garmina szło treningiem po treningu:
 * wejście w termin, przycisk, powrót, następny. Przy pięciu jednostkach to dwadzieścia dotknięć
 * za każdym razem, gdy w tygodniu coś się przesunie.
 *
 * Hurtem, ale nie na oślep: każdy trening to u Garmina osobna rozmowa — najpierw biblioteka,
 * potem kalendarz — więc idą po kolei, a błąd na jednym nie przerywa reszty. Wyjątkiem jest
 * wygasłe połączenie: po nim nie zadziała już nic i dalsze próby tylko mnożyłyby ten sam błąd.
 */

export type SendFailure = { date: string; title: string; reason: string };

export type WeekSendResult = {
  /** Wpisane do kalendarza Garmina w tym przebiegu. */
  sent: number;
  /** Pominięte, bo już tam stały. */
  already: number;
  failures: SendFailure[];
  /** Połączenie wygasło w trakcie — reszta nie została nawet spróbowana. */
  stopped: boolean;
};

/** Terminy tygodnia, do którego należy wskazany dzień. */
export const weekOf = (entries: ScheduledEntry[], dateKey: string): ScheduledEntry[] => {
  const week = startOfWeek(dateKey);
  return entries.filter((entry) => startOfWeek(entry.scheduledDate) === week);
};

/**
 * Do wysłania nadaje się termin niezrobiony, którego jeszcze nie ma w kalendarzu Garmina.
 * Zrobionego nie wysyłamy, bo kalendarz zegarka ma mówić, co przed Tobą, a nie co za Tobą.
 */
export const pendingForGarmin = (entries: ScheduledEntry[]): ScheduledEntry[] =>
  entries.filter((entry) => !entry.isCompleted && entry.garminScheduleId === null);

export function describeWeekSend(result: WeekSendResult): string {
  const parts: string[] = [];
  parts.push(
    result.sent === 0
      ? 'Nic nowego nie doszło.'
      : `Wpisane do kalendarza Garmina: ${pluralWith(result.sent, 'trening', 'treningi', 'treningów')}.`,
  );
  if (result.already > 0) {
    parts.push(`Już tam stało: ${result.already}.`);
  }
  for (const failure of result.failures) {
    parts.push(`${failure.date} — ${failure.title}: ${failure.reason}`);
  }
  if (result.stopped) {
    parts.push('Połączenie z Garmin Connect wygasło — zaloguj się ponownie i powtórz.');
  }
  return parts.join('\n');
}

function describe(error: unknown): string {
  if (error instanceof EmptyPlanError) return error.message;
  if (error instanceof GarminError) return error.message;
  return 'Nie udało się połączyć z Garminem.';
}

export type SendProgress = { done: number; total: number };

export async function sendWeekToGarmin(
  db: SyncDb,
  entries: ScheduledEntry[],
  onProgress?: (progress: SendProgress) => void,
): Promise<WeekSendResult> {
  const pending = pendingForGarmin(entries);
  const result: WeekSendResult = {
    sent: 0,
    already: entries.length - pending.length,
    failures: [],
    stopped: false,
  };

  for (const [index, entry] of pending.entries()) {
    onProgress?.({ done: index, total: pending.length });
    try {
      // Kalendarz Garmina wskazuje na trening z biblioteki, więc najpierw musi tam trafić.
      const sent = await sendPlan(db, entry.planId);
      const scheduleId = await scheduleOnGarmin(sent.workoutId, entry.scheduledDate);
      setGarminSchedule(db, entry.id, { workoutId: sent.workoutId, scheduleId });
      result.sent += 1;
    } catch (error) {
      if (error instanceof GarminAuthExpired) {
        result.stopped = true;
        break;
      }
      result.failures.push({
        date: entry.scheduledDate,
        title: entry.planTitle,
        reason: describe(error),
      });
    }
  }

  onProgress?.({ done: pending.length, total: pending.length });
  return result;
}
