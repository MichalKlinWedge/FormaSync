import { describe, expect, it } from '@jest/globals';

import {
  exerciseTypeName,
  overlapsSession,
  selectImportable,
  toWatchActivity,
  type ExerciseSession,
  type WatchActivity,
} from '../activities-mapping';

const session = (overrides: Partial<ExerciseSession> = {}): ExerciseSession => ({
  metadata: { id: 'rec-1' },
  exerciseType: 70,
  startTime: '2026-10-02T14:00:00.000Z',
  endTime: '2026-10-02T14:30:00.000Z',
  ...overrides,
});

describe('exerciseTypeName', () => {
  it('nazywa znane dyscypliny po polsku', () => {
    expect(exerciseTypeName(70)).toBe('Trening siłowy');
    expect(exerciseTypeName(56)).toBe('Bieganie');
  });

  it('dla nieznanego typu zwraca nazwę ogólną zamiast zgadywać', () => {
    expect(exerciseTypeName(9999)).toBe('Trening');
  });
});

describe('toWatchActivity', () => {
  it('składa aktywność z tętnem i kaloriami z okna treningu', () => {
    const activity = toWatchActivity(
      session({ title: 'Szybkie brzuszki' }),
      [
        { time: '2026-10-02T14:05:00.000Z', beatsPerMinute: 70 },
        { time: '2026-10-02T14:15:00.000Z', beatsPerMinute: 90 },
        // Próbka spoza okna nie może wpłynąć na wynik.
        { time: '2026-10-02T18:00:00.000Z', beatsPerMinute: 180 },
      ],
      [
        {
          startTime: '2026-10-02T14:00:00.000Z',
          endTime: '2026-10-02T14:30:00.000Z',
          kilocalories: 120,
        },
      ],
    );

    expect(activity).toEqual({
      recordId: 'rec-1',
      title: 'Szybkie brzuszki',
      startTime: '2026-10-02T14:00:00.000Z',
      endTime: '2026-10-02T14:30:00.000Z',
      durationSeconds: 1800,
      avgHeartRate: 80,
      maxHeartRate: 90,
      caloriesBurned: 120,
    });
  });

  it('bez własnego tytułu bierze nazwę dyscypliny', () => {
    expect(toWatchActivity(session({ exerciseType: 8 }), [], [])?.title).toBe('Jazda na rowerze');
  });

  it('pomija rekord bez identyfikatora, bo nie dałoby się wykryć powtórnego wczytania', () => {
    expect(toWatchActivity(session({ metadata: {} }), [], [])).toBeNull();
  });

  it('bez pomiarów zostawia puste pola zamiast zer', () => {
    const activity = toWatchActivity(session(), [], []);
    expect(activity?.avgHeartRate).toBeNull();
    expect(activity?.caloriesBurned).toBeNull();
  });
});

describe('overlapsSession', () => {
  const activity = { startTime: '2026-10-02T14:00:00.000Z', endTime: '2026-10-02T14:30:00.000Z' };

  it('wykrywa trening prowadzony w aplikacji w tym samym czasie', () => {
    expect(
      overlapsSession(activity, [
        { startTime: '2026-10-02T14:20:00.000Z', endTime: '2026-10-02T15:00:00.000Z' },
      ]),
    ).toBe(true);
  });

  it('nie uznaje za pokrywający się treningu stykającego się końcem', () => {
    expect(
      overlapsSession(activity, [
        { startTime: '2026-10-02T14:30:00.000Z', endTime: '2026-10-02T15:00:00.000Z' },
      ]),
    ).toBe(false);
  });
});

describe('selectImportable', () => {
  const make = (recordId: string, startTime: string): WatchActivity => ({
    recordId,
    title: 'Trening',
    startTime,
    endTime: startTime,
    durationSeconds: 0,
    avgHeartRate: null,
    maxHeartRate: null,
    caloriesBurned: null,
  });

  it('pomija już wczytane i układa od najnowszej', () => {
    const result = selectImportable(
      [
        make('a', '2026-10-01T10:00:00.000Z'),
        make('b', '2026-10-02T10:00:00.000Z'),
        make('c', '2026-09-30T10:00:00.000Z'),
      ],
      new Set(['c']),
      [],
    );
    expect(result.map((item) => item.recordId)).toEqual(['b', 'a']);
  });

  it('pomija aktywność pokrywającą się z treningiem z aplikacji', () => {
    const result = selectImportable(
      [make('a', '2026-10-01T10:00:00.000Z')],
      new Set(),
      [{ startTime: '2026-10-01T09:30:00.000Z', endTime: '2026-10-01T11:00:00.000Z' }],
    );
    expect(result).toEqual([]);
  });
});
