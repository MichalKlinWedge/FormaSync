/**
 * Losowość kryptograficzna. Sól i jednorazowy wektor muszą być nieprzewidywalne —
 * `Math.random` nie nadaje się do tego i nie jest tu żadną awaryjną opcją. Gdy nie ma z czego
 * losować, wolimy odmówić zaszyfrowania niż wydać kopię, która tylko wygląda na bezpieczną.
 */

export class RandomnessUnavailableError extends Error {
  constructor() {
    super(
      'Ta wersja aplikacji nie umie bezpiecznie losować. Zainstaluj nowszą wersję, żeby szyfrować kopie.',
    );
  }
}

export function randomBytes(length: number): Uint8Array {
  const webCrypto = (globalThis as { crypto?: Crypto }).crypto;
  if (typeof webCrypto?.getRandomValues === 'function') {
    return webCrypto.getRandomValues(new Uint8Array(length));
  }

  // Moduł natywny wczytujemy leniwie i pod osłoną: w paczce wgranej przez aktualizację
  // mogłoby go nie być, a wtedy sam import wywróciłby ekran, zamiast pokazać powód.
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const crypto = require('expo-crypto') as { getRandomBytes?: (count: number) => Uint8Array };
    if (typeof crypto.getRandomBytes === 'function') return crypto.getRandomBytes(length);
  } catch {
    // Brak modułu rozpoznajemy niżej — nie ma czym zastąpić losowości.
  }

  throw new RandomnessUnavailableError();
}
