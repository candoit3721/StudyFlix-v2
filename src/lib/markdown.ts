/**
 * Markdown used inside content YAML. GFM (tables, lists) plus $inline$ and
 * $$display$$ math rendered with KaTeX at build time. Raw HTML is not allowed.
 */
import rehypeKatex from 'rehype-katex';
import rehypeStringify from 'rehype-stringify';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkMath)
  .use(remarkRehype)
  .use(rehypeKatex)
  .use(rehypeStringify)
  .freeze();

/** The few fields of a HTML/MathML syntax tree node that `fractionsAsText` needs. */
interface TreeNode {
  type: string;
  tagName?: string;
  value?: string;
  children?: TreeNode[];
}

/**
 * Writes each MathML fraction as `numerator/denominator`, with brackets around a numerator or
 * denominator of more than one part (including another fraction). Without it, 5/2 would read "52".
 */
function fractionsAsText() {
  const text = (value: string): TreeNode => ({ type: 'text', value });
  const isGroup = (node: TreeNode) =>
    node.tagName === 'mfrac' ||
    (node.tagName === 'mrow' && (node.children ?? []).filter((c) => c.type === 'element').length > 1);
  const term = (node: TreeNode) => (isGroup(node) ? [text('('), node, text(')')] : [node]);
  const walk = (node: TreeNode): void => {
    for (const child of node.children ?? []) walk(child);
    const parts = (node.children ?? []).filter((c) => c.type === 'element');
    if (node.tagName === 'mfrac' && parts.length === 2) {
      const [top, bottom] = parts as [TreeNode, TreeNode];
      node.children = [...term(top), text('/'), ...term(bottom)];
    }
  };
  return walk;
}

/** Same pipeline with MathML-only output, used to derive plain-text labels. */
const labelProcessor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkMath)
  .use(remarkRehype)
  .use(rehypeKatex, { output: 'mathml' })
  .use(fractionsAsText)
  .use(rehypeStringify)
  .freeze();

const cache = new Map<string, string>();

/** Marker rehype-katex puts on formulas it could not parse. The content test fails on it. */
export const MATH_ERROR_CLASS = 'katex-error';

/** Block-level Markdown to HTML. */
export function renderMarkdown(source: string): string {
  let html = cache.get(source);
  if (html === undefined) {
    html = String(processor.processSync(source))
      .trim()
      // Wide tables and formulas scroll sideways on phones instead of widening the
      // page; scroll regions must be reachable by keyboard.
      .replace(/<table>/g, '<div class="table-scroll" tabindex="0" role="region" aria-label="Table"><table>')
      .replace(/<span class="katex-display">/g, '<span class="katex-display" tabindex="0" role="math">')
      .replace(/<\/table>/g, '</table></div>');
    cache.set(source, html);
  }
  return html;
}

/** Single-paragraph Markdown (prompts, choices) to inline HTML. */
export function renderInline(source: string): string {
  const html = renderMarkdown(source);
  const single = /^<p>([\s\S]*)<\/p>$/.exec(html);
  return single && !single[1]?.includes('<p>') ? (single[1] as string) : html;
}

/**
 * Plain text for accessible names, for example `$n \\times 2$` becomes "n×2".
 * Screen readers cannot always name a button from KaTeX's visual markup.
 */
export function plainText(source: string): string {
  return String(labelProcessor.processSync(source))
    .replace(/<annotation[\s\S]*?<\/annotation>/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}
