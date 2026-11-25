import { createDatabase } from './db.ts';
import { cancelVisit, reserveVisit } from './visits.ts';

const db = createDatabase();
db.exec(`INSERT INTO visits (id, pet_name, status) VALUES ('visit-tama', 'タマ', 'cancelled')`);

const cancelInput = { visitId: 'visit-pochi', reason: '飼い主の都合', operatedBy: '受付スタッフ' };
reserveVisit(db, { visitId: cancelInput.visitId, petName: 'ポチ' });
cancelVisit(db, cancelInput);

const rows = db.prepare(`
  SELECT
    visits.id,
    visits.status,
    visit_cancellations.cancelled_at,
    visit_cancellations.operated_by,
    visit_cancellations.reason
  FROM visits
  LEFT JOIN visit_cancellations ON visit_cancellations.visit_id = visits.id
  ORDER BY visits.id
`).all();
console.table(rows);
