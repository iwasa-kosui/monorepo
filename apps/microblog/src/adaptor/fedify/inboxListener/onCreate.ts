import { Create, Document, Image, type InboxContext, Note } from '@fedify/fedify';
import { RA } from '@iwasa-kosui/result';
import { getLogger } from '@logtape/logtape';

import { AddRemotePostUseCase } from '../../../useCase/addRemotePost.ts';
import { PgActorResolverByUri } from '../../pg/actor/actorResolverByUri.ts';
import { PgLogoUriUpdatedStore } from '../../pg/actor/logoUriUpdatedStore.ts';
import { PgRemoteActorCreatedStore } from '../../pg/actor/remoteActorCreatedStore.ts';
import { PgPostImageCreatedStore } from '../../pg/image/postImageCreatedStore.ts';
import { PgPostCreatedStore } from '../../pg/post/postCreatedStore.ts';
import { PgTimelineItemCreatedStore } from '../../pg/timeline/timelineItemCreatedStore.ts';
import { ActorIdentity } from '../actorIdentity.ts';

type Attachment = Readonly<{
  url: string;
  altText: string | null;
}>;

const extractAttachments = async (note: Note): Promise<Attachment[]> => {
  const attachments: Attachment[] = [];
  for await (const attachment of note.getAttachments()) {
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
  const object = await activity.getObject();
  if (!(object instanceof Note)) {
    return;
  }
  const actor = await activity.getActor();
  if (!actor) {
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

  return RA.flow(
    RA.ok(actor),
    RA.andBind('actorIdentity', ActorIdentity.fromFedifyActor),
    RA.andBind('attachments', async () => RA.ok(await extractAttachments(object))),
    RA.andThen(({ actorIdentity, attachments }) =>
      useCase.run({
        content: String(object.content),
        uri: objectUri,
        actorIdentity,
        attachments,
      })
    ),
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
