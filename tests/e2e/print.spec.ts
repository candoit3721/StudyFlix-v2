import { expect, test } from '@playwright/test';

test('worksheet and answer key come from the same practice set', async ({ page }) => {
  await page.goto('/courses/math-contest-club/any-range/worksheet/');
  const prompts = await page.locator('.print-block--practice .print-prompt').allTextContents();
  expect(prompts).toHaveLength(6);

  await page.goto('/courses/math-contest-club/any-range/answer-key/');
  const keyPrompts = await page.locator('.key-items').last().locator('.key-prompt').allTextContents();
  expect(keyPrompts).toEqual(prompts);
  await expect(page.locator('.key-answer').first()).toHaveText('31');
});

test('the printed worksheet hides the toolbar and fits the page width', async ({ page }) => {
  await page.goto('/courses/g6-science/six-kingdoms/worksheet/');
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.print-toolbar')).toBeHidden();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  const pdf = await page.pdf({ format: 'Letter' });
  expect(pdf.byteLength).toBeGreaterThan(10_000);
});
