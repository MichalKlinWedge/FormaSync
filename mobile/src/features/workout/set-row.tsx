import { Pressable, StyleSheet, View } from 'react-native';

import { CompactNumberInput } from '@/components/compact-number-input';
import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import type { ActiveExercise, ActiveSet } from './logic';

type SetValues = { repsCompleted?: number | null; weightKg?: number | null; durationSeconds?: number | null };

type SetRowProps = {
  exercise: ActiveExercise;
  set: ActiveSet;
  isCurrent: boolean;
  onEdit: (values: SetValues) => void;
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
        <CompactNumberInput
          value={set.durationSeconds}
          suffix="s"
          onChange={(v) => onEdit({ durationSeconds: v })}
          onEnd={onEditEnd}
        />
      ) : (
        <CompactNumberInput
          value={set.repsCompleted}
          suffix="powt."
          onChange={(v) => onEdit({ repsCompleted: v })}
          onEnd={onEditEnd}
        />
      )}
      <CompactNumberInput
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
});
