/**
 * The sync engine: keeps this device's progress cache and the family's Supabase data in step.
 *
 * Local first. Pages only ever read the synchronous cache in src/lib/progress.ts; this engine
 * sends the outbox, pulls the server summary and rebuilds the cache, then fires `studyflix:progress`
 * so every component refreshes. A sync run (on page load, when the browser comes back online, when
 * the tab becomes visible, and shortly after a new answer):
 *   1. adopt: if this device last synced with another account (or never), replace the outbox with
 *      the device's whole cached history, so earlier progress is uploaded exactly once;
 *   2. flush the outbox and remove only what the service acknowledged;
 *   3. pull the summary (paged) and the last visits;
 *   4. rebuild the cache from the summary with still-pending answers on top.
 *
 * @supabase/supabase-js is loaded with a dynamic import(), and only once a session is stored or a
 * parent signs in, so signed-out and unconfigured devices never download it or touch the network.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { getCachedProgress, replaceCache } from '../progress';
import { getSyncConfig } from './config';
import {
  fromRemoteSummary,
  fromRemoteVisits,
  importRowsFromStore,
  mergeVisits,
  type ProgressByLearner,
  type RemoteEvent,
  type RemoteSummaryRow,
  type RemoteVisit,
  rebuildCache,
  type SummaryRow,
  toRemoteEvent,
  toRemoteVisit,
  type Visits,
} from './model';
import {
  acknowledge,
  browserStore,
  getDeviceId,
  type KeyValueStore,
  OUTBOX_EVENT,
  pendingAnswers,
  readOutbox,
  SYNC_LAST_KEY,
  SYNC_USER_KEY,
  writeOutbox,
} from './outbox';

/** Where supabase-js keeps this device's session. */
export const AUTH_STORAGE_KEY = 'studyflix:v2:auth';
/** Window event fired with the new SyncState as `detail` whenever it changes. */
export const SYNC_EVENT = 'studyflix:sync';

/** PostgREST caps the rows per request (1000 by default), so the summary is read in pages. */
const PAGE_SIZE = 1000;
/** Events per insert request, so a large first upload is acknowledged bit by bit. */
const CHUNK_SIZE = 500;
/** Wait this long after an answer before sending, so a burst of answers goes in one request. */
const SEND_DELAY_MS = 800;

/* ------------------------------------------------------------ One sync run (testable) */

/** The few calls a sync run makes. Each throws when the service cannot be reached or refuses. */
export interface SyncBackend {
  insertEvents(rows: RemoteEvent[]): Promise<void>;
  upsertVisits(rows: RemoteVisit[]): Promise<void>;
  summaryPage(from: number, to: number): Promise<RemoteSummaryRow[]>;
  visits(): Promise<RemoteVisit[]>;
}

export interface CacheAccess {
  read(): { learners: ProgressByLearner; visits: Visits };
  replace(learners: ProgressByLearner, visits: Visits): void;
}

export const progressCache: CacheAccess = { read: getCachedProgress, replace: replaceCache };

export interface SyncOptions {
  storage?: KeyValueStore;
  cache?: CacheAccess;
  now?: () => number;
}

/** Step 1: on a device's first sync with this account, queue its whole cached history. */
export function adopt(
  userId: string,
  { storage = browserStore, cache = progressCache }: SyncOptions = {},
): void {
  if (storage.get(SYNC_USER_KEY) === userId) return;
  const { learners, visits } = cache.read();
  writeOutbox(
    { version: 1, events: importRowsFromStore({ learners }, getDeviceId(storage)), visits },
    storage,
  );
  storage.set(SYNC_USER_KEY, userId);
}

/** Step 2: send the outbox. Entries are removed only once acknowledged; on failure this throws. */
export async function flush(backend: SyncBackend, storage: KeyValueStore = browserStore): Promise<void> {
  const { events, visits } = readOutbox(storage);
  for (let start = 0; start < events.length; start += CHUNK_SIZE) {
    const chunk = events.slice(start, start + CHUNK_SIZE);
    await backend.insertEvents(chunk.map(toRemoteEvent));
    acknowledge({ eventIds: chunk.map((event) => event.id) }, storage);
  }
  const pendingVisits = Object.entries(visits);
  if (pendingVisits.length > 0) {
    await backend.upsertVisits(pendingVisits.map(([learner, visit]) => toRemoteVisit(learner, visit)));
    acknowledge({ visits }, storage);
  }
}

