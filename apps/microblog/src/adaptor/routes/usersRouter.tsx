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
        ok: ({ user, followers, following, posts }) => {
          const url = new URL(c.req.url);
          const handle = `@${user.username}@${url.host}`;
          return c.html(
            <GetUserPage
              user={user}
              handle={handle}
              followers={followers}
              following={following}
              posts={posts}
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
