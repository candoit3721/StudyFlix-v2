/**
 * Progress sync: the pure model, the outbox and one sync run against in-memory fakes.
 * The browser globals progress.ts uses (localStorage, window) are stubbed with in-memory versions.
 */
import { createClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getCachedProgress,
  getLastVisit,
  getLessonProgress,
  recordItem,
  recordPractice,
  recordVisit,
} from '../../src/lib/progress';
import { createRng } from '../../src/lib/rng';
import { getSyncConfig } from '../../src/lib/sync/config';
import {
  flush,
  pull,
  type SyncBackend,
  supabaseBackend,
  syncOnce,
  syncStatusText,
} from '../../src/lib/sync/engine';
import {
  foldSummary,
  fromRemoteSummary,
  importRowsFromStore,
  lastVisitText,
  mergeVisits,
  type ProgressEvent,
  type ProgressStore,
  type RemoteEvent,
  type RemoteSummaryRow,
  type RemoteVisit,
  rebuildCache,
  summarise,
} from '../../src/lib/sync/model';
import {
  acknowledge,
  DEVICE_KEY,
  enqueueEvent,
  type KeyValueStore,
  OUTBOX_KEY,
  pendingAnswers,
  readOutbox,
  SYNC_LAST_KEY,
  SYNC_USER_KEY,
} from '../../src/lib/sync/outbox';

/* ------------------------------------------------------------ Fakes */

class MemoryStorage {
  private map = new Map<string, string>();
  get length(): number {
    return this.map.size;
  }
  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null;
  }
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  clear(): void {
    this.map.clear();
  }
}

const memory = new MemoryStorage();
const storage: KeyValueStore = {
  get: (key) => memory.getItem(key),
  set: (key, value) => memory.setItem(key, value),
  remove: (key) => memory.removeItem(key),
};

type Override = { url: string; key: string } | null | undefined;
const setOverride = (value: Override) => {
  (globalThis as { __STUDYFLIX_SYNC__?: Override }).__STUDYFLIX_SYNC__ = value;
};

const CONFIG = { url: 'https://example.supabase.co', key: 'sb_publishable_test' };
const USER = '00000000-0000-4000-8000-00000000000a';

/** An in-memory stand-in for the database, with the same rules as the migration. */
class FakeService implements SyncBackend {
  events = new Map<string, RemoteEvent>();
  visitRows = new Map<string, RemoteVisit>();
  failure: 'network' | 'http' | null = null;
  /** PostgREST's row cap per request. */
  maxRows = 1000;
  insertCalls = 0;
  beforeInsert?: () => void;
  beforePull?: () => void;

  private fail(): void {
    if (this.failure === 'network') throw new TypeError('Failed to fetch');
    if (this.failure === 'http') throw Object.assign(new Error('Service Unavailable'), { status: 503 });
  }

  async insertEvents(rows: RemoteEvent[]): Promise<void> {
    this.insertCalls += 1;
    this.beforeInsert?.();
    this.fail();
    for (const row of rows) if (!this.events.has(row.id)) this.events.set(row.id, row);
  }

  async upsertVisits(rows: RemoteVisit[]): Promise<void> {
    this.fail();
    for (const row of rows) {
      const current = this.visitRows.get(row.learner_id);
      if (!current || Date.parse(row.visited_at) > Date.parse(current.visited_at)) {
        this.visitRows.set(row.learner_id, row);
      }
    }
  }

  summary(): RemoteSummaryRow[] {
    const rows = summarise(
      [...this.events.values()].map((e) => ({
        id: e.id,
        learner: e.learner_id,
        lesson: e.lesson_id,
        kind: e.kind,
        key: e.key,
        answered: e.answered,
        correct: e.correct,
        at: Date.parse(e.at),
      })),
    );
    return rows
      .map((r) => ({
        learner_id: r.learner,
        lesson_id: r.lesson,
        kind: r.kind,
        key: r.key,
        answered: r.answered,
        correct: r.correct,
        at: new Date(r.at).toISOString(),
      }))
      .sort((a, b) =>
        [a.learner_id, a.lesson_id, a.kind, a.key].join('\0') <
        [b.learner_id, b.lesson_id, b.kind, b.key].join('\0')
          ? -1
          : 1,
      );
  }

