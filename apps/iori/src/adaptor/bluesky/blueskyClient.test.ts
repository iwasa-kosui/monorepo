import { RA } from '@iwasa-kosui/result';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { BlueskySession } from '../../domain/blueskyCrosspost/blueskyCrosspost.ts';
import type { BlueskyPostRecord } from '../../domain/blueskyCrosspost/blueskyPostRecord.ts';
import { Instant } from '../../domain/instant/instant.ts';
import { BLUESKY_LOGIN_RETRY_COOLDOWN_MS, createBlueskyClient, resolveBlueskyPdsUrl } from './blueskyClient.ts';

const NOW = Instant.orThrow(Date.UTC(2026, 10, 8));
const PDS = 'https://pds.example.net';
const didDoc = (endpoint: string = PDS) => ({
  id: 'did:plc:abc',
  service: [
    { id: '#other', type: 'Other', serviceEndpoint: 'https://other.example' },
    { id: '#atproto_pds', type: 'AtprotoPersonalDataServer', serviceEndpoint: endpoint },
  ],
});
const sessionBody = (suffix: string, extra: Record<string, unknown> = {}) => ({
  did: 'did:plc:abc',
  handle: 'iori.example.com',
  accessJwt: `access-${suffix}`,
  refreshJwt: `refresh-${suffix}`,
  ...extra,
});
const stored = (overrides: Partial<BlueskySession> = {}): BlueskySession => ({
  did: 'did:plc:abc',
  handle: 'iori.example.com',
  pdsUrl: PDS,
  accessJwt: 'access-old',
  refreshJwt: 'refresh-old',
  updatedAt: Instant.orThrow(1),
  ...overrides,
});
const RKEY = '3kabcdefghij2';
const record: BlueskyPostRecord = { $type: 'app.bsky.feed.post', text: 'hi', createdAt: '2026-11-08T00:00:00.000Z' };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

type Call = { url: string; init: RequestInit };
type Responder = (call: Call) => Response | Promise<Response>;

const setup = (initial: BlueskySession | undefined, responders: Responder[]) => {
  let session = initial;
  const saved: BlueskySession[] = [];
  const calls: Call[] = [];
  const queue = [...responders];
  const fetchStub = (async (url: string | URL | Request, init?: RequestInit) => {
    const call = { url: String(url), init: init ?? {} };
    calls.push(call);
    const responder = queue.shift();
    if (responder === undefined) throw new Error(`unexpected request: ${call.url}`);
    return responder(call);
  }) as typeof fetch;
  const client = createBlueskyClient({
    identifier: 'iori.example.com',
    appPassword: 'app-pass-secret',
    sessionResolver: { resolve: () => RA.ok(session) },
    sessionStore: {
      save: (next) => {
        session = next;
        saved.push(next);
        return RA.ok(undefined);
      },
    },
    fetch: fetchStub,
    now: () => NOW,
  });
  return { client, calls, saved, current: () => session };
};

const header = (call: Call, name: string) => (call.init.headers as Record<string, string>)[name];
const created = (suffix = '1') =>
  json({ uri: `at://did:plc:abc/app.bsky.feed.post/3k${suffix}`, cid: `bafycid${suffix}` });

describe('createBlueskyClient のセッション', () => {
  it('保存済みのセッションが無ければ bsky.social で createSession し、保存して didDoc の PDS に書く', async () => {
    const { client, calls, saved } = setup(undefined, [
      () => json(sessionBody('new', { didDoc: didDoc() })),
      () => created(),
    ]);

    const result = await client.createRecord(record, RKEY);

    expect(result).toMatchObject({
      ok: true,
      val: { uri: 'at://did:plc:abc/app.bsky.feed.post/3k1', cid: 'bafycid1', rkey: '3k1' },
    });
    expect(calls.map((call) => call.url)).toEqual([
      'https://bsky.social/xrpc/com.atproto.server.createSession',
      `${PDS}/xrpc/com.atproto.repo.createRecord`,
    ]);
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({
      identifier: 'iori.example.com',
      password: 'app-pass-secret',
    });
    expect(saved).toEqual([{
      did: 'did:plc:abc',
      handle: 'iori.example.com',
      pdsUrl: PDS,
      accessJwt: 'access-new',
      refreshJwt: 'refresh-new',
      updatedAt: NOW,
    }]);
    expect(header(calls[1]!, 'Authorization')).toBe('Bearer access-new');
    expect(JSON.parse(calls[1]!.init.body as string)).toEqual({
      repo: 'did:plc:abc',
      collection: 'app.bsky.feed.post',
      rkey: RKEY,
      record,
    });
  });

  it('didDoc が無ければ https://bsky.social に書く', async () => {
    const { client, calls, saved } = setup(undefined, [() => json(sessionBody('new')), () => created()]);

    await client.createRecord(record, RKEY);

    expect(saved[0]?.pdsUrl).toBe('https://bsky.social');
    expect(calls[1]?.url).toBe('https://bsky.social/xrpc/com.atproto.repo.createRecord');
  });

  it('保存済みのセッションがあれば createSession せずにそれを使う', async () => {
    const { client, calls, saved } = setup(stored(), [() => created()]);

    await client.createRecord(record, RKEY);

    expect(calls).toHaveLength(1);
    expect(header(calls[0]!, 'Authorization')).toBe('Bearer access-old');
    expect(saved).toEqual([]);
  });

  it('401 のとき refreshSession を 1 回試し、保存して同じ操作をやり直す', async () => {
    const { client, calls, saved, current } = setup(stored(), [
      () => json({ error: 'AuthenticationRequired' }, 401),
      () => json(sessionBody('fresh', { didDoc: didDoc('https://moved.example.net') })),
      () => created('2'),
    ]);

    const result = await client.createRecord(record, RKEY);

    expect(result).toMatchObject({ ok: true, val: { rkey: '3k2' } });
    expect(calls.map((call) => call.url)).toEqual([
      `${PDS}/xrpc/com.atproto.repo.createRecord`,
      `${PDS}/xrpc/com.atproto.server.refreshSession`,
      'https://moved.example.net/xrpc/com.atproto.repo.createRecord',
    ]);
    expect(header(calls[1]!, 'Authorization')).toBe('Bearer refresh-old');
    expect(header(calls[2]!, 'Authorization')).toBe('Bearer access-fresh');
    expect(saved).toHaveLength(1);
    expect(current()).toMatchObject({
      accessJwt: 'access-fresh',
      refreshJwt: 'refresh-fresh',
      pdsUrl: 'https://moved.example.net',
    });
  });

  it('400 ExpiredToken でも refreshSession を試す', async () => {
    const { client, calls } = setup(stored(), [
      () => json({ error: 'ExpiredToken', message: 'Token has expired' }, 400),
      () => json(sessionBody('fresh')),
      () => created(),
    ]);

    const result = await client.createRecord(record, RKEY);

    expect(result.ok).toBe(true);
    expect(calls[1]?.url).toBe(`${PDS}/xrpc/com.atproto.server.refreshSession`);
  });

  it('refresh の応答に didDoc が無ければ保存済みの PDS を保つ', async () => {
    const { client, saved } = setup(stored(), [
      () => json({ error: 'ExpiredToken' }, 400),
      () => json(sessionBody('fresh')),
      () => created(),
    ]);

    await client.createRecord(record, RKEY);

    expect(saved[0]?.pdsUrl).toBe(PDS);
  });

  it('refresh も失敗したら createSession を 1 回試してやり直す', async () => {
    const { client, calls, saved } = setup(stored(), [
      () => json({ error: 'ExpiredToken' }, 400),
      () => json({ error: 'ExpiredToken' }, 400),
      () => json(sessionBody('created', { didDoc: didDoc() })),
      () => created('3'),
    ]);

    const result = await client.createRecord(record, RKEY);

    expect(result).toMatchObject({ ok: true, val: { rkey: '3k3' } });
    expect(calls.map((call) => call.url.split('/').pop())).toEqual([
      'com.atproto.repo.createRecord',
      'com.atproto.server.refreshSession',
      'com.atproto.server.createSession',
      'com.atproto.repo.createRecord',
    ]);
    expect(saved.map((session) => session.accessJwt)).toEqual(['access-created']);
  });

  it('やり直しても認証に失敗したら auth エラーを返し、それ以上は試さない', async () => {
    const { client, calls } = setup(stored(), [
      () => json({ error: 'ExpiredToken' }, 400),
      () => json(sessionBody('fresh')),
      () => json({ error: 'ExpiredToken' }, 400),
    ]);

    const result = await client.createRecord(record, RKEY);

    expect(result).toMatchObject({ ok: false, err: { kind: 'auth', status: 400 } });
    expect(calls).toHaveLength(3);
  });

  it('createSession が失敗したらその場でエラーを返し、パスワードを含めない', async () => {
    const { client, calls } = setup(undefined, [() => json({ error: 'AuthenticationRequired' }, 401)]);

    const result = await client.createRecord(record, RKEY);

    expect(result).toMatchObject({ ok: false, err: { kind: 'auth', status: 401 } });
    expect(calls).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain('app-pass-secret');
  });
});

