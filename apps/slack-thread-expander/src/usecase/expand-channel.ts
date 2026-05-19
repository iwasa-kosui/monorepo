import { Result } from '@praha/byethrow';

import type { BotId } from '../domain/bot-id.ts';
import type { ChannelId } from '../domain/channel-id.ts';
import type {
  ChannelInfoFailed,
  ChannelNameMissing,
  ChannelTickOutcome,
  InitializedTick,
  ProcessedTick,
  SearchFailed,
} from '../domain/channel-tick-outcome.ts';
import type { ClockPort } from '../domain/clock-port.ts';
import type { CursorPort } from '../domain/cursor-port.ts';
import type { LoggerPort } from '../domain/logger-port.ts';
import { MessageClassification } from '../domain/message-classification.ts';
import { SlackApiError } from '../domain/slack-api-error.ts';
import type { SlackMessage } from '../domain/slack-message.ts';
import type { SearchMessagesResult, SlackPort } from '../domain/slack-port.ts';
import { SlackTs } from '../domain/slack-ts.ts';
import { assertNever } from '../util/assert-never.ts';

// `after:YYYY-MM-DD` は指定日「以降」を返すが、ワークスペースのタイムゾーンと UTC のずれで
// 当日分を取り逃がさないように 2 日前から検索する。余分に取得した分は ts > lastTs で再フィルタ。
const SEARCH_LOOKBACK_DAYS = 2;

export type ExpandChannelDeps = Readonly<{
  slack: SlackPort;
  cursor: CursorPort;
  clock: ClockPort;
  logger: LoggerPort;
}>;

// 早期 return される outcome は ROP の Failure 軌道に流して短絡させる。
type EarlyOutcome = InitializedTick | ChannelInfoFailed | ChannelNameMissing | SearchFailed;

type LoopState = Readonly<{
  cursorTo: SlackTs;
  expanded: number;
  skippedOwn: number;
  skippedNoReply: number;
  errors: ReadonlyArray<SlackApiError>;
}>;

const filterAndSort = (
  matches: ReadonlyArray<SlackMessage>,
  channel: ChannelId,
  lastTs: SlackTs,
): ReadonlyArray<SlackMessage> =>
  matches
    .filter((m) => m.channel === channel && SlackTs.isAfter(m.ts, lastTs))
    .slice()
    .sort((a, b) => SlackTs.compareAsc(a.ts, b.ts));

const loadCursor = (
  deps: ExpandChannelDeps,
  channel: ChannelId,
): Result.Result<SlackTs, EarlyOutcome> => {
  const lastTs = deps.cursor.get(channel);
  if (lastTs != null) {
    deps.logger.info(`[${channel}] tick start: lastTs=${lastTs}`);
    return Result.succeed(lastTs);
  }
  const initial = deps.clock.nowSlackTs();
  deps.cursor.set(channel, initial);
  deps.logger.info(
    `[${channel}] initial run; set last_ts=${initial} and skip this tick`,
  );
  return Result.fail({ kind: 'Initialized', channel, initialTs: initial });
};

const resolveChannelName = (
  deps: ExpandChannelDeps,
  channel: ChannelId,
): Result.Result<string, EarlyOutcome> =>
  Result.pipe(
    deps.slack.getChannelName(channel),
    Result.mapError((error): EarlyOutcome => {
      deps.logger.warn(
        `[${channel}] conversations.info failed: ${SlackApiError.format(error)}`,
      );
      return { kind: 'ChannelInfoFailed', channel, error };
    }),
    Result.andThen((name): Result.Result<string, EarlyOutcome> => {
      if (name != null) return Result.succeed(name);
      deps.logger.warn(`[${channel}] channel name missing in conversations.info`);
      return Result.fail({ kind: 'ChannelNameMissing', channel });
    }),
  );

const runSearch = (
  deps: ExpandChannelDeps,
  channel: ChannelId,
  channelName: string,
  lastTs: SlackTs,
): Result.Result<SearchMessagesResult, EarlyOutcome> => {
  const label = `[${channel} #${channelName}]`;
  const afterDate = SlackTs.toAfterDate(lastTs, SEARCH_LOOKBACK_DAYS);
  deps.logger.info(
    `${label} search.messages query="in:${channelName} after:${afterDate}" (lookback=${SEARCH_LOOKBACK_DAYS}d from lastTs=${lastTs})`,
  );
  return Result.pipe(
    deps.slack.searchMessages({ channelName, afterDate }),
    Result.mapError((error): EarlyOutcome => {
      deps.logger.warn(
        `${label} search.messages failed: ${SlackApiError.format(error)}`,
      );
      return { kind: 'SearchFailed', channel, channelName, error };
    }),
  );
};

const advanceCursor = (state: LoopState, ts: SlackTs): LoopState => ({
  ...state,
  cursorTo: SlackTs.max(state.cursorTo, ts),
});

