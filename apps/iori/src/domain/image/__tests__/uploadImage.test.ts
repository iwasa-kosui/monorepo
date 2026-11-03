import { describe, expect, it } from 'vitest';

import { detectUploadImageMimeType, UPLOAD_IMAGE_MAX_BYTES, UploadImage } from '../uploadImage.ts';

const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0];
const jpeg = [0xff, 0xd8, 0xff, 0xe0, 0, 0x10];
const gif89 = [...'GIF89a'].map((char) => char.charCodeAt(0)).concat([1, 0, 1, 0]);
const gif87 = [...'GIF87a'].map((char) => char.charCodeAt(0)).concat([1, 0, 1, 0]);
const webp = [...'RIFF'].map((char) => char.charCodeAt(0)).concat(
  [0, 0, 0, 0],
  [...'WEBP'].map((char) => char.charCodeAt(0)),
);

describe('detectUploadImageMimeType', () => {
  it.each([
    ['image/png', png],
    ['image/jpeg', jpeg],
    ['image/gif', gif89],
    ['image/gif', gif87],
    ['image/webp', webp],
  ])('先頭のバイトから %s と判定する', (mimeType, bytes) => {
    expect(detectUploadImageMimeType(new Uint8Array(bytes))).toBe(mimeType);
  });

  it('RIFF でも WEBP でなければ判定しない', () => {
    const wave = [...'RIFF'].map((char) => char.charCodeAt(0)).concat(
      [0, 0, 0, 0],
      [...'WAVE'].map((char) => char.charCodeAt(0)),
    );

    expect(detectUploadImageMimeType(new Uint8Array(wave))).toBeUndefined();
  });

  it('画像のシグネチャがない中身と、シグネチャより短い中身は判定しない', () => {
    expect(detectUploadImageMimeType(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>')))
      .toBeUndefined();
    expect(detectUploadImageMimeType(new Uint8Array([0x89, 0x50]))).toBeUndefined();
  });
});

describe('UploadImage.validate', () => {
  it('申告の type ではなく中身で形式を返す', () => {
    const result = UploadImage.validate(new Uint8Array(png));

    expect(result).toMatchObject({ ok: true, val: 'image/png' });
  });

  it('空の中身は empty にする', () => {
    const result = UploadImage.validate(new Uint8Array());

    expect(result).toMatchObject({ ok: false, err: { type: 'InvalidUploadImageError', detail: { reason: 'empty' } } });
  });

  it('5MB を超える中身は、形式が正しくても tooLarge にする', () => {
    const bytes = new Uint8Array(UPLOAD_IMAGE_MAX_BYTES + 1);
    bytes.set(png);

    expect(UploadImage.validate(bytes)).toMatchObject({ ok: false, err: { detail: { reason: 'tooLarge' } } });
  });

  it('ちょうど 5MB の中身は受け付ける', () => {
    const bytes = new Uint8Array(UPLOAD_IMAGE_MAX_BYTES);
    bytes.set(jpeg);

    expect(UploadImage.validate(bytes)).toMatchObject({ ok: true, val: 'image/jpeg' });
  });

  it('画像でない中身は unsupportedFormat にする', () => {
    const html = new TextEncoder().encode('<html></html>');

    expect(UploadImage.validate(html)).toMatchObject({ ok: false, err: { detail: { reason: 'unsupportedFormat' } } });
  });
});
