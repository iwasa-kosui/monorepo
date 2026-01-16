import { Layout, LayoutClient } from "../../layout.tsx";
import { sValidator } from "@hono/standard-validator";
import { Hono } from "hono";
import z from "zod/v4";
import { getLogger } from "@logtape/logtape";
import { RA } from "@iwasa-kosui/result";
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
import { ActorId } from "../../domain/actor/actorId.ts";
import { Follow as AppFollow } from "../../domain/follow/follow.ts";
import { PgFollowRequestedStore } from "../pg/follow/followRequestedStore.ts";
import { PgActorResolverById } from "../pg/actor/actorResolverById.ts";
import { Federation } from "../../federation.ts";
import { Follow, Undo } from "@fedify/fedify";
import { UnfollowUseCase } from "../../useCase/unfollow.ts";

const app = new Hono();

// Helper to get current user's actor ID from session
const getCurrentUserActorId = async (sessionIdCookie: string | undefined) => {
  const now = Instant.now();
  const resolveSession = resolveSessionWith(PgSessionResolver.getInstance(), now);
  const resolveUser = resolveUserWith(PgUserResolver.getInstance());
  const resolveLocalActor = resolveLocalActorWith(PgActorResolverByUserId.getInstance());

  return RA.flow(
    RA.ok(sessionIdCookie),
    RA.andThen(SessionId.parse),
    RA.andBind("session", resolveSession),
    RA.andBind("user", ({ session }) => resolveUser(session.userId)),
    RA.andBind("actor", ({ user }) => resolveLocalActor(user.id)),
    RA.map(({ user, actor }) => ({ user, actor }))
  );
};

// GET /remote-users/:actorId - Display remote user profile
app.get(
  "/:actorId",
  sValidator(
    "param",
    z.object({
      actorId: ActorId.zodType,
    })
  ),
  async (c) => {
    const { actorId } = c.req.valid("param");
    const logger = getLogger("microblog:get-remote-user");
    logger.info("Get remote user attempt", { actorId });

    // Validate that the actorId exists and is a remote actor
    const actorResult = await PgActorResolverById.getInstance().resolve(actorId);
    if (!actorResult.ok || !actorResult.val) {
      return c.html(
        <Layout>
          <section>
            <h1>Remote User Profile</h1>
            <p>Remote user not found</p>
          </section>
        </Layout>,
        404
      );
    }

    if (actorResult.val.type !== 'remote') {
      return c.html(
        <Layout>
          <section>
            <h1>Remote User Profile</h1>
            <p>This is not a remote user</p>
          </section>
        </Layout>,
        400
      );
    }

    // Return client-side rendered page
    return c.html(
      <LayoutClient
        client="/static/remoteUser.js"
        server="/src/ui/pages/remoteUser.tsx"
      >
        <div id="root" />
      </LayoutClient>
    );
  }
);

