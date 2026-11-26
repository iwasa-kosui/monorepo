import { expect, type Locator, type Page, test } from '@playwright/test';

const testsPath = '/chapters/chapter-1/2/';
const stepOnePath = '/chapters/chapter-2/2/';
const stepTwoPath = '/chapters/chapter-2/4/';
const projectFiles = ['db.ts', 'show-visits.ts', 'visits.test.ts', 'visits.ts', 'who-cancelled.ts'];

const scene = (page: Page): Locator => page.locator('[data-investigation]');
const ide = (page: Page): Locator => page.locator('[data-ide]');
const explorer = (page: Page): Locator => ide(page).getByRole('navigation', { name: 'エクスプローラー' });
const treeFile = (page: Page, name: string): Locator => ide(page).locator(`[data-ide-file="${name}"]`);
const toggle = (page: Page): Locator => ide(page).locator('[data-ide-toggle]');
const openTabs = (page: Page): Locator => ide(page).getByRole('tablist', { name: '開いているファイル' });
const fileTab = (page: Page, name: string): Locator => openTabs(page).locator(`[role="tab"][data-file="${name}"]`);
const closeButton = (page: Page, name: string): Locator =>
  openTabs(page).getByRole('button', { name: `${name} を閉じる` });
const editor = (page: Page): Locator => ide(page).locator('.cm-content');
const browserTabTitle = (page: Page): Locator => scene(page).locator('[role="tab"][data-tool="editor"] .tab-title');
const address = (page: Page): Locator => scene(page).locator('[data-address]');
const statusFile = (page: Page): Locator => ide(page).locator('[data-ide-status-file]');
const position = (page: Page): Locator => ide(page).locator('[data-ide-position]');

const openPlayground = async (page: Page): Promise<Locator> => {
  await page.goto(testsPath);
  const playground = page.locator('[data-playground="code"]');
  await expect(playground).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
  return playground;
};

const openScene = async (page: Page, path: string): Promise<Locator> => {
  await page.goto(path);
  const play = page.locator('[data-play="add-record"]');
  await expect(play).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
  return play;
};

const anyLineInView = (page: Page, needles: readonly string[]): Promise<boolean> =>
  page.evaluate((list) => {
    const scroller = document.querySelector<HTMLElement>('[data-ide] .cm-scroller');
    if (scroller === null) return false;
    const view = scroller.getBoundingClientRect();
    return [...scroller.querySelectorAll('.cm-line')].some((line) => {
      const box = line.getBoundingClientRect();
      return box.top >= view.top - 1 && box.bottom <= view.bottom + 1
        && list.some((needle) => (line.textContent ?? '').includes(needle));
    });
  }, needles);

const openExplorer = async (page: Page): Promise<void> => {
  if ((await toggle(page).getAttribute('aria-expanded')) !== 'true') await toggle(page).click();
  await expect(toggle(page)).toHaveAttribute('aria-expanded', 'true');
  await expect(explorer(page)).toBeVisible();
};

const lineInView = (page: Page, text: string): Promise<boolean> =>
  page.evaluate((needle) => {
    const scroller = document.querySelector<HTMLElement>('[data-ide] .cm-scroller');
    const line = [...(scroller?.querySelectorAll('.cm-line') ?? [])].find((item) =>
      (item.textContent ?? '').includes(needle)
    );
    if (scroller === null || line === undefined) return false;
    const view = scroller.getBoundingClientRect();
    const box = line.getBoundingClientRect();
    return box.top >= view.top - 1 && box.bottom <= view.bottom + 1;
  }, text);

