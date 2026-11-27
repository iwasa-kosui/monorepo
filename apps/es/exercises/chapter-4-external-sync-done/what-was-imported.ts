import { createDatabase } from './db.ts';
import { completeVisit, findImportRecords, importExternalCancellation, reserveVisit } from './visits.ts';

const db = createDatabase();
db.prepare(`INSERT INTO visits (id, pet_name, status) VALUES ('visit-3', 'タマ', 'cancelled')`).run();

reserveVisit(db, { visitId: 'visit-1', petName: 'ポチ' });
reserveVisit(db, { visitId: 'visit-2', petName: 'コタロウ' });

importExternalCancellation(db, { visitId: 'visit-1', operatedAt: '2026-11-20T09:00:00.000Z', reason: '飼い主の都合' });

completeVisit(db, { visitId: 'visit-2' });
importExternalCancellation(db, {
  visitId: 'visit-2',
  operatedAt: '2026-11-20T09:30:00.000Z',
  reason: '来院前に回復したため',
});

console.table(findImportRecords(db));
