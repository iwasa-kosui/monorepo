import type { DatabaseSync } from 'node:sqlite';
import { withTransaction } from './db.ts';

export type ExternalCancellationMessage = { visitId: string; operatedAt: string; reason: string };

const completedVisitError = '診察が終わった来院はキャンセルできません';

export const reserveVisit = (db: DatabaseSync, input: { visitId: string; petName: string }): void => {
  db.prepare(`INSERT INTO visits (id, pet_name, status) VALUES (?, ?, 'reserved')`).run(input.visitId, input.petName);
};

export const checkInVisit = (db: DatabaseSync, input: { visitId: string }): void => {
  db.prepare(`UPDATE visits SET status = 'checked_in' WHERE id = ?`).run(input.visitId);
};

export const completeVisit = (db: DatabaseSync, input: { visitId: string }): void => {
  db.prepare(`UPDATE visits SET status = 'completed' WHERE id = ?`).run(input.visitId);
};

const recordEvent = (
  db: DatabaseSync,
  input: { eventName: string; payload: unknown; visitId: string; row: unknown },
): number => {
  const result = db.prepare(`
    INSERT INTO business_events (event_at, event_name, payload, target_id, target_type, target_state)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    new Date().toISOString(),
    input.eventName,
    JSON.stringify(input.payload),
    input.visitId,
    'Visit',
    JSON.stringify(input.row),
  );
  return Number(result.lastInsertRowid);
};

const cancelInTransaction = (
  db: DatabaseSync,
  input: { visitId: string; reason: string; operatedBy: string },
): void => {
  const visit = db.prepare(`SELECT status FROM visits WHERE id = ?`).get(input.visitId);
  if (visit === undefined) {
    throw new Error('来院が見つかりません');
  }
  if (visit.status === 'completed') {
    throw new Error(completedVisitError);
  }
  db.prepare(`UPDATE visits SET status = 'cancelled' WHERE id = ?`).run(input.visitId);
  const cancelled = db.prepare(`SELECT * FROM visits WHERE id = ?`).get(input.visitId);
  recordEvent(db, {
    eventName: 'VisitCancelled',
    payload: { reason: input.reason, operatedBy: input.operatedBy },
    visitId: input.visitId,
    row: cancelled,
  });
};

export const cancelVisit = (db: DatabaseSync, input: { visitId: string; reason: string; operatedBy: string }): void => {
  withTransaction(db, () => {
    cancelInTransaction(db, input);
  });
};

export const importExternalCancellation = (db: DatabaseSync, message: ExternalCancellationMessage): void => {
  withTransaction(db, () => {
    const visit = db.prepare(`SELECT status FROM visits WHERE id = ?`).get(message.visitId);
    if (visit?.status === 'completed') {
      return;
    }
    cancelInTransaction(db, { visitId: message.visitId, reason: message.reason, operatedBy: '予約サイト' });
  });
};

export const findImportRecords = (
  db: DatabaseSync,
): {
  visitId: string;
  petName: string;
  operatedAt: string;
  receivedAt: string;
  cancelReason: string;
  result: 'applied' | 'rejected';
  rejectedReason: string | null;
}[] => {
  throw new Error('第4章で実装します');
};

export const findUnappliedImports = (
  db: DatabaseSync,
): {
  visitId: string;
  petName: string;
  operatedAt: string;
  receivedAt: string;
  cancelReason: string;
  rejectedReason: string;
}[] => {
  throw new Error('第4章で実装します');
};