/** Step 3: read the whole summary, page by page, and the last visits. */
export async function pull(backend: SyncBackend): Promise<{ rows: SummaryRow[]; visits: Visits }> {
  const rows: SummaryRow[] = [];
  // Advance by what came back and stop at an empty page, so a server with a lower row cap than
  // PAGE_SIZE still returns everything.
  for (;;) {
    const page = await backend.summaryPage(rows.length, rows.length + PAGE_SIZE - 1);
    if (page.length === 0) break;
    rows.push(...page.map(fromRemoteSummary));
  }
  return { rows, visits: fromRemoteVisits(await backend.visits()) };
}

/** A whole sync run for the signed-in user. Throws if the service cannot be reached. */
export async function syncOnce(
  userId: string,
  backend: SyncBackend,
  options: SyncOptions = {},
): Promise<void> {
  const { storage = browserStore, cache = progressCache, now = Date.now } = options;
  adopt(userId, { storage, cache });
  await flush(backend, storage);
  const remote = await pull(backend);
  // Step 4, synchronously so nothing recorded meanwhile is missed: answers added during the
  // requests are still in the outbox and are applied on top of the server summary.
  const pending = readOutbox(storage).events;
  cache.replace(rebuildCache(remote.rows, pending), mergeVisits(cache.read().visits, remote.visits));
  storage.set(SYNC_LAST_KEY, String(now()));
}

/** The SyncBackend for a supabase-js client signed in as `userId`. */
export function supabaseBackend(client: SupabaseClient, userId: string): SyncBackend {
  const check = ({ error }: { error: unknown }) => {
    if (error) throw error;
  };
  return {
    async insertEvents(rows) {
      check(
        await client.from('progress_events').upsert(
          rows.map((row) => ({ ...row, user_id: userId })),
          { onConflict: 'user_id,id', ignoreDuplicates: true },
        ),
      );
    },
    async upsertVisits(rows) {
      check(
        await client.from('learner_visits').upsert(
          rows.map((row) => ({ ...row, user_id: userId })),
          { onConflict: 'user_id,learner_id' },
        ),
      );
    },
    async summaryPage(from, to) {
      const result = await client
        .from('progress_summary')
        .select('learner_id,lesson_id,kind,key,answered,correct,at')
        .order('learner_id')
        .order('lesson_id')
        .order('kind')
        .order('key')
        .range(from, to);
      check(result);
      return (result.data ?? []) as RemoteSummaryRow[];
    },
    async visits() {
      const result = await client.from('learner_visits').select('learner_id,lesson_id,visited_at');
      check(result);
      return (result.data ?? []) as RemoteVisit[];
    },
  };
}

/* ------------------------------------------------------------ The engine in the browser */

export interface SyncState {
  /** `starting` until the first check, `off` when sync is not configured for this site. */
  status: 'starting' | 'off' | 'signed-out' | 'signed-in';
  /** The family account, when signed in. */
  email?: string;
  /** What the last or current run is doing (signed in only). */
  phase: 'idle' | 'syncing' | 'error';
  /** Answers recorded on this device and not yet acknowledged by the service. */
  pending: number;
  /** When this device last synced successfully (ms), if ever. */
  lastSync: number | null;
}

export type SignInResult = 'ok' | 'credentials' | 'network';

/** The sync status line on the family sign-in page. */
export function syncStatusText(state: Pick<SyncState, 'phase' | 'pending'>): string {
  if (state.phase === 'syncing') return 'Syncing...';
  if (state.phase === 'error') {
    return 'Could not reach the sync service. Progress is saved on this device and will sync when the connection is back.';
  }
  if (state.pending === 1) return '1 answer waiting to sync.';
  if (state.pending > 1) return `${state.pending} answers waiting to sync.`;
  return 'Everything is synced.';
}

let state: SyncState = { status: 'starting', phase: 'idle', pending: 0, lastSync: null };
const listeners = new Set<(state: SyncState) => void>();
let started = false;
let clientPromise: Promise<SupabaseClient> | null = null;
let running: Promise<void> | null = null;
let runAgain = false;
let sendTimer: ReturnType<typeof setTimeout> | undefined;

function setState(patch: Partial<SyncState>): void {
  const last = Number(browserStore.get(SYNC_LAST_KEY));
  state = { ...state, ...patch, pending: pendingAnswers(), lastSync: last > 0 ? last : null };
  if (state.status !== 'signed-in') state = { ...state, email: undefined, phase: 'idle' };
  for (const listener of listeners) listener(state);
  window.dispatchEvent(new CustomEvent<SyncState>(SYNC_EVENT, { detail: state }));
}

export function getSyncState(): SyncState {
  return state;
}

/** Call `listener` now and on every change; returns a function that stops listening. */
export function onSyncState(listener: (state: SyncState) => void): () => void {
  listeners.add(listener);
  listener(state);
  return () => listeners.delete(listener);
}

