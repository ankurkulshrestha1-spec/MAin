import React, { useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useFunds } from '../../src/api/hooks';
import { FundCard } from '../../src/components/FundCard';
import { Card, ErrorState, LoadingState, SegmentedControl, Stat } from '../../src/components/ui';
import { theme, returnColor } from '../../src/theme';
import { formatAum, formatDate, formatPercent } from '../../src/format';
import type { ReturnWindow } from '../../src/api/types';

const WINDOWS = [
  { value: 'm1' as const, label: '1M' },
  { value: 'm3' as const, label: '3M' },
  { value: 'y1' as const, label: '1Y' },
  { value: 'y3' as const, label: '3Y' },
  { value: 'y5' as const, label: '5Y' },
];

/**
 * The book view: only the funds flagged as managed, with a roll-up header
 * showing how the book as a whole is doing.
 */
export default function DashboardScreen() {
  const router = useRouter();
  const [window, setWindow] = useState<ReturnWindow>('y1');
  const { data, isLoading, error, refetch, isRefetching } = useFunds({
    managedOnly: true,
    rankWindow: window,
  });

  const rollup = useMemo(() => {
    if (!data?.length) return null;
    const withReturn = data.filter((f) => f.returns[window] !== null);
    const withAum = data.filter((f) => f.aumCr !== null);
    const totalAum = withAum.reduce((sum, f) => sum + (f.aumCr ?? 0), 0);

    // AUM-weighted where AUM is known, so a ₹3,200 Cr fund is not averaged
    // against a ₹50 Cr fund as though they carried equal weight.
    const weighted =
      totalAum > 0
        ? withReturn
            .filter((f) => f.aumCr !== null)
            .reduce((sum, f) => sum + (f.returns[window] as number) * (f.aumCr as number), 0) /
          withReturn.filter((f) => f.aumCr !== null).reduce((s, f) => s + (f.aumCr as number), 0)
        : null;

    const simple = withReturn.length
      ? withReturn.reduce((sum, f) => sum + (f.returns[window] as number), 0) / withReturn.length
      : null;

    const topQuartile = data.filter(
      (f) => f.categoryRank !== null && f.categoryRank <= 3,
    ).length;

    return {
      totalAum,
      weighted: Number.isFinite(weighted as number) ? weighted : simple,
      simple,
      topQuartile,
      count: data.length,
      asOf: data.map((f) => f.latestNavDate).filter(Boolean).sort().pop() ?? null,
    };
  }, [data, window]);

  if (isLoading) return <LoadingState label="Loading your funds…" />;
  if (error) {
    return <ErrorState message={(error as Error).message} onRetry={() => void refetch()} />;
  }

  return (
    <FlatList
      data={data ?? []}
      keyExtractor={(fund) => String(fund.id)}
      contentContainerStyle={styles.list}
      refreshControl={
        <RefreshControl
          refreshing={isRefetching}
          onRefresh={() => void refetch()}
          tintColor={theme.color.accent}
        />
      }
      ListHeaderComponent={
        <View style={styles.header}>
          <SegmentedControl options={WINDOWS} value={window} onChange={setWindow} />
          {rollup && (
            <Card style={styles.rollup}>
              <Text style={styles.rollupLabel}>Book performance</Text>
              <Text style={[styles.rollupValue, { color: returnColor(rollup.weighted) }]}>
                {formatPercent(rollup.weighted)}
              </Text>
              <Text style={styles.rollupSub}>
                AUM-weighted across {rollup.count} fund{rollup.count === 1 ? '' : 's'} ·
                simple avg {formatPercent(rollup.simple)}
              </Text>
              <View style={styles.statRow}>
                <Stat label="Total AUM" value={formatAum(rollup.totalAum)} />
                <Stat
                  label="Top 3 in category"
                  value={`${rollup.topQuartile} of ${rollup.count}`}
                  color={rollup.topQuartile > 0 ? theme.color.positive : undefined}
                />
                <Stat label="NAV as of" value={formatDate(rollup.asOf)} />
              </View>
            </Card>
          )}
        </View>
      }
      renderItem={({ item }) => <FundCard fund={item} window={window} />}
      ItemSeparatorComponent={() => <View style={{ height: theme.space(3) }} />}
      ListEmptyComponent={
        <Card style={styles.empty}>
          <Text style={styles.emptyTitle}>No funds marked as yours yet</Text>
          <Text style={styles.emptyBody}>
            Open All Funds, pick a fund, and tap “Track as mine”. Those funds show up
            here with a roll-up of how the book is performing.
          </Text>
          <Text
            style={styles.emptyLink}
            onPress={() => router.push('/explore')}
            accessibilityRole="link"
          >
            Browse all funds →
          </Text>
        </Card>
      }
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: theme.space(4), paddingBottom: theme.space(10), gap: 0 },
  header: { gap: theme.space(3), marginBottom: theme.space(3) },
  rollup: { gap: theme.space(1) },
  rollupLabel: {
    color: theme.color.textFaint,
    fontSize: theme.font.tiny,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  rollupValue: { fontSize: theme.font.display, fontWeight: '800' },
  rollupSub: { color: theme.color.textMuted, fontSize: theme.font.small },
  statRow: {
    flexDirection: 'row',
    gap: theme.space(3),
    marginTop: theme.space(3),
    paddingTop: theme.space(3),
    borderTopWidth: 1,
    borderTopColor: theme.color.border,
  },
  empty: { gap: theme.space(2) },
  emptyTitle: { color: theme.color.text, fontSize: theme.font.title, fontWeight: '700' },
  emptyBody: { color: theme.color.textMuted, fontSize: theme.font.small, lineHeight: 20 },
  emptyLink: { color: theme.color.accent, fontSize: theme.font.body, fontWeight: '700', marginTop: theme.space(1) },
});
