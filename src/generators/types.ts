import type { z } from 'astro/zod';
import type { Rng } from '../lib/rng';
import type { Item } from '../model/schemas';

/**
 * A question generator. It produces ordinary items (the same shapes a quiz uses),
 * so grading, rendering, printing and progress need no special cases.
 *
 * Rules:
 * - Pure and deterministic: all randomness comes from `rng`.
 * - Prompts and explanations are plain text (no Markdown), because new sets are
 *   generated in the browser.
 * - The answer is computed, never typed by hand.
 */
export interface Generator<Params = unknown> {
  id: string;
  title: string;
  description: string;
  params: z.ZodType<Params>;
  generate(rng: Rng, params: Params): Item;
}

export function defineGenerator<Params>(generator: Generator<Params>): Generator<Params> {
  return generator;
}
