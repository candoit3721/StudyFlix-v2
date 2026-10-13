/**
 * Learner progress and last visits, cached in this browser (localStorage).
 *
 * This cache is the synchronous source for every page: reads never wait for the network. When a
 * parent has signed this device in to the family account, each answer and visit is also queued in
 * the sync outbox, and the sync engine (src/lib/sync/engine.ts) sends it to Supabase and rebuilds
 * this cache from the server, so progress follows each learner from device to device.
 * Signed out, or with sync not configured, everything still works and stays on this device.
 *
 * Keys are stable content ids, never positions:
 *   quiz item     -> `<blockId>:<hash of prompt>`
 *   practice block -> `<blockId>` (any generated set counts)
 * so reordering a lesson or editing other items never loses progress.
 * Every access is wrapped: storage can be missing (private mode) or full.
 */
import {
  addToItem,
  addToPractice,
  type LessonProgress,
  lessonOf,
  type ProgressByLearner,
  type ProgressStore,
  type Visit,
  type Visits,
} from './sync/model';
import { enqueueEvent, enqueueVisit, randomId } from './sync/outbox';

export type { Attempt, LessonProgress, PracticeStats } from './sync/model';

const STORE_KEY = 'studyflix:v2:progress';
const LEARNER_KEY = 'studyflix:v2:learner';
const VISITS_KEY = 'studyflix:v2:visits';
const VERSION = 1;

type Store = ProgressStore;

function read(): Store {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Store) : undefined;
    if (parsed?.version === VERSION && parsed.learners) return parsed;
  } catch {
    // Unavailable or corrupt storage: start fresh rather than break the page.
  }
  return { version: VERSION, learners: {} };
}

function save(store: Store): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch {
    // Storage full or blocked: progress is best-effort.
  }
}

function changed(): void {
  window.dispatchEvent(new CustomEvent('studyflix:progress'));
}

function write(store: Store): void {
  save(store);
  changed();
}

function readVisits(): Visits {
  try {
    const raw = localStorage.getItem(VISITS_KEY);
    const parsed = raw ? (JSON.parse(raw) as Visits) : undefined;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  } catch {
    // Unavailable or corrupt storage: no visits yet.
  }
  return {};
}

function saveVisits(visits: Visits): void {
  try {
    localStorage.setItem(VISITS_KEY, JSON.stringify(visits));
  } catch {
    // Storage full or blocked: the last visit is best-effort.
  }
}

export function getCurrentLearner(): string | null {
  try {
    return localStorage.getItem(LEARNER_KEY);
  } catch {
    return null;
  }
}

export function setCurrentLearner(id: string): void {
  try {
    localStorage.setItem(LEARNER_KEY, id);
  } catch {
    // Ignore: the learner is also carried in the URL of their home page.
  }
}

export function getLessonProgress(learner: string, lessonId: string): LessonProgress {
  const lesson = read().learners[learner]?.lessons[lessonId];
  return { items: lesson?.items ?? {}, practice: lesson?.practice ?? {} };
}

export function recordItem(learner: string, lessonId: string, key: string, correct: boolean): void {
  const store = read();
  const items = lessonOf(store.learners, learner, lessonId).items;
  const at = Date.now();
  // Once correct, an item stays correct; retries after a mistake still count.
  items[key] = addToItem(items[key], 1, correct ? 1 : 0, at);
  write(store);
  enqueueEvent({
    id: randomId(),
    learner,
    lesson: lessonId,
    kind: 'item',
    key,
    answered: 1,
    correct: correct ? 1 : 0,
    at,
  });
}

export function recordPractice(learner: string, lessonId: string, blockId: string, correct: boolean): void {
  const store = read();
  const practice = lessonOf(store.learners, learner, lessonId).practice;
  const at = Date.now();
  practice[blockId] = addToPractice(practice[blockId], 1, correct ? 1 : 0, at);
  write(store);
  enqueueEvent({
    id: randomId(),
    learner,
    lesson: lessonId,
    kind: 'practice',
    key: blockId,
    answered: 1,
    correct: correct ? 1 : 0,
    at,
  });
}

/** Remember the lesson a learner just opened; the learner home shows it and continues from it. */
export function recordVisit(learner: string, lessonId: string): void {
  const visit: Visit = { lesson: lessonId, at: Date.now() };
  const visits = readVisits();
  visits[learner] = visit;
  saveVisits(visits);
  changed();
  enqueueVisit(learner, visit);
}

export function getLastVisit(learner: string): Visit | null {
  const visit = readVisits()[learner];
  return visit && typeof visit.lesson === 'string' && typeof visit.at === 'number' ? visit : null;
}

/** Everything cached on this device, for the sync engine. */
export function getCachedProgress(): { learners: ProgressByLearner; visits: Visits } {
  return { learners: read().learners, visits: readVisits() };
}

/** Replace the cached progress and visits after a pull from the sync service. */
export function replaceCache(learners: ProgressByLearner, visits: Visits): void {
  save({ version: VERSION, learners });
  saveVisits(visits);
  changed();
}

export interface LessonRequirements {
  /** Keys of every quiz item in the lesson. */
  itemKeys: string[];
  /** Practice block ids with the number of answers needed to finish each. */
  practice: { id: string; count: number }[];
}

export interface LessonStatus {
  done: number;
  total: number;
  complete: boolean;
  started: boolean;
}

/** A quiz item is done when answered correctly; a practice block when `count` answers are in. */
export function lessonStatus(learner: string, lessonId: string, req: LessonRequirements): LessonStatus {
  const progress = getLessonProgress(learner, lessonId);
  const doneItems = req.itemKeys.filter((key) => progress.items[key]?.correct).length;
  const donePractice = req.practice.filter(
    (block) => (progress.practice[block.id]?.answered ?? 0) >= block.count,
  ).length;
  const total = req.itemKeys.length + req.practice.length;
  const done = doneItems + donePractice;
  const started = Object.keys(progress.items).length > 0 || Object.keys(progress.practice).length > 0;
  return { done, total, complete: total > 0 && done === total, started };
}

export function resetLearner(learner: string): void {
  const store = read();
  delete store.learners[learner];
  write(store);
}
