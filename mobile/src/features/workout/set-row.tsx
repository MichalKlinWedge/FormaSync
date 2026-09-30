import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { parseNumber } from '@/features/plans/draft';
import { useTheme } from '@/hooks/use-theme';

import type { ActiveExercise, ActiveSet } from './logic';

type SetRowProps = {
  exercise: ActiveExercise;
  set: ActiveSet;
  isCurrent: boolean;
  onEdit: (values: { repsCompleted?: number | null; weightKg?: number | null; durationSeconds?: number | null }) => void;
  onEditEnd: () => void;
  onToggle: () => void;
  onRemove: () => void;
};

export function SetRow({ exercise, set, isCurrent, onEdit, onEditEnd, onToggle, onRemove }: SetRowProps) {
  const theme = useTheme();
  const done = set.completedAt !== null;
  const timed = exercise.trackingType === 'TIME';

  return (
    <View
      style={[
        styles.row,
        isCurrent && { backgroundColor: theme.backgroundSelected, borderRadius: 10 },
        done && styles.rowDone,
      ]}>
      <ThemedText type="smallBold" themeColor="textSecondary" style={styles.number}>
        {set.setNumber}
      </ThemedText>

      {timed ? (
        <CompactInput
          value={set.durationSeconds}
          suffix="s"
          onChange={(v) => onEdit({ durationSeconds: v })}
          onEnd={onEditEnd}
        />
      ) : (
        <CompactInput
          value={set.repsCompleted}
          suffix="powt."
          onChange={(v) => onEdit({ repsCompleted: v })}
          onEnd={onEditEnd}
        />
      )}
      <CompactInput
        value={set.weightKg}
        suffix="kg"
        decimal
        placeholder="–"
        onChange={(v) => onEdit({ weightKg: v })}
        onEnd={onEditEnd}
      />

      <Pressable accessibilityLabel="Usuń serię" onPress={onRemove} hitSlop={6}>
        <Icon name="close" size={18} color={theme.textSecondary} />
      </Pressable>
      <Pressable
        accessibilityLabel={done ? 'Cofnij wykonanie serii' : 'Oznacz serię jako wykonaną'}
        accessibilityState={{ checked: done }}
        onPress={onToggle}
        hitSlop={6}>
        <Icon
          name={done ? 'check_circle' : 'radio_button_unchecked'}
          size={30}
          color={done ? theme.accent : theme.textSecondary}
        />
      </Pressable>
    </View>
  );
}

type CompactInputProps = {
  value: number | null;
  suffix: string;
  decimal?: boolean;
  placeholder?: string;
  onChange: (value: number | null) => void;
  onEnd: () => void;
};

function CompactInput({ value, suffix, decimal, placeholder, onChange, onEnd }: CompactInputProps) {
  const theme = useTheme();
  const [text, setText] = useState(value === null ? '' : String(value).replace('.', ','));

  return (
    <View style={styles.input}>
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.one,
  },
  rowDone: { opacity: 0.55 },
  number: { width: 18, textAlign: 'center' },
  input: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
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
