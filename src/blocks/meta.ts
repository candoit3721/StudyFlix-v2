import type { Block } from '../model/schemas';

/** How each block type introduces itself, on screen and on paper. */
export const BLOCK_META: Record<Block['type'], { label: string; icon: string }> = {
  explainer: { label: 'Learn', icon: 'book-open' },
  example: { label: 'Worked example', icon: 'lightbulb' },
  flashcards: { label: 'Key words', icon: 'layers' },
  quiz: { label: 'Quiz', icon: 'circle-check-big' },
  practice: { label: 'Practice', icon: 'dumbbell' },
};
