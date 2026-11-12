import { RA } from '@iwasa-kosui/result';
import { Hono } from 'hono';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Instant } from '../../../domain/instant/instant.ts';
import type { BlueskyClient, BlueskyClientError } from '../../../ports/blueskyClient.ts';
import type { BlueskyModerationReader } from '../../../ports/blueskyModerationReader.ts';
import type { BlueskyModerationUseCases } from '../../../runtime/blueskyModeration.ts';
import { BlockBlueskyActorUseCase } from '../../../useCase/blockBlueskyActor.ts';
import { GetBlueskyModerationStateUseCase } from '../../../useCase/getBlueskyModerationState.ts';
import { IsDigestOwner } from '../../../useCase/isDigestOwner.ts';
import { MuteBlueskyActorUseCase } from '../../../useCase/muteBlueskyActor.ts';
import { ReportBlueskyActorUseCase } from '../../../useCase/reportBlueskyActor.ts';
import { UnblockBlueskyActorUseCase } from '../../../useCase/unblockBlueskyActor.ts';
import { UnmuteBlueskyActorUseCase } from '../../../useCase/unmuteBlueskyActor.ts';
import { createMastodonSeed } from '../../d1/__tests__/mastodonSeed.ts';
import { createSqliteD1Fixture } from '../../d1/__tests__/sqliteFixture.ts';
import {
  createD1BlueskyBlockDeletedStore,
  createD1BlueskyBlockSavedStore,
  createD1BlueskyMuteDeletedStore,
  createD1BlueskyMuteSavedStore,
} from '../../d1/blueskyModeration/blueskyModeratedActorsStore.ts';
import { createD1UserResolverByUsername } from '../../d1/user/userResolverByUsername.ts';
import { createMastodonAuthn } from '../mastodonAuthn.ts';
import { createWorkerIoriBlueskyModerationRouter } from '../workerIoriBlueskyModerationRouter.ts';
import { createOAuthHarness, ORIGIN } from './helper/oauthHarness.ts';

const DID = 'did:plc:target';
const OLD_BLOCK = 'at://did:plc:me/app.bsky.graph.block/3kold';
const NEW_BLOCK = 'at://did:plc:me/app.bsky.graph.block/3knew';
const MUTES = '/api/iori/v1/bluesky/mutes';
const BLOCKS = '/api/iori/v1/bluesky/blocks';
const REPORTS = '/api/iori/v1/bluesky/reports';
const MODERATION = `/api/iori/v1/bluesky/moderation/${encodeURIComponent(DID)}`;

const failure = (kind: BlueskyClientError['kind']): BlueskyClientError => ({
  type: 'BlueskyClientError',
  kind,
  message: 'request failed',
});

const fixtures: ReturnType<typeof createSqliteD1Fixture>[] = [];
afterEach(() => {
  for (const fixture of fixtures.splice(0)) fixture.sqlite.close();
});

