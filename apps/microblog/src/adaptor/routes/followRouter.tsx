import { Layout } from "../../layout.tsx";
import { sValidator } from "@hono/standard-validator";
import { Hono } from "hono";
import { Federation } from "../../federation.ts";
import z from "zod/v4";
import { getCookie } from "hono/cookie";
import { PgSessionResolver } from "../pg/session/sessionResolver.ts";
import { SessionId } from "../../domain/session/sessionId.ts";
import { RA } from "@iwasa-kosui/result";
import { PgUserResolver } from "../pg/user/userResolver.ts";
import { PgFollowRequestedStore } from "../pg/follow/followRequestedStore.ts";
import { PgRemoteActorCreatedStore } from "../pg/actor/remoteActorCreatedStore.ts";
import { PgActorResolverByUserId } from "../pg/actor/actorResolverByUserId.ts";
import { PgLogoUriUpdatedStore } from "../pg/actor/logoUriUpdatedStore.ts";
import { FedifyRemoteActorLookup } from "../fedify/remoteActorLookup.ts";
import { SendFollowRequestUseCase } from "../../useCase/sendFollowRequest.ts";

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

    const sessionIdResult = RA.flow(
      RA.ok(getCookie(c, "sessionId")),
      RA.andThen(SessionId.parse)
    );
    if (RA.isErr(sessionIdResult)) {
      return c.text("Invalid session", 400);
    }

    const ctx = Federation.getInstance().createContext(c.req.raw, undefined);

    const useCase = SendFollowRequestUseCase.create({
      sessionResolver: PgSessionResolver.getInstance(),
      userResolver: PgUserResolver.getInstance(),
      actorResolverByUserId: PgActorResolverByUserId.getInstance(),
      remoteActorLookup: FedifyRemoteActorLookup.getInstance(),
      followRequestedStore: PgFollowRequestedStore.getInstance(),
      remoteActorCreatedStore: PgRemoteActorCreatedStore.getInstance(),
      logoUriUpdatedStore: PgLogoUriUpdatedStore.getInstance(),
    });

    const result = await useCase.run({
      sessionId: sessionIdResult.value,
      handle,
      request: c.req.raw,
      ctx,
    });

    return RA.match({
      ok: () => c.text("Successfully sent a follow request"),
      err: (err) =>
        c.text(`Failed to follow: ${JSON.stringify(err)}`, 400),
    })(result);
  }
);

export const FollowRouter = app;
