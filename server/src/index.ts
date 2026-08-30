import Fastify from 'fastify';
import cors from '@fastify/cors';
import cron from 'node-cron';
import { config } from './config.js';
import { ensureCatalog } from './db.js';
import { fundRoutes } from './routes/funds.js';
import { ingestRoutes } from './routes/ingest.js';
import { scrapeNavs } from './scrape/pnbmetlife.js';

const app = Fastify({ logger: { transport: undefined } });

// The mobile app talks to this over the LAN, so allow any origin — this is a
// single-user tool on a private network, not a public API.
await app.register(cors, { origin: true });

// Accept a raw CSV body on the import endpoint.
app.addContentTypeParser(
  ['text/csv', 'text/plain'],
  { parseAs: 'string' },
  (_req, body, done) => done(null, body),
);

ensureCatalog();
await app.register(fundRoutes);
await app.register(ingestRoutes);

async function runScrape(reason: string): Promise<void> {
  app.log.info({ reason }, 'starting NAV scrape');
  try {
    const result = await scrapeNavs();
    app.log.info(result, 'NAV scrape finished');
  } catch (error) {
    app.log.error({ err: error }, 'NAV scrape threw');
  }
}

if (cron.validate(config.scrapeCron)) {
  cron.schedule(config.scrapeCron, () => void runScrape('cron'), {
    timezone: config.scrapeTimezone,
  });
  app.log.info(
    `NAV scrape scheduled: "${config.scrapeCron}" (${config.scrapeTimezone})`,
  );
} else {
  app.log.warn(`SCRAPE_CRON "${config.scrapeCron}" is not a valid cron expression; scraping disabled`);
}

if (config.scrapeOnBoot) void runScrape('boot');

await app.listen({ port: config.port, host: '0.0.0.0' });
app.log.info(`Fund tracker API listening on http://0.0.0.0:${config.port}`);
