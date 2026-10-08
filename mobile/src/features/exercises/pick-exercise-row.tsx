import { StyleSheet, View } from 'react-native';

import { ExerciseRow } from '@/components/exercise-row';
import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { ExerciseLink } from '@/features/exercises/exercise-link';
import type { ExerciseListItem } from '@/features/exercises/filter';
import { useTheme } from '@/hooks/use-theme';

type PickExerciseRowProps = {
  item: ExerciseListItem;
  /** Miejsce w kolejności zaznaczania, liczone od 1. Null = niezaznaczone. */
  position: number | null;
  onToggle: () => void;
};

/**
 * Wiersz na ekranach wyboru ćwiczenia: dotknięcie zaznacza i pokazuje numer kolejności,
 * a ikona obok prowadzi do opisu — stąd osobne dotknięcie, a nie cały wiersz.
 */
export function PickExerciseRow({ item, position, onToggle }: PickExerciseRowProps) {
  const theme = useTheme();
  return (
    <ExerciseRow
      item={item}
      onPress={onToggle}
      accessory={
        <View style={styles.accessory}>
          <ExerciseLink exerciseId={item.id} name={item.name} />
          {position === null ? (
            <Icon name="radio_button_unchecked" size={24} color={theme.textSecondary} />
          ) : (
            <View style={[styles.badge, { backgroundColor: theme.accent }]}>
              <ThemedText type="smallBold" style={{ color: theme.onAccent }}>
                {position}
              </ThemedText>
            </View>
          )}
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  accessory: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  badge: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
