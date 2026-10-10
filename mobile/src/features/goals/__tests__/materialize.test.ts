/**
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';

import { childrenOf, topLevel } from '@/features/endurance/draft';

import { draftFor, segmentsFor } from '../materialize';
import { intervalShape, workoutTitle } from '../shapes';

const unit = {
  kind: 'EASY' as const,
  title: 'Spokojny 8 km',
  distanceMeters: 8000,
  paceSeconds: 365,
  notes: 'Objętość bez zmęczenia.',
};

describe('intervalShape', () => {
  it('dzieli dystans na odcinki właściwe dyscyplinie', () => {
    expect(intervalShape('RUNNING', 10000)).toEqual({ repeats: 7, repMeters: 800 });
    expect(intervalShape('SWIMMING', 1200)).toEqual({ repeats: 7, repMeters: 100 });
  });

  it('nie schodzi poniżej czterech i nie wychodzi powyżej dziesięciu powtórzeń', () => {
    expect(intervalShape('RUNNING', 2000)?.repeats).toBe(4);
    expect(intervalShape('RUNNING', 40000)?.repeats).toBe(10);
  });

  it('dyscypliny bez odcinków nie dostają interwałów', () => {
    expect(intervalShape('OTHER', 10000)).toBeNull();
  });
});

describe('workoutTitle', () => {
  it('interwały nazywa tym, co faktycznie trafi na zegarek', () => {
    expect(workoutTitle('INTERVALS', 'RUNNING', 10000, 'Cel')).toBe('Interwały 7 × 800 m');
  });

  it('zawody noszą nazwę celu', () => {
    expect(workoutTitle('RACE', 'RUNNING', 21000, 'Półmaraton Wrocław')).toBe(
      'Zawody: Półmaraton Wrocław',
    );
  });

  it('pozostałe nazywa rodzajem i dystansem', () => {
    expect(workoutTitle('LONG', 'RUNNING', 18000, 'Cel')).toBe('Długi 18 km');
  });
});

describe('segmentsFor', () => {
  it('spokojny bieg to jeden odcinek z widełkami tempa', () => {
    const segments = segmentsFor(unit, 'RUNNING');
    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({
      kind: 'WORK',
      durationType: 'DISTANCE',
      distanceMeters: 8000,
      targetType: 'PACE',
      // Pięć procent w każdą stronę: 347–383 s/km.
      targetLow: 347,
      targetHigh: 383,
    });
  });

  it('bez znanego tempa nie wstawia widełek', () => {
    const [segment] = segmentsFor({ ...unit, paceSeconds: null }, 'RUNNING');
    expect(segment).toMatchObject({ targetType: 'NONE', targetLow: null, targetHigh: null });
  });

  it('tempo dostaje rozgrzewkę i schłodzenie', () => {
    const segments = segmentsFor({ ...unit, kind: 'TEMPO', distanceMeters: 6000 }, 'RUNNING');
    expect(segments.map((segment) => segment.kind)).toEqual(['WARMUP', 'WORK', 'COOLDOWN']);
  });

  it('interwały składa w grupę powtórzeń', () => {
    const segments = segmentsFor({ ...unit, kind: 'INTERVALS', distanceMeters: 10000 }, 'RUNNING');
    const top = topLevel(segments);
    expect(top.map((segment) => segment.kind)).toEqual(['WARMUP', 'REPEAT', 'COOLDOWN']);

    const group = top[1];
    expect(group.repeatCount).toBe(7);
    const inside = childrenOf(segments, group.key);
    expect(inside.map((segment) => segment.kind)).toEqual(['WORK', 'RECOVERY']);
    expect(inside[0]).toMatchObject({ distanceMeters: 800, targetType: 'PACE' });
    expect(inside[1]).toMatchObject({ durationType: 'TIME', durationSeconds: 90 });
  });

  it('jednostka bez dystansu nie daje odcinków', () => {
    expect(segmentsFor({ ...unit, distanceMeters: null }, 'RUNNING')).toEqual([]);
    expect(segmentsFor({ ...unit, distanceMeters: 0 }, 'RUNNING')).toEqual([]);
  });
});

describe('draftFor', () => {
  it('przenosi nazwę i powód jednostki do planu', () => {
    const draft = draftFor(unit, 'RUNNING');
    expect(draft).toMatchObject({
      sport: 'RUNNING',
      title: 'Spokojny 8 km',
      description: 'Objętość bez zmęczenia.',
    });
  });
});
