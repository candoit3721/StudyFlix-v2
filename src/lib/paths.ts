/**
 * Site URLs under the base path (docs/deploy.md). Never hard-code a root-relative URL in a page:
 * use a catalog `url` or `withBase()`, so the site works at a domain root and under a subpath.
 */

/** `path` (starting with `/`) under `base` (starting and ending with `/`). */
export function joinBase(base: string, path: string): string {
  if (!path.startsWith('/')) throw new Error(`joinBase: path "${path}" must start with "/"`);
  return base + path.slice(1);
}

/** `path` (starting with `/`) under the base this site was built with. */
export function withBase(path: string): string {
  return joinBase(import.meta.env.BASE_URL, path);
}
