import { describe, expect, it } from 'vitest';
import { GENERATORS, generateSet } from '../../src/generators';
import { sumRange } from '../../src/generators/gauss-sum';
import { answerText, isCorrect } from '../../src/items/grading';
import { itemSchema } from '../../src/model/schemas';

describe.each(Object.values(GENERATORS))('generator $id', (generator) => {
  const items = Array.from({ length: 20 }, (_, seed) =>
    generateSet(generator.id, {}, 10, `seed-${seed}`),
  ).flat();

  it('produces items that satisfy the item schema', () => {
    for (const { item } of items) expect(() => itemSchema.parse(item)).not.toThrow();
  });

  it('uses plain-text prompts and explanations (no Markdown)', () => {
    for (const { item } of items) {
      expect(item.prompt).not.toMatch(/[$*_`#]/);
      expect(item.explanation ?? '').not.toMatch(/[$*_`#]/);
    }
  });

  it('grades its own answer as correct', () => {
    for (const { item } of items) {
      expect(isCorrect(item, answerText(item))).toBe(true);
    }
  });

  it('is deterministic for a seed and varies across seeds', () => {
    expect(generateSet(generator.id, {}, 5, 'x')).toEqual(generateSet(generator.id, {}, 5, 'x'));
    expect(generateSet(generator.id, {}, 5, 'x')).not.toEqual(generateSet(generator.id, {}, 5, 'y'));
  });

  it('rejects unknown params', () => {
    expect(() => generateSet(generator.id, { nope: 1 }, 1, 'x')).toThrow();
  });
});

describe('gauss-sum answers', () => {
  const brute = (a: number, b: number) => {
    let total = 0;
    for (let i = a; i <= b; i++) total += i;
    return total;
  };

  it('sumRange matches brute force', () => {
    for (const [a, b] of [
      [1, 1],
      [1, 100],
      [5, 12],
      [37, 4021],
      [2, 7],
    ] as const) {
      expect(sumRange(a, b)).toBe(brute(a, b));
    }
  });

  it('every generated answer matches brute force', () => {
    for (const mode of ['one-to-n', 'range'] as const) {
      for (const { item } of generateSet('gauss-sum', { mode, max: 3000 }, 30, mode)) {
        const [first, last] = (item.prompt.match(/[\d,]+/g) ?? []).map((n) => Number(n.replace(/,/g, '')));
        const end = item.prompt.match(/… \+ ([\d,]+)\?/)?.[1]?.replace(/,/g, '');
        expect(item.kind).toBe('number');
        if (item.kind === 'number') expect(item.answer).toBe(brute(first ?? 0, Number(end ?? last)));
      }
    }
  });
});
