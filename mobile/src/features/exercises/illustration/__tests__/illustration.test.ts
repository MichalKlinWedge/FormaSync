/**
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';

import { seedExercises } from '@/db/seed-data';
import { anchor, buildIllustration, buildSkeleton, reach, type Pose } from '@/features/exercises/illustration/figure';
import { exerciseIllustrations } from '@/features/exercises/illustration/poses';

const standing: Pose = {
  hip: { x: 86, y: 78 },
  torso: 90,
  arms: [{ upper: -90, lower: -90 }],
  legs: [{ upper: -90, lower: -90 }],
};

describe('geometria rysunku', () => {
  it('sadza wskazany punkt dokładnie na zaczepie', () => {
    const bar = { x: 40, y: 24 };
    const hanging = anchor({ ...standing, arms: [{ upper: 90, lower: 90 }] }, 'hand', bar);
    const hand = buildSkeleton(hanging).arms[0].hand;

    expect(hand.x).toBeCloseTo(bar.x, 6);
    expect(hand.y).toBeCloseTo(bar.y, 6);
  });

  it('dobiera kąty nogi tak, żeby stopa trafiła w zadany punkt', () => {
    const hip = { x: 78, y: 98 };
    const foot = { x: 86, y: 112 };
    const ankle = buildSkeleton({ ...standing, hip, legs: [reach(hip, foot, 1)] }).legs[0].ankle;

    expect(ankle.x).toBeCloseTo(foot.x, 6);
    expect(ankle.y).toBeCloseTo(foot.y, 6);
  });

  it('wyciąga nogę najdalej jak się da, gdy cel jest poza zasięgiem', () => {
    const hip = { x: 80, y: 20 };
    const ankle = buildSkeleton({ ...standing, hip, legs: [reach(hip, { x: 80, y: 112 }, 1)] }).legs[0].ankle;

    // Udo i podudzie mają razem 34 — noga ma się wyprostować, a nie rozciągnąć do celu.
    expect(ankle.y).toBeCloseTo(54, 1);
  });
});

describe('katalog rysunków', () => {
  const names = new Set(seedExercises.map((exercise) => exercise.name));

  it('ma rysunek do każdego ćwiczenia z katalogu', () => {
    expect(seedExercises.map((e) => e.name).filter((name) => !exerciseIllustrations[name])).toEqual([]);
  });

  it('nie ma rysunków do ćwiczeń, których nie ma w katalogu', () => {
    // Kluczem jest nazwa, więc literówka cicho odpięłaby rysunek od ćwiczenia.
    expect(Object.keys(exerciseIllustrations).filter((name) => !names.has(name))).toEqual([]);
  });

  it('rysuje każde ćwiczenie w skończonym kadrze', () => {
    const problems: string[] = [];
    for (const [name, illustration] of Object.entries(exerciseIllustrations)) {
      const { shapes, viewBox } = buildIllustration(illustration);
      const [x, y, width, height] = viewBox.split(' ').map(Number);
      const check = (ok: boolean, what: string) => {
        if (!ok) problems.push(`${name}: ${what}`);
      };

      check(shapes.length > 0, 'rysunek bez figur');
      check([x, y, width, height].every(Number.isFinite), 'kadr z NaN');
      check(width > 0 && height > 0, 'kadr bez powierzchni');

      // Kadr liczymy z zawartości, więc nic nie ma prawa z niego wystawać.
      for (const shape of shapes) {
        const points =
          shape.shape === 'line'
            ? [shape.from, shape.to]
            : shape.shape === 'circle'
              ? [
                  { x: shape.at.x - shape.r, y: shape.at.y - shape.r },
                  { x: shape.at.x + shape.r, y: shape.at.y + shape.r },
                ]
              : shape.bounds;
        for (const point of points) {
          check(Number.isFinite(point.x) && Number.isFinite(point.y), 'punkt z NaN');
          check(point.x >= x - 0.01 && point.x <= x + width + 0.01, 'figura poza kadrem w poziomie');
          check(point.y >= y - 0.01 && point.y <= y + height + 0.01, 'figura poza kadrem w pionie');
        }
      }
    }
    expect(problems).toEqual([]);
  });
});
