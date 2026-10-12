import { z } from 'astro/zod';
import { formatNumber } from '../lib/format';
import type { Rng } from '../lib/rng';
import type { Item } from '../model/schemas';
import { defineGenerator } from './types';

const params = z.strictObject({
  /**
   * `simplify`: pick a ratio in lowest terms. `missing-term`: find the missing term of an
   * equivalent ratio. `unit-rate`: find a whole-number unit rate. `mixed`: any of the three.
   */
  mode: z.enum(['simplify', 'missing-term', 'unit-rate', 'mixed']).default('mixed'),
});

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/**
 * No-break space: keeps a ratio such as 12 : 5, or a quantity such as 54 km, on one line
 * on narrow screens. It looks like an ordinary space.
 */
const NB = '\u00a0';

/** Ratios are always written with spaces around the colon, on screen and on paper. */
function ratio(a: number | string, b: number | string): string {
  const term = (n: number | string) => (typeof n === 'number' ? formatNumber(n) : n);
  return `${term(a)}${NB}:${NB}${term(b)}`;
}

function simplify(rng: Rng): Item {
  const d = rng.pick([2, 3, 4, 5, 6, 8] as const);
  const s1 = rng.int(2, 9);
  let s2 = rng.int(2, 9);
  while (s2 === s1 || gcd(s1, s2) !== 1) s2 = rng.int(2, 9);
  const r1 = s1 * d;
  const r2 = s2 * d;
  const g = gcd(r1, r2);
  const answer = ratio(r1 / g, r2 / g);
  // Common slips: terms swapped, only one term divided, or stopping before lowest terms.
  const properFactors = [2, 3, 4].filter((p) => p < d && d % p === 0);
  let slip = ratio(r1, r2 / g);
  if (properFactors.length > 0) {
    const p = rng.pick(properFactors);
    slip = ratio(r1 / p, r2 / p);
  }
  return {
    kind: 'choice',
    prompt: `Which ratio is ${ratio(r1, r2)} in lowest terms?`,
    choices: rng.shuffle([answer, ratio(r2 / g, r1 / g), ratio(r1 / g, r2), slip]),
    answer,
    explanation: `The greatest common factor of ${formatNumber(r1)} and ${formatNumber(r2)} is ${formatNumber(g)}. ${formatNumber(r1)} ÷ ${formatNumber(g)} = ${formatNumber(r1 / g)} and ${formatNumber(r2)} ÷ ${formatNumber(g)} = ${formatNumber(r2 / g)}, so ${ratio(r1, r2)} = ${answer}.`,
  };
}

function missingTerm(rng: Rng): Item {
  const a = rng.int(2, 9);
  let b = rng.int(3, 12);
  while (b === a) b = rng.int(3, 12);
  // Skip pairs like 2 : 12 = 12 : ?, where a repeated number hides the scale factor.
  let k = rng.int(2, 8);
  while (a * k === b || b * k === a) k = rng.int(2, 8);
  const times = (n: number) => `${formatNumber(n)} × ${formatNumber(k)} = ${formatNumber(n * k)}`;
  if (rng.pick(['first', 'second'] as const) === 'second') {
    return {
      kind: 'number',
      prompt: `Find the missing number: ${ratio(a, b)} = ${ratio(a * k, '?')}`,
      answer: b * k,
      tolerance: 0,
      explanation: `${times(a)}, so multiply the other term by ${formatNumber(k)} too: ${times(b)}.`,
    };
  }
  return {
    kind: 'number',
    prompt: `Find the missing number: ${ratio(a, b)} = ${ratio('?', b * k)}`,
    answer: a * k,
    tolerance: 0,
    explanation: `${times(b)}, so multiply the other term by ${formatNumber(k)} too: ${times(a)}.`,
  };
}

interface RateContext {
  /** Whole-number unit rates to choose from. */
  rate: [number, number];
  /** How many of the second quantity (hours, tickets, kilograms...). */
  count: [number, number];
  unit: string;
  /** Always mentions the total before the count. */
  prompt(total: string, count: string): string;
  /** What is divided by what, for the explanation. */
  divide: string;
}

/** Metric, Canadian contexts with realistic whole-number rates. */
const RATE_CONTEXTS: readonly RateContext[] = [
  {
    rate: [70, 100],
    count: [2, 6],
    unit: 'km/h',
    prompt: (t, c) =>
      `A car on Highway${NB}401 travels ${t}${NB}km in ${c}${NB}hours at a steady speed. How many kilometres does it travel in 1${NB}hour?`,
    divide: 'the distance by the time',
  },
  {
    rate: [12, 25],
    count: [2, 5],
    unit: 'km/h',
    prompt: (t, c) =>
      `A cyclist on the Waterfront Trail rides ${t}${NB}km in ${c}${NB}hours at a steady pace. How many kilometres does she ride in 1${NB}hour?`,
    divide: 'the distance by the time',
  },
  {
    rate: [20, 45],
    count: [2, 6],
    unit: 'pages per hour',
    prompt: (t, c) =>
      `Maya reads ${t}${NB}pages of her novel in ${c}${NB}hours at a steady pace. How many pages does she read in 1${NB}hour?`,
    divide: 'the pages by the hours',
  },
  {
    rate: [25, 60],
    count: [2, 9],
    unit: 'words per minute',
    prompt: (t, c) =>
      `Liam types ${t}${NB}words in ${c}${NB}minutes at a steady pace. How many words does he type in 1${NB}minute?`,
    divide: 'the words by the minutes',
  },
  {
    rate: [8, 20],
    count: [2, 9],
    unit: 'dollars per ticket',
    prompt: (t, c) =>
      `A family pays ${t}${NB}dollars for ${c}${NB}tickets to a junior hockey game. Every ticket costs the same. How many dollars does 1${NB}ticket cost?`,
    divide: 'the cost by the number of tickets',
  },
  {
    rate: [6, 15],
    count: [2, 9],
    unit: 'L per hour',
    prompt: (t, c) =>
      `A maple sugar bush collects ${t}${NB}L of sap in ${c}${NB}hours at a steady rate. How many litres does it collect in 1${NB}hour?`,
    divide: 'the volume by the time',
  },
  {
    rate: [2, 4],
    count: [2, 9],
    unit: 'dollars per kg',
    prompt: (t, c) =>
      `A grocery store charges ${t}${NB}dollars for a ${c}${NB}kg bag of potatoes. How many dollars is that for 1${NB}kg?`,
    divide: 'the cost by the mass',
  },
];

function unitRate(rng: Rng): Item {
  const context = rng.pick(RATE_CONTEXTS);
  const rate = rng.int(...context.rate);
  const count = rng.int(...context.count);
  const total = rate * count;
  return {
    kind: 'number',
    prompt: context.prompt(formatNumber(total), formatNumber(count)),
    answer: rate,
    tolerance: 0,
    unit: context.unit,
    explanation: `Divide ${context.divide}: ${formatNumber(total)} ÷ ${formatNumber(count)} = ${formatNumber(rate)}. The unit rate is ${formatNumber(rate)}${NB}${context.unit}.`,
  };
}

export const ratiosRates = defineGenerator({
  id: 'ratios-rates',
  title: 'Ratios and rates',
  description: 'Ratios in lowest terms, missing terms in equivalent ratios, and whole-number unit rates.',
  params,
  generate(rng, { mode }) {
    const kind = mode === 'mixed' ? rng.pick(['simplify', 'missing-term', 'unit-rate'] as const) : mode;
    if (kind === 'simplify') return simplify(rng);
    if (kind === 'missing-term') return missingTerm(rng);
    return unitRate(rng);
  },
});
