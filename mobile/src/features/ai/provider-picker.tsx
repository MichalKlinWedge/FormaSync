import { StyleSheet, View } from 'react-native';

import { Chip } from '@/components/chip';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

import { PROVIDER_LABELS, type Provider } from './providers';

/**
 * Wybór modelu na jedno zapytanie.
 *
 * Pokazuje się dopiero przy dwóch skonfigurowanych dostawcach: przy jednym nie ma czego wybierać,
 * a rząd z jednym znacznikiem udawałby decyzję, której nie ma. Wybór dotyczy tego zapytania —
 * domyślny dostawca zostaje tam, gdzie go ustawiono.
 */
export function ProviderPicker({
  configured,
  value,
  onChange,
  label = 'CZYM ZAPYTAĆ',
}: {
  configured: Provider[];
  value: Provider;
  onChange: (provider: Provider) => void;
  label?: string;
}) {
  if (configured.length < 2) return null;

  return (
    <View style={styles.section}>
      <ThemedText type="smallBold" themeColor="textSecondary">
        {label}
      </ThemedText>
      <View style={styles.chips}>
        {configured.map((provider) => (
          <Chip
            key={provider}
            label={PROVIDER_LABELS[provider]}
            selected={provider === value}
            onPress={() => onChange(provider)}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: Spacing.two },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
});
