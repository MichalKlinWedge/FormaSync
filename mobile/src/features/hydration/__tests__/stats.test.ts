/**
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';

import {
  averageMl,
  currentStreak,
  describeHydration,
  summarizeHydration,
  withTargets,
  type DaySummary,
} from '../stats';

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

describe('summarizeHydration', () => {
  const period = () =>
    withTargets(
      [
        day('2026-10-07', 2400),
        day('2026-10-08', 1800),
        // Dzień bez ani jednej porcji: nikt tego nie zapisał, więc nie wiadomo, ile wypito.
        day('2026-10-09', 0),
        day('2026-10-10', 2600),
      ],
      80,
      null,
    );

  it('liczy tylko dni z zapisem', () => {
    const summary = summarizeHydration(period());

    expect(summary.days).toBe(3);
    expect(summary.avgMl).toBe(2267);
    expect(summary.avgTargetMl).toBe(2400);
  });

  it('liczy dni z dowiezionym celem', () => {
    expect(summarizeHydration(period()).metDays).toBe(2);
  });

  it('bez zapisów nie wymyśla średniej', () => {
    const summary = summarizeHydration(withTargets([day('2026-10-10', 0)], 80, null));

    expect(summary).toMatchObject({ days: 0, metDays: 0, avgMl: null, avgTargetMl: null });
  });
});

describe('describeHydration', () => {
  it('mówi średnią, cel i ile dni z dowiezionym', () => {
    const sentence = describeHydration({
      days: 14,
      metDays: 9,
      avgMl: 2300,
      avgTargetMl: 2600,
    });

    // Liczbę od jednostki dzieli spacja nierozdzielająca, więc porównujemy wzorcem.
    expect(sentence).toMatch(/^Średnio 2,3\sl przy celu 2,6\sl — cel dowieziony w 9 z 14\sdni\.$/);
  });

  it('pusty okres nazywa pustym, zamiast pokazywać zero', () => {
    expect(describeHydration({ days: 0, metDays: 0, avgMl: null, avgTargetMl: null })).toBe(
      'Z tych dni nie ma ani jednego zapisu picia.',
    );
  });
});
