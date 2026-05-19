import { ChannelTickOutcome } from '../domain/channel-tick-outcome.ts';
import type { ClockPort } from '../domain/clock-port.ts';
import type { Config } from '../domain/config.ts';
import type { CursorPort } from '../domain/cursor-port.ts';
import type { LockPort } from '../domain/lock-port.ts';
import type { LoggerPort } from '../domain/logger-port.ts';
import { SlackApiError } from '../domain/slack-api-error.ts';
import type { SlackPort } from '../domain/slack-port.ts';
import { assertNever } from '../util/assert-never.ts';
import { expandChannel } from './expand-channel.ts';

export type RunTickDeps = Readonly<{
  slack: SlackPort;
  cursor: CursorPort;
  clock: ClockPort;
  lock: LockPort;
  logger: LoggerPort;
}>;

const formatOutcomeSummary = (outcome: ChannelTickOutcome): string => {
  switch (outcome.kind) {
    case 'Initialized':
      return `[${outcome.channel}] summary: initialized lastTs=${outcome.initialTs}`;
    case 'ChannelInfoFailed':
      return `[${outcome.channel}] summary: conversations.info failed - ${SlackApiError.format(outcome.error)}`;
    case 'ChannelNameMissing':
      return `[${outcome.channel}] summary: channel name missing`;
    case 'SearchFailed':
      return `[${outcome.channel} #${outcome.channelName}] summary: search.messages failed - ${
        SlackApiError.format(outcome.error)
      }`;
    case 'HistoryFailed':
      return `[${outcome.channel} #${outcome.channelName}] summary: conversations.history failed - ${
        SlackApiError.format(outcome.error)
      }`;
    case 'Processed':
      return `[${outcome.channel} #${outcome.channelName}] summary: fetched=${outcome.fetched} candidates=${outcome.candidates} expanded=${outcome.expanded} skippedOwn=${outcome.skippedOwn} skippedNoReply=${outcome.skippedNoReply} skippedBroadcast=${outcome.skippedBroadcast} errors=${outcome.errors.length}`;
    default:
      return assertNever(outcome);
  }
};

const sum = (
  outcomes: ReadonlyArray<ChannelTickOutcome>,
  pick: (o: ChannelTickOutcome) => number,
): number => outcomes.reduce((acc, o) => acc + pick(o), 0);

const runBody = (deps: RunTickDeps, config: Config): void => {
  const tickStartMs = deps.clock.nowMs();
  if (config.targetChannels.length === 0) {
    deps.logger.warn(
      'TARGET_CHANNELS is empty. Set channel IDs (comma-separated) in Script Properties.',
    );
    return;
  }
  deps.logger.info(
    `tick start: channels=[${config.targetChannels.join(',')}] selfBotId=${config.selfBotId ?? 'unset'}`,
  );

  const expand = expandChannel({
    slack: deps.slack,
    cursor: deps.cursor,
    clock: deps.clock,
    logger: deps.logger,
  });

  const outcomes: ChannelTickOutcome[] = [];
  for (const channel of config.targetChannels) {
    try {
      const outcome = expand(channel, config.selfBotId);
      outcomes.push(outcome);
      deps.logger.info(formatOutcomeSummary(outcome));
    } catch (e) {
      deps.logger.error(
        `[${channel}] unexpected error: ${e instanceof Error ? e.stack ?? e.message : String(e)}`,
      );
    }
  }

  const totalFetched = sum(outcomes, ChannelTickOutcome.fetchedCount);
  const totalExpanded = sum(outcomes, ChannelTickOutcome.expandedCount);
  const totalErrors = sum(outcomes, ChannelTickOutcome.errorCount);
  const totalSkippedOwn = sum(outcomes, ChannelTickOutcome.skippedOwnCount);
  const totalSkippedNoReply = sum(outcomes, ChannelTickOutcome.skippedNoReplyCount);
  const totalSkippedBroadcast = sum(outcomes, ChannelTickOutcome.skippedBroadcastCount);
  const elapsedMs = deps.clock.nowMs() - tickStartMs;

  deps.logger.info(
    `tick end: channels=${config.targetChannels.length} fetched=${totalFetched} expanded=${totalExpanded} skippedOwn=${totalSkippedOwn} skippedNoReply=${totalSkippedNoReply} skippedBroadcast=${totalSkippedBroadcast} errors=${totalErrors} elapsedMs=${elapsedMs}`,
  );
};

export const runTick = (deps: RunTickDeps) => (config: Config): void => {
  const acquired = deps.lock.tryRun(() => runBody(deps, config));
  if (!acquired) {
    deps.logger.info('previous tick still running; skip');
  }
};
