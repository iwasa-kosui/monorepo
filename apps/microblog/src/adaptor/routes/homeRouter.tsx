import { LayoutClient } from "../../layout.tsx";
import { Hono } from "hono";
import { PgActorResolverByUserId } from "../pg/actor/actorResolverByUserId.ts";
import { RA } from "@iwasa-kosui/result";
import { deleteCookie, getCookie } from "hono/cookie";
import { SessionId } from "../../domain/session/sessionId.ts";
import { PgSessionResolver } from "../pg/session/sessionResolver.ts";
import { PgUserResolver } from "../pg/user/userResolver.ts";
import { GetTimelineUseCase } from "../../useCase/getTimeline.ts";
import { PgPostsResolverByActorIds } from "../pg/post/postsResolverByActorIds.ts";
import { PgActorResolverByFollowerId } from "../pg/actor/followsResolverByFollowerId.ts";
import { PgActorResolverByFollowingId } from "../pg/actor/followsResolverByFollowingId.ts";
import { sValidator } from "@hono/standard-validator";
import { z } from "zod/v4";
import { Instant } from "../../domain/instant/instant.ts";
import { sanitize } from "./helper/sanitize.ts";

const app = new Hono();

export const getHomeApiRouter = app.get(
  "/api/v1/home",
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
);

app.get("/", (c) => {
  const sessionId = getCookie(c, "sessionId");
  if (!sessionId) {
    return c.redirect("/users/kosui");
  }
  return c.html(
    <LayoutClient client="/static/home.js" server="/src/ui/pages/home.tsx">
      <div id="root" />
    </LayoutClient>
  );
});

export { app as HomeRouter };
