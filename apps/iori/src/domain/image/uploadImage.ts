import { Result } from '@iwasa-kosui/result';

export const UPLOAD_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

export type UploadImageMimeType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

const startsWith = (bytes: Uint8Array, signature: ReadonlyArray<number>, offset = 0): boolean =>
  signature.every((value, index) => bytes[offset + index] === value);

const ascii = (text: string): ReadonlyArray<number> => [...text].map((char) => char.charCodeAt(0));

export const detectUploadImageMimeType = (bytes: Uint8Array): UploadImageMimeType | undefined => {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(bytes, ascii('GIF87a')) || startsWith(bytes, ascii('GIF89a'))) return 'image/gif';
  if (startsWith(bytes, ascii('RIFF')) && startsWith(bytes, ascii('WEBP'), 8)) return 'image/webp';
  return undefined;
};

export type InvalidUploadImageError = Readonly<{
  type: 'InvalidUploadImageError';
  message: string;
  detail: { reason: 'empty' | 'tooLarge' | 'unsupportedFormat' };
}>;

export const InvalidUploadImageError = {
  create: (reason: InvalidUploadImageError['detail']['reason']): InvalidUploadImageError => ({
    type: 'InvalidUploadImageError',
    message: {
      empty: 'The file is empty',
      tooLarge: 'The file is too large. Max size: 5MB',
      unsupportedFormat: 'Unsupported file type. Allowed: JPEG, PNG, GIF, WebP',
    }[reason],
    detail: { reason },
  }),
} as const;

export const UploadImage = {
  validate: (bytes: Uint8Array): Result<UploadImageMimeType, InvalidUploadImageError> => {
    if (bytes.byteLength === 0) return Result.err(InvalidUploadImageError.create('empty'));
    if (bytes.byteLength > UPLOAD_IMAGE_MAX_BYTES) return Result.err(InvalidUploadImageError.create('tooLarge'));
    const mimeType = detectUploadImageMimeType(bytes);
    return mimeType === undefined
      ? Result.err(InvalidUploadImageError.create('unsupportedFormat'))
      : Result.ok(mimeType);
  },
} as const;
