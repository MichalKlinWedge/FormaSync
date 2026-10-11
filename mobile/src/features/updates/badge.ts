/**
 * Czy na „Dziś” pokazać znak, że jest nowa wersja.
 *
 * Ikona pojawia się tylko wtedy, gdy jest co zrobić — przycisk „Sprawdź aktualizacje” stoi
 * w ustawieniach i tam zostaje. Na ekranie startowym stały przycisk byłby szumem: aktualizacja
 * zdarza się raz na kilka dni, a przez resztę czasu nie ma po co o niej przypominać.
 *
 * Sama reguła leży tu, osobno od `expo-updates`, bo moduł natywny działa wyłącznie w zbudowanej
 * aplikacji — inaczej nie dałoby się tego sprawdzić testem.
 */

export type UpdateStatus = {
  /** Aktualizacje OTA w ogóle działają — w trybie deweloperskim nie działają. */
  isEnabled: boolean;
  /** Serwer ma nowszą paczkę niż ta, która chodzi. */
  isUpdateAvailable: boolean;
  /** Nowsza paczka jest już pobrana i czeka na restart aplikacji. */
  isUpdatePending: boolean;
  isDownloading: boolean;
  isRestarting: boolean;
};

export type UpdateBadge =
  /** Nic nowego albo nie ma czego sprawdzać — ikony nie ma wcale. */
  | 'HIDDEN'
  /** Jest nowsza paczka, ale jeszcze nieściągnięta. */
  | 'AVAILABLE'
  /** Pobrana i czeka na restart. */
  | 'READY'
  /** Pobieranie albo restart w toku. */
  | 'WORKING';

export function updateBadge(status: UpdateStatus): UpdateBadge {
  if (!status.isEnabled) return 'HIDDEN';
  if (status.isRestarting || status.isDownloading) return 'WORKING';
  // Pobrana przed niepobraną: gdy paczka już leży na telefonie, zostaje jedno — uruchomić ją.
  if (status.isUpdatePending) return 'READY';
  if (status.isUpdateAvailable) return 'AVAILABLE';
  return 'HIDDEN';
}

/** Co ikona znaczy. Dotyk jest nieoczywisty, a sam obrazek nie mówi nic czytnikowi ekranu. */
export const BADGE_LABELS: Record<Exclude<UpdateBadge, 'HIDDEN'>, string> = {
  AVAILABLE: 'Jest nowa wersja — dotknij, żeby pobrać',
  READY: 'Nowa wersja gotowa — dotknij, żeby uruchomić',
  WORKING: 'Trwa pobieranie nowej wersji',
};

/**
 * Jak często wolno pytać serwer po powrocie aplikacji na pierwszy plan. `expo-updates` sprawdza
 * sam przy starcie, ale telefon potrafi trzymać aplikację w tle tygodniami — bez dopytania ikona
 * nigdy by się wtedy nie pojawiła. Kwadrans wystarczy: aktualizacje nie wychodzą co minutę.
 */
export const CHECK_COOLDOWN_MS = 15 * 60 * 1000;

/** Czy od ostatniego sprawdzenia minęło dość czasu. Brak daty znaczy „jeszcze nie pytaliśmy”. */
export function shouldCheck(lastCheck: Date | undefined, now: number): boolean {
  return lastCheck === undefined || now - lastCheck.getTime() >= CHECK_COOLDOWN_MS;
}
