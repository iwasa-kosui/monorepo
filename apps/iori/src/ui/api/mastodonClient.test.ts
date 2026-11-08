import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createStatus,
  deleteStatus,
  failureMessage,
  favourite,
  fetchAccount,
  fetchAccountStatuses,
  fetchBlueskyTimeline,
  fetchFavourites,
  fetchFollowers,
  fetchHomeTimeline,
  fetchNotifications,
  fetchPublicTimeline,
  fetchRelationshipOrSignedOut,
  fetchRelationships,
  fetchStatus,
  fetchStatusContext,
  follow,
  isMastodonApiError,
  isNotFoundError,
  isUnauthorizedError,
  isUnprocessableError,
  lookupAccount,
  mute,
  parseLinkHeader,
  parseRetryAfter,
  react,
  reblog,
  refreshBlueskyTimeline,
  requestDigest,
  saveNotificationsMarker,
  searchAccount,
  searchStatuses,
  summarizeTimeline,
  translate,
  unfavourite,
  unfollow,
  unmute,
  unreact,
  unreblog,
  updateAvatar,
  updateMedia,
  uploadMedia,
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

describe('parseRetryAfter', () => {
  const now = new Date('2026-01-01T00:00:00Z');

  it('reads digits as seconds', () => {
    expect(parseRetryAfter('3600', now)).toBe(3600);
    expect(parseRetryAfter('0', now)).toBe(0);
  });

  it('reads an HTTP date as the seconds from now', () => {
    expect(parseRetryAfter('Thu, 01 Jan 2026 01:00:00 GMT', now)).toBe(3600);
  });

  it('turns an HTTP date in the past into 0', () => {
    expect(parseRetryAfter('Wed, 31 Dec 2025 23:00:00 GMT', now)).toBe(0);
  });

  it('returns undefined for a value that is neither seconds nor an HTTP date', () => {
    for (const value of [null, '', 'abc', '-5', '120abc', '1.5']) {
      expect(parseRetryAfter(value, now)).toBeUndefined();
    }
  });

  it('keeps a huge number of seconds as it is', () => {
    expect(parseRetryAfter('99999999999999999999', now)).toBe(1e20);
  });
});

