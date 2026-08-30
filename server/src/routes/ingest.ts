import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db.js';
import { getFundRow, upsertNavPoints } from '../service.js';
import { importNavCsv } from '../csv.js';
import { scrapeNavs } from '../scrape/pnbmetlife.js';
import type { ScrapeRun } from '../types.js';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

export async function ingestRoutes(app: FastifyInstance): Promise<void> {
  /** Manual NAV entry — the fallback when the scrape breaks. */
  app.post('/api/funds/:id/nav', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = z
      .object({
        entries: z
          .array(z.object({ date: isoDate, nav: z.number().positive() }))
          .min(1)
          .max(2000),
      })
      .safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() });

    const fund = getFundRow(id);
    if (!fund) return reply.code(404).send({ error: `No fund matching "${id}"` });

    const written = upsertNavPoints(
      body.data.entries.map((e) => ({
        fundId: fund.id, date: e.date, nav: e.nav, source: 'manual' as const,
      })),
    );
    return { fundId: fund.id, navPointsWritten: written };
  });

  app.delete('/api/funds/:id/nav/:date', async (request, reply) => {
    const { id, date } = request.params as { id: string; date: string };
    if (!isoDate.safeParse(date).success) {
      return reply.code(400).send({ error: 'Date must be YYYY-MM-DD' });
    }
    const fund = getFundRow(id);
    if (!fund) return reply.code(404).send({ error: `No fund matching "${id}"` });
    const result = db
      .prepare(`DELETE FROM nav_history WHERE fund_id = ? AND date = ?`)
      .run(fund.id, date);
    return { deleted: result.changes };
  });

  /**
   * CSV import. Body is the raw CSV text (Content-Type: text/csv or text/plain)
   * so an export can be piped straight in without multipart handling.
   */
  app.post('/api/import/csv', async (request, reply) => {
    const body = request.body;
    const content = typeof body === 'string' ? body : (body as { csv?: string })?.csv;
    if (!content || typeof content !== 'string') {
      return reply
        .code(400)
        .send({ error: 'Send the CSV as the raw request body, or as {"csv": "..."}' });
    }
    const result = importNavCsv(content);
    return reply.code(result.navPointsWritten > 0 ? 200 : 422).send(result);
  });

  /** Triggers a scrape now instead of waiting for the daily cron. */
  app.post('/api/scrape', async () => scrapeNavs());

  app.get('/api/scrape/runs', async () => {
    const rows = db
      .prepare(`SELECT * FROM scrape_runs ORDER BY id DESC LIMIT 20`)
      .all() as Array<Record<string, unknown>>;
    return rows.map(
      (r): ScrapeRun => ({
        id: r.id as number,
        startedAt: r.started_at as string,
        finishedAt: (r.finished_at as string) ?? null,
        status: r.status as ScrapeRun['status'],
        fundsUpdated: r.funds_updated as number,
        message: (r.message as string) ?? null,
      }),
    );
  });

  app.get('/api/health', async () => {
    const funds = db.prepare(`SELECT COUNT(*) AS n FROM funds WHERE is_active = 1`).get() as { n: number };
    const navs = db.prepare(`SELECT COUNT(*) AS n FROM nav_history`).get() as { n: number };
    const latest = db.prepare(`SELECT MAX(date) AS d FROM nav_history`).get() as { d: string | null };
    const sources = db
      .prepare(`SELECT source, COUNT(*) AS n FROM nav_history GROUP BY source`)
      .all() as Array<{ source: string; n: number }>;
    return {
      ok: true,
      activeFunds: funds.n,
      navPoints: navs.n,
      latestNavDate: latest.d,
      sources: Object.fromEntries(sources.map((s) => [s.source, s.n])),
    };
  });
}
