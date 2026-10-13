import { z } from 'astro/zod';
import { formatNumber } from '../lib/format';
import type { Rng } from '../lib/rng';
import type { Item } from '../model/schemas';
import { defineGenerator } from './types';

const params = z.strictObject({
  /**
   * `part`: what is a/b of N. `whole`: a/b of a number is P, find the number.
   * `chain`: what is a/b of c/d of N. `mixed`: any of the three.
   */
  mode: z.enum(['part', 'whole', 'chain', 'mixed']).default('mixed'),
});

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

interface Fraction {
  /** Numerator, from 1 to `den` − 1. */
  num: number;
  /** Denominator. */
  den: number;
}

/** A proper fraction in lowest terms with a denominator from 2 to `maxDen`. */
function properFraction(rng: Rng, maxDen: number): Fraction {
  const den = rng.int(2, maxDen);
  let num = rng.int(1, den - 1);
  while (gcd(num, den) !== 1) num = rng.int(1, den - 1);
  return { num, den };
}

/** Fractions are plain text with an ASCII slash and no spaces, such as 3/4, so they never wrap. */
function frac({ num, den }: Fraction): string {
  return `${formatNumber(num)}/${formatNumber(den)}`;
}

/**
 * One split-then-take step, `whole` ÷ den × num, written out. The multiply is left out when
 * the numerator is 1, so no explanation ever multiplies by 1.
 */
function splitAndTake(whole: number, f: Fraction): string {
  const part = whole / f.den;
  const split = `${formatNumber(whole)} ÷ ${formatNumber(f.den)} = ${formatNumber(part)}`;
  if (f.num === 1) return `${split}.`;
  return `${split}, and ${formatNumber(part)} × ${formatNumber(f.num)} = ${formatNumber(part * f.num)}.`;
}

function part(rng: Rng): Item {
  const f = properFraction(rng, 10);
  const k = rng.int(2, 12);
  const whole = f.den * k;
  const answer = f.num * k;
  const split = `Split ${formatNumber(whole)} into ${formatNumber(f.den)} equal parts: ${formatNumber(whole)} ÷ ${formatNumber(f.den)} = ${formatNumber(k)}.`;
  return {
    kind: 'number',
    prompt: `What is ${frac(f)} of ${formatNumber(whole)}?`,
    answer,
    tolerance: 0,
    explanation:
      f.num === 1
        ? `${split} ${frac(f)} of ${formatNumber(whole)} is one part, which is ${formatNumber(answer)}.`
        : `${split} Take ${formatNumber(f.num)} of the parts: ${formatNumber(k)} × ${formatNumber(f.num)} = ${formatNumber(answer)}.`,
  };
}

function whole(rng: Rng): Item {
  const f = properFraction(rng, 10);
  const k = rng.int(2, 12);
  const known = f.num * k;
  const answer = f.den * k;
  const rebuild = `The whole is ${formatNumber(f.den)} parts: ${formatNumber(k)} × ${formatNumber(f.den)} = ${formatNumber(answer)}.`;
  return {
    kind: 'number',
    prompt: `${frac(f)} of a number is ${formatNumber(known)}. What is the number?`,
    answer,
    tolerance: 0,
    explanation:
      f.num === 1
        ? `${frac(f)} of the number is ${formatNumber(known)}, so 1 part is ${formatNumber(k)}. ${rebuild}`
        : `${formatNumber(f.num)} parts make ${formatNumber(known)}, so 1 part is ${formatNumber(known)} ÷ ${formatNumber(f.num)} = ${formatNumber(k)}. ${rebuild}`,
  };
}

function chain(rng: Rng): Item {
  const outer = properFraction(rng, 6);
  const inner = properFraction(rng, 6);
  const k = rng.int(1, 3);
  const start = outer.den * inner.den * k;
  const middle = (start / inner.den) * inner.num;
  const answer = (middle / outer.den) * outer.num;
  return {
    kind: 'number',
    prompt: `What is ${frac(outer)} of ${frac(inner)} of ${formatNumber(start)}?`,
    answer,
    tolerance: 0,
    explanation: `Work from the inside out. First ${frac(inner)} of ${formatNumber(start)}: ${splitAndTake(start, inner)} Then ${frac(outer)} of ${formatNumber(middle)}: ${splitAndTake(middle, outer)}`,
  };
}

export const fractionOfAQuantity = defineGenerator({
  id: 'fraction-of-a-quantity',
  title: 'Fraction of a quantity',
  description:
    'A fraction of a whole number, the whole from a known fraction of it, and a fraction of a fraction, all with whole-number steps.',
  params,
  generate(rng, { mode }) {
    const kind = mode === 'mixed' ? rng.pick(['part', 'whole', 'chain'] as const) : mode;
    if (kind === 'part') return part(rng);
    if (kind === 'whole') return whole(rng);
    return chain(rng);
  },
});
