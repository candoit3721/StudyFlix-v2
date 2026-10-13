import { loadEnv } from 'vite';

/**
 * The sync config the site under test was built with, resolved the way `astro build` resolves it:
 * Vite's production env (`.env`, `.env.local`, `.env.production`, `.env.production.local`), with the
 * process environment winning over the files. So a local `.env` copied from `.env.example` counts,
 * and so do CI's variables, including the empty values CI passes while they are not set yet.
 * Missing or empty values mean "not configured", as in `src/lib/sync/config.ts`.
 */
export function buildSyncConfig(): { url: string; key: string } | null {
  const env = loadEnv('production', process.cwd(), 'PUBLIC_');
  const url = env.PUBLIC_SUPABASE_URL?.trim() ?? '';
  const key = env.PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ?? '';
  return url && key ? { url, key } : null;
}
