import { expect, type Locator, type Page, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const path = '/chapters/chapter-2/2/';
const loadTimeout = 60_000;

const startCode = readFileSync(
  fileURLToPath(new URL('../exercises/chapter-1-start/visits.ts', import.meta.url)),
  'utf8',
);
const brokenCode = startCode.replace(
  '.run(input.visitId);\n  });',
  '.run(input.visitId, input.reason);\n  });',
);
const probeCode =
  `import type { DatabaseSync } from 'node:sqlite';\n\nexport const probe = (db: DatabaseSync): void => {\n  `;

const root = (page: Page): Locator => page.locator('[data-play="add-record"]');
const editor = (page: Page): Locator => root(page).locator('.cm-content');
const errors = (page: Page): Locator => root(page).locator('.cm-lintRange-error');
const options = (page: Page): Locator => page.locator('.cm-tooltip-autocomplete [role="option"]');

const open = async (page: Page): Promise<void> => {
  await page.goto(path);
  await expect(root(page)).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
};

const replaceCode = async (page: Page, code: string): Promise<void> => {
  await editor(page).click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.insertText(code);
};

test.describe('第2章のエディタの型チェック', () => {
  test('テストデータの前提: 壊したコードは開始コードと違う', () => {
    expect(brokenCode).not.toBe(startCode);
  });

  test('型エラーになるコードを入力すると診断が表示され、直すと消える', async ({ page }) => {
    await open(page);
    await replaceCode(page, brokenCode);
    await expect(errors(page).first()).toBeVisible({ timeout: loadTimeout });
    await expect(errors(page).first()).toHaveText('reason');
    await expect(root(page).locator('.cm-lint-marker-error').first()).toBeVisible();
    await replaceCode(page, startCode);
    await expect(errors(page)).toHaveCount(0, { timeout: loadTimeout });
    await expect(root(page).locator('.cm-lint-marker-error')).toHaveCount(0);
  });

  test('「最初のコードに戻す」の後も診断が動く', async ({ page }) => {
    await open(page);
    await replaceCode(page, brokenCode);
    await expect(errors(page).first()).toBeVisible({ timeout: loadTimeout });
    await page.getByRole('button', { name: '最初のコードに戻す' }).click();
    await expect(errors(page)).toHaveCount(0, { timeout: loadTimeout });
    await replaceCode(page, brokenCode);
    await expect(errors(page).first()).toBeVisible({ timeout: loadTimeout });
  });

  test('雛形を入れると、型に足していない input.reason が波線になる', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: /記録の雛形を/ }).click();
    await expect(errors(page).first()).toBeVisible({ timeout: loadTimeout });
  });

  test('db. と入力すると補完候補に prepare が出て、Enter で確定できる', async ({ page }) => {
    await open(page);
    await replaceCode(page, probeCode);
    await page.keyboard.type('db.');
    await expect(options(page).filter({ hasText: 'prepare' })).toHaveCount(1, { timeout: loadTimeout });
    await expect(options(page).filter({ hasText: 'exec' })).toHaveCount(1);
    await page.keyboard.type('pre');
    await expect(options(page)).toHaveCount(1);
    await page.waitForTimeout(200);
    await page.keyboard.press('Enter');
    await expect(editor(page)).toContainText('db.prepare');
    await expect(page.locator('.cm-tooltip-autocomplete')).toHaveCount(0);
  });

  test('補完が開いている間、上下の矢印は候補の移動に使い、Escape で閉じる', async ({ page }) => {
    await open(page);
    await replaceCode(page, probeCode);
    await page.keyboard.type('db.');
    await expect(options(page).first()).toBeVisible({ timeout: loadTimeout });
    const selected = page.locator('.cm-tooltip-autocomplete [role="option"][aria-selected="true"]');
    await page.waitForTimeout(200);
    const before = await selected.textContent();
    await page.keyboard.press('ArrowDown');
    await expect.poll(async () => selected.textContent()).not.toBe(before);
    await page.keyboard.press('Escape');
    await expect(page.locator('.cm-tooltip-autocomplete')).toHaveCount(0);
  });

  test('補完が開いていても、左右の矢印キーでページは移動しない', async ({ page }) => {
    await open(page);
    await page.waitForLoadState('load');
    await replaceCode(page, probeCode);
    await page.keyboard.type('db.');
    await expect(options(page).first()).toBeVisible({ timeout: loadTimeout });
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(300);
    expect(new URL(page.url()).pathname).toBe(path);
  });

  test('Tab キーでエディタから抜けられ、補完の確定には使われない', async ({ page }) => {
    await open(page);
    await replaceCode(page, probeCode);
    await page.keyboard.type('db.');
    await expect(options(page).first()).toBeVisible({ timeout: loadTimeout });
    await page.keyboard.press('Tab');
    const stillInEditor = await page.evaluate(() => document.activeElement?.closest('.cm-editor') !== null);
    expect(stillInEditor).toBe(false);
    await expect(editor(page)).toHaveText(/db\.\s*$/);
  });

  test('型チェックを入れても、実行とテストの実行は従来どおり動く', async ({ page }) => {
    await open(page);
    await root(page).getByRole('button', { name: 'ポチの来院をキャンセルする' }).click();
    await expect(page.locator('[data-role="visits-body"] td').nth(2)).toHaveText('cancelled');
    await root(page).getByRole('button', { name: 'テストを実行する' }).click();
    await expect(page.locator('[data-role="summary"]')).toHaveText('pass 4 / fail 4');
  });

  test('第2章4ページ目でも診断が動く', async ({ page }) => {
    await page.goto('/chapters/chapter-2/4/');
    await expect(root(page)).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
    await replaceCode(page, `${startCode}\nexport const broken: number = 'text';\n`);
    await expect(errors(page).first()).toBeVisible({ timeout: loadTimeout });
  });
});
