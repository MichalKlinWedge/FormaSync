/**
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';

import { dailyDelta, describeGoal, formatRate, KCAL_PER_KG, RATE_MAX } from '../goal';

const NBSP = ' ';

describe('dailyDelta', () => {
  it('przekłada tempo zmiany masy na dzienną poprawkę', () => {
    // Pół kilograma tygodniowo to 3850 kcal na siedem dni.
    expect(dailyDelta('REDUCTION', 0.5)).toBe(-550);
    expect(dailyDelta('MASS', 0.5)).toBe(550);
    expect(dailyDelta('REDUCTION', 0.25)).toBe(-275);
  });

  it('utrzymanie nie rusza budżetu, choćby ktoś ustawił tempo', () => {
    expect(dailyDelta('MAINTENANCE', 0.5)).toBe(0);
  });

  it('kierunek bierze z trybu, nie ze znaku tempa', () => {
    expect(dailyDelta('REDUCTION', -0.5)).toBe(-550);
  });

  it('nie przyjmuje tempa ponad górną granicę', () => {
    expect(dailyDelta('REDUCTION', 5)).toBe(dailyDelta('REDUCTION', RATE_MAX));
    expect(dailyDelta('REDUCTION', RATE_MAX)).toBe(-Math.round(KCAL_PER_KG / 7));
  });
});

describe('formatRate', () => {
  it('pisze tempo bez zbędnych zer', () => {
    expect(formatRate(1)).toBe('1 kg/tydz.');
    expect(formatRate(0.5)).toBe('0,5 kg/tydz.');
    expect(formatRate(0.25)).toBe('0,25 kg/tydz.');
  });
});

describe('describeGoal', () => {
  it('mówi, co cel robi z budżetem', () => {
    expect(describeGoal('REDUCTION', 0.5)).toBe(`redukcja, 0,5 kg/tydz. — 550${NBSP}kcal mniej dziennie`);
    expect(describeGoal('MASS', 0.25)).toBe(`masa, 0,25 kg/tydz. — 275${NBSP}kcal więcej dziennie`);
    expect(describeGoal('MAINTENANCE', 0)).toBe('utrzymanie — budżet bez poprawki');
  });
});
