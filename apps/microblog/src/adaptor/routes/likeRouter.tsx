import { sValidator } from "@hono/standard-validator";
import { RA } from "@iwasa-kosui/result";
import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import z from "zod/v4";
import { SessionId } from "../../domain/session/sessionId.ts";
import { Federation } from "../../federation.ts";
import { SendLikeUseCase } from "../../useCase/sendLike.ts";
import { PgActorResolverByUserId } from "../pg/actor/actorResolverByUserId.ts";
import { PgLikeCreatedStore } from "../pg/like/likeCreatedStore.ts";
import { PgLikeResolver } from "../pg/like/likeResolver.ts";
import { PgSessionResolver } from "../pg/session/sessionResolver.ts";
import { PgUserResolver } from "../pg/user/userResolver.ts";

const app = new Hono();

app.post(
  "/",
  sValidator(
    "form",
    z.object({
      objectUri: z.string().min(1),
    })
  ),
  async (c) => {
    const form = c.req.valid("form");
    const objectUri = form.objectUri;

    const sessionIdResult = await RA.flow(
      RA.ok(getCookie(c, "sessionId")),
      RA.andThen(SessionId.parse)
    );
    if (!sessionIdResult.ok) {
      return c.text("Invalid session", 400);
    }

    const ctx = Federation.getInstance().createContext(c.req.raw, undefined);

    const useCase = SendLikeUseCase.create({
      sessionResolver: PgSessionResolver.getInstance(),
      userResolver: PgUserResolver.getInstance(),
      actorResolverByUserId: PgActorResolverByUserId.getInstance(),
      likeCreatedStore: PgLikeCreatedStore.getInstance(),
      likeResolver: PgLikeResolver.getInstance(),
    });

    const result = await useCase.run({
      sessionId: sessionIdResult.val,
      objectUri,
      request: c.req.raw,
      ctx,
    });

    return RA.match({
      ok: () => c.redirect("/"),
      err: (err) => c.text(`Failed to like: ${JSON.stringify(err)}`, 400),
    })(result);
  }
);

export const LikeRouter = app;
