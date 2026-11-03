import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  fetchAccount,
  fetchAccountStatuses,
  fetchFavourites,
  fetchFollowers,
  fetchHomeTimeline,
  fetchNotifications,
  fetchPublicTimeline,
  fetchRelationships,
  fetchStatus,
  fetchStatusContext,
  isNotFoundError,
  isUnauthorizedError,
  lookupAccount,
  parseLinkHeader,
  saveNotificationsMarker,
} from './mastodonClient.ts';

describe('parseLinkHeader', () => {
  it('reads max_id from next and min_id from prev', () => {
    const header = '<https://iori.example/api/v1/timelines/home?max_id=aaa>; rel="next", '
      + '<https://iori.example/api/v1/timelines/home?min_id=bbb>; rel="prev"';

    expect(parseLinkHeader(header)).toEqual({ nextMaxId: 'aaa', prevMinId: 'bbb' });
  });

  it('reads the cursors regardless of the order of the links', () => {
    const header = '<https://iori.example/x?min_id=bbb>; rel="prev", <https://iori.example/x?max_id=aaa>; rel="next"';

    expect(parseLinkHeader(header)).toEqual({ nextMaxId: 'aaa', prevMinId: 'bbb' });
  });

  it('returns undefined for the missing links', () => {
    expect(parseLinkHeader('<https://iori.example/x?max_id=aaa>; rel="next"')).toEqual({
      nextMaxId: 'aaa',
      prevMinId: undefined,
    });
    expect(parseLinkHeader('<https://iori.example/x?min_id=bbb>; rel="prev"')).toEqual({
      nextMaxId: undefined,
      prevMinId: 'bbb',
    });
  });

  it('returns undefined cursors when the header is absent or empty', () => {
    expect(parseLinkHeader(null)).toEqual({ nextMaxId: undefined, prevMinId: undefined });
    expect(parseLinkHeader('')).toEqual({ nextMaxId: undefined, prevMinId: undefined });
  });

  it('keeps the other query parameters out of the cursor', () => {
    const header = '<https://iori.example/x?local=true&limit=20&max_id=a-b_c>; rel="next"';

    expect(parseLinkHeader(header).nextMaxId).toBe('a-b_c');
  });

  it('decodes a percent-encoded cursor', () => {
    const header = '<https://iori.example/x?max_id=a%3Ab>; rel="next"';

    expect(parseLinkHeader(header).nextMaxId).toBe('a:b');
  });

  it('accepts a relative url and an unquoted rel', () => {
    expect(parseLinkHeader('</api/v1/timelines/home?max_id=aaa>; rel=next').nextMaxId).toBe('aaa');
  });

  it('ignores a next link without max_id', () => {
    expect(parseLinkHeader('<https://iori.example/x>; rel="next"').nextMaxId).toBeUndefined();
  });

  it('ignores links with an unknown rel', () => {
    expect(parseLinkHeader('<https://iori.example/x?max_id=aaa>; rel="last"')).toEqual({
      nextMaxId: undefined,
      prevMinId: undefined,
    });
  });
});

const jsonResponse = (body: unknown, init: { status?: number; link?: string } = {}) =>
  new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: {
      'Content-Type': 'application/json',
      ...(init.link === undefined ? {} : { Link: init.link }),
    },
  });

