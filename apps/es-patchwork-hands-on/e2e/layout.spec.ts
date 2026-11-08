import { expect, type Page, test } from '@playwright/test';

import { fitCheckedPaths } from './dist';

type Size = { readonly width: number; readonly height: number };

const desktopSizes: readonly Size[] = [{ width: 1280, height: 640 }, { width: 1440, height: 790 }];
const phoneSizes: readonly Size[] = [{ width: 360, height: 640 }, { width: 390, height: 844 }];

type Metrics = {
  readonly scrollHeight: number;
  readonly innerHeight: number;
  readonly scrollWidth: number;
  readonly innerWidth: number;
  readonly bodyScrollHeight: number;
  readonly bodyClientHeight: number;
};

const measure = (page: Page): Promise<Metrics> =>
  page.evaluate(() => {
    const body = document.querySelector('.chapter-body');
    return {
      scrollHeight: document.documentElement.scrollHeight,
      innerHeight: window.innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
      bodyScrollHeight: body?.scrollHeight ?? 0,
      bodyClientHeight: body?.clientHeight ?? 0,
    };
  });

const describeFailure = (path: string, size: Size, metrics: Metrics): string =>
  `${path} ${size.width}x${size.height}: `
  + `scrollHeight=${metrics.scrollHeight} innerHeight=${metrics.innerHeight} `
  + `scrollWidth=${metrics.scrollWidth} innerWidth=${metrics.innerWidth} `
  + `chapterBody=${metrics.bodyScrollHeight}/${metrics.bodyClientHeight}`;

const collectFailures = async (
  page: Page,
  size: Size,
  overflows: (metrics: Metrics) => boolean,
): Promise<string[]> => {
  await page.setViewportSize(size);
  const failures: string[] = [];
  for (const path of fitCheckedPaths()) {
    await page.goto(path);
    const metrics = await measure(page);
    if (overflows(metrics)) {
      failures.push(describeFailure(path, size, metrics));
    }
  }
  return failures;
};

test.describe('PC の画面は 1 ページが一画面に収まる', () => {
  for (const size of desktopSizes) {
    test(`${size.width}x${size.height} でページ全体にスクロールが出ない`, async ({ page }) => {
      const failures = await collectFailures(
        page,
        size,
        (metrics) =>
          metrics.scrollHeight > metrics.innerHeight
          || metrics.scrollWidth > metrics.innerWidth
          || metrics.bodyScrollHeight > metrics.bodyClientHeight,
      );
      expect(failures).toEqual([]);
    });
  }
});

test.describe('スマートフォンの画面は横にスクロールしない', () => {
  for (const size of phoneSizes) {
    test(`${size.width}x${size.height} で横にスクロールが出ない`, async ({ page }) => {
      const failures = await collectFailures(page, size, (metrics) => metrics.scrollWidth > metrics.innerWidth);
      expect(failures).toEqual([]);
    });

    test(`${size.width}x${size.height} で「次へ」を押して次のページへ移動できる`, async ({ page }) => {
      await page.setViewportSize(size);
      await page.goto('/chapters/chapter-4/');
      await page.getByRole('link', { name: /次へ/ }).click();
      await expect(page).toHaveURL(/\/chapters\/chapter-4\/2\/$/);
      await page.getByRole('link', { name: /前へ/ }).click();
      await expect(page).toHaveURL(/\/chapters\/chapter-4\/$/);
    });
  }
});
