/**
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';

import * as schema from '@/db/schema';
import { createTestDb } from '@/db/test-utils';
import { listHistory } from '@/features/history/repository';

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
  startTime: '2026-10-02T12:08:44.000Z',
  endTime: '2026-10-02T12:13:47.000Z',
  durationSeconds: 303,
  avgHeartRate: 77,
  maxHeartRate: 95,
  caloriesBurned: 11,
};

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
