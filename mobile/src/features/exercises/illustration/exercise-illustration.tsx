import { useMemo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';

import { buildIllustration, type Illustration, type Tone } from '@/features/exercises/illustration/figure';
import { useTheme } from '@/hooks/use-theme';

type ExerciseIllustrationProps = {
  illustration: Illustration;
  style?: StyleProp<ViewStyle>;
};

/**
 * Rysunek poglądowy ćwiczenia. Pozycja wyjściowa jest szara, końcowa czarna, sprzęt niebieski,
 * a strzałka pokazuje kierunek ruchu — ten sam klucz kolorów na wszystkich rysunkach.
 */
export function ExerciseIllustration({ illustration, style }: ExerciseIllustrationProps) {
  const theme = useTheme();
  const { shapes, viewBox } = useMemo(() => buildIllustration(illustration), [illustration]);

  const pen: Record<Tone, { color: string; width: number; opacity: number }> = {
    figure: { color: theme.text, width: 2.4, opacity: 1 },
    ghost: { color: theme.textSecondary, width: 2, opacity: 0.5 },
    gear: { color: theme.chart1, width: 2.4, opacity: 1 },
    ghostGear: { color: theme.chart1, width: 2, opacity: 0.35 },
    scene: { color: theme.textSecondary, width: 1.4, opacity: 0.55 },
    arrow: { color: theme.accent, width: 2.2, opacity: 1 },
  };

  return (
    <View style={[styles.frame, style]}>
      <Svg width="100%" height="100%" viewBox={viewBox}>
        {shapes.map((shape, index) => {
          const { color, width, opacity } = pen[shape.tone];
          const stroke = { stroke: color, strokeWidth: width, strokeOpacity: opacity, strokeLinecap: 'round' } as const;
          if (shape.shape === 'line') {
            return <Line key={index} x1={shape.from.x} y1={shape.from.y} x2={shape.to.x} y2={shape.to.y} {...stroke} />;
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
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { flex: 1, alignSelf: 'stretch', padding: 8 },
});
