import { connectApi, GarminAuthExpired } from './client';

/**
 * Rekordy życiowe prowadzone przez Garmina. Nasze własne liczymy z odcinków, ale sięgają tylko
 * tam, gdzie sięga wczytana historia; Garmin pamięta je od początku konta.
 *
 * API nie jest dokumentowane, więc rozpoznajemy wyłącznie rodzaje, których jesteśmy pewni, i tylko
 * wtedy, gdy wartość mieści się w zdrowym zakresie. Rekord opisany źle jest tu gorszy niż brak
 * rekordu: na jego podstawie ustawia się tempa całego cyklu treningowego.
 */

export type GarminRecordRow = {
  typeId?: number | null;
  prTypeLabelKey?: string | null;
  value?: number | null;
  prStartTimeGmtFormatted?: string | null;
  prStartTimeGmt?: string | null;
};

/** Rodzaje, które umiemy rozpoznać. Reszta rekordów Garmina nas nie dotyczy. */
export type RecordKey =
  | 'DIST_1K'
  | 'DIST_5K'
  | 'DIST_10K'
  | 'DIST_HALF'
  | 'DIST_MARATHON'
  | 'LONGEST_RUN';

type Shape = {
  label: string;
  /** Dystans rekordu; null, gdy dystans jest samą wartością rekordu. */
  distanceMeters: number | null;
  /** Zdrowy zakres wartości. Poza nim rekord odrzucamy, zamiast zgadywać, co znaczy. */
  range: { min: number; max: number };
};

const SHAPES: Record<RecordKey, Shape> = {
  DIST_1K: { label: '1 km', distanceMeters: 1000, range: { min: 120, max: 1800 } },
  DIST_5K: { label: '5 km', distanceMeters: 5000, range: { min: 600, max: 9000 } },
  DIST_10K: { label: '10 km', distanceMeters: 10000, range: { min: 1200, max: 18000 } },
  DIST_HALF: { label: 'Półmaraton', distanceMeters: 21097, range: { min: 2400, max: 36000 } },
  DIST_MARATHON: { label: 'Maraton', distanceMeters: 42195, range: { min: 5400, max: 72000 } },
  // Tu wartością jest dystans, nie czas — stąd zakres w metrach.
  LONGEST_RUN: { label: 'Najdłuższy bieg', distanceMeters: null, range: { min: 1000, max: 500000 } },
};

/**
 * Rodzaj rekordu z etykiety albo z numeru typu. Etykietę bierzemy pierwszą, bo numery typów
 * Garmin przestawiał — a nazwa klucza nosi dystans wprost.
 */
export function recordKeyOf(row: GarminRecordRow): RecordKey | null {
  const label = (row.prTypeLabelKey ?? '').toLowerCase();
  if (label !== '') {
    if (label.includes('marathon') && !label.includes('half')) return 'DIST_MARATHON';
    if (label.includes('half')) return 'DIST_HALF';
    if (label.includes('10k')) return 'DIST_10K';
    if (label.includes('5k')) return 'DIST_5K';
    if (label.includes('1k') && !label.includes('10k')) return 'DIST_1K';
    if (label.includes('longest') && label.includes('run')) return 'LONGEST_RUN';
    // Etykieta jest, ale mówi o czymś, czego nie obsługujemy — nie zgadujemy dalej z numeru.
    return null;
  }

  const byType: Record<number, RecordKey> = {
    1: 'DIST_1K',
    3: 'DIST_5K',
    4: 'DIST_10K',
    5: 'DIST_HALF',
    6: 'DIST_MARATHON',
    7: 'LONGEST_RUN',
  };
  return row.typeId === null || row.typeId === undefined ? null : (byType[row.typeId] ?? null);
}

export type GarminRecord = {
  recordKey: RecordKey;
  label: string;
  distanceMeters: number | null;
  seconds: number | null;
  achievedOn: string | null;
};

/** Data rekordu w postaci dnia; null, gdy Garmin jej nie podał albo jest nieczytelna. */
function achievedOn(row: GarminRecordRow): string | null {
  const raw = (row.prStartTimeGmtFormatted ?? row.prStartTimeGmt ?? '').trim();
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(raw);
  return match === null ? null : match[1];
}

export function parseGarminRecords(rows: GarminRecordRow[] | null): GarminRecord[] {
  const found = new Map<RecordKey, GarminRecord>();

  for (const row of rows ?? []) {
    const key = recordKeyOf(row);
    if (key === null) continue;
    const value = row.value;
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;

    const shape = SHAPES[key];
    if (value < shape.range.min || value > shape.range.max) continue;
    // Jeden rodzaj to jeden rekord: Garmin potrafi zwrócić historię, a nas interesuje najlepszy.
    const existing = found.get(key);
    const better =
      existing === undefined ||
      (shape.distanceMeters === null
        ? (existing.distanceMeters ?? 0) < value
        : (existing.seconds ?? Infinity) > value);
    if (!better) continue;

    found.set(key, {
      recordKey: key,
      label: shape.label,
      distanceMeters: shape.distanceMeters ?? Math.round(value),
      seconds: shape.distanceMeters === null ? null : Math.round(value),
      achievedOn: achievedOn(row),
    });
  }

  return [...found.values()];
}

/**
 * Oba znane adresy rekordów. API jest nieudokumentowane i Garmin przestawiał już te ścieżki,
 * więc po nieudanej pierwszej próbujemy drugiej, zamiast milcząco zwracać pustą listę.
 */
const paths = (account: string): string[] => [
  `/personalrecord-service/personalrecord/prs/${encodeURIComponent(account)}`,
  '/personalrecord-service/personalrecord/prs',
];

/**
 * Rekordy z Garmin Connect. Odmowę zjadamy — konto bez ani jednego rekordu to nie błąd — ale
 * wygasłe połączenie przepuszczamy, bo z nim nie zadziała już nic.
 */
export async function fetchGarminRecords(account: string): Promise<GarminRecord[]> {
  for (const path of paths(account)) {
    try {
      const records = parseGarminRecords(await connectApi<GarminRecordRow[]>(path));
      if (records.length > 0) return records;
    } catch (error) {
      if (error instanceof GarminAuthExpired) throw error;
    }
  }
  return [];
}
