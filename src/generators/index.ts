import { createRng, hashKey } from '../lib/rng';
import type { Item } from '../model/schemas';
import { fractionOfAQuantity } from './fraction-of-a-quantity';
import { gaussSum } from './gauss-sum';
import { money } from './money';
import { ratiosRates } from './ratios-rates';
import type { Generator } from './types';

/** Every generator a practice block may reference. Add new generators here. */
// biome-ignore lint/suspicious/noExplicitAny: each generator has its own params type; generateSet parses them.
export const GENERATORS: Record<string, Generator<any>> = {
  [fractionOfAQuantity.id]: fractionOfAQuantity,
  [gaussSum.id]: gaussSum,
  [money.id]: money,
  [ratiosRates.id]: ratiosRates,
};

export interface KeyedItem {
  key: string;
  item: Item;
}

export function getGenerator(id: string): Generator<unknown> {
  const generator = GENERATORS[id];
  if (!generator) throw new Error(`Unknown generator "${id}"`);
  return generator;
}

/**
 * Generate `count` distinct items. The same (generator, params, count, seed)
 * always yields the same set, so printed worksheets and answer keys match.
 */
export function generateSet(
  generatorId: string,
  rawParams: unknown,
  count: number,
  seed: number | string,
): KeyedItem[] {
  const generator = getGenerator(generatorId);
  const params = generator.params.parse(rawParams ?? {});
  const rng = createRng(seed);
  const seen = new Set<string>();
  const out: KeyedItem[] = [];
  for (let tries = 0; out.length < count; tries++) {
    if (tries > count * 50) {
      throw new Error(`Generator "${generatorId}" could not produce ${count} distinct items`);
    }
    const item = generator.generate(rng, params);
    if (seen.has(item.prompt)) continue;
    seen.add(item.prompt);
    out.push({ key: hashKey(item.prompt), item });
  }
  return out;
}
