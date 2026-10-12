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

test('lesson pages use the page width on desktop and stay single-column on phones', async ({ page }) => {
  const width = page.viewportSize()?.width ?? 0;
  const box = async (selector: string) => {
    const found = await page.locator(selector).first().boundingBox();
    expect(found, selector).not.toBeNull();
    return found as NonNullable<typeof found>;
  };

  for (const path of ['/courses/g6-science/six-kingdoms/', '/courses/math-contest-club/pairing-trick/']) {
    await page.goto(path);
    const [sheet, h1, rail, main] = await Promise.all(
      ['.lesson-sheet', '.lesson-hero h1', '.lesson-rail', '.lesson-main'].map(box),
    );

    if (width >= 900) {
      // Laptop and wider: the sheet spans the page column, with the rail beside the content column.
      expect(Math.abs(sheet.x - h1.x), `${path} sheet lines up with the hero`).toBeLessThanOrEqual(1);
      expect(rail.x + rail.width, `${path} rail sits left of the content`).toBeLessThanOrEqual(main.x);
      // The content column grows to --read-max (46rem) and never past it.
      if (width >= 1200) {
        expect(sheet.width, path).toBeGreaterThanOrEqual(1150);
        expect(Math.abs(main.width - 736), `${path} content keeps --read-max`).toBeLessThanOrEqual(1);
      } else {
        expect(main.width, `${path} content stays within --read-max`).toBeLessThanOrEqual(737);
      }
    } else {
      // Narrow: one centred column, capped at 52rem, with the rail above the content.
      const maxWidth = await page.locator('.lesson-sheet').evaluate((el) => getComputedStyle(el).maxWidth);
      expect(maxWidth, path).toBe('832px');
      expect(sheet.width, path).toBeLessThanOrEqual(832);
      expect(rail.y + rail.height, `${path} rail comes before the content`).toBeLessThanOrEqual(main.y);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${path} scrolls sideways by ${overflow}px`).toBeLessThanOrEqual(0);
    }
  }

  if (width >= 900) {
    // The progress card stays in view, below the sticky header, while the learner works through the quiz.
    await page.goto('/courses/g6-science/six-kingdoms/');
    await page.locator('#check').scrollIntoViewIfNeeded();
    const status = page.locator('.lesson-status');
    await expect(status).toBeInViewport({ ratio: 1 });
    expect((await box('.lesson-status')).y).toBeGreaterThanOrEqual(64);

    // A common laptop window (the width a parent reported) gets the wide layout too.
    await page.setViewportSize({ width: 1090, height: 720 });
    await page.goto('/courses/g6-science/what-is-biodiversity/');
    const [sheet, h1, rail, main] = await Promise.all(
      ['.lesson-sheet', '.lesson-hero h1', '.lesson-rail', '.lesson-main'].map(box),
    );
    expect(Math.abs(sheet.x - h1.x), 'sheet lines up with the hero at 1090px').toBeLessThanOrEqual(1);
    expect(rail.x + rail.width, 'rail sits left of the content at 1090px').toBeLessThanOrEqual(main.x);
    expect(main.width).toBeGreaterThanOrEqual(640);

    // The lesson with the longest objectives, at that laptop size: the rail must never become a scroll box
    // (keyboard users could not reach it, axe scrollable-region-focusable), and the progress card still
    // stays fully in view, below the header, all the way down to the foot of the lesson.
    await page.goto('/courses/g6-science/invasive-species-in-the-great-lakes/');
    const railOverflow = await page.locator('.lesson-rail').evaluate((el) => getComputedStyle(el).overflowY);
    expect(railOverflow, 'rail is not a scroll container').toBe('visible');
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
    await page.locator('.lesson-foot').scrollIntoViewIfNeeded();
    await expect(status).toBeInViewport({ ratio: 1 });
    expect((await box('.lesson-status')).y).toBeGreaterThanOrEqual(64);
  }
});
