import { useLocalSearchParams } from 'expo-router';

import { SessionDetails } from '@/features/history/session-details';

export default function HistoryDetailsScreen() {
  const id = Number(useLocalSearchParams<{ id: string }>().id);
  return <SessionDetails id={id} updatePlanRoute={{ pathname: '/history/update-plan', params: { id } }} />;
}
