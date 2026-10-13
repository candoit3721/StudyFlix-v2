// @ts-check
/**
 * The site's base path, the single source of truth for where StudyFlix is served from.
 *
 * It comes from the SITE_BASE environment variable at build time: unset or `/` serves the site at a
 * domain root, `/StudyFlix-v2/` serves it from a GitHub Pages project subpath (docs/deploy.md).
 * Imported by astro.config.mjs, playwright.config.ts, the e2e helpers, a unit test and
 * scripts/e2e-other-base.mjs, so it is plain JavaScript.
 */

/** The subpath the second e2e pass uses when the main build is served at the root. */
export const SUBPATH_PROBE = '/StudyFlix-v2/';

/** @type {[RegExp, string][]} What a base path may not contain, checked after normalization. */
const PROBLEMS = [
  [/:\/\//, 'a full URL ("://")'],
  [/\.\./, '".."'],
  [/\?/, '"?"'],
  [/#/, '"#"'],
  [/\/\//, 'a double slash'],
  [/\s/, 'whitespace'],
];

/**
 * Turns a raw SITE_BASE value into a base path that starts and ends with `/`.
 * Empty, blank or missing values mean the root. The case is kept, because Pages paths are case-sensitive.
 *
 * @param {string | undefined} raw
 * @returns {string}
 */
export function normalizeBase(raw) {
  const trimmed = (raw ?? '').trim();
  if (trimmed === '' || trimmed === '/') return '/';
  const base = `${trimmed.startsWith('/') ? '' : '/'}${trimmed}${trimmed.endsWith('/') ? '' : '/'}`;
  const problem = PROBLEMS.find(([pattern]) => pattern.test(base))?.[1];
  if (problem) {
    throw new Error(
      `SITE_BASE ${JSON.stringify(raw)} is not a valid base path: it contains ${problem}. ` +
        'Use a path such as "/" or "/StudyFlix-v2/".',
    );
  }
  return base;
}
