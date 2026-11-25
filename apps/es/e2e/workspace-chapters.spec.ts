import { expect, type Locator, type Page, test } from '@playwright/test';

type Size = { readonly width: number; readonly height: number };

type Expected = {
  readonly id: string;
  readonly path: string;
  readonly tabs: readonly string[];
  readonly posts: readonly (readonly [string, string])[];
  readonly hiddenHeading?: string;
};

const inquiry = 'ポチちゃんの来院です（visit-pochi）。誰がいつなんでキャンセルしたか、わかりますか？';
const whyNotRecorded = 'なんで記録取ってないんですか';
const afterIncident = 'さっきの件、おつかれさまでした';
const ownQuestion =
  '自分が担当してるシステムで、いまのデータだけだと答えられない質問って何かあります？1つ書いてみてほしいです';
const wantRecord = '再発防止で、キャンセルしたときに記録を残すようにしたいです';
const runTests = '先にテストを書いておいたので、まず流してみてください。いまは4件落ちるはずです';
const failedFour = '落ちた4件が、これから足すところです👍';
const decisionRecord = '方針を ADR にまとめました。ざっと読んでもらえると助かります';
const tableRecord = '記録を1つのテーブルにまとめる案も ADR にしました';
const prSeen = 'PR 見ました！差分、思ったより小さいですね';
const prRemaining = '足したあとに残る作業も書いておきます';
const thanks = 'わー、ありがとうございます！これで次からは答えられますね🙏';
const otherClinicFirst = 'お疲れ様です！別の病院さんから、また同じ問い合わせが来てて…';
const otherClinicSecond = 'ポチちゃんの来院（visit-pochi）、なんでキャンセルになってるか分かりますか？';
const staffReply = '受付スタッフが、飼い主の都合でキャンセルしてます';
const answeredThanks = 'はやっ！ありがとうございます、病院さんに伝えます🙏';
const tamaAsked = 'あと、タマちゃん（visit-tama）の方もキャンセルの理由わかりますか？';
const tamaAnswer = 'タマの方は、記録を足す前のキャンセルなので、理由は残ってないです…';
const tamaAcknowledged = 'そうなんですね…了解です';

const support = 'カスタマーサポート';
const lead = 'テックリード';
const you = 'あなた';

const introduction: readonly (readonly [string, string])[] = [
  [support, inquiry],
  [support, whyNotRecorded],
];

const earlier: readonly (readonly [string, string])[] = [
  ...introduction,
  [lead, afterIncident],
  [lead, ownQuestion],
  [lead, wantRecord],
  [lead, runTests],
  [lead, failedFour],
];

const answered: readonly (readonly [string, string])[] = [
  ...introduction,
  [support, otherClinicFirst],
  [support, otherClinicSecond],
  [you, staffReply],
  [support, answeredThanks],
];

const pages: readonly Expected[] = [
  {
    id: '1-1',
    path: '/chapters/chapter-1/',
    tabs: ['データ変更の記録について'],
    posts: [...introduction, [lead, afterIncident], [lead, ownQuestion]],
    hiddenHeading: '自分のシステムの問いを1つ挙げる',
  },
  {
    id: '1-2',
    path: '/chapters/chapter-1/2/',
    tabs: ['visits.test.ts — clinic-api', 'テストの読み方'],
    posts: [...introduction, [lead, afterIncident], [lead, ownQuestion], [lead, wantRecord], [lead, runTests]],
    hiddenHeading: 'テストを実行する',
  },
  {
    id: '2-1',
    path: '/chapters/chapter-2/',
    tabs: ['ADR 1: 更新処理の中で記録する'],
    posts: [...earlier, [lead, decisionRecord]],
    hiddenHeading: '説明',
  },
  {
    id: '2-2',
    path: '/chapters/chapter-2/2/',
    tabs: ['visits.ts — clinic-api'],
    posts: [[support, inquiry]],
    hiddenHeading: 'ステップ1: キャンセルの記録を1行足す',
  },
  {
    id: '2-3',
    path: '/chapters/chapter-2/3/',
    tabs: ['ADR 2: 記録を1つのテーブルにまとめる'],
    posts: [...earlier, [lead, decisionRecord], [lead, tableRecord]],
    hiddenHeading: '記録を1つのテーブルにまとめる',
  },
  {
    id: '2-4',
    path: '/chapters/chapter-2/4/',
    tabs: ['visits.ts — clinic-api'],
    posts: [[support, inquiry]],
    hiddenHeading: 'ステップ2: 記録を business_events に移す',
  },
  {
    id: '2-5',
    path: '/chapters/chapter-2/5/',
    tabs: ['キャンセルの記録を足す'],
    posts: [[support, inquiry], [support, thanks], [lead, prSeen], [lead, prRemaining]],
    hiddenHeading: '記録を足すと visits.ts は何行変わるか',
  },
  {
    id: '3-1',
    path: '/chapters/chapter-3/',
    tabs: ['DB Console', 'SQL の実行手順'],
    posts: [...introduction, [support, otherClinicFirst], [support, otherClinicSecond]],
    hiddenHeading: '業務イベントから、誰がなぜキャンセルしたかを答える',
  },
  {
    id: '3-2',
    path: '/chapters/chapter-3/2/',
    tabs: ['who-cancelled.ts の SELECT'],
    posts: answered,
  },
  {
    id: '3-3',
    path: '/chapters/chapter-3/3/',
    tabs: ['実行結果の読み方'],
    posts: answered,
  },
  {
    id: '3-4',
    path: '/chapters/chapter-3/4/',
    tabs: ['記録を足す前に起きたこと'],
    posts: [...answered, [support, tamaAsked]],
    hiddenHeading: '記録を足す前にキャンセルされた来院には答えられない',
  },
];

