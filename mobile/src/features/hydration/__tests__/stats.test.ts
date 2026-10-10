/**
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';

import { averageMl, currentStreak, withTargets, type DaySummary } from '../stats';

const day = (dayKey: string, milliliters: number, trainingSeconds = 0, extraMl = 0): DaySummary => ({
  dayKey,
  milliliters,
  trainingSeconds,
  extraMl,
});

describe('withTargets', () => {
  it('liczy cel osobno na każdy dzień', () => {
    const rows = withTargets(
      [day('2026-10-09', 2400), day('2026-10-10', 2400, 3600)],
      80,
      null,
    );

    // Dzień z godziną biegu ma cel wyższy o pół litra, więc te same 2,4 l go nie dowożą.
    expect(rows[0]).toMatchObject({ target: 2400, met: true });
    expect(rows[1]).toMatchObject({ target: 2900, met: false });
  });

  it('uwzględnia korektę tamtego dnia', () => {
    const [row] = withTargets([day('2026-10-10', 2400, 0, 250)], 80, null);
    expect(row).toMatchObject({ target: 2650, met: false });
  });

  it('stały cel obowiązuje wszystkie dni', () => {
    const rows = withTargets([day('2026-10-09', 2000), day('2026-10-10', 2000)], 80, 2000);
    expect(rows.every((row) => row.met)).toBe(true);
  });
});

describe('currentStreak', () => {
  const rows = (entries: [string, number][]) =>
    withTargets(
      entries.map(([dayKey, milliliters]) => day(dayKey, milliliters)),
      80,
      2000,
    );

  it('liczy dni z rzędu, w których cel został dowieziony', () => {
    const days = rows([
      ['2026-10-08', 2000],
      ['2026-10-09', 2000],
      ['2026-10-10', 2000],
    ]);
    expect(currentStreak(days, '2026-10-10')).toBe(3);
  });

  it('niedokończony dzisiejszy dzień nie przerywa serii', () => {
    // Przedpołudnie: dziś wypite 300 ml, ale wczoraj i przedwczoraj cel dowieziony.
    const days = rows([
      ['2026-10-08', 2000],
      ['2026-10-09', 2000],
      ['2026-10-10', 300],
    ]);
    expect(currentStreak(days, '2026-10-10')).toBe(2);
  });

  it('dzień przerwy kończy serię', () => {
    const days = rows([
      ['2026-10-07', 2000],
      ['2026-10-08', 500],
      ['2026-10-09', 2000],
      ['2026-10-10', 2000],
    ]);
    expect(currentStreak(days, '2026-10-10')).toBe(2);
  });

  it('bez dowiezionych dni seria jest zerowa', () => {
    expect(currentStreak(rows([['2026-10-10', 100]]), '2026-10-10')).toBe(0);
    expect(currentStreak([], '2026-10-10')).toBe(0);
  });
});

describe('averageMl', () => {
  it('liczy średnią z podanych dni', () => {
    expect(averageMl([day('2026-10-09', 2000), day('2026-10-10', 2500)])).toBe(2250);
  });

  it('bez dni nie dzieli przez zero', () => {
    expect(averageMl([])).toBe(0);
  });
});
