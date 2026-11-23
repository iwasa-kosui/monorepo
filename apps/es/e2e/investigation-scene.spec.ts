import { expect, type Locator, type Page, test } from '@playwright/test';

const path = '/chapters/chapter-1/';

const unknown = 'まだ分からない';
const missing = 'どこにも残っていない';
const initialReason = '3つのツールをすべて開くと返信できます。';

const scene = (page: Page): Locator => page.locator('[data-investigation]');
const memo = (page: Page, key: string): Locator => scene(page).locator(`[data-memo="${key}"]`);
const tab = (page: Page, name: string | RegExp): Locator => scene(page).getByRole('tab', { name });
const panel = (page: Page, name: string | RegExp): Locator => scene(page).getByRole('tabpanel', { name });
const unseen = (page: Page, name: string | RegExp): Locator => tab(page, name).locator('[data-unseen]');
const address = (page: Page): Locator => scene(page).locator('[data-address]');
const feed = (page: Page): Locator => scene(page).locator('[data-feed]');
const posts = (page: Page): Locator => feed(page).locator('.post');
const reply = (page: Page): Locator => scene(page).getByRole('button', { name: '調査結果を返信する' });
const reason = (page: Page): Locator => scene(page).locator('[data-reason]');
const sql = (page: Page): Locator => scene(page).locator('[data-playground="sql"]');
const results = (page: Page): Locator => sql(page).locator('[data-role="results"]');
const editor = (page: Page): Locator => sql(page).locator('.cm-content');
const query = (page: Page): Locator => scene(page).locator('[data-query]');
const logRows = (page: Page): Locator => scene(page).locator('[data-log-row]:visible');
const logCount = (page: Page): Locator => scene(page).locator('[data-log-count]');
const detail = (page: Page): Locator => scene(page).getByRole('region', { name: 'ログの詳細' });
const cancelRow = (page: Page): Locator => scene(page).locator('[data-log-row][data-cancel="true"]');
const agentTab = (page: Page): Locator => tab(page, /エージェント/);
const agentLog = (page: Page): Locator => scene(page).getByRole('log', { name: 'エージェントの会話' });
const turns = (page: Page): Locator => agentLog(page).locator('.turn');
const toolTurns = (page: Page): Locator => agentLog(page).locator('.turn.tool');
const thinking = (page: Page): Locator => agentLog(page).locator('[data-thinking]');
const agentInput = (page: Page): Locator => scene(page).getByRole('textbox', { name: 'エージェントへの依頼' });
const agentSend = (page: Page): Locator => scene(page).getByRole('button', { name: '送信', exact: true });
const agentStatus = (page: Page): Locator => scene(page).locator('[data-agent-status]');
const answerButton = (page: Page): Locator => scene(page).getByRole('button', { name: '答えを見る' });
const agentDone = 14_000;
const followUp = 'これ以上調べられるデータがありません。理由と操作した人は、どこにも記録されていません。';
const facet = (page: Page, group: string, value: string): Locator =>
  scene(page).locator(`[data-facet="${group}"][value="${value}"]`);

const ready = async (page: Page): Promise<void> => {
  await page.goto(path);
  await expect(sql(page)).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
};

const typeSql = async (page: Page, text: string): Promise<void> => {
  await editor(page).click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.insertText(text);
};

const runSql = async (page: Page, text: string): Promise<void> => {
  await typeSql(page, text);
  await sql(page).getByRole('button', { name: '実行する' }).click();
};

const showPochi = async (page: Page): Promise<void> => {
  await runSql(page, 'SELECT * FROM visits;');
  await expect(memo(page, 'what')).toHaveAttribute('data-state', 'found');
};

const openCancelLog = async (page: Page): Promise<void> => {
  await tab(page, /ログの検索/).click();
  await cancelRow(page).locator('.col-date').click();
  await expect(detail(page)).toBeVisible();
};

const openAll = async (page: Page): Promise<void> => {
  await showPochi(page);
  await openCancelLog(page);
  await tab(page, /リポジトリ/).click();
};

const expectInitial = async (page: Page): Promise<void> => {
  await expect(scene(page)).toHaveAttribute('data-phase', 'initial');
  await expect(tab(page, /DB コンソール/)).toHaveAttribute('aria-selected', 'true');
  await expect(address(page)).toHaveText('https://db.internal.example/console');
  for (const key of ['who', 'when', 'what', 'why']) {
    await expect(memo(page, key)).toHaveAttribute('data-state', 'unknown');
    await expect(memo(page, key)).toHaveText(unknown);
  }
  await expect(reply(page)).toBeDisabled();
  await expect(reason(page)).toHaveText(initialReason);
  await expect(posts(page)).toHaveCount(1);
  await expect(results(page)).toContainText('クエリを実行すると、結果がここに出ます。');
  await expect(query(page)).toHaveValue('service:clinic-api');
  await expect(unseen(page, /DB コンソール/)).toBeVisible();
  await expect(unseen(page, /ログの検索/)).toBeVisible();
  await expect(unseen(page, /リポジトリ/)).toBeVisible();
};