const scene = (page: Page): Locator => page.locator('[data-investigation]');
const feed = (page: Page): Locator => scene(page).locator('[data-feed]');
const posts = (page: Page): Locator => feed(page).locator('.post');
const tabs = (page: Page): Locator => scene(page).getByRole('tab');
const tab = (page: Page, name: string | RegExp): Locator => scene(page).getByRole('tab', { name });
const rail = (page: Page): Locator => scene(page).locator('[data-rail]');
const unread = (page: Page): Locator => scene(page).locator('[data-unread]');
const chatMain = (page: Page): Locator => scene(page).locator('.chat-main');
const memo = (page: Page, key: string): Locator => scene(page).locator(`[data-memo="${key}"]`);
const reply = (page: Page, name: string): Locator => scene(page).getByRole('button', { name });
const resetChat = (page: Page): Locator => scene(page).getByRole('button', { name: '最初からやり直す' });

const waitForPlaygrounds = async (page: Page): Promise<void> => {
  for (const playground of await page.locator('[data-playground]:not([hidden]), [data-play]').all()) {
    await expect(playground).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
  }
};

const open = async (page: Page, path: string): Promise<void> => {
  await page.goto(path);
  await expect(scene(page)).toBeVisible();
  await waitForPlaygrounds(page);
};

const postsOf = async (page: Page): Promise<(readonly [string, string])[]> =>
  (await posts(page).evaluateAll((items) =>
    items.map((item) => [
      item.querySelector('[data-name]')?.textContent ?? '',
      item.querySelector('[data-text]')?.textContent ?? '',
    ])
  )) as (readonly [string, string])[];

type SignalLog = { readonly name: string; readonly data?: Record<string, unknown> };

const recordSignals = async (page: Page): Promise<void> => {
  await page.evaluate(() => {
    const log: SignalLog[] = [];
    Reflect.set(window, '__signals', log);
    document.addEventListener('workspace:signal', (event) => {
      log.push((event as CustomEvent<SignalLog>).detail);
    });
  });
};

const signalsOf = (page: Page): Promise<SignalLog[]> =>
  page.evaluate(() => (Reflect.get(window, '__signals') ?? []) as SignalLog[]);

const visibleText = (page: Page): Promise<string> =>
  scene(page).evaluate((element) => {
    const copy = element.cloneNode(true) as HTMLElement;
    for (const hidden of copy.querySelectorAll('.cm-editor, template, script, style')) hidden.remove();
    return copy.textContent ?? '';
  });

const replaceEditorText = async (playground: Locator, text: string): Promise<void> => {
  await playground.locator('.cm-content').click();
  await playground.page().keyboard.press('ControlOrMeta+a');
  await playground.page().keyboard.insertText(text);
};

test.describe('作業環境の各ページ', () => {
  for (const expected of pages) {
    test(`${expected.id}: 作業環境、履歴と開いた時点の投稿、タブの名前が出る`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 640 });
      await open(page, expected.path);
      await expect(scene(page)).toHaveAttribute('data-phase', 'running');
      await expect(scene(page).locator('[data-window]')).toHaveCount(2);
      await expect(scene(page).getByRole('group', { name: 'チャット' })).toBeVisible();
      await expect(scene(page).getByRole('group', { name: 'ブラウザ' })).toBeVisible();
      await expect(page.locator('.lesson-frame')).toHaveClass(/lesson-frame--immersive/);
      await expect.poll(() => tabs(page).locator('.tab-title').allTextContents()).toEqual([...expected.tabs]);
      await expect(tabs(page).first()).toHaveAttribute('aria-selected', 'true');
      await expect.poll(() => postsOf(page)).toEqual(expected.posts);
      if (expected.hiddenHeading !== undefined) {
        const heading = page.getByRole('heading', { name: expected.hiddenHeading });
        await expect(heading).toHaveCount(1);
        expect(await heading.evaluate((element) => element.closest('.visually-hidden') !== null)).toBe(true);
      }
    });
  }

  test('作業環境の前の見出し以外に、ページの h1 は増えない', async ({ page }) => {
    for (const expected of pages) {
      await page.goto(expected.path);
      await expect(page.locator('h1'), expected.id).toHaveCount(1);
    }
  });
});

