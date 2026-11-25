import { expect, type Locator, type Page, test } from '@playwright/test';

const motions = ['no-preference', 'reduce'] as const;

const scene = (page: Page): Locator => page.locator('[data-investigation]');
const tab = (page: Page, name: RegExp): Locator => scene(page).getByRole('tab', { name });
const panelOf = (page: Page, tool: string): Locator => scene(page).locator(`[data-tool="${tool}"][role="tabpanel"]`);

const runSelect = async (panel: Locator): Promise<void> => {
  const playground = panel.locator('[data-playground="sql"]');
  await expect(playground.locator('.cm-content')).toContainText('SELECT * FROM visits;');
  await playground.locator('[data-role="run"]').click();
};

const unknown = 'まだ分からない';
const missing = 'どこにも残っていない';
const memoKeys = ['who', 'when', 'what', 'why'] as const;
const memo = (page: Page, key: string): Locator => scene(page).locator(`[data-memo="${key}"]`);
const unseen = (page: Page, name: RegExp): Locator => tab(page, name).locator('[data-unseen]');

const expectMemo = async (
  page: Page,
  expected: Readonly<Record<(typeof memoKeys)[number], readonly [string, string]>>,
): Promise<void> => {
  for (const key of memoKeys) {
    await expect(memo(page, key), key).toHaveAttribute('data-state', expected[key][0]);
    await expect(memo(page, key), key).toHaveText(expected[key][1]);
  }
};

const allUnknown = {
  who: ['unknown', unknown],
  when: ['unknown', unknown],
  what: ['unknown', unknown],
  why: ['unknown', unknown],
} as const;

const openCancelLog = async (page: Page): Promise<void> => {
  await scene(page).locator('[data-query]').fill('visit-pochi');
  await expect(scene(page).locator('[data-log-row]:visible')).toHaveCount(2);
  await expect(scene(page).locator('[data-log-row]:visible').first()).toContainText(
    'POST /visits/visit-pochi/cancel 200 12ms',
  );
  await expect(scene(page).locator('[data-log-row]:visible').first()).toContainText('Nov 06 18:11:58');
  await scene(page).locator('[data-log-row]:visible').first().click();
  await expect(scene(page).getByRole('region', { name: 'ログの詳細' })).toBeVisible();
};

