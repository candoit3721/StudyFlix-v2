import { z } from 'astro/zod';
import { formatNumber } from '../lib/format';
import { defineGenerator } from './types';

const params = z.strictObject({
  /** `one-to-n`: 1 + 2 + ... + n. `range`: a + (a+1) + ... + b. `mixed`: either. */
  mode: z.enum(['one-to-n', 'range', 'mixed']).default('one-to-n'),
  /** Largest number that may appear in a sum. */
  max: z.number().int().min(20).max(10_000).default(100),
});

export function sumRange(a: number, b: number): number {
  return ((b - a + 1) * (a + b)) / 2;
}

export const gaussSum = defineGenerator({
  id: 'gauss-sum',
  title: 'Gauss sums',
  description: 'Sums of consecutive whole numbers, solved with the pairing trick.',
  params,
  generate(rng, { mode, max }) {
    const kind = mode === 'mixed' ? rng.pick(['one-to-n', 'range'] as const) : mode;
    if (kind === 'one-to-n') {
      const n = rng.int(10, max);
      const total = sumRange(1, n);
      return {
        kind: 'number',
        prompt: `What is 1 + 2 + 3 + … + ${formatNumber(n)}?`,
        answer: total,
        tolerance: 0,
        explanation: `Write the sum forwards and backwards: each of the ${formatNumber(n)} columns adds to ${formatNumber(n + 1)}. That is two copies of the sum, so ${formatNumber(n)} × ${formatNumber(n + 1)} ÷ 2 = ${formatNumber(total)}.`,
      };
    }
    const a = rng.int(2, Math.floor(max / 2));
    const b = rng.int(a + 5, max);
    const count = b - a + 1;
    const total = sumRange(a, b);
    return {
      kind: 'number',
      prompt: `What is ${formatNumber(a)} + ${formatNumber(a + 1)} + … + ${formatNumber(b)}?`,
      answer: total,
      tolerance: 0,
      explanation: `There are ${formatNumber(b)} − ${formatNumber(a)} + 1 = ${formatNumber(count)} numbers. Forwards plus backwards, every column adds to ${formatNumber(a + b)}, so the sum is ${formatNumber(count)} × ${formatNumber(a + b)} ÷ 2 = ${formatNumber(total)}.`,
    };
  },
});
