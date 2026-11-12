import { expect, type Locator, type Page, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const exercise = (snapshot: string, file: string): string =>
  readFileSync(fileURLToPath(new URL(`../exercises/${snapshot}/${file}`, import.meta.url)), 'utf8');

const storageKey = 'es-patchwork-hands-on:code:chapter-1-start';

const box = (page: Page): Locator => page.locator('[data-playground]').first();

const open = async (page: Page, path: string): Promise<Locator> => {
  await page.goto(path);
  const playground = box(page);
  await expect(playground).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
  return playground;
};

const scene = (page: Page): Locator => page.locator('[data-play="add-record"]');

const openScene = async (page: Page, path: string): Promise<Locator> => {
  await page.goto(path);
  const play = scene(page);
  await expect(play).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
  return play;
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

const cancelVisitFrom = (snapshot: string): string => exercise(snapshot, 'visits.ts');

const cancelVisitOf = (snapshot: string): string => {
  const lines = cancelVisitFrom(snapshot).split('\n');
  const start = lines.findIndex((line) => line.startsWith('export const cancelVisit ='));
  const end = lines.findIndex((line, index) => index > start && line === '};');
  return lines.slice(start, end + 1).join('\n');
};

test.describe('第1章', () => {
  test('show-visits.ts をボタンで実行すると、visits の行が出る', async ({ page }) => {
    const playground = await open(page, '/chapters/chapter-1/');
    await playground.getByRole('button', { name: 'show-visits.ts を実行する' }).click();
    await expect(playground.locator('.playground-log')).toContainText('visit-pochi');
    await expect(playground.locator('.playground-log')).toContainText('visit-tama');
    await expect(playground.locator('.playground-log')).toContainText('cancelled');
  });

  test('visits テーブルに SQL を書いて実行できる。初期のデータは show-visits.ts の実行後と同じ', async ({ page }) => {
    const playground = await open(page, '/chapters/chapter-1/3/');
    const results = playground.locator('[data-role="results"]');
    await playground.getByRole('button', { name: '実行する' }).click();
    await expect(results.locator('thead th')).toHaveText(['id', 'pet_name', 'status']);
    await expect(results.locator('tbody tr')).toHaveCount(2);
    await expect(results.locator('tbody tr').nth(0)).toContainText('visit-pochi');
    await expect(results.locator('tbody tr').nth(0)).toContainText('cancelled');
    await expect(results.locator('tbody tr').nth(1)).toContainText('visit-tama');
    await replaceEditorText(playground, 'SELECT count(*) AS n FROM visits WHERE status = \'cancelled\'');
    await playground.getByRole('button', { name: '実行する' }).click();
    await expect(results.locator('tbody td')).toHaveText(['2']);
  });

  test('テストを実行すると pass 4 / fail 4 になる', async ({ page }) => {
    const playground = await open(page, '/chapters/chapter-1/5/');
    await runTests(playground);
    await expect(summary(playground)).toHaveText('pass 4 / fail 4');
  });

  test('第2章で編集した内容は、第1章のテストに影響しない', async ({ page }) => {
    await page.addInitScript(([key, value]) => {
      window.localStorage.setItem(key ?? '', JSON.stringify({ 'visits.ts': value }));
    }, [storageKey, cancelVisitFrom('chapter-2-step-2')]);
    const playground = await open(page, '/chapters/chapter-1/5/');
    await runTests(playground);
    await expect(summary(playground)).toHaveText('pass 4 / fail 4');
  });
});

test.describe('第2章', () => {
  test('記録を失敗させても status は更新前のまま', async ({ page }) => {
    const playground = await open(page, '/chapters/chapter-2/2/');
    await playground.getByRole('button', { name: '記録を失敗させて実行する' }).click();
    const log = playground.locator('.playground-log');
    await expect(log).toContainText('実行の前: status = reserved');
    await expect(log).toContainText('cancelVisit は失敗しました: 記録に失敗しました');
    await expect(log).toContainText('実行の後: status = reserved');
  });

  test('場面でステップ1とステップ2を進め、ページを移動しても編集内容が残る', async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1280, height: 640 });
    const stepOne = await openScene(page, '/chapters/chapter-2/4/');
    await expect(stepOne.locator('.cm-content')).toContainText('export const cancelVisit');
    await runTests(stepOne);
    await expect(summary(stepOne)).toHaveText('pass 4 / fail 4');

    await stepOne.getByRole('button', { name: 'ステップ1の完成コードを読み込む' }).click();
    await runTests(stepOne);
    await expect(summary(stepOne)).toHaveText('pass 7 / fail 1');

    await page.getByRole('link', { name: /次へ/ }).click();
    await expect(page).toHaveURL(/\/chapters\/chapter-2\/5\/$/);
    const stepTwo = scene(page);
    await expect(stepTwo).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
    await expect(stepTwo.locator('.cm-content')).toContainText('VisitCancelled');
    await runTests(stepTwo);
    await expect(summary(stepTwo)).toHaveText('pass 7 / fail 1');

    await replaceEditorText(stepTwo, cancelVisitOf('chapter-2-step-2'));
    await runTests(stepTwo);
    await expect(summary(stepTwo)).toHaveText('pass 8 / fail 0');

    await page.getByRole('link', { name: /前へ/ }).click();
    await expect(page).toHaveURL(/\/chapters\/chapter-2\/4\/$/);
    await expect(scene(page)).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
    await expect(scene(page).locator('.cm-content')).toContainText('operatedBy');
    await runTests(scene(page));
    await expect(summary(scene(page))).toHaveText('pass 8 / fail 0');
  });

  test('完成コードを読み込むボタンで、ステップ1は pass 7 / fail 1、ステップ2は pass 8 / fail 0 になる', async ({ page }) => {
    const stepOne = await openScene(page, '/chapters/chapter-2/4/');
    await stepOne.getByRole('button', { name: 'ステップ1の完成コードを読み込む' }).click();
    await runTests(stepOne);
    await expect(summary(stepOne)).toHaveText('pass 7 / fail 1');

    const stepTwo = await openScene(page, '/chapters/chapter-2/5/');
    await expect(stepTwo.locator('.cm-content')).toContainText('VisitCancelled');
    await stepTwo.getByRole('button', { name: 'ステップ2の完成コードを読み込む' }).click();
    await runTests(stepTwo);
    await expect(summary(stepTwo)).toHaveText('pass 8 / fail 0');
  });

  test('場面でコードを保存するたびに、第3章が読む chapter-1-start の保存キーにファイル全体を書く', async ({ page }) => {
    const stepTwo = await openScene(page, '/chapters/chapter-2/5/');
    const stored = (): Promise<string | null> => page.evaluate((key) => window.localStorage.getItem(key), storageKey);
    expect(await stored()).toBeNull();

    await stepTwo.getByRole('button', { name: 'ステップ2の完成コードを読み込む' }).click();
    await expect.poll(stored).toBe(JSON.stringify({ 'visits.ts': cancelVisitFrom('chapter-2-step-2') }));

    await stepTwo.getByRole('button', { name: 'ステップ1の完成コードを読み込む' }).click();
    await expect.poll(stored).toBe(JSON.stringify({ 'visits.ts': cancelVisitFrom('chapter-2-step-1') }));

    await stepTwo.getByRole('button', { name: '最初のコードに戻す' }).click();
    await expect.poll(stored).toBeNull();
  });
});

