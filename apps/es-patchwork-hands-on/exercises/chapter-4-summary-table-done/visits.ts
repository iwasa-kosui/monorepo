import type { DatabaseSync } from 'node:sqlite';
import { withTransaction } from './db.ts';

export const reserveVisit = (
  db: DatabaseSync,
  input: { visitId: string; petName: string; visitDate: string },
): void => {
  db.prepare(`INSERT INTO visits (id, pet_name, status, visit_date) VALUES (?, ?, 'reserved', ?)`).run(
    input.visitId,
    input.petName,
    input.visitDate,
  );
};

export const completeVisit = (db: DatabaseSync, input: { visitId: string }): void => {
  db.prepare(`UPDATE visits SET status = 'completed' WHERE id = ?`).run(input.visitId);
};

export const cancelVisit = (db: DatabaseSync, input: { visitId: string; reason: string; operatedBy: string }): void => {
  withTransaction(db, () => {
    const visit = db.prepare(`SELECT status, visit_date FROM visits WHERE id = ?`).get(input.visitId);
    if (visit === undefined) {
      throw new Error('来院が見つかりません');
    }
    if (visit.status === 'completed') {
      throw new Error('診察が終わった来院はキャンセルできません');
    }
    db.prepare(`UPDATE visits SET status = 'cancelled' WHERE id = ?`).run(input.visitId);
    const cancelled = db.prepare(`SELECT * FROM visits WHERE id = ?`).get(input.visitId);
    db.prepare(`
      INSERT INTO domain_events (event_at, event_name, payload, aggregate_id, aggregate_name, aggregate_props)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      new Date().toISOString(),
      'VisitCancelled',
      JSON.stringify({ reason: input.reason, operatedBy: input.operatedBy }),
      input.visitId,
      'Visit',
      JSON.stringify(cancelled),
    );
    db.prepare(`
      INSERT INTO daily_cancellation_counts (visit_date, cancelled_count) VALUES (?, 1)
      ON CONFLICT (visit_date) DO UPDATE SET cancelled_count = cancelled_count + 1
    `).run(visit.visit_date);
  });
};

export const explainCancellationCount = (
  db: DatabaseSync,
  visitDate: string,
): { eventId: number; eventAt: string; visitId: string; reason: string; operatedBy: string }[] =>
  db.prepare(`
    SELECT
      event_id AS eventId,
      event_at AS eventAt,
      aggregate_id AS visitId,
      payload ->> '$.reason' AS reason,
      payload ->> '$.operatedBy' AS operatedBy
    FROM domain_events
    WHERE event_name = 'VisitCancelled' AND aggregate_props ->> '$.visit_date' = ?
    ORDER BY event_id
  `).all(visitDate) as { eventId: number; eventAt: string; visitId: string; reason: string; operatedBy: string }[];

export const verifyCancellationCount = (
  db: DatabaseSync,
  visitDate: string,
): { recordedCount: number; recalculatedCount: number; difference: number } => {
  const recorded = db.prepare(`SELECT cancelled_count FROM daily_cancellation_counts WHERE visit_date = ?`).get(
    visitDate,
  );
  const recordedCount = Number(recorded?.cancelled_count ?? 0);
  const recalculatedCount = explainCancellationCount(db, visitDate).length;
  return { recordedCount, recalculatedCount, difference: recordedCount - recalculatedCount };
};
