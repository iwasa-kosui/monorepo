import type { Result } from '@iwasa-kosui/result';

import { callSlack, type SlackApiError, type SlackClient } from './client.ts';
import { type SearchMessagesResponse, SearchMessagesResponseSchema } from './schema.ts';

export type SearchMessagesParams = {
  query: string;
  count?: number;
};

/**
 * search.messages は user token 必須 (search:read scope)。
 * sort=timestamp, sort_dir=desc で「新しい順」に取得し、呼び出し側で
 * 昇順に並び替えて処理する。
 */
export const searchMessages = (
  client: SlackClient,
  params: SearchMessagesParams,
): Result<SearchMessagesResponse, SlackApiError> =>
  callSlack(
    client,
    'search.messages',
    {
      query: params.query,
      sort: 'timestamp',
      sort_dir: 'desc',
      count: params.count ?? 100,
    },
    SearchMessagesResponseSchema,
  );
