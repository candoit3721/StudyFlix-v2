/**
 * Runs the committed Supabase migration in PGlite (Postgres in WebAssembly) against a minimal
 * stand-in for what Supabase provides (the auth schema, auth.uid() and the API roles), then checks
 * the tables, the summary view, Row Level Security and the grants as the site would use them.
 */
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const MIGRATION = readFileSync(
  new URL('../../supabase/migrations/20261013004603_learner_progress.sql', import.meta.url),
  'utf8',
);

const USER_A = '00000000-0000-4000-8000-00000000000a';
const USER_B = '00000000-0000-4000-8000-00000000000b';

const SUPABASE_STUB = `
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  create role anon nologin;
  create role authenticated nologin;
  grant usage on schema public to anon, authenticated;
  grant usage on schema auth to anon, authenticated;
  -- Supabase's default privileges: new public tables are open to the API roles until revoked.
  alter default privileges in schema public grant all on tables to anon, authenticated;
  insert into auth.users (id) values ('${USER_A}'), ('${USER_B}');
`;

let db: PGlite;

async function as(role: 'anon' | 'authenticated', user?: string): Promise<void> {
  await db.exec('reset role');
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [user ?? '']);
  await db.exec(`set role ${role}`);
}

async function asOwner(): Promise<void> {
  await db.exec('reset role');
  await db.query(`select set_config('request.jwt.claim.sub', '', false)`);
}

interface EventRow {
  id: string;
  learner?: string;
  lesson?: string;
  kind?: 'item' | 'practice';
  key?: string;
  answered?: number;
  correct: number;
  at: string;
}

async function insertEvents(rows: EventRow[]): Promise<void> {
  for (const row of rows) {
    await db.query(
      `insert into public.progress_events (id, learner_id, lesson_id, kind, key, answered, correct, at)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       on conflict (user_id, id) do nothing`,
      [
        row.id,
        row.learner ?? 'sophia',
        row.lesson ?? 'g6-science/six-kingdoms',
        row.kind ?? 'item',
        row.key ?? 'check:abc123',
        row.answered ?? 1,
        row.correct,
        row.at,
      ],
    );
  }
}

interface SummaryRow {
  learner_id: string;
  lesson_id: string;
  kind: string;
  key: string;
  answered: number;
  correct: number;
  at: Date;
}

async function summary(): Promise<SummaryRow[]> {
  const result = await db.query<SummaryRow>(
    'select * from public.progress_summary order by learner_id, lesson_id, kind, key',
  );
  return result.rows;
}

async function upsertVisit(lesson: string, visitedAt: string): Promise<void> {
  await db.query(
    `insert into public.learner_visits (learner_id, lesson_id, visited_at) values ('sophia', $1, $2)
     on conflict (user_id, learner_id) do update
       set lesson_id = excluded.lesson_id, visited_at = excluded.visited_at`,
    [lesson, visitedAt],
  );
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_STUB);
  await db.exec(MIGRATION);
}, 60_000);

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  await asOwner();
  await db.exec('truncate public.progress_events, public.learner_visits');
});

describe('schema', () => {
  it('creates both tables with RLS enabled, and the summary view', async () => {
    const tables = await db.query<{ relname: string; relrowsecurity: boolean; relkind: string }>(
      `select relname, relrowsecurity, relkind from pg_class
       where relnamespace = 'public'::regnamespace and relkind in ('r', 'v') order by relname`,
    );
    expect(tables.rows).toEqual([
      { relname: 'learner_visits', relrowsecurity: true, relkind: 'r' },
      { relname: 'progress_events', relrowsecurity: true, relkind: 'r' },
      { relname: 'progress_summary', relrowsecurity: false, relkind: 'v' },
    ]);
    const view = await db.query<{ reloptions: string[] }>(
      `select reloptions from pg_class where oid = 'public.progress_summary'::regclass`,
    );
    expect(view.rows[0]?.reloptions).toContain('security_invoker=true');
  });

  it('rejects impossible counts', async () => {
    await as('authenticated', USER_A);
    await expect(
      insertEvents([{ id: 'e1', answered: 1, correct: 2, at: '2026-10-01T10:00:00Z' }]),
    ).rejects.toThrow();
    await expect(
      insertEvents([{ id: 'e2', answered: 0, correct: 0, at: '2026-10-01T10:00:00Z' }]),
    ).rejects.toThrow();
    await expect(
      insertEvents([{ id: 'e3', kind: 'flashcard' as 'item', correct: 0, at: '2026-10-01T10:00:00Z' }]),
    ).rejects.toThrow();
  });
});

