import { Create, Note, PUBLIC_COLLECTION, type RequestContext } from "@fedify/fedify";
import { RA } from "@iwasa-kosui/result";
import { Temporal } from "@js-temporal/polyfill";
import { getLogger } from "@logtape/logtape";

import { Username } from "../../domain/user/username.ts";
import { GetUserProfileUseCase } from "../../useCase/getUserProfile.ts";

const getInstance = () => {
  const useCase = GetUserProfileUseCase.getInstance();

  const dispatch = (ctx: RequestContext<unknown>, identifier: string) => RA.flow(
    RA.ok(Username.orThrow(identifier)),
    RA.andThen(async (username) => useCase.run({ username })),
    RA.match({
      ok: ({ posts }) => {
        getLogger().info(
          `Resolved posts for federation: ${identifier} - ${posts.length} posts`
        );
        const notes = posts.map(
          (post) =>
            new Note({
              id: ctx.getObjectUri(Note, {
                identifier,
                id: post.postId,
              }),
              attribution: ctx.getActorUri(identifier),
              to: PUBLIC_COLLECTION,
              cc: ctx.getFollowersUri(identifier),
              content: post.content,
              mediaType: "text/html",
              published: Temporal.Instant.fromEpochMilliseconds(
                post.createdAt
              ),
              url: ctx.getObjectUri(Note, {
                identifier,
                id: post.postId,
              }),
            })
        );

        return {
          items: notes.map(
            (note) =>
              new Create({
                id: new URL("#activity", note?.id ?? undefined),
                object: note,
                actors: note.attributionIds,
                tos: note.toIds,
                ccs: note.ccIds,
              })
          ),
        };
      },
      err: (err) => {
        getLogger().warn(
          `Failed to resolve posts for federation: ${identifier} - ${err}`
        );
        return {
          items: [],
        };
      },
    })
  );

  return {
    dispatch,
  };
}

export const OutboxDispatcher = {
  getInstance,
} as const;
