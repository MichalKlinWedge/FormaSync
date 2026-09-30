// Daty i polskie formaty bez zależności od Intl — ten sam wynik na każdym urządzeniu.
// „Klucz daty” to YYYY-MM-DD w czasie lokalnym; taki format trzyma baza (scheduled_date).

const MONTHS_IN = [
  'stycznia',
  'lutego',
  'marca',
  'kwietnia',
  'maja',
  'czerwca',
  'lipca',
  'sierpnia',
  'września',
  'października',
  'listopada',
  'grudnia',
];

const MONTHS = [
  'Styczeń',
  'Luty',
  'Marzec',
  'Kwiecień',
  'Maj',
  'Czerwiec',
  'Lipiec',
  'Sierpień',
  'Wrzesień',
  'Październik',
  'Listopad',
  'Grudzień',
];

/** Dni tygodnia od poniedziałku — tak układa się siatka kalendarza. */
export const WEEKDAYS_SHORT = ['pn', 'wt', 'śr', 'cz', 'pt', 'so', 'nd'];
export const WEEKDAYS_LONG = [
  'poniedziałek',
  'wtorek',
  'środa',
  'czwartek',
  'piątek',
  'sobota',
  'niedziela',
];

const pad = (n: number) => String(n).padStart(2, '0');

export function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Lokalna północ danego dnia. */
export function fromDateKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export const todayKey = (now: Date = new Date()): string => toDateKey(now);

export function addDays(key: string, days: number): string {
  const date = fromDateKey(key);
  date.setDate(date.getDate() + days);
  return toDateKey(date);
}

export function addMonths(year: number, month: number, delta: number): { year: number; month: number } {
  const date = new Date(year, month + delta, 1);
  return { year: date.getFullYear(), month: date.getMonth() };
}

/** 0 = poniedziałek … 6 = niedziela. */
export function weekdayIndex(key: string): number {
  return (fromDateKey(key).getDay() + 6) % 7;
}

/** Poniedziałek tygodnia, w którym leży podana data. */
export function startOfWeek(key: string): string {
  return addDays(key, -weekdayIndex(key));
}

/** Siatka miesiąca: pełne tygodnie od poniedziałku, z dniami sąsiednich miesięcy. */
export function monthGrid(year: number, month: number): string[][] {
  const first = new Date(year, month, 1);
  const start = new Date(first);
  start.setDate(first.getDate() - ((first.getDay() + 6) % 7));

  const weeks: string[][] = [];
  const cursor = new Date(start);
  while (weeks.length < 6) {
    const week: string[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(toDateKey(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
    // Kończymy, gdy kolejny tydzień zaczyna się już poza bieżącym miesiącem.
    if (cursor.getMonth() !== month && cursor > new Date(year, month + 1, 0)) break;
  }
  return weeks;
}

export const isSameMonth = (key: string, year: number, month: number): boolean => {
  const date = fromDateKey(key);
  return date.getFullYear() === year && date.getMonth() === month;
};

/**
 * Daty cyklu: od `startKey` przez `weeks` tygodni, w wybrane dni tygodnia (0 = poniedziałek).
 * Dzień startowy wlicza się, jeśli wypada w wybrany dzień tygodnia.
 */
export function generateRecurringDates(startKey: string, weekdays: number[], weeks: number): string[] {
  if (weekdays.length === 0 || weeks <= 0) return [];
  const wanted = new Set(weekdays);
  const dates: string[] = [];
  for (let offset = 0; offset < weeks * 7; offset++) {
    const key = addDays(startKey, offset);
    if (wanted.has(weekdayIndex(key))) dates.push(key);
  }
  return dates;
}

// --- Formatowanie ---

/** „1 października 2026”. */
export function formatDate(key: string): string {
  const date = fromDateKey(key);
  return `${date.getDate()} ${MONTHS_IN[date.getMonth()]} ${date.getFullYear()}`;
}

/** „środa, 1 października”. */
export function formatDayWithWeekday(key: string): string {
  const date = fromDateKey(key);
  return `${WEEKDAYS_LONG[weekdayIndex(key)]}, ${date.getDate()} ${MONTHS_IN[date.getMonth()]}`;
}

/** „1 października 2026, 10:00” z pełnego znacznika czasu. */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS_IN[d.getMonth()]} ${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const monthTitle = (year: number, month: number): string => `${MONTHS[month]} ${year}`;

/** Nagłówek grupy dla znacznika czasu: „Październik 2026”. */
export function monthLabel(iso: string): string {
  const d = new Date(iso);
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function monthKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

export function groupByMonth<T>(items: T[], getDate: (item: T) => string): { label: string; items: T[] }[] {
  const groups = new Map<string, { label: string; items: T[] }>();
  for (const item of items) {
    const iso = getDate(item);
    const key = monthKey(iso);
    const group = groups.get(key) ?? { label: monthLabel(iso), items: [] };
    group.items.push(item);
    groups.set(key, group);
  }
  return [...groups.values()];
}

/** Łączy klucz daty i godzinę „HH:mm” w lokalny znacznik czasu. Bez godziny — południe. */
export function combineDateAndTime(key: string, time: string | null): Date {
  const date = fromDateKey(key);
  const [hours, minutes] = (time ?? '12:00').split(':').map(Number);
  date.setHours(hours, minutes, 0, 0);
  return date;
}
