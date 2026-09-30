import { describe, expect, it } from '@jest/globals';

import {
  type CompletedSet,
  estimateOneRepMax,
  exerciseProgress,
  overallStats,
  personalRecords,
  tonnageByCategory,
  trackedExercises,
  weeklyTonnage,
} from '../analytics';

// Znaczniki czasu w czasie lokalnym, żeby grupowanie po dniach nie zależało od strefy.
const localIso = (y: number, m: number, d: number, h = 10) => new Date(y, m - 1, d, h).toISOString();

let session = 0;
const set = (o: Partial<CompletedSet> & { startTime: string }): CompletedSet => ({
  sessionId: ++session,
  exerciseId: 1,
  exerciseName: 'Przysiad',
  categoryName: 'Nogi',
  reps: 10,
  weightKg: 50,
  durationSeconds: null,
  ...o,
});

describe('estimateOneRepMax', () => {
  it('liczy wzorem Epleya i zwraca sam ciężar dla jednego powtórzenia', () => {
    expect(estimateOneRepMax(100, 1)).toBe(100);
    expect(estimateOneRepMax(100, 5)).toBeCloseTo(116.67, 2);
    expect(estimateOneRepMax(60, 10)).toBe(80);
  });

  it('odmawia szacowania dla danych bez sensu i dla bardzo wielu powtórzeń', () => {
    expect(estimateOneRepMax(0, 5)).toBeNull();
    expect(estimateOneRepMax(100, 0)).toBeNull();
    expect(estimateOneRepMax(100, 13)).toBeNull();
  });
});

describe('weeklyTonnage', () => {
  it('sumuje tonaż po tygodniach i pokazuje tygodnie bez treningu', () => {
    // 2026-10-01 to czwartek; tydzień zaczyna się 2026-09-28.
    const sets = [
      set({ startTime: localIso(2026, 10, 1), reps: 10, weightKg: 50 }),
      set({ startTime: localIso(2026, 10, 2), reps: 5, weightKg: 100 }),
      set({ startTime: localIso(2026, 10, 8), reps: 8, weightKg: 60 }),
    ];
    const weeks = weeklyTonnage(sets, 3, '2026-10-08');
    expect(weeks.map((w) => w.weekStart)).toEqual(['2026-09-21', '2026-09-28', '2026-10-05']);
    expect(weeks.map((w) => w.tonnage)).toEqual([0, 500 + 500, 480]);
    expect(weeks.map((w) => w.sessions)).toEqual([0, 2, 1]);
  });

  it('liczy jedną sesję raz, mimo wielu serii', () => {
    const sets = [
      set({ sessionId: 99, startTime: localIso(2026, 10, 1) }),
      set({ sessionId: 99, startTime: localIso(2026, 10, 1) }),
    ];
    expect(weeklyTonnage(sets, 1, '2026-10-01')[0].sessions).toBe(1);
  });

  it('pomija serie bez ciężaru przy tonażu', () => {
    const sets = [set({ startTime: localIso(2026, 10, 1), reps: null, weightKg: null, durationSeconds: 45 })];
    expect(weeklyTonnage(sets, 1, '2026-10-01')[0]).toMatchObject({ tonnage: 0, sessions: 1 });
  });
});

describe('tonnageByCategory', () => {
  it('sortuje partie malejąco i grupuje brak partii jako „Inne”', () => {
    const sets = [
      set({ startTime: localIso(2026, 10, 1), categoryName: 'Nogi', reps: 10, weightKg: 100 }),
      set({ startTime: localIso(2026, 10, 1), categoryName: 'Plecy', reps: 10, weightKg: 50 }),
      set({ startTime: localIso(2026, 10, 1), categoryName: null, reps: 10, weightKg: 70 }),
    ];
    expect(tonnageByCategory(sets)).toEqual([
      { name: 'Nogi', tonnage: 1000 },
      { name: 'Inne', tonnage: 700 },
      { name: 'Plecy', tonnage: 500 },
    ]);
  });

  it('ogranicza się do dat od podanego dnia', () => {
    const sets = [
      set({ startTime: localIso(2026, 9, 1), categoryName: 'Nogi' }),
      set({ startTime: localIso(2026, 10, 1), categoryName: 'Plecy' }),
    ];
    expect(tonnageByCategory(sets, '2026-09-15').map((c) => c.name)).toEqual(['Plecy']);
  });
});

