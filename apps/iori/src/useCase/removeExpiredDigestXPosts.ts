import { RA, type Result } from '@iwasa-kosui/result';

import {
  Digest,
  type DigestsResolverByXPostsCreatedBefore,
  type DigestXPostsRemovedStore,
} from '../domain/digest/digest.ts';
import { Instant } from '../domain/instant/instant.ts';
import type { PostId } from '../domain/post/postId.ts';
import { X_USER_RETENTION_DAYS } from './fetchXUserItems.ts';
import type { UseCase } from './useCase.ts';

const DAY_MS = 24 * 60 * 60 * 1000;

type Input = void;

type Ok = Readonly<{ removed: number; failed: number }>;

type Err = never;

export type RemoveExpiredDigestXPostsUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  digestsResolverByXPostsCreatedBefore: DigestsResolverByXPostsCreatedBefore;
  digestXPostsRemovedStore: DigestXPostsRemovedStore;
  deletePost: (postId: PostId) => Promise<Result<void, string>>;
  now: () => Instant;
}>;

const create = ({
  digestsResolverByXPostsCreatedBefore,
  digestXPostsRemovedStore,
  deletePost,
  now,
}: Deps): RemoveExpiredDigestXPostsUseCase => {
  const run = async () => {
    const createdBefore = Instant.addDuration(now(), -X_USER_RETENTION_DAYS * DAY_MS);
    const digests = await digestsResolverByXPostsCreatedBefore.resolve({ createdBefore });
    let removed = 0;
    let failed = 0;
    for (const digest of digests.val) {
      if (digest.xPostsPostId === null) continue;
      const deleted = await deletePost(digest.xPostsPostId);
      if (!deleted.ok) {
        console.error('iori digest: deleting the X posts DM failed.', {
          digestId: digest.digestId,
          postId: digest.xPostsPostId,
          errorMessage: deleted.err,
        });
        failed += 1;
        continue;
      }
      await digestXPostsRemovedStore.store(Digest.removeXPosts(digest, now()));
      removed += 1;
    }
    return RA.ok({ removed, failed });
  };

  return { run };
};

export const RemoveExpiredDigestXPostsUseCase = {
  create,
} as const;
