import AxeBuilder from '@axe-core/playwright';
import { type Browser, type BrowserContext, expect, type Page, test } from '@playwright/test';
import { FAKE_EMAIL, FAKE_PASSWORD, FakeSupabase } from './fake-supabase';
import { answerItem, chooseLearner } from './helpers';

const SIX_KINGDOMS = '/courses/g6-science/six-kingdoms/';
const BIODIVERSITY = '/courses/g6-science/what-is-biodiversity/';
const NOT_SET_UP =
  'Syncing is not set up for this copy of StudyFlix. Progress is saved in this browser only.';
const CHOOSER_NOTE =
  'Progress is saved on this device only. A parent can sign in so it follows every learner to every device.';
const OFFLINE =
  'Could not reach the sync service. Progress is saved on this device and will sync when the connection is back.';

/** A new device: a fresh browser context with this project's screen, pointed at the fake service. */
async function newDevice(
  browser: Browser,
  fake: FakeSupabase | null,
): Promise<{ context: BrowserContext; page: Page }> {
  const { baseURL, viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = test.info().project.use;
  const context = await browser.newContext({
    baseURL,
    viewport,
    userAgent,
    deviceScaleFactor,
    isMobile,
    hasTouch,
  });
  if (fake) await fake.install(context, baseURL ?? '');
  else await disableSync(context);
  return { context, page: await context.newPage() };
}

async function disableSync(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    (globalThis as { __STUDYFLIX_SYNC__?: unknown }).__STUDYFLIX_SYNC__ = null;
  });
}

async function signIn(page: Page): Promise<void> {
  await page.goto('/account/');
  await page.getByLabel('Email').fill(FAKE_EMAIL);
  await page.getByLabel('Password').fill(FAKE_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText(`This device is signed in as ${FAKE_EMAIL}.`)).toBeVisible();
  await expect(page.locator('[data-sync-status]')).toHaveText('Everything is synced.');
}

async function expectNoSeriousAxeViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
}

async function expectNoSidewaysScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, `scrolls sideways by ${overflow}px`).toBeLessThanOrEqual(0);
}

/** Answers the fake has for one quiz item of a lesson (all learners). */
function answered(fake: FakeSupabase, lesson: string, key?: string): number {
  return fake
    .summary()
    .filter((row) => row.lesson_id === lesson && (!key || row.key === key))
    .reduce((sum, row) => sum + row.answered, 0);
}

async function itemKey(page: Page, index: number): Promise<string> {
  const item = page.locator('#check li.item').nth(index);
  return `check:${await item.getAttribute('data-key')}`;
}

/** Every script URL the page downloads from now on. */
function collectScripts(page: Page): Set<string> {
  const urls = new Set<string>();
  page.on('request', (request) => {
    if (request.resourceType() === 'script') urls.add(request.url());
  });
  return urls;
}

/** Which of these scripts are (or contain) @supabase/supabase-js. */
async function syncLibraryScripts(page: Page, urls: Set<string>): Promise<string[]> {
  const found: string[] = [];
  for (const url of urls) {
    if ((await (await page.request.get(url)).text()).includes('X-Client-Info')) found.push(url);
  }
  return found;
}

/** Ask an open page to sync now, as when the browser comes back online. */
async function syncNow(page: Page): Promise<void> {
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
}

test.describe('sync not configured', () => {
  test.beforeEach(async ({ context }) => {
    await disableSync(context);
  });

  test('the site says so, hides sign-in and never downloads the sync library', async ({ page }) => {
    const scripts = collectScripts(page);

    await page.goto('/');
    await expect(page.locator('.chooser-list')).toBeVisible();
    await expect(page.locator('[data-sync-note]')).toBeHidden();
    await expect(page.locator('[data-sync-link]')).toBeHidden();

    await chooseLearner(page, 'Sophia');
    await page.goto(SIX_KINGDOMS);
    await answerItem(page.locator('#check li.item').first(), true);

    await page.goto('/account/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Family sign-in');
    await expect(page.getByText(NOT_SET_UP)).toBeVisible();
    await expect(page.locator('form')).toBeHidden();
    await expect(page.getByLabel('Email')).toBeHidden();
    await expectNoSidewaysScroll(page);
    await expectNoSeriousAxeViolations(page);

    expect(scripts.size).toBeGreaterThan(0);
    expect(await syncLibraryScripts(page, scripts)).toEqual([]);
  });
});