describe('createBlueskyClient の各操作', () => {
  it('uploadBlob は PDS にバイト列を content-type つきで送り、blob を返す', async () => {
    const blob = { $type: 'blob', ref: { $link: 'bafkrei' }, mimeType: 'image/png', size: 3 };
    const { client, calls } = setup(stored(), [() => json({ blob })]);

    const result = await client.uploadBlob({ bytes: new Uint8Array([1, 2, 3]), mimeType: 'image/png' });

    expect(result).toMatchObject({ ok: true, val: blob });
    expect(calls[0]?.url).toBe(`${PDS}/xrpc/com.atproto.repo.uploadBlob`);
    expect(header(calls[0]!, 'Content-Type')).toBe('image/png');
    expect(Array.from(new Uint8Array(calls[0]!.init.body as ArrayBuffer))).toEqual([1, 2, 3]);
  });

  it('deleteRecord は repo、collection、rkey を送る', async () => {
    const { client, calls } = setup(stored(), [() => json({})]);

    const result = await client.deleteRecord('3kabc');

    expect(result.ok).toBe(true);
    expect(calls[0]?.url).toBe(`${PDS}/xrpc/com.atproto.repo.deleteRecord`);
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({
      repo: 'did:plc:abc',
      collection: 'app.bsky.feed.post',
      rkey: '3kabc',
    });
  });

  it('createLike は putRecord で app.bsky.feed.like のレコードを指定の rkey で書き、応答の uri を返す', async () => {
    const likeUri = 'at://did:plc:abc/app.bsky.feed.like/2222222222222';
    const { client, calls } = setup(stored(), [() => json({ uri: likeUri, cid: 'bafylike' })]);

    const result = await client.createLike(
      { uri: 'at://did:plc:a/app.bsky.feed.post/1', cid: 'bafypost' },
      '2222222222222',
    );

    expect(result).toEqual({ ok: true, val: { uri: likeUri } });
    expect(calls[0]?.url).toBe(`${PDS}/xrpc/com.atproto.repo.putRecord`);
    const body = JSON.parse(calls[0]!.init.body as string);
    expect(body).toEqual({
      repo: 'did:plc:abc',
      collection: 'app.bsky.feed.like',
      rkey: '2222222222222',
      record: {
        $type: 'app.bsky.feed.like',
        subject: { uri: 'at://did:plc:a/app.bsky.feed.post/1', cid: 'bafypost' },
        createdAt: new Date(NOW).toISOString(),
      },
    });
    expect(header(calls[0]!, 'Authorization')).toBe('Bearer access-old');
  });

  it('createLike は like の uri でない応答を invalid_response として返す', async () => {
    const { client } = setup(stored(), [() => json({ uri: 'at://did:plc:abc/app.bsky.feed.post/3k1', cid: 'c' })]);

    expect(await client.createLike({ uri: 'at://did:plc:a/app.bsky.feed.post/1', cid: 'bafypost' }, '2222222222222'))
      .toMatchObject({
        ok: false,
        err: { kind: 'invalid_response' },
      });
  });

  it('createLike は 500 を失敗として返す', async () => {
    const { client } = setup(stored(), [() => json({ error: 'InternalServerError' }, 500)]);

    expect(await client.createLike({ uri: 'at://did:plc:a/app.bsky.feed.post/1', cid: 'bafypost' }, '2222222222222'))
      .toMatchObject({
        ok: false,
        err: { kind: 'http', status: 500 },
      });
  });

  it('deleteLike は app.bsky.feed.like の collection と rkey を送る', async () => {
    const { client, calls } = setup(stored(), [() => json({})]);

    const result = await client.deleteLike('3klike');

    expect(result.ok).toBe(true);
    expect(calls[0]?.url).toBe(`${PDS}/xrpc/com.atproto.repo.deleteRecord`);
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({
      repo: 'did:plc:abc',
      collection: 'app.bsky.feed.like',
      rkey: '3klike',
    });
  });

  it('deleteLike は既に無い record を成功として扱い、500 は失敗として返す', async () => {
    const missing = setup(stored(), [() => json({ error: 'RecordNotFound' }, 400)]);
    const failing = setup(stored(), [() => json({ error: 'InternalServerError' }, 500)]);

    expect((await missing.client.deleteLike('3klike')).ok).toBe(true);
    expect(await failing.client.deleteLike('3klike')).toMatchObject({ ok: false, err: { kind: 'http', status: 500 } });
  });

  it('createFollow は createRecord で app.bsky.graph.follow のレコードを書き、応答の uri を返す', async () => {
    const followUri = 'at://did:plc:abc/app.bsky.graph.follow/3kfollow';
    const { client, calls } = setup(stored(), [() => json({ uri: followUri, cid: 'bafyfollow' })]);

    const result = await client.createFollow('did:plc:other');

    expect(result).toEqual({ ok: true, val: { uri: followUri } });
    expect(calls[0]?.url).toBe(`${PDS}/xrpc/com.atproto.repo.createRecord`);
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({
      repo: 'did:plc:abc',
      collection: 'app.bsky.graph.follow',
      record: {
        $type: 'app.bsky.graph.follow',
        subject: 'did:plc:other',
        createdAt: new Date(NOW).toISOString(),
      },
    });
    expect(header(calls[0]!, 'Authorization')).toBe('Bearer access-old');
  });

  it('createFollow は follow の uri でない応答を invalid_response として返し、500 は失敗として返す', async () => {
    const wrongUri = setup(stored(), [() => json({ uri: 'at://did:plc:abc/app.bsky.feed.post/3k1', cid: 'c' })]);
    const failing = setup(stored(), [() => json({ error: 'InternalServerError' }, 500)]);

    expect(await wrongUri.client.createFollow('did:plc:other')).toMatchObject({
      ok: false,
      err: { kind: 'invalid_response' },
    });
    expect(await failing.client.createFollow('did:plc:other')).toMatchObject({
      ok: false,
      err: { kind: 'http', status: 500 },
    });
  });

  it('deleteFollow は uri の末尾を rkey として app.bsky.graph.follow の collection に送る', async () => {
    const { client, calls } = setup(stored(), [() => json({})]);

    const result = await client.deleteFollow('at://did:plc:abc/app.bsky.graph.follow/3kfollow');

    expect(result.ok).toBe(true);
    expect(calls[0]?.url).toBe(`${PDS}/xrpc/com.atproto.repo.deleteRecord`);
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({
      repo: 'did:plc:abc',
      collection: 'app.bsky.graph.follow',
      rkey: '3kfollow',
    });
  });

  it('deleteFollow は既に無い record を成功として扱い、follow の uri でない値は送らずに失敗として返す', async () => {
    const missing = setup(stored(), [() => json({ error: 'RecordNotFound' }, 400)]);
    const invalid = setup(stored(), []);

    expect((await missing.client.deleteFollow('at://did:plc:abc/app.bsky.graph.follow/3kfollow')).ok).toBe(true);
    expect(await invalid.client.deleteFollow('at://did:plc:abc/app.bsky.feed.like/3k1')).toMatchObject({
      ok: false,
      err: { kind: 'invalid_response' },
    });
    expect(invalid.calls).toHaveLength(0);
  });

  it('updateSeen は app.bsky.notification.updateSeen に seenAt を ISO 文字列で POST し、空の応答を成功にする', async () => {
    const { client, calls } = setup(stored(), [() => new Response(null, { status: 200 })]);

    const result = await client.updateSeen(Instant.orThrow(Date.UTC(2026, 10, 12, 3, 4, 5, 678)));

    expect(result).toEqual({ ok: true, val: undefined });
    expect(calls[0]?.url).toBe(`${PDS}/xrpc/app.bsky.notification.updateSeen`);
    expect(calls[0]?.init.method).toBe('POST');
    expect(header(calls[0]!, 'Authorization')).toBe('Bearer access-old');
    expect(header(calls[0]!, 'Content-Type')).toBe('application/json');
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({ seenAt: '2026-11-12T03:04:05.678Z' });
  });

  it('updateSeen は期限切れのトークンを更新してやり直し、HTTP の失敗を返す', async () => {
    const retried = setup(stored(), [
      () => json({ error: 'ExpiredToken' }, 400),
      () => json(sessionBody('fresh')),
      () => json({}),
    ]);
    const failed = setup(stored(), [() => json({ error: 'InternalServerError' }, 500)]);

    expect((await retried.client.updateSeen(NOW)).ok).toBe(true);
    expect(header(retried.calls[2]!, 'Authorization')).toBe('Bearer access-fresh');
    expect(await failed.client.updateSeen(NOW)).toMatchObject({ ok: false, err: { kind: 'http', status: 500 } });
  });

  it('createRepost は putRecord で app.bsky.feed.repost のレコードを指定の rkey で書き、応答の uri を返す', async () => {
    const repostUri = 'at://did:plc:abc/app.bsky.feed.repost/2222222222222';
    const { client, calls } = setup(stored(), [() => json({ uri: repostUri, cid: 'bafyrepost' })]);

    const result = await client.createRepost(
      { uri: 'at://did:plc:a/app.bsky.feed.post/1', cid: 'bafypost' },
      '2222222222222',
    );

    expect(result).toEqual({ ok: true, val: { uri: repostUri } });
    expect(calls[0]?.url).toBe(`${PDS}/xrpc/com.atproto.repo.putRecord`);
    const body = JSON.parse(calls[0]!.init.body as string);
    expect(body).toEqual({
      repo: 'did:plc:abc',
      collection: 'app.bsky.feed.repost',
      rkey: '2222222222222',
      record: {
        $type: 'app.bsky.feed.repost',
        subject: { uri: 'at://did:plc:a/app.bsky.feed.post/1', cid: 'bafypost' },
        createdAt: new Date(NOW).toISOString(),
      },
    });
    expect(header(calls[0]!, 'Authorization')).toBe('Bearer access-old');
  });

  it('createRepost は repost の uri でない応答を invalid_response として返す', async () => {
    const { client } = setup(stored(), [() => json({ uri: 'at://did:plc:abc/app.bsky.feed.like/3k1', cid: 'c' })]);

    expect(await client.createRepost({ uri: 'at://did:plc:a/app.bsky.feed.post/1', cid: 'bafypost' }, '2222222222222'))
      .toMatchObject({
        ok: false,
        err: { kind: 'invalid_response' },
      });
  });

  it('createRepost は 500 を失敗として返す', async () => {
    const { client } = setup(stored(), [() => json({ error: 'InternalServerError' }, 500)]);

    expect(await client.createRepost({ uri: 'at://did:plc:a/app.bsky.feed.post/1', cid: 'bafypost' }, '2222222222222'))
      .toMatchObject({
        ok: false,
        err: { kind: 'http', status: 500 },
      });
  });

  it('deleteRepost は app.bsky.feed.repost の collection と rkey を送る', async () => {
    const { client, calls } = setup(stored(), [() => json({})]);

    const result = await client.deleteRepost('3krepost');

    expect(result.ok).toBe(true);
    expect(calls[0]?.url).toBe(`${PDS}/xrpc/com.atproto.repo.deleteRecord`);
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({
      repo: 'did:plc:abc',
      collection: 'app.bsky.feed.repost',
      rkey: '3krepost',
    });
  });

  it('deleteRepost は既に無い record を 404 と RecordNotFound のどちらでも成功として扱い、500 は失敗として返す', async () => {
    const notFound = setup(stored(), [() => json({ error: 'NotFound' }, 404)]);
    const missing = setup(stored(), [() => json({ error: 'RecordNotFound' }, 400)]);
    const failing = setup(stored(), [() => json({ error: 'InternalServerError' }, 500)]);

    expect((await notFound.client.deleteRepost('3krepost')).ok).toBe(true);
    expect((await missing.client.deleteRepost('3krepost')).ok).toBe(true);
    expect(await failing.client.deleteRepost('3krepost')).toMatchObject({
      ok: false,
      err: { kind: 'http', status: 500 },
    });
  });

  it('getRecord は repo、collection、rkey を query に付けて uri、cid、rkey を返す', async () => {
    const { client, calls } = setup(stored(), [
      () => json({ uri: 'at://did:plc:abc/app.bsky.feed.post/3k9', cid: 'bafy9', value: { text: 'x' } }),
    ]);

    const result = await client.getRecord('3k9');

    expect(result).toMatchObject({
      ok: true,
      val: { uri: 'at://did:plc:abc/app.bsky.feed.post/3k9', cid: 'bafy9', rkey: '3k9' },
    });
    const url = new URL(calls[0]!.url);
    expect(url.origin + url.pathname).toBe(`${PDS}/xrpc/com.atproto.repo.getRecord`);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      repo: 'did:plc:abc',
      collection: 'app.bsky.feed.post',
      rkey: '3k9',
    });
    expect(calls[0]?.init.method).toBe('GET');
  });

  it('getRecord は collection に app.bsky.graph.follow を渡すと follow の uri と value を返す', async () => {
    const { client, calls } = setup(stored(), [
      () =>
        json({ uri: 'at://did:plc:abc/app.bsky.graph.follow/3kf', cid: 'bafyf', value: { subject: 'did:plc:bob' } }),
    ]);

    const result = await client.getRecord('3kf', 'app.bsky.graph.follow');

    expect(result).toMatchObject({
      ok: true,
      val: {
        uri: 'at://did:plc:abc/app.bsky.graph.follow/3kf',
        cid: 'bafyf',
        rkey: '3kf',
        value: { subject: 'did:plc:bob' },
      },
    });
    expect(Object.fromEntries(new URL(calls[0]!.url).searchParams)).toEqual({
      repo: 'did:plc:abc',
      collection: 'app.bsky.graph.follow',
      rkey: '3kf',
    });
  });

  it('getRecord は無い record を http エラーで返す', async () => {
    const { client } = setup(stored(), [() => json({ error: 'RecordNotFound' }, 400)]);
    expect(await client.getRecord('3k9')).toMatchObject({ ok: false, err: { kind: 'http', code: 'RecordNotFound' } });
  });

  it.each([
    ['RecordNotFound の 400', json({ error: 'RecordNotFound' }, 400)],
    ['404', json({ error: 'NotFound' }, 404)],
  ])('deleteRecord は既に無い record を成功として扱う (%s)', async (_name, response) => {
    const { client } = setup(stored(), [() => response]);
    expect((await client.deleteRecord('3kabc')).ok).toBe(true);
  });

  it('deleteRecord は 500 を失敗として返す', async () => {
    const { client } = setup(stored(), [() => json({ error: 'InternalServerError' }, 500)]);
    expect(await client.deleteRecord('3kabc')).toMatchObject({ ok: false, err: { kind: 'http', status: 500 } });
  });

  it('deleteRecord は空の本文の成功応答も受け付ける', async () => {
    const { client } = setup(stored(), [() => new Response(null, { status: 200 })]);
    expect((await client.deleteRecord('3kabc')).ok).toBe(true);
  });

  it('認証以外の HTTP エラーは http として返し、refresh を試さない', async () => {
    const { client, calls } = setup(stored(), [() => json({ error: 'InvalidRequest', message: 'bad record' }, 400)]);

    const result = await client.createRecord(record, RKEY);

    expect(result).toMatchObject({
      ok: false,
      err: { kind: 'http', status: 400, message: 'createRecord failed: status 400 InvalidRequest' },
    });
    expect(calls).toHaveLength(1);
  });

  it('スキーマに合わない応答を invalid_response として返す', async () => {
    const { client } = setup(stored(), [() => json({ uri: 'at://did:plc:abc/app.bsky.feed.post/3k1' })]);
    expect(await client.createRecord(record, RKEY)).toMatchObject({ ok: false, err: { kind: 'invalid_response' } });
  });

  it('投稿の uri から rkey を取れない応答を invalid_response として返す', async () => {
    const { client } = setup(stored(), [() => json({ uri: 'at://did:plc:abc/other.collection/3k1', cid: 'c' })]);
    expect(await client.createRecord(record, RKEY)).toMatchObject({ ok: false, err: { kind: 'invalid_response' } });
  });

  it('JSON でない成功応答を invalid_response として返す', async () => {
    const { client } = setup(stored(), [() => new Response('<html>', { status: 200 })]);
    expect(await client.createRecord(record, RKEY)).toMatchObject({ ok: false, err: { kind: 'invalid_response' } });
  });

  it('fetch が例外を投げても例外にせず network として返す', async () => {
    const { client } = setup(stored(), [
      () => {
        throw new TypeError('connect failed with Bearer access-old');
      },
    ]);

    const result = await client.createRecord(record, RKEY);

    expect(result).toMatchObject({ ok: false, err: { kind: 'network' } });
    expect(JSON.stringify(result)).not.toContain('access-old');
  });
});

