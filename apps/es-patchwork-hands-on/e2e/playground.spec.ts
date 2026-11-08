import { expect, type Locator, type Page, test } from '@playwright/test';

const checkPath = '/playground-check/';

const sqlBox = (page: Page): Locator => page.locator('[data-playground="sql"]');
const codeBox = (page: Page, index: number): Locator => page.locator('[data-playground="code"]').nth(index);

const waitUntilReady = async (box: Locator): Promise<void> => {
  await expect(box).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
};

const openCheckPage = async (page: Page): Promise<void> => {
  await page.goto(checkPath);
  await waitUntilReady(sqlBox(page));
  await waitUntilReady(codeBox(page, 0));
  await waitUntilReady(codeBox(page, 1));
};

const replaceEditorText = async (box: Locator, text: string): Promise<void> => {
  await box.locator('.cm-content').click();
  await box.page().keyboard.press('ControlOrMeta+a');
  await box.page().keyboard.type(text);
};

const runSql = async (page: Page, sql: string): Promise<void> => {
  const box = sqlBox(page);
  await replaceEditorText(box, sql);
  await box.getByRole('button', { name: '実行する' }).click();
};

const results = (page: Page): Locator => sqlBox(page).locator('[data-role="results"]');

const hasHorizontalScroll = (page: Page): Promise<boolean> =>
  page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);

test.describe('SQL の実行欄', () => {
  test('SELECT の結果を表で表示する', async ({ page }) => {
    await openCheckPage(page);
    await runSql(page, 'SELECT id, pet_name, status FROM visits ORDER BY id');
    const table = results(page).locator('table');
    await expect(table.locator('thead th')).toHaveText(['id', 'pet_name', 'status']);
    await expect(table.locator('tbody tr')).toHaveCount(2);
    await expect(table.locator('tbody tr').first()).toContainText('visit-pochi');
    await expect(results(page)).toContainText('2 行');
  });

  test('複数の文を実行し、文ごとの結果を表示する', async ({ page }) => {
    await openCheckPage(page);
    await runSql(
      page,
      'INSERT INTO visits VALUES (\'visit-mike\', \'ミケ\', \'reserved\'); UPDATE visits SET status = \'cancelled\' WHERE id <> \'none\'; SELECT count(*) AS n FROM visits',
    );
    const items = results(page).locator('.playground-result');
    await expect(items).toHaveCount(3);
    await expect(items.nth(0)).toContainText('1 行を変更しました');
    await expect(items.nth(1)).toContainText('3 行を変更しました');
    await expect(items.nth(2).locator('tbody td')).toHaveText(['3']);
  });

  test('NULL は NULL と表示する', async ({ page }) => {
    await openCheckPage(page);
    await runSql(page, 'SELECT NULL AS empty');
    await expect(results(page).locator('tbody td')).toHaveText(['NULL']);
  });

  test('BEGIN の次の実行で ROLLBACK できる', async ({ page }) => {
    await openCheckPage(page);
    await runSql(page, 'BEGIN; UPDATE visits SET status = \'completed\'');
    await expect(results(page)).toContainText('2 行を変更しました');
    await runSql(page, 'SELECT status FROM visits ORDER BY id');
    await expect(results(page).locator('tbody td')).toHaveText(['completed', 'completed']);
    await runSql(page, 'ROLLBACK');
    await expect(results(page)).toContainText('実行しました');
    await runSql(page, 'SELECT status FROM visits ORDER BY id');
    await expect(results(page).locator('tbody td')).toHaveText(['reserved', 'cancelled']);
  });

  test('エラーは SQLite のメッセージのまま表示し、その後も実行できる', async ({ page }) => {
    await openCheckPage(page);
    await runSql(page, 'SELEC 1');
    await expect(results(page).getByRole('alert')).toContainText('near "SELEC": syntax error');
    await runSql(page, 'INSERT INTO visits VALUES (\'x\', \'y\', \'bogus\')');
    await expect(results(page).getByRole('alert')).toContainText('CHECK constraint failed');
    await runSql(page, 'SELECT 1 AS one');
    await expect(results(page).locator('tbody td')).toHaveText(['1']);
    await expect(results(page).getByRole('alert')).toHaveCount(0);
  });

  test('エラーの前に成功した文の結果は残る', async ({ page }) => {
    await openCheckPage(page);
    await runSql(page, 'SELECT 1 AS one; SELECT * FROM missing_table');
    await expect(results(page).locator('tbody td')).toHaveText(['1']);
    await expect(results(page).getByRole('alert')).toContainText('no such table: missing_table');
  });

  test('データベースを最初の状態に戻せる', async ({ page }) => {
    await openCheckPage(page);
    await runSql(page, 'DELETE FROM visits');
    await expect(results(page)).toContainText('2 行を変更しました');
    await sqlBox(page).getByRole('button', { name: 'データベースを最初の状態に戻す' }).click();
    await expect(results(page)).toContainText('データベースを最初の状態に戻しました');
    await runSql(page, 'SELECT count(*) AS n FROM visits');
    await expect(results(page).locator('tbody td')).toHaveText(['2']);
  });

  for (const shortcut of ['Control+Enter', 'Meta+Enter']) {
    test(`${shortcut} で実行できる`, async ({ page }) => {
      await openCheckPage(page);
      await replaceEditorText(sqlBox(page), 'SELECT 7 AS seven');
      await page.keyboard.press(shortcut);
      await expect(results(page).locator('tbody td')).toHaveText(['7']);
    });
  }

  test('Tab キーでエディタから抜けられる', async ({ page }) => {
    await openCheckPage(page);
    await sqlBox(page).locator('.cm-content').click();
    await page.keyboard.press('Tab');
    const stillInEditor = await page.evaluate(() => document.activeElement?.closest('.cm-editor') !== null);
    expect(stillInEditor).toBe(false);
  });

  test('列と行が多い結果は欄の中でスクロールし、ページを押し広げない', async ({ page }) => {
    await openCheckPage(page);
    const before = await page.evaluate(() => document.documentElement.scrollHeight);
    const columns = Array.from({ length: 30 }, (_, index) => `n * ${index + 1} AS long_column_name_${index + 1}`)
      .join(', ');
    await runSql(
      page,
      `WITH RECURSIVE c(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM c WHERE n < 300) SELECT ${columns} FROM c`,
    );
    await expect(results(page).locator('tbody tr')).toHaveCount(300);
    const metrics = await results(page).evaluate((element) => ({
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
      scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight,
    }));
    expect(metrics.scrollWidth).toBeGreaterThan(metrics.clientWidth);
    expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight);
    expect(metrics.clientHeight).toBeLessThanOrEqual(400);
    expect(await hasHorizontalScroll(page)).toBe(false);
    const after = await page.evaluate(() => document.documentElement.scrollHeight);
    expect(after - before).toBeLessThanOrEqual(420);
  });
});