  async summaryPage(from: number, to: number): Promise<RemoteSummaryRow[]> {
    this.beforePull?.();
    this.fail();
    return this.summary().slice(from, Math.min(to + 1, from + this.maxRows));
  }

  async visits(): Promise<RemoteVisit[]> {
    this.fail();
    return [...this.visitRows.values()];
  }
}

beforeEach(() => {
  memory.clear();
  vi.stubGlobal('localStorage', memory);
  vi.stubGlobal('window', new EventTarget());
  setOverride(null);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  setOverride(undefined);
});

/* ------------------------------------------------------------ Random answer sequences */

const LEARNERS = ['sophia', 'leo'];
const LESSONS = ['g6-science/six-kingdoms', 'g6-math/ratios-and-rates', 'math-contest-club/pairing-trick'];
const KEYS = ['check:a1', 'check:b2', 'warm-up:c3', 'practice'];

/** Record a seeded random sequence of answers through progress.ts; returns the matching events. */
function recordRandomAnswers(seed: number, count: number): ProgressEvent[] {
  const rng = createRng(`answers-${seed}`);
  let now = Date.UTC(2026, 9, 1, 9, 0, 0) + rng.int(0, 1000);
  const events: ProgressEvent[] = [];
  vi.useFakeTimers({ toFake: ['Date'] });
  for (let i = 0; i < count; i++) {
    now += rng.int(0, 5000);
    vi.setSystemTime(now);
    const learner = rng.pick(LEARNERS);
    const lesson = rng.pick(LESSONS);
    const kind = rng.next() < 0.4 ? 'practice' : 'item';
    const key = kind === 'practice' ? rng.pick(['practice', 'drill']) : rng.pick(KEYS);
    const correct = rng.next() < 0.55;
    if (kind === 'item') recordItem(learner, lesson, key, correct);
    else recordPractice(learner, lesson, key, correct);
    events.push({
      id: `e${seed}-${i}`,
      learner,
      lesson,
      kind,
      key,
      answered: 1,
      correct: correct ? 1 : 0,
      at: now,
    });
  }
  vi.useRealTimers();
  return events;
}

describe('model: the server summary folds back into the same cache', () => {
  it('matches what recordItem and recordPractice build, for many random sequences', () => {
    for (let seed = 0; seed < 60; seed++) {
      memory.clear();
      const events = recordRandomAnswers(seed, 1 + (seed % 7) * 9);
      expect(getCachedProgress().learners, `seed ${seed}`).toEqual(foldSummary(summarise(events)));
    }
  });

  it('keeps an item correct once correct, and counts every attempt', () => {
    const cache = foldSummary(
      summarise([
        { id: '1', learner: 'sophia', lesson: 'l', kind: 'item', key: 'q', answered: 1, correct: 0, at: 10 },
        { id: '2', learner: 'sophia', lesson: 'l', kind: 'item', key: 'q', answered: 1, correct: 1, at: 30 },
        { id: '3', learner: 'sophia', lesson: 'l', kind: 'item', key: 'q', answered: 1, correct: 0, at: 20 },
      ]),
    );
    expect(cache.sophia?.lessons.l?.items.q).toEqual({ correct: true, attempts: 3, at: 30 });
  });

  it('rebuilding from a pulled summary plus pending answers equals having them on the server', () => {
    for (let seed = 0; seed < 40; seed++) {
      memory.clear();
      const events = recordRandomAnswers(seed, 30);
      const split = createRng(`split-${seed}`).int(0, events.length);
      const onServer = events.slice(0, split);
      const pending = events.slice(split);
      expect(rebuildCache(summarise(onServer), pending), `seed ${seed}`).toEqual(
        foldSummary(summarise(events)),
      );
    }
  });
});

