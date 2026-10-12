/**
 * Learner progress, stored in this browser only (localStorage).
 *
 * Keys are stable content ids, never positions:
 *   quiz item     -> `<blockId>:<hash of prompt>`
 *   practice block -> `<blockId>` (any generated set counts)
 * so reordering a lesson or editing other items never loses progress.
 * Every access is wrapped: storage can be missing (private mode) or full.
 */

const STORE_KEY = 'studyflix:v2:progress';
const LEARNER_KEY = 'studyflix:v2:learner';
const VERSION = 1;

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

interface Store {
  version: number;
  learners: Record<string, { lessons: Record<string, LessonProgress> }>;
}

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

function write(store: Store): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch {
    // Storage full or blocked: progress is best-effort.
  }
  window.dispatchEvent(new CustomEvent('studyflix:progress'));
}

function lessonOf(store: Store, learner: string, lessonId: string): LessonProgress {
  store.learners[learner] ??= { lessons: {} };
  const forLearner = store.learners[learner];
  forLearner.lessons[lessonId] ??= { items: {}, practice: {} };
  const lesson = forLearner.lessons[lessonId];
  lesson.items ??= {};
  lesson.practice ??= {};
  return lesson;
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
  const items = lessonOf(store, learner, lessonId).items;
  const previous = items[key];
  // Once correct, an item stays correct; retries after a mistake still count.
  items[key] = {
    correct: correct || Boolean(previous?.correct),
    attempts: (previous?.attempts ?? 0) + 1,
    at: Date.now(),
  };
  write(store);
}

export function recordPractice(learner: string, lessonId: string, blockId: string, correct: boolean): void {
  const store = read();
  const practice = lessonOf(store, learner, lessonId).practice;
  const previous = practice[blockId] ?? { answered: 0, correct: 0, at: 0 };
  practice[blockId] = {
    answered: previous.answered + 1,
    correct: previous.correct + (correct ? 1 : 0),
    at: Date.now(),
  };
  write(store);
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
