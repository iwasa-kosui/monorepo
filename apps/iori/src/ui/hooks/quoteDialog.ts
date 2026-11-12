import { isMastodonApiError } from '../api/mastodonClient.ts';

export const canSendQuote = (content: string, isSending: boolean): boolean => !isSending && content.trim() !== '';

export const quoteErrorMessage = (error: unknown): string => {
  if (isMastodonApiError(error)) {
    if (error.status === 404) return '引用する投稿が見つかりません';
    if (error.status === 422) return 'この投稿は引用できません';
  }
  return '引用できませんでした';
};
