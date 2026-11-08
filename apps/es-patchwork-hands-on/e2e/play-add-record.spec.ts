import { expect, type Locator, type Page, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const path = '/play/add-record/';
const storageKey = 'es-patchwork-hands-on:code:play-add-record';
const missing = '記録にありません';
const pochiTest = 'キャンセルした人と理由を答えられる';

const exercise = (snapshot: string): string =>
  readFileSync(fileURLToPath(new URL(`../exercises/${snapshot}/visits.ts`, import.meta.url)), 'utf8');

const cancelVisitOf = (snapshot: string): string => {
  const lines = exercise(snapshot).split('\n');
  const start = lines.findIndex((line) => line.startsWith('export const cancelVisit ='));
  const end = lines.findIndex((line, index) => index > start && line === '};');
  return lines.slice(start, end + 1).join('\n');
};

const blankValues = ['\'VisitCancelled\'', 'input.visitId', '\'Visit\'', 'JSON.stringify(cancelled)'];

const root = (page: Page): Locator => page.locator('[data-play="add-record"]');
const runButton = (page: Page): Locator => page.getByRole('button', { name: 'ポチの来院をキャンセルする' });
const templateButton = (page: Page): Locator => page.getByRole('button', { name: /記録の雛形を/ });
const testsButton = (page: Page): Locator => page.getByRole('button', { name: 'テストを実行する' });
const visitStatus = (page: Page): Locator => page.locator('[data-role="visits-body"] td').nth(2);
const eventRows = (page: Page): Locator => page.locator('[data-role="event-row"]');
const answer = (page: Page, key: string): Locator => page.locator(`[data-answer="${key}"] [data-role="answer-value"]`);
const summary = (page: Page): Locator => page.locator('[data-role="summary"]');
const next = (page: Page): Locator => page.locator('[data-role="next"]');
const message = (page: Page): Locator => page.locator('[data-role="message"]');

const open = async (page: Page): Promise<void> => {
  await page.goto(path);
  await expect(root(page)).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
  await expect(visitStatus(page)).toHaveText('reserved');
  await expect(runButton(page)).toBeEnabled();
};

const replaceCode = async (page: Page, code: string): Promise<void> => {
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.insertText(code);
};

const fillBlanks = async (page: Page): Promise<void> => {
  await templateButton(page).click();
  await expect(page.locator('.cm-content')).toContainText('/* event_name */');
  for (const [index, value] of blankValues.entries()) {
    await page.keyboard.type(value);
    if (index < blankValues.length - 1) {
      await page.keyboard.press('Tab');
    }
  }
};

const expectNoAnswers = async (page: Page): Promise<void> => {
  for (const key of ['when', 'what', 'who', 'why']) {
    await expect(answer(page, key)).toHaveText(missing);
  }
};

const expectRecorded = async (page: Page): Promise<void> => {
  await expect(visitStatus(page)).toHaveText('cancelled');
  await expect(eventRows(page)).toHaveCount(1);
  await expect(eventRows(page).locator('tr').filter({ hasText: 'event_name' }).locator('td')).toHaveText(
    'VisitCancelled',
  );
  await expect(answer(page, 'when')).toHaveText(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/);
  await expect(answer(page, 'what')).toHaveText('VisitCancelled');
  await expect(answer(page, 'who')).toHaveText(missing);
  await expect(answer(page, 'why')).toHaveText(missing);
};

type Fit = {
  pageHeight: number;
  viewHeight: number;
  pageWidth: number;
  viewWidth: number;
  clipped: string[];
  below: string[];
};

const measureFit = (page: Page): Promise<Fit> =>
  page.evaluate(() => {
    const columns = [...document.querySelectorAll<HTMLElement>('.play-col')];
    return {
      pageHeight: document.documentElement.scrollHeight,
      viewHeight: window.innerHeight,
      pageWidth: document.documentElement.scrollWidth,
      viewWidth: window.innerWidth,
      clipped: columns.filter((column) => column.scrollHeight > column.clientHeight + 1).map((column) =>
        column.getAttribute('aria-label') ?? ''
      ),
      below: columns.flatMap((column) => [...column.children]).filter((child) =>
        !(child as HTMLElement).hidden && child.getBoundingClientRect().bottom > window.innerHeight + 1
      ).map((child) => child.getAttribute('aria-label') ?? child.className),
    };
  });

const expectFit = async (page: Page): Promise<void> => {
  const fit = await measureFit(page);
  expect(fit.pageHeight).toBeLessThanOrEqual(fit.viewHeight);
  expect(fit.pageWidth).toBeLessThanOrEqual(fit.viewWidth);
  expect(fit.clipped).toEqual([]);
  expect(fit.below).toEqual([]);
};

const expectWholeFunctionVisible = async (page: Page): Promise<void> => {
  const editor = await page.evaluate(() => {
    const scroller = document.querySelector<HTMLElement>('.cm-scroller');
    const lines = [...(scroller?.querySelectorAll('.cm-line') ?? [])];
    const last = lines[lines.length - 1];
    return {
      scrollTop: scroller?.scrollTop ?? -1,
      scrollHeight: scroller?.scrollHeight ?? 0,
      clientHeight: scroller?.clientHeight ?? 0,
      scrollWidth: scroller?.scrollWidth ?? 0,
      clientWidth: scroller?.clientWidth ?? 0,
      lastText: last?.textContent ?? '',
      lastBottom: last?.getBoundingClientRect().bottom ?? Infinity,
      scrollerBottom: scroller?.getBoundingClientRect().bottom ?? 0,
      viewHeight: window.innerHeight,
    };
  });
  expect(editor.lastText).toBe('};');
  expect(editor.scrollTop).toBe(0);
  expect(editor.scrollHeight).toBeLessThanOrEqual(editor.clientHeight + 1);
  expect(editor.scrollWidth).toBeLessThanOrEqual(editor.clientWidth + 1);
  expect(editor.lastBottom).toBeLessThanOrEqual(editor.scrollerBottom + 1);
  expect(editor.scrollerBottom).toBeLessThanOrEqual(editor.viewHeight);
};

const runningAnimations = (page: Page): Promise<number> =>
  page.evaluate(() =>
    document.getAnimations().filter((animation) =>
      animation instanceof CSSAnimation && animation.animationName.startsWith('play-')
    ).length
  );

test.describe('追体験の画面 /play/add-record/', () => {
  test('どのページからもリンクされず、noindex が付いている', async ({ page, request }) => {
    await page.goto(path);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
    await expect(page.locator('nav[aria-label="ページの移動"]')).toHaveCount(0);
    for (const from of ['/', '/setup/', '/chapters/chapter-2/5/']) {
      const html = await (await request.get(from)).text();
      expect(html).not.toContain('/play/add-record');
    }
  });

  for (const size of [{ width: 1280, height: 640 }, { width: 1440, height: 790 }]) {
    test(`${size.width}x${size.height} で、実行の前も後も答えが埋まった後も、ページ全体にスクロールが出ない`, async ({ page }) => {
      await page.setViewportSize(size);
      await open(page);
      await expect(page.getByRole('heading', { name: 'この来院がキャンセルになっているのはなぜですか。' }))
        .toBeVisible();
      await expectWholeFunctionVisible(page);
      await expectFit(page);

      await runButton(page).click();
      await expect(visitStatus(page)).toHaveText('cancelled');
      await expectFit(page);

      await fillBlanks(page);
      await expectFit(page);
      await runButton(page).click();
      await expect(answer(page, 'what')).toHaveText('VisitCancelled');
      await expectFit(page);

      await testsButton(page).click();
      await expect(summary(page)).toHaveText('pass 7 / fail 1');
      await expectFit(page);
    });
  }

  test('実行の前は reserved で business_events が空。画面を開いただけでは動かない', async ({ page }) => {
    await open(page);
    await expect(page.locator('[data-role="visits-badge"]')).toHaveText('実行前');
    await expect(page.locator('[data-role="events-empty"]')).toBeVisible();
    await expect(page.locator('[data-role="blanks"]')).toBeHidden();
    expect(await runningAnimations(page)).toBe(0);
  });

  test('段階1: 何も編集せずに実行すると、visits は cancelled になり、business_events は 0 行のまま', async ({ page }) => {
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
    await expectNoAnswers(page);
    await expect(next(page)).toContainText('「記録の雛形を UPDATE の次の行に入れる」を押します。');
  });

  test('段階2から4: 雛形の空欄をキーボードで埋めて実行し、テストは pass 7 / fail 1 になる', async ({ page }) => {
    await open(page);
    await runButton(page).click();
    await expect(visitStatus(page)).toHaveText('cancelled');

    await templateButton(page).click();
    await expect(page.locator('.cm-content')).toContainText('/* event_name */');
    await expect(page.locator('[data-role="blanks"]')).toBeVisible();
    await expect(page.locator('[data-role="blanks"] tbody td')).toHaveText([
      '/* event_name */',
      '\'VisitCancelled\'',
      '/* target_id */',
      'input.visitId',
      '/* target_type */',
      '\'Visit\'',
      '/* target_state */',
      'JSON.stringify(cancelled)',
    ]);
    await expect(templateButton(page)).toBeDisabled();

    for (const [index, value] of blankValues.entries()) {
      await page.keyboard.type(value);
      if (index < blankValues.length - 1) {
        await page.keyboard.press('Tab');
      }
    }
    await expect(page.locator('.cm-content')).not.toContainText('/* ');

    await runButton(page).click();
    await expectRecorded(page);
    await expect(page.locator('[data-role="events-caption"]')).toHaveText('0 行から 1 行に増えました。');
    await expect(page.locator('[data-role="events-badge"]')).toHaveText('実行後');
    await expect(next(page)).toContainText('答えの欄の「いつ」「何を」が埋まりました。');

    await testsButton(page).click();
    await expect(summary(page)).toHaveText('pass 7 / fail 1');
    await expect(page.locator('[data-role="failed"] li')).toHaveCount(1);
    await expect(page.locator('[data-role="failed"] li')).toContainText(pochiTest);
    await expect(next(page)).toContainText(`残りの 1 件は「${pochiTest}」です。`);
    await expect(next(page)).toContainText('答えの欄の「誰が」「なぜ」が「記録にありません」なのと対応しています。');
  });

  test('最初のコードのままテストを実行すると、pass 4 / fail 4 になる', async ({ page }) => {
    await open(page);
    await testsButton(page).click();
    await expect(summary(page)).toHaveText('pass 4 / fail 4');
    await expect(page.locator('[data-role="failed"] li')).toHaveCount(4);
  });

  test('完成コードの読み込み: 実行すると business_events が 1 行増え、最初のコードに戻すと実行前の表示に戻る', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'ステップ1の完成コードを読み込む' }).click();
    await expect(page.locator('.cm-content')).toContainText('VisitCancelled');
    await expect(templateButton(page)).toBeDisabled();
    await runButton(page).click();
    await expectRecorded(page);
    await testsButton(page).click();
    await expect(summary(page)).toHaveText('pass 7 / fail 1');

    await page.getByRole('button', { name: '最初のコードに戻す' }).click();
    await expect(page.locator('.cm-content')).not.toContainText('VisitCancelled');
    await expect(templateButton(page)).toBeEnabled();
    await expect(visitStatus(page)).toHaveText('reserved');
    await expect(page.locator('[data-role="visits-badge"]')).toHaveText('実行前');
    await expect(eventRows(page)).toHaveCount(0);
    await expect(summary(page)).toHaveText('まだ実行していません');
    await expect(page.locator('[data-role="failed"] li')).toHaveCount(0);
    for (const key of ['when', 'what', 'who', 'why']) {
      await expect(answer(page, key)).toHaveText('まだ実行していません');
    }
    expect(await runningAnimations(page)).toBe(0);

    await runButton(page).click();
    await expect(visitStatus(page)).toHaveText('cancelled');
    await expect(eventRows(page)).toHaveCount(0);
    await expectNoAnswers(page);
  });

  test('構文エラーでは実際のエラーの文を同じ場所に出し、直せばもう一度実行できる', async ({ page }) => {
    await open(page);
    await replaceCode(page, 'export const cancelVisit = (db, input => {');
    await runButton(page).click();
    await expect(message(page).getByRole('alert')).toContainText('コードを最後まで実行できませんでした');
    await expect(message(page).getByRole('alert')).toContainText('SyntaxError');
    await expect(visitStatus(page)).toHaveText('reserved');
    await expect(runButton(page)).toBeEnabled();

    await replaceCode(page, 'export const cancelVisit = (db, input) => { throw new Error(\'わざと失敗\'); };');
    await runButton(page).click();
    await expect(message(page).getByRole('alert')).toContainText('cancelVisit がエラーを出しました');
    await expect(message(page).getByRole('alert')).toContainText('わざと失敗');
    await expect(visitStatus(page)).toHaveText('reserved');
    await expect(runButton(page)).toBeEnabled();

    await page.getByRole('button', { name: '最初のコードに戻す' }).click();
    await expect(message(page)).toBeHidden();
    await runButton(page).click();
    await expect(visitStatus(page)).toHaveText('cancelled');
    await expect(message(page)).toBeHidden();
  });

  test('編集したコードは保存され、ページを開き直しても残る。最初のコードに戻すと保存も消える', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'ステップ1の完成コードを読み込む' }).click();
    await expect.poll(() => page.evaluate((key) => window.localStorage.getItem(key), storageKey)).toContain(
      'VisitCancelled',
    );
    await open(page);
    await expect(page.locator('.cm-content')).toContainText('VisitCancelled');
    await page.getByRole('button', { name: '最初のコードに戻す' }).click();
    await expect.poll(() => page.evaluate((key) => window.localStorage.getItem(key), storageKey)).toBeNull();
  });

  test('読み込む完成コードは、ステップ1の実ファイルの cancelVisit と同じ', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'ステップ1の完成コードを読み込む' }).click();
    await expect.poll(() => page.evaluate((key) => window.localStorage.getItem(key), storageKey)).toBe(
      JSON.stringify({ cancelVisit: cancelVisitOf('chapter-2-step-1') }),
    );
  });

  test('動きはボタンを押したときだけで、1 秒以内に終わる', async ({ page }) => {
    await open(page);
    expect(await runningAnimations(page)).toBe(0);
    await page.getByRole('button', { name: 'ステップ1の完成コードを読み込む' }).click();
    expect(await runningAnimations(page)).toBe(0);
    await runButton(page).click();
    await expect(visitStatus(page)).toHaveText('cancelled');
    const end = await page.evaluate(() =>
      Math.max(
        0,
        ...document.getAnimations().filter((animation) =>
          animation instanceof CSSAnimation && animation.animationName.startsWith('play-')
        ).map((animation) => Number(animation.effect?.getComputedTiming().endTime ?? 0)),
      )
    );
    expect(end).toBeGreaterThan(0);
    expect(end).toBeLessThanOrEqual(1000);
    const names = await page.evaluate(() => ({
      status: getComputedStyle(document.querySelector('[data-changed]') as Element).animationName,
      row: getComputedStyle(document.querySelector('[data-role="event-row"]') as Element).animationName,
    }));
    expect(names.status).not.toBe('none');
    expect(names.row).not.toBe('none');
  });

  test('記録が無いコードでは、行が増えず、空の枠が 0 行のままと分かる', async ({ page }) => {
    await open(page);
    await runButton(page).click();
    await expect(visitStatus(page)).toHaveText('cancelled');
    await expect(eventRows(page)).toHaveCount(0);
    const empty = await page.evaluate(() =>
      getComputedStyle(document.querySelector('[data-role="events-empty"]') as Element).animationName
    );
    expect(empty).not.toBe('none');
    await expect(page.locator('[data-role="events-empty"]')).toHaveCSS('border-top-style', 'dashed');
  });

  test('prefers-reduced-motion: reduce では動きが無く、値は同じように読める', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page);
    await page.getByRole('button', { name: 'ステップ1の完成コードを読み込む' }).click();
    await runButton(page).click();
    await expectRecorded(page);
    expect(await runningAnimations(page)).toBe(0);
    const names = await page.evaluate(() => {
      const names = (selector: string, pseudo?: string): string =>
        getComputedStyle(document.querySelector(selector) as Element, pseudo).animationName;
      return [
        names('[data-changed]'),
        names('[data-changed]', '::before'),
        names('[data-changed] .play-new-value'),
        names('[data-role="event-row"]'),
        names('[data-answer="when"] [data-role="answer-value"]'),
      ];
    });
    expect(names).toEqual(['none', 'none', 'none', 'none', 'none']);
    await expect(visitStatus(page)).toHaveCSS('opacity', '1');
    await expect(eventRows(page).first()).toHaveCSS('opacity', '1');
  });

  test('prefers-reduced-motion: reduce で business_events が増えない場合も動かない', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page);
    await runButton(page).click();
    await expect(visitStatus(page)).toHaveText('cancelled');
    expect(await runningAnimations(page)).toBe(0);
    await expectNoAnswers(page);
  });

  for (const width of [360, 390]) {
    test(`${width} 幅では縦に並び、横にはみ出さない`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await open(page);
      const overflowing = (): Promise<number> =>
        page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(await overflowing()).toBeLessThanOrEqual(0);
      const lefts = await page.evaluate(() =>
        [...document.querySelectorAll('.play-col')].map((column) => Math.round(column.getBoundingClientRect().left))
      );
      expect(new Set(lefts).size).toBe(1);

      await runButton(page).click();
      await expect(visitStatus(page)).toHaveText('cancelled');
      expect(await overflowing()).toBeLessThanOrEqual(0);

      await page.getByRole('button', { name: 'ステップ1の完成コードを読み込む' }).click();
      await runButton(page).click();
      await expectRecorded(page);
      expect(await overflowing()).toBeLessThanOrEqual(0);

      await testsButton(page).click();
      await expect(summary(page)).toHaveText('pass 7 / fail 1');
      expect(await overflowing()).toBeLessThanOrEqual(0);
    });
  }
});