test('without the test override, the build config decides', async ({ page }) => {
  // `npm run verify` builds with no config; CI builds with the real project, or with empty values
  // while the repository variables are not set yet (which must also mean "not configured").
  const configured = Boolean(
    process.env.PUBLIC_SUPABASE_URL?.trim() && process.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim(),
  );
  await page.goto('/account/');
  if (configured) {
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.locator('[data-sync-link]')).toBeVisible();
  } else {
    await expect(page.getByText(NOT_SET_UP)).toBeVisible();
    await expect(page.locator('[data-sync-link]')).toBeHidden();
  }
});

test.describe('sync configured, signed out', () => {
  test('no request leaves the site while signed out', async ({ page, baseURL }) => {
    // The build's own config (CI sets the real project): nothing may reach it before sign-in.
    const configured = process.env.PUBLIC_SUPABASE_URL ? new URL(process.env.PUBLIC_SUPABASE_URL).host : null;
    const requests: URL[] = [];
    page.on('request', (request) => requests.push(new URL(request.url())));

    await chooseLearner(page, 'Sophia');
    await page.goto(SIX_KINGDOMS);
    await answerItem(page.locator('#check li.item').first(), true);
    await page.goto('/learners/sophia/');
    await page.goto('/account/');
    await page.evaluate(() => window.dispatchEvent(new Event('online')));

    if (configured) expect(requests.filter((url) => url.host === configured)).toEqual([]);
    expect(requests.filter((url) => url.origin !== new URL(baseURL ?? '').origin).map(String)).toEqual([]);
  });

  test('a signed-out device shows the sign-in link and notice, and sends nothing', async ({
    context,
    page,
    baseURL,
  }) => {
    const fake = new FakeSupabase();
    await fake.install(context, baseURL ?? '');
    const scripts = collectScripts(page);

    await page.goto('/');
    const note = page.locator('[data-sync-note]');
    await expect(note).toBeVisible();
    await expect(note).toContainText(CHOOSER_NOTE);
    await expect(note.getByRole('link', { name: 'Family sign-in' })).toHaveAttribute('href', '/account/');
    await expectNoSeriousAxeViolations(page);
    await expectNoSidewaysScroll(page);

    await chooseLearner(page, 'Sophia');
    const footerLink = page.locator('.site-footer').getByRole('link', { name: 'Family sign-in' });
    await expect(footerLink).toBeVisible();
    await expect(footerLink).toHaveAttribute('href', '/account/');
    await page.goto(SIX_KINGDOMS);
    await expect(footerLink).toBeVisible();
    await answerItem(page.locator('#check li.item').first(), true);
    await page.goto('/account/');
    await expect(page.getByLabel('Email')).toBeVisible();

    expect(fake.requests).toEqual([]);
    expect(await syncLibraryScripts(page, scripts)).toEqual([]);
  });

  test('the footer wraps cleanly with three items', async ({ context, page, baseURL }) => {
    await new FakeSupabase().install(context, baseURL ?? '');
    await page.goto('/learners/sophia/');
    const items = page.locator('.site-footer .wrap > *');
    await expect(page.locator('[data-sync-link]')).toBeVisible();
    const boxes = await Promise.all((await items.all()).map((item) => item.boundingBox()));
    const width = page.viewportSize()?.width ?? 0;
    for (const box of boxes) {
      expect(box).not.toBeNull();
      expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(width);
    }
    await expectNoSidewaysScroll(page);
  });
});