const setup = async (
  options: Readonly<{ scope?: string; owner?: boolean; enabled?: boolean; blockUri?: string | null }> = {},
) => {
  const harness = createOAuthHarness();
  const fixture = createSqliteD1Fixture();
  fixtures.push(fixture);
  const client = {
    muteActor: vi.fn<BlueskyClient['muteActor']>(async () => RA.ok(undefined)),
    unmuteActor: vi.fn<BlueskyClient['unmuteActor']>(async () => RA.ok(undefined)),
    createBlock: vi.fn<BlueskyClient['createBlock']>(async () => RA.ok({ uri: NEW_BLOCK })),
    deleteBlock: vi.fn<BlueskyClient['deleteBlock']>(async () => RA.ok(undefined)),
    createReport: vi.fn<BlueskyClient['createReport']>(async () => RA.ok(undefined)),
  };
  const reader = {
    resolveViewerState: vi.fn<BlueskyModerationReader['resolveViewerState']>(async () =>
      RA.ok({ muted: true, blockUri: options.blockUri === undefined ? OLD_BLOCK : options.blockUri })
    ),
    hasBlockRecord: vi.fn<BlueskyModerationReader['hasBlockRecord']>(async () => RA.ok(true)),
  };
  const { db, sqlite } = fixture;
  const now = Instant.now;
  const useCases: BlueskyModerationUseCases = {
    getState: GetBlueskyModerationStateUseCase.create({ reader }),
    mute: MuteBlueskyActorUseCase.create({ client, savedStore: createD1BlueskyMuteSavedStore(db), now }),
    unmute: UnmuteBlueskyActorUseCase.create({ client, deletedStore: createD1BlueskyMuteDeletedStore(db), now }),
    block: BlockBlueskyActorUseCase.create({ client, reader, savedStore: createD1BlueskyBlockSavedStore(db), now }),
    unblock: UnblockBlueskyActorUseCase.create({
      client,
      reader,
      deletedStore: createD1BlueskyBlockDeletedStore(db),
      now,
    }),
    report: ReportBlueskyActorUseCase.create({ client }),
  };
  const app = new Hono().route(
    '/api',
    createWorkerIoriBlueskyModerationRouter({
      authn: createMastodonAuthn({
        verifyAccessTokenUseCase: harness.memory.useCases.verifyAccessTokenUseCase,
        sessionResolver: harness.memory.sessionResolver as never,
      }),
      blueskyModeration: options.enabled === false ? undefined : useCases,
      isDigestOwner: IsDigestOwner.create({ userResolverByUsername: createD1UserResolverByUsername(db) }),
    }),
  );
  const issued = await harness.issueUserToken(options.scope ?? 'read:statuses write:mutes write:blocks write:reports');
  const seed = createMastodonSeed(fixture);
  if (options.owner === false) {
    seed.addLocalActor('kosui');
    seed.addLocalActor('alice', issued.userId);
  } else {
    seed.addLocalActor('kosui', issued.userId);
  }
  const bearer = { Authorization: `Bearer ${issued.token}` };
  const send = (method: string, path: string, body?: unknown, headers: Record<string, string> = bearer) =>
    app.request(`${ORIGIN}${path}`, {
      method,
      headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const rows = () => sqlite.prepare('SELECT did, muted, blockUri FROM bluesky_moderated_actors').all();
  return {
    send,
    client,
    reader,
    rows,
    bearer,
    cookie: { Cookie: `sessionId=${issued.sessionId}`, Origin: ORIGIN },
    evilCookie: { Cookie: `sessionId=${issued.sessionId}`, Origin: 'https://evil.example' },
  };
};

const writes = [
  ['POST', MUTES, { did: DID }],
  ['DELETE', `${MUTES}?did=${DID}`, undefined],
  ['POST', BLOCKS, { did: DID }],
  ['DELETE', `${BLOCKS}?did=${DID}`, undefined],
  ['POST', REPORTS, { did: DID, category: 'spam', comment: '' }],
] as const;

const noCalls = (t: Awaited<ReturnType<typeof setup>>) => {
  for (const mock of Object.values(t.client)) expect(mock).not.toHaveBeenCalled();
  expect(t.rows()).toEqual([]);
};

describe('/api/iori/v1/bluesky の共通のガード', () => {
  it.each(writes)('%s %s は認証なしだと 401 にし、Bluesky を呼ばない', async (method, path, body) => {
    const t = await setup();

    expect((await t.send(method, path, body, { Origin: ORIGIN })).status).toBe(401);
    noCalls(t);
  });

  it.each(writes)('%s %s は Origin が違う Cookie だと 403 にし、Bluesky を呼ばない', async (method, path, body) => {
    const t = await setup();

    expect((await t.send(method, path, body, t.evilCookie)).status).toBe(403);
    noCalls(t);
  });

  it.each(writes)(
    '%s %s は所有者でない利用者を 403 にし、Bluesky を呼ばず D1 にも書かない',
    async (method, path, body) => {
      const t = await setup({ owner: false });

      const response = await t.send(method, path, body);

      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: 'Forbidden' });
      noCalls(t);
    },
  );

  it.each(writes)('%s %s は無効のとき 409 にする', async (method, path, body) => {
    const t = await setup({ enabled: false });

    const response = await t.send(method, path, body);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'Bluesky timeline is disabled' });
    noCalls(t);
  });

  it.each(writes)('%s %s は did が did: で始まらない、または無いとき 400 にする', async (method, path) => {
    const t = await setup();
    const base = path.split('?')[0]!;
    const requests = method === 'POST'
      ? [{ did: 'alice.bsky.social' }, { did: '' }, {}, { did: 1 }]
      : [undefined];

    for (const body of requests) {
      const target = method === 'POST' ? base : `${base}?did=alice.bsky.social`;
      const payload = body === undefined ? undefined : { category: 'spam', ...body };
      expect((await t.send(method, target, payload)).status).toBe(400);
    }
    expect((await t.send(method, base)).status).toBe(400);
    noCalls(t);
  });

  it('write のスコープを満たさないトークンを、スコープごとに 403 にする', async () => {
    const mutesOnly = await setup({ scope: 'write:mutes' });
    const readOnly = await setup({ scope: 'read:statuses' });

    expect((await mutesOnly.send('POST', MUTES, { did: DID })).status).toBe(200);
    expect((await mutesOnly.send('POST', BLOCKS, { did: DID })).status).toBe(403);
    expect((await mutesOnly.send('POST', REPORTS, { did: DID, category: 'spam' })).status).toBe(403);
    expect((await readOnly.send('POST', MUTES, { did: DID })).status).toBe(403);
    expect(readOnly.client.muteActor).not.toHaveBeenCalled();
    expect(mutesOnly.client.createBlock).not.toHaveBeenCalled();
    expect(mutesOnly.client.createReport).not.toHaveBeenCalled();
  });

  it('write のスコープがあれば write:mutes、write:blocks、write:reports を満たす', async () => {
    const t = await setup({ scope: 'write' });

    expect((await t.send('POST', MUTES, { did: DID })).status).toBe(200);
    expect((await t.send('POST', BLOCKS, { did: DID })).status).toBe(200);
    expect((await t.send('POST', REPORTS, { did: DID, category: 'spam' })).status).toBe(201);
  });
});