test.describe('エディタのエクスプローラー（第1章のテストのページ）', () => {
  test.use({ viewport: { width: 1280, height: 640 } });

  test('閉じている間は全ファイルがタブに並び、EXPLORER を開くと一覧が出て、開いているファイルに印を付ける', async ({ page }) => {
    await openPlayground(page);
    await expect(toggle(page)).toHaveAccessibleName('EXPLORER を開く');
    await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
    await expect(explorer(page)).toBeHidden();
    await expect(openTabs(page).getByRole('tab')).toHaveCount(projectFiles.length);
    await expect(fileTab(page, 'visits.test.ts')).toHaveAttribute('aria-selected', 'true');
    await expect(statusFile(page)).toHaveText('visits.test.ts');
    await expect(position(page)).toHaveText('行 1、列 1');
    await expect(ide(page).locator('.ide-statusbar')).toContainText('record-cancellation');

    await openExplorer(page);
    await expect(toggle(page)).toHaveAccessibleName('EXPLORER を閉じる');
    await expect(explorer(page).locator('.ide-folder-name')).toHaveText('clinic-api');
    await expect(explorer(page).locator('.ide-name')).toHaveText(projectFiles);
    await expect(explorer(page).locator('[aria-current="true"]')).toHaveText(/visits\.test\.ts/);
  });

  test('ファイルを押すとタブが切り替わり、ブラウザのタブの題名とアドレスも変わる', async ({ page }) => {
    await openPlayground(page);
    await openExplorer(page);
    await expect(browserTabTitle(page)).toHaveText('visits.test.ts — clinic-api');
    await expect(address(page)).toHaveText('https://ide.internal.example/clinic-api/visits.test.ts');

    await treeFile(page, 'db.ts').click();
    await expect(openTabs(page).getByRole('tab')).toHaveCount(projectFiles.length);
    await expect(fileTab(page, 'db.ts')).toHaveAttribute('aria-selected', 'true');
    await expect(fileTab(page, 'visits.test.ts')).toHaveAttribute('aria-selected', 'false');
    await expect(editor(page)).toContainText('CREATE TABLE visit_cancellations');
    await expect(treeFile(page, 'db.ts')).toHaveAttribute('aria-current', 'true');
    await expect(explorer(page).locator('[aria-current="true"]')).toHaveCount(1);
    await expect(browserTabTitle(page)).toHaveText('db.ts — clinic-api');
    await expect(address(page)).toHaveText('https://ide.internal.example/clinic-api/db.ts');
    await expect(statusFile(page)).toHaveText('db.ts');

    await treeFile(page, 'visits.ts').click();
    await expect(openTabs(page).getByRole('tab')).toHaveCount(projectFiles.length);
    await expect(editor(page)).toContainText('export const cancelVisit');

    await treeFile(page, 'db.ts').click();
    await expect(fileTab(page, 'db.ts')).toHaveAttribute('aria-selected', 'true');
  });

  test('編集できないファイルは、タブに読み取りだけと出て、打っても変わらない', async ({ page }) => {
    await openPlayground(page);
    await openExplorer(page);
    await treeFile(page, 'db.ts').click();
    await expect(fileTab(page, 'db.ts')).toHaveAccessibleName(/db\.ts.*読み取りだけ/);
    await expect(editor(page)).toHaveAttribute('aria-readonly', 'true');
    await editor(page).click();
    await page.keyboard.insertText('書き込めないはず');
    await expect(editor(page)).not.toContainText('書き込めないはず');
  });

  test('EXPLORER を閉じている間は、タブを閉じられない', async ({ page }) => {
    await openPlayground(page);
    await expect(closeButton(page, 'db.ts')).toBeHidden();
    await fileTab(page, 'db.ts').focus();
    await page.keyboard.press('Delete');
    await expect(openTabs(page).getByRole('tab')).toHaveCount(projectFiles.length);
  });

  test('タブは × と Delete キーで閉じる。最後の 1 つは閉じない', async ({ page }) => {
    await openPlayground(page);
    await openExplorer(page);
    await treeFile(page, 'db.ts').click();
    await expect(fileTab(page, 'db.ts')).toHaveAttribute('aria-selected', 'true');

    await closeButton(page, 'db.ts').click();
    await expect(openTabs(page).getByRole('tab')).toHaveCount(projectFiles.length - 1);
    await expect(fileTab(page, 'db.ts')).toHaveCount(0);
    await expect(openTabs(page).locator('[aria-selected="true"]')).toHaveCount(1);

    await fileTab(page, 'visits.test.ts').focus();
    await page.keyboard.press('ArrowRight');
    await expect(openTabs(page).locator('[aria-selected="true"]')).toHaveCount(1);
    await expect(openTabs(page).getByRole('tab').and(page.locator(':focus'))).toHaveCount(1);
    await expect(fileTab(page, 'visits.test.ts')).toHaveAttribute('aria-selected', 'false');
    await page.keyboard.press('ArrowLeft');
    await expect(fileTab(page, 'visits.test.ts')).toHaveAttribute('aria-selected', 'true');
    await expect(fileTab(page, 'visits.test.ts')).toBeFocused();

    for (let remaining = projectFiles.length - 2; remaining >= 1; remaining -= 1) {
      await page.keyboard.press('Delete');
      await expect(openTabs(page).getByRole('tab')).toHaveCount(remaining);
      await expect(openTabs(page).locator('[aria-selected="true"]')).toHaveCount(1);
    }
    await page.keyboard.press('Delete');
    await expect(openTabs(page).getByRole('tab')).toHaveCount(1);
  });

  test('ほかのファイルを開いていても、テストを実行できる', async ({ page }) => {
    const playground = await openPlayground(page);
    await openExplorer(page);
    await treeFile(page, 'who-cancelled.ts').click();
    await expect(editor(page)).toContainText('LEFT JOIN visit_cancellations');
    await playground.getByRole('button', { name: 'テストを実行する' }).click();
    await expect(playground.locator('[data-role="summary"]')).toHaveText('pass 4 / fail 4');
    await expect(fileTab(page, 'who-cancelled.ts')).toHaveAttribute('aria-selected', 'true');
  });

  test('EXPLORER のボタンで一覧を開閉し、開くと編集欄が狭まる', async ({ page }) => {
    await openPlayground(page);
    const widthOf = async (): Promise<number> => (await ide(page).locator('.ide-main').boundingBox())?.width ?? 0;
    const closed = await widthOf();
    await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
    await toggle(page).click();
    await expect(toggle(page)).toHaveAttribute('aria-expanded', 'true');
    await expect(explorer(page)).toBeVisible();
    expect(await widthOf()).toBeLessThan(closed - 100);
    await toggle(page).click();
    await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
    await expect(explorer(page)).toBeHidden();
    expect(await widthOf()).toBe(closed);
  });

  test('フォルダの行で、ファイルの一覧を畳める', async ({ page }) => {
    await openPlayground(page);
    await openExplorer(page);
    const folder = explorer(page).getByRole('button', { name: 'clinic-api' });
    await expect(folder).toHaveAttribute('aria-expanded', 'true');
    await folder.click();
    await expect(folder).toHaveAttribute('aria-expanded', 'false');
    await expect(treeFile(page, 'db.ts')).toBeHidden();
    await folder.click();
    await expect(treeFile(page, 'db.ts')).toBeVisible();
  });
});

