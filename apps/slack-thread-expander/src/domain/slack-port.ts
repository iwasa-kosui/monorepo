import type { Result } from '@praha/byethrow';

import type { ChannelId } from './channel-id.ts';
import type { SlackApiError } from './slack-api-error.ts';
import type { SlackMessage } from './slack-message.ts';
import type { SlackTs } from './slack-ts.ts';

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

export type ChannelTopLevelTsQuery = Readonly<{
  channel: ChannelId;
  oldest: SlackTs;
}>;

export type ChannelTopLevelTsResult = Readonly<{
  topLevelTs: ReadonlyArray<SlackTs>;
  truncated: boolean;
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
}>;
