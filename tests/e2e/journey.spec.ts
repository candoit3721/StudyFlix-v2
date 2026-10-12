import { expect, test } from '@playwright/test';
import { answerItem, chooseLearner, completeLesson } from './helpers';

test('a learner picks their profile and starts the first lesson', async ({ page }) => {
  await chooseLearner(page, 'Sophia');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('What Is Biodiversity?');
  await expect(page.getByText('Start here, Sophia')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Grade 6 Science' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Math Contest Club' })).toBeVisible();

  await page.getByRole('link', { name: 'Start lesson' }).click();
  await expect(page).toHaveURL(/\/courses\/g6-science\/what-is-biodiversity\/$/);
  await expect(page.getByText('Not started yet')).toBeVisible();
});

test('quiz feedback: a wrong answer can be retried, a second miss reveals the answer', async ({ page }) => {
  await chooseLearner(page, 'Sophia');
  await page.goto('/courses/g6-science/six-kingdoms/');
  const items = page.locator('#check li.item');

  await answerItem(items.nth(0), false);
  await expect(items.nth(0)).toHaveAttribute('data-state', 'wrong');
  await expect(items.nth(0).locator('.item-feedback')).toHaveText('Not quite. Try again.');
  await answerItem(items.nth(0), true);
  await expect(items.nth(0)).toHaveAttribute('data-state', 'correct');

  await answerItem(items.nth(3), false);
  await answerItem(items.nth(3), false);
  await expect(items.nth(3)).toHaveAttribute('data-state', 'revealed');
  await expect(items.nth(3).locator('.item-feedback')).toHaveText('The answer is 6.');
  await expect(page.locator('.lesson-status [data-label]')).toHaveText('1 of 5 done');
});

test('finishing a lesson marks it done and moves the hero to the next lesson', async ({ page }) => {
  await chooseLearner(page, 'Sophia');
  await page.goto('/courses/g6-science/what-is-biodiversity/');
  await completeLesson(page);
  await expect(page.getByText('Lesson complete. Great work!')).toBeVisible();

  await page.reload();
  await expect(page.locator('#check li.item[data-state="correct"]')).toHaveCount(4);

  await page.getByRole('link', { name: 'Sophia' }).click();
  await expect(page.getByText('Up next, Sophia')).toBeVisible();
  await expect(page.locator('[data-title]')).toHaveText('The Six Kingdoms of Life');
  const card = page.locator('sf-lesson-status[data-lesson="g6-science/what-is-biodiversity"]');
  await expect(card.locator('[data-done]')).toBeVisible();
});

test('practice sets are graded and a new set replaces the questions', async ({ page }) => {
  await chooseLearner(page, 'Sophia');
  await page.goto('/courses/math-contest-club/pairing-trick/');
  const practice = page.locator('#practice');
  const first = practice.locator('li.item').first();
  const before = await first.locator('.item-prompt').textContent();

  await answerItem(first, true);
  await expect(first).toHaveAttribute('data-state', 'correct');
  await expect(practice.locator('[data-score]')).toHaveText('1 of 6 correct');

  await practice.getByRole('button', { name: 'New set' }).click();
  await expect(practice.locator('li.item')).toHaveCount(6);
  await expect(practice.locator('li.item').first().locator('.item-prompt')).not.toHaveText(before ?? '');
  await expect(practice.locator('[data-score]')).toHaveText('0 of 6 correct');
});

test('worked examples reveal one step at a time', async ({ page }) => {
  await page.goto('/courses/math-contest-club/pairing-trick/');
  const example = page.locator('#one-to-hundred');
  const steps = example.locator('.example-steps > li');
  await expect(steps.first()).toBeHidden();
  await example.getByRole('button', { name: 'Show the first step' }).click();
  await expect(steps.first()).toBeVisible();
  await example.getByRole('button', { name: 'Show the next step' }).click();
  await example.getByRole('button', { name: 'Show the next step' }).click();
  await example.getByRole('button', { name: 'Show the answer' }).click();
  await expect(example.locator('[data-answer]')).toBeVisible();
  await expect(example.getByRole('button')).toHaveCount(0);
});

test('flashcards flip to show the meaning', async ({ page }) => {
  await page.goto('/courses/g6-science/what-is-biodiversity/');
  const card = page.locator('.flashcard').first();
  await expect(card).toHaveAttribute('aria-pressed', 'false');
  await card.click();
  await expect(card).toHaveAttribute('aria-pressed', 'true');
});

test('flashcard words never break in the middle', async ({ page }) => {
  await page.goto('/courses/g6-science/vertebrates-and-invertebrates/');
  const broken = await page.$$eval('.flashcard-front', (faces) =>
    faces
      .filter((face) => {
        const range = document.createRange();
        range.selectNodeContents(face);
        return !face.textContent?.trim().includes(' ') && range.getClientRects().length > 1;
      })
      .map((face) => face.textContent?.trim()),
  );
  expect(broken).toEqual([]);
});

test('curriculum coverage links expectations to lessons', async ({ page }) => {
  await page.goto('/curricula/ontario-science-2022-g6/');
  await expect(page.getByText('2 of 11')).toBeVisible();
  await expect(page.locator('#B2').getByRole('link', { name: 'The Six Kingdoms of Life' })).toBeVisible();
  await expect(page.locator('#E1')).toContainText('No lessons yet');
});
