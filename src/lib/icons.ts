/**
 * Lucide icons, inlined at build time. Content refers to icons by name
 * (https://lucide.dev/icons), and the catalog rejects names that do not exist.
 */
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const iconsDir = join(dirname(createRequire(import.meta.url).resolve('lucide-static/package.json')), 'icons');
const cache = new Map<string, string>();

export function iconExists(name: string): boolean {
  return /^[a-z0-9-]+$/.test(name) && existsSync(join(iconsDir, `${name}.svg`));
}

/** Inner SVG markup (paths) of a Lucide icon. */
function iconBody(name: string): string {
  let body = cache.get(name);
  if (body === undefined) {
    if (!iconExists(name)) throw new Error(`Unknown Lucide icon "${name}"`);
    const svg = readFileSync(join(iconsDir, `${name}.svg`), 'utf8');
    body = svg
      .replace(/^[\s\S]*?<svg[^>]*>/, '')
      .replace(/<\/svg>\s*$/, '')
      .trim();
    cache.set(name, body);
  }
  return body;
}

export interface IconOptions {
  size?: number;
  strokeWidth?: number;
  className?: string;
  /** Accessible name. Omit for decorative icons. */
  label?: string;
}

export function iconSvg(name: string, options: IconOptions = {}): string {
  const { size = 24, strokeWidth = 2, className = '', label } = options;
  const a11y = label ? `role="img" aria-label="${label.replace(/"/g, '&quot;')}"` : 'aria-hidden="true"';
  return `<svg class="icon ${className}" xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" ${a11y}>${iconBody(name)}</svg>`;
}

/** Icon as nested SVG content, for composing into larger drawings (card art). */
export function iconGroup(name: string, x: number, y: number, size: number, attrs: string): string {
  const scale = size / 24;
  return `<g transform="translate(${x} ${y}) scale(${scale})" fill="none" stroke-linecap="round" stroke-linejoin="round" ${attrs}>${iconBody(name)}</g>`;
}
