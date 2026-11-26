import { expect, type Locator, type Page, test } from '@playwright/test';

const path = '/chapters/intro/2/';

const unknown = 'まだ分からない';
const missing = 'どこにも残っていない';
const initialReason = '3つのツールをすべて開くと返信できます。';
const liveRegions = '[aria-live]:not([aria-live="off"])';

const scene = (page: Page): Locator => page.locator('[data-investigation]');
const memo = (page: Page, key: string): Locator => scene(page).locator(`[data-memo="${key}"]`);
const tab = (page: Page, name: string | RegExp): Locator => scene(page).getByRole('tab', { name });
const panel = (page: Page, name: string | RegExp): Locator => scene(page).getByRole('tabpanel', { name });
const unseen = (page: Page, name: string | RegExp): Locator => tab(page, name).locator('[data-unseen]');
const address = (page: Page): Locator => scene(page).locator('[data-address]');
const feed = (page: Page): Locator => scene(page).locator('[data-feed]');
const posts = (page: Page): Locator => feed(page).locator('.post');
const reply = (page: Page): Locator => scene(page).getByRole('button', { name: '調査結果を返信する' });
const interim = (page: Page): Locator => scene(page).getByRole('button', { name: '途中経過を報告する' });
const reason = (page: Page): Locator => scene(page).locator('[data-reason]');
const startButton = (page: Page): Locator => scene(page).getByRole('button', { name: '対応を始める' });
const pauseButton = (page: Page): Locator => scene(page).getByRole('button', { name: /^(一時停止|再開する)$/ });
const resetButton = (page: Page): Locator => scene(page).getByRole('button', { name: '最初からやり直す' });
const timer = (page: Page): Locator => scene(page).getByRole('timer');
const clock = (page: Page): Locator => scene(page).locator('[data-clock]');
const affected = (page: Page): Locator => scene(page).locator('.status-affected');
const live = (page: Page): Locator => scene(page).locator('[data-live]');
const windows = (page: Page): Locator => scene(page).locator('[data-window]');
const sql = (page: Page): Locator => scene(page).locator('[data-playground="sql"]');
const runButton = (page: Page): Locator => sql(page).locator('[data-role="run"]');
const results = (page: Page): Locator => sql(page).locator('[data-role="results"]');
const editor = (page: Page): Locator => sql(page).locator('.cm-content');
const query = (page: Page): Locator => scene(page).locator('[data-query]');
const logRows = (page: Page): Locator => scene(page).locator('[data-log-row]:visible');
const allRows = (page: Page): Locator => scene(page).locator('[data-log-row]');
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

const firstPost = 'お疲れ様です！すみません、急ぎで見てほしいです🙏';
const introPosts = [
  firstPost,
  '動物病院さんから電話があって、予約してたはずの来院がキャンセルになってるそうです。飼い主さんがもう受付に来ちゃってて…',
  'ポチちゃんの来院です（visit-pochi）。誰がいつなんでキャンセルしたか、わかりますか？',
];
const replyFirst = '18:11:58 にポチの来院をキャンセルする操作があったのは確認できました';
const replyLast = 'ただ、誰がなんでキャンセルしたかは、DB にもログにもコードにも残ってなくて、分からないです…';
const tamaReplyText = 'タマの来院も 18:20:30 に同じ操作でキャンセルされてます';
const supportFollowUps = [
  'えっ',
  '誰がなんでキャンセルしたか分からないと、病院さんに説明できないです…',
  'なんで記録取ってないんですか',
];
const startText =
  'あなたは、動物病院向けの予約システムの開発者です。カスタマーサポートから連絡が届きます。届いた連絡に対応してください。手を動かす人はこのブラウザで動かせます。見るだけの人は講師の画面で追えます。';

const ready = async (page: Page): Promise<void> => {
  await page.goto(path);
  await expect(sql(page)).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
};

const begin = async (page: Page): Promise<void> => {
  await ready(page);
  await startButton(page).click();
  await pauseButton(page).click();
  await expect(scene(page)).toHaveAttribute('data-phase', 'paused');
};

const timed = async (page: Page): Promise<void> => {
  await page.clock.install({ time: new Date('2026-11-06T09:00:00Z') });
  await page.goto(path);
  await expect(sql(page)).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
  await page.clock.pauseAt(new Date('2026-11-06T09:01:00Z'));
  await startButton(page).click();
};

const elapse = async (page: Page, seconds: number): Promise<void> => {
  for (let second = 0; second < seconds; second += 1) {
    await page.clock.runFor(1000);
    await expect(runButton(page)).toBeEnabled();
  }
};

const typeSql = async (page: Page, text: string): Promise<void> => {
  await editor(page).click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.insertText(text);
};

