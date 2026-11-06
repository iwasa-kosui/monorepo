import { createDatabase } from './db.ts';
import { cancelVisit, reserveVisit } from './visits.ts';

const db = createDatabase();
db.exec(`INSERT INTO visits (id, pet_name, status) VALUES ('visit-before-events', 'タマ', 'cancelled')`);

const cancelInput = { visitId: 'visit-after-events', reason: '飼い主の都合', operatedBy: '受付スタッフ' };
reserveVisit(db, { visitId: cancelInput.visitId, petName: 'ポチ' });
cancelVisit(db, cancelInput);

const rows = db.prepare(`
  SELECT
    visits.id,
    visits.status,
    business_events.event_at,
    business_events.event_name,
    business_events.payload ->> '$.operatedBy' AS operated_by,
    business_events.payload ->> '$.reason' AS reason
  FROM visits
  LEFT JOIN business_events
    ON business_events.target_type = 'Visit' AND business_events.target_id = visits.id
  ORDER BY visits.id
`).all();
console.table(rows);
