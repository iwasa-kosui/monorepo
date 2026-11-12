import { expect, type Locator, type Page, test } from '@playwright/test';

const motions = ['no-preference', 'reduce'] as const;

type Size = { readonly width: number; readonly height: number };

const desktopSizes: readonly Size[] = [{ width: 1280, height: 640 }, { width: 1440, height: 790 }];
const narrowSizes: readonly Size[] = [
  { width: 1024, height: 768 },
  { width: 390, height: 844 },
  { width: 360, height: 640 },
];

const transactionPath = '/chapters/chapter-2/';
const eventRowPath = '/chapters/chapter-2/3/';
const beforeRecordPath = '/chapters/chapter-3/4/';

const transactionSuccess = [
  '経路を選んで「次へ」を押すと、cancelVisit の処理を1つずつ進めます。',
  'withTransaction がトランザクションを始めます。',
  'UPDATE で、visits の status が cancelled になります。まだ確定していません。',
  'INSERT で、business_events に1行を書きます。まだ確定していません。',
  'トランザクションを確定します。来院の更新と記録の両方が残ります。',
];
const transactionFail = [
  transactionSuccess[0],
  transactionSuccess[1],
  transactionSuccess[2],
  'business_events への記録が失敗します。',
  'トランザクションを取り消します。visits の status は reserved に戻ります。記録が抜けたキャンセルは残りません。',
];
const eventRowMessages = [
  '「次へ」を押すと、ポチのキャンセルで書く1行が列ごとに埋まります。',
  'event_id は DB が連番で採番します。',
  'event_at は「いつ」に答えます。',
  'event_name は「何を」に答えます。',
  'payload には、呼び出し元が渡した理由と操作した人が入ります。「誰が」「なぜ」に答えます。',
  'target_ で始まる3列は、どの来院がどの状態になったかを残します。',
  'この1行で、問い合わせの「誰が、いつ、何を、なぜ」に答えられます。',
];
const beforeRecordMessages = [
  '「次へ」を押して、時間を進めます。2件の来院は、どちらも reserved です。',
  'タマの来院がキャンセルされます。このときは記録のコードがありません。visits の status だけが cancelled になります。',
  'cancelVisit に記録を足します。',
  'ポチの来院がキャンセルされます。visits と business_events の両方に残ります。',
  '第3章の最初のページの SELECT を実行します。タマの行は event_at から reason までが NULL です。足す前に起きたことは分かりません。',
];

type Names = { readonly next: Locator; readonly reset: Locator; readonly message: Locator };

const controls = (figure: Locator): Names => ({
  next: figure.getByRole('button', { name: '次へ', exact: true }),
  reset: figure.getByRole('button', { name: '最初に戻す', exact: true }),
  message: figure.locator('[aria-live="polite"]'),
});

const stepThrough = async (figure: Locator, messages: readonly string[]): Promise<void> => {
  const { next, reset, message } = controls(figure);
  const last = messages.length - 1;
  for (const [index, text] of messages.entries()) {
    await expect(message).toHaveText(text);
    await expect(figure).toHaveAttribute('data-step', String(index));
    await expect(next).toBeEnabled({ enabled: index !== last });
    await expect(reset).toBeEnabled({ enabled: index !== 0 });
    if (index !== last) await next.click();
  }
};

