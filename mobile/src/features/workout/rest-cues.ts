/**
 * Kiedy przerwa się odzywa — same reguły, bez dźwięku, bazy i modułów natywnych. Z tego samego
 * miejsca czerpią oba kanały: pikanie na ekranie trwającego treningu i powiadomienia systemowe
 * na wypadek wygaszonego ekranu. Rozdzielone stale rozjechałyby się przy pierwszej zmianie.
 */

const COUNTDOWN_FROM = 5;
/**
 * Dzwonek na dziesiątej sekundzie. Ostatnie pięć piknięć to już sam start serii — za późno,
 * żeby odstawić telefon, dopiąć pas i stanąć pod sztangą. Dziesięć sekund wcześniej na to starcza.
 */
export const REST_WARNING_SECONDS = 10;

export type RestCue = 'warning' | 'tick';

/**
 * Jaki sygnał należy się tej sekundzie odliczania — osobno od odtwarzania, żeby regułę dawało
 * się sprawdzić bez dźwięku i bez urządzenia.
 */
export function restCue(remainingSeconds: number): RestCue | null {
  if (remainingSeconds === REST_WARNING_SECONDS) return 'warning';
  if (remainingSeconds >= 1 && remainingSeconds <= COUNTDOWN_FROM) return 'tick';
  return null;
}

/**
 * Dwa sygnały na jedną przerwę, osobnymi kanałami Androida. Ostrzeżenie i koniec to różne
 * wiadomości — na osobnych kanałach da się w ustawieniach systemu uciszyć jedno bez drugiego.
 */
export type RestNotification = { kind: 'warning' | 'end'; afterSeconds: number };

/**
 * Co i kiedy zaplanować dla przerwy o danej długości — osobno od wywołań natywnych, żeby
 * regułę dawało się sprawdzić bez urządzenia.
 *
 * Przerwa krótsza niż samo wyprzedzenie nie dostaje ostrzeżenia: zabrzmiałoby równo z końcem
 * albo po nim, czyli ostrzegałoby o czymś, co już się stało.
 */
export function restNotificationPlan(seconds: number): RestNotification[] {
  if (seconds <= 0) return [];
  const plan: RestNotification[] = [];
  if (seconds > REST_WARNING_SECONDS) {
    plan.push({ kind: 'warning', afterSeconds: Math.ceil(seconds - REST_WARNING_SECONDS) });
  }
  plan.push({ kind: 'end', afterSeconds: Math.ceil(seconds) });
  return plan;
}
