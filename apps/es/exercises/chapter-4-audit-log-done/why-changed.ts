import { createDatabase } from './db.ts';
import { cancelVisit, completeVisit, explainChange, findChangesWithoutReason, reserveVisit } from './visits.ts';

const db = createDatabase();
db.prepare(`INSERT INTO visits (id, pet_name, status) VALUES ('visit-4', 'ポチ', 'cancelled')`).run();
db.prepare(`
  INSERT INTO audit_logs (table_name, row_id, column_name, old_value, new_value, operated_by, operated_at)
  VALUES ('visits', 'visit-4', 'status', 'reserved', 'cancelled', '受付スタッフ', '2026-10-15T01:20:00.000Z')
`).run();

reserveVisit(db, { visitId: 'visit-1', petName: 'ポチ' });
reserveVisit(db, { visitId: 'visit-2', petName: 'タマ' });
reserveVisit(db, { visitId: 'visit-3', petName: 'コタロウ' });
cancelVisit(db, { visitId: 'visit-1', reason: '飼い主の都合', operatedBy: '受付スタッフ' });
cancelVisit(db, { visitId: 'visit-2', reason: '来院前に回復したため', operatedBy: '受付スタッフ' });
completeVisit(db, { visitId: 'visit-3', operatedBy: '獣医師' });

const auditLogIds = db.prepare(`SELECT id FROM audit_logs ORDER BY id`).all().map((row) => Number(row.id));
console.table(auditLogIds.map((auditLogId) => ({ auditLogId, ...explainChange(db, auditLogId) })));
console.table(findChangesWithoutReason(db));
