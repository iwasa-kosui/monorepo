import { Hono } from "hono";
import {
  deleteCookie,
  getCookie,
  getSignedCookie,
  setCookie,
  setSignedCookie,
  generateCookie,
  generateSignedCookie,
} from "hono/cookie";
import { sValidator } from "@hono/standard-validator";
import { federation } from "@fedify/hono";
import { getLogger } from "@logtape/logtape";
import { Federation } from "./federation.ts";
import { Layout } from "./layout.tsx";
import { PgUserResolverByUsername } from "./adaptor/pg/user/userResolverByUsername.ts";
import z from "zod";
import { User, UsernameAlreadyTakenError } from "./domain/user/user.ts";
import { ResultAsync as RA } from "@iwasa-kosui/result";
import { Username } from "./domain/user/username.ts";
import { SignUpUseCase } from "./useCase/signUp.ts";
import { PgUserCreatedStore } from "./adaptor/pg/user/userCreatedStore.ts";
import { PgLocalActorCreatedStore } from "./adaptor/pg/actor/localActorCreatedStore.ts";
import { GetUserProfileUseCase } from "./useCase/getUserProfile.ts";
import { PgActorResolverByUserId } from "./adaptor/pg/actor/actorResolverByUserId.ts";
import { PgActorResolverByFollowingId } from "./adaptor/pg/actor/followsResolverByFollowingId.ts";
import { PgActorResolverByFollowerId } from "./adaptor/pg/actor/followsResolverByFollowerId.ts";
import { PgUserPasswordSetStore } from "./adaptor/pg/userPassword/userPasswordSetStore.ts";
import { Password } from "./domain/password/password.ts";
import { SignInUseCase } from "./useCase/signIn.ts";
import { PgUserPasswordResolver } from "./adaptor/pg/userPassword/userPasswordResolver.ts";
import { PgSessionStartedStore } from "./adaptor/pg/session/sessionStartedStore.ts";
import { GetTimelineUseCase } from "./useCase/getTimeline.ts";
import { PgSessionResolver } from "./adaptor/pg/session/sessionResolver.ts";
import { PgUserResolver } from "./adaptor/pg/user/userResolver.ts";
import { SessionId } from "./domain/session/sessionId.ts";
import { CreatePostUseCase } from "./useCase/createPost.ts";
import { PgPostCreatedStore } from "./adaptor/pg/post/postCreatedStore.ts";
import { PgPostsResolverByActorId } from "./adaptor/pg/post/postsResolverByActorId.ts";

const app = new Hono();
const fed = Federation.getInstance();
app.use(federation(fed, () => undefined));

