import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useFundDetail, useSetManaged } from '../../src/api/hooks';
import { NavChart, type ChartSeries } from '../../src/components/NavChart';
import {
  Card, CategoryPill, ErrorState, LoadingState, RankBadge, SegmentedControl, Stat,
} from '../../src/components/ui';
import { theme, CATEGORY_COLOR, returnColor } from '../../src/theme';
import { formatAum, formatDate, formatNav, formatNumber, formatPercent } from '../../src/format';
import type { Period } from '../../src/api/types';

const PERIODS = [
  { value: '1m' as const, label: '1M' },
  { value: '3m' as const, label: '3M' },
  { value: '6m' as const, label: '6M' },
  { value: '1y' as const, label: '1Y' },
  { value: '3y' as const, label: '3Y' },
  { value: '5y' as const, label: '5Y' },
  { value: 'max' as const, label: 'Max' },
];

const RETURN_ROWS: Array<{ key: keyof import('../../src/api/types').FundReturns; label: string }> = [
  { key: 'd1', label: '1 day' },
  { key: 'w1', label: '1 week' },
  { key: 'm1', label: '1 month' },
  { key: 'm3', label: '3 months' },
  { key: 'm6', label: '6 months' },
  { key: 'y1', label: '1 year' },
  { key: 'y3', label: '3 years (CAGR)' },
  { key: 'y5', label: '5 years (CAGR)' },
  { key: 'y7', label: '7 years (CAGR)' },
  { key: 'sinceInception', label: 'Since inception' },
];

export default function FundDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [period, setPeriod] = useState<Period>('1y');
  const { data: fund, isLoading, error, refetch } = useFundDetail(id, period);
  const setManaged = useSetManaged();

  if (isLoading) return <LoadingState label="Loading fund…" />;
  if (error) {
    return <ErrorState message={(error as Error).message} onRetry={() => void refetch()} />;
  }
  if (!fund) return <ErrorState message="Fund not found." />;

  const accent = CATEGORY_COLOR[fund.category] ?? theme.color.accent;
  const periodChange =
    fund.series.length > 1
      ? ((fund.series[fund.series.length - 1]!.nav / fund.series[0]!.nav) - 1) * 100
      : null;

  const chartSeries: ChartSeries[] = [
    { label: fund.name, color: accent, points: fund.series },
  ];
  // The benchmark is an index level, not a NAV, so it is rescaled onto the
  // fund's starting NAV — otherwise a 24,000-point index would flatten the
  // fund's line into the axis.
  if (fund.benchmarkSeries && fund.benchmarkSeries.length > 1 && fund.series.length > 1) {
    const fundStart = fund.series[0]!.nav;
    const benchStart = fund.benchmarkSeries[0]!.nav;
    if (benchStart > 0) {
      chartSeries.push({
        label: fund.benchmark ?? 'Benchmark',
        color: theme.color.textMuted,
        dashed: true,
        points: fund.benchmarkSeries.map((p) => ({
          date: p.date,
          nav: (p.nav / benchStart) * fundStart,
        })),
      });
    }
  }

  return (
    <>
      <Stack.Screen options={{ title: fund.name.replace('PNB MetLife ', '') }} />
      <ScrollView contentContainerStyle={styles.container}>
        <Card>
          <View style={styles.badges}>
            <CategoryPill category={fund.category} />
            <RankBadge rank={fund.categoryRank} size={fund.categorySize} />
          </View>

          <Text style={styles.nav}>₹{formatNav(fund.latestNav)}</Text>
          <Text style={[styles.dayChange, { color: returnColor(fund.dayChangePct) }]}>
            {fund.dayChange !== null ? `${fund.dayChange > 0 ? '+' : ''}${formatNav(fund.dayChange)}` : '—'}
            {'  '}({formatPercent(fund.dayChangePct)}) today
          </Text>
          <Text style={styles.asOf}>NAV as of {formatDate(fund.latestNavDate)}</Text>

          <View style={styles.divider} />
          <SegmentedControl options={PERIODS} value={period} onChange={setPeriod} />

          <View style={styles.chartWrap}>
            <NavChart series={chartSeries} height={230} />
          </View>

          <View style={styles.legend}>
            <View style={styles.legendRow}>
              <View style={[styles.swatch, { backgroundColor: accent }]} />
              <Text style={styles.legendText}>
                Fund · {formatPercent(periodChange)} over {PERIODS.find((p) => p.value === period)?.label}
              </Text>
            </View>
            {chartSeries.length > 1 && (
              <View style={styles.legendRow}>
                <View style={[styles.swatchDashed]} />
                <Text style={styles.legendText}>{fund.benchmark} (rescaled)</Text>
              </View>
            )}
          </View>
        </Card>

        <Card>
          <Text style={styles.sectionTitle}>Returns</Text>
          {RETURN_ROWS.map((row) => (
            <View key={row.key} style={styles.returnRow}>
              <Text style={styles.returnLabel}>{row.label}</Text>
              <Text style={[styles.returnValue, { color: returnColor(fund.returns[row.key]) }]}>
                {formatPercent(fund.returns[row.key])}
              </Text>
            </View>
          ))}
          <Text style={styles.footnote}>
            Periods beyond one year are annualised (CAGR). A dash means the fund does not
            have enough NAV history for that window.
          </Text>
        </Card>

        <Card>
          <Text style={styles.sectionTitle}>
            Risk · over the {PERIODS.find((p) => p.value === period)?.label} window
          </Text>
          <View style={styles.statGrid}>
            <Stat label="Volatility" value={fund.risk.volatility !== null ? `${formatNumber(fund.risk.volatility)}%` : '—'} />
            <Stat
              label="Max drawdown"
              value={fund.risk.maxDrawdown !== null ? `${formatNumber(fund.risk.maxDrawdown)}%` : '—'}
              color={theme.color.negative}
            />
            <Stat label="Sharpe" value={formatNumber(fund.risk.sharpe)} />
          </View>
          <Text style={styles.footnote}>
            Annualised from {fund.risk.observations} daily NAV observations.
            Sharpe uses the risk-free rate configured on the server.
          </Text>
        </Card>

        <Card>
          <Text style={styles.sectionTitle}>Fund details</Text>
          <DetailRow label="SFIN" value={fund.sfin ?? 'Not recorded'} warn={!fund.sfin} />
          {fund.sfin !== null && !fund.sfinVerified && (
            <Text style={styles.warn}>SFIN seeded but not yet confirmed against a scrape.</Text>
          )}
          <DetailRow label="Benchmark" value={fund.benchmark ?? '—'} />
          <DetailRow label="AUM" value={formatAum(fund.aumCr)} />
          <DetailRow label="Inception" value={formatDate(fund.inceptionDate)} />
          <DetailRow label="NAV history" value={`${fund.navHistoryDays} observations`} />
          <DetailRow
            label="Category standing"
            value={fund.categoryRank ? `#${fund.categoryRank} of ${fund.categorySize}` : '—'}
          />
        </Card>

        <Pressable
          onPress={() => setManaged.mutate({ id: fund.id, isManaged: !fund.isManaged })}
          disabled={setManaged.isPending}
          style={[styles.trackButton, fund.isManaged && styles.trackButtonActive]}
          accessibilityRole="button"
        >
          <Text style={[styles.trackText, fund.isManaged && styles.trackTextActive]}>
            {setManaged.isPending
              ? 'Saving…'
              : fund.isManaged
                ? '✓ Tracked as mine — tap to remove'
                : '+ Track as mine'}
          </Text>
        </Pressable>
        {setManaged.error && (
          <Text style={styles.error}>{(setManaged.error as Error).message}</Text>
        )}
      </ScrollView>
    </>
  );
}

