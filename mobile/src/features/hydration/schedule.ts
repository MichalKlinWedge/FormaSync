import { expectedAt, parseTime, type DayWindow } from './day';

/**
 * Godziny przypomnień. `expo-notifications` nie umie ocenić warunku w chwili odpalenia — alarm
 * albo jest zaplanowany, albo nie — więc warunek sprawdzamy przy planowaniu, a planujemy od nowa
 * po każdym wpisie i przy każdym wejściu do aplikacji. Wypicie szklanki samo zdejmuje najbliższe
 * przypomnienia, a dodatkowo Android i tak kasuje alarmy przy aktualizacji.
 */

/** Najkrótszy i najdłuższy sensowny krok. Poza tym zakresem to już nie pilnowanie. */
export const EVERY_MINUTES_RANGE = { min: 30, max: 240 };

/** Kolejne godziny w oknie dnia, od pierwszego kroku po otwarciu do zamknięcia okna. */
export function reminderSlots(window: DayWindow, everyMinutes: number, day: Date): Date[] {
  const from = parseTime(window.from);
  const to = parseTime(window.to);
  if (from === null || to === null || to <= from) return [];
  const step = Math.round(everyMinutes);
  if (step < EVERY_MINUTES_RANGE.min || step > EVERY_MINUTES_RANGE.max) return [];

  const slots: Date[] = [];
  for (let minutes = from + step; minutes <= to; minutes += step) {
    const at = new Date(day.getFullYear(), day.getMonth(), day.getDate());
    at.setMinutes(minutes);
    slots.push(at);
  }
  return slots;
}

/**
 * Które przypomnienia mają sens. Zostaje slot, na którym przy dzisiejszym stanie będziesz
 * poniżej kreski — jeśli o dziesiątej wypiłeś litr, dozorca milczy do popołudnia.
 */
export function slotsToRemind(
  slots: Date[],
  consumedMl: number,
  targetMl: number,
  window: DayWindow,
  now: Date,
): Date[] {
  return slots.filter(
    (slot) => slot.getTime() > now.getTime() && consumedMl < expectedAt(targetMl, window, slot),
  );
}
