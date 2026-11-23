// アップロードされた画像から、位置情報などのメタデータを取り除く。
// Workers でも動くよう、画素は再エンコードせずコンテナの構造だけを読んで、表示に要る部分だけを残す。
//
// - 残すもの: 画素、色（ICC プロファイルなど）、透過、アニメーション、画像の向き
// - 消すもの: Exif（GPS・撮影日時・機種・埋め込みサムネイル）、XMP、IPTC、コメント、末尾に足されたデータ
//
// 画像の向きは Exif にしかないので、向きだけを持つ最小の Exif に置き換える。
// 構造を読めなかった画像は undefined を返す。メタデータを消せたか分からないものを公開しないためで、呼び出し側が拒否する。

import type { UploadImageMimeType } from './uploadImage.ts';

type Bytes = Uint8Array;

const ascii = (text: string): Bytes => Uint8Array.from(text, (char) => char.charCodeAt(0));

const startsWith = (bytes: Bytes, signature: Bytes, offset = 0): boolean =>
  bytes.byteLength >= offset + signature.byteLength
  && signature.every((value, index) => bytes[offset + index] === value);

const concat = (parts: ReadonlyArray<Bytes>): Bytes => {
  const out = new Uint8Array(parts.reduce((total, part) => total + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }
  return out;
};

const viewOf = (bytes: Bytes): DataView => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

// --- Exif (TIFF) ---

const ORIENTATION_TAG = 0x0112;
const TIFF_SHORT = 3;

/** TIFF の IFD0 から画像の向きを読む。回転も反転もしない 1 と、読めない値は undefined にする */
const readOrientation = (tiff: Bytes): number | undefined => {
  if (tiff.byteLength < 8) return undefined;
  const little = tiff[0] === 0x49 && tiff[1] === 0x49;
  const big = tiff[0] === 0x4d && tiff[1] === 0x4d;
  if (!little && !big) return undefined;
  const view = viewOf(tiff);
  if (view.getUint16(2, little) !== 42) return undefined;
  const ifd = view.getUint32(4, little);
  if (ifd + 2 > tiff.byteLength) return undefined;
  const count = view.getUint16(ifd, little);
  for (let index = 0; index < count; index++) {
    const entry = ifd + 2 + index * 12;
    if (entry + 12 > tiff.byteLength) return undefined;
    if (view.getUint16(entry, little) !== ORIENTATION_TAG) continue;
    if (view.getUint16(entry + 2, little) !== TIFF_SHORT || view.getUint32(entry + 4, little) !== 1) return undefined;
    const value = view.getUint16(entry + 8, little);
    return value >= 2 && value <= 8 ? value : undefined;
  }
  return undefined;
};

/** 向きのタグだけを持つ TIFF */
const orientationTiff = (orientation: number): Bytes =>
  // dprint-ignore
  Uint8Array.from([
    0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, // リトルエンディアンの TIFF ヘッダー、IFD0 は 8 バイト目から
    0x01, 0x00, // エントリー数 1
    0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, orientation, 0x00, 0x00, 0x00, // Orientation, SHORT, 1 個
    0x00, 0x00, 0x00, 0x00, // 次の IFD なし
  ]);

const EXIF_HEADER = ascii('Exif\0\0');

// --- JPEG ---

const JFIF = ascii('JFIF\0');
const ICC_PROFILE = ascii('ICC_PROFILE\0');
const ADOBE = ascii('Adobe');
const JFIF_SEGMENT_BYTES = 18;

const jpegSegment = (marker: number, payload: Bytes): Bytes => {
  const length = payload.byteLength + 2;
  return concat([Uint8Array.from([0xff, marker, length >> 8, length & 0xff]), payload]);
};

/** JFIF ヘッダーは埋め込みサムネイルを持てるので、サムネイルを除いた形に作り直す */
const withoutJfifThumbnail = (segment: Bytes): Bytes => {
  if (segment.byteLength <= JFIF_SEGMENT_BYTES) return segment;
  const payload = segment.slice(4, JFIF_SEGMENT_BYTES);
  payload[12] = 0;
  payload[13] = 0;
  return jpegSegment(0xe0, payload);
};

const isStandaloneJpegMarker = (marker: number): boolean => marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7);

