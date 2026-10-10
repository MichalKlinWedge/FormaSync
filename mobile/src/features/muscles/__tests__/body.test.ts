/**
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';

import { seedCategories, seedExercises } from '@/db/seed-data';

import { Figure, backRegions, drawnCategories, frontRegions, outline, smoothPath } from '../body';

describe('sylwetka', () => {
  it('mieści się w kadrze', () => {
    // Punkt poza kadrem ucinałby figurę na krawędzi, a na małym ekranie nikt by nie dociekł dlaczego.
    for (const [x, y] of outline) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(Figure.width);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(Figure.height);
    }
  });

  it('jest symetryczna, bo lewą połowę rysuje odbicie prawej', () => {
    const xs = outline.map(([x]) => x).sort((a, b) => a - b);
    const mirrored = outline.map(([x]) => Figure.width - x).sort((a, b) => a - b);
    xs.forEach((x, i) => expect(x).toBeCloseTo(mirrored[i], 6));
  });

  it('każdy mięsień ma parę po drugiej stronie osi', () => {
    for (const region of [...frontRegions, ...backRegions]) {
      expect(region.shapes.length % 2).toBe(0);
    }
  });
});

describe('partie na figurze', () => {
  it('rysuje każdą partię, która jest w katalogu ćwiczeń', () => {
    // Partia bez miejsca na sylwetce zniknęłaby z mapy bez śladu — ćwiczenie wyglądałoby
    // wtedy na takie, które nie angażuje niczego.
    const drawn = drawnCategories();
    expect(seedCategories.map((c) => c.name).filter((name) => !drawn.has(name))).toEqual([]);
  });

  it('nie rysuje partii, których katalog nie zna', () => {
    const known = new Set(seedCategories.map((c) => c.name));
    expect([...drawnCategories()].filter((name) => !known.has(name))).toEqual([]);
  });

  it('każde ćwiczenie z katalogu wskazuje partie, które figura umie pokazać', () => {
    const drawn = drawnCategories();
    const missing = seedExercises
      .flatMap((exercise) => [exercise.category, ...(exercise.secondary ?? [])])
      .filter((name) => !drawn.has(name));
    expect([...new Set(missing)]).toEqual([]);
  });
});

describe('smoothPath', () => {
  it('zaczyna ścieżkę od pierwszego punktu i zamyka kontur', () => {
    const path = smoothPath([
      [10, 10],
      [20, 10],
      [15, 20],
    ]);
    expect(path.startsWith('M 10 10')).toBe(true);
    expect(path.endsWith('Z')).toBe(true);
  });

  it('otwartej ścieżki nie domyka', () => {
    const path = smoothPath(
      [
        [10, 10],
        [20, 10],
        [15, 20],
      ],
      false,
    );
    expect(path.endsWith('Z')).toBe(false);
  });

  it('z dwóch punktów nie da się poprowadzić krzywej', () => {
    expect(smoothPath([[0, 0], [1, 1]])).toBe('');
  });
});
