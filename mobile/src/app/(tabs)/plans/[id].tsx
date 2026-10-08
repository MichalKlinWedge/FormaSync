import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { db } from '@/db/client';
import { ExerciseLink } from '@/features/exercises/exercise-link';
import { formatDuration, formatTarget } from '@/features/plans/draft';
import { usePlanDraftStore } from '@/features/plans/draft-store';
import { deletePlan, draftFromPlan, loadPlanDraft } from '@/features/plans/repository';
import { EndurancePlanDetails } from '@/features/endurance/plan-details';
import { usePlanDetails } from '@/features/plans/use-plans';
import { isEndurance } from '@/features/sports/sport';
import { buildWorkoutFit, FitExportError, fitFileName } from '@/features/garmin/fit-workout';
import { SendToGarminButton } from '@/features/garmin/connect/send-button';
import { loadPlanForFit } from '@/features/garmin/repository';
import { proposeProgression } from '@/features/progress/progression';
import { ExportCanceled, saveToPickedDirectory } from '@/lib/file-export';
import { ensureNotificationPermission } from '@/features/workout/notifications';
import { ActiveSessionExistsError, startSession } from '@/features/workout/repository';

export default function PlanDetailsScreen() {
  const id = Number(useLocalSearchParams<{ id: string }>().id);
  const { plan, items } = usePlanDetails(id);
  const startDraft = usePlanDraftStore((s) => s.start);

  if (!plan) return <ThemedView style={styles.container} />;
  // Plan wytrzymałościowy ma odcinki zamiast ćwiczeń, więc i własny ekran.
  if (isEndurance(plan.sport)) return <EndurancePlanDetails planId={id} />;

  const edit = () => {
    startDraft(loadPlanDraft(db, plan.id));
    router.push('/plans/edit');
  };

  const copy = () => {
    startDraft(draftFromPlan(db, plan.id));
    router.push('/plans/edit');
  };

  const openProgression = () => {
    const proposal = proposeProgression(db, plan.id);
    if (!proposal) {
      Alert.alert('Brak danych', 'Sugestie pojawią się po pierwszym ukończonym treningu z tego planu.');
      return;
    }
    if (proposal.suggestions.length === 0) {
      Alert.alert('Brak sugestii', 'Reguły działają dla ćwiczeń z ciężarem i celem powtórzeń.');
      return;
    }
    router.push({ pathname: '/plans/progression', params: { id: plan.id } });
  };

  const exportToFit = async () => {
    const data = loadPlanForFit(db, plan.id);
    if (!data) return;
    try {
      const bytes = buildWorkoutFit(data.title, data.exercises);
      const name = await saveToPickedDirectory(bytes, fitFileName(data.title), 'application/octet-stream');
      Alert.alert(
        'Plik zapisany',
        `${name}

Podłącz zegarek kablem i skopiuj plik do folderu NewFiles — trening pojawi się na zegarku. ` +
          'Garmin Connect nie przyjmuje plików treningowych przez import, więc do wysyłki razem z kalendarzem ' +
          'służy narzędzie na komputerze (tools/garmin).',
      );
    } catch (e) {
      if (e instanceof ExportCanceled) return;
      Alert.alert('Nie udało się zapisać', e instanceof FitExportError ? e.message : 'Nieznany błąd.');
    }
  };

  const start = () => {
    try {
      startSession(db, { kind: 'plan', planId: plan.id });
      void ensureNotificationPermission();
      router.push('/workout/active');
    } catch (e) {
      if (e instanceof ActiveSessionExistsError) {
        Alert.alert('Trening już trwa', 'Najpierw zakończ lub przerwij bieżący trening.');
      } else throw e;
    }
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
                <ExerciseLink exerciseId={item.exerciseId} name={item.exerciseName} withName />
                <ThemedText type="small" themeColor="textSecondary">
                  {formatTarget(item)} · przerwa {formatDuration(item.restDurationSeconds)}
                </ThemedText>
              </View>
            </ThemedView>
          ))}
        </View>

        <View style={styles.actions}>
          <Button label="Rozpocznij trening" icon="play_arrow" onPress={start} />
          <SendToGarminButton planId={id} />
          <Button
            label="Eksportuj na zegarek (.FIT)"
            icon="watch"
            variant="secondary"
            onPress={() => void exportToFit()}
          />
          {plan.isTemplate ? (
            <Button label="Kopiuj do moich planów" icon="content_copy" variant="secondary" onPress={copy} />
          ) : (
            <>
              <Button
                label="Sugestie progresji"
                icon="trending_up"
                variant="secondary"
                onPress={openProgression}
              />
              <Button label="Edytuj" icon="edit" variant="secondary" onPress={edit} />
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
