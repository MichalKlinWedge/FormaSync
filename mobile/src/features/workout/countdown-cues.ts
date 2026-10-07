/**
 * Kiedy odliczanie się odzywa — same reguły, bez dźwięku, bazy i modułów natywnych. Z jednego
 * miejsca czerpią oba kanały: pikanie na ekranie trwającego treningu i powiadomienia systemowe
 * na wypadek wygaszonego ekranu — a także oba odliczania: przerwa między seriami i seria na
 * czas, jak plank. Rozdzielone stałe rozjechałyby się przy pierwszej zmianie.
 */

const COUNTDOWN_FROM = 5;

/**
 * Dzwonek na dziesiątej sekundzie. Ostatnie pięć piknięć wypada już na samym końcu — za późno,
 * żeby odstawić telefon, dopiąć pas i stanąć pod sztangą. Dziesięć sekund wcześniej na to
 * starcza, a w serii na czas zapowiada ostatnią dziesiątkę do wytrzymania.
 */
export const COUNTDOWN_WARNING_SECONDS = 10;

export type Cue = 'warning' | 'tick' | 'end';

/**
 * Jaki sygnał należy się tej sekundzie odliczania — osobno od odtwarzania, żeby regułę dawało
 * się sprawdzić bez dźwięku i bez urządzenia.
 */
export function countdownCue(remainingSeconds: number): Cue | null {
  if (remainingSeconds === COUNTDOWN_WARNING_SECONDS) return 'warning';
  if (remainingSeconds >= 1 && remainingSeconds <= COUNTDOWN_FROM) return 'tick';
  // Przerwa nigdy tu nie dociera — gaśnie w chwili końca i ma własny sygnał. Seria na czas
  // zostaje na ekranie z zerem, dopóki jej nie zapiszesz, więc zero musi się odezwać samo.
  if (remainingSeconds <= 0) return 'end';
  return null;
}

/**
 * Dwa sygnały na jedno odliczanie, osobnymi kanałami Androida. Ostrzeżenie i koniec to różne
 * wiadomości — na osobnych kanałach da się w ustawieniach systemu uciszyć jedno bez drugiego.
 */
export type CountdownNotification = { kind: 'warning' | 'end'; afterSeconds: number };

/**
 * Co i kiedy zaplanować dla odliczania o danej długości — osobno od wywołań natywnych, żeby
 * regułę dawało się sprawdzić bez urządzenia.
 *
 * Odliczanie krótsze niż samo wyprzedzenie nie dostaje ostrzeżenia: zabrzmiałoby równo z końcem
 * albo po nim, czyli ostrzegałoby o czymś, co już się stało.
 */
export function countdownNotificationPlan(seconds: number): CountdownNotification[] {
  if (seconds <= 0) return [];
  const plan: CountdownNotification[] = [];
  if (seconds > COUNTDOWN_WARNING_SECONDS) {
    plan.push({ kind: 'warning', afterSeconds: Math.ceil(seconds - COUNTDOWN_WARNING_SECONDS) });
  }
  plan.push({ kind: 'end', afterSeconds: Math.ceil(seconds) });
  return plan;
}
