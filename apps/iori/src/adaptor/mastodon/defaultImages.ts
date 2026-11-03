export const DEFAULT_AVATAR_PATH = '/default-avatar.png';
export const DEFAULT_HEADER_PATH = '/default-header.png';

export const defaultImageUrls = (
  requestUrl: string,
): Readonly<{ defaultAvatarUrl: string; defaultHeaderUrl: string }> => ({
  defaultAvatarUrl: new URL(DEFAULT_AVATAR_PATH, requestUrl).href,
  defaultHeaderUrl: new URL(DEFAULT_HEADER_PATH, requestUrl).href,
});
