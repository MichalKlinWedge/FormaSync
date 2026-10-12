/**
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';

import { type DayStat, describeBalance, describeDays, summarize, weeklyChange } from '../stats';

const NBSP = ' ';

const day = (dayKey: string, kcal: number, target: number | null = 2500, meals = 3): DayStat => ({
  dayKey,
  kcal,
  proteinG: 120,
  trainingKcal: 0,
  meals,
  target,
});

describe('summarize', () => {
  it('liczy średnie tylko z dni, które mają wpis', () => {
    const summary = summarize([
      day('2026-10-10', 2400),
      day('2026-10-11', 0, 2500, 0), // dzień bez wpisu — nic o nim nie wiadomo
      day('2026-10-12', 2600),
    ]);

    expect(summary.days).toBe(2);
    expect(summary.avgIntake).toBe(2500);
    expect(summary.avgTarget).toBe(2500);
    expect(summary.balance).toBe(0);
  });

  it('rozdziela dni ponad budżetem i poniżej', () => {
    const summary = summarize([day('2026-10-10', 2900), day('2026-10-11', 2000), day('2026-10-12', 2100)]);
    expect(summary.overDays).toBe(1);
    expect(summary.underDays).toBe(2);
    expect(summary.balance).toBe(-167); // (400 − 500 − 400) / 3
  });

  it('bez budżetu liczy samo spożycie', () => {
    const summary = summarize([day('2026-10-11', 2400, null), day('2026-10-12', 2600, null)]);
    expect(summary.avgIntake).toBe(2500);
    expect(summary.avgTarget).toBeNull();
    expect(summary.balance).toBeNull();
  });

  it('z pustych dni nie robi zera', () => {
    const summary = summarize([day('2026-10-12', 0, 2500, 0)]);
    expect(summary).toMatchObject({ days: 0, avgIntake: null, balance: null });
  });
});

describe('describeBalance', () => {
  it('przekłada bilans na kilogramy tygodniowo', () => {
    const summary = summarize([day('2026-10-10', 2000), day('2026-10-11', 2000), day('2026-10-12', 2000)]);
    // 500 kcal dziennie poniżej to 3500 na tydzień, czyli 0,45 kg tkanki.
    expect(describeBalance(summary)).toBe(
      `Średnio 2${NBSP}000${NBSP}kcal przy budżecie 2${NBSP}500${NBSP}kcal — 500${NBSP}kcal dziennie poniżej budżetu, czyli około 0,45 kg tygodniowo w dół.`,
    );
  });

  it('drobnej różnicy nie nazywa trendem', () => {
    const summary = summarize([day('2026-10-11', 2480), day('2026-10-12', 2520)]);
    expect(describeBalance(summary)).toContain('tyle co trzeba');
  });

  it('bez wpisów i bez budżetu mówi wprost', () => {
    expect(describeBalance(summarize([day('2026-10-12', 0, 2500, 0)]))).toBe(
      'Z tych dni nie ma ani jednego wpisu.',
    );
    expect(describeBalance(summarize([day('2026-10-12', 2400, null)]))).toContain('Budżetu nie znamy');
  });

  it('liczy zmianę masy z bilansu', () => {
    expect(weeklyChange(-500)).toBeCloseTo(-0.4545, 3);
    expect(weeklyChange(0)).toBe(0);
  });
});

describe('describeDays', () => {
  it('pokazuje rozkład dni, który średnia ukrywa', () => {
    const summary = summarize([day('2026-10-10', 3200), day('2026-10-11', 1800), day('2026-10-12', 2000)]);
    expect(describeDays(summary)).toBe('2 poniżej budżetu, 1 ponad.');
  });

  it('bez budżetu nie ma czego rozdzielać', () => {
    expect(describeDays(summarize([day('2026-10-12', 2400, null)]))).toBeNull();
  });
});
