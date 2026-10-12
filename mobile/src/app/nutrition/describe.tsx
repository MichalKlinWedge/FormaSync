import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { NumberField } from '@/components/number-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { db } from '@/db/client';
import { type FoodBasis, foodBases, type MealType, mealTypes } from '@/db/schema';
// Klient Gemini jest jeden dla całej aplikacji — stoi przy planiście, bo tam powstał, i tam leży
// też klucz. Kalorie używają tego samego, zamiast zakładać drugie połączenie z Google.
import { askGemini, GeminiError, NoApiKeyError } from '@/features/goals/ai/gemini';
import { buildFoodPrompt, FoodReplyError, parseFoodReply } from '@/features/nutrition/ai';
import { AMOUNT_UNITS, type FoodDraft, nutrientsFor, referenceAmount } from '@/features/nutrition/food';
import { saveFood } from '@/features/nutrition/food-repository';
import { formatGrams, formatKcal } from '@/features/nutrition/format';
import { MEAL_LABELS, mealByHour } from '@/features/nutrition/meal';
import { type MealPhoto, PhotoError, pickMealPhoto, takeMealPhoto } from '@/features/nutrition/photo';
import { logFoodMeal, MealError } from '@/features/nutrition/repository';
import { useTheme } from '@/hooks/use-theme';

const BASIS_LABELS: Record<FoodBasis, string> = { G100: 'na 100 g', SERVING: 'na porcję' };

/**
 * Posiłek opisany słowami, oszacowany przez Gemini.
 *
 * Model nie waży jedzenia — zgaduje typowe wielkości, i tak to pokazujemy: jego odpowiedź wraca
 * jako wersja robocza do poprawienia, z notatką o tym, co założył. Nic nie zapisuje się samo,
 * a wpisany opis idzie do Google tylko po dotknięciu „Oszacuj”.
 */
