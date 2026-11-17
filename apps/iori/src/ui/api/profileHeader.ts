import { DEFAULT_HEADER_PATH } from '../../adaptor/mastodon/defaultImages.ts';
import { safeUrl } from '../../helper/safeUrl.ts';

const isDefaultHeader = (header: string): boolean => {
  try {
    return new URL(header, 'https://base.invalid').pathname === DEFAULT_HEADER_PATH;
  } catch {
    return false;
  }
};

/** プロフィールに表示するヘッダー画像。未設定のときに API が返す既定の画像は表示しない */
export const profileHeaderUrl = (header: string): string | undefined => {
  const url = safeUrl(header);
  return url !== undefined && !isDefaultHeader(url) ? url : undefined;
};