const stubFetch = (response: Response) => {
  const fetchMock = vi.fn(() => Promise.resolve(response));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

const requestedUrl = (fetchMock: ReturnType<typeof stubFetch>) => (fetchMock.mock.calls as unknown[][])[0]?.[0];

describe('mastodon client requests', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('requests the home timeline with max_id and returns the cursors from the Link header', async () => {
    const fetchMock = stubFetch(jsonResponse([{ id: 's1' }], {
      link: '<https://iori.example/api/v1/timelines/home?max_id=s1>; rel="next", '
        + '<https://iori.example/api/v1/timelines/home?min_id=s1>; rel="prev"',
    }));

    const page = await fetchHomeTimeline({ maxId: 'm1', limit: 20 });

    expect(requestedUrl(fetchMock)).toBe('/api/v1/timelines/home?max_id=m1&limit=20');
    expect(page).toEqual({ items: [{ id: 's1' }], nextMaxId: 's1', prevMinId: 's1' });
  });

  it('requests the home timeline without a query when no parameter is given', async () => {
    const fetchMock = stubFetch(jsonResponse([]));

    const page = await fetchHomeTimeline();

    expect(requestedUrl(fetchMock)).toBe('/api/v1/timelines/home');
    expect(page).toEqual({ items: [], nextMaxId: undefined, prevMinId: undefined });
  });

  it('requests the local and remote public timelines with the matching flag', async () => {
    const localMock = stubFetch(jsonResponse([]));
    await fetchPublicTimeline('local');
    expect(requestedUrl(localMock)).toBe('/api/v1/timelines/public?local=true');

    const remoteMock = stubFetch(jsonResponse([]));
    await fetchPublicTimeline('remote', { maxId: 'm1' });
    expect(requestedUrl(remoteMock)).toBe('/api/v1/timelines/public?max_id=m1&remote=true');
  });

  it('requests a status and its context by encoded id', async () => {
    const statusMock = stubFetch(jsonResponse({ id: 'a/b' }));
    await fetchStatus('a/b');
    expect(requestedUrl(statusMock)).toBe('/api/v1/statuses/a%2Fb');

    const contextMock = stubFetch(jsonResponse({ ancestors: [], descendants: [] }));
    await fetchStatusContext('s1');
    expect(requestedUrl(contextMock)).toBe('/api/v1/statuses/s1/context');
  });

  it('requests followers with a limit', async () => {
    const fetchMock = stubFetch(jsonResponse([]));

    await fetchFollowers('actor-1', { limit: 80 });

    expect(requestedUrl(fetchMock)).toBe('/api/v1/accounts/actor-1/followers?limit=80');
  });

  it('looks up an account by acct with the query encoded', async () => {
    const fetchMock = stubFetch(jsonResponse({ id: 'a1' }));

    const account = await lookupAccount('alice@remote.example');

    expect(requestedUrl(fetchMock)).toBe('/api/v1/accounts/lookup?acct=alice%40remote.example');
    expect(account).toEqual({ id: 'a1' });
  });

  it('requests an account by encoded id', async () => {
    const fetchMock = stubFetch(jsonResponse({ id: 'a/b' }));

    await fetchAccount('a/b');

    expect(requestedUrl(fetchMock)).toBe('/api/v1/accounts/a%2Fb');
  });

  it('requests account statuses with exclude_reblogs and max_id, and returns the cursors', async () => {
    const fetchMock = stubFetch(jsonResponse([{ id: 's1' }], {
      link: '<https://iori.example/api/v1/accounts/a1/statuses?max_id=s1>; rel="next"',
    }));

    const page = await fetchAccountStatuses('a1', { maxId: 'm1', excludeReblogs: true });

    expect(requestedUrl(fetchMock)).toBe('/api/v1/accounts/a1/statuses?max_id=m1&exclude_reblogs=true');
    expect(page).toEqual({ items: [{ id: 's1' }], nextMaxId: 's1', prevMinId: undefined });
  });

  it('requests account statuses without a query when no parameter is given', async () => {
    const fetchMock = stubFetch(jsonResponse([]));

    await fetchAccountStatuses('a1');

    expect(requestedUrl(fetchMock)).toBe('/api/v1/accounts/a1/statuses');
  });

  it('requests relationships with the repeated id[]', async () => {
    const fetchMock = stubFetch(jsonResponse([{ id: 'a1', following: true }]));

    const relationships = await fetchRelationships(['a1', 'a2']);

    expect(decodeURIComponent(String(requestedUrl(fetchMock)))).toBe(
      '/api/v1/accounts/relationships?id[]=a1&id[]=a2',
    );
    expect(relationships).toEqual([{ id: 'a1', following: true }]);
  });

  it('throws an unauthorized error when the relationships are requested while signed out', async () => {
    stubFetch(jsonResponse({ error: 'The access token is invalid' }, { status: 401 }));

    const error = await fetchRelationships(['a1']).catch((e: unknown) => e);

    expect(isUnauthorizedError(error)).toBe(true);
  });

  it('requests favourites with max_id and returns the cursors from the Link header', async () => {
    const fetchMock = stubFetch(jsonResponse([{ id: 's1' }], {
      link: '<https://iori.example/api/v1/favourites?max_id=f1>; rel="next"',
    }));

    const page = await fetchFavourites({ maxId: 'm1' });

    expect(requestedUrl(fetchMock)).toBe('/api/v1/favourites?max_id=m1');
    expect(page).toEqual({ items: [{ id: 's1' }], nextMaxId: 'f1', prevMinId: undefined });
  });

  it('requests notifications with the repeated types[] and max_id, and returns the cursors', async () => {
    const fetchMock = stubFetch(jsonResponse([{ id: 'n1' }], {
      link: '<https://iori.example/api/v1/notifications?max_id=n1>; rel="next"',
    }));

    const page = await fetchNotifications(['favourite', 'iori:emoji_reaction'], { maxId: 'm1' });

    expect(decodeURIComponent(String(requestedUrl(fetchMock)))).toBe(
      '/api/v1/notifications?max_id=m1&types[]=favourite&types[]=iori:emoji_reaction',
    );
    expect(page).toEqual({ items: [{ id: 'n1' }], nextMaxId: 'n1', prevMinId: undefined });
  });

  it('saves the notifications marker with a same-origin JSON post', async () => {
    const fetchMock = stubFetch(jsonResponse({}));

    await saveNotificationsMarker('n9');

    const [url, init] = (fetchMock.mock.calls as unknown[][])[0] as [string, RequestInit];
    expect(url).toBe('/api/v1/markers');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('same-origin');
    expect(JSON.parse(String(init.body))).toEqual({ notifications: { last_read_id: 'n9' } });
  });

  it('rejects when saving the marker fails', async () => {
    stubFetch(jsonResponse({ error: 'The access token is invalid' }, { status: 401 }));

    const error = await saveNotificationsMarker('n9').catch((e: unknown) => e);

    expect(isUnauthorizedError(error)).toBe(true);
  });

  it('throws an unauthorized error carrying the server message on 401', async () => {
    stubFetch(jsonResponse({ error: 'The access token is invalid' }, { status: 401 }));

    const error = await fetchHomeTimeline().catch((e: unknown) => e);

    expect(isUnauthorizedError(error)).toBe(true);
    expect(isNotFoundError(error)).toBe(false);
    expect((error as Error).message).toBe('The access token is invalid');
  });

  it('throws a not found error on 404 and falls back to the status code when the body is not JSON', async () => {
    stubFetch(new Response('not json', { status: 404 }));

    const error = await fetchStatus('missing').catch((e: unknown) => e);

    expect(isNotFoundError(error)).toBe(true);
    expect((error as Error).message).toBe('HTTP 404');
  });

  it('does not treat a network failure as an unauthorized error', () => {
    expect(isUnauthorizedError(new TypeError('Failed to fetch'))).toBe(false);
  });
});