describe('as the family account', () => {
  it('sums answers per key, and the latest time wins', async () => {
    await as('authenticated', USER_A);
    await insertEvents([
      { id: 'e1', correct: 0, at: '2026-10-01T10:00:00Z' },
      { id: 'e2', correct: 1, at: '2026-10-01T10:05:00Z' },
      { id: 'e3', correct: 1, at: '2026-10-01T10:01:00Z' },
      { id: 'p1', kind: 'practice', key: 'practice', answered: 4, correct: 3, at: '2026-10-02T09:00:00Z' },
      { id: 'p2', kind: 'practice', key: 'practice', correct: 0, at: '2026-10-02T09:01:00Z' },
      {
        id: 'o1',
        lesson: 'g6-math/ratios-and-rates',
        key: 'check:zzz',
        correct: 1,
        at: '2026-10-03T08:00:00Z',
      },
    ]);
    const rows = await summary();
    expect(rows.map((r) => ({ ...r, at: r.at.toISOString() }))).toEqual([
      {
        learner_id: 'sophia',
        lesson_id: 'g6-math/ratios-and-rates',
        kind: 'item',
        key: 'check:zzz',
        answered: 1,
        correct: 1,
        at: '2026-10-03T08:00:00.000Z',
      },
      {
        learner_id: 'sophia',
        lesson_id: 'g6-science/six-kingdoms',
        kind: 'item',
        key: 'check:abc123',
        answered: 3,
        correct: 2,
        at: '2026-10-01T10:05:00.000Z',
      },
      {
        learner_id: 'sophia',
        lesson_id: 'g6-science/six-kingdoms',
        kind: 'practice',
        key: 'practice',
        answered: 5,
        correct: 3,
        at: '2026-10-02T09:01:00.000Z',
      },
    ]);
  });

  it('fills user_id from the session', async () => {
    await as('authenticated', USER_A);
    await insertEvents([{ id: 'e1', correct: 1, at: '2026-10-01T10:00:00Z' }]);
    const rows = await db.query<{ user_id: string }>('select user_id from public.progress_events');
    expect(rows.rows).toEqual([{ user_id: USER_A }]);
  });

  it('ignores a re-sent event with the same id', async () => {
    await as('authenticated', USER_A);
    const event = { id: 'e1', answered: 2, correct: 1, at: '2026-10-01T10:00:00Z' };
    await insertEvents([event]);
    await insertEvents([event, event]);
    const rows = await summary();
    expect(rows.map((r) => [r.answered, r.correct])).toEqual([[2, 1]]);
  });

  it('cannot change or delete events', async () => {
    await as('authenticated', USER_A);
    await insertEvents([{ id: 'e1', correct: 1, at: '2026-10-01T10:00:00Z' }]);
    await expect(db.exec('update public.progress_events set correct = 0')).rejects.toThrow(
      /permission denied/,
    );
    await expect(db.exec('delete from public.progress_events')).rejects.toThrow(/permission denied/);
  });

  it('keeps the newer visit: an older one is ignored, a newer one replaces it', async () => {
    await as('authenticated', USER_A);
    await upsertVisit('g6-science/six-kingdoms', '2026-10-05T10:00:00Z');
    await upsertVisit('g6-science/what-is-biodiversity', '2026-10-04T10:00:00Z');
    let rows = await db.query<{ lesson_id: string; visited_at: Date }>(
      'select lesson_id, visited_at from public.learner_visits',
    );
    expect(rows.rows.map((r) => [r.lesson_id, r.visited_at.toISOString()])).toEqual([
      ['g6-science/six-kingdoms', '2026-10-05T10:00:00.000Z'],
    ]);

    await upsertVisit('g6-math/ratios-and-rates', '2026-10-06T10:00:00Z');
    rows = await db.query('select lesson_id, visited_at from public.learner_visits');
    expect(rows.rows.map((r) => [r.lesson_id, r.visited_at.toISOString()])).toEqual([
      ['g6-math/ratios-and-rates', '2026-10-06T10:00:00.000Z'],
    ]);
  });
});

