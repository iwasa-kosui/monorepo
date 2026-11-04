import type { InboxRequestReport, RequestContext } from '@fedify/fedify';
import { getLogger } from '@logtape/logtape';

import type { RelayResolverByActorUri } from '../../../domain/relay/relay.ts';
import { extractRelayForwardedCreate } from './extractRelayForwardedCreate.ts';
import type { RefetchRelayForwardedNoteData } from './refetchRelayForwardedNote.ts';

export type OnRequestFinishedDeps<TContextData> = Readonly<{
  relayResolverByActorUri: RelayResolverByActorUri;
  enqueue: (ctx: RequestContext<TContextData>, data: RefetchRelayForwardedNoteData) => Promise<void>;
}>;

export const createOnRequestFinished = <TContextData>(deps: OnRequestFinishedDeps<TContextData>) =>
async (
  ctx: RequestContext<TContextData>,
  report: InboxRequestReport,
): Promise<void> => {
  try {
    const forwarded = extractRelayForwardedCreate(report);
    if (!forwarded) {
      return;
    }

    const relayResult = await deps.relayResolverByActorUri.resolve({ actorUri: forwarded.keyOwnerId.href });
    if (!relayResult.ok) {
      getLogger().warn(
        `Failed to resolve a relay for a rejected Create: ${forwarded.keyOwnerId.href} - ${
          JSON.stringify(relayResult.err)
        }`,
      );
      return;
    }
    const relay = relayResult.val;
    if (!relay || relay.status !== 'accepted') {
      return;
    }

    await deps.enqueue(ctx, {
      objectId: forwarded.objectId.href,
      actorId: forwarded.actorId.href,
      relayId: relay.relayId,
    });
    getLogger().info(
      `Enqueued a refetch of a relay-forwarded Create rejected by the LD signature check: ${forwarded.objectId.href} (relay ${relay.actorUri})`,
    );
  } catch (error) {
    getLogger().warn(`Failed to handle a rejected inbox request for a relay-forwarded Create: ${String(error)}`);
  }
};
