import { describe, expect, it } from '@jest/globals';

import {
  describeRefresh,
  exerciseTypeName,
  findOverlappingSession,
  selectImportable,
  sportForExerciseType,
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
          origin: 'zegarek',
          kilocalories: 120,
        },
      ],
    );

    expect(activity).toEqual({
      recordId: 'rec-1',
      title: 'Szybkie brzuszki',
      sport: 'STRENGTH',
      startTime: '2026-10-02T14:00:00.000Z',
      endTime: '2026-10-02T14:30:00.000Z',
      durationSeconds: 1800,
      avgHeartRate: 80,
      maxHeartRate: 90,
      distanceMeters: null,
      caloriesBurned: 120,
    });
  });

  it('sumuje dystans z bloków należących do okna aktywności', () => {
    const activity = toWatchActivity(
      session({ exerciseType: 56 }),
      [],
      [],
      [
        { startTime: '2026-10-02T14:00:00.000Z', endTime: '2026-10-02T14:15:00.000Z', origin: 'zegarek', meters: 3000 },
        { startTime: '2026-10-02T14:15:00.000Z', endTime: '2026-10-02T14:30:00.000Z', origin: 'zegarek', meters: 2500 },
        // Blok z innej pory dnia nie ma prawa dołożyć się do tego biegu.
        { startTime: '2026-10-02T18:00:00.000Z', endTime: '2026-10-02T18:30:00.000Z', origin: 'zegarek', meters: 9000 },
      ],
    );
    expect(activity?.distanceMeters).toBe(5500);
    expect(activity?.sport).toBe('RUNNING');
  });

  it('bez odczytów dystansu zostawia pustkę, a nie zero kilometrów', () => {
    expect(toWatchActivity(session({ exerciseType: 56 }), [], [], [])?.distanceMeters).toBeNull();
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

describe('findOverlappingSession', () => {
  const activity = { startTime: '2026-10-02T14:00:00.000Z', endTime: '2026-10-02T14:30:00.000Z' };
  const window = (id: number, startTime: string, endTime: string) => ({
    id,
    title: `Trening ${id}`,
    startTime,
    endTime,
  });

  it('wskazuje trening prowadzony w aplikacji w tym samym czasie', () => {
    const found = findOverlappingSession(activity, [
      window(1, '2026-10-02T14:20:00.000Z', '2026-10-02T15:00:00.000Z'),
    ]);
    expect(found?.id).toBe(1);
  });

  it('nie uznaje za pokrywający się treningu stykającego się końcem', () => {
    expect(
      findOverlappingSession(activity, [
        window(1, '2026-10-02T14:30:00.000Z', '2026-10-02T15:00:00.000Z'),
      ]),
    ).toBeNull();
  });
});

describe('selectImportable', () => {
  const make = (recordId: string, startTime: string): WatchActivity => ({
    recordId,
    title: 'Trening',
    sport: 'STRENGTH',
    startTime,
    endTime: startTime,
    durationSeconds: 0,
    distanceMeters: null,
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
      new Set(),
      [],
    );
    expect(result.map((item) => item.recordId)).toEqual(['b', 'a']);
  });

  it('pomija aktywność odłożoną przez użytkownika', () => {
    const result = selectImportable(
      [make('a', '2026-10-01T10:00:00.000Z')],
      new Set(),
      new Set(['a']),
      [],
    );
    expect(result).toEqual([]);
  });

  it('pokrywającej się aktywności nie ukrywa, tylko podpowiada trening do połączenia', () => {
    const result = selectImportable([make('a', '2026-10-01T10:00:00.000Z')], new Set(), new Set(), [
      {
        id: 7,
        title: 'Nogi',
        startTime: '2026-10-01T09:30:00.000Z',
        endTime: '2026-10-01T11:00:00.000Z',
      },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].matchingSession?.id).toBe(7);
  });

  it('bez pokrycia nie podpowiada żadnego treningu', () => {
    const result = selectImportable([make('a', '2026-10-01T10:00:00.000Z')], new Set(), new Set(), []);
    expect(result[0].matchingSession).toBeNull();
  });
});

describe('describeRefresh', () => {
  it('liczy to, co dopiero doszło', () => {
    expect(describeRefresh(2, 5)).toBe('Nowe treningi: 2.');
  });

  it('po pustym sprawdzeniu przypomina, co jeszcze czeka', () => {
    expect(describeRefresh(0, 3)).toBe('Nic nowego nie doszło. Na liście czeka 3.');
  });

  it('przy zerze wskazuje Garmin Connect, bo to on zapisuje do Health Connect', () => {
    expect(describeRefresh(0, 0)).toContain('Garmin Connect');
  });
});

describe('sportForExerciseType', () => {
  it('rozpoznaje dyscypliny, które realnie przychodzą z zegarka', () => {
    expect(sportForExerciseType(56)).toBe('RUNNING');
    expect(sportForExerciseType(8)).toBe('CYCLING');
    expect(sportForExerciseType(74)).toBe('SWIMMING');
    expect(sportForExerciseType(70)).toBe('STRENGTH');
  });

  it('marsz i wędrówkę liczy jako bieganie, bo mierzy się je dystansem', () => {
    expect(sportForExerciseType(79)).toBe('RUNNING');
    expect(sportForExerciseType(37)).toBe('RUNNING');
  });

  it('nierozpoznaną aktywność wrzuca do „Różnych”, a nie do siły', () => {
    // Joga czy taniec z zegarka zapisane jako siła psułyby tonaż i rekordy.
    expect(sportForExerciseType(0)).toBe('OTHER');
    expect(sportForExerciseType(83)).toBe('OTHER');
    expect(sportForExerciseType(9999)).toBe('OTHER');
  });
});
