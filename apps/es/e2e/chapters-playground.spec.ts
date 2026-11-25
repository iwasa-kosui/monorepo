import { expect, type Locator, type Page, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const exercise = (snapshot: string, file: string): string =>
  readFileSync(fileURLToPath(new URL(`../exercises/${snapshot}/${file}`, import.meta.url)), 'utf8');

const startKey = 'es:code:chapter-1-start';
const stepOneKey = 'es:code:step-1';
const stepTwoKey = 'es:code:step-2';
const stepOnePath = '/chapters/chapter-2/2/';
const stepTwoPath = '/chapters/chapter-2/4/';

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

const loadAnswer = async (play: Locator, name: string): Promise<void> => {
  const answerStep = play.locator('details.play-hint-step').last();
  if (!(await answerStep.evaluate((element) => (element as HTMLDetailsElement).open))) {
    await answerStep.locator('summary').click();
  }
  await play.getByRole('button', { name }).click();
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

const visitsOf = (snapshot: string): string => exercise(snapshot, 'visits.ts');

test.describe('第1章', () => {
  test('テストを実行すると pass 4 / fail 4 になる', async ({ page }) => {
    const playground = await open(page, '/chapters/chapter-1/2/');
    await runTests(playground);
    await expect(summary(playground)).toHaveText('pass 4 / fail 4');
  });

  test('第2章で編集した内容は、第1章のテストに影響しない', async ({ page }) => {
    await page.addInitScript(([key, value]) => {
      window.localStorage.setItem(key ?? '', JSON.stringify({ 'visits.ts': value }));
    }, [startKey, visitsOf('chapter-2-step-2')]);
    const playground = await open(page, '/chapters/chapter-1/2/');
    await runTests(playground);
    await expect(summary(playground)).toHaveText('pass 4 / fail 4');
  });
});

test.describe('第2章', () => {
  test('場面でステップ1とステップ2を進め、ページを移動しても編集内容が残る', async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1280, height: 640 });
    const stepOne = await openScene(page, stepOnePath);
    await expect(stepOne.locator('.cm-content')).toContainText('export const cancelVisit');
    await runTests(stepOne);
    await expect(summary(stepOne)).toHaveText('pass 4 / fail 4');

    await loadAnswer(stepOne, 'ステップ1の完成コードを読み込む');
    await runTests(stepOne);
    await expect(summary(stepOne)).toHaveText('pass 8 / fail 0');

    await page.getByRole('link', { name: /次へ/ }).click();
    await expect(page).toHaveURL(/\/chapters\/chapter-2\/3\/$/);
    await page.getByRole('link', { name: /次へ/ }).click();
    await expect(page).toHaveURL(/\/chapters\/chapter-2\/4\/$/);
    const stepTwo = scene(page);
    await expect(stepTwo).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
    await expect(stepTwo.locator('.cm-content')).toContainText('INSERT INTO visit_cancellations');
    await runTests(stepTwo);
    await expect(summary(stepTwo)).toHaveText('pass 3 / fail 5');

    await replaceEditorText(stepTwo, visitsOf('chapter-2-step-2'));
    await runTests(stepTwo);
    await expect(summary(stepTwo)).toHaveText('pass 8 / fail 0');

    await page.getByRole('link', { name: /前へ/ }).click();
    await page.getByRole('link', { name: /前へ/ }).click();
    await expect(page).toHaveURL(/\/chapters\/chapter-2\/2\/$/);
    await expect(scene(page)).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
    await expect(scene(page).locator('.cm-content')).toContainText('INSERT INTO visit_cancellations');
    await runTests(scene(page));
    await expect(summary(scene(page))).toHaveText('pass 8 / fail 0');
  });

  test('完成コードを読み込むボタンで、ステップ1もステップ2も pass 8 / fail 0 になる', async ({ page }) => {
    const stepOne = await openScene(page, stepOnePath);
    await loadAnswer(stepOne, 'ステップ1の完成コードを読み込む');
    await runTests(stepOne);
    await expect(summary(stepOne)).toHaveText('pass 8 / fail 0');

    const stepTwo = await openScene(page, stepTwoPath);
    await expect(stepTwo.locator('.cm-content')).toContainText('INSERT INTO visit_cancellations');
    await loadAnswer(stepTwo, 'ステップ2の完成コードを読み込む');
    await runTests(stepTwo);
    await expect(summary(stepTwo)).toHaveText('pass 8 / fail 0');
  });

  test('ステップごとの保存キーに、編集した visits.ts のファイル全体を書く', async ({ page }) => {
    const stored = (key: string): Promise<string | null> =>
      page.evaluate((name) => window.localStorage.getItem(name), key);
    const stepOne = await openScene(page, stepOnePath);
    expect(await stored(stepOneKey)).toBeNull();
    await loadAnswer(stepOne, 'ステップ1の完成コードを読み込む');
    await expect.poll(() => stored(stepOneKey)).toBe(JSON.stringify({ 'visits.ts': visitsOf('chapter-2-step-1') }));

    const stepTwo = await openScene(page, stepTwoPath);
    expect(await stored(stepTwoKey)).toBeNull();
    await loadAnswer(stepTwo, 'ステップ2の完成コードを読み込む');
    await expect.poll(() => stored(stepTwoKey)).toBe(JSON.stringify({ 'visits.ts': visitsOf('chapter-2-step-2') }));
    expect(await stored(stepOneKey)).toBe(JSON.stringify({ 'visits.ts': visitsOf('chapter-2-step-1') }));
    expect(await stored(startKey)).toBeNull();
  });

  test('ステップ2は、ステップ1で書いたコードから始まる。「最初のコードに戻す」でステップ1の解答に戻せる', async ({ page }) => {
    const mine = visitsOf('chapter-2-step-1').replace(
      'export const cancelVisit =',
      '// 自分で書いたコード\nexport const cancelVisit =',
    );
    await page.addInitScript(([key, value]) => {
      window.localStorage.setItem(key ?? '', JSON.stringify({ 'visits.ts': value }));
    }, [stepOneKey, mine]);
    const stepTwo = await openScene(page, stepTwoPath);
    const stored = (): Promise<string | null> => page.evaluate((key) => window.localStorage.getItem(key), stepTwoKey);
    await expect(stepTwo.locator('.cm-content')).toContainText('// 自分で書いたコード');
    expect(await stored()).toBeNull();

    await stepTwo.getByRole('button', { name: '最初のコードに戻す' }).click();
    await expect(stepTwo.locator('.cm-content')).not.toContainText('// 自分で書いたコード');
    await expect.poll(stored).toBe(JSON.stringify({ 'visits.ts': visitsOf('chapter-2-step-2-start') }));

    await stepTwo.getByRole('button', { name: '読み込む前のコードに戻す' }).click();
    await expect(stepTwo.locator('.cm-content')).toContainText('// 自分で書いたコード');
    await expect.poll(stored).toBeNull();
  });

  test('ステップ1を書いていないとき、ステップ2はステップ1の解答から始まる', async ({ page }) => {
    const stepTwo = await openScene(page, stepTwoPath);
    await expect(stepTwo.locator('.cm-content')).toContainText('INSERT INTO visit_cancellations');
    await expect(stepTwo.locator('.cm-content')).toContainText('input.operatedBy');
    await expect(stepTwo.getByRole('button', { name: '読み込む前のコードに戻す' })).toBeHidden();
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
    const stepTwo = await openScene(page, stepTwoPath);
    await loadAnswer(stepTwo, 'ステップ2の完成コードを読み込む');
    const playground = await open(page, '/chapters/chapter-3/');
    await expect(playground.locator('[data-role="origin"]')).toHaveText(
      '第2章で書いた visits.ts で、このデータベースを作りました。',
    );
    await expectAnswer(playground);
  });

  test('ステップ1だけを終えたときは、ステップ2のコードが保存されていないので、ステップ2の完成コードで作る', async ({ page }) => {
    const stepOne = await openScene(page, stepOnePath);
    await loadAnswer(stepOne, 'ステップ1の完成コードを読み込む');
    const playground = await open(page, '/chapters/chapter-3/');
    await expect(playground.locator('[data-role="origin"]')).toHaveText(
      '第2章で書いた visits.ts が保存されていないので、ステップ2の完成コードでこのデータベースを作りました。',
    );
    await expectAnswer(playground);
  });

  test('第2章で書いた visits.ts のテストが成功しきらないときは、ステップ2の完成コードで作る', async ({ page }) => {
    await page.addInitScript(([key, value]) => {
      window.localStorage.setItem(key ?? '', JSON.stringify({ 'visits.ts': value }));
    }, [stepTwoKey, visitsOf('chapter-2-step-1')]);
    const playground = await open(page, '/chapters/chapter-3/');
    await expect(playground.locator('[data-role="origin"]')).toHaveText(
      '第2章で書いた visits.ts は全部のテストに成功していないので、ステップ2の完成コードでこのデータベースを作りました。',
    );
    await expectAnswer(playground);
  });

  test('第2章で書いた visits.ts のテストは成功しても、データベースを作れないときは、ステップ2の完成コードで作る', async ({ page }) => {
    const code = visitsOf('chapter-2-step-2').replace(
      'withTransaction(db, () => {',
      'withTransaction(db, () => {\n    if (input.visitId === \'visit-pochi\') {\n      throw new Error(\'作れません\');\n    }',
    );
    await page.addInitScript(([key, value]) => {
      window.localStorage.setItem(key ?? '', JSON.stringify({ 'visits.ts': value }));
    }, [stepTwoKey, code]);
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
    const playground = await open(page, '/chapters/chapter-3/');
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
    await expect(playground).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
    await expect(restore(playground, '読み込む前の SQL に戻す')).toBeHidden();
  });
});
