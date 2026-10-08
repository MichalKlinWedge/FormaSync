/**
 * Ręczne sprawdzenie aktualizacji OTA.
 *
 * Sam `expo-updates` zagląda na serwer przy starcie aplikacji i instaluje paczkę dopiero przy
 * następnym uruchomieniu — czyli nowa wersja pojawia się za drugim razem i nie da się tego
 * przyspieszyć czekaniem. Ten moduł robi to na żądanie: sprawdza, pobiera i mówi, co zastał.
 *
 * Zależności przyjmuje jako argument, a nie woła `Updates.*` w środku, bo cały moduł natywny
 * działa wyłącznie w zbudowanej aplikacji — inaczej nie dałoby się tego przetestować.
 */

export type UpdateCheck =
  /** Aktualizacje wyłączone — serwer deweloperski albo build bez expo-updates. */
  | { state: 'disabled' }
  /** Na serwerze nie ma nic nowszego. */
  | { state: 'current' }
  /** Paczka pobrana i czeka na restart aplikacji. */
  | { state: 'ready' }
  | { state: 'failed'; reason: string };

export type UpdateApi = {
  isEnabled: boolean;
  checkForUpdateAsync: () => Promise<{ isAvailable: boolean }>;
  fetchUpdateAsync: () => Promise<{ isNew: boolean }>;
};

export async function fetchNewerBundle(updates: UpdateApi): Promise<UpdateCheck> {
  if (!updates.isEnabled) return { state: 'disabled' };

  try {
    const available = await updates.checkForUpdateAsync();
    if (!available.isAvailable) return { state: 'current' };

    const fetched = await updates.fetchUpdateAsync();
    // Pobranie bez nowej paczki zdarza się przy wycofaniu aktualizacji na serwerze — nie ma
    // czego uruchamiać, a udawanie sukcesu kazałoby szukać zmian, których nie ma.
    return fetched.isNew ? { state: 'ready' } : { state: 'current' };
  } catch (e) {
    return { state: 'failed', reason: e instanceof Error ? e.message : String(e) };
  }
}

/** Komunikat dla użytkownika; tytuł osobno, bo trafia do okienka z przyciskami. */
export function describeCheck(check: UpdateCheck): { title: string; message: string } {
  switch (check.state) {
    case 'disabled':
      return {
        title: 'Aktualizacje wyłączone',
        message: 'Ta wersja aplikacji pobiera kod z serwera deweloperskiego, więc nie ma czego sprawdzać.',
      };
    case 'current':
      return { title: 'Masz najnowszą wersję', message: 'Na serwerze nie ma nowszej paczki.' };
    case 'ready':
      return { title: 'Pobrano nową wersję', message: 'Zacznie działać po ponownym uruchomieniu aplikacji.' };
    case 'failed':
      return { title: 'Nie udało się sprawdzić', message: check.reason };
  }
}
