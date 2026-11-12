import { type RequestContext } from '@fedify/fedify';
import { Emoji, EmojiReact as FedifyEmojiReact, Image, isActor } from '@fedify/vocab';
import { type DocumentLoader } from '@fedify/vocab-runtime';
import { RA } from '@iwasa-kosui/result';
import { getLogger } from '@logtape/logtape';

import type { ActorResolverByUserId } from '../domain/actor/actor.ts';
import { toAcceptableEmojiImageUrl } from '../domain/emojiReact/emojiImageUrl.ts';
import {
  AlreadyReactedError,
  EmojiReact,
  type EmojiReactCreatedStore,
  type EmojiReactResolverByActorAndPostAndEmoji,
} from '../domain/emojiReact/emojiReact.ts';
import { EmojiReactId } from '../domain/emojiReact/emojiReactId.ts';
import { Instant } from '../domain/instant/instant.ts';
import type { Post, PostNotFoundError, PostResolver } from '../domain/post/post.ts';
import type { PostId } from '../domain/post/postId.ts';
import type { SessionExpiredError, SessionResolver } from '../domain/session/session.ts';
import type { UserNotFoundError, UserResolver } from '../domain/user/user.ts';
import { isRemotePostObject, type RemotePostObject } from './helper/remotePostObject.ts';
import { type Requester, resolveLocalActorWith, resolveRequesterUserWith } from './helper/resolve.ts';
import { RemoteNoteLookupError } from './sendLike.ts';
import type { UseCase } from './useCase.ts';

type Input =
  & Requester
  & Readonly<{
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
  | RemoteNoteLookupError
  | AlreadyReactedError;

export type SendEmojiReactUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  sessionResolver: SessionResolver;
  userResolver: UserResolver;
  actorResolverByUserId: ActorResolverByUserId;
  emojiReactCreatedStore: EmojiReactCreatedStore;
  emojiReactResolverByActorAndPostAndEmoji: EmojiReactResolverByActorAndPostAndEmoji;
  postResolver: PostResolver;
}>;

type EmojiImage = Readonly<{
  id?: URL;
  url: URL;
  mediaType?: string;
}>;

const findEmojiImage = async (
  note: RemotePostObject,
  emoji: string,
  documentLoader: DocumentLoader,
): Promise<EmojiImage | undefined> => {
  try {
    for await (const tag of note.getTags({ documentLoader })) {
      if (!(tag instanceof Emoji) || tag.name?.toString() !== emoji) {
        continue;
      }
      const icon = await tag.getIcon({ documentLoader });
      const url = icon?.url instanceof URL ? icon.url : icon?.url?.href;
      const acceptableUrl = toAcceptableEmojiImageUrl(url?.href);
      if (acceptableUrl === null) {
        continue;
      }
      return {
        ...(tag.id ? { id: tag.id } : {}),
        url: new URL(acceptableUrl),
        ...(icon?.mediaType?.startsWith('image/') ? { mediaType: icon.mediaType } : {}),
      };
    }
  } catch (err) {
    getLogger().warn(`findEmojiImage: ${err}`);
  }
  return undefined;
};

const create = ({
  sessionResolver,
  userResolver,
  actorResolverByUserId,
  emojiReactCreatedStore,
  emojiReactResolverByActorAndPostAndEmoji,
  postResolver,
}: Deps): SendEmojiReactUseCase => {
  const now = Instant.now();
  const resolveRequesterUser = resolveRequesterUserWith(sessionResolver, userResolver, now);
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
      RA.andBind('user', (input) => resolveRequesterUser(input)),
      RA.andBind('actor', ({ user }) => resolveLocalActor(user.id)),
      // Resolve the post
      RA.andBind('post', ({ postId }) => resolvePostOrErr(postId)),
      // Check if already reacted with same emoji
      RA.andThrough(async ({ actor, postId, emoji }) => {
        return RA.flow(
          emojiReactResolverByActorAndPostAndEmoji.resolve({
            actorId: actor.id,
            postId,
            emoji,
          }),
          RA.andThen((existingReact) => {
            if (existingReact !== undefined) {
              return RA.err(
                AlreadyReactedError.create({ actorId: actor.id, postId, emoji }),
              );
            }
            return RA.ok(undefined);
          }),
        );
      }),
      RA.andBind('remote', async ({ user, post, ctx, emoji }) => {
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

        if (!isRemotePostObject(result)) {
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

        const emojiImage = await findEmojiImage(result, emoji, documentLoader);

        return RA.ok({ noteId: result.id, author, authorId: author.id, emojiImage });
      }),
      // Create and store emoji react
      RA.bind('emojiReactCreated', ({ actor, postId, emoji, remote }) =>
        EmojiReact.createEmojiReact(
          {
            emojiReactId: EmojiReactId.generate(),
            actorId: actor.id,
            postId,
            emoji,
            emojiReactActivityUri: null,
            emojiImageUrl: remote?.emojiImage?.url.href ?? null,
          },
          now,
        )),
      RA.andThrough(async ({ emojiReactCreated }) => emojiReactCreatedStore.store(emojiReactCreated)),
      // Send the EmojiReact activity to the remote server (only for remote posts)
      RA.andThrough(async ({ user, ctx, emoji, emojiReactCreated, remote }) => {
        if (remote === undefined) {
          return RA.ok(undefined);
        }

        const actorUri = ctx.getActorUri(user.username);
        const activityId = new URL(
          `#emoji-reacts/${emojiReactCreated.aggregateId.emojiReactId}`,
          actorUri,
        );

        await ctx.sendActivity(
          { username: user.username },
          remote.author,
          new FedifyEmojiReact({
            id: activityId,
            actor: actorUri,
            object: remote.noteId,
            content: emoji,
            to: remote.authorId,
            ...(remote.emojiImage
              ? {
                tags: [
                  new Emoji({
                    id: remote.emojiImage.id,
                    name: emoji,
                    icon: new Image({ url: remote.emojiImage.url, mediaType: remote.emojiImage.mediaType }),
                  }),
                ],
              }
              : {}),
          }),
        );

        getLogger().info(
          `Sent EmojiReact: user=${user.username}, note=${remote.noteId.href}, emoji=${emoji}, activityId=${activityId.href}`,
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
