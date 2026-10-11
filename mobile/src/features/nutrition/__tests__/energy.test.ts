/**
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';

import {
  basalRate,
  dailyEnergy,
  describeEnergy,
  type EnergyInput,
  proteinTarget,
  trainingBurn,
} from '../energy';

const KCAL = ' kcal';
/** Separator tysięcy w polskim formacie to też spacja nierozdzielająca. */
const SP = ' ';

/** Punkt odniesienia w testach: mężczyzna 85 kg, 182 cm, 41 lat, lekki ruch, utrzymanie. */
const input = (over: Partial<EnergyInput> = {}): EnergyInput => ({
  sex: 'MALE',
  heightCm: 182,
  years: 41,
  weightKg: 85,
  activity: 'LIGHT',
  trainingKcal: 0,
  mode: 'MAINTENANCE',
  ratePerWeek: 0,
  manualKcal: null,
  ...over,
});

describe('basalRate', () => {
  it('liczy wzorem Mifflina–St Jeora', () => {
    expect(basalRate({ sex: 'MALE', weightKg: 85, heightCm: 182, years: 41 })).toBe(1788);
    // Ta sama sylwetka u kobiety to 166 kcal mniej — tyle i tylko tyle znaczy tu płeć.
    expect(basalRate({ sex: 'FEMALE', weightKg: 85, heightCm: 182, years: 41 })).toBe(1622);
  });
});

describe('trainingBurn', () => {
  it('przelicza czas i dyscyplinę na kalorie', () => {
    expect(trainingBurn('RUNNING', 3600, 85)).toBe(875);
    expect(trainingBurn('STRENGTH', 3600, 85)).toBe(446);
    // Pół godziny to połowa kosztu — wzór jest wprost proporcjonalny do czasu.
    expect(trainingBurn('STRENGTH', 1800, 85)).toBe(223);
  });

  it('bez czasu albo bez masy ciała nie wymyśla liczby', () => {
    expect(trainingBurn('RUNNING', 0, 85)).toBe(0);
    expect(trainingBurn('RUNNING', 3600, 0)).toBe(0);
  });
});

describe('dailyEnergy', () => {
  it('składa budżet z przemiany, ruchu i treningu', () => {
    const energy = dailyEnergy(input({ trainingKcal: 446 }));
    expect(energy).toMatchObject({ bmr: 1788, base: 2320, training: 450, delta: 0, target: 2770 });
    expect(energy.missing).toEqual([]);
  });

  it('cel diety zmienia budżet, a kierunek bierze z trybu', () => {
    const cut = dailyEnergy(input({ mode: 'REDUCTION', ratePerWeek: 0.5, trainingKcal: 450 }));
    expect(cut).toMatchObject({ delta: -550, target: 2220 });

    const gain = dailyEnergy(input({ mode: 'MASS', ratePerWeek: 0.25, trainingKcal: 450 }));
    expect(gain).toMatchObject({ delta: 280, target: 3050 });
  });

  it('nie schodzi poniżej przemiany podstawowej', () => {
    const energy = dailyEnergy(input({ mode: 'REDUCTION', ratePerWeek: 1 }));
    expect(energy.floored).toBe(true);
    expect(energy.target).toBe(1790);
    expect(describeEnergy(energy, 'REDUCTION')).toContain('przemiany podstawowej');
  });

  it('budżet wpisany ręcznie zastępuje wzór, ale trening nadal dokłada', () => {
    const energy = dailyEnergy(
      input({ manualKcal: 2500, mode: 'REDUCTION', ratePerWeek: 0.5, trainingKcal: 450 }),
    );
    expect(energy).toMatchObject({ manual: true, base: 2500, delta: 0, target: 2950 });
  });

  it('bez danych do wzoru nie udaje budżetu i mówi, czego brakuje', () => {
    const energy = dailyEnergy(input({ sex: null, heightCm: null }));
    expect(energy.target).toBeNull();
    expect(energy.bmr).toBeNull();
    expect(energy.missing).toEqual(['SEX', 'HEIGHT']);
    expect(describeEnergy(energy, 'MAINTENANCE')).toBe('Brakuje: płeć, wzrost.');
  });

  it('masa ciała zerowa to brak masy, nie masa zero', () => {
    expect(dailyEnergy(input({ weightKg: 0 })).missing).toEqual(['WEIGHT']);
  });
});

describe('describeEnergy', () => {
  it('rozpisuje budżet na składniki', () => {
    const energy = dailyEnergy(input({ mode: 'REDUCTION', ratePerWeek: 0.5, trainingKcal: 450 }));
    const sentence = describeEnergy(energy, 'REDUCTION');
    expect(sentence).toContain(`2${SP}320${KCAL} na utrzymanie`);
    expect(sentence).toContain(`+ 450${KCAL} za dzisiejszy trening`);
    expect(sentence).toContain(`− 550${KCAL} na redukcję`);
  });

  it('pomija składniki, których nie ma', () => {
    const sentence = describeEnergy(dailyEnergy(input()), 'MAINTENANCE');
    expect(sentence).toBe(`2${SP}320${KCAL} na utrzymanie`);
  });
});

describe('proteinTarget', () => {
  it('liczy z masy ciała', () => {
    expect(proteinTarget(85, 2)).toBe(170);
    expect(proteinTarget(85, 1.6)).toBe(136);
  });

  it('bez masy ciała milczy', () => {
    expect(proteinTarget(null, 2)).toBeNull();
    expect(proteinTarget(0, 2)).toBeNull();
  });
});
