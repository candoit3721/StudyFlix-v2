import { expect, test } from '@playwright/test';
import { site } from './helpers';

test('worksheet and answer key come from the same practice set', async ({ page }) => {
  await page.goto(site('/courses/math-contest-club/any-range/worksheet/'));
  const prompts = await page.locator('.print-block--practice .print-prompt').allTextContents();
  expect(prompts).toHaveLength(6);

  await page.goto(site('/courses/math-contest-club/any-range/answer-key/'));
  const keyPrompts = await page.locator('.key-items').last().locator('.key-prompt').allTextContents();
  expect(keyPrompts).toEqual(prompts);
  await expect(page.locator('.key-answer').first()).toHaveText('31');
});

test('the printed worksheet hides the toolbar and fits the page width', async ({ page }) => {
  await page.goto(site('/courses/g6-science/six-kingdoms/worksheet/'));
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.print-toolbar')).toBeHidden();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  const pdf = await page.pdf({ format: 'Letter' });
  expect(pdf.byteLength).toBeGreaterThan(10_000);
});

test('generated choice and unit questions print with their choices and units', async ({ page }) => {
  await page.goto(site('/courses/g6-math/ratios-and-rates/worksheet/'));
  const items = page.locator('.print-block--practice .print-items > li');
  await expect(items).toHaveCount(8);
  const simplify = items.filter({ hasText: 'in lowest terms?' }).first();
  await expect(simplify.locator('.print-choices > li')).toHaveCount(4);
  const speed = items.filter({ hasText: 'kilometres' }).first();
  await expect(speed.locator('.print-line')).toHaveText(/km\/h/);

  await page.goto(site('/courses/g6-math/ratios-and-rates/answer-key/'));
  const answer = page
    .locator('.key-items')
    .last()
    .locator('li')
    .filter({ hasText: 'in lowest terms?' })
    .first();
  await expect(answer.locator('.key-answer')).toHaveText(/^[A-D]\. \d+\u00a0:\u00a0\d+$/);
});
