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
      if (element.closest('[data-scenario] [role="tabpanel"][data-tool], [data-scenario] [data-feed]') !== null) {
        continue;
      }
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

const waitForPlaygrounds = async (page: Page, path: string): Promise<void> => {
  for (const playground of await page.locator('[data-playground]:visible').all()) {
    await expect(playground).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
  }
  if (path === '/chapters/chapter-3/') {
    await expect(page.locator('[data-role="origin"]:not([hidden])')).toHaveCount(1, { timeout: 30_000 });
  }
};

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
    await waitForPlaygrounds(page, path);
    const axisButtons = page.locator('[data-axis]');
    const tabButtons = page.locator(
      '[data-investigation]:not([data-phase="idle"]) [aria-label="開くツール"] > [role="tab"]:visible',
    );
    const [switches, noun] = (await axisButtons.count()) > 0
      ? [axisButtons, '軸'] as const
      : [tabButtons, 'タブ'] as const;
    const switchCount = await switches.count();
    for (let index = 0; index < Math.max(switchCount, 1); index += 1) {
      if (switchCount > 0) {
        await switches.nth(index).click();
        await waitForPlaygrounds(page, path);
      }
      const label = switchCount > 0 ? `${path}（${index + 1} つ目の${noun}）` : path;
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

const hintPaths: readonly string[] = ['/chapters/chapter-2/2/', '/chapters/chapter-2/4/'];

const collectHintFailures = async (
  page: Page,
  size: Size,
  overflows: (metrics: Metrics) => boolean,
  checkInnerScroll: boolean,
): Promise<string[]> => {
  await page.setViewportSize(size);
  const failures: string[] = [];
  for (const path of hintPaths) {
    await page.goto(path);
    await waitForPlaygrounds(page, path);
    const steps = page.locator('details.play-hint-step');
    const count = await steps.count();
    expect(count).toBe(4);
    for (let index = 0; index < count; index += 1) {
      await steps.nth(index).locator('summary').click();
      const label = `${path}（ヒントと解答の ${index + 1} つ目を開いた状態）`;
      const metrics = await measure(page);
      if (overflows(metrics)) {
        failures.push(describeFailure(label, size, metrics));
      }
      if (checkInnerScroll) {
        failures.push(...(await innerScrollers(page)).map((scroller) => describeScroller(label, size, scroller)));
      }
      const close = steps.nth(index).locator('[data-role="hint-close"]');
      if (await close.isVisible()) {
        const body = await steps.nth(index).locator('.play-hint-body').evaluate((element) => ({
          clientHeight: element.clientHeight,
          scrollHeight: element.scrollHeight,
        }));
        if (body.scrollHeight > body.clientHeight + 1) {
          failures.push(
            `${label} ${size.width}x${size.height}: 重ねた本文の高さ=${body.clientHeight}/${body.scrollHeight}`,
          );
        }
        const testsButton = page.locator('[data-role="tests"]');
        if (!(await testsButton.isVisible())) {
          failures.push(`${label} ${size.width}x${size.height}: 「テストを実行する」ボタンが見えない`);
        } else {
          const bodyBox = await steps.nth(index).locator('.play-hint-body').boundingBox();
          const buttonBox = await testsButton.boundingBox();
          if (
            bodyBox !== null && buttonBox !== null
            && bodyBox.x < buttonBox.x + buttonBox.width && buttonBox.x < bodyBox.x + bodyBox.width
            && bodyBox.y < buttonBox.y + buttonBox.height && buttonBox.y < bodyBox.y + bodyBox.height
          ) {
            failures.push(
              `${label} ${size.width}x${size.height}: 開いた本文が「テストを実行する」ボタンに重なっている`,
            );
          }
        }
        await close.click();
      }
    }
  }
  return failures;
};

test.describe('「ヒントと解答」を開いても PC の画面は一画面に収まる', () => {
  for (const size of desktopSizes) {
    test(`${size.width}x${size.height} で各ヒントを開いてもスクロールが出ない`, async ({ page }) => {
      const failures = await collectHintFailures(
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

test.describe('「ヒントと解答」を開いてもスマートフォンの画面は横にスクロールしない', () => {
  for (const size of phoneSizes) {
    test(`${size.width}x${size.height} で各ヒントを開いても横にスクロールが出ない`, async ({ page }) => {
      const failures = await collectHintFailures(
        page,
        size,
        (metrics) => metrics.scrollWidth > metrics.innerWidth,
        false,
      );
      expect(failures).toEqual([]);
    });
  }
});
