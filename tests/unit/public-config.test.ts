/**
 * The family Supabase project's URL and publishable key are committed on purpose (they are public by
 * design, see docs/supabase-sync.md). These checks keep it that way: `.env.example` holds only those
 * two public values, never a secret, and the docs and `.env.example` name the same project.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

function parseEnv(text: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(trimmed);
    if (!match) throw new Error(`Not a KEY=value line in .env.example: ${trimmed}`);
    values[match[1]] = match[2];
  }
  return values;
}

describe('committed Supabase config', () => {
  const envExample = read('.env.example');
  const values = parseEnv(envExample);

  it('.env.example sets only the two public sync variables', () => {
    expect(Object.keys(values).sort()).toEqual(['PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'PUBLIC_SUPABASE_URL']);
    expect(values.PUBLIC_SUPABASE_URL).toMatch(/^https:\/\/[a-z0-9]{20}\.supabase\.co$/);
    expect(values.PUBLIC_SUPABASE_PUBLISHABLE_KEY).toMatch(/^sb_publishable_[A-Za-z0-9_-]+$/);
  });

  it('.env.example holds no secret key, service-role JWT or database password', () => {
    expect(envExample).not.toMatch(/sb_secret_/);
    expect(envExample).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}/);
    expect(envExample).not.toMatch(/postgres(ql)?:\/\//);
  });

  it('the setup guide records the same project URL and key', () => {
    const docs = read('docs/supabase-sync.md');
    const ref = new URL(values.PUBLIC_SUPABASE_URL).hostname.split('.')[0];
    expect(docs).toContain(`\`${ref}\``);
    expect(docs).toContain(values.PUBLIC_SUPABASE_URL);
    expect(docs).toContain(values.PUBLIC_SUPABASE_PUBLISHABLE_KEY);
    expect(docs).not.toMatch(/sb_secret_[A-Za-z0-9]/);
  });
});
