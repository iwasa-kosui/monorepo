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
  receivedEventId?: number,
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
    payload: { reason: input.reason, operatedBy: input.operatedBy, receivedEventId },
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
    const visit = db.prepare(`SELECT * FROM visits WHERE id = ?`).get(message.visitId);
    if (visit === undefined) {
      throw new Error('来院が見つかりません');
    }
    const receivedEventId = recordEvent(db, {
      eventName: 'ExternalCancellationReceived',
      payload: { operatedAt: message.operatedAt, reason: message.reason },
      visitId: message.visitId,
      row: visit,
    });
    if (visit.status === 'completed') {
      recordEvent(db, {
        eventName: 'ExternalCancellationRejected',
        payload: { receivedEventId, reason: completedVisitError },
        visitId: message.visitId,
        row: visit,
      });
      return;
    }
    cancelInTransaction(
      db,
      { visitId: message.visitId, reason: message.reason, operatedBy: '予約サイト' },
      receivedEventId,
    );
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
  reason: string | null;
}[] =>
  db.prepare(`
    SELECT
      received.target_id AS visitId,
      received.target_state ->> '$.pet_name' AS petName,
      received.payload ->> '$.operatedAt' AS operatedAt,
      received.event_at AS receivedAt,
      received.payload ->> '$.reason' AS cancelReason,
      CASE outcome.event_name
        WHEN 'VisitCancelled' THEN 'applied'
        ELSE 'rejected'
      END AS result,
      CASE outcome.event_name
        WHEN 'ExternalCancellationRejected' THEN outcome.payload ->> '$.reason'
      END AS reason
    FROM business_events AS received
    JOIN business_events AS outcome
      ON outcome.payload ->> '$.receivedEventId' = received.event_id
      AND outcome.event_name IN ('VisitCancelled', 'ExternalCancellationRejected')
    WHERE received.event_name = 'ExternalCancellationReceived'
    ORDER BY received.event_id
  `).all() as {
    visitId: string;
    petName: string;
    operatedAt: string;
    receivedAt: string;
    cancelReason: string;
    result: 'applied' | 'rejected';
    reason: string | null;
  }[];

export const findUnappliedImports = (
  db: DatabaseSync,
): {
  visitId: string;
  petName: string;
  operatedAt: string;
  receivedAt: string;
  cancelReason: string;
  reason: string;
}[] =>
  db.prepare(`
    SELECT
      received.target_id AS visitId,
      received.target_state ->> '$.pet_name' AS petName,
      received.payload ->> '$.operatedAt' AS operatedAt,
      received.event_at AS receivedAt,
      received.payload ->> '$.reason' AS cancelReason,
      rejected.payload ->> '$.reason' AS reason
    FROM business_events AS received
    JOIN business_events AS rejected
      ON rejected.event_name = 'ExternalCancellationRejected'
      AND rejected.payload ->> '$.receivedEventId' = received.event_id
    WHERE received.event_name = 'ExternalCancellationReceived'
    ORDER BY received.event_id
  `).all() as {
    visitId: string;
    petName: string;
    operatedAt: string;
    receivedAt: string;
    cancelReason: string;
    reason: string;
  }[];
