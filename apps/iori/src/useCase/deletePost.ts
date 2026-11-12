import { type RequestContext } from '@fedify/fedify';
import { Article as FedifyArticle, Delete, isActor, Note, Tombstone } from '@fedify/vocab';
import { RA } from '@iwasa-kosui/result';
import { getLogger } from '@logtape/logtape';
import z from 'zod/v4';

import type { ActorResolverByUserId } from '../domain/actor/actor.ts';
import { Article, type ArticleDeletedStore, type ArticleResolverByRootPostId } from '../domain/article/article.ts';
import { Bookmark, type BookmarkDeletedStore, type BookmarksResolverByPostId } from '../domain/bookmark/bookmark.ts';
import { Instant } from '../domain/instant/instant.ts';
import type { DirectPostParticipantsResolverByPostId } from '../domain/post/directPostParticipants.ts';
import { MENTION_LOOKUP_TIMEOUT_MS, mentionLinksOfHtml, MentionRecipient } from '../domain/post/mention.ts';
import {
  Post,
  type PostDeletedStore,
  PostNotFoundError,
  type PostQuotesResolverByPostIds,
  type PostResolver,
} from '../domain/post/post.ts';
import { PostId } from '../domain/post/postId.ts';
import { SessionExpiredError, type SessionResolver } from '../domain/session/session.ts';
import { UserNotFoundError, type UserResolver } from '../domain/user/user.ts';
import { Schema } from '../helper/schema.ts';
import { timedOut, withTimeout } from '../helper/withTimeout.ts';
import { toQuoteNoteFields } from './helper/quoteNote.ts';
import { type Requester, resolveLocalActorWith, resolveRequesterUserWith } from './helper/resolve.ts';
import { sendToMentions } from './helper/sendToMentions.ts';
import type { RemoveBlueskyCrosspostUseCase } from './removeBlueskyCrosspost.ts';
import type { UseCase } from './useCase.ts';

type Input =
  & Requester
  & Readonly<{
    postId: PostId;
    ctx: RequestContext<unknown>;
  }>;

const Ok = Schema.create(
  z.object({
    success: z.boolean(),
  }),
);
type Ok = z.infer<typeof Ok.zodType>;

type UnauthorizedError = Readonly<{
  type: 'UnauthorizedError';
  message: string;
}>;

const UnauthorizedError = {
  create: (): UnauthorizedError => ({
    type: 'UnauthorizedError',
    message: 'You are not authorized to delete this post.',
  }),
} as const;

type Err = SessionExpiredError | UserNotFoundError | PostNotFoundError | UnauthorizedError;

export type DeletePostUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  sessionResolver: SessionResolver;
  postDeletedStore: PostDeletedStore;
  userResolver: UserResolver;
  actorResolverByUserId: ActorResolverByUserId;
  postResolver: PostResolver;
  postQuotesResolver?: PostQuotesResolverByPostIds;
  // Article is a child aggregate of Post, so we keep it
  articleResolverByRootPostId: ArticleResolverByRootPostId;
  articleDeletedStore: ArticleDeletedStore;
  directPostParticipantsResolverByPostId?: DirectPostParticipantsResolverByPostId;
  bookmarksResolverByPostId?: BookmarksResolverByPostId;
  bookmarkDeletedStore?: BookmarkDeletedStore;
  removeBlueskyCrosspost?: RemoveBlueskyCrosspostUseCase;
}>;

const resolveMentionRecipients = async (
  ctx: RequestContext<unknown>,
  identifier: string,
  hrefs: ReadonlyArray<string>,
): Promise<MentionRecipient[]> => {
  const ownOrigin = ctx.getActorUri(identifier).origin;
  const resolved = await Promise.all(
    hrefs
      .filter((href) => new URL(href).origin !== ownOrigin)
      .map(async (href): Promise<MentionRecipient | undefined> => {
        try {
          const documentLoader = await ctx.getDocumentLoader({ identifier });
          const actor = await withTimeout(
            ctx.lookupObject(href, { documentLoader }),
            MENTION_LOOKUP_TIMEOUT_MS,
          );
          if (actor === timedOut) {
            getLogger().warn(`Timed out resolving the mentioned actor ${href}`);
            return undefined;
          }
          if (!isActor(actor) || actor.id === null || actor.inboxId === null) {
            return undefined;
          }
          const recipient = MentionRecipient.parse({
            id: actor.id.href,
            inboxUrl: actor.inboxId.href,
            sharedInboxUrl: actor.endpoints?.sharedInbox?.href,
          });
          return recipient.ok ? recipient.val : undefined;
        } catch (err) {
          getLogger().warn(`Failed to resolve the mentioned actor ${href}: ${err}`);
          return undefined;
        }
      }),
  );
  return resolved.filter((recipient) => recipient !== undefined);
};