describe('createBlueskyClient のミュート、ブロック、通報', () => {
  const BLOCK_URI = 'at://did:plc:abc/app.bsky.graph.block/3kblock';
  const ROOT = 'at://did:plc:abc/app.bsky.feed.post/3kroot';

  it('muteActor は app.bsky.graph.muteActor に actor を POST し、空の応答を成功にする', async () => {
    const { client, calls } = setup(stored(), [() => new Response('', { status: 200 })]);

    const result = await client.muteActor('did:plc:target');

    expect(result).toEqual({ ok: true, val: undefined });
    expect(calls[0]?.url).toBe(`${PDS}/xrpc/app.bsky.graph.muteActor`);
    expect(calls[0]?.init.method).toBe('POST');
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({ actor: 'did:plc:target' });
    expect(header(calls[0]!, 'Authorization')).toBe('Bearer access-old');
    expect(header(calls[0]!, 'atproto-proxy')).toBeUndefined();
  });

  it('unmuteActor は app.bsky.graph.unmuteActor に actor を POST する', async () => {
    const { client, calls } = setup(stored(), [() => json({})]);

    const result = await client.unmuteActor('did:plc:target');

    expect(result.ok).toBe(true);
    expect(calls[0]?.url).toBe(`${PDS}/xrpc/app.bsky.graph.unmuteActor`);
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({ actor: 'did:plc:target' });
  });

  it('muteActor は期限切れの認証を更新してからやり直す', async () => {
    const { client, calls } = setup(stored(), [
      () => json({ error: 'ExpiredToken' }, 400),
      () => json(sessionBody('new')),
      () => json({}),
    ]);

    const result = await client.muteActor('did:plc:target');

    expect(result.ok).toBe(true);
    expect(calls[1]?.url).toBe(`${PDS}/xrpc/com.atproto.server.refreshSession`);
    expect(header(calls[2]!, 'Authorization')).toBe('Bearer access-new');
  });

  it('muteActor は 500 を失敗として返す', async () => {
    const { client } = setup(stored(), [() => json({ error: 'InternalServerError' }, 500)]);

    expect(await client.muteActor('did:plc:target')).toMatchObject({
      ok: false,
      err: { kind: 'http', status: 500 },
    });
  });

  it('muteThread は app.bsky.graph.muteThread に root を POST し、空の応答を成功にする', async () => {
    const { client, calls } = setup(stored(), [() => new Response('', { status: 200 })]);

    const result = await client.muteThread(ROOT);

    expect(result).toEqual({ ok: true, val: undefined });
    expect(calls[0]?.url).toBe(`${PDS}/xrpc/app.bsky.graph.muteThread`);
    expect(calls[0]?.init.method).toBe('POST');
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({ root: ROOT });
    expect(header(calls[0]!, 'Authorization')).toBe('Bearer access-old');
    expect(header(calls[0]!, 'atproto-proxy')).toBeUndefined();
  });

  it('unmuteThread は app.bsky.graph.unmuteThread に root を POST する', async () => {
    const { client, calls } = setup(stored(), [() => json({})]);

    const result = await client.unmuteThread(ROOT);

    expect(result.ok).toBe(true);
    expect(calls[0]?.url).toBe(`${PDS}/xrpc/app.bsky.graph.unmuteThread`);
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({ root: ROOT });
  });

  it('muteThread は 500 を失敗として返す', async () => {
    const { client } = setup(stored(), [() => json({ error: 'InternalServerError' }, 500)]);

    expect(await client.muteThread(ROOT)).toMatchObject({
      ok: false,
      err: { kind: 'http', status: 500 },
    });
  });

  it('createBlock は createRecord で app.bsky.graph.block のレコードを rkey なしで書き、応答の uri を返す', async () => {
    const { client, calls } = setup(stored(), [() => json({ uri: BLOCK_URI, cid: 'bafyblock' })]);

    const result = await client.createBlock('did:plc:target');

    expect(result).toEqual({ ok: true, val: { uri: BLOCK_URI } });
    expect(calls[0]?.url).toBe(`${PDS}/xrpc/com.atproto.repo.createRecord`);
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({
      repo: 'did:plc:abc',
      collection: 'app.bsky.graph.block',
      record: {
        $type: 'app.bsky.graph.block',
        subject: 'did:plc:target',
        createdAt: new Date(NOW).toISOString(),
      },
    });
  });

  it('createBlock は block の uri でない応答を invalid_response として返す', async () => {
    const { client } = setup(stored(), [() => json({ uri: 'at://did:plc:abc/app.bsky.graph.list/3k1', cid: 'c' })]);

    expect(await client.createBlock('did:plc:target')).toMatchObject({
      ok: false,
      err: { kind: 'invalid_response' },
    });
  });

  it('deleteBlock は block の uri の rkey を app.bsky.graph.block の collection で deleteRecord する', async () => {
    const { client, calls } = setup(stored(), [() => json({})]);

    const result = await client.deleteBlock(BLOCK_URI);

    expect(result.ok).toBe(true);
    expect(calls[0]?.url).toBe(`${PDS}/xrpc/com.atproto.repo.deleteRecord`);
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({
      repo: 'did:plc:abc',
      collection: 'app.bsky.graph.block',
      rkey: '3kblock',
    });
  });

  it('deleteBlock は block の uri でないものを送らずに invalid_response として返す', async () => {
    const { client, calls } = setup(stored(), []);

    const list = await client.deleteBlock('at://did:plc:abc/app.bsky.graph.list/3klist');
    const post = await client.deleteBlock('at://did:plc:abc/app.bsky.feed.post/3kpost');
    const garbage = await client.deleteBlock('not-a-uri');

    for (const result of [list, post, garbage]) {
      expect(result).toMatchObject({ ok: false, err: { kind: 'invalid_response' } });
    }
    expect(calls).toEqual([]);
  });

  it('deleteBlock は uri の repo がセッションの did と違うとき、送らずに invalid_response として返す', async () => {
    const { client, calls } = setup(stored(), []);

    const result = await client.deleteBlock('at://did:plc:other/app.bsky.graph.block/3kblock');

    expect(result).toMatchObject({ ok: false, err: { kind: 'invalid_response' } });
    expect(calls).toEqual([]);
  });

  it('createReport は Bluesky 公式のモデレーションを atproto-proxy に指定して、repoRef の通報を POST する', async () => {
    const { client, calls } = setup(stored(), [() => json({ id: 1 })]);

    const result = await client.createReport({
      subjectDid: 'did:plc:target',
      reasonType: 'com.atproto.moderation.defs#reasonSpam',
      reason: '宣伝ばかり',
    });

    expect(result).toEqual({ ok: true, val: undefined });
    expect(calls[0]?.url).toBe(`${PDS}/xrpc/com.atproto.moderation.createReport`);
    expect(header(calls[0]!, 'atproto-proxy')).toBe('did:plc:ar7c4by46qjdydhdevvrndac#atproto_labeler');
    expect(header(calls[0]!, 'Authorization')).toBe('Bearer access-old');
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({
      reasonType: 'com.atproto.moderation.defs#reasonSpam',
      reason: '宣伝ばかり',
      subject: { $type: 'com.atproto.admin.defs#repoRef', did: 'did:plc:target' },
    });
  });

  it('createReport は subjectPost があるとき、subject を strongRef にして投稿を通報する', async () => {
    const { client, calls } = setup(stored(), [() => json({ id: 1 })]);

    const result = await client.createReport({
      subjectDid: 'did:plc:target',
      reasonType: 'com.atproto.moderation.defs#reasonSpam',
      subjectPost: { uri: 'at://did:plc:target/app.bsky.feed.post/3kpost', cid: 'bafycid' },
    });

    expect(result).toEqual({ ok: true, val: undefined });
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({
      reasonType: 'com.atproto.moderation.defs#reasonSpam',
      subject: {
        $type: 'com.atproto.repo.strongRef',
        uri: 'at://did:plc:target/app.bsky.feed.post/3kpost',
        cid: 'bafycid',
      },
    });
  });

  it('createReport は reason が空または無いとき、本文に reason を入れない', async () => {
    const { client, calls } = setup(stored(), [() => json({}), () => json({})]);

    await client.createReport({
      subjectDid: 'did:plc:target',
      reasonType: 'com.atproto.moderation.defs#reasonRude',
      reason: '',
    });
    await client.createReport({
      subjectDid: 'did:plc:target',
      reasonType: 'com.atproto.moderation.defs#reasonOther',
    });

    for (const call of calls) expect(JSON.parse(call.init.body as string)).not.toHaveProperty('reason');
    expect(JSON.parse(calls[0]!.init.body as string).reasonType).toBe('com.atproto.moderation.defs#reasonRude');
    expect(JSON.parse(calls[1]!.init.body as string).reasonType).toBe('com.atproto.moderation.defs#reasonOther');
  });

  it('保存済みセッションが無いときは、どの操作も先にログインしてから送る', async () => {
    const { client, calls } = setup(undefined, [() => json(sessionBody('1')), () => json({})]);

    const result = await client.unmuteActor('did:plc:target');

    expect(result.ok).toBe(true);
    expect(calls[0]?.url).toBe('https://bsky.social/xrpc/com.atproto.server.createSession');
    expect(header(calls[1]!, 'Authorization')).toBe('Bearer access-1');
  });
});

