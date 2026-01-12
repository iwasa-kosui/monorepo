import { RA } from "@iwasa-kosui/result";
import type { RemoteActorCreated, RemoteActorCreatedStore } from "../../../domain/actor/remoteActor.ts";
import { DB } from "../db.ts";
import { actorsTable, domainEventsTable, remoteActorsTable } from "../schema.ts";
import { singleton } from "../../../helper/singleton.ts";

const store = async (event: RemoteActorCreated): RA<void, never> => {
  await DB.getInstance().transaction(async (tx) => {
    await tx.insert(actorsTable).values({
      actorId: event.aggregateId,
      uri: event.aggregateState.uri,
      inboxUrl: event.aggregateState.inboxUrl,
      type: event.aggregateState.type,
    });
    await tx.insert(remoteActorsTable).values({
      actorId: event.aggregateId,
      url: event.aggregateState.url,
      username: event.aggregateState.username,
    });
    await tx.insert(domainEventsTable).values({
      eventId: event.eventId,
      aggregateId: event.aggregateId,
      aggregateName: event.aggregateName,
      aggregateState: event.aggregateState,
      eventName: event.eventName,
      eventPayload: event.eventPayload,
      occurredAt: new Date(event.occurredAt),
    });
  });
  return RA.ok(undefined);
}

const getInstance = singleton((): RemoteActorCreatedStore => ({
  store,
}));

export const PgRemoteActorCreatedStore = {
  getInstance,
} as const;
