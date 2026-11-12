import { expect, type Page, test } from '@playwright/test';

import { chapterPagePaths } from './dist';

const pathOf = (page: Page): string => new URL(page.url()).pathname;

const overall = async (page: Page): Promise<{ readonly number: number; readonly total: number }> => {
  const text = await page.locator('.page-progress__status').innerText();
  const match = /全体\s*(\d+)\/(\d+)/.exec(text);
  expect(match, `全体の進み具合が読めません: ${text}`).not.toBeNull();
  return { number: Number(match?.[1]), total: Number(match?.[2]) };
};

const guessedMinutes = async (page: Page): Promise<number> => {
  const text = await page.locator('.page-progress__status').innerText();
  const match = /目安\s*(\d+):(\d{2})ごろ/.exec(text);
  expect(match, `目安の時刻が読めません: ${text}`).not.toBeNull();
  return Number(match?.[1]) * 60 + Number(match?.[2]);
};

const openList = async (page: Page): Promise<void> => {
  await page.locator('.page-progress__menu > summary').click();
  await expect(page.locator('.page-progress__panel')).toBeVisible();
};

test('全ページで、全体の進み具合が 1 から順に増え、目安の時刻が減らない', async ({ page }) => {
  const paths = chapterPagePaths();
  let previousMinutes = -1;
  for (const [index, path] of paths.entries()) {
    await page.goto(path);
    expect(await overall(page), path).toEqual({ number: index + 1, total: paths.length });
    const minutes = await guessedMinutes(page);
    expect(minutes, path).toBeGreaterThanOrEqual(previousMinutes);
    previousMinutes = minutes;
  }
  expect(await guessedMinutes(page)).toBeLessThan(40);
});

test('章の中の進み具合は、見出しにこれまでどおり出る', async ({ page }) => {
  await page.goto('/chapters/chapter-2/4/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('4/6');
  await expect(page.getByRole('heading', { level: 1 })).not.toContainText('全体');
});

test('章ページ以外には進み具合とページ一覧を出さない', async ({ page }) => {
  for (const path of ['/', '/setup/', '/troubleshooting/']) {
    await page.goto(path);
    await expect(page.locator('.page-progress')).toHaveCount(0);
  }
});

test.describe('ページ一覧', () => {
  test('開くと全ページへのリンクが並び、現在のページに aria-current が付く', async ({ page }) => {
    const paths = chapterPagePaths();
    const current = '/chapters/chapter-2/4/';
    await page.goto(current);
    await expect(page.locator('.page-progress__panel')).toBeHidden();
    await openList(page);
    const links = page.locator('.page-progress__panel a');
    expect(await links.evaluateAll((anchors) => anchors.map((anchor) => anchor.getAttribute('href')))).toEqual(paths);
    await expect(page.locator('.page-progress__panel [aria-current="page"]')).toHaveCount(1);
    await expect(page.locator('.page-progress__panel [aria-current="page"]')).toHaveAttribute('href', current);
  });

  test('章ごとのグループに、章題と時間帯が出る', async ({ page }) => {
    await page.goto('/chapters/intro/');
    await openList(page);
    const groups = page.locator('.page-progress__group');
    await expect(groups).toHaveCount(6);
    await expect(groups.nth(0)).toContainText('導入');
    await expect(groups.nth(0)).toContainText('0:00〜0:05（5分）');
    await expect(groups.nth(2)).toContainText('第2章');
  });

  test('見出しの無いページは「N ページ目」と表示する', async ({ page }) => {
    await page.goto('/chapters/chapter-2/');
    await openList(page);
    await expect(page.locator('.page-progress__panel a[href="/chapters/chapter-2/4/"]')).toHaveText('4 ページ目');
    await expect(page.locator('.page-progress__panel a[href="/chapters/chapter-2/6/"]')).not.toContainText('ページ目');
  });

  test('リンクを押すとそのページへ移動する', async ({ page }) => {
    await page.goto('/chapters/chapter-2/4/');
    await openList(page);
    await page.locator('.page-progress__panel a[href="/chapters/intro/2/"]').click();
    await expect(page).toHaveURL(/\/chapters\/intro\/2\/$/);
    expect(await overall(page)).toEqual({ number: 2, total: chapterPagePaths().length });
  });

  test('Esc キーで閉じる', async ({ page }) => {
    await page.goto('/chapters/chapter-2/4/');
    await openList(page);
    await page.keyboard.press('Escape');
    await expect(page.locator('.page-progress__panel')).toBeHidden();
    await expect(page.locator('.page-progress__menu > summary')).toBeFocused();
  });

  test('一覧の外を押すと閉じ、一覧の中を押しても閉じない', async ({ page }) => {
    await page.goto('/chapters/chapter-2/4/');
    await openList(page);
    await page.locator('.page-progress__group-title').first().click();
    await expect(page.locator('.page-progress__panel')).toBeVisible();
    await page.mouse.click(2, 600);
    await expect(page.locator('.page-progress__panel')).toBeHidden();
  });

  test('ページ一覧の見出しは h1 を増やさない', async ({ page }) => {
    await page.goto('/chapters/chapter-2/4/');
    const headingsBefore = await page.getByRole('heading').count();
    await openList(page);
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page.getByRole('heading')).toHaveCount(headingsBefore);
  });

  test('一覧を開いても、「次へ」「前へ」の名前のリンクは 1 つずつのまま', async ({ page }) => {
    await page.goto('/chapters/chapter-2/4/');
    await openList(page);
    await expect(page.getByRole('link', { name: /次へ/ })).toHaveCount(1);
    await expect(page.getByRole('link', { name: /前へ/ })).toHaveCount(1);
  });
});

