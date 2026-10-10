import { StyleSheet, View } from 'react-native';
import Svg, { Ellipse, Path } from 'react-native-svg';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { Figure, outline, regionsOf, smoothPath, type Shape, type Side } from './body';

/**
 * Mapa zaangażowanych partii mięśniowych — sylwetka od przodu i od tyłu, jak na zegarku.
 *
 * Kolor niesie całą treść, więc pod spodem jest legenda: czerwony i bursztynowy różnią się
 * jasnością, nie samym odcieniem, żeby dało się je rozróżnić także przy zaburzeniach
 * widzenia barw.
 */

/** Bursztyn mięśni pomocniczych. Czyta się i na jasnym, i na ciemnym tle, stąd jeden odcień. */
const SECONDARY = '#E8A33D';

export type MuscleMapProps = {
  /** Nazwy partii głównych — tych, wokół których zbudowane jest ćwiczenie. */
  primary: Set<string>;
  /** Partie pomocnicze; partia główna ma pierwszeństwo, gdy trafi do obu zbiorów. */
  secondary: Set<string>;
};

export function MuscleMap({ primary, secondary }: MuscleMapProps) {
  const theme = useTheme();

  const paint = (category: string): string => {
    if (primary.has(category)) return theme.accent;
    if (secondary.has(category)) return SECONDARY;
    return theme.border;
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.figures}>
        <Body side="FRONT" paint={paint} />
        <Body side="BACK" paint={paint} />
      </View>
      <View style={styles.legend}>
        <Dot color={theme.accent} label="Mięśnie główne" />
        <Dot color={SECONDARY} label="Mięśnie pomocnicze" />
        <Dot color={theme.border} label="Niezaangażowane" />
      </View>
    </View>
  );
}

function Body({ side, paint }: { side: Side; paint: (category: string) => string }) {
  const theme = useTheme();
  return (
    <Svg viewBox={`0 0 ${Figure.width} ${Figure.height}`} style={styles.figure}>
      <Path
        d={smoothPath(outline)}
        fill={theme.backgroundElement}
        stroke={theme.textSecondary}
        strokeWidth={1.1}
        strokeLinejoin="round"
      />
      {regionsOf(side).map((region) =>
        region.shapes.map((shape, index) => (
          <Muscle key={`${region.category}-${index}`} shape={shape} fill={paint(region.category)} />
        )),
      )}
    </Svg>
  );
}

function Muscle({ shape, fill }: { shape: Shape; fill: string }) {
  if (shape.kind === 'ellipse') {
    return (
      <Ellipse
        cx={shape.cx}
        cy={shape.cy}
        rx={shape.rx}
        ry={shape.ry}
        fill={fill}
        origin={`${shape.cx}, ${shape.cy}`}
        rotation={shape.rotate ?? 0}
      />
    );
  }
  return <Path d={smoothPath(shape.points)} fill={fill} />;
}

function Dot({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.three },
  figures: { flexDirection: 'row', justifyContent: 'center', gap: Spacing.four },
  // Proporcje figury trzyma stosunek boków — wysokość dobiera się sama do szerokości kolumny.
  figure: { flex: 1, maxWidth: 150, aspectRatio: Figure.width / Figure.height },
  legend: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: Spacing.three },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  dot: { width: 10, height: 10, borderRadius: 5 },
});
