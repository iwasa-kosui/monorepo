import { Create, Document, type DocumentLoader, Image, type InboxContext, Note } from '@fedify/fedify';
import { RA } from '@iwasa-kosui/result';
import { getLogger } from '@logtape/logtape';

import { AddRemotePostUseCase } from '../../../useCase/addRemotePost.ts';
import { FetchReplyNotesRecursiveUseCase } from '../../../useCase/fetchReplyNotesRecursive.ts';
import { createOgpFetcher } from '../../ogp/ogpFetcher.ts';
import { PgActorResolverByUri } from '../../pg/actor/actorResolverByUri.ts';
import { PgLogoUriUpdatedStore } from '../../pg/actor/logoUriUpdatedStore.ts';
import { PgRemoteActorCreatedStore } from '../../pg/actor/remoteActorCreatedStore.ts';
import { PgPostImageCreatedStore } from '../../pg/image/postImageCreatedStore.ts';
import { PgLinkPreviewCreatedStore } from '../../pg/linkPreview/linkPreviewCreatedStore.ts';
import { PgReplyNotificationCreatedStore } from '../../pg/notification/replyNotificationCreatedStore.ts';
import { PgLocalPostResolverByUri } from '../../pg/post/localPostResolverByUri.ts';
import { PgPostCreatedStore } from '../../pg/post/postCreatedStore.ts';
import { PgPostResolverByUri } from '../../pg/post/postResolverByUri.ts';
import { PgRemotePostUpserter } from '../../pg/post/remotePostUpserter.ts';
import { PgPushSubscriptionsResolverByUserId } from '../../pg/pushSubscription/pushSubscriptionsResolverByUserId.ts';
import { PgTimelineItemCreatedStore } from '../../pg/timeline/timelineItemCreatedStore.ts';
import { WebPushSender } from '../../webPush/webPushSender.ts';
import { InboxActorResolver } from '../inboxActorResolver.ts';

type Attachment = Readonly<{
  url: string;
  altText: string | null;
}>;

const extractAttachments = async (
  note: Note,
  documentLoader: DocumentLoader,
): Promise<Attachment[]> => {
  const attachments: Attachment[] = [];
  for await (const attachment of note.getAttachments({ documentLoader })) {
    if (attachment instanceof Document || attachment instanceof Image) {
      const url = attachment.url;
      if (url instanceof URL) {
        attachments.push({
          url: url.href,
          altText: attachment.name?.toString() ?? null,
        });
      }
    }
  }
  return attachments;
};

export const onCreate = async (ctx: InboxContext<unknown>, activity: Create) => {
  const actorResult = await InboxActorResolver.getInstance().resolve(ctx, activity);
  if (!actorResult.ok) {
    getLogger().warn(`Failed to resolve actor: ${actorResult.err.message}`);
    return;
  }
  const { actorIdentity, documentLoaderOptions } = actorResult.val;
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

  const useCase = AddRemotePostUseCase.create({
    postCreatedStore: PgPostCreatedStore.getInstance(),
    postImageCreatedStore: PgPostImageCreatedStore.getInstance(),
    remoteActorCreatedStore: PgRemoteActorCreatedStore.getInstance(),
    logoUriUpdatedStore: PgLogoUriUpdatedStore.getInstance(),
    actorResolverByUri: PgActorResolverByUri.getInstance(),
    timelineItemCreatedStore: PgTimelineItemCreatedStore.getInstance(),
    localPostResolverByUri: PgLocalPostResolverByUri.getInstance(),
    replyNotificationCreatedStore: PgReplyNotificationCreatedStore.getInstance(),
    pushSubscriptionsResolver: PgPushSubscriptionsResolverByUserId.getInstance(),
    webPushSender: WebPushSender.getInstance(),
    linkPreviewCreatedStore: PgLinkPreviewCreatedStore.getInstance(),
    ogpFetcher: createOgpFetcher(),
  });

  const attachments = await extractAttachments(object, documentLoader);
  const inReplyToUri = object.replyTargetId?.href ?? null;

  return RA.flow(
    useCase.run({
      content: String(object.content),
      uri: objectUri,
      actorIdentity,
      attachments,
      inReplyToUri,
    }),
    RA.match({
      ok: ({ actor: createdActor }) => {
        getLogger().info(
          `Processed Create activity: ${objectUri} by ${createdActor.uri}`,
        );

        // Fetch reply notes recursively in the background
        if (inReplyToUri) {
          const fetchReplyNotesUseCase = FetchReplyNotesRecursiveUseCase.create({
            postResolverByUri: PgPostResolverByUri.getInstance(),
            localPostResolverByUri: PgLocalPostResolverByUri.getInstance(),
            remotePostUpserter: PgRemotePostUpserter.getInstance(),
          });

          void fetchReplyNotesUseCase.run({
            inReplyToUri,
            documentLoader,
            lookupObject: (uri, options) => ctx.lookupObject(uri, options),
          }).then((result) => {
            if (result.ok && result.val.fetchedPosts.length > 0) {
              getLogger().info(
                `Fetched ${result.val.fetchedPosts.length} reply notes for: ${objectUri}`,
              );
            }
          });
        }
      },
      err: (err) => {
        getLogger().warn(
          `Failed to process Create activity: ${objectUri} - ${err}`,
        );
      },
    }),
  );
};
