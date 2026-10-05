import { router, Stack } from 'expo-router';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { db } from '@/db/client';
import { deletePlan } from '@/features/plans/repository';
import { ensureNotificationPermission } from '@/features/workout/notifications';
import { ActiveSessionExistsError, startSession } from '@/features/workout/repository';
import { useTheme } from '@/hooks/use-theme';
import { pluralWith } from '@/lib/number';

import { SEGMENT_LABELS } from './draft';
import { useEnduranceDraftStore } from './draft-store';
import { describeDuration, describeTarget, formatDistance, formatSeconds } from './format';
import { loadEnduranceDraft } from './repository';
import { useEndurancePlan } from './use-endurance-plan';

/** Podgląd planu wytrzymałościowego: odcinki w kolejności, z grupami powtórzeń. */
export function EndurancePlanDetails({ planId }: { planId: number }) {
  const theme = useTheme();
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
      <Stack.Screen options={{ title: 'Plan' }} />
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

        <View style={styles.items}>
          {plan.rows.map((row) => (
            <ThemedView
              key={row.id}
              type="backgroundElement"
              style={[styles.item, row.nested && { marginLeft: Spacing.four }]}>
              <View style={[styles.marker, { backgroundColor: theme.accent }]} />
              <View style={styles.itemText}>
                <ThemedText type="smallBold">
                  {row.kind === 'REPEAT'
                    ? pluralWith(row.repeatCount ?? 1, 'powtórzenie', 'powtórzenia', 'powtórzeń')
                    : SEGMENT_LABELS[row.kind]}
                </ThemedText>
                {row.kind !== 'REPEAT' && (
                  <ThemedText type="small" themeColor="textSecondary">
                    {[
                      describeDuration(row.durationType, row.distanceMeters, row.durationSeconds),
                      describeTarget(row.targetType, row.targetLow, row.targetHigh),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </ThemedText>
                )}
              </View>
            </ThemedView>
          ))}
        </View>

        <View style={styles.actions}>
          <Button label="Rozpocznij trening" icon="play_arrow" onPress={start} />
          <Button label="Edytuj" icon="edit" variant="secondary" onPress={edit} />
          <Button label="Duplikuj" icon="content_copy" variant="secondary" onPress={copy} />
          <Button label="Usuń" icon="delete" variant="danger" onPress={confirmDelete} />
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.four, paddingBottom: Spacing.six },
  titleBlock: { gap: Spacing.one },
  items: { gap: Spacing.two },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderRadius: 12,
    padding: Spacing.three,
  },
  marker: { width: 4, alignSelf: 'stretch', borderRadius: 2 },
  itemText: { flex: 1, gap: Spacing.half },
  actions: { gap: Spacing.two },
});
