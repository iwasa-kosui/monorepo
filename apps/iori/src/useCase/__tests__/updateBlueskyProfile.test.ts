import { RA, Result } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import { Instant } from '../../domain/instant/instant.ts';
import type { BlueskyClient, BlueskyClientError } from '../../ports/blueskyClient.ts';
import { UpdateBlueskyProfileUseCase } from '../updateBlueskyProfile.ts';

const NOW = Instant.orThrow(Date.UTC(2026, 10, 13, 3));
const URI = 'at://did:plc:me/app.bsky.actor.profile/self';
const OLD_AVATAR = { $type: 'blob', ref: { $link: 'old-avatar' }, mimeType: 'image/png', size: 1 };
const OLD_BANNER = { $type: 'blob', ref: { $link: 'old-banner' }, mimeType: 'image/png', size: 2 };
const PINNED = { uri: 'at://did:plc:me/app.bsky.feed.post/3kpin', cid: 'bafypin' };
const existing = {
  $type: 'app.bsky.actor.profile',
  displayName: '旧名',
  description: '旧紹介',
  avatar: OLD_AVATAR,
  banner: OLD_BANNER,
  pinnedPost: PINNED,
  labels: { $type: 'com.atproto.label.defs#selfLabels', values: [{ val: 'porn' }] },
  joinedViaStarterPack: { uri: 'at://did:plc:x/app.bsky.graph.starterpack/3k', cid: 'bafystarter' },
  createdAt: '2025-01-01T00:00:00.000Z',
  unknownKey: { nested: true },
};
const failure: BlueskyClientError = {
  type: 'BlueskyClientError',
  kind: 'http',
  message: 'uploadBlob failed: status 500',
  status: 500,
};
const base = { displayName: '新名', description: '新紹介', removeAvatar: false, removeBanner: false };

const setup = (current: Record<string, unknown> | null = existing) => {
  const getProfileRecord = vi.fn<BlueskyClient['getProfileRecord']>(async () =>
    RA.ok(current === null ? undefined : { cid: 'bafycurrent', value: current })
  );
  const putProfileRecord = vi.fn<BlueskyClient['putProfileRecord']>(async () => RA.ok({ uri: URI, cid: 'bafynew' }));
  const uploadBlob = vi.fn<BlueskyClient['uploadBlob']>(async ({ bytes, mimeType }) =>
    RA.ok({ $type: 'blob', ref: { $link: `new-${bytes.byteLength}` }, mimeType, size: bytes.byteLength })
  );
  const useCase = UpdateBlueskyProfileUseCase.create({
    client: { getProfileRecord, putProfileRecord, uploadBlob },
    now: () => NOW,
  });
  const putRecord = () => putProfileRecord.mock.calls[0]![0];
  return { useCase, getProfileRecord, putProfileRecord, uploadBlob, putRecord };
};

