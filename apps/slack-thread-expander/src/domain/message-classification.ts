import type { BotId } from './bot-id.ts';
import type { ChannelId } from './channel-id.ts';
import type { Permalink } from './permalink.ts';
import type { SlackMessage } from './slack-message.ts';
import type { SlackTs } from './slack-ts.ts';

export type OwnPost = Readonly<{ kind: 'OwnPost' }>;
export type NotThreaded = Readonly<{ kind: 'NotThreaded' }>;
export type ThreadRoot = Readonly<{ kind: 'ThreadRoot' }>;
export type IgnoredSubtype = Readonly<{ kind: 'IgnoredSubtype'; subtype: string }>;
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
  | ThreadedReply;

const classify = (
  message: SlackMessage,
  selfBotId: BotId | undefined,
): MessageClassification => {
  if (selfBotId != null && message.botId === selfBotId) {
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
