import React from 'react';
import Svg, { Path } from 'react-native-svg';
import type { NavPoint } from '../api/types';

interface Props {
  points: NavPoint[];
  color: string;
  width?: number;
  height?: number;
}

/** Minimal trend line for fund cards — no axes, no labels, just shape. */
export function Sparkline({ points, color, width = 72, height = 28 }: Props) {
  if (points.length < 2) return <Svg width={width} height={height} />;

  const values = points.map((p) => p.nav);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = width / (points.length - 1);

  const d = points
    .map((p, i) => {
      const x = i * step;
      const y = height - ((p.nav - min) / span) * (height - 3) - 1.5;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <Svg width={width} height={height}>
      <Path d={d} stroke={color} strokeWidth={1.75} fill="none" strokeLinejoin="round" />
    </Svg>
  );
}
