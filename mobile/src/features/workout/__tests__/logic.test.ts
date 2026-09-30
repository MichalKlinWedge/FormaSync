import { describe, expect, it } from '@jest/globals';

import {
  type ActiveExercise,
  type ActiveSet,
  countSets,
  elapsedSeconds,
  findCurrentSet,
  formatClock,
  restState,
  sessionTonnage,
} from '../logic';

const T0 = '2026-10-01T10:00:00.000Z';
const at = (seconds: number) => new Date(Date.parse(T0) + seconds * 1000).toISOString();
const ms = (seconds: number) => Date.parse(T0) + seconds * 1000;

let nextId = 1;
const set = (o: Partial<ActiveSet> = {}): ActiveSet => ({
  id: nextId++,
  setNumber: 1,
  repsCompleted: 10,
  weightKg: 50,
  durationSeconds: null,
  rpe: null,
  completedAt: null,
  ...o,
});

const exercise = (o: Partial<ActiveExercise> = {}): ActiveExercise => ({
  id: nextId++,
  exerciseId: 1,
  name: 'Przysiad',
  trackingType: 'REPS',
  targetSets: 3,
  targetReps: 10,
  targetWeight: 50,
  targetDurationSeconds: null,
  restDurationSeconds: 90,
  sets: [],
  ...o,
});

describe('elapsedSeconds', () => {
  it('liczy czas od startu i nie schodzi poniżej zera', () => {
    expect(elapsedSeconds(T0, ms(125))).toBe(125);
    expect(elapsedSeconds(T0, ms(-10))).toBe(0);
  });
});

describe('sessionTonnage', () => {
  it('sumuje tylko wykonane serie', () => {
    const e = exercise({
      sets: [
        set({ repsCompleted: 10, weightKg: 50, completedAt: at(60) }),
        set({ repsCompleted: 8, weightKg: 60, completedAt: at(180) }),
        set({ repsCompleted: 8, weightKg: 60 }), // niewykonana
      ],
    });
    expect(sessionTonnage([e])).toBe(10 * 50 + 8 * 60);
  });

  it('pomija ćwiczenia na czas i serie bez ciężaru', () => {
    const plank = exercise({
      name: 'Plank',
      trackingType: 'TIME',
      sets: [set({ repsCompleted: null, weightKg: null, durationSeconds: 45, completedAt: at(30) })],
    });
    expect(sessionTonnage([plank])).toBe(0);
  });
});

describe('countSets i findCurrentSet', () => {
  it('wskazuje pierwszą niewykonaną serię w kolejności ćwiczeń', () => {
    const first = exercise({
      name: 'Przysiad',
      sets: [set({ setNumber: 1, completedAt: at(60) }), set({ setNumber: 2 })],
    });
    const second = exercise({ name: 'Wyciskanie', sets: [set({ setNumber: 1 })] });

    expect(countSets([first, second])).toEqual({ completed: 1, planned: 3 });
    const current = findCurrentSet([first, second]);
    expect(current?.exercise.name).toBe('Przysiad');
    expect(current?.set.setNumber).toBe(2);
  });

  it('zwraca null, gdy wszystko wykonane', () => {
    const done = exercise({ sets: [set({ completedAt: at(10) })] });
    expect(findCurrentSet([done])).toBeNull();
  });
});

describe('restState', () => {
  const withRest = (completedAtSeconds: number, rest = 90) =>
    exercise({ restDurationSeconds: rest, sets: [set({ completedAt: at(completedAtSeconds) })] });

  it('odlicza przerwę od ostatnio ukończonej serii', () => {
    const rest = restState([withRest(100)], ms(130));
    expect(rest).toMatchObject({ exerciseName: 'Przysiad', totalSeconds: 90, remainingSeconds: 60 });
    expect(rest?.endsAt).toBe(ms(190));
  });

  it('kończy się po upływie czasu — także gdy aplikacja była zamknięta', () => {
    expect(restState([withRest(100)], ms(190))).toBeNull();
    expect(restState([withRest(100)], ms(5000))).toBeNull();
  });

  it('bierze czas przerwy ćwiczenia, którego serię ukończono jako ostatnią', () => {
    const early = exercise({ name: 'Przysiad', restDurationSeconds: 300, sets: [set({ completedAt: at(10) })] });
    const late = exercise({ name: 'Brzuszki', restDurationSeconds: 30, sets: [set({ completedAt: at(100) })] });
    const rest = restState([early, late], ms(110));
    expect(rest).toMatchObject({ exerciseName: 'Brzuszki', remainingSeconds: 20 });
  });

  it('brak przerwy, gdy nic nie ukończono lub przerwa wynosi zero', () => {
    expect(restState([exercise({ sets: [set()] })], ms(100))).toBeNull();
    expect(restState([withRest(100, 0)], ms(101))).toBeNull();
  });
});

describe('formatClock', () => {
  it.each([
    [0, '0:00'],
    [5, '0:05'],
    [425, '7:05'],
    [3600, '1:00:00'],
    [4025, '1:07:05'],
  ])('%i s → %s', (seconds, expected) => {
    expect(formatClock(seconds)).toBe(expected);
  });
});
