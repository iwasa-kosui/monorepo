import type { DatabaseSync } from 'node:sqlite';
import { withTransaction } from './db.ts';

export type ReminderCancellationMessage = { visitId: string; petName: string };
export type SendReminderCancellation = (message: ReminderCancellationMessage) => Promise<void>;

export const reserveVisit = (db: DatabaseSync, input: { visitId: string; petName: string }): void => {
  db.prepare(`INSERT INTO visits (id, pet_name, status) VALUES (?, ?, 'reserved')`).run(input.visitId, input.petName);
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

export const cancelVisit = async (
  db: DatabaseSync,
  sendReminderCancellation: SendReminderCancellation,
  input: { visitId: string; reason: string; operatedBy: string },
): Promise<void> => {
  const message = withTransaction(db, (): ReminderCancellationMessage => {
    const visit = db.prepare(`SELECT status, pet_name FROM visits WHERE id = ?`).get(input.visitId);
    if (visit === undefined) {
      throw new Error('来院が見つかりません');
    }
    if (visit.status === 'completed') {
      throw new Error('診察が終わった来院はキャンセルできません');
    }
    db.prepare(`UPDATE visits SET status = 'cancelled' WHERE id = ?`).run(input.visitId);
    const cancelled = db.prepare(`SELECT * FROM visits WHERE id = ?`).get(input.visitId);
    recordEvent(db, {
      eventName: 'VisitCancelled',
      payload: { reason: input.reason, operatedBy: input.operatedBy },
      visitId: input.visitId,
      row: cancelled,
    });
    return { visitId: input.visitId, petName: String(visit.pet_name) };
  });
  await sendReminderCancellation(message);
};

export const findSendRecords = (
  db: DatabaseSync,
  visitId: string,
): {
  requestedAt: string;
  finishedAt: string | null;
  message: ReminderCancellationMessage;
  reason: string;
  operatedBy: string;
  result: 'sent' | 'failed' | 'unconfirmed';
  error: string | null;
}[] => {
  throw new Error('第4章で実装します');
};

export const findUnconfirmedSends = (
  db: DatabaseSync,
): { visitId: string; requestedAt: string; message: ReminderCancellationMessage }[] => {
  throw new Error('第4章で実装します');
};
