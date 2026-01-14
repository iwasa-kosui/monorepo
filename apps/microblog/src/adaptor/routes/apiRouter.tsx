import { Hono } from "hono";
import { sValidator } from "@hono/standard-validator";
import { RA } from "@iwasa-kosui/result";
import { deleteCookie, getCookie } from "hono/cookie";
import { z } from "zod/v4";
import { SessionId } from "../../domain/session/sessionId.ts";
import { Instant } from "../../domain/instant/instant.ts";
import { GetTimelineUseCase } from "../../useCase/getTimeline.ts";
import { SendLikeUseCase } from "../../useCase/sendLike.ts";
import { PgSessionResolver } from "../pg/session/sessionResolver.ts";
import { PgUserResolver } from "../pg/user/userResolver.ts";
import { PgActorResolverByUserId } from "../pg/actor/actorResolverByUserId.ts";
import { PgPostsResolverByActorIds } from "../pg/post/postsResolverByActorIds.ts";
import { PgActorResolverByFollowerId } from "../pg/actor/followsResolverByFollowerId.ts";
import { PgActorResolverByFollowingId } from "../pg/actor/followsResolverByFollowingId.ts";
import { PgLikeCreatedStore } from "../pg/like/likeCreatedStore.ts";
import { PgLikeResolver } from "../pg/like/likeResolver.ts";
import { Federation } from "../../federation.ts";
import { sanitize } from "./helper/sanitize.ts";

const app = new Hono()
  .get(
    "/v1/home",
    sValidator(
      "query",
      z.object({
        createdAt: z.optional(z.coerce.number().pipe(Instant.zodType)),
      }),
      (res, c) => {
        if (!res.success) {
          return c.json(
            { error: res.error.flatMap((e) => e.message).join(",") },
            400
          );
        }
      }
    ),
    async (c) => {
      const useCase = GetTimelineUseCase.create({
        sessionResolver: PgSessionResolver.getInstance(),
        userResolver: PgUserResolver.getInstance(),
        actorResolverByUserId: PgActorResolverByUserId.getInstance(),
        postsResolverByActorIds: PgPostsResolverByActorIds.getInstance(),
        actorsResolverByFollowerId: PgActorResolverByFollowerId.getInstance(),
        actorsResolverByFollowingId: PgActorResolverByFollowingId.getInstance(),
      });
      const sessionId = getCookie(c, "sessionId");
      if (!sessionId) {
        return c.json({ error: "Unauthorized" }, 401);
      }
      const createdAt = c.req.valid("query").createdAt;
      return RA.flow(
        RA.ok(sessionId),
        RA.andThen((sessionId) =>
          useCase.run({ sessionId: SessionId.orThrow(sessionId), createdAt })
        ),
        RA.match({
          ok: ({ user, posts, actor, followers, following }) => {
            return c.json({
              user,
              posts: posts.map((post) => ({
                ...post,
                content: sanitize(post.content),
              })),
              actor,
              followers,
              following,
            });
          },
          err: (err) => {
            deleteCookie(c, "sessionId");
            return c.json({ error: String(JSON.stringify(err)) }, 400);
          },
        })
      );
    }
  )
  .post(
    "/v1/like",
    sValidator(
      "json",
      z.object({
        objectUri: z.string().min(1),
      })
    ),
    async (c) => {
      const body = c.req.valid("json");
      const objectUri = body.objectUri;

      const sessionIdResult = await RA.flow(
        RA.ok(getCookie(c, "sessionId")),
        RA.andThen(SessionId.parse)
      );
      if (!sessionIdResult.ok) {
        return c.json({ error: "Invalid session" }, 401);
      }

      const ctx = Federation.getInstance().createContext(c.req.raw, undefined);

      const useCase = SendLikeUseCase.create({
        sessionResolver: PgSessionResolver.getInstance(),
        userResolver: PgUserResolver.getInstance(),
        actorResolverByUserId: PgActorResolverByUserId.getInstance(),
        likeCreatedStore: PgLikeCreatedStore.getInstance(),
        likeResolver: PgLikeResolver.getInstance(),
      });

      const result = await useCase.run({
        sessionId: sessionIdResult.val,
        objectUri,
        request: c.req.raw,
        ctx,
      });

      return RA.match({
        ok: () => c.json({ success: true }),
        err: (err) =>
          c.json({ error: `Failed to like: ${JSON.stringify(err)}` }, 400),
      })(result);
    }
  );

export type APIRouterType = typeof app;
export { app as APIRouter };
