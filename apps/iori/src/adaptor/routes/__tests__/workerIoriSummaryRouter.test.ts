import { RA } from '@iwasa-kosui/result';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { TextGenerator } from '../../../ports/textGenerator.ts';
import { createStubTextGenerator } from '../../../testing/aiStubs.ts';
import { setupReadApi } from './helper/mastodonReadHarness.ts';
import { ORIGIN } from './helper/oauthHarness.ts';

const PATH = '/api/iori/v1/timeline/summaries';

afterEach(() => {
  vi.useRealTimers();
});

const post = (body: unknown, headers: Record<string, string> = {}, rawBody?: string) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...headers },
  body: rawBody ?? JSON.stringify(body),
});

const replyByKind = (summary: string) => (request: object): string => 'documents' in request ? summary : '[]';

type CitationBody = { n: number; status: { id: string; content: string } };

const day = (value: number) => Date.UTC(2020, 0, value, 12);
const period = {
  since: new Date(Date.UTC(2020, 0, 1)).toISOString(),
  until: new Date(Date.UTC(2020, 0, 4)).toISOString(),
};

const seedTimeline = async (options: Parameters<typeof setupReadApi>[0] = {}) => {
  const t = setupReadApi(options);
  const me = await t.signIn('read:statuses');
  const alice = t.seed.addRemoteActor('alice');
  const bob = t.seed.addRemoteActor('bob');
  const carol = t.seed.addRemoteActor('carol');
  t.seed.addFollow(me.actorId, alice.actorId);
  t.seed.addFollow(me.actorId, carol.actorId);
  t.seed.addMute(me.userId, carol.actorId);
  const mine = t.seed.addLocalPost(me, day(1), { content: '<p>京都で旅行した</p>' });
  const fromAlice = t.seed.addRemotePost(alice, day(2), { content: '<p>京都の旅行計画</p>', visibility: 'public' });
  const privateFromAlice = t.seed.addRemotePost(alice, day(2) + 1, {
    content: '<p>京都の秘密</p>',
    visibility: 'private',
  });
  t.seed.addRemotePost(alice, day(2) + 5, {
    content: '<p>京都の宛先指定</p>',
    visibility: 'direct',
    recipientActorUris: [`${ORIGIN}/users/kosui`],
  });
  t.seed.addRemotePost(bob, day(2) + 2, { content: '<p>京都のフォロー外</p>', visibility: 'public' });
  t.seed.addRemotePost(bob, day(2) + 6, { content: '<p>京都のフォロー外の限定</p>', visibility: 'private' });
  t.seed.addRemotePost(carol, day(2) + 3, { content: '<p>京都のミュート</p>', visibility: 'public' });
  t.seed.addLocalPost(me, day(2) + 4, { content: '<p>京都の削除済み</p>', deletedAt: day(3) });
  const outside = t.seed.addRemotePost(alice, Date.UTC(2020, 0, 10), {
    content: '<p>京都の期間外</p>',
    visibility: 'public',
  });
  return { ...t, me, mine, fromAlice, privateFromAlice, outside };
};

