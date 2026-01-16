import { RA } from "@iwasa-kosui/result";
import { eq } from "drizzle-orm";

import type { LogoUriUpdated, LogoUriUpdatedStore } from "../../../domain/actor/updateLogoUri.ts";
import { singleton } from "../../../helper/singleton.ts";
import { DB } from "../db.ts";
import { actorsTable, domainEventsTable } from "../schema.ts";

const store = async (event: LogoUriUpdated): RA<void, never> => {
  await DB.getInstance().transaction(async (tx) => {
    await tx.update(actorsTable).set({
      logoUri: event.aggregateState.logoUri,
    }).where(eq(actorsTable.actorId, event.aggregateId));
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

const getInstance = singleton((): LogoUriUpdatedStore => ({
  store,
}));

export const PgLogoUriUpdatedStore = {
  getInstance,
} as const;
