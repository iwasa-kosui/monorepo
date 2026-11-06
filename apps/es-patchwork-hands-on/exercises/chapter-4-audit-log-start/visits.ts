import type { DatabaseSync } from 'node:sqlite';
import { withTransaction } from './db.ts';

export const reserveVisit = (db: DatabaseSync, input: { visitId: string; petName: string }): void => {
  db.prepare(`INSERT INTO visits (id, pet_name, status) VALUES (?, ?, 'reserved')`).run(input.visitId, input.petName);
};

export const recordAuditLog = (
  db: DatabaseSync,
  input: { rowId: string; oldValue: string | null; newValue: string | null; operatedBy: string },
): number => {
  const result = db.prepare(`
    INSERT INTO audit_logs (table_name, row_id, column_name, old_value, new_value, operated_by, operated_at)
    VALUES ('visits', ?, 'status', ?, ?, ?, ?)
  `).run(input.rowId, input.oldValue, input.newValue, input.operatedBy, new Date().toISOString());
  return Number(result.lastInsertRowid);
};

export const completeVisit = (db: DatabaseSync, input: { visitId: string; operatedBy: string }): void => {
  withTransaction(db, () => {
    const visit = db.prepare(`SELECT status FROM visits WHERE id = ?`).get(input.visitId);
    if (visit === undefined) {
      throw new Error('来院が見つかりません');
    }
    db.prepare(`UPDATE visits SET status = 'completed' WHERE id = ?`).run(input.visitId);
    recordAuditLog(db, {
      rowId: input.visitId,
      oldValue: String(visit.status),
      newValue: 'completed',
      operatedBy: input.operatedBy,
    });
  });
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
    recordAuditLog(db, {
      rowId: input.visitId,
      oldValue: String(visit.status),
      newValue: 'cancelled',
      operatedBy: input.operatedBy,
    });
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
  });
};

export const explainChange = (
  db: DatabaseSync,
  auditLogId: number,
): {
  oldValue: string | null;
  newValue: string | null;
  operatedBy: string;
  operatedAt: string;
  eventName: string | null;
  reason: string | null;
} | undefined => {
  throw new Error('第4章で実装します');
};

export const findChangesWithoutReason = (
  db: DatabaseSync,
): {
  auditLogId: number;
  rowId: string;
  oldValue: string | null;
  newValue: string | null;
  operatedBy: string;
  operatedAt: string;
}[] => {
  throw new Error('第4章で実装します');
};
