import { PROVIDER_LABELS, type Provider } from './providers';

/**
 * Odmowa dostawcy po ludzku.
 *
 * Komunikaty API mówią o formatach i polach, a nie o tym, co zrobić — a zrobić trzeba zwykle jedną
 * z trzech rzeczy: poprawić klucz, wybrać inny model albo poczekać. Tego się tu trzymamy, zamiast
 * pokazywać surową treść, z której nic nie wynika.
 */
export function describeStatus(
  provider: Provider,
  status: number,
  message: string | undefined,
  model: string,
): string {
  const who = PROVIDER_LABELS[provider];

  if (status === 400) {
    // Odmowa z nazwy modelu wraca jako surowy komunikat API — bez tłumaczenia nie mówi nic o tym,
    // gdzie tę nazwę zmienić.
    if ((message ?? '').toLowerCase().includes('model')) {
      return `${who} nie przyjął nazwy modelu „${model}”. Pobierz listę modeli w ustawieniach`
        + ' i wybierz nazwę z niej.';
    }
    return message ?? `${who} odrzucił zapytanie jako nieprawidłowe.`;
  }

  if (status === 401 || status === 403) return `Klucz do ${who} jest nieważny albo bez uprawnień.`;
  if (status === 404) {
    return `Model „${model}” nie istnieje dla tego klucza. Pobierz listę modeli w ustawieniach`
      + ' i wybierz nazwę z niej.';
  }
  if (status === 429) return `Wyczerpany limit zapytań do ${who}. Spróbuj później.`;
  // 529 to „przeciążony” u Anthropic — z punktu widzenia telefonu to ta sama awaria co każda 5xx.
  if (status >= 500) return `${who} chwilowo nie odpowiada. Spróbuj później.`;

  return message ?? `${who} odrzucił zapytanie (kod ${status}).`;
}
