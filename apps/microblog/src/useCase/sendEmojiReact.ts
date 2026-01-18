import { isActor, Note, type RequestContext } from '@fedify/fedify';
import { RA } from '@iwasa-kosui/result';
import { getLogger } from '@logtape/logtape';

import type { ActorResolverByUserId } from '../domain/actor/actor.ts';
import {
  AlreadyReactedError,
  EmojiReact,
  type EmojiReactCreatedStore,
  type EmojiReactResolverByActorAndObjectAndEmoji,
} from '../domain/emojiReact/emojiReact.ts';
import { EmojiReactId } from '../domain/emojiReact/emojiReactId.ts';
import { Instant } from '../domain/instant/instant.ts';
import type { SessionExpiredError, SessionResolver } from '../domain/session/session.ts';
import type { SessionId } from '../domain/session/sessionId.ts';
import type { UserNotFoundError, UserResolver } from '../domain/user/user.ts';
import { Federation } from '../federation.ts';
import { resolveLocalActorWith, resolveSessionWith, resolveUserWith } from './helper/resolve.ts';
import { RemoteNoteLookupError } from './sendLike.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{
  sessionId: SessionId;
  objectUri: string;
  emoji: string;
  request: Request;
  ctx: RequestContext<unknown>;
}>;

type Ok = void;

type Err =
  | SessionExpiredError
  | UserNotFoundError
  | RemoteNoteLookupError
  | AlreadyReactedError;

export type SendEmojiReactUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  sessionResolver: SessionResolver;
  userResolver: UserResolver;
  actorResolverByUserId: ActorResolverByUserId;
  emojiReactCreatedStore: EmojiReactCreatedStore;
  emojiReactResolverByActorAndObjectAndEmoji: EmojiReactResolverByActorAndObjectAndEmoji;
}>;

const create = ({
  sessionResolver,
  userResolver,
  actorResolverByUserId,
  emojiReactCreatedStore,
  emojiReactResolverByActorAndObjectAndEmoji,
}: Deps): SendEmojiReactUseCase => {
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
      // Check if already reacted with same emoji
      RA.andThrough(async ({ actor, objectUri, emoji }) => {
        return RA.flow(
          emojiReactResolverByActorAndObjectAndEmoji.resolve({
            actorId: actor.id,
            objectUri,
            emoji,
          }),
          RA.andThen((existingReact) => {
            if (existingReact !== undefined) {
              return RA.err(
                AlreadyReactedError.create({ actorId: actor.id, objectUri, emoji }),
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
      RA.bind('emojiReactCreated', ({ actor, objectUri, emoji }) =>
        EmojiReact.createEmojiReact(
          {
            emojiReactId: EmojiReactId.generate(),
            actorId: actor.id,
            objectUri,
            emoji,
            emojiReactActivityUri: null, // Will be set after sending
          },
          now,
        )),
      RA.andThrough(async ({ emojiReactCreated }) => emojiReactCreatedStore.store(emojiReactCreated)),
      // Log the EmojiReact creation
      // Note: Fedify doesn't have native EmojiReact support, so we currently store locally only.
      // Sending EmojiReact activities to remote servers will require custom JSON-LD handling.
      RA.andThrough(async ({ user, note, emoji, emojiReactCreated }) => {
        getLogger().info(
          `Created EmojiReact: user=${user.username}, note=${note.id?.href}, emoji=${emoji}, id=${emojiReactCreated.aggregateId.emojiReactId}`,
        );
        return RA.ok(undefined);
      }),
      RA.map(() => undefined),
    );

  return { run };
};

export const SendEmojiReactUseCase = {
  create,
} as const;