describe('createBlueskyClient の認証付き GET（query）', () => {
  const TIMELINE = 'app.bsky.feed.getTimeline';

  it('保存済みセッションの PDS に、Bearer 付きの GET をクエリ文字列つきで送る', async () => {
    const { client, calls } = setup(stored(), [() => json({ feed: [], cursor: 'c1' })]);

    const result = await client.query(TIMELINE, { limit: '100', cursor: 'a b' });

    expect(result).toEqual({ ok: true, val: { feed: [], cursor: 'c1' } });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(`${PDS}/xrpc/${TIMELINE}?limit=100&cursor=a+b`);
    expect(calls[0]!.init.method).toBe('GET');
    expect(calls[0]!.init.body).toBeUndefined();
    expect(header(calls[0]!, 'Authorization')).toBe('Bearer access-old');
  });

  it('配列のパラメータは同名キーで繰り返してクエリ文字列に入れる', async () => {
    const { client, calls } = setup(stored(), [() => json({ feeds: [] })]);

    await client.query('app.bsky.feed.getFeedGenerators', { feeds: ['at://did:plc:a/x/1', 'at://did:plc:b/x/2'] });

    expect(calls[0]!.url).toBe(
      `${PDS}/xrpc/app.bsky.feed.getFeedGenerators?feeds=at%3A%2F%2Fdid%3Aplc%3Aa%2Fx%2F1&feeds=at%3A%2F%2Fdid%3Aplc%3Ab%2Fx%2F2`,
    );
  });

  it('パラメータが無ければクエリ文字列を付けない', async () => {
    const { client, calls } = setup(stored(), [() => json({})]);

    await client.query(TIMELINE, {});

    expect(calls[0]!.url).toBe(`${PDS}/xrpc/${TIMELINE}`);
  });

  it('保存済みセッションが無ければ createSession して保存し、その PDS に GET する', async () => {
    const { client, calls, saved } = setup(undefined, [
      () => json(sessionBody('new', { didDoc: didDoc('https://pds.example.net') })),
      () => json({ feed: [] }),
    ]);

    const result = await client.query(TIMELINE, { limit: '1' });

    expect(result.ok).toBe(true);
    expect(calls.map((call) => call.url)).toEqual([
      'https://bsky.social/xrpc/com.atproto.server.createSession',
      `https://pds.example.net/xrpc/${TIMELINE}?limit=1`,
    ]);
    expect(saved.map((session) => session.accessJwt)).toEqual(['access-new']);
    expect(header(calls[1]!, 'Authorization')).toBe('Bearer access-new');
  });

  it('401 のとき、投稿と同じ refreshSession で更新して GET をやり直す', async () => {
    const { client, calls, saved, current } = setup(stored(), [
      () => json({ error: 'ExpiredToken' }, 400),
      () => json(sessionBody('fresh')),
      () => json({ feed: [] }),
    ]);

    const result = await client.query(TIMELINE, { limit: '100' });

    expect(result.ok).toBe(true);
    expect(calls.map((call) => call.url.split('?')[0]!.split('/').pop())).toEqual([
      TIMELINE,
      'com.atproto.server.refreshSession',
      TIMELINE,
    ]);
    expect(header(calls[1]!, 'Authorization')).toBe('Bearer refresh-old');
    expect(header(calls[2]!, 'Authorization')).toBe('Bearer access-fresh');
    expect(saved).toHaveLength(1);
    expect(current()).toMatchObject({ accessJwt: 'access-fresh', refreshJwt: 'refresh-fresh' });
  });

  it('認証以外の HTTP エラーは http として返し、トークンを含めない', async () => {
    const { client, calls } = setup(stored(), [() => json({ error: 'InternalServerError' }, 500)]);

    const result = await client.query(TIMELINE, {});

    expect(result).toMatchObject({ ok: false, err: { kind: 'http', status: 500 } });
    expect(JSON.stringify(result)).not.toContain('access-old');
    expect(calls).toHaveLength(1);
  });

  it('オブジェクトでない応答を invalid_response として返す', async () => {
    const { client } = setup(stored(), [() => json(['not', 'an', 'object'])]);

    expect(await client.query(TIMELINE, {})).toMatchObject({ ok: false, err: { kind: 'invalid_response' } });
  });
});

