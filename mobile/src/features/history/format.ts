// Polskie formaty dat bez zależności od Intl — ten sam wynik na każdym urządzeniu.

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

const pad = (n: number) => String(n).padStart(2, '0');

/** „1 października 2026, 10:00” w czasie lokalnym urządzenia. */
export function formatSessionDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS_IN[d.getMonth()]} ${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Nagłówek grupy: „Październik 2026”. */
export function monthLabel(iso: string): string {
  const d = new Date(iso);
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** Klucz grupowania po miesiącu, w czasie lokalnym. */
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
