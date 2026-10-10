import { describe, expect, it } from '@jest/globals';

import { dayKeysBetween, summarizeHeartRate } from '../mapping';

const at = (h: number, m = 0) => new Date(2026, 9, 1, h, m).toISOString();

describe('summarizeHeartRate', () => {
  it('liczy średnią i maksimum tylko z próbek w oknie sesji', () => {
    const samples = [
      { time: at(9, 59), beatsPerMinute: 200 }, // przed sesją
      { time: at(10, 5), beatsPerMinute: 120 },
      { time: at(10, 30), beatsPerMinute: 150 },
      { time: at(11, 1), beatsPerMinute: 190 }, // po sesji
    ];
    expect(summarizeHeartRate(samples, at(10), at(11))).toEqual({ avgHeartRate: 135, maxHeartRate: 150 });
  });

  it('zwraca puste wartości, gdy nic nie pasuje', () => {
    expect(summarizeHeartRate([], at(10), at(11))).toEqual({ avgHeartRate: null, maxHeartRate: null });
    expect(summarizeHeartRate([{ time: at(8), beatsPerMinute: 100 }], at(10), at(11))).toEqual({
      avgHeartRate: null,
      maxHeartRate: null,
    });
  });
});

describe('dayKeysBetween', () => {
  it('wypisuje dni włącznie i przechodzi przez granicę miesiąca', () => {
    expect(dayKeysBetween(new Date(2026, 8, 29), new Date(2026, 9, 2))).toEqual([
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
    ]);
    expect(dayKeysBetween(new Date(2026, 9, 1), new Date(2026, 9, 1))).toEqual(['2026-10-01']);
  });
});
