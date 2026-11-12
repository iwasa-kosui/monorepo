import { expect, type Locator, type Page, test } from '@playwright/test';

const writePath = '/chapters/chapter-1/2/';
const viewPaths = ['/chapters/chapter-4/', '/chapters/chapter-4/5/', '/chapters/summary/2/'];
const storageKey = 'es-patchwork-hands-on:question:chapter-1';
const summaryPath = '/chapters/summary/2/';
const summaryKey = 'es-patchwork-hands-on:question:summary-update';
const summaryLabel = '選んだ更新処理と、記録する内容（誰が、いつ、何を）と変更理由（なぜ）';
const sampleUpdate = '注文のキャンセル処理に、誰がいつなぜ行ったかの記録を足す';
const sampleQuestion = '注文のキャンセルを誰がいつなぜ行ったか分かるか';
const sampleLabel = '第1章で挙げた問い';
const topicQuestion = 'この来院がキャンセルになっているのはなぜですか。';
const topicLabel = '題材の問い';
const longQuestion = '長い問い'.repeat(50);

const view = (page: Page): Locator => page.locator('[data-own-question-view]');

const expectTopic = async (page: Page): Promise<void> => {
  await expect(view(page)).toContainText(topicLabel);
  await expect(view(page)).toContainText(topicQuestion);
};

const saveDirectly = async (page: Page, value: string): Promise<void> => {
  await page.goto('/setup/');
  await page.evaluate(([key, text]) => window.localStorage.setItem(key ?? '', text ?? ''), [storageKey, value]);
};

type Fit = {
  readonly pageHeight: number;
  readonly innerHeight: number;
  readonly pageWidth: number;
  readonly innerWidth: number;
  readonly bodyScrollHeight: number;
  readonly bodyClientHeight: number;
};

const fit = (page: Page): Promise<Fit> =>
  page.evaluate(() => {
    const body = document.querySelector('.chapter-body');
    return {
      pageHeight: document.documentElement.scrollHeight,
      innerHeight: window.innerHeight,
      pageWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
      bodyScrollHeight: body?.scrollHeight ?? 0,
      bodyClientHeight: body?.clientHeight ?? 0,
    };
  });

