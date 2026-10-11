import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { FORM_WEEKS } from '@/features/goals/brief';
import { listGeminiModels } from '@/features/goals/ai/gemini';
import { isModelName, normalizeModel, type GeminiModel } from '@/features/goals/ai/models';
import {
  DEFAULT_MODEL,
  guidance,
  GUIDANCE_LIMIT,
  hasApiKey,
  hasConsent,
  modelName,
  saveApiKey,
  saveGuidance,
  saveModelName,
  setConsent,
} from '@/features/goals/ai/tokens';
import { useTheme } from '@/hooks/use-theme';

/**
 * Ustawienia planisty AI. Klucz wklejamy, ale nigdy nie pokazujemy z powrotem — leży
 * w SecureStore, a nie w bazie, więc nie da się go odczytać ani z kopii zapasowej, ani stąd.
 */
export default function GoalAiScreen() {
  const theme = useTheme();
  const [saved, setSaved] = useState<boolean | null>(null);
  const [key, setKey] = useState('');
  const [model, setModel] = useState(() => modelName());
  const [models, setModels] = useState<GeminiModel[] | null>(null);
  const [listing, setListing] = useState(false);
  const [hints, setHints] = useState(() => guidance());
  const [consent, setConsentState] = useState(() => hasConsent());

  useEffect(() => {
    void hasApiKey().then(setSaved);
  }, []);

  const wanted = normalizeModel(model);

  const keep = (name: string) => {
    saveModelName(name);
    setModel(modelName());
  };

  const storeModel = () => {
    if (wanted === '') {
      Alert.alert('Pusto', 'Wpisz nazwę modelu albo wybierz ją z listy poniżej.');
      return;
    }
    if (!isModelName(wanted)) {
      Alert.alert(
        'To nie jest nazwa modelu',
        'API przyjmuje identyfikator — same małe litery, cyfry, kropki i myślniki, na przykład gemini-3.5-flash-lite. Najpewniej wybrać go z listy poniżej.',
      );
      return;
    }
    keep(wanted);
    Alert.alert('Zapisane', `Plany pójdą do modelu ${wanted}.`);
  };

  const fetchModels = async () => {
    setListing(true);
    try {
      setModels(await listGeminiModels());
    } catch (error) {
      Alert.alert('Nie udało się', error instanceof Error ? error.message : 'Nieznany błąd.');
    } finally {
      setListing(false);
    }
  };

  const store = async () => {
    await saveApiKey(key);
    setKey('');
    setSaved(await hasApiKey());
    Alert.alert('Zapisane', 'Klucz leży w bezpiecznym magazynie telefonu.');
  };

  const forget = async () => {
    await saveApiKey(null);
    setSaved(false);
    Alert.alert('Usunięte', 'Klucz zniknął z telefonu. Plan z reguł działa dalej bez niego.');
  };

  return (
    <ThemedView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.section}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            CO TO ZMIENIA
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Plan z reguł działa bez tego i zostaje domyślny. Z kluczem dochodzi druga możliwość:
            ten sam cel ułożony przez Gemini. Oba plany przechodzą tę samą kontrolę, więc model
            decyduje o układzie tygodni, a nie o tym, co wyląduje w kalendarzu.
          </ThemedText>
        </View>

        <View style={styles.section}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            CO WYCHODZI Z TELEFONU
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Przy każdym generowaniu do Google lecą: dyscyplina, nazwa i data zawodów, dystans, czas
            docelowy, dni treningowe, tygodniowa objętość, najlepsze tempo oraz lista treningów
            z ostatnich {FORM_WEEKS} tygodni — data, dystans, czas i tempo każdego.
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Nie wychodzi nic więcej: ani pomiary ciała, ani tętno, ani sen, ani ciśnienie, ani nazwa
            konta Garmina. Zapytanie idzie wprost z telefonu do Google — bez żadnego serwera
            pośrodku, także mojego.
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {consent
              ? 'Zgoda na wysyłkę jest udzielona. Możesz ją wycofać poniżej.'
              : 'Zgody jeszcze nie ma — zapytam o nią przy pierwszym generowaniu.'}
          </ThemedText>
          {consent && (
            <Button
              label="Wycofaj zgodę"
              icon="block"
              variant="secondary"
              onPress={() => {
                setConsent(false);
                setConsentState(false);
              }}
            />
          )}
          <Button
            label="Prywatność"
            icon="policy"
            variant="secondary"
            onPress={() => router.push('/settings/privacy')}
          />
        </View>

        <View style={styles.section}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            KLUCZ DO GEMINI
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {saved === null ? 'Sprawdzam…' : saved ? 'Klucz jest zapisany.' : 'Klucza nie ma.'}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Klucz zakładasz w Google AI Studio. Rozliczany jest na Twoim koncie — jeden plan to
            jedno zapytanie, więc przy darmowym limicie zwykle nic nie kosztuje.
          </ThemedText>
          <TextInput
            value={key}
            onChangeText={setKey}
            placeholder="Wklej klucz"
            placeholderTextColor={theme.textSecondary}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            style={[styles.input, { color: theme.text, backgroundColor: theme.background, borderColor: theme.border }]}
          />
          <Button label="Zapisz klucz" icon="key" onPress={() => void store()} disabled={key.trim() === ''} />
          {saved === true && (
            <Button label="Usuń klucz" icon="delete" variant="danger" onPress={() => void forget()} />
          )}
        </View>

        <View style={styles.section}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            TWOJE WYTYCZNE
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Reguły wpisane w aplikację są ogólne i nie wiedzą o Tobie tego, co Ty: że wracasz po
            przerwie, że w tygodniu masz cztery wolne wieczory, że po interwałach potrzebujesz
            dwóch dni. Co tu wpiszesz, pójdzie do modelu jako ważniejsze od tamtych reguł.
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Na przykład: „Zaczynaj łagodnie — pierwsze cztery tygodnie to odbudowa po przerwie”,
            „Najdłuższe wybieganie nie dłuższe niż 18 km”, „Najwyżej jedna jednostka szybkościowa
            w tygodniu”, „Nie planuj nic dzień po dniu”.
          </ThemedText>
          <TextInput
            value={hints}
            onChangeText={setHints}
            placeholder="Nic tu nie musi być — bez wytycznych model dostaje same reguły."
            placeholderTextColor={theme.textSecondary}
            multiline
            maxLength={GUIDANCE_LIMIT}
            style={[
              styles.input,
              styles.area,
              { color: theme.text, backgroundColor: theme.background, borderColor: theme.border },
            ]}
          />
          <Button
            label="Zapisz wytyczne"
            icon="save"
            variant="secondary"
            onPress={() => {
              saveGuidance(hints);
              setHints(guidance());
              Alert.alert(
                'Zapisane',
                hints.trim() === ''
                  ? 'Wytyczne usunięte. Model dostanie same reguły z aplikacji.'
                  : 'Pójdą z każdym kolejnym planem od Gemini.',
              );
            }}
          />
          <ThemedText type="small" themeColor="textSecondary">
            Poza zasięgiem tego pola zostaje format odpowiedzi i to, co i tak sprawdzamy po
            modelu: dni treningowe, dzień startu i rozsądny dystans jednostki. Na tym stoi odczyt
            planu — tempa, czasy i odcinki aplikacja liczy sama, niezależnie od tego, co napiszesz.
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Całe polecenie, razem z wytycznymi, podejrzysz na ekranie celu — przycisk „Podejrzyj
            polecenie dla Gemini”.
          </ThemedText>
        </View>

        <View style={styles.section}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            MODEL
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Domyślnie {DEFAULT_MODEL}. Google wycofuje i dokłada warianty, więc nazwę da się
            zmienić bez nowej wersji aplikacji. Wpisuje się identyfikator, a nie nazwę ze strony:
            „Gemini 3.5 Flash-Lite” API odrzuca, „gemini-3.5-flash-lite” przyjmuje. Zamienię jedno
            w drugie sam, ale pewną listę ma tylko Google — najlepiej ją pobrać i wybrać z niej.
          </ThemedText>
          <TextInput
            value={model}
            onChangeText={setModel}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder={DEFAULT_MODEL}
            placeholderTextColor={theme.textSecondary}
            style={[styles.input, { color: theme.text, backgroundColor: theme.background, borderColor: theme.border }]}
          />
          {wanted !== model.trim() && wanted !== '' && (
            <ThemedText type="small" themeColor="textSecondary">
              Zapiszę jako: {wanted}
            </ThemedText>
          )}
          <Button label="Zapisz nazwę modelu" icon="save" variant="secondary" onPress={storeModel} />
          <Button
            label={listing ? 'Pobieram…' : 'Pobierz listę modeli'}
            icon="sync"
            variant="secondary"
            disabled={listing}
            onPress={() => void fetchModels()}
          />
          {models !== null && (
            <View style={styles.chips}>
              {models.map((entry) => (
                <Chip
                  key={entry.id}
                  label={entry.id}
                  selected={entry.id === wanted}
                  onPress={() => keep(entry.id)}
                />
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.five, paddingBottom: Spacing.six },
  section: { gap: Spacing.two },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  area: { minHeight: 120, textAlignVertical: 'top' },
  input: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
});
