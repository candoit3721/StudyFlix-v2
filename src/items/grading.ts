import { formatNumber } from '../lib/format';
import type { Item } from '../model/schemas';

/** Lowercase, trim, collapse spaces, drop punctuation. Used for text answers. */
export function normalizeText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Accepts "12345", "12,345", "12 345", "-3.5" and "$4.25". Returns null when unreadable. */
export function parseNumber(value: string): number | null {
  const cleaned = value.replace(/[\s,$]/g, '');
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(cleaned)) return null;
  return Number(cleaned);
}

export function isCorrect(item: Item, response: string): boolean {
  switch (item.kind) {
    case 'choice':
      return response === item.answer;
    case 'number': {
      const value = parseNumber(response);
      return value !== null && Math.abs(value - item.answer) <= (item.tolerance ?? 0) + 1e-9;
    }
    case 'text': {
      const given = normalizeText(response);
      return given !== '' && item.accept.some((accepted) => normalizeText(accepted) === given);
    }
  }
}

/** The answer as it appears in answer keys and feedback. */
export function answerText(item: Item): string {
  switch (item.kind) {
    case 'choice':
      return item.answer;
    case 'number':
      return `${formatNumber(item.answer)}${item.unit ? ` ${item.unit}` : ''}`;
    case 'text':
      return item.accept[0] as string;
  }
}
