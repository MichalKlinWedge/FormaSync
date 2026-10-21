import { Alert, Share } from 'react-native';

import { Button } from '@/components/button';
import { db } from '@/db/client';

import { encodeShared } from './share';
import { sharedPlan } from './transfer';

/**
 * Wysłanie treningu komuś, kto też ma tę aplikację.
 *
 * Idzie zwykłym tekstem przez cokolwiek, czego używacie — komunikator, pocztę, notatkę — bo to
 * jedyna droga, która działa bez konta, serwera i zgody na cokolwiek. Odbiorca wkleja ten tekst
 * u siebie w „Wczytaj trening”.
 */
export function SharePlanButton({ planId }: { planId: number }) {
  const send = async () => {
    try {
      const plan = sharedPlan(db, planId);
      await Share.share({ message: encodeShared(plan), title: plan.title });
    } catch (e) {
      Alert.alert('Nie udało się udostępnić', (e as Error).message);
    }
  };

  return <Button label="Udostępnij" icon="share" variant="secondary" onPress={() => void send()} />;
}
