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

const follow = async (page: Page, name: '前のページへ' | '次のページへ'): Promise<string[]> => {
  const visited = [pathOf(page)];
  const limit = chapterPagePaths().length + 5;
  while (visited.length <= limit) {
    const button = page.getByRole('button', { name });
    if (await button.isDisabled()) break;
    const before = pathOf(page);
    await button.click();
    await page.waitForURL((url) => url.pathname !== before);
    await page.waitForLoadState('load');
    visited.push(pathOf(page));
  }
  return visited;
};

test('「次のページへ」を順にたどると全ページを通ってまとめの最後に着く', async ({ page }) => {
  const expected = chapterPagePaths();
  await page.goto(expected[0] ?? '/');
  expect(await follow(page, '次のページへ')).toEqual(expected);
  expect(pathOf(page)).toMatch(/^\/chapters\/summary\//);
});

test('「前のページへ」を順にたどると全ページを逆順に通って導入の最初に着く', async ({ page }) => {
  const expected = chapterPagePaths();
  await page.goto(expected[expected.length - 1] ?? '/');
  expect(await follow(page, '前のページへ')).toEqual([...expected].reverse());
  expect(pathOf(page)).toBe('/chapters/intro/');
});

test('章の境界でも「次のページへ」「前のページへ」で隣の章のページへ移動する', async ({ page }) => {
  await page.goto('/chapters/intro/7/');
  await page.getByRole('button', { name: '次のページへ' }).click();
  await expect(page).toHaveURL(/\/chapters\/chapter-1\/$/);
  await page.waitForLoadState('load');
  await page.getByRole('button', { name: '前のページへ' }).click();
  await expect(page).toHaveURL(/\/chapters\/intro\/7\/$/);
});

test('ページの上部に章の名前と進み具合が出る', async ({ page }) => {
  await page.goto('/chapters/intro/2/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('導入');
  await expect(page.locator('.lesson-bar__count')).toHaveText('2 / 7');
  await expect(page.getByRole('img', { name: '全体 2/26' })).toBeVisible();
  await page.locator('.lesson-menu > summary').click();
  await expect(page.getByRole('link', { name: 'トップページへ' })).toBeVisible();
  await expect(page.getByRole('link', { name: '用語' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'うまく動かないとき' })).toBeVisible();
});

test('できるようになること（goal）は、聞くページの最初のページだけに出て、immersive のページには出ない', async ({ page }) => {
  await page.goto('/chapters/intro/');
  await expect(page.getByText('できるようになること：')).toBeVisible();
  await expect(page.locator('.chapter-goal')).toHaveClass(/\bnote\b/);
  await page.goto('/chapters/intro/3/');
  await expect(page.getByText('できるようになること：')).toHaveCount(0);
  await page.goto('/chapters/chapter-2/');
  await expect(page.getByText('できるようになること：')).toHaveCount(0);
});

test.describe('矢印キー', () => {
  test('右キーで次のページ、左キーで前のページへ移動する', async ({ page }) => {
    await page.goto('/chapters/chapter-2/2/');
    await page.keyboard.press('ArrowRight');
    await expect(page).toHaveURL(/\/chapters\/chapter-2\/3\/$/);
    await page.waitForLoadState('load');
    await page.keyboard.press('ArrowLeft');
    await expect(page).toHaveURL(/\/chapters\/chapter-2\/2\/$/);
  });

  test('章の境界でも矢印キーで移動する', async ({ page }) => {
    await page.goto('/chapters/intro/7/');
    await page.keyboard.press('ArrowRight');
    await expect(page).toHaveURL(/\/chapters\/chapter-1\/$/);
    await page.waitForLoadState('load');
    await page.keyboard.press('ArrowLeft');
    await expect(page).toHaveURL(/\/chapters\/intro\/7\/$/);
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

  test('横にスクロールできるコード欄にフォーカスがあるときは移動しない', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/chapters/chapter-3/2/');
    const code = page.locator('pre').first();
    expect(await code.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
    await logHandledKeys(page);
    await code.focus();
    await page.keyboard.press('ArrowRight');
    expect(await handledKeys(page)).toEqual([false]);
    expect(pathOf(page)).toBe('/chapters/chapter-3/2/');
  });

  test('横にスクロールしないコード欄にフォーカスがあるときは移動する', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 640 });
    await page.goto('/chapters/chapter-3/2/');
    const code = page.locator('pre').first();
    await code.evaluate((element) => {
      element.textContent = 'SELECT 1;';
      element.tabIndex = 0;
    });
    expect(await code.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(false);
    await code.focus();
    await page.keyboard.press('ArrowLeft');
    await expect(page).toHaveURL(/\/chapters\/chapter-3\/$/);
  });

  test('キーを押し続けて繰り返されたイベントでは移動しない', async ({ page }) => {
    await page.goto('/chapters/chapter-2/2/');
    const notCancelled = await page.evaluate(() =>
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', repeat: true, bubbles: true, cancelable: true }),
      )
    );
    expect(notCancelled).toBe(true);
    expect(pathOf(page)).toBe('/chapters/chapter-2/2/');
  });
});

test.describe('いますることの帯', () => {
  const chipOf = { listen: '講義', do: 'ワーク', done: '完了' } as const;

  test('全ページで、本文の上に帯が1つ出て、役割の文と状態が合っている', async ({ page }) => {
    const textPattern = /^(?:[^。]+。){1,2}$/;
    for (const path of chapterPagePaths()) {
      await page.goto(path);
      const bar = page.locator('[data-action-bar]');
      await expect(bar, path).toHaveCount(1);
      await expect(bar, path).toHaveAttribute('aria-label', '現在の作業');
      await expect(bar, path).toHaveAttribute('aria-live', 'polite');
      const state = (await bar.getAttribute('data-state')) as 'listen' | 'do' | null;
      expect(['listen', 'do'], path).toContain(state);
      await expect(bar.locator('[data-action-chip]'), path).toHaveText(chipOf[state ?? 'listen']);
      const text = (await bar.locator('[data-action-text]').innerText()).trim();
      expect(text, path).toMatch(textPattern);
      expect(text, path).not.toMatch(/^(課題|説明|やってみる|演習|実演|まとめ):/);
      const barBox = await bar.boundingBox();
      const bodyBox = await page.locator('.chapter-body').boundingBox();
      expect(barBox, path).not.toBeNull();
      expect(bodyBox, path).not.toBeNull();
      expect(barBox?.y ?? Infinity, path).toBeLessThan(bodyBox?.y ?? 0);
      const next = bar.locator('[data-action-next]');
      if (path === '/chapters/summary/2/') {
        await expect(next, path).toHaveCount(0);
      } else if (state === 'do') {
        await expect(next, path).toBeHidden();
      } else {
        await expect(next, path).toBeVisible();
        await expect(next, path).toHaveClass(/btn--outline/);
      }
    }
  });

  test('聞くページでは灰色の帯に「講義」が出て、「次へ」を押すと次のページへ進む', async ({ page }) => {
    await page.goto('/chapters/intro/');
    const bar = page.locator('[data-action-bar]');
    await expect(bar).toHaveAttribute('data-state', 'listen');
    await expect(bar.locator('[data-action-chip]')).toHaveText('講義');
    await expect(bar).toHaveCSS('background-color', 'rgb(241, 243, 246)');
    await bar.getByRole('link', { name: '次へ' }).click();
    await expect(page).toHaveURL(/\/chapters\/intro\/2\/$/);
  });

  test('手を動かすページでは青い帯に「ワーク」が出て、「次へ」は隠れる', async ({ page }) => {
    await page.goto('/chapters/chapter-2/2/');
    const bar = page.locator('[data-action-bar]');
    await expect(bar).toHaveAttribute('data-state', 'do');
    await expect(bar.locator('[data-action-chip]')).toHaveText('ワーク');
    await expect(bar).toHaveCSS('background-color', 'rgb(29, 78, 216)');
    await expect(bar.locator('[data-action-next]')).toBeHidden();
  });

  test('lesson:action で、状態、文、ボタンを書き換えられる', async ({ page }) => {
    await page.goto('/chapters/chapter-2/2/');
    const bar = page.locator('[data-action-bar]');
    await page.evaluate(() => {
      Object.assign(window, { pressed: 0 });
      document.dispatchEvent(
        new CustomEvent('lesson:action', {
          detail: {
            text: '「テストを実行する」を押します。',
            button: {
              label: 'テストを実行する',
              onClick: () => {
                (window as unknown as { pressed: number }).pressed += 1;
              },
            },
          },
        }),
      );
    });
    await expect(bar.locator('[data-action-text]')).toHaveText('「テストを実行する」を押します。');
    await expect(bar).toHaveAttribute('data-state', 'do');
    const button = bar.locator('[data-action-slot]').getByRole('button', { name: 'テストを実行する' });
    await expect(button).toHaveClass(/btn--bar/);
    await button.click();
    expect(await page.evaluate(() => (window as unknown as { pressed: number }).pressed)).toBe(1);

    await page.evaluate(() => {
      document.dispatchEvent(new CustomEvent('lesson:action', { detail: { state: 'done', button: null } }));
    });
    await expect(bar).toHaveAttribute('data-state', 'done');
    await expect(bar.locator('[data-action-chip]')).toHaveText('完了');
    await expect(bar).toHaveCSS('background-color', 'rgb(11, 107, 58)');
    await expect(bar.locator('[data-action-slot]').getByRole('button')).toHaveCount(0);
    const next = bar.getByRole('link', { name: '次へ' });
    await expect(next).toBeVisible();
    await expect(next).toHaveClass(/btn--bar/);
    await expect(bar.locator('[data-action-text]')).toHaveText('「テストを実行する」を押します。');
    expect(await page.evaluate(() => document.activeElement?.matches('[data-action-next]'))).toBe(false);

    await page.evaluate(() => {
      document.dispatchEvent(new CustomEvent('lesson:action', { detail: { state: 'listen' } }));
    });
    await expect(bar.locator('[data-action-chip]')).toHaveText('講義');
    await expect(next).toHaveClass(/btn--outline/);
  });
});

test.describe('前後のページのボタン', () => {
  test('ヘッダーに前後のボタンと「n / total」が出る', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/chapters/chapter-2/2/');
    const previous = page.getByRole('button', { name: '前のページへ' });
    const next = page.getByRole('button', { name: '次のページへ' });
    await expect(previous).toBeEnabled();
    await expect(next).toBeEnabled();
    for (const button of [previous, next]) {
      const box = await button.boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(44);
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }
    await expect(page.locator('.lesson-bar__count')).toHaveText('2 / 5');
    const barTop = await page.locator('.lesson-bar').evaluate((element) => element.getBoundingClientRect().top);
    expect(barTop).toBe(0);
  });

  test('最初のページでは前のボタンが、最後のページでは次のボタンが使えない', async ({ page }) => {
    const paths = chapterPagePaths();
    await page.goto(paths[0] ?? '/');
    await expect(page.getByRole('button', { name: '前のページへ' })).toBeDisabled();
    await expect(page.getByRole('button', { name: '次のページへ' })).toBeEnabled();
    await page.goto(paths.at(-1) ?? '/');
    await expect(page.getByRole('button', { name: '前のページへ' })).toBeEnabled();
    await expect(page.getByRole('button', { name: '次のページへ' })).toBeDisabled();
  });

  test('ページ全体は縦にスクロールせず、帯の下の作業面だけがスクロールできる', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 640 });
    await page.goto('/chapters/chapter-3/2/');
    const metrics = await page.evaluate(() => {
      const scroller = document.scrollingElement ?? document.documentElement;
      const main = document.querySelector('.lesson-main');
      return {
        pageOverflows: scroller.scrollHeight > window.innerHeight,
        mainOverflow: main === null ? '' : getComputedStyle(main).overflowY,
      };
    });
    expect(metrics).toEqual({ pageOverflows: false, mainOverflow: 'auto' });
  });
});

