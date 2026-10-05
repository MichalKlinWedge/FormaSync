/**
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';

import * as schema from '@/db/schema';
import { createTestDb } from '@/db/test-utils';
import { createRepeatBlock, createSegment, emptyEnduranceDraft, updateSegment } from '@/features/endurance/draft';
import { saveEndurancePlan } from '@/features/endurance/repository';
import { savePlan } from '@/features/plans/repository';

import { buildWorkoutPayload } from '../payload';
import { loadGarminPlan } from '../workouts';

describe('loadGarminPlan', () => {
  it('plan siłowy przychodzi z ćwiczeniami w kolejności planu', () => {
    const db = createTestDb({ seed: true });
    const [squat, plank] = db.select().from(schema.exercises).limit(2).all();
    const planId = savePlan(db, {
      sport: 'STRENGTH',
      title: 'Nogi',
      description: '',
      sourceTemplateId: null,
      items: [
        {
          key: 'a',
          exerciseId: squat.id,
          exerciseName: squat.name,
          trackingType: squat.trackingType,
          targetSets: 4,
          targetReps: 6,
          targetWeight: 80,
          targetDurationSeconds: null,
          restDurationSeconds: 150,
          notes: null,
        },
        {
          key: 'b',
          exerciseId: plank.id,
          exerciseName: plank.name,
          trackingType: plank.trackingType,
          targetSets: 3,
          targetReps: 10,
          targetWeight: null,
          targetDurationSeconds: null,
          restDurationSeconds: 60,
          notes: null,
        },
      ],
    });

    const plan = loadGarminPlan(db, planId)!;
    expect(plan).toMatchObject({ title: 'Nogi', sport: 'STRENGTH', segments: [] });
    expect(plan.exercises).toHaveLength(2);
    expect(plan.exercises[0]).toMatchObject({ targetSets: 4, targetReps: 6, targetWeight: 80 });
  });

  it('plan biegowy przychodzi jako drzewo — grupa powtórzeń ma swoje wnętrze', () => {
    const db = createTestDb({ seed: true });
    const [group, work, recovery] = createRepeatBlock();
    const planId = saveEndurancePlan(db, {
      ...emptyEnduranceDraft('RUNNING'),
      title: 'Interwały',
      segments: updateSegment([createSegment('WARMUP'), group, work, recovery], group.key, {
        repeatCount: 4,
      }),
    });

    const plan = loadGarminPlan(db, planId)!;
    expect(plan.sport).toBe('RUNNING');
    // Rozgrzewka i grupa stoją na wierzchu; praca i przerwa siedzą w grupie, nie obok niej.
    expect(plan.segments.map((segment) => segment.kind)).toEqual(['WARMUP', 'REPEAT']);
    expect(plan.segments[1].repeatCount).toBe(4);
    expect(plan.segments[1].children.map((child) => child.kind)).toEqual(['WORK', 'RECOVERY']);
    expect(plan.exercises).toEqual([]);
  });

  it('wczytany plan daje się od razu zamienić na treść dla Garmina', () => {
    const db = createTestDb({ seed: true });
    const planId = saveEndurancePlan(db, {
      ...emptyEnduranceDraft('CYCLING'),
      title: 'Jazda ciągła',
      segments: [createSegment('WORK')],
    });

    const payload = buildWorkoutPayload(loadGarminPlan(db, planId)!) as {
      workoutName: string;
      sportType: { sportTypeKey: string };
    };
    expect(payload).toMatchObject({
      workoutName: 'Jazda ciągła',
      sportType: { sportTypeKey: 'cycling' },
    });
  });

  it('nieistniejący plan to null, a nie wyjątek', () => {
    expect(loadGarminPlan(createTestDb({ seed: true }), 9999)).toBeNull();
  });
});
