import { describe, expect, it } from 'vitest';
import { generateSet } from '../../src/generators';
import { isCorrect } from '../../src/items/grading';
import { iconExists } from '../../src/lib/icons';
import { MATH_ERROR_CLASS, renderMarkdown } from '../../src/lib/markdown';
import { buildCatalog, CatalogError } from '../../src/model/catalog';
import { loadContent } from './load-content';

describe('content/', () => {
  const { content, problems } = loadContent();

  it('every file matches its schema', () => {
    expect(problems, problems.join('\n')).toEqual([]);
    expect(content.learners.length).toBeGreaterThan(0);
    expect(content.lessons.length).toBeGreaterThan(0);
  });

  it('cross-references are consistent', () => {
    try {
      buildCatalog(content, { iconExists, base: '/' });
    } catch (error) {
      if (error instanceof CatalogError) expect.fail(error.message);
      throw error;
    }
  });

  it('all Markdown renders, including every math formula', () => {
    const texts = (value: unknown): string[] =>
      typeof value === 'string'
        ? [value]
        : Array.isArray(value)
          ? value.flatMap(texts)
          : value && typeof value === 'object'
            ? Object.values(value).flatMap(texts)
            : [];
    for (const lesson of content.lessons) {
      for (const text of texts(lesson.data.blocks)) {
        expect(renderMarkdown(text), `${lesson.id}: ${text}`).not.toContain(MATH_ERROR_CLASS);
      }
    }
  });

  it('every quiz answer is graded as correct by the grader', () => {
    for (const lesson of content.lessons) {
      for (const block of lesson.data.blocks) {
        if (block.type !== 'quiz') continue;
        for (const item of block.items) {
          const answer =
            item.kind === 'choice'
              ? item.answer
              : item.kind === 'number'
                ? String(item.answer)
                : item.accept[0];
          expect(isCorrect(item, answer ?? ''), `${lesson.id}#${block.id}: ${item.prompt}`).toBe(true);
        }
      }
    }
  });

  it('every practice block produces a full, deterministic set', () => {
    for (const lesson of content.lessons) {
      for (const block of lesson.data.blocks) {
        if (block.type !== 'practice') continue;
        const a = generateSet(block.generator, block.params, block.count, lesson.id);
        const b = generateSet(block.generator, block.params, block.count, lesson.id);
        expect(a).toHaveLength(block.count);
        expect(a).toEqual(b);
      }
    }
  });
});