test.describe('エディタのエクスプローラー（第2章の演習の場面）', () => {
  test.use({ viewport: { width: 1280, height: 640 } });

  test('ステップ1では、db.ts を開いて visit_cancellations の定義を読める。visits.ts に戻ると同じ場所が出る', async ({ page }) => {
    await openScene(page, stepOnePath);
    await openExplorer(page);
    await expect(explorer(page).locator('.ide-name')).toHaveText(projectFiles);
    await expect.poll(() => lineInView(page, 'export const cancelVisit')).toBe(true);

    await treeFile(page, 'db.ts').click();
    await expect(fileTab(page, 'db.ts')).toHaveAttribute('aria-selected', 'true');
    await expect.poll(() => lineInView(page, 'CREATE TABLE visit_cancellations')).toBe(true);
    await expect(editor(page)).not.toContainText('business_events');
    await expect(editor(page)).toHaveAttribute('aria-readonly', 'true');

    await treeFile(page, 'visits.ts').click();
    await expect(fileTab(page, 'visits.ts')).toHaveAttribute('aria-selected', 'true');
    await expect.poll(() =>
      anyLineInView(page, [
        'export const cancelVisit',
        'withTransaction(db',
        'const visit = ',
        'visit === undefined',
        'visit.status',
      ])
    ).toBe(true);
    await expect(editor(page)).not.toHaveAttribute('aria-readonly', 'true');
  });

  test('ステップ2では、db.ts のテーブルが business_events に変わっている', async ({ page }) => {
    await openScene(page, stepTwoPath);
    await openExplorer(page);
    await treeFile(page, 'db.ts').click();
    await expect(editor(page)).toContainText('CREATE TABLE business_events');
    await expect(editor(page)).not.toContainText('visit_cancellations');
    await treeFile(page, 'visits.test.ts').click();
    await expect(editor(page)).toContainText(`SELECT * FROM business_events WHERE target_type = 'Visit'`);
  });

  test('visits.ts を編集すると、一覧に編集済みの印が出て、最初のコードに戻すと消える', async ({ page }) => {
    const play = await openScene(page, stepOnePath);
    await openExplorer(page);
    const mark = treeFile(page, 'visits.ts').locator('[data-ide-mark]');
    await expect(mark).toBeHidden();
    await play.getByRole('button', { name: /記録の雛形を/ }).click();
    await expect(mark).toBeVisible();
    await expect(treeFile(page, 'visits.ts')).toHaveAccessibleName(/visits\.ts.*編集済み/);
    await expect(treeFile(page, 'db.ts').locator('[data-ide-mark]')).toBeHidden();
    await play.getByRole('button', { name: '最初のコードに戻す' }).click();
    await expect(mark).toBeHidden();
  });

  test('ほかのファイルを開いていても、実行と雛形のボタンは visits.ts に働く', async ({ page }) => {
    const play = await openScene(page, stepOnePath);
    await openExplorer(page);
    await treeFile(page, 'db.ts').click();
    await play.getByRole('button', { name: 'ポチの来院をキャンセルする' }).click();
    await expect(play.locator('[data-role="visits-badge"]')).toHaveText('実行後');
    await expect(fileTab(page, 'db.ts')).toHaveAttribute('aria-selected', 'true');

    await play.getByRole('button', { name: /記録の雛形を/ }).click();
    await expect(fileTab(page, 'visits.ts')).toHaveAttribute('aria-selected', 'true');
    await expect(editor(page)).toContainText('/* 誰が */');
    await expect(position(page)).toHaveText(/^行 \d+、列 \d+$/);
  });
});

