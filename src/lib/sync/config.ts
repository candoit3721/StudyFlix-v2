/**
 * Where learner progress syncs to, if anywhere.
 *
 * The production values come from the build-time env vars PUBLIC_SUPABASE_URL and
 * PUBLIC_SUPABASE_PUBLISHABLE_KEY (see docs/supabase-sync.md). Both are public by design: Row Level
 * Security, not the key, protects the data. Missing or empty values mean "not configured", and the
 * site then keeps progress in this browser only.
 *
 * Test override: when `globalThis.__STUDYFLIX_SYNC__` is defined it replaces the build config.
 * An object `{ url, key }` turns sync on (the e2e tests point it at a fake backend with
 * `addInitScript`), and `null` turns it off. This is safe in production, because a visitor can only
 * redirect their own browser.
 *
 * This module must stay tiny and must not import @supabase/supabase-js: every page loads it.
 */

export interface SyncConfig {
  url: string;
  key: string;
}

function clean(url: unknown, key: unknown): SyncConfig | null {
  if (typeof url !== 'string' || typeof key !== 'string') return null;
  const trimmedUrl = url.trim();
  const trimmedKey = key.trim();
  return trimmedUrl && trimmedKey ? { url: trimmedUrl, key: trimmedKey } : null;
}

export function getSyncConfig(): SyncConfig | null {
  const override = (globalThis as { __STUDYFLIX_SYNC__?: unknown }).__STUDYFLIX_SYNC__;
  if (override !== undefined) {
    if (override === null || typeof override !== 'object') return null;
    const { url, key } = override as Partial<SyncConfig>;
    return clean(url, key);
  }
  return clean(import.meta.env.PUBLIC_SUPABASE_URL, import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY);
}
