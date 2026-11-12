import { type Context, createExponentialBackoffPolicy, type TaskRegistry } from '@fedify/fedify';
import { Object as ActivityPubObject } from '@fedify/vocab';
import { FetchError, UrlError } from '@fedify/vocab-runtime';
import { getLogger } from '@logtape/logtape';
import z from 'zod/v4';

import { Visibility } from '../../../domain/post/visibility.ts';
import type { RelayResolver } from '../../../domain/relay/relay.ts';
import { RelayId } from '../../../domain/relay/relayId.ts';
import { isRemotePostObject } from '../../../useCase/helper/remotePostObject.ts';
import { extractVisibility } from '../extractVisibility.ts';
import { saveFederatedNote, type SaveFederatedNoteDeps } from '../inboxListener/saveFederatedNote.ts';
import { INSTANCE_ACTOR_IDENTIFIER } from '../sharedKeyDispatcher.ts';

export const REFETCH_RELAY_FORWARDED_NOTE_TASK = 'refetchRelayForwardedNote';

const refetchRelayForwardedNoteSchema = z.object({
  objectId: z.url(),
  actorId: z.url(),
  relayId: z.uuid(),
});

export type RefetchRelayForwardedNoteData = z.infer<typeof refetchRelayForwardedNoteSchema>;

export type RefetchRelayForwardedNoteDeps =
  & SaveFederatedNoteDeps
  & Readonly<{
    relayResolver: RelayResolver;
  }>;

type RefetchContext = Pick<Context<unknown>, 'getDocumentLoader' | 'contextLoader'>;

export const isFetchFailure = (error: unknown): boolean =>
  error instanceof FetchError || error instanceof UrlError
  || (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError'));

export const createRefetchRelayForwardedNoteHandler = (deps: RefetchRelayForwardedNoteDeps) =>
async (
  ctx: RefetchContext,
  data: RefetchRelayForwardedNoteData,
): Promise<void> => {
  const relayIdResult = RelayId.parse(data.relayId);
  if (!relayIdResult.ok) {
    getLogger().warn(`Invalid relay id for a relay-forwarded Note refetch: ${data.relayId}`);
    return;
  }
  const relayId = relayIdResult.val;

  const relayResult = await deps.relayResolver.resolve({ relayId });
  const relay = relayResult.ok ? relayResult.val : undefined;
  if (!relay || relay.status !== 'accepted') {
    getLogger().info(`Skipping a relay-forwarded Note refetch for a relay that is not accepted: ${relayId}`);
    return;
  }

  const objectId = new URL(data.objectId);
  const documentLoader = await ctx.getDocumentLoader({ identifier: INSTANCE_ACTOR_IDENTIFIER });

  let document: unknown;
  let documentUrl: string;
  try {
    ({ document, documentUrl } = await documentLoader(objectId.href));
  } catch (error) {
    if (!isFetchFailure(error)) {
      throw error;
    }
    getLogger().warn(`Failed to fetch a relay-forwarded Note: ${objectId.href} - ${String(error)}`);
    return;
  }

  if (!URL.canParse(documentUrl) || new URL(documentUrl).href !== objectId.href) {
    getLogger().warn(
      `Skipping a relay-forwarded Note fetched from a different URL than requested: ${objectId.href} -> ${documentUrl}`,
    );
    return;
  }

  let note: unknown;
  try {
    note = await ActivityPubObject.fromJsonLd(document, { documentLoader, contextLoader: ctx.contextLoader });
  } catch (error) {
    getLogger().warn(`Refetched object is not the requested Note: ${objectId.href} - ${String(error)}`);
    return;
  }
  if (!isRemotePostObject(note) || note.id?.href !== objectId.href) {
    getLogger().warn(`Refetched object is not the requested Note: ${objectId.href}`);
    return;
  }

  if (note.attributionId?.href !== data.actorId) {
    getLogger().info(`Skipping a relay-forwarded Note whose author differs from the Create actor: ${objectId.href}`);
    return;
  }

  if (!Visibility.isVisibleToAnonymous(extractVisibility(note, undefined))) {
    getLogger().info(`Skipping a relay-forwarded Note that is neither public nor unlisted: ${objectId.href}`);
    return;
  }

  try {
    await saveFederatedNote(deps, {
      note,
      relayId,
      documentLoader,
      actorId: new URL(data.actorId),
    });
  } catch (error) {
    if (!isFetchFailure(error)) {
      throw error;
    }
    getLogger().warn(`Failed to fetch the author of a relay-forwarded Note: ${objectId.href} - ${String(error)}`);
  }
};

// relay の HTTP 署名は取り直すきっかけにだけ使い、転送された本文は保存しない
export const defineRefetchRelayForwardedNoteTask = <TContextData>(
  registry: TaskRegistry<TContextData>,
  deps: RefetchRelayForwardedNoteDeps,
) =>
  registry.defineTask(REFETCH_RELAY_FORWARDED_NOTE_TASK, {
    schema: refetchRelayForwardedNoteSchema,
    handler: createRefetchRelayForwardedNoteHandler(deps),
    retryPolicy: createExponentialBackoffPolicy({ maxAttempts: 3 }),
  });
