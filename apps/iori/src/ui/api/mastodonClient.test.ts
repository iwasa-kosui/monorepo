import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  blueskyFailureMessage,
  failureMessage,
  fetchHomeTimeline,
  fetchRelationshipOrSignedOut,
  fetchStatus,
  follow,
  isMastodonApiError,
  isNotFoundError,
  isUnauthorizedError,
  isUnprocessableError,
  likeBlueskyPost,
  parseLinkHeader,
  parseRetryAfter,
  quoteBlueskyPost,
  reblog,
  replyToBlueskyPost,
  replyToBlueskyPostByUri,
  searchAccount,
  summarizeTimeline,
  updateProfile,
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

  it('reads the code from the error body and leaves it out when the body has none', async () => {
    stubFetch(jsonResponse({ error: 'Bluesky authentication failed', code: 'auth' }, { status: 502 }));
    const withCode = await fetchStatus('s1').catch((e: unknown) => e);
    stubFetch(jsonResponse({ error: 'Not found' }, { status: 404 }));
    const withoutCode = await fetchStatus('s1').catch((e: unknown) => e);

    expect((withCode as { code?: string }).code).toBe('auth');
    expect('code' in (withoutCode as object)).toBe(false);
  });

  it('treats a 422 from relationships as logged in without a relationship', async () => {
    stubFetch(jsonResponse({ error: 'Actor not found' }, { status: 422 }));

    expect(await fetchRelationshipOrSignedOut('a1')).toEqual({
      isLoggedIn: true,
      isFollowing: false,
      isMuted: false,
      isBlocked: false,
    });
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

  it('returns the first account the search finds', async () => {
    stubFetch(jsonResponse({ accounts: [{ id: 'a1' }, { id: 'a2' }], statuses: [], hashtags: [] }));

    const account = await searchAccount('alice@remote.example');

    expect(account).toEqual({ id: 'a1' });
  });

  it('returns undefined when the search finds no account', async () => {
    stubFetch(jsonResponse({ accounts: [], statuses: [], hashtags: [] }));

    expect(await searchAccount('nobody@remote.example')).toBeUndefined();
  });

  it('does not treat a network failure as an unauthorized error', () => {
    expect(isUnauthorizedError(new TypeError('Failed to fetch'))).toBe(false);
  });

  it('uses the login message for a Bluesky like that failed to log in, and keeps the generic message otherwise', async () => {
    stubFetch(jsonResponse({ error: 'Bluesky login failed' }, { status: 502 }));

    const loginError = await likeBlueskyPost('x').catch((e: unknown) => e);
    stubFetch(jsonResponse({ error: 'Bluesky request failed' }, { status: 502 }));
    const requestError = await likeBlueskyPost('x').catch((e: unknown) => e);

    expect(blueskyFailureMessage('like', loginError)).toBe('Bluesky にログインできないため、操作できませんでした。');
    expect(blueskyFailureMessage('like', requestError)).toBe('Failed to like: Bluesky request failed');
    expect(blueskyFailureMessage('like', new TypeError('Failed to fetch'))).toBe('Failed to like. Please try again.');
  });

  it.each([
    ['quote', () => quoteBlueskyPost('at://x', 't', []), { uri: 'at://x', text: 't' }],
    ['reply by feed item', () => replyToBlueskyPost('f1', 't', []), { feedItemId: 'f1', text: 't' }],
    ['reply by uri', () => replyToBlueskyPostByUri('at://x', 't'), { uri: 'at://x', text: 't' }],
  ])('omits media_ids from a Bluesky %s without images', async (_name, send, base) => {
    const fetchMock = stubFetch(jsonResponse({ uri: 'at://me/1', cid: 'bafy' }, { status: 201 }));

    await send();

    const [, init] = (fetchMock.mock.calls as unknown[][])[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual(base);
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

  it('sends display_name and note, including empty strings, and omits the avatar when none is chosen', async () => {
    const fetchMock = stubFetch(jsonResponse({ id: 'a1' }));

    await updateProfile({ displayName: '岩佐', note: '', avatar: undefined });

    const [, init] = callOf(fetchMock);
    const body = init.body as FormData;
    expect(body.get('display_name')).toBe('岩佐');
    expect(body.get('note')).toBe('');
    expect(body.has('avatar')).toBe(false);
  });
});