for (const reducedMotion of motions) {
  test.describe(`章の図解（reducedMotion: ${reducedMotion}）`, () => {
    test.use({ reducedMotion });

    test('第2章 1 ページ目: 記録に成功する経路で、確定すると来院の更新と記録の両方が残る', async ({ page }) => {
      await page.goto(transactionPath);
      const figure = page.locator('[data-transaction-figure]');
      const success = figure.getByRole('button', { name: '記録に成功する場合' });
      const fail = figure.getByRole('button', { name: '記録に失敗する場合' });
      const reserved = figure.locator('[data-value="reserved"]');
      const cancelled = figure.locator('[data-value="cancelled"]');

      await expect(success).toHaveAttribute('aria-pressed', 'true');
      await expect(fail).toHaveAttribute('aria-pressed', 'false');
      await expect(reserved).toBeVisible();
      await expect(cancelled).toBeHidden();
      await expect(figure.getByText('行がありません')).toBeVisible();

      await stepThrough(figure, transactionSuccess);

      await expect(reserved).toBeHidden();
      await expect(cancelled).toBeVisible();
      await expect(figure.locator('.v-cancelled .tag-commit')).toBeVisible();
      await expect(figure.locator('.row-event')).toBeVisible();
      await expect(figure.getByText('行がありません')).toBeHidden();
      await expect(figure.locator('.stamp-commit')).toBeVisible();
      await expect(figure.locator('.stamp-rollback')).toBeHidden();
    });

    test('第2章 1 ページ目: 記録に失敗する経路で、取り消すと status が reserved に戻り記録は空のまま', async ({ page }) => {
      await page.goto(transactionPath);
      const figure = page.locator('[data-transaction-figure]');
      const success = figure.getByRole('button', { name: '記録に成功する場合' });
      const fail = figure.getByRole('button', { name: '記録に失敗する場合' });
      const reserved = figure.locator('[data-value="reserved"]');
      const cancelled = figure.locator('[data-value="cancelled"]');

      await fail.click();
      await expect(fail).toHaveAttribute('aria-pressed', 'true');
      await expect(success).toHaveAttribute('aria-pressed', 'false');
      await expect(figure).toHaveAttribute('data-path', 'fail');

      await stepThrough(figure, transactionFail);

      await expect(reserved).toBeVisible();
      await expect(cancelled).toBeHidden();
      await expect(figure.getByText('行がありません')).toBeVisible();
      await expect(figure.locator('.row-event')).toBeHidden();
      await expect(figure.locator('.fail-mark')).toBeVisible();
      await expect(figure.locator('.stamp-rollback')).toBeVisible();
      await expect(figure.locator('.stamp-commit')).toBeHidden();
    });

    test('第2章 1 ページ目: 失敗経路の 3 ステップ目で INSERT に失敗の印が付き、cancelled は確定前のまま', async ({ page }) => {
      await page.goto(transactionPath);
      const figure = page.locator('[data-transaction-figure]');
      const { next } = controls(figure);

      await figure.getByRole('button', { name: '記録に失敗する場合' }).click();
      for (let index = 0; index < 3; index += 1) await next.click();

      await expect(figure.locator('.fail-mark')).toBeVisible();
      await expect(figure.locator('.v-cancelled .tag-pending')).toBeVisible();
      await expect(figure.locator('.v-cancelled .tag-commit')).toBeHidden();
      await expect(figure.locator('.stamp-commit')).toBeHidden();
      await expect(figure.locator('.stamp-rollback')).toBeHidden();
    });

    test('第2章 1 ページ目: 経路を切り替えると最初に戻る', async ({ page }) => {
      await page.goto(transactionPath);
      const figure = page.locator('[data-transaction-figure]');
      const { next, reset, message } = controls(figure);

      await next.click();
      await next.click();
      await expect(figure).toHaveAttribute('data-step', '2');

      await figure.getByRole('button', { name: '記録に失敗する場合' }).click();
      await expect(figure).toHaveAttribute('data-step', '0');
      await expect(message).toHaveText(transactionFail[0] ?? '');
      await expect(next).toBeEnabled();
      await expect(reset).toBeDisabled();
      await expect(figure.locator('[data-value="reserved"]')).toBeVisible();

      await next.click();
      await next.click();
      await next.click();
      await figure.getByRole('button', { name: '記録に成功する場合' }).click();
      await expect(figure).toHaveAttribute('data-step', '0');
      await expect(figure).toHaveAttribute('data-path', 'success');
      await expect(message).toHaveText(transactionSuccess[0] ?? '');
    });

    test('第2章 1 ページ目: 「最初に戻す」で最初のステップに戻る', async ({ page }) => {
      await page.goto(transactionPath);
      const figure = page.locator('[data-transaction-figure]');
      const { next, reset, message } = controls(figure);

      await next.click();
      await next.click();
      await reset.click();

      await expect(figure).toHaveAttribute('data-step', '0');
      await expect(message).toHaveText(transactionSuccess[0] ?? '');
      await expect(reset).toBeDisabled();
    });

    test('第2章 3 ページ目: 「次へ」で列ごとに値が埋まり、最後に payload の値が読める', async ({ page }) => {
      await page.goto(eventRowPath);
      const figure = page.locator('[data-event-row-figure]');
      const values = figure.locator('.val-text');
      const call = figure.locator('.call');

      await expect(call).toHaveText(
        'cancelVisit(db, { visitId: \'visit-pochi\', reason: \'飼い主の都合\', operatedBy: \'受付スタッフ\' })',
      );
      await expect(figure.locator('.badge:visible')).toHaveCount(0);
      await expect(figure.locator('.val-text:visible')).toHaveCount(0);

      const { next } = controls(figure);
      await next.click();
      await expect(values.nth(0)).toBeVisible();
      await expect(values.nth(0)).toHaveText('1');
      await next.click();
      await expect(values.nth(1)).toHaveText('2026-11-06T18:11:58.846Z');
      await expect(figure.locator('.badge:visible')).toHaveText(['いつ']);
      await next.click();
      await expect(values.nth(2)).toHaveText('VisitCancelled');
      await expect(figure.locator('.badge:visible')).toHaveText(['いつ', '何を']);
      await next.click();
      await expect(values.nth(3)).toHaveText('{"reason":"飼い主の都合","operatedBy":"受付スタッフ"}');
      await expect(figure.locator('.badge:visible')).toHaveText(['いつ', '何を', '誰が', 'なぜ']);
      await expect(figure.locator('.call .arg')).toHaveCount(2);
      await next.click();
      await expect(values.nth(4)).toHaveText('visit-pochi');
      await expect(values.nth(5)).toHaveText('Visit');
      await expect(values.nth(6)).toHaveText('{"id":"visit-pochi","pet_name":"ポチ","status":"cancelled"}');
      await next.click();
      await expect(figure.locator('.val-text:visible')).toHaveCount(7);
    });

    test('第2章 3 ページ目: 各ステップのメッセージとボタンの状態', async ({ page }) => {
      await page.goto(eventRowPath);
      const figure = page.locator('[data-event-row-figure]');
      await stepThrough(figure, eventRowMessages);

      const { reset, message } = controls(figure);
      await expect(figure.locator('.badge:visible')).toHaveCount(4);
      await reset.click();
      await expect(message).toHaveText(eventRowMessages[0] ?? '');
      await expect(figure.locator('.val-text:visible')).toHaveCount(0);
    });

    test('第3章 4 ページ目: 時間を進めると、記録を足す前のタマの行だけ NULL になる', async ({ page }) => {
      await page.goto(beforeRecordPath);
      const figure = page.locator('[data-before-record-figure]');
      const result = figure.locator('.result');

      await expect(result).toBeHidden();
      await expect(figure.getByText('行がありません')).toBeVisible();
      await expect(figure.locator('.status .s-reserved:visible')).toHaveCount(2);

      await stepThrough(figure, beforeRecordMessages);

      await expect(result).toBeVisible();
      await expect(result.locator('td.null')).toHaveCount(4);
      await expect(result.locator('td.null')).toHaveText(['NULL', 'NULL', 'NULL', 'NULL']);
      await expect(result.locator('tbody tr').first()).toContainText('visit-pochi');
      await expect(result.locator('tbody tr').first()).toContainText('2026-11-06T18:11:58.846Z');
      await expect(result.locator('tbody tr').first()).toContainText('受付スタッフ');
      await expect(result.locator('tbody tr').first()).toContainText('飼い主の都合');
      await expect(figure.locator('.status .s-cancelled:visible')).toHaveCount(2);
      await expect(figure.locator('.row-event')).toBeVisible();
      await expect(figure.locator('.point[data-state="done"]')).toHaveCount(3);
    });

    test('第3章 4 ページ目: 各ステップで、来院の status と business_events の行が変わる', async ({ page }) => {
      await page.goto(beforeRecordPath);
      const figure = page.locator('[data-before-record-figure]');
      const { next, reset } = controls(figure);
      const tama = figure.locator('[data-row="tama"]');
      const pochi = figure.locator('[data-row="pochi"]');

      await next.click();
      await expect(tama.locator('.s-cancelled')).toBeVisible();
      await expect(pochi.locator('.s-reserved')).toBeVisible();
      await expect(figure.locator('.row-event')).toBeHidden();
      await expect(figure.locator('.point[data-state="current"]')).toHaveCount(1);

      await next.click();
      await expect(figure.locator('.point[data-state="done"]')).toHaveCount(1);
      await expect(figure.locator('.row-event')).toBeHidden();

      await next.click();
      await expect(pochi.locator('.s-cancelled')).toBeVisible();
      await expect(figure.locator('.row-event')).toBeVisible();
      await expect(figure.getByText('行がありません')).toBeHidden();

      await reset.click();
      await expect(tama.locator('.s-reserved')).toBeVisible();
      await expect(pochi.locator('.s-reserved')).toBeVisible();
      await expect(figure.getByText('行がありません')).toBeVisible();
    });
  });
}

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

