/**
 * CLI: `npm run seed` fills the database with development NAV history.
 * Pass --years N to change the depth of history generated.
 */
import { seedSyntheticHistory } from './synthetic.js';

const args = process.argv.slice(2);
const yearsArg = args.indexOf('--years');
const years = yearsArg !== -1 && args[yearsArg + 1] ? Number(args[yearsArg + 1]) : 8;

const result = seedSyntheticHistory({
  years,
  // A plausible starting book for a fund manager; change via the app's
  // Settings screen or PATCH /api/funds/:id.
  managedSlugs: ['virtue-ii', 'multiplier-ii', 'balancer-ii', 'flexi-cap', 'mid-cap'],
});

console.log(
  `Seeded ${result.fundsSeeded} fund(s) with ${result.pointsWritten} NAV points (source='seed').`,
);
console.log("Remove later with: DELETE FROM nav_history WHERE source = 'seed';");
