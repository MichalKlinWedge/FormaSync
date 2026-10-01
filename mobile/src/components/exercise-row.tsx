import { Image } from 'expo-image';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import type { ExerciseListItem } from '@/features/exercises/filter';
import { difficultyShortLabels } from '@/features/exercises/labels';
import { useTheme } from '@/hooks/use-theme';

type ExerciseRowProps = {
  item: ExerciseListItem;
  onPress: () => void;
  /** Element po prawej stronie; domyślnie strzałka. */
  accessory?: ReactNode;
};

export function ExerciseRow({ item, onPress, accessory }: ExerciseRowProps) {
  const theme = useTheme();
  const subtitle = [
    item.categoryName,
    item.equipmentName,
    item.difficultyLevel && difficultyShortLabels[item.difficultyLevel],
    item.isCustom && 'własne',
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, { borderBottomColor: theme.border, opacity: pressed ? 0.6 : 1 }]}>
      <ThemedView type="backgroundElement" style={styles.thumb}>
        {item.imageUrl ? (
          <Image source={{ uri: item.imageUrl }} style={styles.thumbImage} contentFit="cover" />
        ) : (
          <Icon name="fitness_center" size={22} color={theme.textSecondary} />
        )}
      </ThemedView>
      <View style={styles.text}>
        <ThemedText numberOfLines={1}>{item.name}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {subtitle}
        </ThemedText>
      </View>
      {accessory ?? <Icon name="chevron_right" size={20} color={theme.textSecondary} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.two + Spacing.one,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  thumb: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  thumbImage: { width: '100%', height: '100%' },
  text: { flex: 1 },
});