test.describe('コードの実行欄', () => {
  test('第1章の開始時点のテストは pass 4 / fail 4 になる', async ({ page }) => {
    await openCheckPage(page);
    const box = codeBox(page, 0);
    await box.getByRole('button', { name: 'テストを実行する' }).click();
    await expect(box.locator('[data-role="summary"]')).toHaveText('pass 4 / fail 4');
    const failures = box.locator('.playground-failures li');
    await expect(failures).toHaveCount(4);
    await expect(failures.first()).toContainText('来院をキャンセルすると、来院キャンセルの記録が1行残る');
    await expect(failures.first()).toContainText('来院キャンセルの記録がありません');
  });

  test('確認用スクリプトの出力を表示する', async ({ page }) => {
    await openCheckPage(page);
    const box = codeBox(page, 0);
    await box.getByRole('button', { name: 'show-visits.ts を実行する' }).click();
    await expect(box.locator('.playground-log')).toContainText('visit-pochi');
    await expect(box.locator('.playground-log')).toContainText('cancelled');
  });

  test('読み取りだけのファイルは編集できない', async ({ page }) => {
    await openCheckPage(page);
    const box = codeBox(page, 0);
    await box.getByRole('tab', { name: /db\.ts/ }).click();
    await box.locator('.cm-content').click();
    const before = await box.locator('.cm-content').innerText();
    await page.keyboard.type('x');
    expect(await box.locator('.cm-content').innerText()).toBe(before);
  });

  test('編集すると結果が変わり、再読み込みの後も残り、最初のコードに戻せる', async ({ page }) => {
    await openCheckPage(page);
    const box = codeBox(page, 0);
    const insertBrokenLine = async (): Promise<void> => {
      await box.locator('.cm-content').click();
      await page.keyboard.press('ControlOrMeta+Home');
      for (let line = 0; line < 4; line += 1) {
        await page.keyboard.press('ArrowDown');
      }
      await expect(box.locator('.cm-activeLine')).toContainText('INSERT INTO visits');
      await page.keyboard.press('Home');
      await page.keyboard.type('throw new Error(\'broken\'); ');
    };
    await insertBrokenLine();
    await box.getByRole('button', { name: 'テストを実行する' }).click();
    await expect(box.locator('[data-role="summary"]')).toHaveText('pass 0 / fail 8');

    await page.reload();
    await waitUntilReady(codeBox(page, 0));
    await expect(codeBox(page, 0).locator('.cm-content')).toContainText('broken');
    await codeBox(page, 0).getByRole('button', { name: 'テストを実行する' }).click();
    await expect(codeBox(page, 0).locator('[data-role="summary"]')).toHaveText('pass 0 / fail 8');

    await codeBox(page, 0).getByRole('button', { name: '最初のコードに戻す' }).click();
    await expect(codeBox(page, 0).locator('.cm-content')).not.toContainText('broken');
    await codeBox(page, 0).getByRole('button', { name: 'テストを実行する' }).click();
    await expect(codeBox(page, 0).locator('[data-role="summary"]')).toHaveText('pass 4 / fail 4');

    await page.reload();
    await waitUntilReady(codeBox(page, 0));
    await expect(codeBox(page, 0).locator('.cm-content')).not.toContainText('broken');
  });

  test('編集内容は演習ごとに別のキーで保存する', async ({ page }) => {
    await openCheckPage(page);
    const box = codeBox(page, 0);
    await box.locator('.cm-content').click();
    await page.keyboard.press('ControlOrMeta+Home');
    await page.keyboard.type('// first ');
    const keys = await page.evaluate(() => Object.keys(window.localStorage));
    expect(keys).toEqual(['es-patchwork-hands-on:code:chapter-1-start']);
    await expect(codeBox(page, 1).locator('.cm-content')).not.toContainText('// first');
  });

  test('完成コードを読み込むと、テストがすべて成功する', async ({ page }) => {
    await openCheckPage(page);
    const box = codeBox(page, 0);
    await box.getByRole('button', { name: '完成コードを読み込む' }).click();
    await box.getByRole('button', { name: 'テストを実行する' }).click();
    await expect(box.locator('[data-role="summary"]')).toHaveText('pass 8 / fail 0');
  });

  test('第4章の外部システムとの同期の完成コードは全テストが成功する', async ({ page }) => {
    await openCheckPage(page);
    const box = codeBox(page, 1);
    await box.getByRole('button', { name: 'テストを実行する' }).click();
    await expect(box.locator('[data-role="summary"]')).toHaveText('pass 15 / fail 0');
    await box.getByRole('button', { name: 'what-was-sent.ts を実行する' }).click();
    await expect(box.locator('.playground-log')).toContainText('unconfirmed');
    await expect(box.locator('.playground-log')).toContainText('送信先に接続できません');
  });

  test('終わらない繰り返しは 5 秒で止まり、その後も実行できる', async ({ page }) => {
    test.setTimeout(60_000);
    await openCheckPage(page);
    const box = codeBox(page, 0);
    await box.locator('.cm-content').click();
    await page.keyboard.press('ControlOrMeta+Home');
    for (let line = 0; line < 4; line += 1) {
      await page.keyboard.press('ArrowDown');
    }
    await page.keyboard.press('Home');
    await page.keyboard.type('while (true) {} ');
    const startedAt = Date.now();
    await box.getByRole('button', { name: 'テストを実行する' }).click();

    await codeBox(page, 1).getByRole('tab', { name: /visits\.test\.ts/ }).click();
    await expect(codeBox(page, 1).getByRole('tab', { name: /visits\.test\.ts/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(box.getByRole('alert')).toContainText('実行に 5 秒以上かかったため、途中で止めました', {
      timeout: 20_000,
    });
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(4500);

    await waitUntilReady(box);
    await box.getByRole('button', { name: '最初のコードに戻す' }).click();
    await box.getByRole('button', { name: 'テストを実行する' }).click();
    await expect(box.locator('[data-role="summary"]')).toHaveText('pass 4 / fail 4');
  });

  test('SQL の実行が 5 秒を超えると止め、データベースを最初の状態に戻す', async ({ page }) => {
    test.setTimeout(60_000);
    await openCheckPage(page);
    await runSql(page, 'DELETE FROM visits');
    await expect(results(page)).toContainText('2 行を変更しました');
    await runSql(
      page,
      'WITH RECURSIVE c(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM c) SELECT count(*) FROM c',
    );
    await expect(results(page).getByRole('alert')).toContainText('実行に 5 秒以上かかったため、途中で止めました', {
      timeout: 20_000,
    });
    await waitUntilReady(sqlBox(page));
    await runSql(page, 'SELECT count(*) AS n FROM visits');
    await expect(results(page).locator('tbody td')).toHaveText(['2']);
  });

  test('localStorage が使えなくても例外を出さずに動く', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        get() {
          throw new DOMException('denied', 'SecurityError');
        },
      });
    });
    await openCheckPage(page);
    const box = codeBox(page, 0);
    await box.locator('.cm-content').click();
    await page.keyboard.press('ControlOrMeta+Home');
    await page.keyboard.type('// edit ');
    await box.getByRole('button', { name: 'テストを実行する' }).click();
    await expect(box.locator('[data-role="summary"]')).toHaveText('pass 4 / fail 4');
    await box.getByRole('button', { name: '最初のコードに戻す' }).click();
    expect(errors).toEqual([]);
  });
});

