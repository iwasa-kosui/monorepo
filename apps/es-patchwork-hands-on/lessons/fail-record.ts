import { createDatabase } from './db.ts';
import { cancelVisit, reserveVisit } from './visits.ts';

const db = createDatabase();
reserveVisit(db, { visitId: 'visit-pochi', petName: 'ポチ' });

const statusOf = (): unknown => db.prepare(`SELECT status FROM visits WHERE id = ?`).get('visit-pochi')?.status;

console.log(`実行の前: status = ${statusOf()}`);

db.exec(`
  CREATE TRIGGER reject_event BEFORE INSERT ON business_events
  BEGIN
    SELECT RAISE(ABORT, '記録に失敗しました');
  END;
`);

try {
  cancelVisit(db, { visitId: 'visit-pochi', reason: '飼い主の都合', operatedBy: '受付スタッフ' });
  console.log('cancelVisit は成功しました');
} catch (error) {
  console.log(`cancelVisit は失敗しました: ${error instanceof Error ? error.message : error}`);
}

console.log(`実行の後: status = ${statusOf()}`);
