// 投稿画像をアップロード前に縮小・再圧縮する。
// Bluesky のクロスポストは 1 枚 1,000,000 bytes（app.bsky.embed.images の lexicon）を超える画像を添付できないため、
// ブラウザ側でこの上限に収め、Bluesky でも画像として表示されるようにする。

export const UPLOAD_TARGET_BYTES = 950_000;
export const UPLOAD_MAX_LONG_EDGE = 2048;
const QUALITIES = [0.85, 0.75, 0.65] as const;
const SHRINK_RATIO = 0.8;
const MAX_SHRINK_STEPS = 6;
const MIN_LONG_EDGE = 320;

export type Size = Readonly<{ width: number; height: number }>;

export type Encode = (size: Size, quality: number) => Promise<Blob | null>;

export const fitWithin = (size: Size, maxLongEdge: number): Size => {
  const scale = Math.min(1, maxLongEdge / Math.max(size.width, size.height));
  return {
    width: Math.max(1, Math.round(size.width * scale)),
    height: Math.max(1, Math.round(size.height * scale)),
  };
};

/**
 * 長辺を UPLOAD_MAX_LONG_EDGE に収めた上で、品質→寸法の順に落として targetBytes 以下の JPEG を探す。
 * 上限に収まらなかった場合も、得られた中で最小のものを返す。
 */
export const shrinkToFit = async (
  original: Size,
  encode: Encode,
  targetBytes: number = UPLOAD_TARGET_BYTES,
): Promise<Blob | undefined> => {
  let size = fitWithin(original, UPLOAD_MAX_LONG_EDGE);
  let smallest: Blob | undefined;
  for (let step = 0; step <= MAX_SHRINK_STEPS; step++) {
    for (const quality of QUALITIES) {
      const blob = await encode(size, quality);
      if (blob === null) continue;
      if (smallest === undefined || blob.size < smallest.size) smallest = blob;
      if (blob.size <= targetBytes) return blob;
    }
    const longEdge = Math.max(size.width, size.height);
    if (longEdge * SHRINK_RATIO < MIN_LONG_EDGE) break;
    size = fitWithin(size, Math.floor(longEdge * SHRINK_RATIO));
  }
  return smallest;
};

const RESIZABLE_TYPES: ReadonlySet<string> = new Set(['image/jpeg', 'image/png', 'image/webp']);

export const needsDownscale = (file: Readonly<{ type: string; size: number }>, size?: Size): boolean => {
  // GIF はアニメーションを壊さないためそのまま送る
  if (!RESIZABLE_TYPES.has(file.type)) return false;
  if (file.size > UPLOAD_TARGET_BYTES) return true;
  return size !== undefined && Math.max(size.width, size.height) > UPLOAD_MAX_LONG_EDGE;
};

const jpegName = (name: string): string => `${name.replace(/\.[^./]+$/, '') || 'image'}.jpg`;

/**
 * ブラウザ上で画像を縮小する。デコードやエンコードに失敗した場合は元のファイルをそのまま返す。
 */
export const downscaleImageForUpload = async (file: File): Promise<File> => {
  if (!RESIZABLE_TYPES.has(file.type)) return file;
  let bitmap: ImageBitmap | undefined;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const original = { width: bitmap.width, height: bitmap.height };
    if (!needsDownscale(file, original)) return file;
    const source = bitmap;
    const canvas = document.createElement('canvas');
    const encode: Encode = (size, quality) => {
      canvas.width = size.width;
      canvas.height = size.height;
      const context = canvas.getContext('2d');
      if (context === null) return Promise.resolve(null);
      // JPEG は透過を持てないので白で塗ってから描く
      context.fillStyle = '#fff';
      context.fillRect(0, 0, size.width, size.height);
      context.imageSmoothingQuality = 'high';
      context.drawImage(source, 0, 0, size.width, size.height);
      return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    };
    const blob = await shrinkToFit(original, encode);
    if (blob === undefined || blob.size >= file.size) return file;
    return new File([blob], jpegName(file.name), { type: 'image/jpeg', lastModified: file.lastModified });
  } catch {
    return file;
  } finally {
    bitmap?.close();
  }
};