app.get("/", async (c) => {
  const useCase = GetTimelineUseCase.create({
    sessionResolver: PgSessionResolver.getInstance(),
    userResolver: PgUserResolver.getInstance(),
    actorResolverByUserId: PgActorResolverByUserId.getInstance(),
    postsResolverByActorId: PgPostsResolverByActorId.getInstance(),
  });
  const sessionId = getCookie(c, "sessionId");
  if (!sessionId) {
    return c.html(
      <Layout>
        <section>
          <h1>Welcome to Microblog</h1>
          <p>Please sign in to see your timeline.</p>
        </section>
      </Layout>
    );
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
              <h1>{String(user.username)}</h1>
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
              <h2>Timeline</h2>
              {posts.length > 0 ? (
                <ul>
                  {posts.map((post) => (
                    <li key={post.postId}>
                      <p>{post.content}</p>
                      <small>
                        Posted at: {new Date(post.createdAt).toLocaleString()}
                      </small>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>No posts to show.</p>
              )}
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
app.post(
  "/posts",
  sValidator(
    "form",
    z.object({
      content: z.string().min(1).max(280),
    })
  ),
  async (c) => {
    const useCase = CreatePostUseCase.create({
      sessionResolver: PgSessionResolver.getInstance(),
      postCreatedStore: PgPostCreatedStore.getInstance(),
      userResolver: PgUserResolver.getInstance(),
      actorResolverByUserId: PgActorResolverByUserId.getInstance(),
    });
    const sessionId = getCookie(c, "sessionId");
    if (!sessionId) {
      return c.html(
        <Layout>
          <section>
            <h1>Error</h1>
            <p>Please sign in to create a post.</p>
          </section>
        </Layout>
      );
    }
    const form = await c.req.valid("form");
    const content = form.content;
    return RA.flow(
      useCase.run({
        sessionId: SessionId.orThrow(sessionId),
        content,
        context: fed.createContext(c.req.raw, undefined),
      }),
      RA.match({
        ok: ({ post }) => {
          return c.html(
            <Layout>
              <section>
                <h1>Post Created</h1>
                <p>Your post has been created with ID: {String(post.postId)}</p>
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
app.get("/health", (c) => c.text("OK"));
app.get(
  "/users/:username",
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

    const useCase = GetUserProfileUseCase.create({
      userResolverByUsername: PgUserResolverByUsername.getInstance(),
      actorResolverByUserId: PgActorResolverByUserId.getInstance(),
      actorsResolverByFollowingId: PgActorResolverByFollowingId.getInstance(),
      actorsResolverByFollowerId: PgActorResolverByFollowerId.getInstance(),
    });

    return RA.flow(
      RA.ok(username),
      RA.andThen((username) => useCase.run({ username })),
      RA.match({
        ok: ({ user, followers, following }) => {
          const url = new URL(c.req.url);
          const handle = `@${user.username}@${url.host}`;
          return c.html(
            <Layout>
              <section>
                <h1>{String(user.username)}</h1>
                {user ? (
                  <div>
                    <p>{handle}</p>
                  </div>
                ) : (
                  <p>User not found</p>
                )}

                <div>
                  <h2>Followers</h2>
                  {followers.length > 0 ? (
                    <ul>
                      {followers.map((follower) => (
                        <li key={follower.id}>{follower.uri}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>No followers</p>
                  )}
                </div>

                <div>
                  <h2>Following</h2>
                  {following.length > 0 ? (
                    <ul>
                      {following.map((followed) => (
                        <li key={followed.id}>{followed.uri}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>Not following anyone</p>
                  )}
                </div>
              </section>
            </Layout>
          );
        },
        err: (err) => {
          logger.error("Get user failed", { error: String(err) });
          return c.html(
            <Layout>
              <section>
                <h1>User Profile</h1>
                <p>Error retrieving user: {String(err)}</p>
              </section>
            </Layout>
          );
        },
      })
    );
  }
);
app.get("/sign-in", async (c) => {
  return c.html(
    <Layout>
      <section>
        <h1>Sign in</h1>
        <form method="post" action="/sign-in">
          <input type="text" name="username" placeholder="Username" required />
          <input
            type="password"
            name="password"
            placeholder="Password"
            required
            minlength={16}
            maxlength={255}
          />
          <button type="submit">Sign in</button>
        </form>
      </section>
    </Layout>
  );
});
app.post(
  "/sign-in",
  sValidator(
    "form",
    z.object({
      username: Username.zodType,
      password: Password.zodType,
    })
  ),
  async (c) => {
    const form = c.req.valid("form");
    const logger = getLogger("microblog:sign-in");
    logger.info("Sign in attempt", { username: form.username });

    const useCase = SignInUseCase.create({
      userResolverByUsername: PgUserResolverByUsername.getInstance(),
      userPasswordResolver: PgUserPasswordResolver.getInstance(),
      sessionStartedStore: PgSessionStartedStore.getInstance(),
    });
    const onOk = (v: { sessionId: string }) => {
      logger.info("Sign in successful", { username: form.username });
      setCookie(c, "sessionId", v.sessionId, {
        httpOnly: true,
        path: "/",
        maxAge: 7 * 24 * 60 * 60,
        sameSite: "lax",
        secure: true,
      });
      return c.html(
        <Layout>
          <section>
            <h1>Sign in</h1>
            <p>Sign in successful for username: {String(form.username)}</p>
            <p>Your session ID: {v.sessionId}</p>
          </section>
        </Layout>
      );
    };
    const onErr = (e: { type: "UsernameOrPasswordInvalid" }) => {
      logger.warn("Sign in failed", { error: e });
      return c.html(
        <Layout>
          <section>
            <h1>Sign in</h1>
            <p>Sign in failed: {e}</p>
          </section>
        </Layout>
      );
    };
    const ctx = Federation.getInstance().createContext(c.req.raw, undefined);
    return RA.flow(
      useCase.run({ username: form.username, password: form.password, ctx }),
      RA.match({
        ok: onOk,
        err: onErr,
      })
    );
  }
);
app.get("/sign-up", async (c) => {
  return c.html(
    <Layout>
      <section>
        <h1>Sign up</h1>
        <form method="post" action="/sign-up">
          <input type="text" name="username" placeholder="Username" required />
          <input
            type="password"
            name="password"
            placeholder="Password"
            required
            minlength={16}
            maxlength={255}
          />
          <button type="submit">Sign up</button>
        </form>
      </section>
    </Layout>
  );
});
app.post(
  "/sign-up",
  sValidator(
    "form",
    z.object({
      username: Username.zodType,
      password: Password.zodType,
    })
  ),
  async (c) => {
    const form = c.req.valid("form");
    const logger = getLogger("microblog:sign-up");
    logger.info("Sign up attempt", { username: form.username });

    const useCase = SignUpUseCase.create({
      userResolverByUsername: PgUserResolverByUsername.getInstance(),
      userCreatedStore: PgUserCreatedStore.getInstance(),
      localActorCreatedStore: PgLocalActorCreatedStore.getInstance(),
      userPasswordSetStore: PgUserPasswordSetStore.getInstance(),
    });

    const onOk = (v: { user: User }) => {
      logger.info("Sign up successful", { username: v.user.username });
      return c.html(
        <Layout>
          <section>
            <h1>Sign up</h1>
            <p>Sign up successful for username: {String(v.user.username)}</p>
          </section>
        </Layout>
      );
    };

    const onErr = (e: UsernameAlreadyTakenError) => {
      logger.warn("Sign up failed", { error: e });
      return c.html(
        <Layout>
          <section>
            <h1>Sign up</h1>
            <p>Sign up failed: {e.message}</p>
          </section>
        </Layout>
      );
    };

    const ctx = Federation.getInstance().createContext(c.req.raw, undefined);

    return RA.flow(
      useCase.run({ username: form.username, password: form.password, ctx }),
      RA.match({
        ok: onOk,
        err: onErr,
      })
    );
  }
);

export default app;
