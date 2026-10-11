import { type BarcodeScanningResult, CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Linking, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { NumberField } from '@/components/number-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { db } from '@/db/client';
import { type MealType, mealTypes } from '@/db/schema';
import {
  AMOUNT_UNITS,
  describeFood,
  type FoodDraft,
  nutrientsFor,
  type PortionChoice,
  portionChoices,
  referenceAmount,
} from '@/features/nutrition/food';
import { type FoodWithPortions, foodByBarcode, saveFood } from '@/features/nutrition/food-repository';
import { formatGrams, formatKcal } from '@/features/nutrition/format';
import { MEAL_LABELS, mealByHour } from '@/features/nutrition/meal';
import { lookupBarcode, normalizeBarcode, OFF_ATTRIBUTION, OffError } from '@/features/nutrition/off';
import { logFoodMeal, MealError } from '@/features/nutrition/repository';
import { useTheme } from '@/hooks/use-theme';

/** Kody z opakowań jedzenia. QR tu nie ma po co czytać — nie opisuje produktu. */
const BARCODES = ['ean13', 'ean8', 'upc_a', 'upc_e'] as const;

/**
 * Produkt z kodu kreskowego.
 *
 * Najpierw szukamy u siebie: raz zeskanowany produkt jest już nasz, z własnymi miarkami i własną
 * poprawką wartości, więc drugi raz nie ma po co pytać sieci. Dopiero gdy kodu nie znamy, pyta się
 * Open Food Facts — bazy otwartej, do której wartości wpisują ludzie. Dlatego to, co wróci, jest
 * wersją roboczą do poprawienia, a nie odczytem z wagi.
 */
export default function ScanScreen() {
  const theme = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const [meal, setMeal] = useState<MealType>(() => mealByHour(new Date()));
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mine, setMine] = useState<FoodWithPortions | null>(null);
  const [draft, setDraft] = useState<FoodDraft | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState<number | null>(null);

  const patch = (change: Partial<FoodDraft>) =>
    setDraft((current) => (current === null ? current : { ...current, ...change }));

  const again = () => {
    setCode(null);
    setMine(null);
    setDraft(null);
    setNote(null);
    setError(null);
    setAmount(null);
  };

  const resolve = async (barcode: string) => {
    const known = foodByBarcode(db, barcode);
    if (known !== null) {
      setMine(known);
      setAmount(known.portions[0]?.amount ?? referenceAmount(known.basis));
      return;
    }

    setBusy(true);
    try {
      const scanned = await lookupBarcode(barcode);
      setDraft(scanned.draft);
      setNote(scanned.note);
      setAmount(scanned.draft.portions[0]?.amount ?? referenceAmount(scanned.draft.basis));
    } catch (e) {
      setError(e instanceof OffError ? e.message : 'Nie udało się odczytać produktu.');
    } finally {
      setBusy(false);
    }
  };

  // Czytnik woła to kilka razy na sekundę, póki kod jest w kadrze — pierwszy odczyt wystarczy.
  const scanned = ({ data }: BarcodeScanningResult) => {
    if (code !== null || busy) return;
    const barcode = normalizeBarcode(data);
    if (barcode === null) return;
    setCode(barcode);
    void resolve(barcode);
  };

  const add = () => {
    if (amount === null) return;
    try {
      const foodId =
        mine !== null ? mine.id : saveFood(db, draft as FoodDraft, { source: 'OFF', barcode: code });
      logFoodMeal(db, { meal, foodId, amount });
      router.back();
    } catch (e) {
      Alert.alert('Nie zapisano', e instanceof MealError ? e.message : (e as Error).message);
    }
  };

  const basis = mine?.basis ?? draft?.basis ?? 'G100';
  const chips: PortionChoice[] =
    mine !== null
      ? portionChoices(mine, mine.portions)
      : draft === null
        ? []
        : portionChoices(draft, draft.portions);
  const kcal = mine?.kcal ?? draft?.kcal ?? null;
  const food = mine ?? draft;
  const values =
    food === null || kcal === null || amount === null ? null : nutrientsFor({ ...food, kcal }, amount);

  return (
    <ThemedView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.section}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            POSIŁEK
          </ThemedText>
          <View style={styles.chips}>
            {mealTypes.map((type) => (
              <Chip
                key={type}
                label={MEAL_LABELS[type]}
                selected={meal === type}
                onPress={() => setMeal(type)}
              />
            ))}
          </View>
        </View>

        {permission === null ? (
          <ActivityIndicator />
        ) : !permission.granted ? (
          <View style={styles.section}>
            <ThemedText type="small" themeColor="textSecondary">
              Do czytania kodów potrzebna jest kamera. Zdjęcia nigdzie nie trafiają — obraz służy
              tylko do odczytania cyfr z opakowania i nie jest nigdzie zapisywany.
            </ThemedText>
            {/*
              O zgodę pytamy zawsze, także gdy Android twierdzi, że pytać już nie wolno. Ta
              odpowiedź bywa nieprawdziwa: wystarczy, że aplikacja prosiła o uprawnienie, zanim
              w ogóle zgłaszała je w manifeście, a sama odmowa systemu zostaje zapamiętana jak
              decyzja użytkownika. Przycisk, który nie robi nic, jest ślepym zaułkiem — więc obok
              prośby dajemy drugą drogę, pewną.
            */}
            <Button label="Pozwól na kamerę" icon="photo_camera" onPress={() => void requestPermission()} />
            {!permission.canAskAgain && (
              <>
                <ThemedText type="small" themeColor="textSecondary">
                  Android twierdzi, że pytać o tę zgodę już nie może. Jeśli po dotknięciu wyżej nic
                  się nie pojawi, włącz Kamerę ręcznie — przycisk niżej otwiera ten ekran wprost.
                </ThemedText>
                <Button
                  label="Otwórz ustawienia aplikacji"
                  icon="settings"
                  variant="secondary"
                  onPress={() => void Linking.openSettings()}
                />
              </>
            )}
          </View>
        ) : code === null ? (
          <View style={styles.section}>
            <View style={[styles.camera, { borderColor: theme.border }]}>
              <CameraView
                style={styles.flex}
                facing="back"
                barcodeScannerSettings={{ barcodeTypes: [...BARCODES] }}
                onBarcodeScanned={scanned}
              />
            </View>
            <ThemedText type="small" themeColor="textSecondary">
              Pokaż kod kreskowy z opakowania. Odczyt dzieje się sam — nie trzeba nic dotykać.
            </ThemedText>
          </View>
        ) : (
          <View style={styles.section}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              {`KOD ${code}`}
            </ThemedText>
            {busy && (
              <View style={styles.busy}>
                <ActivityIndicator />
                <ThemedText type="small" themeColor="textSecondary">
                  Pytam Open Food Facts…
                </ThemedText>
              </View>
            )}
            {error !== null && <ThemedText type="small" style={{ color: theme.accent }}>{error}</ThemedText>}
            {mine !== null && (
              <>
                <ThemedText type="smallBold">{mine.name}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {describeFood(mine)}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  Ten kod już jest w Twojej bazie — wartości zostają takie, jakie w niej masz.
                </ThemedText>
              </>
            )}
            {draft !== null && (
              <>
                <ThemedText type="small" themeColor="textSecondary">
                  Wartości wpisali do otwartej bazy ludzie, więc sprawdź je z opakowaniem — poprawka
                  zostanie w Twojej bazie na zawsze.
                </ThemedText>
                {note !== null && (
                  <ThemedText type="small" themeColor="textSecondary">
                    {note}
                  </ThemedText>
                )}
                <TextInput
                  value={draft.name}
                  onChangeText={(name) => patch({ name })}
                  placeholder="Nazwa produktu"
                  placeholderTextColor={theme.textSecondary}
                  style={[
                    styles.input,
                    { color: theme.text, backgroundColor: theme.background, borderColor: theme.border },
                  ]}
                />
                <View style={styles.row}>
                  <NumberField
                    label="Kalorie / 100 g"
                    value={draft.kcal}
                    onChange={(value) => patch({ kcal: value })}
                  />
                  <NumberField
                    label="Białko (g)"
                    value={draft.proteinG}
                    decimal
                    placeholder="–"
                    onChange={(proteinG) => patch({ proteinG })}
                  />
                </View>
                <View style={styles.row}>
                  <NumberField
                    label="Węgle (g)"
                    value={draft.carbsG}
                    decimal
                    placeholder="–"
                    onChange={(carbsG) => patch({ carbsG })}
                  />
                  <NumberField
                    label="Tłuszcz (g)"
                    value={draft.fatG}
                    decimal
                    placeholder="–"
                    onChange={(fatG) => patch({ fatG })}
                  />
                </View>
                <ThemedText type="small" themeColor="textSecondary">
                  {OFF_ATTRIBUTION}
                </ThemedText>
              </>
            )}

            {food !== null && (
              <>
                <ThemedText type="smallBold" themeColor="textSecondary">
                  ILE ZJEDZONE
                </ThemedText>
                <View style={styles.chips}>
                  {chips.map((choice) => (
                    <Chip
                      key={`${choice.name}-${choice.amount}`}
                      label={choice.name}
                      selected={amount === choice.amount}
                      onPress={() => setAmount(choice.amount)}
                    />
                  ))}
                </View>
                <View style={styles.row}>
                  <NumberField
                    label={`Ilość (${AMOUNT_UNITS[basis]})`}
                    value={amount}
                    decimal
                    onChange={setAmount}
                  />
                  <View style={styles.cell}>
                    <ThemedText type="small" themeColor="textSecondary">
                      Wyjdzie
                    </ThemedText>
                    <ThemedText type="smallBold">
                      {values === null
                        ? '—'
                        : [
                            formatKcal(values.kcal),
                            values.proteinG === null ? null : `białko ${formatGrams(values.proteinG)}`,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                    </ThemedText>
                  </View>
                </View>
                <Button
                  label={mine !== null ? 'Dodaj do dnia' : 'Dodaj do dnia i zapisz w bazie'}
                  icon="check"
                  onPress={add}
                  disabled={amount === null || amount <= 0}
                />
              </>
            )}

            <Button label="Skanuj inny kod" icon="barcode_scanner" variant="secondary" onPress={again} />
          </View>
        )}

        <Button label="Wpisz z ręki" icon="edit" variant="secondary" onPress={() => router.back()} />
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.four, paddingBottom: Spacing.six },
  section: { gap: Spacing.two },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  row: { flexDirection: 'row', gap: Spacing.two, alignItems: 'flex-end' },
  cell: { flex: 1, gap: Spacing.half },
  busy: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  camera: { height: 280, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  input: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
});