const stepMessage = (
  deps: ExpandChannelDeps,
  label: string,
  selfBotId: BotId | undefined,
) =>
(state: LoopState, message: SlackMessage): Result.Result<LoopState, LoopState> => {
  const classification = MessageClassification.classify(message, selfBotId);
  switch (classification.kind) {
    case 'OwnPost':
      deps.logger.info(`${label} skip ts=${message.ts} reason=own-post`);
      return Result.succeed(advanceCursor({ ...state, skippedOwn: state.skippedOwn + 1 }, message.ts));
    case 'NotThreaded':
    case 'ThreadRoot':
    case 'IgnoredSubtype':
      deps.logger.info(
        `${label} skip ts=${message.ts} reason=${classification.kind} thread_ts=${message.threadTs ?? 'none'} subtype=${
          message.subtype ?? 'none'
        }`,
      );
      return Result.succeed(
        advanceCursor({ ...state, skippedNoReply: state.skippedNoReply + 1 }, message.ts),
      );
    case 'ThreadedReply':
      return Result.pipe(
        deps.slack.postMessage({
          channel: classification.channel,
          text: classification.permalink,
        }),
        Result.map((): LoopState => {
          deps.logger.info(`${label} expanded ts=${message.ts} -> ${classification.permalink}`);
          return advanceCursor({ ...state, expanded: state.expanded + 1 }, message.ts);
        }),
        // post 失敗時は Failure 軌道に「停止状態」を載せる。
        // 後続メッセージへの fold が短絡し、cursor を進めずに打ち切られる。
        Result.mapError((error): LoopState => {
          deps.logger.warn(
            `${label} failed to expand ts=${classification.ts}: ${SlackApiError.format(error)}`,
          );
          return { ...state, errors: [...state.errors, error] };
        }),
      );
    default:
      return assertNever(classification);
  }
};

const foldMessages = (
  deps: ExpandChannelDeps,
  label: string,
  selfBotId: BotId | undefined,
  initial: LoopState,
  messages: ReadonlyArray<SlackMessage>,
): LoopState => {
  const step = stepMessage(deps, label, selfBotId);
  const folded = messages.reduce<Result.Result<LoopState, LoopState>>(
    (acc, message) => Result.pipe(acc, Result.andThen((state) => step(state, message))),
    Result.succeed(initial),
  );
  return Result.isSuccess(folded) ? folded.value : folded.error;
};

const persistCursor = (
  deps: ExpandChannelDeps,
  channel: ChannelId,
  from: SlackTs,
  to: SlackTs,
): void => {
  if (to !== from) deps.cursor.set(channel, to);
};

const processMatches = (
  deps: ExpandChannelDeps,
  channel: ChannelId,
  channelName: string,
  lastTs: SlackTs,
  selfBotId: BotId | undefined,
  searchResult: SearchMessagesResult,
): ProcessedTick => {
  const inChannel = searchResult.matches.filter((m) => m.channel === channel);
  const sorted = filterAndSort(searchResult.matches, channel, lastTs);
  const label = `[${channel} #${channelName}]`;
  deps.logger.info(
    `${label} search result: apiTotal=${
      searchResult.apiTotal ?? 'n/a'
    } matches=${searchResult.matches.length} inChannel=${inChannel.length} newSinceLastTs=${sorted.length}`,
  );

  const initial: LoopState = {
    cursorTo: lastTs,
    expanded: 0,
    skippedOwn: 0,
    skippedNoReply: 0,
    errors: [],
  };
  const final = foldMessages(deps, label, selfBotId, initial, sorted);
  persistCursor(deps, channel, lastTs, final.cursorTo);

  deps.logger.info(
    `${label} tick end: fetched=${inChannel.length} candidates=${sorted.length} expanded=${final.expanded} skippedOwn=${final.skippedOwn} skippedNoReply=${final.skippedNoReply} errors=${final.errors.length} cursor ${lastTs}->${final.cursorTo}`,
  );

  return {
    kind: 'Processed',
    channel,
    channelName,
    fetched: inChannel.length,
    candidates: sorted.length,
    expanded: final.expanded,
    skippedOwn: final.skippedOwn,
    skippedNoReply: final.skippedNoReply,
    cursorFrom: lastTs,
    cursorTo: final.cursorTo,
    errors: final.errors,
  };
};

export const expandChannel = (deps: ExpandChannelDeps) =>
(
  channel: ChannelId,
  selfBotId: BotId | undefined,
): ChannelTickOutcome => {
  const pipeline = Result.pipe(
    Result.do(),
    Result.bind('lastTs', () => loadCursor(deps, channel)),
    Result.bind('channelName', () => resolveChannelName(deps, channel)),
    Result.bind('search', ({ channelName, lastTs }) => runSearch(deps, channel, channelName, lastTs)),
    Result.map(({ lastTs, channelName, search }): ProcessedTick =>
      processMatches(deps, channel, channelName, lastTs, selfBotId, search)
    ),
  );
  return Result.isSuccess(pipeline) ? pipeline.value : pipeline.error;
};
