import { expect, type Locator, type Page, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const decisionTable = readFileSync(
  fileURLToPath(new URL('../exercises/chapter-4-decision-table.md', import.meta.url)),
  'utf8',
);

const patterns = [
  {
    name: '集計テーブル',
    done: 'chapter-4-summary-table-done',
    start: 'chapter-4-summary-table-start',
    script: 'why-this-count.ts',
    codePath: '/chapters/chapter-4/3/',
    sqlPath: '/chapters/chapter-4/5/',
    startSummary: 'pass 10 / fail 5',
  },
  {
    name: '外部システム同期',
    done: 'chapter-4-external-sync-done',
    start: 'chapter-4-external-sync-start',
    script: 'what-was-sent.ts',
    codePath: '/chapters/chapter-4/7/',
    sqlPath: '/chapters/chapter-4/9/',
    startSummary: 'pass 11 / fail 4',
  },
  {
    name: '既存の監査ログ',
    done: 'chapter-4-audit-log-done',
    start: 'chapter-4-audit-log-start',
    script: 'why-changed.ts',
    codePath: '/chapters/chapter-4/11/',
    sqlPath: '/chapters/chapter-4/13/',
    startSummary: 'pass 11 / fail 4',
  },
] as const;

const takeawayPath = '/chapters/chapter-4/17/';
const comparisonPath = '/chapters/chapter-4/14/';

const visible = (page: Page): Locator => page.locator('[data-playground]:not([hidden])');

const open = async (page: Page, path: string): Promise<Locator> => {
  await page.goto(path);
  const playground = visible(page);
  await expect(playground).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
  return playground;
};

const summary = (playground: Locator): Locator => playground.locator('[data-role="summary"]');

const runTests = async (playground: Locator): Promise<void> => {
  await playground.getByRole('button', { name: 'テストを実行する' }).click();
};

const replaceEditorText = async (playground: Locator, text: string): Promise<void> => {
  await playground.locator('.cm-content').click();
  await playground.page().keyboard.press('ControlOrMeta+a');
  await playground.page().keyboard.insertText(text);
};

const typeAtTop = async (playground: Locator, text: string): Promise<void> => {
  await playground.locator('.cm-content').click();
  await playground.page().keyboard.press('ControlOrMeta+Home');
  await playground.page().keyboard.type(text);
};

test.describe('第4章の完成コードの実行欄', () => {
  for (const pattern of patterns) {
    test(`${pattern.name}: テストが pass 15 / fail 0 になり、${pattern.script} の出力が出る`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 640 });
      const playground = await open(page, pattern.codePath);
      await expect(playground.getByRole('tab')).toHaveText([
        'visits.ts ',
        'db.ts （読み取りだけ）',
        'visits.test.ts （読み取りだけ）',
        `${pattern.script} （読み取りだけ）`,
      ]);
      await expect(playground.locator('.cm-content')).toContainText('export const cancelVisit');
      await expect.poll(() => playground.locator('.cm-scroller').evaluate((element) => element.scrollTop))
        .toBeGreaterThan(0);

      await runTests(playground);
      await expect(summary(playground)).toHaveText('pass 15 / fail 0');
      await playground.getByRole('button', { name: `${pattern.script} を実行する` }).click();
      await expect(playground.locator('.playground-log')).toContainText('(index)');

      const output = await playground.locator('[data-role="output"]').boundingBox();
      expect((output?.y ?? 0) + (output?.height ?? 0)).toBeLessThanOrEqual(640);
      expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)).toBe(true);
    });
  }

  test('集計テーブル: 確認用スクリプトの出力に recordedCount と recalculatedCount の差が出る', async ({ page }) => {
    const playground = await open(page, patterns[0].codePath);
    await playground.getByRole('button', { name: 'why-this-count.ts を実行する' }).click();
    const log = playground.locator('.playground-log');
    await expect(log).toContainText('recordedCount');
    await expect(log).toContainText('飼い主の都合');
    await expect(log).toContainText('来院前に回復したため');
  });

  test('外部システム同期: 確認用スクリプトの出力に sent、failed、unconfirmed が出る', async ({ page }) => {
    const playground = await open(page, patterns[1].codePath);
    await playground.getByRole('button', { name: 'what-was-sent.ts を実行する' }).click();
    const log = playground.locator('.playground-log');
    for (const text of ['sent', 'failed', 'unconfirmed', '送信先に接続できません']) {
      await expect(log).toContainText(text);
    }
  });

  test('既存の監査ログ: 確認用スクリプトの出力に auditLogId と理由が出る', async ({ page }) => {
    const playground = await open(page, patterns[2].codePath);
    await playground.getByRole('button', { name: 'why-changed.ts を実行する' }).click();
    const log = playground.locator('.playground-log');
    for (const text of ['auditLogId', 'VisitCancelled', '飼い主の都合', 'visit-3']) {
      await expect(log).toContainText(text);
    }
  });
});