const scrollers = (page: Page): Promise<string[]> =>
  page.evaluate(() => {
    const found: string[] = [];
    for (const element of document.querySelectorAll('.chapter-body *')) {
      const style = getComputedStyle(element);
      const scrolls = (value: string): boolean => value === 'auto' || value === 'scroll';
      const overflowsY = scrolls(style.overflowY) && element.scrollHeight - element.clientHeight > 1;
      const overflowsX = scrolls(style.overflowX) && element.scrollWidth - element.clientWidth > 1;
      if (overflowsY || overflowsX) found.push(`${element.tagName.toLowerCase()}.${[...element.classList].join('.')}`);
    }
    return found;
  });

type Route = { readonly name: string; readonly path: string; readonly steps: number; readonly fail?: true };

const routes: readonly Route[] = [
  { name: '図1 成功', path: transactionPath, steps: transactionSuccess.length },
  { name: '図1 失敗', path: transactionPath, steps: transactionFail.length, fail: true },
  { name: '図2', path: eventRowPath, steps: eventRowMessages.length },
  { name: '図3', path: beforeRecordPath, steps: beforeRecordMessages.length },
];

const openRoute = async (page: Page, route: Route): Promise<void> => {
  await page.goto(route.path);
  if (route.fail === true) await page.getByRole('button', { name: '記録に失敗する場合' }).click();
};

