/**
 * The progress model shared by the local cache and the sync service. Pure: no DOM, no storage.
 *
 * Every answer is an event. The server keeps events append-only and sums them per progress key
 * (the `progress_summary` view); the browser folds those sums back into the same cache shape that
 * `recordItem` and `recordPractice` build, using the same reducers, so both always agree:
 *   item     -> { correct: correct > 0, attempts: answered, at: latest }
 *   practice -> { answered, correct, at: latest }
 */

export interface Attempt {
  correct: boolean;
  attempts: number;
  at: number;
}

export interface PracticeStats {
  answered: number;
  correct: number;
  at: number;
}

export interface LessonProgress {
  items: Record<string, Attempt>;
  practice: Record<string, PracticeStats>;
}

/** Cached progress per learner, then per lesson id. */
export type ProgressByLearner = Record<string, { lessons: Record<string, LessonProgress> }>;

/** The `studyflix:v2:progress` cache. */
export interface ProgressStore {
  version: number;
  learners: ProgressByLearner;
}

/** The last lesson a learner opened, and when (ms since the epoch). */
export interface Visit {
  lesson: string;
  at: number;
}

/** Last visit per learner id. */
export type Visits = Record<string, Visit>;

export type EventKind = 'item' | 'practice';

/**
 * One or more answers to one progress key. Live answers have `answered: 1`; rows imported from a
 * device's earlier history carry its totals.
 */
export interface ProgressEvent {
  id: string;
  learner: string;
  lesson: string;
  kind: EventKind;
  /** `<blockId>:<promptHash>` for items, `<blockId>` for practice. */
  key: string;
  answered: number;
  correct: number;
  at: number;
}

/** Totals per progress key, as the `progress_summary` view returns them. */
export type SummaryRow = Omit<ProgressEvent, 'id'>;

/* ------------------------------------------------------------ Reducers */

/** Add answers to a quiz item: once correct it stays correct, and every answer counts as an attempt. */
export function addToItem(
  previous: Attempt | undefined,
  answered: number,
  correct: number,
  at: number,
): Attempt {
  return {
    correct: correct > 0 || Boolean(previous?.correct),
    attempts: (previous?.attempts ?? 0) + answered,
    at: Math.max(previous?.at ?? 0, at),
  };
}

/** Add answers to a practice block: every answer counts, and so does every first-try correct one. */
export function addToPractice(
  previous: PracticeStats | undefined,
  answered: number,
  correct: number,
  at: number,
): PracticeStats {
  return {
    answered: (previous?.answered ?? 0) + answered,
    correct: (previous?.correct ?? 0) + correct,
    at: Math.max(previous?.at ?? 0, at),
  };
}

/** The lesson entry for a learner, created if missing (mutates `learners`). */
export function lessonOf(learners: ProgressByLearner, learner: string, lessonId: string): LessonProgress {
  learners[learner] ??= { lessons: {} };
  const forLearner = learners[learner];
  forLearner.lessons ??= {};
  forLearner.lessons[lessonId] ??= { items: {}, practice: {} };
  const lesson = forLearner.lessons[lessonId];
  lesson.items ??= {};
  lesson.practice ??= {};
  return lesson;
}

/** Apply events on top of cached progress, with the same reducers as live answers. Returns a copy. */
export function applyEvents(learners: ProgressByLearner, events: readonly SummaryRow[]): ProgressByLearner {
  const result = structuredClone(learners);
  for (const event of events) {
    const lesson = lessonOf(result, event.learner, event.lesson);
    if (event.kind === 'item') {
      lesson.items[event.key] = addToItem(lesson.items[event.key], event.answered, event.correct, event.at);
    } else {
      lesson.practice[event.key] = addToPractice(
        lesson.practice[event.key],
        event.answered,
        event.correct,
        event.at,
      );
    }
  }
  return result;
}

/** The local cache for a server summary. */
export function foldSummary(rows: readonly SummaryRow[]): ProgressByLearner {
  return applyEvents({}, rows);
}

/** The cache after a pull: the server summary, with answers still waiting to be sent applied on top. */
export function rebuildCache(
  rows: readonly SummaryRow[],
  pending: readonly ProgressEvent[],
): ProgressByLearner {
  return applyEvents(foldSummary(rows), pending);
}