function DetailRow({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text
        style={[styles.detailValue, warn && { color: theme.color.warning }]}
        numberOfLines={2}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: theme.space(4), paddingBottom: theme.space(10), gap: theme.space(3) },
  badges: { flexDirection: 'row', gap: theme.space(2), marginBottom: theme.space(3) },
  nav: { color: theme.color.text, fontSize: theme.font.display, fontWeight: '800' },
  dayChange: { fontSize: theme.font.body, fontWeight: '600', marginTop: 2 },
  asOf: { color: theme.color.textFaint, fontSize: theme.font.tiny, marginTop: theme.space(1) },
  divider: {
    height: 1, backgroundColor: theme.color.border,
    marginVertical: theme.space(4),
  },
  chartWrap: { marginTop: theme.space(4) },
  legend: { marginTop: theme.space(2), gap: theme.space(1) },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: theme.space(2) },
  swatch: { width: 12, height: 3, borderRadius: 2 },
  swatchDashed: {
    width: 12, height: 0, borderTopWidth: 2,
    borderStyle: 'dashed', borderColor: theme.color.textMuted,
  },
  legendText: { color: theme.color.textMuted, fontSize: theme.font.small },
  sectionTitle: {
    color: theme.color.textFaint,
    fontSize: theme.font.tiny,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: theme.space(3),
  },
  returnRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: theme.space(2.5),
    borderBottomWidth: 1,
    borderBottomColor: theme.color.border,
  },
  returnLabel: { color: theme.color.textMuted, fontSize: theme.font.body },
  returnValue: { fontSize: theme.font.body, fontWeight: '700' },
  statGrid: { flexDirection: 'row', gap: theme.space(3) },
  footnote: {
    color: theme.color.textFaint,
    fontSize: theme.font.tiny,
    lineHeight: 16,
    marginTop: theme.space(3),
  },
  warn: { color: theme.color.warning, fontSize: theme.font.tiny, marginTop: -theme.space(1), marginBottom: theme.space(2) },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: theme.space(4),
    paddingVertical: theme.space(2),
  },
  detailLabel: { color: theme.color.textMuted, fontSize: theme.font.small },
  detailValue: {
    color: theme.color.text,
    fontSize: theme.font.small,
    fontWeight: '600',
    flexShrink: 1,
    textAlign: 'right',
  },
  trackButton: {
    borderWidth: 1,
    borderColor: theme.color.accent,
    borderRadius: theme.radius.md,
    paddingVertical: theme.space(3.5),
    alignItems: 'center',
  },
  trackButtonActive: { backgroundColor: theme.color.accent },
  trackText: { color: theme.color.accent, fontSize: theme.font.body, fontWeight: '700' },
  trackTextActive: { color: '#06122B' },
  error: { color: theme.color.negative, fontSize: theme.font.small, textAlign: 'center' },
});
