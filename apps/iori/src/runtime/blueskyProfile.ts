import type { RA } from '@iwasa-kosui/result';

import { createBlueskyProfileReader } from '../adaptor/bluesky/blueskyProfileReader.ts';
import type { IoriD1Db } from '../adaptor/d1/client.ts';
import { createD1UserResolverByUsername } from '../adaptor/d1/user/userResolverByUsername.ts';
import { Instant } from '../domain/instant/instant.ts';
import type { BlueskyClientError } from '../ports/blueskyClient.ts';
import { FollowBlueskyActorUseCase } from '../useCase/followBlueskyActor.ts';
import { GetBlueskyProfileUseCase } from '../useCase/getBlueskyProfile.ts';
import { IsDigestOwner } from '../useCase/isDigestOwner.ts';
import { ListBlueskyAuthorFeedUseCase } from '../useCase/listBlueskyAuthorFeed.ts';
import { UnfollowBlueskyActorUseCase } from '../useCase/unfollowBlueskyActor.ts';
import type { IoriWorkerEnv } from '../workerEnv.ts';
import { createTimelineClient, resolveBlueskyTimelineConfig } from './blueskyTimeline.ts';

export type BlueskyProfileRuntimePorts = Readonly<{
  getBlueskyProfileUseCase: GetBlueskyProfileUseCase | undefined;
  listBlueskyAuthorFeedUseCase: ListBlueskyAuthorFeedUseCase | undefined;
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
      followBlueskyActorUseCase: undefined,
      unfollowBlueskyActorUseCase: undefined,
      viewerDid: undefined,
      isDigestOwner,
    };
  }
  const client = createTimelineClient(config, db, deps);
  const reader = createBlueskyProfileReader({ client, now: Instant.now });
  return {
    getBlueskyProfileUseCase: GetBlueskyProfileUseCase.create({ reader }),
    listBlueskyAuthorFeedUseCase: ListBlueskyAuthorFeedUseCase.create({ reader }),
    followBlueskyActorUseCase: FollowBlueskyActorUseCase.create({ reader, client }),
    unfollowBlueskyActorUseCase: UnfollowBlueskyActorUseCase.create({ reader, client }),
    viewerDid: () => client.viewerDid(),
    isDigestOwner,
  };
};
