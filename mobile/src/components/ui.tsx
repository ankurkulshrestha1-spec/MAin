import React from 'react';
import {
  ActivityIndicator, Pressable, StyleSheet, Text, View, ViewStyle,
} from 'react-native';
import { theme, CATEGORY_COLOR, CATEGORY_LABEL, returnColor } from '../theme';
import { formatPercent } from '../format';

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function CategoryPill({ category }: { category: string }) {
  const color = CATEGORY_COLOR[category] ?? theme.color.neutral;
  return (
    <View style={[styles.pill, { backgroundColor: `${color}22`, borderColor: `${color}55` }]}>
      <Text style={[styles.pillText, { color }]}>
        {CATEGORY_LABEL[category] ?? category}
      </Text>
    </View>
  );
}

/** Rank badge — top-quartile funds are highlighted, the rest stay neutral. */
export function RankBadge({ rank, size }: { rank: number | null; size?: number }) {
  if (rank === null) return null;
  const isStrong = size ? rank <= Math.max(1, Math.ceil(size / 4)) : rank <= 3;
  const color = isStrong ? theme.color.positive : theme.color.textMuted;
  return (
    <View style={[styles.pill, { backgroundColor: `${color}1A`, borderColor: `${color}44` }]}>
      <Text style={[styles.pillText, { color }]}>
        #{rank}{size ? ` of ${size}` : ''}
      </Text>
    </View>
  );
}

export function ReturnText({
  value, size = theme.font.body, bold = true,
}: { value: number | null; size?: number; bold?: boolean }) {
  return (
    <Text style={{ color: returnColor(value), fontSize: size, fontWeight: bold ? '700' : '500' }}>
      {formatPercent(value)}
    </Text>
  );
}

export function Stat({
  label, value, color,
}: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, color ? { color } : null]}>{value}</Text>
    </View>
  );
}

export function SegmentedControl<T extends string>({
  options, value, onChange,
}: {
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.segment}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            style={[styles.segmentItem, active && styles.segmentItemActive]}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <View style={styles.centered}>
      <ActivityIndicator color={theme.color.accent} />
      <Text style={styles.centeredText}>{label}</Text>
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={styles.centered}>
      <Text style={styles.errorTitle}>Something went wrong</Text>
      <Text style={styles.centeredText}>{message}</Text>
      {onRetry && (
        <Pressable onPress={onRetry} style={styles.button}>
          <Text style={styles.buttonText}>Try again</Text>
        </Pressable>
      )}
    </View>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <View style={styles.centered}>
      <Text style={styles.errorTitle}>{title}</Text>
      <Text style={styles.centeredText}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.color.border,
    padding: theme.space(4),
  },
  pill: {
    paddingHorizontal: theme.space(2),
    paddingVertical: theme.space(1),
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  pillText: { fontSize: theme.font.tiny, fontWeight: '700' },
  stat: { flex: 1, minWidth: 84 },
  statLabel: {
    color: theme.color.textFaint,
    fontSize: theme.font.tiny,
    marginBottom: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statValue: { color: theme.color.text, fontSize: theme.font.body, fontWeight: '600' },
  segment: {
    flexDirection: 'row',
    backgroundColor: theme.color.surfaceRaised,
    borderRadius: theme.radius.md,
    padding: 3,
    gap: 2,
  },
  segmentItem: {
    flex: 1,
    paddingVertical: theme.space(1.5),
    borderRadius: theme.radius.sm,
    alignItems: 'center',
  },
  segmentItemActive: { backgroundColor: theme.color.accent },
  segmentText: { color: theme.color.textMuted, fontSize: theme.font.small, fontWeight: '600' },
  segmentTextActive: { color: '#06122B' },
  centered: { alignItems: 'center', justifyContent: 'center', padding: theme.space(8), gap: theme.space(2) },
  centeredText: { color: theme.color.textMuted, fontSize: theme.font.small, textAlign: 'center' },
  errorTitle: { color: theme.color.text, fontSize: theme.font.title, fontWeight: '700' },
  button: {
    marginTop: theme.space(2),
    backgroundColor: theme.color.accent,
    paddingHorizontal: theme.space(5),
    paddingVertical: theme.space(2.5),
    borderRadius: theme.radius.md,
  },
  buttonText: { color: '#06122B', fontWeight: '700', fontSize: theme.font.body },
});
