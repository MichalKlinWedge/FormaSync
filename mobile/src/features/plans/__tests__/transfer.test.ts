/**
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';
import { and, eq } from 'drizzle-orm';

import * as schema from '@/db/schema';
import { createTestDb } from '@/db/test-utils';
import { saveEndurancePlan } from '@/features/endurance/repository';

import { loadPlanDraft } from '../repository';
import { encodeShared, parseShared } from '../share';
import { importPlan, sharedPlan } from '../transfer';

/**
 * Przekazanie treningu drugiej osobie. Sprawdzamy to, czego nie widać w samym formacie:
 * że po drodze przez cudzą bazę plan zostaje tym samym planem, a ćwiczenia wracają do katalogu
 * odbiorcy po nazwach, nie po identyfikatorach z naszej bazy.
 */

type Db = ReturnType<typeof createTestDb>;

/** Wyjęty z seeda szablon — gotowy trening siłowy z kilkoma ćwiczeniami. */
function template(db: Db) {
  return db
    .select()
    .from(schema.workoutPlans)
    .where(and(eq(schema.workoutPlans.isTemplate, true), eq(schema.workoutPlans.title, 'PPL — Push (pchanie)')))
    .get()!;
}

/** Wiersz planu prosto z bazy — ekran go nie pokazuje, a test musi na niego spojrzeć. */
function planRow(database: Db, planId: number) {
  return database.select().from(schema.workoutPlans).where(eq(schema.workoutPlans.id, planId)).get()!;
}

/** Drugi telefon: ta sama aplikacja, własna baza, własne identyfikatory. */
const otherPhone = () => createTestDb({ seed: true });

describe('sharedPlan', () => {
  it('nie wypuszcza identyfikatorów z bazy', () => {
    const db = createTestDb({ seed: true });
    const text = encodeShared(sharedPlan(db, template(db).id));

    expect(text).not.toMatch(/"(id|planId|exerciseId|sourceTemplateId)"/);
  });

  it('zabiera nazwy ćwiczeń i ich liczby', () => {
    const db = createTestDb({ seed: true });
    const source = loadPlanDraft(db, template(db).id);
    const plan = sharedPlan(db, template(db).id);

    expect(plan.title).toBe(source.title);
    expect(plan.exercises.map((e) => e.name)).toEqual(source.items.map((i) => i.exerciseName));
    expect(plan.exercises[0]).toMatchObject({
      sets: source.items[0].targetSets,
      reps: source.items[0].targetReps,
      restSeconds: source.items[0].restDurationSeconds,
    });
  });
});

