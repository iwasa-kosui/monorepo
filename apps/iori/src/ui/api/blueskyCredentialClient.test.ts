import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  blueskyAccountSwitchCountRows,
  blueskyAccountSwitchFailureMessage,
  blueskyCredentialChatLabel,
  blueskyCredentialDeleteFailureMessage,
  blueskyCredentialSaveFailureMessage,
  blueskyCredentialSourceLabel,
  blueskyCredentialVerifiedAtLabel,
  blueskyDidMismatchOf,
  deleteBlueskyCredential,
  fetchBlueskyAccountSwitch,
  fetchBlueskyAccountSwitchPreview,
  fetchBlueskyCredential,
  isBlueskyAccountChangedError,
  isBlueskyAccountSwitchConfirmed,
  saveBlueskyCredential,
  startBlueskyAccountSwitch,
} from './blueskyCredentialClient.ts';

const STATUS = {
  source: 'settings',
  handle: 'kosui.bsky.social',
  did: 'did:plc:abc',
  chatPermitted: true,
  verifiedAt: '2026-11-13T00:00:00.000Z',
  registrable: true,
};

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

describe('fetchBlueskyCredential', () => {
  it('状態を GET で取る', async () => {
    const fetchStub = stubFetch(json(STATUS));

    expect(await fetchBlueskyCredential()).toEqual(STATUS);
    expect(fetchStub.mock.calls[0]?.[0]).toBe('/api/iori/v1/bluesky/credential');
    expect(fetchStub.mock.calls[0]?.[1]?.method).toBe('GET');
  });

  it('null を含む応答も受け取る', async () => {
    const none = { ...STATUS, source: 'none', handle: null, did: null, chatPermitted: null, verifiedAt: null };
    stubFetch(json(none));

    expect(await fetchBlueskyCredential()).toEqual(none);
  });

  it('形の違う応答は失敗にする', async () => {
    stubFetch(json({ ...STATUS, source: 'other' }));

    await expect(fetchBlueskyCredential()).rejects.toThrow('Unexpected Bluesky credential response');
  });

  it('401 は status 付きの失敗にする', async () => {
    stubFetch(json({ error: 'unauthorized' }, 401));

    expect(await failure(fetchBlueskyCredential())).toMatchObject({ status: 401 });
  });
});

describe('saveBlueskyCredential', () => {
  it('3つの値を PUT の本文に入れる', async () => {
    const fetchStub = stubFetch(json(STATUS));

    expect(await saveBlueskyCredential({ identifier: 'a', appPassword: 'b', currentPassword: 'c' })).toEqual(STATUS);
    const init = fetchStub.mock.calls[0]?.[1];
    expect(init?.method).toBe('PUT');
    expect(JSON.parse(String(init?.body))).toEqual({ identifier: 'a', appPassword: 'b', currentPassword: 'c' });
  });
});

describe('deleteBlueskyCredential', () => {
  it('DELETE を呼び、応答の状態を返す', async () => {
    const fetchStub = stubFetch(json({ ...STATUS, source: 'secret' }));

    expect((await deleteBlueskyCredential()).source).toBe('secret');
    expect(fetchStub.mock.calls[0]?.[1]?.method).toBe('DELETE');
  });
});

describe('blueskyCredentialSaveFailureMessage', () => {
  it.each([
    [403, 'invalid_password', 'iori のパスワードが違います。'],
    [422, 'bluesky_login_failed', 'Bluesky にログインできませんでした。ハンドルとアプリパスワードを確かめてください。'],
    [409, 'switch_in_progress', 'アカウントの切り替え中です。終わるまでお待ちください。'],
    [409, 'did_mismatch', '保存できませんでした。'],
    [503, 'credential_key_missing', '登録するにはサーバーの設定が必要です。'],
    [400, 'invalid_input', '保存できませんでした。'],
    [500, 'unknown', '保存できませんでした。'],
  ])('%i %s を表示文にする', async (status, code, message) => {
    stubFetch(json({ error: code }, status));

    const error = await failure(saveBlueskyCredential({ identifier: 'a', appPassword: 'b', currentPassword: 'c' }));

    expect(blueskyCredentialSaveFailureMessage(error)).toBe(message);
  });

  it('API の失敗でない例外は汎用の文にする', () => {
    expect(blueskyCredentialSaveFailureMessage(new Error('invalid_password'))).toBe('保存できませんでした。');
  });
});

