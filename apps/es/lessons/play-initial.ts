import { createDatabase } from './db.ts';
import { reserveVisit } from './visits.ts';

const db = createDatabase();
reserveVisit(db, { visitId: 'visit-pochi', petName: 'ポチ' });

const snapshot = () => ({
  visits: db.prepare(`SELECT * FROM visits ORDER BY id`).all(),
  business_events: db.prepare(`SELECT * FROM business_events ORDER BY event_id`).all(),
});

console.log(JSON.stringify({ before: snapshot(), after: snapshot(), error: null }));
