import { expect, type Locator, type Page, test } from '@playwright/test';

const motions = ['no-preference', 'reduce'] as const;

const pathOf = (page: Page): string => new URL(page.url()).pathname;

type Kept = 'warehouse' | 'changelog' | 'record';

const keptNodes: readonly Kept[] = ['warehouse', 'changelog', 'record'];

const diagramLabels = {
  timetravel:
    '構成図。受付スタッフの操作は、更新処理を呼ぶコード、更新処理、visits テーブルの順に届く。記録は、データ基盤にある日ごとの visits の写しに残る。誰が、なぜは記録まで届かない。',
  trigger:
    '構成図。受付スタッフの操作は、更新処理を呼ぶコード、更新処理、visits テーブルの順に届く。記録は、データベースの中の変更の記録に残る。手作業の SQL による変更も残る。誰が、なぜは記録まで届かない。',
  code:
    '構成図。受付スタッフの操作は、更新処理を呼ぶコード、更新処理、visits テーブルの順に届く。記録は、更新処理がデータベースの中に足した記録に残る。誰が、なぜは記録まで届く。',
};

const methodOf = { warehouse: 'timetravel', changelog: 'trigger', record: 'code' } as const;

const arrowLabels = {
  warehouse: '1日1回の写し',
  changelog: 'トリガーや CDC',
  record: '誰が・なぜを渡す',
};

const expectDiagram = async (diagram: Locator, kept: Kept, reach: 'blocked' | 'through'): Promise<void> => {
  await expect(diagram).toHaveAttribute('role', 'img');
  await expect(diagram).toHaveAttribute(
    'aria-label',
    diagramLabels[methodOf[kept]],
  );
  await expect(diagram.locator('[data-node]')).toHaveCount(8);
  await expect(diagram.locator('[data-node]:not([aria-hidden="true"])')).toHaveCount(0);
  await expect(diagram.locator('[data-node="visits"]')).toHaveCSS('border-top-style', 'solid');
  for (const node of keptNodes) {
    const target = diagram.locator(`[data-node="${node}"]`);
    const isKept = node === kept;
    await expect(target).toHaveCSS('border-top-style', isKept ? 'solid' : 'dashed');
    if (isKept) {
      await expect(target.getByText('ここに残る')).toBeVisible();
      await expect(diagram.getByText(arrowLabels[node], { exact: true })).toBeVisible();
    } else {
      await expect(target.getByText('ここに残る')).toBeHidden();
      await expect(diagram.getByText(arrowLabels[node], { exact: true })).toBeHidden();
    }
  }
  await expect(diagram.locator('.frame-wh')).toHaveCSS('border-top-style', kept === 'warehouse' ? 'solid' : 'dashed');
  await expect(diagram.getByText('誰が・なぜを知っている')).toBeVisible();
  await expect(diagram.getByText('記録まで届かない')).toBeVisible({ visible: reach === 'blocked' });
  await expect(diagram.getByText('記録まで届く')).toBeVisible({ visible: reach === 'through' });
};

