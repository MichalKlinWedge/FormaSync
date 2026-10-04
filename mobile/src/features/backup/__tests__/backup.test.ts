/**
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';
import { eq } from 'drizzle-orm';

import * as schema from '@/db/schema';
import { createTestDb } from '@/db/test-utils';
import { listHistory } from '@/features/history/repository';
import { savePlan } from '@/features/plans/repository';
import { saveMeasurement } from '@/features/progress/repository';
import { completeSet, finishSession, loadSession, startSession } from '@/features/workout/repository';

import {
  backupFileName,
  BackupFormatError,
  backupStats,
  BACKUP_VERSION,
  createBackup,
  parseBackup,
  restoreBackup,
  serializeBackup,
} from '../backup';

/** Baza z pełnym cyklem: plan, zaplanowany termin, odbyty trening i pomiar ciała. */
function populated() {
  const db = createTestDb({ seed: true });
  const squat = db
    .select()
    .from(schema.exercises)
    .where(eq(schema.exercises.name, 'Przysiad ze sztangą'))
    .get()!;

  const planId = savePlan(db, {
    sport: 'STRENGTH',
    title: 'Mój plan',
    description: 'Opis',
    sourceTemplateId: null,
    items: [
      {
        key: 'a',
        exerciseId: squat.id,
        exerciseName: squat.name,
        trackingType: 'REPS',
        targetSets: 2,
        targetReps: 5,
        targetWeight: 100,
        targetDurationSeconds: null,
        restDurationSeconds: 120,
        notes: null,
      },
    ],
  });

  const scheduled = db
    .insert(schema.scheduledWorkouts)
    .values({ planId, scheduledDate: '2026-10-05', scheduledTime: '18:00' })
    .returning()
    .get();

  const sessionId = startSession(db, { kind: 'scheduled', scheduledId: scheduled.id }, '2026-10-05T18:00:00.000Z');
  const sets = loadSession(db, sessionId)!.exercises[0].sets;
  completeSet(db, sets[0].id, { repsCompleted: 5, weightKg: 100, rpe: 8 }, '2026-10-05T18:05:00.000Z');
  finishSession(db, sessionId, { userNotes: 'Dobrze', rpeRating: 8 }, '2026-10-05T19:00:00.000Z');

  saveMeasurement(db, {
    measuredOn: '2026-10-05',
    weightKg: 82.5,
    bodyFatPercent: null,
    chestCm: null,
    waistCm: 85,
    hipsCm: null,
    armCm: null,
    thighCm: null,
    notes: 'rano',
  });

  return { db, planId, sessionId, squat };
}

describe('createBackup', () => {
  it('obejmuje wszystkie tabele i liczy wiersze', () => {
    const { db } = populated();
    const backup = createBackup(db, '2026-10-06T08:00:00.000Z');

    expect(backup).toMatchObject({ app: 'FormaSync', version: BACKUP_VERSION, exportedAt: '2026-10-06T08:00:00.000Z' });
    expect(Object.keys(backup.tables).sort()).toEqual([
      'app_settings',
      'archived_activities',
      'body_measurements',
      'categories',
      'equipment',
      'exercise_muscles',
      'exercises',
      'garmin_activity_metrics',
      'garmin_daily_health',
      'logged_sets',
      'plan_exercises',
      'scheduled_workouts',
      'session_exercises',
      'workout_plans',
      'workout_sessions',
    ]);
    expect(backupStats(backup).rows).toBeGreaterThan(50);
  });
});

