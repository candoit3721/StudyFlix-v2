/**
 * Builds the resolved, cross-checked view of all content.
 *
 * Schemas validate each file on its own. The catalog validates the relationships
 * between files (course -> lessons, lesson -> curriculum, learner -> courses,
 * practice -> generator) and fails with every problem listed at once.
 */
import { GENERATORS, generateSet } from '../generators';
import type { SubjectId } from '../lib/subjects';
import type { Block, Course, Curriculum, Learner, Lesson } from './schemas';

export interface Entry<T> {
  id: string;
  data: T;
}

export interface RawContent {
  curricula: Entry<Curriculum>[];
  courses: Entry<Course>[];
  lessons: Entry<Lesson>[];
  learners: Entry<Learner>[];
}

export interface ResolvedLesson extends Lesson {
  /** `<course>/<lesson>` */
  id: string;
  slug: string;
  courseId: string;
  unitId: string;
  subject: SubjectId;
  /** Position in the course, 1-based, across all units. */
  number: number;
  url: string;
  prevId?: string;
  nextId?: string;
}

export interface ResolvedUnit {
  id: string;
  title: string;
  lessons: ResolvedLesson[];
}

export interface ResolvedCourse extends Omit<Course, 'units'> {
  id: string;
  url: string;
  units: ResolvedUnit[];
  lessons: ResolvedLesson[];
}

export interface ResolvedLearner extends Omit<Learner, 'courses'> {
  id: string;
  url: string;
  courses: ResolvedCourse[];
}

export interface ResolvedCurriculum extends Curriculum {
  id: string;
  url: string;
}

export interface Catalog {
  learners: ResolvedLearner[];
  courses: ResolvedCourse[];
  lessons: Map<string, ResolvedLesson>;
  curricula: ResolvedCurriculum[];
}

/** Text colour used on accent-coloured buttons (--accent-ink in global.css). */
export const ACCENT_INK = '#1a0f0b';

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two #rrggbb colours. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

export class CatalogError extends Error {
  constructor(readonly problems: string[]) {
    super(`Content has ${problems.length} problem(s):\n${problems.map((p) => `  - ${p}`).join('\n')}`);
    this.name = 'CatalogError';
  }
}

export interface CatalogOptions {
  iconExists: (name: string) => boolean;
}

/** Lessons the learner must answer to finish: every quiz item and every practice block. */
export function gradedUnits(blocks: Block[]): number {
  return blocks.reduce(
    (total, block) =>
      total + (block.type === 'quiz' ? block.items.length : block.type === 'practice' ? 1 : 0),
    0,
  );
}

