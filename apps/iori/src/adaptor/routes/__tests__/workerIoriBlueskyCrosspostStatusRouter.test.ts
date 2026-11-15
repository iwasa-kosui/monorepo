import { Hono } from 'hono';
import { afterEach, describe, expect, it } from 'vitest';

import { createMastodonSeed } from '../../d1/__tests__/mastodonSeed.ts';
import { createSqliteD1Fixture } from '../../d1/__tests__/sqliteFixture.ts';
import { createD1BlueskyCrosspostStatusReportResolver } from '../../d1/blueskyCrosspost/blueskyCrosspostStatusReportResolver.ts';
import { createMastodonAuthn } from '../mastodonAuthn.ts';
import { createWorkerIoriBlueskyCrosspostStatusRouter } from '../workerIoriBlueskyCrosspostStatusRouter.ts';
import { createOAuthHarness, ORIGIN } from './helper/oauthHarness.ts';

const PATH = '/api/iori/v1/bluesky/crossposts/status';

const fixtures: ReturnType<typeof createSqliteD1Fixture>[] = [];
afterEach(() => {
  for (const fixture of fixtures.splice(0)) fixture.sqlite.close();
});

const setup = (options: { enabled?: boolean } = {}) => {
  const harness = createOAuthHarness();
  const fixture = createSqliteD1Fixture();
  fixtures.push(fixture);
  const seed = createMastodonSeed(fixture);
  const authn = createMastodonAuthn({
    verifyAccessTokenUseCase: harness.memory.useCases.verifyAccessTokenUseCase,
    sessionResolver: harness.memory.sessionResolver as never,
  });
  const app = new Hono().route(
    '/api',
    createWorkerIoriBlueskyCrosspostStatusRouter({
      authn,
      blueskyCrosspostStatusReportResolver: createD1BlueskyCrosspostStatusReportResolver(fixture.db),
      blueskyCrosspostEnabled: options.enabled ?? true,
    }),
  );
  const request = (headers: Record<string, string> = {}) => app.request(`${ORIGIN}${PATH}`, { headers });
  const signInAs = async (username: string, scope = 'read:statuses') => {
    const issued = await harness.issueUserToken(scope);
    seed.addLocalActor(username, issued.userId);
    return { userId: issued.userId, headers: { Authorization: `Bearer ${issued.token}` } };
  };
  const insert = fixture.sqlite.prepare(
    'INSERT INTO bluesky_crossposts(postId,userId,status,skipReason,uri,cid,rkey,rootUri,rootCid,attempts,lastError,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
  );
  const addCrosspost = (
    userId: string,
    postId: string,
    status: string,
    options: { attempts?: number; lastError?: string | null; updatedAt?: number; sent?: boolean } = {},
  ) =>
    insert.run(
      postId,
      userId,
      status,
      status === 'skipped' ? 'sensitive' : null,
      options.sent === true ? 'at://did:plc:secret/app.bsky.feed.post/3krkeysecret' : null,
      options.sent === true ? 'bafycidsecret' : null,
      options.sent === true ? '3krkeysecret' : null,
      null,
      null,
      options.attempts ?? 0,
      options.lastError ?? null,
      1_000,
      options.updatedAt ?? 1_000,
    );
  return { request, signInAs, addCrosspost, sqlite: fixture.sqlite };
};

const postId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

describe('GET /api/iori/v1/bluesky/crossposts/status', () => {
  it('Bearer なし・Cookie なしは 401 にする', async () => {
    const t = setup();

    const response = await t.request();

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'The access token is invalid' });
  });

  it('ログイン中のユーザーが投稿したクロスポストだけを集計し、ほかのユーザーの失敗を返さない', async () => {
    const t = setup();
    const kosui = await t.signInAs('kosui');
    const alice = await t.signInAs('alice');
    t.addCrosspost(kosui.userId, postId(1), 'sent');
    t.addCrosspost(alice.userId, postId(2), 'failed', { attempts: 1, lastError: 'alice failed' });
    t.addCrosspost(alice.userId, postId(3), 'pending');

    const mine = await (await t.request(kosui.headers)).json() as Record<string, unknown>;
    const hers = await (await t.request(alice.headers)).json() as Record<string, unknown>;

    expect(mine).toMatchObject({
      counts: { pending: 0, sent: 1, failed: 0, skipped: 0, deleting: 0 },
      recentFailures: [],
    });
    expect(hers).toMatchObject({
      counts: { pending: 1, sent: 0, failed: 1, skipped: 0, deleting: 0 },
      recentFailures: [{ postId: postId(2), lastError: 'alice failed' }],
    });
  });

  it('read:statuses を満たさない scope のトークンは 403 にする', async () => {
    const t = setup();
    const { headers } = await t.signInAs('kosui', 'read:search');

    expect((await t.request(headers)).status).toBe(403);
  });

  it('行が無ければ 200 で件数がすべて 0 になる', async () => {
    const t = setup();
    const { headers } = await t.signInAs('kosui');

    const response = await t.request(headers);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      enabled: true,
      counts: { pending: 0, sent: 0, failed: 0, skipped: 0, deleting: 0 },
      exhausted: { pending: 0, failed: 0, deleting: 0 },
      recentFailures: [],
    });
  });

  it('無効のときも 200 で、そのときの DB の状態を返す', async () => {
    const t = setup({ enabled: false });
    const { userId, headers } = await t.signInAs('kosui');
    t.addCrosspost(userId, postId(1), 'failed', { attempts: 1, lastError: 'login failed' });

    const response = await t.request(headers);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ enabled: false, counts: { failed: 1 } });
  });

  it('直近の失敗の updatedAt を ISO 文字列にして返す', async () => {
    const t = setup();
    const { userId, headers } = await t.signInAs('kosui');
    t.addCrosspost(userId, postId(1), 'failed', {
      attempts: 1,
      lastError: 'error 1',
      updatedAt: Date.UTC(2026, 10, 8, 0, 12),
    });

    const body = await (await t.request(headers)).json() as { recentFailures: Array<Record<string, unknown>> };

    expect(body.recentFailures).toEqual([{
      postId: postId(1),
      status: 'failed',
      attempts: 1,
      lastError: 'error 1',
      updatedAt: '2026-11-08T00:12:00.000Z',
    }]);
  });

  it('秘密、uri、cid、rkey、skipReason を応答に含めない', async () => {
    const t = setup();
    const { userId, headers } = await t.signInAs('kosui');
    t.sqlite.prepare(
      'INSERT INTO bluesky_sessions(userId,did,handle,pdsUrl,accessJwt,refreshJwt,updatedAt) VALUES (?,?,?,?,?,?,?)',
    ).run(
      userId,
      'did:plc:secret',
      'iori.example.com',
      'https://pds.example',
      'ACCESS-JWT-SECRET',
      'REFRESH-JWT-SECRET',
      1,
    );
    t.addCrosspost(userId, postId(1), 'deleting', {
      attempts: 2,
      lastError: 'deleteRecord failed: status 502',
      sent: true,
    });
    t.addCrosspost(userId, postId(2), 'skipped');

    const response = await t.request(headers);
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(text).toContain('deleteRecord failed: status 502');
    for (
      const secret of [
        'ACCESS-JWT-SECRET',
        'REFRESH-JWT-SECRET',
        '3krkeysecret',
        'bafycidsecret',
        'did:plc:secret',
        'sensitive',
      ]
    ) {
      expect(text).not.toContain(secret);
    }
    for (const key of ['accessJwt', 'refreshJwt', 'appPassword', 'uri', 'cid', 'rkey', 'skipReason']) {
      expect(text).not.toContain(`"${key}"`);
    }
  });
});
