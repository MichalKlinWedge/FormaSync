import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Chip } from '@/components/chip';
import { NumberField } from '@/components/number-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { db } from '@/db/client';
import { DEFAULT_PORTIONS_ML, formatTime, parseTime } from '@/features/hydration/day';
import { formatMl } from '@/features/hydration/format';
import { syncHydrationReminders } from '@/features/hydration/reminders';
import { loadHydrationSettings, saveHydrationSettings } from '@/features/hydration/settings';
import { ML_PER_KG } from '@/features/hydration/target';

/** Kroki do wyboru. Krótsze niż godzina to już nagabywanie, dłuższe niż trzy — nie pilnowanie. */
const EVERY_CHOICES = [60, 90, 120, 180];

export default function HydrationSettingsScreen() {
  const [settings, setSettings] = useState(() => loadHydrationSettings(db));

  /** Zapis i przeplanowanie w jednym: zmiana okna bez przeplanowania nic by nie dała. */
  const update = (patch: Parameters<typeof saveHydrationSettings>[1]) => {
    saveHydrationSettings(db, patch);
    const next = loadHydrationSettings(db);
    setSettings(next);
    void syncHydrationReminders().catch(() => {});
  };

  const setHour = (edge: 'from' | 'to', hour: number | null) => {
    if (hour === null || hour < 0 || hour > 23) return;
    update({ window: { ...settings.window, [edge]: formatTime(hour * 60) } });
  };

  const setPortion = (index: number, milliliters: number | null) => {
    if (milliliters === null || milliliters <= 0) return;
    const portions = [...settings.portions];
    portions[index] = milliliters;
    update({ portions });
  };

  const hourOf = (time: string): number => Math.floor((parseTime(time) ?? 0) / 60);

  return (
    <ThemedView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.section}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            PRZYPOMNIENIA
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Przypominamy tylko wtedy, gdy jesteś poniżej kreski na daną godzinę. Jeśli rano wypijesz
            dużo, do popołudnia nie usłyszysz nic.
          </ThemedText>
          <View style={styles.chips}>
            <Chip
              label="Pilnuj"
              selected={settings.reminders}
              onPress={() => update({ reminders: true })}
            />
            <Chip
              label="Nie pilnuj"
              selected={!settings.reminders}
              onPress={() => update({ reminders: false })}
            />
          </View>
        </View>

        <View style={styles.section}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            OKNO DNIA
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Poza tymi godzinami nie przypominamy — w nocy się śpi. Cel rozkładamy równo na całe
            okno, więc o jego połowie powinna być w Tobie połowa celu.
          </ThemedText>
          <View style={styles.row}>
            <View style={styles.cell}>
              <NumberField
                label="Od godziny"
                value={hourOf(settings.window.from)}
                onChange={(hour) => setHour('from', hour)}
              />
            </View>
            <View style={styles.cell}>
              <NumberField
                label="Do godziny"
                value={hourOf(settings.window.to)}
                onChange={(hour) => setHour('to', hour)}
              />
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            CO ILE SPRAWDZAĆ
          </ThemedText>
          <View style={styles.chips}>
            {EVERY_CHOICES.map((minutes) => (
              <Chip
                key={minutes}
                label={`${minutes} min`}
                selected={settings.everyMinutes === minutes}
                onPress={() => update({ everyMinutes: minutes })}
              />
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            CEL DNIA
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Domyślnie liczymy go z masy ciała z ostatniego pomiaru — {ML_PER_KG} ml na kilogram — i
            dokładamy pół litra za każdą godzinę dzisiejszego treningu. Własna wartość wyłącza
            liczenie z masy, ale dodatek treningowy zostaje.
          </ThemedText>
          <NumberField
            label="Stały cel w ml (puste = z masy ciała)"
            value={settings.manualMl}
            onChange={(milliliters) => update({ manualMl: milliliters })}
            placeholder="np. 2500"
          />
        </View>

        <View style={styles.section}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            PORCJE NA PRZYCISKACH
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Domyślnie {DEFAULT_PORTIONS_ML.map(formatMl).join(', ')} — szklanka, butelka, duża
            butelka.
          </ThemedText>
          <View style={styles.row}>
            {settings.portions.map((milliliters, index) => (
              <View key={index} style={styles.cell}>
                <NumberField
                  label={`Porcja ${index + 1}`}
                  value={milliliters}
                  onChange={(value) => setPortion(index, value)}
                />
              </View>
            ))}
          </View>
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
  row: { flexDirection: 'row', gap: Spacing.two },
  cell: { flex: 1 },
});
