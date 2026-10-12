import { describe, expect, it } from 'vitest';
import { plainText } from '../../src/lib/markdown';

describe('plainText', () => {
  it('names math the way it reads', () => {
    expect(plainText('$n \\times 2$')).toBe('n×2');
  });

  it('writes a fraction with a slash, so 5/2 is not read as 52', () => {
    expect(plainText('$\\frac{5}{2}$')).toBe('5/2');
    expect(plainText('$\\dfrac{5}{2}$')).toBe('5/2');
  });

  it('brackets a numerator or denominator of more than one part', () => {
    expect(plainText('$\\frac{n + 1}{2}$')).toBe('(n+1)/2');
    expect(plainText('$\\frac{3}{\\frac{1}{2}}$')).toBe('3/(1/2)');
  });
});