test.describe('エディタのエクスプローラー（スマートフォンの幅）', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('一覧は畳まれていて、上の帯を押すと編集欄に重なって開く。ファイルを選ぶと閉じる', async ({ page }) => {
    await openScene(page, stepOnePath);
    await expect(explorer(page)).toBeHidden();
    await expect(toggle(page)).toBeVisible();
    await expect(toggle(page)).toHaveAccessibleName('EXPLORER を開く');
    await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
    await expect(editor(page)).toBeInViewport();

    await toggle(page).click();
    await expect(toggle(page)).toHaveAttribute('aria-expanded', 'true');
    await expect(explorer(page)).toBeVisible();
    await expect(explorer(page).locator('.ide-name')).toHaveText(projectFiles);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    await treeFile(page, 'db.ts').click();
    await expect(explorer(page)).toBeHidden();
    await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
    await expect(fileTab(page, 'db.ts')).toHaveAttribute('aria-selected', 'true');
    await expect(editor(page)).toContainText('CREATE TABLE visit_cancellations');
  });

  test('開いた一覧は、Escape キーと、外側を押すことで閉じる', async ({ page }) => {
    await openScene(page, stepOnePath);
    await toggle(page).click();
    await expect(explorer(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(explorer(page)).toBeHidden();
    await expect(toggle(page)).toBeFocused();

    await toggle(page).click();
    await expect(explorer(page)).toBeVisible();
    const scrim = ide(page).locator('[data-ide-scrim]');
    const box = await scrim.boundingBox();
    await scrim.click({ position: { x: (box?.width ?? 0) - 8, y: Math.min((box?.height ?? 0) / 2, 40) } });
    await expect(explorer(page)).toBeHidden();
  });
});