test.describe('第1章で挙げた問い', () => {
  test('第1章の2ページ目に書くと保存され、再読み込みしても残る', async ({ page }) => {
    await page.goto(writePath);
    const input = page.getByRole('textbox', { name: '自分のシステムの問いを1つ挙げる' });
    await expect(input).toHaveValue('');
    await input.fill(sampleQuestion);
    await expect(page.getByRole('status').filter({ hasText: 'このブラウザに保存しました。' })).toBeVisible();
    await page.reload();
    await expect(input).toHaveValue(sampleQuestion);
  });

  test('入力欄で左右の矢印キーを押しても、ページは移動しない', async ({ page }) => {
    await page.goto(writePath);
    await page.getByRole('textbox', { name: '自分のシステムの問いを1つ挙げる' }).fill(sampleQuestion);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowLeft');
    await expect(page).toHaveURL(/\/chapters\/chapter-1\/2\/$/);
  });

  test('保存が無いときは、第4章の1ページ目と5ページ目、まとめの2ページ目に題材の問いが出る', async ({ page }) => {
    for (const path of viewPaths) {
      await page.goto(path);
      await expectTopic(page);
    }
  });

  test('書いた問いが、第4章の1ページ目と5ページ目、まとめの2ページ目に出る', async ({ page }) => {
    await page.goto(writePath);
    await page.getByRole('textbox', { name: '自分のシステムの問いを1つ挙げる' }).fill(sampleQuestion);
    for (const path of viewPaths) {
      await page.goto(path);
      await expect(view(page)).toContainText(sampleLabel);
      await expect(view(page)).toContainText(sampleQuestion);
      await expect(view(page)).not.toContainText(topicLabel);
      await expect(view(page).locator('[data-text]')).toHaveAttribute('title', sampleQuestion);
    }
  });

  test('問いを消すと、表示は題材の問いに戻る', async ({ page }) => {
    await page.goto(writePath);
    const input = page.getByRole('textbox', { name: '自分のシステムの問いを1つ挙げる' });
    await input.fill(sampleQuestion);
    await input.fill('');
    await page.goto(viewPaths[0] ?? '');
    await expectTopic(page);
  });

  test('空白だけの値は、保存が無いものとして題材の問いを出す', async ({ page }) => {
    await saveDirectly(page, '  \n ');
    await page.goto(viewPaths[0] ?? '');
    await expectTopic(page);
  });

  test('戻る操作でページが復元されたときも、保存済みの問いを読み直す', async ({ page }) => {
    await page.goto(viewPaths[0] ?? '');
    await expectTopic(page);
    await page.evaluate(([key, text]) => window.localStorage.setItem(key ?? '', text ?? ''), [
      storageKey,
      sampleQuestion,
    ]);
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
    await expect(view(page)).toContainText(sampleQuestion);
  });

  for (
    const [name, script] of [
      ['localStorage の取得が例外を投げる', () => {
        Object.defineProperty(window, 'localStorage', {
          configurable: true,
          get() {
            throw new DOMException('denied', 'SecurityError');
          },
        });
      }],
      ['getItem と setItem が例外を投げる', () => {
        const fail = (): never => {
          throw new DOMException('broken', 'InvalidStateError');
        };
        Object.defineProperty(window, 'localStorage', {
          configurable: true,
          value: { getItem: fail, setItem: fail, removeItem: fail },
        });
      }],
    ] as const
  ) {
    test(`${name}ときも、表示は壊れず題材の問いが出て、入力欄は使える`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.addInitScript(script);
      for (const path of viewPaths) {
        await page.goto(path);
        await expectTopic(page);
      }
      await page.goto(writePath);
      const input = page.getByRole('textbox', { name: '自分のシステムの問いを1つ挙げる' });
      await input.fill(sampleQuestion);
      await expect(input).toHaveValue(sampleQuestion);
      await expect(page.getByRole('status').filter({ hasText: 'このブラウザに保存しました。' })).toHaveCount(0);
      await expect(page.getByRole('status').filter({ hasText: 'このブラウザには保存できませんでした。' }))
        .toBeVisible();
      expect(errors).toEqual([]);
    });
  }

  test('JavaScript が無効でも、題材の問いが静的に出る', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    for (const path of viewPaths) {
      await page.goto(path);
      await expectTopic(page);
    }
    await context.close();
  });
});

