import type { BotId } from './bot-id.ts';
import type { ChannelId } from './channel-id.ts';
import type { UserId } from './user-id.ts';

export type Config = Readonly<{
  targetChannels: ReadonlyArray<ChannelId>;
  selfBotId: BotId | undefined;
  selfUserId: UserId | undefined;
}>;