test.describe('family sign-in page', () => {
  test('signs in, reports problems clearly, and signs out', async ({ context, page, baseURL }) => {
    const fake = new FakeSupabase();
    await fake.install(context, baseURL ?? '');
    const scripts = collectScripts(page);
    await page.goto('/account/');

    await expect(page).toHaveTitle(/^Family sign-in/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Family sign-in');
    await expect(
      page.getByText(
        "Sign in once on each device. Then every learner's progress and last visit follow them from device to device.",
      ),
    ).toBeVisible();
    const email = page.getByLabel('Email');
    const password = page.getByLabel('Password');
    await expect(email).toHaveAttribute('autocomplete', 'username');
    await expect(password).toHaveAttribute('autocomplete', 'current-password');
    await expect(password).toHaveAttribute('type', 'password');
    for (const input of [email, password]) {
      expect((await input.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
    await expect(page.getByRole('link', { name: /sign up/i })).toHaveCount(0);
    await expectNoSidewaysScroll(page);
    await expectNoSeriousAxeViolations(page);

    // Wrong password.
    await email.fill(FAKE_EMAIL);
    await password.fill('not the password');
    await page.getByRole('button', { name: 'Sign in' }).click();
    const alert = page.getByRole('alert');
    await expect(alert).toHaveText('That email and password do not match the family account.');
    await expect(password).toBeFocused();
    await expectNoSeriousAxeViolations(page);

    // The service cannot be reached.
    fake.authFailure = true;
    await password.fill(FAKE_PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(alert).toHaveText(
      'Could not reach the sync service. Check the internet connection and try again.',
    );

    // Signed in.
    fake.authFailure = false;
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByText(`This device is signed in as ${FAKE_EMAIL}.`)).toBeVisible();
    await expect(page.locator('[data-sync-status]')).toHaveText('Everything is synced.');
    await expect(page.getByLabel('Email')).toBeHidden();
    await expectNoSidewaysScroll(page);
    await expectNoSeriousAxeViolations(page);
    // The sync library is downloaded only now (this also proves the checks above can see it).
    expect((await syncLibraryScripts(page, scripts)).length).toBeGreaterThan(0);

    // Still signed in after a reload.
    await page.reload();
    await expect(page.getByText(`This device is signed in as ${FAKE_EMAIL}.`)).toBeVisible();
    await expect(page.locator('[data-sync-status]')).toHaveText('Everything is synced.');

    // A signed-in device does not see the chooser notice.
    await page.goto('/');
    await expect(page.locator('.chooser-list')).toBeVisible();
    await expect(page.locator('[data-sync-note]')).toBeHidden();

    await page.goto('/account/');
    await page.getByRole('button', { name: 'Sign out of this device' }).click();
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Email')).toBeFocused();
    await expect(page.getByText(/This device is signed in/)).toBeHidden();
    await page.reload();
    await expect(page.getByLabel('Email')).toBeVisible();
    expect(fake.unknown).toEqual([]);
  });
});

test.describe('last visit', () => {
  test('the learner home shows the last visit and continues the lesson opened last', async ({ page }) => {
    await chooseLearner(page, 'Sophia');
    const visit = page.locator('[data-last-visit]');
    await expect(visit).toBeHidden();
    await expect(visit).toHaveText('');

    await page.goto(BIODIVERSITY);
    await answerItem(page.locator('#check li.item').first(), true);
    await page.goto(SIX_KINGDOMS);
    await answerItem(page.locator('#check li.item').first(), true);

    await page.getByRole('link', { name: 'Sophia' }).click();
    await expect(visit).toHaveText('Last visit: today');
    await expect(visit).toBeVisible();
    await expect(page.getByText('Keep going, Sophia')).toBeVisible();
    await expect(page.locator('[data-title]')).toHaveText('The Six Kingdoms of Life');
    await expect(page.locator('[data-cta]')).toHaveText('Continue lesson');
    await expect(page.locator('[data-link]')).toHaveAttribute('href', SIX_KINGDOMS);
    await expectNoSidewaysScroll(page);

    // A finished lesson opened last does not win: the first lesson still in progress does.
    await page.goto(SIX_KINGDOMS);
    const items = page.locator('li.item:not([data-state="correct"])');
    for (let left = await items.count(); left > 0; left = await items.count())
      await answerItem(items.first(), true);
    await expect(page.getByText('Lesson complete. Great work!')).toBeVisible();
    await page.getByRole('link', { name: 'Sophia' }).click();
    await expect(page.locator('[data-title]')).toHaveText('What Is Biodiversity?');
    await expect(page.getByText('Keep going, Sophia')).toBeVisible();
  });
});

test.describe('across devices', () => {
  test('progress and the last visit follow the learner to another device', async ({ browser }) => {
    const fake = new FakeSupabase();
    const a = await newDevice(browser, fake);
    await signIn(a.page);
    await chooseLearner(a.page, 'Sophia');
    await a.page.goto(SIX_KINGDOMS);
    await answerItem(a.page.locator('#check li.item').first(), true);
    await expect(a.page.locator('.lesson-status [data-label]')).toHaveText('1 of 5 done');
    await expect.poll(() => answered(fake, 'g6-science/six-kingdoms')).toBe(1);

    const b = await newDevice(browser, fake);
    await signIn(b.page);
    await chooseLearner(b.page, 'Sophia');
    await b.page.goto(SIX_KINGDOMS);
    const first = b.page.locator('#check li.item').first();
    await expect(first).toHaveAttribute('data-state', 'correct');
    await expect(first.locator('.item-feedback')).toHaveText('You already got this one.');
    await expect(b.page.locator('.lesson-status [data-label]')).toHaveText('1 of 5 done');

    await b.page.getByRole('link', { name: 'Sophia' }).click();
    await expect(b.page.locator('[data-last-visit]')).toHaveText('Last visit: today');
    await expect(b.page.locator('[data-title]')).toHaveText('The Six Kingdoms of Life');
    expect(fake.unknown).toEqual([]);
    await a.context.close();
    await b.context.close();
  });

  test('progress from before the first sign-in is uploaded once', async ({ browser }) => {
    const fake = new FakeSupabase();
    const { context, page } = await newDevice(browser, fake);
    await chooseLearner(page, 'Sophia');
    await page.goto(SIX_KINGDOMS);
    const first = page.locator('#check li.item').first();
    const key = await itemKey(page, 0);
    await answerItem(first, false);
    await answerItem(first, true);
    await expect(first).toHaveAttribute('data-state', 'correct');
    expect(fake.requests).toEqual([]);

    await signIn(page);
    const expectStored = async (lesson: string, itemKeyName: string, count: number) =>
      expect.poll(() => answered(fake, lesson, itemKeyName)).toBe(count);
    await expectStored('g6-science/six-kingdoms', key, 2);
    expect(fake.visits.map((v) => v.lesson_id)).toEqual(['g6-science/six-kingdoms']);

    // Reloads, and signing out and in again, never send the history a second time.
    await page.reload();
    await page.goto(SIX_KINGDOMS);
    await page.getByRole('link', { name: 'Sophia' }).click();
    await page.goto('/account/');
    await page.getByRole('button', { name: 'Sign out of this device' }).click();
    await expect(page.getByLabel('Email')).toBeVisible();

    // Answers given while signed out are sent at the next sign-in.
    await page.goto(SIX_KINGDOMS);
    const second = page.locator('#check li.item').nth(1);
    const secondKey = await itemKey(page, 1);
    await answerItem(second, true);
    await signIn(page);
    await page.reload();
    await expect(page.locator('[data-sync-status]')).toHaveText('Everything is synced.');
    await expectStored('g6-science/six-kingdoms', key, 2);
    await expectStored('g6-science/six-kingdoms', secondKey, 1);
    expect(fake.summary().find((row) => row.key === key)?.correct).toBe(1);
    await context.close();
  });

  test('offline, answers still count and are sent once the service is back', async ({ browser }) => {
    const fake = new FakeSupabase();
    const { context, page } = await newDevice(browser, fake);
    await signIn(page);
    await chooseLearner(page, 'Sophia');

    fake.restFailure = 'http';
    await page.goto(SIX_KINGDOMS);
    const first = page.locator('#check li.item').first();
    const key = await itemKey(page, 0);
    await answerItem(first, true);
    await expect(first).toHaveAttribute('data-state', 'correct');
    await expect(first.locator('.item-feedback')).toHaveText('Correct!');
    await expect(page.locator('.lesson-status [data-label]')).toHaveText('1 of 5 done');
    await expect
      .poll(() => fake.restRequests().filter((r) => r.startsWith('POST /rest/v1/progress_events')).length)
      .toBeGreaterThan(0);
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(first.locator('.item-feedback')).toHaveText('Correct!');

    await page.goto('/account/');
    await expect(page.locator('[data-sync-status]')).toHaveText(OFFLINE);
    fake.restFailure = 'network';
    await page.reload();
    await expect(page.locator('[data-sync-status]')).toHaveText(OFFLINE);
    expect(answered(fake, 'g6-science/six-kingdoms')).toBe(0);

    fake.restFailure = null;
    await page.goto(SIX_KINGDOMS);
    await expect.poll(() => answered(fake, 'g6-science/six-kingdoms', key)).toBe(1);
    await page.reload();
    await page.goto('/account/');
    await expect(page.locator('[data-sync-status]')).toHaveText('Everything is synced.');
    expect(fake.events.filter((e) => e.key === key)).toHaveLength(1);
    await context.close();
  });

  test('a pull updates open pages without a reload', async ({ browser }) => {
    const fake = new FakeSupabase();
    const a = await newDevice(browser, fake);
    const b = await newDevice(browser, fake);
    for (const device of [a, b]) {
      await signIn(device.page);
      await chooseLearner(device.page, 'Sophia');
    }

    // Device B works on the Six Kingdoms, with Sophia's home open in another tab.
    const lesson = b.page;
    await lesson.goto(SIX_KINGDOMS);
    const items = lesson.locator('#check li.item');
    await answerItem(items.nth(0), true);
    await expect(items.nth(0).locator('.item-feedback')).toHaveText('Correct!');
    const home = await b.context.newPage();
    await home.goto('/learners/sophia/');
    await expect(home.locator('[data-title]')).toHaveText('The Six Kingdoms of Life');
    await expect.poll(() => answered(fake, 'g6-science/six-kingdoms')).toBe(1);

    // Meanwhile device A answers another item, then moves on to What Is Biodiversity?.
    await a.page.goto(SIX_KINGDOMS);
    await answerItem(a.page.locator('#check li.item').nth(1), true);
    await a.page.goto(BIODIVERSITY);
    await answerItem(a.page.locator('#check li.item').first(), true);
    await expect.poll(() => answered(fake, 'g6-science/what-is-biodiversity')).toBe(1);
    await expect.poll(() => fake.visits.map((v) => v.lesson_id)).toEqual(['g6-science/what-is-biodiversity']);

    await syncNow(lesson);
    await expect(items.nth(1)).toHaveAttribute('data-state', 'correct');
    await expect(items.nth(1).locator('.item-feedback')).toHaveText('You already got this one.');
    await expect(lesson.locator('.lesson-status [data-label]')).toHaveText('2 of 5 done');
    await expect(items.nth(0).locator('.item-feedback')).toHaveText('Correct!');

    await syncNow(home);
    await expect(home.locator('[data-title]')).toHaveText('What Is Biodiversity?');
    await expect(home.getByText('Keep going, Sophia')).toBeVisible();
    await expect(home.locator('[data-last-visit]')).toHaveText('Last visit: today');
    expect(fake.unknown).toEqual([]);
    await a.context.close();
    await b.context.close();
  });
});
