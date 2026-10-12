import { describe, expect, it } from 'vitest';
import { isCorrect, normalizeText, parseNumber } from '../../src/items/grading';
import { createRng, hash32 } from '../../src/lib/rng';
import { itemSchema } from '../../src/model/schemas';

describe('parseNumber', () => {
  it.each([
    ['5050', 5050],
    ['5,050', 5050],
    ['5 050', 5050],
    [' -3.5 ', -3.5],
    ['$4.25', 4.25],
    ['.5', 0.5],
  ])('reads %j', (input, expected) => expect(parseNumber(input)).toBe(expected));

  it.each(['', 'abc', '1.2.3', '5-0'])('rejects %j', (input) => expect(parseNumber(input)).toBeNull());
});

describe('normalizeText', () => {
  it('ignores case, accents, punctuation and spacing', () => {
    expect(normalizeText('  Écosystème,  Habitat! ')).toBe('ecosysteme habitat');
  });
});

describe('isCorrect', () => {
  it('grades number items with tolerance', () => {
    const item = itemSchema.parse({ kind: 'number', prompt: 'p', answer: 3.14, tolerance: 0.01 });
    expect(isCorrect(item, '3.15')).toBe(true);
    expect(isCorrect(item, '3.2')).toBe(false);
    expect(isCorrect(item, '')).toBe(false);
  });

  it('grades text items against every accepted answer', () => {
    const item = itemSchema.parse({ kind: 'text', prompt: 'p', accept: ['classification', 'classifying'] });
    expect(isCorrect(item, 'Classifying.')).toBe(true);
    expect(isCorrect(item, 'sorting')).toBe(false);
    expect(isCorrect(item, '   ')).toBe(false);
  });

  it('grades choice items exactly', () => {
    const item = itemSchema.parse({ kind: 'choice', prompt: 'p', choices: ['A', 'B'], answer: 'B' });
    expect(isCorrect(item, 'B')).toBe(true);
    expect(isCorrect(item, 'A')).toBe(false);
  });
});

describe('rng', () => {
  it('is deterministic and stays in range', () => {
    const a = createRng('seed');
    const b = createRng('seed');
    for (let i = 0; i < 1000; i++) {
      const value = a.int(3, 9);
      expect(value).toBe(b.int(3, 9));
      expect(value).toBeGreaterThanOrEqual(3);
      expect(value).toBeLessThanOrEqual(9);
    }
  });

  it('hash32 is stable', () => {
    expect(hash32('studyflix')).toBe(hash32('studyflix'));
    expect(hash32('a')).not.toBe(hash32('b'));
  });
});
