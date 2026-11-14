import { describe, expect, it } from 'vitest';

import {
  BLUESKY_PROFILE_DESCRIPTION_MAX_BYTES,
  BLUESKY_PROFILE_DISPLAY_NAME_MAX_BYTES,
  BLUESKY_PROFILE_IMAGE_MAX_BYTES,
  BlueskyProfileInput,
} from './blueskyProfileInput.ts';

const input = (overrides: Partial<Parameters<typeof BlueskyProfileInput.validate>[0]> = {}) => ({
  displayName: 'Iori',
  description: '自己紹介',
  ...overrides,
});
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];
const image = (size: number, mimeType = 'image/png') => {
  const bytes = new Uint8Array(size);
  bytes.set((mimeType === 'image/jpeg' ? JPEG_SIGNATURE : PNG_SIGNATURE).slice(0, size));
  return { bytes, mimeType };
};

describe('BlueskyProfileInput.validate', () => {
  it('前後の空白を取った表示名と自己紹介を返す', () => {
    expect(BlueskyProfileInput.validate(input({ displayName: '  Iori \n', description: '\n本文  ' }))).toEqual({
      ok: true,
      val: { displayName: 'Iori', description: '本文' },
    });
    expect(BlueskyProfileInput.validate(input({ displayName: ' ', description: '' }))).toEqual({
      ok: true,
      val: { displayName: '', description: '' },
    });
  });

  it('表示名は 64 書記素ちょうどまで通し、65 書記素なら表示名が不正だと伝える', () => {
    expect(BlueskyProfileInput.validate(input({ displayName: 'a'.repeat(64) })).ok).toBe(true);
    const result = BlueskyProfileInput.validate(input({ displayName: 'a'.repeat(65) }));

    expect(result).toEqual({
      ok: false,
      err: { type: 'BlueskyProfileInvalid', reason: '表示名は64文字以内にしてください' },
    });
  });

  it('自己紹介は 256 書記素ちょうどまで通し、257 書記素なら自己紹介が不正だと伝える', () => {
    expect(BlueskyProfileInput.validate(input({ description: 'a'.repeat(256) })).ok).toBe(true);
    const result = BlueskyProfileInput.validate(input({ description: 'a'.repeat(257) }));

    expect(result).toEqual({
      ok: false,
      err: { type: 'BlueskyProfileInvalid', reason: '自己紹介は256文字以内にしてください' },
    });
  });

  it('結合した絵文字は 1 書記素として数える', () => {
    const family = '👨‍👩‍👧‍👦';
    const flag = '🇯🇵';

    expect(BlueskyProfileInput.validate(input({ displayName: 'a'.repeat(63) + family })).ok).toBe(true);
    expect(BlueskyProfileInput.validate(input({ displayName: flag.repeat(32) })).ok).toBe(true);
    expect(BlueskyProfileInput.validate(input({ displayName: 'é'.repeat(64) })).ok).toBe(true);
    expect(BlueskyProfileInput.validate(input({ displayName: 'é'.repeat(65) })).ok).toBe(false);
  });

  it('書記素が上限以内でも UTF-8 のバイト数が 640 を超えれば、表示名が長すぎると伝えて失敗する', () => {
    const family = '👨‍👩‍👧‍👦';
    expect(new TextEncoder().encode(family).byteLength).toBe(25);

    expect(BlueskyProfileInput.validate(input({ displayName: 'a'.repeat(15) + family.repeat(25) })).ok).toBe(true);
    const result = BlueskyProfileInput.validate(input({ displayName: 'a'.repeat(16) + family.repeat(25) }));
    expect(result).toEqual({
      ok: false,
      err: {
        type: 'BlueskyProfileInvalid',
        reason: `表示名が長すぎます（UTF-8 で${BLUESKY_PROFILE_DISPLAY_NAME_MAX_BYTES}バイト以内）`,
      },
    });
  });

  it('自己紹介は UTF-8 のバイト数が 2560 ちょうどまで通し、超えれば自己紹介が長すぎると伝えて失敗する', () => {
    const family = '👨‍👩‍👧‍👦';

    expect(BlueskyProfileInput.validate(input({ description: 'a'.repeat(10) + family.repeat(102) })).ok).toBe(true);
    const result = BlueskyProfileInput.validate(input({ description: 'a'.repeat(11) + family.repeat(102) }));
    expect(result).toEqual({
      ok: false,
      err: {
        type: 'BlueskyProfileInvalid',
        reason: `自己紹介が長すぎます（UTF-8 で${BLUESKY_PROFILE_DESCRIPTION_MAX_BYTES}バイト以内）`,
      },
    });
  });

  it('画像は JPEG と PNG の 1 バイト以上 1,000,000 バイト以下だけ通す', () => {
    expect(BlueskyProfileInput.validate(input({ avatar: image(3, 'image/jpeg') })).ok).toBe(true);
    expect(BlueskyProfileInput.validate(input({ banner: image(BLUESKY_PROFILE_IMAGE_MAX_BYTES) })).ok).toBe(true);
  });

  it('先頭バイトが mimeType と合わない画像は、アバターかバナーかを伝えて失敗する', () => {
    const jpegAsPng = { bytes: image(16, 'image/jpeg').bytes, mimeType: 'image/png' };
    const pngAsJpeg = { bytes: image(16).bytes, mimeType: 'image/jpeg' };

    expect(BlueskyProfileInput.validate(input({ avatar: jpegAsPng }))).toEqual({
      ok: false,
      err: { type: 'BlueskyProfileInvalid', reason: 'アバターの画像は JPEG か PNG にしてください' },
    });
    expect(BlueskyProfileInput.validate(input({ banner: pngAsJpeg }))).toMatchObject({
      ok: false,
      err: { reason: 'バナーの画像は JPEG か PNG にしてください' },
    });
    expect(BlueskyProfileInput.validate(input({ avatar: { bytes: new Uint8Array(16), mimeType: 'image/png' } })).ok)
      .toBe(false);
    expect(
      BlueskyProfileInput.validate(input({ avatar: { bytes: new Uint8Array([0x89, 0x50]), mimeType: 'image/png' } }))
        .ok,
    )
      .toBe(false);
  });

  it('画像の形式が違う、空、大きすぎるときは、アバターかバナーかを伝えて失敗する', () => {
    expect(BlueskyProfileInput.validate(input({ avatar: image(10, 'image/gif') }))).toEqual({
      ok: false,
      err: { type: 'BlueskyProfileInvalid', reason: 'アバターの画像は JPEG か PNG にしてください' },
    });
    expect(BlueskyProfileInput.validate(input({ banner: image(10, 'image/webp') }))).toMatchObject({
      ok: false,
      err: { reason: 'バナーの画像は JPEG か PNG にしてください' },
    });
    expect(BlueskyProfileInput.validate(input({ avatar: image(0) }))).toMatchObject({
      ok: false,
      err: { reason: 'アバターの画像が空です' },
    });
    expect(BlueskyProfileInput.validate(input({ banner: image(BLUESKY_PROFILE_IMAGE_MAX_BYTES + 1) }))).toMatchObject({
      ok: false,
      err: { reason: 'バナーの画像は1MB以下にしてください' },
    });
  });
});
