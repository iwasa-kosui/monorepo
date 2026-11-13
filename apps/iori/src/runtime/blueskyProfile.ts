import type { RA } from '@iwasa-kosui/result';

import { createBlueskyFeedReader } from '../adaptor/bluesky/blueskyFeedReader.ts';
import { createBlueskyProfileReader } from '../adaptor/bluesky/blueskyProfileReader.ts';
import type { IoriD1Db } from '../adaptor/d1/client.ts';
import { createD1UserResolverByUsername } from '../adaptor/d1/user/userResolverByUsername.ts';
import { Instant } from '../domain/instant/instant.ts';
import type { BlueskyClientError } from '../ports/blueskyClient.ts';
import { FollowBlueskyActorUseCase } from '../useCase/followBlueskyActor.ts';
import { GetBlueskyFeedInfoUseCase } from '../useCase/getBlueskyFeedInfo.ts';
import { GetBlueskyProfileUseCase } from '../useCase/getBlueskyProfile.ts';
import { GetOwnBlueskyProfileUseCase } from '../useCase/getOwnBlueskyProfile.ts';
import { IsDigestOwner } from '../useCase/isDigestOwner.ts';
import { ListBlueskyActorFeedsUseCase } from '../useCase/listBlueskyActorFeeds.ts';
import { ListBlueskyActorFollowersUseCase } from '../useCase/listBlueskyActorFollowers.ts';
import { ListBlueskyActorFollowsUseCase } from '../useCase/listBlueskyActorFollows.ts';
import { ListBlueskyActorLikesUseCase } from '../useCase/listBlueskyActorLikes.ts';
import { ListBlueskyActorListsUseCase } from '../useCase/listBlueskyActorLists.ts';
import { ListBlueskyAuthorFeedUseCase } from '../useCase/listBlueskyAuthorFeed.ts';
import { ListBlueskyFeedPostsUseCase } from '../useCase/listBlueskyFeedPosts.ts';
import { ListBlueskyListMembersUseCase } from '../useCase/listBlueskyListMembers.ts';
import { ListBlueskySavedFeedsUseCase } from '../useCase/listBlueskySavedFeeds.ts';
import { ResolveBlueskyFeedUrlUseCase } from '../useCase/resolveBlueskyFeedUrl.ts';
import { UnfollowBlueskyActorUseCase } from '../useCase/unfollowBlueskyActor.ts';
import { UpdateBlueskyProfileUseCase } from '../useCase/updateBlueskyProfile.ts';
import type { IoriWorkerEnv } from '../workerEnv.ts';
import { createTimelineClient, resolveBlueskyTimelineConfig } from './blueskyTimeline.ts';

export type BlueskyProfileRuntimePorts = Readonly<{
  getBlueskyProfileUseCase: GetBlueskyProfileUseCase | undefined;
  listBlueskyAuthorFeedUseCase: ListBlueskyAuthorFeedUseCase | undefined;
  listBlueskyActorLikesUseCase: ListBlueskyActorLikesUseCase | undefined;
  listBlueskySavedFeedsUseCase: ListBlueskySavedFeedsUseCase | undefined;
  listBlueskyFeedPostsUseCase: ListBlueskyFeedPostsUseCase | undefined;
  getBlueskyFeedInfoUseCase: GetBlueskyFeedInfoUseCase | undefined;
  resolveBlueskyFeedUrlUseCase: ResolveBlueskyFeedUrlUseCase | undefined;
  listBlueskyListMembersUseCase: ListBlueskyListMembersUseCase | undefined;
  listBlueskyActorFeedsUseCase: ListBlueskyActorFeedsUseCase | undefined;
  listBlueskyActorListsUseCase: ListBlueskyActorListsUseCase | undefined;
  listBlueskyActorFollowsUseCase: ListBlueskyActorFollowsUseCase | undefined;
  listBlueskyActorFollowersUseCase: ListBlueskyActorFollowersUseCase | undefined;
  followBlueskyActorUseCase: FollowBlueskyActorUseCase | undefined;
  unfollowBlueskyActorUseCase: UnfollowBlueskyActorUseCase | undefined;
  getOwnBlueskyProfileUseCase: GetOwnBlueskyProfileUseCase | undefined;
  updateBlueskyProfileUseCase: UpdateBlueskyProfileUseCase | undefined;
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
      getBlueskyFeedInfoUseCase: undefined,
      resolveBlueskyFeedUrlUseCase: undefined,
      listBlueskyListMembersUseCase: undefined,
      listBlueskyActorFeedsUseCase: undefined,
      listBlueskyActorListsUseCase: undefined,
      listBlueskyActorFollowsUseCase: undefined,
      listBlueskyActorFollowersUseCase: undefined,
      followBlueskyActorUseCase: undefined,
      unfollowBlueskyActorUseCase: undefined,
      getOwnBlueskyProfileUseCase: undefined,
      updateBlueskyProfileUseCase: undefined,
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
    getBlueskyFeedInfoUseCase: GetBlueskyFeedInfoUseCase.create({ reader: feedReader }),
    resolveBlueskyFeedUrlUseCase: ResolveBlueskyFeedUrlUseCase.create({ reader: feedReader }),
    listBlueskyListMembersUseCase: ListBlueskyListMembersUseCase.create({ reader: feedReader }),
    listBlueskyActorFeedsUseCase: ListBlueskyActorFeedsUseCase.create({ reader: feedReader }),
    listBlueskyActorListsUseCase: ListBlueskyActorListsUseCase.create({ reader: feedReader }),
    listBlueskyActorFollowsUseCase: ListBlueskyActorFollowsUseCase.create({ reader }),
    listBlueskyActorFollowersUseCase: ListBlueskyActorFollowersUseCase.create({ reader }),
    followBlueskyActorUseCase: FollowBlueskyActorUseCase.create({ reader, client }),
    unfollowBlueskyActorUseCase: UnfollowBlueskyActorUseCase.create({ reader, client }),
    getOwnBlueskyProfileUseCase: GetOwnBlueskyProfileUseCase.create({
      reader,
      client,
      viewerDid: () => client.viewerDid(),
    }),
    updateBlueskyProfileUseCase: UpdateBlueskyProfileUseCase.create({ client, now: Instant.now }),
    viewerDid: () => client.viewerDid(),
    isDigestOwner,
  };
};
