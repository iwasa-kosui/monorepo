import type { DatabaseSync } from 'node:sqlite';
import { withTransaction } from './db.ts';
import { createSqliteVisitCancelledStore } from './src/adaptor/sqlite/visit/visitCancelledStore.ts';
import { createSqliteVisitResolver } from './src/adaptor/sqlite/visit/visitResolver.ts';
import { CancelVisitUseCase } from './src/useCase/cancelVisit.ts';

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
  CancelVisitUseCase.create({
    visitResolver: createSqliteVisitResolver(db),
    visitCancelledStore: createSqliteVisitCancelledStore(db),
    transaction: (run) => withTransaction(db, run),
    now: () => new Date(),
  }).run(input);
};
