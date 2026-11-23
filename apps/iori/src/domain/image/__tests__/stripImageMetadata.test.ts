import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { stripImageMetadata } from '../stripImageMetadata.ts';
import { detectUploadImageMimeType } from '../uploadImage.ts';

const SECRETS = ['35/1', 'SecretCamera', 'secret-comment'] as const;

const exif = {
  IFD0: { Make: 'SecretCamera', ImageDescription: 'secret-comment' },
  IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '35/1 40/1 0/1', GPSLongitudeRef: 'E', GPSLongitude: '139/1 45/1 0/1' },
};

const XMP = '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF>secret-comment</rdf:RDF></x:xmpmeta>';

const source = (orientation?: number) => {
  const image = sharp({
    create: { width: 24, height: 12, channels: 4, background: { r: 200, g: 40, b: 90, alpha: 0.5 } },
  }).withExif(exif).withXmp(XMP).withIccProfile('p3');
  return orientation === undefined ? image : image.withMetadata({ orientation });
};

const encoders = {
  jpeg: (orientation?: number) => source(orientation).jpeg().toBuffer(),
  progressiveJpeg: (orientation?: number) => source(orientation).jpeg({ progressive: true }).toBuffer(),
  png: (orientation?: number) => source(orientation).png().toBuffer(),
  webp: (orientation?: number) => source(orientation).webp().toBuffer(),
  losslessWebp: (orientation?: number) => source(orientation).webp({ lossless: true }).toBuffer(),
};

const pixels = (bytes: Uint8Array) => sharp(bytes, { animated: true }).raw().toBuffer();

const text = (bytes: Uint8Array) => new TextDecoder('latin1').decode(bytes);

const ascii = (value: string) => [...value].map((char) => char.charCodeAt(0));

const strip = (bytes: Uint8Array): Uint8Array => {
  const mimeType = detectUploadImageMimeType(bytes);
  const stripped = mimeType === undefined ? undefined : stripImageMetadata(bytes, mimeType);
  if (stripped === undefined) throw new Error('画像を読めなかった');
  return stripped;
};

