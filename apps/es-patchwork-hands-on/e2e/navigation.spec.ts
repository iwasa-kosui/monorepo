import { expect, type Page, test } from '@playwright/test';

import { chapterPagePaths } from './dist';

const pathOf = (page: Page): string => new URL(page.url()).pathname;

const logHandledKeys = (page: Page): Promise<void> =>
  page.evaluate(() => {
    const handled: boolean[] = [];
    Object.assign(window, { handledKeys: handled });
    window.addEventListener('keydown', (event) => handled.push(event.defaultPrevented));
  });

const handledKeys = (page: Page): Promise<boolean[]> =>
  page.evaluate(() => (window as unknown as { handledKeys: boolean[] }).handledKeys);

const follow = async (page: Page, label: RegExp): Promise<string[]> => {
  const visited = [pathOf(page)];
  const limit = chapterPagePaths().length + 5;
  while (visited.length <= limit) {
    const link = page.getByRole('link', { name: label });
    if (await link.count() === 0) break;
    const before = pathOf(page);
    await link.click();
    await page.waitForURL((url) => url.pathname !== before);
    visited.push(pathOf(page));
  }
  return visited;
};

test('「次へ」を順にたどると全ページを通ってまとめの最後に着く', async ({ page }) => {
  const expected = chapterPagePaths();
  await page.goto(expected[0] ?? '/');
  expect(await follow(page, /次へ/)).toEqual(expected);
  expect(pathOf(page)).toMatch(/^\/chapters\/summary\//);
});

test('「前へ」を順にたどると全ページを逆順に通って導入の最初に着く', async ({ page }) => {
  const expected = chapterPagePaths();
  await page.goto(expected[expected.length - 1] ?? '/');
  expect(await follow(page, /前へ/)).toEqual([...expected].reverse());
  expect(pathOf(page)).toBe('/chapters/intro/');
});

test('章の境界でも「次へ」「前へ」で隣の章のページへ移動する', async ({ page }) => {
  await page.goto('/chapters/intro/9/');
  await page.getByRole('link', { name: /次へ/ }).click();
  await expect(page).toHaveURL(/\/chapters\/chapter-1\/$/);
  await page.getByRole('link', { name: /前へ/ }).click();
  await expect(page).toHaveURL(/\/chapters\/intro\/9\/$/);
});

test('ページの上部に章の名前と進み具合が出る', async ({ page }) => {
  await page.goto('/chapters/intro/5/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('導入');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('5/9');
  await expect(page.getByRole('link', { name: 'トップページへ' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'うまく動かないとき' })).toBeVisible();
});

test('できるようになること（goal）は章の最初のページだけに出る', async ({ page }) => {
  await page.goto('/chapters/chapter-2/');
  await expect(page.getByText('できるようになること：')).toBeVisible();
  await page.goto('/chapters/chapter-2/2/');
  await expect(page.getByText('できるようになること：')).toHaveCount(0);
});

test.describe('矢印キー', () => {
  test('右キーで次のページ、左キーで前のページへ移動する', async ({ page }) => {
    await page.goto('/chapters/chapter-2/2/');
    await page.keyboard.press('ArrowRight');
    await expect(page).toHaveURL(/\/chapters\/chapter-2\/3\/$/);
    await page.keyboard.press('ArrowLeft');
    await expect(page).toHaveURL(/\/chapters\/chapter-2\/2\/$/);
  });

  test('章の境界でも矢印キーで移動する', async ({ page }) => {
    await page.goto('/chapters/intro/9/');
    await page.keyboard.press('ArrowRight');
    await expect(page).toHaveURL(/\/chapters\/chapter-1\/$/);
    await page.keyboard.press('ArrowLeft');
    await expect(page).toHaveURL(/\/chapters\/intro\/9\/$/);
  });

  const editors = [
    { name: 'input', html: '<input id="probe" />' },
    { name: 'textarea', html: '<textarea id="probe"></textarea>' },
    { name: 'select', html: '<select id="probe"><option>a</option></select>' },
    { name: 'contenteditable', html: '<div id="probe" contenteditable="true">x</div>' },
  ];

  for (const editor of editors) {
    test(`${editor.name} にフォーカスがあるときは移動しない`, async ({ page }) => {
      await page.goto('/chapters/chapter-2/2/');
      await page.evaluate((html) => {
        document.body.insertAdjacentHTML('beforeend', html);
        (document.getElementById('probe') as HTMLElement).focus();
      }, editor.html);
      await logHandledKeys(page);
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowLeft');
      expect(await handledKeys(page)).toEqual([false, false]);
      expect(pathOf(page)).toBe('/chapters/chapter-2/2/');
    });
  }

  for (const modifier of ['Shift', 'Control', 'Alt', 'Meta']) {
    test(`${modifier} キーを押しているときは移動しない`, async ({ page }) => {
      await page.goto('/chapters/chapter-2/2/');
      await logHandledKeys(page);
      await page.keyboard.down(modifier);
      await page.keyboard.press('ArrowRight');
      await page.keyboard.up(modifier);
      expect((await handledKeys(page)).at(-1)).toBe(false);
      expect(pathOf(page)).toBe('/chapters/chapter-2/2/');
    });
  }
});