// POST /remote-users/:actorId/follow - Follow remote user
app.post(
  "/:actorId/follow",
  sValidator(
    "param",
    z.object({
      actorId: ActorId.zodType,
    })
  ),
  async (c) => {
    const { actorId: followingActorId } = c.req.valid("param");
    const logger = getLogger("microblog:follow-remote-user");

    const sessionIdCookie = getCookie(c, "sessionId");
    const currentUserResult = await getCurrentUserActorId(sessionIdCookie);

    if (!currentUserResult.ok) {
      return c.redirect("/sign-in");
    }

    const { user, actor: followerActor } = currentUserResult.val;

    // Get the remote actor to follow
    const remoteActorResult = await PgActorResolverById.getInstance().resolve(followingActorId);
    if (!remoteActorResult.ok || !remoteActorResult.val) {
      return c.html(
        <Layout>
          <section>
            <h1>Error</h1>
            <p>Remote user not found</p>
          </section>
        </Layout>,
        404
      );
    }

    const followingActor = remoteActorResult.val;
    if (followingActor.type !== 'remote') {
      return c.html(
        <Layout>
          <section>
            <h1>Error</h1>
            <p>Cannot follow local users from this page</p>
          </section>
        </Layout>,
        400
      );
    }

    // Create follow request
    const followRequested = AppFollow.requestFollow(
      {
        followerId: followerActor.id,
        followingId: followingActor.id,
      },
      Instant.now()
    );

    const storeResult = await PgFollowRequestedStore.getInstance().store(followRequested);
    if (!storeResult.ok) {
      logger.error("Failed to store follow request", { error: String(storeResult.err) });
      return c.html(
        <Layout>
          <section>
            <h1>Error</h1>
            <p>Failed to follow user</p>
          </section>
        </Layout>,
        500
      );
    }

    // Send Follow Activity
    const ctx = Federation.getInstance().createContext(c.req.raw, undefined);
    await ctx.sendActivity(
      { username: user.username },
      {
        id: new URL(followingActor.uri),
        inboxId: new URL(followingActor.inboxUrl),
      },
      new Follow({
        id: new URL(`${followerActor.uri}#follows/${followingActor.id}`),
        actor: ctx.getActorUri(user.username),
        object: new URL(followingActor.uri),
        to: new URL(followingActor.uri),
      })
    );

    logger.info("Follow request sent", {
      follower: followerActor.id,
      following: followingActor.id,
    });

    return c.redirect(`/remote-users/${followingActorId}`);
  }
);

// POST /remote-users/:actorId/unfollow - Unfollow remote user
app.post(
  "/:actorId/unfollow",
  sValidator(
    "param",
    z.object({
      actorId: ActorId.zodType,
    })
  ),
  async (c) => {
    const { actorId: followingActorId } = c.req.valid("param");
    const logger = getLogger("microblog:unfollow-remote-user");

    const sessionIdCookie = getCookie(c, "sessionId");
    const currentUserResult = await getCurrentUserActorId(sessionIdCookie);

    if (!currentUserResult.ok) {
      return c.redirect("/sign-in");
    }

    const { user, actor: followerActor } = currentUserResult.val;

    // Get the remote actor to unfollow
    const remoteActorResult = await PgActorResolverById.getInstance().resolve(followingActorId);
    if (!remoteActorResult.ok || !remoteActorResult.val) {
      return c.html(
        <Layout>
          <section>
            <h1>Error</h1>
            <p>Remote user not found</p>
          </section>
        </Layout>,
        404
      );
    }

    const followingActor = remoteActorResult.val;
    if (followingActor.type !== 'remote') {
      return c.html(
        <Layout>
          <section>
            <h1>Error</h1>
            <p>Cannot unfollow local users from this page</p>
          </section>
        </Layout>,
        400
      );
    }

    // Execute unfollow use case
    const unfollowUseCase = UnfollowUseCase.getInstance();
    const unfollowResult = await unfollowUseCase.run({
      followerUserId: user.id,
      followingActorId: followingActor.id,
    });

    if (!unfollowResult.ok) {
      logger.error("Failed to unfollow", { error: String(unfollowResult.err) });
      return c.html(
        <Layout>
          <section>
            <h1>Error</h1>
            <p>Failed to unfollow user: {unfollowResult.err.message}</p>
          </section>
        </Layout>,
        400
      );
    }

    // Send Undo Follow Activity
    const ctx = Federation.getInstance().createContext(c.req.raw, undefined);
    const followActivityId = new URL(`${followerActor.uri}#follows/${followingActor.id}`);

    await ctx.sendActivity(
      { username: user.username },
      {
        id: new URL(followingActor.uri),
        inboxId: new URL(followingActor.inboxUrl),
      },
      new Undo({
        id: new URL(`${followerActor.uri}#undo-follows/${followingActor.id}`),
        actor: ctx.getActorUri(user.username),
        object: new Follow({
          id: followActivityId,
          actor: ctx.getActorUri(user.username),
          object: new URL(followingActor.uri),
        }),
        to: new URL(followingActor.uri),
      })
    );

    logger.info("Unfollow request sent", {
      follower: followerActor.id,
      following: followingActor.id,
    });

    return c.redirect(`/remote-users/${followingActorId}`);
  }
);

export const RemoteUsersRouter = app;
