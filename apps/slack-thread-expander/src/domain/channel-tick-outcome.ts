import { assertNever } from '../util/assert-never.ts';
import type { ChannelId } from './channel-id.ts';
import type { SlackApiError } from './slack-api-error.ts';
import type { SlackTs } from './slack-ts.ts';

export type InitializedTick = Readonly<{
  kind: 'Initialized';
  channel: ChannelId;
  initialTs: SlackTs;
}>;

export type DisabledTick = Readonly<{
  kind: 'Disabled';
  channel: ChannelId;
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

export type HistoryFailed = Readonly<{
  kind: 'HistoryFailed';
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
  skippedBroadcast: number;
  cursorFrom: SlackTs;
  cursorTo: SlackTs;
  errors: ReadonlyArray<SlackApiError>;
}>;

export type ChannelTickOutcome =
  | InitializedTick
  | DisabledTick
  | ChannelInfoFailed
  | ChannelNameMissing
  | SearchFailed
  | HistoryFailed
  | ProcessedTick;

const errorCount = (outcome: ChannelTickOutcome): number => {
  switch (outcome.kind) {
    case 'Initialized':
    case 'Disabled':
    case 'ChannelNameMissing':
      return 0;
    case 'ChannelInfoFailed':
    case 'SearchFailed':
    case 'HistoryFailed':
      return 1;
    case 'Processed':
      return outcome.errors.length;
    default:
      return assertNever(outcome);
  }
};

const onlyProcessed = <T>(getter: (p: ProcessedTick) => T, fallback: T) => (outcome: ChannelTickOutcome): T => {
  switch (outcome.kind) {
    case 'Initialized':
    case 'Disabled':
    case 'ChannelInfoFailed':
    case 'ChannelNameMissing':
    case 'SearchFailed':
    case 'HistoryFailed':
      return fallback;
    case 'Processed':
      return getter(outcome);
    default:
      return assertNever(outcome);
  }
};

const fetchedCount = onlyProcessed((p) => p.fetched, 0);
const expandedCount = onlyProcessed((p) => p.expanded, 0);
const skippedOwnCount = onlyProcessed((p) => p.skippedOwn, 0);
const skippedNoReplyCount = onlyProcessed((p) => p.skippedNoReply, 0);
const skippedBroadcastCount = onlyProcessed((p) => p.skippedBroadcast, 0);

export const ChannelTickOutcome = {
  errorCount,
  fetchedCount,
  expandedCount,
  skippedOwnCount,
  skippedNoReplyCount,
  skippedBroadcastCount,
} as const;
