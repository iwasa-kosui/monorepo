import { type InboxContext } from '@fedify/fedify';
import { Create, Note } from '@fedify/vocab';
import type { DocumentLoader } from '@fedify/vocab-runtime';
import { RA } from '@iwasa-kosui/result';
import { getLogger } from '@logtape/logtape';

import type {
  FederatedTimelineItemCreatedStore,
  FederatedTimelineItemResolverByPostId,
} from '../../../domain/federatedTimeline/federatedTimelineItem.ts';
import type { FollowedByLocalActorResolverByActorUri } from '../../../domain/follow/follow.ts';
import type { RemotePostUpserter } from '../../../domain/post/post.ts';
import { Visibility } from '../../../domain/post/visibility.ts';
import type { AcceptedRelaysResolver } from '../../../domain/relay/relay.ts';
import type { AddRemotePostUseCase } from '../../../useCase/addRemotePost.ts';
import type { FetchReplyNotesRecursiveUseCase } from '../../../useCase/fetchReplyNotesRecursive.ts';
import { extractRecipientActorUris } from '../extractRecipients.ts';
import { extractVisibility } from '../extractVisibility.ts';
import type { InboxActorResolver } from '../inboxActorResolver.ts';
import { extractAttachments } from './extractAttachments.ts';
import { saveFederatedNote } from './saveFederatedNote.ts';

const NOTE_TYPE_ID = 'https://www.w3.org/ns/activitystreams#Note';
const ARTICLE_TYPE_ID = 'https://www.w3.org/ns/activitystreams#Article';

export type OnCreateDeps = Readonly<{
  origin: string;
  followedByLocalActorResolverByActorUri: FollowedByLocalActorResolverByActorUri;
  acceptedRelaysResolver: AcceptedRelaysResolver;
  inboxActorResolver: InboxActorResolver;
  remotePostUpserter: RemotePostUpserter;
  federatedTimelineItemResolverByPostId: FederatedTimelineItemResolverByPostId;
  federatedTimelineItemCreatedStore: FederatedTimelineItemCreatedStore;
  addRemotePostUseCase: AddRemotePostUseCase;
  fetchReplyNotesRecursiveUseCase: FetchReplyNotesRecursiveUseCase;
}>;

const saveForwardedCreate = async (
  deps: OnCreateDeps,
  { note, actorId, visibility, documentLoader, inReplyToUri }: Readonly<{
    note: Note;
    actorId: URL;
    visibility: Visibility | null;
    documentLoader: DocumentLoader;
    inReplyToUri: string | null;
  }>,
) => {
  if (!Visibility.isVisibleToAnonymous(visibility)) {
    getLogger().info(`Skipping a forwarded Create that is neither public nor unlisted: ${note.id?.href}`);
    return;
  }
  const relaysResult = await deps.acceptedRelaysResolver.resolve();
  if (!relaysResult.ok) {
    getLogger().warn(
      `Failed to resolve accepted relays for a forwarded Create: ${String(relaysResult.err)} (${note.id?.href})`,
    );
    return;
  }
  if (relaysResult.val.length !== 1) {
    getLogger().info(
      `Not saving a forwarded Create to the federated timeline because the number of accepted relays is not one: ${relaysResult.val.length} (${note.id?.href})`,
    );
    return;
  }
  const [relay] = relaysResult.val;

  await saveFederatedNote(deps, { note, relayId: relay.relayId, documentLoader, actorId, inReplyToUri });
};

export const createOnCreate = (deps: OnCreateDeps) => async (ctx: InboxContext<unknown>, activity: Create) => {
  const actorResult = await deps.inboxActorResolver.resolve(ctx, activity);
  if (!actorResult.ok) {
    getLogger().warn(`Failed to resolve actor: ${actorResult.err.message}`);
    return;
  }
  const { actor, actorIdentity, documentLoaderOptions } = actorResult.val;
  const documentLoader = documentLoaderOptions.documentLoader;
  if (!documentLoader) {
    getLogger().warn('documentLoader is undefined');
    return;
  }

  const object = await activity.getObject({ documentLoader });
  if (!(object instanceof Note)) {
    return;
  }
  if (!object.id) {
    return;
  }
  const objectUri = object.id.href;

  const attachments = await extractAttachments(object, documentLoader);
  const inReplyToUri = object.replyTargetId?.href ?? null;
  const addressed = object.toIds.length + object.ccIds.length > 0 ? object : activity;
  const visibility = extractVisibility(addressed, actor.followersId);
  const recipientActorUris = extractRecipientActorUris([object, activity], deps.origin);

  const parsedReplyTarget = inReplyToUri && URL.canParse(inReplyToUri) ? ctx.parseUri(new URL(inReplyToUri)) : null;
  const repliesToLocalPost = parsedReplyTarget?.type === 'object'
    && (parsedReplyTarget.class?.typeId?.href === NOTE_TYPE_ID
      || parsedReplyTarget.class?.typeId?.href === ARTICLE_TYPE_ID);

  if (recipientActorUris.length === 0 && !repliesToLocalPost) {
    const actorId = activity.actorId;
    if (!actorId) {
      getLogger().warn('Create activity has no actorId');
      return;
    }
    const followedResult = await deps.followedByLocalActorResolverByActorUri.resolve({ actorUri: actorId.href });
    if (!followedResult.ok) {
      getLogger().warn(
        `Failed to determine whether a local actor follows ${actorId.href}; failing the Create to retry: ${activity.id?.href} - ${
          String(followedResult.err)
        }`,
      );
      throw new Error(`Failed to determine whether a local actor follows ${actorId.href}`);
    }
    if (!followedResult.val) {
      getLogger().info(
        `Not creating a home timeline item for a Create from an actor no local actor follows; trying to save it to the federated timeline as a relay-forwarded post: ${actorId.href} (${activity.id?.href})`,
      );
      await saveForwardedCreate(deps, { note: object, actorId, visibility, documentLoader, inReplyToUri });
      return;
    }
  }

  return RA.flow(
    deps.addRemotePostUseCase.run({
      content: String(object.content),
      uri: objectUri,
      actorIdentity,
      attachments,
      inReplyToUri,
      visibility,
      recipientActorUris,
    }),
    RA.match({
      ok: async ({ actor: createdActor }) => {
        getLogger().info(
          `Processed Create activity: ${objectUri} by ${createdActor.uri}`,
        );

        if (inReplyToUri) {
          const result = await deps.fetchReplyNotesRecursiveUseCase.run({
            inReplyToUri,
            documentLoader,
            lookupObject: (uri, options) => ctx.lookupObject(uri, options),
          });
          if (result.ok && result.val.fetchedPosts.length > 0) {
            getLogger().info(
              `Fetched ${result.val.fetchedPosts.length} reply notes for: ${objectUri}`,
            );
          }
        }
      },
      err: (err) => {
        if (err.type === 'RemotePostAuthorMismatchError') {
          getLogger().warn(
            `Ignored Create activity for a post owned by another actor: ${objectUri} existing=${err.detail.existingActorId} actor=${err.detail.actorId}`,
          );
          return;
        }
        getLogger().warn(
          `Failed to process Create activity: ${objectUri} - ${err}`,
        );
      },
    }),
  );
};