test.describe('章ページ以外の上部バー', () => {
  for (const path of ['/setup/', '/troubleshooting/', '/glossary/', '/no-such-page/']) {
    test(`${path} には上部バーだけが出る`, async ({ page }) => {
      const response = await page.goto(path);
      if (path === '/no-such-page/') expect(response?.status()).toBe(404);
      const bar = page.locator('header.top-bar');
      await expect(bar).toBeVisible();
      const home = bar.getByRole('link', { name: 'トップページへ' });
      await expect(home).toBeVisible();
      await expect(home).toHaveAttribute('href', '/');
      await expect(page.locator('.lesson-bar')).toHaveCount(0);
      await expect(page.locator('.action-bar')).toHaveCount(0);
      await expect(page.locator('.lesson-menu')).toHaveCount(0);
    });
  }

  test('トップページには上部バーを付けない', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.top-bar')).toHaveCount(0);
  });
});

test('キーボードだけで、導入からまとめまで前後に移動できる', async ({ page }) => {
  test.setTimeout(120_000);
  const expected = chapterPagePaths();
  const first = expected[0] ?? '/';
  const last = expected.at(-1) ?? '/';
  const limit = expected.length + 5;
  const walk = async (key: 'ArrowRight' | 'ArrowLeft', goal: string): Promise<string[]> => {
    const visited = [pathOf(page)];
    while (pathOf(page) !== goal && visited.length <= limit) {
      const before = pathOf(page);
      await page.locator('h1').click();
      await page.keyboard.press(key);
      await page.waitForURL((url) => url.pathname !== before);
      await page.waitForLoadState('load');
      visited.push(pathOf(page));
    }
    return visited;
  };
  await page.goto(first);
  expect(await walk('ArrowRight', last)).toEqual(expected);
  expect(await walk('ArrowLeft', first)).toEqual([...expected].reverse());
});

test('メニューの中のリンクにフォーカスが見える', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 790 });
  await page.goto('/chapters/chapter-2/3/');
  await page.locator('.lesson-menu > summary').click();
  await page.locator('.lesson-menu > summary').focus();
  const reached = (): Promise<boolean> =>
    page.evaluate(() => document.activeElement?.matches('.lesson-menu__panel a[aria-current="page"]') ?? false);
  for (let count = 0; count < 60 && !(await reached()); count += 1) {
    await page.keyboard.press('Tab');
  }
  expect(await reached(), 'Tab で現在のページのリンクに届きません').toBe(true);
  const outline = await page.locator('.lesson-menu__panel a[aria-current="page"]').evaluate((element) => {
    const style = getComputedStyle(element);
    return { style: style.outlineStyle, width: style.outlineWidth };
  });
  expect(outline).toEqual({ style: 'solid', width: '3px' });
});
