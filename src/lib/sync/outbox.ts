/**
 * The sync outbox: answers and visits recorded on this device that the sync service has not
 * acknowledged yet, plus the few keys the sync engine keeps about this device.
 *
 * Storage is injectable so unit tests can use an in-memory store; the default wraps localStorage
 * and, like src/lib/progress.ts, treats every access as fallible (private mode, full or blocked).
 */
import { getSyncConfig } from './config';
import type { ProgressEvent, Visit, Visits } from './model';

export interface KeyValueStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

export const browserStore: KeyValueStore = {
  get(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Storage full or blocked: the outbox is best-effort, like the cache.
    }
  },
  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      // Ignore: nothing to clean up if storage is unavailable.
    }
  },
};

export const OUTBOX_KEY = 'studyflix:v2:outbox';
export const DEVICE_KEY = 'studyflix:v2:device';
export const SYNC_USER_KEY = 'studyflix:v2:sync:user';
export const SYNC_LAST_KEY = 'studyflix:v2:sync:last';

/** Window event fired when something is added to the outbox, so the engine can send it soon. */
export const OUTBOX_EVENT = 'studyflix:outbox';

const VERSION = 1;

export interface Outbox {
  version: number;
  events: ProgressEvent[];
  /** The newest unsent visit per learner. */
  visits: Visits;
}

const empty = (): Outbox => ({ version: VERSION, events: [], visits: {} });

export function readOutbox(storage: KeyValueStore = browserStore): Outbox {
  try {
    const raw = storage.get(OUTBOX_KEY);
    const parsed = raw ? (JSON.parse(raw) as Outbox) : undefined;
    if (parsed?.version === VERSION && Array.isArray(parsed.events)) {
      return { version: VERSION, events: parsed.events, visits: parsed.visits ?? {} };
    }
  } catch {
    // Corrupt outbox: start fresh. The cache still holds the progress itself.
  }
  return empty();
}

export function writeOutbox(outbox: Outbox, storage: KeyValueStore = browserStore): void {
  if (outbox.events.length === 0 && Object.keys(outbox.visits).length === 0) {
    storage.remove(OUTBOX_KEY);
  } else {
    storage.set(OUTBOX_KEY, JSON.stringify({ ...outbox, version: VERSION }));
  }
}

/**
 * Whether answers on this device should be queued: only when sync is configured and the device
 * has synced before. Until its first sign-in the cache alone is the record, and the first sync
 * uploads it (see `importRowsFromStore`), so the outbox never grows on devices that never sync.
 */
export function isQueueing(storage: KeyValueStore = browserStore): boolean {
  return getSyncConfig() !== null && storage.get(SYNC_USER_KEY) !== null;
}

function notify(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(OUTBOX_EVENT));
}

export function enqueueEvent(event: ProgressEvent, storage: KeyValueStore = browserStore): void {
  if (!isQueueing(storage)) return;
  const outbox = readOutbox(storage);
  outbox.events.push(event);
  writeOutbox(outbox, storage);
  notify();
}

export function enqueueVisit(learner: string, visit: Visit, storage: KeyValueStore = browserStore): void {
  if (!isQueueing(storage)) return;
  const outbox = readOutbox(storage);
  const current = outbox.visits[learner];
  if (!current || visit.at >= current.at) outbox.visits[learner] = visit;
  writeOutbox(outbox, storage);
  notify();
}

/**
 * Remove what the sync service acknowledged, re-reading the outbox first so anything added while
 * the request was in flight survives. A visit is removed only if no newer one replaced it.
 */
export function acknowledge(
  sent: { eventIds?: Iterable<string>; visits?: Visits },
  storage: KeyValueStore = browserStore,
): void {
  const ids = new Set(sent.eventIds ?? []);
  const outbox = readOutbox(storage);
  outbox.events = outbox.events.filter((event) => !ids.has(event.id));
  for (const [learner, visit] of Object.entries(sent.visits ?? {})) {
    const current = outbox.visits[learner];
    if (current && current.at === visit.at && current.lesson === visit.lesson) delete outbox.visits[learner];
  }
  writeOutbox(outbox, storage);
}

/** How many answers are waiting to be sent (an imported row carries several). */
export function pendingAnswers(storage: KeyValueStore = browserStore): number {
  return readOutbox(storage).events.reduce((sum, event) => sum + event.answered, 0);
}

/** A random id for this device, created on first use. */
export function getDeviceId(storage: KeyValueStore = browserStore): string {
  const existing = storage.get(DEVICE_KEY);
  if (existing) return existing;
  const id = randomId();
  storage.set(DEVICE_KEY, id);
  return id;
}

export function randomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  // Insecure contexts (plain http on a LAN address) have no randomUUID; ids only need to be unique.
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}
