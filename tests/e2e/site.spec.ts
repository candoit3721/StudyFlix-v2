import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { answerItem, chooseLearner } from './helpers';

/** Every page reachable from the home page, found by following links. */
async function crawl(page: Page): Promise<string[]> {
  const seen = new Set<string>(['/']);
  const queue = ['/'];
  while (queue.length > 0) {
    const path = queue.shift() as string;
    await page.goto(path);
    const hrefs = await page
      .locator('a[href^="/"]')
      .evaluateAll((links) => links.map((a) => new URL((a as HTMLAnchorElement).href).pathname));
    for (const href of hrefs) {
      if (!seen.has(href)) {
        seen.add(href);
        queue.push(href);
      }
    }
  }
  return [...seen].sort();
}

test('every page loads cleanly: no errors, no broken links, no sideways scrolling', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(`${page.url()}: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`${page.url()}: ${message.text()}`);
  });

  const paths = await crawl(page);
  expect(paths.length).toBeGreaterThan(10);
  for (const path of paths) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(200);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${path} scrolls sideways by ${overflow}px`).toBeLessThanOrEqual(0);
  }
  expect(errors).toEqual([]);
});

const AXE_PAGES = [
  '/',
  '/learners/sophia/',
  '/courses/g6-science/',
  '/courses/g6-science/six-kingdoms/',
  '/courses/math-contest-club/pairing-trick/',
  '/courses/math-contest-club/pairing-trick/worksheet/',
  '/courses/math-contest-club/pairing-trick/answer-key/',
  '/curricula/ontario-science-2022-g6/',
];

for (const path of AXE_PAGES) {
  test(`accessibility: ${path}`, async ({ page }) => {
    await page.goto(path);
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  });
}

test('accessibility: quiz feedback states (correct, wrong, revealed, complete)', async ({ page }) => {
  await chooseLearner(page, 'Sophia');
  await page.goto('/courses/g6-science/six-kingdoms/');
  const items = page.locator('#check li.item');
  await answerItem(items.nth(0), true);
  await answerItem(items.nth(1), false);
  await answerItem(items.nth(3), false);
  await answerItem(items.nth(3), false);
  await expect(items.nth(3)).toHaveAttribute('data-state', 'revealed');
  const results = await new AxeBuilder({ page }).include('#check').withTags(['wcag2a', 'wcag2aa']).analyze();
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
});