/** エントロピー符号化されたデータの終わり（次のマーカーの位置）を返す */
const endOfJpegScan = (bytes: Bytes, start: number): number => {
  let pos = start;
  while (pos + 1 < bytes.byteLength) {
    const next = bytes[pos + 1] ?? 0;
    if (bytes[pos] === 0xff && next !== 0x00 && next !== 0xff && !(next >= 0xd0 && next <= 0xd7)) return pos;
    pos++;
  }
  return bytes.byteLength;
};

const stripJpeg = (bytes: Bytes): Bytes | undefined => {
  const parts: Bytes[] = [bytes.subarray(0, 2)];
  let exifKept = false;
  let scanSeen = false;
  let pos = 2;
  while (pos + 2 <= bytes.byteLength) {
    if (bytes[pos] !== 0xff) {
      // マーカーの間のごみは読み飛ばす
      pos++;
      continue;
    }
    const marker = bytes[pos + 1] ?? 0;
    if (marker === 0xff) {
      pos++;
      continue;
    }
    if (marker === 0xd9) {
      // EOI より後ろに足されたデータ（別の画像や独自のメタデータ）は捨てる
      parts.push(bytes.subarray(pos, pos + 2));
      return scanSeen ? concat(parts) : undefined;
    }
    if (isStandaloneJpegMarker(marker)) {
      parts.push(bytes.subarray(pos, pos + 2));
      pos += 2;
      continue;
    }
    if (pos + 4 > bytes.byteLength) return undefined;
    const length = ((bytes[pos + 2] ?? 0) << 8) | (bytes[pos + 3] ?? 0);
    const end = pos + 2 + length;
    if (length < 2 || end > bytes.byteLength) return undefined;
    const segment = bytes.subarray(pos, end);
    const payload = segment.subarray(4);
    pos = end;

    if (marker === 0xe0) {
      if (startsWith(payload, JFIF)) parts.push(withoutJfifThumbnail(segment));
    } else if (marker === 0xe1) {
      const orientation = startsWith(payload, EXIF_HEADER)
        ? readOrientation(payload.subarray(EXIF_HEADER.byteLength))
        : undefined;
      if (orientation !== undefined && !exifKept) {
        exifKept = true;
        parts.push(jpegSegment(0xe1, concat([EXIF_HEADER, orientationTiff(orientation)])));
      }
    } else if (marker === 0xe2) {
      if (startsWith(payload, ICC_PROFILE)) parts.push(segment);
    } else if (marker === 0xee) {
      // Adobe のセグメントは色変換の方式を持つので、消すと色が変わる
      if (startsWith(payload, ADOBE)) parts.push(segment);
    } else if ((marker >= 0xe3 && marker <= 0xef) || marker === 0xfe) {
      // そのほかの APPn（IPTC など）とコメント
    } else {
      parts.push(segment);
    }

    if (marker === 0xda) {
      scanSeen = true;
      const scanEnd = endOfJpegScan(bytes, pos);
      parts.push(bytes.subarray(pos, scanEnd));
      pos = scanEnd;
    }
  }
  // EOI がなくても、画素まで読めていれば表示できるので返す
  return scanSeen ? concat(parts) : undefined;
};

// --- PNG ---

const PNG_SIGNATURE_BYTES = 8;

// 表示に関わるチャンクだけを残す。tEXt / zTXt / iTXt（XMP を含む）や tIME はここに無いので消える
const PNG_KEPT_CHUNKS: ReadonlySet<string> = new Set([
  ...['IHDR', 'PLTE', 'IDAT', 'IEND', 'tRNS'],
  ...['gAMA', 'cHRM', 'sRGB', 'iCCP', 'cICP', 'mDCV', 'cLLI', 'sBIT'],
  ...['bKGD', 'pHYs', 'hIST', 'sPLT'],
  ...['acTL', 'fcTL', 'fdAT'],
]);

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

