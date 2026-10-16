/**
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';

import { filterMeasurements, hasKind } from '../measurement-filter';

/**
 * Zawężanie historii pomiarów. Filtr, który po cichu gubi wiersz, wygląda jak brak pomiaru —
 * a pomiar sprzed roku, którego nie widać, to pomiar, którego dla czytającego nie ma.
 */

const empty = {
  weightKg: null,
  bodyFatPercent: null,
  chestCm: null,
  waistCm: null,
  hipsCm: null,
  armCm: null,
  thighCm: null,
  systolic: null,
  diastolic: null,
};

const weight = { ...empty, measuredOn: '2026-10-10', weightKg: 78.4 };
const pressure = { ...empty, measuredOn: '2026-09-01', systolic: 124, diastolic: 79 };
const girth = { ...empty, measuredOn: '2026-05-04', waistCm: 86 };

const ROWS = [weight, pressure, girth];

describe('hasKind', () => {
  it('rozpoznaje pomiar po tym, co w nim jest', () => {
    expect(hasKind(weight, 'WEIGHT')).toBe(true);
    expect(hasKind(weight, 'PRESSURE')).toBe(false);
    expect(hasKind(pressure, 'PRESSURE')).toBe(true);
    expect(hasKind(girth, 'GIRTH')).toBe(true);
  });

  it('sama tkanka tłuszczowa to też pomiar wagowy', () => {
    expect(hasKind({ ...empty, measuredOn: '2026-10-10', bodyFatPercent: 18 }, 'WEIGHT')).toBe(true);
  });

  it('samo skurczowe wystarczy, żeby wiersz był o ciśnieniu', () => {
    // Ciśnieniomierz bywa zapisany w pośpiechu — jedna liczba to nadal pomiar ciśnienia.
    expect(hasKind({ ...empty, measuredOn: '2026-10-10', systolic: 130 }, 'PRESSURE')).toBe(true);
  });

  it('„wszystkie” przepuszcza nawet pusty wiersz', () => {
    expect(hasKind({ ...empty, measuredOn: '2026-10-10' }, 'ALL')).toBe(true);
  });
});

describe('filterMeasurements', () => {
  it('bez zawężenia oddaje całość', () => {
    expect(filterMeasurements(ROWS, { kind: 'ALL', from: null })).toHaveLength(3);
  });

  it('tnie po dacie początkowej, razem z dniem granicznym', () => {
    const shown = filterMeasurements(ROWS, { kind: 'ALL', from: '2026-09-01' });

    expect(shown.map((row) => row.measuredOn)).toEqual(['2026-10-10', '2026-09-01']);
  });

  it('łączy okres z rodzajem', () => {
    expect(filterMeasurements(ROWS, { kind: 'PRESSURE', from: '2026-10-01' })).toEqual([]);
    expect(filterMeasurements(ROWS, { kind: 'PRESSURE', from: '2026-01-01' })).toEqual([pressure]);
  });

  it('nie przestawia kolejności, w której przyszły', () => {
    const shown = filterMeasurements(ROWS, { kind: 'ALL', from: null });

    expect(shown).toEqual(ROWS);
  });
});
