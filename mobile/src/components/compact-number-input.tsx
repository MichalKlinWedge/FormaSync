import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { parseNumber } from '@/features/plans/draft';
import { useTheme } from '@/hooks/use-theme';

type CompactNumberInputProps = {
  value: number | null;
  /** Jednostka wyświetlana obok pola, np. „kg”. */
  suffix: string;
  decimal?: boolean;
  placeholder?: string;
  onChange: (value: number | null) => void;
  onEnd?: () => void;
};

/** Wąskie pole liczbowe do wierszy serii. Trzyma własny tekst, by nie gubić stanów typu „62,”. */
export function CompactNumberInput({
  value,
  suffix,
  decimal,
  placeholder,
  onChange,
  onEnd,
}: CompactNumberInputProps) {
  const theme = useTheme();
  const [text, setText] = useState(value === null ? '' : String(value).replace('.', ','));

  return (
    <View style={styles.wrapper}>
      <TextInput
        value={text}
        onChangeText={(t) => {
          const cleaned = decimal ? t.replace(/[^0-9.,]/g, '') : t.replace(/[^0-9]/g, '');
          setText(cleaned);
          const parsed = parseNumber(cleaned);
          onChange(parsed === null ? null : decimal ? parsed : Math.trunc(parsed));
        }}
        onEndEditing={onEnd}
        onBlur={onEnd}
        keyboardType={decimal ? 'decimal-pad' : 'number-pad'}
        placeholder={placeholder}
        placeholderTextColor={theme.textSecondary}
        selectTextOnFocus
        style={[styles.field, { color: theme.text, borderColor: theme.border }]}
      />
      <ThemedText type="small" themeColor="textSecondary">
        {suffix}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  field: {
    flex: 1,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.one,
    fontSize: 16,
    textAlign: 'center',
  },
});
