export const EMOJI_IMAGE_URL_MAX_LENGTH = 2048;

const isAcceptable = (value: string): boolean => {
  if (value.length === 0 || value.length > EMOJI_IMAGE_URL_MAX_LENGTH) return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
};

export const toAcceptableEmojiImageUrl = (value: string | null | undefined): string | null =>
  value != null && isAcceptable(value) ? value : null;
