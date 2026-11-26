import { expect, type Locator, type Page, type Route, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const stepOnePath = '/chapters/chapter-2/2/';
const stepTwoPath = '/chapters/chapter-2/4/';
const passwordKey = 'es:agent:password';
const unavailable = 'いまは生成AIを使えません。ヒントと解答で進められます。';
const tooMany = '依頼が多すぎます。少し待ってからもう一度依頼してください。';
const stopped = 'ここまでで止めました。続きはもう一度依頼してください。';
const typedPassword = `typed-${Date.now()}`;

const exercise = (snapshot: string): string =>
  readFileSync(fileURLToPath(new URL(`../exercises/${snapshot}/visits.ts`, import.meta.url)), 'utf8');

type Sent = {
  readonly authorization: string | undefined;
  readonly body: {
    step: number;
    history: { role: string; text: string }[];
    visits: string;
    tests?: { passed: number; failed: number; failures: { name: string; message: string }[] };
  };
};

const root = (page: Page): Locator => page.locator('[data-play="add-record"]');
const agent = (page: Page): Locator => page.locator('details.play-agent-step');
const agentSummary = (page: Page): Locator => agent(page).locator('summary');
const log = (page: Page): Locator => page.locator('[data-role="agent-log"]');
const logEntries = (page: Page): Locator => log(page).locator('li');
const passwordField = (page: Page): Locator => page.getByLabel('講師が伝えるパスワード');
const startButton = (page: Page): Locator => page.getByRole('button', { name: '使い始める' });
const requestField = (page: Page): Locator => page.getByLabel('生成AIへの依頼');
const sendButton = (page: Page): Locator => page.getByRole('button', { name: '依頼する' });
const copyButton = (page: Page): Locator =>
  page.getByRole('button', { name: '手元のコーディングエージェント用のプロンプトをコピーする' });
const restoreButton = (page: Page): Locator => page.getByRole('button', { name: '読み込む前のコードに戻す' });
const summary = (page: Page): Locator => page.locator('[data-role="summary"]');
const storedCode = (page: Page, key: string): Promise<string | null> =>
  page.evaluate((name) => window.localStorage.getItem(name), key);

const open = async (page: Page, path: string = stepOnePath): Promise<void> => {
  await page.goto(path);
  await expect(root(page)).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'ポチの来院をキャンセルする' })).toBeEnabled();
};

const openAgent = async (page: Page): Promise<void> => {
  await agentSummary(page).click();
  await expect(agent(page)).toHaveJSProperty('open', true);
};

const login = async (page: Page, password: string = typedPassword): Promise<void> => {
  await passwordField(page).fill(password);
  await startButton(page).click();
  await expect(requestField(page)).toBeVisible();
};

const ask = async (page: Page, request: string): Promise<void> => {
  await requestField(page).fill(request);
  await sendButton(page).click();
};

const reply = (route: Route, status: number, body: unknown = {}): Promise<void> =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

const record = (route: Route, sent: Sent[]): void => {
  const request = route.request();
  sent.push({
    authorization: request.headers()['authorization'],
    body: request.postDataJSON() as Sent['body'],
  });
};

