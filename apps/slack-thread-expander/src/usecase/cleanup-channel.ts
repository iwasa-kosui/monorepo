import { Result } from '@praha/byethrow';

import type { BotId } from '../domain/bot-id.ts';
import type { ChannelCleanupOutcome, CleanupDeleteFailure } from '../domain/channel-cleanup-outcome.ts';
import type { ChannelId } from '../domain/channel-id.ts';
import type { LoggerPort } from '../domain/logger-port.ts';
import { SlackApiError } from '../domain/slack-api-error.ts';
import type { SlackPort } from '../domain/slack-port.ts';
import type { SlackTs } from '../domain/slack-ts.ts';

export type CleanupChannelDeps = Readonly<{
  slack: SlackPort;
  logger: LoggerPort;
}>;

type DeleteLoopState = Readonly<{
  deleted: number;
  failures: ReadonlyArray<CleanupDeleteFailure>;
}>;

const deleteOne = (
  deps: CleanupChannelDeps,
  label: string,
  channel: ChannelId,
) =>
(state: DeleteLoopState, ts: SlackTs): DeleteLoopState => {
  const res = deps.slack.deleteMessage({ channel, ts });
  if (Result.isSuccess(res)) {
    deps.logger.info(`${label} deleted ts=${ts}`);
    return { ...state, deleted: state.deleted + 1 };
  }
  deps.logger.warn(
    `${label} failed to delete ts=${ts}: ${SlackApiError.format(res.error)}`,
  );
  return { ...state, failures: [...state.failures, { ts, error: res.error }] };
};

export const cleanupChannel = (deps: CleanupChannelDeps) =>
(
  channel: ChannelId,
  selfBotId: BotId | undefined,
): ChannelCleanupOutcome => {
  const label = `[${channel}]`;

  if (selfBotId == null) {
    deps.logger.warn(
      `${label} SELF_BOT_ID is not configured; cleanup requires it to identify the bot's own posts`,
    );
    return { kind: 'SkippedMissingSelfBotId', channel };
  }

  const listed = deps.slack.listChannelBotMessages({ channel, botId: selfBotId });
  if (Result.isFailure(listed)) {
    deps.logger.warn(
      `${label} conversations.history failed: ${SlackApiError.format(listed.error)}`,
    );
    return { kind: 'ListFailed', channel, error: listed.error };
  }

  const { ts, truncated } = listed.value;
  deps.logger.info(
    `${label} cleanup target: scanned=${ts.length}${truncated ? ' (truncated)' : ''}`,
  );

  const initial: DeleteLoopState = { deleted: 0, failures: [] };
  const final = ts.reduce(deleteOne(deps, label, channel), initial);

  deps.logger.info(
    `${label} cleanup end: scanned=${ts.length} deleted=${final.deleted} failed=${final.failures.length}${
      truncated ? ' (truncated; rerun to continue)' : ''
    }`,
  );

  return {
    kind: 'Processed',
    channel,
    scanned: ts.length,
    deleted: final.deleted,
    truncated,
    failures: final.failures,
  };
};
