import { assertNever } from '../util/assert-never.ts';
import type { ChannelId } from './channel-id.ts';
import type { SlackApiError } from './slack-api-error.ts';
import type { SlackTs } from './slack-ts.ts';

export type CleanupSkippedMissingSelfBotId = Readonly<{
  kind: 'SkippedMissingSelfBotId';
  channel: ChannelId;
}>;

export type CleanupListFailed = Readonly<{
  kind: 'ListFailed';
  channel: ChannelId;
  error: SlackApiError;
}>;

export type CleanupDeleteFailure = Readonly<{
  ts: SlackTs;
  error: SlackApiError;
}>;

export type CleanupProcessed = Readonly<{
  kind: 'Processed';
  channel: ChannelId;
  scanned: number;
  deleted: number;
  truncated: boolean;
  failures: ReadonlyArray<CleanupDeleteFailure>;
}>;

export type ChannelCleanupOutcome =
  | CleanupSkippedMissingSelfBotId
  | CleanupListFailed
  | CleanupProcessed;

const onlyProcessed = <T>(getter: (p: CleanupProcessed) => T, fallback: T) => (outcome: ChannelCleanupOutcome): T => {
  switch (outcome.kind) {
    case 'SkippedMissingSelfBotId':
    case 'ListFailed':
      return fallback;
    case 'Processed':
      return getter(outcome);
    default:
      return assertNever(outcome);
  }
};

const scannedCount = onlyProcessed((p) => p.scanned, 0);
const deletedCount = onlyProcessed((p) => p.deleted, 0);
const failureCount = onlyProcessed((p) => p.failures.length, 0);

const listErrorCount = (outcome: ChannelCleanupOutcome): number => {
  switch (outcome.kind) {
    case 'SkippedMissingSelfBotId':
    case 'Processed':
      return 0;
    case 'ListFailed':
      return 1;
    default:
      return assertNever(outcome);
  }
};

export const ChannelCleanupOutcome = {
  scannedCount,
  deletedCount,
  failureCount,
  listErrorCount,
} as const;
