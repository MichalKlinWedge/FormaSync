import { useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { db } from '@/db/client';
import { buildContext } from '@/features/goals/ai/context';
import { buildPrompt } from '@/features/goals/ai/prompt';
import { guidance } from '@/features/goals/ai/tokens';
import { buildBrief, currentForm } from '@/features/goals/brief';
import { loadGoal } from '@/features/goals/repository';
import { todayKey } from '@/lib/date';

/**
 * Dokładnie to, co pójdzie do Gemini — co do znaku.
 *
 * Ekran Prywatności obiecuje, że dane wychodzą tylko tam, gdzie sam je wyślesz. Obietnicy nie da
 * się sprawdzić opisem tego, co wysyłamy; da się ją sprawdzić pokazaniem tekstu. Przy okazji
 * widać, czemu plan wyszedł taki, jaki wyszedł, i co warto dopisać we własnych wytycznych.
 */
export default function PromptPreviewScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const goal = loadGoal(db, Number(params.id));

  if (goal === null) {
    return (
      <ThemedView style={styles.empty}>
        <ThemedText type="small" themeColor="textSecondary">
          Tego celu już nie ma.
        </ThemedText>
      </ThemedView>
    );
  }

  const today = todayKey();
  const prompt = buildPrompt(
    buildBrief(db, goal),
    currentForm(db, goal.sport).history,
    today,
    buildContext(db, goal.sport, guidance()),
  );

  return (
    <ThemedView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.section}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            CO POJEDZIE DO GOOGLE
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Tyle i nic więcej. Nie wychodzą stąd pomiary ciała, tętno, sen, ciśnienie ani nazwa
            konta Garmina. Zapytanie idzie wprost z telefonu do Google.
          </ThemedText>
        </View>
        <ThemedText type="small" selectable style={styles.prompt}>
          {prompt}
        </ThemedText>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  empty: { flex: 1, justifyContent: 'center', padding: Spacing.four },
  content: { padding: Spacing.four, gap: Spacing.four, paddingBottom: Spacing.six },
  section: { gap: Spacing.two },
  prompt: { fontFamily: 'monospace', lineHeight: 20 },
});
