import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { addMonths, fromDateKey, isSameMonth, monthGrid, monthTitle, WEEKDAYS_SHORT } from '@/lib/date';

/**
 * Wybór zakresu dat z siatki miesiąca.
 *
 * Przesuwanie granic po dniu wystarczało, dopóki zakresem był tydzień obok. Przy dowolnym okresie
 * to już odliczanie dotknięć, a człowiek i tak myśli kalendarzem: „od poniedziałku do końca
 * miesiąca”. Siatka jest ta sama, co w kalendarzu treningów — ten sam układ tygodnia i te same
 * kropki przy dniach, w których coś stoi.
 *
 * Pierwsze dotknięcie zaczyna zakres, drugie go domyka; dotknięcie dnia wcześniejszego niż
 * początek przestawia początek, zamiast wymuszać kasowanie wyboru.
 */

export type DateRange = { from: string; to: string };

type Props = {
  range: DateRange;
  onChange: (range: DateRange) => void;
  /** Najwcześniejszy dzień do wybrania; wcześniejsze są przygaszone i nie reagują. */
  min?: string;
  /** Dni, przy których ma stanąć kropka — zwykle te z zaplanowanym treningiem. */
  marked?: Set<string>;
};

export function RangeCalendar({ range, onChange, min, marked }: Props) {
  const theme = useTheme();
  const [view, setView] = useState(() => {
    const date = fromDateKey(range.from);
    return { year: date.getFullYear(), month: date.getMonth() };
  });
  // Dzień pierwszego dotknięcia. Niepusty wyłącznie między dotknięciami, więc zakres ustawiony
  // skądinąd — choćby skrótem „następny tydzień” — niczego tu nie zostawia w połowie.
  const [anchor, setAnchor] = useState<string | null>(null);

  const pick = (day: string) => {
    if (min !== undefined && day < min) return;
    if (anchor === null) {
      setAnchor(day);
      onChange({ from: day, to: day });
      return;
    }
    setAnchor(null);
    onChange(day < anchor ? { from: day, to: anchor } : { from: anchor, to: day });
  };

  const weeks = monthGrid(view.year, view.month);

  return (
    <View style={styles.wrap}>
      <View style={styles.monthBar}>
        <Pressable
          accessibilityLabel="Poprzedni miesiąc"
          onPress={() => setView((current) => addMonths(current.year, current.month, -1))}
          hitSlop={8}>
          <Icon name="chevron_left" size={26} color={theme.text} />
        </Pressable>
        <ThemedText type="smallBold">{monthTitle(view.year, view.month)}</ThemedText>
        <Pressable
          accessibilityLabel="Następny miesiąc"
          onPress={() => setView((current) => addMonths(current.year, current.month, 1))}
          hitSlop={8}>
          <Icon name="chevron_right" size={26} color={theme.text} />
        </Pressable>
      </View>

      <View style={styles.weekdays}>
        {WEEKDAYS_SHORT.map((day) => (
          <ThemedText key={day} type="small" themeColor="textSecondary" style={styles.cell}>
            {day}
          </ThemedText>
        ))}
      </View>

      {weeks.map((week) => (
        <View key={week[0]} style={styles.week}>
          {week.map((key) => {
            const inMonth = isSameMonth(key, view.year, view.month);
            const blocked = min !== undefined && key < min;
            const inside = key >= range.from && key <= range.to;
            const edge = key === range.from || key === range.to;
            return (
              <Pressable
                key={key}
                onPress={() => pick(key)}
                disabled={blocked}
                style={[
                  styles.day,
                  inside && { backgroundColor: theme.backgroundSelected },
                  edge && { backgroundColor: theme.accent, borderRadius: 10 },
                ]}>
                <ThemedText
                  type="small"
                  style={{
                    color: edge
                      ? theme.onAccent
                      : blocked || !inMonth
                        ? theme.textSecondary
                        : theme.text,
                    opacity: blocked ? 0.4 : 1,
                  }}>
                  {fromDateKey(key).getDate()}
                </ThemedText>
                <View
                  style={[
                    styles.dot,
                    {
                      backgroundColor:
                        marked?.has(key) === true
                          ? edge
                            ? theme.onAccent
                            : theme.accent
                          : 'transparent',
                    },
                  ]}
                />
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.one },
  monthBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  weekdays: { flexDirection: 'row' },
  week: { flexDirection: 'row' },
  cell: { flex: 1, textAlign: 'center' },
  day: { flex: 1, alignItems: 'center', paddingVertical: Spacing.one, gap: 2 },
  dot: { width: 4, height: 4, borderRadius: 2 },
});
