import { createDatabase } from './db.ts';
import { cancelVisit, reserveVisit } from './visits.ts';

const db = createDatabase();
reserveVisit(db, { visitId: 'visit-pochi', petName: 'ポチ' });

const tables = db
  .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`)
  .all()
  .map((table) => String(table.name));

const snapshot = () =>
  Object.fromEntries(tables.map((name) => [name, db.prepare(`SELECT * FROM ${name} ORDER BY rowid`).all()]));

const before = snapshot();
let error: string | null = null;

try {
  cancelVisit(db, { visitId: 'visit-pochi', reason: '飼い主の都合', operatedBy: '受付スタッフ' });
} catch (caught) {
  error = caught instanceof Error ? caught.message : String(caught);
}

console.log(JSON.stringify({ before, after: snapshot(), error }));
