import { Hono } from 'hono';
import { afterEach, describe, expect, it } from 'vitest';

import { createMastodonSeed } from '../../d1/__tests__/mastodonSeed.ts';
import { createSqliteD1Fixture } from '../../d1/__tests__/sqliteFixture.ts';
import { createD1BlueskyCrosspostStatusReportResolver } from '../../d1/blueskyCrosspost/blueskyCrosspostStatusReportResolver.ts';
import { createD1UserResolverByUsername } from '../../d1/user/userResolverByUsername.ts';
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
      userResolverByUsername: createD1UserResolverByUsername(fixture.db),
      blueskyCrosspostStatusReportResolver: createD1BlueskyCrosspostStatusReportResolver(fixture.db),
      blueskyCrosspostEnabled: options.enabled ?? true,
    }),
  );
  const request = (headers: Record<string, string> = {}) => app.request(`${ORIGIN}${PATH}`, { headers });
  const signInAs = async (username: string, scope = 'read:statuses') => {
    const issued = await harness.issueUserToken(scope);
    seed.addLocalActor(username, issued.userId);
    return { Authorization: `Bearer ${issued.token}` };
  };
  const insert = fixture.sqlite.prepare(
    'INSERT INTO bluesky_crossposts(postId,status,skipReason,uri,cid,rkey,rootUri,rootCid,attempts,lastError,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
  );
  const addCrosspost = (
    postId: string,
    status: string,
    options: { attempts?: number; lastError?: string | null; updatedAt?: number; sent?: boolean } = {},
  ) =>
    insert.run(
      postId,
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

  it('所有者以外のログインユーザーは 403 にし、集計を返さない', async () => {
    const t = setup();
    t.addCrosspost(postId(1), 'failed', { attempts: 1, lastError: 'createRecord failed: status 500' });
    const headers = await t.signInAs('alice');

    const response = await t.request(headers);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Forbidden' });
  });

  it('read:statuses を満たさない scope のトークンは所有者でも 403 にする', async () => {
    const t = setup();
    const headers = await t.signInAs('kosui', 'read:search');

    expect((await t.request(headers)).status).toBe(403);
  });

  it('所有者は 200 で、行が無ければ件数がすべて 0 になる', async () => {
    const t = setup();
    const headers = await t.signInAs('kosui');

    const response = await t.request(headers);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      enabled: true,
      counts: { pending: 0, sent: 0, failed: 0, skipped: 0, deleting: 0 },
      exhausted: { failed: 0, deleting: 0 },
      recentFailures: [],
    });
  });

  it('無効のときも 200 で、そのときの DB の状態を返す', async () => {
    const t = setup({ enabled: false });
    t.addCrosspost(postId(1), 'failed', { attempts: 1, lastError: 'login failed' });
    const headers = await t.signInAs('kosui');

    const response = await t.request(headers);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ enabled: false, counts: { failed: 1 } });
  });

  it('件数と、上限に達した failed と deleting の件数を返す', async () => {
    const t = setup();
    t.addCrosspost(postId(1), 'pending');
    t.addCrosspost(postId(2), 'sent', { sent: true });
    t.addCrosspost(postId(3), 'sent', { sent: true });
    t.addCrosspost(postId(4), 'skipped');
    t.addCrosspost(postId(5), 'failed', { attempts: 2, lastError: 'e' });
    t.addCrosspost(postId(6), 'failed', { attempts: 3, lastError: 'e' });
    t.addCrosspost(postId(7), 'deleting', { attempts: 4, lastError: 'e', sent: true });
    t.addCrosspost(postId(8), 'deleting', { attempts: 5, lastError: 'e', sent: true });
    t.addCrosspost(postId(9), 'deleting', { attempts: 6, lastError: 'e', sent: true });
    const headers = await t.signInAs('kosui');

    const body = await (await t.request(headers)).json() as Record<string, unknown>;

    expect(body.counts).toEqual({ pending: 1, sent: 2, failed: 2, skipped: 1, deleting: 3 });
    expect(body.exhausted).toEqual({ failed: 1, deleting: 2 });
  });

  it('直近の失敗を updatedAt の降順で最大 10 件返し、ISO 文字列にする', async () => {
    const t = setup();
    for (let n = 1; n <= 12; n += 1) {
      t.addCrosspost(postId(n), 'failed', {
        attempts: 1,
        lastError: `error ${n}`,
        updatedAt: Date.UTC(2026, 10, 8, 0, n),
      });
    }
    t.addCrosspost(postId(13), 'sent', { sent: true, updatedAt: Date.UTC(2026, 10, 8, 1) });
    t.addCrosspost(postId(14), 'pending', { updatedAt: Date.UTC(2026, 10, 8, 1) });
    const headers = await t.signInAs('kosui');

    const body = await (await t.request(headers)).json() as {
      recentFailures: Array<Record<string, unknown>>;
    };

    expect(body.recentFailures).toHaveLength(10);
    expect(body.recentFailures.map((failure) => failure.postId)).toEqual(
      Array.from({ length: 10 }, (_, i) => postId(12 - i)),
    );
    expect(body.recentFailures[0]).toEqual({
      postId: postId(12),
      status: 'failed',
      attempts: 1,
      lastError: 'error 12',
      updatedAt: '2026-11-08T00:12:00.000Z',
    });
  });

  it('秘密、uri、cid、rkey、skipReason を応答に含めない', async () => {
    const t = setup();
    t.sqlite.prepare(
      'INSERT INTO bluesky_sessions(id,did,handle,pdsUrl,accessJwt,refreshJwt,updatedAt) VALUES (?,?,?,?,?,?,?)',
    ).run(
      'default',
      'did:plc:secret',
      'iori.example.com',
      'https://pds.example',
      'ACCESS-JWT-SECRET',
      'REFRESH-JWT-SECRET',
      1,
    );
    t.addCrosspost(postId(1), 'deleting', { attempts: 2, lastError: 'deleteRecord failed: status 502', sent: true });
    t.addCrosspost(postId(2), 'skipped');
    const headers = await t.signInAs('kosui');

    const response = await t.request(headers);
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(text).toContain('deleteRecord failed: status 502');
    for (
      const secret of [
        'ACCESS-JWT-SECRET',
        'REFRESH-JWT-SECRET',
        'app-pass',
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
