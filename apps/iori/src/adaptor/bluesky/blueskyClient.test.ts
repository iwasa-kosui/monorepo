import { RA } from '@iwasa-kosui/result';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { BlueskySession } from '../../domain/blueskyCrosspost/blueskyCrosspost.ts';
import type { BlueskyPostRecord } from '../../domain/blueskyCrosspost/blueskyPostRecord.ts';
import { Instant } from '../../domain/instant/instant.ts';
import { createBlueskyClient, resolveBlueskyPdsUrl } from './blueskyClient.ts';

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
