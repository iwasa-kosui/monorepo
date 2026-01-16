import { Document, Link, Note, PUBLIC_COLLECTION, type RequestContext } from "@fedify/fedify";
import { GetPostUseCase } from "../../useCase/getPost.ts";
import { PgPostResolver } from "../pg/post/postResolver.ts";
import { RA } from "@iwasa-kosui/result";
import { PostId } from "../../domain/post/postId.ts";
import { Temporal } from "@js-temporal/polyfill";
import { getLogger } from "@logtape/logtape";
import { PgPostImagesResolverByPostId } from "../pg/image/postImagesResolver.ts";
import { Env } from "../../env.ts";

const ofNote = (ctx: RequestContext<unknown>, values: Record<'id' | 'identifier', string>) => {
  const useCase = GetPostUseCase.create({
    postResolver: PgPostResolver.getInstance(),
    postImagesResolver: PgPostImagesResolverByPostId.getInstance(),
  });
  return RA.flow(
    RA.ok({
      postId: PostId.orThrow(values.id),
    }),
    RA.andThen(async (input) => useCase.run(input)),
    RA.match({
      ok: ({ post, postImages }) => {
        return new Note({
          id: ctx.getObjectUri(Note, values),
          attribution: ctx.getActorUri(values.identifier),
          to: PUBLIC_COLLECTION,
          cc: ctx.getFollowersUri(values.identifier),
          content: post.content,
          mediaType: "text/html",
          published: Temporal.Instant.fromEpochMilliseconds(post.createdAt),
          url: ctx.getObjectUri(Note, values),
          attachments:
            postImages.map((image) =>
              new Document({
                url: new URL(`${Env.getInstance().ORIGIN}${image.url}`),
                mediaType: image.url.endsWith(".png")
                  ? "image/png"
                  : image.url.endsWith(".jpg") || image.url.endsWith(".jpeg")
                    ? "image/jpeg"
                    : image.url.endsWith(".gif")
                      ? "image/gif"
                      : "application/octet-stream",
              }))
        });
      },
      err: (err) => {
        getLogger().warn(
          `Failed to resolve post for federation: ${values.identifier} - ${values.id} - ${err}`
        );
        return null;
      },
    })
  );
}

export const ObjectDispatcher = {
  ofNote,
} as const;
