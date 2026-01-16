import {
  Create,
  Document,
  Image,
  type InboxContext,
  Note,
} from "@fedify/fedify";
import { RA } from "@iwasa-kosui/result";
import { getLogger } from "@logtape/logtape";

import type { PostImage } from "../../../domain/image/image.ts";
import { ImageId } from "../../../domain/image/imageId.ts";
import { Instant } from "../../../domain/instant/instant.ts";
import { Post } from "../../../domain/post/post.ts";
import { upsertRemoteActor } from "../../../useCase/helper/upsertRemoteActor.ts";
import { PgLogoUriUpdatedStore } from "../../pg/actor/logoUriUpdatedStore.ts";
import { PgRemoteActorCreatedStore } from "../../pg/actor/remoteActorCreatedStore.ts";
import { PgPostImageCreatedStore } from "../../pg/image/postImageCreatedStore.ts";
import { PgPostCreatedStore } from "../../pg/post/postCreatedStore.ts";
import { ActorIdentity } from "../actorIdentity.ts";

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
  const objectIdentity = {
    uri: object.id.href,
  } as const;

  return RA.flow(
    RA.ok(actor),
    RA.andBind('actorIdentity', ActorIdentity.fromFedifyActor),
    RA.andBind('actor', ({ actorIdentity }) => upsertRemoteActor({
      now: Instant.now(),
      remoteActorCreatedStore: PgRemoteActorCreatedStore.getInstance(),
      logoUriUpdatedStore: PgLogoUriUpdatedStore.getInstance(),
    })(actorIdentity)),
    RA.andBind('createdPost', ({ actor }) => {
      const createPost = Post.createRemotePost(Instant.now())({
        content: String(object.content),
        uri: objectIdentity.uri,
        actorId: actor.id,
      });
      return PgPostCreatedStore.getInstance().store(createPost).then(() => RA.ok(createPost));
    }),
    RA.andThrough(async ({ createdPost }) => {
      const now = Instant.now();
      const images: PostImage[] = [];
      for await (const attachment of object.getAttachments()) {
        if (attachment instanceof Document || attachment instanceof Image) {
          const url = attachment.url;
          if (url instanceof URL) {
            images.push({
              imageId: ImageId.generate(),
              postId: createdPost.aggregateState.postId,
              url: url.href,
              altText: attachment.name?.toString() ?? null,
              createdAt: now,
            });
          }
        }
      }
      if (images.length > 0) {
        await PgPostImageCreatedStore.getInstance().store(images);
      }
      return RA.ok(undefined);
    }),
    RA.match({
      ok: ({ actorIdentity }) => {
        getLogger().info(
          `Processed Create activity: ${objectIdentity.uri} by ${actorIdentity.uri}`
        );
      },
      err: (err) => {
        getLogger().warn(
          `Failed to process Create activity: ${objectIdentity.uri} - ${err}`
        );
      },
    })
  );
};
