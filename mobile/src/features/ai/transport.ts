import { pluralWith } from '@/lib/number';

import { PROVIDER_COMPANIES, PROVIDER_LABELS, type Provider } from './providers';

/**
 * Jedno zapytanie do dostawcy modelu i wszystko, co może pójść nie tak, zanim przyjdzie odpowiedź.
 *
 * Osobny moduł, bo klient sięga po klucz do bezpiecznego magazynu telefonu i w teście nie da się
 * go nawet zaimportować — a akurat milczenie serwera i zerwane połączenie są warte sprawdzenia
 * testem, bo zdarzają się w aplikacji częściej niż cokolwiek innego i najtrudniej je odtworzyć.
 */

export type ErrorOptions = {
  /**
   * Czy powtórzenie tego samego zapytania ma sens. Awaria sieci i cisza po stronie dostawcy mijają
   * same, odmowa z nazwy modelu albo z klucza — nie, i proponowanie wtedy „Ponów” byłoby
   * zapraszaniem do stukania w ścianę.
   */
  retryable?: boolean;
};

export class AiError extends Error {
  readonly retryable: boolean;

  constructor(message: string, options: ErrorOptions = {}) {
    super(message);
    this.retryable = options.retryable ?? false;
  }
}

/**
 * Ile czekamy na odpowiedź. Bez tego zapytanie, które dostawca przyjął i o którym zapomniał, wisiało
 * w nieskończoność: ekran pokazywał „Pytam Gemini…” bez błędu i bez wyjścia. Minuta starcza
 * z zapasem nawet na zdjęcie — dłuższe czekanie i tak nikomu nie służy.
 */
export const TIMEOUT_MS = 60_000;

/**
 * Powód awarii do logu telefonu (`adb logcat -s ReactNativeJS`). Komunikat na ekranie jest dla
 * człowieka i ma mu doradzić, co zrobić; tutaj zostaje to, czego potrzeba do diagnozy, bo awaria
 * sieci bywa chwilowa i nie da się jej odtworzyć na żądanie.
 *
 * Nie zapisujemy ani klucza, ani treści zapytania — w logu ląduje sam powód i nazwa zapytania.
 */
export function logFailure(label: string, detail: string): void {
  console.warn(`FormaSync AI: ${label} — ${detail}`);
}

const seconds = (ms: number): string =>
  pluralWith(Math.round(ms / 1000), 'sekundę', 'sekundy', 'sekund');

const describeError = (error: unknown): string =>
  error instanceof Error ? `${error.name}: ${error.message}` : String(error);

/**
 * Zapytanie z limitem czasu. Rozróżnia trzy rzeczy, które z zewnątrz wyglądają tak samo:
 * cisza po stronie dostawcy, brak drogi do niego i odpowiedź, która po prostu się nie spodobała —
 * ta ostatnia wraca do wołającego, bo tylko on wie, jak ją odczytać.
 */
export async function send(
  url: string,
  init: RequestInit,
  options: { provider: Provider; label: string; timeoutMs?: number },
): Promise<Response> {
  const timeoutMs = options.timeoutMs ?? TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) {
      logFailure(options.label, `cisza przez ${timeoutMs} ms`);
      throw new AiError(
        `${PROVIDER_LABELS[options.provider]} nie odpowiedział przez ${seconds(timeoutMs)}.`,
        { retryable: true },
      );
    }
    logFailure(options.label, describeError(error));
    throw new AiError(
      `Zapytanie nie dotarło do ${PROVIDER_COMPANIES[options.provider]} — sprawdź połączenie`
        + ' z internetem.',
      { retryable: true },
    );
  } finally {
    clearTimeout(timer);
  }
}
