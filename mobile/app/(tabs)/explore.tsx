import React, { useMemo, useState } from 'react';
import {
  FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useFunds } from '../../src/api/hooks';
import { FundCard } from '../../src/components/FundCard';
import { ErrorState, LoadingState, SegmentedControl } from '../../src/components/ui';
import { theme, CATEGORY_LABEL } from '../../src/theme';
import type { FundCategory, ReturnWindow } from '../../src/api/types';

const WINDOWS = [
  { value: 'm1' as const, label: '1M' },
  { value: 'm3' as const, label: '3M' },
  { value: 'y1' as const, label: '1Y' },
  { value: 'y3' as const, label: '3Y' },
  { value: 'y5' as const, label: '5Y' },
];

const CATEGORIES: Array<FundCategory | 'all'> = [
  'all', 'equity', 'index', 'balanced', 'debt', 'liquid',
];

/** Every fund, ranked, so you can see where yours sit against the rest. */
export default function ExploreScreen() {
  const [window, setWindow] = useState<ReturnWindow>('y1');
  const [category, setCategory] = useState<FundCategory | 'all'>('all');
  const [query, setQuery] = useState('');

  const { data, isLoading, error, refetch, isRefetching } = useFunds({ rankWindow: window });

  const funds = useMemo(() => {
    if (!data) return [];
    const needle = query.trim().toLowerCase();
    return data
      .filter((f) => (category === 'all' ? true : f.category === category))
      .filter((f) =>
        needle
          ? f.name.toLowerCase().includes(needle) ||
            (f.sfin ?? '').toLowerCase().includes(needle)
          : true,
      )
      .sort((a, b) => {
        // Best performers first; funds with no return for this window sink to
        // the bottom rather than sorting as if they returned zero.
        const av = a.returns[window];
        const bv = b.returns[window];
        if (av === null && bv === null) return a.name.localeCompare(b.name);
        if (av === null) return 1;
        if (bv === null) return -1;
        return bv - av;
      });
  }, [data, category, query, window]);

  if (isLoading) return <LoadingState label="Loading funds…" />;
  if (error) {
    return <ErrorState message={(error as Error).message} onRetry={() => void refetch()} />;
  }

  return (
    <FlatList
      data={funds}
      keyExtractor={(fund) => String(fund.id)}
      contentContainerStyle={styles.list}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          refreshing={isRefetching}
          onRefresh={() => void refetch()}
          tintColor={theme.color.accent}
        />
      }
      ListHeaderComponent={
        <View style={styles.header}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search by fund name or SFIN"
            placeholderTextColor={theme.color.textFaint}
            style={styles.search}
            autoCorrect={false}
            autoCapitalize="none"
          />
          <SegmentedControl options={WINDOWS} value={window} onChange={setWindow} />
          <View style={styles.chips}>
            {CATEGORIES.map((option) => {
              const active = option === category;
              return (
                <Pressable
                  key={option}
                  onPress={() => setCategory(option)}
                  style={[styles.chip, active && styles.chipActive]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>
                    {option === 'all' ? 'All' : CATEGORY_LABEL[option]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.count}>
            {funds.length} fund{funds.length === 1 ? '' : 's'} · ranked by{' '}
            {WINDOWS.find((w) => w.value === window)?.label} return within category
          </Text>
        </View>
      }
      renderItem={({ item }) => <FundCard fund={item} window={window} />}
      ItemSeparatorComponent={() => <View style={{ height: theme.space(3) }} />}
      ListEmptyComponent={
        <Text style={styles.noResults}>No funds match “{query}”.</Text>
      }
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: theme.space(4), paddingBottom: theme.space(10) },
  header: { gap: theme.space(3), marginBottom: theme.space(3) },
  search: {
    backgroundColor: theme.color.surface,
    borderWidth: 1,
    borderColor: theme.color.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.space(3.5),
    paddingVertical: theme.space(3),
    color: theme.color.text,
    fontSize: theme.font.body,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space(2) },
  chip: {
    paddingHorizontal: theme.space(3),
    paddingVertical: theme.space(1.5),
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.color.border,
    backgroundColor: theme.color.surface,
  },
  chipActive: { backgroundColor: theme.color.accent, borderColor: theme.color.accent },
  chipText: { color: theme.color.textMuted, fontSize: theme.font.small, fontWeight: '600' },
  chipTextActive: { color: '#06122B' },
  count: { color: theme.color.textFaint, fontSize: theme.font.tiny },
  noResults: { color: theme.color.textMuted, textAlign: 'center', marginTop: theme.space(8) },
});
