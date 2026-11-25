import { expect, type Locator, type Page, test } from '@playwright/test';

const motions = ['no-preference', 'reduce'] as const;

type Size = { readonly width: number; readonly height: number };

const desktopSizes: readonly Size[] = [{ width: 1280, height: 640 }, { width: 1440, height: 790 }];
const narrowSizes: readonly Size[] = [
  { width: 1024, height: 768 },
  { width: 390, height: 844 },
  { width: 360, height: 640 },
];

const decisionPath = '/chapters/chapter-2/';
const mappingPath = '/chapters/chapter-2/3/';
const beforeRecordPath = '/chapters/chapter-3/4/';

const mappingRows = [
  { from: ['id'], column: 'event_id', value: '1', why: '1行を指し示すため' },
  { from: ['cancelled_at'], column: 'event_at', value: '2026-11-06T18:11:58.846Z', why: '「いつ」に答えるため' },
  { from: ['テーブルの名前'], column: 'event_name', value: 'VisitCancelled', why: '「何を」に答えるため' },
  {
    from: ['operated_by', 'reason'],
    column: 'payload',
    value: '{"reason":"飼い主の都合","operatedBy":"受付スタッフ"}',
    why: '「誰が」「なぜ」に答えるため',
  },
  { from: ['visit_id'], column: 'target_id', value: 'visit-pochi', why: '問い合わせの来院の記録を探すため' },
  { from: [], column: 'target_type', value: 'Visit', why: '来院以外の対象も同じテーブルに記録するため' },
  {
    from: [],
    column: 'target_state',
    value: '{"id":"visit-pochi","pet_name":"ポチ","status":"cancelled"}',
    why: 'その時点の状態を後から確かめるため',
  },
] as const;
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

    test('第2章 1 ページ目: 図はボタンが無く、呼び出し元から2つの書き込みまでを上から読める', async ({ page }) => {
      await page.goto(decisionPath);
      const figure = page.locator('[data-record-decision-figure]');

      await expect(figure.getByRole('button')).toHaveCount(0);
      await expect(figure.locator('.call')).toHaveText(
        'cancelVisit(db, { visitId: \'visit-pochi\', reason: \'飼い主の都合\', operatedBy: \'受付スタッフ\' })',
      );
      await expect(figure.locator('.call .mark')).toHaveText([
        'reason: \'飼い主の都合\'',
        'operatedBy: \'受付スタッフ\'',
      ]);
      await expect(figure.locator('.op-sql')).toHaveText(['UPDATE visits', 'INSERT INTO visit_cancellations']);

      const visits = figure.locator('[data-write="visits"]');
      await expect(visits.getByRole('term')).toHaveText(['id', 'pet_name', 'status']);
      await expect(visits.locator('.value')).toHaveText(['visit-pochi', 'ポチ', 'cancelled']);
      await expect(visits.locator('.before')).toHaveText('reserved');

      const record = figure.locator('[data-write="visit_cancellations"]');
      await expect(record.locator('dt > .mono')).toHaveText([
        'id',
        'visit_id',
        'cancelled_at',
        'operated_by',
        'reason',
      ]);
      await expect(record.locator('.value')).toHaveText([
        '1',
        'visit-pochi',
        '2026-11-06T18:11:58.846Z',
        '受付スタッフ',
        '飼い主の都合',
      ]);
      await expect(record.locator('.value.mark')).toHaveText(['受付スタッフ', '飼い主の都合']);
      await expect(record.locator('.badge:visible')).toHaveText(['いつ', '誰が', 'なぜ']);
    });

    test('第2章 1 ページ目: 図に、記録に成功する場合と失敗する場合の結果が並ぶ', async ({ page }) => {
      await page.goto(decisionPath);
      const figure = page.locator('[data-record-decision-figure]');
      const success = figure.locator('[data-outcome="success"]');
      const fail = figure.locator('[data-outcome="fail"]');

      await expect(success.locator('.stamp')).toHaveText('確定');
      await expect(success).toContainText('記録に成功する場合');
      await expect(success).toContainText('トランザクションを確定します。来院の更新と記録の両方が残ります。');
      await expect(fail.locator('.stamp')).toHaveText('取り消し');
      await expect(fail).toContainText('記録に失敗する場合');
      await expect(fail).toContainText('への記録が失敗すると、トランザクションを取り消します。');
      await expect(fail).toContainText(/visits の status は reserved に戻ります。/);

      const successBox = await success.boundingBox();
      const failBox = await fail.boundingBox();
      const frameBox = await figure.locator('.frame').boundingBox();
      expect(successBox !== null && failBox !== null && frameBox !== null).toBe(true);
      expect((successBox?.y ?? 0) >= (frameBox?.y ?? 0) + (frameBox?.height ?? 0)).toBe(true);
      expect(Math.abs((successBox?.y ?? 0) - (failBox?.y ?? 0)) < 1).toBe(true);
    });

    test('第2章 3 ページ目: 図はボタンが無く、テーブルを1つにまとめることと、列の対応を読める', async ({ page }) => {
      await page.goto(mappingPath);
      const figure = page.locator('[data-record-mapping-figure]');

      await expect(figure.getByRole('button')).toHaveCount(0);
      await expect(figure.locator('.side-head')).toHaveText(['出来事ごとにテーブルを作る', '1つのテーブルにまとめる']);
      await expect(figure.locator('.chip')).toHaveText([
        'visit_cancellations',
        '診察の完了を記録するテーブル',
        '…',
        'business_events',
      ]);

      const table = figure.getByRole('table', { name: 'ステップ1の列と business_events の列の対応' });
      await expect(table.getByRole('columnheader')).toHaveText(['ステップ1', 'business_events の列', '残す理由']);
      await expect(table.getByRole('row')).toHaveCount(mappingRows.length + 1);
      for (const expected of mappingRows) {
        const row = table.locator(`[data-column="${expected.column}"]`);
        if (expected.from.length === 0) await expect(row.locator('.none')).toHaveText('無し');
        else await expect(row.locator('.source')).toHaveText([...expected.from]);
        await expect(row.locator('.name')).toHaveText(expected.column);
        await expect(row.locator('.value')).toHaveText(expected.value);
        await expect(row.locator('.why')).toHaveText(expected.why);
      }
      await expect(table.locator('.name')).toHaveText(mappingRows.map((row) => row.column));
    });

    test('第2章 3 ページ目: ステップ1の列は business_events の列の左に並び、同じ行にある', async ({ page }) => {
      await page.goto(mappingPath);
      const figure = page.locator('[data-record-mapping-figure]');
      for (const expected of mappingRows) {
        const row = figure.locator(`[data-column="${expected.column}"]`);
        const from = await row.locator('.from').boundingBox();
        const to = await row.locator('.to').boundingBox();
        expect(from !== null && to !== null, expected.column).toBe(true);
        expect((from?.x ?? 0) + (from?.width ?? 0) <= (to?.x ?? 0) + 1, expected.column).toBe(true);
        const fromMiddle = (from?.y ?? 0) + (from?.height ?? 0) / 2;
        expect(fromMiddle >= (to?.y ?? 0) - 1, expected.column).toBe(true);
      }
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
      if (element.closest('[data-scenario] [role="tabpanel"][data-tool], [data-scenario] [data-feed]') !== null) {
        continue;
      }
      const style = getComputedStyle(element);
      const scrolls = (value: string): boolean => value === 'auto' || value === 'scroll';
      const overflowsY = scrolls(style.overflowY) && element.scrollHeight - element.clientHeight > 1;
      const overflowsX = scrolls(style.overflowX) && element.scrollWidth - element.clientWidth > 1;
      if (overflowsY || overflowsX) found.push(`${element.tagName.toLowerCase()}.${[...element.classList].join('.')}`);
    }
    return found;
  });

