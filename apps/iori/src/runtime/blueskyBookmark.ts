import type { RA } from '@iwasa-kosui/result';

import { createBlueskyBookmarkReader } from '../adaptor/bluesky/blueskyBookmarkReader.ts';
import { createBlueskyPostCidResolver } from '../adaptor/bluesky/blueskyPostCidResolver.ts';
import { createD1BlueskyBookmarkDeletedStore } from '../adaptor/d1/blueskyTimeline/blueskyBookmarkDeletedStore.ts';
import { createD1BlueskyBookmarkSavedStore } from '../adaptor/d1/blueskyTimeline/blueskyBookmarkSavedStore.ts';
import { createD1BlueskyBookmarkTargetResolver } from '../adaptor/d1/blueskyTimeline/blueskyBookmarkTargetResolver.ts';
import { createD1BlueskyViewerBookmarksSyncedStore } from '../adaptor/d1/blueskyTimeline/blueskyViewerBookmarksSyncedStore.ts';
import type { IoriD1Db } from '../adaptor/d1/client.ts';
import { createD1UserResolverByUsername } from '../adaptor/d1/user/userResolverByUsername.ts';
import { Instant } from '../domain/instant/instant.ts';
import type { BlueskyClientError } from '../ports/blueskyClient.ts';
import { BookmarkBlueskyPostUseCase } from '../useCase/bookmarkBlueskyPost.ts';
import { IsDigestOwner } from '../useCase/isDigestOwner.ts';
import { ListBlueskyBookmarksUseCase } from '../useCase/listBlueskyBookmarks.ts';
import { UnbookmarkBlueskyPostUseCase } from '../useCase/unbookmarkBlueskyPost.ts';
import type { IoriWorkerEnv } from '../workerEnv.ts';
import { createTimelineClient, resolveBlueskyTimelineConfig } from './blueskyTimeline.ts';

export type BlueskyBookmarkRuntimePorts = Readonly<{
  bookmarkBlueskyPostUseCase: BookmarkBlueskyPostUseCase | undefined;
  unbookmarkBlueskyPostUseCase: UnbookmarkBlueskyPostUseCase | undefined;
  listBlueskyBookmarksUseCase: ListBlueskyBookmarksUseCase | undefined;
  viewerDid: (() => RA<string, BlueskyClientError>) | undefined;
  isDigestOwner: IsDigestOwner;
}>;

export const createBlueskyBookmarkRuntimePorts = (
  env: IoriWorkerEnv,
  db: IoriD1Db,
  deps: Readonly<{ fetch?: typeof fetch }> = {},
): BlueskyBookmarkRuntimePorts => {
  const isDigestOwner = IsDigestOwner.create({ userResolverByUsername: createD1UserResolverByUsername(db) });
  const config = resolveBlueskyTimelineConfig(env);
  if (config === undefined) {
    return {
      bookmarkBlueskyPostUseCase: undefined,
      unbookmarkBlueskyPostUseCase: undefined,
      listBlueskyBookmarksUseCase: undefined,
      viewerDid: undefined,
      isDigestOwner,
    };
  }
  const client = createTimelineClient(config, db, deps);
  const targetResolver = createD1BlueskyBookmarkTargetResolver(db);
  return {
    bookmarkBlueskyPostUseCase: BookmarkBlueskyPostUseCase.create({
      client,
      targetResolver,
      cidResolver: createBlueskyPostCidResolver({ client }),
      savedStore: createD1BlueskyBookmarkSavedStore(db),
      now: Instant.now,
    }),
    unbookmarkBlueskyPostUseCase: UnbookmarkBlueskyPostUseCase.create({
      client,
      targetResolver,
      deletedStore: createD1BlueskyBookmarkDeletedStore(db),
    }),
    listBlueskyBookmarksUseCase: ListBlueskyBookmarksUseCase.create({
      reader: createBlueskyBookmarkReader({ client, now: Instant.now }),
      viewerBookmarksStore: createD1BlueskyViewerBookmarksSyncedStore(db),
    }),
    viewerDid: () => client.viewerDid(),
    isDigestOwner,
  };
};
