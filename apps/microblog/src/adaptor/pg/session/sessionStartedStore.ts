import { RA } from "@iwasa-kosui/result";
import type { SessionStarted, SessionStartedStore } from "../../../domain/session/session.ts";
import { DB } from "../db.ts";
import { singleton } from "../../../helper/singleton.ts";
import { domainEventsTable, sessionsTable } from "../schema.ts";

const store = async (event: SessionStarted): RA<void, never> => {
  await DB.getInstance().transaction(async (tx) => {
    const { sessionId, userId, expires } = event.aggregateState;
    await tx.insert(sessionsTable).values({
      sessionId: sessionId,
      userId: userId,
      expires: new Date(expires),
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
const getInstance = singleton((): SessionStartedStore => ({
  store,
}));

export const PgSessionStartedStore = {
  getInstance,
} as const;