test.describe('各ページの代表的な操作', () => {
  test('1-1: 入力欄に問いを書くと保存され、合図 question:written が起きる', async ({ page }) => {
    await open(page, '/chapters/chapter-1/');
    await recordSignals(page);
    const input = scene(page).getByRole('textbox', { name: '自分のシステムの問いを1つ挙げる' });
    await expect(scene(page).locator('.compose-box').getByRole('textbox')).toBeVisible();
    await expect(input).toHaveAttribute('placeholder', '# 問い合わせ対応 へのメッセージ');
    await input.fill('注文のキャンセルを誰がいつなぜ行ったか分かるか');
    await expect(scene(page).getByRole('status').filter({ hasText: 'このブラウザに保存しました。' })).toBeVisible();
    expect((await signalsOf(page)).map((signal) => signal.name)).toContain('question:written');
    expect(await page.evaluate(() => window.localStorage.getItem('es:question:chapter-1'))).toBe(
      '注文のキャンセルを誰がいつなぜ行ったか分かるか',
    );
    await expect(tab(page, /データ変更の記録について/)).toHaveAttribute('aria-selected', 'true');
    await expect(scene(page).locator('figure.quote')).toHaveCount(2);
  });

  test('1-2: テストを実行すると pass 4 / fail 4 になり、テックリードが投稿する。本文は別のタブにある', async ({ page }) => {
    await open(page, '/chapters/chapter-1/2/');
    await recordSignals(page);
    const playground = scene(page).locator('[data-playground="code"]');
    await expect(posts(page)).toHaveCount(6);
    await playground.getByRole('button', { name: 'テストを実行する' }).click();
    await expect(playground.locator('[data-role="summary"]')).toHaveText('pass 4 / fail 4');
    await expect(posts(page)).toHaveCount(7);
    expect((await postsOf(page)).at(-1)).toEqual([lead, failedFour]);
    const tests = (await signalsOf(page)).filter((signal) => signal.name === 'tests:ran');
    expect(tests.map((signal) => signal.data)).toEqual([{ pass: 4, fail: 4 }]);
    expect((await signalsOf(page)).map((signal) => signal.name)).not.toContain('tests:passed');

    await playground.getByRole('button', { name: 'テストを実行する' }).click();
    await expect.poll(async () => (await signalsOf(page)).filter((signal) => signal.name === 'tests:ran').length).toBe(
      2,
    );
    await expect(posts(page)).toHaveCount(7);

    await tab(page, /テストの読み方/).click();
    await expect(scene(page).getByRole('tabpanel', { name: /テストの読み方/ })).toContainText(
      '実行欄は、ページの中でコードを実行する欄です。',
    );
    await expect(scene(page).getByRole('tabpanel', { name: /テストの読み方/ })).toContainText(
      '来院をキャンセルすると、来院キャンセルの記録が1行残る',
    );
  });

  test('2-1: ADR は状況、決定、結果の順で、図はボタンを押さずに読める', async ({ page }) => {
    await open(page, '/chapters/chapter-2/');
    await recordSignals(page);
    const panel = scene(page).getByRole('tabpanel', { name: /ADR 1: 更新処理の中で記録する/ });
    await expect(panel.getByRole('heading', { level: 3 })).toHaveText(['状況', '決定', '結果']);
    await expect(panel).toContainText('問い合わせは「誰がいつなんでキャンセルしたか」でした。');
    await expect(panel.locator('table')).toHaveCount(0);
    const figure = panel.locator('[data-record-decision-figure]');
    await expect(figure.getByRole('button')).toHaveCount(0);
    await expect(figure).toContainText('UPDATE visits');
    await expect(figure).toContainText('INSERT INTO visit_cancellations');
    await expect(figure.getByRole('term').filter({ hasText: 'operated_by' })).toBeVisible();
    await expect(figure).toContainText('記録に成功する場合');
    await expect(figure).toContainText('記録に失敗する場合');
    expect((await signalsOf(page)).map((signal) => signal.name)).not.toContain('figure:step');
  });

  test('2-2: ステップ1の場面で実行とテストを押すと、合図 code:run と tests:ran が起きる', async ({ page }) => {
    await open(page, '/chapters/chapter-2/2/');
    await recordSignals(page);
    const play = scene(page).locator('[data-play="add-record"]');
    await play.getByRole('button', { name: 'ポチの来院をキャンセルする' }).click();
    await expect(play.locator('[data-role="visits-badge"]')).toHaveText('実行後');
    await play.getByRole('button', { name: 'テストを実行する' }).click();
    await expect(play.locator('[data-role="summary"]')).toHaveText('pass 4 / fail 4');
    const signals = await signalsOf(page);
    expect(signals.map((signal) => signal.name)).toContain('code:run');
    expect(signals.filter((signal) => signal.name === 'tests:ran').map((signal) => signal.data)).toEqual([{
      pass: 4,
      fail: 4,
    }]);
  });

  test('2-3: ADR に、業務イベントの定義と、ステップ1の列を business_events の列に移す図がある', async ({ page }) => {
    await open(page, '/chapters/chapter-2/3/');
    const panel = scene(page).getByRole('tabpanel', { name: /ADR 2: 記録を1つのテーブルにまとめる/ });
    await expect(panel.getByRole('heading', { level: 3 })).toHaveText(['状況', '決定', '結果']);
    await expect(panel).toContainText('業務イベントは、業務で起きた1つの出来事を');
    await expect(panel.locator('figure.quote')).toHaveCount(1);
    await expect(panel.locator('table')).toHaveCount(0);
    const figure = panel.locator('[data-record-mapping-figure]');
    await expect(figure.getByRole('button')).toHaveCount(0);
    await expect(figure.getByRole('columnheader', { name: 'ステップ1' })).toBeVisible();
    await expect(figure.getByRole('cell', { name: 'cancelled_at' })).toBeVisible();
    await expect(figure.getByRole('cell', { name: /^target_state/ })).toBeVisible();
    await expect(panel.getByRole('link', { name: '関連記事' })).toHaveAttribute(
      'href',
      'https://kosui.me/posts/2025/05/06/142842',
    );
  });

  test('2-5: プルリクエストに +13 −1 を出し、Files changed で visits.ts の差分を見る', async ({ page }) => {
    await open(page, '/chapters/chapter-2/5/');
    const panel = scene(page).getByRole('tabpanel', { name: /キャンセルの記録を足す/ });
    await expect(panel.locator('[data-pr-stat]')).toHaveText(/^\s*\+13\s*−1\s*$/);
    await expect(panel.locator('.pr-state')).toHaveText('Open');
    await expect(panel).toContainText('変更量は、+13/-1 行です');
    await expect(panel.locator('figure.quote')).toHaveCount(1);
    await expect(panel.getByRole('tab', { name: 'Conversation' })).toHaveAttribute('aria-selected', 'true');
    await expect(panel.locator('.pr-file')).toBeHidden();

    await panel.getByRole('tab', { name: /Files changed/ }).click();
    await expect(panel.getByRole('tab', { name: /Files changed/ })).toHaveAttribute('aria-selected', 'true');
    await expect(panel.locator('.pr-line.pr-add')).toHaveCount(13);
    await expect(panel.locator('.pr-line.pr-del')).toHaveCount(1);
    await expect(panel.locator('.pr-line.pr-del .pr-code')).toContainText('input: { visitId: string }');
    await expect(panel.locator('.pr-line.pr-add .pr-code').filter({ hasText: 'INSERT INTO business_events' }))
      .toHaveCount(1);
    const colors = await panel.evaluate((element) => {
      const color = (selector: string): string =>
        getComputedStyle(element.querySelector(`${selector} .pr-code`) as Element).backgroundColor;
      return { add: color('.pr-line.pr-add'), del: color('.pr-line.pr-del'), same: color('.pr-line.pr-same') };
    });
    expect(colors.add).not.toBe(colors.del);
    expect(colors.add).not.toBe(colors.same);
    await panel.getByRole('tab', { name: 'Conversation' }).click();
    await expect(panel.locator('.pr-file')).toBeHidden();
    await expect(panel.getByRole('tab', { name: 'Conversation' })).toHaveAttribute('aria-selected', 'true');
  });

  test('3-1: SQL の結果から調査メモが埋まり、返信を送るとサポートが礼を言う。リセットは投稿だけを戻す', async ({ page }) => {
    await open(page, '/chapters/chapter-3/');
    const playground = scene(page).locator('[data-playground="sql"]');
    await expect(posts(page)).toHaveCount(4);
    await expect(reply(page, '調査結果を返信する')).toBeDisabled();
    for (const key of ['who', 'when', 'what', 'why']) {
      await expect(memo(page, key)).toHaveText('結果を確認してください');
      await expect(memo(page, key)).toHaveAttribute('data-state', 'unknown');
    }

    await replaceEditorText(playground, 'SELECT id, status FROM visits');
    await playground.getByRole('button', { name: '実行する' }).click();
    await expect(playground.locator('[data-role="results"] tbody tr')).toHaveCount(2);
    await expect(memo(page, 'who')).toHaveText('結果を確認してください');
    await expect(reply(page, '調査結果を返信する')).toBeDisabled();

    await playground.getByRole('button', { name: '最初の SQL に戻す' }).click();
    await playground.getByRole('button', { name: '実行する' }).click();
    await expect(memo(page, 'who')).toHaveText('受付スタッフ');
    await expect(memo(page, 'what')).toHaveText('来院のキャンセル');
    await expect(memo(page, 'why')).toHaveText('飼い主の都合');
    await expect(memo(page, 'when')).toHaveText(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    for (const key of ['who', 'when', 'what', 'why']) {
      await expect(memo(page, key)).toHaveAttribute('data-state', 'found');
    }
    await expect(reply(page, '調査結果を返信する')).toBeEnabled();

    const date = (await memo(page, 'when').textContent()) ?? '';
    await reply(page, '調査結果を返信する').click();
    const sent = (await postsOf(page)).at(-1);
    expect(sent?.[0]).toBe(you);
    expect(sent?.[1]).toBe(`${staffReply}（${date}）`);
    await expect.poll(async () => (await postsOf(page)).at(-1)).toEqual([support, answeredThanks]);
    await expect(reply(page, '調査結果を返信する')).toBeHidden();

    await expect(resetChat(page)).toBeEnabled();
    await resetChat(page).click();
    await expect.poll(() => postsOf(page)).toEqual([
      ...introduction,
      [support, otherClinicFirst],
      [support, otherClinicSecond],
    ]);
    await expect(memo(page, 'who')).toHaveText('結果を確認してください');
    await expect(reply(page, '調査結果を返信する')).toBeDisabled();
    await expect(playground.locator('[data-role="results"] tbody tr')).toHaveCount(2);
    await expect(tab(page, /DB Console/)).toHaveAttribute('aria-selected', 'true');
  });

  test('3-1: 本文は別のタブにあり、SQL の書き換えと保存キーは既存のまま', async ({ page }) => {
    await open(page, '/chapters/chapter-3/');
    await tab(page, /SQL の実行手順/).click();
    await expect(scene(page).getByRole('tabpanel', { name: /SQL の実行手順/ })).toContainText(
      '「実行する」を押します。SQL を書き換えて実行することもできます。',
    );
    await tab(page, /DB Console/).click();
    const playground = scene(page).locator('[data-playground="sql"]');
    await replaceEditorText(playground, 'SELECT 1');
    expect(await page.evaluate(() => window.localStorage.getItem('es:sql:chapter-3-who-cancelled'))).toBe('SELECT 1');
  });

  test('3-2: SELECT の本文とコードが文書にある', async ({ page }) => {
    await open(page, '/chapters/chapter-3/2/');
    const panel = scene(page).getByRole('tabpanel', { name: /who-cancelled.ts の SELECT/ });
    await expect(panel.locator('.code-block')).toContainText('LEFT JOIN business_events');
    await expect(panel.getByRole('heading', { name: '読むところ' })).toBeVisible();
    await expect(panel).toContainText('この SELECT は `visits` テーブルを変えずに'.replaceAll('`', ''));
    await panel.getByRole('button', { name: 'コピー' }).waitFor({ state: 'visible' });
  });

  test('3-3: 結果の表と、問いと列の表が文書にある', async ({ page }) => {
    await open(page, '/chapters/chapter-3/3/');
    const panel = scene(page).getByRole('tabpanel', { name: /実行結果の読み方/ });
    await expect(panel.locator('table')).toHaveCount(2);
    await expect(panel.getByRole('cell', { name: '受付スタッフ' }).first()).toBeVisible();
    await expect(panel).toContainText('同じ問い合わせが visit-pochi に届いたら、この行から答えられます。');
  });

  test('3-4: 図を最後まで進めると返信でき、返信を送れる', async ({ page }) => {
    await open(page, '/chapters/chapter-3/4/');
    await recordSignals(page);
    const figure = scene(page).locator('[data-before-record-figure]');
    const next = figure.getByRole('button', { name: '次へ', exact: true });
    await expect(reply(page, '返信する')).toBeDisabled();
    await expect(scene(page).locator('[data-reason]')).toHaveText('図を最後まで進めると返信できます。');
    for (let step = 1; step <= 3; step += 1) {
      await next.click();
      await expect(figure).toHaveAttribute('data-step', String(step));
      await expect(reply(page, '返信する')).toBeDisabled();
    }
    await next.click();
    await expect(figure).toHaveAttribute('data-step', '4');
    await expect(reply(page, '返信する')).toBeEnabled();
    await expect(posts(page)).toHaveCount(answered.length + 1);
    expect(
      (await signalsOf(page)).filter((signal) => signal.name === 'figure:step').map((signal) => signal.data?.['key']),
    )
      .toEqual(['1', '2', '3', 'last']);
    await expect(scene(page).locator('figure.quote')).toHaveCount(2);
    await reply(page, '返信する').click();
    expect((await postsOf(page)).at(-1)).toEqual([you, tamaAnswer]);
    await expect(reply(page, '返信する')).toBeHidden();
    await expect.poll(async () => (await postsOf(page)).at(-1)).toEqual([support, tamaAcknowledged]);
  });

  test('「最初からやり直す」は、チャットを開いた時点に戻し、書いたコードや問いは消さない', async ({ page }) => {
    await open(page, '/chapters/chapter-1/2/');
    const playground = scene(page).locator('[data-playground="code"]');
    await expect(posts(page)).toHaveCount(6);
    await playground.getByRole('button', { name: 'テストを実行する' }).click();
    await expect(posts(page)).toHaveCount(7);
    await expect(resetChat(page)).toBeEnabled();
    await resetChat(page).click();
    await expect.poll(() => postsOf(page)).toEqual(pages[1]?.posts);
    await expect(playground.locator('[data-role="summary"]')).toHaveText('pass 4 / fail 4');

    await playground.getByRole('button', { name: 'テストを実行する' }).click();
    await expect(posts(page)).toHaveCount(7);

    await open(page, '/chapters/chapter-1/');
    const input = scene(page).getByRole('textbox', { name: '自分のシステムの問いを1つ挙げる' });
    await input.fill('消えない問い');
    await resetChat(page).click();
    await expect(input).toHaveValue('消えない問い');
    await expect.poll(() => postsOf(page)).toEqual(pages[0]?.posts);
  });
});

const typing = (page: Page): Locator => scene(page).locator('[data-typing]');

test.describe('連続投稿と入力中の表示', () => {
  test('同じ発言者の投稿が続くと、2 件目以降はアバターと名前を出さず、読み上げには発言者名が残る', async ({ page }) => {
    await open(page, '/chapters/chapter-1/2/');
    await expect(posts(page)).toHaveCount(6);
    const continued = await posts(page).evaluateAll((items) =>
      items.map((item) => item.classList.contains('is-continued'))
    );
    expect(continued).toEqual([false, true, false, true, true, true]);
    const first = posts(page).nth(0);
    const second = posts(page).nth(1);
    await expect(first.locator('.avatar')).toBeVisible();
    await expect(first.locator('[data-name]')).toBeVisible();
    await expect(second.locator('.avatar')).toBeHidden();
    await expect(second.locator('[data-name]')).toHaveText(support);
    const hiddenBox = await second.locator('.post-head').evaluate((element) => {
      const box = element.getBoundingClientRect();
      return [box.width, box.height];
    });
    expect(Math.max(...hiddenBox)).toBeLessThanOrEqual(1);
    const gap = async (index: number): Promise<number> =>
      posts(page).evaluateAll((items, at) => {
        const top = (items[at] as HTMLElement).getBoundingClientRect().top;
        const previous = (items[at - 1] as HTMLElement).getBoundingClientRect().bottom;
        return top - previous;
      }, index);
    expect(await gap(1)).toBeLessThan(await gap(2));
    const names = await page.getByRole('list', { name: 'チャットの投稿' }).ariaSnapshot();
    expect(names.split(support).length - 1).toBe(2);
    expect(names.split(lead).length - 1).toBe(4);
  });

  test('届く前に「入力中…」が出て、届くと消える。読み上げの対象にしない', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-11-24T09:00:00Z') });
    await page.goto('/chapters/chapter-1/');
    await expect(scene(page)).toBeVisible();
    await page.clock.runFor(100);
    await expect(posts(page)).toHaveCount(3);
    await expect(typing(page)).toBeHidden();
    await expect(typing(page)).toHaveAttribute('aria-hidden', 'true');
    await page.clock.runFor(500);
    await expect(typing(page)).toBeVisible();
    await expect(typing(page)).toHaveText(`${lead} が入力中…`);
    await expect(posts(page)).toHaveCount(3);
    await page.clock.runFor(1500);
    await expect(posts(page)).toHaveCount(4);
    await expect(typing(page)).toBeHidden();
    expect(await typing(page).evaluate((element) => element.closest('[aria-live]') === null)).toBe(true);
  });

  test('合図で届く投稿は、合図の後に 1.2 秒「入力中…」を出してから届く', async ({ page }) => {
    await open(page, '/chapters/chapter-1/2/');
    await expect(posts(page)).toHaveCount(6);
    const playground = scene(page).locator('[data-playground="code"]');
    await playground.getByRole('button', { name: 'テストを実行する' }).click();
    await expect(playground.locator('[data-role="summary"]')).toHaveText('pass 4 / fail 4');
    await expect(typing(page)).toBeVisible();
    await expect(typing(page)).toHaveText(`${lead} が入力中…`);
    await expect(posts(page)).toHaveCount(6);
    await expect(posts(page)).toHaveCount(7);
    await expect(typing(page)).toBeHidden();
  });

  test('最終の返信の後も、届く前にサポートの「入力中…」が出る', async ({ page }) => {
    await open(page, '/chapters/chapter-3/4/');
    await expect(posts(page)).toHaveCount(answered.length + 1);
    const figure = scene(page).locator('[data-before-record-figure]');
    for (let step = 0; step < 4; step += 1) await figure.getByRole('button', { name: '次へ', exact: true }).click();
    await reply(page, '返信する').click();
    await expect(typing(page)).toBeVisible();
    await expect(typing(page)).toHaveText(`${support} が入力中…`);
    await expect(posts(page)).toHaveCount(answered.length + 3);
    await expect(typing(page)).toBeHidden();
  });

  test('動きを減らす設定では、「入力中…」を出さず、合図の投稿はすぐ届く', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page, '/chapters/chapter-1/2/');
    await expect(posts(page)).toHaveCount(6);
    const active = await typing(page).evaluate((element) => element.hasAttribute('data-active'));
    expect(active).toBe(false);
    const playground = scene(page).locator('[data-playground="code"]');
    await playground.getByRole('button', { name: 'テストを実行する' }).click();
    await expect(posts(page)).toHaveCount(7, { timeout: 800 });
    await expect(typing(page)).toBeHidden();
  });

  test('動きを減らす設定では、開いた時点の投稿の前にも「入力中…」を出さない', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.clock.install({ time: new Date('2026-11-24T09:00:00Z') });
    await page.goto('/chapters/chapter-1/');
    await page.clock.runFor(600);
    await expect(posts(page)).toHaveCount(3);
    await expect(typing(page)).toBeHidden();
    await page.clock.runFor(1500);
    await expect(posts(page)).toHaveCount(4);
  });
});

