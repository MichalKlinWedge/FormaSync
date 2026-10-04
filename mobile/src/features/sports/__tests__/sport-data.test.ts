/**
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';
import { eq } from 'drizzle-orm';

import * as schema from '@/db/schema';
import { createTestDb } from '@/db/test-utils';
import { listHistory } from '@/features/history/repository';
import { savePlan } from '@/features/plans/repository';
import { finishSession, startSession } from '@/features/workout/repository';

import { isEndurance } from '../sport';

function squatId(db: ReturnType<typeof createTestDb>) {
  return db
    .select()
    .from(schema.exercises)
    .where(eq(schema.exercises.name, 'Przysiad ze sztangą'))
    .get()!.id;
}

const planWith = (sport: schema.Sport, title: string, exerciseId: number) => ({
  sport,
  title,
  description: '',
  sourceTemplateId: null,
  items: [
    {
      key: 'a',
      exerciseId,
      exerciseName: 'Przysiad ze sztangą',
      trackingType: 'REPS' as const,
      targetSets: 1,
      targetReps: 5,
      targetWeight: 60,
      targetDurationSeconds: null,
      restDurationSeconds: 90,
      notes: null,
    },
  ],
});

describe('isEndurance', () => {
  it('oddziela siłę od dyscyplin liczonych dystansem', () => {
    expect(isEndurance('STRENGTH')).toBe(false);
    expect(isEndurance('RUNNING')).toBe(true);
    expect(isEndurance('CYCLING')).toBe(true);
    expect(isEndurance('SWIMMING')).toBe(true);
  });
});

describe('sport planu i sesji', () => {
  it('plan zapisuje wybrany sport', () => {
    const db = createTestDb({ seed: true });
    const planId = savePlan(db, planWith('RUNNING', 'Wybieganie', squatId(db)));
    expect(
      db.select().from(schema.workoutPlans).where(eq(schema.workoutPlans.id, planId)).get()?.sport,
    ).toBe('RUNNING');
  });

  it('sesja z planu dziedziczy jego sport jako migawkę', () => {
    const db = createTestDb({ seed: true });
    const planId = savePlan(db, planWith('CYCLING', 'Interwały', squatId(db)));

    const sessionId = startSession(db, { kind: 'plan', planId });
    finishSession(db, sessionId);

    expect(listHistory(db).find((entry) => entry.id === sessionId)?.sport).toBe('CYCLING');
  });

  it('trening bez planu zapisuje sport podany przy starcie', () => {
    const db = createTestDb({ seed: true });
    const sessionId = startSession(db, { kind: 'empty', sport: 'SWIMMING' });
    finishSession(db, sessionId);
    expect(listHistory(db).find((entry) => entry.id === sessionId)?.sport).toBe('SWIMMING');
  });

  it('historia zawężona do sportu pomija pozostałe treningi', () => {
    const db = createTestDb({ seed: true });
    const bieg = startSession(db, { kind: 'empty', sport: 'RUNNING' });
    finishSession(db, bieg);
    const sila = startSession(db, { kind: 'empty' });
    finishSession(db, sila);

    expect(listHistory(db, 'RUNNING').map((entry) => entry.id)).toEqual([bieg]);
    expect(listHistory(db, 'STRENGTH').map((entry) => entry.id)).toEqual([sila]);
    expect(listHistory(db)).toHaveLength(2);
  });

  it('dane sprzed wprowadzenia sportów liczą się jako siła', () => {
    const db = createTestDb({ seed: true });
    const sessionId = db
      .insert(schema.workoutSessions)
      .values({ title: 'Stary trening', status: 'COMPLETED', startTime: '2026-09-01T10:00:00.000Z' })
      .returning({ id: schema.workoutSessions.id })
      .get().id;

    expect(listHistory(db, 'STRENGTH').map((entry) => entry.id)).toContain(sessionId);
  });
});
