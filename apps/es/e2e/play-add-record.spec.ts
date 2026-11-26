import { expect, type Locator, type Page, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const redirectPath = '/play/add-record/';
const stepOnePath = '/chapters/chapter-2/2/';
const stepTwoPath = '/chapters/chapter-2/4/';
const stepOneKey = 'es:code:step-1';
const stepTwoKey = 'es:code:step-2';
const missing = '記録にありません';
const notRun = 'まだ実行していません';
const askHints = '迷ったら、右の「ヒントと解答」を上から順に開きます。';
const pressRun = '「ポチの来院をキャンセルする」を押します。';

const exercise = (snapshot: string): string =>
  readFileSync(fileURLToPath(new URL(`../exercises/${snapshot}/visits.ts`, import.meta.url)), 'utf8');

const stepOneBlanks = ['input.operatedBy', 'input.reason'];
const stepTwoBlanks = [
  '\'VisitCancelled\'',
  'JSON.stringify({ reason: input.reason, operatedBy: input.operatedBy })',
  '\'Visit\'',
];

const root = (page: Page): Locator => page.locator('[data-play="add-record"]');
const editor = (page: Page): Locator => root(page).locator('.cm-content');
const runButton = (page: Page): Locator => root(page).getByRole('button', { name: 'ポチの来院をキャンセルする' });
const templateButton = (page: Page): Locator => root(page).getByRole('button', { name: /記録の雛形を|用に書き換える/ });
const testsButton = (page: Page): Locator => root(page).getByRole('button', { name: 'テストを実行する' });
const resetButton = (page: Page): Locator => root(page).getByRole('button', { name: '最初のコードに戻す' });
const restoreButton = (page: Page): Locator => root(page).getByRole('button', { name: '読み込む前のコードに戻す' });
const visitStatus = (page: Page): Locator => page.locator('[data-role="visits-body"] td').nth(2);
const eventRows = (page: Page): Locator => page.locator('[data-role="event-row"]');
const eventValue = (page: Page, column: string): Locator =>
  eventRows(page).first().locator('tr').filter({ has: page.locator('th', { hasText: new RegExp(`^${column}$`) }) })
    .locator('td');
const answer = (page: Page, key: string): Locator => page.locator(`[data-answer="${key}"] [data-role="answer-value"]`);
const summary = (page: Page): Locator => page.locator('[data-role="summary"]');
const failedTests = (page: Page): Locator => page.locator('[data-role="failed"] li');
const actionBar = (page: Page): Locator => page.locator('[data-action-bar]');
const actionText = (page: Page): Locator => page.locator('[data-action-text]');
const hintsDialog = (page: Page): Locator => page.locator('[data-role="hints-dialog"]');
const message = (page: Page): Locator => page.locator('[data-role="message"]');
const hintSteps = (page: Page): Locator => page.locator('details.play-hint-step');

const storedCode = (page: Page, key: string): Promise<string | null> =>
  page.evaluate((name) => window.localStorage.getItem(name), key);

const open = async (page: Page, path: string = stepOnePath): Promise<void> => {
  await page.goto(path);
  await expect(root(page)).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
  await expect(visitStatus(page)).toHaveText('reserved');
  await expect(runButton(page)).toBeEnabled();
};

const expectEditorToContain = async (page: Page, text: string): Promise<void> => {
  await expect.poll(async () => {
    await root(page).locator('.cm-scroller').evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    return editor(page).innerText();
  }).toContain(text);
};

const replaceCode = async (page: Page, code: string): Promise<void> => {
  await editor(page).click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.insertText(code);
};

const openHints = async (page: Page): Promise<void> => {
  if (await hintsDialog(page).evaluate((element) => (element as HTMLDialogElement).open)) return;
  await root(page).getByRole('button', { name: 'ヒントと解答' }).click();
  await expect(hintsDialog(page)).toHaveJSProperty('open', true);
};

const openAnswer = async (page: Page): Promise<void> => {
  await openHints(page);
  const answerStep = hintSteps(page).last();
  if (!(await answerStep.evaluate((element) => (element as HTMLDetailsElement).open))) {
    await answerStep.locator('summary').click();
  }
};

const loadAnswer = async (page: Page, step: 1 | 2): Promise<void> => {
  await openAnswer(page);
  await hintsDialog(page).getByRole('button', { name: `ステップ${step}の完成コードを読み込む` }).click();
  await expect(hintsDialog(page)).toHaveJSProperty('open', false);
};

const expectOnlyOpen = async (page: Page, index: number): Promise<void> => {
  for (let other = 0; other < 4; other += 1) {
    await expect(hintSteps(page).nth(other)).toHaveJSProperty('open', other === index);
  }
};

const expectAllClosed = async (page: Page): Promise<void> => {
  await expect(hintSteps(page)).toHaveCount(4);
  for (let other = 0; other < 4; other += 1) {
    await expect(hintSteps(page).nth(other)).toHaveJSProperty('open', false);
  }
};

const openHintsInOrder = async (page: Page): Promise<void> => {
  await openHints(page);
  await expectAllClosed(page);
  for (let index = 0; index < 4; index += 1) {
    await hintSteps(page).nth(index).locator('summary').click();
    await expectOnlyOpen(page, index);
  }
};

const fillBlanks = async (page: Page, values: readonly string[]): Promise<void> => {
  await templateButton(page).click();
  await expect(editor(page)).toBeFocused();
  for (const [index, value] of values.entries()) {
    await page.keyboard.insertText(value);
    if (index < values.length - 1) {
      await page.keyboard.press('Tab');
    }
  }
};

const expectAnswers = async (page: Page, keys: readonly string[], text: string): Promise<void> => {
  for (const key of keys) {
    await expect(answer(page, key)).toHaveText(text);
  }
};

const isoTime = /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/;

const expectStepOneRecorded = async (page: Page): Promise<void> => {
  await expect(visitStatus(page)).toHaveText('cancelled');
  await expect(eventRows(page)).toHaveCount(1);
  await expect(eventRows(page).first().locator('caption')).toHaveText('追加された行');
  await expect(eventRows(page).first().locator('th')).toHaveText([
    'id',
    'visit_id',
    'cancelled_at',
    'operated_by',
    'reason',
  ]);
  await expect(eventValue(page, 'visit_id')).toHaveText('visit-pochi');
  await expect(page.locator('[data-role="events-caption"]')).toHaveText('0 行から 1 行に増えました。');
  await expect(answer(page, 'who')).toHaveText('受付スタッフ');
  await expect(answer(page, 'when')).toHaveText(isoTime);
  await expect(answer(page, 'why')).toHaveText('飼い主の都合');
  await expect(page.locator('[data-answer="what"]')).toHaveCount(0);
};

const expectStepTwoRecorded = async (page: Page): Promise<void> => {
  await expect(visitStatus(page)).toHaveText('cancelled');
  await expect(eventRows(page)).toHaveCount(1);
  await expect(eventRows(page).first().locator('th')).toHaveText([
    'event_id',
    'event_at',
    'event_name',
    'payload',
    'target_id',
    'target_type',
    'target_state',
  ]);
  await expect(eventValue(page, 'event_name')).toHaveText('VisitCancelled');
  await expect(eventValue(page, 'target_type')).toHaveText('Visit');
  await expect(eventValue(page, 'target_state')).toContainText('"status":"cancelled"');
  await expect(answer(page, 'who')).toHaveText('受付スタッフ');
  await expect(answer(page, 'when')).toHaveText(isoTime);
  await expect(answer(page, 'what')).toHaveText('VisitCancelled');
  await expect(answer(page, 'why')).toHaveText('飼い主の都合');
};

type Region = { name: string; overflows: boolean; scrolls: boolean; reachesEnd: boolean };

type Fit = { pageHeight: number; viewHeight: number; pageWidth: number; viewWidth: number; regions: Region[] };

const measureFit = (page: Page): Promise<Fit> =>
  page.evaluate(() => {
    const scroller = document.scrollingElement ?? document.documentElement;
    const regions = ['main.lesson-main', '.ide-work'].flatMap((selector) => {
      const element = document.querySelector<HTMLElement>(selector);
      if (element === null) return [];
      const overflowY = getComputedStyle(element).overflowY;
      const overflows = element.scrollHeight > element.clientHeight + 1;
      const before = element.scrollTop;
      element.scrollTop = element.scrollHeight;
      const reachesEnd = !overflows || element.scrollTop > before;
      element.scrollTop = before;
      return [{ name: selector, overflows, scrolls: overflowY === 'auto' || overflowY === 'scroll', reachesEnd }];
    });
    return {
      pageHeight: scroller.scrollHeight,
      viewHeight: window.innerHeight,
      pageWidth: scroller.scrollWidth,
      viewWidth: window.innerWidth,
      regions,
    };
  });

const expectFit = async (page: Page): Promise<void> => {
  const fit = await measureFit(page);
  expect(fit.pageHeight).toBeLessThanOrEqual(fit.viewHeight);
  expect(fit.pageWidth).toBeLessThanOrEqual(fit.viewWidth);
  expect(fit.regions.length).toBeGreaterThan(0);
  for (const region of fit.regions) {
    expect(region.scrolls, region.name).toBe(true);
    expect(region.reachesEnd, region.name).toBe(true);
  }
};

const lineInView = (page: Page, text: string): Promise<boolean> =>
  page.evaluate((needle) => {
    const scroller = document.querySelector<HTMLElement>('[data-play] .cm-scroller');
    const line = [...(scroller?.querySelectorAll('.cm-line') ?? [])].find((item) =>
      (item.textContent ?? '').includes(needle)
    );
    if (scroller === null || line === undefined) return false;
    const view = scroller.getBoundingClientRect();
    const box = line.getBoundingClientRect();
    return box.top >= view.top - 1 && box.bottom <= view.bottom + 1;
  }, text);

const selectedText = (page: Page): Promise<string> => page.evaluate(() => window.getSelection()?.toString() ?? '');

const runningAnimations = (page: Page): Promise<number> =>
  page.evaluate(() =>
    document.getAnimations().filter((animation) =>
      animation instanceof CSSAnimation && animation.animationName.startsWith('play-')
    ).length
  );

const overflowing = (page: Page): Promise<number> =>
  page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

const desktopSizes = [{ width: 1280, height: 640 }, { width: 1440, height: 790 }];

test.describe('/play/add-record/ の転送', () => {
  test('第2章のステップ1のページへ転送する。noindex が付いている', async ({ page, request }) => {
    const html = await (await request.get(redirectPath)).text();
    expect(html).toContain('<meta http-equiv="refresh" content="0; url=/chapters/chapter-2/2/">');
    expect(html).toContain('<meta name="robots" content="noindex">');
    await page.goto(redirectPath);
    await expect(page).toHaveURL(/\/chapters\/chapter-2\/2\/$/);
  });
});

test.describe('第2章の場面 ステップ1 /chapters/chapter-2/2/', () => {
  test('h1 は章の見出しの 1 つだけで、場面の見出しは h2。前後の移動がある', async ({ page }) => {
    await open(page);
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.getByRole('heading', { level: 2, name: 'この来院がキャンセルになっているのはなぜですか。' }))
      .toBeVisible();
    await expect(page.locator('.play-step-label')).toHaveText('ステップ1: キャンセルの記録を1行足す');
    await expect(page.locator('nav[aria-label="ページの移動"]')).toBeVisible();
    await expect(page.getByRole('button', { name: '前のページへ' })).toHaveAttribute(
      'data-href',
      '/chapters/chapter-2/',
    );
    await expect(page.getByRole('button', { name: '次のページへ' })).toHaveAttribute(
      'data-href',
      '/chapters/chapter-2/3/',
    );
  });

  test('手元の Node の案内は、「ヒントと解答」のダイアログの中で開き、画面の配置を動かさない', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 640 });
    await open(page);
    const work = page.locator('.play-work');
    const before = await work.boundingBox();
    await openHints(page);
    await hintsDialog(page).getByText('手元の Node で動かすとき').click();
    await expect(page.locator('.play-node-body')).toContainText('node --test visits.test.ts');
    await expect(page.locator('.play-node-body')).toContainText('pass 8');
    expect(await work.boundingBox()).toEqual(before);
    await expectFit(page);
  });

  for (const size of desktopSizes) {
    test(`${size.width}x${size.height} で、実行の前も後も答えが埋まった後も、画面に収まる`, async ({ page }) => {
      await page.setViewportSize(size);
      await open(page);
      await expect(page.getByRole('heading', { name: 'この来院がキャンセルになっているのはなぜですか。' }))
        .toBeVisible();
      await expect(page.locator('nav[aria-label="ページの移動"]')).toBeVisible();
      await expect.poll(() => lineInView(page, 'export const cancelVisit')).toBe(true);
      await expectFit(page);

      await runButton(page).click();
      await expect(visitStatus(page)).toHaveText('cancelled');
      await expectFit(page);

      await testsButton(page).click();
      await expect(summary(page)).toHaveText('pass 4 / fail 4');
      await expectFit(page);

      await fillBlanks(page, stepOneBlanks);
      await expectFit(page);
      await runButton(page).click();
      await expectStepOneRecorded(page);
      await expectFit(page);

      await testsButton(page).click();
      await expect(summary(page)).toHaveText('pass 8 / fail 0');
      await expectFit(page);
    });
  }

  test('実行の前は reserved で visit_cancellations が空。画面を開いただけでは動かない', async ({ page }) => {
    await open(page);
    await expect(page.locator('[data-role="visits-badge"]')).toHaveText('実行前');
    await expect(page.locator('#events-title')).toHaveText('visit_cancellations');
    await expect(page.locator('[data-role="events-empty"]')).toBeVisible();
    await expect(page.locator('[data-answer]')).toHaveCount(3);
    await expectAnswers(page, ['who', 'when', 'why'], notRun);
    await expectAllClosed(page);
    await expect(actionText(page)).toHaveText(
      `${pressRun}いまのコードで、visits と visit_cancellations がどう変わるかを見ます。`,
    );
    expect(await runningAnimations(page)).toBe(0);
  });

  test('帯のボタンを押すと、場面の同じ名前のボタンを押したときと同じ動作になる', async ({ page }) => {
    await open(page);
    const barRun = actionBar(page).getByRole('button', { name: 'ポチの来院をキャンセルする' });
    await expect(barRun).toBeVisible();
    await barRun.click();
    await expect(visitStatus(page)).toHaveText('cancelled');
    await expect(page.locator('[data-role="visits-badge"]')).toHaveText('実行後');
    await expectAnswers(page, ['who', 'when', 'why'], missing);

    const barTemplate = actionBar(page).getByRole('button', { name: '記録の雛形を UPDATE の次の行に入れる' });
    await expect(barTemplate).toBeVisible();
    await barTemplate.click();
    await expect.poll(() => selectedText(page)).toBe('/* 誰が */');
    await expect(templateButton(page)).toBeDisabled();
    await expect(actionBar(page).getByRole('button', { name: '記録の雛形を UPDATE の次の行に入れる' })).toHaveCount(0);
  });

  test('段階1: 何も編集せずに実行すると、visits は cancelled になり、visit_cancellations は 0 行のまま', async ({ page }) => {
    await open(page);
    await runButton(page).click();
    await expect(visitStatus(page)).toHaveText('cancelled');
    await expect(page.locator('[data-role="visits-badge"]')).toHaveText('実行後');
    await expect(page.locator('[data-role="visits-caption"]')).toHaveText(
      'status が reserved から cancelled に変わりました。',
    );
    await expect(eventRows(page)).toHaveCount(0);
    await expect(page.locator('[data-role="events-empty"]')).toHaveText('行がありません');
    await expect(page.locator('[data-role="events-caption"]')).toHaveText('0 行のままです。行は増えていません。');
    await expectAnswers(page, ['who', 'when', 'why'], missing);
    await expect(actionText(page)).toHaveText(
      'visits の status は変わりましたが、visit_cancellations は増えていません。'
        + '「記録の雛形を UPDATE の次の行に入れる」を押します。',
    );
  });

  test('段階2から4: 雛形の空欄をキーボードで埋めて実行し、テストは pass 8 / fail 0 になる', async ({ page }) => {
    await open(page);
    await templateButton(page).click();
    await expect(editor(page)).toContainText(
      'INSERT INTO visit_cancellations (visit_id, cancelled_at, operated_by, reason)',
    );
    await expect(editor(page)).toContainText('/* 誰が */');
    await expect(editor(page)).toContainText('/* なぜ */');
    await expect.poll(() => selectedText(page)).toBe('/* 誰が */');
    await expect(actionText(page)).toHaveText(
      '雛形の 2 つの空欄を書き換え、input の型に reason と operatedBy を足します。'
        + `Tab キーで次の空欄に移れます。${askHints}終わったら${pressRun}`,
    );
    await expect(templateButton(page)).toBeDisabled();

    await page.keyboard.insertText(stepOneBlanks[0] ?? '');
    await page.keyboard.press('Tab');
    await page.keyboard.insertText(stepOneBlanks[1] ?? '');
    await expect(editor(page)).not.toContainText('/* ');

    await runButton(page).click();
    await expectStepOneRecorded(page);
    await expect(actionText(page)).toHaveText(
      'visit_cancellations に 1 行増えました。答えの欄の「誰が」「いつ」「なぜ」が埋まりました。'
        + '「テストを実行する」を押します。',
    );

    await testsButton(page).click();
    await expect(summary(page)).toHaveText('pass 8 / fail 0');
    await expect(failedTests(page)).toHaveCount(0);
    await expect(actionText(page)).toHaveText('すべてのテストが成功しました。次のページへ進みます。');
  });

  test('空欄を埋めて input の型も直したコードは、ステップ1の解答のファイルと同じになる', async ({ page }) => {
    await open(page);
    await fillBlanks(page, stepOneBlanks);
    const typed = JSON.parse((await storedCode(page, stepOneKey)) ?? '{}') as Record<string, string>;
    expect(
      typed['visits.ts']?.replace(
        'export const cancelVisit = (db: DatabaseSync, input: { visitId: string }): void => {',
        'export const cancelVisit = (db: DatabaseSync, input: { visitId: string; reason: string; operatedBy: string }): void => {',
      ),
    ).toBe(exercise('chapter-2-step-1'));
  });

  test('最初のコードのままテストを実行すると、pass 4 / fail 4 になり、失敗したテストの名前が出る', async ({ page }) => {
    await open(page);
    await testsButton(page).click();
    await expect(summary(page)).toHaveText('pass 4 / fail 4');
    await expect(failedTests(page)).toHaveCount(4);
    await expect(failedTests(page).first()).toContainText(
      '第2章 ステップ1 > 来院をキャンセルすると、来院キャンセルの記録が1行残る',
    );
    await expect(failedTests(page).first()).toContainText('来院キャンセルの記録がありません');
    await expect(actionText(page)).toHaveText(
      'テストの結果に、失敗したテストの名前を出しています。「記録の雛形を UPDATE の次の行に入れる」を押します。',
    );
  });

  test('完成コードの読み込み: 実行すると visit_cancellations が 1 行増え、最初のコードに戻すと実行前の表示に戻る', async ({ page }) => {
    await open(page);
    await loadAnswer(page, 1);
    await expect(editor(page)).toContainText('input.operatedBy');
    await expect(actionText(page)).toHaveText(`ステップ1の完成コードを読み込みました。${pressRun}`);
    await expect(templateButton(page)).toBeDisabled();
    await runButton(page).click();
    await expectStepOneRecorded(page);
    await testsButton(page).click();
    await expect(summary(page)).toHaveText('pass 8 / fail 0');

    await resetButton(page).click();
    await expect(editor(page)).not.toContainText('visit_cancellations');
    await expect(templateButton(page)).toBeEnabled();
    await expect(visitStatus(page)).toHaveText('reserved');
    await expect(page.locator('[data-role="visits-badge"]')).toHaveText('実行前');
    await expect(eventRows(page)).toHaveCount(0);
    await expect(summary(page)).toHaveText(notRun);
    await expect(failedTests(page)).toHaveCount(0);
    await expectAnswers(page, ['who', 'when', 'why'], notRun);
    expect(await runningAnimations(page)).toBe(0);
  });

  test('読み込む完成コードは、ステップ1の解答のファイルと同じ', async ({ page }) => {
    await open(page);
    await loadAnswer(page, 1);
    await expect.poll(() => storedCode(page, stepOneKey)).toBe(
      JSON.stringify({ 'visits.ts': exercise('chapter-2-step-1') }),
    );
  });

  test('空欄を残したまま実行すると、エラーの文を出して、前回の実行結果を消す。直せばもう一度実行できる', async ({ page }) => {
    await open(page);
    await runButton(page).click();
    await expect(visitStatus(page)).toHaveText('cancelled');

    await templateButton(page).click();
    await runButton(page).click();
    await expect(message(page).getByRole('alert')).toContainText('コードを最後まで実行できませんでした');
    await expect(message(page).getByRole('alert')).toContainText('SyntaxError');
    await expect(visitStatus(page)).toHaveText('reserved');
    await expect(page.locator('[data-role="visits-badge"]')).toHaveText('実行前');
    await expectAnswers(page, ['who', 'when', 'why'], notRun);
    await expect(runButton(page)).toBeEnabled();

    await replaceCode(page, exercise('chapter-2-step-1'));
    await runButton(page).click();
    await expect(message(page)).toBeHidden();
    await expectStepOneRecorded(page);
  });

  test('記録の INSERT が失敗すると、status が reserved のままであることを案内する', async ({ page }) => {
    await open(page);
    await replaceCode(page, exercise('chapter-2-step-1').replace('operated_by, reason)', 'operated_by, reaso)'));
    await runButton(page).click();
    await expect(message(page).getByRole('alert')).toContainText('cancelVisit がエラーを出しました');
    await expect(message(page).getByRole('alert')).toContainText(
      'table visit_cancellations has no column named reaso',
    );
    await expect(visitStatus(page)).toHaveText('reserved');
    await expect(page.locator('[data-role="visits-caption"]')).toHaveText('status は reserved のままです。');
    await expect(actionText(page)).toHaveText(
      'visits の status は reserved のままです。記録を書き込めないときは、UPDATE も一緒に取り消されます。'
        + 'エラーの文を読んでコードを直し、もう一度押します。',
    );
  });

  test('誰がとなぜを取り違えると、答えの欄に取り違えた値が出て、テストが失敗する', async ({ page }) => {
    await open(page);
    await fillBlanks(page, [...stepOneBlanks].reverse());
    await runButton(page).click();
    await expect(answer(page, 'who')).toHaveText('飼い主の都合');
    await expect(answer(page, 'why')).toHaveText('受付スタッフ');
    await testsButton(page).click();
    await expect(summary(page)).toHaveText('pass 6 / fail 2');
    await expect(failedTests(page).first()).toContainText('キャンセルした人を答えられません');
    await expect(actionText(page)).toHaveText(
      'テストの結果に、失敗したテストの名前を出しています。コードを直して、もう一度押せます。',
    );
  });

  test('編集したコードは保存され、ページを開き直しても残る。最初のコードに戻すと保存も消える', async ({ page }) => {
    await open(page);
    await loadAnswer(page, 1);
    await expect.poll(() => storedCode(page, stepOneKey)).toContain('visit_cancellations');
    await open(page);
    await expectEditorToContain(page, 'input.operatedBy');
    await expect(actionText(page)).toHaveText(pressRun);
    await resetButton(page).click();
    await expect.poll(() => storedCode(page, stepOneKey)).toBeNull();
  });

  test('空欄を残したままページを開き直すと、空欄を埋めるよう案内する', async ({ page }) => {
    await open(page);
    await templateButton(page).click();
    await expect.poll(() => storedCode(page, stepOneKey)).toContain('/* 誰が */');
    await open(page);
    await expectEditorToContain(page, '/* 誰が */');
    await expect(visitStatus(page)).toHaveText('reserved');
    await expect(actionText(page)).toHaveText(
      `雛形の 2 つの空欄を書き換え、input の型に reason と operatedBy を足します。${askHints}終わったら${pressRun}`,
    );
    await expect(templateButton(page)).toBeDisabled();
  });

  test('「読み込む前のコードに戻す」は、編集したコードを読み込みや初期化で置き換えた直後だけ出る', async ({ page }) => {
    await open(page);
    await expect(restoreButton(page)).toBeHidden();
    await loadAnswer(page, 1);
    await expect(restoreButton(page)).toBeHidden();

    await editor(page).click();
    await page.keyboard.press('ControlOrMeta+Home');
    await page.keyboard.insertText('// 自分のメモ\n');
    await resetButton(page).click();
    await expect(restoreButton(page)).toBeVisible();
    await expect(editor(page)).not.toContainText('// 自分のメモ');

    await restoreButton(page).click();
    await expect(restoreButton(page)).toBeHidden();
    await expect(editor(page)).toContainText('// 自分のメモ');

    await loadAnswer(page, 1);
    await expect(restoreButton(page)).toBeVisible();
    await editor(page).click();
    await page.keyboard.insertText(' ');
    await expect(restoreButton(page)).toBeHidden();
  });

  test('記録が無いコードでは、行が増えず、0 行のままと分かる', async ({ page }) => {
    await open(page);
    await runButton(page).click();
    await expect(visitStatus(page)).toHaveText('cancelled');
    await expect(eventRows(page)).toHaveCount(0);
    await expect(page.locator('[data-role="events-empty"]')).toHaveText('行がありません');
  });

  test('prefers-reduced-motion: reduce でも、値は同じように読める', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page);
    await loadAnswer(page, 1);
    await runButton(page).click();
    await expectStepOneRecorded(page);
    expect(await runningAnimations(page)).toBe(0);
    await expect(visitStatus(page)).toHaveCSS('opacity', '1');
    await expect(eventRows(page).first()).toHaveCSS('opacity', '1');
  });

  for (const width of [360, 390]) {
    test(`${width} 幅では縦に並び、横にはみ出さない`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await open(page);
      expect(await overflowing(page)).toBeLessThanOrEqual(0);
      const lefts = await page.evaluate(() =>
        [...document.querySelectorAll('[data-play] > section')].map((column) =>
          Math.round(column.getBoundingClientRect().left)
        )
      );
      expect(new Set(lefts).size).toBe(1);

      await runButton(page).click();
      await expect(visitStatus(page)).toHaveText('cancelled');
      expect(await overflowing(page)).toBeLessThanOrEqual(0);

      await loadAnswer(page, 1);
      await runButton(page).click();
      await expectStepOneRecorded(page);
      expect(await overflowing(page)).toBeLessThanOrEqual(0);

      await testsButton(page).click();
      await expect(summary(page)).toHaveText('pass 8 / fail 0');
      expect(await overflowing(page)).toBeLessThanOrEqual(0);
    });
  }

  test('ヒントは最初すべて閉じていて、1つずつ開く。解答の完成コードでテストは pass 8 / fail 0 になる', async ({ page }) => {
    await open(page);
    await expect(hintsDialog(page)).toBeHidden();
    await openHints(page);
    const panel = page.locator('section[aria-labelledby="hints-title"]');
    await expect(panel).toContainText('上から順に開きます。');
    await expect(hintSteps(page).locator('summary')).toHaveText([
      'ヒント1 考えること',
      'ヒント2 変える場所',
      'ヒント3 入れる値',
      '解答',
    ]);
    await expect(hintsDialog(page).getByRole('button', { name: 'ステップ1の完成コードを読み込む' })).toBeHidden();
    await hintSteps(page).nth(2).locator('summary').click();
    await expect(hintSteps(page).nth(2).locator('tbody tr')).toHaveText([
      /\/\* 誰が \*\/\s*input\.operatedBy/,
      /\/\* なぜ \*\/\s*input\.reason/,
    ]);
    await expect(hintSteps(page).nth(2)).toContainText(
      'input の型に reason: string と operatedBy: string を足します。',
    );
    await hintSteps(page).nth(2).locator('summary').click();
    await openHintsInOrder(page);
    await expect(hintsDialog(page).getByRole('button', { name: 'ステップ1の完成コードを読み込む' })).toBeVisible();
    await hintsDialog(page).getByRole('button', { name: 'ステップ1の完成コードを読み込む' }).click();
    await expect(hintsDialog(page)).toHaveJSProperty('open', false);
    await testsButton(page).click();
    await expect(summary(page)).toHaveText('pass 8 / fail 0');
  });
});

