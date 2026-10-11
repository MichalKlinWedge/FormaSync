import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Chip } from '@/components/chip';
import { NumberField } from '@/components/number-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { db } from '@/db/client';
import {
  ACTIVITY_FACTORS,
  ACTIVITY_LABELS,
  ACTIVITY_NOTES,
  activityLevels,
  describeEnergy,
} from '@/features/nutrition/energy';
import { formatGrams, formatKcal } from '@/features/nutrition/format';
import {
  describeGoal,
  dietModes,
  formatRate,
  MODE_LABELS,
  PROTEIN_PER_KG,
  RATE_OPTIONS,
} from '@/features/nutrition/goal';
import {
  loadNutritionSettings,
  resolvedRate,
  saveNutritionSettings,
} from '@/features/nutrition/settings';
import { useNutritionDay } from '@/features/nutrition/use-nutrition';
import { ProfileSection } from '@/features/profile/profile-section';
import { todayKey } from '@/lib/date';
import { formatNumber } from '@/lib/number';

/**
 * Cel diety i dane, bez których nie ma czego liczyć.
 *
 * Wszystko zapisuje się od razu, bez przycisku — a na dole stoi dzisiejszy budżet rozpisany na
 * składniki, żeby po każdej zmianie było widać, co z niej wyszło.
 */
export default function NutritionSettingsScreen() {
  const [settings, setSettings] = useState(() => loadNutritionSettings(db));
  const { energy, protein, weightKg } = useNutritionDay(todayKey());

  const update = (patch: Parameters<typeof saveNutritionSettings>[1]) => {
    saveNutritionSettings(db, patch);
    setSettings(loadNutritionSettings(db));
  };

  const rate = resolvedRate(settings);
  const factor = formatNumber(ACTIVITY_FACTORS[settings.activity], 2);
  const proteinDefault = formatNumber(PROTEIN_PER_KG[settings.mode], 1);

  return (
    <ThemedView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.section}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            CEL DIETY
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Ta sama osoba o tej samej masie ciała ma inny budżet na redukcji i inny na masie, więc
            od celu zaczyna się wszystko inne. Cel podaje się tempem zmiany masy, bo „pół kilograma
            na tydzień” da się sprawdzić na wadze — a „minus 500 kcal” nie da się sprawdzić w ogóle.
          </ThemedText>
          <View style={styles.chips}>
            {dietModes.map((mode) => (
              <Chip
                key={mode}
                label={MODE_LABELS[mode]}
                selected={settings.mode === mode}
                onPress={() => update({ mode })}
              />
            ))}
          </View>
          {RATE_OPTIONS[settings.mode].length > 1 && (
            <View style={styles.chips}>
              {RATE_OPTIONS[settings.mode].map((value) => (
                <Chip
                  key={value}
                  label={formatRate(value)}
                  selected={rate === value}
                  onPress={() => update({ ratePerWeek: value })}
                />
              ))}
            </View>
          )}
          <ThemedText type="small" themeColor="textSecondary">
            {`${describeGoal(settings.mode, rate)}.`}
          </ThemedText>
        </View>

        <View style={styles.section}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            RUCH W CIĄGU DNIA
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Bez treningów — te liczymy osobno, z czasu i dyscypliny każdego z nich. Dlatego mnożniki
            są niższe niż w kalkulatorach, które trening mają już w sobie: wzięte stamtąd policzyłyby
            bieg dwa razy.
          </ThemedText>
          <View style={styles.chips}>
            {activityLevels.map((level) => (
              <Chip
                key={level}
                label={ACTIVITY_LABELS[level]}
                selected={settings.activity === level}
                onPress={() => update({ activity: level })}
              />
            ))}
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            {`${ACTIVITY_NOTES[settings.activity]} — przemiana podstawowa × ${factor}.`}
          </ThemedText>
        </View>

        <View style={styles.section}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            BIAŁKO
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {`Gramy na kilogram masy ciała; domyślnie ${proteinDefault} g/kg przy celu `
              + `„${MODE_LABELS[settings.mode]}”. Przy deficycie to białko decyduje, czy schodzi`
              + ' tłuszcz, czy mięśnie.'}
          </ThemedText>
          <View style={styles.row}>
            <NumberField
              label="g na kg masy"
              value={settings.proteinPerKg}
              decimal
              placeholder={proteinDefault}
              onChange={(value) => update({ proteinPerKg: value })}
            />
            <View style={styles.cell}>
              <ThemedText type="small" themeColor="textSecondary">
                Cel dnia
              </ThemedText>
              <ThemedText type="smallBold">
                {protein === null ? 'potrzebna masa ciała' : formatGrams(protein)}
              </ThemedText>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            BUDŻET WPISANY RĘCZNIE
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Gdy wiesz lepiej niż wzór — na przykład z kilku tygodni liczenia i wagi. Wtedy cel diety
            nie dokłada już poprawki, ale dzisiejszy trening nadal podnosi budżet. Puste pole znaczy
            „licz ze wzoru”.
          </ThemedText>
          <View style={styles.row}>
            <NumberField
              label="Budżet (kcal)"
              value={settings.manualKcal}
              placeholder="ze wzoru"
              onChange={(value) => update({ manualKcal: value })}
            />
            <View style={styles.cell} />
          </View>
        </View>

        <ProfileSection />

        <View style={styles.section}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            DZISIEJSZY BUDŻET
          </ThemedText>
          <ThemedText type="smallBold">
            {energy.target === null ? 'Nie ma z czego policzyć' : formatKcal(energy.target)}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {describeEnergy(energy, settings.mode)}
          </ThemedText>
          {energy.bmr !== null && (
            <ThemedText type="small" themeColor="textSecondary">
              {`Przemiana podstawowa: ${formatKcal(energy.bmr)}`
                + `${weightKg === null ? '' : ` przy masie ${formatNumber(weightKg, 1)} kg`}.`
                + ' Wzór Mifflina–St Jeora: przybliżenie dla populacji, nie Twój pomiar.'}
            </ThemedText>
          )}
        </View>
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
});
