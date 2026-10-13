// @ts-check
/**
 * The second e2e pass of `npm run verify`: builds the site with the "other" base into
 * dist-other-base/ and runs the whole Playwright suite against it, so every verify proves both a
 * root build and a subpath build (docs/deploy.md). The other base is `/` when SITE_BASE is a subpath,
 * and SUBPATH_PROBE when SITE_BASE is the root.
 */
import { spawnSync } from 'node:child_process';
import { normalizeBase, SUBPATH_PROBE } from './site-base.mjs';

const OUT_DIR = 'dist-other-base';
const base = normalizeBase(process.env.SITE_BASE) === '/' ? SUBPATH_PROBE : '/';
const env = { ...process.env, SITE_BASE: base, E2E_DIST: OUT_DIR };

/** @param {string[]} args */
function run(args) {
  console.log(`\n> SITE_BASE=${base} E2E_DIST=${OUT_DIR} npx ${args.join(' ')}\n`);
  const result = spawnSync('npx', args, { env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(['astro', 'build', '--outDir', OUT_DIR]);
run(['playwright', 'test']);
