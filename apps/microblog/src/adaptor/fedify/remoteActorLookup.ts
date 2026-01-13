import type { Actor } from "@fedify/fedify";
import { isActor } from "@fedify/fedify";
import { RA } from "@iwasa-kosui/result";
import { singleton } from "../../helper/singleton.ts";
import { Federation } from "../../federation.ts";
import type { Username } from "../../domain/user/username.ts";

export type RemoteActorLookupError = Readonly<{
  type: "RemoteActorLookupError";
  message: string;
  detail: {
    handle: string;
    reason: string;
    rawResult?: unknown;
  };
}>;

export const RemoteActorLookupError = {
  create: (
    handle: string,
    reason: string,
    rawResult?: unknown
  ): RemoteActorLookupError => ({
    type: "RemoteActorLookupError",
    message: `Failed to lookup remote actor "${handle}": ${reason}`,
    detail: { handle, reason, rawResult },
  }),
} as const;

export type RemoteActorLookup = {
  lookup: (params: {
    request: Request;
    handle: string;
    identifier: Username;
  }) => RA<Actor, RemoteActorLookupError>;
};

const getInstance = singleton((): RemoteActorLookup => {
  const lookup: RemoteActorLookup["lookup"] = async ({
    request,
    handle,
    identifier,
  }) => {
    const ctx = Federation.getInstance().createContext(request, undefined);
    const documentLoader = await ctx.getDocumentLoader({ identifier });
    const result = await ctx.lookupObject(handle.trim(), { documentLoader });

    if (!isActor(result)) {
      return RA.err(
        RemoteActorLookupError.create(
          handle,
          "Invalid actor handle or URL",
          result
        )
      );
    }

    if (!result.id) {
      return RA.err(
        RemoteActorLookupError.create(handle, "Could not resolve actor ID")
      );
    }

    if (!result.inboxId) {
      return RA.err(
        RemoteActorLookupError.create(handle, "Could not resolve actor inbox")
      );
    }

    return RA.ok(result);
  };

  return { lookup };
});

export const FedifyRemoteActorLookup = {
  getInstance,
} as const;
