import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { emptyDraft } from '@/features/plans/draft';
import { emptyEnduranceDraft } from '@/features/endurance/draft';
import { useEnduranceDraftStore } from '@/features/endurance/draft-store';
import { usePlanDraftStore } from '@/features/plans/draft-store';
import { matchesSearch, searchPlans } from '@/features/plans/search';
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
  // Jedno pole na całe szukanie: nazwa, opis i nazwy ćwiczeń w środku. Plan pamięta się różnie —
  // raz po tytule, raz po tym, że „to ten z martwym ciągiem” — a trzy pola kazałyby zgadywać,
  // w które wpisać.
  const [search, setSearch] = useState('');
  const foundOwn = searchPlans(own, search);
  const foundTemplates = searchPlans(templates, search);
  const searching = search.trim() !== '';
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

          {/* Cel długoterminowy stoi nad planami, bo to on je wypełnia: plan pod zawody
              produkuje zwykłe plany i terminy, a nie osobny rodzaj treningu. */}
          <Button
            label="Cele i plany pod zawody"
            icon="flag"
            variant="secondary"
            onPress={() => router.push('/goal')}
          />

          {/* Trening od kogoś innego przychodzi tekstem w komunikatorze, więc wejście stoi tam,
              gdzie i tak się patrzy, szukając planu. */}
          <Button
            label="Wczytaj trening od kogoś"
            icon="content_paste"
            variant="secondary"
            onPress={() => router.push('/plans/import')}
          />

          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Szukaj: nazwa, opis albo ćwiczenie"
            placeholderTextColor={theme.textSecondary}
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
            style={[
              styles.search,
              { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: theme.border },
            ]}
          />

          <Section title="Moje plany">
            {foundOwn.length === 0 ? (
              <ThemedView type="backgroundElement" style={styles.card}>
                <ThemedText type="small" themeColor="textSecondary">
                  {searching
                    ? 'Żaden własny plan nie pasuje do tego, czego szukasz.'
                    : 'Nie masz jeszcze własnych planów. Utwórz plan od zera przyciskiem + albo skopiuj'
                      + ' jeden z szablonów poniżej.'}
                </ThemedText>
              </ThemedView>
            ) : (
              foundOwn.map((plan) => <PlanCard key={plan.id} plan={plan} search={search} />)
            )}
          </Section>

          {/* Dyscyplina bez szablonów nie potrzebuje pustego nagłówka. Przy szukaniu nagłówek
              zostaje nawet pusty: inaczej nie wiadomo, czy szablonów nie ma, czy nie pasują. */}
          {templates.length > 0 && (
            <Section title="Szablony">
              {foundTemplates.length === 0 ? (
                <ThemedView type="backgroundElement" style={styles.card}>
                  <ThemedText type="small" themeColor="textSecondary">
                    Żaden szablon nie pasuje do tego, czego szukasz.
                  </ThemedText>
                </ThemedView>
              ) : (
                foundTemplates.map((plan) => (
                  <PlanCard key={plan.id} plan={plan} search={search} />
                ))
              )}
            </Section>
          )}
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

function PlanCard({ plan, search }: { plan: PlanSummary; search: string }) {
  const theme = useTheme();
  // Gdy plan trafił na listę przez ćwiczenie, samo „PPL — Pull” nie mówi dlaczego. Pokazujemy
  // więc te ćwiczenia, które pasują — to one są odpowiedzią na zadane pytanie.
  const matching = matchingExercises(plan.exercises, search);
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
          {isEndurance(plan.sport)
            ? pluralWith(plan.segmentCount, 'odcinek', 'odcinki', 'odcinków')
            : pluralWith(plan.exerciseCount, 'ćwiczenie', 'ćwiczenia', 'ćwiczeń')}
          {matching.length > 0 ? ` · ${matching.join(', ')}` : ''}
        </ThemedText>
      </View>
      <Icon name="chevron_right" size={20} color={theme.textSecondary} />
    </Pressable>
  );
}

/** Ćwiczenia planu, które same w sobie pasują do zapytania — bez tych z nazwy i opisu. */
function matchingExercises(names: readonly string[], search: string): string[] {
  if (search.trim() === '') return [];
  return names.filter((name) => matchesSearch({ title: name, description: null }, search));
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
  search: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
});