for (const reducedMotion of motions) {
  test.describe(`導入の図解（reducedMotion: ${reducedMotion}）`, () => {
    test.use({ reducedMotion });

    test('6 ページ目: 方法を選ぶと、構成図と残るデータと4つの答えが変わる', async ({ page }) => {
      await page.goto('/chapters/intro/6/');
      const figure = page.locator('[data-method-figure]');
      const diagram = figure.locator('[data-diagram]');
      const message = figure.locator('[aria-live="polite"]');
      const timeTravel = figure.getByRole('button', { name: 'データ基盤のタイムトラベル' });
      const trigger = figure.getByRole('button', { name: 'トリガーや CDC' });
      const code = figure.getByRole('button', { name: '更新処理を呼ぶコードに記録を足す' });
      const visibleEvidence = figure.locator('[data-evidence]:not([hidden])');
      const answers = figure.locator('[data-answer]');
      const foundAnswers = figure.locator('[data-answer][data-found="true"]');
      const timeTravelMessage =
        '前の日と比べれば、値が変わったことは分かります。誰がなぜ変えたのかは、どの日のテーブルにもありません。';

      await expect(figure.getByText('受付スタッフが、飼い主の都合で、ポチの来院をキャンセルした。')).toBeVisible();

      await expect(timeTravel).toHaveAttribute('aria-pressed', 'true');
      await expect(message).toHaveText(timeTravelMessage);
      await expect(visibleEvidence).toHaveCount(1);
      await expect(visibleEvidence).toHaveAttribute('data-evidence', 'timetravel');
      await expect(visibleEvidence.locator('caption')).toHaveText('データ基盤に残る、日ごとの visits テーブル');
      await expect(visibleEvidence.locator('tbody td')).toHaveText([
        '2026-11-06 00:00',
        'visit-pochi',
        'ポチ',
        'reserved',
        '2026-11-07 00:00',
        'visit-pochi',
        'ポチ',
        'cancelled',
      ]);
      await expect(answers).toHaveText(['残らない', '11月6日のどこか', 'reserved から cancelled', '残らない']);
      await expect(foundAnswers).toHaveCount(2);
      await expectDiagram(diagram, 'warehouse', 'blocked');

      await trigger.click();
      await expect(trigger).toHaveAttribute('aria-pressed', 'true');
      await expect(timeTravel).toHaveAttribute('aria-pressed', 'false');
      await expect(message).toHaveText(
        '変更の前後の値と時刻が残ります。手作業の SQL による変更も拾えます。誰がなぜ変えたのかは残りません。',
      );
      await expect(visibleEvidence).toHaveCount(1);
      await expect(visibleEvidence).toHaveAttribute('data-evidence', 'trigger');
      await expect(visibleEvidence.locator('caption')).toHaveText('トリガーや CDC が残す、変更の記録');
      await expect(visibleEvidence.locator('tbody td')).toHaveText([
        '2026-11-06 18:11:58',
        'visits',
        'visit-pochi',
        'status',
        'reserved',
        'cancelled',
      ]);
      await expect(answers).toHaveText(['残らない', '18:11:58', 'reserved から cancelled', '残らない']);
      await expect(foundAnswers).toHaveCount(2);
      await expectDiagram(diagram, 'changelog', 'blocked');

      await code.click();
      await expect(code).toHaveAttribute('aria-pressed', 'true');
      await expect(trigger).toHaveAttribute('aria-pressed', 'false');
      await expect(message).toHaveText('誰が、いつ、何を、なぜが1行に残ります。手作業の SQL による変更は拾えません。');
      await expect(visibleEvidence).toHaveCount(1);
      await expect(visibleEvidence).toHaveAttribute('data-evidence', 'code');
      await expect(visibleEvidence.locator('caption')).toHaveText('更新処理を呼ぶコードが足す記録');
      await expect(visibleEvidence.locator('tbody td')).toHaveText([
        '2026-11-06 18:11:58',
        '来院のキャンセル',
        '受付スタッフ',
        '飼い主の都合',
      ]);
      await expect(answers).toHaveText(['受付スタッフ', '18:11:58', '来院のキャンセル', '飼い主の都合']);
      await expect(foundAnswers).toHaveCount(4);
      await expectDiagram(diagram, 'record', 'through');

      await timeTravel.click();
      await expect(timeTravel).toHaveAttribute('aria-pressed', 'true');
      await expect(message).toHaveText(timeTravelMessage);
      await expect(visibleEvidence).toHaveCount(1);
      await expect(visibleEvidence).toHaveAttribute('data-evidence', 'timetravel');
      await expect(answers).toHaveText(['残らない', '11月6日のどこか', 'reserved から cancelled', '残らない']);
      await expect(foundAnswers).toHaveCount(2);
      await expectDiagram(diagram, 'warehouse', 'blocked');
    });

    test('7 ページ目: スライダーを動かすと、答えられる件数の文が変わる', async ({ page }) => {
      await page.goto('/chapters/intro/7/');
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
      await page.goto('/chapters/intro/7/');
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
      expect(pathOf(page)).toBe('/chapters/intro/7/');
    });
  });
}

test('図解のボタンにフォーカスがないときは、矢印キーで次のページへ移動する', async ({ page }) => {
  await page.goto('/chapters/intro/');
  await page.keyboard.press('ArrowRight');
  await expect(page).toHaveURL(/\/chapters\/intro\/2\/$/);
});
