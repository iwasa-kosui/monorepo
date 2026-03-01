import { EmojiReact as FedifyEmojiReact, isActor, Note, type RequestContext, Undo } from '@fedify/fedify';
import { RA } from '@iwasa-kosui/result';
import { getLogger } from '@logtape/logtape';

import type { ActorResolverByUserId } from '../domain/actor/actor.ts';
import {
  EmojiReact,
  type EmojiReactDeletedStore,
  EmojiReactNotFoundError,
  type EmojiReactResolverByActorAndPostAndEmoji,
} from '../domain/emojiReact/emojiReact.ts';
import { Instant } from '../domain/instant/instant.ts';
import type { Post, PostNotFoundError, PostResolver } from '../domain/post/post.ts';
import type { PostId } from '../domain/post/postId.ts';
import type { SessionExpiredError, SessionResolver } from '../domain/session/session.ts';
import type { SessionId } from '../domain/session/sessionId.ts';
import type { UserNotFoundError, UserResolver } from '../domain/user/user.ts';
import { resolveLocalActorWith, resolveSessionWith, resolveUserWith } from './helper/resolve.ts';
import { RemoteNoteLookupError } from './sendLike.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{
  sessionId: SessionId;
  postId: PostId;
  emoji: string;
  request: Request;
  ctx: RequestContext<unknown>;
}>;

type Ok = void;

type Err =
  | SessionExpiredError
  | UserNotFoundError
  | PostNotFoundError
  | EmojiReactNotFoundError
  | RemoteNoteLookupError;

export type UndoEmojiReactUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  sessionResolver: SessionResolver;
  userResolver: UserResolver;
  actorResolverByUserId: ActorResolverByUserId;
  emojiReactDeletedStore: EmojiReactDeletedStore;
  emojiReactResolverByActorAndPostAndEmoji: EmojiReactResolverByActorAndPostAndEmoji;
  postResolver: PostResolver;
}>;

const create = ({
  sessionResolver,
  userResolver,
  actorResolverByUserId,
  emojiReactDeletedStore,
  emojiReactResolverByActorAndPostAndEmoji,
  postResolver,
}: Deps): UndoEmojiReactUseCase => {
  const now = Instant.now();
  const resolveSession = resolveSessionWith(sessionResolver, now);
  const resolveUser = resolveUserWith(userResolver);
  const resolveLocalActor = resolveLocalActorWith(actorResolverByUserId);

  const resolvePostOrErr = (postId: PostId): RA<Post, PostNotFoundError> =>
    RA.flow(
      postResolver.resolve(postId),
      RA.andThen((post) =>
        post === undefined
          ? RA.err(
            {
              type: 'PostNotFoundError',
              message: `Post not found: ${postId}`,
              detail: { postId },
            } as PostNotFoundError,
          )
          : RA.ok(post)
      ),
    );

  const run = async (input: Input) =>
    RA.flow(
      RA.ok(input),
      RA.andBind('session', ({ sessionId }) => resolveSession(sessionId)),
      RA.andBind('user', ({ session }) => resolveUser(session.userId)),
      RA.andBind('actor', ({ user }) => resolveLocalActor(user.id)),
      // Resolve the post
      RA.andBind('post', ({ postId }) => resolvePostOrErr(postId)),
      // Find the existing emoji react
      RA.andBind('emojiReact', async ({ actor, postId, emoji }) => {
        const result = await emojiReactResolverByActorAndPostAndEmoji.resolve({
          actorId: actor.id,
          postId,
          emoji,
        });
        if (!result.ok) {
          return result;
        }
        if (!result.val) {
          return RA.err(
            EmojiReactNotFoundError.create({ emojiReactActivityUri: `${actor.id}:${postId}:${emoji}` }),
          );
        }
        return RA.ok(result.val);
      }),
      // Delete the emoji react from database
      RA.andThrough(async ({ emojiReact }) => {
        const syntheticActivityUri = emojiReact.emojiReactActivityUri
          || `local:emoji-react:${emojiReact.emojiReactId}`;
        const emojiReactWithUri = {
          ...emojiReact,
          emojiReactActivityUri: syntheticActivityUri,
        };
        const event = EmojiReact.deleteEmojiReact(emojiReactWithUri, now);
        return emojiReactDeletedStore.store(event);
      }),
      // Send Undo activity to the remote server (only for remote posts)
      RA.andThrough(async ({ user, post, ctx, emoji, emojiReact }) => {
        // Local posts don't need ActivityPub delivery
        if (post.type === 'local') {
          return RA.ok(undefined);
        }

        const objectUri = post.uri;
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

        const author = await result.getAttribution();
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

        const actorUri = ctx.getActorUri(user.username);

        const originalActivityId = new URL(
          `#emoji-reacts/${emojiReact.emojiReactId}`,
          actorUri,
        );

        const undoActivityId = new URL(
          `#undo-emoji-reacts/${emojiReact.emojiReactId}`,
          actorUri,
        );

        await ctx.sendActivity(
          { username: user.username },
          author,
          new Undo({
            id: undoActivityId,
            actor: actorUri,
            object: new FedifyEmojiReact({
              id: originalActivityId,
              actor: actorUri,
              object: result.id,
              content: emoji,
            }),
            to: author.id,
          }),
        );

        getLogger().info(
          `Sent Undo EmojiReact: user=${user.username}, note=${result.id.href}, emoji=${emoji}`,
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