test.describe('手元のコーディングエージェント用のプロンプト', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const copied: string[] = [];
      Object.defineProperty(window, '__copied', { value: copied });
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: (text: string) => Promise.resolve(void copied.push(text)) },
      });
    });
  });

  for (
    const [step, path, directory] of [
      [1, stepOnePath, 'chapter-1-start'],
      [2, stepTwoPath, 'chapter-2-step-2-start'],
    ] as const
  ) {
    test(`ステップ${step}: ボタンを押すと、パスワードなしでプロンプトがクリップボードに入り、コピーしたことを伝える`, async ({ page }) => {
      await open(page, path);
      await openAgent(page);
      await copyButton(page).click();
      await expect(page.locator('[data-role="agent-copied"]')).toHaveText('コピーしました。');
      await expect(page.locator('[data-role="agent-copied"]')).toHaveAttribute('aria-live', 'polite');
      const copied = await page.evaluate(() => (window as unknown as { __copied: string[] }).__copied);
      expect(copied).toHaveLength(1);
      const prompt = copied[0] ?? '';
      expect(prompt).toContain(`curl -LO ${new URL(page.url()).origin}/es-patchwork-exercises.tar.gz`);
      expect(prompt).toContain(`cd es-patchwork-exercises/${directory}`);
      expect(prompt).toContain('node --test visits.test.ts');
      expect(prompt).toContain('`pass 8` と `fail 0`');
      await expect(page.locator('[data-role="agent-prompt"]')).toBeHidden();
    });
  }

  test('クリップボードの API が使えないときは、プロンプトを読み取り専用の欄に出して選択する', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
    });
    await open(page);
    await openAgent(page);
    await copyButton(page).click();
    const box = page.locator('[data-role="agent-prompt"]');
    await expect(box).toBeVisible();
    await expect(box).toHaveAttribute('readonly', '');
    await expect(box).toHaveValue(/cd es-patchwork-exercises\/chapter-1-start/);
    await expect(box).toBeFocused();
    const selected = await box.evaluate((element: HTMLTextAreaElement) =>
      element.value.slice(element.selectionStart, element.selectionEnd).length === element.value.length
    );
    expect(selected).toBe(true);
    await expect(page.locator('[data-role="agent-copied"]')).toHaveText('');
  });

  test('chromium では、実際のクリップボードにプロンプトが入る', async ({ page, context, browserName }) => {
    test.skip(browserName !== 'chromium', 'クリップボードの権限を許可できるのは chromium だけ');
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.addInitScript(() => {
      Reflect.deleteProperty(navigator, 'clipboard');
    });
    await open(page);
    await openAgent(page);
    await copyButton(page).click();
    await expect(page.locator('[data-role="agent-copied"]')).toHaveText('コピーしました。');
    const text = await page.evaluate(() => navigator.clipboard.readText());
    expect(text).toContain('cd es-patchwork-exercises/chapter-1-start');
  });
});

