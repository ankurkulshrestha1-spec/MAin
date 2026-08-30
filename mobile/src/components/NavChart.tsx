import React, { useMemo, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Stop, Text as SvgText } from 'react-native-svg';
import { theme } from '../theme';
import { formatDateShort } from '../format';
import type { NavPoint } from '../api/types';

export interface ChartSeries {
  label: string;
  color: string;
  points: NavPoint[];
  /** Draws as a dashed line — used for the benchmark. */
  dashed?: boolean;
}

interface Props {
  series: ChartSeries[];
  height?: number;
  /** Fills the area under the first series. Off for multi-series comparisons. */
  fill?: boolean;
  /** Y-axis unit suffix, e.g. '' for NAV or ' (=100)' for rebased series. */
  valueLabel?: string;
}

const PADDING = { top: 12, right: 8, bottom: 24, left: 46 };

/**
 * Line chart drawn directly in SVG.
 *
 * Written by hand rather than pulled from a charting library because the app
 * needs exactly one chart type and the libraries that render well on the new
 * React Native architecture all pull in Skia. Scales are linear; the y-axis is
 * padded to the data range rather than anchored at zero, since a NAV series
 * that moves from 68 to 70 would otherwise render as a flat line.
 */
export function NavChart({ series, height = 220, fill = true, valueLabel = '' }: Props) {
  const [width, setWidth] = useState(0);
  const onLayout = (event: LayoutChangeEvent) =>
    setWidth(event.nativeEvent.layout.width);

  const model = useMemo(() => {
    const withData = series.filter((s) => s.points.length > 1);
    if (!withData.length || width === 0) return null;

    const allValues = withData.flatMap((s) => s.points.map((p) => p.nav));
    const min = Math.min(...allValues);
    const max = Math.max(...allValues);
    // Guard a perfectly flat series, which would give a zero-height range.
    const span = max - min || Math.max(Math.abs(max) * 0.02, 0.01);
    const yMin = min - span * 0.08;
    const yMax = max + span * 0.08;

    const plotWidth = Math.max(width - PADDING.left - PADDING.right, 1);
    const plotHeight = Math.max(height - PADDING.top - PADDING.bottom, 1);

    // All series share the first series' date axis so lines stay aligned even
    // when a benchmark has a slightly different number of observations.
    const reference = withData[0]!.points;
    const startDate = reference[0]!.date;
    const endDate = reference[reference.length - 1]!.date;
    const toMs = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
    const t0 = toMs(startDate);
    const tSpan = toMs(endDate) - t0 || 1;

    const x = (iso: string) => PADDING.left + ((toMs(iso) - t0) / tSpan) * plotWidth;
    const y = (value: number) =>
      PADDING.top + (1 - (value - yMin) / (yMax - yMin)) * plotHeight;

    const paths = withData.map((s) => {
      const d = s.points
        .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.date).toFixed(2)},${y(p.nav).toFixed(2)}`)
        .join(' ');
      const last = s.points[s.points.length - 1]!;
      return {
        ...s,
        d,
        area: `${d} L${x(last.date).toFixed(2)},${(PADDING.top + plotHeight).toFixed(2)} L${x(s.points[0]!.date).toFixed(2)},${(PADDING.top + plotHeight).toFixed(2)} Z`,
        lastX: x(last.date),
        lastY: y(last.nav),
      };
    });

    // Four gridlines is enough to read a value off without crowding a phone.
    const ticks = Array.from({ length: 4 }, (_, i) => {
      const value = yMin + ((yMax - yMin) * i) / 3;
      return { value, y: y(value) };
    });

    const midDate = reference[Math.floor(reference.length / 2)]!.date;

    return { paths, ticks, startDate, midDate, endDate, x, plotWidth, plotHeight };
  }, [series, width, height]);

  return (
    <View onLayout={onLayout}>
      {valueLabel ? <Text style={styles.axisLabel}>{valueLabel}</Text> : null}
      {model === null ? (
        <View style={[styles.empty, { height }]}>
          <Text style={styles.emptyText}>
            {width === 0 ? '' : 'Not enough NAV history to chart yet'}
          </Text>
        </View>
      ) : (
        <Svg width={width} height={height}>
          <Defs>
            <LinearGradient id="fillGradient" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={series[0]?.color ?? theme.color.accent} stopOpacity="0.28" />
              <Stop offset="1" stopColor={series[0]?.color ?? theme.color.accent} stopOpacity="0" />
            </LinearGradient>
          </Defs>

          <G>
            {model.ticks.map((tick) => (
              <G key={tick.value}>
                <Line
                  x1={PADDING.left}
                  y1={tick.y}
                  x2={width - PADDING.right}
                  y2={tick.y}
                  stroke={theme.color.border}
                  strokeWidth={1}
                />
                <SvgText
                  x={PADDING.left - 6}
                  y={tick.y + 4}
                  fill={theme.color.textFaint}
                  fontSize={10}
                  textAnchor="end"
                >
                  {tick.value.toFixed(2)}
                </SvgText>
              </G>
            ))}
          </G>

          {fill && model.paths[0] && (
            <Path d={model.paths[0].area} fill="url(#fillGradient)" />
          )}

          {model.paths.map((path) => (
            <G key={path.label}>
              <Path
                d={path.d}
                stroke={path.color}
                strokeWidth={2}
                fill="none"
                strokeLinejoin="round"
                strokeLinecap="round"
                strokeDasharray={path.dashed ? '5,4' : undefined}
              />
              {!path.dashed && (
                <Circle cx={path.lastX} cy={path.lastY} r={3.5} fill={path.color} />
              )}
            </G>
          ))}

          {[
            { date: model.startDate, anchor: 'start' as const },
            { date: model.midDate, anchor: 'middle' as const },
            { date: model.endDate, anchor: 'end' as const },
          ].map((tick) => (
            <SvgText
              key={`${tick.date}-${tick.anchor}`}
              x={model.x(tick.date)}
              y={height - 8}
              fill={theme.color.textFaint}
              fontSize={10}
              textAnchor={tick.anchor}
            >
              {formatDateShort(tick.date)}
            </SvgText>
          ))}
        </Svg>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: theme.color.textFaint, fontSize: theme.font.small },
  axisLabel: {
    color: theme.color.textFaint,
    fontSize: theme.font.tiny,
    textAlign: 'right',
    marginBottom: 2,
  },
});
