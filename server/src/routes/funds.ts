import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '../db.js';
import {
  getFundDetail,
  getNavSeries,
  listFundSummaries,
  getFundRow,
  setManaged,
  periodStartDate,
  type Period,
} from '../service.js';
import type { FundCategory, NavPoint } from '../types.js';

const PERIODS = ['1m', '3m', '6m', '1y', '3y', '5y', 'max'] as const;
const CATEGORIES = ['equity', 'index', 'balanced', 'debt', 'liquid'] as const;
const RANK_WINDOWS = ['m1', 'm3', 'm6', 'y1', 'y3', 'y5', 'sinceInception'] as const;

const listQuery = z.object({
  managed: z.enum(['true', 'false']).optional(),
  category: z.enum(CATEGORIES).optional(),
  rankWindow: z.enum(RANK_WINDOWS).default('y1'),
});

const detailQuery = z.object({
  period: z.enum(PERIODS).default('1y'),
  rankWindow: z.enum(RANK_WINDOWS).default('y1'),
});

const compareQuery = z.object({
  ids: z.string().min(1),
  period: z.enum(PERIODS).default('1y'),
});

export async function fundRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/funds', async (request, reply) => {
    const parsed = listQuery.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const { managed, category, rankWindow } = parsed.data;
    return listFundSummaries({
      managedOnly: managed === 'true',
      category: category as FundCategory | undefined,
      rankWindow,
    });
  });

  app.get('/api/funds/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = detailQuery.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const detail = getFundDetail(id, parsed.data.period as Period, parsed.data.rankWindow);
    if (!detail) return reply.code(404).send({ error: `No fund matching "${id}"` });
    return detail;
  });

  app.patch('/api/funds/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = z
      .object({
        isManaged: z.boolean().optional(),
        category: z.enum(CATEGORIES).optional(),
        benchmark: z.string().nullable().optional(),
        aumCr: z.number().positive().nullable().optional(),
      })
      .safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() });

    const fund = getFundRow(id);
    if (!fund) return reply.code(404).send({ error: `No fund matching "${id}"` });

    if (body.data.isManaged !== undefined) setManaged(fund.id, body.data.isManaged);
    if (body.data.category !== undefined) {
      db.prepare(`UPDATE funds SET category = ? WHERE id = ?`).run(body.data.category, fund.id);
    }
    if (body.data.benchmark !== undefined) {
      db.prepare(`UPDATE funds SET benchmark = ? WHERE id = ?`).run(body.data.benchmark, fund.id);
    }
    if (body.data.aumCr !== undefined) {
      db.prepare(`UPDATE funds SET aum_cr = ? WHERE id = ?`).run(body.data.aumCr, fund.id);
    }
    db.prepare(`UPDATE funds SET updated_at = datetime('now') WHERE id = ?`).run(fund.id);

    return getFundDetail(fund.id);
  });

  /**
   * Multi-fund comparison. Series are rebased to 100 at the start of the
   * window so funds with very different NAV levels (a ₹10 index fund and a
   * ₹70 equity fund) are visually comparable.
   */
  app.get('/api/compare', async (request, reply) => {
    const parsed = compareQuery.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const ids = parsed.data.ids.split(',').map((s) => s.trim()).filter(Boolean);
    if (ids.length > 6) {
      return reply.code(400).send({ error: 'Compare at most 6 funds at once' });
    }

    const series = ids.map((id) => {
      const fund = getFundRow(id);
      if (!fund) return null;
      const full = getNavSeries(fund.id);
      const latest = full[full.length - 1];
      const from = latest ? periodStartDate(parsed.data.period as Period, latest.date) : undefined;
      const windowed = from ? full.filter((p) => p.date >= from) : full;
      const base = windowed[0]?.nav;
      const rebased: NavPoint[] = base
        ? windowed.map((p) => ({ date: p.date, nav: Number(((p.nav / base) * 100).toFixed(4)) }))
        : [];
      return {
        id: fund.id,
        name: fund.name,
        slug: fund.slug,
        category: fund.category,
        series: rebased,
        changePct: base && windowed.length > 1
          ? ((windowed[windowed.length - 1]!.nav / base) - 1) * 100
          : null,
      };
    });

    const missing = ids.filter((_, i) => series[i] === null);
    if (missing.length) {
      return reply.code(404).send({ error: `No fund matching: ${missing.join(', ')}` });
    }
    return { period: parsed.data.period, funds: series };
  });

  /** Category league table — the "how are my funds ranking" view. */
  app.get('/api/rankings', async (request, reply) => {
    const parsed = z
      .object({ window: z.enum(RANK_WINDOWS).default('y1') })
      .safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const funds = listFundSummaries({ rankWindow: parsed.data.window });
    const grouped: Record<string, typeof funds> = {};
    for (const fund of funds) {
      (grouped[fund.category] ??= []).push(fund);
    }
    for (const list of Object.values(grouped)) {
      list.sort((a, b) => {
        const av = a.returns[parsed.data.window];
        const bv = b.returns[parsed.data.window];
        if (av === null && bv === null) return 0;
        if (av === null) return 1;
        if (bv === null) return -1;
        return bv - av;
      });
    }
    return { window: parsed.data.window, categories: grouped };
  });
}
