import { expect, type Page, test } from '@playwright/test';

import { chapterPagePaths } from './dist';

const pathOf = (page: Page): string => new URL(page.url()).pathname;

const chapterMinutes = [8, 2, 13, 5, 9, 3];
const chapterIds = ['intro', 'chapter-1', 'chapter-2', 'chapter-3', 'chapter-4', 'summary'];

const overall = async (page: Page): Promise<{ readonly number: number; readonly total: number }> => {
  const label = (await page.locator('.lesson-bar__progress').getAttribute('aria-label')) ?? '';
  const match = /全体\s*(\d+)\/(\d+)/.exec(label);
  expect(match, `全体の進み具合が読めません: ${label}`).not.toBeNull();
  return { number: Number(match?.[1]), total: Number(match?.[2]) };
};

const guessedMinutes = async (page: Page): Promise<number> => {
  const text = await page.locator('.lesson-bar__estimate').innerText();
  const match = /目安\s*(\d+):(\d{2})\s*\/\s*0:40/.exec(text);
  expect(match, `目安の時刻が読めません: ${text}`).not.toBeNull();
  return Number(match?.[1]) * 60 + Number(match?.[2]);
};

const openList = async (page: Page): Promise<void> => {
  await page.locator('.lesson-menu > summary').click();
  await expect(page.locator('.lesson-menu__panel')).toBeVisible();
};

const chapterOf = (path: string): string => /^\/chapters\/([^/]+)\//.exec(path)?.[1] ?? '';

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

test('全体の進み具合は章ごとの6本の区切りで、幅は章の分に比例し、いまの章は何ページ目かだけ塗る', async ({ page }) => {
  const paths = chapterPagePaths();
  await page.goto(paths[0] ?? '/');
  const grows = await page
    .locator('.lesson-bar__segment')
    .evaluateAll((segments) => segments.map((segment) => getComputedStyle(segment).flexGrow));
  expect(grows).toEqual(chapterMinutes.map(String));
  for (const path of paths) {
    await page.goto(path);
    const chapter = chapterOf(path);
    const inChapter = paths.filter((candidate) => chapterOf(candidate) === chapter);
    const number = inChapter.indexOf(path) + 1;
    const current = chapterIds.indexOf(chapter);
    const fills = await page
      .locator('.lesson-bar__segment')
      .evaluateAll((segments) => segments.map((segment) => segment.getAttribute('data-state')));
    expect(fills, path).toEqual(
      chapterIds.map((_, index) => index < current ? 'done' : index === current ? 'current' : 'future'),
    );
    const widths = await page
      .locator('.lesson-bar__fill')
      .evaluateAll((elements) => elements.map((element) => parseFloat((element as HTMLElement).style.width)));
    expect(widths, path).toHaveLength(chapterIds.length);
    widths.forEach((width, index) => {
      const expected = index < current ? 100 : index === current ? (number / inChapter.length) * 100 : 0;
      expect(width, path).toBeCloseTo(expected, 3);
    });
  }
});

test('章の中の進み具合は、ヘッダーの「n / total」に出る', async ({ page }) => {
  await page.goto('/chapters/chapter-2/4/');
  await expect(page.locator('.lesson-bar__count')).toHaveText('4 / 5');
  await expect(page.getByRole('heading', { level: 1 })).not.toContainText('全体');
});

test('目安の時刻は「目安 h:mm / 0:40」の形で出る', async ({ page }) => {
  await page.goto('/chapters/chapter-2/');
  await expect(page.locator('.lesson-bar__estimate')).toHaveText('目安 0:10 / 0:40');
});

test('章ページ以外には進み具合とページ一覧を出さない', async ({ page }) => {
  for (const path of ['/', '/setup/', '/troubleshooting/', '/glossary/']) {
    await page.goto(path);
    await expect(page.locator('.lesson-bar')).toHaveCount(0);
    await expect(page.locator('.lesson-pages')).toHaveCount(0);
    await expect(page.locator('.action-bar')).toHaveCount(0);
  }
});

test('メニューの章の見出しに、章の時間帯と内訳が出る', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/chapters/chapter-2/3/');
  await openList(page);
  await expect(page.locator('.lesson-menu__panel .lesson-pages__group').nth(2)).toContainText(
    '0:10〜0:23（13分）：説明2分、演習9分、解答の確認2分',
  );
});

