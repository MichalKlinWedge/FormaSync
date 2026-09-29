import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { parseNumber } from '@/features/plans/draft';
import { useTheme } from '@/hooks/use-theme';

type NumberFieldProps = {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  /** Dopuszcza część ułamkową (np. ciężar 62,5 kg). */
  decimal?: boolean;
  placeholder?: string;
};

/** Pole liczbowe; trzyma własny tekst, by nie gubić stanów pośrednich typu „62,”. */
export function NumberField({ label, value, onChange, decimal, placeholder }: NumberFieldProps) {
  const theme = useTheme();
  const [text, setText] = useState(value === null ? '' : String(value).replace('.', ','));

  return (
    <View style={styles.field}>
      <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
        {label}
      </ThemedText>
      <TextInput
        value={text}
        onChangeText={(t) => {
          const cleaned = decimal ? t.replace(/[^0-9.,]/g, '') : t.replace(/[^0-9]/g, '');
          setText(cleaned);
          const parsed = parseNumber(cleaned);
          onChange(parsed === null ? null : decimal ? parsed : Math.trunc(parsed));
        }}
        keyboardType={decimal ? 'decimal-pad' : 'number-pad'}
        placeholder={placeholder}
        placeholderTextColor={theme.textSecondary}
        selectTextOnFocus
        style={[styles.input, { color: theme.text, backgroundColor: theme.background, borderColor: theme.border }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  field: { flex: 1, gap: Spacing.half },
  input: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
    fontSize: 16,
    textAlign: 'center',
  },
});