describe('model: importing a device history', () => {
  const store: ProgressStore = {
    version: 1,
    learners: {
      sophia: {
        lessons: {
          'g6-science/six-kingdoms': {
            items: {
              'check:a1': { correct: true, attempts: 3, at: 1000 },
              'check:b2': { correct: false, attempts: 2, at: 2000 },
            },
            practice: {},
          },
          'math-contest-club/pairing-trick': {
            items: {},
            practice: {
              practice: { answered: 5, correct: 4, at: 3000 },
              empty: { answered: 0, correct: 0, at: 0 },
            },
          },
        },
      },
    },
  };

  it('gives one row per item and per practice block, skipping empty practice', () => {
    expect(importRowsFromStore(store, 'device-1')).toEqual([
      {
        id: 'import:device-1:sophia:g6-science/six-kingdoms:item:check:a1',
        learner: 'sophia',
        lesson: 'g6-science/six-kingdoms',
        kind: 'item',
        key: 'check:a1',
        answered: 3,
        correct: 1,
        at: 1000,
      },
      {
        id: 'import:device-1:sophia:g6-science/six-kingdoms:item:check:b2',
        learner: 'sophia',
        lesson: 'g6-science/six-kingdoms',
        kind: 'item',
        key: 'check:b2',
        answered: 2,
        correct: 0,
        at: 2000,
      },
      {
        id: 'import:device-1:sophia:math-contest-club/pairing-trick:practice:practice',
        learner: 'sophia',
        lesson: 'math-contest-club/pairing-trick',
        kind: 'practice',
        key: 'practice',
        answered: 5,
        correct: 4,
        at: 3000,
      },
    ]);
  });

  it('is deterministic per device, and different across devices', () => {
    const ids = (device: string) => importRowsFromStore(store, device).map((row) => row.id);
    expect(ids('device-1')).toEqual(ids('device-1'));
    expect(ids('device-2').some((id) => ids('device-1').includes(id))).toBe(false);
  });

  it('round-trips: importing a cache and folding it gives the cache back', () => {
    for (let seed = 0; seed < 20; seed++) {
      memory.clear();
      recordRandomAnswers(seed, 40);
      const { learners } = getCachedProgress();
      const imported = foldSummary(summarise(importRowsFromStore({ learners }, 'd')));
      expect(imported, `seed ${seed}`).toEqual(learners);
    }
  });

  it('repairs impossible counts so the database accepts them', () => {
    const rows = importRowsFromStore(
      {
        learners: {
          a: {
            lessons: {
              l: {
                items: { q: { correct: true, attempts: 0, at: 1 } },
                practice: { p: { answered: 2, correct: 5, at: 1 } },
              },
            },
          },
        },
      },
      'd',
    );
    expect(rows.map((r) => [r.answered, r.correct])).toEqual([
      [1, 1],
      [2, 2],
    ]);
  });
});

describe('model: visits', () => {
  it('mergeVisits keeps the newer visit per learner, from either side', () => {
    const local = { sophia: { lesson: 'a', at: 200 }, leo: { lesson: 'b', at: 100 } };
    const remote = {
      sophia: { lesson: 'c', at: 150 },
      leo: { lesson: 'd', at: 300 },
      mia: { lesson: 'e', at: 1 },
    };
    expect(mergeVisits(local, remote)).toEqual({
      sophia: { lesson: 'a', at: 200 },
      leo: { lesson: 'd', at: 300 },
      mia: { lesson: 'e', at: 1 },
    });
    expect(mergeVisits(remote, local)).toEqual(mergeVisits(local, remote));
  });

  it('formats the last visit in local time', () => {
    const now = new Date(2026, 9, 12, 8, 30).getTime();
    expect(lastVisitText(new Date(2026, 9, 12, 0, 5).getTime(), now)).toBe('Last visit: today');
    expect(lastVisitText(new Date(2026, 9, 11, 23, 55).getTime(), now)).toBe('Last visit: yesterday');
    expect(lastVisitText(new Date(2026, 9, 5, 12, 0).getTime(), now)).toBe('Last visit: Monday, October 5');
    expect(lastVisitText(new Date(2026, 0, 1, 12, 0).getTime(), now)).toBe('Last visit: Thursday, January 1');
  });

  it('recordVisit remembers the last lesson per learner', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(5000);
    recordVisit('sophia', 'g6-science/six-kingdoms');
    vi.setSystemTime(6000);
    recordVisit('sophia', 'g6-math/ratios-and-rates');
    expect(getLastVisit('sophia')).toEqual({ lesson: 'g6-math/ratios-and-rates', at: 6000 });
    expect(getLastVisit('leo')).toBeNull();
  });
});

