import { isActor, Like, Note, type RequestContext } from '@fedify/fedify';
import { RA } from '@iwasa-kosui/result';

import type { ActorResolverByUserId } from '../domain/actor/actor.ts';
import { Instant } from '../domain/instant/instant.ts';
import { AlreadyLikedError, Like as AppLike, type LikeCreatedStore, type LikeResolver } from '../domain/like/like.ts';
import { LikeId } from '../domain/like/likeId.ts';
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
  | RemoteNoteLookupError
  | AlreadyLikedError;

export type SendLikeUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  sessionResolver: SessionResolver;
  userResolver: UserResolver;
  actorResolverByUserId: ActorResolverByUserId;
  likeCreatedStore: LikeCreatedStore;
  likeResolver: LikeResolver;
}>;

const create = ({
  sessionResolver,
  userResolver,
  actorResolverByUserId,
  likeCreatedStore,
  likeResolver,
}: Deps): SendLikeUseCase => {
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
      // Check if already liked
      RA.andThrough(async ({ actor, objectUri }) => {
        const existingLike = await likeResolver.resolve({
          actorId: actor.id,
          objectUri,
        });
        return RA.flow(
          likeResolver.resolve({
            actorId: actor.id,
            objectUri,
          }),
          RA.andThen((like) => {
            if (like !== undefined) {
              return RA.err(
                AlreadyLikedError.create({ actorId: actor.id, objectUri }),
              );
            }
            return RA.ok(undefined);
          }),
        );
      }),
      // Lookup the remote note
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
      RA.bind('likeCreated', ({ actor, objectUri }) =>
        AppLike.createLike(
          {
            likeId: LikeId.generate(),
            actorId: actor.id,
            objectUri,
          },
          now,
        )),
      RA.andThrough(async ({ likeCreated }) => likeCreatedStore.store(likeCreated)),
      // Send the Like activity
      RA.andThrough(async ({ user, note, noteAuthor, ctx, likeCreated }) => {
        await ctx.sendActivity(
          { username: user.username },
          noteAuthor,
          new Like({
            id: new URL(
              `#likes/${likeCreated.aggregateId.likeId}`,
              ctx.getActorUri(user.username),
            ),
            actor: ctx.getActorUri(user.username),
            object: note.id,
            to: noteAuthor.id,
          }),
        );
        return RA.ok(undefined);
      }),
      RA.map(() => undefined),
    );

  return { run };
};

export const SendLikeUseCase = {
  create,
} as const;
