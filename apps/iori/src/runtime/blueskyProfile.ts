import type { RA } from '@iwasa-kosui/result';

import { createBlueskyFeedReader } from '../adaptor/bluesky/blueskyFeedReader.ts';
import { createBlueskyProfileReader } from '../adaptor/bluesky/blueskyProfileReader.ts';
import type { IoriD1Db } from '../adaptor/d1/client.ts';
import { createD1UserResolverByUsername } from '../adaptor/d1/user/userResolverByUsername.ts';
import { Instant } from '../domain/instant/instant.ts';
import type { BlueskyClientError } from '../ports/blueskyClient.ts';
import { FollowBlueskyActorUseCase } from '../useCase/followBlueskyActor.ts';
import { GetBlueskyProfileUseCase } from '../useCase/getBlueskyProfile.ts';
import { IsDigestOwner } from '../useCase/isDigestOwner.ts';
import { ListBlueskyActorLikesUseCase } from '../useCase/listBlueskyActorLikes.ts';
import { ListBlueskyAuthorFeedUseCase } from '../useCase/listBlueskyAuthorFeed.ts';
import { ListBlueskyFeedPostsUseCase } from '../useCase/listBlueskyFeedPosts.ts';
import { ListBlueskySavedFeedsUseCase } from '../useCase/listBlueskySavedFeeds.ts';
import { UnfollowBlueskyActorUseCase } from '../useCase/unfollowBlueskyActor.ts';
import type { IoriWorkerEnv } from '../workerEnv.ts';
import { createTimelineClient, resolveBlueskyTimelineConfig } from './blueskyTimeline.ts';

export type BlueskyProfileRuntimePorts = Readonly<{
  getBlueskyProfileUseCase: GetBlueskyProfileUseCase | undefined;
  listBlueskyAuthorFeedUseCase: ListBlueskyAuthorFeedUseCase | undefined;
  listBlueskyActorLikesUseCase: ListBlueskyActorLikesUseCase | undefined;
  listBlueskySavedFeedsUseCase: ListBlueskySavedFeedsUseCase | undefined;
  listBlueskyFeedPostsUseCase: ListBlueskyFeedPostsUseCase | undefined;
  followBlueskyActorUseCase: FollowBlueskyActorUseCase | undefined;
  unfollowBlueskyActorUseCase: UnfollowBlueskyActorUseCase | undefined;
  viewerDid: (() => RA<string, BlueskyClientError>) | undefined;
  isDigestOwner: IsDigestOwner;
}>;

export const createBlueskyProfileRuntimePorts = (
  env: IoriWorkerEnv,
  db: IoriD1Db,
  deps: Readonly<{ fetch?: typeof fetch }> = {},
): BlueskyProfileRuntimePorts => {
  const isDigestOwner = IsDigestOwner.create({ userResolverByUsername: createD1UserResolverByUsername(db) });
  const config = resolveBlueskyTimelineConfig(env);
  if (config === undefined) {
    return {
      getBlueskyProfileUseCase: undefined,
      listBlueskyAuthorFeedUseCase: undefined,
      listBlueskyActorLikesUseCase: undefined,
      listBlueskySavedFeedsUseCase: undefined,
      listBlueskyFeedPostsUseCase: undefined,
      followBlueskyActorUseCase: undefined,
      unfollowBlueskyActorUseCase: undefined,
      viewerDid: undefined,
      isDigestOwner,
    };
  }
  const client = createTimelineClient(config, db, deps);
  const reader = createBlueskyProfileReader({ client, now: Instant.now });
  const feedReader = createBlueskyFeedReader({ client, now: Instant.now });
  return {
    getBlueskyProfileUseCase: GetBlueskyProfileUseCase.create({ reader }),
    listBlueskyAuthorFeedUseCase: ListBlueskyAuthorFeedUseCase.create({ reader }),
    listBlueskyActorLikesUseCase: ListBlueskyActorLikesUseCase.create({ reader, viewerDid: () => client.viewerDid() }),
    listBlueskySavedFeedsUseCase: ListBlueskySavedFeedsUseCase.create({ reader: feedReader }),
    listBlueskyFeedPostsUseCase: ListBlueskyFeedPostsUseCase.create({ reader: feedReader }),
    followBlueskyActorUseCase: FollowBlueskyActorUseCase.create({ reader, client }),
    unfollowBlueskyActorUseCase: UnfollowBlueskyActorUseCase.create({ reader, client }),
    viewerDid: () => client.viewerDid(),
    isDigestOwner,
  };
};