test.describe('メニューの中のページ一覧', () => {
  test.use({ viewport: { width: 1024, height: 720 } });

  test('ボタンの名前は「メニュー」で、開くまでは一覧が見えない', async ({ page }) => {
    await page.goto('/chapters/chapter-2/4/');
    await expect(page.locator('.lesson-menu > summary')).toHaveText('メニュー');
    await expect(page.locator('.lesson-menu__panel')).toBeHidden();
  });

  test('開くと全ページへのリンクが並び、現在のページに aria-current が付く', async ({ page }) => {
    const paths = chapterPagePaths();
    const current = '/chapters/chapter-2/4/';
    await page.goto(current);
    await openList(page);
    const links = page.locator('.lesson-menu__panel .lesson-pages a');
    expect(await links.evaluateAll((anchors) => anchors.map((anchor) => anchor.getAttribute('href')))).toEqual(paths);
    await expect(page.locator('.lesson-menu__panel [aria-current="page"]')).toHaveCount(1);
    await expect(page.locator('.lesson-menu__panel [aria-current="page"]')).toHaveAttribute('href', current);
  });

  test('各ページに過去・現在・未来の状態が付く', async ({ page }) => {
    const paths = chapterPagePaths();
    const current = '/chapters/chapter-2/3/';
    const currentIndex = paths.indexOf(current);
    await page.goto(current);
    await openList(page);
    const routes = await page
      .locator('.lesson-menu__panel .lesson-pages a')
      .evaluateAll((anchors) => anchors.map((anchor) => anchor.getAttribute('data-route')));
    expect(routes).toEqual(
      paths.map((_, index) => index < currentIndex ? 'past' : index === currentIndex ? 'current' : 'future'),
    );
  });

  test('章ごとのグループに、章題と時間帯が出る', async ({ page }) => {
    await page.goto('/chapters/intro/');
    await openList(page);
    const groups = page.locator('.lesson-menu__panel .lesson-pages__group');
    await expect(groups).toHaveCount(6);
    await expect(groups.nth(0)).toContainText('導入');
    await expect(groups.nth(0)).toContainText('0:00〜0:08（8分）');
    await expect(groups.nth(2)).toContainText('第2章');
  });

  test('「トップページへ」「用語」「うまく動かないとき」のリンクが入っている', async ({ page }) => {
    await page.goto('/chapters/chapter-2/4/');
    await openList(page);
    const links = page.locator('.lesson-menu__links a');
    await expect(links).toHaveText(['トップページへ', '用語', 'うまく動かないとき']);
    expect(await links.evaluateAll((anchors) => anchors.map((anchor) => anchor.getAttribute('href')))).toEqual([
      '/',
      '/glossary/',
      '/troubleshooting/',
    ]);
  });

  test('見出しの無いページは「N ページ目」と表示する', async ({ page }) => {
    await page.goto('/chapters/chapter-3/');
    await openList(page);
    await expect(page.locator('.lesson-menu__panel a[href="/chapters/chapter-3/3/"]')).toHaveText('3 ページ目');
    await expect(page.locator('.lesson-menu__panel a[href="/chapters/chapter-3/4/"]')).not.toContainText('ページ目');
  });

  test('リンクを押すとそのページへ移動する', async ({ page }) => {
    await page.goto('/chapters/chapter-2/4/');
    await openList(page);
    await page.locator('.lesson-menu__panel a[href="/chapters/intro/2/"]').click();
    await expect(page).toHaveURL(/\/chapters\/intro\/2\/$/);
    expect(await overall(page)).toEqual({ number: 2, total: chapterPagePaths().length });
  });

  test('Esc キーで閉じる', async ({ page }) => {
    await page.goto('/chapters/chapter-2/4/');
    await openList(page);
    await page.keyboard.press('Escape');
    await expect(page.locator('.lesson-menu__panel')).toBeHidden();
    await expect(page.locator('.lesson-menu > summary')).toBeFocused();
  });

  test('一覧の外を押すと閉じ、一覧の中を押しても閉じない', async ({ page }) => {
    await page.goto('/chapters/chapter-2/4/');
    await openList(page);
    await page.locator('.lesson-menu__panel .lesson-pages__title').first().click();
    await expect(page.locator('.lesson-menu__panel')).toBeVisible();
    await page.mouse.click(2, 600);
    await expect(page.locator('.lesson-menu__panel')).toBeHidden();
  });

  test('Tab で一覧の外へフォーカスが出たら閉じ、一覧の中を移る間は閉じない', async ({ page }) => {
    await page.goto('/chapters/chapter-2/4/');
    await openList(page);
    await page.locator('.lesson-menu > summary').focus();
    await page.keyboard.press('Tab');
    await expect(page.locator('.lesson-menu__panel a').first()).toBeFocused();
    await expect(page.locator('.lesson-menu__panel')).toBeVisible();
    await page.locator('.lesson-menu__panel a').last().focus();
    await page.keyboard.press('Tab');
    await expect(page.locator('.lesson-menu__panel')).toBeHidden();
  });

  test('ページ一覧の見出しは h1 を増やさない', async ({ page }) => {
    await page.goto('/chapters/chapter-2/4/');
    const headingsBefore = await page.getByRole('heading').count();
    await openList(page);
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page.getByRole('heading')).toHaveCount(headingsBefore);
  });

  test('一覧を開いても、前後のページへのボタンは 1 つずつのまま', async ({ page }) => {
    await page.goto('/chapters/chapter-2/4/');
    await openList(page);
    await expect(page.getByRole('button', { name: '次のページへ' })).toHaveCount(1);
    await expect(page.getByRole('button', { name: '前のページへ' })).toHaveCount(1);
  });
});

