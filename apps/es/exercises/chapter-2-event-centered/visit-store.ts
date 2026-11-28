import type { DatabaseSync } from 'node:sqlite';
import type { Resolver, Store } from './business-event.ts';
import { recordBusinessEvent } from './business-event.ts';
import type { VisitCancelled, VisitState } from './visit.ts';

export const visitResolver = (db: DatabaseSync): Resolver<VisitState['id'], VisitState> => ({
  resolve: (visitId) => {
    const visit = db.prepare(`SELECT * FROM visits WHERE id = ?`).get(visitId);
    if (visit === undefined) {
      throw new Error('来院が見つかりません');
    }
    return visit as VisitState;
  },
});

export const visitCancelledStore = (db: DatabaseSync): Store<VisitCancelled> => ({
  store: (event) => {
    db.prepare(`UPDATE visits SET status = ? WHERE id = ?`).run(event.targetState.status, event.targetId);
    recordBusinessEvent(db, event);
  },
});