test.describe('第3章', () => {
  const rows = (playground: Locator): Locator => playground.locator('[data-role="results"] tbody tr');

  const expectAnswer = async (playground: Locator): Promise<void> => {
    await playground.getByRole('button', { name: '実行する' }).click();
    await expect(playground.locator('[data-role="results"] thead th')).toHaveText([
      'id',
      'status',
      'event_at',
      'event_name',
      'operated_by',
      'reason',
    ]);
    await expect(rows(playground)).toHaveCount(2);
    const pochi = rows(playground).nth(0).locator('td');
    await expect(pochi.nth(0)).toHaveText('visit-pochi');
    await expect(pochi.nth(3)).toHaveText('VisitCancelled');
    await expect(pochi.nth(4)).toHaveText('受付スタッフ');
    await expect(pochi.nth(5)).toHaveText('飼い主の都合');
    const tama = rows(playground).nth(1).locator('td');
    await expect(tama.nth(0)).toHaveText('visit-tama');
    for (const index of [2, 3, 4, 5]) {
      await expect(tama.nth(index)).toHaveText('NULL');
    }
  };

  test('保存が無いとき、ステップ2の完成コードで作ったデータベースに JOIN の SQL を実行できる', async ({ page }) => {
    const playground = await open(page, '/chapters/chapter-3/');
    await expect(playground.locator('[data-role="origin"]')).toHaveText(
      '第2章で書いた visits.ts が保存されていないので、ステップ2の完成コードでこのデータベースを作りました。',
    );
    await expectAnswer(playground);
  });

  test('第2章で書いた visits.ts のテストがすべて成功すると、そのコードで作る', async ({ page }) => {
    const stepTwo = await openScene(page, '/chapters/chapter-2/5/');
    await stepTwo.getByRole('button', { name: 'ステップ2の完成コードを読み込む' }).click();
    const playground = await open(page, '/chapters/chapter-3/');
    await expect(playground.locator('[data-role="origin"]')).toHaveText(
      '第2章で書いた visits.ts で、このデータベースを作りました。',
    );
    await expectAnswer(playground);
  });

  test('場面で書いたステップ1のコードはテストが成功しきらないので、ステップ2の完成コードで作る', async ({ page }) => {
    const stepOne = await openScene(page, '/chapters/chapter-2/4/');
    await stepOne.getByRole('button', { name: 'ステップ1の完成コードを読み込む' }).click();
    const playground = await open(page, '/chapters/chapter-3/');
    await expect(playground.locator('[data-role="origin"]')).toHaveText(
      '第2章で書いた visits.ts は全部のテストに成功していないので、ステップ2の完成コードでこのデータベースを作りました。',
    );
    await expectAnswer(playground);
  });

  test('第2章で書いた visits.ts のテストが成功しきらないときは、ステップ2の完成コードで作る', async ({ page }) => {
    await page.addInitScript(([key, value]) => {
      window.localStorage.setItem(key ?? '', JSON.stringify({ 'visits.ts': value }));
    }, [storageKey, cancelVisitFrom('chapter-2-step-1')]);
    const playground = await open(page, '/chapters/chapter-3/');
    await expect(playground.locator('[data-role="origin"]')).toHaveText(
      '第2章で書いた visits.ts は全部のテストに成功していないので、ステップ2の完成コードでこのデータベースを作りました。',
    );
    await expectAnswer(playground);
  });

  test('第2章で書いた visits.ts のテストは成功しても、データベースを作れないときは、ステップ2の完成コードで作る', async ({ page }) => {
    const code = cancelVisitFrom('chapter-2-step-2').replace(
      'withTransaction(db, () => {',
      'withTransaction(db, () => {\n    if (input.visitId === \'visit-pochi\') {\n      throw new Error(\'作れません\');\n    }',
    );
    await page.addInitScript(([key, value]) => {
      window.localStorage.setItem(key ?? '', JSON.stringify({ 'visits.ts': value }));
    }, [storageKey, code]);
    const playground = await open(page, '/chapters/chapter-3/');
    await expect(playground.locator('[data-role="origin"]')).toHaveText(
      '第2章で書いた visits.ts ではデータベースを作れなかったので、ステップ2の完成コードでこのデータベースを作りました。',
    );
    await expectAnswer(playground);
  });

  test('SQL を書き換えて実行でき、データベースを最初の状態に戻せる', async ({ page }) => {
    const playground = await open(page, '/chapters/chapter-3/');
    await replaceEditorText(playground, 'DELETE FROM business_events');
    await playground.getByRole('button', { name: '実行する' }).click();
    await expect(playground.locator('[data-role="results"]')).toContainText('1 行を変更しました');
    await playground.getByRole('button', { name: 'データベースを最初の状態に戻す' }).click();
    await expect(playground.locator('[data-role="results"]')).toContainText('データベースを最初の状態に戻しました');
    await replaceEditorText(playground, 'SELECT count(*) AS n FROM business_events');
    await playground.getByRole('button', { name: '実行する' }).click();
    await expect(playground.locator('[data-role="results"] tbody td')).toHaveText(['1']);
  });
});

