import { describe, expect, it } from '@jest/globals';

import { formatSessionDate, groupByMonth, monthKey, monthLabel } from '../format';

// Daty budujemy w czasie lokalnym, żeby test nie zależał od strefy czasowej maszyny.
const local = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min).toISOString();

describe('formatSessionDate', () => {
  it('składa polską datę z godziną', () => {
    expect(formatSessionDate(local(2026, 10, 1, 10, 5))).toBe('1 października 2026, 10:05');
    expect(formatSessionDate(local(2026, 3, 9, 7, 0))).toBe('9 marca 2026, 07:00');
  });
});

describe('monthLabel i monthKey', () => {
  it('opisuje i grupuje miesiąc', () => {
    expect(monthLabel(local(2026, 10, 31))).toBe('Październik 2026');
    expect(monthKey(local(2026, 1, 5))).toBe('2026-01');
  });
});

describe('groupByMonth', () => {
  it('zachowuje kolejność wejścia i łączy wpisy z jednego miesiąca', () => {
    const items = [
      { d: local(2026, 10, 20) },
      { d: local(2026, 10, 2) },
      { d: local(2026, 9, 28) },
    ];
    const groups = groupByMonth(items, (i) => i.d);
    expect(groups.map((g) => g.label)).toEqual(['Październik 2026', 'Wrzesień 2026']);
    expect(groups[0].items).toHaveLength(2);
    expect(groups[1].items).toHaveLength(1);
  });
});
