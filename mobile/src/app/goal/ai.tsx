import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { ProviderSettings } from '@/features/ai/provider-settings';
import {
  PROVIDER_COMPANIES,
  PROVIDER_LABELS,
  type Provider,
  providers,
} from '@/features/ai/providers';
import {
  configuredProviders,
  defaultProvider,
  guidance,
  GUIDANCE_LIMIT,
  hasConsent,
  saveDefaultProvider,
  saveGuidance,
  setConsent,
} from '@/features/ai/tokens';
import { FORM_WEEKS } from '@/features/goals/brief';
import { useTheme } from '@/hooks/use-theme';

/**
 * Gotowe wytyczne na najczęstszy przypadek: plan, który od pierwszego tygodnia rusza z pułapu
 * docelowego. Wpisujemy je do pola, a nie wysyłamy po cichu — to mają być Twoje wytyczne,
 * więc decyzja o ich zapisaniu należy do Ciebie.
 */
const GENTLE_START = [
  'Zaczynaj łagodnie.',
  'Pierwsze cztery tygodnie to odbudowa regularności: objętość tygodniowa jak dotychczas, bez jednostek szybkościowych.',
  'Najdłuższe wybieganie rośnie najwyżej o kilometr na tydzień i na starcie nie przekracza najdłuższego z ostatnich tygodni.',
  'Najwyżej jedna jednostka jakościowa w tygodniu.',
  'Nie planuj mocnej jednostki dzień po dniu z długim wybieganiem.',
].join(' ');

/**
 * Modele AI: klucze, wybór dostawcy i wytyczne do planu.
 *
 * Dostawcy są trzej i każdy jest opcjonalny — aplikacja w całości działa bez nich. Klucz wklejasz
 * tam, gdzie masz konto; mając kilka, wybierasz domyślnego, a przy pojedynczym zapytaniu możesz
 * wskazać innego.
 */
export default function AiSettingsScreen() {
  const theme = useTheme();
  const [chosen, setChosen] = useState<Provider>(() => defaultProvider());
  const [configured, setConfigured] = useState<Provider[] | null>(null);
  const [hints, setHints] = useState(() => guidance());
  const [consent, setConsentState] = useState(() => hasConsent());

  useEffect(() => {
    void configuredProviders().then(setConfigured);
  }, []);

  const pick = (provider: Provider) => {
    saveDefaultProvider(provider);
    setChosen(provider);
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
            ten sam cel ułożony przez model. Oba plany przechodzą tę samą kontrolę, więc model
            decyduje o układzie tygodni, a nie o tym, co wyląduje w kalendarzu.
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Ten sam klucz obsługuje kalorie: posiłek opisany słowami albo pokazany na zdjęciu oraz
            propozycję jedzenia na dzień. Liczenie kalorii działa bez niego — opis słowami jest
            jedną z czterech dróg, obok bazy produktów, kodu kreskowego i wpisu z ręki.
          </ThemedText>
        </View>

        <View style={styles.section}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            CO WYCHODZI Z TELEFONU
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Przy układaniu planu do wybranego dostawcy lecą: dyscyplina, nazwa i data zawodów,
            dystans, czas docelowy, dni treningowe, tygodniowa objętość, najlepsze tempo oraz lista
            treningów z ostatnich {FORM_WEEKS} tygodni — data, dystans, czas i tempo każdego.
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Nie wychodzi nic więcej: ani pomiary ciała, ani tętno, ani sen, ani ciśnienie, ani nazwa
            konta Garmina. Zapytanie idzie wprost z telefonu do tego dostawcy, którego wybierzesz —
            bez żadnego serwera pośrodku, także mojego.
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
            DOMYŚLNY DOSTAWCA
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Ten odpowiada wtedy, gdy ekran nie pyta. Mając klucze do kilku, wskażesz innego przy
            pojedynczym zapytaniu — na ekranie planu, opisu posiłku i propozycji jedzenia.
          </ThemedText>
          <View style={styles.chips}>
            {providers.map((provider) => (
              <Chip
                key={provider}
                label={PROVIDER_LABELS[provider]}
                selected={provider === chosen}
                onPress={() => pick(provider)}
              />
            ))}
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            {describeConfigured(configured, chosen)}
          </ThemedText>
        </View>

        {providers.map((provider) => (
          <ProviderSettings key={provider} provider={provider} />
        ))}

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
            label="Wstaw łagodny start"
            icon="edit_note"
            variant="secondary"
            onPress={() => setHints(GENTLE_START)}
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
                  : 'Pójdą z każdym kolejnym planem od modelu.',
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
            polecenie dla modelu”.
          </ThemedText>
        </View>
      </ScrollView>
    </ThemedView>
  );
}

/** Które klucze już są — i ostrzeżenie, gdy domyślny dostawca nie ma czym zapytać. */
function describeConfigured(configured: Provider[] | null, chosen: Provider): string {
  if (configured === null) return 'Sprawdzam klucze…';
  if (configured.length === 0) {
    return 'Żaden dostawca nie ma jeszcze klucza. Wklej go niżej przy tym, z którego chcesz'
      + ' korzystać — aplikacja działa w całości bez nich.';
  }

  const names = configured.map((provider) => PROVIDER_LABELS[provider]).join(', ');
  if (!configured.includes(chosen)) {
    return `Klucz mają: ${names}. Domyślny (${PROVIDER_LABELS[chosen]}) go nie ma, więc zapytanie`
      + ` pójdzie do pierwszego z kluczem — do ${PROVIDER_COMPANIES[configured[0]]}.`;
  }
  return `Klucz mają: ${names}.`;
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
