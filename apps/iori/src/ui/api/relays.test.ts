import { afterEach, describe, expect, it, vi } from 'vitest';

import { addRelay, fetchRelays, relayHost } from './relays.ts';

const stubFetch = (response: Response | Error) =>
  vi.stubGlobal('fetch', vi.fn(() => response instanceof Error ? Promise.reject(response) : Promise.resolve(response)));

afterEach(() => vi.unstubAllGlobals());

describe('fetchRelays', () => {
  it('returns the relays from the response', async () => {
    const relays = [{ relayId: 'r1', actorUri: 'https://relay.example/actor', status: 'accepted' }];
    stubFetch(Response.json({ relays }));

    expect(await fetchRelays()).toEqual(relays);
  });

  it('returns no relays when the response is not ok', async () => {
    stubFetch(new Response('{}', { status: 500 }));

    expect(await fetchRelays()).toEqual([]);
  });
});

describe('addRelay', () => {
  it('reports success when the relay is accepted', async () => {
    stubFetch(Response.json({}, { status: 201 }));

    expect(await addRelay('https://relay.example/actor')).toEqual({ ok: true });
  });

  it('returns the error message from the response', async () => {
    stubFetch(Response.json({ error: 'Already subscribed' }, { status: 409 }));

    expect(await addRelay('https://relay.example/actor')).toEqual({ ok: false, message: 'Already subscribed' });
  });

  it('falls back to a default message when the response has no error', async () => {
    stubFetch(Response.json({}, { status: 500 }));

    expect(await addRelay('https://relay.example/actor')).toEqual({
      ok: false,
      message: 'Failed to subscribe to relay',
    });
  });

  it('reports a network error when the request fails', async () => {
    stubFetch(new TypeError('offline'));

    expect(await addRelay('https://relay.example/actor')).toEqual({
      ok: false,
      message: 'Network error. Please try again.',
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
