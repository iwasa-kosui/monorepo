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
  await page.goto('/chapters/intro/7/');
  await page.getByRole('link', { name: /次へ/ }).click();
  await expect(page).toHaveURL(/\/chapters\/chapter-1\/$/);
  await page.getByRole('link', { name: /前へ/ }).click();
  await expect(page).toHaveURL(/\/chapters\/intro\/7\/$/);
});

test('ページの上部に章の名前と進み具合が出る', async ({ page }) => {
  await page.goto('/chapters/intro/2/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('導入');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('2/7');
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

test.describe('役割の行', () => {
  test('本文の上に役割の行が出る', async ({ page }) => {
    await page.goto('/chapters/chapter-1/2/');
    await expect(page.locator('.lesson-role')).toHaveText(/^\s*やってみる: .+。\s*$/);
    await page.goto('/chapters/chapter-2/4/');
    await expect(page.locator('.lesson-role')).toHaveText(/^\s*演習: /);

    const rolePattern = /^(課題|説明|やってみる|演習|実演|まとめ): [^。]+。$/;
    for (const path of chapterPagePaths()) {
      await page.goto(path);
      const role = page.locator('.lesson-role');
      await expect(role, path).toHaveCount(1);
      expect((await role.innerText()).trim(), path).toMatch(rolePattern);
      const roleBox = await role.boundingBox();
      const bodyBox = await page.locator('.chapter-body').boundingBox();
      expect(roleBox, path).not.toBeNull();
      expect(bodyBox, path).not.toBeNull();
      const hiddenOnScreen = ((await role.getAttribute('class')) ?? '').includes('visually-hidden');
      if (hiddenOnScreen) {
        expect(roleBox?.width ?? Infinity, path).toBeLessThanOrEqual(1);
        expect(roleBox?.height ?? Infinity, path).toBeLessThanOrEqual(1);
        expect(roleBox?.y ?? Infinity, path).toBeLessThanOrEqual(bodyBox?.y ?? 0);
      } else {
        expect(roleBox?.y ?? Infinity, path).toBeLessThan(bodyBox?.y ?? 0);
      }
    }
  });
});

test.describe('下部のフッター', () => {
  test('下部のフッターに前後のリンクとキー操作のヒントが出る', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/chapters/chapter-2/2/');
    const footer = page.locator('.lesson-footer');
    await expect(footer).toBeVisible();
    await expect(footer.locator('a[rel="prev"] kbd')).toBeVisible();
    await expect(footer.locator('a[rel="prev"] kbd')).toHaveText('←');
    await expect(footer.locator('a[rel="next"] kbd')).toBeVisible();
    await expect(footer.locator('a[rel="next"] kbd')).toHaveText('→');
    await expect(page.locator('.lesson-footer__hint')).toHaveText('← → キーでも移動できます');
    const footerBottom = await footer.evaluate((element) => element.getBoundingClientRect().bottom);
    const innerHeight = await page.evaluate(() => window.innerHeight);
    expect(Math.abs(footerBottom - innerHeight)).toBeLessThanOrEqual(1);
  });

  test('章の境界の前後リンクには隣の章の名前が出る', async ({ page }) => {
    await page.goto('/chapters/intro/7/');
    await expect(page.locator('.lesson-footer a[rel="next"]')).toContainText('第1章');
  });

  test('入力欄にフォーカスがある間は、ヒントがページを移動しないことを示す', async ({ page }) => {
    await page.goto('/chapters/chapter-2/2/');
    const hint = page.locator('.lesson-footer__hint');
    await expect(hint).toHaveText('← → キーでも移動できます');
    await page.evaluate(() => {
      document.body.insertAdjacentHTML('beforeend', '<textarea id="probe"></textarea>');
      (document.getElementById('probe') as HTMLElement).focus();
    });
    await expect(hint).toHaveText('入力中は ← → でページを移動しません');
    await page.locator('h1').click();
    await expect(hint).toHaveText('← → キーでも移動できます');
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
      await expect(page.locator('.lesson-sidebar')).toHaveCount(0);
      await expect(page.locator('.lesson-footer')).toHaveCount(0);
      await expect(page.locator('.lesson-menu')).toHaveCount(0);
      await expect(page.locator('.lesson-bar__status')).toHaveCount(0);
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

test('サイドバーのリンクにフォーカスが見える', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 790 });
  await page.goto('/chapters/chapter-2/3/');
  await page.locator('.top-bar__home').focus();
  const reached = (): Promise<boolean> =>
    page.evaluate(() => document.activeElement?.matches('.lesson-sidebar a[aria-current="page"]') ?? false);
  for (let count = 0; count < 60 && !(await reached()); count += 1) {
    await page.keyboard.press('Tab');
  }
  expect(await reached(), 'Tab で現在のページのリンクに届きません').toBe(true);
  const outline = await page.locator('.lesson-sidebar a[aria-current="page"]').evaluate((element) => {
    const style = getComputedStyle(element);
    return { style: style.outlineStyle, width: style.outlineWidth };
  });
  expect(outline).toEqual({ style: 'solid', width: '2px' });
});
