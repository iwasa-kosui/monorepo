import { Create, Document, type DocumentLoader, Image, type InboxContext, Note } from '@fedify/fedify';
import { RA } from '@iwasa-kosui/result';
import { getLogger } from '@logtape/logtape';

import { AddRemotePostUseCase } from '../../../useCase/addRemotePost.ts';
import { PgActorResolverByUri } from '../../pg/actor/actorResolverByUri.ts';
import { PgLogoUriUpdatedStore } from '../../pg/actor/logoUriUpdatedStore.ts';
import { PgRemoteActorCreatedStore } from '../../pg/actor/remoteActorCreatedStore.ts';
import { PgPostImageCreatedStore } from '../../pg/image/postImageCreatedStore.ts';
import { PgPostCreatedStore } from '../../pg/post/postCreatedStore.ts';
import { PgTimelineItemCreatedStore } from '../../pg/timeline/timelineItemCreatedStore.ts';
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
      },
      err: (err) => {
        getLogger().warn(
          `Failed to process Create activity: ${objectUri} - ${err}`,
        );
      },
    }),
  );
};
