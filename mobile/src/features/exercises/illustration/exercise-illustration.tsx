import { useMemo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';

import { ThemedText } from '@/components/themed-text';
import { buildPanels, type Illustration, type Tone } from '@/features/exercises/illustration/figure';
import { useTheme } from '@/hooks/use-theme';

type ExerciseIllustrationProps = {
  illustration: Illustration;
  style?: StyleProp<ViewStyle>;
};

/**
 * Rysunek poglądowy ćwiczenia: osobny obrazek na każdą fazę ruchu, podpisany tym, co pokazuje.
 * Sylwetka jest wypełniona, sprzęt niebieski, pracująca partia czerwona, a strzałka wskazuje
 * kierunek — ten sam klucz na wszystkich rysunkach.
 */
export function ExerciseIllustration({ illustration, style }: ExerciseIllustrationProps) {
  const theme = useTheme();
  const { panels, viewBox } = useMemo(() => buildPanels(illustration), [illustration]);

  const pen: Record<Tone, { color: string; width: number; opacity: number }> = {
    figure: { color: theme.text, width: 2.4, opacity: 1 },
    ghost: { color: theme.textSecondary, width: 2, opacity: 0.5 },
    gear: { color: theme.chart1, width: 2.4, opacity: 1 },
    ghostGear: { color: theme.chart1, width: 2, opacity: 0.35 },
    scene: { color: theme.textSecondary, width: 1.4, opacity: 0.55 },
    arrow: { color: theme.accent, width: 2.2, opacity: 1 },
    // Sylwetka pełna: grubość obrysu i wypełnienia niesie sam kształt, nie pióro.
    bodyInk: { color: theme.text, width: 2, opacity: 1 },
    bodyFill: { color: theme.backgroundSelected, width: 2, opacity: 1 },
    bodyFar: { color: theme.backgroundElement, width: 2, opacity: 1 },
    work: { color: theme.accent, width: 2, opacity: 1 },
  };

  return (
    <View style={[styles.frame, style]}>
      {panels.map((panel) => (
        <View key={panel.caption} style={styles.panel}>
          <Svg viewBox={viewBox} style={styles.canvas}>
            {panel.shapes.map((shape, index) => {
              const { color, opacity } = pen[shape.tone];
              const width = ('width' in shape ? shape.width : undefined) ?? pen[shape.tone].width;
              const stroke = {
                stroke: color,
                strokeWidth: width,
                strokeOpacity: opacity,
                strokeLinecap: 'round',
              } as const;
              if (shape.shape === 'line') {
                return (
                  <Line key={index} x1={shape.from.x} y1={shape.from.y} x2={shape.to.x} y2={shape.to.y} {...stroke} />
                );
              }
              if (shape.shape === 'circle') {
                return (
                  <Circle
                    key={index}
                    cx={shape.at.x}
                    cy={shape.at.y}
                    r={shape.r}
                    fill={shape.filled ? color : 'none'}
                    fillOpacity={opacity}
                    {...stroke}
                  />
                );
              }
              return <Path key={index} d={shape.d} fill="none" {...stroke} />;
            })}
          </Svg>
          <ThemedText type="small" themeColor="textSecondary" style={styles.caption}>
            {panel.caption}
          </ThemedText>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { flex: 1, alignSelf: 'stretch', flexDirection: 'row', padding: 8, gap: 4 },
  panel: { flex: 1, gap: 2 },
  canvas: { flex: 1 },
  caption: { textAlign: 'center' },
});
