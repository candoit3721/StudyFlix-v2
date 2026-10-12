import { expect, type Locator, type Page } from '@playwright/test';

/** Choose a learner the way a child does: from the "Who's learning today?" screen. */
export async function chooseLearner(page: Page, name: string): Promise<void> {
  await page.goto('/');
  await page.getByRole('link', { name: new RegExp(name) }).click();
  await expect(page.locator('[data-learner-pill]')).toContainText(name);
}

interface ItemData {
  kind: 'choice' | 'number' | 'text';
  answer?: string | number;
  accept?: string[];
  choices?: string[];
}

export async function itemData(item: Locator): Promise<ItemData> {
  return JSON.parse((await item.getAttribute('data-item')) ?? '{}') as ItemData;
}

/** Answer one item correctly (or wrongly) through the UI. */
export async function answerItem(item: Locator, correctly: boolean): Promise<void> {
  const data = await itemData(item);
  if (data.kind === 'choice') {
    const choices = data.choices ?? [];
    const target = correctly ? data.answer : choices.find((c) => c !== data.answer);
    const index = choices.indexOf(String(target));
    await item.locator('button.choice').nth(index).click();
    return;
  }
  const value = data.kind === 'number' ? String(data.answer) : (data.accept?.[0] ?? '');
  await item.getByLabel('Your answer').fill(correctly ? value : `${value}9`);
  await item.getByRole('button', { name: 'Check' }).click();
}

/** Answer every item on the page correctly, including practice sets. */
export async function completeLesson(page: Page): Promise<void> {
  const items = page.locator('li.item');
  const count = await items.count();
  for (let i = 0; i < count; i++) await answerItem(items.nth(i), true);
}
