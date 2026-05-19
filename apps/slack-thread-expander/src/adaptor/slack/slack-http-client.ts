import { Result } from '@praha/byethrow';

import { Permalink } from '../../domain/permalink.ts';
import type { SlackMessage } from '../../domain/slack-message.ts';
import type { PostMessageInput, SearchMessagesQuery, SlackPort } from '../../domain/slack-port.ts';
import { callSlack } from './call-slack.ts';
import { ChatPostMessageResponseSchema } from './schemas/chat-post-message-response.ts';
import { ConversationsInfoResponseSchema } from './schemas/conversations-info-response.ts';
import { type SearchMessageMatch, SearchMessagesResponseSchema } from './schemas/search-messages-response.ts';

export type SlackHttpClientConfig = Readonly<{
  botToken: string;
  userToken: string;
}>;

// 検索ヒット数の上限。search.messages の最大は 100。
const SEARCH_COUNT = 100;

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

    return { getChannelName, searchMessages, postMessage };
  },
} as const;
