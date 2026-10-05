import { router, Stack } from 'expo-router';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { db } from '@/db/client';
import { SendToGarminButton } from '@/features/garmin/connect/send-button';
import { deletePlan } from '@/features/plans/repository';
import { ensureNotificationPermission } from '@/features/workout/notifications';
import { ActiveSessionExistsError, startSession } from '@/features/workout/repository';
import { pluralWith } from '@/lib/number';

import { useEnduranceDraftStore } from './draft-store';
import { formatDistance, formatSeconds } from './format';
import { PlanSegmentList } from './plan-segments';
import { loadEnduranceDraft } from './repository';
import { useEndurancePlan } from './use-endurance-plan';

/** Podgląd planu wytrzymałościowego: odcinki w kolejności, z grupami powtórzeń. */
export function EndurancePlanDetails({ planId }: { planId: number }) {
  const plan = useEndurancePlan(planId);
  const startDraft = useEnduranceDraftStore((s) => s.start);

  if (!plan) return <ThemedView style={styles.flex} />;

  const start = () => {
    try {
      startSession(db, { kind: 'plan', planId });
      void ensureNotificationPermission();
      router.push('/workout/active');
    } catch (e) {
      if (e instanceof ActiveSessionExistsError) {
        Alert.alert('Trening już trwa', 'Najpierw zakończ lub przerwij bieżący trening.');
      } else throw e;
    }
  };

  const edit = () => {
    startDraft(loadEnduranceDraft(db, planId));
    router.push('/plans/edit-endurance');
  };

  const copy = () => {
    const draft = loadEnduranceDraft(db, planId);
    startDraft({ ...draft, id: undefined, title: `${draft.title} (kopia)` });
    router.push('/plans/edit-endurance');
  };

  const confirmDelete = () =>
    Alert.alert('Usunąć plan?', plan.title, [
      { text: 'Anuluj', style: 'cancel' },
      {
        text: 'Usuń',
        style: 'destructive',
        onPress: () => {
          deletePlan(db, planId);
          router.back();
        },
      },
    ]);

  return (
    <ThemedView style={styles.flex}>
      <Stack.Screen options={{ title: plan.isTemplate ? 'Szablon' : 'Plan' }} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.titleBlock}>
          <ThemedText type="subtitle">{plan.title}</ThemedText>
          {plan.description !== null && (
            <ThemedText themeColor="textSecondary">{plan.description}</ThemedText>
          )}
          <ThemedText type="small" themeColor="textSecondary">
            {[
              plan.totals.meters > 0 ? formatDistance(plan.totals.meters) : null,
              plan.totals.seconds > 0 ? formatSeconds(plan.totals.seconds) : null,
              pluralWith(plan.rows.length, 'odcinek', 'odcinki', 'odcinków'),
            ]
              .filter(Boolean)
              .join(' · ')}
          </ThemedText>
        </View>

        <PlanSegmentList rows={plan.rows} />

        <View style={styles.actions}>
          <Button label="Rozpocznij trening" icon="play_arrow" onPress={start} />
          <SendToGarminButton planId={planId} />
          {/* Wbudowanego szablonu nie wolno zmienić ani usunąć — pracuje się na jego kopii. */}
          {plan.isTemplate ? (
            <Button label="Kopiuj do moich planów" icon="content_copy" variant="secondary" onPress={copy} />
          ) : (
            <>
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
  flex: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.four, paddingBottom: Spacing.six },
  titleBlock: { gap: Spacing.one },
  actions: { gap: Spacing.two },
});
