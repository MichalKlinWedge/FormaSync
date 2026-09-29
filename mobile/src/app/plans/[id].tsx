import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { db } from '@/db/client';
import { formatDuration, formatTarget } from '@/features/plans/draft';
import { usePlanDraftStore } from '@/features/plans/draft-store';
import { deletePlan, draftFromPlan, loadPlanDraft } from '@/features/plans/repository';
import { usePlanDetails } from '@/features/plans/use-plans';

export default function PlanDetailsScreen() {
  const id = Number(useLocalSearchParams<{ id: string }>().id);
  const { plan, items } = usePlanDetails(id);
  const startDraft = usePlanDraftStore((s) => s.start);

  if (!plan) return <ThemedView style={styles.container} />;

  const edit = () => {
    startDraft(loadPlanDraft(db, plan.id));
    router.push('/plans/edit');
  };

  const copy = () => {
    startDraft(draftFromPlan(db, plan.id));
    router.push('/plans/edit');
  };

  const confirmDelete = () =>
    Alert.alert('Usunąć plan?', `„${plan.title}” oraz jego terminy w kalendarzu. Historia treningów zostanie.`, [
      { text: 'Anuluj', style: 'cancel' },
      {
        text: 'Usuń',
        style: 'destructive',
        onPress: () => {
          deletePlan(db, plan.id);
          router.back();
        },
      },
    ]);

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: plan.isTemplate ? 'Szablon' : 'Plan' }} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.titleBlock}>
          <ThemedText type="subtitle">{plan.title}</ThemedText>
          {plan.description && <ThemedText themeColor="textSecondary">{plan.description}</ThemedText>}
        </View>

        <View style={styles.items}>
          {items.map((item, index) => (
            <ThemedView key={item.id} type="backgroundElement" style={styles.item}>
              <ThemedText type="smallBold" themeColor="textSecondary" style={styles.index}>
                {index + 1}
              </ThemedText>
              <View style={styles.itemText}>
                <ThemedText>{item.exerciseName}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {formatTarget(item)} · przerwa {formatDuration(item.restDurationSeconds)}
                </ThemedText>
              </View>
            </ThemedView>
          ))}
        </View>

        <View style={styles.actions}>
          {plan.isTemplate ? (
            <Button label="Kopiuj do moich planów" icon="content_copy" onPress={copy} />
          ) : (
            <>
              <Button label="Edytuj" icon="edit" onPress={edit} />
              <Button label="Duplikuj" icon="content_copy" variant="secondary" onPress={copy} />
              <Button label="Usuń" icon="delete" variant="danger" onPress={confirmDelete} />
            </>
          )}
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.four, paddingBottom: Spacing.six },
  titleBlock: { gap: Spacing.one },
  items: { gap: Spacing.two },
  item: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, borderRadius: 12, padding: Spacing.three },
  index: { width: 20, textAlign: 'center' },
  itemText: { flex: 1 },
  actions: { gap: Spacing.two },
});
