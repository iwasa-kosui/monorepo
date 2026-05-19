import type { Result } from '@iwasa-kosui/result';
import { ok } from '@iwasa-kosui/result';

import { Permalink } from '../../domain/permalink.ts';
import type { SlackApiError } from '../../domain/slack-api-error.ts';
import type { SlackMessage } from '../../domain/slack-message.ts';
import type {
  ChannelTopLevelTsQuery,
  ChannelTopLevelTsResult,
  PostMessageInput,
  SearchMessagesQuery,
  SearchMessagesResult,
  SlackPort,
} from '../../domain/slack-port.ts';
import type { SlackTs } from '../../domain/slack-ts.ts';
import { callSlack } from './call-slack.ts';
import { ChatPostMessageResponseSchema } from './schemas/chat-post-message-response.ts';
import { ConversationsHistoryResponseSchema } from './schemas/conversations-history-response.ts';
import { ConversationsInfoResponseSchema } from './schemas/conversations-info-response.ts';
import { type SearchMessageMatch, SearchMessagesResponseSchema } from './schemas/search-messages-response.ts';

export type SlackHttpClientConfig = Readonly<{
  botToken: string;
  userToken: string;
}>;

// 検索ヒット数の上限。search.messages の最大は 100。
const SEARCH_COUNT = 100;

// conversations.history の 1 ページあたりの最大件数。
const HISTORY_PAGE_SIZE = 200;

// GAS の実行時間制約を踏まえた conversations.history のページング上限。
// HISTORY_PAGE_SIZE * HISTORY_MAX_PAGES 件を超えた場合は truncated=true で打ち切る。
const HISTORY_MAX_PAGES = 5;

// search.messages のマッチは、スレッド返信であっても thread_ts を返さないことがある。
// その場合は permalink の `?thread_ts=...` から復元してフォールバックする。
const toDomainMessage = (match: SearchMessageMatch): SlackMessage => ({
  channel: match.channel.id,
  ts: match.ts,
  threadTs: match.thread_ts ?? Permalink.extractThreadTs(match.permalink),
  subtype: match.subtype,
  userId: match.user,
  botId: match.bot_id,
  permalink: match.permalink,
  text: match.text,
});

export const SlackHttpClient = {
  create: (config: SlackHttpClientConfig): SlackPort => {
    const getChannelName: SlackPort['getChannelName'] = (channel) => {
      const res = callSlack(
        config.userToken,
        'conversations.info',
        { channel },
        ConversationsInfoResponseSchema,
      );
      return res.ok ? ok(res.val.channel?.name) : res;
    };

    const searchMessages: SlackPort['searchMessages'] = (
      query: SearchMessagesQuery,
    ): Result<SearchMessagesResult, SlackApiError> => {
      // sort=timestamp, sort_dir=desc で「新しい順」に取得し、呼び出し側で昇順に並び替えて処理する。
      const res = callSlack(
        config.userToken,
        'search.messages',
        {
          query: `in:${query.channelName} after:${query.afterDate}`,
          sort: 'timestamp',
          sort_dir: 'desc',
          count: SEARCH_COUNT,
        },
        SearchMessagesResponseSchema,
      );
      if (!res.ok) return res;
      const rawMatches = res.val.messages?.matches ?? [];
      return ok({
        matches: rawMatches.map(toDomainMessage),
        apiTotal: res.val.messages?.total,
      });
    };

    const getChannelTopLevelTs: SlackPort['getChannelTopLevelTs'] = (
      query: ChannelTopLevelTsQuery,
    ): Result<ChannelTopLevelTsResult, SlackApiError> => {
      // conversations.history はチャンネル本流（top-level）のみを返し、スレッド返信は含めない。
      // thread_broadcast はチャンネル本流に複製されて出現するため、ここに含まれる ts は
      // 「ThreadedReply 候補だが実体は thread_broadcast」を判定するためのマーカーとなる。
      const collected: SlackTs[] = [];
      let cursor: string | undefined;
      let truncated = false;
      for (let page = 0; page < HISTORY_MAX_PAGES; page++) {
        const res = callSlack(
          config.userToken,
          'conversations.history',
          {
            channel: query.channel,
            oldest: query.oldest,
            limit: HISTORY_PAGE_SIZE,
            cursor,
          },
          ConversationsHistoryResponseSchema,
        );
        if (!res.ok) return res;
        for (const m of res.val.messages ?? []) {
          collected.push(m.ts);
        }
        const next = res.val.response_metadata?.next_cursor ?? '';
        if (res.val.has_more !== true || next === '') {
          return ok({ topLevelTs: collected, truncated: false });
        }
        cursor = next;
        if (page === HISTORY_MAX_PAGES - 1) {
          truncated = true;
        }
      }
      return ok({ topLevelTs: collected, truncated });
    };

    const postMessage: SlackPort['postMessage'] = (input: PostMessageInput) => {
      const res = callSlack(
        config.botToken,
        'chat.postMessage',
        {
          channel: input.channel,
          text: input.text,
          unfurl_links: true,
          unfurl_media: true,
        },
        ChatPostMessageResponseSchema,
      );
      return res.ok ? ok(undefined) : res;
    };

    return {
      getChannelName,
      searchMessages,
      getChannelTopLevelTs,
      postMessage,
    };
  },
} as const;