describe('importPlan', () => {
  it('przenosi trening na drugi telefon bez zmiany treści', () => {
    const mine = createTestDb({ seed: true });
    const sent = encodeShared(sharedPlan(mine, template(mine).id));

    const theirs = otherPhone();
    const result = importPlan(theirs, parseShared(sent));
    const landed = loadPlanDraft(theirs, result.planId);
    const original = loadPlanDraft(mine, template(mine).id);

    expect(landed.title).toBe(original.title);
    expect(landed.sport).toBe(original.sport);
    expect(landed.items.map((i) => i.exerciseName)).toEqual(original.items.map((i) => i.exerciseName));
    expect(landed.items.map((i) => i.targetSets)).toEqual(original.items.map((i) => i.targetSets));
    expect(landed.items.map((i) => i.targetReps)).toEqual(original.items.map((i) => i.targetReps));
  });

  it('wczytany plan jest własnym planem odbiorcy, a nie szablonem', () => {
    const mine = createTestDb({ seed: true });
    const theirs = otherPhone();
    const result = importPlan(theirs, parseShared(encodeShared(sharedPlan(mine, template(mine).id))));

    expect(planRow(theirs, result.planId)).toMatchObject({ isTemplate: false, sourceTemplateId: null });
  });

  it('podpina ćwiczenia do katalogu odbiorcy, a nie dopisuje ich drugi raz', () => {
    const mine = createTestDb({ seed: true });
    const theirs = otherPhone();
    const before = theirs.select().from(schema.exercises).all().length;

    const result = importPlan(theirs, parseShared(encodeShared(sharedPlan(mine, template(mine).id))));

    expect(result.added).toEqual([]);
    expect(theirs.select().from(schema.exercises).all()).toHaveLength(before);
  });

  it('dopisuje ćwiczenie, którego odbiorca nie ma, i mówi o tym', () => {
    const theirs = otherPhone();
    const result = importPlan(theirs, {
      app: 'formasync',
      version: 1,
      sport: 'STRENGTH',
      title: 'Wymyślony trening',
      description: null,
      exercises: [
        {
          name: 'Wiosłowanie na jednej ręce w podporze',
          trackingType: 'REPS',
          sets: 3,
          reps: 12,
          weightKg: 24,
          durationSeconds: null,
          restSeconds: 90,
          notes: null,
        },
      ],
      segments: [],
    });

    expect(result.added).toEqual(['Wiosłowanie na jednej ręce w podporze']);
    expect(loadPlanDraft(theirs, result.planId).items[0]).toMatchObject({ targetReps: 12, targetWeight: 24 });
    // Dopisane ćwiczenie jest własne — katalogowe przyszłyby z seeda.
    expect(theirs.select().from(schema.exercises).all().at(-1)).toMatchObject({
      name: 'Wiosłowanie na jednej ręce w podporze',
      isCustom: true,
    });
  });

  it('nazwa ćwiczenia pisana inaczej to nadal to samo ćwiczenie', () => {
    const mine = createTestDb({ seed: true });
    const plan = sharedPlan(mine, template(mine).id);
    const shouted = {
      ...plan,
      exercises: plan.exercises.map((e) => ({ ...e, name: e.name.toUpperCase() })),
    };

    const theirs = otherPhone();
    const before = theirs.select().from(schema.exercises).all().length;
    const result = importPlan(theirs, shouted);

    expect(result.added).toEqual([]);
    expect(theirs.select().from(schema.exercises).all()).toHaveLength(before);
  });

  it('mówi, gdy ten sam ruch ma u odbiorcy inny rodzaj pomiaru', () => {
    const mine = createTestDb({ seed: true });
    const plan = sharedPlan(mine, template(mine).id);
    const first = plan.exercises[0];
    const asTime = {
      ...plan,
      exercises: [{ ...first, trackingType: 'TIME' as const, reps: null, durationSeconds: 45 }],
    };

    const theirs = otherPhone();
    const result = importPlan(theirs, asTime);

    expect(result.mismatched).toEqual([first.name]);
    // Liczby biorą rodzaj pomiaru z własnego katalogu, bo to on rządzi ekranem treningu.
    expect(loadPlanDraft(theirs, result.planId).items[0]).toMatchObject({
      trackingType: 'REPS',
      targetDurationSeconds: null,
    });
  });

  it('przenosi trening wytrzymałościowy razem z grupą powtórzeń', () => {
    const mine = createTestDb({ seed: true });
    const planId = saveEndurancePlan(mine, {
      sport: 'RUNNING',
      title: '6 × 400 m',
      description: '',
      segments: [
        {
          key: 'a',
          parentKey: null,
          kind: 'WARMUP',
          repeatCount: null,
          durationType: 'TIME',
          distanceMeters: null,
          durationSeconds: 600,
          targetType: 'NONE',
          targetLow: null,
          targetHigh: null,
          stroke: null,
          equipment: null,
          drill: null,
          notes: null,
        },
        {
          key: 'b',
          parentKey: null,
          kind: 'REPEAT',
          repeatCount: 6,
          durationType: 'OPEN',
          distanceMeters: null,
          durationSeconds: null,
          targetType: 'NONE',
          targetLow: null,
          targetHigh: null,
          stroke: null,
          equipment: null,
          drill: null,
          notes: null,
        },
        {
          key: 'c',
          parentKey: 'b',
          kind: 'WORK',
          repeatCount: null,
          durationType: 'DISTANCE',
          distanceMeters: 400,
          durationSeconds: null,
          targetType: 'PACE',
          targetLow: 230,
          targetHigh: 245,
          stroke: null,
          equipment: null,
          drill: null,
          notes: null,
        },
      ],
    });

    const theirs = otherPhone();
    const result = importPlan(theirs, parseShared(encodeShared(sharedPlan(mine, planId))));
    const landed = sharedPlan(theirs, result.planId);

    expect(landed.title).toBe('6 × 400 m');
    expect(landed.segments.map((s) => s.kind)).toEqual(['WARMUP', 'REPEAT']);
    expect(landed.segments[1].repeatCount).toBe(6);
    expect(landed.segments[1].children[0]).toMatchObject({
      kind: 'WORK',
      distanceMeters: 400,
      targetLow: 230,
      targetHigh: 245,
    });
  });
});
