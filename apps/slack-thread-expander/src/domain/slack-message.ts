import type { BotId } from './bot-id.ts';
import type { ChannelId } from './channel-id.ts';
import type { Permalink } from './permalink.ts';
import type { SlackTs } from './slack-ts.ts';
import type { UserId } from './user-id.ts';

export type SlackMessage = Readonly<{
  channel: ChannelId;
  ts: SlackTs;
  threadTs: SlackTs | undefined;
  subtype: string | undefined;
  userId: UserId | undefined;
  botId: BotId | undefined;
  permalink: Permalink;
  text: string | undefined;
}>;
