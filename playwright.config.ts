import { defineConfig, devices } from '@playwright/test';
import { normalizeBase } from './scripts/site-base.mjs';

// The factory runs several worktrees at once and hands each a free port.
const PORT = Number(process.env.FACTORY_PORT ?? 4322);
// The build under test and the base it was built with (scripts/e2e-other-base.mjs sets both).
const BASE = normalizeBase(process.env.SITE_BASE);
const DIST = process.env.E2E_DIST || 'dist';

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}${BASE}`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    // Preview reads `base` from astro.config.mjs, so it sees the same SITE_BASE as the build.
    command: `npx astro preview --port ${PORT} --ignore-lock --outDir ${DIST}`,
    // Under a subpath the origin root is a 404, so wait on the base itself.
    url: `http://localhost:${PORT}${BASE}`,
    // Never reuse: a server from another worktree would test the wrong build.
    reuseExistingServer: false,
  },
});
