import { useLocalSearchParams } from 'expo-router';

import { PlanUpdate } from '@/features/history/plan-update';

export default function CalendarUpdatePlanScreen() {
  return <PlanUpdate sessionId={Number(useLocalSearchParams<{ id: string }>().id)} />;
}
