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
import { adoptTermPlan, attachSession, openTermsOn, scheduleWorkouts } from '@/features/calendar/repository';
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
  garminLinkedSessions,
  replaceSegmentsWithLaps,
  restoreActivity,
  setSessionSport,
  saveHeartRateMetrics,
  sessionsMissingLaps,
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

const LAPS = [
  { meters: 1000, seconds: 300, avgHeartRate: 148 },
  { meters: 1000, seconds: 282, avgHeartRate: 156 },
  { meters: 1000, seconds: 294, avgHeartRate: 152 },
];

describe('okrążenia z zegarka', () => {
  it('zapisuje każde okrążenie jako osobny odcinek', () => {
    const db = createTestDb({ seed: true });
    const sessionId = createSessionFromActivity(
      db,
      { ...RUN, distanceMeters: 3000, durationSeconds: 876 },
      LAPS,
    );

    const segments = db
      .select()
      .from(schema.loggedSegments)
      .where(eq(schema.loggedSegments.sessionId, sessionId))
      .all();
    expect(segments).toHaveLength(3);
    expect(segments.map((segment) => segment.distanceMeters)).toEqual([1000, 1000, 1000]);
    expect(segments.map((segment) => segment.avgHeartRate)).toEqual([148, 156, 152]);
  });

  it('układa okrążenia w kolejności, w jakiej padły', () => {
    const db = createTestDb({ seed: true });
    createSessionFromActivity(db, { ...RUN, distanceMeters: 3000, durationSeconds: 876 }, LAPS);

    const [workout] = loadEnduranceWorkouts(db, 'RUNNING');
    expect(workout.splits).toEqual([
      { meters: 1000, seconds: 300 },
      { meters: 1000, seconds: 282 },
      { meters: 1000, seconds: 294 },
    ]);
    // Sumy muszą zostać te same, co w podsumowaniu aktywności.
    expect(workout.meters).toBe(3000);
    expect(workout.seconds).toBe(876);
  });

  it('bez okrążeń zapisuje trening jednym odcinkiem, jak dotąd', () => {
    const db = createTestDb({ seed: true });
    createSessionFromActivity(db, RUN);

    const [workout] = loadEnduranceWorkouts(db, 'RUNNING');
    expect(workout.splits).toHaveLength(1);
  });

  it('dopina okrążenia do treningu prowadzonego w aplikacji bez własnych odcinków', () => {
    const db = createTestDb({ seed: true });
    const sessionId = startSession(db, { kind: 'empty', sport: 'RUNNING' });
    finishSession(db, sessionId);
    linkActivityToSession(db, sessionId, { ...RUN, distanceMeters: 3000 }, LAPS);

    const [workout] = loadEnduranceWorkouts(db, 'RUNNING');
    expect(workout.splits).toHaveLength(3);
  });
});

