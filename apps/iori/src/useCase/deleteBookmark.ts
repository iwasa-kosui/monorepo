import { RA } from '@iwasa-kosui/result';

import type { ActorResolverByUserId } from '../domain/actor/actor.ts';
import {
  Bookmark,
  type BookmarkDeletedStore,
  type BookmarkResolver,
  NotBookmarkedError,
} from '../domain/bookmark/bookmark.ts';
import { Instant } from '../domain/instant/instant.ts';
import type { PostId } from '../domain/post/postId.ts';
import type { SessionExpiredError, SessionResolver } from '../domain/session/session.ts';
import type { UserNotFoundError, UserResolver } from '../domain/user/user.ts';
import { type Requester, resolveLocalActorWith, resolveRequesterUserWith } from './helper/resolve.ts';
import type { UseCase } from './useCase.ts';

type Input =
  & Requester
  & Readonly<{
    postId: PostId;
  }>;

type Ok = void;

type Err =
  | SessionExpiredError
  | UserNotFoundError
  | NotBookmarkedError;

export type DeleteBookmarkUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  sessionResolver: SessionResolver;
  userResolver: UserResolver;
  actorResolverByUserId: ActorResolverByUserId;
  bookmarkDeletedStore: BookmarkDeletedStore;
  bookmarkResolver: BookmarkResolver;
}>;

const create = ({
  sessionResolver,
  userResolver,
  actorResolverByUserId,
  bookmarkDeletedStore,
  bookmarkResolver,
}: Deps): DeleteBookmarkUseCase => {
  const now = Instant.now();
  const resolveRequesterUser = resolveRequesterUserWith(sessionResolver, userResolver, now);
  const resolveLocalActor = resolveLocalActorWith(actorResolverByUserId);

  const run = async (input: Input) =>
    RA.flow(
      RA.ok(input),
      RA.andBind('user', (input) => resolveRequesterUser(input)),
      RA.andBind('actor', ({ user }) => resolveLocalActor(user.id)),
      RA.andBind('bookmark', async ({ actor, postId }) => {
        return RA.flow(
          bookmarkResolver.resolve({ actorId: actor.id, postId }),
          RA.andThen((bookmark) => {
            if (bookmark === undefined) {
              return RA.err(NotBookmarkedError.create({ actorId: actor.id, postId }));
            }
            return RA.ok(bookmark);
          }),
        );
      }),
      RA.bind('bookmarkDeleted', ({ bookmark }) => Bookmark.deleteBookmark(bookmark, now)),
      RA.andThrough(async ({ bookmarkDeleted }) => bookmarkDeletedStore.store(bookmarkDeleted)),
      RA.map(() => undefined),
    );

  return { run };
};

export const DeleteBookmarkUseCase = {
  create,
} as const;