describe('createBlueskyClient の DM（chat）', () => {
  const PROXY = 'did:web:api.bsky.chat#bsky_chat';

  it('chatQuery は PDS の xrpc に atproto-proxy と Bearer を付けた GET を送り、配列は同名キーで繰り返す', async () => {
    const { client, calls } = setup(stored(), [() => json({ convo: {} })]);

    const result = await client.chatQuery('chat.bsky.convo.getConvoForMembers', {
      members: ['did:plc:a', 'did:plc:b'],
    });

    expect(result).toEqual({ ok: true, val: { convo: {} } });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(
      `${PDS}/xrpc/chat.bsky.convo.getConvoForMembers?members=did%3Aplc%3Aa&members=did%3Aplc%3Ab`,
    );
    expect(calls[0]!.init.method).toBe('GET');
    expect(calls[0]!.init.body).toBeUndefined();
    expect(header(calls[0]!, 'atproto-proxy')).toBe(PROXY);
    expect(header(calls[0]!, 'Authorization')).toBe('Bearer access-old');
  });

  it('chatQuery はパラメータが無ければクエリ文字列を付けない', async () => {
    const { client, calls } = setup(stored(), [() => json({ convos: [] })]);

    await client.chatQuery('chat.bsky.convo.listConvos', {});

    expect(calls[0]!.url).toBe(`${PDS}/xrpc/chat.bsky.convo.listConvos`);
  });

  it('chatProcedure は atproto-proxy と JSON の body を付けた POST を送る', async () => {
    const { client, calls } = setup(stored(), [() => json({ id: 'm1' })]);

    const result = await client.chatProcedure('chat.bsky.convo.sendMessage', {
      convoId: 'c1',
      message: { text: 'こんにちは' },
    });

    expect(result).toEqual({ ok: true, val: { id: 'm1' } });
    expect(calls[0]!.url).toBe(`${PDS}/xrpc/chat.bsky.convo.sendMessage`);
    expect(calls[0]!.init.method).toBe('POST');
    expect(header(calls[0]!, 'atproto-proxy')).toBe(PROXY);
    expect(header(calls[0]!, 'Content-Type')).toBe('application/json');
    expect(header(calls[0]!, 'Authorization')).toBe('Bearer access-old');
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({ convoId: 'c1', message: { text: 'こんにちは' } });
  });

  it('chatProcedure は空の本文の成功応答も受け付ける', async () => {
    const { client } = setup(stored(), [() => new Response('', { status: 200 })]);

    expect(await client.chatProcedure('chat.bsky.convo.acceptConvo', { convoId: 'c1' })).toEqual({ ok: true, val: {} });
  });

  it('提供元が返した 401 の getFeed は auth と見なさず、refreshSession も createSession も呼ばない', async () => {
    const { client, calls, saved } = setup(stored(), [
      () => json({ error: 'UpstreamFailure', message: 'Unauthorized' }, 401),
    ]);

    const result = await client.query('app.bsky.feed.getFeed', { feed: 'at://did:plc:a/app.bsky.feed.generator/x' });

    expect(result).toMatchObject({ ok: false, err: { kind: 'http', status: 401, code: 'UpstreamFailure' } });
    expect(calls).toHaveLength(1);
    expect(saved).toEqual([]);
  });

  it('getFeed でも ExpiredToken と、getFeed 以外の 401 は auth として refresh してやり直す', async () => {
    const expired = setup(stored(), [
      () => json({ error: 'ExpiredToken' }, 401),
      () => json(sessionBody('fresh')),
      () => json({ feed: [] }),
    ]);
    const other = setup(stored(), [
      () => json({ error: 'UpstreamFailure' }, 401),
      () => json(sessionBody('fresh')),
      () => json({ feed: [] }),
    ]);

    const expiredResult = await expired.client.query('app.bsky.feed.getFeed', { feed: 'at://did:plc:a/x/1' });
    const otherResult = await other.client.query('app.bsky.feed.getListFeed', { list: 'at://did:plc:a/x/1' });

    expect(expiredResult.ok).toBe(true);
    expect(expired.calls).toHaveLength(3);
    expect(otherResult.ok).toBe(true);
    expect(other.calls).toHaveLength(3);
  });

  it('既存の query には atproto-proxy を付けない', async () => {
    const { client, calls } = setup(stored(), [() => json({})]);

    await client.query('app.bsky.feed.getTimeline', {});

    expect(header(calls[0]!, 'atproto-proxy')).toBeUndefined();
  });

  it('Bad token method は auth と見なさず、refreshSession も createSession も呼ばない', async () => {
    const { client, calls, saved } = setup(stored(), [
      () => json({ error: 'InvalidToken', message: 'Bad token method' }, 400),
    ]);

    const result = await client.chatProcedure('chat.bsky.convo.sendMessage', { convoId: 'c1', message: { text: 'a' } });

    expect(result).toMatchObject({ ok: false, err: { kind: 'chat_not_permitted' } });
    expect(calls).toHaveLength(1);
    expect(saved).toEqual([]);
  });

  it('chat の経路では message が違う 400 InvalidToken も chat_not_permitted にし、再ログインしない', async () => {
    const { client, calls, saved } = setup(stored(), [
      () => json({ error: 'InvalidToken', message: 'Token could not be verified' }, 400),
    ]);

    const result = await client.chatQuery('chat.bsky.convo.listConvos', {});

    expect(result).toMatchObject({ ok: false, err: { kind: 'chat_not_permitted', status: 400, code: 'InvalidToken' } });
    expect(calls).toHaveLength(1);
    expect(saved).toEqual([]);
  });

  it('chat の経路でも期限切れの ExpiredToken は auth として refresh してやり直す', async () => {
    const { client, calls } = setup(stored(), [
      () => json({ error: 'ExpiredToken', message: 'Token has expired' }, 400),
      () => json(sessionBody('fresh')),
      () => json({ convos: [] }),
    ]);

    const result = await client.chatQuery('chat.bsky.convo.listConvos', {});

    expect(result.ok).toBe(true);
    expect(calls.map((call) => call.url.split('?')[0]!.split('/').pop())).toEqual([
      'chat.bsky.convo.listConvos',
      'com.atproto.server.refreshSession',
      'chat.bsky.convo.listConvos',
    ]);
    expect(header(calls[2]!, 'atproto-proxy')).toBe(PROXY);
  });

  it('chat 以外の経路の InvalidToken は、これまでどおり auth として再ログインを試す', async () => {
    const { client, calls } = setup(stored(), [
      () => json({ error: 'InvalidToken', message: 'Bad token method' }, 400),
      () => json(sessionBody('fresh')),
      () => json({ feed: [] }),
    ]);

    const result = await client.query('app.bsky.feed.getTimeline', {});

    expect(result.ok).toBe(true);
    expect(calls.map((call) => call.url.split('?')[0]!.split('/').pop())).toEqual([
      'app.bsky.feed.getTimeline',
      'com.atproto.server.refreshSession',
      'app.bsky.feed.getTimeline',
    ]);
  });

  it('InvalidConvo や MessagesDisabled などの XRPC エラーは http として、error 名を code に入れて返す', async () => {
    const { client, calls } = setup(stored(), [
      () => json({ error: 'InvalidConvo', message: 'convo not found' }, 400),
      () => json({ error: 'MessagesDisabled' }, 400),
    ]);

    const invalidConvo = await client.chatQuery('chat.bsky.convo.getConvo', { convoId: 'x' });
    const disabled = await client.chatQuery('chat.bsky.convo.getConvoForMembers', { members: ['did:plc:a'] });

    expect(invalidConvo).toMatchObject({ ok: false, err: { kind: 'http', status: 400, code: 'InvalidConvo' } });
    expect(disabled).toMatchObject({ ok: false, err: { kind: 'http', code: 'MessagesDisabled' } });
    expect(calls).toHaveLength(2);
  });

  it('viewerDid は保存済みセッションの DID を返す', async () => {
    const { client, calls } = setup(stored({ did: 'did:plc:me' }), []);

    expect(await client.viewerDid()).toEqual({ ok: true, val: 'did:plc:me' });
    expect(calls).toHaveLength(0);
  });
});

