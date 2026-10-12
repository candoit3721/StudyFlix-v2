/**
 * One HTML renderer for interactive items, used at build time (quiz blocks,
 * the first practice set) and in the browser (new practice sets). Keeping a
 * single renderer means a generated question looks exactly like a written one.
 */
import type { Item } from '../model/schemas';

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface RenderedItem {
  key: string;
  item: Item;
  /** Prompt as HTML (Markdown already rendered, or escaped plain text). */
  promptHtml: string;
  /** Choice labels as HTML, in the same order as `item.choices`. */
  choicesHtml?: string[];
  /** Plain-text accessible names for choices, needed when a choice contains math. */
  choicesLabel?: string[];
  explanationHtml?: string;
}

export function itemHtml(
  { key, item, promptHtml, choicesHtml, choicesLabel, explanationHtml }: RenderedItem,
  index: number,
): string {
  const inputId = `i-${key}`;
  let answer: string;
  if (item.kind === 'choice') {
    const labels = choicesHtml ?? item.choices.map(escapeHtml);
    answer = `<div class="item-choices" role="group" aria-label="Choices">${item.choices
      .map(
        (choice, i) =>
          `<button type="button" class="choice" data-value="${escapeHtml(choice)}"${choicesLabel?.[i] ? ` aria-label="${escapeHtml(choicesLabel[i])}"` : ''}>${labels[i]}</button>`,
      )
      .join('')}</div>`;
  } else {
    const numeric = item.kind === 'number';
    const unit = numeric && item.unit ? `<span class="item-unit">${escapeHtml(item.unit)}</span>` : '';
    answer = `<form class="item-answer" novalidate>
<label class="visually-hidden" for="${inputId}">Your answer</label>
<input id="${inputId}" name="answer" autocomplete="off" spellcheck="false" ${numeric ? 'inputmode="decimal"' : ''} placeholder="${numeric ? 'Your number' : 'Your answer'}">${unit}
<button type="submit" class="button">Check</button>
</form>`;
  }
  return `<li class="item" data-key="${escapeHtml(key)}" data-item="${escapeHtml(JSON.stringify(item))}">
<div class="item-head"><span class="item-number">${index + 1}</span><div class="item-prompt">${promptHtml}</div></div>
${answer}
<p class="item-feedback" aria-live="polite"></p>
${explanationHtml ? `<div class="item-explanation" hidden>${explanationHtml}</div>` : ''}
</li>`;
}

/** Plain-text items (generated) to HTML. */
export function plainItemHtml(key: string, item: Item, index: number): string {
  return itemHtml(
    {
      key,
      item,
      promptHtml: escapeHtml(item.prompt),
      explanationHtml: item.explanation ? `<p>${escapeHtml(item.explanation)}</p>` : undefined,
    },
    index,
  );
}
