// @ts-check
import { defineConfig } from 'astro/config';
import { normalizeBase } from './scripts/site-base.mjs';

// https://astro.build/config
export default defineConfig({
  // Where the site is served from: `/` at a domain root, `/StudyFlix-v2/` on GitHub Pages (docs/deploy.md).
  base: normalizeBase(process.env.SITE_BASE),
});