const create = ({
  sessionResolver,
  postDeletedStore,
  userResolver,
  actorResolverByUserId,
  postResolver,
  postQuotesResolver,
  articleResolverByRootPostId,
  articleDeletedStore,
  directPostParticipantsResolverByPostId,
  bookmarksResolverByPostId,
  bookmarkDeletedStore,
  removeBlueskyCrosspost,
}: Deps): DeletePostUseCase => {
  const now = Instant.now();
  const resolveRequesterUser = resolveRequesterUserWith(sessionResolver, userResolver, now);
  const resolveLocalActor = resolveLocalActorWith(actorResolverByUserId);

  const run = async (input: Input) =>
    RA.flow(
      RA.ok(input),
      RA.andBind('user', (requester) => resolveRequesterUser(requester)),
      RA.andBind('actor', ({ user }) => resolveLocalActor(user.id)),
      RA.andBind('post', async ({ postId }) => {
        const post = await postResolver.resolve(postId);
        if (!post.ok) {
          return post;
        }
        if (post.val === undefined) {
          return RA.err(PostNotFoundError.create(postId));
        }
        return RA.ok(post.val);
      }),
      RA.andThen(async ({ post, user, ctx, postId }) => {
        // Check if the user owns this post
        if (post.type !== 'local' || post.userId !== user.id) {
          return RA.err(UnauthorizedError.create());
        }

        // Resolve article if exists (Article is a child aggregate of Post)
        const articleResult = await articleResolverByRootPostId.resolve({ rootPostId: postId });
        const articleToDelete = articleResult.ok ? articleResult.val : undefined;

        // Delete article if exists
        if (articleToDelete) {
          const articleDeleteEvent = Article.deleteArticle(now)(articleToDelete.articleId);
          await articleDeletedStore.store(articleDeleteEvent);
        }

        const participants = post.visibility === 'direct'
          ? await directPostParticipantsResolverByPostId?.resolve(postId)
          : undefined;
        const quotes = post.visibility === 'direct' ? undefined : await postQuotesResolver?.resolve([postId]);
        const quoteRecipients = toQuoteNoteFields(quotes?.ok ? quotes.val.get(postId) : undefined).recipients;

        const bookmarks = await bookmarksResolverByPostId?.resolve({ postId });
        if (bookmarks?.ok) {
          await bookmarkDeletedStore?.store(...bookmarks.val.map((bookmark) => Bookmark.deleteBookmark(bookmark, now)));
        }

        // Delete the post via event store
        const deleteEvent = Post.deletePost(now)(postId);
        await postDeletedStore.store(deleteEvent);
        await removeBlueskyCrosspost?.run({ postId });

        // Build Note URI for the Delete activity using Fedify context
        const noteUri = ctx.getObjectUri(Note, { identifier: user.username, id: postId });

        // Send Delete activity to followers
        const deleteActivity = new Delete({
          id: new URL(`#delete-${postId}`, noteUri),
          actor: ctx.getActorUri(user.username),
          object: new Tombstone({
            id: noteUri,
          }),
        });
        if (post.visibility !== 'direct') {
          await ctx.sendActivity({ identifier: user.username }, 'followers', deleteActivity);
        }
        await sendToMentions({
          ctx,
          identifier: user.username,
          activity: deleteActivity,
          mentions: [
            ...await resolveMentionRecipients(
              ctx,
              user.username,
              participants?.ok
                ? participants.val
                : mentionLinksOfHtml(post.content).map(({ href }) => href),
            ),
            ...quoteRecipients,
          ],
          visibility: post.visibility,
        });

        // If there was a published article, send Delete activity for it too
        if (articleToDelete && articleToDelete.status === 'published') {
          const articleUri = ctx.getObjectUri(FedifyArticle, {
            identifier: user.username,
            id: articleToDelete.articleId,
          });
          await ctx.sendActivity(
            { identifier: user.username },
            'followers',
            new Delete({
              id: new URL(`#delete-${articleToDelete.articleId}`, articleUri),
              actor: ctx.getActorUri(user.username),
              object: new Tombstone({
                id: articleUri,
              }),
            }),
          );
        }

        return RA.ok({ success: true });
      }),
    );

  return { run };
};

export const DeletePostUseCase = {
  create,
} as const;
