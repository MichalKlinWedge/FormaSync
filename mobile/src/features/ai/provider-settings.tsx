import { useEffect, useState } from 'react';
import { Alert, StyleSheet, TextInput, View } from 'react-native';

import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { listAiModels } from './client';
import { type AiModel, isModelName, normalizeModel } from './models';
import {
  DEFAULT_MODELS,
  PROVIDER_KEY_SOURCES,
  PROVIDER_LABELS,
  type Provider,
} from './providers';
import { hasApiKey, modelName, saveApiKey, saveModelName } from './tokens';

/**
 * Klucz i model jednego dostawcy.
 *
 * Ten sam blok dla wszystkich trzech, bo decyzje są te same: skąd klucz, jaki model, i czy w ogóle
 * chcesz z tego korzystać. Klucz wklejamy, ale nigdy nie pokazujemy z powrotem — leży
 * w bezpiecznym magazynie telefonu, nie w bazie, więc nie da się go odczytać ani z kopii
 * zapasowej, ani stąd.
 */
export function ProviderSettings({ provider }: { provider: Provider }) {
  const theme = useTheme();
  const [saved, setSaved] = useState<boolean | null>(null);
  const [key, setKey] = useState('');
  const [model, setModel] = useState(() => modelName(provider));
  const [models, setModels] = useState<AiModel[] | null>(null);
  const [listing, setListing] = useState(false);

  useEffect(() => {
    void hasApiKey(provider).then(setSaved);
  }, [provider]);

  const name = PROVIDER_LABELS[provider];
  const wanted = normalizeModel(model);

  const keep = (id: string) => {
    saveModelName(provider, id);
    setModel(modelName(provider));
  };

  const store = async () => {
    await saveApiKey(provider, key);
    setKey('');
    setSaved(await hasApiKey(provider));
    Alert.alert('Zapisane', 'Klucz leży w bezpiecznym magazynie telefonu.');
  };

  const forget = async () => {
    await saveApiKey(provider, null);
    setSaved(false);
    Alert.alert('Usunięte', `Klucz do ${name} zniknął z telefonu.`);
  };

  const storeModel = () => {
    if (wanted === '') {
      Alert.alert('Pusto', 'Wpisz nazwę modelu albo wybierz ją z listy poniżej.');
      return;
    }
    if (!isModelName(wanted)) {
      Alert.alert(
        'To nie jest nazwa modelu',
        'API przyjmuje identyfikator — same małe litery, cyfry, kropki i myślniki. Najpewniej'
          + ' wybrać go z listy poniżej.',
      );
      return;
    }
    keep(wanted);
    Alert.alert('Zapisane', `Zapytania pójdą do modelu ${wanted}.`);
  };

  const fetchModels = async () => {
    setListing(true);
    try {
      setModels(await listAiModels(provider));
    } catch (error) {
      Alert.alert('Nie udało się', error instanceof Error ? error.message : 'Nieznany błąd.');
    } finally {
      setListing(false);
    }
  };

  return (
    <View style={styles.section}>
      <ThemedText type="smallBold" themeColor="textSecondary">
        {name.toUpperCase()}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {saved === null ? 'Sprawdzam…' : saved ? 'Klucz jest zapisany.' : 'Klucza nie ma.'}
        {` Zakładasz go w: ${PROVIDER_KEY_SOURCES[provider]}. Rozliczany jest na Twoim koncie.`}
      </ThemedText>
      <TextInput
        value={key}
        onChangeText={setKey}
        placeholder={`Wklej klucz do ${name}`}
        placeholderTextColor={theme.textSecondary}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
        style={[
          styles.input,
          { color: theme.text, backgroundColor: theme.background, borderColor: theme.border },
        ]}
      />
      <Button
        label="Zapisz klucz"
        icon="key"
        variant="secondary"
        onPress={() => void store()}
        disabled={key.trim() === ''}
      />
      {saved === true && (
        <Button label="Usuń klucz" icon="delete" variant="danger" onPress={() => void forget()} />
      )}

      <ThemedText type="small" themeColor="textSecondary">
        {DEFAULT_MODELS[provider] === ''
          ? 'Nazwy modelu nie zgadujemy — pobierz listę i wybierz z niej. Bez tego nie ma czym'
            + ' zapytać.'
          : `Domyślnie ${DEFAULT_MODELS[provider]}. Nazwy wariantów zmieniają się szybciej niż`
            + ' wersje aplikacji, więc pewną listę ma tylko dostawca.'}
      </ThemedText>
      <TextInput
        value={model}
        onChangeText={setModel}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder={DEFAULT_MODELS[provider] || 'Nazwa modelu'}
        placeholderTextColor={theme.textSecondary}
        style={[
          styles.input,
          { color: theme.text, backgroundColor: theme.background, borderColor: theme.border },
        ]}
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
  );
}

const styles = StyleSheet.create({
  section: { gap: Spacing.two },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  input: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
});