test.describe('第4章の SQL の欄', () => {
  const results = (playground: Locator): Locator => playground.locator('[data-role="results"]');
  const rows = (playground: Locator): Locator => results(playground).locator('tbody tr');

  const count = async (playground: Locator, table: string, expected: string): Promise<void> => {
    await replaceEditorText(playground, `SELECT count(*) AS n FROM ${table}`);
    await playground.getByRole('button', { name: '実行する' }).click();
    await expect(results(playground).locator('tbody td')).toHaveText([expected]);
  };

  test('集計テーブル: 初期の SQL が daily_cancellation_counts と数え直した数を並べる', async ({ page }) => {
    const playground = await open(page, patterns[0].sqlPath);
    await playground.getByRole('button', { name: '実行する' }).click();
    await expect(results(playground).locator('thead th')).toHaveText([
      'visit_date',
      'recorded_count',
      'recalculated_count',
    ]);
    await expect(results(playground).locator('tbody td')).toHaveText(['2026-04-01', '3', '2']);
    await count(playground, 'daily_cancellation_counts', '1');
    await count(playground, 'business_events', '2');
  });

  test('外部システム同期: 初期の SQL が未確認の送信を 1 件返す', async ({ page }) => {
    const playground = await open(page, patterns[1].sqlPath);
    await playground.getByRole('button', { name: '実行する' }).click();
    await expect(results(playground).locator('thead th')).toHaveText(['visit_id', 'event_at', 'message']);
    await expect(rows(playground)).toHaveCount(1);
    await expect(rows(playground).locator('td').nth(0)).toHaveText('visit-3');
    await expect(rows(playground).locator('td').nth(2)).toContainText('コタロウ');
    await count(playground, 'business_events', '8');
  });

  test('既存の監査ログ: 初期の SQL が業務イベントの無い監査ログを 1 件返す', async ({ page }) => {
    const playground = await open(page, patterns[2].sqlPath);
    await playground.getByRole('button', { name: '実行する' }).click();
    await expect(results(playground).locator('thead th')).toHaveText([
      'audit_log_id',
      'row_id',
      'old_value',
      'new_value',
      'operated_by',
      'operated_at',
    ]);
    await expect(rows(playground)).toHaveCount(1);
    const cells = rows(playground).locator('td');
    await expect(cells.nth(0)).toHaveText('3');
    await expect(cells.nth(1)).toHaveText('visit-3');
    await expect(cells.nth(2)).toHaveText('reserved');
    await expect(cells.nth(3)).toHaveText('completed');
    await expect(cells.nth(4)).toHaveText('獣医師');
    await count(playground, 'audit_logs', '3');
    await count(playground, 'business_events', '2');
  });

  test('3 つの欄は保存する SQL の id が別で、互いの編集を持ち込まない', async ({ page }) => {
    const first = await open(page, patterns[0].sqlPath);
    await replaceEditorText(first, 'SELECT 1 AS only_in_summary_table');
    const keys = await page.evaluate(() => Object.keys(window.localStorage));
    expect(keys).toEqual(['es-patchwork-hands-on:sql:chapter-4-summary-table']);
    const second = await open(page, patterns[1].sqlPath);
    await expect(second.locator('.cm-content')).not.toContainText('only_in_summary_table');
  });
});

test.describe('第4章の判断表の比較', () => {
  const comparison = decisionTable.split(/^## /m).find((part) => part.startsWith('比較\n')) ?? '';
  const tableRows = comparison.split('\n').filter((line) => line.startsWith('|')).map((line) =>
    line.split('|').slice(1, -1).map((cell) => cell.trim().replaceAll('`', ''))
  );
  const [header = [], ...body] = tableRows.filter((_, index) => index !== 1);

  test('判断表の Markdown から軸が 5 つ読める', () => {
    expect(header).toHaveLength(4);
    expect(body).toHaveLength(5);
  });

  test('ボタンが 5 つの軸の名前そのままで並び、最初は 1 つ目の軸だけが表に出る', async ({ page }) => {
    await page.goto(comparisonPath);
    const buttons = page.locator('[data-axis]');
    await expect(buttons).toHaveText(body.map((row) => row[0] ?? ''));
    await expect(buttons.nth(0)).toHaveAttribute('aria-pressed', 'true');
    for (const index of [1, 2, 3, 4]) {
      await expect(buttons.nth(index)).toHaveAttribute('aria-pressed', 'false');
    }
    await expect(page.locator('tbody tr:visible')).toHaveCount(1);
    await expect(page.locator('tbody tr:visible td').first()).toHaveText(body[0]?.[0] ?? '');
  });

  for (const [index, row] of body.entries()) {
    test(`${index + 1} つ目の軸「${row[0]}」を選ぶと、その軸の行だけが 3 つのパターンの列で出る`, async ({ page }) => {
      await page.goto(comparisonPath);
      await page.locator('[data-axis]').nth(index).click();
      await expect(page.locator('[data-axis]').nth(index)).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('[data-axis][aria-pressed="true"]')).toHaveCount(1);
      await expect(page.locator('thead th')).toHaveText(header);
      await expect(page.locator('tbody tr:visible')).toHaveCount(1);
      await expect(page.locator('tbody tr:visible td')).toHaveText(row);
    });
  }

  test('JavaScript が無いときは、5 つの軸の行がすべて読め、切り替えのボタンは出ない', async ({ browser, baseURL }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
    const page = await context.newPage();
    await page.goto(comparisonPath);
    await expect(page.locator('tbody tr:visible')).toHaveCount(5);
    await expect(page.locator('.axis-buttons')).toBeHidden();
    for (const row of body) {
      await expect(page.getByRole('cell', { name: row[0] ?? '', exact: true })).toBeVisible();
    }
    await context.close();
  });
});

