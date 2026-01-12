import { RA } from "@iwasa-kosui/result";
import type { FollowAccepted, FollowAcceptedStore } from "../../../domain/follow/follow.ts";
import { DB } from "../db.ts";
import { domainEventsTable, followsTable, userPasswordsTable } from "../schema.ts";
import { singleton } from "../../../helper/singleton.ts";
import type { UserPasswordSet, UserPasswordSetStore } from "../../../domain/password/userPassword.ts";

const store = async (event: UserPasswordSet): RA<void, never> => {
  await DB.getInstance().transaction(async (tx) => {
    const { hashedPassword, userId } = event.aggregateState
    await tx.insert(userPasswordsTable).values({
      userId: userId,
      algorithm: hashedPassword.algorithm,
      parallelism: hashedPassword.parallelism,
      tagLength: hashedPassword.tagLength,
      memory: hashedPassword.memory,
      passes: hashedPassword.passes,
      nonceHex: hashedPassword.nonceHex,
      tagHex: hashedPassword.tagHex,
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

const getInstance = singleton((): UserPasswordSetStore => ({
  store,
}));

export const PgUserPasswordSetStore = {
  getInstance,
} as const;