describe('another account', () => {
  beforeEach(async () => {
    await as('authenticated', USER_A);
    await insertEvents([{ id: 'e1', correct: 1, at: '2026-10-01T10:00:00Z' }]);
    await upsertVisit('g6-science/six-kingdoms', '2026-10-05T10:00:00Z');
    await as('authenticated', USER_B);
  });

  it('sees none of the family rows', async () => {
    expect((await db.query('select * from public.progress_events')).rows).toEqual([]);
    expect(await summary()).toEqual([]);
    expect((await db.query('select * from public.learner_visits')).rows).toEqual([]);
  });

  it('cannot write rows for the family account', async () => {
    await expect(
      db.query(
        `insert into public.progress_events (user_id, id, learner_id, lesson_id, kind, key, correct, at)
         values ($1, 'x1', 'sophia', 'g6-science/six-kingdoms', 'item', 'check:abc123', 1, now())`,
        [USER_A],
      ),
    ).rejects.toThrow(/row-level security/);
    await expect(
      db.query(
        `insert into public.learner_visits (user_id, learner_id, lesson_id, visited_at)
         values ($1, 'sophia', 'g6-math/ratios-and-rates', now())`,
        [USER_A],
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('cannot move the family visit', async () => {
    await db.exec(`update public.learner_visits set visited_at = now() + interval '1 day'`);
    await asOwner();
    const rows = await db.query<{ visited_at: Date }>('select visited_at from public.learner_visits');
    expect(rows.rows.map((r) => r.visited_at.toISOString())).toEqual(['2026-10-05T10:00:00.000Z']);
  });

  it('writes its own rows separately, even with the same event id', async () => {
    await insertEvents([{ id: 'e1', correct: 0, at: '2026-10-01T11:00:00Z' }]);
    expect((await summary()).map((r) => [r.answered, r.correct])).toEqual([[1, 0]]);
    await as('authenticated', USER_A);
    expect((await summary()).map((r) => [r.answered, r.correct])).toEqual([[1, 1]]);
  });
});

describe('signed out (anon)', () => {
  beforeEach(async () => {
    await as('anon');
  });

  for (const table of ['progress_events', 'progress_summary', 'learner_visits']) {
    it(`cannot read ${table}`, async () => {
      await expect(db.query(`select * from public.${table}`)).rejects.toThrow(/permission denied/);
    });
  }

  it('cannot insert events or visits', async () => {
    await expect(insertEvents([{ id: 'e1', correct: 1, at: '2026-10-01T10:00:00Z' }])).rejects.toThrow(
      /permission denied/,
    );
    await expect(upsertVisit('g6-science/six-kingdoms', '2026-10-05T10:00:00Z')).rejects.toThrow(
      /permission denied/,
    );
  });

  it('cannot call the trigger function through the API', async () => {
    await asOwner();
    const privileges = await db.query<{ role: string; allowed: boolean }>(
      `select role, has_function_privilege(role, 'public.keep_newest_visit()', 'execute') as allowed
       from unnest(array['anon', 'authenticated']) as role`,
    );
    expect(privileges.rows).toEqual([
      { role: 'anon', allowed: false },
      { role: 'authenticated', allowed: false },
    ]);
  });
});
