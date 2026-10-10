import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { NumberField } from '@/components/number-field';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { db } from '@/db/client';

import { age, BirthYearError, birthYear, estimatedMaxHeartRate, saveBirthYear } from './profile';

/** Sekcja Ustawień z rokiem urodzenia — jedyną rzeczą o Tobie, której nie ma w treningach. */
export function ProfileSection() {
  const [year, setYear] = useState<number | null>(() => birthYear(db));
  const [saved, setSaved] = useState<number | null>(() => age(db));

  const store = () => {
    try {
      saveBirthYear(db, year);
      setSaved(age(db));
    } catch (e) {
      Alert.alert('Nie udało się zapisać', e instanceof BirthYearError ? e.message : 'Nieznany błąd.');
    }
  };

  return (
    <View style={styles.section}>
      <ThemedText type="smallBold" themeColor="textSecondary">
        PROFIL
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        Wiek bierze pod uwagę planista AI przy układaniu planu pod zawody. Poza tym daje punkt
        odniesienia dla tętna maksymalnego — aplikacja nic więcej z nim nie robi i nikomu go nie
        wysyła poza tym jednym zapytaniem, na które sam się zgodzisz.
      </ThemedText>
      <NumberField
        label="Rok urodzenia"
        value={year}
        onChange={setYear}
        placeholder="np. 1985"
      />
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
});
