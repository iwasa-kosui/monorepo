import type { ResultAsync } from '@iwasa-kosui/result';

import type { Agg } from '../aggregate/index.ts';
import type { Instant } from '../instant/instant.ts';
import type { PostId } from './postId.ts';

export type PrunableRemotePostIdsResolverByReceivedBefore = Agg.Resolver<
  { receivedBefore: Instant; limit: number },
  ReadonlyArray<PostId>
>;

export type RemotePostsPrunedStore = Readonly<{
  store: (postIds: ReadonlyArray<PostId>) => ResultAsync<void, never>;
}>;
