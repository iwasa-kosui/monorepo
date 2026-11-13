import { RA } from '@iwasa-kosui/result';
import { count } from 'drizzle-orm';

import {
  BlueskyAccountSwitch,
  BlueskyAccountSwitchInProgress,
  type BlueskyAccountSwitchStartedStore,
  BlueskyDidChanged,
} from '../../../domain/blueskyAccountSwitch/blueskyAccountSwitch.ts';
import { blueskyStoredCredentialSaveQuery } from '../blueskyCredential/blueskyCredentialStore.ts';
import { blueskyLoginFailureDeleteQuery } from '../blueskyCrosspost/blueskyLoginFailureStore.ts';
import { blueskySessionSaveQuery } from '../blueskyCrosspost/blueskySessionStore.ts';
import type { IoriD1Db } from '../client.ts';
import { toD1DomainEventRow } from '../eventRow.ts';
import { guardedInsert } from '../guardedInsert.ts';
import { runBatchChanges } from '../runBatch.ts';
import { blueskyAccountSwitchTable, blueskyModeratedActorsTable, domainEventsTable } from '../schema.ts';
import { blueskyAccountSwitchStarted, blueskyCredentialUnchangedFrom } from './blueskyAccountSwitchGuard.ts';
import { BLUESKY_ACCOUNT_SWITCH_ID, createD1BlueskyAccountSwitchResolver } from './blueskyAccountSwitchResolver.ts';

export const createD1BlueskyAccountSwitchStartedStore = (
  db: IoriD1Db,
  loginFailureScope: string,
): BlueskyAccountSwitchStartedStore => ({
  store: async ({ event, credential, session }) => {
    const [moderated] = await db.select({ n: count() }).from(blueskyModeratedActorsTable);
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
          id: BLUESKY_ACCOUNT_SWITCH_ID,
          switchId: state.switchId,
          fromDid: state.fromDid,
          toDid: state.toDid,
          startedAt: new Date(state.startedAt),
          attempts: state.attempts,
          lastError: state.lastError,
          deletedCounts: JSON.stringify(state.deletedCounts),
          updatedAt: new Date(state.updatedAt),
        }, blueskyCredentialUnchangedFrom(db, state.fromDid)),
        blueskyStoredCredentialSaveQuery(db, credential, guard),
        blueskySessionSaveQuery(db, session, guard),
        blueskyLoginFailureDeleteQuery(db, loginFailureScope, guard),
        db.delete(blueskyModeratedActorsTable).where(guard),
        guardedInsert(db, domainEventsTable, toD1DomainEventRow({ ...event, aggregateState: state }), guard),
      ]);
      if (switchChanges === 0) {
        const existing = await createD1BlueskyAccountSwitchResolver(db).resolve();
        return RA.err(
          existing.ok && existing.val !== undefined
            ? BlueskyAccountSwitchInProgress.create()
            : BlueskyDidChanged.create(),
        );
      }
    } catch (error) {
      const existing = await createD1BlueskyAccountSwitchResolver(db).resolve();
      if (existing.ok && existing.val !== undefined) return RA.err(BlueskyAccountSwitchInProgress.create());
      throw error;
    }
    return RA.ok(undefined);
  },
});