describe('createBlueskyClient のタイムアウト', () => {
  afterEach(() => vi.restoreAllMocks());

  it('uploadBlob は 30 秒、createSession、createRecord、getRecord、deleteRecord は 10 秒の signal を付ける', async () => {
    const spy = vi.spyOn(AbortSignal, 'timeout');
    const blob = { $type: 'blob', ref: { $link: 'bafkrei' }, mimeType: 'image/png', size: 1 };
    const { client, calls } = setup(undefined, [
      () => json(sessionBody('new')),
      () => json({ blob }),
      () => created(),
      () => json({ uri: 'at://did:plc:abc/app.bsky.feed.post/3k1', cid: 'c' }),
      () => json({}),
    ]);

    await client.uploadBlob({ bytes: new Uint8Array([1]), mimeType: 'image/png' });
    await client.createRecord(record, RKEY);
    await client.getRecord('3k1');
    await client.deleteRecord('3k1');

    expect(spy.mock.calls.map(([ms]) => ms)).toEqual([10_000, 30_000, 10_000, 10_000, 10_000]);
    expect(calls.every((call) => call.init.signal instanceof AbortSignal)).toBe(true);
  });

  it('認証付き GET（query）にも 10 秒の signal を付ける', async () => {
    const spy = vi.spyOn(AbortSignal, 'timeout');
    const { client, calls } = setup(stored(), [() => json({ feed: [] })]);

    await client.query('app.bsky.feed.getTimeline', {});

    expect(spy.mock.calls.map(([ms]) => ms)).toEqual([10_000]);
    expect(calls[0]!.init.signal).toBeInstanceOf(AbortSignal);
  });

  it('タイムアウトした fetch は例外にせず network の失敗として返す', async () => {
    vi.spyOn(AbortSignal, 'timeout').mockImplementation(() =>
      AbortSignal.abort(new DOMException('timed out', 'TimeoutError'))
    );
    const { client } = setup(stored(), [
      (call) => {
        throw (call.init.signal as AbortSignal).reason;
      },
    ]);

    expect(await client.createRecord(record, RKEY)).toMatchObject({ ok: false, err: { kind: 'network' } });
  });
});

