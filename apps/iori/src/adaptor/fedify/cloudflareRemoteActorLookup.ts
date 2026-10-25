import type { Actor, Federation } from '@fedify/fedify';
import { isActor } from '@fedify/fedify';
import { RA } from '@iwasa-kosui/result';

import type { RemoteActorLookup } from './remoteActorLookup.ts';

type RemoteActorLookupError = Readonly<{
  type: 'RemoteActorLookupError';
  message: string;
  detail: { handle: string; reason: string; rawResult?: unknown };
}>;

const lookupError = (handle: string, reason: string, rawResult?: unknown): RemoteActorLookupError => ({
  type: 'RemoteActorLookupError',
  message: `Failed to lookup remote actor "${handle}": ${reason}`,
  detail: { handle, reason, rawResult },
});

export const createCloudflareRemoteActorLookup = (federation: Federation<void>): RemoteActorLookup => ({
  lookup: async ({ request, handle, identifier }): RA<Actor, RemoteActorLookupError> => {
    const ctx = federation.createContext(request, undefined);
    const documentLoader = await ctx.getDocumentLoader({ identifier });
    const result = await ctx.lookupObject(handle.trim(), { documentLoader });
    if (!isActor(result)) {
      return RA.err(lookupError(handle, 'Invalid actor handle or URL', result));
    }
    if (result.id === null) {
      return RA.err(lookupError(handle, 'Could not resolve actor ID'));
    }
    if (result.inboxId === null) {
      return RA.err(lookupError(handle, 'Could not resolve actor inbox'));
    }
    return RA.ok(result);
  },
});
