import { Layout } from "../../layout.tsx";
import { GetUserPage } from "../../ui/pages/getUser.tsx";
import { sValidator } from "@hono/standard-validator";
import { Hono } from "hono";
import z from "zod/v4";
import { Username } from "../../domain/user/username.ts";
import { getLogger } from "@logtape/logtape";
import { GetUserProfileUseCase } from "../../useCase/getUserProfile.ts";
import { RA } from "@iwasa-kosui/result";
import { PostId } from "../../domain/post/postId.ts";
import { GetPostUseCase } from "../../useCase/getPost.ts";
import { PgPostResolver } from "../pg/post/postResolver.ts";
import { sanitize } from "./helper/sanitize.ts";
import { getCookie } from "hono/cookie";
import { SessionId } from "../../domain/session/sessionId.ts";
import { PgSessionResolver } from "../pg/session/sessionResolver.ts";
import { PgUserResolver } from "../pg/user/userResolver.ts";
import {
  resolveLocalActorWith,
  resolveSessionWith,
  resolveUserWith,
} from "../../useCase/helper/resolve.ts";
import { Instant } from "../../domain/instant/instant.ts";
import { PgActorResolverByUserId } from "../pg/actor/actorResolverByUserId.ts";
import { Actor } from "../../domain/actor/actor.ts";
import { PgLogoUriUpdatedStore } from "../pg/actor/logoUriUpdatedStore.ts";

const app = new Hono();

app.get(
  "/:username",
  sValidator(
    "param",
    z.object({
      username: Username.zodType,
    })
  ),
  async (c) => {
    const { username } = c.req.valid("param");
    const logger = getLogger("microblog:get-user");
    logger.info("Get user attempt", { username });

    const useCase = GetUserProfileUseCase.getInstance();

    return RA.flow(
      RA.ok(username),
      RA.andThen((username) => useCase.run({ username })),
      RA.match({
        ok: ({ user, actor, followers, following, posts }) => {
          const url = new URL(c.req.url);
          const handle = `@${user.username}@${url.host}`;
          return c.html(
            <GetUserPage
              user={user}
              actor={actor}
              handle={handle}
              followers={followers}
              following={following}
              posts={posts.map((post) => ({
                ...post,
                content: sanitize(post.content),
              }))}
            />
          );
        },
        err: (err) => {
          logger.error("Get user failed", { error: String(err) });
          return c.html(
            <Layout>
              <section>
                <h1>User Profile </h1>
                <p> Error retrieving user: {err.message} </p>
              </section>
            </Layout>,
            404
          );
        },
      })
    );
  }
);

app.post(
  "/:username",
  sValidator(
    "form",
    z.object({
      logoUri: z.string().optional(),
    })
  ),
  async (c) => {
    const form = await c.req.valid("form");
    const logoUri = form.logoUri ? form.logoUri.trim() : "";
    if (!logoUri) {
      return c.text("logoUri is required", 400);
    }

    const now = Instant.now();
    const maybeSessionId = getCookie(c, "sessionId");
    const resolveSession = resolveSessionWith(
      PgSessionResolver.getInstance(),
      now
    );
    const resolveUser = resolveUserWith(PgUserResolver.getInstance());
    return RA.flow(
      RA.ok(maybeSessionId),
      RA.andThen(SessionId.parse),
      RA.andBind("session", resolveSession),
      RA.andBind("user", ({ session }) => resolveUser(session.userId)),
      RA.andBind("actor", ({ user }) =>
        resolveLocalActorWith(PgActorResolverByUserId.getInstance())(user.id)
      ),
      RA.andThen(({ actor }) => {
        if (actor.logoUri !== logoUri) {
          return RA.flow(
            RA.ok(Actor.updateLogoUri(now)(actor, logoUri)),
            RA.andThen(PgLogoUriUpdatedStore.getInstance().store)
          );
        }
        return RA.ok(undefined);
      }),
      RA.match({
        ok: () => {
          return c.redirect(`/users/${c.req.param("username")}`);
        },
        err: (err) => {
          getLogger().error("Failed to update logoUri", {
            error: String(err),
          });
          return c.html(
            <Layout>
              <section>
                <h1>Error</h1>
                <p>{String(JSON.stringify(err))}</p>
              </section>
            </Layout>,
            500
          );
        },
      })
    );
  }
);

app.get(
  "/:username/posts/:postId",
  sValidator(
    "param",
    z.object({
      username: Username.zodType,
      postId: PostId.zodType,
    })
  ),
  async (c) => {
    const { username, postId } = c.req.valid("param");
    const useCase = GetPostUseCase.create({
      postResolver: PgPostResolver.getInstance(),
    });

    return RA.flow(
      useCase.run({ postId }),
      RA.match({
        ok: (post) => {
          return c.html(
            <Layout>
              <section>
                <h2>
                  <a href={`/users/${username}`} class="secondary">
                    {String(username)}
                  </a>
                </h2>
                <article>
                  <div
                    dangerouslySetInnerHTML={{
                      __html: sanitize(post.content),
                    }}
                  />
                  <footer>
                    <a
                      href={`/users/${username}/posts/${post.postId}`}
                      class="secondary"
                    >
                      {new Date(post.createdAt).toLocaleString()}
                    </a>
                  </footer>
                </article>
              </section>
            </Layout>
          );
        },
        err: (err) => {
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
  }
);

export const UsersRouter = app;
