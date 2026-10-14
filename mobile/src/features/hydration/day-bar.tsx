import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

import { dayRatio, paceRatio, type DayWindow } from './day';

type DayBarProps = {
  consumedMl: number;
  targetMl: number;
  /**
   * Woda za trening, który na dziś jest w planie, ale jeszcze się nie odbył. Pasek rozciąga się
   * o nią i maluje ten odcinek innym kolorem — to zapas, którego dziś jeszcze nie trzeba wypić.
   */
  plannedMl?: number;
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
export function DayBar({
  consumedMl,
  targetMl,
  plannedMl = 0,
  window,
  at,
  height = 14,
}: DayBarProps) {
  const theme = useTheme();
  const done = consumedMl >= targetMl;
  // Cały pasek to cel dnia razem z planem; dzisiejszy cel zostaje w nim granicą. Wszystko, co
  // pasek pokazuje, musi być liczone tą samą miarą — inaczej kreska celu stanęłaby w innym
  // miejscu niż koniec wypełnienia, a to już raz wyszło na dwóch ekranach naraz.
  const scale = targetMl + Math.max(plannedMl, 0);
  const share = scale <= 0 ? 1 : targetMl / scale;
  const pace = paceRatio(consumedMl, targetMl, window, at);

  return (
    <View style={[styles.row, { height: height + 2 * OVERHANG }]}>
      <View
        style={[
          styles.track,
          { height, borderRadius: height / 2, backgroundColor: theme.backgroundSelected },
        ]}>
        {plannedMl > 0 && (
          // Odcinek za dzisiejszym celem: tyle wody dołoży zaplanowany trening, gdy się odbędzie.
          <View style={[styles.planned, { left: `${share * 100}%`, backgroundColor: theme.chart2 }]} />
        )}
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
              width: `${dayRatio(consumedMl, scale) * 100}%`,
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
            {
              left: `${pace * share * 100}%`,
              marginLeft: -PACE_WIDTH / 2,
              backgroundColor: theme.text,
            },
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
  planned: { position: 'absolute', top: 0, bottom: 0, right: 0 },
  pace: { position: 'absolute', top: 0, bottom: 0, width: PACE_WIDTH },
});
