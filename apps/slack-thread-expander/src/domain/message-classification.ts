import type { BotId } from './bot-id.ts';
import type { ChannelId } from './channel-id.ts';
import type { Permalink } from './permalink.ts';
import type { SlackMessage } from './slack-message.ts';
import type { SlackTs } from './slack-ts.ts';

export type OwnPost = Readonly<{ kind: 'OwnPost' }>;
export type NotThreaded = Readonly<{ kind: 'NotThreaded' }>;
export type ThreadRoot = Readonly<{ kind: 'ThreadRoot' }>;
export type IgnoredSubtype = Readonly<{ kind: 'IgnoredSubtype'; subtype: string }>;
export type ThreadBroadcast = Readonly<{ kind: 'ThreadBroadcast' }>;
export type ThreadedReply = Readonly<{
  kind: 'ThreadedReply';
  channel: ChannelId;
  ts: SlackTs;
  permalink: Permalink;
}>;

export type MessageClassification =
  | OwnPost
  | NotThreaded
  | ThreadRoot
  | IgnoredSubtype
  | ThreadBroadcast
  | ThreadedReply;

export type ClassifyContext = Readonly<{
  selfBotId: BotId | undefined;
  // conversations.history が返したチャンネル本流の ts 集合。
  // thread_broadcast はチャンネル本流にも複製されて並ぶため、threadTs !== ts なメッセージで
  // ts がこの集合に含まれていれば thread_broadcast とみなして展開対象から除外する。
  topLevelTs: ReadonlySet<SlackTs>;
}>;

const classify = (
  message: SlackMessage,
  context: ClassifyContext,
): MessageClassification => {
  if (context.selfBotId != null && message.botId === context.selfBotId) {
    return { kind: 'OwnPost' };
  }
  if (message.threadTs == null) {
    return { kind: 'NotThreaded' };
  }
  if (message.threadTs === message.ts) {
    return { kind: 'ThreadRoot' };
  }
  if (message.subtype != null && message.subtype !== 'file_share') {
    return { kind: 'IgnoredSubtype', subtype: message.subtype };
  }
  // search.messages はブロードキャスト投稿で subtype を欠落させることがあるため、
  // 本流 ts との突き合わせで補完的に thread_broadcast を検出する。
  if (context.topLevelTs.has(message.ts)) {
    return { kind: 'ThreadBroadcast' };
  }
  return {
    kind: 'ThreadedReply',
    channel: message.channel,
    ts: message.ts,
    permalink: message.permalink,
  };
};

export const MessageClassification = {
  classify,
  isThreadedReply: (c: MessageClassification) => c.kind === 'ThreadedReply',
  isOwnPost: (c: MessageClassification) => c.kind === 'OwnPost',
} as const;
