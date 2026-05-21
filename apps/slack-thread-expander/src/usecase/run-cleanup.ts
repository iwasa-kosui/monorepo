import { ChannelCleanupOutcome } from '../domain/channel-cleanup-outcome.ts';
import type { ClockPort } from '../domain/clock-port.ts';
import type { Config } from '../domain/config.ts';
import type { LockPort } from '../domain/lock-port.ts';
import type { LoggerPort } from '../domain/logger-port.ts';
import { SlackApiError } from '../domain/slack-api-error.ts';
import type { SlackPort } from '../domain/slack-port.ts';
import { assertNever } from '../util/assert-never.ts';
import { cleanupChannel } from './cleanup-channel.ts';

export type RunCleanupDeps = Readonly<{
  slack: SlackPort;
  clock: ClockPort;
  lock: LockPort;
  logger: LoggerPort;
}>;

const formatOutcomeSummary = (outcome: ChannelCleanupOutcome): string => {
  switch (outcome.kind) {
    case 'SkippedMissingSelfBotId':
      return `[${outcome.channel}] summary: skipped (SELF_BOT_ID missing)`;
    case 'ListFailed':
      return `[${outcome.channel}] summary: conversations.history failed - ${SlackApiError.format(outcome.error)}`;
    case 'Processed':
      return `[${outcome.channel}] summary: scanned=${outcome.scanned} deleted=${outcome.deleted} failed=${outcome.failures.length}${
        outcome.truncated ? ' (truncated)' : ''
      }`;
    default:
      return assertNever(outcome);
  }
};

const sum = (
  outcomes: ReadonlyArray<ChannelCleanupOutcome>,
  pick: (o: ChannelCleanupOutcome) => number,
): number => outcomes.reduce((acc, o) => acc + pick(o), 0);

const runBody = (deps: RunCleanupDeps, config: Config): void => {
  const startMs = deps.clock.nowMs();
  if (config.targetChannels.length === 0) {
    deps.logger.warn(
      'TARGET_CHANNELS is empty. Set channel IDs (comma-separated) in Script Properties.',
    );
    return;
  }
  if (config.selfBotId == null) {
    deps.logger.warn(
      'SELF_BOT_ID is not configured. Cleanup requires it to identify the bot\'s own posts.',
    );
    return;
  }
  deps.logger.info(
    `cleanup start: channels=[${config.targetChannels.join(',')}] selfBotId=${config.selfBotId}`,
  );

  const cleanup = cleanupChannel({ slack: deps.slack, logger: deps.logger });

  const outcomes = config.targetChannels.map((channel) => {
    const outcome = cleanup(channel, config.selfBotId);
    deps.logger.info(formatOutcomeSummary(outcome));
    return outcome;
  });

  const totalScanned = sum(outcomes, ChannelCleanupOutcome.scannedCount);
  const totalDeleted = sum(outcomes, ChannelCleanupOutcome.deletedCount);
  const totalFailed = sum(outcomes, ChannelCleanupOutcome.failureCount);
  const totalListErrors = sum(outcomes, ChannelCleanupOutcome.listErrorCount);
  const elapsedMs = deps.clock.nowMs() - startMs;

  deps.logger.info(
    `cleanup end: channels=${config.targetChannels.length} scanned=${totalScanned} deleted=${totalDeleted} failed=${totalFailed} listErrors=${totalListErrors} elapsedMs=${elapsedMs}`,
  );
};

export const runCleanup = (deps: RunCleanupDeps) => (config: Config): void => {
  const acquired = deps.lock.tryRun(() => runBody(deps, config));
  if (!acquired) {
    deps.logger.info('previous tick still running; skip cleanup');
  }
};
