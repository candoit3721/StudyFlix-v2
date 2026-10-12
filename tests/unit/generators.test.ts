import { describe, expect, it } from 'vitest';
import { GENERATORS, generateSet } from '../../src/generators';
import { sumRange } from '../../src/generators/gauss-sum';
import { answerText, isCorrect } from '../../src/items/grading';
import { formatNumber } from '../../src/lib/format';
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
      // A learner types only the number; the unit is printed after the input box.
      const typed = item.kind === 'number' ? formatNumber(item.answer) : answerText(item);
      expect(isCorrect(item, typed)).toBe(true);
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

describe('ratios-rates answers', () => {
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const num = (text: string | undefined) => Number((text ?? '').replace(/,/g, ''));
  const IMPERIAL = /\b(miles?|mph|ounces?|pounds?|foot|feet|inch(es)?|gallons?|cups?)\b/i;
  const modes = ['simplify', 'missing-term', 'unit-rate'] as const;
  const setOf = (mode: (typeof modes)[number]) => generateSet('ratios-rates', { mode }, 30, mode);

  it('defaults to mixed and draws on every mode', () => {
    const prompts = generateSet('ratios-rates', {}, 30, 'mixed').map(({ item }) => item.prompt);
    expect(prompts.some((p) => p.startsWith('Which ratio is'))).toBe(true);
    expect(prompts.some((p) => p.startsWith('Find the missing number'))).toBe(true);
    expect(prompts.some((p) => /in 1\s(hour|minute|ticket|kg)\b/.test(p))).toBe(true);
  });

  it('simplify: exactly one of 4 distinct choices is equivalent and in lowest terms', () => {
    for (const { item } of setOf('simplify')) {
      expect(item.kind).toBe('choice');
      if (item.kind !== 'choice') continue;
      const [, a, b] = item.prompt.match(/^Which ratio is ([\d,]+)\s:\s([\d,]+) in lowest terms\?$/) ?? [];
      expect(new Set(item.choices).size).toBe(4);
      const right = item.choices.filter((choice) => {
        const [, p, q] = choice.match(/^(\d+)\s:\s(\d+)$/) ?? [];
        expect(p && q).toBeTruthy();
        return gcd(num(p), num(q)) === 1 && num(p) * num(b) === num(q) * num(a);
      });
      expect(right).toEqual([item.answer]);
    }
  });

  it('missing-term: the answer makes the cross products equal', () => {
    for (const { item } of setOf('missing-term')) {
      expect(item.kind).toBe('number');
      if (item.kind !== 'number') continue;
      expect(Number.isInteger(item.answer) && item.answer > 0).toBe(true);
      const match = item.prompt.match(/^Find the missing number: (\d+)\s:\s(\d+) = (\d+|\?)\s:\s(\d+|\?)$/);
      expect(match).not.toBeNull();
      const terms = (match ?? []).slice(1).filter((t) => t !== undefined);
      expect(terms.filter((t) => t === '?')).toHaveLength(1);
      const [a, b, c, d] = terms.map((t) => (t === '?' ? item.answer : num(t)));
      expect((a ?? 0) * (d ?? 0)).toBe((b ?? 0) * (c ?? 0));
    }
  });

  it('unit-rate: answer × count = total, with a unit', () => {
    for (const { item } of setOf('unit-rate')) {
      expect(item.kind).toBe('number');
      if (item.kind !== 'number') continue;
      expect(item.unit).toBeTruthy();
      expect(Number.isInteger(item.answer) && item.answer > 0).toBe(true);
      const total = item.prompt.match(/([\d,]+)\s(?:km|pages|words|dollars|L)\b/)?.[1];
      const count = item.prompt.match(/(\d+)\s(?:hours|minutes|tickets|kg)\b/)?.[1];
      expect(total && count).toBeTruthy();
      expect(item.answer * num(count)).toBe(num(total));
    }
  });

  it('uses plain text and metric units everywhere, including choices', () => {
    const items = [...modes.map(setOf), generateSet('ratios-rates', {}, 30, 'mixed')].flat();
    for (const { item } of items) {
      const texts = [item.prompt, item.explanation ?? '', ...(item.kind === 'choice' ? item.choices : [])];
      if (item.kind === 'number') texts.push(item.unit ?? '');
      for (const text of texts) {
        expect(text).not.toMatch(/[$*_`#]/);
        expect(text).not.toMatch(IMPERIAL);
      }
    }
  });
});