const jsonResponse = (body: unknown, init: { status?: number; link?: string; retryAfter?: string } = {}) =>
  new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: {
      'Content-Type': 'application/json',
      ...(init.link === undefined ? {} : { Link: init.link }),
      ...(init.retryAfter === undefined ? {} : { 'Retry-After': init.retryAfter }),
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

  it('requests the remote public timeline with max_id and returns the cursors from the Link header', async () => {
    const fetchMock = stubFetch(jsonResponse([{ id: 's1' }], {
      link: '<https://iori.example/api/v1/timelines/public?max_id=r1&remote=true>; rel="next"',
    }));

    const page = await fetchPublicTimeline('remote', { maxId: 'm1' });

    expect(requestedUrl(fetchMock)).toBe('/api/v1/timelines/public?max_id=m1&remote=true');
    expect(page).toEqual({ items: [{ id: 's1' }], nextMaxId: 'r1', prevMinId: undefined });
  });

  it('requests the local public timeline with max_id and returns the cursors from the Link header', async () => {
    const fetchMock = stubFetch(jsonResponse([{ id: 's1' }], {
      link: '<https://iori.example/api/v1/timelines/public?max_id=l1&local=true>; rel="next"',
    }));

    const page = await fetchPublicTimeline('local', { maxId: 'm1' });

    expect(requestedUrl(fetchMock)).toBe('/api/v1/timelines/public?max_id=m1&local=true');
    expect(page).toEqual({ items: [{ id: 's1' }], nextMaxId: 'l1', prevMinId: undefined });
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

  it('creates a status with a same-origin JSON post and returns the created status', async () => {
    const fetchMock = stubFetch(jsonResponse({ id: 's2' }));

    const status = await createStatus({
      status: 'hello',
      in_reply_to_id: 's1',
      media_ids: ['m1', 'm2'],
      content_type: 'text/markdown',
    });

    const [url, init] = (fetchMock.mock.calls as unknown[][])[0] as [string, RequestInit];
    expect(url).toBe('/api/v1/statuses');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('same-origin');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json', Accept: 'application/json' });
    expect(JSON.parse(String(init.body))).toEqual({
      status: 'hello',
      in_reply_to_id: 's1',
      media_ids: ['m1', 'm2'],
      content_type: 'text/markdown',
    });
    expect(status).toEqual({ id: 's2' });
  });

  it('omits the optional fields of a status that is not a reply and has no media', async () => {
    const fetchMock = stubFetch(jsonResponse({ id: 's2' }));

    await createStatus({ status: 'hello', content_type: 'text/markdown' });

    const [, init] = (fetchMock.mock.calls as unknown[][])[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({ status: 'hello', content_type: 'text/markdown' });
  });

  it('throws an unprocessable error carrying the server message when the status is refused', async () => {
    stubFetch(jsonResponse({ error: 'Validation failed: Text can not be blank' }, { status: 422 }));

    const error = await createStatus({ status: '', content_type: 'text/markdown' }).catch((e: unknown) => e);

    expect(isUnprocessableError(error)).toBe(true);
    expect((error as Error).message).toBe('Validation failed: Text can not be blank');
  });

  it('deletes a status by encoded id and returns the deleted status', async () => {
    const fetchMock = stubFetch(jsonResponse({ id: 'a/b', text: 'bye' }));

    const status = await deleteStatus('a/b');

    const [url, init] = (fetchMock.mock.calls as unknown[][])[0] as [string, RequestInit];
    expect(url).toBe('/api/v1/statuses/a%2Fb');
    expect(init.method).toBe('DELETE');
    expect(init.credentials).toBe('same-origin');
    expect(status).toEqual({ id: 'a/b', text: 'bye' });
  });

  it('throws a not found error when the status to delete is missing', async () => {
    stubFetch(jsonResponse({ error: 'Record not found' }, { status: 404 }));

    const error = await deleteStatus('missing').catch((e: unknown) => e);

    expect(isNotFoundError(error)).toBe(true);
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

  it('treats a 422 from relationships as logged in without a relationship', async () => {
    stubFetch(jsonResponse({ error: 'Actor not found' }, { status: 422 }));

    expect(await fetchRelationshipOrSignedOut('a1')).toEqual({ isLoggedIn: true, isFollowing: false, isMuted: false });
  });

  it.each([
    ['favourite', favourite, '/api/v1/statuses/s1/favourite'],
    ['unfavourite', unfavourite, '/api/v1/statuses/s1/unfavourite'],
    ['reblog', reblog, '/api/v1/statuses/s1/reblog'],
    ['unreblog', unreblog, '/api/v1/statuses/s1/unreblog'],
    ['follow', follow, '/api/v1/accounts/s1/follow'],
    ['unfollow', unfollow, '/api/v1/accounts/s1/unfollow'],
    ['mute', mute, '/api/v1/accounts/s1/mute'],
    ['unmute', unmute, '/api/v1/accounts/s1/unmute'],
  ])('posts %s to its path with the same-origin headers and returns the body', async (_name, action, path) => {
    const fetchMock = stubFetch(jsonResponse({ id: 's1' }));

    const body = await action('s1');

    const [url, init] = (fetchMock.mock.calls as unknown[][])[0] as [string, RequestInit];
    expect(url).toBe(path);
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('same-origin');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json', Accept: 'application/json' });
    expect(body).toEqual({ id: 's1' });
  });

  it.each(
    [
      ['react', react, 'PUT'],
      ['unreact', unreact, 'DELETE'],
    ] as const,
  )('sends %s to the reaction path with the encoded id and emoji and returns the status', async (
    _name,
    action,
    method,
  ) => {
    const fetchMock = stubFetch(jsonResponse({ id: 'a/b', iori: { reactions: [], link_previews: [] } }));

    const status = await action('a/b', ':wave:');

    const [url, init] = (fetchMock.mock.calls as unknown[][])[0] as [string, RequestInit];
    expect(url).toBe('/api/iori/v1/statuses/a%2Fb/reactions/%3Awave%3A');
    expect(init.method).toBe(method);
    expect(init.credentials).toBe('same-origin');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json', Accept: 'application/json' });
    expect(status).toEqual({ id: 'a/b', iori: { reactions: [], link_previews: [] } });
  });

  it('throws a not found error carrying the server message when the reaction target is hidden', async () => {
    stubFetch(jsonResponse({ error: 'Record not found' }, { status: 404 }));

    const error = await react('s1', '👍').catch((e: unknown) => e);

    expect(isNotFoundError(error)).toBe(true);
    expect(failureMessage('add reaction', error)).toBe('Failed to add reaction: Record not found');
  });

  it('encodes the id in a write path', async () => {
    const fetchMock = stubFetch(jsonResponse({ id: 'a/b' }));

    await follow('a/b');

    expect(requestedUrl(fetchMock)).toBe('/api/v1/accounts/a%2Fb/follow');
  });

  it('throws an unprocessable error carrying the server message when the reblog is refused', async () => {
    stubFetch(jsonResponse({ error: 'Validation failed: Reblog of this status is not allowed' }, { status: 422 }));

    const error = await reblog('s1').catch((e: unknown) => e);

    expect(isUnprocessableError(error)).toBe(true);
    expect((error as Error).message).toBe('Validation failed: Reblog of this status is not allowed');
    expect(failureMessage('repost', error)).toBe(
      'Failed to repost: Validation failed: Reblog of this status is not allowed',
    );
  });

  it('throws on a failed follow and keeps the generic failure message for a network error', async () => {
    stubFetch(jsonResponse({ error: 'Validation failed: local account' }, { status: 422 }));

    const error = await follow('a1').catch((e: unknown) => e);

    expect(isUnprocessableError(error)).toBe(true);
    expect(failureMessage('follow', new TypeError('Failed to fetch'))).toBe('Failed to follow. Please try again.');
  });

  it('searches an account with resolve=true and returns the first account', async () => {
    const fetchMock = stubFetch(jsonResponse({ accounts: [{ id: 'a1' }, { id: 'a2' }], statuses: [], hashtags: [] }));

    const account = await searchAccount('alice@remote.example');

    expect(requestedUrl(fetchMock)).toBe('/api/v2/search?q=alice%40remote.example&resolve=true&type=accounts');
    expect(account).toEqual({ id: 'a1' });
  });

  it('returns undefined when the search finds no account', async () => {
    stubFetch(jsonResponse({ accounts: [], statuses: [], hashtags: [] }));

    expect(await searchAccount('nobody@remote.example')).toBeUndefined();
  });

  it('does not treat a network failure as an unauthorized error', () => {
    expect(isUnauthorizedError(new TypeError('Failed to fetch'))).toBe(false);
  });

  it('searches statuses with the query and limit through a same-origin GET', async () => {
    const payload = {
      statuses: [],
      terms: { original: ['a'], expanded: [] },
      dropped_original: [],
      expansion: 'skipped',
    };
    const fetchMock = stubFetch(jsonResponse(payload));

    const result = await searchStatuses('猫 犬', 20);

    const [url, init] = (fetchMock.mock.calls as unknown[][])[0] as [string, RequestInit];
    const parsed = new URL(String(url), 'http://localhost');
    expect(parsed.pathname).toBe('/api/iori/v1/search/statuses');
    expect(parsed.searchParams.get('q')).toBe('猫 犬');
    expect(parsed.searchParams.get('limit')).toBe('20');
    expect(init.credentials).toBe('same-origin');
    expect(result).toEqual(payload);
  });

  it('posts the summary request as JSON without authorization headers', async () => {
    const payload = { summary: 'text [1]', citations: [], remaining_today: 19 };
    const fetchMock = stubFetch(jsonResponse(payload));

    const result = await summarizeTimeline({ q: '猫', since: '2026-01-01T00:00:00.000Z' });

    const [url, init] = (fetchMock.mock.calls as unknown[][])[0] as [string, RequestInit];
    expect(url).toBe('/api/iori/v1/timeline/summaries');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('same-origin');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json', Accept: 'application/json' });
    expect(JSON.parse(String(init.body))).toEqual({ q: '猫', since: '2026-01-01T00:00:00.000Z' });
    expect(result).toEqual(payload);
  });

  it('posts the digest request with the session cookie and no body', async () => {
    const payload = { digestId: 'd1', articleId: 'a1', digestDate: '2026-11-05', replaced: false };
    const fetchMock = stubFetch(jsonResponse(payload, { status: 201 }));

    const result = await requestDigest();

    const [url, init] = (fetchMock.mock.calls as unknown[][])[0] as [string, RequestInit];
    expect(url).toBe('/api/iori/v1/digests');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('same-origin');
    expect(init.body).toBeUndefined();
    expect(result).toEqual(payload);
  });

  it('carries the status, the error and Retry-After on a failed digest request', async () => {
    stubFetch(jsonResponse({ error: 'Digest request too soon' }, { status: 409, retryAfter: '45' }));

    const error = await requestDigest().catch((e: unknown) => e);

    expect(isMastodonApiError(error) && error.status).toBe(409);
    expect(isMastodonApiError(error) && error.message).toBe('Digest request too soon');
    expect(isMastodonApiError(error) && error.retryAfterSeconds).toBe(45);
  });

  it('fetches the Bluesky timeline with the paging query', async () => {
    const payload = { enabled: true, items: [], nextBefore: null };
    const fetchMock = stubFetch(jsonResponse(payload));

    const result = await fetchBlueskyTimeline({ before: 1_700_000_000_000, limit: 20 });

    const [url, init] = (fetchMock.mock.calls as unknown[][])[0] as [string, RequestInit];
    expect(url).toBe('/api/iori/v1/bluesky/timeline?before=1700000000000&limit=20');
    expect(init.credentials).toBe('same-origin');
    expect(result).toEqual(payload);
  });

  it('sends beforeId with before when paging the Bluesky timeline', async () => {
    const fetchMock = stubFetch(jsonResponse({ enabled: true, items: [], nextBefore: null, nextBeforeId: null }));

    await fetchBlueskyTimeline({
      before: 1_700_000_000_000,
      beforeId: 'at://did:plc:a/app.bsky.feed.post/1#repost:did:plc:b',
    });

    expect((fetchMock.mock.calls as unknown[][])[0]![0]).toBe(
      '/api/iori/v1/bluesky/timeline?before=1700000000000&beforeId=at%3A%2F%2Fdid%3Aplc%3Aa%2Fapp.bsky.feed.post%2F1%23repost%3Adid%3Aplc%3Ab',
    );
  });

  it('fetches the first page of the Bluesky timeline without a query', async () => {
    const fetchMock = stubFetch(jsonResponse({ enabled: false, items: [], nextBefore: null }));

    await fetchBlueskyTimeline();

    expect((fetchMock.mock.calls as unknown[][])[0]![0]).toBe('/api/iori/v1/bluesky/timeline');
  });

  it('posts a Bluesky timeline refresh and returns the counts', async () => {
    const payload = { pages: 1, fetched: 3, saved: 2, dropped: 0 };
    const fetchMock = stubFetch(jsonResponse(payload));

    const result = await refreshBlueskyTimeline();

    const [url, init] = (fetchMock.mock.calls as unknown[][])[0] as [string, RequestInit];
    expect(url).toBe('/api/iori/v1/bluesky/timeline/refresh');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('same-origin');
    expect(result).toEqual(payload);
  });

  it('carries the status of a refresh rejected because the import is disabled', async () => {
    stubFetch(jsonResponse({ error: 'Bluesky timeline is disabled' }, { status: 409 }));

    const error = await refreshBlueskyTimeline().catch((e: unknown) => e);

    expect(isMastodonApiError(error) && error.status).toBe(409);
  });

  it('posts a translate request for the status and returns the Translation', async () => {
    const payload = {
      content: '<p>こんにちは</p>',
      spoiler_text: '',
      language: 'ja',
      detected_source_language: 'en',
      provider: 'Workers AI (Llama 4 Scout)',
      media_attachments: [],
      poll: null,
    };
    const fetchMock = stubFetch(jsonResponse(payload));

    const result = await translate('post/1');

    const [url, init] = (fetchMock.mock.calls as unknown[][])[0] as [string, RequestInit];
    expect(url).toBe('/api/v1/statuses/post%2F1/translate');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('same-origin');
    expect(result).toEqual(payload);
  });

  it('carries the status of a failed translate request', async () => {
    stubFetch(jsonResponse({ error: 'Service Unavailable' }, { status: 503 }));

    const error = await translate('post-1').catch((e: unknown) => e);

    expect(isMastodonApiError(error) && error.status).toBe(503);
  });

  it('carries Retry-After on a 429 from the summary request', async () => {
    stubFetch(jsonResponse({ error: 'limit' }, { status: 429, retryAfter: '3600' }));

    const error = await summarizeTimeline({ q: '猫' }).catch((e: unknown) => e);

    expect(isMastodonApiError(error) && error.status).toBe(429);
    expect(isMastodonApiError(error) && error.retryAfterSeconds).toBe(3600);
  });

  it('leaves retryAfterSeconds unset when Retry-After is not readable', async () => {
    for (const retryAfter of ['abc', '-5', '120abc', '']) {
      stubFetch(jsonResponse({ error: 'limit' }, { status: 429, retryAfter }));

      const error = await summarizeTimeline({ q: '猫' }).catch((e: unknown) => e);

      expect(isMastodonApiError(error) && error.retryAfterSeconds).toBeUndefined();
    }
  });

  it('carries a huge Retry-After as it is', async () => {
    stubFetch(jsonResponse({ error: 'limit' }, { status: 429, retryAfter: '99999999999999999999' }));

    const error = await summarizeTimeline({ q: '猫' }).catch((e: unknown) => e);

    expect(isMastodonApiError(error) && error.retryAfterSeconds).toBe(1e20);
  });

  it('leaves retryAfterSeconds unset when Retry-After is absent', async () => {
    stubFetch(jsonResponse({ error: 'bad gateway' }, { status: 502 }));

    const error = await summarizeTimeline({ q: '猫' }).catch((e: unknown) => e);

    expect(isMastodonApiError(error) && error.retryAfterSeconds).toBeUndefined();
  });

  it('rejects the summary request with an unauthorized error on 401', async () => {
    stubFetch(jsonResponse({ error: 'The access token is invalid' }, { status: 401 }));

    const error = await summarizeTimeline({ q: '猫' }).catch((e: unknown) => e);

    expect(isUnauthorizedError(error)).toBe(true);
  });
});

describe('mastodon client media and avatar writes', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const callOf = (fetchMock: ReturnType<typeof stubFetch>) =>
    (fetchMock.mock.calls as unknown[][])[0] as [string, RequestInit];
  const image = () => new File([new Uint8Array([1, 2, 3])], 'photo.png', { type: 'image/png' });
  const attachment = { id: 'm1', type: 'image', url: 'https://iori.example/uploads/m1.png' };

  it('uploads a file to /api/v2/media as same-origin multipart without a Content-Type header', async () => {
    const fetchMock = stubFetch(jsonResponse(attachment));
    const file = image();

    const media = await uploadMedia(file);

    const [url, init] = callOf(fetchMock);
    expect(url).toBe('/api/v2/media');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('same-origin');
    expect(init.headers).toEqual({ Accept: 'application/json' });
    const body = init.body as FormData;
    expect(body.get('file')).toBe(file);
    expect(body.has('description')).toBe(false);
    expect(media).toEqual(attachment);
  });

  it('sends the description when uploading with one', async () => {
    const fetchMock = stubFetch(jsonResponse(attachment));

    await uploadMedia(image(), '猫の写真');

    expect((callOf(fetchMock)[1].body as FormData).get('description')).toBe('猫の写真');
  });

  it('rejects an upload with the server message', async () => {
    stubFetch(jsonResponse({ error: 'Validation failed: The file is too large. Max size: 5MB' }, { status: 422 }));

    const error = await uploadMedia(image()).catch((e: unknown) => e);

    expect(isUnprocessableError(error)).toBe(true);
    expect((error as Error).message).toBe('Validation failed: The file is too large. Max size: 5MB');
  });

  it('updates the media description with a same-origin PUT', async () => {
    const fetchMock = stubFetch(jsonResponse({ ...attachment, description: '犬' }));

    const media = await updateMedia('m 1', '犬');

    const [url, init] = callOf(fetchMock);
    expect(url).toBe('/api/v1/media/m%201');
    expect(init.method).toBe('PUT');
    expect(init.credentials).toBe('same-origin');
    expect((init.body as FormData).get('description')).toBe('犬');
    expect(media.description).toBe('犬');
  });

  it('rejects a media update for a missing media as not found', async () => {
    stubFetch(jsonResponse({ error: 'Record not found' }, { status: 404 }));

    expect(isNotFoundError(await updateMedia('missing', 'x').catch((e: unknown) => e))).toBe(true);
  });

  it('sends the avatar to update_credentials with a same-origin PATCH and returns the account', async () => {
    const account = { id: 'a1', username: 'kosui', avatar: 'https://iori.example/uploads/a.png' };
    const fetchMock = stubFetch(jsonResponse(account));
    const file = image();

    const result = await updateAvatar(file);

    const [url, init] = callOf(fetchMock);
    expect(url).toBe('/api/v1/accounts/update_credentials');
    expect(init.method).toBe('PATCH');
    expect(init.credentials).toBe('same-origin');
    expect(init.headers).toEqual({ Accept: 'application/json' });
    expect((init.body as FormData).get('avatar')).toBe(file);
    expect(result).toEqual(account);
  });

  it('rejects an avatar update with the server message', async () => {
    stubFetch(
      jsonResponse({ error: 'Validation failed: Unsupported file type. Allowed: JPEG, PNG, GIF, WebP' }, {
        status: 422,
      }),
    );

    const error = await updateAvatar(image()).catch((e: unknown) => e);

    expect((error as Error).message).toBe('Validation failed: Unsupported file type. Allowed: JPEG, PNG, GIF, WebP');
  });
});