export function buildCatalog(raw: RawContent, options: CatalogOptions): Catalog {
  const problems: string[] = [];
  const curriculaById = new Map(raw.curricula.map((c) => [c.id, c]));
  const lessonsById = new Map(raw.lessons.map((l) => [l.id, l]));
  const listedLessons = new Set<string>();

  const curricula: ResolvedCurriculum[] = raw.curricula.map(({ id, data }) => {
    const codes = data.strands.flatMap((s) => s.expectations.map((e) => e.code));
    const duplicate = codes.find((code, i) => codes.indexOf(code) !== i);
    if (duplicate) problems.push(`curricula/${id}: expectation ${duplicate} appears twice`);
    for (const strand of data.strands) {
      for (const e of strand.expectations) {
        if (!e.code.startsWith(strand.code)) {
          problems.push(`curricula/${id}: ${e.code} is listed under strand ${strand.code}`);
        }
      }
    }
    return { ...data, id, url: `/curricula/${id}/` };
  });

  const courses: ResolvedCourse[] = raw.courses.map(({ id: courseId, data: course }) => {
    const where = `courses/${courseId}`;
    const curriculum = course.curriculum ? curriculaById.get(course.curriculum) : undefined;
    if (course.curriculum && !curriculum) {
      problems.push(`${where}: unknown curriculum "${course.curriculum}"`);
    }
    if (curriculum && curriculum.data.subject !== course.subject) {
      problems.push(
        `${where}: subject "${course.subject}" differs from its curriculum's "${curriculum.data.subject}"`,
      );
    }
    const expectationCodes = new Set(
      curriculum?.data.strands.flatMap((s) => s.expectations.map((e) => e.code)) ?? [],
    );

    const unitIds = new Set<string>();
    const ordered: ResolvedLesson[] = [];
    const units: ResolvedUnit[] = course.units.map((unit) => {
      if (unitIds.has(unit.id)) problems.push(`${where}: unit id "${unit.id}" is used twice`);
      unitIds.add(unit.id);
      const lessons: ResolvedLesson[] = [];
      for (const slug of unit.lessons) {
        const lessonId = `${courseId}/${slug}`;
        const entry = lessonsById.get(lessonId);
        if (!entry) {
          problems.push(
            `${where}: unit "${unit.id}" lists "${slug}" but content/lessons/${lessonId}.yaml does not exist`,
          );
          continue;
        }
        if (listedLessons.has(lessonId)) {
          problems.push(`${where}: lesson "${slug}" is listed more than once`);
          continue;
        }
        listedLessons.add(lessonId);
        const lesson: ResolvedLesson = {
          ...entry.data,
          id: lessonId,
          slug,
          courseId,
          unitId: unit.id,
          subject: course.subject,
          number: ordered.length + 1,
          url: `/courses/${courseId}/${slug}/`,
        };
        checkLesson(lesson, expectationCodes, Boolean(curriculum), options, problems);
        lessons.push(lesson);
        ordered.push(lesson);
      }
      return { id: unit.id, title: unit.title, lessons };
    });

    ordered.forEach((lesson, i) => {
      lesson.prevId = ordered[i - 1]?.id;
      lesson.nextId = ordered[i + 1]?.id;
    });

    const { units: _units, ...rest } = course;
    return { ...rest, id: courseId, url: `/courses/${courseId}/`, units, lessons: ordered };
  });

  for (const { id } of raw.lessons) {
    const courseId = id.split('/')[0] ?? '';
    if (!raw.courses.some((c) => c.id === courseId)) {
      problems.push(`lessons/${id}: no course "${courseId}" (content/courses/${courseId}.yaml)`);
    } else if (!listedLessons.has(id)) {
      problems.push(`lessons/${id}: not listed in any unit of course "${courseId}"`);
    }
  }

  const coursesById = new Map(courses.map((c) => [c.id, c]));
  const usedCourses = new Set<string>();
  const learners: ResolvedLearner[] = raw.learners.map(({ id, data }) => {
    if (!options.iconExists(data.avatar)) {
      problems.push(`learners/${id}: avatar icon "${data.avatar}" is not a Lucide icon`);
    }
    const contrast = contrastRatio(data.accent, ACCENT_INK);
    if (contrast < 4.5) {
      problems.push(
        `learners/${id}: accent ${data.accent} is too dark for button text (contrast ${contrast.toFixed(2)}, needs 4.5); pick a lighter colour`,
      );
    }
    const resolved: ResolvedCourse[] = [];
    for (const courseId of data.courses) {
      const course = coursesById.get(courseId);
      if (!course) problems.push(`learners/${id}: unknown course "${courseId}"`);
      else {
        resolved.push(course);
        usedCourses.add(courseId);
      }
    }
    return { ...data, id, url: `/learners/${id}/`, courses: resolved };
  });
  for (const course of courses) {
    if (!usedCourses.has(course.id)) {
      problems.push(`courses/${course.id}: no learner takes this course, so nobody can reach it`);
    }
  }

  if (problems.length > 0) throw new CatalogError(problems);

  return {
    learners,
    courses,
    lessons: new Map(courses.flatMap((c) => c.lessons.map((l) => [l.id, l] as const))),
    curricula,
  };
}

function checkLesson(
  lesson: ResolvedLesson,
  expectationCodes: Set<string>,
  hasCurriculum: boolean,
  options: CatalogOptions,
  problems: string[],
): void {
  const where = `lessons/${lesson.id}`;
  if (!options.iconExists(lesson.icon)) {
    problems.push(`${where}: icon "${lesson.icon}" is not a Lucide icon`);
  }
  if (hasCurriculum && lesson.expectations.length === 0) {
    problems.push(`${where}: list at least one curriculum expectation`);
  }
  if (!hasCurriculum && lesson.expectations.length > 0) {
    problems.push(`${where}: the course has no curriculum, so remove "expectations"`);
  }
  for (const code of lesson.expectations) {
    if (!expectationCodes.has(code)) problems.push(`${where}: unknown expectation "${code}"`);
  }
  if (gradedUnits(lesson.blocks) === 0) {
    problems.push(`${where}: add at least one quiz or practice block so the lesson can be completed`);
  }

  const blockIds = new Set<string>();
  for (const block of lesson.blocks) {
    if (blockIds.has(block.id)) problems.push(`${where}: block id "${block.id}" is used twice`);
    blockIds.add(block.id);
    if (block.type === 'quiz') {
      const prompts = block.items.map((item) => item.prompt);
      const repeated = prompts.find((p, i) => prompts.indexOf(p) !== i);
      if (repeated) problems.push(`${where}#${block.id}: prompt "${repeated}" appears twice`);
    }
    if (block.type === 'practice') {
      if (!GENERATORS[block.generator]) {
        problems.push(`${where}#${block.id}: unknown generator "${block.generator}"`);
        continue;
      }
      try {
        generateSet(block.generator, block.params, block.count, lesson.id);
      } catch (error) {
        problems.push(`${where}#${block.id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
}
