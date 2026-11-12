import type { Status } from '../../adaptor/mastodon/entities.ts';
import { isMastodonApiError, type StatusSourceText } from '../api/mastodonClient.ts';

export type EditFormValue = Readonly<{
  content: string;
  cw: string;
  sensitive: boolean;
}>;

export type EditLoadState = 'loading' | 'loaded' | 'failed';

export const initialEditValue = (source: StatusSourceText, status: Status): EditFormValue => ({
  content: source.text,
  cw: source.spoiler_text,
  sensitive: source.spoiler_text === '' ? status.sensitive : false,
});

export const hasEditableImages = (status: Status): boolean => status.media_attachments.length > 0;

export const canSendEdit = (
  content: string,
  hasImages: boolean,
  loadState: EditLoadState,
  isSending: boolean,
): boolean => loadState === 'loaded' && !isSending && (content.trim() !== '' || hasImages);

export const editLoadErrorMessage = (error: unknown): string =>
  isMastodonApiError(error) && error.status === 404
    ? '編集する投稿が見つかりません'
    : '編集する内容を読み込めませんでした';

export const editErrorMessage = (error: unknown): string => {
  if (isMastodonApiError(error)) {
    if (error.status === 404) return '編集する投稿が見つかりません';
    if (error.status === 422) {
      if (error.message.includes('new recipients')) {
        return 'ダイレクトの投稿には宛先を足せません';
      }
      return '投稿を更新できません。本文が空でないか、文字数が上限を超えていないか確認してください';
    }
  }
  return '編集できませんでした';
};
