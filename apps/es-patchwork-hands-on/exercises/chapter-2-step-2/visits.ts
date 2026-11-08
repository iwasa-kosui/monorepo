import type { DatabaseSync } from 'node:sqlite';
import { withTransaction } from './db.ts';

export const reserveVisit = (db: DatabaseSync, input: { visitId: string; petName: string }): void => {
  db.prepare(`INSERT INTO visits (id, pet_name, status) VALUES (?, ?, 'reserved')`).run(input.visitId, input.petName);
};

export const completeVisit = (db: DatabaseSync, input: { visitId: string }): void => {
  db.prepare(`UPDATE visits SET status = 'completed' WHERE id = ?`).run(input.visitId);
};

export const cancelVisit = (db: DatabaseSync, input: { visitId: string; reason: string; operatedBy: string }): void => {
  withTransaction(db, () => {
    const visit = db.prepare(`SELECT status FROM visits WHERE id = ?`).get(input.visitId);
    if (visit === undefined) {
      throw new Error('来院が見つかりません');
    }
    if (visit.status === 'completed') {
      throw new Error('診察が終わった来院はキャンセルできません');
    }
    db.prepare(`UPDATE visits SET status = 'cancelled' WHERE id = ?`).run(input.visitId);
    const cancelled = db.prepare(`SELECT * FROM visits WHERE id = ?`).get(input.visitId);
    db.prepare(`
      INSERT INTO business_events (event_at, event_name, payload, target_id, target_type, target_state)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      new Date().toISOString(),
      'VisitCancelled',
      JSON.stringify({ reason: input.reason, operatedBy: input.operatedBy }),
      input.visitId,
      'Visit',
      JSON.stringify(cancelled),
    );
  });
};
