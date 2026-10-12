/**
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';

import {
  adaptiveTdee,
  describeGaps,
  describeTdee,
  MIN_LOGGED_DAYS,
  weightSlope,
  weightSpan,
  type WeightPoint,
} from '../trend';

const NBSP = ' ';

/** Czternaście dni po 2500 kcal — tyle, ile wymaga rachunek. */
const steady = (kcal: number, days = MIN_LOGGED_DAYS): number[] => Array.from({ length: days }, () => kcal);

/** Pomiary co tydzień; `delta` to przyrost na pomiar. */
const points = (start: number, delta: number): WeightPoint[] => [
  { dayKey: '2026-09-29', weightKg: start },
  { dayKey: '2026-10-06', weightKg: start + delta },
  { dayKey: '2026-10-12', weightKg: start + delta * (13 / 7) },
];

describe('weightSlope', () => {
  it('liczy tempo w kilogramach na tydzień', () => {
    expect(weightSlope(points(80, -0.5))).toBeCloseTo(-0.5, 2);
    expect(weightSlope(points(80, 0.25))).toBeCloseTo(0.25, 2);
  });

  it('prostą prowadzi przez wszystkie pomiary, nie przez skrajne', () => {
    // Środkowy pomiar wypadł wysoko (sól, woda) — prosta ma go wygładzić, a nie przyjąć za prawdę.
    const noisy: WeightPoint[] = [
      { dayKey: '2026-09-29', weightKg: 80 },
      { dayKey: '2026-10-05', weightKg: 81.5 },
      { dayKey: '2026-10-12', weightKg: 79.5 },
    ];
    const slope = weightSlope(noisy) as number;
    expect(slope).toBeLessThan(0);
    expect(slope).toBeGreaterThan(-0.4);
  });

  it('bez dwóch pomiarów albo z jednego dnia nie ma nachylenia', () => {
    expect(weightSlope([])).toBeNull();
    expect(weightSlope([{ dayKey: '2026-10-12', weightKg: 80 }])).toBeNull();
    expect(
      weightSlope([
        { dayKey: '2026-10-12', weightKg: 80 },
        { dayKey: '2026-10-12', weightKg: 80.4 },
      ]),
    ).toBeNull();
  });

  it('rozpiętość liczy w dniach', () => {
    expect(weightSpan(points(80, -0.5))).toBe(13);
    expect(weightSpan([])).toBe(0);
  });
});

describe('adaptiveTdee', () => {
  it('spadek masy znaczy, że wydatek był wyższy od spożycia', () => {
    // Pół kilograma na tydzień to 3850 kcal, czyli 550 dziennie.
    const { tdee, missing } = adaptiveTdee(steady(2500), points(80, -0.5));
    expect(missing).toEqual([]);
    expect(tdee?.kcal).toBe(3050);
    expect(tdee?.avgIntake).toBe(2500);
    expect(tdee?.kgPerWeek).toBeCloseTo(-0.5, 2);
  });

  it('masa w górę znaczy wydatek niższy niż spożycie', () => {
    const { tdee } = adaptiveTdee(steady(3000), points(80, 0.25));
    expect(tdee?.kcal).toBe(2725); // 3000 − 0,25 × 7700 / 7
  });

  it('masa w miejscu daje wydatek równy spożyciu', () => {
    const { tdee } = adaptiveTdee(steady(2400), points(80, 0));
    expect(tdee?.kcal).toBe(2400);
  });

  it('nie liczy z kilku dni jedzenia ani z jednego pomiaru', () => {
    expect(adaptiveTdee(steady(2500, 4), points(80, -0.5)).missing).toEqual(['DAYS']);
    expect(adaptiveTdee(steady(2500), []).missing).toEqual(['WEIGHTS']);
  });

  it('nie liczy z pomiarów zrobionych blisko siebie', () => {
    const close: WeightPoint[] = [
      { dayKey: '2026-10-10', weightKg: 80 },
      { dayKey: '2026-10-12', weightKg: 79.6 },
    ];
    // Dwa dni różnicy to szum wodny, a nie zmiana tkanki — 0,4 kg wyszłoby jako 2200 kcal dziennie.
    expect(adaptiveTdee(steady(2500), close)).toEqual({ tdee: null, missing: ['SPAN'] });
  });
});

describe('opisy', () => {
  it('mówią, czego brakuje i ile', () => {
    expect(describeGaps(['DAYS'], 6)).toBe('Do policzenia własnego wydatku brakuje: 4 dni z zapisanym jedzeniem.');
    expect(describeGaps(['DAYS', 'WEIGHTS'], 8)).toContain('dwa pomiary masy ciała');
  });

  it('porównują własny wydatek ze wzorem', () => {
    const { tdee } = adaptiveTdee(steady(2500), points(80, -0.5));
    const sentence = describeTdee(tdee!, 2700);
    expect(sentence).toContain(`2${NBSP}500${NBSP}kcal`);
    expect(sentence).toContain('masa spada o 0,50 kg na tydzień');
    expect(sentence).toContain(`350${NBSP}kcal więcej niż ze wzoru`);
  });

  it('nie robią afery z różnicy mniejszej niż błąd liczenia', () => {
    const { tdee } = adaptiveTdee(steady(2400), points(80, 0));
    expect(describeTdee(tdee!, 2450)).toContain('Wzór trafia');
    expect(describeTdee(tdee!, 2450)).toContain('masa stoi w miejscu');
  });
});