describe('POST /api/iori/v1/timeline/summaries', () => {
  it('Bearer なし・Cookie なしは 401 にする', async () => {
    const t = await seedTimeline();

    const response = await t.request(PATH, post({ q: '京都' }));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'The access token is invalid' });
  });

  it('read:statuses を満たさない scope のトークンは 403 にする', async () => {
    const t = setupReadApi();
    const me = await t.signIn('read:search');

    const response = await t.request(PATH, post({ q: '京都' }, me.bearer));

    expect(response.status).toBe(403);
  });

  it('Cookie のセッションは同一オリジンの Origin がないと 403 にする', async () => {
    const t = await seedTimeline({ textGenerator: createStubTextGenerator(replyByKind('- 話題 [1]')).generator });
    const cookie = { Cookie: `sessionId=${t.me.sessionId}` };

    const withoutOrigin = await t.request(PATH, post({ q: '京都' }, cookie));
    const crossOrigin = await t.request(PATH, post({ q: '京都' }, { ...cookie, Origin: 'https://evil.example' }));
    const sameOrigin = await t.request(PATH, post({ q: '京都' }, { ...cookie, Origin: ORIGIN }));

    expect(withoutOrigin.status).toBe(403);
    expect(crossOrigin.status).toBe(403);
    expect(sameOrigin.status).toBe(200);
  });

  it.each([
    ['q が空', { q: '' }, 'q'],
    ['q が空白だけ', { q: '   ' }, 'q'],
    ['q が 201 文字', { q: 'あ'.repeat(201) }, 'q'],
    ['q が文字列でない', { q: 1 }, 'q'],
    ['期間の要約で since がない', { until: period.until }, 'since'],
    ['期間の要約で until がない', { since: period.since }, 'until'],
    ['since が日時でない', { since: 'yesterday', until: period.until }, 'since'],
    ['until が未来', { since: period.since, until: new Date(Date.now() + 60_000).toISOString() }, 'until'],
    ['期間が 7 日を超える', { since: '2020-01-01T00:00:00Z', until: '2020-01-08T00:00:01Z' }, 'since'],
    ['since が until 以後', { since: period.until, until: period.since }, 'since'],
  ])('%s と 422 にする', async (_name, body, field) => {
    const t = await seedTimeline();

    const response = await t.request(PATH, post(body, t.me.bearer));

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: `Validation failed: ${field}` });
  });

  it('JSON でない本文は 422 にする', async () => {
    const t = await seedTimeline();

    const response = await t.request(PATH, post(undefined, t.me.bearer, '{not json'));

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: 'Validation failed: body' });
  });

  it('actor のない利用者は 422 にする', async () => {
    const t = await seedTimeline();
    const withoutActor = await t.bearerFor('read:statuses');

    const response = await t.request(PATH, post(period, withoutActor));

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: 'Actor not found' });
  });

  it('検索の要約は本人とフォロー中の公開とフォロワー限定の投稿だけを AI に渡し、応答を返す', async () => {
    const { generator, calls } = createStubTextGenerator(replyByKind('- 京都の話 [1]\n- 旅行 [2][9]'));
    const t = await seedTimeline({ textGenerator: generator });

    const response = await t.request(PATH, post({ q: '京都' }, t.me.bearer));

    expect(response.status).toBe(200);
    const summarizeCalls = calls.filter((call) => 'documents' in call);
    expect(summarizeCalls).toHaveLength(1);
    const documents = 'documents' in summarizeCalls[0]! ? summarizeCalls[0].documents : [];
    expect(documents.map((document) => document.split('\n')[1])).toEqual(
      expect.arrayContaining(['京都で旅行した', '京都の旅行計画', '京都の秘密', '京都の期間外']),
    );
    expect(documents.join('\n')).not.toContain('京都の宛先指定');
    expect(documents.join('\n')).not.toContain('京都のフォロー外の限定');
    expect(documents.join('\n')).not.toContain('京都のフォロー外');
    expect(documents.join('\n')).not.toContain('京都のミュート');
    expect(documents.join('\n')).not.toContain('京都の削除済み');
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      summary: '- 京都の話 [1]\n- 旅行 [2][9]',
      used_status_count: 4,
      excluded_non_public_count: 1,
      truncated: false,
      model: '@cf/meta/llama-4-scout-17b-16e-instruct',
      remaining_today: 19,
    });
    expect(body.source_status_ids).toHaveLength(2);
    expect(Object.keys(body).sort()).toEqual([
      'citations',
      'excluded_non_public_count',
      'model',
      'remaining_today',
      'source_status_ids',
      'summary',
      'truncated',
      'used_status_count',
    ]);
  });

  it('期間の要約は本人とフォロー中（ミュート除く）の公開とフォロワー限定の投稿を、削除済みと期間外を除いて渡す', async () => {
    const { generator, calls } = createStubTextGenerator(replyByKind('- 話題 [1][2][3]'));
    const t = await seedTimeline({ textGenerator: generator });

    const response = await t.request(PATH, post(period, t.me.bearer));

    expect(response.status).toBe(200);
    expect(calls).toHaveLength(1);
    const documents = 'documents' in calls[0]! ? calls[0].documents : [];
    expect(documents).toEqual([
      expect.stringMatching(/^\[1\] @alice 2020-01-02 21:00（JST）\n京都の秘密$/),
      expect.stringMatching(/^\[2\] @alice 2020-01-02 21:00（JST）\n京都の旅行計画$/),
      expect.stringMatching(/^\[3\] @kosui 2020-01-01 21:00（JST）\n京都で旅行した$/),
    ]);
    const { citations, ...body } = (await response.json()) as { citations: CitationBody[] };
    expect(citations.map(({ n, status }) => [n, status.id])).toEqual([
      [1, t.privateFromAlice.postId],
      [2, t.fromAlice.postId],
      [3, t.mine.postId],
    ]);
    expect(body).toEqual({
      summary: '- 話題 [1][2][3]',
      source_status_ids: [t.privateFromAlice.postId, t.fromAlice.postId, t.mine.postId],
      used_status_count: 3,
      excluded_non_public_count: 0,
      truncated: false,
      model: '@cf/meta/llama-4-scout-17b-16e-instruct',
      remaining_today: 19,
    });
  });

  it('Server-Timing に gather と ai と total を付ける', async () => {
    const t = await seedTimeline({ textGenerator: createStubTextGenerator(replyByKind('- 話題 [1]')).generator });

    const response = await t.request(PATH, post(period, t.me.bearer));

    expect(response.headers.get('Server-Timing')).toMatch(
      /^gather;dur=\d+(\.\d+)?, ai;dur=\d+(\.\d+)?, total;dur=\d+(\.\d+)?$/,
    );
  });

  it('1日 20 回を超えると 429 にし、次の日本時間 0 時までの秒数を Retry-After に付ける', async () => {
    const { generator, calls } = createStubTextGenerator(replyByKind('- 話題 [1]'));
    const t = await seedTimeline({ textGenerator: generator });
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.UTC(2026, 10, 4, 3, 0, 0));

    for (let i = 0; i < 20; i++) {
      expect((await t.request(PATH, post(period, t.me.bearer))).status).toBe(200);
    }
    const response = await t.request(PATH, post(period, t.me.bearer));

    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe(String(12 * 60 * 60));
    expect(await response.json()).toEqual({ error: 'The daily summary limit of 20 has been reached.' });
    expect(calls).toHaveLength(20);
    expect(t.sqlite.prepare('SELECT day, count FROM ai_summary_usages').all()).toEqual([
      { day: '2026-11-04', count: 20 },
    ]);
  });

  it('AI が失敗すると 502 にし、回数は戻さない', async () => {
    const failing: TextGenerator = {
      summarize: () => RA.err({ type: 'AiError', message: 'unavailable' }),
      generate: () => RA.ok('[]'),
    };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const t = await seedTimeline({ textGenerator: failing });

    const response = await t.request(PATH, post(period, t.me.bearer));

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'The summary could not be generated' });
    expect(t.sqlite.prepare('SELECT count FROM ai_summary_usages').all()).toEqual([{ count: 1 }]);
    warn.mockRestore();
  });

  it('textGenerator がないと 502 にし、回数を消費しない', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const t = await seedTimeline();

    const response = await t.request(PATH, post(period, t.me.bearer));

    expect(response.status).toBe(502);
    expect(t.sqlite.prepare('SELECT count(*) AS n FROM ai_summary_usages').get()).toEqual({ n: 0 });
    warn.mockRestore();
  });
});
