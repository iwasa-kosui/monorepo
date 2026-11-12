import { type RequestContext } from '@fedify/fedify';
import { isActor, Update } from '@fedify/vocab';
import { RA, type Result } from '@iwasa-kosui/result';
import { getLogger } from '@logtape/logtape';
import z from 'zod/v4';

import type { ActorResolverById } from '../adaptor/d1/actor/actorResolverById.ts';
import type { ActorResolverByUri } from '../domain/actor/actor.ts';
import type { PostImagesResolverByPostId } from '../domain/image/image.ts';
import { Instant } from '../domain/instant/instant.ts';
import type { DirectPostParticipantsResolverByPostId } from '../domain/post/directPostParticipants.ts';
import { mentionLinksOfHtml, type MentionRecipient } from '../domain/post/mention.ts';
import {
  type LocalPost,
  Post,
  PostNotFoundError,
  type PostQuotesResolverByPostIds,
  type PostResolver,
  type PostResolverByUri,
  type PostUpdatedStore,
  type PostVersionsResolverByPostId,
} from '../domain/post/post.ts';
import type { PostId } from '../domain/post/postId.ts';
import { appendQuoteInline } from '../domain/post/quoteInline.ts';
import { sanitizePostContent } from '../domain/post/sanitizePostContent.ts';
import type { AcceptedRelaysResolver } from '../domain/relay/relay.ts';
import type { SessionExpiredError, SessionResolver } from '../domain/session/session.ts';
import { User, type UserNotFoundError, type UserResolver } from '../domain/user/user.ts';
import { Schema } from '../helper/schema.ts';
import { buildLocalNote } from './helper/localNote.ts';
import { type MentionedActor, toMentionNoteFields } from './helper/mentionNote.ts';
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

type DirectAddresseeAddedError = Readonly<{
  type: 'DirectAddresseeAddedError';
  message: string;
}>;

const DirectAddresseeAddedError = {
  create: (): DirectAddresseeAddedError => ({
    type: 'DirectAddresseeAddedError',
    message: 'A direct post cannot add new recipients when edited.',
  }),
} as const;

type Err =
  | SessionExpiredError
  | UserNotFoundError
  | PostNotFoundError
  | UnauthorizedError
  | DirectAddresseeAddedError;

export type UpdatePostUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  sessionResolver: SessionResolver;
  userResolver: UserResolver;
  postResolver: PostResolver;
  postResolverByUri: PostResolverByUri;
  actorResolverById: ActorResolverById;
  actorResolverByUri: ActorResolverByUri;
  postUpdatedStore: PostUpdatedStore;
  postVersionsResolver: PostVersionsResolverByPostId;
  postImagesResolver: PostImagesResolverByPostId;
  postQuotesResolver?: PostQuotesResolverByPostIds;
  acceptedRelaysResolver: AcceptedRelaysResolver;
  directPostParticipantsResolverByPostId?: DirectPostParticipantsResolverByPostId;
  origin: string;
}>;

type Addressee = Readonly<{ recipient: MentionRecipient; mentioned: MentionedActor }>;

