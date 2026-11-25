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

for (const reducedMotion of motions) {
  test.describe(`導入の 6 ページ目（reducedMotion: ${reducedMotion}）`, () => {
    test.use({ reducedMotion });

    test('アクセスログとDBバックアップで調べ、ボタンを押すと分かったことの表が出る', async ({ page }) => {
      test.setTimeout(60_000);
      await page.goto('/chapters/intro/6/');
      const result = page.locator('[data-evidence-result]');
      const toggle = result.getByRole('button', { name: '分かったことを見る' });

      await expect(
        page.getByRole('heading', { level: 2, name: 'アクセスログとDBバックアップでは何が解決できないのか' }),
      ).toBeVisible();
      await expect(
        page.getByText(
          'アクセスログとDBバックアップに、誰が、いつ、何を、なぜは残っているでしょうか。2ページ目のポチのキャンセルを、もう一度調べてみましょう。',
        ),
      ).toBeVisible();
      await expect(page.locator('.intro-text ol li')).toHaveText([
        '「アクセスログ」のタブで、visit-pochi を検索します。',
        '「定期バックアップ」のタブで、今日 0:00 のバックアップを復元します。',
        '復元した DB の visits と、「DB」のタブの今の visits を比べます。',
        '「分かったことを見る」を押します。',
      ]);
      await expect(scene(page).getByRole('tab')).toHaveCount(3);
      await expect(tab(page, /ログの検索/)).toContainText('アクセスログ');
      await expect(tab(page, /DB コンソール/)).toContainText('DB');
      await expect(tab(page, /定期バックアップ/)).toBeVisible();

      await scene(page).locator('[data-query]').fill('visit-pochi');
      await expect(scene(page).locator('[data-log-row]:visible')).toHaveCount(2);
      await expect(scene(page).locator('[data-log-row]:visible').first()).toContainText(
        'POST /visits/visit-pochi/cancel 200 12ms',
      );
      await expect(scene(page).locator('[data-log-row]:visible').first()).toContainText('Nov 06 18:11:58');

      await tab(page, /DB コンソール/).click();
      const current = panelOf(page, 'console');
      await runSelect(current);
      await expect(current.locator('[data-role="results"] tbody tr')).toHaveCount(2);
      await expect(current.locator('[data-role="results"] tbody td')).toHaveText([
        'visit-pochi',
        'ポチ',
        'cancelled',
        'visit-tama',
        'タマ',
        'cancelled',
      ]);

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

      await expect(backup.getByRole('heading', { name: '復元した DB（2026-11-06 00:00 時点）' })).toBeVisible({
        timeout: 10_000,
      });
      await expect(backup.getByText('復元しています')).toBeHidden();
      await expect(restoreButton).toBeEnabled();
      await expect(restored).toBeVisible();
      await runSelect(backup);
      await expect(restored.locator('[data-role="results"] tbody td')).toHaveText([
        'visit-pochi',
        'ポチ',
        'reserved',
        'visit-tama',
        'タマ',
        'reserved',
      ]);

      await tab(page, /DB コンソール/).click();
      await expect(current.locator('[data-role="results"] tbody td').nth(2)).toHaveText('cancelled');

      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await expect(page.getByRole('table', { name: 'ポチのキャンセルについて分かったこと' })).toBeHidden();
      await expect(page.getByText('なぜ変えたのかを知っているのは更新処理を呼ぶコードだけです。')).toBeHidden();

      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      const table = page.getByRole('table', { name: 'ポチのキャンセルについて分かったこと' });
      await expect(table).toBeVisible();
      await expect(table.locator('thead th')).toHaveText(['誰が', 'いつ', '何を', 'なぜ']);
      await expect(table.locator('tbody th')).toHaveText([
        'アクセスログ',
        'DBバックアップ',
        '更新処理を呼ぶコードに記録を足していた場合',
      ]);
      await expect(table.locator('tbody td')).toHaveText([
        '残っていない',
        '2026-11-06 18:11:58',
        'POST /visits/visit-pochi/cancel',
        '残っていない',
        '残っていない',
        '11月6日 0:00 から今までのどこか',
        'reserved から cancelled',
        '残っていない',
        '受付スタッフ',
        '2026-11-06 18:11:58',
        '来院のキャンセル',
        '飼い主の都合',
      ]);
      await expect(table.locator('td[data-found="false"]')).toHaveCount(4);
      await expect(table.locator('td[data-found="true"]')).toHaveCount(8);
      await expect(page.getByText('なぜ変えたのかを知っているのは更新処理を呼ぶコードだけです。')).toBeVisible();

      await result.getByRole('button', { name: '閉じる' }).click();
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await expect(toggle).toBeFocused();
      await expect(table).toBeHidden();
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
    });
  });
}

test('図解のボタンにフォーカスがないときは、矢印キーで次のページへ移動する', async ({ page }) => {
  await page.goto('/chapters/intro/');
  await page.keyboard.press('ArrowRight');
  await expect(page).toHaveURL(/\/chapters\/intro\/2\/$/);
});
