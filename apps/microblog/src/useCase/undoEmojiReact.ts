import { type RequestContext } from '@fedify/fedify';
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
import { resolveLocalActorWith, resolveSessionWith, resolveUserWith } from './helper/resolve.ts';
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
  | EmojiReactNotFoundError;

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
      // Send Undo activity (best effort, only if we can construct the activity)
      RA.andThrough(async ({ user, ctx }) => {
        try {
          const actorUri = ctx.getActorUri(user.username);
          // Note: Sending Undo for EmojiReact is complex because we'd need to
          // reference the original EmojiReact activity. For now, we just log.
          getLogger().info(`EmojiReact deleted for user ${user.username} at ${actorUri}`);
        } catch (e) {
          getLogger().warn(`Failed to send Undo EmojiReact activity: ${e}`);
        }
        return RA.ok(undefined);
      }),
      RA.map(() => undefined),
    );

  return { run };
};

export const UndoEmojiReactUseCase = {
  create,
} as const;
