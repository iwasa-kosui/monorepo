import { Layout } from "../../layout.tsx";
import { sValidator } from "@hono/standard-validator";
import { Hono } from "hono";
import z from "zod/v4";
import { PgActorResolverByUserId } from "../pg/actor/actorResolverByUserId.ts";
import { RA } from "@iwasa-kosui/result";
import { getCookie } from "hono/cookie";
import { SessionId } from "../../domain/session/sessionId.ts";
import { CreatePostUseCase } from "../../useCase/createPost.ts";
import { PgSessionResolver } from "../pg/session/sessionResolver.ts";
import { PgPostCreatedStore } from "../pg/post/postCreatedStore.ts";
import { PgUserResolver } from "../pg/user/userResolver.ts";
import { marked } from "marked";
import { Federation } from "../../federation.ts";

const app = new Hono();
app.post(
  "/",
  sValidator(
    "form",
    z.object({
      content: z
        .string()
        .min(1)
        .transform((s) => marked.parse(s, { async: false })),
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
        ctx: Federation.getInstance().createContext(c.req.raw, undefined),
      }),
      RA.match({
        ok: () => {
          return c.redirect("/");
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

export const PostsRouter = app;
