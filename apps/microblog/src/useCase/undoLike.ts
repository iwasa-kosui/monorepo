import { isActor, Like, Note, type RequestContext, Undo } from '@fedify/fedify';
import { RA } from '@iwasa-kosui/result';

import type { ActorResolverByUserId } from '../domain/actor/actor.ts';
import { Instant } from '../domain/instant/instant.ts';
import {
  Like as AppLike,
  type LikeDeletedStore,
  type LikeResolver,
  NotLikedError,
} from '../domain/like/like.ts';
import type { SessionExpiredError, SessionResolver } from '../domain/session/session.ts';
import type { SessionId } from '../domain/session/sessionId.ts';
import type { UserNotFoundError, UserResolver } from '../domain/user/user.ts';
import { Federation } from '../federation.ts';
import { resolveLocalActorWith, resolveSessionWith, resolveUserWith } from './helper/resolve.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{
  sessionId: SessionId;
  objectUri: string;
  request: Request;
  ctx: RequestContext<unknown>;
}>;

type Ok = void;

export type RemoteNoteLookupError = Readonly<{
  type: 'RemoteNoteLookupError';
  message: string;
  detail: {
    objectUri: string;
    reason: string;
  };
}>;

export const RemoteNoteLookupError = {
  create: (objectUri: string, reason: string): RemoteNoteLookupError => ({
    type: 'RemoteNoteLookupError',
    message: `Failed to lookup remote note "${objectUri}": ${reason}`,
    detail: { objectUri, reason },
  }),
} as const;

type Err =
  | SessionExpiredError
  | UserNotFoundError
  | NotLikedError
  | RemoteNoteLookupError;

export type UndoLikeUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  sessionResolver: SessionResolver;
  userResolver: UserResolver;
  actorResolverByUserId: ActorResolverByUserId;
  likeResolver: LikeResolver;
  likeDeletedStore: LikeDeletedStore;
}>;

const create = ({
  sessionResolver,
  userResolver,
  actorResolverByUserId,
  likeResolver,
  likeDeletedStore,
}: Deps): UndoLikeUseCase => {
  const now = Instant.now();
  const resolveSession = resolveSessionWith(sessionResolver, now);
  const resolveUser = resolveUserWith(userResolver);
  const resolveLocalActor = resolveLocalActorWith(actorResolverByUserId);

  const run = async (input: Input) =>
    RA.flow(
      RA.ok(input),
      RA.andBind('session', ({ sessionId }) => resolveSession(sessionId)),
      RA.andBind('user', ({ session }) => resolveUser(session.userId)),
      RA.andBind('actor', ({ user }) => resolveLocalActor(user.id)),
      // Find the like
      RA.andBind('like', async ({ actor, objectUri }) => {
        return RA.flow(
          likeResolver.resolve({
            actorId: actor.id,
            objectUri,
          }),
          RA.andThen((like) => {
            if (like === undefined) {
              return RA.err(NotLikedError.create(objectUri));
            }
            return RA.ok(like);
          }),
        );
      }),
      // Lookup the remote note for sending Undo
      RA.andBind('note', async ({ user, request, objectUri }) => {
        const ctx = Federation.getInstance().createContext(request, undefined);
        const documentLoader = await ctx.getDocumentLoader({
          identifier: user.username,
        });
        const result = await ctx.lookupObject(objectUri.trim(), {
          documentLoader,
        });

        if (!(result instanceof Note)) {
          return RA.err(
            RemoteNoteLookupError.create(objectUri, 'Not a valid Note object'),
          );
        }

        if (!result.id) {
          return RA.err(
            RemoteNoteLookupError.create(
              objectUri,
              'Could not resolve Note ID',
            ),
          );
        }

        return RA.ok(result);
      }),
      // Get the note's author
      RA.andBind('noteAuthor', async ({ note, objectUri }) => {
        const author = await note.getAttribution();
        if (!author || !isActor(author)) {
          return RA.err(
            RemoteNoteLookupError.create(
              objectUri,
              'Could not resolve Note author',
            ),
          );
        }
        if (!author.id || !author.inboxId) {
          return RA.err(
            RemoteNoteLookupError.create(objectUri, 'Note author has no inbox'),
          );
        }
        return RA.ok(author);
      }),
      // Delete the like
      RA.andThrough(async ({ like }) => {
        const deletedEvent = AppLike.deleteLike(like, now);
        return likeDeletedStore.store(deletedEvent);
      }),
      // Send Undo Like activity
      RA.andThrough(async ({ ctx, user, like, note, noteAuthor }) => {
        const actorUri = ctx.getActorUri(user.username);

        await ctx.sendActivity(
          { username: user.username },
          noteAuthor,
          new Undo({
            id: new URL(`#undo-likes/${like.likeId}`, actorUri),
            actor: actorUri,
            object: new Like({
              id: new URL(`#likes/${like.likeId}`, actorUri),
              actor: actorUri,
              object: note.id,
            }),
            to: noteAuthor.id,
          }),
        );
        return RA.ok(undefined);
      }),
      RA.map(() => undefined),
    );

  return { run };
};

export const UndoLikeUseCase = {
  create,
} as const;
