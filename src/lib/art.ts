/**
 * Generated card art. Every lesson and course gets a distinct, on-brand image
 * from its id, subject palette and icon, so authors never draw art by hand and
 * the hub always looks consistent.
 */
import { iconGroup } from './icons';
import { createRng } from './rng';
import { SUBJECTS, type SubjectId } from './subjects';

export interface ArtOptions {
  seed: string;
  subject: SubjectId;
  icon: string;
  width?: number;
  height?: number;
}

export function cardArt({ seed, subject, icon, width = 320, height = 180 }: ArtOptions): string {
  const [deep, mid, light, pop] = SUBJECTS[subject].palette;
  const rng = createRng(seed);
  const id = `a${createRng(`${seed}#id`).int(0, 1e9).toString(36)}`;
  const angle = rng.int(0, 359);

  const between = (min: number, max: number) => rng.int(Math.round(min), Math.round(max));
  const shapes: string[] = [];
  // Large soft discs for depth.
  for (let i = 0; i < 3; i++) {
    const r = between(height * 0.35, height * 0.75);
    const cx = between(-r / 3, width * 0.65);
    const cy = between(-r / 3, height + r / 3);
    const fill = i === 0 ? mid : light;
    const opacity = i === 0 ? 0.55 : 0.16 + rng.next() * 0.12;
    shapes.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" opacity="${opacity.toFixed(2)}"/>`);
  }
  // The focal group (rings and icon) and the accent dot can be hidden by
  // hero layouts on narrow screens, where they would be clipped.
  const focus: string[] = [];
  const ix = Math.round(width * 0.72);
  const iy = Math.round(height * 0.48);
  for (let i = 1; i <= 3; i++) {
    focus.push(
      `<circle cx="${ix}" cy="${iy}" r="${i * height * 0.17}" fill="none" stroke="${light}" stroke-opacity="${(0.32 - i * 0.07).toFixed(2)}" stroke-width="1.5"/>`,
    );
  }
  // A small accent dot.
  const dot = `<circle class="art-dot" cx="${between(width * 0.08, width * 0.45)}" cy="${between(height * 0.12, height * 0.4)}" r="${Math.round(height * 0.035)}" fill="${pop}"/>`;

  const iconSize = Math.round(height * 0.42);
  return `<svg class="card-art" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
<defs>
<linearGradient id="${id}-bg" gradientTransform="rotate(${angle} .5 .5)"><stop offset="0" stop-color="${deep}"/><stop offset="1" stop-color="${mid}"/></linearGradient>
<pattern id="${id}-dots" width="14" height="14" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1" fill="${light}" opacity=".22"/></pattern>
</defs>
<rect width="${width}" height="${height}" fill="url(#${id}-bg)"/>
<rect width="${width}" height="${height}" fill="url(#${id}-dots)"/>
${shapes.join('\n')}
${dot}
<g class="art-focus">${focus.join('')}${iconGroup(icon, ix - iconSize / 2, iy - iconSize / 2, iconSize, `stroke="${pop}" stroke-width="1.6"`)}</g>
</svg>`;
}
