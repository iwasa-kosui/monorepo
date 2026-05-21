import { Result } from '@praha/byethrow';

import { Permalink } from '../../domain/permalink.ts';
import type { SlackApiError } from '../../domain/slack-api-error.ts';
import type { SlackMessage } from '../../domain/slack-message.ts';
import type {
  ChannelTopLevelTsQuery,
  ChannelTopLevelTsResult,
  DeleteMessageInput,
  ListBotMessagesQuery,
  ListBotMessagesResult,
  PostMessageInput,
  SearchMessagesQuery,
  SlackPort,
} from '../../domain/slack-port.ts';
import type { SlackTs } from '../../domain/slack-ts.ts';
import { callSlack } from './call-slack.ts';
import { AuthTestResponseSchema } from './schemas/auth-test-response.ts';
import { ChatDeleteResponseSchema } from './schemas/chat-delete-response.ts';
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

// クリーンアップ用は過去全体を辿る必要があるため上限を大きめに取る。
// GAS の 6 分実行制限に収まらない場合は truncated=true で打ち切り、再実行で続きを処理する。
const CLEANUP_HISTORY_MAX_PAGES = 50;

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

type HistoryPage = Readonly<{
  pageTs: ReadonlyArray<SlackTs>;
  nextCursor: string | undefined;
}>;

