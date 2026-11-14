import { afterEach, describe, expect, it, vi } from 'vitest';

import { addRelay, fetchRelays, fetchRelaysOrThrow, relayHost } from './relays.ts';

const stubFetch = (response: Response | Error) =>
  vi.stubGlobal('fetch', vi.fn(() => response instanceof Error ? Promise.reject(response) : Promise.resolve(response)));

afterEach(() => vi.unstubAllGlobals());

describe('fetchRelays', () => {
  it('returns no relays when the response is not ok', async () => {
    stubFetch(new Response('{}', { status: 500 }));

    expect(await fetchRelays()).toEqual([]);
  });
});

describe('fetchRelaysOrThrow', () => {
  it('rejects when the response is not ok', async () => {
    stubFetch(new Response('{}', { status: 500 }));

    await expect(fetchRelaysOrThrow()).rejects.toThrow('HTTP 500');
  });
});

describe('addRelay', () => {
  it('reports success when the relay is accepted', async () => {
    stubFetch(Response.json({}, { status: 201 }));

    expect(await addRelay('https://relay.example/actor')).toEqual({ ok: true });
  });

  it('does not show the error body from the server', async () => {
    stubFetch(Response.json({ error: 'Already subscribed' }, { status: 409 }));

    expect(await addRelay('https://relay.example/actor')).toEqual({
      ok: false,
      message: 'リレーを追加できませんでした',
    });
  });

  it('reports a malformed URL when the response is 422', async () => {
    stubFetch(Response.json({ error: 'Invalid URL' }, { status: 422 }));

    expect(await addRelay('not a url')).toEqual({ ok: false, message: 'URL の形式が正しくありません' });
  });

  it('reports a network error when the request fails', async () => {
    stubFetch(new TypeError('offline'));

    expect(await addRelay('https://relay.example/actor')).toEqual({
      ok: false,
      message: '通信に失敗しました。もう一度お試しください',
    });
  });
});

describe('relayHost', () => {
  it('returns the host of the actor URI', () => {
    expect(relayHost({ relayId: 'r1', actorUri: 'https://relay.example/actor', status: 'accepted' })).toBe(
      'relay.example',
    );
  });

  it('returns the raw value when the actor URI is not a URL', () => {
    expect(relayHost({ relayId: 'r1', actorUri: 'not a url', status: 'pending' })).toBe('not a url');
  });
});
