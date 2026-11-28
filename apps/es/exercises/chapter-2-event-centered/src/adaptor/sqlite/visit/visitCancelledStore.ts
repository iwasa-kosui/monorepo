import type { DatabaseSync } from 'node:sqlite';
import type { VisitCancelledStore } from '../../../domain/visit/visit.ts';
import { BusinessEventRow } from '../eventRow.ts';

export type SqliteVisitCancelledStore = VisitCancelledStore;

const create = (db: DatabaseSync): SqliteVisitCancelledStore => ({
  store: (event) => {
    db.prepare(`UPDATE visits SET status = ? WHERE id = ?`).run(event.targetState.status, event.targetId);
    db.prepare(`
      INSERT INTO business_events (event_at, event_name, payload, target_id, target_type, target_state)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(...BusinessEventRow.from(event));
  },
});

export const SqliteVisitCancelledStore = { create } as const;
