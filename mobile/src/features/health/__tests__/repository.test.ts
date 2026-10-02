/**
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';

import { createTestDb } from '@/db/test-utils';
import { listHistory } from '@/features/history/repository';

import { createSessionFromActivity, importedActivityIds, sessionWindows } from '../repository';

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
    createSessionFromActivity(db, ACTIVITY);
    expect(sessionWindows(db, '2026-10-01T00:00:00.000Z')).toEqual([
      { startTime: ACTIVITY.startTime, endTime: ACTIVITY.endTime },
    ]);
  });
});
