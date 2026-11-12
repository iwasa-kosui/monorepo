import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  blueskyCredentialChatLabel,
  blueskyCredentialSaveFailureMessage,
  blueskyCredentialSourceLabel,
  blueskyCredentialVerifiedAtLabel,
  deleteBlueskyCredential,
  fetchBlueskyCredential,
  saveBlueskyCredential,
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
    [409, 'did_mismatch', 'いま連携している Bluesky のアカウントと違うアカウントは登録できません。'],
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
