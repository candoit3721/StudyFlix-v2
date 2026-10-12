import { describe, expect, it } from 'vitest';
import { cardArt } from '../../src/lib/art';
import { SUBJECT_IDS } from '../../src/lib/subjects';

describe('cardArt', () => {
  it.each([
    [320, 180],
    [1280, 520],
    [1280, 400],
    [97, 61],
  ])('renders at %ix%i for every subject', (width, height) => {
    for (const subject of SUBJECT_IDS) {
      for (let i = 0; i < 25; i++) {
        const svg = cardArt({ seed: `seed-${i}`, subject, icon: 'sprout', width, height });
        expect(svg).toMatch(/^<svg[\s\S]*<\/svg>$/);
        expect(svg).not.toMatch(/NaN|undefined/);
      }
    }
  });

  it('is deterministic per seed and distinct across seeds', () => {
    const a = cardArt({ seed: 'a', subject: 'math', icon: 'sigma' });
    expect(a).toBe(cardArt({ seed: 'a', subject: 'math', icon: 'sigma' }));
    expect(a).not.toBe(cardArt({ seed: 'b', subject: 'math', icon: 'sigma' }));
  });
});
