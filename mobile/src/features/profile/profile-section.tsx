import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { NumberField } from '@/components/number-field';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { db } from '@/db/client';

import {
  age,
  BirthYearError,
  birthYear,
  estimatedMaxHeartRate,
  HeightError,
  heightCm,
  saveBirthYear,
  saveHeight,
  saveSex,
  type Sex,
  SEX_LABELS,
  sex,
  sexes,
} from './profile';

/**
 * Sekcja Ustawień z tym, czego nie ma w treningach: rokiem urodzenia, płcią i wzrostem.
 *
 * Stoi w dwóch miejscach — w Ustawieniach i na ekranie celu diety — bo to te same trzy wartości.
 * Budżet kalorii bez nich nie istnieje, a odsyłanie po nie na inny ekran kazałoby szukać.
 */
export function ProfileSection() {
  const [year, setYear] = useState<number | null>(() => birthYear(db));
  const [height, setHeight] = useState<number | null>(() => heightCm(db));
  const [picked, setPicked] = useState<Sex | null>(() => sex(db));
  const [saved, setSaved] = useState<number | null>(() => age(db));

  const store = () => {
    try {
      saveBirthYear(db, year);
      saveHeight(db, height);
      saveSex(db, picked);
      setSaved(age(db));
    } catch (e) {
      Alert.alert(
        'Nie udało się zapisać',
        e instanceof BirthYearError || e instanceof HeightError ? e.message : 'Nieznany błąd.',
      );
    }
  };

  return (
    <View style={styles.section}>
      <ThemedText type="smallBold" themeColor="textSecondary">
        PROFIL
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        Wiek, płeć i wzrost wchodzą do wzoru na przemianę podstawową, czyli do budżetu kalorii.
        Wiek bierze też pod uwagę planista AI i daje punkt odniesienia dla tętna maksymalnego.
        Aplikacja nic więcej z tymi danymi nie robi i nikomu ich nie wysyła poza tym jednym
        zapytaniem, na które sam się zgodzisz.
      </ThemedText>
      <View style={styles.row}>
        <NumberField label="Rok urodzenia" value={year} onChange={setYear} placeholder="np. 1985" />
        <NumberField label="Wzrost (cm)" value={height} onChange={setHeight} placeholder="np. 180" />
      </View>
      <View style={styles.chips}>
        {sexes.map((value) => (
          <Chip
            key={value}
            label={SEX_LABELS[value]}
            selected={picked === value}
            onPress={() => setPicked(value)}
          />
        ))}
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        Płeć jest tu wyłącznie po to, żeby wzór miał czego się trzymać — Mifflin–St Jeor zna dwie
        wartości i różnią się one o 166 kcal. Kto chce innego budżetu, wpisuje go ręcznie.
      </ThemedText>
      <Button label="Zapisz" icon="save" variant="secondary" onPress={store} />
      {saved !== null && (
        <ThemedText type="small" themeColor="textSecondary">
          {`Wiek: ${saved}. Szacowane tętno maksymalne ${estimatedMaxHeartRate(saved)} — to wzór 220 minus wiek, przybliżenie dla całej populacji, nie Twój pomiar.`}
        </ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: Spacing.two },
  row: { flexDirection: 'row', gap: Spacing.two },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
});