type Route = { readonly name: string; readonly path: string; readonly steps: number };

const routes: readonly Route[] = [
  { name: '図1', path: decisionPath, steps: 1 },
  { name: '図2', path: mappingPath, steps: 1 },
  { name: '図3', path: beforeRecordPath, steps: beforeRecordMessages.length },
];

const openRoute = async (page: Page, route: Route): Promise<void> => {
  await page.goto(route.path);
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

const staticFigures = [
  { name: '図1', path: decisionPath, selector: '[data-record-decision-figure]' },
  { name: '図2', path: mappingPath, selector: '[data-record-mapping-figure]' },
] as const;

const showDocument = async (page: Page): Promise<void> => {
  const documentTab = page.getByRole('tab', { name: /ADR/ });
  if ((await documentTab.getAttribute('aria-selected')) !== 'true') await documentTab.click();
};

test.describe('第2章の図は、ボタンを押さずに全体を読める', () => {
  for (const size of desktopSizes) {
    for (const item of staticFigures) {
      test(`${item.name} ${size.width}x${size.height} で、図の高さが文書の表示域に収まる`, async ({ page }) => {
        await page.setViewportSize(size);
        await page.goto(item.path);
        const heights = await page.locator(item.selector).evaluate((figure) => ({
          figure: figure.getBoundingClientRect().height,
          view: figure.closest('.doc-scroll')?.clientHeight ?? 0,
        }));
        expect(heights.view).toBeGreaterThan(0);
        expect(heights.figure).toBeLessThanOrEqual(heights.view);
      });
    }
  }

  for (const size of [...desktopSizes, ...narrowSizes]) {
    for (const item of staticFigures) {
      test(`${item.name} ${size.width}x${size.height} で、図の中身が図の幅からはみ出さない`, async ({ page }) => {
        await page.setViewportSize(size);
        await page.goto(item.path);
        await showDocument(page);
        const result = await page.locator(item.selector).evaluate((figure) => {
          const box = figure.getBoundingClientRect();
          const outside: string[] = [];
          for (const element of figure.querySelectorAll('*')) {
            const rect = element.getBoundingClientRect();
            if (rect.width === 0 && rect.height === 0) continue;
            if (rect.left < box.left - 1 || rect.right > box.right + 1) {
              outside.push(`${element.tagName.toLowerCase()}.${[...element.classList].join('.')}`);
            }
          }
          return { width: box.width, outside };
        });
        expect(result.width).toBeGreaterThan(0);
        expect(result.outside).toEqual([]);
      });
    }
  }
});

test('図解のボタンにフォーカスがないときは、矢印キーで次のページへ移動する', async ({ page }) => {
  await page.goto(beforeRecordPath);
  await page.keyboard.press('ArrowLeft');
  await expect(page).toHaveURL(/\/chapters\/chapter-3\/3\/$/);
});
