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
  '/courses/g6-math/',
  '/courses/g6-math/ratios-and-rates/',
  '/courses/g6-math/ratios-and-rates/worksheet/',
  '/courses/g6-math/ratios-and-rates/answer-key/',
  '/curricula/ontario-math-2020-g6/',
  '/account/',
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

test('a number answer with a unit comes back without the unit repeated in the box', async ({ page }) => {
  await chooseLearner(page, 'Sophia');
  await page.goto('/courses/g6-math/ratios-and-rates/');
  const item = page.locator('#check li.item').filter({ hasText: 'What is its speed?' });
  await answerItem(item, true);
  await expect(item).toHaveAttribute('data-state', 'correct');

  await page.reload();
  await expect(item).toHaveAttribute('data-state', 'correct');
  await expect(item.getByLabel('Your answer')).toHaveValue('90');
  await expect(item.locator('.item-unit')).toHaveText('km/h');
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

test('answer boxes stay wide enough to read, with the unit beside the box', async ({ page }) => {
  await page.goto('/courses/g6-math/ratios-and-rates/');
  for (let round = 0; round < 6; round++) {
    for (const field of await page.locator('form.item-answer').all()) {
      const input = await field.locator('input').boundingBox();
      expect(input?.width ?? 0, 'answer box width').toBeGreaterThanOrEqual(127);
      const unit = field.locator('.item-unit');
      if ((await unit.count()) === 0) continue;
      const unitBox = await unit.boundingBox();
      expect(unitBox?.x ?? 0, `${await unit.textContent()} sits right of the box`).toBeGreaterThan(
        (input?.x ?? 0) + (input?.width ?? 0),
      );
    }
    await page.getByRole('button', { name: 'New set' }).click();
  }
});

test('accessibility: / after the intro has ended', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.intro')).toBeHidden({ timeout: 2500 });
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
});

/** Records whether the landing intro was switched on at any point while the page loaded. */
async function watchIntro(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as Window & { introPlayed?: boolean };
    w.introPlayed = false;
    const root = document.documentElement;
    const check = () => {
      if (root.dataset.intro === 'play') w.introPlayed = true;
    };
    new MutationObserver(check).observe(root, { attributes: true, attributeFilter: ['data-intro'] });
  });
}

const introPlayed = (page: Page) =>
  page.evaluate(() => (window as Window & { introPlayed?: boolean }).introPlayed);

test('landing intro: a big S covers the picker on a fresh visit, then hides itself', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const intro = page.locator('.intro');
  await expect(intro).toHaveAttribute('aria-hidden', 'true');
  await expect(intro).toBeVisible({ timeout: 500 });
  await expect(intro).toHaveText('S');
  const size = await intro
    .locator('.intro-mark')
    .evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize));
  expect(size, 'the S is large').toBeGreaterThanOrEqual(200);
  // It covers the sticky header too.
  const box = await intro.boundingBox();
  expect(box?.y).toBe(0);

  await expect(intro).toBeHidden({ timeout: 2500 });
  await expect(intro).toHaveCSS('display', 'none');
  await expect(page.getByRole('heading', { name: "Who's learning today?" })).toBeVisible();
});

test('landing intro: plays once per tab session', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.intro')).toBeHidden({ timeout: 2500 });
  await watchIntro(page);

  await page.reload();
  expect(await introPlayed(page), 'after a reload').toBe(false);
  await expect(page.locator('.intro')).toBeHidden();

  await chooseLearner(page, 'Sophia');
  await page.getByRole('link', { name: 'Switch learner' }).click();
  await expect(page).toHaveURL(/\/$/);
  expect(await introPlayed(page), 'after "Switch learner"').toBe(false);

  await page.goBack();
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  expect(await introPlayed(page), 'after going back').toBe(false);
  await expect(page.locator('.intro')).toBeHidden();
});

test('landing intro: never shows under reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await watchIntro(page);
  await page.goto('/');
  expect(await introPlayed(page)).toBe(false);
  await expect(page.locator('.intro')).toBeHidden();
  await expect(page.locator('.intro')).toHaveCSS('display', 'none');
});

test('landing intro: a key press skips it at once', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.intro')).toBeVisible({ timeout: 500 });
  await page.keyboard.press('Tab');
  await expect(page.locator('.intro')).toBeHidden({ timeout: 250 });
});

test('profile picker: a profile name turns white with a white tile frame on focus and hover', async ({
  page,
  isMobile,
}) => {
  await page.goto('/');
  const option = page.locator('.chooser-option').first();
  const name = option.locator('.chooser-name');
  const tile = option.locator('.avatar');
  await expect(name).toHaveCSS('color', 'rgb(179, 179, 179)');
  await expect(tile).toHaveCSS('box-shadow', 'none');

  if (!isMobile) {
    await option.hover();
    await expect(name).toHaveCSS('color', 'rgb(255, 255, 255)');
    await expect(tile).toHaveCSS('box-shadow', 'rgb(255, 255, 255) 0px 0px 0px 3px');
    await page.mouse.move(0, 0);
    await expect(name).toHaveCSS('color', 'rgb(179, 179, 179)');
  }

  for (let i = 0; i < 5 && !(await option.evaluate((el) => el === document.activeElement)); i++) {
    await page.keyboard.press('Tab');
  }
  await expect(option).toBeFocused();
  await expect(name).toHaveCSS('color', 'rgb(255, 255, 255)');
  await expect(tile).toHaveCSS('box-shadow', 'rgb(255, 255, 255) 0px 0px 0px 3px');
});

test('theme: dark chrome, red wordmark and a white play button', async ({ page }) => {
  await page.goto('/learners/sophia/');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(20, 20, 20)');
  await expect(page.locator('body')).toHaveCSS('font-family', /^"Inter Variable"/);
  const wordmark = page.locator('.wordmark');
  await expect(wordmark).toHaveText('StudyFlix');
  await expect(wordmark).toHaveCSS('color', 'rgb(229, 9, 20)');
  await expect(wordmark).toHaveCSS('font-family', /^"Bebas Neue"/);
  await expect(wordmark).toHaveCSS('text-transform', 'uppercase');
  const size = await wordmark.evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize));
  expect(size, 'red wordmark stays large text').toBeGreaterThanOrEqual(28);
  const play = page.getByRole('link', { name: 'Start lesson' });
  await expect(play).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(play).toHaveCSS('color', 'rgb(20, 20, 20)');
});