describe('dociąganie okrążeń do historii', () => {
  it('wskazuje treningi z zegarka zapisane jednym odcinkiem', () => {
    const db = createTestDb({ seed: true });
    const sessionId = createSessionFromActivity(db, { ...RUN, distanceMeters: 3000 });

    expect(sessionsMissingLaps(db)).toEqual([
      // Dyscyplina jedzie razem z resztą: od niej zależy próg tempa, po którym poznajemy
      // okrążenia nie z tego świata.
      { sessionId, recordId: 'rec-run', startTime: RUN.startTime, meters: 3000, sport: 'RUNNING' },
    ]);
  });

  it('pomija treningi, które okrążenia już mają', () => {
    const db = createTestDb({ seed: true });
    createSessionFromActivity(db, { ...RUN, distanceMeters: 3000 }, LAPS);

    expect(sessionsMissingLaps(db)).toEqual([]);
  });

  it('pomija siłownię — tam nie ma czego dzielić', () => {
    const db = createTestDb({ seed: true });
    createSessionFromActivity(db, ACTIVITY);

    expect(sessionsMissingLaps(db)).toEqual([]);
  });

  it('wymienia jeden odcinek z sumami na okrążenia', () => {
    const db = createTestDb({ seed: true });
    const sessionId = createSessionFromActivity(db, { ...RUN, distanceMeters: 3000, durationSeconds: 876 });
    replaceSegmentsWithLaps(db, sessionId, LAPS, RUN.startTime);

    const [workout] = loadEnduranceWorkouts(db, 'RUNNING');
    // Trasa nie policzyła się dwa razy: stary odcinek z sumami zniknął.
    expect(workout.meters).toBe(3000);
    expect(workout.splits).toHaveLength(3);
    expect(sessionsMissingLaps(db)).toEqual([]);
  });

  it('bez okrążeń nie rusza zapisanego treningu', () => {
    const db = createTestDb({ seed: true });
    const sessionId = createSessionFromActivity(db, { ...RUN, distanceMeters: 3000 });
    replaceSegmentsWithLaps(db, sessionId, [], RUN.startTime);

    const [workout] = loadEnduranceWorkouts(db, 'RUNNING');
    expect(workout.meters).toBe(3000);
    expect(workout.splits).toHaveLength(1);
  });
});

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

  it('dodaje okno czasowe oznaczone jako zmierzone, po którym poznamy tę samą aktywność', () => {
    // Trening zrobiony z aktywności ma pomiary z zegarka, więc ta sama aktywność pobrana jeszcze raz
    // — choćby pod innym identyfikatorem — nie może wrócić na listę do wczytania.
    const db = createTestDb({ seed: true });
    const sessionId = createSessionFromActivity(db, ACTIVITY);
    expect(sessionWindows(db, '2026-10-01T00:00:00.000Z')).toEqual([
      {
        id: sessionId,
        title: ACTIVITY.title,
        startTime: ACTIVITY.startTime,
        endTime: ACTIVITY.endTime,
        linked: true,
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

describe('saveHeartRateMetrics', () => {
  it('dopisuje tętno, nie ruszając kalorii ani numeru aktywności', () => {
    // Synchronizacja biometrii zna tylko tętno. Gdyby zapisywała cały wiersz, skasowałaby kalorie
    // i powiązanie, które przyszły razem z wczytaną aktywnością.
    const db = createTestDb({ seed: true });
    const sessionId = createSessionFromActivity(db, ACTIVITY);

    saveHeartRateMetrics(db, { sessionId, avgHeartRate: 131, maxHeartRate: 168 });

    const row = db
      .select()
      .from(schema.garminActivityMetrics)
      .where(eq(schema.garminActivityMetrics.sessionId, sessionId))
      .get();
    expect(row).toMatchObject({
      avgHeartRate: 131,
      maxHeartRate: 168,
      caloriesBurned: ACTIVITY.caloriesBurned,
      garminActivityId: ACTIVITY.recordId,
    });
  });

  it('trening bez odczytanego tętna nie zakłada pustego wiersza', () => {
    // Pusty wiersz liczyłby się jako pomiary i ukrywałby trening przed połączeniem z aktywnością.
    const db = createTestDb({ seed: true });
    const sessionId = startSession(db, { kind: 'empty', sport: 'STRENGTH' });
    finishSession(db, sessionId);

    expect(saveHeartRateMetrics(db, { sessionId, avgHeartRate: null, maxHeartRate: null })).toBe(false);
    expect(sessionWindows(db, '2026-10-01T00:00:00.000Z').every((w) => !w.linked)).toBe(true);
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

describe('aktywność z zegarka wprost do terminu', () => {
  it('przypisanie jednym krokiem zamyka termin i wiąże go z treningiem', () => {
    const db = createTestDb({ seed: true });
    const plan = db.select().from(schema.workoutPlans).all().find((p) => p.sport === 'SWIMMING')!;
    scheduleWorkouts(db, {
      planId: plan.id,
      dates: ['2026-10-06'],
      scheduledTime: '15:00',
      reminderOffsetMinutes: null,
    });

    const [term] = openTermsOn(db, '2026-10-06', 'SWIMMING');
    expect(term).toBeDefined();

    const sessionId = createSessionFromActivity(db, {
      recordId: 'basen-1',
      title: 'Pływanie na basenie',
      sport: 'SWIMMING',
      startTime: '2026-10-06T13:45:00.000Z',
      endTime: '2026-10-06T14:17:40.000Z',
      durationSeconds: 1960,
      distanceMeters: 1000,
      avgHeartRate: null,
      maxHeartRate: null,
      caloriesBurned: 172,
    });
    attachSession(db, term.id, sessionId);

    const stored = db
      .select()
      .from(schema.scheduledWorkouts)
      .where(eq(schema.scheduledWorkouts.id, term.id))
      .get()!;
    expect(stored.isCompleted).toBe(true);
    // Termin przestaje być wolny, więc drugiej aktywności nie da się na niego nałożyć.
    expect(openTermsOn(db, '2026-10-06', 'SWIMMING')).toEqual([]);
  });

  it('trening przejmuje nazwę z planu, a nie z zegarka', () => {
    // Garmin mierzy „Kardio”, a w kalendarzu stoi „Taniec” — to termin mówi, co to były za zajęcia.
    const db = createTestDb({ seed: true });
    const plan = db.select().from(schema.workoutPlans).all().find((p) => p.sport === 'SWIMMING')!;
    scheduleWorkouts(db, {
      planId: plan.id,
      dates: ['2026-10-06'],
      scheduledTime: '15:00',
      reminderOffsetMinutes: null,
    });
    const [term] = openTermsOn(db, '2026-10-06', 'SWIMMING');
    const sessionId = createSessionFromActivity(db, {
      recordId: 'garmin:1',
      title: 'Kardio',
      sport: 'SWIMMING',
      startTime: '2026-10-06T13:45:00.000Z',
      endTime: '2026-10-06T14:17:40.000Z',
      durationSeconds: 1960,
      distanceMeters: null,
      avgHeartRate: null,
      maxHeartRate: null,
      caloriesBurned: null,
    });

    attachSession(db, term.id, sessionId);
    adoptTermPlan(db, sessionId, term.id);

    expect(listHistory(db).find((item) => item.id === sessionId)?.title).toBe(plan.title);
  });
});

describe('dyscyplina wczytanych treningów', () => {
  it('wskazuje treningi z zegarka razem z dzisiejszą dyscypliną', () => {
    const db = createTestDb({ seed: true });
    const sessionId = createSessionFromActivity(db, { ...RUN, distanceMeters: 3000 });

    expect(garminLinkedSessions(db)).toEqual([
      { sessionId, recordId: 'rec-run', sport: 'RUNNING' },
    ]);
  });

  it('pomija treningi prowadzone w aplikacji — te mają dyscyplinę z planu', () => {
    const db = createTestDb({ seed: true });
    const planId = saveEndurancePlan(db, {
      ...emptyEnduranceDraft('RUNNING'),
      title: 'Wybieganie',
      segments: [createSegment('WORK')],
    });
    const sessionId = startSession(db, { kind: 'plan', planId });
    finishSession(db, sessionId);
    linkActivityToSession(db, sessionId, RUN);

    expect(garminLinkedSessions(db)).toEqual([]);
  });

  it('przepisuje dyscyplinę, nie ruszając reszty treningu', () => {
    const db = createTestDb({ seed: true });
    // Wędrówka wczytana wtedy, gdy marsz szedł jeszcze do biegania.
    const sessionId = createSessionFromActivity(db, {
      ...RUN,
      title: 'Zakopane Piesze wędrówki',
      distanceMeters: 60150,
    });
    setSessionSport(db, sessionId, 'OTHER');

    expect(loadEnduranceWorkouts(db, 'RUNNING')).toEqual([]);
    const [moved] = loadEnduranceWorkouts(db, 'OTHER');
    expect(moved).toMatchObject({ sessionId, title: 'Zakopane Piesze wędrówki', meters: 60150 });
  });
});
