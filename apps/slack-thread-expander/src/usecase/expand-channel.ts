import type { BotId } from '../domain/bot-id.ts';
import type { ChannelId } from '../domain/channel-id.ts';
import type { ChannelTickOutcome } from '../domain/channel-tick-outcome.ts';
import type { ClockPort } from '../domain/clock-port.ts';
import type { CursorPort } from '../domain/cursor-port.ts';
import type { LoggerPort } from '../domain/logger-port.ts';
import { MessageClassification } from '../domain/message-classification.ts';
import { SlackApiError } from '../domain/slack-api-error.ts';
import type { SlackMessage } from '../domain/slack-message.ts';
import type { SlackPort } from '../domain/slack-port.ts';
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

const filterAndSort = (
  matches: ReadonlyArray<SlackMessage>,
  channel: ChannelId,
  lastTs: SlackTs,
): ReadonlyArray<SlackMessage> =>
  matches
    .filter((m) => m.channel === channel)
    .filter((m) => SlackTs.isAfter(m.ts, lastTs))
    .slice()
    .sort((a, b) => SlackTs.compareAsc(a.ts, b.ts));

export const expandChannel = (deps: ExpandChannelDeps) =>
(
  channel: ChannelId,
  selfBotId: BotId | undefined,
): ChannelTickOutcome => {
  const { slack, cursor, clock, logger } = deps;
  const lastTs = cursor.get(channel);
  if (lastTs == null) {
    const initial = clock.nowSlackTs();
    cursor.set(channel, initial);
    logger.info(
      `[${channel}] initial run; set last_ts=${initial} and skip this tick`,
    );
    return { kind: 'Initialized', channel, initialTs: initial };
  }

  logger.info(`[${channel}] tick start: lastTs=${lastTs}`);

  const infoRes = slack.getChannelName(channel);
  if (!infoRes.ok) {
    logger.warn(
      `[${channel}] conversations.info failed: ${SlackApiError.format(infoRes.err)}`,
    );
    return { kind: 'ChannelInfoFailed', channel, error: infoRes.err };
  }
  const channelName = infoRes.val;
  if (channelName == null) {
    logger.warn(`[${channel}] channel name missing in conversations.info`);
    return { kind: 'ChannelNameMissing', channel };
  }

  const label = `[${channel} #${channelName}]`;
  const afterDate = SlackTs.toAfterDate(lastTs, SEARCH_LOOKBACK_DAYS);
  logger.info(
    `${label} search.messages query="in:${channelName} after:${afterDate}" (lookback=${SEARCH_LOOKBACK_DAYS}d from lastTs=${lastTs})`,
  );

  const searchRes = slack.searchMessages({ channelName, afterDate });
  if (!searchRes.ok) {
    logger.warn(
      `${label} search.messages failed: ${SlackApiError.format(searchRes.err)}`,
    );
    return {
      kind: 'SearchFailed',
      channel,
      channelName,
      error: searchRes.err,
    };
  }

  const allMatches = searchRes.val.matches;
  // 同名・別チャンネルが紛れる可能性に備えて channel.id で再フィルタしてから昇順にソート。
  const inChannel = allMatches.filter((m) => m.channel === channel);
  const sorted = filterAndSort(allMatches, channel, lastTs);

  logger.info(
    `${label} search result: apiTotal=${
      searchRes.val.apiTotal ?? 'n/a'
    } matches=${allMatches.length} inChannel=${inChannel.length} newSinceLastTs=${sorted.length}`,
  );

  // search.messages はブロードキャスト投稿で subtype を欠落させることがあるため、
  // チャンネル本流の ts 集合との突き合わせで thread_broadcast を補完的に除外する。
  const historyRes = slack.getChannelTopLevelTs({ channel, oldest: lastTs });
  if (!historyRes.ok) {
    logger.warn(
      `${label} conversations.history failed: ${SlackApiError.format(historyRes.err)}`,
    );
    return {
      kind: 'HistoryFailed',
      channel,
      channelName,
      error: historyRes.err,
    };
  }
  const topLevelTs = new Set<SlackTs>(historyRes.val.topLevelTs);
  logger.info(
    `${label} conversations.history result: topLevelTs=${topLevelTs.size}${
      historyRes.val.truncated ? ' (truncated)' : ''
    }`,
  );

  const errors: SlackApiError[] = [];
  let expanded = 0;
  let skippedOwn = 0;
  let skippedNoReply = 0;
  let skippedBroadcast = 0;
  let cursorTo = lastTs;

  const advance = (ts: SlackTs): void => {
    const next = SlackTs.max(cursorTo, ts);
    if (next !== cursorTo) {
      cursorTo = next;
      cursor.set(channel, cursorTo);
    }
  };

  const summaryLine = (): string =>
    `${label} tick end: fetched=${inChannel.length} candidates=${sorted.length} expanded=${expanded} skippedOwn=${skippedOwn} skippedNoReply=${skippedNoReply} skippedBroadcast=${skippedBroadcast} errors=${errors.length} cursor ${lastTs}->${cursorTo}`;

  for (const message of sorted) {
    const classification = MessageClassification.classify(message, {
      selfBotId,
      topLevelTs,
    });
    switch (classification.kind) {
      case 'OwnPost':
        skippedOwn += 1;
        logger.info(`${label} skip ts=${message.ts} reason=own-post`);
        advance(message.ts);
        break;
      case 'NotThreaded':
      case 'ThreadRoot':
      case 'IgnoredSubtype':
        skippedNoReply += 1;
        logger.info(
          `${label} skip ts=${message.ts} reason=${classification.kind} thread_ts=${
            message.threadTs ?? 'none'
          } subtype=${message.subtype ?? 'none'}`,
        );
        advance(message.ts);
        break;
      case 'ThreadBroadcast':
        skippedBroadcast += 1;
        logger.info(
          `${label} skip ts=${message.ts} reason=ThreadBroadcast thread_ts=${message.threadTs ?? 'none'} subtype=${
            message.subtype ?? 'none'
          }`,
        );
        advance(message.ts);
        break;
      case 'ThreadedReply': {
        const postRes = slack.postMessage({
          channel: classification.channel,
          text: classification.permalink,
        });
        if (!postRes.ok) {
          logger.warn(
            `${label} failed to expand ts=${classification.ts}: ${SlackApiError.format(postRes.err)}`,
          );
          errors.push(postRes.err);
          // 失敗した瞬間に next tick で再試行できるよう、cursor を進めず打ち切る。
          logger.info(summaryLine());
          return {
            kind: 'Processed',
            channel,
            channelName,
            fetched: inChannel.length,
            candidates: sorted.length,
            expanded,
            skippedOwn,
            skippedNoReply,
            skippedBroadcast,
            cursorFrom: lastTs,
            cursorTo,
            errors,
          };
        }
        logger.info(`${label} expanded ts=${message.ts} -> ${classification.permalink}`);
        expanded += 1;
        advance(message.ts);
        break;
      }
      default:
        return assertNever(classification);
    }
  }

  logger.info(summaryLine());

  return {
    kind: 'Processed',
    channel,
    channelName,
    fetched: inChannel.length,
    candidates: sorted.length,
    expanded,
    skippedOwn,
    skippedNoReply,
    skippedBroadcast,
    cursorFrom: lastTs,
    cursorTo,
    errors,
  };
};
