/**
 * The StudyFlix content contract.
 *
 * Every file under `content/` is parsed with one of these schemas, both by Astro
 * (src/content.config.ts) and by the fast validator (tests/unit/content.test.ts).
 * Objects are strict, so a typo in a field name fails the build instead of being
 * silently ignored.
 */
import { z } from 'astro/zod';
import { SUBJECT_IDS } from '../lib/subjects';

const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'must be kebab-case (a-z, 0-9, single dashes)');

/** Markdown text. Supports GFM and $math$ / $$math$$ via KaTeX. */
const markdown = z.string().trim().min(1);

/** A Lucide icon name (https://lucide.dev/icons). Existence is checked by the catalog. */
const icon = slug;

// ---------------------------------------------------------------------------
// Items: the gradable unit shared by quiz blocks and practice generators.
// ---------------------------------------------------------------------------

export const choiceItemSchema = z
  .strictObject({
    kind: z.literal('choice'),
    prompt: markdown,
    choices: z.array(markdown).min(2).max(6),
    answer: markdown,
    explanation: markdown.optional(),
  })
  .refine((item) => item.choices.includes(item.answer), {
    message: '`answer` must be exactly one of `choices`',
    path: ['answer'],
  })
  .refine((item) => new Set(item.choices).size === item.choices.length, {
    message: '`choices` must be unique',
    path: ['choices'],
  });

export const numberItemSchema = z.strictObject({
  kind: z.literal('number'),
  prompt: markdown,
  answer: z.number().finite(),
  /** Accepted absolute difference from `answer`. */
  tolerance: z.number().nonnegative().default(0),
  /** Shown after the input box, for example "km" or "$". */
  unit: z.string().trim().min(1).optional(),
  explanation: markdown.optional(),
});

export const textItemSchema = z.strictObject({
  kind: z.literal('text'),
  prompt: markdown,
  /** Accepted answers. Matching ignores case, extra spaces and punctuation. */
  accept: z.array(z.string().trim().min(1)).min(1),
  explanation: markdown.optional(),
});

export const itemSchema = z.discriminatedUnion('kind', [choiceItemSchema, numberItemSchema, textItemSchema]);

// ---------------------------------------------------------------------------
// Blocks: the closed set of building pieces a lesson is assembled from.
// Adding a block type is a platform change (see AGENTS.md, "Block types").
// ---------------------------------------------------------------------------

const blockBase = {
  /** Stable id, unique within the lesson. Progress is stored against it. */
  id: slug,
  title: z.string().trim().min(1).optional(),
};

export const explainerBlockSchema = z.strictObject({
  type: z.literal('explainer'),
  ...blockBase,
  markdown,
});

export const exampleBlockSchema = z.strictObject({
  type: z.literal('example'),
  ...blockBase,
  title: z.string().trim().min(1),
  problem: markdown,
  steps: z.array(markdown).min(1),
  answer: markdown,
});

export const flashcardsBlockSchema = z.strictObject({
  type: z.literal('flashcards'),
  ...blockBase,
  cards: z.array(z.strictObject({ front: markdown, back: markdown })).min(2),
});

export const quizBlockSchema = z.strictObject({
  type: z.literal('quiz'),
  ...blockBase,
  items: z.array(itemSchema).min(1),
});

export const practiceBlockSchema = z.strictObject({
  type: z.literal('practice'),
  ...blockBase,
  /** Id of a generator in src/generators. */
  generator: slug,
  /** Generator-specific settings, validated against the generator's own schema. */
  params: z.record(z.string(), z.unknown()).default({}),
  /** Questions per set. */
  count: z.number().int().min(1).max(30).default(8),
});

export const blockSchema = z.discriminatedUnion('type', [
  explainerBlockSchema,
  exampleBlockSchema,
  flashcardsBlockSchema,
  quizBlockSchema,
  practiceBlockSchema,
]);

export const BLOCK_TYPES = [
  'explainer',
  'example',
  'flashcards',
  'quiz',
  'practice',
] as const satisfies readonly z.infer<typeof blockSchema>['type'][];

// ---------------------------------------------------------------------------
// Collections
// ---------------------------------------------------------------------------

/** content/curricula/<id>.yaml */
export const curriculumSchema = z.strictObject({
  name: z.string().trim().min(1),
  jurisdiction: z.string().trim().min(1),
  subject: z.enum(SUBJECT_IDS),
  grade: z.number().int().min(1).max(12),
  /** Where the expectation text was quoted from. */
  source: z.string().trim().min(1),
  strands: z
    .array(
      z.strictObject({
        code: z.string().regex(/^[A-Z]$/, 'strand code is one capital letter'),
        title: z.string().trim().min(1),
        expectations: z
          .array(
            z.strictObject({
              code: z.string().regex(/^[A-Z]\d+(?:\.\d+)?$/, 'expectation code looks like B2 or B2.3'),
              /** Verbatim text from `source`. */
              text: z.string().trim().min(1),
            }),
          )
          .min(1),
      }),
    )
    .min(1),
});

/** content/courses/<id>.yaml */
export const courseSchema = z.strictObject({
  title: z.string().trim().min(1),
  subject: z.enum(SUBJECT_IDS),
  /** Curriculum id. Omit for enrichment courses that follow no official curriculum. */
  curriculum: slug.optional(),
  summary: z.string().trim().min(1).max(200),
  /** Ordered units. Each lesson file in content/lessons/<course>/ must be listed exactly once. */
  units: z
    .array(
      z.strictObject({
        id: slug,
        title: z.string().trim().min(1),
        lessons: z.array(slug).min(1),
      }),
    )
    .min(1),
});

/** content/lessons/<course>/<lesson>.yaml */
export const lessonSchema = z.strictObject({
  title: z.string().trim().min(1).max(60),
  summary: z.string().trim().min(1).max(160),
  icon,
  minutes: z.number().int().min(5).max(90),
  /** Expectation codes from the course curriculum. Empty for courses without one. */
  expectations: z.array(z.string()).default([]),
  objectives: z.array(z.string().trim().min(1)).min(1).max(8),
  blocks: z.array(blockSchema).min(1),
});

/** content/learners/<id>.yaml */
export const learnerSchema = z.strictObject({
  name: z.string().trim().min(1),
  /** A Lucide icon used as the profile picture. */
  avatar: icon,
  /** Accent colour for this learner's pages, as #rrggbb. */
  accent: z.string().regex(/^#[0-9a-f]{6}$/, 'accent is a lowercase #rrggbb colour'),
  tagline: z.string().trim().min(1).max(40),
  /** Course ids, in the order the rows appear on the learner's home. */
  courses: z.array(slug).min(1),
});

export type Item = z.infer<typeof itemSchema>;
export type ChoiceItem = z.infer<typeof choiceItemSchema>;
export type NumberItem = z.infer<typeof numberItemSchema>;
export type TextItem = z.infer<typeof textItemSchema>;
export type Block = z.infer<typeof blockSchema>;
export type BlockOf<T extends Block['type']> = Extract<Block, { type: T }>;
export type Curriculum = z.infer<typeof curriculumSchema>;
export type Course = z.infer<typeof courseSchema>;
export type Lesson = z.infer<typeof lessonSchema>;
export type Learner = z.infer<typeof learnerSchema>;
