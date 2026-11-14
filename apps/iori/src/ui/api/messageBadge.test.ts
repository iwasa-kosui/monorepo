import { describe, expect, it, vi } from 'vitest';

import {
  combineUnreadMessages,
  fetchUnreadMessageCount,
  initialMessagePolling,
  nextMessagePolling,
  pollUnreadMessages,
} from './messageBadge.ts';

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const BLUESKY_URL = '/api/iori/v1/bluesky/chat/unread_count';
const FEDIVERSE_URL = '/api/iori/v1/fediverse/conversations/unread_count';

const fetcherOf = (responses: Readonly<Record<string, () => Promise<Response>>>) =>
  vi.fn((input: RequestInfo | URL) => {
    const respond = responses[String(input)];
    if (respond === undefined) throw new Error(`unexpected url: ${String(input)}`);
    return respond();
  }) as unknown as typeof fetch & ReturnType<typeof vi.fn>;

const ok = (body: unknown) => () => Promise.resolve(jsonResponse(body));
const status = (code: number) => () => Promise.resolve(jsonResponse({}, code));

describe('fetchUnreadMessageCount', () => {
  it('Bluesky の未読のメッセージとリクエストの数に、Fediverse の未読のメッセージの数を足し、同じオリジンへの GET で取る', async () => {
    const fetcher = fetcherOf({
      [BLUESKY_URL]: ok({ unread: 3, requests: 2 }),
      [FEDIVERSE_URL]: ok({ unread: 4 }),
    });

    expect(await fetchUnreadMessageCount(fetcher)).toBe(9);
    expect(fetcher).toHaveBeenCalledWith(
      BLUESKY_URL,
      expect.objectContaining({ credentials: 'same-origin', method: 'GET' }),
    );
    expect(fetcher).toHaveBeenCalledWith(
      FEDIVERSE_URL,
      expect.objectContaining({ credentials: 'same-origin', method: 'GET' }),
    );
  });

  it.each([403, 500])('Bluesky が %i でも、Fediverse の数を返す', async (code) => {
    const fetcher = fetcherOf({ [BLUESKY_URL]: status(code), [FEDIVERSE_URL]: ok({ unread: 2 }) });

    expect(await fetchUnreadMessageCount(fetcher)).toBe(2);
  });

  it.each([403, 500])('Fediverse が %i でも、Bluesky の数を返す', async (code) => {
    const fetcher = fetcherOf({ [BLUESKY_URL]: ok({ unread: 1, requests: 1 }), [FEDIVERSE_URL]: status(code) });

    expect(await fetchUnreadMessageCount(fetcher)).toBe(2);
  });

  it('片方の通信が失敗しても、もう片方の数を返す', async () => {
    const fetcher = fetcherOf({
      [BLUESKY_URL]: () => Promise.reject(new Error('offline')),
      [FEDIVERSE_URL]: ok({ unread: 5 }),
    });

    expect(await fetchUnreadMessageCount(fetcher)).toBe(5);
  });

  it('両方が 403 か 409 のときは unavailable にする', async () => {
    expect(await fetchUnreadMessageCount(fetcherOf({ [BLUESKY_URL]: status(403), [FEDIVERSE_URL]: status(403) })))
      .toBe('unavailable');
    expect(await fetchUnreadMessageCount(fetcherOf({ [BLUESKY_URL]: status(409), [FEDIVERSE_URL]: status(403) })))
      .toBe('unavailable');
  });

  it('数が取れず、片方が一時的な失敗のときは undefined にする', async () => {
    expect(await fetchUnreadMessageCount(fetcherOf({ [BLUESKY_URL]: status(409), [FEDIVERSE_URL]: status(502) })))
      .toBeUndefined();
    expect(
      await fetchUnreadMessageCount(
        fetcherOf({ [BLUESKY_URL]: () => Promise.reject(new Error('offline')), [FEDIVERSE_URL]: status(500) }),
      ),
    ).toBeUndefined();
  });

  it('壊れた本文は数に数えない', async () => {
    expect(
      await fetchUnreadMessageCount(
        fetcherOf({ [BLUESKY_URL]: ok({ unread: '3', requests: 0 }), [FEDIVERSE_URL]: ok({ unread: 1 }) }),
      ),
    ).toBe(1);
    expect(
      await fetchUnreadMessageCount(fetcherOf({ [BLUESKY_URL]: ok({ unread: 1 }), [FEDIVERSE_URL]: ok({}) })),
    ).toBeUndefined();
    expect(
      await fetchUnreadMessageCount(fetcherOf({ [BLUESKY_URL]: ok(null), [FEDIVERSE_URL]: ok({ unread: 'x' }) })),
    ).toBeUndefined();
  });
});

