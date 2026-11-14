import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  blueskyDidMismatchOf,
  isBlueskyAccountChangedError,
  isBlueskyAccountSwitchConfirmed,
  saveBlueskyCredential,
  startBlueskyAccountSwitch,
} from './blueskyCredentialClient.ts';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const stubFetch = (response: Response) => {
  const fetchStub = vi.fn(async (_url: string, _init?: RequestInit) => response);
  vi.stubGlobal('fetch', fetchStub);
  return fetchStub;
};

const failure = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('expected a failure');
};

afterEach(() => {
  vi.unstubAllGlobals();
});

const MISMATCH = {
  current: { did: 'did:plc:old', handle: 'old.bsky.social' },
  next: { did: 'did:plc:new', handle: 'new.bsky.social' },
};

const SWITCH_INPUT = {
  identifier: 'new.bsky.social',
  appPassword: 'b',
  currentPassword: 'c',
  fromDid: 'did:plc:old',
  toDid: 'did:plc:new',
};

describe('saveBlueskyCredential の did_mismatch', () => {
  it('409 の本文から、いまと新しいアカウントを読み取れる', async () => {
    stubFetch(json({ error: 'did_mismatch', ...MISMATCH }, 409));

    const error = await failure(saveBlueskyCredential({ identifier: 'a', appPassword: 'b', currentPassword: 'c' }));

    expect(error).toMatchObject({ status: 409, message: 'did_mismatch' });
    expect(blueskyDidMismatchOf(error)).toEqual(MISMATCH);
  });

  it('いまのアカウントのハンドルが null でも読み取れる', async () => {
    const current = { did: 'did:plc:old', handle: null };
    stubFetch(json({ error: 'did_mismatch', ...MISMATCH, current }, 409));

    const error = await failure(saveBlueskyCredential({ identifier: 'a', appPassword: 'b', currentPassword: 'c' }));

    expect(blueskyDidMismatchOf(error)?.current).toEqual(current);
  });

  it('本文の形が違うときは読み取らない', async () => {
    stubFetch(json({ error: 'did_mismatch', current: {} }, 409));

    const error = await failure(saveBlueskyCredential({ identifier: 'a', appPassword: 'b', currentPassword: 'c' }));

    expect(blueskyDidMismatchOf(error)).toBeUndefined();
  });

  it('did_mismatch 以外の失敗からは読み取らない', async () => {
    stubFetch(json({ error: 'switch_in_progress', ...MISMATCH }, 409));

    const error = await failure(saveBlueskyCredential({ identifier: 'a', appPassword: 'b', currentPassword: 'c' }));

    expect(blueskyDidMismatchOf(error)).toBeUndefined();
    expect(blueskyDidMismatchOf(new Error('did_mismatch'))).toBeUndefined();
  });
});

describe('startBlueskyAccountSwitch', () => {
  it('did_changed を見分けられる', async () => {
    stubFetch(json({ error: 'did_changed' }, 409));

    const error = await failure(startBlueskyAccountSwitch(SWITCH_INPUT));

    expect(isBlueskyAccountChangedError(error)).toBe(true);
    expect(isBlueskyAccountChangedError(new Error('did_changed'))).toBe(false);
  });
});

describe('アカウントの切り替えの表示', () => {
  it('入力が新しいアカウントのハンドルと一致するまで、確認が済んだとしない', () => {
    expect(isBlueskyAccountSwitchConfirmed('', 'new.bsky.social')).toBe(false);
    expect(isBlueskyAccountSwitchConfirmed('new.bsky', 'new.bsky.social')).toBe(false);
    expect(isBlueskyAccountSwitchConfirmed('new.bsky.social', 'new.bsky.social')).toBe(true);
  });

  it('前後の空白と先頭の @ を除き、大文字と小文字を区別しない', () => {
    expect(isBlueskyAccountSwitchConfirmed('  @New.Bsky.Social ', 'new.bsky.social')).toBe(true);
    expect(isBlueskyAccountSwitchConfirmed('new.bsky.social', 'New.Bsky.Social')).toBe(true);
    expect(isBlueskyAccountSwitchConfirmed('@@new.bsky.social', 'new.bsky.social')).toBe(false);
  });
});
