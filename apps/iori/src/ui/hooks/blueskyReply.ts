import { isMastodonApiError } from '../api/mastodonClient.ts';

export const BLUESKY_REPLY_MAX_GRAPHEMES = 300;

const EXCERPT_GRAPHEMES = 80;

const segmenter = new Intl.Segmenter('und', { granularity: 'grapheme' });

const graphemesOf = (text: string): string[] => Array.from(segmenter.segment(text), (part) => part.segment);

export const countGraphemes = (text: string): number => graphemesOf(text).length;

export const blueskyReplyRemaining = (text: string): number =>
  BLUESKY_REPLY_MAX_GRAPHEMES - countGraphemes(text.trim());

export const canSendBlueskyReply = (text: string, isSending: boolean): boolean =>
  !isSending && text.trim() !== '' && blueskyReplyRemaining(text) >= 0;

export const BLUESKY_MAX_IMAGES = 4;

export const canSendBlueskyPost = (
  text: string,
  imageCount: number,
  state: Readonly<{ isSending: boolean; isUploading: boolean }>,
): boolean =>
  !state.isSending
  && !state.isUploading
  && blueskyReplyRemaining(text) >= 0
  && (text.trim() !== '' || imageCount > 0);

export const blueskyReplyExcerpt = (text: string): string => {
  const graphemes = graphemesOf(text);
  return graphemes.length <= EXCERPT_GRAPHEMES ? text : `${graphemes.slice(0, EXCERPT_GRAPHEMES).join('')}…`;
};

export const blueskyReplyErrorMessage = (error: unknown): string => {
  if (isMastodonApiError(error)) {
    if (error.status === 404) return '返信先の投稿が見つかりません';
    if (error.status === 409) return 'Bluesky のタイムラインが無効です';
    if (error.status === 422) return 'この投稿には返信できません';
  }
  return 'Bluesky に返信できませんでした';
};