const COUNTS = {
  timelineItems: 1,
  notifications: 2,
  likes: 3,
  reposts: 4,
  bookmarks: 5,
  moderatedActors: 6,
  crossposts: 7,
};

const MISMATCH = {
  current: { did: 'did:plc:old', handle: 'old.bsky.social' },
  next: { did: 'did:plc:new', handle: 'new.bsky.social' },
};

const PURGING = {
  state: 'purging',
  fromDid: 'did:plc:old',
  toDid: 'did:plc:new',
  startedAt: '2026-11-13T00:00:00.000Z',
  attempts: 2,
  lastError: null,
  stalled: false,
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

describe('fetchBlueskyAccountSwitchPreview', () => {
  it('件数を GET で取る', async () => {
    const fetchStub = stubFetch(json({ counts: COUNTS }));

    expect(await fetchBlueskyAccountSwitchPreview()).toEqual({ counts: COUNTS });
    expect(fetchStub.mock.calls[0]?.[0]).toBe('/api/iori/v1/bluesky/account-switch/preview');
    expect(fetchStub.mock.calls[0]?.[1]?.method).toBe('GET');
  });

  it('形の違う応答は失敗にする', async () => {
    stubFetch(json({ counts: { ...COUNTS, likes: 'many' } }));

    await expect(fetchBlueskyAccountSwitchPreview()).rejects.toThrow(
      'Unexpected Bluesky account switch preview response',
    );
  });

  it('403 は status 付きの失敗にする', async () => {
    stubFetch(json({ error: 'forbidden' }, 403));

    expect(await failure(fetchBlueskyAccountSwitchPreview())).toMatchObject({ status: 403 });
  });
});

describe('startBlueskyAccountSwitch', () => {
  it('5つの値を POST の本文に入れ、202 の状態を返す', async () => {
    const fetchStub = stubFetch(json(PURGING, 202));

    expect(await startBlueskyAccountSwitch(SWITCH_INPUT)).toEqual(PURGING);
    expect(fetchStub.mock.calls[0]?.[0]).toBe('/api/iori/v1/bluesky/account-switch');
    const init = fetchStub.mock.calls[0]?.[1];
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual(SWITCH_INPUT);
  });

  it('形の違う応答は失敗にする', async () => {
    stubFetch(json({ state: 'other' }, 202));

    await expect(startBlueskyAccountSwitch(SWITCH_INPUT)).rejects.toThrow('Unexpected Bluesky account switch response');
  });

  it('did_changed を見分けられる', async () => {
    stubFetch(json({ error: 'did_changed' }, 409));

    const error = await failure(startBlueskyAccountSwitch(SWITCH_INPUT));

    expect(isBlueskyAccountChangedError(error)).toBe(true);
    expect(isBlueskyAccountChangedError(new Error('did_changed'))).toBe(false);
  });
});

describe('fetchBlueskyAccountSwitch', () => {
  it('idle を GET で取る', async () => {
    const fetchStub = stubFetch(json({ state: 'idle' }));

    expect(await fetchBlueskyAccountSwitch()).toEqual({ state: 'idle' });
    expect(fetchStub.mock.calls[0]?.[0]).toBe('/api/iori/v1/bluesky/account-switch');
    expect(fetchStub.mock.calls[0]?.[1]?.method).toBe('GET');
  });

  it('purging の進捗を受け取る', async () => {
    const stalled = { ...PURGING, attempts: 31, lastError: 'boom', stalled: true };
    stubFetch(json(stalled));

    expect(await fetchBlueskyAccountSwitch()).toEqual(stalled);
  });

  it('purging に必要な項目が無い応答は失敗にする', async () => {
    stubFetch(json({ state: 'purging' }));

    await expect(fetchBlueskyAccountSwitch()).rejects.toThrow('Unexpected Bluesky account switch response');
  });
});

describe('blueskyAccountSwitchFailureMessage', () => {
  it.each([
    [403, 'invalid_password', 'iori のパスワードが違います。'],
    [422, 'bluesky_login_failed', 'Bluesky にログインできませんでした。ハンドルとアプリパスワードを確かめてください。'],
    [409, 'did_changed', 'アカウントの状態が変わりました。もう一度やり直してください。'],
    [409, 'switch_in_progress', 'アカウントの切り替え中です。終わるまでお待ちください。'],
    [503, 'credential_key_missing', '登録するにはサーバーの設定が必要です。'],
    [400, 'invalid_input', '切り替えられませんでした。'],
    [500, 'unknown', '切り替えられませんでした。'],
  ])('%i %s を表示文にする', async (status, code, message) => {
    stubFetch(json({ error: code }, status));

    expect(blueskyAccountSwitchFailureMessage(await failure(startBlueskyAccountSwitch(SWITCH_INPUT)))).toBe(message);
  });

  it('API の失敗でない例外は汎用の文にする', () => {
    expect(blueskyAccountSwitchFailureMessage(new Error('invalid_password'))).toBe('切り替えられませんでした。');
  });
});

describe('blueskyCredentialDeleteFailureMessage', () => {
  it.each([
    [409, 'env_account_differs', 'サーバーの secret のアカウントがいまのアカウントと違うため、登録を消せません。'],
    [409, 'switch_in_progress', 'アカウントの切り替え中です。終わるまでお待ちください。'],
    [500, 'unknown', '登録を消せませんでした。'],
  ])('%i %s を表示文にする', async (status, code, message) => {
    stubFetch(json({ error: code }, status));

    expect(blueskyCredentialDeleteFailureMessage(await failure(deleteBlueskyCredential()))).toBe(message);
  });

  it('API の失敗でない例外は汎用の文にする', () => {
    expect(blueskyCredentialDeleteFailureMessage(new Error('env_account_differs'))).toBe('登録を消せませんでした。');
  });
});

describe('アカウントの切り替えの表示', () => {
  it('件数を、タイムライン、通知、いいね、リポスト、ブックマーク、ミュートとブロック、クロスポストの対応の順にする', () => {
    expect(blueskyAccountSwitchCountRows(COUNTS)).toEqual([
      { label: 'タイムライン', count: 1 },
      { label: '通知', count: 2 },
      { label: 'いいね', count: 3 },
      { label: 'リポスト', count: 4 },
      { label: 'ブックマーク', count: 5 },
      { label: 'ミュートとブロック', count: 6 },
      { label: 'クロスポストの対応', count: 7 },
    ]);
  });

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

describe('表示ラベル', () => {
  it('出どころを日本語にする', () => {
    expect(blueskyCredentialSourceLabel('settings')).toBe('設定画面で登録');
    expect(blueskyCredentialSourceLabel('secret')).toBe('サーバーの secret');
    expect(blueskyCredentialSourceLabel('none')).toBe('未設定');
  });

  it('DM の可否を日本語にする', () => {
    expect(blueskyCredentialChatLabel(true)).toBe('使えます');
    expect(blueskyCredentialChatLabel(false)).toBe('使えません');
    expect(blueskyCredentialChatLabel(null)).toBe('未確認');
  });

  it('確かめた日時をローカル時刻にし、null は未確認にする', () => {
    const iso = '2026-11-13T00:00:00.000Z';

    expect(blueskyCredentialVerifiedAtLabel(iso)).toBe(new Date(iso).toLocaleString('ja-JP'));
    expect(blueskyCredentialVerifiedAtLabel(null)).toBe('未確認');
  });
});
