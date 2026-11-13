export const BLUESKY_DISPLAY_NAME_MAX_GRAPHEMES = 64;
export const BLUESKY_DESCRIPTION_MAX_GRAPHEMES = 256;
export const BLUESKY_PROFILE_IMAGE_MAX_BYTES = 1_000_000;

const BLUESKY_PROFILE_IMAGE_TYPES: ReadonlySet<string> = new Set(['image/jpeg', 'image/png']);

const segmenter = new Intl.Segmenter('ja', { granularity: 'grapheme' });

export const countGraphemes = (text: string): number => {
  let count = 0;
  for (const _ of segmenter.segment(text)) count++;
  return count;
};

export const isWithinGraphemeLimit = (text: string, max: number): boolean => countGraphemes(text) <= max;

export const graphemeCounterLabel = (text: string, max: number): string => {
  const count = countGraphemes(text);
  return count > max ? `${count - max} 文字超えています` : `残り ${max - count} 文字`;
};

export const blueskyProfileImageProblem = (
  file: Readonly<{ type: string; size: number }>,
  label: string,
): string | undefined => {
  if (!BLUESKY_PROFILE_IMAGE_TYPES.has(file.type)) return `${label}は JPEG か PNG の画像を選んでください`;
  if (file.size > BLUESKY_PROFILE_IMAGE_MAX_BYTES) return `${label}は 1MB 以下の画像にしてください`;
  return undefined;
};

export const selectedImageFile = (value: FormDataEntryValue | null): File | undefined =>
  value instanceof File && value.size > 0 ? value : undefined;

export type BlueskyProfileSubmission = Readonly<{
  displayName: string;
  description: string;
  avatar: File | undefined;
  banner: File | undefined;
  removeAvatar: boolean;
  removeBanner: boolean;
  swapCid: string | null;
}>;

export const buildBlueskyProfileFormData = (input: BlueskyProfileSubmission): FormData => {
  const body = new FormData();
  body.append('display_name', input.displayName);
  body.append('description', input.description);
  body.append('swap_cid', input.swapCid ?? '');
  if (input.avatar !== undefined && input.avatar.size > 0) body.append('avatar', input.avatar);
  else if (input.removeAvatar) body.append('remove_avatar', 'true');
  if (input.banner !== undefined && input.banner.size > 0) body.append('banner', input.banner);
  else if (input.removeBanner) body.append('remove_banner', 'true');
  return body;
};

export type BlueskyProfileFormValues = Readonly<{ displayName: string; description: string }>;

type EditableBlueskyProfile = Readonly<{ displayName: string | null; description: string | null; cid: string | null }>;

export type BlueskyProfileEditState<P extends EditableBlueskyProfile> = Readonly<{
  profile: P;
  form: BlueskyProfileFormValues;
}>;

export const editStateOfLoaded = <P extends EditableBlueskyProfile>(loaded: P): BlueskyProfileEditState<P> => ({
  profile: loaded,
  form: { displayName: loaded.displayName ?? '', description: loaded.description ?? '' },
});

export const editStateAfterSave = <P extends EditableBlueskyProfile>(
  current: BlueskyProfileEditState<P>,
  saved: Readonly<{ cid: string }>,
  refetched: P | undefined,
): BlueskyProfileEditState<P> => ({
  profile: refetched ?? { ...current.profile, cid: saved.cid },
  form: current.form,
});
