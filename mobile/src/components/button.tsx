import { Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  icon?: Parameters<typeof Icon>[0]['name'];
  disabled?: boolean;
};

export function Button({ label, onPress, variant = 'primary', icon, disabled }: ButtonProps) {
  const theme = useTheme();
  const background = variant === 'primary' ? theme.accent : theme.backgroundElement;
  const foreground = variant === 'primary' ? theme.onAccent : variant === 'danger' ? theme.accent : theme.text;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: background, opacity: disabled ? 0.4 : pressed ? 0.7 : 1 },
      ]}>
      <View style={styles.content}>
        {icon && <Icon name={icon} size={20} color={foreground} />}
        <ThemedText type="smallBold" style={{ color: foreground }}>
          {label}
        </ThemedText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { borderRadius: 12, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two + Spacing.one },
  content: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.two },
});
