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
  const { message, cancelled, requestedEventId } = withTransaction(db, () => {
    const visit = db.prepare(`SELECT status, pet_name FROM visits WHERE id = ?`).get(input.visitId);
    if (visit === undefined) {
      throw new Error('来院が見つかりません');
    }
    if (visit.status === 'completed') {
      throw new Error('診察が終わった来院はキャンセルできません');
    }
    db.prepare(`UPDATE visits SET status = 'cancelled' WHERE id = ?`).run(input.visitId);
    const cancelled = db.prepare(`SELECT * FROM visits WHERE id = ?`).get(input.visitId);
    const cancelledEventId = recordEvent(db, {
      eventName: 'VisitCancelled',
      payload: { reason: input.reason, operatedBy: input.operatedBy },
      visitId: input.visitId,
      row: cancelled,
    });
    const message: ReminderCancellationMessage = { visitId: input.visitId, petName: String(visit.pet_name) };
    const requestedEventId = recordEvent(db, {
      eventName: 'ReminderCancellationRequested',
      payload: { causationEventId: cancelledEventId, message },
      visitId: input.visitId,
      row: cancelled,
    });
    return { message, cancelled, requestedEventId };
  });
  try {
    await sendReminderCancellation(message);
  } catch (error) {
    recordEvent(db, {
      eventName: 'ReminderCancellationFailed',
      payload: { causationEventId: requestedEventId, error: error instanceof Error ? error.message : String(error) },
      visitId: input.visitId,
      row: cancelled,
    });
    throw error;
  }
  recordEvent(db, {
    eventName: 'ReminderCancellationSent',
    payload: { causationEventId: requestedEventId },
    visitId: input.visitId,
    row: cancelled,
  });
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
}[] =>
  db.prepare(`
    SELECT
      requested.event_at AS requestedAt,
      finished.event_at AS finishedAt,
      requested.payload ->> '$.message' AS message,
      cancelled.payload ->> '$.reason' AS reason,
      cancelled.payload ->> '$.operatedBy' AS operatedBy,
      CASE finished.event_name
        WHEN 'ReminderCancellationSent' THEN 'sent'
        WHEN 'ReminderCancellationFailed' THEN 'failed'
        ELSE 'unconfirmed'
      END AS result,
      finished.payload ->> '$.error' AS error
    FROM business_events AS requested
    JOIN business_events AS cancelled
      ON cancelled.event_id = requested.payload ->> '$.causationEventId'
    LEFT JOIN business_events AS finished
      ON finished.payload ->> '$.causationEventId' = requested.event_id
      AND finished.event_name IN ('ReminderCancellationSent', 'ReminderCancellationFailed')
    WHERE requested.event_name = 'ReminderCancellationRequested' AND requested.target_id = ?
    ORDER BY requested.event_id
  `).all(visitId).map((row) => ({ ...row, message: JSON.parse(String(row.message)) })) as {
    requestedAt: string;
    finishedAt: string | null;
    message: ReminderCancellationMessage;
    reason: string;
    operatedBy: string;
    result: 'sent' | 'failed' | 'unconfirmed';
    error: string | null;
  }[];

export const findUnconfirmedSends = (
  db: DatabaseSync,
): { visitId: string; requestedAt: string; message: ReminderCancellationMessage }[] =>
  db.prepare(`
    SELECT
      requested.target_id AS visitId,
      requested.event_at AS requestedAt,
      requested.payload ->> '$.message' AS message
    FROM business_events AS requested
    WHERE requested.event_name = 'ReminderCancellationRequested'
      AND NOT EXISTS (
        SELECT 1 FROM business_events AS finished
        WHERE finished.event_name IN ('ReminderCancellationSent', 'ReminderCancellationFailed')
          AND finished.payload ->> '$.causationEventId' = requested.event_id
      )
    ORDER BY requested.event_id
  `).all().map((row) => ({ ...row, message: JSON.parse(String(row.message)) })) as {
    visitId: string;
    requestedAt: string;
    message: ReminderCancellationMessage;
  }[];