/** The session supabase-js stored on this device, read without loading the library. */
function storedSession(): { email?: string } | null {
  const raw = browserStore.get(AUTH_STORAGE_KEY);
  if (!raw) return null;
  try {
    const session = JSON.parse(raw) as { user?: { email?: unknown } } | null;
    return { email: typeof session?.user?.email === 'string' ? session.user.email : undefined };
  } catch {
    return {};
  }
}

function getClient(): Promise<SupabaseClient> {
  const config = getSyncConfig();
  if (!config) return Promise.reject(new Error('Sync is not configured'));
  clientPromise ??= import('@supabase/supabase-js')
    .then(({ createClient }) => {
      const client = createClient(config.url, config.key, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
          storageKey: AUTH_STORAGE_KEY,
        },
      });
      client.auth.onAuthStateChange((event, session) => {
        // Never call back into supabase-js from inside its own callback.
        setTimeout(() => {
          if (event === 'SIGNED_OUT' && state.status === 'signed-in') setState({ status: 'signed-out' });
          if (event === 'SIGNED_IN' && session && state.status !== 'signed-in') {
            setState({ status: 'signed-in', email: session.user.email });
            requestSync();
          }
        });
      });
      return client;
    })
    .catch((error: unknown) => {
      // Offline before the library was ever downloaded: try again next time.
      clientPromise = null;
      throw error;
    });
  return clientPromise;
}

/** Start the engine on this page. Safe to call more than once; does nothing if not configured. */
export function startSync(): void {
  if (started) return;
  started = true;
  if (!getSyncConfig()) {
    setState({ status: 'off' });
    return;
  }
  window.addEventListener('online', requestSync);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' || pendingAnswers() > 0) requestSync();
  });
  window.addEventListener(OUTBOX_EVENT, () => {
    if (state.status !== 'signed-in') return;
    setState({});
    clearTimeout(sendTimer);
    sendTimer = setTimeout(requestSync, SEND_DELAY_MS);
  });
  window.addEventListener('storage', (event) => {
    // Another tab signed this device in or out.
    if (event.key !== AUTH_STORAGE_KEY) return;
    if (event.newValue && state.status === 'signed-out') resume();
    if (!event.newValue && state.status === 'signed-in') setState({ status: 'signed-out' });
  });
  resume();
}

function resume(): void {
  const stored = storedSession();
  if (!stored) {
    setState({ status: 'signed-out' });
    return;
  }
  setState({ status: 'signed-in', email: stored.email ?? state.email, phase: 'syncing' });
  requestSync();
}

/** Run a sync now (or right after the current one) if this device is signed in. */
export function requestSync(): void {
  if (state.status !== 'signed-in') return;
  void run();
}

function run(): Promise<void> {
  if (running) {
    runAgain = true;
    return running;
  }
  running = (async () => {
    do {
      runAgain = false;
      setState({ phase: 'syncing' });
      try {
        const client = await getClient();
        const { data, error } = await client.auth.getSession();
        if (!data.session) {
          // No error means the session is really gone (signed out elsewhere, or revoked).
          if (error) throw error;
          setState({ status: 'signed-out' });
          return;
        }
        await syncOnce(data.session.user.id, supabaseBackend(client, data.session.user.id));
        setState({ phase: 'idle', email: data.session.user.email ?? state.email });
      } catch {
        // Offline, paused project or server trouble: progress stays queued on this device.
        setState({ phase: 'error' });
      }
    } while (runAgain && state.status === 'signed-in');
  })().finally(() => {
    running = null;
  });
  return running;
}

/** Sign this device in to the family account, then sync. */
export async function signIn(email: string, password: string): Promise<SignInResult> {
  let client: SupabaseClient;
  try {
    client = await getClient();
  } catch {
    return 'network';
  }
  try {
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error || !data.session) {
      const { code, status, name } = (error ?? {}) as { code?: string; status?: number; name?: string };
      return code === 'invalid_credentials' || (name === 'AuthApiError' && status === 400)
        ? 'credentials'
        : 'network';
    }
    setState({ status: 'signed-in', email: data.session.user.email ?? email, phase: 'syncing' });
    void run();
    return 'ok';
  } catch {
    return 'network';
  }
}

/**
 * Sign this device out. The cache, the outbox and the account this device synced with stay, so
 * answers given while signed out are sent at the next sign-in.
 */
export async function signOut(): Promise<void> {
  try {
    const client = await getClient();
    await client.auth.signOut({ scope: 'local' });
  } catch {
    // Offline: forgetting the session on this device is all that matters.
  }
  for (const suffix of ['', '-user', '-code-verifier']) browserStore.remove(`${AUTH_STORAGE_KEY}${suffix}`);
  clearTimeout(sendTimer);
  setState({ status: 'signed-out' });
}
