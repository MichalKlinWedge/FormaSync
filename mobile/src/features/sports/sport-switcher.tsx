import { Pressable, ScrollView, StyleSheet } from 'react-native';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { type Sport, sports } from '@/db/schema';
import { useTheme } from '@/hooks/use-theme';

import { SPORT_ICONS, SPORT_LABELS } from './sport';
import { useSportStore } from './sport-store';

/**
 * Przełącznik dyscypliny. Stoi na ekranach, które pokazują dane jednego sportu — „Dziś”, planach
 * i historii — żeby widać było, czyje dane są na ekranie, bez wchodzenia w ustawienia.
 */
export function SportSwitcher() {
  const theme = useTheme();
  const sport = useSportStore((state) => state.sport);
  const select = useSportStore((state) => state.select);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      accessibilityRole="tablist">
      {sports.map((item) => (
        <SportTab
          key={item}
          sport={item}
          selected={item === sport}
          onPress={() => select(item)}
          accent={theme.accent}
          background={theme.backgroundElement}
          onAccent={theme.onAccent}
          text={theme.text}
        />
      ))}
    </ScrollView>
  );
}

type SportTabProps = {
  sport: Sport;
  selected: boolean;
  onPress: () => void;
  accent: string;
  background: string;
  onAccent: string;
  text: string;
};

function SportTab({ sport, selected, onPress, accent, background, onAccent, text }: SportTabProps) {
  const foreground = selected ? onAccent : text;
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      accessibilityLabel={SPORT_LABELS[sport]}
      onPress={onPress}
      style={({ pressed }) => [
        styles.tab,
        { backgroundColor: selected ? accent : background, opacity: pressed ? 0.7 : 1 },
      ]}>
      <Icon name={SPORT_ICONS[sport]} size={18} color={foreground} />
      <ThemedText type="small" style={{ color: foreground }}>
        {SPORT_LABELS[sport]}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: Spacing.two, paddingRight: Spacing.four },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    borderRadius: 999,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one + Spacing.half,
  },
});
