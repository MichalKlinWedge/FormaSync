/**
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';

import { createTestDb } from '@/db/test-utils';
import { listHistory } from '@/features/history/repository';
import { abandonSession, finishSession, startSession } from '@/features/workout/repository';

import { createRepeatBlock, createSegment, emptyEnduranceDraft, updateSegment } from '../draft';
import { saveEndurancePlan } from '../repository';
import { paceFrom } from '../format';
import { completeSegment, loadEnduranceSession, sessionTotals, uncompleteSegment } from '../session';

function planWithIntervals(db: ReturnType<typeof createTestDb>, repeats = 3) {
  const [group, work, recovery] = createRepeatBlock();
  return saveEndurancePlan(db, {
    ...emptyEnduranceDraft('RUNNING'),
    title: 'Interwały',
    segments: updateSegment([createSegment('WARMUP'), group, work, recovery], group.key, {
      repeatCount: repeats,
    }),
  });
}

describe('start treningu wytrzymałościowego', () => {
  it('rozwija grupę powtórzeń na tyle odcinków, ile iteracji', () => {
    const db = createTestDb({ seed: true });
    const planId = planWithIntervals(db, 3);

    const sessionId = startSession(db, { kind: 'plan', planId });
    const session = loadEnduranceSession(db, sessionId)!;

    // rozgrzewka + 3 × (praca + przerwa)
    expect(session.segments).toHaveLength(7);
    expect(session.segments[0].kind).toBe('WARMUP');
    expect(session.segments.filter((s) => s.kind === 'WORK').map((s) => s.iteration)).toEqual([1, 2, 3]);
    expect(session.segments.every((s) => s.completedAt === null)).toBe(true);
  });

  it('odcinki idą w kolejności biegu: praca i przerwa na przemian', () => {
    const db = createTestDb({ seed: true });
    const sessionId = startSession(db, { kind: 'plan', planId: planWithIntervals(db, 2) });
    const kinds = loadEnduranceSession(db, sessionId)!.segments.map((s) => s.kind);
    expect(kinds).toEqual(['WARMUP', 'WORK', 'RECOVERY', 'WORK', 'RECOVERY']);
  });
});

describe('zapis odcinka', () => {
  it('bez podanych liczb przyjmuje cel z planu', () => {
    const db = createTestDb({ seed: true });
    const sessionId = startSession(db, { kind: 'plan', planId: planWithIntervals(db, 1) });
    const work = loadEnduranceSession(db, sessionId)!.segments.find((s) => s.kind === 'WORK')!;

    completeSegment(db, work.id, {});

    const saved = loadEnduranceSession(db, sessionId)!.segments.find((s) => s.id === work.id)!;
    expect(saved.distanceMeters).toBe(work.targetDistanceMeters);
    expect(saved.completedAt).not.toBeNull();
  });

  it('podane liczby mają pierwszeństwo przed celem', () => {
    const db = createTestDb({ seed: true });
    const sessionId = startSession(db, { kind: 'plan', planId: planWithIntervals(db, 1) });
    const work = loadEnduranceSession(db, sessionId)!.segments.find((s) => s.kind === 'WORK')!;

    completeSegment(db, work.id, { distanceMeters: 420, durationSeconds: 95 });

    const saved = loadEnduranceSession(db, sessionId)!.segments.find((s) => s.id === work.id)!;
    expect(saved.distanceMeters).toBe(420);
    expect(saved.durationSeconds).toBe(95);
  });

  it('mierzy czas odcinka zegarem, gdy plan go nie narzuca', () => {
    const db = createTestDb({ seed: true });
    const planId = planWithIntervals(db, 1);
    const start = '2026-10-05T08:00:00.000Z';
    const sessionId = startSession(db, { kind: 'plan', planId }, start);
    const session = loadEnduranceSession(db, sessionId)!;
    const [warmup, work] = session.segments;

    // Rozgrzewka zatwierdzona po dziesięciu minutach od startu treningu.
    completeSegment(db, warmup.id, {}, '2026-10-05T08:10:00.000Z');
    // Odcinek na dystans zatwierdzony po kolejnych stu sekundach.
    completeSegment(db, work.id, {}, '2026-10-05T08:11:40.000Z');

    const saved = loadEnduranceSession(db, sessionId)!.segments;
    expect(saved.find((s) => s.id === warmup.id)?.durationSeconds).toBe(600);
    expect(saved.find((s) => s.id === work.id)?.durationSeconds).toBe(100);
  });

  it('zmierzony czas pozwala policzyć tempo odcinka na dystans', () => {
    const db = createTestDb({ seed: true });
    const sessionId = startSession(db, { kind: 'plan', planId: planWithIntervals(db, 1) }, '2026-10-05T08:00:00.000Z');
    const work = loadEnduranceSession(db, sessionId)!.segments.find((s) => s.kind === 'WORK')!;

    completeSegment(db, work.id, {}, '2026-10-05T08:01:36.000Z');

    const saved = loadEnduranceSession(db, sessionId)!.segments.find((s) => s.id === work.id)!;
    // 400 m w 96 s to 4:00 na kilometr.
    expect(paceFrom(saved.distanceMeters, saved.durationSeconds)).toBe(240);
  });

  it('podany czas ma pierwszeństwo przed zmierzonym', () => {
    const db = createTestDb({ seed: true });
    const sessionId = startSession(db, { kind: 'plan', planId: planWithIntervals(db, 1) }, '2026-10-05T08:00:00.000Z');
    const work = loadEnduranceSession(db, sessionId)!.segments.find((s) => s.kind === 'WORK')!;

    completeSegment(db, work.id, { durationSeconds: 88 }, '2026-10-05T08:05:00.000Z');

    expect(
      loadEnduranceSession(db, sessionId)!.segments.find((s) => s.id === work.id)?.durationSeconds,
    ).toBe(88);
  });

  it('cofnięcie zapisu zwalnia odcinek z powrotem', () => {
    const db = createTestDb({ seed: true });
    const sessionId = startSession(db, { kind: 'plan', planId: planWithIntervals(db, 1) });
    const work = loadEnduranceSession(db, sessionId)!.segments.find((s) => s.kind === 'WORK')!;

    completeSegment(db, work.id, {});
    uncompleteSegment(db, work.id);

    expect(loadEnduranceSession(db, sessionId)!.segments.find((s) => s.id === work.id)!.completedAt).toBeNull();
  });

  it('podsumowanie liczy tylko zapisane odcinki', () => {
    const db = createTestDb({ seed: true });
    const sessionId = startSession(db, { kind: 'plan', planId: planWithIntervals(db, 2) });
    const session = loadEnduranceSession(db, sessionId)!;
    const work = session.segments.filter((s) => s.kind === 'WORK');

    completeSegment(db, work[0].id, { distanceMeters: 400, durationSeconds: 90 });

    expect(sessionTotals(loadEnduranceSession(db, sessionId)!.segments)).toEqual({
      meters: 400,
      seconds: 90,
    });
  });
});

describe('zakończenie treningu wytrzymałościowego', () => {
  it('niezapisane odcinki nie trafiają do historii', () => {
    const db = createTestDb({ seed: true });
    const sessionId = startSession(db, { kind: 'plan', planId: planWithIntervals(db, 2) });
    const work = loadEnduranceSession(db, sessionId)!.segments.find((s) => s.kind === 'WORK')!;
    completeSegment(db, work.id, {});

    finishSession(db, sessionId);

    expect(loadEnduranceSession(db, sessionId)!.segments).toHaveLength(1);
    expect(listHistory(db, 'RUNNING').map((entry) => entry.id)).toEqual([sessionId]);
  });

  it('przerwany bieg bez ani jednego odcinka znika, zamiast zaśmiecać historię', () => {
    const db = createTestDb({ seed: true });
    const sessionId = startSession(db, { kind: 'plan', planId: planWithIntervals(db, 1) });

    abandonSession(db, sessionId);

    expect(loadEnduranceSession(db, sessionId)).toBeNull();
  });

  it('przerwany bieg z zapisanym odcinkiem zostaje w historii', () => {
    const db = createTestDb({ seed: true });
    const sessionId = startSession(db, { kind: 'plan', planId: planWithIntervals(db, 1) });
    const work = loadEnduranceSession(db, sessionId)!.segments.find((s) => s.kind === 'WORK')!;
    completeSegment(db, work.id, {});

    abandonSession(db, sessionId);

    expect(listHistory(db, 'RUNNING').map((entry) => entry.id)).toEqual([sessionId]);
  });
});
