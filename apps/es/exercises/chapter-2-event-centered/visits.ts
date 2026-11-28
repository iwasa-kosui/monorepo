import type { DatabaseSync } from 'node:sqlite';
import { withTransaction } from './db.ts';
import { visitCancelledStore, visitResolver } from './visit-store.ts';
import { Visit } from './visit.ts';

export const reserveVisit = (db: DatabaseSync, input: { visitId: string; petName: string }): void => {
  db.prepare(`INSERT INTO visits (id, pet_name, status) VALUES (?, ?, 'reserved')`).run(input.visitId, input.petName);
};

export const checkInVisit = (db: DatabaseSync, input: { visitId: string }): void => {
  db.prepare(`UPDATE visits SET status = 'checked_in' WHERE id = ?`).run(input.visitId);
};

export const completeVisit = (db: DatabaseSync, input: { visitId: string }): void => {
  db.prepare(`UPDATE visits SET status = 'completed' WHERE id = ?`).run(input.visitId);
};

export const cancelVisit = (db: DatabaseSync, input: { visitId: string; reason: string; operatedBy: string }): void => {
  withTransaction(db, () => {
    const visit = visitResolver(db).resolve(input.visitId);
    const event = Visit.cancel(visit, input, new Date());
    visitCancelledStore(db).store(event);
  });
};
