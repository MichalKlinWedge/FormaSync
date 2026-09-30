import { describe, expect, it } from '@jest/globals';

import {
  addDays,
  addMonths,
  combineDateAndTime,
  formatDate,
  formatDateTime,
  formatDayWithWeekday,
  fromDateKey,
  generateRecurringDates,
  groupByMonth,
  isSameMonth,
  monthGrid,
  monthKey,
  monthLabel,
  monthTitle,
  toDateKey,
  weekdayIndex,
} from '../date';

// Znaczniki czasu budujemy w czasie lokalnym, żeby testy nie zależały od strefy czasowej.
const localIso = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min).toISOString();

describe('klucze dat', () => {
  it('zamienia datę na klucz i z powrotem bez przesunięcia strefy', () => {
    expect(toDateKey(new Date(2026, 9, 1))).toBe('2026-10-01');
    expect(toDateKey(fromDateKey('2026-01-05'))).toBe('2026-01-05');
  });

  it('dodaje dni przez granicę miesiąca i roku', () => {
    expect(addDays('2026-10-30', 3)).toBe('2026-11-02');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('przesuwa miesiąc przez granicę roku', () => {
    expect(addMonths(2026, 11, 1)).toEqual({ year: 2027, month: 0 });
    expect(addMonths(2026, 0, -1)).toEqual({ year: 2025, month: 11 });
  });

  it('liczy dzień tygodnia od poniedziałku', () => {
    expect(weekdayIndex('2026-09-28')).toBe(0); // poniedziałek
    expect(weekdayIndex('2026-10-04')).toBe(6); // niedziela
  });
});

describe('monthGrid', () => {
  it('zaczyna tygodnie od poniedziałku i obejmuje cały miesiąc', () => {
    const weeks = monthGrid(2026, 9); // październik 2026
    expect(weeks[0]).toHaveLength(7);
    expect(weekdayIndex(weeks[0][0])).toBe(0);
    expect(weeks[0][0]).toBe('2026-09-28');

    const all = weeks.flat();
    expect(all).toContain('2026-10-01');
    expect(all).toContain('2026-10-31');
    // Bez pustych tygodni po końcu miesiąca.
    expect(weeks.at(-1)!.some((key) => isSameMonth(key, 2026, 9))).toBe(true);
  });

  it('obsługuje luty zaczynający się w poniedziałek', () => {
    const weeks = monthGrid(2027, 1); // luty 2027 zaczyna się w poniedziałek
    expect(weeks[0][0]).toBe('2027-02-01');
    expect(weeks.flat()).toContain('2027-02-28');
  });
});

describe('generateRecurringDates', () => {
  it('tworzy terminy w wybrane dni tygodnia przez podaną liczbę tygodni', () => {
    // 2026-10-01 to czwartek; cykl pn/śr/pt przez 2 tygodnie.
    const dates = generateRecurringDates('2026-10-01', [0, 2, 4], 2);
    expect(dates).toEqual(['2026-10-02', '2026-10-05', '2026-10-07', '2026-10-09', '2026-10-12', '2026-10-14']);
  });

  it('wlicza dzień startowy, gdy pasuje do cyklu', () => {
    expect(generateRecurringDates('2026-10-05', [0], 1)).toEqual(['2026-10-05']);
  });

  it('zwraca pustą listę bez dni lub tygodni', () => {
    expect(generateRecurringDates('2026-10-01', [], 4)).toEqual([]);
    expect(generateRecurringDates('2026-10-01', [0], 0)).toEqual([]);
  });
});

describe('formatowanie', () => {
  it('formatuje daty po polsku', () => {
    expect(formatDate('2026-10-01')).toBe('1 października 2026');
    expect(formatDayWithWeekday('2026-10-01')).toBe('czwartek, 1 października');
    expect(monthTitle(2026, 9)).toBe('Październik 2026');
    expect(formatDateTime(localIso(2026, 3, 9, 7, 5))).toBe('9 marca 2026, 07:05');
  });

  it('grupuje po miesiącach z zachowaniem kolejności', () => {
    const items = [{ d: localIso(2026, 10, 20) }, { d: localIso(2026, 10, 2) }, { d: localIso(2026, 9, 28) }];
    const groups = groupByMonth(items, (i) => i.d);
    expect(groups.map((g) => g.label)).toEqual(['Październik 2026', 'Wrzesień 2026']);
    expect(groups.map((g) => g.items.length)).toEqual([2, 1]);
    expect(monthKey(localIso(2026, 1, 5))).toBe('2026-01');
    expect(monthLabel(localIso(2026, 10, 31))).toBe('Październik 2026');
  });
});

describe('combineDateAndTime', () => {
  it('ustawia godzinę lokalną, a bez godziny południe', () => {
    expect(combineDateAndTime('2026-10-01', '18:30').getHours()).toBe(18);
    expect(combineDateAndTime('2026-10-01', '18:30').getMinutes()).toBe(30);
    expect(combineDateAndTime('2026-10-01', null).getHours()).toBe(12);
  });
});
