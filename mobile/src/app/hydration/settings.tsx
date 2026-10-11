import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Chip } from '@/components/chip';
import { Icon } from '@/components/icon';
import { NumberField } from '@/components/number-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { db } from '@/db/client';
import { DEFAULT_PORTIONS_ML, formatTime, parseTime } from '@/features/hydration/day';
import { formatMl } from '@/features/hydration/format';
import { syncHydrationReminders } from '@/features/hydration/reminders';
import {
  isPortion,
  loadHydrationSettings,
  MAX_PORTIONS,
  PORTION_RANGE,
  saveHydrationSettings,
} from '@/features/hydration/settings';
import { ML_PER_KG } from '@/features/hydration/target';
import { useTheme } from '@/hooks/use-theme';

/** Kroki do wyboru. Krótsze niż godzina to już nagabywanie, dłuższe niż trzy — nie pilnowanie. */
const EVERY_CHOICES = [60, 90, 120, 180];

/**
 * Wiersz porcji z własnym identyfikatorem. Pole liczbowe pamięta swój tekst, więc wiersz usunięty
 * ze środka nie może przesunąć pozostałych na obce wartości — po indeksie byłby to właśnie skutek.
 */
type PortionRow = { key: number; milliliters: number | null };

export default function HydrationSettingsScreen() {
  const theme = useTheme();
  const [settings, setSettings] = useState(() => loadHydrationSettings(db));
  const [portionRows, setPortionRows] = useState<PortionRow[]>(() =>
    settings.portions.map((milliliters, index) => ({ key: index, milliliters })),
  );
  const nextRowKey = useRef(settings.portions.length);

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

  /**
   * Wiersze są jedynym źródłem prawdy dla pól, a do bazy idą tylko wartości z zakresu. Odczyt listy
   * z bazy po każdym uderzeniu w klawiaturę kasowałby wiersz na przelotnej „7” w drodze do „750” —
   * a skrócona lista przesuwa pozostałe porcje na obce miejsca.
   */
  const commitPortions = (rows: PortionRow[]) => {
    setPortionRows(rows);
    const portions = rows.map((row) => row.milliliters).filter(isPortion);
    if (portions.length > 0) update({ portions });
  };

  const setPortion = (key: number, milliliters: number | null) => {
    commitPortions(portionRows.map((row) => (row.key === key ? { ...row, milliliters } : row)));
  };

  const addPortion = () => {
    if (portionRows.length >= MAX_PORTIONS) return;
    setPortionRows([...portionRows, { key: nextRowKey.current++, milliliters: null }]);
  };

  /** Ostatniego wiersza nie usuwamy: kafelek bez ani jednego przycisku nie miałby czym dopisać. */
  const removePortion = (key: number) => {
    if (portionRows.length <= 1) return;
    commitPortions(portionRows.filter((row) => row.key !== key));
  };

  const restorePortions = () => {
    commitPortions(
      DEFAULT_PORTIONS_ML.map((milliliters) => ({ key: nextRowKey.current++, milliliters })),
    );
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
            butelka. Przyjmujemy od {formatMl(PORTION_RANGE.min)} do {formatMl(PORTION_RANGE.max)};
            do {MAX_PORTIONS} przycisków.
          </ThemedText>
          {portionRows.map((row, index) => (
            <View key={row.key} style={styles.portionRow}>
              <View style={styles.cell}>
                <NumberField
                  label={`Porcja ${index + 1}`}
                  value={row.milliliters}
                  onChange={(value) => setPortion(row.key, value)}
                  placeholder="np. 500"
                />
              </View>
              <Pressable
                accessibilityLabel={`Usuń porcję ${index + 1}`}
                disabled={portionRows.length <= 1}
                hitSlop={8}
                onPress={() => removePortion(row.key)}
                style={[styles.portionRemove, { opacity: portionRows.length <= 1 ? 0.3 : 1 }]}>
                <Icon name="close" size={20} color={theme.textSecondary} />
              </Pressable>
            </View>
          ))}
          {portionRows.some((row) => !isPortion(row.milliliters)) && (
            <ThemedText type="small" themeColor="textSecondary">
              Porcja poza zakresem {formatMl(PORTION_RANGE.min)}–{formatMl(PORTION_RANGE.max)} nie
              trafi na przyciski — dopisz wartość albo usuń wiersz.
            </ThemedText>
          )}
          <View style={styles.row}>
            <View style={styles.cell}>
              <Button
                label="Dodaj porcję"
                icon="add"
                variant="secondary"
                disabled={portionRows.length >= MAX_PORTIONS}
                onPress={addPortion}
              />
            </View>
            <View style={styles.cell}>
              <Button
                label="Przywróć domyślne"
                icon="undo"
                variant="secondary"
                onPress={restorePortions}
              />
            </View>
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
  portionRow: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.two },
  // Krzyżyk na wysokości pola, a nie jego dolnej krawędzi — nad polem stoi jeszcze etykieta.
  portionRemove: { paddingBottom: Spacing.two + Spacing.half },
  cell: { flex: 1 },
});