describe('config', () => {
  it('treats missing or empty values as not configured', () => {
    setOverride(undefined);
    vi.stubEnv('PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('PUBLIC_SUPABASE_PUBLISHABLE_KEY', '');
    expect(getSyncConfig()).toBeNull();
    vi.stubEnv('PUBLIC_SUPABASE_URL', CONFIG.url);
    expect(getSyncConfig()).toBeNull();
    vi.stubEnv('PUBLIC_SUPABASE_PUBLISHABLE_KEY', CONFIG.key);
    expect(getSyncConfig()).toEqual(CONFIG);
  });

  it('lets the test override replace the build config', () => {
    vi.stubEnv('PUBLIC_SUPABASE_URL', CONFIG.url);
    vi.stubEnv('PUBLIC_SUPABASE_PUBLISHABLE_KEY', CONFIG.key);
    setOverride(null);
    expect(getSyncConfig()).toBeNull();
    setOverride({ url: 'http://localhost/__fake-supabase', key: 'test-key' });
    expect(getSyncConfig()).toEqual({ url: 'http://localhost/__fake-supabase', key: 'test-key' });
    setOverride({ url: '', key: 'test-key' });
    expect(getSyncConfig()).toBeNull();
  });
});

describe('outbox', () => {
  const event = (id: string): ProgressEvent => ({
    id,
    learner: 'sophia',
    lesson: 'l',
    kind: 'item',
    key: 'q',
    answered: 1,
    correct: 1,
    at: 1,
  });

  it('queues answers only when sync is configured and the device has synced before', () => {
    recordItem('sophia', 'l', 'q', true);
    expect(memory.getItem(OUTBOX_KEY)).toBeNull();

    setOverride(CONFIG);
    recordItem('sophia', 'l', 'q', true);
    expect(memory.getItem(OUTBOX_KEY)).toBeNull();

    memory.setItem(SYNC_USER_KEY, USER);
    recordItem('sophia', 'l', 'q', false);
    recordPractice('sophia', 'l', 'p', true);
    recordVisit('sophia', 'l');
    const outbox = readOutbox(storage);
    expect(outbox.events.map((e) => [e.kind, e.key, e.answered, e.correct])).toEqual([
      ['item', 'q', 1, 0],
      ['practice', 'p', 1, 1],
    ]);
    expect(new Set(outbox.events.map((e) => e.id)).size).toBe(2);
    expect(Object.keys(outbox.visits)).toEqual(['sophia']);
  });

  it('queues the same answers the cache records', () => {
    setOverride(CONFIG);
    memory.setItem(SYNC_USER_KEY, USER);
    const events = recordRandomAnswers(7, 50);
    const queued = readOutbox(storage).events;
    expect(summarise(queued)).toEqual(summarise(events));
    expect(pendingAnswers(storage)).toBe(50);
  });

  it('acknowledges only what was sent, and only an unchanged visit', () => {
    setOverride(CONFIG);
    memory.setItem(SYNC_USER_KEY, USER);
    enqueueEvent(event('a'), storage);
    enqueueEvent(event('b'), storage);
    const sentVisits = { sophia: { lesson: 'l1', at: 10 } };
    memory.setItem(
      OUTBOX_KEY,
      JSON.stringify({
        ...readOutbox(storage),
        visits: { sophia: { lesson: 'l2', at: 20 }, leo: { lesson: 'x', at: 5 } },
      }),
    );
    acknowledge({ eventIds: ['a'], visits: { ...sentVisits, leo: { lesson: 'x', at: 5 } } }, storage);
    const outbox = readOutbox(storage);
    expect(outbox.events.map((e) => e.id)).toEqual(['b']);
    expect(outbox.visits).toEqual({ sophia: { lesson: 'l2', at: 20 } });
  });

  it('survives corrupt storage', () => {
    memory.setItem(OUTBOX_KEY, '{not json');
    expect(readOutbox(storage)).toEqual({ version: 1, events: [], visits: {} });
  });
});

describe('engine: one sync run', () => {
  beforeEach(() => {
    setOverride(CONFIG);
  });

  it('uploads earlier progress at the first sign-in, exactly once', async () => {
    const service = new FakeService();
    recordRandomAnswers(3, 25);
    recordVisit('sophia', 'g6-science/six-kingdoms');
    const before = getCachedProgress().learners;
    expect(memory.getItem(OUTBOX_KEY)).toBeNull();

    await syncOnce(USER, service, { storage });
    expect(memory.getItem(SYNC_USER_KEY)).toBe(USER);
    expect(memory.getItem(DEVICE_KEY)).toBeTruthy();
    expect(Number(memory.getItem(SYNC_LAST_KEY))).toBeGreaterThan(0);
    expect(readOutbox(storage).events).toEqual([]);
    expect(foldSummary(service.summary().map(fromRemoteSummary))).toEqual(before);
    expect(getCachedProgress().learners).toEqual(before);
    expect(service.visitRows.get('sophia')?.lesson_id).toBe('g6-science/six-kingdoms');

    // Later runs (reloads, or signing out and in again) never send the history again.
    const sent = service.insertCalls;
    await syncOnce(USER, service, { storage });
    await syncOnce(USER, service, { storage });
    expect(service.insertCalls).toBe(sent);
    expect(foldSummary(service.summary().map(fromRemoteSummary))).toEqual(before);
  });

  it('imports again for a different account', async () => {
    const service = new FakeService();
    recordItem('sophia', 'l', 'q', true);
    await syncOnce(USER, service, { storage });
    const other = new FakeService();
    await syncOnce('00000000-0000-4000-8000-00000000000b', other, { storage });
    expect(other.summary().map((r) => [r.key, r.answered, r.correct])).toEqual([['q', 1, 1]]);
  });

  it('brings in answers from another device, keeping pending local ones on top', async () => {
    const service = new FakeService();
    await syncOnce(USER, service, { storage });
    // Another device answered twice.
    for (const [id, correct] of [
      ['other-1', 0],
      ['other-2', 1],
    ] as const) {
      service.events.set(id, {
        id,
        learner_id: 'sophia',
        lesson_id: 'g6-science/six-kingdoms',
        kind: 'item',
        key: 'check:a1',
        answered: 1,
        correct,
        at: '2026-10-01T10:00:00.000Z',
      });
    }
    // This device answers while the service is down.
    service.failure = 'network';
    recordItem('sophia', 'g6-science/six-kingdoms', 'check:a1', false);
    await expect(syncOnce(USER, service, { storage })).rejects.toThrow();
    expect(getLessonProgress('sophia', 'g6-science/six-kingdoms').items['check:a1']?.attempts).toBe(1);

    service.failure = null;
    await syncOnce(USER, service, { storage });
    expect(getLessonProgress('sophia', 'g6-science/six-kingdoms').items['check:a1']).toMatchObject({
      correct: true,
      attempts: 3,
    });
  });

  it('keeps an answer given while the pull is in flight', async () => {
    const service = new FakeService();
    await syncOnce(USER, service, { storage });
    service.beforePull = () => {
      service.beforePull = undefined;
      recordItem('sophia', 'g6-science/six-kingdoms', 'check:a1', true);
    };
    await syncOnce(USER, service, { storage });
    expect(service.events.size).toBe(0);
    expect(readOutbox(storage).events.map((e) => e.key)).toEqual(['check:a1']);
    expect(getLessonProgress('sophia', 'g6-science/six-kingdoms').items['check:a1']).toMatchObject({
      correct: true,
      attempts: 1,
    });
  });

  it('a flush that fails keeps every outbox entry', async () => {
    memory.setItem(SYNC_USER_KEY, USER);
    recordItem('sophia', 'l', 'q', true);
    recordVisit('sophia', 'l');
    const before = memory.getItem(OUTBOX_KEY);
    for (const failure of ['network', 'http'] as const) {
      const service = new FakeService();
      service.failure = failure;
      await expect(flush(service, storage)).rejects.toThrow();
      expect(memory.getItem(OUTBOX_KEY)).toBe(before);
    }
  });

  it('a successful flush removes only what it sent', async () => {
    memory.setItem(SYNC_USER_KEY, USER);
    recordItem('sophia', 'l', 'q', true);
    const service = new FakeService();
    service.beforeInsert = () => {
      service.beforeInsert = undefined;
      recordItem('sophia', 'l', 'q2', false); // answered while the request is in flight
    };
    await flush(service, storage);
    expect([...service.events.values()].map((e) => e.key)).toEqual(['q']);
    expect(readOutbox(storage).events.map((e) => e.key)).toEqual(['q2']);
  });

  it('pulls every page, even when the server caps rows lower than the page size', async () => {
    const service = new FakeService();
    for (let i = 0; i < 2345; i++) {
      service.events.set(`e${i}`, {
        id: `e${i}`,
        learner_id: 'sophia',
        lesson_id: `lesson-${i % 400}`,
        kind: 'item',
        key: `q${i}`,
        answered: 1,
        correct: 1,
        at: '2026-10-01T10:00:00.000Z',
      });
    }
    for (const cap of [1000, 300]) {
      service.maxRows = cap;
      const { rows } = await pull(service);
      expect(rows).toHaveLength(2345);
    }
  });
});

describe('engine: the Supabase backend', () => {
  type Call = { url: URL; method: string; headers: Headers; body: unknown };

  function clientWith(respond: (call: Call) => Response | Promise<Response>) {
    const calls: Call[] = [];
    const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const call = {
        url: new URL(String(input instanceof Request ? input.url : input)),
        method: init?.method ?? 'GET',
        headers: new Headers(init?.headers),
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      };
      calls.push(call);
      return respond(call);
    };
    const client = createClient(CONFIG.url, CONFIG.key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch },
    });
    return { client, calls };
  }

  beforeEach(() => {
    setOverride(CONFIG);
    memory.setItem(SYNC_USER_KEY, USER);
    recordItem('sophia', 'l', 'q', true);
    recordVisit('sophia', 'l');
  });

  it('keeps the outbox on a network error or an HTTP 5xx', async () => {
    const before = memory.getItem(OUTBOX_KEY);
    const offline = clientWith(() => {
      throw new TypeError('Failed to fetch');
    });
    await expect(flush(supabaseBackend(offline.client, USER), storage)).rejects.toBeTruthy();
    const down = clientWith(() => new Response('{"message":"unavailable"}', { status: 503 }));
    await expect(flush(supabaseBackend(down.client, USER), storage)).rejects.toBeTruthy();
    expect(memory.getItem(OUTBOX_KEY)).toBe(before);
  });

  it('inserts events ignoring duplicates, upserts visits, and empties the outbox', async () => {
    const { client, calls } = clientWith(() => new Response(null, { status: 201 }));
    await flush(supabaseBackend(client, USER), storage);
    expect(memory.getItem(OUTBOX_KEY)).toBeNull();

    const [events, visits] = calls;
    expect(events?.url.pathname).toBe('/rest/v1/progress_events');
    expect(events?.url.searchParams.get('on_conflict')).toBe('user_id,id');
    expect(events?.headers.get('Prefer')).toContain('resolution=ignore-duplicates');
    expect(events?.body).toEqual([
      expect.objectContaining({
        user_id: USER,
        learner_id: 'sophia',
        lesson_id: 'l',
        kind: 'item',
        key: 'q',
      }),
    ]);
    expect(visits?.url.pathname).toBe('/rest/v1/learner_visits');
    expect(visits?.url.searchParams.get('on_conflict')).toBe('user_id,learner_id');
    expect(visits?.headers.get('Prefer')).toContain('resolution=merge-duplicates');
  });

  it('pages the summary in order', async () => {
    const { client, calls } = clientWith(() => Response.json([]));
    await pull(supabaseBackend(client, USER));
    const summary = calls.find((c) => c.url.pathname === '/rest/v1/progress_summary');
    expect(summary?.url.searchParams.get('order')).toBe('learner_id.asc,lesson_id.asc,kind.asc,key.asc');
    expect(summary?.url.searchParams.get('offset')).toBe('0');
    expect(summary?.url.searchParams.get('limit')).toBe('1000');
  });
});

describe('engine: status line', () => {
  it('describes the sync state', () => {
    expect(syncStatusText({ phase: 'syncing', pending: 3 })).toBe('Syncing...');
    expect(syncStatusText({ phase: 'error', pending: 3 })).toBe(
      'Could not reach the sync service. Progress is saved on this device and will sync when the connection is back.',
    );
    expect(syncStatusText({ phase: 'idle', pending: 1 })).toBe('1 answer waiting to sync.');
    expect(syncStatusText({ phase: 'idle', pending: 4 })).toBe('4 answers waiting to sync.');
    expect(syncStatusText({ phase: 'idle', pending: 0 })).toBe('Everything is synced.');
  });
});