test.describe('第4章の持ち帰りの演習', () => {
  const switcher = (page: Page): Locator => page.getByRole('group', { name: 'パターン' });

  const choose = async (page: Page, name: string): Promise<Locator> => {
    await switcher(page).getByRole('button', { name }).click();
    const playground = visible(page);
    await expect(playground).toHaveCount(1);
    await expect(playground).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
    return playground;
  };

  test('最初は集計テーブルの開始のコードだけが出て、3 つのボタンで切り替えられる', async ({ page }) => {
    await open(page, takeawayPath);
    await expect(switcher(page).getByRole('button')).toHaveText([
      '集計テーブル（chapter-4-summary-table-start）',
      '外部システム同期（chapter-4-external-sync-start）',
      '既存の監査ログ（chapter-4-audit-log-start）',
    ]);
    await expect(visible(page)).toHaveCount(1);
    await expect(page.locator('[data-playground]')).toHaveCount(3);
    await expect(visible(page).locator('.cm-content')).toContainText('explainCancellationCount');
  });

  for (const pattern of patterns) {
    test(`${pattern.name}: 開始は ${pattern.startSummary}、完成コードを読み込むと pass 15 / fail 0 になる`, async ({ page }) => {
      await open(page, takeawayPath);
      const playground = await choose(page, pattern.name);
      await expect(playground.getByRole('tab', { name: /visits\.ts/ }).first()).toHaveAttribute(
        'aria-selected',
        'true',
      );
      await runTests(playground);
      await expect(summary(playground)).toHaveText(pattern.startSummary);
      await playground.getByRole('button', { name: pattern.script + ' を実行する' }).click();
      await expect(playground.locator('[data-role="output"]')).not.toContainText('実行しています');
      await playground.getByRole('button', { name: '完成コードを読み込む' }).click();
      await runTests(playground);
      await expect(summary(playground)).toHaveText('pass 15 / fail 0');
      await playground.getByRole('button', { name: pattern.script + ' を実行する' }).click();
      await expect(playground.locator('.playground-log')).toContainText('(index)');
    });
  }

  test('3 つのパターンの編集内容は別々に保存し、混ざらない', async ({ page }) => {
    test.setTimeout(90_000);
    await open(page, takeawayPath);
    await typeAtTop(visible(page), '// 集計の編集 ');
    const external = await choose(page, '外部システム同期');
    await expect(external.locator('.cm-content')).not.toContainText('集計の編集');
    await typeAtTop(external, '// 外部の編集 ');
    const audit = await choose(page, '既存の監査ログ');
    await expect(audit.locator('.cm-content')).not.toContainText('集計の編集');
    await expect(audit.locator('.cm-content')).not.toContainText('外部の編集');
    await typeAtTop(audit, '// 監査の編集 ');

    const stored = await page.evaluate(() =>
      Object.fromEntries(Object.entries(window.localStorage).map(([key, value]) => [key, value]))
    );
    expect(Object.keys(stored).sort()).toEqual([
      'es-patchwork-hands-on:code:chapter-4-audit-log-start',
      'es-patchwork-hands-on:code:chapter-4-external-sync-start',
      'es-patchwork-hands-on:code:chapter-4-summary-table-start',
    ]);
    expect(stored['es-patchwork-hands-on:code:chapter-4-summary-table-start']).toContain('集計の編集');
    expect(stored['es-patchwork-hands-on:code:chapter-4-summary-table-start']).not.toContain('外部の編集');
    expect(stored['es-patchwork-hands-on:code:chapter-4-external-sync-start']).toContain('外部の編集');
    expect(stored['es-patchwork-hands-on:code:chapter-4-external-sync-start']).not.toContain('監査の編集');
    expect(stored['es-patchwork-hands-on:code:chapter-4-audit-log-start']).toContain('監査の編集');
    expect(stored['es-patchwork-hands-on:code:chapter-4-audit-log-start']).not.toContain('集計の編集');

    await page.reload();
    await expect(visible(page)).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
    await expect(visible(page).locator('.cm-content')).toContainText('集計の編集');
    const reloadedExternal = await choose(page, '外部システム同期');
    await expect(reloadedExternal.locator('.cm-content')).toContainText('外部の編集');
    await expect(reloadedExternal.locator('.cm-content')).not.toContainText('集計の編集');
  });

  test('1280x640 でページ全体にスクロールが出ない', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 640 });
    await open(page, takeawayPath);
    for (const name of ['外部システム同期', '既存の監査ログ', '集計テーブル']) {
      const playground = await choose(page, name);
      await runTests(playground);
      await expect(summary(playground)).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)).toBe(true);
    }
  });
});
