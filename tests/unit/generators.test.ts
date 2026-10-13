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

  it('never writes "a" in front of a number, which reads wrong as "a 8 kg"', () => {
    for (const { item } of generateSet('ratios-rates', { mode: 'unit-rate' }, 400, 'articles')) {
      expect(item.prompt).not.toMatch(/\ba\s\d/i);
    }
  });
});

describe('money answers', () => {
  const COIN_VALUES: Record<string, { value: number; unit: 'cents' | 'dollars' }> = {
    quarter: { value: 25, unit: 'cents' },
    dime: { value: 10, unit: 'cents' },
    nickel: { value: 5, unit: 'cents' },
    toonie: { value: 2, unit: 'dollars' },
    loonie: { value: 1, unit: 'dollars' },
  };
  const modes = ['count-coins', 'make-change'] as const;
  const amountKinds = ['cents', 'dollars'] as const;
  const setOf = (mode: (typeof modes)[number], amounts: (typeof amountKinds)[number]) =>
    generateSet('money', { mode, amounts }, 30, `${mode}-${amounts}`);
  const numberItems = (mode: (typeof modes)[number], amounts: (typeof amountKinds)[number]) =>
    setOf(mode, amounts).map(({ item }) => {
      if (item.kind !== 'number') throw new Error(`Expected a number item, got ${item.kind}`);
      return item;
    });
  /** Which of the four variants a prompt belongs to, read from its wording alone. */
  const variantOf = (prompt: string) => {
    if (/How many cents is that\?$/.test(prompt)) return 'count-cents';
    if (/How many dollars is that\?$/.test(prompt)) return 'count-dollars';
    if (/You pay with a loonie\./.test(prompt)) return 'change-cents';
    if (/You pay with a (5|10|20)-dollar bill\./.test(prompt)) return 'change-dollars';
    return 'unknown';
  };

  it('generates a 30-item set for every mode and amount kind', () => {
    for (const mode of modes) {
      for (const amounts of amountKinds) expect(setOf(mode, amounts)).toHaveLength(30);
    }
  });

  it('count-coins: the coins named in the prompt add up to the answer', () => {
    for (const amounts of amountKinds) {
      for (const item of numberItems('count-coins', amounts)) {
        expect(variantOf(item.prompt)).toBe(amounts === 'cents' ? 'count-cents' : 'count-dollars');
        const coins = [...item.prompt.matchAll(/(\d+)\s(quarter|dime|nickel|toonie|loonie)(s?)\b/g)];
        // Every coin word in the prompt comes with its count.
        const coinWords = item.prompt.match(/quarter|dime|nickel|toonie|loonie/g) ?? [];
        expect(coins.length).toBe(coinWords.length);
        let total = 0;
        let coinCount = 0;
        for (const [, n, name, plural] of coins) {
          const coin = COIN_VALUES[name ?? ''];
          expect(coin?.unit).toBe(amounts);
          expect(plural).toBe(Number(n) === 1 ? '' : 's');
          total += Number(n) * (coin?.value ?? 0);
          coinCount += Number(n);
        }
        expect(coinCount).toBeGreaterThanOrEqual(2);
        expect(item.answer).toBe(total);
      }
    }
  });

  it('make-change: price + change = payment, and the payment is more than the price', () => {
    for (const amounts of amountKinds) {
      for (const item of numberItems('make-change', amounts)) {
        expect(variantOf(item.prompt)).toBe(amounts === 'cents' ? 'change-cents' : 'change-dollars');
        const [, priceText, priceUnit] = item.prompt.match(/costs (\d+)\s(cents?|dollars?)\./) ?? [];
        expect(priceText).toBeTruthy();
        const price = Number(priceText);
        expect(priceUnit).toBe(price === 1 ? amounts.slice(0, -1) : amounts);
        const bill = item.prompt.match(/pay with a (\d+)-dollar bill/)?.[1];
        const payment = /pay with a loonie\b/.test(item.prompt) ? 100 : Number(bill);
        expect(payment).toBeGreaterThan(price);
        expect(price + item.answer).toBe(payment);
        if (amounts === 'cents') {
          expect(price % 5).toBe(0);
          expect(price).toBeLessThan(100);
        }
      }
    }
  });

  it('keeps cents and dollars apart, with whole-number answers above 0', () => {
    for (const mode of modes) {
      for (const amounts of amountKinds) {
        for (const item of numberItems(mode, amounts)) {
          expect(item.unit).toBe(amounts);
          expect(item.tolerance).toBe(0);
          expect(Number.isInteger(item.answer) && item.answer > 0).toBe(true);
          expect(item.prompt).not.toMatch(amounts === 'cents' ? /dollar|toonie/ : /cent|quarter|dime|nickel/);
          if (amounts === 'cents') {
            expect(item.answer % 5).toBe(0);
            expect(item.answer).toBeLessThan(100);
          }
          for (const text of [item.prompt, item.explanation ?? '', item.unit ?? '']) {
            expect(text).not.toMatch(/[$*_`#]/);
            expect(text).not.toMatch(/\d\.\d/);
            expect(text).not.toMatch(/penn(y|ies)/i);
          }
        }
      }
    }
  });

  it('defaults to mixed modes and both amount kinds, and draws on all four variants', () => {
    const variants = new Set(generateSet('money', {}, 30, 'mixed').map(({ item }) => variantOf(item.prompt)));
    expect([...variants].sort()).toEqual(['change-cents', 'change-dollars', 'count-cents', 'count-dollars']);
  });

  it('never writes "a" in front of a number except before a bill, nor "a" before a vowel', () => {
    for (const { item } of generateSet('money', {}, 200, 'articles')) {
      expect(item.prompt).not.toMatch(/\ba\s(?!(?:5|10|20)-dollar bill\b)\d/i);
      expect(item.prompt).not.toMatch(/\ba\s[aeiou]/i);
    }
  });

  it('rejects params outside the design', () => {
    expect(() => generateSet('money', { mode: 'decimals' }, 1, 'x')).toThrow();
    expect(() => generateSet('money', { amounts: 'pennies' }, 1, 'x')).toThrow();
  });
});
