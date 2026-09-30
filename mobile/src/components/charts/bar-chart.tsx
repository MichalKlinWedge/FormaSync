import Svg, { Line, Rect, Text as SvgText } from 'react-native-svg';

import { ChartFrame } from '@/components/charts/chart-frame';
import { useTheme } from '@/hooks/use-theme';

export type BarDatum = { label: string; value: number };

type BarChartProps = {
  data: BarDatum[];
  height?: number;
  /** Etykieta wartości dla osi i wyróżnionego słupka. */
  formatValue: (value: number) => string;
  emptyMessage?: string;
};

const AXIS_WIDTH = 42;
const LABEL_BAND = 18;
const BAR_GAP = 2;
const RADIUS = 4;

/**
 * Pionowe słupki dla jednej serii — bez legendy, z podpisem tylko przy najwyższym słupku.
 * Siatka to dwie cienkie, ciągłe linie; oś wartości opisana skrótowo.
 */
export function BarChart({ data, height = 160, formatValue, emptyMessage }: BarChartProps) {
  const theme = useTheme();
  const max = Math.max(...data.map((d) => d.value), 0);

  return (
    <ChartFrame isEmpty={data.length === 0 || max === 0} emptyMessage={emptyMessage}>
      {(width) => {
        const plotWidth = width - AXIS_WIDTH;
        const plotHeight = height - LABEL_BAND;
        const slot = plotWidth / data.length;
        const barWidth = Math.max(slot - BAR_GAP, 2);
        const peakIndex = data.reduce((best, d, i) => (d.value > data[best].value ? i : best), 0);
        const scale = (value: number) => plotHeight - (value / max) * (plotHeight - 12);

        return (
          <Svg width={width} height={height}>
            {[0, max / 2, max].map((tick) => (
              <Line
                key={tick}
                x1={AXIS_WIDTH}
                x2={width}
                y1={scale(tick)}
                y2={scale(tick)}
                stroke={theme.border}
                strokeWidth={1}
              />
            ))}
            {[max, max / 2].map((tick) => (
              <SvgText
                key={tick}
                x={AXIS_WIDTH - 6}
                y={scale(tick) + 4}
                fontSize={10}
                fill={theme.textSecondary}
                textAnchor="end">
                {formatValue(tick)}
              </SvgText>
            ))}

            {data.map((datum, index) => {
              const x = AXIS_WIDTH + index * slot + BAR_GAP / 2;
              const y = scale(datum.value);
              const barHeight = plotHeight - y;
              return (
                <Rect
                  key={datum.label}
                  x={x}
                  y={y}
                  width={barWidth}
                  height={Math.max(barHeight, datum.value > 0 ? 2 : 0)}
                  rx={Math.min(RADIUS, barWidth / 2)}
                  fill={theme.chart1}
                />
              );
            })}

            {/* Podpisujemy tylko skrajny słupek — liczba przy każdym byłaby nieczytelna. */}
            <SvgText
              x={AXIS_WIDTH + peakIndex * slot + barWidth / 2 + BAR_GAP / 2}
              y={Math.max(scale(data[peakIndex].value) - 4, 10)}
              fontSize={10}
              fill={theme.text}
              textAnchor="middle">
              {formatValue(data[peakIndex].value)}
            </SvgText>

            {data.map((datum, index) =>
              index === 0 || index === data.length - 1 || index === peakIndex ? (
                <SvgText
                  key={`x-${datum.label}`}
                  x={AXIS_WIDTH + index * slot + barWidth / 2 + BAR_GAP / 2}
                  y={height - 4}
                  fontSize={10}
                  fill={theme.textSecondary}
                  textAnchor={index === 0 ? 'start' : index === data.length - 1 ? 'end' : 'middle'}>
                  {datum.label}
                </SvgText>
              ) : null,
            )}
          </Svg>
        );
      }}
    </ChartFrame>
  );
}
