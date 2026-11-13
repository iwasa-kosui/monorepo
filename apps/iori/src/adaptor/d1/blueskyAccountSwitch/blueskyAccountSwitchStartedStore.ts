import { RA } from '@iwasa-kosui/result';

import {
  BlueskyAccountSwitchInProgress,
  type BlueskyAccountSwitchStartedStore,
} from '../../../domain/blueskyAccountSwitch/blueskyAccountSwitch.ts';
import { blueskyStoredCredentialSaveQuery } from '../blueskyCredential/blueskyCredentialStore.ts';
import { blueskyLoginFailureDeleteQuery } from '../blueskyCrosspost/blueskyLoginFailureStore.ts';
import { blueskySessionSaveQuery } from '../blueskyCrosspost/blueskySessionStore.ts';
import type { IoriD1Db } from '../client.ts';
import { toD1DomainEventRow } from '../eventRow.ts';
import { runBatch } from '../runBatch.ts';
import { blueskyAccountSwitchTable, domainEventsTable } from '../schema.ts';
import { BLUESKY_ACCOUNT_SWITCH_ID, createD1BlueskyAccountSwitchResolver } from './blueskyAccountSwitchResolver.ts';

export const createD1BlueskyAccountSwitchStartedStore = (
  db: IoriD1Db,
  loginFailureScope: string,
): BlueskyAccountSwitchStartedStore => ({
  store: async ({ event, credential, session }) => {
    const state = event.aggregateState;
    try {
      await runBatch(db, [
        db.insert(blueskyAccountSwitchTable).values({
          id: BLUESKY_ACCOUNT_SWITCH_ID,
          switchId: state.switchId,
          fromDid: state.fromDid,
          toDid: state.toDid,
          startedAt: new Date(state.startedAt),
          attempts: state.attempts,
          lastError: state.lastError,
          deletedCounts: JSON.stringify(state.deletedCounts),
          updatedAt: new Date(state.updatedAt),
        }),
        blueskyStoredCredentialSaveQuery(db, credential),
        blueskySessionSaveQuery(db, session),
        blueskyLoginFailureDeleteQuery(db, loginFailureScope),
        db.insert(domainEventsTable).values(toD1DomainEventRow(event)),
      ]);
    } catch (error) {
      const existing = await createD1BlueskyAccountSwitchResolver(db).resolve();
      if (existing.ok && existing.val !== undefined) return RA.err(BlueskyAccountSwitchInProgress.create());
      throw error;
    }
    return RA.ok(undefined);
  },
});
