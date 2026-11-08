import { createDatabase } from './db.ts';
import { cancelVisit, reserveVisit } from './visits.ts';

const db = createDatabase();
reserveVisit(db, { visitId: 'visit-pochi', petName: 'ポチ' });

const snapshot = () => ({
  visits: db.prepare(`SELECT * FROM visits ORDER BY id`).all(),
  business_events: db.prepare(`SELECT * FROM business_events ORDER BY event_id`).all(),
});

const before = snapshot();
let error: string | null = null;

try {
  cancelVisit(db, { visitId: 'visit-pochi', reason: '飼い主の都合', operatedBy: '受付スタッフ' });
} catch (caught) {
  error = caught instanceof Error ? caught.message : String(caught);
}

console.log(JSON.stringify({ before, after: snapshot(), error }));