const create = ({
  sessionResolver,
  userResolver,
  postResolver,
  postResolverByUri,
  actorResolverById,
  actorResolverByUri,
  postUpdatedStore,
  postVersionsResolver,
  postImagesResolver,
  postQuotesResolver,
  acceptedRelaysResolver,
  directPostParticipantsResolverByPostId,
  origin,
}: Deps): UpdatePostUseCase => {
  const now = Instant.now();
  const resolveRequesterUser = resolveRequesterUserWith(sessionResolver, userResolver, now);

  const lookupActor = async (
    ctx: RequestContext<unknown>,
    identifier: string,
    uri: string,
  ): Promise<MentionRecipient | undefined> => {
    try {
      const documentLoader = await ctx.getDocumentLoader({ identifier });
      const found = await ctx.lookupObject(uri, { documentLoader });
      if (!isActor(found) || found.id === null || found.inboxId === null) {
        return undefined;
      }
      return {
        id: found.id.href,
        inboxUrl: found.inboxId.href,
        ...(found.endpoints?.sharedInbox == null ? {} : { sharedInboxUrl: found.endpoints.sharedInbox.href }),
      };
    } catch (err) {
      getLogger().warn(`Failed to look up the previous addressee ${uri}: ${err}`);
      return undefined;
    }
  };

  const resolvePreviousAddressees = async (
    post: LocalPost,
    ctx: RequestContext<unknown>,
    identifier: string,
  ): Promise<ReadonlyArray<Addressee>> => {
    const addressees: Addressee[] = [];
    const previousContents = async (): Promise<ReadonlyArray<string>> => {
      try {
        const versions = await postVersionsResolver.resolve(post.postId);
        if (!versions.ok) {
          throw versions.err;
        }
        return versions.val.map(({ content }) => content);
      } catch (err) {
        getLogger().warn(`Failed to resolve the versions of post ${post.postId}: ${err}`);
      }
      return [];
    };
    const contents = [post.content, ...await previousContents()];
    const links = new Map<string, string>();
    for (const content of contents) {
      for (const { href, name } of mentionLinksOfHtml(content)) {
        if (!links.has(href)) {
          links.set(href, name);
        }
      }
    }
    for (const [href, name] of links) {
      const known = await actorResolverByUri.resolve(href);
      const recipient = known.ok && known.val !== undefined
        ? { id: known.val.uri, inboxUrl: known.val.inboxUrl }
        : await lookupActor(ctx, identifier, href);
      if (recipient !== undefined) {
        addressees.push({ recipient, mentioned: { id: new URL(href), name } });
      }
    }
    if (post.inReplyToUri !== null) {
      const parent = await postResolverByUri.resolve({ uri: post.inReplyToUri });
      const author = parent.ok && parent.val !== undefined
        ? await actorResolverById.resolve(parent.val.actorId)
        : undefined;
      if (author?.ok && author.val !== undefined && author.val.type === 'remote') {
        const id = new URL(author.val.uri);
        addressees.push({
          recipient: { id: author.val.uri, inboxUrl: author.val.inboxUrl },
          mentioned: {
            id,
            ...(author.val.username === undefined ? {} : { name: `@${author.val.username}@${id.host}` }),
          },
        });
      }
    }
    return addressees;
  };

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
      RA.andBind('previous', async ({ post, ctx, user }) =>
        RA.ok(await resolvePreviousAddressees(post, ctx, user.username))),
      RA.andThrough(
        async ({ post, user, ctx, content, previous }): Promise<Result<void, DirectAddresseeAddedError>> => {
          if (post.visibility !== 'direct') {
            return RA.ok(undefined);
          }
          const ownUri = ctx.getActorUri(user.username).href;
          const participants = await directPostParticipantsResolverByPostId?.resolve(post.postId);
          const recorded = participants?.ok
            ? participants.val.filter((uri) =>
              uri !== ownUri
            )
            : [];
          const addressees = new Set(
            recorded.length > 0 ? recorded : previous.map(({ mentioned }) => mentioned.id.href),
          );
          const added = toMentionNoteFields(sanitizePostContent(content)).ccs
            .some((uri) => uri.href !== ownUri && !addressees.has(uri.href));
          return added ? RA.err(DirectAddresseeAddedError.create()) : RA.ok(undefined);
        },
      ),
      RA.andBind('quoteFields', ({ post, quote }) => {
        const fields = toQuoteNoteFields(quote);
        return RA.ok(post.visibility === 'direct' ? { ...fields, actors: [], recipients: [] } : fields);
      }),
      RA.andBind('postEvent', ({ post, user, ctx, content, sourceText, summary, sensitive, quote, previous }) =>
        RA.ok(
          Post.updatePost(now)(post, {
            content: quote === undefined ? content : appendQuoteInline(content, quote.uri),
            sourceText,
            summary,
            sensitive,
            participantActorUris: [
              ctx.getActorUri(user.username).href,
              ...previous.map(({ recipient }) => recipient.id),
              ...toMentionNoteFields(sanitizePostContent(content)).ccs.map((uri) => uri.href),
            ],
          }),
        )),
      RA.andThrough(({ postEvent }) => postUpdatedStore.store(postEvent)),
      RA.bind('updated', ({ postEvent }) => postEvent.aggregateState),
      RA.andBind('images', ({ post }) => postImagesResolver.resolve(post.postId)),
      RA.andBind('note', ({ user, ctx, updated, images, quoteFields, previous }) => {
        return RA.ok(buildLocalNote({
          ctx,
          identifier: user.username,
          post: updated,
          images,
          origin,
          quote: { ...quoteFields, actors: [...quoteFields.actors, ...previous.map(({ mentioned }) => mentioned)] },
        }));
      }),
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
      RA.andThrough(async ({ user, ctx, activity, mentions, quoteFields, previous, updated }) => {
        if (updated.visibility !== 'direct') {
          await ctx.sendActivity({ identifier: user.username }, 'followers', activity);
        }
        await sendToMentions({
          ctx,
          identifier: user.username,
          activity,
          mentions: [
            ...(mentions ?? []),
            ...previous.map(({ recipient }) => recipient),
            ...quoteFields.recipients,
          ],
          visibility: updated.visibility,
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
