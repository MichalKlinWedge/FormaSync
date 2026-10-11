import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Spacing } from '@/constants/theme';

import { formatMl } from './format';
import { portionRows } from './settings';

/**
 * Przyciski „dopisz porcję” — te same na kafelku „Dziś” i na ekranie nawodnienia.
 *
 * Szerokość nie jest zadana: każdy przycisk ma `flex: 1`, więc rząd dzieli się równo na tyle
 * części, ile stoi w nim porcji, a odstępy odejmuje flexbox. Procentowa podstawa tego nie umie —
 * trzy razy 30% plus odstępy nie mieszczą się w stu procentach i trzecia porcja spadała pod spód.
 */
export function PortionButtons({
  portions,
  onDrink,
}: {
  portions: number[];
  onDrink: (milliliters: number) => void;
}) {
  return (
    <View style={styles.rows}>
      {portionRows(portions).map((row, rowIndex) => (
        <View key={rowIndex} style={styles.row}>
          {row.map((milliliters, index) => (
            // Klucz z indeksu: dwie porcje o tej samej wielkości to wybór użytkownika, nie błąd.
            <View key={index} style={styles.cell}>
              <Button
                label={`+${formatMl(milliliters)}`}
                icon="water_drop"
                onPress={() => onDrink(milliliters)}
              />
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  rows: { gap: Spacing.two },
  row: { flexDirection: 'row', gap: Spacing.two },
  cell: { flex: 1 },
});
