import { RA } from '@iwasa-kosui/result';
import { and, count, eq } from 'drizzle-orm';

import {
  BlueskyAccountSwitch,
  BlueskyAccountSwitchInProgress,
  type BlueskyAccountSwitchStartedStore,
  BlueskyDidChanged,
} from '../../../domain/blueskyAccountSwitch/blueskyAccountSwitch.ts';
import type { UserId } from '../../../domain/user/userId.ts';
import { blueskyStoredCredentialSaveQuery } from '../blueskyCredential/blueskyCredentialStore.ts';
import { blueskyLoginFailureDeleteQuery } from '../blueskyCrosspost/blueskyLoginFailureStore.ts';
import { blueskySessionSaveQuery } from '../blueskyCrosspost/blueskySessionStore.ts';
import type { IoriD1Db } from '../client.ts';
import { toD1DomainEventRow } from '../eventRow.ts';
import { guardedInsert } from '../guardedInsert.ts';
import { runBatchChanges } from '../runBatch.ts';
import { blueskyAccountSwitchTable, blueskyModeratedActorsTable, domainEventsTable } from '../schema.ts';
import { blueskyAccountSwitchStarted, blueskyCredentialUnchangedFrom } from './blueskyAccountSwitchGuard.ts';
import { createD1BlueskyAccountSwitchResolver } from './blueskyAccountSwitchResolver.ts';

export const createD1BlueskyAccountSwitchStartedStore = (
  db: IoriD1Db,
  userId: UserId,
  loginFailureScope: string,
): BlueskyAccountSwitchStartedStore => ({
  store: async ({ event, credential, session }) => {
    const [moderated] = await db.select({ n: count() }).from(blueskyModeratedActorsTable)
      .where(eq(blueskyModeratedActorsTable.userId, userId));
    const state = BlueskyAccountSwitch.recordDeleted(
      event.aggregateState,
      'moderatedActors',
      moderated?.n ?? 0,
      event.aggregateState.updatedAt,
    );
    const guard = blueskyAccountSwitchStarted(db, state.switchId);
    try {
      const [switchChanges] = await runBatchChanges(db, [
        guardedInsert(db, blueskyAccountSwitchTable, {
          userId,
          switchId: state.switchId,
          fromDid: state.fromDid,
          toDid: state.toDid,
          startedAt: new Date(state.startedAt),
          attempts: state.attempts,
          lastError: state.lastError,
          deletedCounts: JSON.stringify(state.deletedCounts),
          updatedAt: new Date(state.updatedAt),
        }, blueskyCredentialUnchangedFrom(db, userId, state.fromDid)),
        blueskyStoredCredentialSaveQuery(db, userId, credential, guard),
        blueskySessionSaveQuery(db, userId, session, guard),
        blueskyLoginFailureDeleteQuery(db, userId, loginFailureScope, guard),
        db.delete(blueskyModeratedActorsTable).where(and(eq(blueskyModeratedActorsTable.userId, userId), guard)),
        guardedInsert(db, domainEventsTable, toD1DomainEventRow({ ...event, aggregateState: state }), guard),
      ]);
      if (switchChanges === 0) {
        const existing = await createD1BlueskyAccountSwitchResolver(db, userId).resolve();
        return RA.err(
          existing.ok && existing.val !== undefined
            ? BlueskyAccountSwitchInProgress.create()
            : BlueskyDidChanged.create(),
        );
      }
    } catch (error) {
      const existing = await createD1BlueskyAccountSwitchResolver(db, userId).resolve();
      if (existing.ok && existing.val !== undefined) return RA.err(BlueskyAccountSwitchInProgress.create());
      throw error;
    }
    return RA.ok(undefined);
  },
});