test.describe('読み込む前に戻すボタン', () => {
  const restore = (playground: Locator, name: string): Locator => playground.getByRole('button', { name });

  test('コードの欄では、内容が実際に変わった直後だけ出る', async ({ page }) => {
    await page.goto('/playground-check/');
    const playground = page.locator('[data-playground="code"]').first();
    await expect(playground).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
    const back = restore(playground, '読み込む前のコードに戻す');
    await expect(back).toBeHidden();

    await playground.getByRole('button', { name: '最初のコードに戻す' }).click();
    await expect(back).toBeHidden();

    await playground.getByRole('button', { name: '完成コードを読み込む' }).click();
    await expect(back).toBeHidden();

    await replaceEditorText(playground, 'const edited = 1;');
    await playground.getByRole('button', { name: '完成コードを読み込む' }).click();
    await expect(back).toBeVisible();

    await page.keyboard.press('ControlOrMeta+Home');
    await playground.locator('.cm-content').click();
    await page.keyboard.type('// 追記 ');
    await expect(back).toBeHidden();

    await playground.getByRole('button', { name: '最初のコードに戻す' }).click();
    await expect(back).toBeVisible();
    await back.click();
    await expect(playground.locator('.cm-content')).toContainText('追記');
    await expect(back).toBeHidden();

    await page.reload();
    await expect(playground).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
    await expect(restore(playground, '読み込む前のコードに戻す')).toBeHidden();
  });

  test('SQL の欄では、内容が実際に変わった直後だけ出る', async ({ page }) => {
    const playground = await open(page, '/chapters/chapter-1/3/');
    const back = restore(playground, '読み込む前の SQL に戻す');
    await expect(back).toBeHidden();

    await playground.getByRole('button', { name: '最初の SQL に戻す' }).click();
    await expect(back).toBeHidden();

    await replaceEditorText(playground, 'SELECT 1');
    await playground.getByRole('button', { name: '最初の SQL に戻す' }).click();
    await expect(back).toBeVisible();

    await replaceEditorText(playground, 'SELECT 2');
    await expect(back).toBeHidden();

    await playground.getByRole('button', { name: '最初の SQL に戻す' }).click();
    await expect(back).toBeVisible();
    await back.click();
    await expect(playground.locator('.cm-content')).toContainText('SELECT 2');
    await expect(back).toBeHidden();

    await page.reload();
    await expect(box(page)).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
    await expect(restore(box(page), '読み込む前の SQL に戻す')).toBeHidden();
  });
});