test.describe('第2章の場面 ステップ2 /chapters/chapter-2/4/', () => {
  test('h1 は 1 つだけ。ステップのラベルと、書き換えのボタンと、「ヒントと解答」を出す', async ({ page }) => {
    await open(page, stepTwoPath);
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('.play-step-label')).toHaveText('ステップ2: 記録を business_events に移す');
    await expect(page.locator('#events-title')).toHaveText('business_events');
    await expect(templateButton(page)).toHaveText('INSERT を business_events 用に書き換える');
    await expect(page.locator('[data-answer]')).toHaveCount(4);
    await expect(hintSteps(page).locator('summary')).toHaveText([
      'ヒント1 考えること',
      'ヒント2 変える場所',
      'ヒント3 入れる値',
      '解答',
    ]);
    await openHints(page);
    await hintSteps(page).nth(2).locator('summary').click();
    await expect(hintSteps(page).nth(2).locator('tbody tr')).toHaveText([
      /\/\* event_name \*\/\s*'VisitCancelled'/,
      /\/\* payload \*\/\s*JSON\.stringify\(\{ reason: input\.reason, operatedBy: input\.operatedBy \}\)/,
      /\/\* target_type \*\/\s*'Visit'/,
    ]);
    await expect(hintSteps(page).nth(2)).toContainText(
      'payload のキーの名前はこのとおりにします。テストと第3章の SELECT は $.reason と $.operatedBy を読みます。',
    );
    await expect(page.getByRole('button', { name: 'ステップ1の完成コードを読み込む' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '前のページへ' })).toHaveAttribute(
      'data-href',
      '/chapters/chapter-2/3/',
    );
    await expect(page.getByRole('button', { name: '次のページへ' })).toHaveAttribute(
      'data-href',
      '/chapters/chapter-2/5/',
    );
  });

  test('開始時点のコードは、ステップ1の解答。実行すると記録が失敗して、来院の更新も取り消される', async ({ page }) => {
    await open(page, stepTwoPath);
    await expectEditorToContain(page, 'INSERT INTO visit_cancellations');
    await expect(actionText(page)).toHaveText(
      `${pressRun}テーブルを business_events に作り直した後で、ステップ1のコードがどう動くかを見ます。`,
    );

    await runButton(page).click();
    await expect(message(page).getByRole('alert')).toContainText('cancelVisit がエラーを出しました');
    await expect(message(page).getByRole('alert')).toContainText('no such table: visit_cancellations');
    await expect(visitStatus(page)).toHaveText('reserved');
    await expect(page.locator('[data-role="visits-badge"]')).toHaveText('実行後');
    await expect(page.locator('[data-role="visits-caption"]')).toHaveText('status は reserved のままです。');
    await expect(eventRows(page)).toHaveCount(0);
    await expectAnswers(page, ['who', 'when', 'what', 'why'], missing);
    await expect(actionText(page)).toHaveText(
      'visit_cancellations テーブルは、もうありません。visits の status は reserved のままです。'
        + '記録を書き込めないときは、UPDATE も一緒に取り消されます。'
        + '「INSERT を business_events 用に書き換える」を押します。',
    );
  });

  test('開始時点のコードのままテストを実行すると、pass 3 / fail 5 になる', async ({ page }) => {
    await open(page, stepTwoPath);
    await testsButton(page).click();
    await expect(summary(page)).toHaveText('pass 3 / fail 5');
    await expect(failedTests(page)).toHaveCount(5);
    await expect(failedTests(page).first()).toContainText(
      '既存の業務 > 予約した来院をキャンセルすると、来院の状態がキャンセルになる',
    );
    await expect(failedTests(page).first()).toContainText('no such table: visit_cancellations');
    await expect(actionText(page)).toHaveText(
      'テストの結果に、失敗したテストの名前を出しています。「INSERT を business_events 用に書き換える」を押します。',
    );
  });

  test('INSERT を書き換えて 3 つの空欄を埋めると、business_events に 1 行増え、テストは pass 8 / fail 0 になる', async ({ page }) => {
    await open(page, stepTwoPath);
    await templateButton(page).click();
    await expect(editor(page)).not.toContainText('visit_cancellations');
    await expect(editor(page)).toContainText(
      'INSERT INTO business_events (event_at, event_name, payload, target_id, target_type, target_state)',
    );
    await expect(editor(page)).toContainText('JSON.stringify(cancelled)');
    for (const blank of ['/* event_name */', '/* payload */', '/* target_type */']) {
      await expect(editor(page)).toContainText(blank);
    }
    await expect.poll(() => selectedText(page)).toBe('/* event_name */');
    await expect(actionText(page)).toHaveText(
      `雛形の 3 つの空欄を書き換えます。Tab キーで次の空欄に移れます。${askHints}終わったら${pressRun}`,
    );
    await expect(templateButton(page)).toBeDisabled();

    for (const [index, value] of stepTwoBlanks.entries()) {
      await page.keyboard.insertText(value);
      if (index < stepTwoBlanks.length - 1) await page.keyboard.press('Tab');
    }
    await expect.poll(() => storedCode(page, stepTwoKey)).toBe(
      JSON.stringify({ 'visits.ts': exercise('chapter-2-step-2') }),
    );

    await runButton(page).click();
    await expect(message(page)).toBeHidden();
    await expectStepTwoRecorded(page);
    await expect(actionText(page)).toHaveText(
      'business_events に 1 行増えました。答えの欄の「誰が」「いつ」「何を」「なぜ」が埋まりました。'
        + '「テストを実行する」を押します。',
    );
    await testsButton(page).click();
    await expect(summary(page)).toHaveText('pass 8 / fail 0');
    await expect(actionText(page)).toHaveText('すべてのテストが成功しました。次のページへ進みます。');
  });

  test('payload に reason と operatedBy が無いと、誰がとなぜが「記録にありません」のままで、見直す場所を案内する', async ({ page }) => {
    await open(page, stepTwoPath);
    await fillBlanks(page, ['\'VisitCancelled\'', 'JSON.stringify({})', '\'Visit\'']);
    await runButton(page).click();
    await expect(eventRows(page)).toHaveCount(1);
    await expect(answer(page, 'what')).toHaveText('VisitCancelled');
    await expect(answer(page, 'when')).toHaveText(isoTime);
    await expectAnswers(page, ['who', 'why'], missing);
    await expect(actionText(page)).toHaveText(
      'business_events に 1 行増えました。答えの欄の「誰が」「なぜ」は、まだ「記録にありません」です。'
        + 'payload に reason と operatedBy が入っているかを見直して、もう一度押します。',
    );
    await testsButton(page).click();
    await expect(summary(page)).toHaveText('pass 7 / fail 1');
    await expect(failedTests(page)).toContainText(['キャンセルした人と理由を答えられる']);
  });

  test('ステップ2の完成コードを読み込むと、全テストが成功する。読み込むコードは解答のファイルと同じ', async ({ page }) => {
    await open(page, stepTwoPath);
    await loadAnswer(page, 2);
    await expect(actionText(page)).toHaveText(
      'ステップ2の完成コードを読み込みました。全テストが成功するコードです。'
        + `第3章は自分のコードを使わなくても進められます。${pressRun}`,
    );
    await expect.poll(() => storedCode(page, stepTwoKey)).toBe(
      JSON.stringify({ 'visits.ts': exercise('chapter-2-step-2') }),
    );
    await runButton(page).click();
    await expectStepTwoRecorded(page);
    await testsButton(page).click();
    await expect(summary(page)).toHaveText('pass 8 / fail 0');
  });

  test('ステップ1で INSERT を書いていないコードを引き継ぐと、ステップ1の解答から続ける方法を案内する', async ({ page }) => {
    await page.addInitScript(([key, value]) => {
      window.localStorage.setItem(key ?? '', JSON.stringify({ 'visits.ts': value }));
    }, [stepOneKey, `// 途中\n${exercise('chapter-1-start')}`]);
    await open(page, stepTwoPath);
    await expect(editor(page)).toContainText('// 途中');
    const unfinished = 'ステップ1が終わっていないときは、「最初のコードに戻す」を押して、ステップ1の解答から続けます。';
    await expect(actionText(page)).toHaveText(unfinished);

    await resetButton(page).click();
    await expectEditorToContain(page, 'INSERT INTO visit_cancellations');
    await expect(editor(page)).not.toContainText('// 途中');
    await expect(restoreButton(page)).toBeVisible();
    await expect(actionText(page)).toContainText(pressRun);
  });

  test('ステップ1のページで書いたコードが、ステップ2のページに引き継がれる', async ({ page }) => {
    await open(page);
    await replaceCode(
      page,
      exercise('chapter-2-step-1').replace('withTransaction(db, () => {', 'withTransaction(db, () => { // 自分'),
    );
    await expect.poll(() => storedCode(page, stepOneKey)).toContain('// 自分');
    await open(page, stepTwoPath);
    await expect(editor(page)).toContainText('// 自分');
    expect(await storedCode(page, stepTwoKey)).toBeNull();

    await templateButton(page).click();
    await expect(editor(page)).toContainText('// 自分');
    await expect(editor(page)).toContainText('/* event_name */');
    await expect.poll(() => storedCode(page, stepTwoKey)).toContain('/* event_name */');
    expect(await storedCode(page, stepOneKey)).not.toContain('business_events');
  });

  test('bfcache から戻ったページ（pageshow の persisted）では、ステップ1で直したコードを編集欄に反映する', async ({ page, context }) => {
    await open(page, stepTwoPath);
    await expect(editor(page)).not.toContainText('// 後から');

    const other = await context.newPage();
    await open(other, stepOnePath);
    await replaceCode(other, `// 後から\n${exercise('chapter-2-step-1')}`);
    await expect.poll(() => storedCode(other, stepOneKey)).toContain('// 後から');
    await other.close();

    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: false })));
    await expect(editor(page)).not.toContainText('// 後から');

    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
    await expect(editor(page)).toContainText('// 後から');
    await expect(restoreButton(page)).toBeHidden();
  });

  test('編集してから完成コードを読み込んでも、「読み込む前のコードに戻す」で編集が戻る', async ({ page }) => {
    await open(page, stepTwoPath);
    await expect(restoreButton(page)).toBeHidden();
    await templateButton(page).click();
    const edited = await storedCode(page, stepTwoKey);
    expect(edited).toContain('/* event_name */');

    await loadAnswer(page, 2);
    await expect(restoreButton(page)).toBeVisible();
    await expect(editor(page)).not.toContainText('/* event_name */');

    await restoreButton(page).click();
    await expect(restoreButton(page)).toBeHidden();
    await expect(editor(page)).toContainText('/* event_name */');
    await expect.poll(() => storedCode(page, stepTwoKey)).toBe(edited);
  });

  for (const size of desktopSizes) {
    test(`${size.width}x${size.height} で、実行の前も、失敗の後も、記録の後も、テストの後も、画面に収まる`, async ({ page }) => {
      await page.setViewportSize(size);
      await open(page, stepTwoPath);
      await expect.poll(() => lineInView(page, 'export const cancelVisit')).toBe(true);
      await expectFit(page);

      await runButton(page).click();
      await expect(message(page).getByRole('alert')).toBeVisible();
      await expectFit(page);

      await testsButton(page).click();
      await expect(summary(page)).toHaveText('pass 3 / fail 5');
      await expectFit(page);

      await fillBlanks(page, stepTwoBlanks);
      await expectFit(page);
      await runButton(page).click();
      await expectStepTwoRecorded(page);
      await expectFit(page);

      await testsButton(page).click();
      await expect(summary(page)).toHaveText('pass 8 / fail 0');
      await expectFit(page);

      await editor(page).click();
      await page.keyboard.insertText(' ');
      await resetButton(page).click();
      await expect(restoreButton(page)).toBeVisible();
      await expectFit(page);
    });
  }

  test('手元の Node の案内は、「ヒントと解答」のダイアログの中で開き、画面の配置を動かさない', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 640 });
    await open(page, stepTwoPath);
    const work = page.locator('.play-work');
    const before = await work.boundingBox();
    await openHints(page);
    await hintsDialog(page).getByText('手元の Node で動かすとき').click();
    await expect(page.locator('.play-node-body')).toContainText('chapter-2-step-2-start');
    await expect(page.locator('.play-node-body')).toContainText('pass 8');
    expect(await work.boundingBox()).toEqual(before);
    await expectFit(page);
  });

  test('1024x768 で、ステップ1もステップ2も横スクロールが出ない', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    for (const [path, step] of [[stepOnePath, 1], [stepTwoPath, 2]] as const) {
      await open(page, path);
      expect(await overflowing(page)).toBeLessThanOrEqual(0);
      await loadAnswer(page, step);
      await runButton(page).click();
      await expect(eventRows(page)).toHaveCount(1);
      await testsButton(page).click();
      await expect(summary(page)).toHaveText('pass 8 / fail 0');
      expect(await overflowing(page)).toBeLessThanOrEqual(0);
    }
  });

  for (const width of [360, 390]) {
    test(`${width} 幅では縦に並び、横にはみ出さない`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await open(page, stepTwoPath);
      expect(await overflowing(page)).toBeLessThanOrEqual(0);
      const lefts = await page.evaluate(() =>
        [...document.querySelectorAll('[data-play] > section')].map((column) =>
          Math.round(column.getBoundingClientRect().left)
        )
      );
      expect(new Set(lefts).size).toBe(1);

      await runButton(page).click();
      await expect(message(page).getByRole('alert')).toBeVisible();
      expect(await overflowing(page)).toBeLessThanOrEqual(0);

      await loadAnswer(page, 2);
      await runButton(page).click();
      await expectStepTwoRecorded(page);
      expect(await overflowing(page)).toBeLessThanOrEqual(0);

      await testsButton(page).click();
      await expect(summary(page)).toHaveText('pass 8 / fail 0');
      expect(await overflowing(page)).toBeLessThanOrEqual(0);
    });
  }

  test('ヒントは最初すべて閉じていて、1つずつ開く。解答の完成コードでテストは pass 8 / fail 0 になる', async ({ page }) => {
    await open(page, stepTwoPath);
    await expect(page.getByRole('button', { name: 'ステップ2の完成コードを読み込む' })).toBeHidden();
    await openHintsInOrder(page);
    await expect(hintsDialog(page).getByRole('button', { name: 'ステップ2の完成コードを読み込む' })).toBeVisible();
    await hintsDialog(page).getByRole('button', { name: 'ステップ2の完成コードを読み込む' }).click();
    await expect(hintsDialog(page)).toHaveJSProperty('open', false);
    await expect(editor(page)).toContainText('VisitCancelled');
    await testsButton(page).click();
    await expect(summary(page)).toHaveText('pass 8 / fail 0');
  });
});

