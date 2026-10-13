import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

import { dayRatio, paceRatio, type DayWindow } from './day';

type DayBarProps = {
  consumedMl: number;
  targetMl: number;
  window: DayWindow;
  /**
   * Chwila, na którą wypada kreska. Wymagana, bo ekran musi podać tę samą, którą wpisuje
   * w zdanie pod paskiem — dwa osobne `new Date()` rozjeżdżały kreskę ze zdaniem i z drugim
   * ekranem, na którym pasek stał nieodświeżany od wejścia.
   */
  at: Date;
  /** Wysokość samego paska; zaokrąglenie idzie za nią, żeby końce zawsze były półkolem. */
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
  const done = consumedMl >= targetMl;
  const pace = paceRatio(consumedMl, targetMl, window, at);

  return (
    <View style={[styles.row, { height: height + 2 * OVERHANG }]}>
      <View
        style={[
          styles.track,
          { height, borderRadius: height / 2, backgroundColor: theme.backgroundSelected },
        ]}>
        <View
          style={[
            styles.fill,
            {
              // Zaokrąglony jest tylko początek. Półkole na końcu cofa kolor przy górnej
              // i dolnej krawędzi, więc wypite zdawało się kończyć wcześniej, niż kończy —
              // przy kresce tuż obok to decydowało, czy widać zaległość, czy nie. Przy pełnym
              // celu koniec i tak zaokrągli sam pasek, bo przycina zawartość.
              borderTopLeftRadius: height / 2,
              borderBottomLeftRadius: height / 2,
              backgroundColor: done ? theme.chart1 : theme.accent,
              width: `${dayRatio(consumedMl, targetMl) * 100}%`,
            },
          ]}
        />
      </View>
      {pace !== null && (
        // Kreska wystaje nad pasek i pod niego, żeby dała się odczytać także wtedy, gdy wypada
        // dokładnie na granicy wypitego — na samym pasku zlewała się wtedy z końcem wypełnienia.
        // Kolor tekstu, bo musi być widoczna i na wypełnieniu, i na pustym pasku. Przesunięcie
        // o połowę grubości stawia ją środkiem na właściwej wartości, a nie krawędzią.
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
/** Ile kreska wystaje poza pasek z każdej strony. */
const OVERHANG = 3;

const styles = StyleSheet.create({
  row: { justifyContent: 'center' },
  track: { overflow: 'hidden' },
  fill: { height: '100%' },
  pace: { position: 'absolute', top: 0, bottom: 0, width: PACE_WIDTH },
});