describe('exerciseProgress', () => {
  it('daje jeden punkt na dzień z najcięższą serią i najlepszym 1RM', () => {
    const sets = [
      set({ startTime: localIso(2026, 10, 1), reps: 8, weightKg: 60 }),
      set({ startTime: localIso(2026, 10, 1), reps: 5, weightKg: 70 }),
      set({ startTime: localIso(2026, 10, 5), reps: 5, weightKg: 75 }),
      set({ startTime: localIso(2026, 10, 5), exerciseId: 2, reps: 10, weightKg: 200 }),
    ];
    const points = exerciseProgress(sets, 1);
    expect(points.map((p) => p.date)).toEqual(['2026-10-01', '2026-10-05']);
    expect(points[0]).toMatchObject({ topWeight: 70, bestSetReps: 5, tonnage: 8 * 60 + 5 * 70 });
    expect(points[0].oneRepMax).toBeCloseTo(81.67, 2); // 70 × (1 + 5/30) bije 60 × (1 + 8/30)
    expect(points[1].topWeight).toBe(75);
  });

  it('zwraca pustą listę dla ćwiczenia bez historii', () => {
    expect(exerciseProgress([set({ startTime: localIso(2026, 10, 1) })], 999)).toEqual([]);
  });
});

describe('personalRecords', () => {
  it('bierze najcięższą serię i najlepszy 1RM osobno', () => {
    const sets = [
      set({ startTime: localIso(2026, 10, 1), reps: 10, weightKg: 60 }), // 1RM 80
      set({ startTime: localIso(2026, 10, 5), reps: 1, weightKg: 75 }), // 1RM 75, ale największy ciężar
    ];
    const [record] = personalRecords(sets);
    expect(record).toMatchObject({
      exerciseName: 'Przysiad',
      maxWeight: 75,
      maxWeightReps: 1,
      maxWeightDate: '2026-10-05',
      bestOneRepMax: 80,
    });
  });

  it('sortuje ćwiczenia po szacowanym 1RM i pomija serie bez ciężaru', () => {
    const sets = [
      set({ startTime: localIso(2026, 10, 1), exerciseId: 1, exerciseName: 'Przysiad', reps: 5, weightKg: 100 }),
      set({ startTime: localIso(2026, 10, 1), exerciseId: 2, exerciseName: 'Wyciskanie', reps: 5, weightKg: 80 }),
      set({ startTime: localIso(2026, 10, 1), exerciseId: 3, exerciseName: 'Plank', reps: null, weightKg: null }),
    ];
    expect(personalRecords(sets).map((r) => r.exerciseName)).toEqual(['Przysiad', 'Wyciskanie']);
  });
});

describe('overallStats i trackedExercises', () => {
  it('liczy sesje, serie i tonaż', () => {
    const sets = [
      set({ sessionId: 1, startTime: localIso(2026, 10, 1), reps: 10, weightKg: 50 }),
      set({ sessionId: 1, startTime: localIso(2026, 10, 1), reps: 10, weightKg: 50 }),
      set({ sessionId: 2, startTime: localIso(2026, 10, 3), reps: 10, weightKg: 50 }),
    ];
    expect(overallStats(sets)).toEqual({ sessions: 2, sets: 3, tonnage: 1500 });
  });

  it('wskazuje ćwiczenia z największą liczbą dni treningowych', () => {
    const sets = [
      set({ startTime: localIso(2026, 10, 1), exerciseId: 1, exerciseName: 'Przysiad' }),
      set({ startTime: localIso(2026, 10, 3), exerciseId: 1, exerciseName: 'Przysiad' }),
      set({ startTime: localIso(2026, 10, 3), exerciseId: 2, exerciseName: 'Wiosłowanie' }),
      set({ startTime: localIso(2026, 10, 3), exerciseId: 3, exerciseName: 'Plank', weightKg: null }),
    ];
    expect(trackedExercises(sets)).toEqual([
      { id: 1, name: 'Przysiad', days: 2 },
      { id: 2, name: 'Wiosłowanie', days: 1 },
    ]);
  });
});