test.describe('第1章 調査の画面', () => {
  test('初期状態では、チャットの投稿 1、調査メモ、無効な返信ボタン、アドレスバー、DB コンソールが出る', async ({ page }) => {
    await ready(page);
    await expect(page.getByRole('heading', { level: 2 })).toHaveText('来院のキャンセル理由を調べる');
    await expect(page.locator('.chapter-body')).toContainText(
      'カスタマーサポートから調査依頼が届いています。ブラウザで社内のツールを開いて、誰が、いつ、何を、なぜキャンセルしたのかを調べてください。',
    );

    const chat = scene(page).getByRole('group', { name: 'チャット' });
    await expect(chat).toContainText('# 問い合わせ対応');
    await expect(posts(page)).toHaveCount(1);
    await expect(posts(page).first()).toContainText('カスタマーサポート');
    await expect(posts(page).first()).toContainText('10:02');
    await expect(posts(page).first()).toContainText('動物病院から問い合わせが来ています。');
    await expect(posts(page).first()).toContainText('『この来院がキャンセルになっているのはなぜですか。』');
    await expect(posts(page).first()).toContainText(
      'ポチの来院（visit-pochi）です。誰が、いつ、なぜキャンセルしたのか、調べてもらえますか。',
    );
    await expect(scene(page).locator('[aria-live]')).toHaveCount(1);
    await expect(scene(page).locator('[aria-live]')).toHaveAttribute('aria-live', 'polite');
    await expect(feed(page)).toHaveAttribute('aria-live', 'polite');

    await expect(scene(page).locator('dl dt').first()).toHaveText('誰が');
    await expect(scene(page).locator('.memo-list dt')).toHaveText(['誰が', 'いつ', '何を', 'なぜ']);
    await expect(scene(page).getByRole('button', { name: '答えを見る' })).toBeVisible();
    await expect(scene(page).getByRole('button', { name: '最初からやり直す' })).toBeVisible();

    await expect(scene(page).getByRole('tab')).toHaveCount(3);
    await expect(scene(page).getByRole('tabpanel', { includeHidden: false })).toHaveCount(1);
    await expect(panel(page, /DB コンソール/)).toBeVisible();
    await expectInitial(page);
  });

  test('DB コンソールでは、visits の列の定義が見え、テーブルの一覧には visits だけが出る', async ({ page }) => {
    await ready(page);
    const tables = scene(page).getByRole('group', { name: 'テーブルの一覧' });
    await expect(tables.locator('.table-item')).toHaveText(['visits']);
    await expect(tables.getByRole('list', { name: 'visits の列' }).locator('li')).toHaveText([
      'id TEXT',
      'pet_name TEXT',
      'status TEXT',
    ]);
    await expect(sql(page).locator('.cm-content')).toContainText('SELECT * FROM visits;');
  });

  test('任意の SQL を実行でき、結果が表と行数で出る。1 回実行しただけでは「何を」は分からない', async ({ page }) => {
    await ready(page);
    await runSql(page, 'SELECT 1 AS one;');
    await expect(results(page).locator('thead th')).toHaveText(['one']);
    await expect(results(page)).toContainText('1 行');
    await expect(memo(page, 'what')).toHaveAttribute('data-state', 'unknown');
    await expect(scene(page)).toHaveAttribute('data-opened', '');
    await expect(unseen(page, /DB コンソール/)).toBeVisible();

    await runSql(page, 'SELECT id, status FROM visits ORDER BY id;');
    await expect(results(page).locator('thead th')).toHaveText(['id', 'status']);
    await expect(results(page).locator('tbody td')).toHaveText([
      'visit-pochi',
      'cancelled',
      'visit-tama',
      'cancelled',
    ]);
    await expect(results(page)).toContainText('2 行');
    await expect(memo(page, 'what')).toHaveAttribute('data-state', 'found');
    await expect(memo(page, 'what')).toHaveText('status が cancelled');
    await expect(unseen(page, /DB コンソール/)).toBeHidden();
    await expect(scene(page)).toHaveAttribute('data-phase', 'investigating');
  });

  test('visit-pochi の行を含まない結果では「何を」は分からない', async ({ page }) => {
    await ready(page);
    await runSql(page, `SELECT id, status FROM visits WHERE id = 'visit-tama';`);
    await expect(results(page).locator('tbody td')).toHaveText(['visit-tama', 'cancelled']);
    await expect(memo(page, 'what')).toHaveAttribute('data-state', 'unknown');
    await runSql(page, `SELECT status FROM visits WHERE id = 'visit-pochi';`);
    await expect(results(page).locator('tbody td')).toHaveText(['cancelled']);
    await expect(memo(page, 'what')).toHaveAttribute('data-state', 'found');
  });

  test('Cmd/Ctrl + Enter で実行でき、複数行の SQL を書ける。入力欄で矢印キーを押してもページは移動しない', async ({ page }) => {
    await ready(page);
    await editor(page).click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.insertText('SELECT id\nFROM visits\nWHERE status = \'cancelled\'\nORDER BY id;');
    await page.keyboard.press('ControlOrMeta+Enter');
    await expect(results(page).locator('tbody tr')).toHaveCount(2);
    await expect(sql(page).locator('.cm-line')).toHaveCount(4);

    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowLeft');
    await expect(page).toHaveURL(new RegExp(`${path}$`));
  });

  test('SQL の誤りは、クライアントの中にエラーとして出て、画面は壊れない', async ({ page }) => {
    await ready(page);
    await runSql(page, 'SELECT * FROM missing_table;');
    await expect(results(page).getByRole('alert')).toContainText('no such table');
    await expect(scene(page)).toBeVisible();
    await expect(tab(page, /ログの検索/)).toBeVisible();
    await expect(memo(page, 'what')).toHaveAttribute('data-state', 'unknown');

    await runSql(page, 'SELEC * FROM visits;');
    await expect(results(page).getByRole('alert')).toBeVisible();

    await runSql(page, 'SELECT * FROM visits;');
    await expect(results(page).locator('tbody tr')).toHaveCount(2);
  });

  test('テーブル名を押すと、その行が一覧で出る', async ({ page }) => {
    await ready(page);
    await scene(page).getByRole('button', { name: 'visits', exact: true }).click();
    await expect(results(page).locator('thead th')).toHaveText(['id', 'pet_name', 'status']);
    await expect(results(page).locator('tbody tr')).toHaveCount(2);
    await expect(results(page).locator('tbody tr').nth(0)).toContainText('visit-pochi');
    await expect(results(page).locator('tbody tr').nth(0)).toContainText('ポチ');
    await expect(results(page).locator('tbody tr').nth(1)).toContainText('visit-tama');
    await expect(sql(page).locator('.cm-content')).toContainText('SELECT * FROM visits;');
    await expect(memo(page, 'what')).toHaveAttribute('data-state', 'found');
  });

  test('リセットのボタンは「最初からやり直す」の 1 つだけで、DB コンソールの中にはない', async ({ page }) => {
    await ready(page);
    await expect(scene(page).getByRole('button', { name: /最初/ })).toHaveText('最初からやり直す');
    await expect(sql(page).getByRole('button', { name: /最初|戻す/ })).toHaveCount(0);
    await expect(scene(page).getByRole('group', { name: 'チャット' }).getByRole('button', { name: /最初/ }))
      .toHaveCount(
        0,
      );
    await expect(scene(page).getByRole('group', { name: 'ブラウザ' }).getByRole('button', { name: /最初/ }))
      .toHaveCount(
        0,
      );
  });

  test('UPDATE の後に「最初からやり直す」を押すと、DB も含めて全部が初期状態に戻る', async ({ page }) => {
    await ready(page);
    await runSql(page, `UPDATE visits SET status = 'reserved' WHERE id = 'visit-pochi';`);
    await expect(results(page)).toContainText('1 行を変更しました');
    await runSql(page, `DELETE FROM visits WHERE id = 'visit-tama';`);
    await runSql(page, 'SELECT * FROM visits ORDER BY id;');
    await expect(results(page).locator('tbody tr')).toHaveCount(1);
    await expect(results(page).locator('tbody tr').nth(0)).toContainText('reserved');
    await expect(memo(page, 'what')).toHaveAttribute('data-state', 'found');

    await scene(page).getByRole('button', { name: '最初からやり直す' }).click();
    await expectInitial(page);
    await expect(editor(page)).toContainText('SELECT * FROM visits;');
    await expect(memo(page, 'what')).toHaveAttribute('data-state', 'unknown');

    await sql(page).getByRole('button', { name: '実行する' }).click();
    await expect(results(page).locator('tbody tr')).toHaveCount(2);
    await expect(results(page).locator('tbody tr').nth(0)).toContainText('cancelled');
    await expect(results(page).locator('tbody tr').nth(1)).toContainText('visit-tama');
  });

  test('INSERT と DELETE も実行できる', async ({ page }) => {
    await ready(page);
    await runSql(page, `INSERT INTO visits (id, pet_name, status) VALUES ('visit-new', 'ハナ', 'reserved');`);
    await expect(results(page)).toContainText('1 行を変更しました');
    await runSql(page, `DELETE FROM visits WHERE id = 'visit-tama';`);
    await expect(results(page)).toContainText('1 行を変更しました');
    await runSql(page, 'SELECT id FROM visits ORDER BY id;');
    await expect(results(page).locator('tbody td')).toHaveText(['visit-new', 'visit-pochi']);
  });

  test('ログの検索では、アドレスバー、検索バー、時間範囲、ファセット、グラフ、一覧が出る', async ({ page }) => {
    await ready(page);
    await tab(page, /ログの検索/).click();
    await expect(address(page)).toHaveText('https://logs.internal.example/logs');
    const logs = panel(page, /ログの検索/);
    await expect(logs).toBeVisible();
    await expect(query(page)).toHaveValue('service:clinic-api');
    await expect(logs).toContainText('Nov 6, 2026 00:00 – 23:59');
    await expect(logCount(page)).toHaveText('20件中 20件');
    await expect(logs.locator('thead th')).toHaveText(['DATE', 'HOST', 'SERVICE', 'CONTENT']);
    await expect(logRows(page)).toHaveCount(20);
    await expect(logRows(page).first()).toContainText('Nov 06 09:12:04.118');
    await expect(logRows(page).first()).toContainText('clinic-api-1');
    await expect(logRows(page).first()).toContainText('clinic-api');
    await expect(logRows(page).first()).toContainText('POST /visits 201 15ms');
    await expect(logRows(page).first()).toContainText('INFO');
    await expect(logs.locator('[data-log-row][data-level="warn"]')).toContainText('WARN');
    await expect(logs.locator('[data-log-row][data-level="warn"]')).toContainText('GET /visits/visit-9999 404 4ms');
    await expect(logs.locator('[data-log-row].is-target, [data-log-row][data-target]')).toHaveCount(0);

    const facets = logs.getByRole('group', { name: 'ログの絞り込み' });
    await expect(facets.locator('legend')).toHaveText(['Service', 'Status', 'HTTP Method']);
    await expect(facets.locator('.facet-item')).toHaveText([
      /clinic-api\s*20/,
      /Info\s*19/,
      /Warn\s*1/,
      /GET\s*18/,
      /POST\s*2/,
    ]);

    const chart = logs.getByRole('img');
    await expect(chart).toHaveAttribute('aria-label', /合計 20 件/);
    await expect(chart).toHaveAttribute('aria-label', /Warn を含む時間帯は 12 時台/);
    await expect(chart.locator('.bar')).toHaveCount(24);
    await expect(chart.locator('.bar[data-warn="true"]')).toHaveCount(1);
    await expect(logs).toContainText(
      'キャンセルの操作があった時刻は分かります。理由と操作した人は、ログの属性にありません。',
    );
    await expect(scene(page).locator('[aria-live]')).toHaveCount(1);
  });

  test('検索バーでは、自由な文字列と key:value で絞り込める。空白区切りは AND', async ({ page }) => {
    await ready(page);
    await tab(page, /ログの検索/).click();
    const expectRows = async (text: string, count: number): Promise<void> => {
      await query(page).fill(text);
      await expect(logRows(page), text).toHaveCount(count);
      await expect(logCount(page), text).toHaveText(`20件中 ${count}件`);
    };
    await expectRows('visit-pochi', 5);
    await expectRows('cancel', 1);
    await expectRows('CANCEL', 1);
    await expectRows('POST', 2);
    await expectRows('status:warn', 1);
    await expectRows('status:info', 19);
    await expectRows('@http.method:POST', 2);
    await expectRows('@http.status_code:404', 1);
    await expectRows('service:clinic-api visit-pochi', 5);
    await expectRows('service:clinic-api visit-tama GET', 4);
    await expectRows('status:warn POST', 0);
    await expectRows('foo:bar', 0);
    await expect(scene(page).locator('[data-empty]')).toBeVisible();
    await expectRows('', 20);
    await expect(scene(page).locator('[data-empty]')).toBeHidden();
  });

  test('ファセットで絞り込め、検索バーの条件と AND で組み合わさる。グラフの説明も変わる', async ({ page }) => {
    await ready(page);
    await tab(page, /ログの検索/).click();

    await facet(page, 'status', 'warn').check();
    await expect(logRows(page)).toHaveCount(1);
    await expect(logRows(page)).toContainText('visit-9999');
    await expect(logCount(page)).toHaveText('20件中 1件');
    await expect(scene(page).getByRole('img')).toHaveAttribute('aria-label', /合計 1 件/);

    await facet(page, 'method', 'POST').check();
    await expect(logRows(page)).toHaveCount(0);

    await facet(page, 'status', 'warn').uncheck();
    await expect(logRows(page)).toHaveCount(2);

    await query(page).fill('visit-pochi');
    await expect(logRows(page)).toHaveCount(1);
    await expect(logRows(page)).toContainText('POST /visits/visit-pochi/cancel 200 12ms');
    await expect(facet(page, 'method', 'GET').locator('xpath=following-sibling::*[@data-facet-count]')).toHaveText('4');

    await facet(page, 'method', 'GET').check();
    await expect(logRows(page)).toHaveCount(5);
    await expect(scene(page).getByRole('img')).toHaveAttribute('aria-label', /Warn を含む時間帯はありません/);
  });

  test('行を押すと詳細パネルが開き、時刻、status、service、host、メッセージ、属性が出る', async ({ page }) => {
    await ready(page);
    await tab(page, /ログの検索/).click();
    await expect(detail(page)).toBeHidden();

    await logRows(page).nth(4).locator('.col-date').click();
    await expect(detail(page)).toBeVisible();
    await expect(detail(page)).toContainText('GET /visits/visit-9999 404 4ms');
    await expect(detail(page)).toContainText('2026-11-06T12:48:30.611Z');
    await expect(detail(page)).toContainText('Warn');
    await expect(detail(page)).toContainText('clinic-api-1');
    await expect(memo(page, 'when')).toHaveAttribute('data-state', 'unknown');

    await cancelRow(page).locator('.col-date').click();
    await expect(detail(page)).toContainText('Event Attributes');
    await expect(detail(page)).toContainText('POST /visits/visit-pochi/cancel 200 12ms');
    await expect(detail(page)).toContainText('2026-11-06T18:11:58.846Z');
    await expect(detail(page)).toContainText('Info');
    await expect(detail(page).locator('.detail-attrs dt')).toHaveText([
      'http.method',
      'http.url',
      'http.status_code',
      'duration',
      'network.client.ip',
      'http.useragent',
    ]);
    await expect(detail(page).locator('.detail-attrs dd')).toHaveText([
      'POST',
      '/visits/visit-pochi/cancel',
      '200',
      '12',
      '10.0.3.21',
      'Mozilla/5.0',
    ]);
    const text = await detail(page).innerText();
    expect(text).not.toMatch(/usr\.|reason|operated/i);
  });

  test('キャンセルのログを開くと「いつ」が分かり、Esc と閉じるボタンで詳細パネルが閉じる', async ({ page }) => {
    await ready(page);
    await tab(page, /ログの検索/).click();
    await expect(unseen(page, /ログの検索/)).toBeVisible();
    await expect(memo(page, 'when')).toHaveAttribute('data-state', 'unknown');

    await cancelRow(page).focus();
    await page.keyboard.press('Enter');
    await expect(detail(page)).toBeVisible();
    await expect(memo(page, 'when')).toHaveAttribute('data-state', 'found');
    await expect(memo(page, 'when')).toHaveText('2026-11-06 18:11:58');
    await expect(unseen(page, /ログの検索/)).toBeHidden();

    await page.keyboard.press('Escape');
    await expect(detail(page)).toBeHidden();
    await expect(cancelRow(page)).toBeFocused();
    await expect(memo(page, 'when')).toHaveAttribute('data-state', 'found');

    await cancelRow(page).locator('.col-date').click();
    await expect(detail(page)).toBeVisible();
    await detail(page).getByRole('button', { name: 'ログの詳細を閉じる' }).click();
    await expect(detail(page)).toBeHidden();
  });

  test('ログの検索のタブを開いただけでは「いつ」は分からない', async ({ page }) => {
    await ready(page);
    await tab(page, /ログの検索/).click();
    await query(page).fill('visit-pochi');
    await expect(memo(page, 'when')).toHaveAttribute('data-state', 'unknown');
    await expect(scene(page)).toHaveAttribute('data-opened', '');
  });

  test('リポジトリには visits.ts の全文が行番号つきで出る', async ({ page }) => {
    await ready(page);
    await tab(page, /リポジトリ/).click();
    await expect(address(page)).toHaveText('https://code.internal.example/clinic/visits.ts');
    const repo = panel(page, /リポジトリ/);
    await expect(repo).toContainText('clinic / visits.ts');
    await expect(repo).toContainText(`import { withTransaction } from './db.ts';`);
    await expect(repo).toContainText('export const reserveVisit');
    await expect(repo).toContainText('export const completeVisit');
    await expect(repo).toContainText('export const cancelVisit');
    await expect(repo).toContainText(`UPDATE visits SET status = 'cancelled'`);
    await expect(repo.locator('pre .line').first()).toBeVisible();
    await expect(repo).toContainText('status を書き換えるだけで、理由と操作した人はどこにも保存していません。');
    await expect(unseen(page, /リポジトリ/)).toBeHidden();
    await expect(scene(page)).toHaveAttribute('data-opened', 'repo');
  });

  test('左右の矢印キー、Home、End でタブを移動でき、ページは移動しない', async ({ page }) => {
    await ready(page);
    await tab(page, /DB コンソール/).focus();

    await page.keyboard.press('ArrowRight');
    await expect(tab(page, /ログの検索/)).toBeFocused();
    await expect(tab(page, /ログの検索/)).toHaveAttribute('aria-selected', 'true');
    await expect(tab(page, /ログの検索/)).toHaveAttribute('tabindex', '0');
    await expect(tab(page, /DB コンソール/)).toHaveAttribute('tabindex', '-1');
    await expect(panel(page, /ログの検索/)).toBeVisible();
    await expect(address(page)).toHaveText('https://logs.internal.example/logs');

    await page.keyboard.press('ArrowRight');
    await expect(tab(page, /リポジトリ/)).toBeFocused();
    await expect(panel(page, /リポジトリ/)).toBeVisible();

    await page.keyboard.press('ArrowRight');
    await expect(tab(page, /DB コンソール/)).toBeFocused();

    await page.keyboard.press('ArrowLeft');
    await expect(tab(page, /リポジトリ/)).toBeFocused();

    await page.keyboard.press('Home');
    await expect(tab(page, /DB コンソール/)).toBeFocused();
    await page.keyboard.press('End');
    await expect(tab(page, /リポジトリ/)).toBeFocused();

    await expect(page.locator('[role="tabpanel"]:visible')).toHaveCount(1);
    await expect(page).toHaveURL(new RegExp(`${path}$`));
  });

  test('検索バーで矢印キーを押しても、ページは移動しない', async ({ page }) => {
    await ready(page);
    await tab(page, /ログの検索/).click();
    await query(page).focus();
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowRight');
    await expect(page).toHaveURL(new RegExp(`${path}$`));
  });

  test('返信ボタンは、残っている条件に合わせた理由を出し、3つの条件を満たすと有効になる', async ({ page }) => {
    await ready(page);
    await expect(reply(page)).toBeDisabled();
    await expect(reason(page)).toHaveText(initialReason);

    await showPochi(page);
    await expect(reply(page)).toBeDisabled();
    await expect(reason(page)).toHaveText('あと2つのツールを開くと返信できます。');

    await tab(page, /リポジトリ/).click();
    await expect(reply(page)).toBeDisabled();
    await expect(reason(page)).toHaveText('ログの検索で、キャンセルの操作のログを開くと返信できます。');

    await openCancelLog(page);
    await expect(reply(page)).toBeEnabled();
    await expect(reason(page)).toBeHidden();
    await expect(scene(page)).toHaveAttribute('data-phase', 'ready');
    await expect(memo(page, 'who')).toHaveAttribute('data-state', 'missing');
    await expect(memo(page, 'who')).toHaveText(missing);
    await expect(memo(page, 'when')).toHaveAttribute('data-state', 'found');
    await expect(memo(page, 'what')).toHaveAttribute('data-state', 'found');
    await expect(memo(page, 'why')).toHaveAttribute('data-state', 'missing');
    await expect(memo(page, 'why')).toHaveText(missing);
    await expect(scene(page).locator('.unseen:visible')).toHaveCount(0);
  });

  test('3つの条件のうち 1 つが足りないときの理由が出る', async ({ page }) => {
    await ready(page);
    await openCancelLog(page);
    await tab(page, /リポジトリ/).click();
    await expect(reason(page)).toHaveText('DB コンソールで、visit-pochi の status を表示すると返信できます。');
    await tab(page, /DB コンソール/).click();
    await showPochi(page);
    await expect(reply(page)).toBeEnabled();
  });

  test('返信すると、投稿 2 と投稿 3 がチャットに加わり、返信ボタンが消える', async ({ page }) => {
    await ready(page);
    await openAll(page);
    await reply(page).click();

    await expect(reply(page)).toBeHidden();
    await expect(scene(page)).toHaveAttribute('data-phase', 'replied');
    await expect(posts(page)).toHaveCount(3);
    await expect(posts(page).nth(1)).toContainText('あなた');
    await expect(posts(page).nth(1)).toContainText(
      '2026-11-06 18:11:58 にキャンセルの操作がありました。誰が、なぜキャンセルしたのかは、どこにも残っていませんでした。',
    );
    await expect(posts(page).nth(2)).toContainText('カスタマーサポート');
    await expect(posts(page).nth(2)).toContainText('なんで記録取ってないんですか');
    await expect(posts(page).nth(2)).toBeInViewport();
    await expect(scene(page).locator('[aria-live]')).toHaveCount(1);
  });

  test('「答えを見る」で、エージェントのタブが加わり、会話が順に進んで、結論の後に返信できる', async ({ page }) => {
    await ready(page);
    await expect(scene(page).getByRole('tab')).toHaveCount(3);
    await expect(scene(page).locator('[role="log"]')).toHaveCount(0);
    await page.evaluate(() => {
      const seen = new Set<string>();
      (window as unknown as { __seen: Set<string> }).__seen = seen;
      new MutationObserver(() => {
        document.querySelectorAll('[data-investigation] .turn.tool').forEach((element) => {
          seen.add(element.getAttribute('data-state') ?? '');
        });
        if (document.querySelector('[data-investigation] [data-thinking]') !== null) seen.add('thinking');
      }).observe(document.body, { subtree: true, childList: true, attributes: true });
    });

    await answerButton(page).click();
    await expect(scene(page).getByRole('tab')).toHaveCount(4);
    await expect(agentTab(page)).toHaveAttribute('aria-selected', 'true');
    await expect(address(page)).toHaveText('https://agent.internal.example/sessions/1');
    await expect(answerButton(page)).toBeDisabled();
    const chat = panel(page, /エージェント/);
    await expect(chat).toContainText('Coding Agent');
    await expect(chat).toContainText('visit-pochi のキャンセルの調査');
    await expect(agentStatus(page)).toHaveText('実行中');
    await expect(agentLog(page)).toBeVisible();
    await expect(agentLog(page)).not.toHaveAttribute('aria-live', /.*/);
    await expect(scene(page).locator('[aria-live]')).toHaveCount(1);
    await expect(agentInput(page)).toHaveAttribute('placeholder', '依頼を入力');
    await expect(agentSend(page)).toBeDisabled();
    await expect(turns(page)).toHaveCount(1);
    await expect(turns(page).first()).toHaveClass(/user/);
    await expect(turns(page).first()).toContainText(
      'visit-pochi の来院がキャンセルになっています。誰が、いつ、なぜキャンセルしたのかを調べてください。',
    );
    await expect(thinking(page)).toContainText('考え中…');
    await expect(reply(page)).toBeDisabled();

    await expect(turns(page)).toHaveCount(9, { timeout: agentDone });
    await expect(thinking(page)).toHaveCount(0);
    const items = turns(page);
    await expect(items.nth(1)).toHaveClass(/agent/);
    await expect(items.nth(1)).toHaveText('データベース、ログ、コードの順に調べます。');

    const sql = items.nth(2);
    await expect(sql).toHaveClass(/tool/);
    await expect(sql.locator('summary')).toContainText('SQL');
    await expect(sql.locator('summary')).toContainText(`SELECT * FROM visits WHERE id = 'visit-pochi';`);
    await expect(sql.locator('table')).toBeHidden();
    await sql.locator('summary').click();
    await expect(sql.locator('thead th')).toHaveText(['id', 'pet_name', 'status']);
    await expect(sql.locator('tbody td')).toHaveText(['visit-pochi', 'ポチ', 'cancelled']);

    await expect(items.nth(3)).toHaveText('status は cancelled です。キャンセルした人、理由、日時の列はありません。');

    const logs = items.nth(4);
    await expect(logs.locator('summary')).toContainText('Logs');
    await expect(logs.locator('summary')).toContainText('service:clinic-api visit-pochi');
    await logs.locator('summary').click();
    await expect(logs).toContainText('2026-11-06T18:11:58.846Z POST /visits/visit-pochi/cancel 200 12ms');
    await expect(logs.locator('dt')).toHaveText([
      'http.method',
      'http.url',
      'http.status_code',
      'duration',
      'network.client.ip',
      'http.useragent',
    ]);
    await expect(logs.locator('dd')).toHaveText([
      'POST',
      '/visits/visit-pochi/cancel',
      '200',
      '12',
      '10.0.3.21',
      'Mozilla/5.0',
    ]);

    await expect(items.nth(5)).toHaveText(
      '2026-11-06 18:11:58 にキャンセルの操作がありました。ログの属性に、操作した人と理由はありません。',
    );

    const read = items.nth(6);
    await expect(read.locator('summary')).toContainText('Read');
    await expect(read.locator('summary')).toContainText('clinic/visits.ts');
    await read.locator('summary').click();
    await expect(read.locator('pre')).toContainText('export const cancelVisit');
    await expect(read.locator('pre')).toContainText(`UPDATE visits SET status = 'cancelled' WHERE id = ?`);

    await expect(items.nth(7)).toHaveText(
      'cancelVisit は status を書き換えるだけです。理由と操作した人を受け取っておらず、どこにも保存していません。',
    );
    const conclusion = items.nth(8);
    await expect(conclusion.locator('dt')).toHaveText(['いつ', '何を', '誰が', 'なぜ']);
    await expect(conclusion.locator('dd')).toHaveText([
      '2026-11-06 18:11:58',
      'status を cancelled に更新',
      '特定できません',
      '特定できません',
    ]);
    await expect(conclusion).toContainText(
      '理由と操作した人は、データベースにも、ログにも、コードにも記録されていません。記録されていないデータは、私にも復元できません。',
    );

    await expect(toolTurns(page)).toHaveCount(3);
    for (let index = 0; index < 3; index += 1) {
      await expect(toolTurns(page).nth(index)).toHaveAttribute('data-state', 'done');
    }
    const seen = await page.evaluate(() => [...(window as unknown as { __seen: Set<string> }).__seen]);
    expect(seen).toEqual(expect.arrayContaining(['running', 'done', 'thinking']));

    await expect(agentStatus(page)).toHaveText('完了');
    await expect(agentSend(page)).toBeEnabled();
    await expect(scene(page)).toHaveAttribute('data-phase', 'ready');
    await expect(memo(page, 'who')).toHaveText(missing);
    await expect(memo(page, 'when')).toHaveText('2026-11-06 18:11:58');
    await expect(memo(page, 'what')).toHaveText('status が cancelled');
    await expect(memo(page, 'why')).toHaveText(missing);
    await expect(reply(page)).toBeEnabled();
    await expect(answerButton(page)).toBeDisabled();
    await reply(page).click();
    await expect(posts(page)).toHaveCount(3);
  });

  test('エージェントの実行中は、送信が無効で、Enter を押しても送られない', async ({ page }) => {
    await ready(page);
    await answerButton(page).click();
    await expect(agentSend(page)).toBeDisabled();
    await agentInput(page).fill('途中の依頼');
    await agentInput(page).press('Enter');
    await expect(agentInput(page)).toHaveValue('途中の依頼');
    await expect(agentSend(page)).toBeDisabled();
    await expect(agentStatus(page)).toHaveText('実行中');
    await expect(turns(page)).toHaveCount(9, { timeout: agentDone });
    await expect(agentSend(page)).toBeEnabled();
    await expect(agentInput(page)).toHaveValue('途中の依頼');
  });

  test('結論の後に依頼を送ると、固定の文が返る。Shift+Enter は改行、空の入力は送られない', async ({ page }) => {
    await ready(page);
    await answerButton(page).click();
    await expect(turns(page)).toHaveCount(9, { timeout: agentDone });

    await agentSend(page).click();
    await expect(turns(page)).toHaveCount(9);

    await agentInput(page).fill('   ');
    await agentInput(page).press('Enter');
    await expect(turns(page)).toHaveCount(9);

    await agentInput(page).fill('');
    await agentInput(page).pressSequentially('一行目');
    await agentInput(page).press('Shift+Enter');
    await agentInput(page).pressSequentially('二行目');
    await expect(agentInput(page)).toHaveValue('一行目\n二行目');
    await expect(turns(page)).toHaveCount(9);

    await agentInput(page).press('Enter');
    await expect(turns(page)).toHaveCount(10);
    await expect(turns(page).nth(9)).toHaveClass(/user/);
    await expect(turns(page).nth(9)).toContainText('一行目');
    await expect(turns(page).nth(9)).toContainText('二行目');
    await expect(agentInput(page)).toHaveValue('');
    await expect(agentSend(page)).toBeDisabled();
    await expect(agentStatus(page)).toHaveText('実行中');
    await expect(thinking(page)).toBeVisible();
    await expect(turns(page)).toHaveCount(11);
    await expect(thinking(page)).toHaveCount(0);
    await expect(turns(page).nth(10)).toHaveClass(/agent/);
    await expect(turns(page).nth(10)).toHaveText(followUp);
    await expect(agentStatus(page)).toHaveText('完了');
    await expect(agentSend(page)).toBeEnabled();

    await agentInput(page).fill('誰がやったのですか');
    await agentSend(page).click();
    await expect(turns(page)).toHaveCount(13);
    await expect(turns(page).nth(11)).toContainText('誰がやったのですか');
    await expect(turns(page).nth(12)).toHaveText(followUp);
  });

  test('エージェントの入力欄で矢印キーを押しても、ページは移動しない', async ({ page }) => {
    await ready(page);
    await answerButton(page).click();
    await agentInput(page).focus();
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowRight');
    await expect(page).toHaveURL(new RegExp(`${path}$`));
  });

  test('エージェントの会話は、別のタブを開いても進み続ける', async ({ page }) => {
    await ready(page);
    await answerButton(page).click();
    await tab(page, /リポジトリ/).click();
    await expect(panel(page, /リポジトリ/)).toBeVisible();
    await expect(reply(page)).toBeEnabled({ timeout: agentDone });
    await tab(page, /エージェント/).click();
    await expect(turns(page)).toHaveCount(9);
    await expect(agentStatus(page)).toHaveText('完了');
  });

  test('エージェントの「この画面を開く」で、該当のタブとクエリが開く', async ({ page }) => {
    await ready(page);
    await answerButton(page).click();
    await expect(turns(page)).toHaveCount(9, { timeout: agentDone });
    const open = async (index: number): Promise<void> => {
      const row = toolTurns(page).nth(index);
      if ((await row.locator('details').getAttribute('open')) === null) await row.locator('summary').click();
      await row.getByRole('button', { name: /この画面を開く/ }).click();
    };

    await open(0);
    await expect(tab(page, /DB コンソール/)).toHaveAttribute('aria-selected', 'true');
    await expect(editor(page)).toContainText(`SELECT * FROM visits WHERE id = 'visit-pochi';`);
    await expect(results(page).locator('tbody td')).toHaveText(['visit-pochi', 'ポチ', 'cancelled']);

    await tab(page, /エージェント/).click();
    await open(1);
    await expect(tab(page, /ログの検索/)).toHaveAttribute('aria-selected', 'true');
    await expect(query(page)).toHaveValue('service:clinic-api visit-pochi');
    await expect(logCount(page)).toHaveText('20件中 5件');
    await expect(detail(page)).toBeVisible();
    await expect(detail(page)).toContainText('POST /visits/visit-pochi/cancel 200 12ms');

    await tab(page, /エージェント/).click();
    await open(2);
    await expect(tab(page, /リポジトリ/)).toHaveAttribute('aria-selected', 'true');
    await expect(panel(page, /リポジトリ/)).toBeVisible();
    await expect(address(page)).toHaveText('https://code.internal.example/clinic/visits.ts');
  });

  test('「最初からやり直す」で、エージェントのタブと会話が消え、「答えを見る」が有効に戻る', async ({ page }) => {
    await ready(page);
    await answerButton(page).click();
    await expect(turns(page)).toHaveCount(2, { timeout: 5000 });
    await scene(page).getByRole('button', { name: '最初からやり直す' }).click();
    await expect(scene(page).getByRole('tab')).toHaveCount(3);
    await expect(scene(page).locator('[role="log"]')).toHaveCount(0);
    await expect(answerButton(page)).toBeEnabled();
    await expectInitial(page);
    await page.waitForTimeout(2500);
    await expect(scene(page).locator('[role="log"]')).toHaveCount(0);
    await expect(reply(page)).toBeDisabled();

    await answerButton(page).click();
    await expect(turns(page)).toHaveCount(1);
    await expect(turns(page)).toHaveCount(9, { timeout: agentDone });
    await expect(reply(page)).toBeEnabled();
  });

  test('動きを減らす設定では、エージェントの会話が一度に全部出る', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await ready(page);
    await answerButton(page).click();
    await expect(turns(page)).toHaveCount(9, { timeout: 500 });
    await expect(thinking(page)).toHaveCount(0);
    await expect(toolTurns(page)).toHaveCount(3);
    await expect(toolTurns(page).locator('xpath=self::*[@data-state="done"]')).toHaveCount(3);
    await expect(agentStatus(page)).toHaveText('完了');
    await expect(reply(page)).toBeEnabled({ timeout: 500 });
    await expect(scene(page)).toHaveAttribute('data-phase', 'ready');
    await agentInput(page).fill('追加の依頼');
    await agentInput(page).press('Enter');
    await expect(turns(page)).toHaveCount(11, { timeout: 500 });
    await expect(turns(page).nth(10)).toHaveText(followUp);
  });

  test('「最初からやり直す」で、検索条件、ファセット、詳細パネル、タブ、チャットも初期状態に戻る', async ({ page }) => {
    await ready(page);
    await runSql(page, `UPDATE visits SET status = 'reserved' WHERE id = 'visit-pochi';`);
    await expect(results(page)).toContainText('1 行を変更しました');
    await runSql(page, 'SELECT * FROM visits ORDER BY id;');
    await expect(results(page).locator('tbody tr').nth(0)).toContainText('reserved');
    await tab(page, /ログの検索/).click();
    await query(page).fill('cancel');
    await facet(page, 'method', 'POST').check();
    await cancelRow(page).locator('.col-date').click();
    await tab(page, /リポジトリ/).click();
    await reply(page).click();
    await expect(posts(page)).toHaveCount(3);

    await scene(page).getByRole('button', { name: '最初からやり直す' }).click();

    await expectInitial(page);
    await expect(scene(page)).toHaveAttribute('data-opened', '');
    await expect(detail(page)).toBeHidden();
    await expect(facet(page, 'method', 'POST')).not.toBeChecked();
    await expect(editor(page)).toContainText('SELECT * FROM visits;');
    await expect(panel(page, /DB コンソール/)).toBeVisible();
    await expect(scene(page).getByRole('tabpanel', { includeHidden: false })).toHaveCount(1);

    await sql(page).getByRole('button', { name: '実行する' }).click();
    await expect(results(page).locator('tbody tr').nth(0)).toContainText('cancelled');
    await expect(results(page).locator('tbody tr').nth(0)).toContainText('visit-pochi');
  });

  test('文言に、第1章では使わない語が出ない', async ({ page }) => {
    await ready(page);
    const read = async (): Promise<string> => page.locator('.chapter-body').innerText();
    const check = async (): Promise<void> => {
      const text = await read();
      for (const word of ['業務イベント', 'business_events', 'target_']) {
        expect(text).not.toContain(word);
      }
    };
    await check();
    await tab(page, /ログの検索/).click();
    await cancelRow(page).locator('.col-date').click();
    await check();
    await tab(page, /リポジトリ/).click();
    await check();
  });

  for (const size of [{ width: 375, height: 667 }, { width: 800, height: 900 }, { width: 1024, height: 768 }]) {
    test(`${size.width}x${size.height} で、どのタブを開いてもページ全体が横にスクロールしない`, async ({ page }) => {
      await page.setViewportSize(size);
      await ready(page);
      const overflows = (): Promise<boolean> =>
        page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      for (const name of [/DB コンソール/, /ログの検索/, /リポジトリ/]) {
        await tab(page, name).click();
        expect(await overflows(), String(name)).toBe(false);
      }
      await tab(page, /ログの検索/).click();
      await cancelRow(page).locator('.col-date').click();
      expect(await overflows(), 'detail').toBe(false);
    });
  }

  for (
    const size of [
      { width: 375, height: 812 },
      { width: 600, height: 800 },
      { width: 800, height: 900 },
      { width: 1024, height: 768 },
      { width: 1280, height: 640 },
      { width: 1440, height: 790 },
    ]
  ) {
    test(`${size.width}x${size.height} で、投稿 1 の本文が全部読める`, async ({ page }) => {
      await page.setViewportSize(size);
      await ready(page);
      const text = posts(page).first().locator('.post-text');
      await expect(text).toBeInViewport({ ratio: 0.99 });
      const box = await text.evaluate((element) => {
        const container = element.closest('[data-feed]');
        const inner = element.getBoundingClientRect();
        const outer = container?.getBoundingClientRect();
        return {
          innerTop: inner.top,
          innerBottom: inner.bottom,
          outerTop: outer?.top ?? 0,
          outerBottom: outer?.bottom ?? 0,
          clipped: container === null ? true : container.scrollHeight > container.clientHeight + 1,
        };
      });
      expect(box.innerTop).toBeGreaterThanOrEqual(box.outerTop);
      expect(box.innerBottom).toBeLessThanOrEqual(box.outerBottom);
      expect(box.clipped).toBe(false);
    });
  }

  for (const size of [{ width: 1280, height: 640 }, { width: 1440, height: 790 }]) {
    test(`${size.width}x${size.height} で、どのタブを開いても、詳細パネルや返信後でも1画面に収まる`, async ({ page }) => {
      await page.setViewportSize(size);
      await ready(page);
      const fit = (): Promise<{ page: boolean; body: boolean; chat: boolean }> =>
        page.evaluate(() => {
          const body = document.querySelector('.chapter-body');
          const chat = document.querySelector('[data-investigation] .chat');
          const composer = chat?.querySelector('.composer')?.getBoundingClientRect();
          const frame = chat?.getBoundingClientRect();
          return {
            page: document.documentElement.scrollHeight <= window.innerHeight,
            body: (body?.scrollHeight ?? 0) <= (body?.clientHeight ?? 0),
            chat: composer !== undefined && frame !== undefined && composer.bottom <= frame.bottom + 1,
          };
        });
      for (const name of [/DB コンソール/, /ログの検索/, /リポジトリ/]) {
        await tab(page, name).click();
        expect(await fit(), String(name)).toEqual({ page: true, body: true, chat: true });
      }
      await tab(page, /DB コンソール/).click();
      await showPochi(page);
      await tab(page, /ログの検索/).click();
      await cancelRow(page).locator('.col-date').click();
      expect(await fit(), 'detail').toEqual({ page: true, body: true, chat: true });
      await tab(page, /リポジトリ/).click();
      await reply(page).click();
      expect(await fit(), 'replied').toEqual({ page: true, body: true, chat: true });
      await answerButton(page).click();
      await expect(agentInput(page)).toBeInViewport();
      await expect(turns(page)).toHaveCount(9, { timeout: agentDone });
      expect(await fit(), 'agent').toEqual({ page: true, body: true, chat: true });
      await expect(agentInput(page)).toBeInViewport();
      const log = await agentLog(page).evaluate((element) => {
        const box = element.getBoundingClientRect();
        const frame = element.closest('.win')?.getBoundingClientRect();
        const input = element.closest('.panel')?.querySelector('.agent-input')?.getBoundingClientRect();
        return {
          inside: frame !== undefined && box.bottom <= frame.bottom + 1 && box.right <= frame.right + 1,
          inputInside: frame !== undefined && input !== undefined && input.bottom <= frame.bottom + 1,
          scrolls: element.scrollHeight > element.clientHeight,
        };
      });
      expect(log).toEqual({ inside: true, inputInside: true, scrolls: true });
    });
  }

  test('375px 幅では、ログの一覧とコードが中だけで横にスクロールする', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await ready(page);
    await tab(page, /ログの検索/).click();
    const log = scene(page).locator('[data-log-scroll]');
    expect(await log.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
    await tab(page, /リポジトリ/).click();
    const code = panel(page, /リポジトリ/).locator('pre');
    expect(await code.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
  });
});
