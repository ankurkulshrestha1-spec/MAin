/**
 * Dark palette tuned for reading numbers at a glance. Gains and losses use
 * India's market convention — green for up, red for down — with hues that
 * stay distinguishable for the most common forms of colour vision deficiency.
 */
export const theme = {
  color: {
    bg: '#0B1220',
    surface: '#131C2E',
    surfaceRaised: '#1B2740',
    border: '#25324D',
    text: '#EEF2F9',
    textMuted: '#93A1BD',
    textFaint: '#64748B',
    accent: '#5B9DF9',
    positive: '#34D399',
    negative: '#F87171',
    neutral: '#94A3B8',
    warning: '#FBBF24',
  },
  space: (n: number) => n * 4,
  radius: { sm: 8, md: 12, lg: 16, pill: 999 },
  font: {
    display: 30,
    title: 20,
    body: 15,
    small: 13,
    tiny: 11,
  },
} as const;

export const CATEGORY_LABEL: Record<string, string> = {
  equity: 'Equity',
  index: 'Index',
  balanced: 'Balanced',
  debt: 'Debt',
  liquid: 'Liquid',
};

export const CATEGORY_COLOR: Record<string, string> = {
  equity: '#5B9DF9',
  index: '#A78BFA',
  balanced: '#34D399',
  debt: '#FBBF24',
  liquid: '#38BDF8',
};

/** Distinct series colours for the compare chart. */
export const SERIES_COLORS = [
  '#5B9DF9', '#34D399', '#FBBF24', '#F87171', '#A78BFA', '#38BDF8',
];

export function returnColor(value: number | null | undefined): string {
  if (value === null || value === undefined) return theme.color.textFaint;
  if (value > 0) return theme.color.positive;
  if (value < 0) return theme.color.negative;
  return theme.color.neutral;
}