test.describe('一覧を開いても画面が動かない', () => {
  const paths = ['/chapters/chapter-2/4/', '/chapters/intro/', '/chapters/chapter-4/3/'];
  for (const path of paths) {
    test(`1280x640 の ${path}`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 640 });
      await page.goto(path);
      for (const playground of await page.locator('[data-playground]:not([hidden])').all()) {
        await expect(playground).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
      }
      const bodyTop = async (): Promise<number> =>
        page.locator('.chapter-body').evaluate((element) => element.getBoundingClientRect().top);
      const before = await bodyTop();
      await openList(page);
      const metrics = await page.evaluate(() => ({
        scrollHeight: document.documentElement.scrollHeight,
        innerHeight: window.innerHeight,
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
        panelBottom: document.querySelector('.page-progress__panel')?.getBoundingClientRect().bottom ?? 0,
      }));
      expect(metrics.scrollHeight).toBeLessThanOrEqual(metrics.innerHeight);
      expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.innerWidth);
      expect(metrics.panelBottom).toBeLessThanOrEqual(metrics.innerHeight);
      expect(await bodyTop()).toBe(before);
    });
  }

  test('現在のページが一覧の中で見える位置に出る', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 400 });
    await page.goto('/chapters/summary/5/');
    await openList(page);
    const visible = await page.evaluate(() => {
      const panel = document.querySelector('.page-progress__panel')?.getBoundingClientRect();
      const here = document.querySelector('.page-progress__panel [aria-current="page"]')?.getBoundingClientRect();
      return panel !== undefined && here !== undefined && here.top >= panel.top - 1 && here.bottom <= panel.bottom + 1;
    });
    expect(visible).toBe(true);
  });
});

test.describe('スマートフォンの画面でも横にスクロールしない', () => {
  for (const size of [{ width: 390, height: 844 }, { width: 360, height: 640 }]) {
    test(`${size.width}x${size.height} で、閉じていても開いていても横にスクロールが出ない`, async ({ page }) => {
      await page.setViewportSize(size);
      for (
        const path of ['/chapters/intro/', '/chapters/chapter-2/', '/chapters/chapter-2/4/', '/chapters/chapter-4/']
      ) {
        await page.goto(path);
        const overflowsSideways = (): Promise<boolean> =>
          page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
        expect(await overflowsSideways(), `${path} 閉じた状態`).toBe(false);
        await openList(page);
        expect(await overflowsSideways(), `${path} 開いた状態`).toBe(false);
        expect(pathOf(page)).toBe(path);
      }
    });
  }
});
