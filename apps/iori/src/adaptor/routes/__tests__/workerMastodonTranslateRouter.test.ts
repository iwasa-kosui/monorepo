import { RA } from '@iwasa-kosui/result';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { TextGenerator } from '../../../ports/textGenerator.ts';
import { createStubTextGenerator } from '../../../testing/aiStubs.ts';
import { TranslationSchema } from '../../mastodon/entities.ts';
import { setupReadApi } from './helper/mastodonReadHarness.ts';

afterEach(() => {
  vi.useRealTimers();
});

const pathOf = (id: string) => `/api/v1/statuses/${id}/translate`;

const postJson = (body: unknown, headers: Record<string, string> = {}) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...headers },
  body: JSON.stringify(body),
});

const postForm = (body: Record<string, string>, headers: Record<string, string> = {}) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...headers },
  body: new URLSearchParams(body).toString(),
});

const reply = () => '[[lang:en]]\nこんにちは、世界';

const seedPosts = async (options: Parameters<typeof setupReadApi>[0] = {}) => {
  const t = setupReadApi(options);
  const me = await t.signIn('read:statuses');
  const alice = t.seed.addRemoteActor('alice');
  const english = t.seed.addRemotePost(alice, Date.UTC(2020, 0, 2), {
    content:
      '<p>Hello <a href="https://remote.example/@bob" class="u-url mention">@bob</a> <script>alert(1)</script></p>',
    visibility: 'public',
  });
  const hidden = t.seed.addRemotePost(alice, Date.UTC(2020, 0, 5), {
    content: '<p>Followers only</p>',
    visibility: 'private',
  });
  return { ...t, me, alice, english, hidden };
};

describe('POST /api/v1/statuses/:id/translate', () => {
  it('Bearer なし・Cookie なしは 401 にする', async () => {
    const t = await seedPosts({ textGenerator: createStubTextGenerator(reply).generator });

    const response = await t.request(pathOf(t.english.postId), postJson({}));

    expect(response.status).toBe(401);
  });

  it('read:statuses を満たさない scope のトークンは 403 にする', async () => {
    const t = setupReadApi({ textGenerator: createStubTextGenerator(reply).generator });
    const me = await t.signIn('read:search');

    const response = await t.request(pathOf('00000000-0000-4000-8000-000000000099'), postJson({}, me.bearer));

    expect(response.status).toBe(403);
  });

  it('訳文を Translation エンティティで返し、サニタイズ済みの HTML にする', async () => {
    const link = '<a href="https://remote.example/@bob" class="u-url mention">@bob</a>';
    const t = await seedPosts({
      textGenerator: createStubTextGenerator(() => '[[lang:en]]\nこんにちは ⟦1⟧ <script>alert(1)</script>').generator,
    });

    const response = await t.request(pathOf(t.english.postId), postJson({}, t.me.bearer));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(TranslationSchema.safeParse(body).success).toBe(true);
    expect(body).toEqual({
      content: `<p>こんにちは ${link} &lt;script&gt;alert(1)&lt;/script&gt;</p>`,
      spoiler_text: '',
      language: 'ja',
      detected_source_language: 'en',
      provider: 'Workers AI (Llama 4 Scout)',
      media_attachments: [],
      poll: null,
    });
  });

  it('原文の <a> に危険な属性があっても、ルーターでサニタイズして返す', async () => {
    const t = setupReadApi({ textGenerator: createStubTextGenerator(reply).generator });
    const me = await t.signIn('read:statuses');
    const alice = t.seed.addRemoteActor('alice');
    const post = t.seed.addRemotePost(alice, Date.UTC(2020, 0, 2), {
      content: '<p>Hi <a href="javascript:alert(1)" onclick="x()">bad</a></p>',
      visibility: 'public',
    });

    const response = await t.request(pathOf(post.postId), postJson({}, me.bearer));

    expect(response.status).toBe(200);
    const body = (await response.json()) as { content: string };
    expect(body.content).toContain('bad</a>');
    expect(body.content).not.toContain('javascript:');
    expect(body.content).not.toContain('onclick');
  });

  it('lang が ja 以外なら 403 にする', async () => {
    const { generator, calls } = createStubTextGenerator(reply);
    const t = await seedPosts({ textGenerator: generator });

    const json = await t.request(pathOf(t.english.postId), postJson({ lang: 'en' }, t.me.bearer));
    const form = await t.request(pathOf(t.english.postId), postForm({ lang: 'fr' }, t.me.bearer));

    expect(json.status).toBe(403);
    expect(await json.json()).toEqual({ error: 'This action is not allowed' });
    expect(form.status).toBe(403);
    expect(calls).toEqual([]);
  });

  it('見つからない投稿と、閲覧者に見えない投稿と、id の形が違うものは 404 にする', async () => {
    const t = await seedPosts({ textGenerator: createStubTextGenerator(reply).generator });

    const unknown = await t.request(pathOf('00000000-0000-4000-8000-000000000999'), postJson({}, t.me.bearer));
    const notVisible = await t.request(pathOf(t.hidden.postId), postJson({}, t.me.bearer));
    const malformed = await t.request(pathOf('not-a-uuid'), postJson({}, t.me.bearer));

    for (const response of [unknown, notVisible, malformed]) {
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: 'Record not found' });
    }
  });

  it('1 日 50 回を超えると 429 にし、次の日本時間 0 時までの秒数を Retry-After に付ける', async () => {
    const { generator } = createStubTextGenerator(reply);
    const t = await seedPosts({ textGenerator: generator });
    t.sqlite.prepare('INSERT INTO ai_translation_usages(userId, day, count) VALUES (?, ?, ?)').run(
      t.me.userId,
      '2026-11-04',
      50,
    );
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.UTC(2026, 10, 4, 3, 0, 0));

    const response = await t.request(pathOf(t.english.postId), postJson({}, t.me.bearer));

    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe(String(12 * 60 * 60));
    expect(await response.json()).toEqual({ error: 'The daily translation limit of 50 has been reached.' });
  });

  it('AI が失敗すると 503 にし、回数は戻さない', async () => {
    const failing: TextGenerator = {
      summarize: () => RA.err({ type: 'AiError', message: 'unavailable' }),
      generate: () => RA.err({ type: 'AiError', message: 'unavailable' }),
    };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const t = await seedPosts({ textGenerator: failing });

    const response = await t.request(pathOf(t.english.postId), postJson({}, t.me.bearer));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'Service Unavailable' });
    expect(t.sqlite.prepare('SELECT count FROM ai_translation_usages').all()).toEqual([{ count: 1 }]);
    expect(t.sqlite.prepare('SELECT count(*) AS n FROM post_translations').get()).toEqual({ n: 0 });
    warn.mockRestore();
  });
});
