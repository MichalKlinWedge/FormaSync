import { type ReactNode, useState } from 'react';
import { type LayoutChangeEvent, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

type ChartFrameProps = {
  /** Rysowana zawartość dostaje zmierzoną szerokość — wykresy skalują się do ekranu. */
  children: (width: number) => ReactNode;
  legend?: { name: string; color: string }[];
  emptyMessage?: string;
  isEmpty?: boolean;
};

/**
 * Mierzy dostępną szerokość i rysuje legendę. Legenda pojawia się od dwóch serii —
 * przy jednej tytuł sekcji wystarcza, żeby wiedzieć, co przedstawia wykres.
 */
export function ChartFrame({ children, legend, emptyMessage, isEmpty }: ChartFrameProps) {
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  return (
    <View style={styles.container} onLayout={onLayout}>
      {legend && legend.length >= 2 && (
        <View style={styles.legend}>
          {legend.map((item) => (
            <View key={item.name} style={styles.legendItem}>
              <View style={[styles.swatch, { backgroundColor: item.color }]} />
              <ThemedText type="small" themeColor="textSecondary">
                {item.name}
              </ThemedText>
            </View>
          ))}
        </View>
      )}
      {isEmpty ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
          {emptyMessage ?? 'Za mało danych, żeby narysować wykres.'}
        </ThemedText>
      ) : (
        width > 0 && children(width)
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.two },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  swatch: { width: 10, height: 10, borderRadius: 3 },
  empty: { paddingVertical: Spacing.four, textAlign: 'center' },
});
