import { Pressable, StyleSheet, View } from 'react-native';

import { CompactNumberInput } from '@/components/compact-number-input';
import { Icon } from '@/components/icon';
import { RpeField } from '@/components/rpe-field';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { type ActiveExercise, type ActiveSet, sideLabels, sideNames } from './logic';

type SetValues = {
  repsCompleted?: number | null;
  weightKg?: number | null;
  durationSeconds?: number | null;
  rpe?: number | null;
};

type SetRowProps = {
  exercise: ActiveExercise;
  set: ActiveSet;
  isCurrent: boolean;
  /** Czy to ta seria, która właśnie się odlicza. */
  isTiming: boolean;
  onEdit: (values: SetValues) => void;
  onEditEnd: () => void;
  onToggle: () => void;
  onRemove: () => void;
};

export function SetRow({
  exercise,
  set,
  isCurrent,
  isTiming,
  onEdit,
  onEditEnd,
  onToggle,
  onRemove,
}: SetRowProps) {
  const theme = useTheme();
  const done = set.completedAt !== null;
  const timed = exercise.trackingType === 'TIME';

  return (
    <View style={isCurrent ? { backgroundColor: theme.backgroundSelected, borderRadius: 10 } : undefined}>
      <View style={[styles.row, done && styles.rowDone]}>
        <ThemedText type="smallBold" themeColor="textSecondary" style={styles.number}>
          {set.setNumber}
        </ThemedText>
        {/* Ćwiczenie jednostronne ma dwa wiersze na serię — ten znacznik mówi, który jest który. */}
        {set.side && (
          <ThemedText
            type="smallBold"
            style={[styles.side, { color: theme.accent }]}
            accessibilityLabel={sideNames[set.side]}>
            {sideLabels[set.side]}
          </ThemedText>
        )}

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

        {/*
          Odliczanie serii na czas odpala duży „play” na belce u góry ekranu — w wierszu zostaje
          sam znacznik, która seria właśnie leci. Wpisanie czasu ręcznie nadal działa.
        */}
        {timed && !done && isTiming && (
          <View accessibilityLabel="Odliczanie trwa">
            <Icon name="hourglass_top" size={22} color={theme.accent} />
          </View>
        )}

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

      {/* Ocena wysiłku ma sens dopiero po wykonaniu serii — i pozostaje opcjonalna. */}
      {done && (
        <View style={styles.rpe}>
          <RpeField
            value={set.rpe}
            onChange={(rpe) => {
              onEdit({ rpe });
              onEditEnd();
            }}
          />
        </View>
      )}
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
  rpe: { paddingHorizontal: Spacing.one, paddingBottom: Spacing.one },
  number: { width: 18, textAlign: 'center' },
  side: { width: 14, textAlign: 'center' },
});