test.describe('生成AIに頼む', () => {
  test('ヒントと同じグループの details として並び、開くと他のヒントが閉じる', async ({ page }) => {
    await open(page);
    await expect(agentSummary(page)).toHaveText('生成AIに頼む');
    await expect(agent(page)).toHaveAttribute('name', 'hints-step-1');
    await page.locator('details.play-hint-step summary').first().click();
    await openAgent(page);
    await expect(page.locator('details.play-hint-step').first()).toHaveJSProperty('open', false);
    await expect(passwordField(page)).toBeVisible();
    await expect(startButton(page)).toBeVisible();
    await expect(requestField(page)).toBeHidden();
  });

  test('パスワードを入れて依頼すると、置き換え案がエディタに入り、テスト結果が次の依頼に付き、完了で止まる', async ({ page }) => {
    const sent: Sent[] = [];
    const answer = exercise('chapter-2-step-1');
    const edited = `${exercise('chapter-1-start')}// 自分の編集`;
    const moves = [
      { kind: 'replace', text: '記録を足しました。', code: answer },
      { kind: 'run_tests', text: '' },
      { kind: 'done', text: 'テストが通りました。' },
    ];
    await page.route('**/api/agent', async (route) => {
      record(route, sent);
      await reply(route, 200, { move: moves[sent.length - 1] });
    });
    await open(page);
    await page.locator('[data-role="editor"] .cm-content').click();
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.insertText('// 自分の編集');
    await openAgent(page);
    await login(page);
    expect(await page.evaluate((key) => window.sessionStorage.getItem(key), passwordKey)).toBe(typedPassword);
    await ask(page, 'テストを通してください');

    await expect(logEntries(page)).toHaveText([
      '記録を足しました。',
      'visits.ts を書き換えました。',
      'テストを実行しました。pass 8 / fail 0',
      'テストが通りました。',
    ], { timeout: 30_000 });
    await expect(summary(page)).toHaveText('pass 8 / fail 0');
    expect(await storedCode(page, 'es:code:step-1')).toBe(JSON.stringify({ 'visits.ts': answer }));

    expect(sent).toHaveLength(3);
    expect(sent.map((call) => call.authorization)).toEqual(Array(3).fill(`Bearer ${typedPassword}`));
    expect(sent[0]?.body.step).toBe(1);
    expect(sent[0]?.body.visits).toBe(edited);
    expect(sent[0]?.body.history).toEqual([{ role: 'user', text: 'テストを通してください' }]);
    expect(sent[0]?.body.tests).toBeUndefined();
    expect(sent[1]?.body.visits).toBe(answer);
    expect(sent[1]?.body.history.at(-1)?.role).toBe('user');
    expect(sent[2]?.body.tests).toEqual({ passed: 8, failed: 0, failures: [] });

    await expect(requestField(page)).toBeEnabled();
    await expect(sendButton(page)).toBeEnabled();
    await restoreButton(page).click();
    expect(await storedCode(page, 'es:code:step-1')).toBe(JSON.stringify({ 'visits.ts': edited }));
  });

  test('失敗したテストの要約が、次のリクエストに付く', async ({ page }) => {
    const sent: Sent[] = [];
    const moves = [{ kind: 'run_tests', text: '' }, { kind: 'message', text: '失敗しています。' }];
    await page.route('**/api/agent', async (route) => {
      record(route, sent);
      await reply(route, 200, { move: moves[sent.length - 1] });
    });
    await open(page);
    await openAgent(page);
    await login(page);
    await ask(page, 'テストを流してください');
    await expect(logEntries(page)).toHaveText(['テストを実行しました。pass 4 / fail 4', '失敗しています。'], {
      timeout: 30_000,
    });
    expect(sent[1]?.body.tests?.passed).toBe(4);
    expect(sent[1]?.body.tests?.failed).toBe(4);
    expect(sent[1]?.body.tests?.failures.length).toBeGreaterThan(0);
    expect(sent[1]?.body.tests?.failures[0]?.message.length).toBeGreaterThan(0);
  });

  test('送信中は、入力欄とボタンを無効にする', async ({ page }) => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route('**/api/agent', async (route) => {
      await gate;
      await reply(route, 200, { move: { kind: 'message', text: '答えです。' } });
    });
    await open(page);
    await openAgent(page);
    await login(page);
    await ask(page, '質問です');
    await expect(requestField(page)).toBeDisabled();
    await expect(sendButton(page)).toBeDisabled();
    release();
    await expect(logEntries(page)).toHaveText(['答えです。']);
    await expect(requestField(page)).toBeEnabled();
    await expect(sendButton(page)).toBeEnabled();
  });

  test('エージェントが動いている間も、エディタとテスト結果が見える', async ({ page }) => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route('**/api/agent', async (route) => {
      await gate;
      await reply(route, 200, { move: { kind: 'message', text: '答えです。' } });
    });
    await open(page);
    await openAgent(page);
    await login(page);
    await ask(page, '質問です');
    await expect(requestField(page)).toBeDisabled();
    await expect(page.locator('[data-role="editor"] .cm-content')).toBeVisible();
    await expect(summary(page)).toBeVisible();
    await expect(page.getByRole('button', { name: 'テストを実行する' })).toBeVisible();
    release();
    await expect(logEntries(page)).toHaveText(['答えです。']);
  });

  test('1回の依頼でモデルを呼ぶのは最大4回で、止めたことを伝える', async ({ page }) => {
    const sent: Sent[] = [];
    await page.route('**/api/agent', async (route) => {
      record(route, sent);
      await reply(route, 200, { move: { kind: 'run_tests', text: '' } });
    });
    await open(page);
    await openAgent(page);
    await login(page);
    await ask(page, 'ずっと続けてください');
    await expect(logEntries(page).last()).toHaveText(stopped, { timeout: 60_000 });
    expect(sent).toHaveLength(4);
    await expect(requestField(page)).toBeEnabled();
  });

  test('401 では、保存したパスワードを消して、パスワードの欄に戻る', async ({ page }) => {
    await page.route('**/api/agent', (route) => reply(route, 401, { error: 'unauthorized' }));
    await open(page);
    await page.evaluate(([key, value]) => window.sessionStorage.setItem(key ?? '', value ?? ''), [
      passwordKey,
      'stale-value',
    ]);
    await page.reload();
    await expect(root(page)).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
    await openAgent(page);
    await expect(requestField(page)).toBeVisible();
    await ask(page, '質問です');
    await expect(page.getByText('パスワードが違います。')).toBeVisible();
    await expect(passwordField(page)).toBeVisible();
    await expect(requestField(page)).toBeHidden();
    expect(await page.evaluate((key) => window.sessionStorage.getItem(key), passwordKey)).toBeNull();
  });

  test('パスワードは、同じタブで開き直しても残る', async ({ page }) => {
    await open(page);
    await openAgent(page);
    await login(page);
    await page.reload();
    await expect(root(page)).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
    await openAgent(page);
    await expect(requestField(page)).toBeVisible();
    await expect(passwordField(page)).toBeHidden();
  });

  test('503 ではメッセージを出し、依頼の文を残して、演習を続けられる', async ({ page }) => {
    await page.route('**/api/agent', (route) => reply(route, 503, { error: 'disabled' }));
    await open(page);
    await openAgent(page);
    await login(page);
    await ask(page, 'テストを通してください');
    await expect(logEntries(page)).toHaveText([unavailable]);
    await expect(requestField(page)).toBeEnabled();
    await expect(requestField(page)).toHaveValue('テストを通してください');
    await page.getByRole('button', { name: 'テストを実行する' }).click();
    await expect(summary(page)).toHaveText('pass 4 / fail 4', { timeout: 30_000 });
    await page.getByRole('button', { name: 'ポチの来院をキャンセルする' }).click();
    await expect(page.locator('[data-role="visits-body"] td').nth(2)).toHaveText('cancelled', { timeout: 30_000 });
  });

  test('ネットワークエラーでも、同じメッセージを出して演習を続けられる', async ({ page }) => {
    await page.route('**/api/agent', (route) => route.abort('connectionrefused'));
    await open(page);
    await openAgent(page);
    await login(page);
    await ask(page, '質問です');
    await expect(logEntries(page)).toHaveText([unavailable]);
    await expect(sendButton(page)).toBeEnabled();
  });

  test('429 では、少し待つよう伝える', async ({ page }) => {
    await page.route('**/api/agent', (route) => reply(route, 429, { error: 'too_many_requests' }));
    await open(page);
    await openAgent(page);
    await login(page);
    await ask(page, '質問です');
    await expect(logEntries(page)).toHaveText([tooMany]);
    await expect(sendButton(page)).toBeEnabled();
  });

  test('ステップ2では step=2 と、ステップ1の解答から始まる visits.ts を送る', async ({ page }) => {
    const sent: Sent[] = [];
    await page.route('**/api/agent', async (route) => {
      record(route, sent);
      await reply(route, 200, { move: { kind: 'message', text: 'はい。' } });
    });
    await open(page, stepTwoPath);
    await openAgent(page);
    await expect(agent(page)).toHaveAttribute('name', 'hints-step-2');
    await login(page);
    await ask(page, '質問です');
    await expect(logEntries(page)).toHaveText(['はい。']);
    expect(sent[0]?.body.step).toBe(2);
    expect(sent[0]?.body.visits).toBe(exercise('chapter-2-step-2-start'));
  });

  test('画面に製品名を出さない', async ({ page }) => {
    await open(page);
    await openAgent(page);
    const text = (await root(page).evaluate((element) => element.textContent ?? '')).toLowerCase();
    for (const word of ['cloudflare', 'workers ai', 'deepseek', 'claude', 'openai']) {
      expect(text, word).not.toContain(word);
    }
  });
});