test.describe('一覧を開いても画面が動かない', () => {
  const paths = ['/chapters/chapter-2/2/', '/chapters/chapter-2/4/', '/chapters/intro/', '/chapters/chapter-4/3/'];
  for (const path of paths) {
    test(`1280x640 の ${path}`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 640 });
      await page.goto(path);
      for (const playground of await page.locator('[data-playground]:visible').all()) {
        await expect(playground).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
      }
      const bodyTop = async (): Promise<number> =>
        page.locator('.chapter-body').evaluate((element) => element.getBoundingClientRect().top);
      const before = await bodyTop();
      await openList(page);
      const metrics = await page.evaluate(() => {
        const scroller = document.scrollingElement ?? document.documentElement;
        return {
          scrollHeight: scroller.scrollHeight,
          innerHeight: window.innerHeight,
          scrollWidth: scroller.scrollWidth,
          innerWidth: window.innerWidth,
          panelBottom: document.querySelector('.lesson-menu__panel')?.getBoundingClientRect().bottom ?? 0,
        };
      });
      expect(metrics.scrollHeight).toBeLessThanOrEqual(metrics.innerHeight);
      expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.innerWidth);
      expect(metrics.panelBottom).toBeLessThanOrEqual(metrics.innerHeight);
      expect(await bodyTop()).toBe(before);
    });
  }

  for (const path of ['/chapters/chapter-2/2/', '/chapters/chapter-2/4/', '/chapters/chapter-3/']) {
    test(`1280x640 の ${path} は、章の見出しが 1 行に収まる`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 640 });
      await page.goto(path);
      const heading = await page.getByRole('heading', { level: 1 }).evaluate((element) => ({
        height: element.getBoundingClientRect().height,
        fontSize: parseFloat(getComputedStyle(element).fontSize),
      }));
      expect(heading.height).toBeLessThan(heading.fontSize * 2);
    });
  }

  test('現在のページが一覧の中で見える位置に出る', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 400 });
    await page.goto(chapterPagePaths().at(-1) ?? '/');
    await openList(page);
    await expect.poll(() =>
      page.evaluate(() => {
        const panel = document.querySelector('.lesson-menu__panel')?.getBoundingClientRect();
        const here = document.querySelector('.lesson-menu__panel [aria-current="page"]')?.getBoundingClientRect();
        return panel !== undefined && here !== undefined && here.top >= panel.top - 1
          && here.bottom <= panel.bottom + 1;
      })
    ).toBe(true);
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

test.describe('幅が広くても、サイドバーは出さず、作業面は画面の幅いっぱいに広がる', () => {
  test.use({ viewport: { width: 1440, height: 790 } });

  test('サイドバーが無く、メニューのボタンが出る', async ({ page }) => {
    await page.goto('/chapters/chapter-2/3/');
    await expect(page.locator('.lesson-sidebar')).toHaveCount(0);
    await expect(page.locator('.lesson-menu > summary')).toBeVisible();
  });

  test('演習のページで、作業面の幅が画面の幅に近い', async ({ page }) => {
    await page.goto('/chapters/chapter-2/4/');
    const width = await page.locator('.lesson-main').evaluate((element) => element.getBoundingClientRect().width);
    expect(width).toBeGreaterThan(1400);
  });
});

test.describe('スマートフォンの幅のヘッダー', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('章の名前、前後のボタン、メニューが出て、リンクはメニューの中に入っている', async ({ page }) => {
    await page.goto('/chapters/chapter-2/4/');
    const bar = page.locator('.lesson-bar');
    await expect(bar.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(bar.locator('.lesson-bar__count')).toHaveText('4 / 5');
    await expect(bar.getByRole('button', { name: '前のページへ' })).toBeVisible();
    await expect(bar.getByRole('button', { name: '次のページへ' })).toBeVisible();
    await expect(bar.locator('.lesson-menu__links a').first()).toBeHidden();

    const menu = page.locator('.lesson-menu > summary');
    const size = await menu.boundingBox();
    expect(size?.width).toBeGreaterThanOrEqual(44);
    expect(size?.height).toBeGreaterThanOrEqual(44);
    await menu.click();
    await expect(page.locator('.lesson-menu__links a')).toHaveText(['トップページへ', '用語', 'うまく動かないとき']);
    await expect(page.locator('.lesson-menu__panel .lesson-pages [aria-current="page"]')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.locator('.lesson-menu__links').getByRole('link', { name: '用語' }).click();
    await expect(page).toHaveURL(/\/glossary\/$/);
  });
});
