import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { theme, CATEGORY_COLOR, returnColor } from '../theme';
import { formatAum, formatNav, formatPercent } from '../format';
import { CategoryPill, RankBadge } from './ui';
import { Sparkline } from './Sparkline';
import type { FundSummary, ReturnWindow } from '../api/types';

interface Props {
  fund: FundSummary;
  /** Which return the card's headline figure shows. */
  window?: ReturnWindow;
}

const WINDOW_LABEL: Record<string, string> = {
  m1: '1M', m3: '3M', m6: '6M', y1: '1Y', y3: '3Y CAGR', y5: '5Y CAGR',
  sinceInception: 'Since inception',
};

export function FundCard({ fund, window = 'y1' }: Props) {
  const router = useRouter();
  const headline = fund.returns[window];
  const accent = CATEGORY_COLOR[fund.category] ?? theme.color.accent;

  return (
    <Pressable
      onPress={() => router.push(`/fund/${fund.slug}`)}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`${fund.name}, NAV ${formatNav(fund.latestNav)}, ${WINDOW_LABEL[window]} ${formatPercent(headline)}`}
    >
      <View style={styles.header}>
        <Text style={styles.name} numberOfLines={2}>{fund.name}</Text>
        {fund.sparkline.length > 1 && (
          <Sparkline points={fund.sparkline} color={returnColor(headline)} />
        )}
      </View>

      <View style={styles.badges}>
        <CategoryPill category={fund.category} />
        <RankBadge rank={fund.categoryRank} />
        {!fund.sfinVerified && fund.sfin === null && (
          <Text style={styles.unverified}>SFIN unconfirmed</Text>
        )}
      </View>

      <View style={styles.row}>
        <View>
          <Text style={styles.label}>NAV</Text>
          <Text style={styles.nav}>₹{formatNav(fund.latestNav)}</Text>
          <Text style={[styles.dayChange, { color: returnColor(fund.dayChangePct) }]}>
            {formatPercent(fund.dayChangePct)} today
          </Text>
        </View>

        <View style={styles.rightColumn}>
          <Text style={styles.label}>{WINDOW_LABEL[window] ?? window}</Text>
          <Text style={[styles.headline, { color: returnColor(headline) }]}>
            {formatPercent(headline)}
          </Text>
          <Text style={styles.aum}>{formatAum(fund.aumCr)}</Text>
        </View>
      </View>

      <View style={[styles.accentBar, { backgroundColor: accent }]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.color.border,
    padding: theme.space(4),
    overflow: 'hidden',
  },
  pressed: { opacity: 0.7 },
  header: { flexDirection: 'row', justifyContent: 'space-between', gap: theme.space(3) },
  name: {
    color: theme.color.text,
    fontSize: theme.font.body,
    fontWeight: '700',
    flex: 1,
    lineHeight: 20,
  },
  badges: { flexDirection: 'row', gap: theme.space(2), marginTop: theme.space(2), alignItems: 'center', flexWrap: 'wrap' },
  unverified: { color: theme.color.warning, fontSize: theme.font.tiny },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: theme.space(3),
  },
  rightColumn: { alignItems: 'flex-end' },
  label: {
    color: theme.color.textFaint,
    fontSize: theme.font.tiny,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  nav: { color: theme.color.text, fontSize: theme.font.title, fontWeight: '700' },
  dayChange: { fontSize: theme.font.small, marginTop: 2, fontWeight: '600' },
  headline: { fontSize: theme.font.title, fontWeight: '700' },
  aum: { color: theme.color.textMuted, fontSize: theme.font.small, marginTop: 2 },
  accentBar: {
    position: 'absolute', left: 0, top: 0, bottom: 0, width: 3,
  },
});
