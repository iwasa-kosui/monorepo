import { Layout } from "../../layout.tsx";
import { sValidator } from "@hono/standard-validator";
import { Hono } from "hono";
import { Follow } from "@fedify/fedify";
import { Federation } from "../../federation.ts";
import z from "zod/v4";
import { getCookie } from "hono/cookie";
import { PgSessionResolver } from "../pg/session/sessionResolver.ts";
import { SessionId } from "../../domain/session/sessionId.ts";
import { Follow as AppFollow } from "../../domain/follow/follow.ts";
import { RA } from "@iwasa-kosui/result";
import { PgUserResolver } from "../pg/user/userResolver.ts";
import { PgFollowRequestedStore } from "../pg/follow/followRequestedStore.ts";
import type { Actor } from "../../domain/actor/actor.ts";
import { PgRemoteActorCreatedStore } from "../pg/actor/remoteActorCreatedStore.ts";
import { Instant } from "../../domain/instant/instant.ts";
import { PgActorResolverByUserId } from "../pg/actor/actorResolverByUserId.ts";
import { upsertRemoteActor } from "../../useCase/helper/upsertRemoteActor.ts";
import { PgLogoUriUpdatedStore } from "../pg/actor/logoUriUpdatedStore.ts";
import { ActorIdentity } from "../fedify/actorIdentity.ts";
import { FedifyRemoteActorLookup } from "../fedify/remoteActorLookup.ts";

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
    const form = c.req.valid("form");
    const handle = form.handle;
    if (typeof handle !== "string") {
      return c.text("Invalid actor handle or URL", 400);
    }
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
      RA.andBind("followingActor", ({ user }) =>
        FedifyRemoteActorLookup.getInstance().lookup({
          request: c.req.raw,
          handle,
          identifier: user.username,
        })
      ),
      RA.andBind(
        "follower",
        ({ user }): RA<Actor, unknown> =>
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
        ({ followingActor }): RA<Actor, unknown> =>
          RA.flow(
            ActorIdentity.fromFedifyActor(followingActor),
            RA.andThen(
              upsertRemoteActor({
                now: Instant.now(),
                remoteActorCreatedStore:
                  PgRemoteActorCreatedStore.getInstance(),
                logoUriUpdatedStore: PgLogoUriUpdatedStore.getInstance(),
              })
            )
          )
      ),
      RA.andThrough(async ({ follower, following }) => {
        const followRequested = AppFollow.requestFollow(
          {
            followerId: follower.id,
            followingId: following.id,
          },
          Instant.now()
        );
        return PgFollowRequestedStore.getInstance().store(followRequested);
      }),
      RA.map(async ({ user, followingActor }) => {
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
