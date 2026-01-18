import { Announce, isActor, Note, type RequestContext } from '@fedify/fedify';
import { RA } from '@iwasa-kosui/result';

import type { RemotePostUpserter } from '../adaptor/pg/post/remotePostUpserter.ts';
import type { ActorResolverByUserId } from '../domain/actor/actor.ts';
import { Instant } from '../domain/instant/instant.ts';
import { AlreadyRepostedError, Repost, type RepostCreatedStore, type RepostResolver } from '../domain/repost/repost.ts';
import { RepostId } from '../domain/repost/repostId.ts';
import type { SessionExpiredError, SessionResolver } from '../domain/session/session.ts';
import type { SessionId } from '../domain/session/sessionId.ts';
import { TimelineItem, type TimelineItemCreatedStore } from '../domain/timeline/timelineItem.ts';
import { TimelineItemId } from '../domain/timeline/timelineItemId.ts';
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
  | AlreadyRepostedError;

export type SendRepostUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  sessionResolver: SessionResolver;
  userResolver: UserResolver;
  actorResolverByUserId: ActorResolverByUserId;
  repostCreatedStore: RepostCreatedStore;
  repostResolver: RepostResolver;
  remotePostUpserter: RemotePostUpserter;
  timelineItemCreatedStore: TimelineItemCreatedStore;
}>;

const create = ({
  sessionResolver,
  userResolver,
  actorResolverByUserId,
  repostCreatedStore,
  repostResolver,
  remotePostUpserter,
  timelineItemCreatedStore,
}: Deps): SendRepostUseCase => {
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
      // Check if already reposted
      RA.andThrough(async ({ actor, objectUri }) => {
        return RA.flow(
          repostResolver.resolve({
            actorId: actor.id,
            objectUri,
          }),
          RA.andThen((repost) => {
            if (repost !== undefined) {
              return RA.err(
                AlreadyRepostedError.create({ actorId: actor.id, objectUri }),
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
      // Get or create the remote post for timeline display
      RA.andBind('remotePost', async ({ note, noteAuthor, objectUri }) => {
        const noteAuthorIcon = await noteAuthor.getIcon();
        return remotePostUpserter.resolve({
          uri: objectUri,
          content: String(note.content ?? ''),
          authorIdentity: {
            uri: noteAuthor.id!.href,
            inboxUrl: noteAuthor.inboxId!.href,
            url: noteAuthor.url instanceof URL ? noteAuthor.url.href : undefined,
            username: typeof noteAuthor.preferredUsername === 'string'
              ? noteAuthor.preferredUsername
              : noteAuthor.preferredUsername?.toString(),
            logoUri: noteAuthorIcon?.url instanceof URL ? noteAuthorIcon.url.href : undefined,
          },
        });
      }),
      // Create, store Repost, create TimelineItem, and send Announce
      RA.andThrough(async ({ actor, objectUri, ctx, user, remotePost, note, noteAuthor }) => {
        // Create repost
        const repostId = RepostId.generate();
        const announceActivityUri = new URL(
          `#announces/${repostId}`,
          ctx.getActorUri(user.username),
        ).href;
        const repostCreated = Repost.createRepost(
          {
            repostId,
            actorId: actor.id,
            objectUri,
            originalPostId: remotePost.postId,
            announceActivityUri,
          },
          now,
        );

        // Store repost
        await repostCreatedStore.store(repostCreated);

        // Create TimelineItem
        const timelineItemEvent = TimelineItem.createTimelineItem({
          timelineItemId: TimelineItemId.generate(),
          type: 'repost',
          actorId: actor.id,
          postId: remotePost.postId,
          repostId: repostCreated.aggregateState.repostId,
          createdAt: now,
        }, now);
        await timelineItemCreatedStore.store(timelineItemEvent);

        // Send the Announce activity
        const actorUri = ctx.getActorUri(user.username);
        const followersUri = new URL(`${actorUri.href}/followers`);

        await ctx.sendActivity(
          { username: user.username },
          noteAuthor,
          new Announce({
            id: new URL(
              `#announces/${repostCreated.aggregateState.repostId}`,
              actorUri,
            ),
            actor: actorUri,
            object: note.id,
            to: new URL('https://www.w3.org/ns/activitystreams#Public'),
            cc: followersUri,
          }),
        );
        return RA.ok(undefined);
      }),
      RA.map(() => undefined),
    );

  return { run };
};

export const SendRepostUseCase = {
  create,
} as const;
