/**
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';
import { eq } from 'drizzle-orm';

import * as schema from '@/db/schema';
import { createTestDb } from '@/db/test-utils';
import { createSegment, emptyEnduranceDraft } from '@/features/endurance/draft';
import { saveEndurancePlan } from '@/features/endurance/repository';
import { completeSegment, loadEnduranceSession } from '@/features/endurance/session';
import { loadEnduranceWorkouts } from '@/features/endurance/stats';
import { listHistory } from '@/features/history/repository';
import { finishSession, startSession } from '@/features/workout/repository';

import {
  archiveActivity,
  archivedActivityIds,
  createSessionFromActivity,
  importedActivityIds,
  linkActivityToSession,
  linkCandidates,
  listArchivedActivities,
  restoreActivity,
  sessionWindows,
  unlinkActivity,
} from '../repository';

const ACTIVITY = {
  recordId: 'rec-1',
  title: 'Szybkie brzuszki',
  sport: 'STRENGTH' as const,
  startTime: '2026-10-02T12:08:44.000Z',
  endTime: '2026-10-02T12:13:47.000Z',
  durationSeconds: 303,
  distanceMeters: null,
  avgHeartRate: 77,
  maxHeartRate: 95,
  caloriesBurned: 11,
};

const RUN = {
  ...ACTIVITY,
  recordId: 'rec-run',
  title: 'Bieganie',
  sport: 'RUNNING' as const,
  startTime: '2026-10-04T05:50:00.000Z',
  endTime: '2026-10-04T07:23:40.000Z',
  durationSeconds: 5620,
  distanceMeters: 15000,
};

describe('dystans z zegarka', () => {
  it('bieg zapisuje jako odcinek, żeby miał dystans i tempo', () => {
    const db = createTestDb({ seed: true });
    const sessionId = createSessionFromActivity(db, RUN);

    const [workout] = loadEnduranceWorkouts(db, 'RUNNING');
    expect(workout.sessionId).toBe(sessionId);
    expect(workout.meters).toBe(15000);
    expect(workout.seconds).toBe(5620);
    // 15 km w 1:33:40 to niespełna 6:15 na kilometr.
    expect(workout.pace).toBe(375);
  });

  it('aktywność siłowa nie dostaje odcinka, bo dystans nic o niej nie mówi', () => {
    const db = createTestDb({ seed: true });
    const sessionId = createSessionFromActivity(db, { ...ACTIVITY, distanceMeters: 800 });

    expect(
      db
        .select()
        .from(schema.loggedSegments)
        .where(eq(schema.loggedSegments.sessionId, sessionId))
        .all(),
    ).toEqual([]);
  });

  it('bez odczytanego dystansu nie wymyśla odcinka', () => {
    const db = createTestDb({ seed: true });
    const sessionId = createSessionFromActivity(db, { ...RUN, distanceMeters: null });
    expect(loadEnduranceWorkouts(db, 'RUNNING').map((w) => w.sessionId)).not.toContain(sessionId);
  });

  it('połączenie z pustym biegiem z aplikacji dokłada mu dystans z zegarka', () => {
    const db = createTestDb({ seed: true });
    const sessionId = startSession(db, { kind: 'empty', sport: 'RUNNING' });
    finishSession(db, sessionId);

    linkActivityToSession(db, sessionId, RUN);

    const [workout] = loadEnduranceWorkouts(db, 'RUNNING');
    expect(workout).toMatchObject({ sessionId, meters: 15000 });
  });

  it('nie dubluje trasy treningowi, który ma własne odcinki', () => {
    const db = createTestDb({ seed: true });
    const planId = saveEndurancePlan(db, {
      ...emptyEnduranceDraft('RUNNING'),
      title: 'Wybieganie',
      segments: [createSegment('WORK')],
    });
    const sessionId = startSession(db, { kind: 'plan', planId });
    const segment = loadEnduranceSession(db, sessionId)!.segments[0];
    completeSegment(db, segment.id, { distanceMeters: 5000, durationSeconds: 1500 });
    finishSession(db, sessionId);

    linkActivityToSession(db, sessionId, RUN);

    expect(loadEnduranceWorkouts(db, 'RUNNING')[0].meters).toBe(5000);
  });
});

describe('createSessionFromActivity', () => {
  it('dopisuje aktywność do historii jako zakończony trening bez serii', () => {
    const db = createTestDb({ seed: true });
    const sessionId = createSessionFromActivity(db, ACTIVITY);

    const entry = listHistory(db).find((item) => item.id === sessionId);
    expect(entry).toMatchObject({
      title: 'Szybkie brzuszki',
      status: 'COMPLETED',
      durationSeconds: 303,
      completedSets: 0,
      tonnage: 0,
    });
  });

  it('zapamiętuje identyfikator rekordu, żeby nie wczytać go drugi raz', () => {
    const db = createTestDb({ seed: true });
    createSessionFromActivity(db, ACTIVITY);
    expect(importedActivityIds(db)).toEqual(new Set(['rec-1']));
  });

  it('dodaje okno czasowe, po którym poznamy pokrywające się aktywności', () => {
    const db = createTestDb({ seed: true });
    const sessionId = createSessionFromActivity(db, ACTIVITY);
    expect(sessionWindows(db, '2026-10-01T00:00:00.000Z')).toEqual([
      {
        id: sessionId,
        title: ACTIVITY.title,
        startTime: ACTIVITY.startTime,
        endTime: ACTIVITY.endTime,
      },
    ]);
  });
});

describe('linkActivityToSession', () => {
  it('dopina pomiary do istniejącego treningu zamiast tworzyć nowy', () => {
    const db = createTestDb({ seed: true });
    const sessionId = createSessionFromActivity(db, { ...ACTIVITY, recordId: 'rec-stary' });

    linkActivityToSession(db, sessionId, ACTIVITY);

    expect(sessionWindows(db, '2026-10-01T00:00:00.000Z')).toHaveLength(1);
    expect(importedActivityIds(db)).toEqual(new Set(['rec-1']));
  });
});

describe('unlinkActivity', () => {
  it('zdejmuje pomiary i zwalnia aktywność do ponownego wczytania', () => {
    const db = createTestDb({ seed: true });
    const sessionId = createSessionFromActivity(db, ACTIVITY);

    unlinkActivity(db, sessionId);

    expect(importedActivityIds(db)).toEqual(new Set());
    // Sam trening zostaje — znika tylko to, co przyszło z zegarka.
    expect(sessionWindows(db, '2026-10-01T00:00:00.000Z')).toHaveLength(1);
  });
});

describe('linkCandidates', () => {
  /** Zakończony trening bez pomiarów z zegarka — taki, z którym da się połączyć aktywność. */
  const addSession = (db: ReturnType<typeof createTestDb>, title: string, startTime: string) =>
    db
      .insert(schema.workoutSessions)
      .values({ title, status: 'COMPLETED', startTime, endTime: startTime })
      .returning({ id: schema.workoutSessions.id })
      .get().id;

  it('proponuje trening z okolic daty aktywności', () => {
    const db = createTestDb({ seed: true });
    const id = addSession(db, 'Nogi', '2026-10-02T11:00:00.000Z');
    expect(linkCandidates(db, ACTIVITY.startTime)).toEqual([
      { id, title: 'Nogi', startTime: '2026-10-02T11:00:00.000Z' },
    ]);
  });

  it('układa od najbliższego w czasie', () => {
    const db = createTestDb({ seed: true });
    addSession(db, 'Daleki', '2026-10-04T11:00:00.000Z');
    addSession(db, 'Bliski', '2026-10-02T11:00:00.000Z');
    expect(linkCandidates(db, ACTIVITY.startTime).map((s) => s.title)).toEqual(['Bliski', 'Daleki']);
  });

  it('pomija treningi spoza okna wokół daty aktywności', () => {
    const db = createTestDb({ seed: true });
    addSession(db, 'Za stary', '2026-09-01T11:00:00.000Z');
    expect(linkCandidates(db, ACTIVITY.startTime)).toEqual([]);
  });

  it('pomija trening, który ma już przypisaną aktywność', () => {
    const db = createTestDb({ seed: true });
    createSessionFromActivity(db, ACTIVITY);
    expect(linkCandidates(db, ACTIVITY.startTime)).toEqual([]);
  });
});

describe('archiwum aktywności', () => {
  const ITEM = { recordId: 'rec-9', title: 'Jazda na rowerze', startTime: '2026-09-30T06:00:00.000Z' };

  it('odłożona aktywność znika z listy do wczytania', () => {
    const db = createTestDb({ seed: true });
    archiveActivity(db, ITEM);
    expect(archivedActivityIds(db)).toEqual(new Set(['rec-9']));
    expect(listArchivedActivities(db)).toEqual([ITEM]);
  });

  it('odłożenie dwa razy nie tworzy duplikatu', () => {
    const db = createTestDb({ seed: true });
    archiveActivity(db, ITEM);
    archiveActivity(db, ITEM);
    expect(listArchivedActivities(db)).toHaveLength(1);
  });

  it('przywrócenie zwalnia aktywność z powrotem', () => {
    const db = createTestDb({ seed: true });
    archiveActivity(db, ITEM);
    restoreActivity(db, ITEM.recordId);
    expect(archivedActivityIds(db)).toEqual(new Set());
  });
});