export default function DescribeMealScreen() {
  const theme = useTheme();
  const [meal, setMeal] = useState<MealType>(() => mealByHour(new Date()));
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  // Zdjęcie żyje tylko tutaj: nigdzie go nie zapisujemy i znika razem z tym ekranem.
  const [photo, setPhoto] = useState<MealPhoto | null>(null);
  const [draft, setDraft] = useState<FoodDraft | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [amount, setAmount] = useState<number | null>(null);

  const patch = (change: Partial<FoodDraft>) =>
    setDraft((current) => (current === null ? current : { ...current, ...change }));

  const attach = async (take: boolean) => {
    try {
      const picked = take ? await takeMealPhoto() : await pickMealPhoto();
      if (picked !== null) setPhoto(picked);
    } catch (e) {
      Alert.alert('Nie udało się dodać zdjęcia', e instanceof PhotoError ? e.message : 'Nieznany błąd.');
    }
  };

  const estimate = async () => {
    if (description.trim() === '' && photo === null) {
      Alert.alert(
        'Napisz albo pokaż, co zjadłeś',
        'Na przykład: dwa jajka, kromka chleba z masłem, kawa z mlekiem. Samo zdjęcie też wystarczy.',
      );
      return;
    }
    setBusy(true);
    try {
      const reply = await askGemini(buildFoodPrompt(description, { photo: photo !== null }), photo);
      const result = parseFoodReply(reply, description);
      setDraft(result.draft);
      setNote(result.note);
      setWarning(result.warning);
      setAmount(referenceAmount(result.draft.basis));
    } catch (e) {
      if (e instanceof NoApiKeyError) {
        Alert.alert('Brak klucza do Gemini', 'Klucz wkleja się raz, w ustawieniach planisty AI.', [
          { text: 'Nie teraz', style: 'cancel' },
          { text: 'Ustawienia', onPress: () => router.push('/goal/ai') },
        ]);
      } else {
        Alert.alert(
          'Nie udało się oszacować',
          e instanceof GeminiError || e instanceof FoodReplyError
            ? e.message
            : 'Nieznany błąd połączenia.',
        );
      }
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    if (draft === null || amount === null) return;
    try {
      const foodId = saveFood(db, draft, { source: 'AI' });
      logFoodMeal(db, { meal, foodId, amount });
      router.back();
    } catch (e) {
      Alert.alert('Nie zapisano', e instanceof MealError ? e.message : (e as Error).message);
    }
  };

  // Kalorie w wersji roboczej da się wyczyścić, więc do przeliczenia bierzemy je dopiero wtedy,
  // gdy jakieś są — inaczej „wyjdzie” pokazywałoby zero jako wynik, a nie jako brak.
  const kcal = draft?.kcal ?? null;
  const values =
    draft === null || kcal === null || amount === null ? null : nutrientsFor({ ...draft, kcal }, amount);

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

        <View style={styles.section}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            CO ZJADŁEŚ
          </ThemedText>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="np. owsianka na mleku z bananem i łyżką masła orzechowego"
            placeholderTextColor={theme.textSecondary}
            multiline
            style={[
              styles.input,
              { color: theme.text, backgroundColor: theme.background, borderColor: theme.border },
            ]}
          />
          <ThemedText type="small" themeColor="textSecondary">
            Im więcej szczegółów, tym bliżej prawdy: wielkość porcji, czy na mleku czy na wodzie,
            ile łyżek. Model nie waży jedzenia, tylko zgaduje typowe wielkości — jego liczby są
            punktem wyjścia do poprawienia, nie pomiarem.
          </ThemedText>
          {photo === null ? (
            <View style={styles.row}>
              <View style={styles.cell}>
                <Button
                  label="Zrób zdjęcie"
                  icon="photo_camera"
                  variant="secondary"
                  onPress={() => void attach(true)}
                />
              </View>
              <View style={styles.cell}>
                <Button
                  label="Z galerii"
                  icon="image"
                  variant="secondary"
                  onPress={() => void attach(false)}
                />
              </View>
            </View>
          ) : (
            <View style={styles.photoRow}>
              <Image source={{ uri: photo.uri }} style={styles.photo} contentFit="cover" />
              <View style={styles.photoText}>
                <ThemedText type="small" themeColor="textSecondary">
                  Zdjęcie pojedzie razem z opisem. Po zapisaniu posiłku znika — do bazy trafiają
                  same liczby.
                </ThemedText>
                <Button
                  label="Usuń zdjęcie"
                  icon="delete"
                  variant="secondary"
                  onPress={() => setPhoto(null)}
                />
              </View>
            </View>
          )}
          <ThemedText type="small" themeColor="textSecondary">
            {photo === null
              ? 'Do Google pojedzie sam ten opis i prośba o wartości. Nic więcej z aplikacji — ani masa ciała, ani treningi, ani pozostałe posiłki.'
              : 'Do Google pojedzie ten opis i to jedno zdjęcie. Nic więcej z aplikacji — ani masa ciała, ani treningi, ani pozostałe posiłki. Kadrowanie przed wysłaniem pozwala zostawić w kadrze sam talerz.'}
          </ThemedText>
          <Button
            label={showPrompt ? 'Ukryj polecenie' : 'Pokaż, co pojedzie do Google'}
            icon="visibility"
            variant="secondary"
            onPress={() => setShowPrompt((shown) => !shown)}
          />
          {showPrompt && (
            <ThemedText type="small" selectable style={styles.prompt}>
              {buildFoodPrompt(description, { photo: photo !== null })}
            </ThemedText>
          )}
          <Button
            label={busy ? 'Pytam Gemini…' : 'Oszacuj'}
            icon="auto_awesome"
            onPress={() => void estimate()}
            disabled={busy}
          />
          {busy && (
            <View style={styles.busy}>
              <ActivityIndicator />
              <ThemedText type="small" themeColor="textSecondary">
                Zwykle kilka sekund.
              </ThemedText>
            </View>
          )}
        </View>

        {draft !== null && (
          <>
            <View style={styles.section}>
              <ThemedText type="smallBold" themeColor="textSecondary">
                OSZACOWANIE — POPRAW, CO TRZEBA
              </ThemedText>
              {note !== null && (
                <ThemedText type="small" themeColor="textSecondary">
                  {`Model założył: ${note}`}
                </ThemedText>
              )}
              {warning !== null && (
                <ThemedText type="small" style={{ color: theme.accent }}>
                  {warning}
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
              <View style={styles.chips}>
                {foodBases.map((basis) => (
                  <Chip
                    key={basis}
                    label={BASIS_LABELS[basis]}
                    selected={draft.basis === basis}
                    onPress={() => {
                      patch({ basis, servingGrams: basis === 'G100' ? null : draft.servingGrams });
                      setAmount(referenceAmount(basis));
                    }}
                  />
                ))}
              </View>
              <View style={styles.row}>
                <NumberField label="Kalorie" value={draft.kcal} onChange={(kcal) => patch({ kcal })} />
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
                {draft.basis === 'SERVING' && (
                  <NumberField
                    label="Masa (g)"
                    value={draft.servingGrams}
                    decimal
                    placeholder="–"
                    onChange={(servingGrams) => patch({ servingGrams })}
                  />
                )}
              </View>
            </View>

            <View style={styles.section}>
              <ThemedText type="smallBold" themeColor="textSecondary">
                ILE ZJEDZONE
              </ThemedText>
              <View style={styles.row}>
                <NumberField
                  label={`Ilość (${AMOUNT_UNITS[draft.basis]})`}
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
            </View>

            <Button
              label="Dodaj do dnia i zapisz w bazie"
              icon="check"
              onPress={save}
              disabled={amount === null || amount <= 0}
            />
            <ThemedText type="small" themeColor="textSecondary">
              Produkt zostanie w bazie z adnotacją, że liczby są z oszacowania — następnym razem
              wybierzesz go jednym dotknięciem i poprawisz, jeśli zważysz dokładniej.
            </ThemedText>
          </>
        )}

        <Button label="Anuluj" variant="secondary" onPress={() => router.back()} />
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
  photoRow: { flexDirection: 'row', gap: Spacing.three, alignItems: 'flex-start' },
  photo: { width: 96, height: 96, borderRadius: 12 },
  photoText: { flex: 1, gap: Spacing.two },
  prompt: { fontFamily: 'monospace', lineHeight: 18 },
  input: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
});
