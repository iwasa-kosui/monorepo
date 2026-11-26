import { createDatabase } from './db.ts';
import { cancelInput } from './play-input.ts';
import { cancelVisit, reserveVisit } from './visits.ts';

const db = createDatabase();
reserveVisit(db, { visitId: 'visit-pochi', petName: 'ポチ' });
reserveVisit(db, { visitId: 'visit-tama', petName: 'タマ' });

const tables = db
  .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`)
  .all()
  .map((table) => String(table.name));

const snapshot = () =>
  Object.fromEntries(tables.map((name) => [name, db.prepare(`SELECT * FROM ${name} ORDER BY rowid`).all()]));

const columns = Object.fromEntries(
  tables.map((name) => [name, db.prepare(`PRAGMA table_info(${name})`).all().map((column) => String(column.name))]),
);

const before = snapshot();
let error: string | null = null;

try {
  cancelVisit(db, cancelInput);
} catch (caught) {
  error = caught instanceof Error ? caught.message : String(caught);
}

console.log(JSON.stringify({ before, after: snapshot(), columns, error }));