describe('createBlueskyClient のログイン失敗後の待ち時間', () => {
  const setupGuarded = (
    session: BlueskySession | undefined,
    failedAt: Instant | undefined,
    responders: Responder[],
    guarded = true,
  ) => {
    let clock = NOW;
    let failure = failedAt;
    const events: string[] = [];
    const queue = [...responders];
    const calls: Call[] = [];
    const fetchStub = (async (url: string | URL | Request, init?: RequestInit) => {
      const call = { url: String(url), init: init ?? {} };
      calls.push(call);
      const responder = queue.shift();
      if (responder === undefined) throw new Error(`unexpected request: ${call.url}`);
      return responder(call);
    }) as typeof fetch;
    const client = createBlueskyClient({
      identifier: 'iori.example.com',
      appPassword: 'app-pass-secret',
      sessionResolver: { resolve: () => RA.ok(session) },
      sessionStore: { save: () => RA.ok(undefined) },
      ...(guarded
        ? {
          loginFailure: {
            resolver: {
              resolve: () => {
                events.push('read');
                return RA.ok(failure);
              },
            },
            savedStore: {
              save: (at: Instant) => {
                events.push(`write:${at}`);
                failure = at;
                return RA.ok(undefined);
              },
            },
            deletedStore: {
              delete: () => {
                events.push('delete');
                failure = undefined;
                return RA.ok(undefined);
              },
            },
          },
        }
        : {}),
      fetch: fetchStub,
      now: () => clock,
    });
    return {
      client,
      calls,
      events,
      advance: (ms: number) => {
        clock = Instant.orThrow(clock + ms);
      },
    };
  };
  const authError = () => json({ error: 'AuthenticationRequired' }, 401);

  it('createSession が失敗したら現在の時刻を書き、待ち時間のあいだは createSession を呼ばずに auth の失敗を返す', async () => {
    const { client, calls, events, advance } = setupGuarded(undefined, undefined, [authError]);

    const first = await client.query('app.bsky.feed.getTimeline', {});
    advance(BLUESKY_LOGIN_RETRY_COOLDOWN_MS - 1);
    const second = await client.query('app.bsky.feed.getTimeline', {});

    expect(first).toMatchObject({ ok: false, err: { kind: 'auth', status: 401 } });
    expect(second).toMatchObject({ ok: false, err: { kind: 'auth' } });
    expect(calls).toHaveLength(1);
    expect(events).toEqual(['read', `write:${NOW}`, 'read']);
  });

  it('30 分が過ぎたら再び createSession を呼び、成功したら記録を消す', async () => {
    const { client, calls, events, advance } = setupGuarded(undefined, undefined, [
      authError,
      () => json(sessionBody('new', { didDoc: didDoc() })),
      () => json({ feed: [] }),
    ]);

    await client.query('app.bsky.feed.getTimeline', {});
    advance(BLUESKY_LOGIN_RETRY_COOLDOWN_MS);
    const result = await client.query('app.bsky.feed.getTimeline', {});

    expect(result).toEqual({ ok: true, val: { feed: [] } });
    expect(calls.map((call) => call.url)).toEqual([
      'https://bsky.social/xrpc/com.atproto.server.createSession',
      'https://bsky.social/xrpc/com.atproto.server.createSession',
      `${PDS}/xrpc/app.bsky.feed.getTimeline`,
    ]);
    expect(events).toEqual([
      'read',
      `write:${NOW}`,
      'read',
      'delete',
    ]);
  });

  it('30 分が過ぎたあとの createSession が失敗したら、時刻を書き直す', async () => {
    const { client, events, advance } = setupGuarded(undefined, NOW, [authError]);
    advance(BLUESKY_LOGIN_RETRY_COOLDOWN_MS);

    await client.query('app.bsky.feed.getTimeline', {});

    expect(events).toEqual(['read', `write:${NOW + BLUESKY_LOGIN_RETRY_COOLDOWN_MS}`]);
  });

  it('DM の許可が無い Bad token method は chat_not_permitted として返し、再ログインも失敗の記録もしない', async () => {
    const { client, calls, events } = setupGuarded(stored(), undefined, [
      () => json({ error: 'InvalidToken', message: 'Bad token method' }, 400),
    ]);

    const result = await client.chatQuery('chat.bsky.convo.listConvos', {});

    expect(result).toMatchObject({
      ok: false,
      err: { kind: 'chat_not_permitted', status: 400, code: 'InvalidToken' },
    });
    expect(calls).toHaveLength(1);
    expect(events).toEqual([]);
  });

  it('createSession が成功し、記録が無かったときは、読むだけで書き込まない', async () => {
    const { client, events } = setupGuarded(undefined, undefined, [
      () => json(sessionBody('new', { didDoc: didDoc() })),
      () => json({ feed: [] }),
    ]);

    await client.query('app.bsky.feed.getTimeline', {});

    expect(events).toEqual(['read']);
  });

  it('保存済みのセッションが有効なときは、失敗の記録を読まない', async () => {
    const { client, calls, events } = setupGuarded(stored(), undefined, [() => json({ feed: [] })]);

    const result = await client.query('app.bsky.feed.getTimeline', {});

    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(events).toEqual([]);
  });

  it('保存済みのセッションが失効して createSession に進むときは、記録を読む', async () => {
    const { client, calls, events } = setupGuarded(stored(), NOW, [
      () => json({ error: 'ExpiredToken' }, 400),
      () => json({ error: 'ExpiredToken' }, 400),
    ]);

    const result = await client.query('app.bsky.feed.getTimeline', {});

    expect(result).toMatchObject({ ok: false, err: { kind: 'auth' } });
    expect(calls).toHaveLength(2);
    expect(events).toEqual(['read']);
  });

  it('依存を渡さない client は、待ち時間なしで毎回 createSession を呼ぶ', async () => {
    const { client, calls, events } = setupGuarded(undefined, NOW, [authError, authError], false);

    await client.query('app.bsky.feed.getTimeline', {});
    await client.query('app.bsky.feed.getTimeline', {});

    expect(calls.map((call) => call.url)).toEqual([
      'https://bsky.social/xrpc/com.atproto.server.createSession',
      'https://bsky.social/xrpc/com.atproto.server.createSession',
    ]);
    expect(events).toEqual([]);
  });
});

