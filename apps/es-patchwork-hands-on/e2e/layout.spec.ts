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

type Scroller = {
  readonly element: string;
  readonly clientHeight: number;
  readonly scrollHeight: number;
  readonly clientWidth: number;
  readonly scrollWidth: number;
};

const innerScrollers = (page: Page): Promise<Scroller[]> =>
  page.evaluate(() => {
    const tolerance = 1;
    const label = (element: Element): string => {
      const classes = [...element.classList].map((name) => `.${name}`).join('');
      const language = element.getAttribute('data-language');
      const text = (element.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 24);
      return `${element.tagName.toLowerCase()}${classes}${language === null ? '' : `[${language}]`} "${text}"`;
    };
    const found: Scroller[] = [];
    for (const element of document.querySelectorAll('.chapter-body *')) {
      if (element.closest('details:not([open])') !== null) continue;
      if (element.matches('.cm-scroller') || element.closest('.playground-results') !== null) continue;
      const style = getComputedStyle(element);
      const scrolls = (value: string): boolean => value === 'auto' || value === 'scroll';
      if (!scrolls(style.overflowX) && !scrolls(style.overflowY)) continue;
      const overflowsY = scrolls(style.overflowY) && element.scrollHeight - element.clientHeight > tolerance;
      const overflowsX = scrolls(style.overflowX) && element.scrollWidth - element.clientWidth > tolerance;
      if (overflowsY || overflowsX) {
        found.push({
          element: label(element),
          clientHeight: element.clientHeight,
          scrollHeight: element.scrollHeight,
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
        });
      }
    }
    return found;
  });

const describeScroller = (path: string, size: Size, scroller: Scroller): string =>
  `${path} ${size.width}x${size.height}: 内部スクロール ${scroller.element} `
  + `高さ=${scroller.clientHeight}/${scroller.scrollHeight} 幅=${scroller.clientWidth}/${scroller.scrollWidth}`;

const describeFailure = (path: string, size: Size, metrics: Metrics): string =>
  `${path} ${size.width}x${size.height}: `
  + `scrollHeight=${metrics.scrollHeight} innerHeight=${metrics.innerHeight} `
  + `scrollWidth=${metrics.scrollWidth} innerWidth=${metrics.innerWidth} `
  + `chapterBody=${metrics.bodyScrollHeight}/${metrics.bodyClientHeight}`;

const collectFailures = async (
  page: Page,
  size: Size,
  overflows: (metrics: Metrics) => boolean,
  checkInnerScroll: boolean,
): Promise<string[]> => {
  await page.setViewportSize(size);
  const failures: string[] = [];
  for (const path of fitCheckedPaths()) {
    await page.goto(path);
    const axisButtons = page.locator('[data-axis]');
    const axisCount = await axisButtons.count();
    for (let axis = 0; axis < Math.max(axisCount, 1); axis += 1) {
      if (axisCount > 0) {
        await axisButtons.nth(axis).click();
      }
      const label = axisCount > 0 ? `${path}（${axis + 1} つ目の軸）` : path;
      const metrics = await measure(page);
      if (overflows(metrics)) {
        failures.push(describeFailure(label, size, metrics));
      }
      if (checkInnerScroll) {
        failures.push(...(await innerScrollers(page)).map((scroller) => describeScroller(label, size, scroller)));
      }
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
        true,
      );
      expect(failures).toEqual([]);
    });
  }
});

test.describe('スマートフォンの画面は横にスクロールしない', () => {
  for (const size of phoneSizes) {
    test(`${size.width}x${size.height} で横にスクロールが出ない`, async ({ page }) => {
      const failures = await collectFailures(page, size, (metrics) => metrics.scrollWidth > metrics.innerWidth, false);
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
