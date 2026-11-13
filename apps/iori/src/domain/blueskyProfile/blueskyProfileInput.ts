import { Result } from '@iwasa-kosui/result';

export const BLUESKY_PROFILE_DISPLAY_NAME_MAX_GRAPHEMES = 64;
export const BLUESKY_PROFILE_DISPLAY_NAME_MAX_BYTES = 640;
export const BLUESKY_PROFILE_DESCRIPTION_MAX_GRAPHEMES = 256;
export const BLUESKY_PROFILE_DESCRIPTION_MAX_BYTES = 2560;
export const BLUESKY_PROFILE_IMAGE_MAX_BYTES = 1_000_000;
export const BLUESKY_PROFILE_IMAGE_MIME_TYPES: readonly string[] = ['image/jpeg', 'image/png'];

const IMAGE_SIGNATURES: Readonly<Record<string, readonly number[]>> = {
  'image/jpeg': [0xff, 0xd8, 0xff],
  'image/png': [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
};

export type BlueskyProfileInvalid = Readonly<{ type: 'BlueskyProfileInvalid'; reason: string }>;

export type BlueskyProfileImageInput = Readonly<{ bytes: Uint8Array; mimeType: string }>;

export type BlueskyProfileInput = Readonly<{
  displayName: string;
  description: string;
  avatar?: BlueskyProfileImageInput | undefined;
  banner?: BlueskyProfileImageInput | undefined;
}>;

export type ValidBlueskyProfileText = Readonly<{ displayName: string; description: string }>;

const segmenter = new Intl.Segmenter('ja', { granularity: 'grapheme' });
const encoder = new TextEncoder();

const graphemeCountOf = (text: string): number => Array.from(segmenter.segment(text)).length;

const invalid = (reason: string): Result<never, BlueskyProfileInvalid> =>
  Result.err({ type: 'BlueskyProfileInvalid', reason });

const textProblem = (
  label: string,
  text: string,
  maxGraphemes: number,
  maxBytes: number,
): string | undefined => {
  if (graphemeCountOf(text) > maxGraphemes) return `${label}は${maxGraphemes}文字以内にしてください`;
  if (encoder.encode(text).byteLength > maxBytes) return `${label}が長すぎます（UTF-8 で${maxBytes}バイト以内）`;
  return undefined;
};

const imageProblem = (label: string, image: BlueskyProfileImageInput | undefined): string | undefined => {
  if (image === undefined) return undefined;
  if (!BLUESKY_PROFILE_IMAGE_MIME_TYPES.includes(image.mimeType)) return `${label}の画像は JPEG か PNG にしてください`;
  const signature = IMAGE_SIGNATURES[image.mimeType] ?? [];
  if (image.bytes.byteLength > 0 && !signature.every((byte, index) => image.bytes[index] === byte)) {
    return `${label}の画像は JPEG か PNG にしてください`;
  }
  if (image.bytes.byteLength === 0) return `${label}の画像が空です`;
  if (image.bytes.byteLength > BLUESKY_PROFILE_IMAGE_MAX_BYTES) {
    return `${label}の画像は1MB以下にしてください`;
  }
  return undefined;
};

const validate = (input: BlueskyProfileInput): Result<ValidBlueskyProfileText, BlueskyProfileInvalid> => {
  const displayName = input.displayName.trim();
  const description = input.description.trim();
  const problem = textProblem(
    '表示名',
    displayName,
    BLUESKY_PROFILE_DISPLAY_NAME_MAX_GRAPHEMES,
    BLUESKY_PROFILE_DISPLAY_NAME_MAX_BYTES,
  ) ?? textProblem(
    '自己紹介',
    description,
    BLUESKY_PROFILE_DESCRIPTION_MAX_GRAPHEMES,
    BLUESKY_PROFILE_DESCRIPTION_MAX_BYTES,
  ) ?? imageProblem('アバター', input.avatar) ?? imageProblem('バナー', input.banner);
  return problem === undefined ? Result.ok({ displayName, description }) : invalid(problem);
};

export const BlueskyProfileInput = {
  validate,
} as const;
