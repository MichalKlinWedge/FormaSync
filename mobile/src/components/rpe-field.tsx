import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export const RPE_VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

type RpeFieldProps = {
  value: number | null;
  onChange: (value: number | null) => void;
};

/**
 * Opcjonalna ocena wysiłku serii. Zwinięta do małej pigułki, żeby nie zaśmiecać wiersza serii —
 * skala rozwija się dopiero po dotknięciu.
 */
export function RpeField({ value, onChange }: RpeFieldProps) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <View style={styles.container}>
      <View style={styles.pillRow}>
        <Pressable
          accessibilityLabel={value === null ? 'Dodaj ocenę RPE' : `Ocena RPE ${value}, zmień`}
          onPress={() => setOpen((o) => !o)}
          hitSlop={6}
          style={[
            styles.pill,
            { borderColor: theme.border, backgroundColor: value === null ? 'transparent' : theme.accent },
          ]}>
          <ThemedText type="small" style={{ color: value === null ? theme.textSecondary : theme.onAccent }}>
            {value === null ? 'RPE' : `RPE ${value}`}
          </ThemedText>
        </Pressable>
      </View>

      {open && (
        <View style={styles.scale}>
          {RPE_VALUES.map((option) => {
            const selected = value === option;
            return (
              <Pressable
                key={option}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                onPress={() => {
                  onChange(selected ? null : option);
                  setOpen(false);
                }}
                style={[
                  styles.step,
                  {
                    borderColor: selected ? theme.accent : theme.border,
                    backgroundColor: selected ? theme.accent : theme.background,
                  },
                ]}>
                <ThemedText type="small" style={{ color: selected ? theme.onAccent : theme.text }}>
                  {option}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.one },
  pillRow: { flexDirection: 'row', justifyContent: 'flex-end' },
  pill: {
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
  },
  scale: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one, justifyContent: 'flex-end' },
  step: {
    minWidth: 32,
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.one,
  },
});
