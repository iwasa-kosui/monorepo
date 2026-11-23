import { expect, type Page, test } from '@playwright/test';

const motions = ['no-preference', 'reduce'] as const;

const pathOf = (page: Page): string => new URL(page.url()).pathname;

for (const reducedMotion of motions) {
  test.describe(`導入の図解（reducedMotion: ${reducedMotion}）`, () => {
    test.use({ reducedMotion });

    test('1 ページ目: 上書きとバックアップの順にボタンを押すと、結果の文が変わる', async ({ page }) => {
      await page.goto('/chapters/intro/');
      const figure = page.locator('[data-overwrite-figure]');
      const message = figure.locator('[aria-live="polite"]');
      const update = figure.getByRole('button', { name: 'この来院をキャンセルに更新する' });
      const restore = figure.getByRole('button', { name: 'バックアップから戻す' });
      const reset = figure.getByRole('button', { name: '最初に戻す' });

      await expect(message).toHaveText('「この来院をキャンセルに更新する」を押してください。');
      await expect(update).toBeEnabled();
      await expect(restore).toBeDisabled();
      await expect(reset).toBeDisabled();

      await update.click();
      await expect(message).toHaveText('古い値は上書きで消えました。理由を書く列はありません。');
      await expect(figure).toHaveAttribute('data-step', '1');
      await expect(update).toBeDisabled();
      await expect(restore).toBeEnabled();
      await expect(reset).toBeEnabled();

      await restore.click();
      await expect(message).toHaveText('値は戻りました。誰がなぜ変えたのかは戻りません。');
      await expect(figure).toHaveAttribute('data-step', '2');
      await expect(restore).toBeDisabled();
      await expect(figure.getByText('残っていません')).toHaveCount(2);

      await reset.click();
      await expect(message).toHaveText('「この来院をキャンセルに更新する」を押してください。');
      await expect(figure).toHaveAttribute('data-step', '0');
      await expect(update).toBeEnabled();
    });

    test('2 ページ目: 方法を選ぶと、結果の文と表が変わる', async ({ page }) => {
      await page.goto('/chapters/intro/2/');
      const figure = page.locator('[data-method-figure]');
      const message = figure.locator('[aria-live="polite"]');
      const timeTravel = figure.getByRole('button', { name: 'データ基盤のタイムトラベル' });
      const trigger = figure.getByRole('button', { name: 'トリガーや CDC' });
      const code = figure.getByRole('button', { name: '更新処理を呼ぶコードに記録を足す' });
      const results = figure.locator('[data-result] [data-text]');

      await expect(timeTravel).toHaveAttribute('aria-pressed', 'true');
      await expect(message).toHaveText('テーブルの変化は分かります。なぜ変えたのかはテーブルに届いていません。');
      await expect(results).toHaveText(['見える', '見える', '残らない']);

      await trigger.click();
      await expect(trigger).toHaveAttribute('aria-pressed', 'true');
      await expect(timeTravel).toHaveAttribute('aria-pressed', 'false');
      await expect(message).toHaveText('手作業の SQL まで拾えます。なぜ変えたのかはテーブルに届いていません。');
      await expect(results).toHaveText(['見える', '見える', '残らない']);

      await code.click();
      await expect(code).toHaveAttribute('aria-pressed', 'true');
      await expect(message).toHaveText('なぜを知っているコードの場所で書きます。手作業の SQL は拾えません。');
      await expect(results).toHaveText(['記録に書けば見える', '見えない', '残る']);

      await timeTravel.click();
      await expect(message).toHaveText('テーブルの変化は分かります。なぜ変えたのかはテーブルに届いていません。');
    });

    test('3 ページ目: スライダーを動かすと、答えられる件数の文が変わる', async ({ page }) => {
      await page.goto('/chapters/intro/3/');
      const figure = page.locator('[data-record-figure]');
      const message = figure.locator('[aria-live="polite"]');
      const slider = figure.getByRole('slider', { name: '記録を足す日' });

      await expect(slider).toHaveValue('3');
      await expect(message).toHaveText('足す前の3件は答えられません。足した後の3件は答えられます。');
      await expect(figure.locator('.event[data-state="lost"]')).toHaveCount(3);

      await slider.fill('6');
      await expect(message).toHaveText('今日まで足さなければ今日までの出来事はどれも答えられません。');
      await expect(figure.locator('.event[data-state="lost"]')).toHaveCount(6);

      await slider.fill('0');
      await expect(message).toHaveText('最初から足していれば全部答えられます。');
      await expect(figure.locator('.event[data-state="lost"]')).toHaveCount(0);

      await slider.fill('2');
      await expect(message).toHaveText('足す前の2件は答えられません。足した後の4件は答えられます。');
    });

    test('スライダーをキーボードで動かしても前後のページへ移動しない', async ({ page }) => {
      await page.goto('/chapters/intro/3/');
      const figure = page.locator('[data-record-figure]');
      const slider = figure.getByRole('slider', { name: '記録を足す日' });
      await slider.focus();

      await page.keyboard.press('ArrowRight');
      await expect(slider).toHaveValue('4');
      await expect(figure.locator('[aria-live="polite"]')).toHaveText(
        '足す前の4件は答えられません。足した後の2件は答えられます。',
      );
      await page.keyboard.press('ArrowLeft');
      await page.keyboard.press('ArrowLeft');
      await expect(slider).toHaveValue('2');
      expect(pathOf(page)).toBe('/chapters/intro/3/');
    });
  });
}

test('図解のボタンにフォーカスがないときは、矢印キーで次のページへ移動する', async ({ page }) => {
  await page.goto('/chapters/intro/');
  await page.keyboard.press('ArrowRight');
  await expect(page).toHaveURL(/\/chapters\/intro\/2\/$/);
});