const runSql = async (page: Page, text: string): Promise<void> => {
  await typeSql(page, text);
  await expect(runButton(page)).toBeEnabled();
  await runButton(page).click();
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

const expectFresh = async (page: Page): Promise<void> => {
  await expect(tab(page, /DB コンソール/)).toHaveAttribute('aria-selected', 'true');
  await expect(address(page)).toHaveText('https://db.internal.example/console');
  for (const key of ['who', 'when', 'what', 'why']) {
    await expect(memo(page, key)).toHaveAttribute('data-state', 'unknown');
    await expect(memo(page, key)).toHaveText(unknown);
  }
  await expect(reply(page)).toBeDisabled();
  await expect(scene(page)).toHaveAttribute('data-ready', 'false');
  await expect(reason(page)).toHaveText(initialReason);
  await expect(posts(page)).toHaveCount(1);
  await expect(results(page)).toContainText('クエリを実行すると、結果がここに出ます。');
  await expect(query(page)).toHaveValue('service:clinic-api');
  await expect(unseen(page, /DB コンソール/)).toBeVisible();
  await expect(unseen(page, /ログの検索/)).toBeVisible();
  await expect(unseen(page, /リポジトリ/)).toBeVisible();
};

const expectIdle = async (page: Page): Promise<void> => {
  await expect(scene(page)).toHaveAttribute('data-phase', 'idle');
  await expect(startButton(page)).toBeVisible();
  await expect(windows(page)).toHaveCount(2);
  for (const element of await windows(page).all()) {
    await expect(element).toHaveAttribute('inert', '');
  }
  await expect(posts(page)).toHaveCount(0);
  await expect(timer(page)).toHaveText('対応開始から 00:00');
  await expect(clock(page)).toHaveText('18:20:00');
  await expect(affected(page)).toHaveText('キャンセルになった来院 1件');
  await expect(pauseButton(page)).toBeDisabled();
  await expect(live(page)).toHaveAttribute('data-state', 'off');
  await expect(allRows(page)).toHaveCount(5);
  await expect(logCount(page)).toHaveText('5件中 5件');
  await expect(tab(page, /DB コンソール/)).toHaveAttribute('aria-selected', 'true');
  for (const key of ['who', 'when', 'what', 'why']) {
    await expect(memo(page, key)).toHaveAttribute('data-state', 'unknown');
  }
};

test.describe('導入 調査の画面', () => {
  test('開始前は、案内だけが操作でき、2 つのウィンドウは操作できず、進行は始まっていない', async ({ page }) => {
    await ready(page);
    await expectIdle(page);
    await expect(scene(page).getByText(startText)).toBeVisible();
    await expect(scene(page).getByRole('group', { name: startText })).toBeVisible();
    await expect(tab(page, /ログの検索/).click({ timeout: 1000 })).rejects.toThrow();
    await expect(tab(page, /DB コンソール/)).toHaveAttribute('aria-selected', 'true');
    await expect(resetButton(page)).toBeDisabled();
    await expect(scene(page).locator(liveRegions)).toHaveCount(1);
  });

  test('「対応を始める」で、案内が消え、時計が動き始め、0 秒の投稿が届く', async ({ page }) => {
    await timed(page);
    await expect(scene(page)).toHaveAttribute('data-phase', 'running');
    await expect(startButton(page)).toBeHidden();
    for (const element of await windows(page).all()) {
      await expect(element).not.toHaveAttribute('inert', '');
    }
    await expect(posts(page)).toHaveCount(1);
    await expect(posts(page).first()).toContainText('カスタマーサポート');
    await expect(posts(page).first()).toContainText('18:20');
    await expect(posts(page).first().locator('.post-text')).toHaveText(firstPost);
    await expect(pauseButton(page)).toHaveText('一時停止');
    await expect(pauseButton(page)).toBeEnabled();
    await expect(resetButton(page)).toBeEnabled();
    await expect(live(page)).toHaveAttribute('data-state', 'on');
    await expect(scene(page).locator(liveRegions)).toHaveCount(1);
    await expect(feed(page)).toHaveAttribute('aria-live', 'polite');
  });

  test('経過時間と画面内の時刻が進む。経過時間の表示は読み上げ対象の更新にならない', async ({ page }) => {
    await timed(page);
    await expect(timer(page)).toHaveText('対応開始から 00:00');
    await expect(timer(page)).toHaveAttribute('aria-live', 'off');
    await expect(clock(page)).toHaveText('18:20:00');
    await elapse(page, 5);
    await expect(timer(page)).toHaveText('対応開始から 00:05');
    await expect(clock(page)).toHaveText('18:20:05');
    await elapse(page, 60);
    await expect(timer(page)).toHaveText('対応開始から 01:05');
    await expect(clock(page)).toHaveText('18:21:05');
  });

  test('キャンセルになった来院の件数は、30 秒の出来事の後に 2件になる', async ({ page }) => {
    await timed(page);
    await expect(affected(page)).toHaveText('キャンセルになった来院 1件');
    await elapse(page, 29);
    await expect(affected(page)).toHaveText('キャンセルになった来院 1件');
    await elapse(page, 1);
    await expect(affected(page)).toHaveText('キャンセルになった来院 2件');
  });

  test('4 秒ごとにログが 1 行増え、最新の行が一覧の先頭に入る', async ({ page }) => {
    await timed(page);
    await tab(page, /ログの検索/).click();
    await expect(logRows(page)).toHaveCount(5);
    await page.clock.runFor(3750);
    await expect(logRows(page)).toHaveCount(5);
    await page.clock.runFor(250);
    await expect(logRows(page)).toHaveCount(6);
    await expect(logRows(page).first()).toContainText('Nov 06 18:20:04.118');
    await expect(logRows(page).first()).toContainText('GET /visits 200 7ms');
    await expect(logCount(page)).toHaveText('6件中 6件');
    await elapse(page, 4);
    await expect(logRows(page)).toHaveCount(7);
    await expect(logRows(page).first()).toContainText('GET /visits/visit-pochi 200 5ms');
    await elapse(page, 4);
    await expect(logRows(page).first()).toContainText('GET /visits/visit-tama 200 8ms');
    await elapse(page, 4);
    await expect(logRows(page).first()).toContainText('GET /visits 200 6ms');
    await expect(logRows(page)).toHaveCount(9);
    await expect(scene(page).locator(liveRegions)).toHaveCount(1);
  });

  test('ログの検索の「Live」の印は、進行中だけ点灯し、時間範囲とグラフが時間に合わせて進む', async ({ page }) => {
    await timed(page);
    await tab(page, /ログの検索/).click();
    const logs = panel(page, /ログの検索/);
    await expect(logs).toContainText('Past 15 Minutes');
    await expect(live(page)).toHaveText('Live');
    await expect(live(page)).toHaveAttribute('data-state', 'on');
    const axis = scene(page).locator('[data-tick]');
    await expect(axis).toHaveText(['18:05', '18:13', '18:20']);
    await elapse(page, 60);
    await expect(axis).toHaveText(['18:06', '18:14', '18:21']);
    await expect(scene(page).getByRole('img')).toHaveAttribute('aria-label', /合計 21 件/);
    await pauseButton(page).click();
    await expect(live(page)).toHaveAttribute('data-state', 'off');
    await pauseButton(page).click();
    await expect(live(page)).toHaveAttribute('data-state', 'on');
  });

  test('30 秒でタマのキャンセルのログが出て、その後の SELECT でタマが cancelled になる。30 秒より前は reserved', async ({ page }) => {
    await timed(page);
    await elapse(page, 29);
    await runSql(page, 'SELECT * FROM visits ORDER BY id;');
    await expect(results(page).locator('tbody td')).toHaveText([
      'visit-pochi',
      'ポチ',
      'cancelled',
      'visit-tama',
      'タマ',
      'reserved',
    ]);
    await expect(allRows(page).filter({ hasText: 'visit-tama/cancel' })).toHaveCount(0);
    await elapse(page, 1);
    await expect(allRows(page).filter({ hasText: 'POST /visits/visit-tama/cancel 200 11ms' })).toHaveCount(1);
    await expect(results(page).locator('tbody td').nth(5)).toHaveText('reserved');
    await runSql(page, 'SELECT * FROM visits ORDER BY id;');
    await expect(results(page).locator('tbody td').nth(5)).toHaveText('cancelled');
    await tab(page, /ログの検索/).click();
    await expect(logRows(page).filter({ hasText: 'POST /visits/visit-tama/cancel 200 11ms' })).toContainText(
      'Nov 06 18:20:30.214',
    );
  });

  test('参加者が DB を壊していても、30 秒の出来事でエラーを画面に出さない', async ({ page }) => {
    await timed(page);
    await runSql(page, 'DROP TABLE visits;');
    await expect(results(page)).toContainText('実行しました');
    await elapse(page, 30);
    await expect(allRows(page).filter({ hasText: 'POST /visits/visit-tama/cancel' })).toHaveCount(1);
    await expect(results(page).getByRole('alert')).toHaveCount(0);
    await expect(results(page)).toContainText('実行しました');
    await expect(scene(page).locator('.playground-error')).toHaveCount(0);
  });

  test('DB の読み込みが終わる前に届いた UPDATE は、読み込みが終わった時点で適用される', async ({ page }) => {
    let release = (): void => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route('**/*.wasm', async (route) => {
      await gate;
      await route.continue();
    });
    await page.goto(path);
    await expect(sql(page)).toHaveAttribute('data-state', 'loading');
    await page.evaluate(() => {
      document.querySelector('[data-playground="sql"]')?.dispatchEvent(
        new CustomEvent('playground:exec-sql', {
          detail: { sql: `UPDATE visits SET status = 'cancelled' WHERE id = 'visit-tama';` },
        }),
      );
    });
    release();
    await expect(sql(page)).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
    await startButton(page).click();
    await pauseButton(page).click();
    await expect(runButton(page)).toBeEnabled();
    await runSql(page, 'SELECT id, status FROM visits ORDER BY id;');
    await expect(results(page).locator('tbody td')).toHaveText([
      'visit-pochi',
      'cancelled',
      'visit-tama',
      'cancelled',
    ]);
  });

  test('連絡は 0 秒、2 秒、5 秒、36 秒、39 秒、60 秒、105 秒に、短い投稿に分かれて届く', async ({ page }) => {
    await timed(page);
    await expect(posts(page)).toHaveCount(1);
    await elapse(page, 1);
    await page.clock.runFor(750);
    await expect(posts(page)).toHaveCount(1);
    await page.clock.runFor(250);
    await expect(posts(page)).toHaveCount(2);
    await expect(posts(page).nth(1).locator('.post-text')).toHaveText(introPosts[1] ?? '');
    await elapse(page, 3);
    await expect(posts(page)).toHaveCount(3);
    await expect(posts(page).nth(2).locator('.post-text')).toHaveText(introPosts[2] ?? '');
    await elapse(page, 30);
    await page.clock.runFor(750);
    await expect(posts(page)).toHaveCount(3);
    await page.clock.runFor(250);
    await expect(posts(page)).toHaveCount(4);
    await expect(posts(page).nth(3)).toContainText('カスタマーサポート');
    await expect(posts(page).nth(3)).toContainText('18:20');
    await expect(posts(page).nth(3).locator('.post-text')).toHaveText('すみません、もう1件です');
    await elapse(page, 3);
    await expect(posts(page)).toHaveCount(5);
    await expect(posts(page).nth(4).locator('.post-text')).toHaveText(
      '別の飼い主さんからも同じ連絡が来てて、タマちゃん（visit-tama）もキャンセルになってます。さっき見たときは予約のままだったんですが…',
    );
    await expect(posts(page).nth(4)).toBeInViewport();
    await elapse(page, 21);
    await expect(posts(page)).toHaveCount(6);
    await expect(posts(page).nth(5)).toContainText('18:21');
    await expect(posts(page).nth(5).locator('.post-text')).toHaveText(
      '病院さんに折り返さないとなので、わかってるところまででいいので教えてください！',
    );
    await elapse(page, 45);
    await expect(posts(page)).toHaveCount(7);
    await expect(posts(page).nth(6).locator('.post-text')).toHaveText('どうでしょう…？病院さんずっとお待ちで💦');
    await expect(posts(page).nth(6)).toBeInViewport();
    await elapse(page, 60);
    await expect(posts(page)).toHaveCount(7);
  });

  test('「途中経過を報告する」は、その時点の調査メモを「あなた」の投稿として送り、何度でも送れて、進行は終わらない', async ({ page }) => {
    await timed(page);
    await expect(interim(page)).toBeEnabled();
    await interim(page).click();
    await expect(posts(page)).toHaveCount(2);
    await expect(posts(page).nth(1)).toContainText('あなた');
    await expect(posts(page).nth(1).locator('.post-text')).toHaveText(
      'まだ何も分かってないです、調査中です',
    );
    await showPochi(page);
    await openCancelLog(page);
    await interim(page).click();
    await expect(posts(page)).toHaveCount(3);
    await expect(posts(page).nth(2).locator('.post-text')).toHaveText(
      'いま分かってるところです\nいつ: 2026-11-06 18:11:58\n何を: status が cancelled\n誰が・なぜ は調査中です',
    );
    await tab(page, /リポジトリ/).click();
    await interim(page).click();
    await expect(posts(page)).toHaveCount(4);
    await expect(posts(page).nth(3).locator('.post-text')).toHaveText(
      `いま分かってるところです\nいつ: 2026-11-06 18:11:58\n何を: status が cancelled\n誰が: ${missing}\nなぜ: ${missing}`,
    );
    await expect(scene(page)).toHaveAttribute('data-phase', 'running');
    await expect(posts(page).nth(3)).toBeInViewport();
    await elapse(page, 2);
    await expect(timer(page)).toHaveText('対応開始から 00:02');
  });

  test('最終の返信の後、1.5 秒、3 秒、5 秒後にサポートの投稿が届いて、進行と時計が止まる。105 秒の投稿は出ない', async ({ page }) => {
    await timed(page);
    await openAll(page);
    await elapse(page, 6);
    await expect(posts(page)).toHaveCount(3);
    await reply(page).click();
    await expect(scene(page)).toHaveAttribute('data-phase', 'replied');
    await expect(reply(page)).toBeHidden();
    await expect(interim(page)).toBeDisabled();
    await expect(posts(page)).toHaveCount(5);
    await expect(posts(page).nth(3)).toContainText('あなた');
    await expect(posts(page).nth(3).locator('.post-text')).toHaveText(replyFirst);
    await expect(posts(page).nth(4).locator('.post-text')).toHaveText(replyLast);
    await page.clock.runFor(1250);
    await expect(posts(page)).toHaveCount(5);
    await page.clock.runFor(250);
    await expect(posts(page)).toHaveCount(6);
    await expect(posts(page).nth(5)).toContainText('カスタマーサポート');
    await expect(posts(page).nth(5).locator('.post-text')).toHaveText(supportFollowUps[0] ?? '');
    await expect(scene(page)).toHaveAttribute('data-phase', 'replied');
    await page.clock.runFor(1250);
    await expect(posts(page)).toHaveCount(6);
    await page.clock.runFor(250);
    await expect(posts(page)).toHaveCount(7);
    await expect(posts(page).nth(6).locator('.post-text')).toHaveText(supportFollowUps[1] ?? '');
    await page.clock.runFor(1750);
    await expect(posts(page)).toHaveCount(7);
    await page.clock.runFor(250);
    await expect(posts(page)).toHaveCount(8);
    await expect(posts(page).nth(7).locator('.post-text')).toHaveText(supportFollowUps[2] ?? '');
    await expect(posts(page).nth(7)).toBeInViewport();
    await expect(scene(page)).toHaveAttribute('data-phase', 'ended');
    await expect(live(page)).toHaveAttribute('data-state', 'off');
    await expect(timer(page)).toHaveText('対応開始から 00:11');
    await expect(pauseButton(page)).toBeDisabled();
    const rowCount = await allRows(page).count();
    await elapse(page, 120);
    await expect(posts(page)).toHaveCount(8);
    await expect(timer(page)).toHaveText('対応開始から 00:11');
    await expect(clock(page)).toHaveText('18:20:11');
    await expect(allRows(page)).toHaveCount(rowCount);
    await expect(scene(page).locator(liveRegions)).toHaveCount(1);
  });

  test('30 秒の出来事の後に返信すると、タマの来院は 2 件目の投稿として加わる', async ({ page }) => {
    await timed(page);
    await openAll(page);
    await elapse(page, 31);
    await expect(posts(page)).toHaveCount(3);
    await reply(page).click();
    await expect(posts(page)).toHaveCount(6);
    await expect(posts(page).nth(3)).toContainText('あなた');
    await expect(posts(page).nth(3).locator('.post-text')).toHaveText(replyFirst);
    await expect(posts(page).nth(4).locator('.post-text')).toHaveText(tamaReplyText);
    await expect(posts(page).nth(5).locator('.post-text')).toHaveText(replyLast);
  });

  test('「一時停止」で進行と時計が止まり、「再開する」で続きから進む', async ({ page }) => {
    await timed(page);
    await elapse(page, 2);
    await pauseButton(page).click();
    await expect(pauseButton(page)).toHaveText('再開する');
    await expect(scene(page)).toHaveAttribute('data-phase', 'paused');
    await expect(live(page)).toHaveAttribute('data-state', 'off');
    await page.clock.runFor(60_000);
    await expect(timer(page)).toHaveText('対応開始から 00:02');
    await expect(clock(page)).toHaveText('18:20:02');
    await expect(posts(page)).toHaveCount(2);
    await expect(allRows(page)).toHaveCount(5);
    await expect(affected(page)).toHaveText('キャンセルになった来院 1件');
    await pauseButton(page).click();
    await expect(pauseButton(page)).toHaveText('一時停止');
    await expect(scene(page)).toHaveAttribute('data-phase', 'running');
    await expect(live(page)).toHaveAttribute('data-state', 'on');
    await elapse(page, 2);
    await expect(timer(page)).toHaveText('対応開始から 00:04');
    await expect(allRows(page)).toHaveCount(6);
    await elapse(page, 31);
    await page.clock.runFor(750);
    await expect(posts(page)).toHaveCount(3);
    await page.clock.runFor(250);
    await expect(posts(page)).toHaveCount(4);
    await expect(timer(page)).toHaveText('対応開始から 00:36');
  });

  test('ブラウザのタイマーが遅れても、戻ったときに経過時間に追いつく', async ({ page }) => {
    await timed(page);
    await page.clock.fastForward(61_000);
    await expect(timer(page)).toHaveText('対応開始から 01:01');
    await expect(posts(page)).toHaveCount(6);
    await expect(allRows(page)).toHaveCount(5 + 15 + 1);
    await expect(allRows(page).filter({ hasText: 'POST /visits/visit-tama/cancel 200 11ms' })).toHaveCount(1);
    await expect(affected(page)).toHaveText('キャンセルになった来院 2件');
    await runSql(page, 'SELECT * FROM visits ORDER BY id;');
    await expect(results(page).locator('tbody td').nth(5)).toHaveText('cancelled');
  });

  test('「最初からやり直す」で開始の画面に戻り、DB のタマも reserved に戻り、進行は止まったままになる', async ({ page }) => {
    await timed(page);
    await elapse(page, 40);
    await expect(affected(page)).toHaveText('キャンセルになった来院 2件');
    await runSql(page, 'SELECT * FROM visits ORDER BY id;');
    await expect(results(page).locator('tbody td').nth(5)).toHaveText('cancelled');
    await interim(page).click();
    await resetButton(page).click();
    await expectIdle(page);
    await expect(startButton(page)).toBeFocused();
    await expect(editor(page)).toContainText('SELECT * FROM visits;');
    await page.clock.runFor(60_000);
    await expect(posts(page)).toHaveCount(0);
    await expect(timer(page)).toHaveText('対応開始から 00:00');

    await startButton(page).click();
    await expect(posts(page)).toHaveCount(1);
    await expect(timer(page)).toHaveText('対応開始から 00:00');
    await runSql(page, 'SELECT * FROM visits ORDER BY id;');
    await expect(results(page).locator('tbody td')).toHaveText([
      'visit-pochi',
      'ポチ',
      'cancelled',
      'visit-tama',
      'タマ',
      'reserved',
    ]);
    await elapse(page, 30);
    await runSql(page, 'SELECT * FROM visits ORDER BY id;');
    await expect(results(page).locator('tbody td').nth(5)).toHaveText('cancelled');
  });

  test('30 秒より前に「最初からやり直す」を押すと、保留していた UPDATE は適用されない', async ({ page }) => {
    await timed(page);
    await elapse(page, 10);
    await resetButton(page).click();
    await startButton(page).click();
    await elapse(page, 29);
    await runSql(page, 'SELECT * FROM visits ORDER BY id;');
    await expect(results(page).locator('tbody td').nth(5)).toHaveText('reserved');
  });

  test('動きを減らす設定でも、進行（投稿が届く、ログが増える）は止まらない', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await timed(page);
    await elapse(page, 36);
    await expect(posts(page)).toHaveCount(4);
    await expect(allRows(page)).toHaveCount(5 + 9 + 1);
    await expect(timer(page)).toHaveText('対応開始から 00:36');
  });

  test('役割の文は帯に出て、本文の見出しは、見た目から隠れ、読み上げには残る', async ({ page }) => {
    await ready(page);
    const hiddenOnScreen = async (locator: Locator): Promise<void> => {
      const box = await locator.boundingBox();
      expect(box?.width ?? 0).toBeLessThanOrEqual(1);
      expect(box?.height ?? 0).toBeLessThanOrEqual(1);
    };
    await hiddenOnScreen(page.locator('.chapter-body > .visually-hidden'));
    await expect(page.locator('[data-action-chip]')).toHaveText('手を動かす');
    await expect(page.locator('[data-action-text]')).toContainText('カスタマーサポートから届いた連絡に対応して');
    const tree = await page.locator('main').ariaSnapshot();
    expect(tree).not.toContain('できるようになること：');
    expect(tree).toContain('障害対応を体験する');
    await expect(page.getByRole('heading', { level: 2 })).toHaveText('障害対応を体験する');
    await expect(page.locator('.chapter-goal')).toHaveCount(0);
    await expect(page.locator('.chapter-body')).toContainText(
      'カスタマーサポートから連絡が届きます。ブラウザで社内のツールを開いて、誰が、いつ、何を、なぜキャンセルしたのかを調べてください。',
    );
    await expect(page.locator('.lesson-bar__title')).toBeVisible();
    await expect(page.getByRole('button', { name: '次のページへ' })).toBeVisible();
    await expect(page.locator('.lesson-bar__progress')).toBeVisible();
  });

  test('immersive でないページでは、帯の文と目標が見える', async ({ page }) => {
    await page.goto('/chapters/intro/');
    for (const selector of ['[data-action-text]', '.chapter-goal']) {
      const box = await page.locator(selector).boundingBox();
      expect(box?.width ?? 0).toBeGreaterThan(50);
      expect(box?.height ?? 0).toBeGreaterThan(10);
    }
  });

  test('開始後の初期状態では、チャットの投稿 1、調査メモ、無効な返信ボタン、アドレスバー、DB コンソールが出る', async ({ page }) => {
    await begin(page);
    await expect(page.getByRole('heading', { level: 2 })).toHaveText('障害対応を体験する');
    const chat = scene(page).getByRole('group', { name: 'チャット' });
    await expect(chat).toContainText('# 問い合わせ対応');
    await expect(posts(page)).toHaveCount(1);
    await expect(posts(page).first()).toContainText('カスタマーサポート');
    await expect(posts(page).first()).toContainText('18:20');
    await expect(scene(page).locator(liveRegions)).toHaveCount(1);
    await expect(scene(page).locator(liveRegions)).toHaveAttribute('aria-live', 'polite');
    await expect(feed(page)).toHaveAttribute('aria-live', 'polite');

    await expect(scene(page).locator('.memo-list dt')).toHaveText(['誰が', 'いつ', '何を', 'なぜ']);
    await expect(answerButton(page)).toBeVisible();
    await expect(interim(page)).toBeEnabled();
    await expect(resetButton(page)).toBeVisible();
    await expect(resetButton(page)).toBeEnabled();
    await expect(pauseButton(page)).toHaveText('再開する');

    await expect(scene(page).getByRole('tab')).toHaveCount(3);
    await expect(scene(page).getByRole('tabpanel', { includeHidden: false })).toHaveCount(1);
    await expect(panel(page, /DB コンソール/)).toBeVisible();
    await expectFresh(page);
  });

  test('DB コンソールでは、visits の列の定義が見え、テーブルの一覧には visits だけが出る', async ({ page }) => {
    await begin(page);
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
    await begin(page);
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
      'reserved',
    ]);
    await expect(results(page)).toContainText('2 行');
    await expect(memo(page, 'what')).toHaveAttribute('data-state', 'found');
    await expect(memo(page, 'what')).toHaveText('status が cancelled');
    await expect(unseen(page, /DB コンソール/)).toBeHidden();
    await expect(scene(page)).toHaveAttribute('data-ready', 'false');
  });

  test('visit-pochi の行を含まない結果では「何を」は分からない', async ({ page }) => {
    await begin(page);
    await runSql(page, `SELECT id, status FROM visits WHERE id = 'visit-tama';`);
    await expect(results(page).locator('tbody td')).toHaveText(['visit-tama', 'reserved']);
    await expect(memo(page, 'what')).toHaveAttribute('data-state', 'unknown');
    await runSql(page, `SELECT status FROM visits WHERE id = 'visit-pochi';`);
    await expect(results(page).locator('tbody td')).toHaveText(['cancelled']);
    await expect(memo(page, 'what')).toHaveAttribute('data-state', 'found');
  });

  test('Cmd/Ctrl + Enter で実行でき、複数行の SQL を書ける。入力欄で矢印キーを押してもページは移動しない', async ({ page }) => {
    await begin(page);
    await editor(page).click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.insertText('SELECT id\nFROM visits\nWHERE status = \'reserved\'\nORDER BY id;');
    await page.keyboard.press('ControlOrMeta+Enter');
    await expect(results(page).locator('tbody tr')).toHaveCount(1);
    await expect(sql(page).locator('.cm-line')).toHaveCount(4);

    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowLeft');
    await expect(page).toHaveURL(new RegExp(`${path}$`));
  });

  test('SQL の誤りは、クライアントの中にエラーとして出て、画面は壊れない', async ({ page }) => {
    await begin(page);
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
    await begin(page);
    await scene(page).getByRole('button', { name: 'visits', exact: true }).click();
    await expect(results(page).locator('thead th')).toHaveText(['id', 'pet_name', 'status']);
    await expect(results(page).locator('tbody tr')).toHaveCount(2);
    await expect(results(page).locator('tbody tr').nth(0)).toContainText('visit-pochi');
    await expect(results(page).locator('tbody tr').nth(0)).toContainText('ポチ');
    await expect(results(page).locator('tbody tr').nth(1)).toContainText('visit-tama');
    await expect(results(page).locator('tbody tr').nth(1)).toContainText('reserved');
    await expect(sql(page).locator('.cm-content')).toContainText('SELECT * FROM visits;');
    await expect(memo(page, 'what')).toHaveAttribute('data-state', 'found');
  });

  test('リセットのボタンは「最初からやり直す」の 1 つだけで、上部の帯にある', async ({ page }) => {
    await begin(page);
    await expect(scene(page).getByRole('button', { name: /最初/ })).toHaveText('最初からやり直す');
    await expect(sql(page).getByRole('button', { name: /最初|戻す/ })).toHaveCount(0);
    await expect(scene(page).getByRole('group', { name: 'チャット' }).getByRole('button', { name: /最初/ }))
      .toHaveCount(0);
    await expect(scene(page).getByRole('group', { name: 'ブラウザ' }).getByRole('button', { name: /最初/ }))
      .toHaveCount(0);
    await expect(scene(page).getByRole('group', { name: '対応の状況' }).getByRole('button', { name: /最初/ }))
      .toHaveCount(1);
  });

  test('UPDATE の後に「最初からやり直す」を押すと、DB も含めて全部が初期状態に戻る', async ({ page }) => {
    await begin(page);
    await runSql(page, `UPDATE visits SET status = 'reserved' WHERE id = 'visit-pochi';`);
    await expect(results(page)).toContainText('1 行を変更しました');
    await runSql(page, `DELETE FROM visits WHERE id = 'visit-tama';`);
    await runSql(page, 'SELECT * FROM visits ORDER BY id;');
    await expect(results(page).locator('tbody tr')).toHaveCount(1);
    await expect(results(page).locator('tbody tr').nth(0)).toContainText('reserved');
    await expect(memo(page, 'what')).toHaveAttribute('data-state', 'found');

    await resetButton(page).click();
    await expectIdle(page);
    await expect(editor(page)).toContainText('SELECT * FROM visits;');
    await expect(memo(page, 'what')).toHaveAttribute('data-state', 'unknown');

    await startButton(page).click();
    await pauseButton(page).click();
    await expectFresh(page);
    await runButton(page).click();
    await expect(results(page).locator('tbody tr')).toHaveCount(2);
    await expect(results(page).locator('tbody tr').nth(0)).toContainText('cancelled');
    await expect(results(page).locator('tbody tr').nth(1)).toContainText('visit-tama');
    await expect(results(page).locator('tbody tr').nth(1)).toContainText('reserved');
  });

  test('INSERT と DELETE も実行できる', async ({ page }) => {
    await begin(page);
    await runSql(page, `INSERT INTO visits (id, pet_name, status) VALUES ('visit-new', 'ハナ', 'reserved');`);
    await expect(results(page)).toContainText('1 行を変更しました');
    await runSql(page, `DELETE FROM visits WHERE id = 'visit-tama';`);
    await expect(results(page)).toContainText('1 行を変更しました');
    await runSql(page, 'SELECT id FROM visits ORDER BY id;');
    await expect(results(page).locator('tbody td')).toHaveText(['visit-new', 'visit-pochi']);
  });

  test('ログの検索では、アドレスバー、検索バー、時間範囲、ファセット、グラフ、一覧が出る', async ({ page }) => {
    await begin(page);
    await tab(page, /ログの検索/).click();
    await expect(address(page)).toHaveText('https://logs.internal.example/logs');
    const logs = panel(page, /ログの検索/);
    await expect(logs).toBeVisible();
    await expect(query(page)).toHaveValue('service:clinic-api');
    await expect(logs).toContainText('Past 15 Minutes');
    await expect(logCount(page)).toHaveText('5件中 5件');
    await expect(logs.locator('thead th')).toHaveText(['DATE', 'HOST', 'SERVICE', 'CONTENT']);
    await expect(logRows(page)).toHaveCount(5);
    await expect(logRows(page).first()).toContainText('Nov 06 18:14:20.455');
    await expect(logRows(page).first()).toContainText('clinic-api-1');
    await expect(logRows(page).first()).toContainText('clinic-api');
    await expect(logRows(page).first()).toContainText('GET /visits/visit-tama 200 5ms');
    await expect(logRows(page).first()).toContainText('INFO');
    await expect(logRows(page).last()).toContainText('Nov 06 18:10:41.203');
    await expect(logs.locator('[data-log-row][data-level="warn"]')).toHaveCount(0);
    await expect(logs).not.toContainText('visit-9999');
    await expect(logs).not.toContainText('Nov 06 09:12:04');

    const facets = logs.getByRole('group', { name: 'ログの絞り込み' });
    await expect(facets.locator('legend')).toHaveText(['Service', 'Status', 'HTTP Method']);
    await expect(facets.locator('.facet-item')).toHaveText([
      /clinic-api\s*5/,
      /Info\s*5/,
      /Warn\s*0/,
      /GET\s*4/,
      /POST\s*1/,
    ]);

    const chart = logs.getByRole('img');
    await expect(chart).toHaveAttribute('aria-label', /合計 5 件/);
    await expect(chart).toHaveAttribute('aria-label', /最も多いのは 18:11 の 3 件/);
    await expect(chart).toHaveAttribute('aria-label', /Warn を含む時間帯はありません/);
    await expect(chart.locator('.bar')).toHaveCount(16);
    await expect(chart.locator('.bar[data-warn="true"]')).toHaveCount(0);
    await expect(logs.locator('[data-tick]')).toHaveText(['18:05', '18:13', '18:20']);
    await expect(logs).toContainText(
      'キャンセルの操作があった時刻は分かります。理由と操作した人は、ログの属性にありません。',
    );
    await expect(scene(page).locator(liveRegions)).toHaveCount(1);
  });

  test('検索バーでは、自由な文字列と key:value で絞り込める。空白区切りは AND', async ({ page }) => {
    await begin(page);
    await tab(page, /ログの検索/).click();
    const expectRows = async (text: string, count: number): Promise<void> => {
      await query(page).fill(text);
      await expect(logRows(page), text).toHaveCount(count);
      await expect(logCount(page), text).toHaveText(`5件中 ${count}件`);
    };
    await expectRows('visit-pochi', 2);
    await expectRows('cancel', 1);
    await expectRows('CANCEL', 1);
    await expectRows('POST', 1);
    await expectRows('status:warn', 0);
    await expectRows('status:info', 5);
    await expectRows('@http.method:POST', 1);
    await expectRows('@http.status_code:404', 0);
    await expectRows('service:clinic-api visit-pochi', 2);
    await expectRows('service:clinic-api visit-tama GET', 1);
    await expectRows('status:info POST', 1);
    await expectRows('foo:bar', 0);
    await expect(scene(page).locator('[data-empty]')).toBeVisible();
    await expectRows('', 5);
    await expect(scene(page).locator('[data-empty]')).toBeHidden();
  });

  test('ファセットで絞り込め、検索バーの条件と AND で組み合わさる。グラフの説明も変わる', async ({ page }) => {
    await begin(page);
    await tab(page, /ログの検索/).click();

    await facet(page, 'status', 'warn').check();
    await expect(logRows(page)).toHaveCount(0);
    await expect(logCount(page)).toHaveText('5件中 0件');
    await expect(scene(page).getByRole('img')).toHaveAttribute('aria-label', /表示中のログはありません/);

    await facet(page, 'method', 'POST').check();
    await expect(logRows(page)).toHaveCount(0);

    await facet(page, 'status', 'warn').uncheck();
    await expect(logRows(page)).toHaveCount(1);
    await expect(scene(page).getByRole('img')).toHaveAttribute('aria-label', /合計 1 件/);

    await query(page).fill('visit-pochi');
    await expect(logRows(page)).toHaveCount(1);
    await expect(logRows(page)).toContainText('POST /visits/visit-pochi/cancel 200 12ms');
    await expect(facet(page, 'method', 'GET').locator('xpath=following-sibling::*[@data-facet-count]')).toHaveText('1');

    await facet(page, 'method', 'GET').check();
    await expect(logRows(page)).toHaveCount(2);
    await expect(scene(page).getByRole('img')).toHaveAttribute('aria-label', /Warn を含む時間帯はありません/);
  });

  test('絞り込みの条件に合わないログは、増えても表示されず、件数とグラフだけが更新される', async ({ page }) => {
    await timed(page);
    await tab(page, /ログの検索/).click();
    await query(page).fill('visit-pochi');
    await expect(logRows(page)).toHaveCount(2);
    await elapse(page, 12);
    await expect(logRows(page)).toHaveCount(3);
    await expect(logCount(page)).toHaveText('8件中 3件');
    await expect(allRows(page)).toHaveCount(8);
    await expect(scene(page).getByRole('img')).toHaveAttribute('aria-label', /合計 3 件/);
  });

  test('行を押すと詳細パネルが開き、時刻、status、service、host、メッセージ、属性が出る', async ({ page }) => {
    await begin(page);
    await tab(page, /ログの検索/).click();
    await expect(detail(page)).toBeHidden();

    await logRows(page).nth(4).locator('.col-date').click();
    await expect(detail(page)).toBeVisible();
    await expect(detail(page)).toContainText('GET /visits 200 8ms');
    await expect(detail(page)).toContainText('2026-11-06T18:10:41.203Z');
    await expect(detail(page)).toContainText('Info');
    await expect(detail(page)).toContainText('clinic-api-1');
    await expect(memo(page, 'when')).toHaveAttribute('data-state', 'unknown');

    await detail(page).getByRole('button', { name: 'ログの詳細を閉じる' }).click();
    await expect(detail(page)).toBeHidden();
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
    await begin(page);
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
    await begin(page);
    await tab(page, /ログの検索/).click();
    await query(page).fill('visit-pochi');
    await expect(memo(page, 'when')).toHaveAttribute('data-state', 'unknown');
    await expect(scene(page)).toHaveAttribute('data-opened', '');
  });

  test('リポジトリには visits.ts の全文が行番号つきで出る', async ({ page }) => {
    await begin(page);
    await tab(page, /リポジトリ/).click();
    await expect(address(page)).toHaveText('https://code.internal.example/clinic/visits.ts');
    const repo = panel(page, /リポジトリ/);
    await expect(repo).toContainText('clinic / clinic-api');
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

  test('タブの表示名はブラウザのタブのタイトルらしく、アクセシブルな名前に日本語の名前が残る', async ({ page }) => {
    await begin(page);
    await expect(scene(page).locator('.tab[data-tool] .tab-title')).toHaveText([
      'DB Console',
      'Log Explorer',
      'clinic-api/visits.ts',
    ]);
    await expect(tab(page, /DB コンソール/)).toHaveAccessibleName(/DB Console.*DB コンソール/);
    await expect(tab(page, /ログの検索/)).toHaveAccessibleName(/Log Explorer.*ログの検索/);
    await expect(tab(page, /リポジトリ/)).toHaveAccessibleName(/clinic-api\/visits\.ts.*リポジトリ/);
    await expect(tab(page, /DB コンソール/)).toHaveAccessibleName(/未確認/);
    await expect(scene(page).locator('.tab[data-tool] .fav')).toHaveCount(3);
    for (const element of await scene(page).locator('.tab[data-tool] .fav').all()) {
      await expect(element).toHaveAttribute('aria-hidden', 'true');
    }
    await answerButton(page).click();
    await expect(scene(page).locator('.tab[data-tool] .tab-title')).toHaveText([
      'DB Console',
      'Log Explorer',
      'clinic-api/visits.ts',
      'Coding Agent',
    ]);
    await expect(agentTab(page)).toHaveAccessibleName(/Coding Agent.*エージェント/);
  });

  test('アドレスバーは、戻る・進む・再読み込みの記号と鍵の記号を持ち、記号は装飾として扱われる', async ({ page }) => {
    await begin(page);
    await expect(scene(page).locator('.address .nav')).toHaveAttribute('aria-hidden', 'true');
    await expect(scene(page).locator('.address .nav i')).toHaveText(['←', '→', '↻']);
    await expect(scene(page).locator('.address .lock')).toHaveAttribute('aria-hidden', 'true');
    await expect(address(page)).toHaveText('https://db.internal.example/console');
  });

  test('チャットのサイドバー、入力欄の装飾、ログのナビゲーションは、装飾として扱われ、操作できない', async ({ page }) => {
    await begin(page);
    const side = scene(page).locator('.chat-side');
    await expect(side).toHaveAttribute('aria-hidden', 'true');
    await expect(side.locator('.chs li')).toHaveText(['# general', '# dev', '# 問い合わせ対応', '# 障害対応']);
    await expect(side.locator('.chs li.on')).toHaveText('# 問い合わせ対応');
    await expect(side.locator('button, a, input, [tabindex]')).toHaveCount(0);
    await expect(scene(page).locator('.composer .ph')).toHaveAttribute('aria-hidden', 'true');
    await expect(scene(page).locator('.composer .send-shape')).toHaveAttribute('aria-hidden', 'true');
    await expect(scene(page).locator('.composer .ph')).toHaveText('# 問い合わせ対応 へのメッセージ');
    await expect(scene(page).getByRole('heading')).toHaveCount(0);
    const rail = scene(page).locator('.lg-rail');
    await expect(rail).toHaveAttribute('aria-hidden', 'true');
    await expect(rail.locator('button, a, input, [tabindex]')).toHaveCount(0);
    await expect(scene(page).locator('.repo-tabs')).toHaveAttribute('aria-hidden', 'true');
    await expect(scene(page).locator('.repo-tabs span')).toHaveText(['Code', 'Issues', 'Pull requests']);
    await expect(scene(page).locator('.repo-bar .seg')).toHaveAttribute('aria-hidden', 'true');
    await expect(scene(page).getByRole('tab')).toHaveCount(3);
  });

  test('チャットのサイドバーは、ウィンドウの幅が足りないときだけ隠れる', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 640 });
    await begin(page);
    await expect(scene(page).locator('.chat-side')).toBeVisible();
    await page.setViewportSize({ width: 375, height: 812 });
    await expect(scene(page).locator('.chat-side')).toBeHidden();
    await page.setViewportSize({ width: 800, height: 900 });
    await expect(scene(page).locator('.chat-side')).toBeVisible();
  });

  test('DB コンソールは、接続名と SQLite の表示、テーブルの木構造、結果の行番号と行数の帯を持つ', async ({ page }) => {
    await begin(page);
    const conn = panel(page, /DB コンソール/).locator('.db-conn');
    await expect(conn).toContainText('clinic_production（read-write）');
    await expect(conn).toContainText('SQLite');
    await expect(scene(page).locator('.side-title')).toHaveText('Tables');
    await runSql(page, 'SELECT * FROM visits ORDER BY id;');
    await expect(results(page).locator('tbody tr')).toHaveCount(2);
    const marker = (selector: string): Promise<{ display: string; content: string }> =>
      results(page).locator(selector).first().evaluate((row) => {
        const style = getComputedStyle(row, '::before');
        return { display: style.display, content: style.content };
      });
    expect(await marker('tbody tr')).toEqual({ display: 'table-cell', content: 'counter(row)' });
    expect((await marker('thead tr')).display).toBe('table-cell');
    await expect(results(page).locator('.playground-result > .playground-note')).toHaveText('2 行');
    await expect(panel(page, /DB コンソール/)).toContainText('いまの状態だけが入っています。');
  });

  test('ログの検索は、画面名の帯、検索バー、ファセットの件数と印を持ち、Warn と Info の印が区別できる', async ({ page }) => {
    await begin(page);
    await tab(page, /ログの検索/).click();
    const logs = panel(page, /ログの検索/);
    await expect(logs.locator('.lg-title')).toHaveText('Logs');
    await expect(logs.locator('.lg-sub')).toHaveText('Explorer');
    await expect(logs.locator('.query-box .mag')).toHaveAttribute('aria-hidden', 'true');
    await expect(logs.locator('.facet legend')).toHaveText(['Service', 'Status', 'HTTP Method']);
    await expect(logs.locator('.swatch')).toHaveCount(2);
    await expect(logs.locator('.swatch[data-level="info"]')).toHaveAttribute('aria-hidden', 'true');
    const colors = await logs.locator('.swatch').evaluateAll((items) =>
      items.map((item) => getComputedStyle(item).backgroundColor)
    );
    expect(new Set(colors).size).toBe(2);
    await cancelRow(page).locator('.col-date').click();
    await expect(detail(page)).toHaveAttribute('data-level', 'info');
    await expect(detail(page).locator('.detail-section')).toHaveText('Event Attributes');
  });

  test('リポジトリは、パス、公開範囲、ブランチ、パンくず、実物から数えた行数を持つ', async ({ page }) => {
    await begin(page);
    await tab(page, /リポジトリ/).click();
    const repo = panel(page, /リポジトリ/);
    await expect(repo.locator('.repo-path')).toHaveText('clinic / clinic-api');
    await expect(repo.locator('.repo-path strong')).toHaveText('clinic-api');
    await expect(repo.locator('.repo-badge')).toHaveText('Private');
    await expect(repo.locator('.branch')).toHaveText('main');
    await expect(repo.locator('.crumbs')).toHaveText('clinic-api / src / visits.ts');
    const lines = await repo.locator('pre .line').count();
    await expect(repo.locator('.repo-lines')).toHaveText(`${lines} lines`);
  });

  test('エージェントは、左寄せの吹き出し、明朝系の本文、「依頼を入力」の入力欄を持つ', async ({ page }) => {
    await begin(page);
    await answerButton(page).click();
    await expect(turns(page)).toHaveCount(9, { timeout: agentDone });
    const box = await turns(page).first().locator('.bubble').evaluate((element) => {
      const outer = element.closest('.turns')?.getBoundingClientRect();
      const inner = element.getBoundingClientRect();
      return { left: inner.left - (outer?.left ?? 0), narrower: inner.width < (outer?.width ?? 0) };
    });
    expect(box.left).toBeLessThan(2);
    expect(box.narrower).toBe(true);
    const font = await turns(page).nth(1).locator('p').evaluate((element) => getComputedStyle(element).fontFamily);
    expect(font).toContain('Mincho');
    await expect(agentSend(page)).toBeEnabled();
    await expect(agentInput(page)).toHaveAttribute('placeholder', '依頼を入力');
  });

  test('どの画面にも、実在の製品名が出ない', async ({ page }) => {
    await begin(page);
    const check = async (label: string): Promise<void> => {
      const text = await scene(page).innerText();
      const content = await scene(page).evaluate((element) => {
        const labels = [...element.querySelectorAll('[aria-label], [title], [placeholder]')].flatMap((node) =>
          ['aria-label', 'title', 'placeholder'].map((name) => node.getAttribute(name) ?? '')
        );
        return [element.textContent ?? '', ...labels].join('\n');
      });
      const all = `${text}\n${content}`.toLowerCase();
      for (const word of ['slack', 'datadog', 'github', 'claude']) {
        expect(all, `${label}: ${word}`).not.toContain(word);
      }
    };
    await check('開始直後');
    await tab(page, /ログの検索/).click();
    await cancelRow(page).locator('.col-date').click();
    await check('ログ');
    await tab(page, /リポジトリ/).click();
    await check('リポジトリ');
    await answerButton(page).click();
    await expect(turns(page)).toHaveCount(9, { timeout: agentDone });
    await check('エージェント');
    await reply(page).click();
    await check('返信後');
  });

  test('ダークモードの設定でも、チャット、DB コンソール、ログの検索、リポジトリ、エージェントの背景色はライトと同じ', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await begin(page);
    await answerButton(page).click();
    const read = (): Promise<Record<string, string>> =>
      page.evaluate(() => {
        const background = (selector: string): string => {
          const element = document.querySelector(selector);
          return element === null ? 'missing' : getComputedStyle(element).backgroundColor;
        };
        return {
          chat: background('[data-investigation] .chat'),
          frame: background('[data-investigation] .browser'),
          tabStrip: background('[data-investigation] .tab-strip'),
          console: background('[role="tabpanel"][data-tool="console"]'),
          logs: background('[role="tabpanel"][data-tool="logs"]'),
          repo: background('[role="tabpanel"][data-tool="repo"]'),
          agent: background('[role="tabpanel"][data-tool="agent"]'),
          code: background('[data-investigation] pre.astro-code'),
          sidebar: background('[data-investigation] .chat-side'),
        };
      });
    const light = await read();
    await page.emulateMedia({ colorScheme: 'dark' });
    const dark = await read();
    for (const key of Object.keys(light)) {
      expect(light[key], `${key} light`).not.toBe('missing');
      expect(dark[key], key).toBe(light[key]);
    }
  });

  test('左右の矢印キー、Home、End でタブを移動でき、ページは移動しない', async ({ page }) => {
    await begin(page);
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
    await begin(page);
    await tab(page, /ログの検索/).click();
    await query(page).focus();
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowRight');
    await expect(page).toHaveURL(new RegExp(`${path}$`));
  });

  test('返信ボタンは、残っている条件に合わせた理由を出し、3つの条件を満たすと有効になる', async ({ page }) => {
    await begin(page);
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
    await expect(scene(page)).toHaveAttribute('data-ready', 'true');
    await expect(memo(page, 'who')).toHaveAttribute('data-state', 'missing');
    await expect(memo(page, 'who')).toHaveText(missing);
    await expect(memo(page, 'when')).toHaveAttribute('data-state', 'found');
    await expect(memo(page, 'what')).toHaveAttribute('data-state', 'found');
    await expect(memo(page, 'why')).toHaveAttribute('data-state', 'missing');
    await expect(memo(page, 'why')).toHaveText(missing);
    await expect(scene(page).locator('.unseen:visible')).toHaveCount(0);
  });

  test('3つの条件のうち 1 つが足りないときの理由が出る', async ({ page }) => {
    await begin(page);
    await openCancelLog(page);
    await tab(page, /リポジトリ/).click();
    await expect(reason(page)).toHaveText('DB コンソールで、visit-pochi の status を表示すると返信できます。');
    await tab(page, /DB コンソール/).click();
    await showPochi(page);
    await expect(reply(page)).toBeEnabled();
  });

  test('返信すると、「あなた」の投稿がチャットに加わり、返信ボタンが消える', async ({ page }) => {
    await begin(page);
    await openAll(page);
    await reply(page).click();

    await expect(reply(page)).toBeHidden();
    await expect(posts(page)).toHaveCount(3);
    await expect(posts(page).nth(1)).toContainText('あなた');
    await expect(posts(page).nth(1).locator('.post-text')).toHaveText(replyFirst);
    await expect(posts(page).nth(2).locator('.post-text')).toHaveText(replyLast);
    await expect(posts(page).nth(2)).toBeInViewport();
    await expect(scene(page).locator(liveRegions)).toHaveCount(1);
  });

  test('「答えを見る」で、エージェントのタブが加わり、会話が順に進んで、結論の後に返信できる', async ({ page }) => {
    await begin(page);
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
    await expect(scene(page).locator(liveRegions)).toHaveCount(1);
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
    await expect(scene(page)).toHaveAttribute('data-ready', 'true');
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
    await begin(page);
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
    await begin(page);
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
    await begin(page);
    await answerButton(page).click();
    await agentInput(page).focus();
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowRight');
    await expect(page).toHaveURL(new RegExp(`${path}$`));
  });

  test('エージェントの会話は、別のタブを開いても進み続ける', async ({ page }) => {
    await begin(page);
    await answerButton(page).click();
    await tab(page, /リポジトリ/).click();
    await expect(panel(page, /リポジトリ/)).toBeVisible();
    await expect(reply(page)).toBeEnabled({ timeout: agentDone });
    await tab(page, /エージェント/).click();
    await expect(turns(page)).toHaveCount(9);
    await expect(agentStatus(page)).toHaveText('完了');
  });

  test('エージェントの「この画面を開く」で、該当のタブとクエリが開く', async ({ page }) => {
    await begin(page);
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
    await expect(logCount(page)).toHaveText('5件中 2件');
    await expect(detail(page)).toBeVisible();
    await expect(detail(page)).toContainText('POST /visits/visit-pochi/cancel 200 12ms');

    await tab(page, /エージェント/).click();
    await open(2);
    await expect(tab(page, /リポジトリ/)).toHaveAttribute('aria-selected', 'true');
    await expect(panel(page, /リポジトリ/)).toBeVisible();
    await expect(address(page)).toHaveText('https://code.internal.example/clinic/visits.ts');
  });

  test('「最初からやり直す」で、エージェントのタブと会話が消え、「答えを見る」が有効に戻る', async ({ page }) => {
    await begin(page);
    await answerButton(page).click();
    await expect(turns(page)).toHaveCount(2, { timeout: 5000 });
    await resetButton(page).click();
    await expect(scene(page).getByRole('tab')).toHaveCount(3);
    await expect(scene(page).locator('[role="log"]')).toHaveCount(0);
    await expect(answerButton(page)).toBeEnabled();
    await expectIdle(page);
    await page.waitForTimeout(2500);
    await expect(scene(page).locator('[role="log"]')).toHaveCount(0);
    await expect(reply(page)).toBeDisabled();

    await startButton(page).click();
    await pauseButton(page).click();
    await expectFresh(page);
    await answerButton(page).click();
    await expect(turns(page)).toHaveCount(1);
    await expect(turns(page)).toHaveCount(9, { timeout: agentDone });
    await expect(reply(page)).toBeEnabled();
  });

  test('動きを減らす設定では、エージェントの会話が一度に全部出る', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await begin(page);
    await answerButton(page).click();
    await expect(turns(page)).toHaveCount(9, { timeout: 500 });
    await expect(thinking(page)).toHaveCount(0);
    await expect(toolTurns(page)).toHaveCount(3);
    await expect(toolTurns(page).locator('xpath=self::*[@data-state="done"]')).toHaveCount(3);
    await expect(agentStatus(page)).toHaveText('完了');
    await expect(reply(page)).toBeEnabled({ timeout: 500 });
    await expect(scene(page)).toHaveAttribute('data-ready', 'true');
    await agentInput(page).fill('追加の依頼');
    await agentInput(page).press('Enter');
    await expect(turns(page)).toHaveCount(11, { timeout: 500 });
    await expect(turns(page).nth(10)).toHaveText(followUp);
  });

  test('「最初からやり直す」で、検索条件、ファセット、詳細パネル、タブ、チャットも初期状態に戻る', async ({ page }) => {
    await begin(page);
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

    await resetButton(page).click();

    await expectIdle(page);
    await expect(scene(page)).toHaveAttribute('data-opened', '');
    await expect(detail(page)).toBeHidden();
    await expect(facet(page, 'method', 'POST')).not.toBeChecked();
    await expect(editor(page)).toContainText('SELECT * FROM visits;');
    await expect(panel(page, /DB コンソール/)).toBeVisible();
    await expect(scene(page).getByRole('tabpanel', { includeHidden: false })).toHaveCount(1);

    await startButton(page).click();
    await pauseButton(page).click();
    await runButton(page).click();
    await expect(results(page).locator('tbody tr').nth(0)).toContainText('cancelled');
    await expect(results(page).locator('tbody tr').nth(0)).toContainText('visit-pochi');
  });

  test('文言に、導入では使わない語が出ない', async ({ page }) => {
    await begin(page);
    const read = async (): Promise<string> => page.locator('.chapter-body').innerText();
    const check = async (): Promise<void> => {
      const text = (await read()) + (await page.locator('.chapter-body').textContent());
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
    await interim(page).click();
    await check();
  });

  for (const size of [{ width: 375, height: 667 }, { width: 800, height: 900 }, { width: 1024, height: 768 }]) {
    test(`${size.width}x${size.height} で、どのタブを開いてもページ全体が横にスクロールしない`, async ({ page }) => {
      await page.setViewportSize(size);
      await begin(page);
      const overflows = (): Promise<boolean> =>
        page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      expect(await overflows(), 'idle').toBe(false);
      for (const name of [/DB コンソール/, /ログの検索/, /リポジトリ/]) {
        await tab(page, name).click();
        expect(await overflows(), String(name)).toBe(false);
      }
      await tab(page, /ログの検索/).click();
      await cancelRow(page).locator('.col-date').click();
      expect(await overflows(), 'detail').toBe(false);
    });
  }

  test('開始前の画面も、横にスクロールしない', async ({ page }) => {
    for (const size of [{ width: 375, height: 812 }, { width: 800, height: 900 }]) {
      await page.setViewportSize(size);
      await ready(page);
      expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
      await expect(startButton(page)).toBeInViewport();
    }
  });

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
    test(`${size.width}x${size.height} で、投稿 1 の本文が、チャットの領域の中でスクロールして全部読める`, async ({ page }) => {
      await page.setViewportSize(size);
      await begin(page);
      const text = posts(page).first().locator('.post-text');
      await expect(text).toBeAttached();
      const reach = await text.evaluate((element) => {
        const container = element.closest<HTMLElement>('[data-feed]');
        if (container === null) return null;
        const overflowY = getComputedStyle(container).overflowY;
        const clipped = container.scrollHeight > container.clientHeight + 1;
        container.scrollTop = 0;
        const outerTop = container.getBoundingClientRect().top;
        const startTop = element.getBoundingClientRect().top;
        container.scrollTop = container.scrollHeight;
        const endBottom = element.getBoundingClientRect().bottom;
        const outerBottom = container.getBoundingClientRect().bottom;
        return {
          scrolls: !clipped || overflowY === 'auto' || overflowY === 'scroll',
          startVisible: startTop >= outerTop - 1,
          endVisible: endBottom <= outerBottom + 1,
        };
      });
      expect(reach).toEqual({ scrolls: true, startVisible: true, endVisible: true });
    });
  }

  for (const size of [{ width: 1280, height: 640 }, { width: 1440, height: 790 }]) {
    test(`${size.width}x${size.height} で、ページ全体は縦にスクロールせず、あふれる領域はその領域の中でスクロールできる`, async ({ page }) => {
      await page.setViewportSize(size);
      await ready(page);
      const fit = (): Promise<{ page: boolean; width: boolean; main: boolean; top: number }> =>
        page.evaluate(() => {
          const main = document.querySelector<HTMLElement>('main.lesson-main');
          const scroller = document.scrollingElement ?? document.documentElement;
          const sceneBox = document.querySelector('[data-investigation]')?.getBoundingClientRect();
          const barBox = document.querySelector('[data-action-bar]')?.getBoundingClientRect();
          let reachable = false;
          if (main !== null) {
            const overflowY = getComputedStyle(main).overflowY;
            const overflows = main.scrollHeight > main.clientHeight + 1;
            const before = main.scrollTop;
            main.scrollTop = main.scrollHeight;
            reachable = (overflowY === 'auto' || overflowY === 'scroll') && (!overflows || main.scrollTop > before);
            main.scrollTop = before;
          }
          return {
            page: scroller.scrollHeight <= scroller.clientHeight,
            width: scroller.scrollWidth <= scroller.clientWidth,
            main: reachable,
            top: barBox !== undefined && sceneBox !== undefined ? sceneBox.top - barBox.bottom : 999,
          };
        });
      const expectFit = async (label: string): Promise<void> => {
        const result = await fit();
        expect(result.page, `${label} page`).toBe(true);
        expect(result.width, `${label} width`).toBe(true);
        expect(result.main, `${label} main`).toBe(true);
        expect(result.top, `${label} top`).toBeLessThanOrEqual(24);
      };
      await expectFit('idle');
      await startButton(page).click();
      await pauseButton(page).click();
      for (const name of [/DB コンソール/, /ログの検索/, /リポジトリ/]) {
        await tab(page, name).click();
        await expectFit(String(name));
      }
      await tab(page, /DB コンソール/).click();
      await showPochi(page);
      await tab(page, /ログの検索/).click();
      await cancelRow(page).locator('.col-date').click();
      await expectFit('detail');
      await tab(page, /リポジトリ/).click();
      await reply(page).click();
      await expectFit('replied');
      await answerButton(page).click();
      await agentInput(page).scrollIntoViewIfNeeded();
      await expect(agentInput(page)).toBeInViewport();
      await expect(turns(page)).toHaveCount(9, { timeout: agentDone });
      await expectFit('agent');
      await agentInput(page).scrollIntoViewIfNeeded();
      await expect(agentInput(page)).toBeInViewport();
      const log = await agentLog(page).evaluate((element) => {
        const box = element.getBoundingClientRect();
        const frame = element.closest('.win')?.getBoundingClientRect();
        const input = element.closest('.panel')?.querySelector('.agent-input')?.getBoundingClientRect();
        return {
          inside: frame !== undefined && box.bottom <= frame.bottom + 1 && box.right <= frame.right + 1,
          inputInside: frame !== undefined && input !== undefined && input.bottom <= frame.bottom + 1,
        };
      });
      expect(log).toEqual({ inside: true, inputInside: true });
    });
  }

  for (const size of [{ width: 375, height: 600 }, { width: 800, height: 700 }]) {
    test(`${size.width}x${size.height} では、ページ全体は縦にスクロールせず、領域の中でスクロールしても状況の帯が上端に見える`, async ({ page }) => {
      await page.setViewportSize(size);
      await begin(page);
      const boxes = await page.evaluate(() => {
        const rect = (selector: string) => document.querySelector(selector)?.getBoundingClientRect();
        return { chat: rect('[data-investigation] .win.chat'), browser: rect('[data-investigation] .browser') };
      });
      expect(boxes.chat?.left).toBe(boxes.browser?.left);
      const scrolled = await page.evaluate(() => {
        const main = document.querySelector<HTMLElement>('main.lesson-main');
        const scroller = document.scrollingElement ?? document.documentElement;
        const barTop = (): number =>
          document.querySelector('[data-investigation] .status-bar')?.getBoundingClientRect().top ?? -999;
        const before = barTop();
        if (main !== null) main.scrollTop = main.scrollHeight;
        return {
          pageFits: scroller.scrollHeight <= scroller.clientHeight,
          moved: main?.scrollTop ?? 0,
          before,
          after: barTop(),
        };
      });
      expect(scrolled.pageFits).toBe(true);
      expect(scrolled.moved).toBeGreaterThan(0);
      expect(Math.abs(scrolled.after - scrolled.before)).toBeLessThanOrEqual(2);
      await expect(scene(page).getByRole('group', { name: '対応の状況' })).toBeInViewport({ ratio: 1 });
    });
  }

  test('375px 幅では、チャットがタブの一つになり、最初はチャットが前に出る', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await begin(page);
    const chatTab = tab(page, /チャット/);
    const chatWindow = scene(page).locator('.win.chat');
    await expect(scene(page).getByRole('tab')).toHaveCount(4);
    await expect(chatTab).toHaveAttribute('aria-selected', 'true');
    await expect(tab(page, /DB コンソール/)).toHaveAttribute('aria-selected', 'false');
    await expect(chatWindow).toBeVisible();
    await expect(posts(page).first()).toBeVisible();
    await expect(scene(page).locator('.pages')).toBeHidden();
    await expect(scene(page).locator('.address')).toBeHidden();

    await tab(page, /DB コンソール/).click();
    await expect(chatWindow).toBeHidden();
    await expect(panel(page, /DB コンソール/)).toBeVisible();
    await expect(scene(page).locator('.address')).toBeHidden();
    await expect(chatTab).toHaveAttribute('aria-selected', 'false');
    await expect(tab(page, /DB コンソール/)).toHaveAttribute('aria-selected', 'true');

    await tab(page, /DB コンソール/).press('ArrowLeft');
    await expect(chatTab).toBeFocused();
    await expect(chatTab).toHaveAttribute('aria-selected', 'true');
    await expect(chatWindow).toBeVisible();
    await expect(scene(page).locator('.pages')).toBeHidden();
    await expect(scene(page)).toHaveAttribute('data-selected', 'console');
  });

  test('375px 幅では、タブは 1 段に並び、列の中でスクロールできる。未確認は点で出る', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await begin(page);
    const strip = scene(page).getByRole('tablist', { name: '開くツール' });
    const boxes = await scene(page).getByRole('tab').evaluateAll((elements) =>
      elements.map((element) => {
        const box = element.getBoundingClientRect();
        return { top: Math.round(box.top), height: box.height };
      })
    );
    expect(new Set(boxes.map((box) => box.top)).size).toBe(1);
    for (const box of boxes) expect(box.height).toBeGreaterThanOrEqual(44);
    expect(
      await strip.evaluate((element) => {
        const overflowX = getComputedStyle(element).overflowX;
        return element.scrollWidth <= element.clientWidth || overflowX === 'auto' || overflowX === 'scroll';
      }),
    ).toBe(true);
    await expect(tab(page, /DB コンソール/)).toHaveAccessibleName(/DB Console.*DB コンソール/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    const dot = unseen(page, /リポジトリ/);
    await expect(tab(page, /リポジトリ/)).toHaveAccessibleName(/未確認/);
    await expect(dot).toBeVisible();
    await expect(dot).toHaveText('未確認');

    await tab(page, /リポジトリ/).click();
    await expect(tab(page, /リポジトリ/)).toHaveAttribute('aria-selected', 'true');
    await tab(page, /リポジトリ/).scrollIntoViewIfNeeded();
    const inside = await tab(page, /リポジトリ/).evaluate((element) => {
      const box = element.getBoundingClientRect();
      const outer = element.closest('[role="tablist"]')?.getBoundingClientRect();
      return outer !== undefined && box.left >= outer.left - 1 && box.right <= outer.right + 1;
    });
    expect(inside).toBe(true);
    await tab(page, /リポジトリ/).press('Home');
    await expect(tab(page, /チャット/)).toBeFocused();
    await tab(page, /チャット/).scrollIntoViewIfNeeded();
    await expect(tab(page, /チャット/)).toBeInViewport({ ratio: 1 });
  });

  test('375px 幅で動きを減らす設定のときは、タブを切り替えても中身を動かさない', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 375, height: 812 });
    await begin(page);
    await tab(page, /DB コンソール/).click();
    const running = await panel(page, /DB コンソール/).evaluate((element) => element.getAnimations().length);
    expect(running).toBe(0);
  });

  test('375px 幅でも、状況の帯のボタンは名前を持ち、2.75rem 以上の大きさで押せる', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await begin(page);
    await expect(timer(page)).toHaveText(/対応開始から\s*00:0\d/);
    await expect(affected(page)).toHaveText(/キャンセルになった来院\s*1件/);
    await expect(pauseButton(page)).toHaveAccessibleName('再開する');
    await expect(resetButton(page)).toHaveAccessibleName('最初からやり直す');
    for (const button of [pauseButton(page), resetButton(page)]) {
      const box = await button.boundingBox();
      expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
  });

  test('375px 幅で別のタブを見ている間に届いた投稿は、チャットのタブに未読の数で出る', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await timed(page);
    const chatTab = tab(page, /チャット/);
    const badge = scene(page).locator('[data-chat-unread]');
    await expect(posts(page)).toHaveCount(1);
    await expect(badge).toBeHidden();
    await tab(page, /DB コンソール/).click();
    await page.clock.runFor(10_000);
    await expect(badge).toBeVisible();
    const count = Number(await badge.textContent());
    expect(count).toBeGreaterThanOrEqual(1);
    await expect(chatTab).toHaveAccessibleName(new RegExp(`^チャット\\s*（未読 ${count} 件）$`));
    await chatTab.click();
    await expect(badge).toBeHidden();
    await expect(chatTab).toHaveAccessibleName('チャット');
    await expect(posts(page)).toHaveCount(1 + count);
    await expect(posts(page).last()).toBeInViewport();
  });

  test('640px 以上の幅では、チャットのタブは出ず、チャットとブラウザの両方が見える', async ({ page }) => {
    for (const size of [{ width: 800, height: 900 }, { width: 1280, height: 640 }]) {
      await page.setViewportSize(size);
      await begin(page);
      await expect(scene(page).locator('[data-chat-tab]')).toBeHidden();
      await expect(scene(page).locator('.tab-short:visible')).toHaveCount(0);
      await expect(scene(page).getByRole('tab')).toHaveCount(3);
      await expect(scene(page).locator('.win.chat')).toBeVisible();
      await expect(scene(page).locator('.pages')).toBeVisible();
      await expect(tab(page, /DB コンソール/)).toHaveAttribute('aria-selected', 'true');
    }
  });

  test('チャットを前に出したまま幅を広げると、選んでいたツールのタブが選ばれた表示に戻る', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await begin(page);
    await expect(tab(page, /DB コンソール/)).toHaveAttribute('aria-selected', 'false');
    await page.setViewportSize({ width: 1280, height: 640 });
    await expect(tab(page, /DB コンソール/)).toHaveAttribute('aria-selected', 'true');
    await expect(scene(page).locator('.pages')).toBeVisible();
    await expect(scene(page).locator('.win.chat')).toBeVisible();
  });

  test('375px 幅では、ログの一覧とコードが中だけで横にスクロールする', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await begin(page);
    await tab(page, /ログの検索/).click();
    const log = scene(page).locator('[data-log-scroll]');
    expect(await log.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
    await tab(page, /リポジトリ/).click();
    const code = panel(page, /リポジトリ/).locator('pre');
    expect(await code.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
  });
});
