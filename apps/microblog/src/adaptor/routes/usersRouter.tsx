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
import { PgPostImagesResolverByPostId } from "../pg/image/postImagesResolver.ts";

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

    // Helper function to extract plain text from HTML for OGP description
    const extractDescription = (html: string, maxLength: number = 150): string => {
      const text = html
        .replace(/<[^>]*>/g, "") // Remove HTML tags
        .replace(/&nbsp;/g, " ") // Replace &nbsp;
        .replace(/&amp;/g, "&") // Replace &amp;
        .replace(/&lt;/g, "<") // Replace &lt;
        .replace(/&gt;/g, ">") // Replace &gt;
        .replace(/&quot;/g, '"') // Replace &quot;
        .replace(/\s+/g, " ") // Normalize whitespace
        .trim();
      return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
    };

    return RA.flow(
      RA.ok({ postId }),
      RA.andBind("post", ({ postId }) => useCase.run({ postId })),
      RA.andBind("images", ({ postId }) => PgPostImagesResolverByPostId.getInstance().resolve(postId)),
      RA.match({
        ok: ({ post, images }) => {
          const url = new URL(c.req.url);
          const postUrl = `${url.origin}/users/${username}/posts/${post.postId}`;
          const description = extractDescription(post.content);
          const sanitizedContent = sanitize(post.content);

          return c.html(
            <Layout
              ogp={{
                title: `@${username}の投稿`,
                description,
                url: postUrl,
                type: "article",
                author: String(username),
                publishedTime: new Date(post.createdAt).toISOString(),
                image: images.length > 0 ? images[0].url : undefined,
              }}
            >
              <section>
                <h2>
                  <a
                    href={`/users/${username}`}
                    class="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                  >
                    @{String(username)}
                  </a>
                </h2>
                <article class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 mt-4">
                  <div
                    class="text-gray-800 dark:text-gray-200 prose dark:prose-invert prose-sm max-w-none [&_a]:text-blue-600 dark:[&_a]:text-blue-400 hover:[&_a]:underline [&_ul]:list-disc [&_ol]:list-decimal [&_li]:ml-5 break-words [&_blockquote]:border-l-4 [&_blockquote]:border-gray-300 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-gray-600 dark:[&_blockquote]:border-gray-600 dark:[&_blockquote]:text-gray-400"
                    dangerouslySetInnerHTML={{
                      __html: sanitizedContent,
                    }}
                  />
                  {images.length > 0 && (
                    <div class={`mt-4 grid gap-2 ${images.length === 1 ? 'grid-cols-1' : images.length === 2 ? 'grid-cols-2' : 'grid-cols-2 md:grid-cols-3'}`}>
                      {images.map((image, index) => (
                        <a
                          key={index}
                          href={image.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          class="block overflow-hidden rounded-lg"
                        >
                          <img
                            src={image.url}
                            alt={image.altText || "Post image"}
                            class="w-full h-auto max-h-96 object-cover hover:opacity-90 transition-opacity"
                            loading="lazy"
                          />
                        </a>
                      ))}
                    </div>
                  )}
                  <footer class="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                    <time
                      dateTime={new Date(post.createdAt).toISOString()}
                      class="text-sm text-gray-500 dark:text-gray-400"
                    >
                      {new Date(post.createdAt).toLocaleString()}
                    </time>
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
