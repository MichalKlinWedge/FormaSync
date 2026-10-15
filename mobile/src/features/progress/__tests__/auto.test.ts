/**
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';
import { eq } from 'drizzle-orm';

import * as schema from '@/db/schema';
import { createTestDb } from '@/db/test-utils';
import { loadPlanDraft, savePlan } from '@/features/plans/repository';
import { completeSet, finishSession, loadSession, startSession, updateSet } from '@/features/workout/repository';

import { runAutoProgression, setAutoProgression } from '../auto';

/**
 * Progresja bez pytania. Najważniejsze są tu dwie rzeczy, których na telefonie nie widać od razu:
 * że wyłączony tryb naprawdę niczego nie rusza i że powtórzone przeliczenie tego samego treningu
 * nie podbija ciężaru drugi raz — a wołamy je po każdej poprawce serii.
 */

function setup({ auto }: { auto: boolean }) {
  const db = createTestDb({ seed: true });
  const squat = db
    .select()
    .from(schema.exercises)
    .where(eq(schema.exercises.name, 'Przysiad ze sztangą'))
    .get()!;

  const planId = savePlan(db, {
    sport: 'STRENGTH',
    title: 'Mój plan',
    description: '',
    sourceTemplateId: null,
    items: [
      {
        key: 'a',
        exerciseId: squat.id,
        exerciseName: squat.name,
        trackingType: 'REPS',
        targetSets: 3,
        targetReps: 5,
        targetWeight: 100,
        targetDurationSeconds: null,
        restDurationSeconds: 120,
        notes: null,
      },
    ],
  });

  setAutoProgression(db, auto);
  return { db, planId, squatId: squat.id };
}

/** Komplet serii przy niskim RPE — wykonanie, po którym reguła każe dołożyć. */
function fullSession(
  db: ReturnType<typeof createTestDb>,
  planId: number,
  weightKg = 100,
  day = '2026-10-08',
) {
  const sessionId = startSession(db, { kind: 'plan', planId }, `${day}T10:00:00.000Z`);
  loadSession(db, sessionId)!.exercises[0].sets.forEach((set, index) =>
    completeSet(db, set.id, { repsCompleted: 5, weightKg, rpe: 7 }, `${day}T10:0${index}:00.000Z`),
  );
  return sessionId;
}

const planWeight = (db: ReturnType<typeof createTestDb>, planId: number) =>
  loadPlanDraft(db, planId).items[0].targetWeight;

describe('automatyczna progresja', () => {
  it('po zakończonym treningu podnosi ciężar w planie', () => {
    const { db, planId } = setup({ auto: true });
    const sessionId = fullSession(db, planId);

    const result = finishSession(db, sessionId, {}, '2026-10-08T11:00:00.000Z');

    expect(planWeight(db, planId)).toBe(105);
    expect(result).toMatchObject({ planTitle: 'Mój plan' });
    expect(result?.changes).toEqual([
      { exerciseName: 'Przysiad ze sztangą', advice: 'INCREASE', from: 100, to: 105 },
    ]);
  });

  it('przy wyłączonym trybie nie rusza planu', () => {
    const { db, planId } = setup({ auto: false });
    const sessionId = fullSession(db, planId);

    expect(finishSession(db, sessionId, {}, '2026-10-08T11:00:00.000Z')).toBeNull();
    expect(planWeight(db, planId)).toBe(100);
  });

  it('powtórzone przeliczenie nie podbija ciężaru drugi raz', () => {
    const { db, planId } = setup({ auto: true });
    const sessionId = fullSession(db, planId);
    finishSession(db, sessionId, {}, '2026-10-08T11:00:00.000Z');

    // Tak wygląda każde wejście w zapisany trening i każda poprawka w nim.
    expect(runAutoProgression(db, sessionId)).toBeNull();
    expect(planWeight(db, planId)).toBe(105);
  });

  it('poprawka w zapisanym treningu przelicza plan od nowa', () => {
    const { db, planId } = setup({ auto: true });
    const sessionId = fullSession(db, planId);
    finishSession(db, sessionId, {}, '2026-10-08T11:00:00.000Z');
    expect(planWeight(db, planId)).toBe(105);

    // Okazuje się, że ostatnia seria poszła na 110 kg, nie na 100.
    const sets = loadSession(db, sessionId)!.exercises[0].sets;
    sets.forEach((set) => updateSet(db, set.id, { weightKg: 110 }));

    const result = runAutoProgression(db, sessionId);

    expect(planWeight(db, planId)).toBe(115);
    expect(result?.changes[0]).toMatchObject({ from: 105, to: 115 });
  });

  it('trening bez planu nie ma czego aktualizować', () => {
    const { db } = setup({ auto: true });
    const sessionId = startSession(db, { kind: 'empty', sport: 'STRENGTH' }, '2026-10-08T10:00:00.000Z');

    expect(finishSession(db, sessionId, {}, '2026-10-08T11:00:00.000Z')).toBeNull();
  });

  it('nieukończonej sesji nie ocenia', () => {
    const { db, planId } = setup({ auto: true });
    const sessionId = fullSession(db, planId);

    expect(runAutoProgression(db, sessionId)).toBeNull();
    expect(planWeight(db, planId)).toBe(100);
  });

  it('milczy, gdy reguła nie zmienia tego, co stoi w planie', () => {
    const { db, planId } = setup({ auto: true });
    // Komplet serii, ale przy RPE 9: reguła każe utrzymać ciężar, czyli zostawić plan w spokoju.
    const sessionId = startSession(db, { kind: 'plan', planId }, '2026-10-08T10:00:00.000Z');
    loadSession(db, sessionId)!.exercises[0].sets.forEach((set, index) =>
      completeSet(db, set.id, { repsCompleted: 5, weightKg: 100, rpe: 9 }, `2026-10-08T10:0${index}:00.000Z`),
    );

    expect(finishSession(db, sessionId, {}, '2026-10-08T11:00:00.000Z')).toBeNull();
    expect(planWeight(db, planId)).toBe(100);
  });
});
