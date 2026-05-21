import type { Result } from '@praha/byethrow';

import type { BotId } from './bot-id.ts';
import type { ChannelId } from './channel-id.ts';
import type { SlackApiError } from './slack-api-error.ts';
import type { SlackMessage } from './slack-message.ts';
import type { SlackTs } from './slack-ts.ts';
import type { UserId } from './user-id.ts';

export type SearchMessagesQuery = Readonly<{
  channelName: string;
  afterDate: string;
}>;

export type SearchMessagesResult = Readonly<{
  matches: ReadonlyArray<SlackMessage>;
  apiTotal: number | undefined;
}>;

export type PostMessageInput = Readonly<{
  channel: ChannelId;
  text: string;
}>;

export type DeleteMessageInput = Readonly<{
  channel: ChannelId;
  ts: SlackTs;
}>;

export type ChannelTopLevelTsQuery = Readonly<{
  channel: ChannelId;
  oldest: SlackTs;
}>;

export type ChannelTopLevelTsResult = Readonly<{
  topLevelTs: ReadonlyArray<SlackTs>;
  truncated: boolean;
}>;

export type ListBotMessagesQuery = Readonly<{
  channel: ChannelId;
  botId: BotId;
}>;

export type ListBotMessagesResult = Readonly<{
  ts: ReadonlyArray<SlackTs>;
  truncated: boolean;
}>;

export type AuthIdentity = Readonly<{
  botId: BotId | undefined;
  userId: UserId | undefined;
  user: string | undefined;
  team: string | undefined;
  teamId: string | undefined;
  url: string | undefined;
}>;

export type SlackPort = Readonly<{
  getChannelName: (channel: ChannelId) => Result.Result<string | undefined, SlackApiError>;
  searchMessages: (
    query: SearchMessagesQuery,
  ) => Result.Result<SearchMessagesResult, SlackApiError>;
  getChannelTopLevelTs: (
    query: ChannelTopLevelTsQuery,
  ) => Result.Result<ChannelTopLevelTsResult, SlackApiError>;
  postMessage: (input: PostMessageInput) => Result.Result<void, SlackApiError>;
  listChannelBotMessages: (
    query: ListBotMessagesQuery,
  ) => Result.Result<ListBotMessagesResult, SlackApiError>;
  deleteMessage: (input: DeleteMessageInput) => Result.Result<void, SlackApiError>;
  authTest: () => Result.Result<AuthIdentity, SlackApiError>;
}>;
