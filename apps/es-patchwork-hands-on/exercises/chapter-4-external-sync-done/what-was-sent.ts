import { createDatabase } from './db.ts';
import { cancelVisit, findSendRecords, reserveVisit } from './visits.ts';

const db = createDatabase();
reserveVisit(db, { visitId: 'visit-1', petName: 'ポチ' });
reserveVisit(db, { visitId: 'visit-2', petName: 'タマ' });
reserveVisit(db, { visitId: 'visit-3', petName: 'コタロウ' });

await cancelVisit(db, async () => {}, { visitId: 'visit-1', reason: '飼い主の都合', operatedBy: '受付スタッフ' });
await cancelVisit(db, async () => {
  throw new Error('送信先に接続できません');
}, { visitId: 'visit-2', reason: '来院前に回復したため', operatedBy: '院長' }).catch(() => undefined);

db.exec(`
  CREATE TRIGGER reject_sent BEFORE INSERT ON domain_events
  WHEN NEW.event_name = 'ReminderCancellationSent'
  BEGIN
    SELECT RAISE(ABORT, '送信結果の記録に失敗しました');
  END;
`);
try {
  await cancelVisit(db, async () => {}, { visitId: 'visit-3', reason: '飼い主の都合', operatedBy: '受付スタッフ' });
} catch {}

console.table(['visit-1', 'visit-2', 'visit-3'].flatMap((visitId) => findSendRecords(db, visitId)));