const eachStep = async (page: Page, route: Route, check: (step: number) => Promise<void>): Promise<void> => {
  const next = page.getByRole('button', { name: '次へ', exact: true });
  for (let step = 0; step < route.steps; step += 1) {
    await check(step);
    if (step < route.steps - 1) await next.click();
  }
};

test.describe('図解を含むページは全ステップで一画面に収まる', () => {
  for (const size of desktopSizes) {
    for (const route of routes) {
      test(`${route.name} ${size.width}x${size.height} でページ全体にも .chapter-body にもスクロールが出ない`, async ({ page }) => {
        await page.setViewportSize(size);
        await openRoute(page, route);
        const failures: string[] = [];
        await eachStep(page, route, async (step) => {
          const metrics = await measure(page);
          if (
            metrics.scrollHeight > metrics.innerHeight
            || metrics.scrollWidth > metrics.innerWidth
            || metrics.bodyScrollHeight > metrics.bodyClientHeight
          ) {
            failures.push(`step ${step}: ${JSON.stringify(metrics)}`);
          }
          for (const found of await scrollers(page)) failures.push(`step ${step}: 内部スクロール ${found}`);
        });
        expect(failures).toEqual([]);
      });
    }
  }

  for (const size of narrowSizes) {
    for (const route of routes) {
      test(`${route.name} ${size.width}x${size.height} で横スクロールが出ない`, async ({ page }) => {
        await page.setViewportSize(size);
        await openRoute(page, route);
        const failures: string[] = [];
        await eachStep(page, route, async (step) => {
          const metrics = await measure(page);
          if (metrics.scrollWidth > metrics.innerWidth) failures.push(`step ${step}: ${JSON.stringify(metrics)}`);
        });
        expect(failures).toEqual([]);
      });
    }
  }
});

test('図解のボタンにフォーカスがないときは、矢印キーで次のページへ移動する', async ({ page }) => {
  await page.goto(beforeRecordPath);
  await page.keyboard.press('ArrowLeft');
  await expect(page).toHaveURL(/\/chapters\/chapter-3\/3\/$/);
});
