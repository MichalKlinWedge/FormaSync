/**
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';

import { DEFAULT_TARGET_ML, dailyTarget, describeTarget } from '../target';

const input = {
  weightKg: null as number | null,
  trainingSeconds: 0,
  manualMl: null as number | null,
  extraMl: 0,
};

describe('dailyTarget', () => {
  it('liczy podstawę z masy ciała', () => {
    expect(dailyTarget({ ...input, weightKg: 80 })).toMatchObject({
      base: 2400,
      total: 2400,
      basis: 'WEIGHT',
    });
  });

  it('zaokrągla do pięćdziesiątek, bo to cel, a nie wynik pomiaru', () => {
    // 81,2 kg × 30 ml = 2436 ml.
    expect(dailyTarget({ ...input, weightKg: 81.2 }).base).toBe(2450);
  });

  it('bez masy ciała bierze wartość domyślną', () => {
    expect(dailyTarget(input)).toMatchObject({ base: DEFAULT_TARGET_ML, basis: 'DEFAULT' });
  });

  it('dokłada pół litra za godzinę treningu', () => {
    const target = dailyTarget({ ...input, weightKg: 80, trainingSeconds: 3600 });
    expect(target).toMatchObject({ base: 2400, training: 500, total: 2900 });
  });

  it('liczy dodatek proporcjonalnie do czasu treningu', () => {
    // 70 minut to 583 ml, po zaokrągleniu 600.
    expect(dailyTarget({ ...input, weightKg: 80, trainingSeconds: 70 * 60 }).training).toBe(600);
  });

  it('stały cel wyłącza liczenie z masy, ale nie dodatek treningowy', () => {
    const target = dailyTarget({
      ...input,
      weightKg: 80,
      manualMl: 2500,
      trainingSeconds: 3600,
    });
    expect(target).toMatchObject({ base: 2500, training: 500, total: 3000, basis: 'MANUAL' });
  });

  it('dolicza korektę dnia', () => {
    expect(dailyTarget({ ...input, weightKg: 80, extraMl: 250 }).total).toBe(2650);
  });

  it('nie pozwala korekcie ani treningowi zejść poniżej zera', () => {
    const target = dailyTarget({ ...input, weightKg: 80, extraMl: -500, trainingSeconds: -60 });
    expect(target).toMatchObject({ extra: 0, training: 0, total: 2400 });
  });
});

describe('describeTarget', () => {
  it('mówi, skąd wziął się cel', () => {
    const target = dailyTarget({ ...input, weightKg: 80, trainingSeconds: 3600, extraMl: 250 });
    expect(describeTarget(target)).toBe(
      '2,4 l z masy ciała + 500 ml za dzisiejszy trening + 250 ml korekty',
    );
  });

  it('bez treningu i korekty podaje samą podstawę', () => {
    expect(describeTarget(dailyTarget({ ...input, weightKg: 80 }))).toBe('2,4 l z masy ciała');
  });

  it('nie udaje, że zna masę ciała, gdy jej nie ma', () => {
    expect(describeTarget(dailyTarget(input))).toBe('2 l domyślnie, bo nie znamy masy ciała');
  });
});
