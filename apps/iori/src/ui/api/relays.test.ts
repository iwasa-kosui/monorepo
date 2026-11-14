import { afterEach, describe, expect, it, vi } from 'vitest';

import { addRelay, fetchRelays, relayHost } from './relays.ts';

const stubFetch = (response: Response | Error) =>
  vi.stubGlobal('fetch', vi.fn(() => response instanceof Error ? Promise.reject(response) : Promise.resolve(response)));

afterEach(() => vi.unstubAllGlobals());

describe('fetchRelays', () => {
  it('returns no relays when the response is not ok', async () => {
    stubFetch(new Response('{}', { status: 500 }));

    expect(await fetchRelays()).toEqual([]);
  });
});

describe('addRelay', () => {
  it('does not show the error body from the server', async () => {
    stubFetch(Response.json({ error: 'Already subscribed' }, { status: 409 }));

    expect(await addRelay('https://relay.example/actor')).toEqual({
      ok: false,
      message: 'リレーを追加できませんでした',
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
