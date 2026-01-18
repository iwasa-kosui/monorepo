import { EmojiReact as FedifyEmojiReact, isActor, Note, type RequestContext, Undo } from '@fedify/fedify';
import { RA } from '@iwasa-kosui/result';
import { getLogger } from '@logtape/logtape';

import type { ActorResolverByUserId } from '../domain/actor/actor.ts';
import {
  EmojiReact,
  type EmojiReactDeletedStore,
  EmojiReactNotFoundError,
  type EmojiReactResolverByActorAndObjectAndEmoji,
} from '../domain/emojiReact/emojiReact.ts';
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
  | EmojiReactNotFoundError
  | RemoteNoteLookupError;

export type UndoEmojiReactUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  sessionResolver: SessionResolver;
  userResolver: UserResolver;
  actorResolverByUserId: ActorResolverByUserId;
  emojiReactDeletedStore: EmojiReactDeletedStore;
  emojiReactResolverByActorAndObjectAndEmoji: EmojiReactResolverByActorAndObjectAndEmoji;
}>;

const create = ({
  sessionResolver,
  userResolver,
  actorResolverByUserId,
  emojiReactDeletedStore,
  emojiReactResolverByActorAndObjectAndEmoji,
}: Deps): UndoEmojiReactUseCase => {
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
      // Find the existing emoji react
      RA.andBind('emojiReact', async ({ actor, objectUri, emoji }) => {
        const result = await emojiReactResolverByActorAndObjectAndEmoji.resolve({
          actorId: actor.id,
          objectUri,
          emoji,
        });
        if (!result.ok) {
          return result;
        }
        if (!result.val) {
          return RA.err(
            EmojiReactNotFoundError.create({ emojiReactActivityUri: `${actor.id}:${objectUri}:${emoji}` }),
          );
        }
        return RA.ok(result.val);
      }),
      // Lookup the remote note to get the author
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
            RemoteNoteLookupError.create(objectUri, 'Could not resolve Note ID'),
          );
        }

        return RA.ok(result);
      }),
      // Get the note's author
      RA.andBind('noteAuthor', async ({ note, objectUri }) => {
        const author = await note.getAttribution();
        if (!author || !isActor(author)) {
          return RA.err(
            RemoteNoteLookupError.create(objectUri, 'Could not resolve Note author'),
          );
        }
        if (!author.id || !author.inboxId) {
          return RA.err(
            RemoteNoteLookupError.create(objectUri, 'Note author has no inbox'),
          );
        }
        return RA.ok(author);
      }),
      // Delete the emoji react from database
      RA.andThrough(async ({ emojiReact }) => {
        // For local emoji reacts without emojiReactActivityUri, we need to handle differently
        // We'll create a synthetic activity URI for the deletion event
        const syntheticActivityUri = emojiReact.emojiReactActivityUri
          || `local:emoji-react:${emojiReact.emojiReactId}`;
        const emojiReactWithUri = {
          ...emojiReact,
          emojiReactActivityUri: syntheticActivityUri,
        };
        const event = EmojiReact.deleteEmojiReact(emojiReactWithUri, now);
        return emojiReactDeletedStore.store(event);
      }),
      // Send Undo activity to the remote server
      RA.andThrough(async ({ user, note, noteAuthor, ctx, emoji, emojiReact }) => {
        const actorUri = ctx.getActorUri(user.username);

        // Construct the original EmojiReact activity ID
        const originalActivityId = new URL(
          `#emoji-reacts/${emojiReact.emojiReactId}`,
          actorUri,
        );

        // Create Undo activity wrapping the EmojiReact
        const undoActivityId = new URL(
          `#undo-emoji-reacts/${emojiReact.emojiReactId}`,
          actorUri,
        );

        await ctx.sendActivity(
          { username: user.username },
          noteAuthor,
          new Undo({
            id: undoActivityId,
            actor: actorUri,
            object: new FedifyEmojiReact({
              id: originalActivityId,
              actor: actorUri,
              object: note.id,
              content: emoji,
            }),
            to: noteAuthor.id,
          }),
        );

        getLogger().info(
          `Sent Undo EmojiReact: user=${user.username}, note=${note.id?.href}, emoji=${emoji}`,
        );
        return RA.ok(undefined);
      }),
      RA.map(() => undefined),
    );

  return { run };
};

export const UndoEmojiReactUseCase = {
  create,
} as const;
