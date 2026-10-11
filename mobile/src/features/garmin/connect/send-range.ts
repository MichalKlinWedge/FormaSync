import { setGarminSchedule } from '@/features/calendar/repository';
import type { ScheduledEntry } from '@/features/calendar/repository';
import type { SyncDb } from '@/db/types';
import { addDays, startOfWeek, todayKey } from '@/lib/date';
import { pluralWith } from '@/lib/number';

import { GarminAuthExpired, GarminError } from './client';
import { EmptyPlanError } from './payload';
import { calendarMonth, scheduleIdIn, scheduleOnGarmin, sendPlan, type CalendarItem } from './workouts';

/**
 * Wysyłka treningów z wybranego okresu do kalendarza Garmina.
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

export type SendResult = {
  /** Wpisane do kalendarza Garmina w tym przebiegu. */
  sent: number;
  /** Pominięte, bo ten termin znamy już jako wpisany. */
  known: number;
  /** Zastane u Garmina i dopięte do terminu, zamiast wpisywania ich drugi raz. */
  adopted: number;
  /** Treningi, których kopie leżą w bibliotece Garmina pod tą samą nazwą. */
  copies: number;
  failures: SendFailure[];
  /** Połączenie wygasło w trakcie — reszta nie została nawet spróbowana. */
  stopped: boolean;
};

export type DateRange = { from: string; to: string };

/** Poniedziałek–niedziela następnego tygodnia: domyślny zakres, bo bieżący zwykle już wisi. */
export function nextWeek(today: string = todayKey()): DateRange {
  const monday = addDays(startOfWeek(today), 7);
  return { from: monday, to: addDays(monday, 6) };
}

/** Poniedziałek–niedziela tygodnia, w którym leży podany dzień. */
export function weekAround(dateKey: string): DateRange {
  const monday = startOfWeek(dateKey);
  return { from: monday, to: addDays(monday, 6) };
}

export const inRange = (entries: ScheduledEntry[], range: DateRange): ScheduledEntry[] =>
  entries
    .filter((entry) => entry.scheduledDate >= range.from && entry.scheduledDate <= range.to)
    .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));

/**
 * Do wysłania nadaje się termin z dziś albo z przyszłości, niezrobiony i taki, którego jeszcze
 * nie znamy jako wpisanego. Przeszłości i treningów odbytych nie wysyłamy: kalendarz zegarka ma
 * mówić, co przed Tobą, a nie co za Tobą.
 */
export const pendingForGarmin = (
  entries: ScheduledEntry[],
  today: string = todayKey(),
): ScheduledEntry[] =>
  entries.filter(
    (entry) =>
      entry.scheduledDate >= today && !entry.isCompleted && entry.garminScheduleId === null,
  );

export function describeSend(result: SendResult): string {
  const parts: string[] = [];
  parts.push(
    result.sent === 0
      ? 'Nic nowego nie doszło.'
      : `Wpisane do kalendarza Garmina: ${pluralWith(result.sent, 'trening', 'treningi', 'treningów')}.`,
  );
  if (result.adopted > 0) {
    parts.push(`Zastane u Garmina i dopięte zamiast wpisania drugi raz: ${result.adopted}.`);
  }
  if (result.known > 0) {
    parts.push(`Już tam stało: ${result.known}.`);
  }
  if (result.copies > 0) {
    // Starych kopii nie kasujemy sami: to treningi w bibliotece użytkownika, nie nasze wpisy.
    parts.push(
      `W bibliotece Garmina leżą starsze kopie ${result.copies} treningów o tych samych nazwach — kalendarz ich nie dubluje, ale warto je tam sprzątnąć.`,
    );
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

export async function sendToGarmin(
  db: SyncDb,
  entries: ScheduledEntry[],
  onProgress?: (progress: SendProgress) => void,
  today: string = todayKey(),
): Promise<SendResult> {
  const pending = pendingForGarmin(entries, today);
  const result: SendResult = {
    sent: 0,
    known: entries.filter((entry) => entry.garminScheduleId !== null).length,
    adopted: 0,
    copies: 0,
    failures: [],
    stopped: false,
  };

  // Kalendarz Garmina czytamy raz na miesiąc, a nie raz na trening: tydzień leży zwykle w jednym
  // miesiącu, a przy przełomie w dwóch.
  const months = new Map<string, CalendarItem[]>();
  const monthOf = async (dateKey: string): Promise<CalendarItem[]> => {
    const key = dateKey.slice(0, 7);
    const known = months.get(key);
    if (known !== undefined) return known;
    const items = await calendarMonth(dateKey);
    months.set(key, items);
    return items;
  };

  for (const [index, entry] of pending.entries()) {
    onProgress?.({ done: index, total: pending.length });
    try {
      // Kalendarz Garmina wskazuje na trening z biblioteki, więc najpierw musi tam trafić.
      // Sam trening nie dubluje się nigdy: wysyłka nadpisuje ten o tej samej nazwie.
      const sent = await sendPlan(db, entry.planId);

      // Zanim wpiszemy, sprawdzamy, czy ten trening nie stoi już tego dnia u Garmina. Tak bywa
      // po wpisaniu go z innego urządzenia albo po przeniesieniu terminu, przy którym numer
      // wpisu zniknął z telefonu. Zastany wpis dopinamy, zamiast zakładać drugi taki sam.
      if (sent.duplicates.length > 0) result.copies += 1;

      const standing = scheduleIdIn(
        await monthOf(entry.scheduledDate),
        sent.workoutId,
        entry.scheduledDate,
        entry.planTitle,
      );
      if (standing !== null) {
        setGarminSchedule(db, entry.id, { workoutId: sent.workoutId, scheduleId: standing });
        result.adopted += 1;
        continue;
      }

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
