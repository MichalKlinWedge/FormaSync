import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { db } from '@/db/client';
import { PROVIDER_COMPANIES } from '@/features/ai/providers';
import { useAiProvider } from '@/features/ai/use-providers';
import { goalPrompt } from '@/features/goals/ai/source';
import { loadGoal, saveGoalPrompt } from '@/features/goals/repository';
import { useTheme } from '@/hooks/use-theme';
import { todayKey } from '@/lib/date';

/**
 * Dokładnie to, co pójdzie do modelu — co do znaku, i z możliwością poprawienia.
 *
 * Ekran Prywatności obiecuje, że dane wychodzą tylko tam, gdzie sam je wyślesz. Obietnicy nie da
 * się sprawdzić opisem tego, co wysyłamy; da się ją sprawdzić pokazaniem tekstu.
 *
 * Poprawione polecenie zapisuje się przy celu i od tej chwili zastępuje składane z danych —
 * w całości, razem z datami i historią, które w nim stoją. To jest cena pełnej kontroli i ekran
 * mówi o niej wprost, bo zamrożone polecenie po miesiącu planowałoby od starej daty.
 */
export default function PromptPreviewScreen() {
  const theme = useTheme();
  const params = useLocalSearchParams<{ id: string }>();
  const goal = loadGoal(db, Number(params.id));
  const { provider } = useAiProvider();
  const [source, setSource] = useState(() =>
    goal === null ? null : goalPrompt(db, goal, todayKey()),
  );
  const [text, setText] = useState(() => source?.text ?? '');

  if (goal === null || source === null) {
    return (
      <ThemedView style={styles.empty}>
        <ThemedText type="small" themeColor="textSecondary">
          Tego celu już nie ma.
        </ThemedText>
      </ThemedView>
    );
  }

  const edited = text.trim() !== source.text.trim();
  const stale = source.custom && source.text.trim() !== source.generated.trim();

  const reload = () => {
    const next = goalPrompt(db, goal, todayKey());
    setSource(next);
    setText(next.text);
    return next;
  };

  const save = () => {
    saveGoalPrompt(db, goal.id, text);
    reload();
    Alert.alert(
      'Zapisane przy celu',
      'Od teraz pójdzie dokładnie to polecenie. Przyciskiem niżej wrócisz do składanego'
        + ' z dzisiejszych danych.',
    );
  };

  const restore = () =>
    Alert.alert('Przywrócić domyślne?', 'Twoje poprawki w poleceniu przepadną.', [
      { text: 'Anuluj', style: 'cancel' },
      {
        text: 'Przywróć',
        style: 'destructive',
        onPress: () => {
          saveGoalPrompt(db, goal.id, null);
          reload();
        },
      },
    ]);

  return (
    <ThemedView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.section}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            {`CO POJEDZIE DO ${PROVIDER_COMPANIES[provider].toUpperCase()}`}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Tyle i nic więcej. Nie wychodzą stąd pomiary ciała, tętno, sen, ciśnienie ani nazwa
            konta Garmina. Zapytanie idzie wprost z telefonu do dostawcy ustawionego jako domyślny.
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {source.custom
              ? 'To polecenie jest zapisane przy tym celu — poprawione ręcznie.'
              : 'Polecenie składane z Twoich danych przy każdym zapytaniu. Możesz je tu poprawić;'
                + ' zapisane zostanie przy tym celu.'}
          </ThemedText>
          {stale && (
            <ThemedText type="small" style={{ color: theme.accent }}>
              Dane w aplikacji poszły dalej niż to, co stoi w zapisanym poleceniu — daty, historia
              i realizacja planu zostały w nim takie, jakie były przy zapisie.
            </ThemedText>
          )}
        </View>

        <TextInput
          value={text}
          onChangeText={setText}
          multiline
          autoCapitalize="none"
          autoCorrect={false}
          style={[
            styles.prompt,
            { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: theme.border },
          ]}
        />

        <Button
          label={edited ? 'Zapisz polecenie przy celu' : 'Zapisane'}
          icon="save"
          onPress={save}
          disabled={!edited}
        />
        {source.custom && (
          <Button
            label="Przywróć domyślne"
            icon="restore"
            variant="secondary"
            onPress={restore}
          />
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  empty: { flex: 1, justifyContent: 'center', padding: Spacing.four },
  content: { padding: Spacing.four, gap: Spacing.four, paddingBottom: Spacing.six },
  section: { gap: Spacing.two },
  prompt: {
    fontFamily: 'monospace',
    fontSize: 13,
    lineHeight: 20,
    minHeight: 320,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.three,
    textAlignVertical: 'top',
  },
});
