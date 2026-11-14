import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import type { Instant } from '../../domain/instant/instant.ts';
import { createBlueskyClient, createBlueskyCredentialVerifier } from './blueskyClient.ts';

const NOW = 1_800_000_000_000 as Instant;
const sessionBody = {
  did: 'did:plc:alice',
  handle: 'alice.bsky.social',
  accessJwt: 'access',
  refreshJwt: 'refresh',
  didDoc: {
    service: [{ id: '#atproto_pds', type: 'AtprotoPersonalDataServer', serviceEndpoint: 'https://pds.example' }],
  },
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('createBlueskyCredentialVerifier', () => {
  it('createSession に識別子とアプリパスワードを送り、PDS の URL を含むセッションを返す', async () => {
    const fetchMock = vi.fn(async () => json(sessionBody));
    const verifier = createBlueskyCredentialVerifier({ fetch: fetchMock as unknown as typeof fetch, now: () => NOW });

    const result = await verifier.login({ identifier: 'alice.bsky.social', appPassword: 'abcd-efgh' });

    expect(result).toEqual({
      ok: true,
      val: {
        did: 'did:plc:alice',
        handle: 'alice.bsky.social',
        pdsUrl: 'https://pds.example',
        accessJwt: 'access',
        refreshJwt: 'refresh',
        updatedAt: NOW,
      },
    });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://bsky.social/xrpc/com.atproto.server.createSession');
    expect(JSON.parse(init.body as string)).toEqual({ identifier: 'alice.bsky.social', password: 'abcd-efgh' });
  });

  it('ログインに失敗したら auth のエラーを返す', async () => {
    const verifier = createBlueskyCredentialVerifier({
      fetch: (async () => json({ error: 'AuthenticationRequired' }, 401)) as unknown as typeof fetch,
    });

    const result = await verifier.login({ identifier: 'alice.bsky.social', appPassword: 'wrong' });

    expect(result).toMatchObject({ ok: false, err: { kind: 'auth', status: 401 } });
  });

  it('DM の確認は chat の proxy 経由で listConvos を呼び、成功なら true を返す', async () => {
    const fetchMock = vi.fn(async () => json({ convos: [] }));
    const verifier = createBlueskyCredentialVerifier({ fetch: fetchMock as unknown as typeof fetch });
    const session = { ...sessionBody, pdsUrl: 'https://pds.example', updatedAt: NOW };

    expect(await verifier.probeChat(session)).toBe(true);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://pds.example/xrpc/chat.bsky.convo.listConvos?limit=1');
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer access',
      'atproto-proxy': 'did:web:api.bsky.chat#bsky_chat',
    });
  });

  it('DM の確認で 400 InvalidToken なら false、ほかの失敗なら null を返す', async () => {
    const session = { ...sessionBody, pdsUrl: 'https://pds.example', updatedAt: NOW };
    const notPermitted = createBlueskyCredentialVerifier({
      fetch: (async () => json({ error: 'InvalidToken' }, 400)) as unknown as typeof fetch,
    });
    const unavailable = createBlueskyCredentialVerifier({
      fetch: (async () => json({ error: 'InternalServerError' }, 500)) as unknown as typeof fetch,
    });
    const offline = createBlueskyCredentialVerifier({
      fetch: (async () => {
        throw new Error('offline');
      }) as unknown as typeof fetch,
    });

    expect(await notPermitted.probeChat(session)).toBe(false);
    expect(await unavailable.probeChat(session)).toBeNull();
    expect(await offline.probeChat(session)).toBeNull();
  });
});

describe('createBlueskyCredentialVerifier の logout', () => {
  const session = { ...sessionBody, pdsUrl: 'https://pds.example', updatedAt: NOW };

  it('deleteSession を、セッションの refreshJwt を Bearer にして pdsUrl に POST する', async () => {
    const fetchMock = vi.fn(async () => json({}));
    const verifier = createBlueskyCredentialVerifier({ fetch: fetchMock as unknown as typeof fetch });

    await verifier.logout(session);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://pds.example/xrpc/com.atproto.server.deleteSession');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ Authorization: 'Bearer refresh' });
  });

  it('通信やサーバーが失敗しても例外にしない', async () => {
    const failing = createBlueskyCredentialVerifier({
      fetch: (async () => json({ error: 'ExpiredToken' }, 400)) as unknown as typeof fetch,
    });
    const offline = createBlueskyCredentialVerifier({
      fetch: (async () => {
        throw new Error('offline');
      }) as unknown as typeof fetch,
    });

    await expect(failing.logout(session)).resolves.toBeUndefined();
    await expect(offline.logout(session)).resolves.toBeUndefined();
  });
});

describe('createBlueskyClient の資格情報の解決', () => {
  const sessionStore = { save: vi.fn(() => RA.ok(undefined)) };

  it('資格情報が無ければ通信せず、not_configured の auth エラーにする', async () => {
    const fetchMock = vi.fn();
    const client = createBlueskyClient({
      resolveCredentials: async () => undefined,
      sessionResolver: { resolve: () => RA.ok(undefined) },
      sessionStore,
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(await client.viewerDid()).toMatchObject({ ok: false, err: { kind: 'auth', code: 'not_configured' } });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
