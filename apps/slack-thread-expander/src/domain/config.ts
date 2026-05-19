import type { BotId } from './bot-id.ts';
import type { ChannelId } from './channel-id.ts';

export type Config = Readonly<{
  targetChannels: ReadonlyArray<ChannelId>;
  selfBotId: BotId | undefined;
}>;
