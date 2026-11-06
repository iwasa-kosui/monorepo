import { createDatabase } from './db.ts';
import { cancelVisit, findSendRecords, reserveVisit } from './visits.ts';

const db = createDatabase();
reserveVisit(db, { visitId: 'visit-1', petName: 'ポチ' });
reserveVisit(db, { visitId: 'visit-2', petName: 'タマ' });

await cancelVisit(db, async () => {}, { visitId: 'visit-1', reason: '飼い主の都合', operatedBy: '受付スタッフ' });
await cancelVisit(db, async () => {
  throw new Error('送信先に接続できません');
}, { visitId: 'visit-2', reason: '来院前に回復したため', operatedBy: '院長' }).catch(() => undefined);

console.table([...findSendRecords(db, 'visit-1'), ...findSendRecords(db, 'visit-2')]);