for (const reducedMotion of motions) {
  test.describe(`導入の 6 ページ目（reducedMotion: ${reducedMotion}）`, () => {
    test.use({ reducedMotion });

    test('初期表示は、問い合わせのチャットと、4 行とも分からない調査メモだけが出ている', async ({ page }) => {
      await page.goto('/chapters/intro/6/');

      await expect(page.locator('.lesson-frame')).toHaveClass(/lesson-frame--immersive/);
      await expect(
        page.getByRole('heading', { level: 2, name: 'アクセスログとDBバックアップでは何が解決できないのか' }),
      ).toBeAttached();
      await expect(page.locator('[data-evidence-result]')).toHaveCount(0);
      await expect(page.getByRole('button', { name: '分かったことを見る' })).toHaveCount(0);
      await expect(page.locator('.intro-text')).toHaveCount(0);

      await expect(scene(page).getByRole('tab')).toHaveCount(3);
      await expect(tab(page, /ログの検索/)).toContainText('アクセスログ');
      await expect(tab(page, /DB コンソール/)).toContainText('DB');
      await expect(tab(page, /定期バックアップ/)).toBeVisible();
      await expect(tab(page, /エージェント/)).toHaveCount(0);
      await expect(unseen(page, /ログの検索/)).toBeVisible();
      await expect(unseen(page, /DB コンソール/)).toBeVisible();
      await expect(unseen(page, /定期バックアップ/)).toBeVisible();

      await expect(scene(page).locator('[data-feed] .post .post-text')).toHaveText([
        'ポチちゃんの来院です（visit-pochi）。誰がいつなんでキャンセルしたか、わかりますか？',
        'なんで記録取ってないんですか',
      ]);
      await expect(scene(page).locator('.compose-foot .actions button')).toHaveCount(0);
      await expect(scene(page).locator('.memo-title')).toHaveText('調査メモ');
      await expect(scene(page).locator('.memo-list dt')).toHaveText(['誰が', 'いつ', '何を', 'なぜ']);
      await expectMemo(page, allUnknown);
    });

    test('アクセスログでポチのキャンセルの行を開くと「いつ」が分かる。検索しただけでは分からない', async ({ page }) => {
      await page.goto('/chapters/intro/6/');

      await scene(page).locator('[data-query]').fill('visit-pochi');
      await expect(scene(page).locator('[data-log-row]:visible')).toHaveCount(2);
      await expectMemo(page, allUnknown);

      await openCancelLog(page);
      await expectMemo(page, { ...allUnknown, when: ['found', '2026-11-06 18:11:58'] });
      await expect(unseen(page, /ログの検索/)).toBeHidden();
    });

    test('復元した DB で SELECT すると「何を」が分かり、「誰が」と「なぜ」はどこにも残っていないと分かる', async ({ page }) => {
      test.setTimeout(60_000);
      await page.goto('/chapters/intro/6/');
      await openCancelLog(page);

      await tab(page, /DB コンソール/).click();
      const current = panelOf(page, 'console');
      await runSelect(current);
      await expect(current.locator('[data-role="results"] tbody td')).toHaveText([
        'visit-pochi',
        'ポチ',
        'cancelled',
        'visit-tama',
        'タマ',
        'cancelled',
      ]);
      await expectMemo(page, { ...allUnknown, when: ['found', '2026-11-06 18:11:58'] });
      await expect(unseen(page, /DB コンソール/)).toBeHidden();

      await tab(page, /定期バックアップ/).click();
      const backup = panelOf(page, 'backup');
      const restored = backup.locator('[data-playground="sql"]');
      const restoreButton = backup.getByRole('button', { name: '復元する' });
      await expect(backup.getByRole('group', { name: '毎日 0:00 の定期バックアップ' })).toBeVisible();
      await expect(backup.getByRole('radio')).toHaveCount(3);
      await expect(backup.locator('label')).toHaveText(['2026-11-04 00:00', '2026-11-05 00:00', '2026-11-06 00:00']);
      await expect(backup.getByRole('radio', { name: '2026-11-06 00:00' })).toBeChecked();
      await expect(restored).toBeHidden();
      await expect(backup.getByText('復元しています')).toBeHidden();

      await restoreButton.click();
      await expect(backup.getByText('復元しています')).toBeVisible();
      await expect(restoreButton).toBeDisabled();
      await expect(backup.getByRole('radio').first()).toBeDisabled();
      await expect(restored).toBeHidden();
      await expect(backup.getByRole('heading', { name: /復元した DB/ })).toBeHidden();
      await expectMemo(page, { ...allUnknown, when: ['found', '2026-11-06 18:11:58'] });

      await expect(backup.getByRole('heading', { name: '復元した DB（2026-11-06 00:00 時点）' })).toBeVisible({
        timeout: 10_000,
      });
      await expect(backup.getByText('復元しています')).toBeHidden();
      await expect(restoreButton).toBeEnabled();
      await expect(restored).toBeVisible();
      await expectMemo(page, { ...allUnknown, when: ['found', '2026-11-06 18:11:58'] });

      await runSelect(backup);
      await expect(restored.locator('[data-role="results"] tbody td')).toHaveText([
        'visit-pochi',
        'ポチ',
        'reserved',
        'visit-tama',
        'タマ',
        'reserved',
      ]);
      await expectMemo(page, {
        who: ['missing', missing],
        when: ['found', '2026-11-06 18:11:58'],
        what: ['found', 'reserved から cancelled'],
        why: ['missing', missing],
      });
      await expect(unseen(page, /定期バックアップ/)).toBeHidden();

      await tab(page, /DB コンソール/).click();
      await expect(current.locator('[data-role="results"] tbody td').nth(2)).toHaveText('cancelled');
    });

    test('別のバックアップを選んで復元し直すと、もう一度待ってから復元した DB が置き換わる', async ({ page }) => {
      test.setTimeout(60_000);
      await page.goto('/chapters/intro/6/');
      await tab(page, /定期バックアップ/).click();
      const backup = panelOf(page, 'backup');
      const restored = backup.locator('[data-playground="sql"]');
      const heading = (label: string): Locator => backup.getByRole('heading', { name: `復元した DB（${label} 時点）` });

      await backup.getByRole('button', { name: '復元する' }).click();
      await expect(heading('2026-11-06 00:00')).toBeVisible({ timeout: 10_000 });
      await restored.locator('.cm-content').click();
      await page.keyboard.press('ControlOrMeta+a');
      await page.keyboard.insertText(`UPDATE visits SET status = 'checked_in';`);
      await restored.locator('[data-role="run"]').click();
      await expect(restored.locator('[data-role="results"]')).toContainText('2 行を変更しました');
      await expectMemo(page, { ...allUnknown, what: ['found', 'reserved から cancelled'] });

      await backup.getByRole('radio', { name: '2026-11-04 00:00' }).check();
      await backup.getByRole('button', { name: '復元する' }).click();
      await expect(backup.getByText('復元しています')).toBeVisible();
      await expect(restored).toBeHidden();
      await expect(heading('2026-11-04 00:00')).toBeVisible({ timeout: 10_000 });
      await expect(restored).toBeVisible();
      await expect(restored.locator('.cm-content')).toContainText('SELECT * FROM visits;');
      await restored.locator('[data-role="run"]').click();
      await expect(restored.locator('[data-role="results"] tbody td')).toHaveText([
        'visit-pochi',
        'ポチ',
        'reserved',
        'visit-tama',
        'タマ',
        'reserved',
      ]);

      await tab(page, /ログの検索/).click();
      await openCancelLog(page);
      await expectMemo(page, {
        who: ['missing', missing],
        when: ['found', '2026-11-06 18:11:58'],
        what: ['found', 'reserved から cancelled'],
        why: ['missing', missing],
      });
    });
  });
}

test('図解のボタンにフォーカスがないときは、矢印キーで次のページへ移動する', async ({ page }) => {
  await page.goto('/chapters/intro/');
  await page.keyboard.press('ArrowRight');
  await expect(page).toHaveURL(/\/chapters\/intro\/2\/$/);
});
