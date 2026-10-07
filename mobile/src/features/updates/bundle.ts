import { formatDateTime } from '@/lib/date';

/**
 * Migawka stanu expo-updates. Osobny typ, a nie wołanie `Updates.*` w środku, bo opis ma dać się
 * przetestować bez modułu natywnego.
 */
export type BundleSnapshot = {
  isEnabled: boolean;
  isEmbeddedLaunch: boolean;
  updateId: string | null;
  createdAt: Date | null;
  channel: string | null;
};

/**
 * Opis działającej paczki JS — po tym widać, czy aktualizacja OTA faktycznie się wgrała.
 *
 * Numer wersji z `app.json` nie nadaje się na taki znacznik: `runtimeVersion` idzie u nas
 * z `appVersion`, więc jego podbicie odcięłoby zainstalowany build od nowych paczek, zamiast
 * je oznaczyć. Identyfikator aktualizacji jest nadawany przez serwer i zmienia się sam.
 */
export function describeBundle(snapshot: BundleSnapshot): string {
  if (!snapshot.isEnabled) return 'Wersja z serwera deweloperskiego — aktualizacje OTA wyłączone.';
  if (snapshot.isEmbeddedLaunch || snapshot.updateId === null) {
    return 'Paczka wbudowana w aplikację — żadna aktualizacja jeszcze się nie wgrała.';
  }

  const parts = [`aktualizacja ${snapshot.updateId.slice(0, 8)}`];
  if (snapshot.createdAt !== null) parts.push(`z ${formatDateTime(snapshot.createdAt.toISOString())}`);
  if (snapshot.channel !== null) parts.push(`kanał ${snapshot.channel}`);
  return `${parts.join(', ')}.`;
}