test.describe('長い問いを保存した状態でも収まる', () => {
  for (const size of [{ width: 1280, height: 640 }, { width: 1440, height: 790 }]) {
    test(`${size.width}x${size.height} でページ全体にスクロールが出ず、問いは1行に省略され、全文が title に入る`, async ({ page }) => {
      await page.setViewportSize(size);
      await saveDirectly(page, longQuestion);
      for (const path of ['/chapters/chapter-1/2/', ...viewPaths]) {
        await page.goto(path);
        const axes = page.locator('[data-axis]');
        const count = Math.max(await axes.count(), 1);
        for (let index = 0; index < count; index += 1) {
          if (path.endsWith('/chapter-4/5/')) {
            await axes.nth(index).click();
          }
          const measured = await fit(page);
          const label = `${path} ${size.width}x${size.height} ${index + 1}`;
          expect(measured.pageHeight, label).toBeLessThanOrEqual(measured.innerHeight);
          expect(measured.pageWidth, label).toBeLessThanOrEqual(measured.innerWidth);
          expect(measured.bodyScrollHeight, label).toBeLessThanOrEqual(measured.bodyClientHeight);
        }
        if (path !== '/chapters/chapter-1/2/') {
          const text = view(page).locator('[data-text]');
          await expect(text).toHaveAttribute('title', longQuestion);
          expect(await text.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
          expect(await text.evaluate((element) => element.getBoundingClientRect().height < 40)).toBe(true);
        }
      }
    });
  }

  for (const size of [{ width: 360, height: 640 }, { width: 390, height: 844 }]) {
    test(`${size.width}x${size.height} で横にスクロールが出ない`, async ({ page }) => {
      await page.setViewportSize(size);
      await saveDirectly(page, longQuestion);
      for (const path of ['/chapters/chapter-1/2/', ...viewPaths]) {
        await page.goto(path);
        const measured = await fit(page);
        expect(measured.pageWidth, `${path} ${size.width}x${size.height}`).toBeLessThanOrEqual(measured.innerWidth);
      }
    });
  }
});

test.describe('まとめの2ページ目の、持ち帰る更新処理を書く欄', () => {
  const input = (page: Page): Locator => page.getByRole('textbox', { name: summaryLabel });

  test('書くと保存され、再読み込みしても残る', async ({ page }) => {
    await page.goto(summaryPath);
    await expect(input(page)).toHaveValue('');
    await input(page).fill(sampleUpdate);
    await expect(page.getByRole('status').filter({ hasText: 'このブラウザに保存しました。' })).toBeVisible();
    expect(await page.evaluate((key) => window.localStorage.getItem(key), summaryKey)).toBe(sampleUpdate);
    await page.reload();
    await expect(input(page)).toHaveValue(sampleUpdate);
  });

  test('第1章の問いとは別に保存され、互いに混ざらない', async ({ page }) => {
    await page.goto(writePath);
    await page.getByRole('textbox', { name: '自分のシステムの問いを1つ挙げる' }).fill(sampleQuestion);
    await page.goto(summaryPath);
    await expect(input(page)).toHaveValue('');
    await expect(view(page)).toContainText(sampleQuestion);
    await input(page).fill(sampleUpdate);
    await expect(view(page)).not.toContainText(sampleUpdate);
    expect(await page.evaluate((key) => window.localStorage.getItem(key), storageKey)).toBe(sampleQuestion);
    await page.goto(writePath);
    await expect(page.getByRole('textbox', { name: '自分のシステムの問いを1つ挙げる' })).toHaveValue(sampleQuestion);
  });

  test('localStorage が例外を投げるときも、表示は壊れず、保存できなかったことが出る', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() => {
      const fail = (): never => {
        throw new DOMException('broken', 'InvalidStateError');
      };
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        value: { getItem: fail, setItem: fail, removeItem: fail },
      });
    });
    await page.goto(summaryPath);
    await expectTopic(page);
    await input(page).fill(sampleUpdate);
    await expect(input(page)).toHaveValue(sampleUpdate);
    await expect(page.getByRole('status').filter({ hasText: 'このブラウザに保存しました。' })).toHaveCount(0);
    await expect(page.getByRole('status').filter({ hasText: 'このブラウザには保存できませんでした。' })).toBeVisible();
    expect(errors).toEqual([]);
  });

  const saveBoth = async (page: Page): Promise<void> => {
    await page.goto('/setup/');
    await page.evaluate(([first, second, value]) => {
      window.localStorage.setItem(first ?? '', value ?? '');
      window.localStorage.setItem(second ?? '', value ?? '');
    }, [storageKey, summaryKey, longQuestion]);
  };

  for (const size of [{ width: 1280, height: 640 }, { width: 1440, height: 790 }]) {
    test(`長い問いと長い更新処理を保存した状態でも、${size.width}x${size.height} でページ全体にスクロールが出ない`, async ({ page }) => {
      await page.setViewportSize(size);
      await saveBoth(page);
      await page.goto(summaryPath);
      await expect(input(page)).toHaveValue(longQuestion);
      const measured = await fit(page);
      expect(measured.pageHeight).toBeLessThanOrEqual(measured.innerHeight);
      expect(measured.pageWidth).toBeLessThanOrEqual(measured.innerWidth);
      expect(measured.bodyScrollHeight).toBeLessThanOrEqual(measured.bodyClientHeight);
    });
  }

  for (const size of [{ width: 360, height: 640 }, { width: 390, height: 844 }]) {
    test(`長い問いと長い更新処理を保存した状態でも、${size.width}x${size.height} で横にスクロールが出ない`, async ({ page }) => {
      await page.setViewportSize(size);
      await saveBoth(page);
      await page.goto(summaryPath);
      await expect(input(page)).toHaveValue(longQuestion);
      const measured = await fit(page);
      expect(measured.pageWidth).toBeLessThanOrEqual(measured.innerWidth);
    });
  }
});
