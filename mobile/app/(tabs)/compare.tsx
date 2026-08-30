import React, { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useCompare, useFunds } from '../../src/api/hooks';
import { NavChart, type ChartSeries } from '../../src/components/NavChart';
import { Card, ErrorState, LoadingState, SegmentedControl } from '../../src/components/ui';
import { theme, SERIES_COLORS, returnColor } from '../../src/theme';
import { formatPercent } from '../../src/format';
import type { Period } from '../../src/api/types';

const PERIODS = [
  { value: '3m' as const, label: '3M' },
  { value: '6m' as const, label: '6M' },
  { value: '1y' as const, label: '1Y' },
  { value: '3y' as const, label: '3Y' },
  { value: '5y' as const, label: '5Y' },
];

const MAX_SELECTION = 6;

/**
 * Side-by-side performance. The server rebases every series to 100 at the
 * start of the window, so funds with very different NAV levels can be read
 * off the same axis.
 *
 * The chart is pinned above the picker rather than sitting inside the same
 * scroll view: with 25 funds to choose from, a scrolling chart would be off
 * screen exactly when you are toggling the funds it draws.
 */
export default function CompareScreen() {
  const [period, setPeriod] = useState<Period>('1y');
  const [selected, setSelected] = useState<string[]>([]);

  const { data: funds, isLoading, error, refetch } = useFunds();
  const comparison = useCompare(selected, period);

  const toggle = (slug: string) => {
    setSelected((current) =>
      current.includes(slug)
        ? current.filter((s) => s !== slug)
        : current.length >= MAX_SELECTION
          ? current
          : [...current, slug],
    );
  };

  if (isLoading) return <LoadingState label="Loading funds…" />;
  if (error) {
    return <ErrorState message={(error as Error).message} onRetry={() => void refetch()} />;
  }

  const chartSeries: ChartSeries[] =
    comparison.data?.funds.map((fund, index) => ({
      label: fund.name,
      color: SERIES_COLORS[index % SERIES_COLORS.length]!,
      points: fund.series,
    })) ?? [];

  return (
    <View style={styles.screen}>
      <View style={styles.pinned}>
        <SegmentedControl options={PERIODS} value={period} onChange={setPeriod} />
        <Card style={styles.chartCard}>
          {selected.length === 0 ? (
            <Text style={styles.hint}>
              Pick up to {MAX_SELECTION} funds below. All lines start at 100 so
              relative performance is directly comparable.
            </Text>
          ) : comparison.isLoading ? (
            <View style={styles.chartPlaceholder}>
              <LoadingState label="Building comparison…" />
            </View>
          ) : comparison.error ? (
            <Text style={styles.error}>{(comparison.error as Error).message}</Text>
          ) : (
            <>
              <NavChart series={chartSeries} height={190} fill={false} valueLabel="rebased to 100" />
              <View style={styles.legend}>
                {comparison.data?.funds.map((fund, index) => (
                  <Pressable
                    key={fund.id}
                    onPress={() => toggle(fund.slug)}
                    style={styles.legendRow}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${fund.name} from comparison`}
                  >
                    <View
                      style={[
                        styles.swatch,
                        { backgroundColor: SERIES_COLORS[index % SERIES_COLORS.length] },
                      ]}
                    />
                    <Text style={styles.legendName} numberOfLines={1}>
                      {fund.name.replace('PNB MetLife ', '')}
                    </Text>
                    <Text style={[styles.legendValue, { color: returnColor(fund.changePct) }]}>
                      {formatPercent(fund.changePct)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}
        </Card>
      </View>

      <FlatList
        data={funds ?? []}
        keyExtractor={(fund) => String(fund.id)}
        contentContainerStyle={styles.pickList}
        ListHeaderComponent={
          <Text style={styles.sectionTitle}>
            Select funds ({selected.length}/{MAX_SELECTION})
          </Text>
        }
        renderItem={({ item: fund }) => {
          const active = selected.includes(fund.slug);
          const atLimit = !active && selected.length >= MAX_SELECTION;
          return (
            <Pressable
              onPress={() => toggle(fund.slug)}
              disabled={atLimit}
              style={[styles.pickRow, active && styles.pickRowActive, atLimit && styles.pickRowDisabled]}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: active, disabled: atLimit }}
            >
              <View style={[styles.checkbox, active && styles.checkboxActive]}>
                {active && <Text style={styles.checkmark}>✓</Text>}
              </View>
              <Text style={styles.pickName} numberOfLines={1}>
                {fund.name.replace('PNB MetLife ', '')}
              </Text>
              <Text style={[styles.pickReturn, { color: returnColor(fund.returns.y1) }]}>
                {formatPercent(fund.returns.y1)}
              </Text>
            </Pressable>
          );
        }}
        ItemSeparatorComponent={() => <View style={{ height: theme.space(2) }} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.color.bg },
  pinned: {
    padding: theme.space(4),
    paddingBottom: theme.space(2),
    gap: theme.space(3),
    borderBottomWidth: 1,
    borderBottomColor: theme.color.border,
  },
  chartCard: { padding: theme.space(3) },
  chartPlaceholder: { height: 190, justifyContent: 'center' },
  hint: {
    color: theme.color.textMuted,
    fontSize: theme.font.small,
    lineHeight: 20,
    textAlign: 'center',
    paddingVertical: theme.space(10),
  },
  error: {
    color: theme.color.negative,
    fontSize: theme.font.small,
    textAlign: 'center',
    paddingVertical: theme.space(10),
  },
  legend: { marginTop: theme.space(2), gap: theme.space(1) },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: theme.space(2) },
  swatch: { width: 10, height: 10, borderRadius: 3 },
  legendName: { color: theme.color.textMuted, fontSize: theme.font.small, flex: 1 },
  legendValue: { fontSize: theme.font.small, fontWeight: '700' },
  sectionTitle: {
    color: theme.color.textFaint,
    fontSize: theme.font.tiny,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: theme.space(2),
  },
  pickList: { padding: theme.space(4), paddingTop: theme.space(3), paddingBottom: theme.space(8) },
  pickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space(3),
    backgroundColor: theme.color.surface,
    borderWidth: 1,
    borderColor: theme.color.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.space(3),
    paddingVertical: theme.space(3),
  },
  pickRowActive: { borderColor: theme.color.accent },
  pickRowDisabled: { opacity: 0.4 },
  checkbox: {
    width: 20, height: 20, borderRadius: 6,
    borderWidth: 1.5, borderColor: theme.color.border,
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxActive: { backgroundColor: theme.color.accent, borderColor: theme.color.accent },
  checkmark: { color: '#06122B', fontSize: 13, fontWeight: '900' },
  pickName: { color: theme.color.text, fontSize: theme.font.small, flex: 1 },
  pickReturn: { fontSize: theme.font.small, fontWeight: '700' },
});
