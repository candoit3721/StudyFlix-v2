import { z } from 'astro/zod';
import { formatNumber } from '../lib/format';
import type { Rng } from '../lib/rng';
import type { Item } from '../model/schemas';
import { defineGenerator } from './types';

const params = z.strictObject({
  /** `count-coins`: how much is a handful of coins. `make-change`: change by counting up. `mixed`: either. */
  mode: z.enum(['count-coins', 'make-change', 'mixed']).default('mixed'),
  /** `cents`: amounts under 1 dollar. `dollars`: whole-dollar amounts. `both`: either. */
  amounts: z.enum(['cents', 'dollars', 'both']).default('both'),
});

/**
 * No-break space: keeps a number and its word, such as 65 cents or 3 toonies, on one line
 * on narrow screens. It looks like an ordinary space.
 */
const NB = ' ';

/**
 * Amounts are always whole cents (under 1 dollar) or whole dollars, never mixed and never
 * decimal, so feedback and answer keys never show money as "2.3".
 */
type Unit = 'cents' | 'dollars';

interface Coin {
  singular: string;
  plural: string;
  /** Worth, in the unit of the coin's group. */
  value: number;
}

/**
 * Coins from most to least valuable. The money test in tests/unit/generators.test.ts parses
 * coin counts from the prompt by these names, so add any new coin there too.
 */
const CENT_COINS: readonly Coin[] = [
  { singular: 'quarter', plural: 'quarters', value: 25 },
  { singular: 'dime', plural: 'dimes', value: 10 },
  { singular: 'nickel', plural: 'nickels', value: 5 },
];
const DOLLAR_COINS: readonly Coin[] = [
  { singular: 'toonie', plural: 'toonies', value: 2 },
  { singular: 'loonie', plural: 'loonies', value: 1 },
];

/** Small things a Grade 3 learner might buy with a loonie. Stored with their article. */
const CENT_THINGS = [
  'a freezie',
  'a pencil',
  'an eraser',
  'a sticker',
  'a juice box',
  'a bag of popcorn',
] as const;

/** Bigger things bought with a bill. Stored with their article. */
const DOLLAR_THINGS = ['a book', 'a kite', 'a toque', 'a puzzle', 'a skipping rope', 'a board game'] as const;

const BILLS = [5, 10, 20] as const;

/** "1 dime", "3 dimes", "1 dollar", "65 cents", always on one line. */
function count(n: number, singular: string, plural: string): string {
  return `${formatNumber(n)}${NB}${n === 1 ? singular : plural}`;
}

function amount(n: number, unit: Unit): string {
  return unit === 'cents' ? count(n, 'cent', 'cents') : count(n, 'dollar', 'dollars');
}

/** "a", "a and b", "a, b and c" (no serial comma). */
function list(parts: readonly string[]): string {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
}

/** "65 + 35 = 100", kept on one line so a sum never splits at 390 px. */
function sum(terms: readonly number[], result: string): string {
  return `${terms.map(formatNumber).join(`${NB}+${NB}`)}${NB}=${NB}${result}`;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Draw coin counts until `accept` likes them; at least 2 coins in total. */
function drawCoins(
  rng: Rng,
  coins: readonly Coin[],
  max: readonly number[],
  accept: (total: number) => boolean,
): number[] {
  for (;;) {
    const counts = coins.map((_, i) => rng.int(0, max[i] ?? 0));
    const total = counts.reduce((acc, n, i) => acc + n * (coins[i]?.value ?? 0), 0);
    if (counts.reduce((a, b) => a + b, 0) >= 2 && accept(total)) return counts;
  }
}

function countCoins(rng: Rng, unit: Unit): Item {
  const coins = unit === 'cents' ? CENT_COINS : DOLLAR_COINS;
  const counts =
    unit === 'cents'
      ? drawCoins(rng, coins, [3, 4, 4], (total) => total < 100)
      : drawCoins(rng, coins, [6, 6], () => true);
  const present = coins.flatMap((coin, i) => {
    const n = counts[i] ?? 0;
    return n > 0 ? [{ coin, n, subtotal: n * coin.value }] : [];
  });
  const subtotalValues = present.map((p) => p.subtotal);
  const total = subtotalValues.reduce((a, b) => a + b, 0);
  const handful = list(present.map(({ coin, n }) => count(n, coin.singular, coin.plural)));
  const subtotals = list(
    present.map(
      ({ coin, n, subtotal }) =>
        `${count(n, coin.singular, coin.plural)} ${n === 1 ? 'makes' : 'make'} ${amount(subtotal, unit)}`,
    ),
  );
  const addUp = present.length > 1 ? ` ${sum(subtotalValues, amount(total, unit))}.` : '';
  const worth =
    unit === 'dollars'
      ? `${list(present.map(({ coin }) => `a ${coin.singular} is ${amount(coin.value, unit)}`))}. `
      : '';
  return {
    kind: 'number',
    prompt: `You have ${handful}. How many ${unit} is that?`,
    answer: total,
    tolerance: 0,
    unit,
    explanation: `${capitalize(worth)}${capitalize(subtotals)}.${addUp}`,
  };
}

function makeChange(rng: Rng, unit: Unit): Item {
  if (unit === 'cents') {
    const thing = rng.pick(CENT_THINGS);
    const price = rng.int(1, 19) * 5;
    const change = 100 - price;
    return {
      kind: 'number',
      prompt: `${capitalize(thing)} costs ${amount(price, unit)}. You pay with a loonie. How much change do you get?`,
      answer: change,
      tolerance: 0,
      unit,
      explanation: `A loonie is worth ${amount(100, unit)}. Count up from ${amount(price, unit)} to ${amount(100, unit)}: that is ${amount(change, unit)}. Check: ${sum([price, change], formatNumber(100))}.`,
    };
  }
  const thing = rng.pick(DOLLAR_THINGS);
  // The change is at least 2 dollars: the unit after the answer is always "dollars", and
  // feedback such as "1 dollars" would read wrong.
  const price = rng.int(1, 18);
  const bill = rng.pick(BILLS.filter((b) => b - price >= 2));
  const change = bill - price;
  return {
    kind: 'number',
    prompt: `${capitalize(thing)} costs ${amount(price, unit)}. You pay with a ${formatNumber(bill)}-dollar bill. How much change do you get?`,
    answer: change,
    tolerance: 0,
    unit,
    explanation: `Count up from ${amount(price, unit)} to ${amount(bill, unit)}: that is ${amount(change, unit)}. Check: ${sum([price, change], formatNumber(bill))}.`,
  };
}

export const money = defineGenerator({
  id: 'money',
  title: 'Canadian money',
  description:
    'Count a handful of Canadian coins, and make change by counting up, in cents or in whole dollars.',
  params,
  generate(rng, { mode, amounts }) {
    const kind = mode === 'mixed' ? rng.pick(['count-coins', 'make-change'] as const) : mode;
    const unit = amounts === 'both' ? rng.pick(['cents', 'dollars'] as const) : amounts;
    return kind === 'count-coins' ? countCoins(rng, unit) : makeChange(rng, unit);
  },
});