test.describe('演習のページでは、チャットを細い帯に折りたたむ', () => {
  test('帯にはカスタマーサポートのアバターだけが出て、幅は 3.5rem ほど', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 640 });
    await open(page, '/chapters/chapter-2/4/');
    await expect(rail(page)).toBeVisible();
    await expect(rail(page).locator('.rail-avatar')).toHaveText(['カ']);
    await expect(unread(page)).toBeHidden();
    await expect(chatMain(page)).toBeHidden();
    const box = await scene(page).locator('.win.chat').boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(52);
    expect(box?.width).toBeLessThanOrEqual(60);
    const browser = await scene(page).getByRole('group', { name: 'ブラウザ' }).boundingBox();
    expect(browser?.width).toBeGreaterThan(1100);
    await expect(rail(page)).toHaveAttribute('aria-expanded', 'false');
  });

  test('帯を押すとチャットが開いてブラウザに重なり、もう一度押すと閉じる', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 640 });
    await open(page, '/chapters/chapter-2/4/');
    const before = await scene(page).getByRole('group', { name: 'ブラウザ' }).boundingBox();
    await rail(page).click();
    await expect(rail(page)).toHaveAttribute('aria-expanded', 'true');
    await expect(chatMain(page)).toBeVisible();
    await expect(posts(page)).toHaveCount(1);
    await expect(feed(page)).toBeFocused();
    const chat = await chatMain(page).boundingBox();
    const after = await scene(page).getByRole('group', { name: 'ブラウザ' }).boundingBox();
    expect(after).toEqual(before);
    expect(chat !== null && before !== null && chat.x < before.x + before.width && chat.x + chat.width > before.x).toBe(
      true,
    );
    const top = await page.evaluate(() => {
      const element = document.querySelector('.chat-main');
      const box = element?.getBoundingClientRect();
      if (element === null || box === undefined) return false;
      return document.elementFromPoint(box.x + 40, box.y + 40)?.closest('.chat-main') === element;
    });
    expect(top).toBe(true);
    await rail(page).click();
    await expect(chatMain(page)).toBeHidden();
    await expect(rail(page)).toHaveAttribute('aria-expanded', 'false');
  });

  test('Esc キーで閉じ、フォーカスは帯に戻る。閉じているときの Esc は何もしない', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 640 });
    await open(page, '/chapters/chapter-2/4/');
    await page.keyboard.press('Escape');
    await expect(chatMain(page)).toBeHidden();
    await rail(page).click();
    await expect(chatMain(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(chatMain(page)).toBeHidden();
    await expect(rail(page)).toBeFocused();
  });

  test('ステップ2: テストがすべて成功すると、未読の数が帯に出て、開くと礼の投稿が読める', async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1280, height: 640 });
    await open(page, '/chapters/chapter-2/4/');
    await recordSignals(page);
    const play = page.locator('[data-play="add-record"]');
    await play.locator('details.play-hint-step').last().locator('summary').click();
    await play.getByRole('button', { name: 'ステップ2の完成コードを読み込む' }).click();
    await play.getByRole('button', { name: 'ポチの来院をキャンセルする' }).click();
    await expect(play.locator('[data-answer="who"] [data-role="answer-value"]')).toHaveText('受付スタッフ');
    await play.getByRole('button', { name: 'テストを実行する' }).click();
    await expect(play.locator('[data-role="summary"]')).toHaveText('pass 8 / fail 0');
    await expect(unread(page)).toBeVisible();
    await expect(unread(page)).toHaveText('1');
    await expect(rail(page)).toHaveAccessibleName('チャット（未読 1 件）');
    const names = (await signalsOf(page)).map((signal) => signal.name);
    expect(names).toContain('code:run');
    expect(names).toContain('tests:ran');
    expect(names).toContain('tests:passed');

    await rail(page).click();
    await expect(unread(page)).toBeHidden();
    await expect.poll(() => postsOf(page)).toEqual([[support, inquiry], [support, thanks]]);
    await page.keyboard.press('Escape');
    await expect(chatMain(page)).toBeHidden();

    await play.getByRole('button', { name: 'テストを実行する' }).click();
    await expect(unread(page)).toBeHidden();
  });

  test('ステップ1: テストがすべて成功しても、礼の投稿は届かない', async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1280, height: 640 });
    await open(page, '/chapters/chapter-2/2/');
    await recordSignals(page);
    const play = page.locator('[data-play="add-record"]');
    await play.locator('details.play-hint-step').last().locator('summary').click();
    await play.getByRole('button', { name: 'ステップ1の完成コードを読み込む' }).click();
    await play.getByRole('button', { name: 'テストを実行する' }).click();
    await expect(play.locator('[data-role="summary"]')).toHaveText('pass 8 / fail 0');
    const tests = (await signalsOf(page)).filter((signal) => signal.name === 'tests:ran');
    expect(tests.map((signal) => signal.data)).toEqual([{ pass: 8, fail: 0 }]);
    expect((await signalsOf(page)).map((signal) => signal.name)).toContain('tests:passed');
    await page.waitForTimeout(1500);
    await expect(unread(page)).toBeHidden();
  });

  test('スマートフォンの幅では帯を出さず、チャットはタブの一つになる。最初は本文のタブが前に出る', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await open(page, '/chapters/chapter-2/4/');
    const chatTab = tab(page, /チャット/);
    await expect(rail(page)).toBeHidden();
    await expect(chatTab).toBeVisible();
    await expect(chatTab).toHaveAttribute('aria-selected', 'false');
    await expect(chatMain(page)).toBeHidden();
    await expect(scene(page).locator('.pages')).toBeVisible();
    await chatTab.click();
    await expect(chatTab).toHaveAttribute('aria-selected', 'true');
    await expect(chatMain(page)).toBeVisible();
    await expect(posts(page)).toHaveCount(1);
    await expect(scene(page).locator('.pages')).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await tab(page, /エディタ/).click();
    await expect(chatMain(page)).toBeHidden();
    await expect(scene(page).locator('.pages')).toBeVisible();
  });

  test('スマートフォンの幅では、開いた時点で届く投稿がチャットのタブに未読の数で出る', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await open(page, '/chapters/chapter-3/');
    const chatTab = tab(page, /チャット/);
    const badge = scene(page).locator('[data-chat-unread]');
    await expect(badge).toBeVisible();
    await expect(chatTab).toHaveAccessibleName(/^チャット\s*（未読 \d+ 件）$/);
    await chatTab.click();
    await expect(badge).toBeHidden();
    await expect(chatMain(page)).toBeVisible();
  });
});

