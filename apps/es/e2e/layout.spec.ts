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
};

const measure = (page: Page): Promise<Metrics> =>
  page.evaluate(() => {
    const scroller = document.scrollingElement ?? document.documentElement;
    return {
      scrollHeight: scroller.scrollHeight,
      innerHeight: window.innerHeight,
      scrollWidth: scroller.scrollWidth,
      innerWidth: window.innerWidth,
    };
  });

const describeFailure = (path: string, size: Size, metrics: Metrics): string =>
  `${path} ${size.width}x${size.height}: `
  + `scrollHeight=${metrics.scrollHeight} innerHeight=${metrics.innerHeight} `
  + `scrollWidth=${metrics.scrollWidth} innerWidth=${metrics.innerWidth}`;

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
        (metrics) => metrics.scrollHeight > metrics.innerHeight || metrics.scrollWidth > metrics.innerWidth,
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

    test(`${size.width}x${size.height} で「次へ」と「前のページへ」を押してページを移動できる`, async ({ page }) => {
      await page.setViewportSize(size);
      await page.goto('/chapters/chapter-4/');
      await page.getByRole('link', { name: '次へ' }).click();
      await expect(page).toHaveURL(/\/chapters\/chapter-4\/2\/$/);
      await page.waitForLoadState('load');
      await page.getByRole('button', { name: '前のページへ' }).click();
      await expect(page).toHaveURL(/\/chapters\/chapter-4\/$/);
    });
  }
});

const hintPaths: readonly string[] = ['/chapters/chapter-2/2/', '/chapters/chapter-2/4/'];

const collectHintFailures = async (
  page: Page,
  size: Size,
  overflows: (metrics: Metrics) => boolean,
): Promise<string[]> => {
  await page.setViewportSize(size);
  const failures: string[] = [];
  for (const path of hintPaths) {
    await page.goto(path);
    await waitForPlaygrounds(page, path);
    await page.getByRole('button', { name: 'ヒントと解答' }).click();
    const dialog = page.locator('[data-role="hints-dialog"]');
    await expect(dialog).toHaveJSProperty('open', true);
    const steps = dialog.locator('details.play-hint-step');
    const count = await steps.count();
    expect(count).toBe(4);
    for (let index = 0; index < count; index += 1) {
      await steps.nth(index).locator('summary').click();
      const label = `${path}（ヒントと解答の ${index + 1} つ目を開いた状態）`;
      const metrics = await measure(page);
      if (overflows(metrics)) {
        failures.push(describeFailure(label, size, metrics));
      }
      const fit = await dialog.evaluate((element) => {
        const box = element.getBoundingClientRect();
        const overflowY = getComputedStyle(element).overflowY;
        const overflowing = element.scrollHeight > element.clientHeight + 1;
        element.scrollTop = element.scrollHeight;
        return {
          inside: box.top >= -1 && box.left >= -1 && box.bottom <= window.innerHeight + 1
            && box.right <= window.innerWidth + 1,
          overflowing,
          scrolls: overflowY === 'auto' || overflowY === 'scroll',
          reachesEnd: !overflowing || element.scrollTop > 0,
        };
      });
      if (!fit.inside) {
        failures.push(`${label} ${size.width}x${size.height}: ダイアログが画面からはみ出している`);
      }
      if (fit.overflowing && !(fit.scrolls && fit.reachesEnd)) {
        failures.push(`${label} ${size.width}x${size.height}: あふれた本文をダイアログの中でスクロールできない`);
      }
    }
  }
  return failures;
};

test.describe('「ヒントと解答」を開いても PC の画面全体は縦にも横にもスクロールしない', () => {
  for (const size of desktopSizes) {
    test(`${size.width}x${size.height} で各ヒントを開いてもページ全体にスクロールが出ず、本文はダイアログの中で読める`, async ({ page }) => {
      const failures = await collectHintFailures(
        page,
        size,
        (metrics) => metrics.scrollHeight > metrics.innerHeight || metrics.scrollWidth > metrics.innerWidth,
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
      );
      expect(failures).toEqual([]);
    });
  }
});
