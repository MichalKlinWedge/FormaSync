/**
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';

import { createTestDb } from '@/db/test-utils';
import { finishSession, startSession } from '@/features/workout/repository';

import { createSegment, emptyEnduranceDraft } from '../draft';
import { saveEndurancePlan } from '../repository';
import { completeSegment, loadEnduranceSession } from '../session';
import { loadEnduranceWorkouts, summarizeEndurance, weeklyVolume } from '../stats';

/** Trening biegowy z jednym odcinkiem o zadanym dystansie i czasie. */
function runWorkout(
  db: ReturnType<typeof createTestDb>,
  meters: number,
  seconds: number,
) {
  const planId = saveEndurancePlan(db, {
    ...emptyEnduranceDraft('RUNNING'),
    title: 'Wybieganie',
    segments: [createSegment('WORK')],
  });
  const sessionId = startSession(db, { kind: 'plan', planId });
  const segment = loadEnduranceSession(db, sessionId)!.segments[0];
  completeSegment(db, segment.id, { distanceMeters: meters, durationSeconds: seconds });
  finishSession(db, sessionId);
  return sessionId;
}

describe('loadEnduranceWorkouts', () => {
  it('liczy dystans, czas i tempo z zapisanych odcinków', () => {
    const db = createTestDb({ seed: true });
    runWorkout(db, 5000, 1500);

    const [workout] = loadEnduranceWorkouts(db, 'RUNNING');
    expect(workout.meters).toBe(5000);
    expect(workout.seconds).toBe(1500);
    expect(workout.pace).toBe(300);
  });

  it('pomija dyscypliny inne niż pytana', () => {
    const db = createTestDb({ seed: true });
    runWorkout(db, 5000, 1500);
    expect(loadEnduranceWorkouts(db, 'CYCLING')).toEqual([]);
  });

  it('pomija treningi bez zapisanego odcinka', () => {
    const db = createTestDb({ seed: true });
    const planId = saveEndurancePlan(db, {
      ...emptyEnduranceDraft('RUNNING'),
      title: 'Nieudany',
      segments: [createSegment('WORK')],
    });
    const sessionId = startSession(db, { kind: 'plan', planId });
    finishSession(db, sessionId);

    expect(loadEnduranceWorkouts(db, 'RUNNING')).toEqual([]);
  });
});

describe('summarizeEndurance', () => {
  const workout = (meters: number, seconds: number, startTime: string) => ({
    sessionId: 1,
    startTime,
    title: 'Bieg',
    meters,
    seconds,
    pace: Math.round(seconds / (meters / 1000)),
  });

  it('najlepsze tempo to najniższa liczba sekund na kilometr', () => {
    const summary = summarizeEndurance([
      workout(5000, 1500, '2026-10-01T06:00:00.000Z'),
      workout(3000, 780, '2026-10-03T06:00:00.000Z'),
    ]);
    expect(summary.bestPace).toBe(260);
    expect(summary.meters).toBe(8000);
    expect(summary.longestMeters).toBe(5000);
  });

  it('bez treningów nie zgaduje tempa', () => {
    expect(summarizeEndurance([]).bestPace).toBeNull();
  });
});

describe('weeklyVolume', () => {
  it('wrzuca trening do tygodnia, który zaczyna się w poniedziałek', () => {
    // 1 października 2026 to czwartek; tydzień zaczyna się 28 września.
    const weeks = weeklyVolume(
      [
        {
          sessionId: 1,
          startTime: '2026-10-01T06:00:00.000Z',
          title: 'Bieg',
          meters: 5000,
          seconds: 1500,
          pace: 300,
        },
      ],
      2,
      new Date('2026-10-04T12:00:00.000Z'),
    );
    expect(weeks).toHaveLength(2);
    expect(weeks.at(-1)).toMatchObject({ weekKey: '2026-09-28', meters: 5000 });
  });

  it('tygodnie bez treningu zostają puste, żeby wykres nie kłamał', () => {
    const weeks = weeklyVolume([], 3, new Date('2026-10-04T12:00:00.000Z'));
    expect(weeks.map((week) => week.meters)).toEqual([0, 0, 0]);
  });
});
