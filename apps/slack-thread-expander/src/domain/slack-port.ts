import type { Result } from '@praha/byethrow';

import type { ChannelId } from './channel-id.ts';
import type { SlackApiError } from './slack-api-error.ts';
import type { SlackMessage } from './slack-message.ts';

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

export type SlackPort = Readonly<{
  getChannelName: (channel: ChannelId) => Result.Result<string | undefined, SlackApiError>;
  searchMessages: (
    query: SearchMessagesQuery,
  ) => Result.Result<SearchMessagesResult, SlackApiError>;
  postMessage: (input: PostMessageInput) => Result.Result<void, SlackApiError>;
}>;