test.describe('画面に出さない語', () => {
  test('どのページの作業環境にも、特定のサービスの名前が出ない', async ({ page }) => {
    for (const expected of pages) {
      await open(page, expected.path);
      const text = await visibleText(page);
      for (const word of ['Slack', 'Datadog', 'GitHub', 'Claude']) {
        expect(text, `${expected.id} ${word}`).not.toContain(word);
      }
    }
  });

  test('第1章の作業環境には、業務イベント、business_events、target_ が出ない（コードの欄を除く）', async ({ page }) => {
    for (const expected of pages.filter((item) => item.id.startsWith('1-'))) {
      await open(page, expected.path);
      for (const tabName of expected.tabs) {
        await tab(page, tabName).click();
        const text = await visibleText(page);
        for (const word of ['業務イベント', 'business_events', 'target_']) {
          expect(text, `${expected.id} ${word}`).not.toContain(word);
        }
      }
    }
  });

  test('第2章の 1 ページ目と 2 ページ目には、定義より前の業務イベント、business_events、target_ が出ない（コードの欄を除く）', async ({ page }) => {
    for (const expected of pages.filter((item) => item.id === '2-1' || item.id === '2-2')) {
      await open(page, expected.path);
      const text = await visibleText(page);
      for (const word of ['業務イベント', 'business_events', 'target_']) {
        expect(text, `${expected.id} ${word}`).not.toContain(word);
      }
    }
  });

  test('ドメインイベントと DDD は、どのページにも出ない', async ({ page }) => {
    for (const expected of pages) {
      await open(page, expected.path);
      const text = await visibleText(page);
      expect(text, expected.id).not.toContain('ドメインイベント');
      expect(text, expected.id).not.toContain('DDD');
    }
  });
});