const crc32 = (bytes: Bytes): number => {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};

const pngChunk = (type: string, data: Bytes): Bytes => {
  const typeAndData = concat([ascii(type), data]);
  const out = new Uint8Array(typeAndData.byteLength + 8);
  const view = viewOf(out);
  view.setUint32(0, data.byteLength);
  out.set(typeAndData, 4);
  view.setUint32(out.byteLength - 4, crc32(typeAndData));
  return out;
};

const stripPng = (bytes: Bytes): Bytes | undefined => {
  const view = viewOf(bytes);
  const parts: Bytes[] = [bytes.subarray(0, PNG_SIGNATURE_BYTES)];
  let exifKept = false;
  let pos = PNG_SIGNATURE_BYTES;
  while (pos + 12 <= bytes.byteLength) {
    const length = view.getUint32(pos);
    const end = pos + 12 + length;
    if (end > bytes.byteLength) return undefined;
    const type = String.fromCharCode(...bytes.subarray(pos + 4, pos + 8));
    if (PNG_KEPT_CHUNKS.has(type)) {
      parts.push(bytes.subarray(pos, end));
    } else if (type === 'eXIf' && !exifKept) {
      const orientation = readOrientation(bytes.subarray(pos + 8, pos + 8 + length));
      if (orientation !== undefined) {
        exifKept = true;
        parts.push(pngChunk('eXIf', orientationTiff(orientation)));
      }
    }
    // IEND より後ろに足されたデータは捨てる
    if (type === 'IEND') return concat(parts);
    pos = end;
  }
  return undefined;
};

// --- WebP ---

const WEBP_KEPT_CHUNKS: ReadonlySet<string> = new Set(['VP8 ', 'VP8L', 'VP8X', 'ALPH', 'ANIM', 'ANMF', 'ICCP']);
const VP8X_EXIF_FLAG = 0x08;
const VP8X_XMP_FLAG = 0x04;

const riffChunk = (fourCc: string, data: Bytes): Bytes => {
  const out = new Uint8Array(8 + data.byteLength + (data.byteLength % 2));
  out.set(ascii(fourCc), 0);
  viewOf(out).setUint32(4, data.byteLength, true);
  out.set(data, 8);
  return out;
};

type RiffChunk = Readonly<{ fourCc: string; data: Bytes }>;

const readRiffChunks = (bytes: Bytes): ReadonlyArray<RiffChunk> | undefined => {
  const view = viewOf(bytes);
  const riffEnd = Math.min(bytes.byteLength, 8 + view.getUint32(4, true));
  const chunks: RiffChunk[] = [];
  let pos = 12;
  while (pos + 8 <= riffEnd) {
    const size = view.getUint32(pos + 4, true);
    const end = pos + 8 + size;
    if (end > riffEnd) return undefined;
    chunks.push({
      fourCc: String.fromCharCode(...bytes.subarray(pos, pos + 4)),
      data: bytes.subarray(pos + 8, end),
    });
    pos = end + (size % 2);
  }
  return chunks;
};

