import type { LessonRequirements } from '../lib/progress';
import { hashKey } from '../lib/rng';
import type { Block, Item } from './schemas';

export function itemKey(item: Item): string {
  return hashKey(item.prompt);
}

/** What a learner must do to finish a lesson. Mirrors `gradedUnits` in catalog.ts. */
export function lessonRequirements(blocks: Block[]): LessonRequirements {
  return {
    itemKeys: blocks.flatMap((block) =>
      block.type === 'quiz' ? block.items.map((item) => `${block.id}:${itemKey(item)}`) : [],
    ),
    practice: blocks.flatMap((block) =>
      block.type === 'practice' ? [{ id: block.id, count: block.count }] : [],
    ),
  };
}
