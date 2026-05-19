import type { ChannelId } from './channel-id.ts';
import type { SlackApiError } from './slack-api-error.ts';
import type { SlackTs } from './slack-ts.ts';

export type InitializedTick = Readonly<{
  kind: 'Initialized';
  channel: ChannelId;
  initialTs: SlackTs;
}>;

export type ChannelInfoFailed = Readonly<{
  kind: 'ChannelInfoFailed';
  channel: ChannelId;
  error: SlackApiError;
}>;

export type ChannelNameMissing = Readonly<{
  kind: 'ChannelNameMissing';
  channel: ChannelId;
}>;

export type SearchFailed = Readonly<{
  kind: 'SearchFailed';
  channel: ChannelId;
  channelName: string;
  error: SlackApiError;
}>;

export type ProcessedTick = Readonly<{
  kind: 'Processed';
  channel: ChannelId;
  channelName: string;
  fetched: number;
  candidates: number;
  expanded: number;
  skippedOwn: number;
  skippedNoReply: number;
  cursorFrom: SlackTs;
  cursorTo: SlackTs;
  errors: ReadonlyArray<SlackApiError>;
}>;

export type ChannelTickOutcome =
  | InitializedTick
  | ChannelInfoFailed
  | ChannelNameMissing
  | SearchFailed
  | ProcessedTick;

const errorCount = (outcome: ChannelTickOutcome): number => {
  switch (outcome.kind) {
    case 'Initialized':
    case 'ChannelNameMissing':
      return 0;
    case 'ChannelInfoFailed':
    case 'SearchFailed':
      return 1;
    case 'Processed':
      return outcome.errors.length;
  }
};

const fetchedCount = (outcome: ChannelTickOutcome): number => outcome.kind === 'Processed' ? outcome.fetched : 0;

const expandedCount = (outcome: ChannelTickOutcome): number => outcome.kind === 'Processed' ? outcome.expanded : 0;

const skippedOwnCount = (outcome: ChannelTickOutcome): number => outcome.kind === 'Processed' ? outcome.skippedOwn : 0;

const skippedNoReplyCount = (outcome: ChannelTickOutcome): number =>
  outcome.kind === 'Processed' ? outcome.skippedNoReply : 0;

export const ChannelTickOutcome = {
  errorCount,
  fetchedCount,
  expandedCount,
  skippedOwnCount,
  skippedNoReplyCount,
} as const;
