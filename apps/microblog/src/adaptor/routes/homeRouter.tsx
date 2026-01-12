import { Layout } from "../../layout.tsx";
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
import { HomePage } from "../../ui/pages/home.tsx";

const app = new Hono();
app.get("/", async (c) => {
  const useCase = GetTimelineUseCase.create({
    sessionResolver: PgSessionResolver.getInstance(),
    userResolver: PgUserResolver.getInstance(),
    actorResolverByUserId: PgActorResolverByUserId.getInstance(),
    postsResolverByActorIds: PgPostsResolverByActorIds.getInstance(),
    actorsResolverByFollowerId: PgActorResolverByFollowerId.getInstance(),
  });
  const sessionId = getCookie(c, "sessionId");
  if (!sessionId) {
    return c.redirect("/users/kosui");
  }
  return RA.flow(
    RA.ok(sessionId),
    RA.andThen((sessionId) =>
      useCase.run({ sessionId: SessionId.orThrow(sessionId) })
    ),
    RA.match({
      ok: ({ user, posts }) => {
        return c.html(<HomePage user={user} posts={posts} />);
      },
      err: (err) => {
        deleteCookie(c, "sessionId");
        return c.html(
          <Layout>
            <section>
              <h1>Error</h1>
              <p>{String(JSON.stringify(err))}</p>
            </section>
          </Layout>
        );
      },
    })
  );
});

export { app as HomeRouter };
