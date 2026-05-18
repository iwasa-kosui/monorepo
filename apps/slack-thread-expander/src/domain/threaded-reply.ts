import type { SlackMessage } from '../slack/schema.ts';

export type ThreadedReplyRef = {
  channel: string;
  ts: string;
};

/**
 * 元実装の find_threaded_message と等価なロジック。
 * スレッド返信のうち、本流ブロードキャストではないものだけを抽出する。
 */
export const findThreadedReply = (
  channel: string,
  message: SlackMessage,
): ThreadedReplyRef | null => {
  if (message.thread_ts == null) {
    return null;
  }
  if (message.thread_ts === message.ts) {
    return null;
  }
  const subtype = message.subtype;
  if (subtype != null && subtype !== 'file_share') {
    return null;
  }
  return { channel, ts: message.ts };
};

/**
 * Bot 自身が投稿した permalink メッセージを除外するためのガード。
 * find_threaded_reply の手前で適用する想定。
 */
export const isOwnPost = (
  message: SlackMessage,
  selfBotId: string | undefined,
): boolean => {
  if (selfBotId == null) return false;
  return message.bot_id === selfBotId;
};
