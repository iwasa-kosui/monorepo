import type { DatabaseSync } from 'node:sqlite';
import type { VisitCancelledStore } from '../../../domain/visit/visit.ts';
import { toBusinessEventRow } from '../eventRow.ts';

export const createSqliteVisitCancelledStore = (db: DatabaseSync): VisitCancelledStore => ({
  store: (event) => {
    db.prepare(`UPDATE visits SET status = ? WHERE id = ?`).run(event.targetState.status, event.targetId);
    db.prepare(`
      INSERT INTO business_events (event_at, event_name, payload, target_id, target_type, target_state)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(...toBusinessEventRow(event));
  },
});
