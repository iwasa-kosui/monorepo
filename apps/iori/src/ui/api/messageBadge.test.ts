import { describe, expect, it, vi } from 'vitest';

import {
  applyMessageBadge,
  combineUnreadMessages,
  fetchUnreadMessageCount,
  MESSAGE_BADGE_SELECTOR,
} from './messageBadge.ts';
import { NOTIFICATION_BADGE_SELECTOR } from './notificationBadge.ts';

const fakeBadge = () => ({ textContent: 'stale', hidden: false });

const rootWith = (badges: ReturnType<typeof fakeBadge>[]) =>
  ({
    querySelectorAll: vi.fn((selector: string) => {
      expect(selector).toBe(MESSAGE_BADGE_SELECTOR);
      return { forEach: (callback: (badge: ReturnType<typeof fakeBadge>) => void) => badges.forEach(callback) };
    }),
  }) as unknown as ParentNode;

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('MESSAGE_BADGE_SELECTOR', () => {
  it('通知のバッジとは別の属性を指す', () => {
    expect(MESSAGE_BADGE_SELECTOR).toBe('[data-dm-badge]');
    expect(MESSAGE_BADGE_SELECTOR).not.toBe(NOTIFICATION_BADGE_SELECTOR);
  });
});

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
  it('Bluesky の未読の会話とリクエストの数に、Fediverse の未読の会話の数を足し、同じオリジンへの GET で取る', async () => {
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

  it.each([403, 409, 500])('Bluesky が %i でも、Fediverse の数を返す', async (code) => {
    const fetcher = fetcherOf({ [BLUESKY_URL]: status(code), [FEDIVERSE_URL]: ok({ unread: 2 }) });

    expect(await fetchUnreadMessageCount(fetcher)).toBe(2);
  });

  it.each([403, 409, 500])('Fediverse が %i でも、Bluesky の数を返す', async (code) => {
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

describe('applyMessageBadge', () => {
  it('すべてのバッジに件数を出し、99 を超えたら 99+ にする', () => {
    const badges = [fakeBadge(), fakeBadge()];
    applyMessageBadge(rootWith(badges), 120);

    expect(badges).toEqual([{ textContent: '99+', hidden: false }, { textContent: '99+', hidden: false }]);
  });

  it('未読が無ければ隠して空にする', () => {
    const badges = [fakeBadge()];
    applyMessageBadge(rootWith(badges), 0);

    expect(badges).toEqual([{ textContent: '', hidden: true }]);
  });
});
