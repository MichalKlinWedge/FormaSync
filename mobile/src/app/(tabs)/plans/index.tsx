import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { emptyDraft } from '@/features/plans/draft';
import { emptyEnduranceDraft } from '@/features/endurance/draft';
import { useEnduranceDraftStore } from '@/features/endurance/draft-store';
import { usePlanDraftStore } from '@/features/plans/draft-store';
import { usePlanList } from '@/features/plans/use-plans';
import { SportSwitcher } from '@/features/sports/sport-switcher';
import { isEndurance } from '@/features/sports/sport';
import { useActiveSport } from '@/features/sports/sport-store';
import { pluralWith } from '@/lib/number';
import { useTheme } from '@/hooks/use-theme';

type PlanSummary = ReturnType<typeof usePlanList>['own'][number];

export default function PlansScreen() {
  const theme = useTheme();
  const sport = useActiveSport();
  const { own, templates } = usePlanList(sport);
  const startDraft = usePlanDraftStore((s) => s.start);
  const startEnduranceDraft = useEnduranceDraftStore((s) => s.start);

  // Siła i wytrzymałość mają osobne modele planu, więc i osobne kreatory.
  const createPlan = () => {
    if (isEndurance(sport)) {
      startEnduranceDraft(emptyEnduranceDraft(sport));
      router.push('/plans/edit-endurance');
      return;
    }
    startDraft(emptyDraft(sport));
    router.push('/plans/edit');
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.header}>
            <ThemedText type="subtitle">Plany</ThemedText>
            <Pressable accessibilityLabel="Nowy plan" onPress={createPlan} hitSlop={8}>
              <Icon name="add" size={28} color={theme.accent} />
            </Pressable>
          </View>

          <SportSwitcher />

          <Section title="Moje plany">
            {own.length === 0 ? (
              <ThemedView type="backgroundElement" style={styles.card}>
                <ThemedText type="small" themeColor="textSecondary">
                  Nie masz jeszcze własnych planów. Utwórz plan od zera przyciskiem + albo skopiuj jeden z
                  szablonów poniżej.
                </ThemedText>
              </ThemedView>
            ) : (
              own.map((plan) => <PlanCard key={plan.id} plan={plan} />)
            )}
          </Section>

          <Section title="Szablony">
            {templates.map((plan) => (
              <PlanCard key={plan.id} plan={plan} />
            ))}
          </Section>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <ThemedText type="smallBold" themeColor="textSecondary">
        {title.toUpperCase()}
      </ThemedText>
      {children}
    </View>
  );
}

function PlanCard({ plan }: { plan: PlanSummary }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/plans/[id]', params: { id: plan.id } })}
      style={({ pressed }) => [styles.card, { backgroundColor: theme.backgroundElement, opacity: pressed ? 0.7 : 1 }]}>
      <View style={styles.cardText}>
        <ThemedText type="smallBold">{plan.title}</ThemedText>
        {plan.description && (
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
            {plan.description}
          </ThemedText>
        )}
        <ThemedText type="small" themeColor="textSecondary">
          {pluralWith(plan.exerciseCount, 'ćwiczenie', 'ćwiczenia', 'ćwiczeń')}
        </ThemedText>
      </View>
      <Icon name="chevron_right" size={20} color={theme.textSecondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  content: {
    padding: Spacing.four,
    gap: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.four,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  section: { gap: Spacing.two },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderRadius: 16,
    padding: Spacing.three,
  },
  cardText: { flex: 1, gap: Spacing.half },
});
