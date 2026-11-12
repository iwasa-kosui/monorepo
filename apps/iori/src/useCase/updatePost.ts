import { type RequestContext } from '@fedify/fedify';
import { Update } from '@fedify/vocab';
import { RA, type Result } from '@iwasa-kosui/result';
import { getLogger } from '@logtape/logtape';
import z from 'zod/v4';

import type { PostImagesResolverByPostId } from '../domain/image/image.ts';
import { Instant } from '../domain/instant/instant.ts';
import type { MentionRecipient } from '../domain/post/mention.ts';
import {
  type LocalPost,
  Post,
  PostNotFoundError,
  type PostQuotesResolverByPostIds,
  type PostResolver,
  type PostUpdatedStore,
} from '../domain/post/post.ts';
import type { PostId } from '../domain/post/postId.ts';
import { appendQuoteInline } from '../domain/post/quoteInline.ts';
import type { AcceptedRelaysResolver } from '../domain/relay/relay.ts';
import type { SessionExpiredError, SessionResolver } from '../domain/session/session.ts';
import { User, type UserNotFoundError, type UserResolver } from '../domain/user/user.ts';
import { Schema } from '../helper/schema.ts';
import { buildLocalNote } from './helper/localNote.ts';
import { toQuoteNoteFields } from './helper/quoteNote.ts';
import { type Requester, resolveRequesterUserWith } from './helper/resolve.ts';
import { sendToMentions } from './helper/sendToMentions.ts';
import type { UseCase } from './useCase.ts';

type Input =
  & Requester
  & Readonly<{
    postId: PostId;
    content: string;
    sourceText: string;
    summary: string | null;
    sensitive: boolean;
    mentions?: ReadonlyArray<MentionRecipient>;
    ctx: RequestContext<unknown>;
  }>;

const Ok = Schema.create(
  z.object({
    post: Post.zodType,
    user: User.zodType,
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
    message: 'You are not authorized to update this post.',
  }),
} as const;

type Err = SessionExpiredError | UserNotFoundError | PostNotFoundError | UnauthorizedError;

export type UpdatePostUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  sessionResolver: SessionResolver;
  userResolver: UserResolver;
  postResolver: PostResolver;
  postUpdatedStore: PostUpdatedStore;
  postImagesResolver: PostImagesResolverByPostId;
  postQuotesResolver?: PostQuotesResolverByPostIds;
  acceptedRelaysResolver: AcceptedRelaysResolver;
  origin: string;
}>;

const create = ({
  sessionResolver,
  userResolver,
  postResolver,
  postUpdatedStore,
  postImagesResolver,
  postQuotesResolver,
  acceptedRelaysResolver,
  origin,
}: Deps): UpdatePostUseCase => {
  const now = Instant.now();
  const resolveRequesterUser = resolveRequesterUserWith(sessionResolver, userResolver, now);

  const run = async (input: Input) =>
    RA.flow(
      RA.ok(input),
      RA.andBind('user', (requester) => resolveRequesterUser(requester)),
      RA.andBind(
        'post',
        async ({ postId, user }): Promise<Result<LocalPost, PostNotFoundError | UnauthorizedError>> => {
          const resolved = await postResolver.resolve(postId);
          if (!resolved.ok) {
            return resolved;
          }
          if (resolved.val === undefined) {
            return RA.err(PostNotFoundError.create(postId));
          }
          if (resolved.val.type !== 'local' || resolved.val.userId !== user.id) {
            return RA.err(UnauthorizedError.create());
          }
          return RA.ok(resolved.val);
        },
      ),
      RA.andBind('quote', async ({ post }) => {
        const quotes = await postQuotesResolver?.resolve([post.postId]);
        return RA.ok(quotes?.ok ? quotes.val.get(post.postId) : undefined);
      }),
      RA.andBind('postEvent', ({ post, content, sourceText, summary, sensitive, quote }) =>
        RA.ok(
          Post.updatePost(now)(post, {
            content: quote === undefined ? content : appendQuoteInline(content, quote.uri),
            sourceText,
            summary,
            sensitive,
          }),
        )),
      RA.andThrough(({ postEvent }) => postUpdatedStore.store(postEvent)),
      RA.bind('updated', ({ postEvent }) => postEvent.aggregateState),
      RA.andBind('images', ({ post }) => postImagesResolver.resolve(post.postId)),
      RA.andBind('note', ({ user, ctx, updated, images, quote }) =>
        RA.ok(buildLocalNote({
          ctx,
          identifier: user.username,
          post: updated,
          images,
          origin,
          quote: toQuoteNoteFields(quote),
        }))),
      RA.andBind('activity', ({ note, updated }) =>
        RA.ok(
          new Update({
            id: new URL(`#updates/${updated.editedAt}`, note.id ?? undefined),
            object: note,
            actors: note.attributionIds,
            tos: note.toIds,
            ccs: note.ccIds,
          }),
        )),
      RA.andThrough(async ({ user, ctx, activity, mentions, quote }) => {
        await ctx.sendActivity({ identifier: user.username }, 'followers', activity);
        await sendToMentions({
          ctx,
          identifier: user.username,
          activity,
          mentions: [...(mentions ?? []), ...toQuoteNoteFields(quote).recipients],
        });
        return RA.ok(undefined);
      }),
      RA.andThrough(async ({ user, ctx, activity, updated }) => {
        if (updated.visibility !== 'public') {
          return RA.ok(undefined);
        }
        const relaysResult = await acceptedRelaysResolver.resolve();
        if (!relaysResult.ok) {
          return RA.ok(undefined);
        }
        for (const relay of relaysResult.val) {
          try {
            await ctx.sendActivity(
              { identifier: user.username },
              {
                id: new URL(relay.actorUri),
                inboxId: new URL(relay.inboxUrl),
              },
              activity,
            );
            getLogger().info(`Sent post update to relay: ${relay.actorUri}`);
          } catch (err) {
            getLogger().warn(`Failed to send post update to relay ${relay.actorUri}: ${err}`);
          }
        }
        return RA.ok(undefined);
      }),
      RA.map(({ updated, user }) => ({ post: updated, user })),
    );

  return { run };
};

export const createUpdatePostUseCase = (deps: Deps): UpdatePostUseCase => create(deps);

export const UpdatePostUseCase = {
  create,
} as const;
