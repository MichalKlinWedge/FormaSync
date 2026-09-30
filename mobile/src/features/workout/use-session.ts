import { eq } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useCallback, useState } from 'react';

import { db } from '@/db/client';
import { workoutPlans, workoutSessions } from '@/db/schema';

import { type ActiveSession } from './logic';
import { loadSession } from './repository';

/**
 * Sesja wczytywana jednorazowo i odświeżana jawnie po zmianach. Podczas wpisywania wartości
 * zapisujemy do bazy bez przeładowania, żeby nie przerywać edycji pola.
 */
export function useSession(sessionId: number) {
  const [session, setSession] = useState<ActiveSession | null>(() => loadSession(db, sessionId));
  const reload = useCallback(() => setSession(loadSession(db, sessionId)), [sessionId]);
  return { session, reload };
}

/** Trwająca sesja (jeśli jest) — obserwowana na żywo, używana na ekranie „Dziś”. */
export function useActiveSessionBanner() {
  const { data } = useLiveQuery(
    db
      .select({
        id: workoutSessions.id,
        startTime: workoutSessions.startTime,
        planTitle: workoutPlans.title,
      })
      .from(workoutSessions)
      .leftJoin(workoutPlans, eq(workoutSessions.planId, workoutPlans.id))
      .where(eq(workoutSessions.status, 'IN_PROGRESS')),
  );
  return data[0] ?? null;
}
