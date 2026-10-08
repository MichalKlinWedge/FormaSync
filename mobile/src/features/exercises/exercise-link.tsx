import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type ExerciseLinkProps = {
  exerciseId: number;
  name: string;
  /**
   * Nazwa ćwiczenia razem z ikoną jako jedno dotknięcie. Pomiń tam, gdzie cały wiersz ma już
   * własne dotknięcie — zostanie sama ikona, żeby nie przechwytywać tamtego gestu.
   */
  withName?: boolean;
  /** Styl tekstu nazwy, żeby odnośnik wyglądał jak nagłówek, który zastępuje. */
  textType?: 'default' | 'small' | 'smallBold';
};

/** Przejście do opisu ćwiczenia. Trasa spoza zakładek, więc „wstecz” wraca tam, skąd się weszło. */
export function ExerciseLink({ exerciseId, name, withName = false, textType = 'default' }: ExerciseLinkProps) {
  const theme = useTheme();
  const open = () => router.push({ pathname: '/exercise/[id]', params: { id: exerciseId } });

  if (!withName) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Opis ćwiczenia ${name}`}
        onPress={open}
        hitSlop={8}>
        <Icon name="info" size={20} color={theme.textSecondary} />
      </Pressable>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Opis ćwiczenia ${name}`}
      onPress={open}
      hitSlop={6}
      style={({ pressed }) => [styles.row, { opacity: pressed ? 0.6 : 1 }]}>
      <ThemedText type={textType} style={styles.name} numberOfLines={2}>
        {name}
      </ThemedText>
      <View style={styles.icon}>
        <Icon name="info" size={18} color={theme.textSecondary} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  name: { flexShrink: 1 },
  // Ikona nie ma się rozciągać ani zjeżdżać w dół przy nazwie łamanej na dwie linie.
  icon: { flexGrow: 0 },
});
