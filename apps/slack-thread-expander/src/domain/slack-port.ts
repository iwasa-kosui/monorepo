import type { Result } from '@iwasa-kosui/result';

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
  getChannelName: (channel: ChannelId) => Result<string | undefined, SlackApiError>;
  searchMessages: (
    query: SearchMessagesQuery,
  ) => Result<SearchMessagesResult, SlackApiError>;
  postMessage: (input: PostMessageInput) => Result<void, SlackApiError>;
}>;