export const SlackHttpClient = {
  create: (config: SlackHttpClientConfig): SlackPort => {
    const getChannelName: SlackPort['getChannelName'] = (channel) =>
      Result.pipe(
        callSlack(
          config.userToken,
          'conversations.info',
          { channel },
          ConversationsInfoResponseSchema,
        ),
        Result.map((res) => res.channel?.name),
      );

    const searchMessages: SlackPort['searchMessages'] = (query: SearchMessagesQuery) =>
      Result.pipe(
        // sort=timestamp, sort_dir=desc で「新しい順」に取得し、呼び出し側で昇順に並び替えて処理する。
        callSlack(
          config.userToken,
          'search.messages',
          {
            query: `in:${query.channelName} after:${query.afterDate}`,
            sort: 'timestamp',
            sort_dir: 'desc',
            count: SEARCH_COUNT,
          },
          SearchMessagesResponseSchema,
        ),
        Result.map((res) => ({
          matches: (res.messages?.matches ?? []).map(toDomainMessage),
          apiTotal: res.messages?.total,
        })),
      );

    const fetchHistoryPage = (
      query: ChannelTopLevelTsQuery,
      cursor: string | undefined,
    ): Result.Result<HistoryPage, SlackApiError> =>
      Result.pipe(
        callSlack(
          config.userToken,
          'conversations.history',
          {
            channel: query.channel,
            oldest: query.oldest,
            limit: HISTORY_PAGE_SIZE,
            cursor,
          },
          ConversationsHistoryResponseSchema,
        ),
        Result.map((res): HistoryPage => {
          const next = res.response_metadata?.next_cursor ?? '';
          const nextCursor = res.has_more === true && next !== '' ? next : undefined;
          return {
            pageTs: (res.messages ?? []).map((m) => m.ts),
            nextCursor,
          };
        }),
      );

    // conversations.history はチャンネル本流（top-level）のみを返し、スレッド返信は含めない。
    // thread_broadcast はチャンネル本流に複製されて出現するため、ここに含まれる ts は
    // 「ThreadedReply 候補だが実体は thread_broadcast」を判定するためのマーカーとなる。
    const accumulateHistory = (
      query: ChannelTopLevelTsQuery,
      collected: ReadonlyArray<SlackTs>,
      cursor: string | undefined,
      remainingPages: number,
    ): Result.Result<ChannelTopLevelTsResult, SlackApiError> =>
      Result.pipe(
        fetchHistoryPage(query, cursor),
        Result.andThen(({ pageTs, nextCursor }): Result.Result<ChannelTopLevelTsResult, SlackApiError> => {
          const next: ReadonlyArray<SlackTs> = [...collected, ...pageTs];
          if (nextCursor === undefined) {
            return Result.succeed({ topLevelTs: next, truncated: false });
          }
          if (remainingPages <= 1) {
            return Result.succeed({ topLevelTs: next, truncated: true });
          }
          return accumulateHistory(query, next, nextCursor, remainingPages - 1);
        }),
      );

    const getChannelTopLevelTs: SlackPort['getChannelTopLevelTs'] = (query) =>
      accumulateHistory(query, [], undefined, HISTORY_MAX_PAGES);

    const postMessage: SlackPort['postMessage'] = (input: PostMessageInput) =>
      Result.pipe(
        callSlack(
          config.botToken,
          'chat.postMessage',
          {
            channel: input.channel,
            text: input.text,
            unfurl_links: true,
            unfurl_media: true,
          },
          ChatPostMessageResponseSchema,
        ),
        Result.map(() => undefined),
      );

    type BotHistoryPage = Readonly<{
      pageTs: ReadonlyArray<SlackTs>;
      nextCursor: string | undefined;
    }>;

    const fetchBotHistoryPage = (
      query: ListBotMessagesQuery,
      cursor: string | undefined,
    ): Result.Result<BotHistoryPage, SlackApiError> =>
      Result.pipe(
        callSlack(
          config.userToken,
          'conversations.history',
          {
            channel: query.channel,
            limit: HISTORY_PAGE_SIZE,
            cursor,
          },
          ConversationsHistoryResponseSchema,
        ),
        Result.map((res): BotHistoryPage => {
          const next = res.response_metadata?.next_cursor ?? '';
          const nextCursor = res.has_more === true && next !== '' ? next : undefined;
          const matched = (res.messages ?? [])
            .filter((m) => m.bot_id === query.botId)
            .map((m) => m.ts);
          return { pageTs: matched, nextCursor };
        }),
      );

    const accumulateBotHistory = (
      query: ListBotMessagesQuery,
      collected: ReadonlyArray<SlackTs>,
      cursor: string | undefined,
      remainingPages: number,
    ): Result.Result<ListBotMessagesResult, SlackApiError> =>
      Result.pipe(
        fetchBotHistoryPage(query, cursor),
        Result.andThen(({ pageTs, nextCursor }): Result.Result<ListBotMessagesResult, SlackApiError> => {
          const next: ReadonlyArray<SlackTs> = [...collected, ...pageTs];
          if (nextCursor === undefined) {
            return Result.succeed({ ts: next, truncated: false });
          }
          if (remainingPages <= 1) {
            return Result.succeed({ ts: next, truncated: true });
          }
          return accumulateBotHistory(query, next, nextCursor, remainingPages - 1);
        }),
      );

    const listChannelBotMessages: SlackPort['listChannelBotMessages'] = (query) =>
      accumulateBotHistory(query, [], undefined, CLEANUP_HISTORY_MAX_PAGES);

    const deleteMessage: SlackPort['deleteMessage'] = (input: DeleteMessageInput) =>
      Result.pipe(
        callSlack(
          config.botToken,
          'chat.delete',
          {
            channel: input.channel,
            ts: input.ts,
          },
          ChatDeleteResponseSchema,
        ),
        Result.map(() => undefined),
      );

    const authTest: SlackPort['authTest'] = () =>
      Result.pipe(
        callSlack(config.botToken, 'auth.test', {}, AuthTestResponseSchema),
        Result.map((res) => ({
          botId: res.bot_id,
          userId: res.user_id,
          user: res.user,
          team: res.team,
          teamId: res.team_id,
          url: res.url,
        })),
      );

    return {
      getChannelName,
      searchMessages,
      getChannelTopLevelTs,
      postMessage,
      listChannelBotMessages,
      deleteMessage,
      authTest,
    };
  },
} as const;
