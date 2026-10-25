import { Instant } from '../../../domain/instant/instant.ts';
import type { Relay } from '../../../domain/relay/relay.ts';
import { RelayId } from '../../../domain/relay/relayId.ts';
import { relaysTable } from '../schema.ts';

export const reconstructD1Relay = (row: typeof relaysTable.$inferSelect): Relay => ({
  relayId: RelayId.orThrow(row.relayId),
  inboxUrl: row.inboxUrl,
  actorUri: row.actorUri,
  status: row.status as Relay['status'],
  createdAt: Instant.orThrow(row.createdAt.getTime()),
  acceptedAt: row.acceptedAt === null ? null : Instant.orThrow(row.acceptedAt.getTime()),
});
