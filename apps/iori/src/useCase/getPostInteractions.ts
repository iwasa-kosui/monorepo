import { RA } from '@iwasa-kosui/result';
import { getLogger } from '@logtape/logtape';

import { Post, PostNotFoundError, type PostResolver } from '../domain/post/post.ts';
import type { PostId } from '../domain/post/postId.ts';
import {
  PostInteractions,
  type RemotePostInteractionsFetcher,
  type StoredPostInteractionsResolver,
} from '../domain/postInteraction/postInteractions.ts';
import { timedOut, withTimeout } from '../helper/withTimeout.ts';
import type { UseCase } from './useCase.ts';

const DEFAULT_TOTAL_TIMEOUT_MS = 8_000;

type Input = Readonly<{ postId: PostId }>;

export type GetPostInteractionsUseCase = UseCase<Input, PostInteractions, PostNotFoundError>;

type Deps = Readonly<{
  postResolver: PostResolver;
  storedPostInteractionsResolver: StoredPostInteractionsResolver;
  remotePostInteractionsFetcher: RemotePostInteractionsFetcher;
  isBlockedUri: (uri: string) => boolean;
  totalTimeoutMs?: number;
}>;

const create = ({
  postResolver,
  storedPostInteractionsResolver,
  remotePostInteractionsFetcher,
  isBlockedUri,
  totalTimeoutMs = DEFAULT_TOTAL_TIMEOUT_MS,
}: Deps): GetPostInteractionsUseCase => {
  const fetchRemote = async (post: Readonly<{ uri: string; url: string | null }>): Promise<PostInteractions> => {
    const controller = new AbortController();
    try {
      const fetched = await withTimeout(remotePostInteractionsFetcher.fetch(post, controller.signal), totalTimeoutMs);
      return fetched === timedOut ? PostInteractions.empty : fetched;
    } catch (error) {
      getLogger().debug(`Failed to fetch the interactions of the remote post: ${post.uri} - ${error}`);
      return PostInteractions.empty;
    } finally {
      controller.abort();
    }
  };

  const run = async ({ postId }: Input): RA<PostInteractions, PostNotFoundError> => {
    const post = await postResolver.resolve(postId);
    if (!post.ok || post.val === undefined) {
      return RA.err(PostNotFoundError.create(postId));
    }
    const isPublic = Post.isVisibleToAnonymous(post.val);
    const [stored, remote] = await Promise.all([
      storedPostInteractionsResolver.resolve({ postId }),
      post.val.type === 'remote' && isPublic && !isBlockedUri(post.val.uri)
        ? fetchRemote({ uri: post.val.uri, url: post.val.url ?? null })
        : PostInteractions.empty,
    ]);
    return RA.ok(PostInteractions.merge(stored.ok ? stored.val : PostInteractions.empty, remote));
  };

  return { run };
};

export const GetPostInteractionsUseCase = {
  create,
} as const;
