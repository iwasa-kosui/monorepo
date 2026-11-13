import { isMastodonApiError } from '../api/mastodonClient.ts';

export const blueskyQuoteErrorMessage = (error: unknown): string => {
  if (isMastodonApiError(error)) {
    if (error.status === 404) return '引用する投稿が見つかりません';
    if (error.status === 409) return 'Bluesky のタイムラインが無効です';
    if (error.status === 422 && error.code === 'media_invalid') return error.message;
    if (error.status === 422) return 'この投稿は引用できません';
  }
  return 'Bluesky に引用できませんでした';
};
