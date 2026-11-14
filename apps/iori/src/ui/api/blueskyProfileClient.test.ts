import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  blueskyActorOfPath,
  isBlueskyProfileConflictError,
  ownBlueskyProfileSaveFailureMessage,
  updateOwnBlueskyProfile,
} from './blueskyProfileClient.ts';

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

describe('own Bluesky profile', () => {
  it('保存は FormData を PUT し、Content-Type は付けない', async () => {
    const fetchStub = stubFetch(json({ uri: 'at://did:plc:me/app.bsky.actor.profile/self', cid: 'bafy' }));
    const body = new FormData();
    body.append('display_name', '岩佐');

    expect(await updateOwnBlueskyProfile(body)).toEqual({
      uri: 'at://did:plc:me/app.bsky.actor.profile/self',
      cid: 'bafy',
    });
    const init = fetchStub.mock.calls[0]?.[1];
    expect(init?.method).toBe('PUT');
    expect(init?.body).toBe(body);
    expect(init?.headers).toEqual({ Accept: 'application/json' });
  });

  it('保存の失敗は、422 なら error をそのまま、それ以外は固定の文言にする', async () => {
    stubFetch(json({ error: '表示名が長すぎます', code: 'profile_invalid' }, 422));
    const invalid = await failure(updateOwnBlueskyProfile(new FormData()));
    expect(ownBlueskyProfileSaveFailureMessage(invalid)).toBe('表示名が長すぎます');

    stubFetch(json({ error: 'upstream' }, 502));
    const upstream = await failure(updateOwnBlueskyProfile(new FormData()));
    expect(ownBlueskyProfileSaveFailureMessage(upstream)).toBe('Bluesky のプロフィールを保存できませんでした');
    expect(ownBlueskyProfileSaveFailureMessage(new Error('x'))).toBe('Bluesky のプロフィールを保存できませんでした');
  });

  it('409 で code が profile_conflict のときだけ競合と判定し、その error の文言を保存の失敗の文言にする', async () => {
    const message = 'ほかの場所でプロフィールが更新されました。読み込み直してから保存してください';
    stubFetch(json({ error: message, code: 'profile_conflict' }, 409));
    const conflict = await failure(updateOwnBlueskyProfile(new FormData()));
    stubFetch(json({ error: 'Bluesky timeline is disabled' }, 409));
    const disabled = await failure(updateOwnBlueskyProfile(new FormData()));
    stubFetch(json({ error: 'x', code: 'profile_conflict' }, 422));
    const otherStatus = await failure(updateOwnBlueskyProfile(new FormData()));

    expect(isBlueskyProfileConflictError(conflict)).toBe(true);
    expect(isBlueskyProfileConflictError(disabled)).toBe(false);
    expect(isBlueskyProfileConflictError(otherStatus)).toBe(false);
    expect(isBlueskyProfileConflictError(new Error('x'))).toBe(false);
    expect(ownBlueskyProfileSaveFailureMessage(conflict)).toBe(message);
    expect(ownBlueskyProfileSaveFailureMessage(disabled)).toBe('Bluesky のプロフィールを保存できませんでした');
  });
});

describe('blueskyActorOfPath', () => {
  it('パスの actor をデコードして返す', () => {
    expect(blueskyActorOfPath('/bluesky/profile/did%3Aplc%3Aalice')).toBe('did:plc:alice');
    expect(blueskyActorOfPath('/bluesky/profile/alice.bsky.social/')).toBe('alice.bsky.social');
  });

  it('actor が無い、またはデコードできないパスは undefined にする', () => {
    expect(blueskyActorOfPath('/bluesky/profile/')).toBeUndefined();
    expect(blueskyActorOfPath('/bluesky/profile/%E0%A4%A')).toBeUndefined();
    expect(blueskyActorOfPath('/remote-users/a1')).toBeUndefined();
  });
});