describe('UpdateBlueskyProfileUseCase', () => {
  it('pinnedPost や未知のキーを含む既存のキーを保持し、表示名と自己紹介だけ差し替えて、現行の cid を swapCid にする', async () => {
    const t = setup();

    const result = await t.useCase.run({ ...base, displayName: ' 新名 ' });

    expect(result).toEqual({ ok: true, val: { uri: URI, cid: 'bafynew' } });
    expect(t.putRecord()).toEqual({ ...existing, displayName: '新名', description: '新紹介' });
    expect(t.putProfileRecord).toHaveBeenCalledExactlyOnceWith(t.putRecord(), 'bafycurrent');
    expect(t.uploadBlob).not.toHaveBeenCalled();
  });

  it('trim 後に空の表示名と自己紹介は、キーごと削除する', async () => {
    const t = setup();

    await t.useCase.run({ ...base, displayName: '  ', description: '\n' });

    const record = t.putRecord();
    expect(record).not.toHaveProperty('displayName');
    expect(record).not.toHaveProperty('description');
    expect(record).toMatchObject({ pinnedPost: PINNED, avatar: OLD_AVATAR, banner: OLD_BANNER });
  });

  it('画像を送ると uploadBlob で上げて、その blob に差し替える。送らなかった側は既存を保持する', async () => {
    const t = setup();
    const avatar = { bytes: new Uint8Array(3), mimeType: 'image/png' };

    await t.useCase.run({ ...base, avatar });

    expect(t.uploadBlob).toHaveBeenCalledExactlyOnceWith(avatar);
    expect(t.putRecord()).toMatchObject({
      avatar: { $type: 'blob', ref: { $link: 'new-3' }, mimeType: 'image/png', size: 3 },
      banner: OLD_BANNER,
    });
  });

  it('バナーも差し替えられる', async () => {
    const t = setup();

    await t.useCase.run({ ...base, banner: { bytes: new Uint8Array(5), mimeType: 'image/jpeg' } });

    expect(t.putRecord()).toMatchObject({
      avatar: OLD_AVATAR,
      banner: { ref: { $link: 'new-5' }, mimeType: 'image/jpeg' },
    });
  });

  it('remove を指定するとアバターとバナーのキーを削除する', async () => {
    const t = setup();

    await t.useCase.run({ ...base, removeAvatar: true, removeBanner: true });

    expect(t.putRecord()).not.toHaveProperty('avatar');
    expect(t.putRecord()).not.toHaveProperty('banner');
    expect(t.uploadBlob).not.toHaveBeenCalled();
  });

  it('ファイルと remove が両方あればファイルを優先する', async () => {
    const t = setup();

    await t.useCase.run({ ...base, avatar: { bytes: new Uint8Array(2), mimeType: 'image/png' }, removeAvatar: true });

    expect(t.putRecord()).toMatchObject({ avatar: { ref: { $link: 'new-2' } } });
  });

  it('既存のレコードが無ければ createdAt を現在時刻にして、swapCid を付けずに作る', async () => {
    const t = setup(null);

    const result = await t.useCase.run(base);

    expect(result.ok).toBe(true);
    expect(t.putRecord()).toEqual({
      $type: 'app.bsky.actor.profile',
      createdAt: '2026-11-13T03:00:00.000Z',
      displayName: '新名',
      description: '新紹介',
    });
    expect(t.putProfileRecord).toHaveBeenCalledExactlyOnceWith(t.putRecord(), undefined);
  });

  it('入力が不正なら PDS を呼ばずに BlueskyProfileInvalid を返す', async () => {
    const t = setup();

    const result = await t.useCase.run({ ...base, displayName: 'a'.repeat(65) });

    expect(result).toEqual({
      ok: false,
      err: { type: 'BlueskyProfileInvalid', reason: '表示名は64文字以内にしてください' },
    });
    expect(t.getProfileRecord).not.toHaveBeenCalled();
    expect(t.uploadBlob).not.toHaveBeenCalled();
    expect(t.putProfileRecord).not.toHaveBeenCalled();
  });

  it('画像が不正でも PDS を呼ばない', async () => {
    const t = setup();

    const result = await t.useCase.run({ ...base, banner: { bytes: new Uint8Array(1), mimeType: 'image/gif' } });

    expect(result).toMatchObject({ ok: false, err: { type: 'BlueskyProfileInvalid' } });
    expect(t.getProfileRecord).not.toHaveBeenCalled();
  });

  it('uploadBlob の失敗はそのまま返し、putProfileRecord を呼ばない', async () => {
    const t = setup();
    t.uploadBlob.mockResolvedValueOnce(Result.err(failure));

    const result = await t.useCase.run({ ...base, avatar: { bytes: new Uint8Array(1), mimeType: 'image/png' } });

    expect(result).toEqual({ ok: false, err: failure });
    expect(t.putProfileRecord).not.toHaveBeenCalled();
  });

  it('現行レコードの取得と書き込みの失敗もそのまま返す', async () => {
    const getFailed = setup();
    getFailed.getProfileRecord.mockResolvedValueOnce(Result.err(failure));
    const putFailed = setup();
    putFailed.putProfileRecord.mockResolvedValueOnce(Result.err(failure));

    expect(await getFailed.useCase.run(base)).toEqual({ ok: false, err: failure });
    expect(getFailed.putProfileRecord).not.toHaveBeenCalled();
    expect(await putFailed.useCase.run(base)).toEqual({ ok: false, err: failure });
  });
});
