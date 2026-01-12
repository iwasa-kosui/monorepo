import { Hono } from "hono";
import sanitizeHtml from "sanitize-html";
import { deleteCookie, getCookie } from "hono/cookie";
import { federation } from "@fedify/hono";
import { Federation } from "./federation.ts";
import { Layout } from "./layout.tsx";
import { ResultAsync as RA } from "@iwasa-kosui/result";
import { PgActorResolverByUserId } from "./adaptor/pg/actor/actorResolverByUserId.ts";
import { GetTimelineUseCase } from "./useCase/getTimeline.ts";
import { PgSessionResolver } from "./adaptor/pg/session/sessionResolver.ts";
import { PgUserResolver } from "./adaptor/pg/user/userResolver.ts";
import { SessionId } from "./domain/session/sessionId.ts";
import { PgPostsResolverByActorId } from "./adaptor/pg/post/postsResolverByActorId.ts";
import { UsersRouter } from "./adaptor/routes/usersRouter.tsx";
import { SignUpRouter } from "./adaptor/routes/signUpRouter.tsx";
import { SignInRouter } from "./adaptor/routes/signInRouter.tsx";
import { PostsRouter } from "./adaptor/routes/postsRouter.tsx";
import { FollowRouter } from "./adaptor/routes/followRouter.tsx";
import { PgPostsResolverByActorIds } from "./adaptor/pg/post/postsResolverByActorIds.ts";
import { PgActorResolverByFollowerId } from "./adaptor/pg/actor/followsResolverByFollowerId.ts";
import { PostView } from "./ui/components/PostView.tsx";

const app = new Hono();
const fed = Federation.getInstance();
const sanitize = (html: string) =>
  sanitizeHtml(html, {
    allowedTags: [
      "p",
      "span",
      "br",
      "a",
      "del",
      "pre",
      "code",
      "em",
      "strong",
      "b",
      "i",
      "u",
      "ul",
      "ol",
      "li",
      "blockquote",
    ],
  });

app.use(federation(fed, () => undefined));
app.get("/authorize_interaction", (c) => {
  const url = new URL(String(c.req.url));
  url.pathname = "/follow";
  return c.redirect(url);
});
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
        return c.html(
          <Layout>
            <section>
              <h1>Hi, {String(user.username)}</h1>
              <form method="post" action="/posts">
                <textarea
                  name="content"
                  rows={4}
                  cols={50}
                  placeholder="What's on your mind?"
                  required
                ></textarea>
                <button type="submit">Create</button>
              </form>
            </section>
            <section>
              {posts.map((post) => (
                <PostView post={post} />
              ))}
            </section>
          </Layout>
        );
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
app.get("/health", (c) => c.text("OK"));
app.route("/users", UsersRouter);
app.route("/posts", PostsRouter);
app.route("/sign-up", SignUpRouter);
app.route("/sign-in", SignInRouter);
app.route("/follow", FollowRouter);
export default app;