test.describe('読み込みの失敗', () => {
  test('wasm の読み込みに失敗すると表示が出て、もう一度読み込むと動く', async ({ page, context }) => {
    await context.route('**/*.wasm', (route) => route.abort());
    await page.goto(checkPath);
    const box = sqlBox(page);
    await expect(box).toHaveAttribute('data-state', 'failed', { timeout: 30_000 });
    await expect(box.getByText('実行環境を読み込めませんでした')).toBeVisible();
    await expect(box.getByRole('button', { name: '実行する' })).toBeDisabled();

    await context.unroute('**/*.wasm');
    await box.getByRole('button', { name: 'もう一度読み込む' }).click();
    await waitUntilReady(box);
    await expect(box.getByText('実行環境を読み込めませんでした')).toBeHidden();
    await runSql(page, 'SELECT 1 AS one');
    await expect(results(page).locator('tbody td')).toHaveText(['1']);
  });

  test('読み込みの間は読み込み中の表示を出す', async ({ page, context }) => {
    await context.route('**/*.wasm', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await route.continue();
    });
    await page.goto(checkPath);
    await expect(sqlBox(page).getByText('実行環境を読み込んでいます')).toBeVisible();
    await waitUntilReady(sqlBox(page));
    await expect(sqlBox(page).getByText('実行環境を読み込んでいます')).toBeHidden();
  });
});

