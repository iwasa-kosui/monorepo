import { getLastTs, nowAsSlackTs, setLastTs } from './config.ts';
import { findThreadedReply, isOwnPost } from './domain/threaded-reply.ts';
import { chatPostMessage } from './slack/chat.ts';
import type { SlackApiError, SlackClient } from './slack/client.ts';
import { conversationsInfo } from './slack/conversations.ts';
import type { SearchMessageMatch, SlackMessage } from './slack/schema.ts';
import { searchMessages } from './slack/search.ts';

export type ExpandSummary = {
  channel: string;
  channelName: string | undefined;
  fetched: number;
  candidates: number;
  expanded: number;
  skippedOwn: number;
  skippedNoReply: number;
  startTs: string | undefined;
  endTs: string | undefined;
  errors: SlackApiError[];
};

export type Clients = {
  bot: SlackClient;
  user: SlackClient;
};

const matchToMessage = (match: SearchMessageMatch): SlackMessage => ({
  type: 'message',
  ts: match.ts,
  thread_ts: match.thread_ts,
  subtype: match.subtype,
  user: match.user,
  bot_id: match.bot_id,
  text: match.text,
});

// `after:YYYY-MM-DD` は指定日「以降」を返すが、ワークスペースのタイムゾーンと
// GAS の UTC がずれて当日分を取り逃がさないように 2 日前から検索する。
// 余分に取得した分はクライアント側で `ts > lastTs` により再度絞り込む。
const SEARCH_LOOKBACK_DAYS = 2;

const tsToAfterDate = (ts: string): string => {
  const epochSeconds = Math.floor(Number(ts));
  const date = new Date(
    (epochSeconds - SEARCH_LOOKBACK_DAYS * 24 * 60 * 60) * 1000,
  );
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const tag = (channel: string, channelName: string | undefined): string =>
  channelName == null ? `[${channel}]` : `[${channel} #${channelName}]`;

export const expandChannel = (
  clients: Clients,
  channel: string,
  selfBotId: string | undefined,
): ExpandSummary => {
  const lastTs = getLastTs(channel);
  if (lastTs == null) {
    const initial = nowAsSlackTs();
    setLastTs(channel, initial);
    console.log(
      `[${channel}] initial run; set last_ts=${initial} and skip this tick`,
    );
    return {
      channel,
      channelName: undefined,
      fetched: 0,
      candidates: 0,
      expanded: 0,
      skippedOwn: 0,
      skippedNoReply: 0,
      startTs: undefined,
      endTs: undefined,
      errors: [],
    };
  }

  console.log(`[${channel}] tick start: lastTs=${lastTs}`);

  const infoRes = conversationsInfo(clients.user, channel);
  if (!infoRes.ok) {
    console.warn(
      `[${channel}] conversations.info failed: ${JSON.stringify(infoRes.err)}`,
    );
    return {
      channel,
      channelName: undefined,
      fetched: 0,
      candidates: 0,
      expanded: 0,
      skippedOwn: 0,
      skippedNoReply: 0,
      startTs: undefined,
      endTs: undefined,
      errors: [infoRes.err],
    };
  }
  const channelName = infoRes.val.channel?.name;
  if (channelName == null) {
    const error: SlackApiError = {
      kind: 'slack',
      error: 'channel_name_missing',
    };
    console.warn(`[${channel}] channel name missing in conversations.info`);
    return {
      channel,
      channelName: undefined,
      fetched: 0,
      candidates: 0,
      expanded: 0,
      skippedOwn: 0,
      skippedNoReply: 0,
      startTs: undefined,
      endTs: undefined,
      errors: [error],
    };
  }

  const label = tag(channel, channelName);
  const afterDate = tsToAfterDate(lastTs);
  const query = `in:${channelName} after:${afterDate}`;
  console.log(
    `${label} search.messages query="${query}" (lookback=${SEARCH_LOOKBACK_DAYS}d from lastTs=${lastTs})`,
  );
  const searchRes = searchMessages(clients.user, { query });
  if (!searchRes.ok) {
    console.warn(
      `${label} search.messages failed: ${JSON.stringify(searchRes.err)}`,
    );
    return {
      channel,
      channelName,
      fetched: 0,
      candidates: 0,
      expanded: 0,
      skippedOwn: 0,
      skippedNoReply: 0,
      startTs: undefined,
      endTs: undefined,
      errors: [searchRes.err],
    };
  }

  const allMatches = searchRes.val.messages?.matches ?? [];
  const apiTotal = searchRes.val.messages?.total;
  // 同名・別チャンネルが紛れる可能性に備えて channel.id で再フィルタする。
  const inChannel = allMatches.filter((m) => m.channel.id === channel);
  // search.messages は新しい順に返るので、ts 昇順に並び替えて処理する。
  const sorted = inChannel
    .filter((m) => m.ts > lastTs)
    .sort((a, b) => (a.ts < b.ts ? -1 : 1));

  console.log(
    `${label} search result: apiTotal=${
      apiTotal ?? 'n/a'
    } matches=${allMatches.length} inChannel=${inChannel.length} newSinceLastTs=${sorted.length}`,
  );

  const errors: SlackApiError[] = [];
  let expanded = 0;
  let skippedOwn = 0;
  let skippedNoReply = 0;
  let maxTs = lastTs;
  const startTs = sorted[0]?.ts;
  let lastSeenTs: string | undefined;

  for (const match of sorted) {
    lastSeenTs = match.ts;
    const message = matchToMessage(match);
    const updateCursor = () => {
      if (match.ts > maxTs) {
        maxTs = match.ts;
        setLastTs(channel, maxTs);
      }
    };

    if (isOwnPost(message, selfBotId)) {
      skippedOwn += 1;
      console.log(`${label} skip ts=${match.ts} reason=own-post`);
      updateCursor();
      continue;
    }
    const ref = findThreadedReply(channel, message);
    if (ref == null) {
      skippedNoReply += 1;
      console.log(
        `${label} skip ts=${match.ts} reason=not-threaded-reply thread_ts=${message.thread_ts ?? 'none'} subtype=${
          message.subtype ?? 'none'
        }`,
      );
      updateCursor();
      continue;
    }

    const postRes = chatPostMessage(clients.bot, {
      channel,
      text: match.permalink,
    });
    if (!postRes.ok) {
      console.warn(
        `${label} failed to expand ts=${ref.ts}: ${JSON.stringify(postRes.err)}`,
      );
      errors.push(postRes.err);
      // 失敗した瞬間に next tick で再試行できるよう、ここで break して
      // カーソルを進めない。
      break;
    }
    console.log(`${label} expanded ts=${match.ts} -> ${match.permalink}`);
    expanded += 1;
    updateCursor();
  }

  console.log(
    `${label} tick end: fetched=${inChannel.length} candidates=${sorted.length} expanded=${expanded} skippedOwn=${skippedOwn} skippedNoReply=${skippedNoReply} errors=${errors.length} cursor ${lastTs}->${maxTs}`,
  );

  return {
    channel,
    channelName,
    fetched: inChannel.length,
    candidates: sorted.length,
    expanded,
    skippedOwn,
    skippedNoReply,
    startTs,
    endTs: lastSeenTs,
    errors,
  };
};