describe('stripImageMetadata', () => {
  describe.each(Object.entries(encoders))('%s', (_, encode) => {
    it('位置情報・Exif・XMP を消し、画素と ICC プロファイルは変えない', async () => {
      const original = new Uint8Array(await encode());
      const before = await sharp(original).metadata();
      expect(before.exif).toBeDefined();
      expect(before.xmp).toBeDefined();

      const stripped = strip(original);

      const after = await sharp(stripped).metadata();
      expect(after.exif).toBeUndefined();
      expect(after.xmp).toBeUndefined();
      for (const secret of SECRETS) expect(text(stripped)).not.toContain(secret);
      expect(after.icc).toEqual(before.icc);
      expect(await pixels(stripped)).toEqual(await pixels(original));
    });

    it('画像の向きだけは残す', async () => {
      const stripped = strip(new Uint8Array(await encode(6)));

      const after = await sharp(stripped).metadata();
      expect(after.orientation).toBe(6);
      for (const secret of SECRETS) expect(text(stripped)).not.toContain(secret);
    });

    it('何度かけても結果が変わらない', async () => {
      const once = strip(new Uint8Array(await encode(6)));

      expect(strip(once)).toEqual(once);
    });
  });

  it('JPEG のコメントと、EOI より後ろに足されたデータを消す', async () => {
    const jpeg = new Uint8Array(
      await sharp({ create: { width: 8, height: 8, channels: 3, background: '#888' } })
        .jpeg().toBuffer(),
    );
    const comment = [0xff, 0xfe, 0x00, 2 + 14, ...ascii('secret-comment')];
    const withExtras = Uint8Array.from([...jpeg.subarray(0, 2), ...comment, ...jpeg.subarray(2), ...ascii('trailer')]);

    const stripped = strip(withExtras);

    expect(text(stripped)).not.toContain('secret-comment');
    expect(text(stripped)).not.toContain('trailer');
    expect(await pixels(stripped)).toEqual(await pixels(jpeg));
  });

  it('PNG のテキストチャンクを消す', async () => {
    const png = new Uint8Array(
      await sharp({ create: { width: 8, height: 8, channels: 3, background: '#888' } })
        .png().toBuffer(),
    );
    // CRC は読まないので 0 で埋める
    const textChunk = [0, 0, 0, 22, ...ascii('tEXt'), ...ascii('Comment\0secret-comment'), 0, 0, 0, 0];
    const withText = Uint8Array.from([...png.subarray(0, 33), ...textChunk, ...png.subarray(33)]);

    const stripped = strip(withText);

    expect(stripped).toEqual(png);
  });

  it('アニメーション GIF のコメントと XMP を消し、コマとループ回数は変えない', async () => {
    const frame = (background: string) =>
      sharp({ create: { width: 8, height: 8, channels: 3, background } }).png().toBuffer();
    const gif = new Uint8Array(
      await sharp([await frame('#f00'), await frame('#00f')], { join: { animated: true } })
        .gif({ loop: 3, delay: [100, 200] }).toBuffer(),
    );
    const comment = [0x21, 0xfe, 14, ...ascii('secret-comment'), 0];
    const xmp = [0x21, 0xff, 11, ...ascii('XMP DataXMP'), 14, ...ascii('secret-comment'), 0];
    const headerEnd = 13 + ((gif[10]! & 0x80) === 0 ? 0 : 3 * 2 ** ((gif[10]! & 0x07) + 1));
    const withExtras = Uint8Array.from([
      ...gif.subarray(0, headerEnd),
      ...comment,
      ...xmp,
      ...gif.subarray(headerEnd),
      ...ascii('trailer'),
    ]);

    const stripped = strip(withExtras);

    expect(text(stripped)).not.toContain('secret-comment');
    expect(text(stripped)).not.toContain('trailer');
    const after = await sharp(stripped, { animated: true }).metadata();
    expect(after).toMatchObject({ pages: 2, loop: 3, delay: [100, 200] });
    expect(await pixels(stripped)).toEqual(await pixels(gif));
  });

  it('アニメーション WebP のコマを変えない', async () => {
    const frame = (background: string) =>
      sharp({ create: { width: 8, height: 8, channels: 3, background } }).png().toBuffer();
    const webp = new Uint8Array(
      await sharp([await frame('#f00'), await frame('#00f')], { join: { animated: true } })
        .withExif(exif).webp({ lossless: true, loop: 2 }).toBuffer(),
    );

    const stripped = strip(webp);

    const after = await sharp(stripped, { animated: true }).metadata();
    expect(after.exif).toBeUndefined();
    expect(after).toMatchObject({ pages: 2, loop: 2 });
    expect(await pixels(stripped)).toEqual(await pixels(webp));
  });

  it('構造を読めない画像は、メタデータを消せたか分からないので undefined にする', async () => {
    const tiny = sharp({ create: { width: 8, height: 8, channels: 3, background: '#888' } });
    const jpeg = new Uint8Array(await tiny.clone().jpeg().toBuffer());
    const png = new Uint8Array(await tiny.clone().png().toBuffer());
    const gif = new Uint8Array(await tiny.clone().gif().toBuffer());
    const webp = new Uint8Array(await tiny.clone().webp().toBuffer());

    // 画素に届く前に切れている
    expect(stripImageMetadata(jpeg.subarray(0, 12), 'image/jpeg')).toBeUndefined();
    expect(stripImageMetadata(png.subarray(0, png.byteLength - 16), 'image/png')).toBeUndefined();
    expect(stripImageMetadata(gif.subarray(0, gif.byteLength - 4), 'image/gif')).toBeUndefined();
    expect(stripImageMetadata(webp.subarray(0, 10), 'image/webp')).toBeUndefined();
    // チャンクの長さが実際より大きい
    const badWebp = webp.slice();
    badWebp[16] = 0xff;
    badWebp[17] = 0xff;
    expect(stripImageMetadata(badWebp, 'image/webp')).toBeUndefined();
  });
});
