import { RA } from '@iwasa-kosui/result';

import type { ActorResolverByUserId } from '../domain/actor/actor.ts';
import {
  AlreadyBookmarkedError,
  Bookmark,
  type BookmarkCreatedStore,
  type BookmarkResolver,
} from '../domain/bookmark/bookmark.ts';
import { BookmarkId } from '../domain/bookmark/bookmarkId.ts';
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
  | AlreadyBookmarkedError;

export type CreateBookmarkUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  sessionResolver: SessionResolver;
  userResolver: UserResolver;
  actorResolverByUserId: ActorResolverByUserId;
  bookmarkCreatedStore: BookmarkCreatedStore;
  bookmarkResolver: BookmarkResolver;
}>;

const create = ({
  sessionResolver,
  userResolver,
  actorResolverByUserId,
  bookmarkCreatedStore,
  bookmarkResolver,
}: Deps): CreateBookmarkUseCase => {
  const now = Instant.now();
  const resolveRequesterUser = resolveRequesterUserWith(sessionResolver, userResolver, now);
  const resolveLocalActor = resolveLocalActorWith(actorResolverByUserId);

  const run = async (input: Input) =>
    RA.flow(
      RA.ok(input),
      RA.andBind('user', (input) => resolveRequesterUser(input)),
      RA.andBind('actor', ({ user }) => resolveLocalActor(user.id)),
      RA.andThrough(async ({ actor, postId }) => {
        return RA.flow(
          bookmarkResolver.resolve({ actorId: actor.id, postId }),
          RA.andThen((bookmark) => {
            if (bookmark !== undefined) {
              return RA.err(AlreadyBookmarkedError.create({ actorId: actor.id, postId }));
            }
            return RA.ok(undefined);
          }),
        );
      }),
      RA.bind('bookmarkCreated', ({ actor, postId }) =>
        Bookmark.createBookmark(
          {
            bookmarkId: BookmarkId.generate(),
            actorId: actor.id,
            postId,
          },
          now,
        )),
      RA.andThrough(async ({ bookmarkCreated }) => bookmarkCreatedStore.store(bookmarkCreated)),
      RA.map(() => undefined),
    );

  return { run };
};

export const CreateBookmarkUseCase = {
  create,
} as const;