describe('resolveBlueskyPdsUrl', () => {
  it('id が #atproto_pds で終わる service の serviceEndpoint を返す', () => {
    expect(resolveBlueskyPdsUrl(didDoc('https://pds.example.net/'))).toBe('https://pds.example.net');
  });

  it.each([undefined, null, {}, { service: [] }, { service: [{ id: '#atproto_pds', serviceEndpoint: 1 }] }, {
    service: [{ id: '#atproto_pds', serviceEndpoint: 'not a url' }],
  }])('%j では undefined を返す', (value) => {
    expect(resolveBlueskyPdsUrl(value)).toBeUndefined();
  });
});

describe('createBlueskyClient のブックマーク', () => {
  const POST_URI = 'at://did:plc:author/app.bsky.feed.post/3kpost';

  it('createBookmark は app.bsky.bookmark.createBookmark に uri と cid を POST し、空の応答を成功にする', async () => {
    const { client, calls } = setup(stored(), [() => new Response('', { status: 200 })]);

    const result = await client.createBookmark({ uri: POST_URI, cid: 'bafycid' });

    expect(result).toEqual({ ok: true, val: undefined });
    expect(calls[0]?.url).toBe(`${PDS}/xrpc/app.bsky.bookmark.createBookmark`);
    expect(calls[0]?.init.method).toBe('POST');
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({ uri: POST_URI, cid: 'bafycid' });
    expect(header(calls[0]!, 'Authorization')).toBe('Bearer access-old');
    expect(header(calls[0]!, 'atproto-proxy')).toBeUndefined();
  });

  it('deleteBookmark は app.bsky.bookmark.deleteBookmark に uri だけを POST する', async () => {
    const { client, calls } = setup(stored(), [() => json({})]);

    const result = await client.deleteBookmark(POST_URI);

    expect(result.ok).toBe(true);
    expect(calls[0]?.url).toBe(`${PDS}/xrpc/app.bsky.bookmark.deleteBookmark`);
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({ uri: POST_URI });
  });

  it('createBookmark は期限切れの認証を更新してからやり直す', async () => {
    const { client, calls } = setup(stored(), [
      () => json({ error: 'ExpiredToken' }, 400),
      () => json(sessionBody('new')),
      () => json({}),
    ]);

    const result = await client.createBookmark({ uri: POST_URI, cid: 'bafycid' });

    expect(result.ok).toBe(true);
    expect(calls[1]?.url).toBe(`${PDS}/xrpc/com.atproto.server.refreshSession`);
    expect(header(calls[2]!, 'Authorization')).toBe('Bearer access-new');
  });

  it('権限が無い 403 は再ログインせず、status と code を持つ http の失敗で返す', async () => {
    const { client, calls } = setup(stored(), [() => json({ error: 'Forbidden' }, 403)]);

    const result = await client.createBookmark({ uri: POST_URI, cid: 'bafycid' });

    expect(result).toMatchObject({ ok: false, err: { kind: 'http', status: 403, code: 'Forbidden' } });
    expect(calls).toHaveLength(1);
  });

  it('未実装の 501 は http の失敗で返す', async () => {
    const { client } = setup(stored(), [() => json({ error: 'MethodNotImplemented' }, 501)]);

    expect(await client.deleteBookmark(POST_URI)).toMatchObject({
      ok: false,
      err: { kind: 'http', status: 501, code: 'MethodNotImplemented' },
    });
  });

  it('400 InvalidToken の Bad token scope は再ログインせず、message を含む http の失敗で返す', async () => {
    const { client, calls, saved } = setup(stored(), [
      () => json({ error: 'InvalidToken', message: 'Bad token scope' }, 400),
    ]);

    const created = await client.createBookmark({ uri: POST_URI, cid: 'bafycid' });

    expect(created).toMatchObject({
      ok: false,
      err: { kind: 'http', status: 400, code: 'InvalidToken', message: expect.stringContaining('Bad token scope') },
    });
    expect(calls).toHaveLength(1);
    expect(saved).toEqual([]);
  });

  it('deleteBookmark と getBookmarks でも Bad token scope で再ログインしない', async () => {
    const rejected = () => json({ error: 'InvalidToken', message: 'Bad token scope' }, 400);
    const deleting = setup(stored(), [rejected]);
    const listing = setup(stored(), [rejected]);

    const deleted = await deleting.client.deleteBookmark(POST_URI);
    const listed = await listing.client.query('app.bsky.bookmark.getBookmarks', { limit: '30' });

    expect(deleted).toMatchObject({ ok: false, err: { kind: 'http', code: 'InvalidToken' } });
    expect(listed).toMatchObject({ ok: false, err: { kind: 'http', code: 'InvalidToken' } });
    expect(deleting.calls).toHaveLength(1);
    expect(listing.calls).toHaveLength(1);
  });

  it.each([
    ['code の無い 401', {}],
    ['401 Unauthorized', { error: 'Unauthorized' }],
  ])('ブックマークの %s は認証の更新をせず、http の失敗で返す', async (_name, body) => {
    const { client, calls, saved } = setup(stored(), [() => json(body, 401)]);

    const result = await client.createBookmark({ uri: POST_URI, cid: 'bafycid' });

    expect(result).toMatchObject({ ok: false, err: { kind: 'http', status: 401 } });
    expect(calls).toHaveLength(1);
    expect(saved).toEqual([]);
  });

  it('ブックマークの 401 ExpiredToken は、これまでどおり認証を更新してやり直す', async () => {
    const { client, calls } = setup(stored(), [
      () => json({ error: 'ExpiredToken' }, 401),
      () => json(sessionBody('new')),
      () => json({}),
    ]);

    const result = await client.createBookmark({ uri: POST_URI, cid: 'bafycid' });

    expect(result.ok).toBe(true);
    expect(calls[1]?.url).toBe(`${PDS}/xrpc/com.atproto.server.refreshSession`);
    expect(header(calls[2]!, 'Authorization')).toBe('Bearer access-new');
  });

  it('Bad token scope を含まない InvalidToken は、これまでどおり認証の更新をしてやり直す', async () => {
    const { client, calls } = setup(stored(), [
      () => json({ error: 'InvalidToken', message: 'Bad token' }, 400),
      () => json(sessionBody('new')),
      () => json({}),
    ]);

    const result = await client.createBookmark({ uri: POST_URI, cid: 'bafycid' });

    expect(result.ok).toBe(true);
    expect(calls[1]?.url).toBe(`${PDS}/xrpc/com.atproto.server.refreshSession`);
  });

  it('ブックマーク以外の API の Bad token scope は、これまでどおり認証の失敗として更新を試みる', async () => {
    const { client, calls } = setup(stored(), [
      () => json({ error: 'InvalidToken', message: 'Bad token scope' }, 400),
      () => json(sessionBody('new')),
      () => json({}),
    ]);

    const result = await client.muteActor('did:plc:target');

    expect(result.ok).toBe(true);
    expect(calls[1]?.url).toBe(`${PDS}/xrpc/com.atproto.server.refreshSession`);
  });
});
