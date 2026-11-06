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
    domain_events.event_at,
    domain_events.event_name,
    domain_events.payload ->> '$.operatedBy' AS operated_by,
    domain_events.payload ->> '$.reason' AS reason
  FROM visits
  LEFT JOIN domain_events
    ON domain_events.aggregate_name = 'Visit' AND domain_events.aggregate_id = visits.id
  ORDER BY visits.id
`).all();
console.table(rows);
