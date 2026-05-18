import { getLastTs, nowAsSlackTs, setLastTs } from './config.ts';
import { findThreadedReply, isOwnPost } from './domain/threaded-reply.ts';
import { chatPostMessage } from './slack/chat.ts';
import type { SlackApiError, SlackClient } from './slack/client.ts';
import { conversationsInfo } from './slack/conversations.ts';
import type { SearchMessageMatch, SlackMessage } from './slack/schema.ts';
import { searchMessages } from './slack/search.ts';

export type ExpandSummary = {
  channel: string;
  fetched: number;
  expanded: number;
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
    return { channel, fetched: 0, expanded: 0, errors: [] };
  }

  const infoRes = conversationsInfo(clients.user, channel);
  if (!infoRes.ok) {
    console.warn(
      `[${channel}] conversations.info failed: ${JSON.stringify(infoRes.err)}`,
    );
    return { channel, fetched: 0, expanded: 0, errors: [infoRes.err] };
  }
  const channelName = infoRes.val.channel?.name;
  if (channelName == null) {
    const error: SlackApiError = {
      kind: 'slack',
      error: 'channel_name_missing',
    };
    console.warn(`[${channel}] channel name missing in conversations.info`);
    return { channel, fetched: 0, expanded: 0, errors: [error] };
  }

  const query = `in:${channelName} after:${tsToAfterDate(lastTs)}`;
  const searchRes = searchMessages(clients.user, { query });
  if (!searchRes.ok) {
    console.warn(
      `[${channel}] search.messages failed: ${JSON.stringify(searchRes.err)}`,
    );
    return { channel, fetched: 0, expanded: 0, errors: [searchRes.err] };
  }

  const allMatches = searchRes.val.messages?.matches ?? [];
  // 同名・別チャンネルが紛れる可能性に備えて channel.id で再フィルタする。
  const inChannel = allMatches.filter((m) => m.channel.id === channel);
  // search.messages は新しい順に返るので、ts 昇順に並び替えて処理する。
  const sorted = inChannel
    .filter((m) => m.ts > lastTs)
    .sort((a, b) => (a.ts < b.ts ? -1 : 1));

  const errors: SlackApiError[] = [];
  let expanded = 0;
  let maxTs = lastTs;

  for (const match of sorted) {
    const message = matchToMessage(match);
    const updateCursor = () => {
      if (match.ts > maxTs) {
        maxTs = match.ts;
        setLastTs(channel, maxTs);
      }
    };

    if (isOwnPost(message, selfBotId)) {
      updateCursor();
      continue;
    }
    const ref = findThreadedReply(channel, message);
    if (ref == null) {
      updateCursor();
      continue;
    }

    const postRes = chatPostMessage(clients.bot, {
      channel,
      text: match.permalink,
    });
    if (!postRes.ok) {
      console.warn(
        `[${channel}] failed to expand ts=${ref.ts}: ${JSON.stringify(postRes.err)}`,
      );
      errors.push(postRes.err);
      // 失敗した瞬間に next tick で再試行できるよう、ここで break して
      // カーソルを進めない。
      break;
    }
    console.log(`[${channel}] expanded ${match.ts} -> ${match.permalink}`);
    expanded += 1;
    updateCursor();
  }

  return { channel, fetched: inChannel.length, expanded, errors };
};