describe('GET /api/iori/v1/bluesky/moderation/:did', () => {
  it('認証なしだと 401、read:statuses を満たさないと 403 にする', async () => {
    const anonymous = await setup();
    const writeOnly = await setup({ scope: 'write:mutes' });

    expect((await anonymous.send('GET', MODERATION, undefined, {})).status).toBe(401);
    expect((await writeOnly.send('GET', MODERATION)).status).toBe(403);
  });

  it('所有者でないと 403、無効だと 409、did が不正だと 400 にする', async () => {
    const nonOwner = await setup({ owner: false });
    const disabled = await setup({ enabled: false });
    const t = await setup();

    expect((await nonOwner.send('GET', MODERATION)).status).toBe(403);
    expect((await disabled.send('GET', MODERATION)).status).toBe(409);
    expect((await t.send('GET', '/api/iori/v1/bluesky/moderation/alice.bsky.social')).status).toBe(400);
    expect(t.reader.resolveViewerState).not.toHaveBeenCalled();
  });

  it('muted と blockUri を返す', async () => {
    const t = await setup();

    const response = await t.send('GET', MODERATION);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ muted: true, blockUri: OLD_BLOCK });
    expect(t.reader.resolveViewerState).toHaveBeenCalledExactlyOnceWith(DID);
  });

  it('ブロックしていなければ blockUri を null にする', async () => {
    const t = await setup({ blockUri: null });

    expect(await (await t.send('GET', MODERATION)).json()).toEqual({ muted: true, blockUri: null });
  });

  it('Bluesky の失敗を 502 にする', async () => {
    const t = await setup();
    t.reader.resolveViewerState.mockReturnValueOnce(RA.err(failure('auth')));

    const response = await t.send('GET', MODERATION);

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'Bluesky login failed' });
  });
});

describe('/api/iori/v1/bluesky/mutes', () => {
  it('POST はミュートして D1 に保存し、muted: true を返す', async () => {
    const t = await setup();

    const response = await t.send('POST', MUTES, { did: DID }, t.cookie);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ muted: true });
    expect(t.client.muteActor).toHaveBeenCalledExactlyOnceWith(DID);
    expect(t.rows()).toEqual([{ did: DID, muted: 1, blockUri: null }]);
  });

  it('DELETE はミュートを解除して D1 の行を消し、muted: false を返す', async () => {
    const t = await setup();
    await t.send('POST', MUTES, { did: DID });

    const response = await t.send('DELETE', `${MUTES}?did=${encodeURIComponent(DID)}`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ muted: false });
    expect(t.client.unmuteActor).toHaveBeenCalledExactlyOnceWith(DID);
    expect(t.rows()).toEqual([]);
  });

  it('auth の失敗は 502 の Bluesky login failed、それ以外は 502 の Bluesky request failed にし、D1 に保存しない', async () => {
    const t = await setup();
    t.client.muteActor.mockReturnValueOnce(RA.err(failure('auth')));
    t.client.muteActor.mockReturnValueOnce(RA.err(failure('http')));
    t.client.muteActor.mockReturnValueOnce(RA.err(failure('network')));

    const auth = await t.send('POST', MUTES, { did: DID });
    const http = await t.send('POST', MUTES, { did: DID });
    const network = await t.send('POST', MUTES, { did: DID });

    expect([auth.status, http.status, network.status]).toEqual([502, 502, 502]);
    expect(await auth.json()).toEqual({ error: 'Bluesky login failed' });
    expect(await http.json()).toEqual({ error: 'Bluesky request failed' });
    expect(await network.json()).toEqual({ error: 'Bluesky request failed' });
    expect(t.rows()).toEqual([]);
  });
});