describe('pełny obieg: eksport, wyczyszczenie, przywrócenie', () => {
  it('odtwarza dane co do wiersza', () => {
    const { db } = populated();
    const before = {
      history: listHistory(db),
      plans: db.select().from(schema.workoutPlans).all(),
      sets: db.select().from(schema.loggedSets).all(),
      sessionExercises: db.select().from(schema.sessionExercises).all(),
      scheduled: db.select().from(schema.scheduledWorkouts).all(),
      measurements: db.select().from(schema.bodyMeasurements).all(),
      exercises: db.select().from(schema.exercises).all(),
    };

    const text = serializeBackup(createBackup(db));

    // Przywracamy do świeżej bazy — tak jak na nowym telefonie.
    const fresh = createTestDb({ seed: true });
    restoreBackup(fresh, parseBackup(text));

    expect(listHistory(fresh)).toEqual(before.history);
    expect(fresh.select().from(schema.workoutPlans).all()).toEqual(before.plans);
    expect(fresh.select().from(schema.loggedSets).all()).toEqual(before.sets);
    expect(fresh.select().from(schema.sessionExercises).all()).toEqual(before.sessionExercises);
    expect(fresh.select().from(schema.scheduledWorkouts).all()).toEqual(before.scheduled);
    expect(fresh.select().from(schema.bodyMeasurements).all()).toEqual(before.measurements);
    expect(fresh.select().from(schema.exercises).all()).toEqual(before.exercises);
  });

  it('zastępuje dane istniejące, nie dokłada ich', () => {
    const { db } = populated();
    const text = serializeBackup(createBackup(db));

    const other = populated().db;
    savePlan(other, {
      sport: 'STRENGTH',
      title: 'Plan do nadpisania',
      description: '',
      sourceTemplateId: null,
      items: [
        {
          key: 'x',
          exerciseId: 1,
          exerciseName: 'x',
          trackingType: 'REPS',
          targetSets: 1,
          targetReps: 1,
          targetWeight: null,
          targetDurationSeconds: null,
          restDurationSeconds: 60,
          notes: null,
        },
      ],
    });

    restoreBackup(other, parseBackup(text));
    const titles = other
      .select({ title: schema.workoutPlans.title })
      .from(schema.workoutPlans)
      .all()
      .map((p) => p.title);
    expect(titles).not.toContain('Plan do nadpisania');
    expect(titles).toContain('Mój plan');
  });

  it('zachowuje identyfikatory, więc powiązania nadal działają', () => {
    const { db, sessionId } = populated();
    const text = serializeBackup(createBackup(db));
    const fresh = createTestDb({ seed: true });
    restoreBackup(fresh, parseBackup(text));

    const session = loadSession(fresh, sessionId)!;
    expect(session.exercises[0].name).toBe('Przysiad ze sztangą');
    expect(session.exercises[0].sets[0]).toMatchObject({ repsCompleted: 5, weightKg: 100, rpe: 8 });
  });

  it('radzi sobie z tabelą większą niż jedna porcja wstawiania', () => {
    const { db } = populated();
    const rows = Array.from({ length: 250 }, (_, i) => ({
      measuredOn: `2025-01-${String((i % 28) + 1).padStart(2, '0')}-${i}`,
      weightKg: 80 + i / 100,
    }));
    db.insert(schema.bodyMeasurements).values(rows).run();

    const fresh = createTestDb({ seed: true });
    restoreBackup(fresh, parseBackup(serializeBackup(createBackup(db))));
    expect(fresh.select().from(schema.bodyMeasurements).all()).toHaveLength(251);
  });
});

describe('parseBackup', () => {
  it('odrzuca plik, który nie jest kopią FormaSync', () => {
    expect(() => parseBackup('to nie json')).toThrow(BackupFormatError);
    expect(() => parseBackup('[]')).toThrow(BackupFormatError);
    expect(() => parseBackup(JSON.stringify({ app: 'InneApp', version: 1, tables: {} }))).toThrow(
      /nie pochodzi z FormaSync/,
    );
  });

  it('odrzuca kopię z nowszej wersji aplikacji', () => {
    const text = JSON.stringify({ app: 'FormaSync', version: BACKUP_VERSION + 1, tables: {} });
    expect(() => parseBackup(text)).toThrow(/nowszej wersji/);
  });

  it('przyjmuje kopię bez niektórych tabel i czyści te brakujące', () => {
    const { db } = populated();
    const backup = parseBackup(JSON.stringify({ app: 'FormaSync', version: 1, tables: { categories: [] } }));
    restoreBackup(db, backup);
    expect(db.select().from(schema.exercises).all()).toEqual([]);
    expect(db.select().from(schema.workoutSessions).all()).toEqual([]);
  });
});

describe('backupFileName', () => {
  it('zawiera datę', () => {
    expect(backupFileName(new Date(2026, 9, 1))).toBe('formasync-2026-10-01.json');
  });
});
