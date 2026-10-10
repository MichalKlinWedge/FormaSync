import { connectApi, GarminError } from './client';

/**
 * Dane zdrowotne z Garmin Connect: tętno spoczynkowe, sen, HRV, ciśnienie i kalorie.
 *
 * To nieudokumentowane API, więc każde pole odpowiedzi traktujemy jako możliwe do zniknięcia —
 * brakująca wartość ma zostawić puste miejsce w dniu, a nie wywrócić całą synchronizację.
 * Dlatego odczyt jest podzielony na pobranie i osobne, czyste przeliczenie, które da się sprawdzić
 * testem bez sieci.
 */

/** Nazwa konta w ścieżkach adresów Garmina. Pobierana raz — w trakcie sesji się nie zmienia. */
let cachedAccount: string | null = null;

export async function accountName(): Promise<string> {
  if (cachedAccount !== null) return cachedAccount;
  const profile = await connectApi<{ displayName?: string | null }>('/userprofile-service/socialProfile');
  const name = profile?.displayName;
  if (!name) throw new GarminError('Garmin nie podał nazwy konta.');
  cachedAccount = name;
  return name;
}

/** Czyści zapamiętaną nazwę konta — po wylogowaniu należy ona już do kogo innego. */
export const forgetAccount = (): void => {
  cachedAccount = null;
};

/** Dzienne podsumowanie: stąd bierzemy tętno spoczynkowe i kalorie aktywne. */
export type DailySummaryRow = {
  restingHeartRate?: number | null;
  activeKilocalories?: number | null;
};

export function parseSummary(row: DailySummaryRow | null): {
  restingHeartRate: number | null;
  activeCalories: number | null;
} {
  return {
    restingHeartRate: positive(row?.restingHeartRate),
    activeCalories: positive(row?.activeKilocalories),
  };
}

/** Sen. Garmin podaje go w sekundach, a my trzymamy w minutach. */
export type SleepRow = {
  dailySleepDTO?: { sleepTimeSeconds?: number | null } | null;
};

export function parseSleepMinutes(row: SleepRow | null): number | null {
  const seconds = positive(row?.dailySleepDTO?.sleepTimeSeconds);
  return seconds === null ? null : Math.round(seconds / 60);
}

/** HRV. Bierzemy średnią z nocy — to ta wartość, którą zegarek pokazuje jako wynik dnia. */
export type HrvRow = {
  hrvSummary?: { lastNightAvg?: number | null } | null;
};

export const parseHrv = (row: HrvRow | null): number | null => positive(row?.hrvSummary?.lastNightAvg);

/** Ciśnienie. Przychodzi zakresem dni, pogrupowane w podsumowania. */
export type BloodPressureRange = {
  measurementSummaries?:
    | {
        measurements?:
          | {
              systolic?: number | null;
              diastolic?: number | null;
              measurementTimestampLocal?: string | null;
            }[]
          | null;
      }[]
    | null;
};

export type Pressure = { systolic: number; diastolic: number };

/**
 * Ciśnienie po dniach. Gdy w jednym dniu jest kilka pomiarów, zostawiamy ostatni — tak samo
 * robiliśmy wcześniej, a przy jednej wartości na dzień ostatni pomiar jest najbliższy wieczorowi,
 * do którego odnosi się reszta podsumowania.
 */
export function parseBloodPressure(range: BloodPressureRange | null): Map<string, Pressure> {
  const byDay = new Map<string, Pressure>();
  for (const summary of range?.measurementSummaries ?? []) {
    for (const measurement of summary.measurements ?? []) {
      const stamp = measurement.measurementTimestampLocal;
      const systolic = positive(measurement.systolic);
      const diastolic = positive(measurement.diastolic);
      if (!stamp || systolic === null || diastolic === null) continue;
      // Znacznik jest czasem lokalnym, więc dzień czytamy wprost z jego początku.
      byDay.set(stamp.slice(0, 10), { systolic: Math.round(systolic), diastolic: Math.round(diastolic) });
    }
  }
  return byDay;
}

/** Próbki tętna z całej doby — po nich poznajemy tętno treningu prowadzonego bez aktywności na zegarku. */
export type DailyHeartRateRow = {
  heartRateValues?: [number, number | null][] | null;
};

export function parseHeartRateSamples(
  row: DailyHeartRateRow | null,
): { time: string; beatsPerMinute: number }[] {
  return (row?.heartRateValues ?? [])
    .filter((pair): pair is [number, number] => Array.isArray(pair) && typeof pair[1] === 'number')
    .map(([stamp, beatsPerMinute]) => ({
      time: new Date(stamp).toISOString(),
      beatsPerMinute,
    }));
}

const positive = (value: number | null | undefined): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;

/** Podsumowanie dnia: tętno spoczynkowe i kalorie aktywne. */
export async function fetchDailySummary(dateKey: string): Promise<DailySummaryRow | null> {
  const account = encodeURIComponent(await accountName());
  return connectApi<DailySummaryRow>(
    `/usersummary-service/usersummary/daily/${account}?calendarDate=${dateKey}`,
  );
}

/** Sen z danej nocy. */
export async function fetchSleep(dateKey: string): Promise<SleepRow | null> {
  const account = encodeURIComponent(await accountName());
  return connectApi<SleepRow>(
    `/wellness-service/wellness/dailySleepData/${account}?date=${dateKey}&nonSleepBufferMinutes=60`,
  );
}

/** HRV z danej nocy. */
export const fetchHrv = (dateKey: string): Promise<HrvRow | null> =>
  connectApi<HrvRow>(`/hrv-service/hrv/${dateKey}`);

/** Pomiary ciśnienia z zakresu dni — jednym zapytaniem, bo to rzadkie dane. */
export const fetchBloodPressure = (fromKey: string, toKey: string): Promise<BloodPressureRange | null> =>
  connectApi<BloodPressureRange>(
    `/bloodpressure-service/bloodpressure/range/${fromKey}/${toKey}?includeAll=true`,
  );

/** Tętno z całej doby. Pytamy tylko o dni, w których trening czeka na pomiary. */
export async function fetchDailyHeartRate(dateKey: string): Promise<DailyHeartRateRow | null> {
  const account = encodeURIComponent(await accountName());
  return connectApi<DailyHeartRateRow>(
    `/wellness-service/wellness/dailyHeartRate/${account}?date=${dateKey}`,
  );
}
