import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

import { dayRatio, paceRatio, type DayWindow } from './day';

type DayBarProps = {
  consumedMl: number;
  targetMl: number;
  window: DayWindow;
  at?: Date;
  /** Wysokość paska; zaokrąglenie idzie za nią, żeby końce zawsze były półkolem. */
  height?: number;
};

/**
 * Dzień picia na jednym pasku: wypełnienie to stan na teraz, pionowa kreska — ile powinno już
 * być wypite o tej godzinie.
 *
 * Dotąd kreska istniała wyłącznie w zdaniu obok („Zaległość 500 ml”), choć pasek, na którym
 * widać ją od razu, był tuż nad nim. Teraz „jestem pod kreską” da się zobaczyć dosłownie:
 * wypełnienie kończy się przed nią.
 */
export function DayBar({ consumedMl, targetMl, window, at, height = 14 }: DayBarProps) {
  const theme = useTheme();
  const now = at ?? new Date();
  const done = consumedMl >= targetMl;
  const pace = paceRatio(consumedMl, targetMl, window, now);

  return (
    <View
      style={[
        styles.track,
        { height, borderRadius: height / 2, backgroundColor: theme.backgroundSelected },
      ]}>
      <View
        style={[
          styles.fill,
          {
            borderRadius: height / 2,
            backgroundColor: done ? theme.chart1 : theme.accent,
            width: `${dayRatio(consumedMl, targetMl) * 100}%`,
          },
        ]}
      />
      {pace !== null && (
        // Kolor tekstu, bo kreska musi być widoczna i na wypełnieniu, i na pustym pasku —
        // jedyna barwa motywu, która odcina się od obu. Przesunięcie o połowę grubości stawia
        // ją środkiem na właściwej wartości, a nie krawędzią.
        <View
          style={[
            styles.pace,
            { left: `${pace * 100}%`, marginLeft: -PACE_WIDTH / 2, backgroundColor: theme.text },
          ]}
        />
      )}
    </View>
  );
}

const PACE_WIDTH = 2;

const styles = StyleSheet.create({
  track: { overflow: 'hidden' },
  fill: { height: '100%' },
  pace: { position: 'absolute', top: 0, bottom: 0, width: PACE_WIDTH },
});
