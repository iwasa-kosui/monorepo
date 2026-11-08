import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import { createIoriApp } from '../../../appFactory.tsx';
import { ArticleId } from '../../../domain/article/articleId.ts';
import { DigestItemId } from '../../../domain/digest/digestItemId.ts';
import { DigestDeepDiveId } from '../../../domain/digestDeepDive/digestDeepDiveId.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import type { UserId } from '../../../domain/user/userId.ts';
import type { DeepDiveDigestItemUseCase } from '../../../useCase/deepDiveDigestItem.ts';
import { createMastodonAuthn } from '../mastodonAuthn.ts';
import { createWorkerIoriDigestRouter } from '../workerIoriDigestRouter.ts';
import { createOAuthHarness } from './helper/oauthHarness.ts';

const origin = 'https://worker.test';
const sameOrigin = { Origin: origin };
const otherOrigin = { Origin: 'https://evil.example' };
const json = { 'Content-Type': 'application/json' };
const unused = { resolve: async () => RA.ok(undefined), run: async () => RA.err({}) } as never;
const digestItemId = DigestItemId.generate();
const articleId = ArticleId.generate();
const baseUpdatedAt = 1_000;
const okValue = {
  markdown: '## 新しい本文',
  updatedAt: Instant.orThrow(2_000),
  turnNumber: 2,
  turnsLeft: 8,
  dailyRemaining: 1,
};

const setup = (run: DeepDiveDigestItemUseCase['run'] = async () => RA.ok(okValue)) => {
  const harness = createOAuthHarness();
  const authn = createMastodonAuthn({
    verifyAccessTokenUseCase: harness.memory.useCases.verifyAccessTokenUseCase,
    sessionResolver: harness.memory.sessionResolver as never,
  });
  const deepDive = vi.fn(run);
  const app = createIoriApp({
    federationMiddleware: undefined,
    registerRoutes: (router) => {
      router.route(
        '/api',
        createWorkerIoriDigestRouter({
          authn,
          digestResolverByUserIdAndDigestDate: unused,
          digestResolverByUserId: unused,
          digestTopicEntriesResolverByUserIdAndDigestDate: unused,
          timelineLinkTrendsResolverByUserId: unused,
          hatenaTrendsResolverByFetchedSince: unused,
          digestSubscriptionResolverByUserId: unused,
          saveDigestSubscriptionUseCase: unused,
          requestDigestUseCase: unused,
          giveDigestItemFeedbackUseCase: unused,
          digestTopicsResolverByUserId: unused,
          addDigestTopicUseCase: unused,
          editDigestTopicUseCase: unused,
          changeDigestTopicEnabledUseCase: unused,
          deepDiveDigestItemUseCase: { run: deepDive },
          allFeedSourcesResolver: unused,
          addFeedSourceUseCase: unused,
          changeFeedSourceEnabledUseCase: unused,
          isDigestOwner: async () => false,
        }),
      );
    },
    serveAsset: async () => undefined,
    serveUpload: async () => undefined,
    serveOgImage: async () => new Response('not implemented', { status: 501 }),
  });
  const cookieFor = (userId: string) => `sessionId=${harness.memory.addSession(userId as UserId).sessionId}`;
  const bearerFor = async (scope: string) => {
    const issued = await harness.issueUserToken(scope);
    return { userId: issued.userId, headers: { Authorization: `Bearer ${issued.token}` } };
  };
  const post = (id: string, headers: Record<string, string>, body: unknown) =>
    app.request(`${origin}/api/iori/v1/digest-items/${id}/deep-dive`, {
      method: 'POST',
      headers: { ...json, ...headers },
      body: JSON.stringify(body),
    });
  return { deepDive, cookieFor, bearerFor, post };
};

const validBody = { instruction: '背景を詳しく', baseUpdatedAt };

