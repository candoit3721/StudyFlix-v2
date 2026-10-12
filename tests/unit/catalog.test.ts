import { describe, expect, it } from 'vitest';
import { buildCatalog, CatalogError, type RawContent } from '../../src/model/catalog';
import { courseSchema, curriculumSchema, learnerSchema, lessonSchema } from '../../src/model/schemas';

const curriculum = curriculumSchema.parse({
  name: 'C',
  jurisdiction: 'Ontario',
  subject: 'science',
  grade: 6,
  source: 'test',
  strands: [{ code: 'B', title: 'Bio', expectations: [{ code: 'B1', text: 't' }] }],
});

const lesson = (overrides: Record<string, unknown> = {}) =>
  lessonSchema.parse({
    title: 'L',
    summary: 's',
    icon: 'sprout',
    minutes: 10,
    expectations: ['B1'],
    objectives: ['o'],
    blocks: [{ type: 'quiz', id: 'q', items: [{ kind: 'number', prompt: '1+1?', answer: 2 }] }],
    ...overrides,
  });

function fixture(): RawContent {
  return {
    curricula: [{ id: 'cur', data: curriculum }],
    courses: [
      {
        id: 'sci',
        data: courseSchema.parse({
          title: 'Sci',
          subject: 'science',
          curriculum: 'cur',
          summary: 's',
          units: [{ id: 'u', title: 'U', lessons: ['one', 'two'] }],
        }),
      },
    ],
    lessons: [
      { id: 'sci/one', data: lesson() },
      { id: 'sci/two', data: lesson() },
    ],
    learners: [
      {
        id: 'kid',
        data: learnerSchema.parse({
          name: 'Kid',
          avatar: 'rocket',
          accent: '#ff7a59',
          tagline: 'Grade 6',
          courses: ['sci'],
        }),
      },
    ],
  };
}

const iconExists = (name: string) => ['sprout', 'rocket'].includes(name);

function problemsOf(raw: RawContent): string[] {
  try {
    buildCatalog(raw, { iconExists });
    return [];
  } catch (error) {
    if (error instanceof CatalogError) return error.problems;
    throw error;
  }
}

describe('buildCatalog', () => {
  it('resolves a valid fixture with ordering and navigation', () => {
    const catalog = buildCatalog(fixture(), { iconExists });
    const one = catalog.lessons.get('sci/one');
    expect(one?.url).toBe('/courses/sci/one/');
    expect(one?.nextId).toBe('sci/two');
    expect(catalog.lessons.get('sci/two')?.number).toBe(2);
    expect(catalog.learners[0]?.courses[0]?.id).toBe('sci');
  });

  it('reports a lesson listed in a unit but missing on disk', () => {
    const raw = fixture();
    raw.lessons.pop();
    expect(problemsOf(raw)).toEqual([
      expect.stringContaining('lists "two" but content/lessons/sci/two.yaml does not exist'),
    ]);
  });

  it('reports a lesson file that no unit lists', () => {
    const raw = fixture();
    raw.lessons.push({ id: 'sci/three', data: lesson() });
    expect(problemsOf(raw)).toEqual([expect.stringContaining('sci/three: not listed')]);
  });

  it('reports unknown expectations, icons, generators and duplicate block ids together', () => {
    const raw = fixture();
    raw.lessons[0] = {
      id: 'sci/one',
      data: lesson({
        icon: 'not-an-icon',
        expectations: ['B9'],
        blocks: [
          { type: 'quiz', id: 'q', items: [{ kind: 'number', prompt: 'p', answer: 1 }] },
          { type: 'practice', id: 'q', generator: 'nope' },
        ],
      }),
    };
    const problems = problemsOf(raw);
    expect(problems).toHaveLength(4);
    expect(problems.join('\n')).toMatch(/icon "not-an-icon"/);
    expect(problems.join('\n')).toMatch(/unknown expectation "B9"/);
    expect(problems.join('\n')).toMatch(/block id "q" is used twice/);
    expect(problems.join('\n')).toMatch(/unknown generator "nope"/);
  });

  it('reports a course that no learner can reach', () => {
    const raw = fixture();
    raw.learners = [];
    expect(problemsOf(raw)).toEqual([expect.stringContaining('no learner takes this course')]);
  });

  it('rejects an accent too dark for button text', () => {
    const raw = fixture();
    const [kid] = raw.learners;
    if (!kid) throw new Error('fixture has a learner');
    raw.learners[0] = { id: 'kid', data: { ...kid.data, accent: '#203040' } };
    expect(problemsOf(raw)).toEqual([expect.stringContaining('accent #203040 is too dark')]);
  });

  it('requires expectations only when the course follows a curriculum', () => {
    const raw = fixture();
    raw.lessons[0] = { id: 'sci/one', data: lesson({ expectations: [] }) };
    expect(problemsOf(raw)).toEqual([expect.stringContaining('at least one curriculum expectation')]);
  });
});

describe('schemas', () => {
  it('reject unknown fields so typos fail loudly', () => {
    expect(lessonSchema.safeParse({ ...lesson(), titel: 'typo' }).success).toBe(false);
  });

  it('reject a choice answer that is not among the choices', () => {
    const result = lessonSchema.safeParse({
      ...lesson(),
      blocks: [
        {
          type: 'quiz',
          id: 'q',
          items: [{ kind: 'choice', prompt: 'p', choices: ['a', 'b'], answer: 'c' }],
        },
      ],
    });
    expect(result.success).toBe(false);
  });
});