const stripWebp = (bytes: Bytes): Bytes | undefined => {
  if (bytes.byteLength < 12) return undefined;
  const chunks = readRiffChunks(bytes);
  if (chunks === undefined) return undefined;
  // Exif と XMP を持てるのは VP8X で始まる拡張形式だけ
  const extended = chunks[0]?.fourCc === 'VP8X' && chunks[0].data.byteLength >= 10;
  const exif = extended ? chunks.find(({ fourCc }) => fourCc === 'EXIF')?.data : undefined;
  const orientation = exif === undefined
    ? undefined
    : readOrientation(startsWith(exif, EXIF_HEADER) ? exif.subarray(EXIF_HEADER.byteLength) : exif);

  const parts: Bytes[] = [];
  let exifKept = false;
  for (const [index, { fourCc, data }] of chunks.entries()) {
    if (index === 0 && extended) {
      const header = data.slice();
      const flags = (header[0] ?? 0) & ~(VP8X_EXIF_FLAG | VP8X_XMP_FLAG);
      header[0] = orientation === undefined ? flags : flags | VP8X_EXIF_FLAG;
      parts.push(riffChunk('VP8X', header));
    } else if (WEBP_KEPT_CHUNKS.has(fourCc)) {
      parts.push(riffChunk(fourCc, data));
    } else if (fourCc === 'EXIF' && orientation !== undefined && !exifKept) {
      exifKept = true;
      parts.push(riffChunk('EXIF', orientationTiff(orientation)));
    }
  }
  const body = concat(parts);
  const header = new Uint8Array(12);
  header.set(ascii('RIFF'), 0);
  viewOf(header).setUint32(4, 4 + body.byteLength, true);
  header.set(ascii('WEBP'), 8);
  return concat([header, body]);
};

// --- GIF ---

const GIF_KEPT_APPLICATIONS: ReadonlyArray<Bytes> = [
  // ループ回数
  ascii('NETSCAPE2.0'),
  ascii('ANIMEXTS1.0'),
  // ICC プロファイル
  ascii('ICCRGBG1012'),
];

const colorTableBytes = (packed: number): number => (packed & 0x80) === 0 ? 0 : 3 * 2 ** ((packed & 0x07) + 1);

/** 長さ 0 のブロックで終わるサブブロック列の、次の位置を返す */
const endOfGifSubBlocks = (bytes: Bytes, start: number): number | undefined => {
  let pos = start;
  while (pos < bytes.byteLength) {
    const size = bytes[pos] ?? 0;
    pos += 1 + size;
    if (size === 0) return pos;
  }
  return undefined;
};

const stripGif = (bytes: Bytes): Bytes | undefined => {
  if (bytes.byteLength < 13) return undefined;
  let pos = 13 + colorTableBytes(bytes[10] ?? 0);
  const parts: Bytes[] = [bytes.subarray(0, pos)];
  while (pos < bytes.byteLength) {
    const introducer = bytes[pos];
    if (introducer === 0x3b) {
      // トレーラーより後ろに足されたデータは捨てる
      parts.push(bytes.subarray(pos, pos + 1));
      return concat(parts);
    }
    if (introducer === 0x2c) {
      if (pos + 10 > bytes.byteLength) return undefined;
      // 画像記述子、ローカルカラーテーブル、LZW の最小符号長に続いて、画素のサブブロックが並ぶ
      const end = endOfGifSubBlocks(bytes, pos + 10 + colorTableBytes(bytes[pos + 9] ?? 0) + 1);
      if (end === undefined || end > bytes.byteLength) return undefined;
      parts.push(bytes.subarray(pos, end));
      pos = end;
      continue;
    }
    if (introducer !== 0x21) return undefined;
    const label = bytes[pos + 1];
    const end = endOfGifSubBlocks(bytes, pos + 2);
    if (end === undefined || end > bytes.byteLength) return undefined;
    // グラフィック制御とプレーンテキストは表示に関わる。コメントと、XMP などのアプリケーション拡張は消す
    const kept = label === 0xf9
      || label === 0x01
      || (label === 0xff && GIF_KEPT_APPLICATIONS.some((application) => startsWith(bytes, application, pos + 3)));
    if (kept) parts.push(bytes.subarray(pos, end));
    pos = end;
  }
  return undefined;
};

const STRIP: Readonly<Record<UploadImageMimeType, (bytes: Bytes) => Bytes | undefined>> = {
  'image/jpeg': stripJpeg,
  'image/png': stripPng,
  'image/gif': stripGif,
  'image/webp': stripWebp,
};

/**
 * 画像からメタデータを取り除いたバイト列を返す。
 * 構造を読めなかった画像は undefined を返す。
 */
export const stripImageMetadata = (bytes: Uint8Array, mimeType: UploadImageMimeType): Uint8Array | undefined =>
  STRIP[mimeType](bytes);
