import React from 'react';

import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';

import { ChartFrame } from '@/components/charts/chart-frame';
import { useTheme } from '@/hooks/use-theme';

export type LineSeries = {
  name: string;
  color: string;
  /** Punkty w kolejności chronologicznej; wartość null oznacza brak pomiaru. */
  values: (number | null)[];
};

type LineChartProps = {
  labels: string[];
  series: LineSeries[];
  height?: number;
  formatValue: (value: number) => string;
  emptyMessage?: string;
};

const AXIS_WIDTH = 46;
const LABEL_BAND = 18;
const RIGHT_PAD = 8;
const TOP_PAD = 14;

/**
 * Wykres liniowy dla jednej lub dwóch serii na wspólnej osi wartości (nigdy dwie osie).
 * Punkt końcowy każdej serii jest podpisany — dzięki temu wartość da się odczytać bez
 * dotykania wykresu, czego wymaga też słabszy kontrast pomarańczowego w trybie jasnym.
 */
export function LineChart({ labels, series, height = 180, formatValue, emptyMessage }: LineChartProps) {
  const theme = useTheme();
  const all = series.flatMap((s) => s.values.filter((v): v is number => v !== null));
  const hasData = all.length >= 2 && labels.length >= 2;
  const min = Math.min(...all);
  const max = Math.max(...all);
  // Płaska seria dostaje sztuczny zakres, żeby linia nie przywarła do krawędzi.
  const span = max - min || Math.max(max * 0.1, 1);
  const low = min - span * 0.1;
  const high = max + span * 0.1;

  return (
    <ChartFrame
      isEmpty={!hasData}
      emptyMessage={emptyMessage}
      legend={series.map((s) => ({ name: s.name, color: s.color }))}>
      {(width) => {
        const plotWidth = width - AXIS_WIDTH - RIGHT_PAD;
        const plotHeight = height - LABEL_BAND - TOP_PAD;
        const x = (index: number) =>
          AXIS_WIDTH + (labels.length === 1 ? plotWidth / 2 : (index / (labels.length - 1)) * plotWidth);
        const y = (value: number) => TOP_PAD + plotHeight - ((value - low) / (high - low)) * plotHeight;

        return (
          <Svg width={width} height={height}>
            {[low, (low + high) / 2, high].map((tick) => (
              <Line
                key={tick}
                x1={AXIS_WIDTH}
                x2={width - RIGHT_PAD}
                y1={y(tick)}
                y2={y(tick)}
                stroke={theme.border}
                strokeWidth={1}
              />
            ))}
            {[high, low].map((tick) => (
              <SvgText
                key={tick}
                x={AXIS_WIDTH - 6}
                y={y(tick) + 4}
                fontSize={10}
                fill={theme.textSecondary}
                textAnchor="end">
                {formatValue(tick)}
              </SvgText>
            ))}

            {series.map((s) => {
              const points = s.values
                .map((value, index) => (value === null ? null : { x: x(index), y: y(value) }))
                .filter((p): p is { x: number; y: number } => p !== null);
              if (points.length === 0) return null;
              const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join(' ');
              const last = points[points.length - 1];
              const lastValue = [...s.values].reverse().find((v): v is number => v !== null)!;

              return (
                <React.Fragment key={s.name}>
                  <Path d={path} stroke={s.color} strokeWidth={2} fill="none" strokeLinejoin="round" />
                  {points.length <= 12 &&
                    points.map((p) => (
                      <Circle
                        key={`${s.name}-${p.x}`}
                        cx={p.x}
                        cy={p.y}
                        r={4}
                        fill={s.color}
                        stroke={theme.backgroundElement}
                        strokeWidth={2}
                      />
                    ))}
                  <SvgText
                    x={last.x}
                    y={Math.max(last.y - 8, 10)}
                    fontSize={10}
                    fill={theme.text}
                    textAnchor="end">
                    {formatValue(lastValue)}
                  </SvgText>
                </React.Fragment>
              );
            })}

            {[0, labels.length - 1].map((index) => (
              <SvgText
                key={`x-${index}`}
                x={x(index)}
                y={height - 4}
                fontSize={10}
                fill={theme.textSecondary}
                textAnchor={index === 0 ? 'start' : 'end'}>
                {labels[index]}
              </SvgText>
            ))}
          </Svg>
        );
      }}
    </ChartFrame>
  );
}
