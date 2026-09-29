import { count, eq } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { StyleSheet, View } from 'react-native';

import { ComingSoon, Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { db } from '@/db/client';
import { exercises, workoutPlans } from '@/db/schema';

export default function TodayScreen() {
  const { data: exerciseCount } = useLiveQuery(db.select({ n: count() }).from(exercises));
  const { data: templateCount } = useLiveQuery(
    db.select({ n: count() }).from(workoutPlans).where(eq(workoutPlans.isTemplate, true)),
  );

  return (
    <Screen title="FormaSync">
      <View style={styles.row}>
        <Stat label="Ćwiczeń w katalogu" value={exerciseCount[0]?.n ?? 0} />
        <Stat label="Szablonów" value={templateCount[0]?.n ?? 0} />
      </View>
      <ComingSoon stage="dzisiejszy trening pojawi się w etapie 6 (harmonogram)" />
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <ThemedView type="backgroundElement" style={styles.stat}>
      <ThemedText type="subtitle">{value}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: Spacing.three },
  stat: { flex: 1, borderRadius: 16, padding: Spacing.three },
});