test.describe('ヒントと解答の開閉', () => {
  for (const path of [stepOnePath, stepTwoPath]) {
    test(`${path} 「ヒントと解答」のボタンでダイアログが開き、「閉じる」ボタンと Escape キーで閉じる。閉じるとフォーカスがボタンに戻る`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 640 });
      await open(page, path);
      const opener = root(page).getByRole('button', { name: 'ヒントと解答' });
      await expect(hintsDialog(page)).toBeHidden();
      await opener.click();
      await expect(hintsDialog(page)).toBeVisible();
      await expect(hintsDialog(page).getByRole('heading', { name: 'ヒントと解答' })).toBeVisible();
      await expectAllClosed(page);
      await hintsDialog(page).getByRole('button', { name: '閉じる' }).click();
      await expect(hintsDialog(page)).toBeHidden();
      await expect(opener).toBeFocused();

      await opener.click();
      await hintSteps(page).nth(1).locator('summary').click();
      await expectOnlyOpen(page, 1);
      await page.keyboard.press('Escape');
      await expect(hintsDialog(page)).toBeHidden();
      await expect(opener).toBeFocused();
    });

    test(`${path} ダイアログの外側を押しても閉じる`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 640 });
      await open(page, path);
      await openHints(page);
      await page.mouse.click(4, 4);
      await expect(hintsDialog(page)).toBeHidden();
    });

    for (const size of [{ width: 390, height: 844 }, { width: 1280, height: 640 }]) {
      test(`${path} ${size.width}x${size.height} では、ダイアログは画面に収まり、次を開くと前が閉じる`, async ({ page }) => {
        await page.setViewportSize(size);
        await open(page, path);
        await openHints(page);
        await expectAllClosed(page);
        for (let index = 0; index < 4; index += 1) {
          await hintSteps(page).nth(index).locator('summary').click();
          await expectOnlyOpen(page, index);
        }
        const box = await hintsDialog(page).boundingBox();
        expect(box?.x ?? -1).toBeGreaterThanOrEqual(0);
        expect(box?.y ?? -1).toBeGreaterThanOrEqual(0);
        expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(size.width);
        expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(size.height);
        const inFlow = await page.evaluate(() =>
          getComputedStyle(document.querySelector('details.play-hint-step[open] > .play-hint-body') as Element).position
        );
        expect(inFlow).toBe('static');
        await expectFit(page);
      });
    }
  }
});
