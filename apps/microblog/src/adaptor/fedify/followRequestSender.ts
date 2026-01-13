import {
  Follow,
  isActor,
  lookupObject,
  type RequestContext,
} from "@fedify/fedify";
import type { Username } from "../../domain/user/username.ts";
import type { Actor } from "../../domain/actor/actor.ts";
import { RA } from "@iwasa-kosui/result";
import type { Handle } from "../../domain/actor/handle.ts";

const create = (ctx: RequestContext<unknown>) => {
  const send = (username: Username, handle: Handle) => {
    RA.flow(
      RA.ok({}),
      RA.andBind("actor", () =>
        RA.flow(
          handle,
          ctx.lookupObject,
          RA.ok,
          RA.andThen((actor) =>
            actor ? RA.ok(actor) : RA.err(new Error("Actor not found"))
          ),
          RA.andThen((actor) =>
            isActor(actor)
              ? RA.ok(actor)
              : RA.err(new Error("Object is not an Actor"))
          )
        )
      ),
      RA.andThen(async ({ actor }) =>
        RA.ok(
          ctx.sendActivity(
            {
              handle: username,
            },
            actor,
            new Follow({
              actor: ctx.getActorUri(username),
              object: actor.id,
              to: actor.id,
            })
          )
        )
      )
    );
  };
};