test.describe('矢印キー', () => {
  test('エディタの中で左右の矢印キーを押してもページは移動しない', async ({ page }) => {
    await openCheckPage(page);
    await sqlBox(page).locator('.cm-content').click();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowLeft');
    expect(new URL(page.url()).pathname).toBe(checkPath);

    const box = codeBox(page, 0);
    await box.getByRole('tab', { name: /db\.ts/ }).click();
    await box.locator('.cm-content').click();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowLeft');
    expect(new URL(page.url()).pathname).toBe(checkPath);
  });

  test('エディタの外では矢印キーでページが移動する', async ({ page }) => {
    await openCheckPage(page);
    await page.locator('h1').click();
    await page.keyboard.press('ArrowRight');
    await expect(page).toHaveURL(/\/setup\/$/);
  });
});

test.describe('幅 360 のとき', () => {
  test.use({ viewport: { width: 360, height: 640 } });

  test('横にはみ出さない', async ({ page }) => {
    await openCheckPage(page);
    expect(await hasHorizontalScroll(page)).toBe(false);
    const columns = Array.from({ length: 20 }, (_, index) => `'long text value number ${index + 1}' AS c${index + 1}`)
      .join(', ');
    await runSql(page, `SELECT ${columns}`);
    await expect(results(page).locator('tbody tr')).toHaveCount(1);
    expect(await hasHorizontalScroll(page)).toBe(false);
    await codeBox(page, 0).getByRole('button', { name: 'テストを実行する' }).click();
    await expect(codeBox(page, 0).locator('[data-role="summary"]')).toHaveText('pass 4 / fail 4');
    expect(await hasHorizontalScroll(page)).toBe(false);
  });
});
