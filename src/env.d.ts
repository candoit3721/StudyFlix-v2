/// <reference types="astro/client" />

interface ImportMetaEnv {
  /** Supabase project URL for progress sync; unset or empty turns sync off (docs/supabase-sync.md). */
  readonly PUBLIC_SUPABASE_URL?: string;
  /** Supabase publishable (or legacy anon) key; public by design, RLS protects the data. */
  readonly PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
