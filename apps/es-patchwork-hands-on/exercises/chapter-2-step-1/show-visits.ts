import { createDatabase } from './db.ts';
import { cancelVisit, reserveVisit } from './visits.ts';

const db = createDatabase();
db.exec(`INSERT INTO visits (id, pet_name, status) VALUES ('visit-tama', 'タマ', 'cancelled')`);

const cancelInput = { visitId: 'visit-pochi', reason: '飼い主の都合', operatedBy: '受付スタッフ' };
reserveVisit(db, { visitId: cancelInput.visitId, petName: 'ポチ' });
cancelVisit(db, cancelInput);

console.table(db.prepare(`SELECT * FROM visits ORDER BY id`).all());
