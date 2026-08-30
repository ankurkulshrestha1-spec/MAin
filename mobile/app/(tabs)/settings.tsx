import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { DEFAULT_BASE_URL, getBaseUrl, setBaseUrl } from '../../src/api/client';
import { useHealth, useTriggerScrape } from '../../src/api/hooks';
import { Card, Stat } from '../../src/components/ui';
import { theme } from '../../src/theme';
import { formatDate } from '../../src/format';

export default function SettingsScreen() {
  const queryClient = useQueryClient();
  const [url, setUrl] = useState('');
  const [saved, setSaved] = useState(false);
  const health = useHealth();
  const scrape = useTriggerScrape();

  useEffect(() => {
    void getBaseUrl().then(setUrl);
  }, []);

  const save = async () => {
    await setBaseUrl(url);
    // Every cached response belongs to the old server, so drop all of it.
    await queryClient.invalidateQueries();
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Card>
        <Text style={styles.sectionTitle}>Server</Text>
        <Text style={styles.help}>
          Address of the tracker API. On a physical phone use your computer&apos;s LAN
          IP (for example http://192.168.1.10:4000) — localhost only resolves on
          the simulator.
        </Text>
        <TextInput
          value={url}
          onChangeText={setUrl}
          placeholder={DEFAULT_BASE_URL}
          placeholderTextColor={theme.color.textFaint}
          style={styles.input}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />
        <Pressable onPress={() => void save()} style={styles.button}>
          <Text style={styles.buttonText}>{saved ? 'Saved ✓' : 'Save server address'}</Text>
        </Pressable>
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>Data status</Text>
        {health.isLoading ? (
          <ActivityIndicator color={theme.color.accent} />
        ) : health.error ? (
          <Text style={styles.error}>{(health.error as Error).message}</Text>
        ) : health.data ? (
          <>
            <View style={styles.statRow}>
              <Stat label="Funds" value={String(health.data.activeFunds)} />
              <Stat label="NAV points" value={health.data.navPoints.toLocaleString('en-IN')} />
              <Stat label="Latest NAV" value={formatDate(health.data.latestNavDate)} />
            </View>
            <View style={styles.sources}>
              {Object.entries(health.data.sources).map(([source, count]) => (
                <Text key={source} style={styles.sourceLine}>
                  {source}: {count.toLocaleString('en-IN')} points
                </Text>
              ))}
            </View>
            {health.data.sources.seed ? (
              <Text style={styles.warn}>
                This database still contains generated development data
                (source “seed”). Those NAVs are not real — clear them once a live
                scrape or CSV import has landed.
              </Text>
            ) : null}
          </>
        ) : null}
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>Refresh NAVs</Text>
        <Text style={styles.help}>
          The server scrapes PNB MetLife&apos;s fund performance page on a daily
          schedule. Run it now if you need today&apos;s NAVs immediately.
        </Text>
        <Pressable
          onPress={() => scrape.mutate()}
          disabled={scrape.isPending}
          style={[styles.button, scrape.isPending && styles.buttonDisabled]}
        >
          <Text style={styles.buttonText}>
            {scrape.isPending ? 'Scraping…' : 'Run scrape now'}
          </Text>
        </Pressable>

        {scrape.data && (
          <View style={styles.result}>
            <Text
              style={[
                styles.resultStatus,
                {
                  color:
                    scrape.data.status === 'success'
                      ? theme.color.positive
                      : scrape.data.status === 'partial'
                        ? theme.color.warning
                        : theme.color.negative,
                },
              ]}
            >
              {scrape.data.status.toUpperCase()} · {scrape.data.fundsSeen} rows seen ·{' '}
              {scrape.data.fundsUpdated} NAV points written
            </Text>
            {scrape.data.message && <Text style={styles.help}>{scrape.data.message}</Text>}
            {scrape.data.unmatched.map((item) => (
              <Text key={item} style={styles.unmatched}>• {item}</Text>
            ))}
          </View>
        )}
        {scrape.error && <Text style={styles.error}>{(scrape.error as Error).message}</Text>}
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>Importing NAVs another way</Text>
        <Text style={styles.help}>
          If the scrape breaks, the server also accepts a CSV export with fund,
          date and nav columns:
        </Text>
        <Text style={styles.code}>
          curl -X POST {url || DEFAULT_BASE_URL}/api/import/csv \{'\n'}
          {'  '}-H &quot;Content-Type: text/csv&quot; --data-binary @navs.csv
        </Text>
        <Text style={styles.help}>
          Single NAVs can be posted per fund at /api/funds/&lt;slug&gt;/nav.
        </Text>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: theme.space(4), paddingBottom: theme.space(10), gap: theme.space(3) },
  sectionTitle: {
    color: theme.color.textFaint,
    fontSize: theme.font.tiny,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: theme.space(2),
  },
  help: { color: theme.color.textMuted, fontSize: theme.font.small, lineHeight: 19 },
  input: {
    backgroundColor: theme.color.surfaceRaised,
    borderWidth: 1,
    borderColor: theme.color.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.space(3.5),
    paddingVertical: theme.space(3),
    color: theme.color.text,
    fontSize: theme.font.body,
    marginTop: theme.space(3),
  },
  button: {
    backgroundColor: theme.color.accent,
    borderRadius: theme.radius.md,
    paddingVertical: theme.space(3),
    alignItems: 'center',
    marginTop: theme.space(3),
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#06122B', fontWeight: '700', fontSize: theme.font.body },
  statRow: { flexDirection: 'row', gap: theme.space(3) },
  sources: { marginTop: theme.space(3), gap: 2 },
  sourceLine: { color: theme.color.textFaint, fontSize: theme.font.tiny },
  warn: {
    color: theme.color.warning,
    fontSize: theme.font.tiny,
    lineHeight: 16,
    marginTop: theme.space(3),
  },
  result: { marginTop: theme.space(3), gap: theme.space(1) },
  resultStatus: { fontSize: theme.font.small, fontWeight: '700' },
  unmatched: { color: theme.color.textMuted, fontSize: theme.font.tiny },
  error: { color: theme.color.negative, fontSize: theme.font.small },
  code: {
    color: theme.color.textMuted,
    fontSize: theme.font.tiny,
    fontFamily: 'monospace',
    backgroundColor: theme.color.surfaceRaised,
    borderRadius: theme.radius.sm,
    padding: theme.space(3),
    marginVertical: theme.space(2),
  },
});