const desktopSizes: readonly Size[] = [{ width: 1280, height: 640 }, { width: 1440, height: 790 }];

test.describe('画面に収まる', () => {
  for (const size of desktopSizes) {
    test(`${size.width}x${size.height} で、ページ全体が縦にも横にもスクロールしない`, async ({ page }) => {
      await page.setViewportSize(size);
      const failures: string[] = [];
      for (const expected of pages) {
        await open(page, expected.path);
        for (const tabName of expected.tabs) {
          await tab(page, tabName).click();
          const metrics = await page.evaluate(() => ({
            scrollHeight: document.documentElement.scrollHeight,
            innerHeight: window.innerHeight,
            scrollWidth: document.documentElement.scrollWidth,
            innerWidth: window.innerWidth,
          }));
          if (metrics.scrollHeight > metrics.innerHeight || metrics.scrollWidth > metrics.innerWidth) {
            failures.push(`${expected.id} ${tabName} ${JSON.stringify(metrics)}`);
          }
        }
      }
      expect(failures).toEqual([]);
    });
  }

  test('375px の幅で、ページ全体が横にスクロールしない', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const failures: string[] = [];
    for (const expected of pages) {
      await open(page, expected.path);
      for (const tabName of expected.tabs) {
        await tab(page, tabName).click();
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        if (overflow > 0) failures.push(`${expected.id} ${tabName} ${overflow}px`);
      }
    }
    expect(failures).toEqual([]);
  });

  test('タブのパネルの中は、中だけでスクロールできる', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 640 });
    await open(page, '/chapters/chapter-2/');
    const scroller = scene(page).locator('.doc-scroll');
    const sizes = await scroller.evaluate((element) => ({
      client: element.clientHeight,
      scroll: element.scrollHeight,
    }));
    expect(sizes.scroll).toBeGreaterThan(sizes.client);
    await scroller.evaluate((element) => element.scrollTo(0, element.scrollHeight));
    expect(await scroller.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    expect(await page.evaluate(() => document.documentElement.scrollTop)).toBe(0);
  });
});