describe('/api/iori/v1/bluesky/blocks', () => {
  it('POST は block して D1 に保存し、blockUri を返す', async () => {
    const t = await setup({ blockUri: null });

    const response = await t.send('POST', BLOCKS, { did: DID });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ blockUri: NEW_BLOCK });
    expect(t.client.createBlock).toHaveBeenCalledExactlyOnceWith(DID);
    expect(t.rows()).toEqual([{ did: DID, muted: 0, blockUri: NEW_BLOCK }]);
  });

  it('POST は既にブロック済みなら、その uri を返して createBlock を呼ばない', async () => {
    const t = await setup();

    const response = await t.send('POST', BLOCKS, { did: DID });

    expect(await response.json()).toEqual({ blockUri: OLD_BLOCK });
    expect(t.client.createBlock).not.toHaveBeenCalled();
  });

  it('DELETE は blockUri を指定すればその uri を削除し、blockUri: null を返す', async () => {
    const t = await setup();
    await t.send('POST', BLOCKS, { did: DID });

    const response = await t.send(
      'DELETE',
      `${BLOCKS}?did=${encodeURIComponent(DID)}&blockUri=${encodeURIComponent(OLD_BLOCK)}`,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ blockUri: null });
    expect(t.client.deleteBlock).toHaveBeenCalledExactlyOnceWith(OLD_BLOCK);
    expect(t.rows()).toEqual([]);
  });

  it('DELETE は blockUri が無ければ viewer.blocking を削除する', async () => {
    const t = await setup();

    const response = await t.send('DELETE', `${BLOCKS}?did=${encodeURIComponent(DID)}`);

    expect(response.status).toBe(200);
    expect(t.client.deleteBlock).toHaveBeenCalledExactlyOnceWith(OLD_BLOCK);
  });

  it('DELETE は block の uri でない blockUri を 400 にし、Bluesky を呼ばない', async () => {
    const t = await setup();
    const list = encodeURIComponent('at://did:plc:other/app.bsky.graph.list/3klist');

    const response = await t.send('DELETE', `${BLOCKS}?did=${encodeURIComponent(DID)}&blockUri=${list}`);

    expect(response.status).toBe(400);
    expect(t.client.deleteBlock).not.toHaveBeenCalled();
  });

  it('Bluesky の失敗を 502 にする', async () => {
    const t = await setup({ blockUri: null });
    t.client.createBlock.mockReturnValueOnce(RA.err(failure('auth')));

    const response = await t.send('POST', BLOCKS, { did: DID });

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'Bluesky login failed' });
    expect(t.rows()).toEqual([]);
  });
});

describe('POST /api/iori/v1/bluesky/reports', () => {
  it('201 と空のオブジェクトを返し、category と comment を通報に渡す', async () => {
    const t = await setup();

    const response = await t.send('POST', REPORTS, { did: DID, category: 'offensive', comment: ' ひどい内容 ' });

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({});
    expect(t.client.createReport).toHaveBeenCalledExactlyOnceWith({
      subjectDid: DID,
      reasonType: 'com.atproto.moderation.defs#reasonRude',
      reason: 'ひどい内容',
    });
  });

  it('comment が無くても通報できる', async () => {
    const t = await setup();

    const response = await t.send('POST', REPORTS, { did: DID, category: 'spam' });

    expect(response.status).toBe(201);
    expect(t.client.createReport).toHaveBeenCalledExactlyOnceWith({
      subjectDid: DID,
      reasonType: 'com.atproto.moderation.defs#reasonSpam',
      reason: '',
    });
  });

  it('category が不正、または無いときは 400 にする', async () => {
    const t = await setup();

    expect((await t.send('POST', REPORTS, { did: DID, category: 'rude' })).status).toBe(400);
    expect((await t.send('POST', REPORTS, { did: DID, category: '' })).status).toBe(400);
    expect((await t.send('POST', REPORTS, { did: DID })).status).toBe(400);
    expect((await t.send('POST', REPORTS, { did: DID, category: 1 })).status).toBe(400);
    expect(t.client.createReport).not.toHaveBeenCalled();
  });

  it('comment が文字列でない、または 2000 文字を超えるときは 400 にする', async () => {
    const t = await setup();

    const notString = await t.send('POST', REPORTS, { did: DID, category: 'spam', comment: 1 });
    const tooLong = await t.send('POST', REPORTS, { did: DID, category: 'spam', comment: 'あ'.repeat(2001) });

    expect(notString.status).toBe(400);
    expect(tooLong.status).toBe(400);
    expect(await tooLong.json()).toEqual({ error: 'Validation failed: comment' });
    expect(t.client.createReport).not.toHaveBeenCalled();
  });

  it('Bluesky の失敗を 502 にする', async () => {
    const t = await setup();
    t.client.createReport.mockReturnValueOnce(RA.err(failure('auth')));
    t.client.createReport.mockReturnValueOnce(RA.err(failure('http')));

    const auth = await t.send('POST', REPORTS, { did: DID, category: 'spam' });
    const http = await t.send('POST', REPORTS, { did: DID, category: 'spam' });

    expect(auth.status).toBe(502);
    expect(await auth.json()).toEqual({ error: 'Bluesky login failed' });
    expect(http.status).toBe(502);
    expect(await http.json()).toEqual({ error: 'Bluesky request failed' });
  });
});
