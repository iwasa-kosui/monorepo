import { Layout } from "../../layout.tsx";
import { sValidator } from "@hono/standard-validator";
import { Hono } from "hono";
import { Create, Follow, isActor, lookupObject, Note } from "@fedify/fedify";
import { Federation } from "../../federation.ts";
import z from "zod/v4";
import { getCookie } from "hono/cookie";
import { PgSessionResolver } from "../pg/session/sessionResolver.ts";
import { SessionId } from "../../domain/session/sessionId.ts";
import { Follow as AppFollow } from "../../domain/follow/follow.ts";
import { RA } from "@iwasa-kosui/result";
import { PgUserResolver } from "../pg/user/userResolver.ts";
import { PgFollowRequestedStore } from "../pg/follow/followRequestedStore.ts";
import { PgActorResolverByUri } from "../pg/actor/actorResolverByUri.ts";
import type { Actor } from "../../domain/actor/actor.ts";
import { RemoteActor } from "../../domain/actor/remoteActor.ts";
import { PgRemoteActorCreatedStore } from "../pg/actor/remoteActorCreatedStore.ts";
import { Instant } from "../../domain/instant/instant.ts";
import { PgActorResolverByUserId } from "../pg/actor/actorResolverByUserId.ts";

const app = new Hono();

app.get(
  "/",
  sValidator(
    "query",
    z.object({
      uri: z.string().optional(),
    })
  ),
  async (c) => {
    const uri = c.req.valid("query").uri ?? "";
    return c.html(
      <Layout>
        <section>
          <h1>Follow</h1>
          <form method="post" action="/follow">
            <input
              type="text"
              name="handle"
              placeholder="Handle to follow"
              required
              value={uri}
            />
            <button type="submit">Follow</button>
          </form>
        </section>
      </Layout>
    );
  }
);

app.post(
  "/",
  sValidator(
    "form",
    z.object({
      handle: z.string().min(1),
    })
  ),
  async (c) => {
    const form = await c.req.valid("form");
    const handle = form.handle;
    if (typeof handle !== "string") {
      return c.text("Invalid actor handle or URL", 400);
    }
    const followingActor = await lookupObject(handle.trim());
    if (!isActor(followingActor)) {
      return c.text("Invalid actor handle or URL", 400);
    }
    if (!followingActor.id) {
      return c.text("Could not resolve actor ID", 400);
    }
    if (!followingActor.inboxId) {
      return c.text("Could not resolve actor inbox", 400);
    }
    const followingIdentity = {
      uri: followingActor.id.href,
      inboxUrl: followingActor.inboxId.href,
      url: followingActor.url?.href?.toString() ?? undefined,
      username: followingActor.preferredUsername?.toString() ?? undefined,
    } as const;
    return RA.flow(
      RA.ok(getCookie(c, "sessionId")),
      RA.andThen(SessionId.parse),
      RA.andThen(PgSessionResolver.getInstance().resolve),
      RA.andThen((session) =>
        session ? RA.ok(session) : RA.err("No session")
      ),
      RA.andThen((session) =>
        PgUserResolver.getInstance().resolve(session.userId)
      ),
      RA.andBind("user", (user) =>
        user ? RA.ok(user) : RA.err("User not found")
      ),
      RA.andBind(
        "follower",
        (user): RA<Actor, unknown> =>
          RA.flow(
            RA.ok(user.id),
            RA.andThen(PgActorResolverByUserId.getInstance().resolve),
            RA.andThen((a) => {
              if (!a) {
                return RA.err("Follower actor not found");
              }
              return RA.ok(a);
            })
          )
      ),
      RA.andBind(
        "following",
        (): RA<Actor, unknown> =>
          RA.flow(
            RA.ok(followingIdentity.uri),
            RA.andThen(PgActorResolverByUri.getInstance().resolve),
            RA.andThen((actor) => {
              if (!actor) {
                return RA.flow(
                  RA.ok(RemoteActor.createRemoteActor(followingIdentity)),
                  RA.andThrough(PgRemoteActorCreatedStore.getInstance().store),
                  RA.map((event) => event.aggregateState)
                );
              }
              return RA.ok(actor);
            })
          )
      ),
      RA.andThrough(async ({ user, follower, following }) => {
        const followRequested = AppFollow.requestFollow(
          {
            followerId: follower.id,
            followingId: following.id,
          },
          Instant.now()
        );
        return PgFollowRequestedStore.getInstance().store(followRequested);
      }),
      RA.map(async ({ user }) => {
        const ctx = Federation.getInstance().createContext(
          c.req.raw,
          undefined
        );
        await ctx.sendActivity(
          { username: user.username },
          followingActor,
          new Follow({
            actor: ctx.getActorUri(user.username),
            object: followingActor.id,
            to: followingActor.id,
          })
        );
        return c.text("Successfully sent a follow request");
      }),
      RA.match({
        ok: async (resPromise) => resPromise,
        err: (err) => {
          return c.text(
            `Failed to follow: ${String(JSON.stringify(err))}`,
            400
          );
        },
      })
    );
  }
);

export const FollowRouter = app;
