import { eq } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';

import { db } from '@/db/client';
import { planSegments, workoutPlans } from '@/db/schema';

import { listPlanSegments } from './repository';

export type SegmentRow = ReturnType<typeof listPlanSegments>[number] & { nested: boolean };

/**
 * Plan wytrzymałościowy z odcinkami ułożonymi do wyświetlenia: grupa, zaraz po niej jej wnętrze.
 * W bazie leżą płasko, bo tak najłatwiej je zapisać; kolejność do czytania budujemy tutaj.
 */
export function useEndurancePlan(planId: number) {
  const { data: plans } = useLiveQuery(
    db.select().from(workoutPlans).where(eq(workoutPlans.id, planId)),
    [planId],
  );
  const { data: segments } = useLiveQuery(
    db.select().from(planSegments).where(eq(planSegments.planId, planId)),
    [planId],
  );

  const plan = plans[0];
  if (!plan) return null;

  const sorted = [...segments].sort((a, b) => a.orderIndex - b.orderIndex);
  const rows: SegmentRow[] = [];
  for (const segment of sorted.filter((s) => s.parentId === null)) {
    rows.push({ ...segment, nested: false });
    for (const child of sorted.filter((s) => s.parentId === segment.id)) {
      rows.push({ ...child, nested: true });
    }
  }

  const totals = rows.reduce(
    (sum, row) => {
      if (row.kind === 'REPEAT') return sum;
      const parent = row.parentId === null ? null : sorted.find((s) => s.id === row.parentId);
      const times = parent?.repeatCount ?? 1;
      return {
        meters: sum.meters + (row.distanceMeters ?? 0) * times,
        seconds: sum.seconds + (row.durationSeconds ?? 0) * times,
      };
    },
    { meters: 0, seconds: 0 },
  );

  return { ...plan, rows, totals };
}