describe('nextMessagePolling', () => {
  it('Bluesky が unavailable になったら、以降は unavailable のままにする', () => {
    expect(nextMessagePolling(initialMessagePolling, 'unavailable')).toEqual({ blueskyUnavailable: true });
    expect(nextMessagePolling({ blueskyUnavailable: true }, 3)).toEqual({ blueskyUnavailable: true });
    expect(nextMessagePolling({ blueskyUnavailable: true }, undefined)).toEqual({ blueskyUnavailable: true });
  });

  it('Bluesky が数か一時的な失敗のときは、Bluesky を呼び続ける', () => {
    expect(nextMessagePolling(initialMessagePolling, 3)).toEqual({ blueskyUnavailable: false });
    expect(nextMessagePolling(initialMessagePolling, undefined)).toEqual({ blueskyUnavailable: false });
  });
});

describe('pollUnreadMessages', () => {
  const callsTo = (fetcher: ReturnType<typeof fetcherOf>, url: string) =>
    fetcher.mock.calls.filter(([input]) => String(input) === url).length;

  it.each([403, 409])(
    'Bluesky が %i を返したら、次からは Bluesky を呼ばず、Fediverse だけ呼んで、Fediverse の数を返す',
    async (code) => {
      const fetcher = fetcherOf({ [BLUESKY_URL]: status(code), [FEDIVERSE_URL]: ok({ unread: 2 }) });

      const first = await pollUnreadMessages(fetcher, initialMessagePolling);
      const second = await pollUnreadMessages(fetcher, first.polling);
      const third = await pollUnreadMessages(fetcher, second.polling);

      expect([first.unread, second.unread, third.unread]).toEqual([2, 2, 2]);
      expect(first.polling).toEqual({ blueskyUnavailable: true });
      expect(callsTo(fetcher, BLUESKY_URL)).toBe(1);
      expect(callsTo(fetcher, FEDIVERSE_URL)).toBe(3);
    },
  );

  it('Bluesky を呼ばないあいだに Fediverse が unavailable になったら、unavailable を返す', async () => {
    const fetcher = fetcherOf({ [BLUESKY_URL]: status(403), [FEDIVERSE_URL]: status(409) });

    const first = await pollUnreadMessages(fetcher, initialMessagePolling);
    const second = await pollUnreadMessages(fetcher, { blueskyUnavailable: true });

    expect(first.unread).toBe('unavailable');
    expect(second.unread).toBe('unavailable');
    expect(callsTo(fetcher, BLUESKY_URL)).toBe(1);
  });

  it('Bluesky を呼ばないあいだに Fediverse が一時的に失敗したら、undefined を返す', async () => {
    const fetcher = fetcherOf({ [BLUESKY_URL]: status(403), [FEDIVERSE_URL]: status(500) });

    const polled = await pollUnreadMessages(fetcher, { blueskyUnavailable: true });

    expect(polled.unread).toBeUndefined();
    expect(callsTo(fetcher, BLUESKY_URL)).toBe(0);
  });

  it.each([500, 502])('Bluesky が %i のような一時的な失敗のときは、次も Bluesky を呼ぶ', async (code) => {
    const fetcher = fetcherOf({ [BLUESKY_URL]: status(code), [FEDIVERSE_URL]: ok({ unread: 1 }) });

    const first = await pollUnreadMessages(fetcher, initialMessagePolling);
    const second = await pollUnreadMessages(fetcher, first.polling);

    expect(first.polling).toEqual({ blueskyUnavailable: false });
    expect(second.unread).toBe(1);
    expect(callsTo(fetcher, BLUESKY_URL)).toBe(2);
  });

  it('Bluesky が数を返すあいだは、Bluesky と Fediverse の数を足し、両方を呼び続ける', async () => {
    const fetcher = fetcherOf({ [BLUESKY_URL]: ok({ unread: 3, requests: 2 }), [FEDIVERSE_URL]: ok({ unread: 4 }) });

    const first = await pollUnreadMessages(fetcher, initialMessagePolling);
    const second = await pollUnreadMessages(fetcher, first.polling);

    expect([first.unread, second.unread]).toEqual([9, 9]);
    expect(callsTo(fetcher, BLUESKY_URL)).toBe(2);
    expect(callsTo(fetcher, FEDIVERSE_URL)).toBe(2);
  });
});

describe('combineUnreadMessages', () => {
  it('数だけを合算し、数が無いときは unavailable か undefined にする', () => {
    expect(combineUnreadMessages([2, 3])).toBe(5);
    expect(combineUnreadMessages([0, 'unavailable'])).toBe(0);
    expect(combineUnreadMessages([undefined, 4])).toBe(4);
    expect(combineUnreadMessages(['unavailable', 'unavailable'])).toBe('unavailable');
    expect(combineUnreadMessages(['unavailable', undefined])).toBeUndefined();
    expect(combineUnreadMessages([undefined, undefined])).toBeUndefined();
  });
});