/** Sum events per progress key, exactly like the `progress_summary` view. */
export function summarise(events: readonly ProgressEvent[]): SummaryRow[] {
  const rows = new Map<string, SummaryRow>();
  for (const { id: _id, ...event } of events) {
    const id = JSON.stringify([event.learner, event.lesson, event.kind, event.key]);
    const row = rows.get(id);
    if (row) {
      row.answered += event.answered;
      row.correct += event.correct;
      row.at = Math.max(row.at, event.at);
    } else {
      rows.set(id, { ...event });
    }
  }
  return [...rows.values()];
}

/* ------------------------------------------------------------ Import */

/**
 * Turn a device's cached history into events, one per quiz item and per practice block, so it can
 * be uploaded once at the device's first sign-in. Ids include the device id: importing twice gives
 * the same ids (the server ignores the repeat), while two devices' histories both count.
 */
export function importRowsFromStore(
  store: Pick<ProgressStore, 'learners'>,
  deviceId: string,
): ProgressEvent[] {
  const rows: ProgressEvent[] = [];
  for (const [learner, forLearner] of Object.entries(store.learners ?? {})) {
    for (const [lesson, progress] of Object.entries(forLearner?.lessons ?? {})) {
      for (const [key, item] of Object.entries(progress?.items ?? {})) {
        rows.push({
          id: `import:${deviceId}:${learner}:${lesson}:item:${key}`,
          learner,
          lesson,
          kind: 'item',
          key,
          answered: Math.max(item.attempts, 1),
          correct: item.correct ? 1 : 0,
          at: item.at,
        });
      }
      for (const [key, block] of Object.entries(progress?.practice ?? {})) {
        if (block.answered <= 0) continue;
        rows.push({
          id: `import:${deviceId}:${learner}:${lesson}:practice:${key}`,
          learner,
          lesson,
          kind: 'practice',
          key,
          answered: block.answered,
          correct: Math.min(Math.max(block.correct, 0), block.answered),
          at: block.at,
        });
      }
    }
  }
  return rows;
}

/* ------------------------------------------------------------ Visits */

/** The newer visit per learner, whichever side it came from. */
export function mergeVisits(a: Visits, b: Visits): Visits {
  const merged: Visits = { ...a };
  for (const [learner, visit] of Object.entries(b)) {
    const current = merged[learner];
    if (!current || visit.at > current.at) merged[learner] = visit;
  }
  return merged;
}

function dayNumber(date: Date): number {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000);
}

/** "Last visit: today", "Last visit: yesterday" or "Last visit: Monday, October 5", in local time. */
export function lastVisitText(at: number, now: number = Date.now()): string {
  const visited = new Date(at);
  const days = dayNumber(new Date(now)) - dayNumber(visited);
  if (days === 0) return 'Last visit: today';
  if (days === 1) return 'Last visit: yesterday';
  return `Last visit: ${visited.toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' })}`;
}

/* ------------------------------------------------------------ Remote shapes */

/** A `progress_events` row as sent (user_id is filled in by the database from the session). */
export interface RemoteEvent {
  id: string;
  learner_id: string;
  lesson_id: string;
  kind: EventKind;
  key: string;
  answered: number;
  correct: number;
  at: string;
}

/** A `progress_summary` row. */
export type RemoteSummaryRow = Omit<RemoteEvent, 'id'>;

/** A `learner_visits` row. */
export interface RemoteVisit {
  learner_id: string;
  lesson_id: string;
  visited_at: string;
}

const iso = (ms: number): string => new Date(ms).toISOString();
const ms = (timestamp: string): number => {
  const parsed = Date.parse(timestamp);
  return Number.isNaN(parsed) ? 0 : parsed;
};

export function toRemoteEvent(event: ProgressEvent): RemoteEvent {
  return {
    id: event.id,
    learner_id: event.learner,
    lesson_id: event.lesson,
    kind: event.kind,
    key: event.key,
    answered: event.answered,
    correct: event.correct,
    at: iso(event.at),
  };
}

export function fromRemoteSummary(row: RemoteSummaryRow): SummaryRow {
  return {
    learner: row.learner_id,
    lesson: row.lesson_id,
    kind: row.kind,
    key: row.key,
    answered: Number(row.answered),
    correct: Number(row.correct),
    at: ms(row.at),
  };
}

export function toRemoteVisit(learner: string, visit: Visit): RemoteVisit {
  return { learner_id: learner, lesson_id: visit.lesson, visited_at: iso(visit.at) };
}

export function fromRemoteVisits(rows: readonly RemoteVisit[]): Visits {
  let visits: Visits = {};
  for (const row of rows) {
    visits = mergeVisits(visits, { [row.learner_id]: { lesson: row.lesson_id, at: ms(row.visited_at) } });
  }
  return visits;
}