describe('POST /api/iori/v1/digest-items/:digestItemId/deep-dive', () => {
  it('Cookie と同じ Origin で 200 を返し、use case の結果をそのまま返す', async () => {
    const t = setup();
    const me = await t.bearerFor('write:statuses');

    const response = await t.post(digestItemId, { Cookie: t.cookieFor(me.userId), ...sameOrigin }, validBody);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(okValue);
    expect(t.deepDive).toHaveBeenCalledWith({
      userId: me.userId,
      digestItemId,
      instruction: '背景を詳しく',
      baseUpdatedAt: baseUpdatedAt,
    });
  });

  it('instruction を省くと空の依頼として渡す', async () => {
    const t = setup();
    const me = await t.bearerFor('write:statuses');

    const response = await t.post(digestItemId, me.headers, { baseUpdatedAt });

    expect(response.status).toBe(200);
    expect(t.deepDive.mock.calls[0]![0].instruction).toBe('');
  });

  it('Bearer の write:statuses は Origin なしで 200 を返す', async () => {
    const t = setup();
    const me = await t.bearerFor('write:statuses');

    expect((await t.post(digestItemId, me.headers, validBody)).status).toBe(200);
  });

  it('write:statuses を満たさない scope の Bearer は 403 にして use case を呼ばない', async () => {
    const t = setup();
    const me = await t.bearerFor('read:statuses');

    const response = await t.post(digestItemId, me.headers, validBody);

    expect(response.status).toBe(403);
    expect(t.deepDive).not.toHaveBeenCalled();
  });

  it.each([
    ['Origin がない', {}],
    ['別の Origin', otherOrigin],
  ])('Cookie で %s ときは 403 にして use case を呼ばない', async (_name, headers) => {
    const t = setup();
    const me = await t.bearerFor('write:statuses');

    const response = await t.post(digestItemId, { Cookie: t.cookieFor(me.userId), ...headers }, validBody);

    expect(response.status).toBe(403);
    expect(t.deepDive).not.toHaveBeenCalled();
  });

  it('認証がなければ 401 を返す', async () => {
    const t = setup();

    expect((await t.post(digestItemId, sameOrigin, validBody)).status).toBe(401);
    expect(t.deepDive).not.toHaveBeenCalled();
  });

  it('項目 ID が UUID でなければ 404 にする', async () => {
    const t = setup();
    const me = await t.bearerFor('write:statuses');

    const response = await t.post('not-a-uuid', me.headers, validBody);

    expect(response.status).toBe(404);
    expect(t.deepDive).not.toHaveBeenCalled();
  });

  it.each([
    ['baseUpdatedAt がない', { instruction: 'a' }],
    ['baseUpdatedAt が整数でない', { instruction: 'a', baseUpdatedAt: 'x' }],
    ['baseUpdatedAt が負', { instruction: 'a', baseUpdatedAt: -1 }],
    ['instruction が文字列でない', { instruction: 1, baseUpdatedAt }],
    ['instruction が 201 文字', { instruction: 'あ'.repeat(201), baseUpdatedAt }],
  ])('%s ときは 400 にして use case を呼ばない', async (_name, body) => {
    const t = setup();
    const me = await t.bearerFor('write:statuses');

    const response = await t.post(digestItemId, me.headers, body);

    expect(response.status).toBe(400);
    expect(t.deepDive).not.toHaveBeenCalled();
  });

  it('instruction が 200 文字なら受け付ける', async () => {
    const t = setup();
    const me = await t.bearerFor('write:statuses');

    const response = await t.post(digestItemId, me.headers, { instruction: 'あ'.repeat(200), baseUpdatedAt });

    expect(response.status).toBe(200);
  });

  describe('use case のエラーとステータスの対応', () => {
    const cases: ReadonlyArray<
      readonly [string, unknown, number, Record<string, string>?, Record<string, unknown>?]
    > = [
      [
        'DigestItemNotFoundError',
        { type: 'DigestItemNotFoundError', message: 'x', detail: { digestItemId } },
        404,
        undefined,
        { error: 'Digest item not found' },
      ],
      [
        'ArticleNotFoundError',
        { type: 'ArticleNotFoundError', message: 'x', detail: { articleId } },
        404,
        undefined,
        { error: 'Digest item not found' },
      ],
      [
        'ArticleInvalidStatusError（公開済み）',
        {
          type: 'ArticleInvalidStatusError',
          message: 'x',
          detail: { articleId, currentStatus: 'published', expectedStatus: ['draft'] },
        },
        409,
        undefined,
        { error: 'Digest already published' },
      ],
      [
        'ArticleNotEditableError',
        { type: 'ArticleNotEditableError', message: 'not editable', detail: { articleId } },
        409,
        undefined,
        { error: 'not editable' },
      ],
      [
        'DigestDeepDiveConflictError（版の衝突）',
        {
          type: 'DigestDeepDiveConflictError',
          message: '本文が更新されています。読み込み直してください',
          detail: { articleId },
        },
        409,
        undefined,
        { error: '本文が更新されています。読み込み直してください' },
      ],
      [
        'DigestDeepDiveTurnLimitError（往復の上限）',
        { type: 'DigestDeepDiveTurnLimitError', message: 'x', detail: { deepDiveId: DigestDeepDiveId.generate() } },
        409,
        undefined,
        { error: 'A deep dive accepts at most 10 turns' },
      ],
      [
        'DigestDeepDiveLimitError（1 日の上限）',
        {
          type: 'DigestDeepDiveLimitError',
          message: 'The daily deep dive limit has been reached.',
          retryAfterSeconds: 3_600,
        },
        429,
        { 'Retry-After': '3600' },
        { error: 'The daily deep dive limit has been reached.' },
      ],
      [
        'DigestItemNotInBodyError（本文に項目が無い）',
        { type: 'DigestItemNotInBodyError', message: 'この項目が本文に見つかりません', detail: { digestItemId } },
        422,
        undefined,
        { error: 'この項目が本文に見つかりません' },
      ],
      [
        'DigestDeepDiveTimeoutError（締め切り）',
        { type: 'DigestDeepDiveTimeoutError', message: '時間がかかっています。もう一度依頼してください' },
        504,
        undefined,
        { error: '時間がかかっています。もう一度依頼してください' },
      ],
      [
        'DigestDeepDiveGenerationFailedError（AI の失敗）',
        { type: 'DigestDeepDiveGenerationFailedError', message: 'Generating the deep dive failed: x' },
        502,
        undefined,
        { error: 'Generating the deep dive failed: x' },
      ],
      ['type を持たない ParseError', { kind: 'ParseError', message: 'x' }, 500, undefined, undefined],
    ];

    it.each(cases)('%s は %i を返す', async (_name, err, status, headers, body) => {
      const t = setup(async () => RA.err(err as never));
      const me = await t.bearerFor('write:statuses');

      const response = await t.post(digestItemId, me.headers, validBody);

      expect(response.status).toBe(status);
      for (const [name, value] of Object.entries(headers ?? {})) expect(response.headers.get(name)).toBe(value);
      if (body !== undefined) await expect(response.json()).resolves.toEqual(body);
    });
  });
});
